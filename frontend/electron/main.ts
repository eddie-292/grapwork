import { app, BrowserWindow, ipcMain, shell, dialog, Menu, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'

const __dirname = path.dirname(__filename)

// ============================================================================
// 异步命令执行工具（避免阻塞主进程事件循环）
// ============================================================================

interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  killed?: boolean
  signal?: string | null
}

/**
 * 异步执行 shell 命令，不阻塞 Electron 主进程事件循环
 * @param command 要执行的命令
 * @param options 执行选项
 */
function execAsync(
  command: string,
  options: {
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeout?: number
    maxBuffer?: number
  } = {}
): Promise<ExecResult> {
  const { cwd, env, timeout = 30000, maxBuffer = 10 * 1024 * 1024 } = options

  return new Promise((resolve) => {
    const child = spawn(command, [], {
      shell: true,
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let killed = false
    let bufferOverflow = false

    const timeoutId = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeout)

    child.stdout.on('data', (data: Buffer) => {
      if (stdout.length < maxBuffer) {
        stdout += data.toString()
        if (stdout.length > maxBuffer) {
          bufferOverflow = true
          stdout = stdout.slice(0, maxBuffer) + '\n... [输出被截断，超出缓冲区限制]'
        }
      }
    })

    child.stderr.on('data', (data: Buffer) => {
      if (stderr.length < maxBuffer) {
        stderr += data.toString()
        if (stderr.length > maxBuffer) {
          bufferOverflow = true
          stderr = stderr.slice(0, maxBuffer) + '\n... [输出被截断，超出缓冲区限制]'
        }
      }
    })

    child.on('error', (err: Error) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: 1,
        killed: false
      })
    })

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId)
      resolve({
        stdout,
        stderr,
        exitCode: code,
        killed,
        signal
      })
    })
  })
}

// ============================================================================
// MCP Client Implementation
// ============================================================================

// 常见的 PATH 路径（用于 GUI 启动时补充环境变量）
const COMMON_PATHS: Record<string, string[]> = {
  darwin: [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/Library/Apple/usr/bin',
    '/Library/Frameworks/Python.framework/Versions/Current/bin',
    // 用户级 Python 安装路径
    path.join(process.env.HOME || '', '.local/bin'),
    path.join(process.env.HOME || '', 'Library/Python/*/bin'),
  ],
  linux: [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/snap/bin',
    path.join(process.env.HOME || '', '.local/bin'),
    path.join(process.env.HOME || '', '.cargo/bin'),
  ],
  win32: [
    // Windows 通常通过注册表配置 PATH，这里添加一些常见路径
  ]
}

// Python 命令的别名优先级（用于自动解析）
const PYTHON_ALIASES = ['python3', 'python', 'uvx']

// MCP 包要求的最低 Python 版本
const MCP_MIN_PYTHON_VERSION = [3, 10]

// 获取 Python 命令的版本号
function getPythonVersion(pythonCmd: string): { major: number; minor: number } | null {
  try {
    const enhancedEnv = getEnhancedEnv()
    const output = execSync(`${pythonCmd} --version`, {
      encoding: 'utf-8',
      env: enhancedEnv,
      timeout: 5000
    }).trim()

    // 解析版本号，格式如 "Python 3.10.0" 或 "Python 3.9.6"
    const match = output.match(/Python\s+(\d+)\.(\d+)/)
    if (match) {
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10)
      }
    }
  } catch (error) {
    // 命令执行失败，忽略
  }
  return null
}

// 比较版本号
function isVersionAtLeast(version: { major: number; minor: number }, minVersion: number[]): boolean {
  if (version.major > minVersion[0]) return true
  if (version.major === minVersion[0] && version.minor >= minVersion[1]) return true
  return false
}

// 获取增强后的 PATH 环境变量
function getEnhancedPath(): string {
  const originalPath = process.env.PATH || ''
  const platform = process.platform
  const additionalPaths = COMMON_PATHS[platform] || []

  // 过滤出存在的路径
  const existingAdditionalPaths = additionalPaths.filter(p => {
    // 处理通配符路径
    if (p.includes('*')) {
      try {
        const baseDir = path.dirname(p.replace(/\/\*.*$/, ''))
        if (fs.existsSync(baseDir)) {
          return true
        }
      } catch {
        return false
      }
    }
    return fs.existsSync(p)
  })

  // 合并 PATH，保持原有 PATH 优先
  const allPaths = originalPath.split(path.delimiter)
  for (const p of existingAdditionalPaths) {
    if (!allPaths.includes(p)) {
      allPaths.push(p)
    }
  }

  return allPaths.join(path.delimiter)
}

// 获取增强后的环境变量
function getEnhancedEnv(): Record<string, string> {
  return {
    ...process.env,
    PATH: getEnhancedPath()
  }
}

// 尝试解析命令的实际路径
function resolveCommand(command: string): string | null {
  // 如果是绝对路径，直接返回
  if (path.isAbsolute(command)) {
    return fs.existsSync(command) ? command : null
  }

  const enhancedEnv = getEnhancedEnv()
  const pathDirs = (enhancedEnv.PATH || '').split(path.delimiter)

  // 在所有 PATH 目录中搜索
  for (const dir of pathDirs) {
    // 跳过通配符路径（无法直接检查）
    if (dir.includes('*')) continue

    const fullPath = path.join(dir, command)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }

    // Windows 上尝试添加扩展名
    if (process.platform === 'win32') {
      for (const ext of ['.exe', '.cmd', '.bat']) {
        const fullPathWithExt = fullPath + ext
        if (fs.existsSync(fullPathWithExt)) {
          return fullPathWithExt
        }
      }
    }
  }

  return null
}

// 检查命令是否存在（使用增强的 PATH）
function commandExists(command: string): boolean {
  return resolveCommand(command) !== null
}

// 查找可用的 Python 命令（优先返回满足 MCP 最低版本要求的命令）
function findPythonCommand(options: { requireMinVersion?: boolean } = {}): string | null {
  const { requireMinVersion = false } = options

  // 收集所有可用的 Python 命令及其版本
  const availablePythons: Array<{ cmd: string; version: { major: number; minor: number } | null }> = []

  for (const alias of PYTHON_ALIASES) {
    if (alias === 'uvx') continue // uvx 不是 Python 解释器

    const resolved = resolveCommand(alias)
    if (resolved) {
      const version = getPythonVersion(alias)
      availablePythons.push({ cmd: alias, version })
    }
  }

  if (availablePythons.length === 0) {
    return null
  }

  // 如果需要满足最低版本要求，优先返回满足条件的命令
  if (requireMinVersion) {
    // 首先查找满足版本要求的 Python
    const validPython = availablePythons.find(p => p.version && isVersionAtLeast(p.version, MCP_MIN_PYTHON_VERSION))
    if (validPython) {
      return validPython.cmd
    }

    // 如果没有满足版本要求的，仍然返回第一个可用的（让后续安装时报错）
    console.log(`[MCP] Warning: No Python ${MCP_MIN_PYTHON_VERSION[0]}.${MCP_MIN_PYTHON_VERSION[1]}+ found, using ${availablePythons[0]?.cmd}`)
  }

  // 返回第一个可用的 Python 命令
  return availablePythons[0]?.cmd || null
}

// 旧版本的 commandExists（保留用于向后兼容）
function commandExistsLegacy(command: string): boolean {
  try {
    // 检查是否是绝对路径
    if (path.isAbsolute(command)) {
      return fs.existsSync(command)
    }

    // 使用增强的 PATH 检查
    const resolved = resolveCommand(command)
    if (resolved) {
      return true
    }

    // Windows 上尝试 where 命令
    if (process.platform === 'win32') {
      try {
        execSync(`where "${command}"`, {
          stdio: 'ignore',
          env: getEnhancedEnv()
        })
        return true
      } catch {
        return false
      }
    }

    return false
  } catch {
    return false
  }
}

// MCP 相关类型定义
interface MCPServerConfig {
  id: string
  name: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  simpleCommand?: boolean // 是否为简单命令（非 MCP 服务器）
}

interface MCPMessage {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  params?: any
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

// 简单命令白名单 - 只允许执行安全的命令
const SIMPLE_COMMAND_WHITELIST = [
  'date',           // 显示/设置系统时间
  'ls', 'la', 'll', 'dir',  // 列出目录内容
  'pwd',            // 打印工作目录
  'echo',           // 输出文本
  'cat',            // 显示文件内容
  'head', 'tail',   // 显示文件头部/尾部
  'wc',             // 统计行数、字数等
  'grep',           // 文本搜索
  'whoami',         // 显示当前用户
  'hostname',       // 显示主机名
  'uname',          // 显示系统信息
  'cal',            // 显示日历
  'uptime',         // 显示系统运行时间
  'df', 'du',       // 磁盘使用情况
  'ps',             // 进程列表
  'env',            // 环境变量
]

// 简单命令执行器 - 用于执行一次性命令（非 MCP 服务器）
class SimpleCommandExecutor {
  private config: MCPServerConfig

  constructor(config: MCPServerConfig) {
    this.config = config
  }

  // 检测命令是否为风险命令（用于前端确认，不再阻止执行）
  private checkRiskyCommand(command: string): { isRisky: boolean; reason?: string } {
    const fullCmd = command.toLowerCase()

    // 检测删除命令
    if (/\brm\b/.test(fullCmd) || /\brmdir\b/.test(fullCmd) || /\bdel\b/.test(fullCmd)) {
      return { isRisky: true, reason: '删除文件/目录命令' }
    }

    // 检测格式化命令
    if (/\bformat\b/.test(fullCmd) || /\bmkfs\b/.test(fullCmd)) {
      return { isRisky: true, reason: '磁盘格式化命令' }
    }

    // 检测权限修改
    if (/\bchmod\b/.test(fullCmd) || /\bchown\b/.test(fullCmd) || /\bchgrp\b/.test(fullCmd)) {
      return { isRisky: true, reason: '权限修改命令' }
    }

    // 检测系统操作
    if (/\bshutdown\b/.test(fullCmd) || /\breboot\b/.test(fullCmd) || /\binit\b/.test(fullCmd)) {
      return { isRisky: true, reason: '系统关机/重启命令' }
    }

    // 检测网络相关
    if (/\biptables\b/.test(fullCmd) || /\bnetsh\b/.test(fullCmd) || /\broute\b/.test(fullCmd)) {
      return { isRisky: true, reason: '网络配置命令' }
    }

    // 检测包管理器
    if (/\bapt\b/.test(fullCmd) || /\byum\b/.test(fullCmd) || /\bbrew\b/.test(fullCmd) || /\bnpm\b/.test(fullCmd) || /\bpip\b/.test(fullCmd)) {
      return { isRisky: true, reason: '包管理器命令' }
    }

    // 检测进程操作
    if (/\bkill\b/.test(fullCmd) || /\bkillall\b/.test(fullCmd) || /\bpkill\b/.test(fullCmd)) {
      return { isRisky: true, reason: '进程终止命令' }
    }

    // 检测 sudo 或管理员权限
    if (/\bsudo\b/.test(fullCmd) || /\brunas\b/.test(fullCmd)) {
      return { isRisky: true, reason: '管理员权限命令' }
    }

    // 检测重定向到系统目录
    if (/>.*\/(etc|system|windows|program)/i.test(fullCmd)) {
      return { isRisky: true, reason: '写入系统目录' }
    }

    return { isRisky: false }
  }

  // 列出可用工具（简单命令模式下只有一个通用执行器）
  async listTools(): Promise<any[]> {
    const command = this.config.command || 'unknown'
    return [{
      name: 'execute',
      description: `Execute simple command: ${command}`,
      inputSchema: {
        type: 'object',
        properties: {
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Command arguments'
          }
        }
      }
    }]
  }

  // 调用工具（执行命令）
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const command = this.config.command!
    const commandArgs = this.config.args || []

    // 检查风险命令（仅记录日志，不阻止执行）
    const riskCheck = this.checkRiskyCommand(command)
    if (riskCheck.isRisky) {
      console.log('[SimpleCommand] Risky command detected:', { command, reason: riskCheck.reason })
    }

    console.log('[SimpleCommand] Executing:', { command, args: commandArgs })

    try {
      const fullCommand = commandArgs.length > 0 ? `${command} ${commandArgs.join(' ')}` : command

      // 使用增强的环境变量
      const enhancedEnv = getEnhancedEnv()

      // 使用异步执行，避免阻塞主进程事件循环
      const result = await execAsync(fullCommand, {
        env: { ...enhancedEnv, ...this.config.env },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })

      // 检查执行结果
      const output = result.stdout + (result.stderr ? `\n${result.stderr}` : '')

      if (result.killed) {
        return {
          content: [{
            type: 'text',
            text: `命令执行超时`
          }],
          isError: true
        }
      }

      if (result.exitCode !== 0) {
        return {
          content: [{
            type: 'text',
            text: output.trim() || `命令执行失败，退出码: ${result.exitCode}`
          }],
          isError: true
        }
      }

      return {
        content: [{
          type: 'text',
          text: output.trim()
        }],
        isError: false
      }
    } catch (error: any) {
      console.error('[SimpleCommand] Execution failed:', error)
      return {
        content: [{
          type: 'text',
          text: error.message || 'Command execution failed'
        }],
        isError: true
      }
    }
  }
}

// MCP 客户端类 - 用于与 MCP 服务器通信
class MCPClient {
  private process: ChildProcess | null = null
  private messageId = 0
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void
    reject: (error: Error) => void
  }>()
  private initialized = false
  private receiveBuffer = '' // 接收缓冲区，用于处理不完整的 JSON

  constructor(private config: MCPServerConfig) {}

  // 启动 MCP 服务器进程（仅用于 stdio 模式）
  async start(): Promise<void> {
    if (this.config.transportType !== 'stdio') {
      throw new Error('Only stdio transport is supported currently')
    }

    if (!this.config.command) {
      throw new Error('Command is required for stdio transport')
    }

    return new Promise((resolve, reject) => {
      try {
        // 获取增强后的环境变量（包含常见 PATH 路径）
        const enhancedEnv = getEnhancedEnv()

        // 尝试解析命令，如果找不到 python 则自动回退到 python3
        let actualCommand = this.config.command!
        let resolvedCommand = resolveCommand(actualCommand)

        // Python 命令自动回退逻辑
        if (!resolvedCommand && actualCommand === 'python') {
          const python3Path = resolveCommand('python3')
          if (python3Path) {
            console.log(`[MCP] Command "python" not found, falling back to "python3"`)
            actualCommand = 'python3'
            resolvedCommand = python3Path
          }
        }

        if (!resolvedCommand) {
          // 构建更友好的错误信息
          let errorMsg = `MCP server command not found: "${this.config.command}"\n\n`

          // 针对 Python 命令提供特殊帮助
          if (this.config.command === 'python' || this.config.command === 'python3') {
            const availablePython = findPythonCommand()
            if (availablePython) {
              errorMsg += `提示：检测到 "${availablePython}" 命令可用，请尝试使用该命令代替 "${this.config.command}"。\n\n`
            } else {
              errorMsg += `提示：未检测到 Python 环境。请安装 Python 或使用 uvx 运行 Python MCP 服务器。\n\n`
            }
          }

          errorMsg += `Please check:\n` +
            `1. The command path is correct\n` +
            `2. Use an absolute path if the command is not in your PATH\n` +
            `3. For npm packages, use: npx <package-name>\n` +
            `4. For Python scripts, use: python3 /path/to/script.py or uvx <package>\n` +
            `5. For Node scripts, use: node /path/to/script.js\n\n` +
            `Current PATH:\n${enhancedEnv.PATH?.split(path.delimiter).join('\n')}`

          reject(new Error(errorMsg))
          return
        }

        const args = this.config.args || []
        // 使用增强的环境变量（可能已回退到 python3）
        const env = { ...enhancedEnv, ...this.config.env }

        // 解析内置 MCP 服务器的相对路径为绝对路径
        // __dirname 是 main.cjs 所在目录（开发时为 frontend/dist-electron，打包后为 app 目录）
        // 项目根目录 = __dirname 的上两级（开发时）或 app 目录（打包时）
        // 注意：打包时使用 asarUnpack 解压 mcp-servers，文件会在 app.asar.unpacked 目录中
        const projectRoot = app.isPackaged
          ? app.getAppPath()
          : path.resolve(__dirname, '..', '..')

        const resolvedArgs = args.map(arg => {
          // 处理 mcp-servers/ 开头的相对路径（内置服务器）
          if (typeof arg === 'string' && arg.startsWith('mcp-servers/')) {
            let resolved: string
            if (app.isPackaged) {
              // 打包模式：使用 app.asar.unpacked 路径（因为 mcp-servers 已配置为 asarUnpack）
              const unpackedRoot = projectRoot.replace('app.asar', 'app.asar.unpacked')
              resolved = path.resolve(unpackedRoot, arg)
            } else {
              // 开发模式：projectRoot 是项目根目录，需要加上 frontend/ 前缀
              resolved = path.resolve(projectRoot, 'frontend', arg)
            }
            console.log(`[MCP] Resolved path: ${arg} -> ${resolved} (projectRoot: ${projectRoot}, isPackaged: ${app.isPackaged})`)
            return resolved
          }
          return arg
        })

        console.log('[MCP] Starting process:', {
          command: actualCommand,
          originalCommand: this.config.command !== actualCommand ? this.config.command : undefined,
          args: resolvedArgs,
          env: Object.keys(env)
        })

        this.process = spawn(actualCommand, resolvedArgs, {
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        })

        if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
          throw new Error('Failed to create stdio pipes')
        }

        // 捕获 stderr 输出用于调试
        let stderrOutput = ''
        this.process.stderr.on('data', (data: Buffer) => {
          stderrOutput += data.toString()
        })

        // 处理 stdout（接收响应）
        this.process.stdout.on('data', (data: Buffer) => {
          this.handleMessage(data.toString())
        })

        // 处理错误
        this.process.on('error', (error) => {
          console.error('[MCP] Process error:', error)
          const errorMsg = `Failed to start MCP server: ${error.message}. ` +
            `Please check if the command "${actualCommand}" is valid and in your PATH.`
          this.rejectAllPending(new Error(errorMsg))
        })

        this.process.on('exit', (code, signal) => {
          console.log(`[MCP] Process exited: code=${code}, signal=${signal}`)

          // 提供更详细的错误信息
          let errorMsg = `Process exited: ${signal || code}`
          if (stderrOutput) {
            errorMsg += `\nStderr output: ${stderrOutput}`
          }

          if (code === 127 || code === 128) {
            errorMsg = `Command not found: "${actualCommand}". ` +
              `Please check:\n` +
              `1. The command path is correct\n` +
              `2. The command is in your PATH or use absolute path\n` +
              `3. The command has execute permissions\n` +
              (stderrOutput ? `\nStderr: ${stderrOutput}` : '')
          } else if (code !== 0 && code !== null) {
            errorMsg += `\nExit code ${code} typically indicates a configuration or runtime error.`
            if (stderrOutput) {
              errorMsg += `\n\nStderr output:\n${stderrOutput}`
            }
          }

          this.rejectAllPending(new Error(errorMsg))
        })

        // 初始化 MCP 会话
        this.initialize().then(() => {
          this.initialized = true
          resolve()
        }).catch(reject)

      } catch (error) {
        reject(error)
      }
    })
  }

  // 停止 MCP 服务器进程
  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.initialized = false
    this.pendingRequests.clear()
    this.receiveBuffer = ''
  }

  // 初始化 MCP 协议
  private async initialize(): Promise<void> {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mirrorgrap-work',
          version: '1.0.0'
        }
      }
    })

    console.log('[MCP] Initialized:', response)
  }

  // 发送请求到 MCP 服务器
  private async sendRequest(message: MCPMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = message.id!

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${message.method}`))
      }, 30000)

      // 保存待处理的请求
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        }
      })

      // 发送请求
      const jsonMessage = JSON.stringify(message) + '\n'
      if (this.process?.stdin) {
        this.process.stdin.write(jsonMessage)
      }
    })
  }

  // 处理来自 MCP 服务器的响应
  private handleMessage(data: string): void {
    // 将新数据添加到缓冲区
    this.receiveBuffer += data

    // 尝试解析完整的 JSON 对象
    let iterations = 0
    const maxIterations = 100 // 防止无限循环

    while (this.receiveBuffer.length > 0 && iterations < maxIterations) {
      iterations++

      // 跳过前导空白
      this.receiveBuffer = this.receiveBuffer.trimStart()
      if (this.receiveBuffer.length === 0) break

      // 检查缓冲区是否以有效的 JSON 开始字符开头
      const firstChar = this.receiveBuffer[0]
      if (firstChar !== '{' && firstChar !== '[') {
        // 不是 JSON 对象或数组，将其包装成 JSON（可能是调试输出）
        const newlineIndex = this.receiveBuffer.indexOf('\n')
        let nonJsonContent = ''

        if (newlineIndex >= 0) {
          nonJsonContent = this.receiveBuffer.slice(0, newlineIndex)
          this.receiveBuffer = this.receiveBuffer.slice(newlineIndex + 1)
        } else {
          // 没有换行符，处理整个缓冲区
          nonJsonContent = this.receiveBuffer
          this.receiveBuffer = ''
        }

        // 将非 JSON 内容包装成 JSON 消息
        const wrappedMessage: MCPMessage = {
          jsonrpc: '2.0',
          method: 'stdout',
          params: {
            content: nonJsonContent,
            timestamp: Date.now()
          }
        }

        // 处理包装后的消息
        console.log('[MCP] Wrapped non-JSON content as stdout notification:', nonJsonContent.slice(0, 100))

        // 作为服务器通知处理
        if (wrappedMessage.method) {
          console.log('[MCP] Server notification:', wrappedMessage.method, wrappedMessage.params)
        }

        continue
      }

      let depth = 0
      let inString = false
      let escapeNext = false
      let objEnd = -1

      // 查找完整的 JSON 对象
      for (let i = 0; i < this.receiveBuffer.length; i++) {
        const char = this.receiveBuffer[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          continue
        }

        if (char === '"') {
          inString = !inString
          continue
        }

        if (!inString) {
          if (char === '{' || char === '[') {
            depth++
          } else if (char === '}' || char === ']') {
            depth--
            if (depth === 0) {
              objEnd = i + 1
              break
            }
          }
        }
      }

      // 如果找到了完整的 JSON 对象
      if (objEnd > 0) {
        const jsonStr = this.receiveBuffer.slice(0, objEnd)
        this.receiveBuffer = this.receiveBuffer.slice(objEnd)
        // 清理前导空白，为下一个对象做准备
        this.receiveBuffer = this.receiveBuffer.trimStart()

        try {
          const message: MCPMessage = JSON.parse(jsonStr)

          // 处理响应
          if (message.id !== undefined) {
            const pending = this.pendingRequests.get(message.id)
            if (pending) {
              this.pendingRequests.delete(message.id)

              if (message.error) {
                pending.reject(new Error(message.error.message))
              } else {
                pending.resolve(message.result)
              }
            }
          } else if (message.method) {
            // 处理服务器发起的通知（如日志等）
            console.log('[MCP] Server notification:', message.method, message.params)
          }
        } catch (error) {
          console.error('[MCP] Failed to parse message:', error, jsonStr)
          // 跳过无法解析的消息
          this.receiveBuffer = this.receiveBuffer.trimStart()
        }
      } else {
        // 没有找到完整的 JSON 对象，等待更多数据
        break
      }
    }

    // 如果达到最大迭代次数，清空缓冲区以防止无限循环
    if (iterations >= maxIterations) {
      console.error('[MCP] Max iterations reached, clearing buffer. Buffer content:', this.receiveBuffer.slice(0, 200))
      this.receiveBuffer = ''
    }
  }

  // 拒绝所有待处理的请求
  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  // 列出可用工具
  async listTools(): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized')
    }

    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'tools/list'
    })

    return response.tools || []
  }

  // 调用工具
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized')
    }

    console.log('[MCP] Calling tool:', { name, args })

    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    })

    return response
  }
}

// MCP 客户端管理器 - 管理多个 MCP 服务器连接
class MCPClientManager {
  private clients = new Map<string, MCPClient>()
  private simpleExecutors = new Map<string, SimpleCommandExecutor>()

  // 获取或创建客户端（支持 MCP 服务器和简单命令）
  async getClient(config: MCPServerConfig): Promise<MCPClient | SimpleCommandExecutor> {
    // 如果是简单命令，返回 SimpleCommandExecutor
    if (config.simpleCommand) {
      let executor = this.simpleExecutors.get(config.id)
      if (!executor) {
        executor = new SimpleCommandExecutor(config)
        this.simpleExecutors.set(config.id, executor)
      }
      return executor
    }

    // 否则使用标准 MCP 客户端
    let client = this.clients.get(config.id)
    if (!client) {
      client = new MCPClient(config)
      await client.start()
      this.clients.set(config.id, client)
    }
    return client
  }

  // 移除客户端
  removeClient(serverId: string): void {
    const client = this.clients.get(serverId)
    if (client) {
      client.stop()
      this.clients.delete(serverId)
    }
    const executor = this.simpleExecutors.get(serverId)
    if (executor) {
      this.simpleExecutors.delete(serverId)
    }
  }

  // 清理所有客户端
  cleanup(): void {
    for (const client of this.clients.values()) {
      client.stop()
    }
    this.clients.clear()
    this.simpleExecutors.clear()
  }
}

const mcpManager = new MCPClientManager()

// 清理资源
app.on('before-quit', () => {
  mcpManager.cleanup()
})

// ============================================================================
// Original Config and Global Memory Code
// ============================================================================

// 配置文件路径
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

// 全局记忆文件路径
const GLOBAL_MEMORY_PATH = path.join(app.getPath('userData'), 'global-memory.json')

interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
}

interface ConfigList {
  configs: AppConfig[]
  activeIndex: number
}

// 全局记忆接口
interface GlobalMemoryEntry {
  id: string
  type: string
  category: string
  title: string
  content: string
  keywords: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
  metadata?: {
    usageCount?: number
    lastUsedAt?: number
  }
}

interface GlobalMemory {
  entries: GlobalMemoryEntry[]
  version: number
  lastUpdated: number
}

// 默认配置
const defaultConfigList: ConfigList = {
  configs: [],
  activeIndex: -1
}

let mainWindow: BrowserWindow | null = null
let imageGeneratorWindow: BrowserWindow | null = null

// 创建生图模式窗口
function createImageGeneratorWindow() {
  // 如果窗口已存在，聚焦并返回
  if (imageGeneratorWindow) {
    imageGeneratorWindow.focus()
    return
  }

  // 图标路径
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '..', 'build', 'icons', 'icon.png')
    : path.join(path.dirname(__dirname), 'build', 'icons', 'icon.png')

  // 获取屏幕尺寸
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // 窗口大小为屏幕的 60%
  const windowWidth = Math.max(800, Math.floor(screenWidth * 0.6))
  const windowHeight = Math.max(600, Math.floor(screenHeight * 0.7))

  imageGeneratorWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    icon: iconPath,
    title: '生图模式',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  // 加载页面
  if (process.env.VITE_DEV_SERVER_URL) {
    imageGeneratorWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/image-generator`)
    imageGeneratorWindow.webContents.openDevTools()
  } else {
    const distPath = path.join(path.dirname(__dirname), 'dist', 'index.html')
    imageGeneratorWindow.loadFile(distPath, { hash: '/image-generator' })
  }

  imageGeneratorWindow.on('closed', () => {
    imageGeneratorWindow = null
  })
}

function createWindow() {
  // 图标路径：开发模式使用 build/icons，生产模式使用打包后的资源
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '..', 'build', 'icons', 'icon.png')
    : path.join(path.dirname(__dirname), 'build', 'icons', 'icon.png')

  // 获取主屏幕工作区尺寸，设置窗口为屏幕的 85%
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  // 窗口大小为屏幕工作区的 85%，但设置最小值以保证可用性
  const windowWidth = Math.max(1000, Math.floor(screenWidth * 0.85))
  const windowHeight = Math.max(700, Math.floor(screenHeight * 0.85))

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    icon: iconPath,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden', // 隐藏标题栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  // 开发模式加载 Vite 开发服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式加载打包后的文件
    // __dirname 在打包后指向 dist-electron，所以需要回到项目根目录然后进入 dist
    const distPath = path.join(path.dirname(__dirname), 'dist', 'index.html')
    mainWindow.loadFile(distPath)
    // 生产模式也打开 DevTools 用于调试
    mainWindow.webContents.openDevTools()
  }

  // 隐藏默认菜单栏 (File, Edit, View 等)
  Menu.setApplicationMenu(null)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 读取配置
function loadConfig(): ConfigList {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return { ...defaultConfigList, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
  }
  return defaultConfigList
}

// 保存配置
function saveConfig(config: ConfigList): boolean {
  try {
    const dir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save config:', error)
    return false
  }
}

// 默认全局记忆
const defaultGlobalMemory: GlobalMemory = {
  entries: [],
  version: 1,
  lastUpdated: Date.now()
}

// 读取全局记忆
function loadGlobalMemory(): GlobalMemory {
  try {
    if (fs.existsSync(GLOBAL_MEMORY_PATH)) {
      const data = fs.readFileSync(GLOBAL_MEMORY_PATH, 'utf-8')
      return { ...defaultGlobalMemory, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('Failed to load global memory:', error)
  }
  return defaultGlobalMemory
}

// 保存全局记忆
function saveGlobalMemory(memory: GlobalMemory): boolean {
  try {
    const dir = path.dirname(GLOBAL_MEMORY_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(GLOBAL_MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8')
    //console.log("GLOBAL_MEMORY_PATH:", GLOBAL_MEMORY_PATH)
    return true
  } catch (error) {
    console.error('Failed to save global memory:', error)
    return false
  }
}

// IPC 处理程序
ipcMain.handle('get-config', () => {
  return loadConfig()
})

ipcMain.handle('save-config', (_event, config: ConfigList) => {
  return saveConfig(config)
})

// 全局记忆 IPC 处理程序
ipcMain.handle('get-global-memory', () => {
  return loadGlobalMemory()
})

ipcMain.handle('save-global-memory', (_event, memory: GlobalMemory) => {
  return saveGlobalMemory(memory)
})

// 在外部浏览器中打开链接
ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

// 窗口控制相关
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
    return false
  } else {
    mainWindow?.maximize()
    return true
  }
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false
})

// 在系统文件管理器中打开路径
ipcMain.handle('open-path', async (_event, path: string) => {
  await shell.openPath(path)
})

// 选择文件夹对话框
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择文件夹'
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, path: '' }
  }

  return {
    success: true,
    path: result.filePaths[0]
  }
})

// 读取目录内容
ipcMain.handle('read-directory', async (_event, dirPath: string) => {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return {
        success: false,
        error: !dirPath ? '目录路径为空' : '目录不存在',
        items: []
      }
    }

    const stats = fs.statSync(dirPath)
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: '路径不是目录',
        items: []
      }
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const items = entries
      .map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      }))
      .sort((a, b) => {
        // 目录排在前面，然后按名称排序
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name, 'zh-CN')
      })

    return {
      success: true,
      items,
      path: dirPath
    }
  } catch (error) {
    console.error('[read-directory] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '读取目录失败',
      items: []
    }
  }
})

// ============================================================================
// MCP IPC Handlers
// ============================================================================

// MCP 工具调用
ipcMain.handle('mcp-call-tool', async (_event, serverConfig: MCPServerConfig, toolName: string, args: Record<string, any>) => {
  try {
    console.log('[MCP IPC] Calling tool:', { server: serverConfig.name, tool: toolName, args })

    const client = await mcpManager.getClient(serverConfig)
    const result = await client.callTool(toolName, args)

    // 检查结果中是否包含错误标志，提取实际错误信息
    if (result.isError) {
      let errorContent = 'Command execution failed'
      if (result.content) {
        if (Array.isArray(result.content)) {
          errorContent = result.content.map((item: any) => {
            if (item.type === 'text') return item.text
            return JSON.stringify(item)
          }).join('\n')
        } else {
          errorContent = JSON.stringify(result.content)
        }
      }
      console.error('[MCP IPC] Tool returned error:', { tool: toolName, error: errorContent })
      return {
        success: false,
        content: '',
        error: errorContent,
        isError: true
      }
    }

    // 处理结果格式
    let content = ''
    if (result.content) {
      if (Array.isArray(result.content)) {
        content = result.content.map((item: any) => {
          if (item.type === 'text') return item.text
          return JSON.stringify(item)
        }).join('\n')
      } else {
        content = JSON.stringify(result.content)
      }
    }

    console.log('[MCP IPC] Tool result:', { tool: toolName, contentLength: content.length })

    return {
      success: true,
      content,
      isError: false
    }
  } catch (error) {
    console.error('[MCP IPC] Tool call failed:', error)
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      isError: true
    }
  }
})

// MCP 列出工具
ipcMain.handle('mcp-list-tools', async (_event, serverConfig: MCPServerConfig) => {
  try {
    console.log('[MCP IPC] Listing tools for:', serverConfig.name)

    const client = await mcpManager.getClient(serverConfig)
    const tools = await client.listTools()

    console.log('[MCP IPC] Tools listed:', tools.length)

    return {
      success: true,
      tools
    }
  } catch (error) {
    console.error('[MCP IPC] List tools failed:', error)
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// MCP 清理客户端
ipcMain.handle('mcp-cleanup', () => {
  mcpManager.cleanup()
  return { success: true }
})

// MCP 安装依赖
interface MCPDependencyConfig {
  type: 'python' | 'node' | 'uvx'
  packages: string[]
  requirementsFile?: string
}

ipcMain.handle('mcp-install-dependencies', async (_event, dependency: MCPDependencyConfig, serverPath?: string) => {
  try {
    console.log('[MCP IPC] Installing dependencies:', dependency)

    const enhancedEnv = getEnhancedEnv()

    if (dependency.type === 'uvx') {
      // uvx 类型不需要单独安装依赖，uvx 会在运行时自动管理
      // 只需要检查 uvx 命令是否存在
      const uvxExists = commandExists('uvx')
      if (uvxExists) {
        return {
          success: true,
          output: 'uvx 已安装，依赖将在运行时自动管理',
          method: 'uvx'
        }
      } else {
        return {
          success: false,
          error: '未找到 uvx 命令。请安装 uv 工具:\n' +
            'macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
            'Windows: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
        }
      }
    } else if (dependency.type === 'python') {
      // 检查是否有满足版本要求的 Python
      const pythonCmd = findPythonCommand({ requireMinVersion: true })

      if (!pythonCmd) {
        return {
          success: false,
          error: `未找到 Python 环境。MCP 包需要 Python ${MCP_MIN_PYTHON_VERSION[0]}.${MCP_MIN_PYTHON_VERSION[1]} 或更高版本。\n\n` +
            `解决方案：\n` +
            `1. 安装 Python ${MCP_MIN_PYTHON_VERSION[0]}.${MCP_MIN_PYTHON_VERSION[1]}+ : 访问 https://www.python.org/downloads/\n` +
            `2. 或使用 uvx 运行 Python MCP 服务器（推荐）: curl -LsSf https://astral.sh/uv/install.sh | sh`
        }
      }

      // 检查 Python 版本是否满足要求
      const version = getPythonVersion(pythonCmd)
      if (version && !isVersionAtLeast(version, MCP_MIN_PYTHON_VERSION)) {
        return {
          success: false,
          error: `当前 Python 版本 ${version.major}.${version.minor} 过低。MCP 包需要 Python ${MCP_MIN_PYTHON_VERSION[0]}.${MCP_MIN_PYTHON_VERSION[1]} 或更高版本。\n\n` +
            `检测到的 Python 路径: ${resolveCommand(pythonCmd)}\n\n` +
            `解决方案：\n` +
            `1. 安装 Python ${MCP_MIN_PYTHON_VERSION[0]}.${MCP_MIN_PYTHON_VERSION[1]}+ : 访问 https://www.python.org/downloads/\n` +
            `2. 或使用 Homebrew: brew install python@3.10 (或更高版本)\n` +
            `3. 或使用 uvx 运行 Python MCP 服务器（推荐）: curl -LsSf https://astral.sh/uv/install.sh | sh`
        }
      }

      // 优先使用 uv 安装（更快）
      const uvExists = commandExists('uv')

      if (uvExists) {
        // 使用 uv pip install
        const packages = dependency.packages.join(' ')
        const command = serverPath
          ? `uv pip install --python ${pythonCmd} ${packages}`
          : `uv pip install ${packages}`

        console.log('[MCP IPC] Installing with uv:', command)

        try {
          const output = execSync(command, {
            encoding: 'utf-8',
            env: enhancedEnv,
            timeout: 120000, // 2 minutes timeout
            maxBuffer: 10 * 1024 * 1024
          })

          return {
            success: true,
            output: output.trim(),
            method: 'uv'
          }
        } catch (uvError: any) {
          console.log('[MCP IPC] uv install failed, falling back to pip:', uvError.message)
          // 如果 uv 失败，回退到 pip
        }
      }

      // 回退到 pip 安装
      const packages = dependency.packages.join(' ')
      const command = `${pythonCmd} -m pip install ${packages}`

      console.log('[MCP IPC] Installing with pip:', command)

      const output = execSync(command, {
        encoding: 'utf-8',
        env: enhancedEnv,
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        success: true,
        output: output.trim(),
        method: 'pip'
      }
    } else if (dependency.type === 'node') {
      // Node.js 依赖安装
      const packages = dependency.packages.join(' ')
      const command = `npm install ${packages}`

      console.log('[MCP IPC] Installing with npm:', command)

      const output = execSync(command, {
        encoding: 'utf-8',
        env: enhancedEnv,
        cwd: serverPath || process.cwd(),
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        success: true,
        output: output.trim(),
        method: 'npm'
      }
    }

    return {
      success: false,
      error: 'Unknown dependency type'
    }
  } catch (error: any) {
    console.error('[MCP IPC] Install dependencies failed:', error)

    let errorMessage = error.message
    if (error.stderr) {
      errorMessage += `\n${error.stderr.toString()}`
    }

    return {
      success: false,
      error: errorMessage,
      output: error.stdout?.toString() || ''
    }
  }
})

// 检查 MCP 依赖是否已安装
ipcMain.handle('mcp-check-dependencies', async (_event, dependency: MCPDependencyConfig) => {
  try {
    if (dependency.type === 'uvx') {
      // uvx 类型只需要检查 uvx 命令是否存在，包会在运行时自动安装
      const uvxExists = commandExists('uvx')
      return {
        success: true,
        installed: uvxExists,
        missingPackages: uvxExists ? [] : ['uvx']
      }
    } else if (dependency.type === 'python') {
      const pythonCmd = findPythonCommand() || 'python3'

      // 检查每个包是否已安装
      const missingPackages: string[] = []

      for (const pkg of dependency.packages) {
        try {
          // 尝试导入模块
          execSync(`${pythonCmd} -c "import ${pkg.replace('-', '_')}"`, {
            encoding: 'utf-8',
            env: getEnhancedEnv(),
            timeout: 10000
          })
        } catch {
          missingPackages.push(pkg)
        }
      }

      return {
        success: true,
        installed: missingPackages.length === 0,
        missingPackages
      }
    } else if (dependency.type === 'node') {
      // Node.js 依赖检查
      const missingPackages: string[] = []

      for (const pkg of dependency.packages) {
        try {
          execSync(`npm list ${pkg}`, {
            encoding: 'utf-8',
            env: getEnhancedEnv(),
            timeout: 10000
          })
        } catch {
          missingPackages.push(pkg)
        }
      }

      return {
        success: true,
        installed: missingPackages.length === 0,
        missingPackages
      }
    }

    return {
      success: true,
      installed: true,
      missingPackages: []
    }
  } catch (error: any) {
    console.error('[MCP IPC] Check dependencies failed:', error)
    return {
      success: false,
      error: error.message,
      installed: false,
      missingPackages: dependency.packages
    }
  }
})

// ============================================================================
// Built-in File Operation Tools
// ============================================================================

// 文件操作处理器
ipcMain.handle('file-operation', async (_event, operation: string, args: Record<string, any>) => {
  try {
    const { basePath = '', path: itemPath = '', newPath = '', name = '' } = args

    if (!basePath) {
      return {
        success: false,
        error: '未选择工作目录，请先选择文件夹'
      }
    }

    // 解析完整路径（确保路径安全，防止路径遍历攻击）
    const resolveSafePath = (targetPath: string): string => {
      // 移除开头的路径分隔符
      const cleanPath = targetPath.replace(/^[/\\]+/, '')
      // 拼接基础路径
      const fullPath = path.join(basePath, cleanPath)
      // 解析为绝对路径并规范化
      const resolved = path.resolve(fullPath)
      // 确保解析后的路径在基础路径内（防止路径遍历）
      if (!resolved.startsWith(path.resolve(basePath))) {
        throw new Error('路径遍历攻击检测：路径必须在基础目录内')
      }
      return resolved
    }

    switch (operation) {
      case 'list_directory': {
        const targetPath = resolveSafePath(itemPath || '.')

        if (!fs.existsSync(targetPath)) {
          return {
            success: false,
            error: `目录不存在: ${itemPath}`
          }
        }

        const stat = fs.statSync(targetPath)
        if (!stat.isDirectory()) {
          return {
            success: false,
            error: `路径不是目录: ${itemPath}`
          }
        }

        const entries = fs.readdirSync(targetPath, { withFileTypes: true })
        const items = entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file'
        }))

        return {
          success: true,
          content: JSON.stringify({
            path: itemPath || '.',
            items
          }, null, 2)
        }
      }

      case 'create_directory': {
        if (!name) {
          return {
            success: false,
            error: '缺少必需参数: name'
          }
        }

        const targetPath = resolveSafePath(path.join(itemPath || '', name))

        if (fs.existsSync(targetPath)) {
          return {
            success: false,
            error: `目录已存在: ${name}`
          }
        }

        fs.mkdirSync(targetPath, { recursive: true })

        return {
          success: true,
          content: JSON.stringify({
            message: `目录创建成功: ${name}`,
            path: path.join(itemPath || '.', name)
          }, null, 2)
        }
      }

      case 'move_file': {
        if (!itemPath || !newPath) {
          return {
            success: false,
            error: '缺少必需参数: path 和 newPath'
          }
        }

        const sourcePath = resolveSafePath(itemPath)
        const destPath = resolveSafePath(newPath)

        if (!fs.existsSync(sourcePath)) {
          return {
            success: false,
            error: `源路径不存在: ${itemPath}`
          }
        }

        // 确保目标目录存在
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        fs.renameSync(sourcePath, destPath)

        return {
          success: true,
          content: JSON.stringify({
            message: '移动成功',
            from: itemPath,
            to: newPath
          }, null, 2)
        }
      }

      case 'copy_file': {
        if (!itemPath || !newPath) {
          return {
            success: false,
            error: '缺少必需参数: path 和 newPath'
          }
        }

        const sourcePath = resolveSafePath(itemPath)
        const destPath = resolveSafePath(newPath)

        if (!fs.existsSync(sourcePath)) {
          return {
            success: false,
            error: `源路径不存在: ${itemPath}`
          }
        }

        // 确保目标目录存在
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }

        const stat = fs.statSync(sourcePath)
        if (stat.isDirectory()) {
          // 递归复制目录
          copyDirectoryRecursive(sourcePath, destPath)
        } else {
          fs.copyFileSync(sourcePath, destPath)
        }

        return {
          success: true,
          content: JSON.stringify({
            message: '复制成功',
            from: itemPath,
            to: newPath
          }, null, 2)
        }
      }

      case 'rename_item': {
        if (!itemPath || !name) {
          return {
            success: false,
            error: '缺少必需参数: path 和 name'
          }
        }

        const sourcePath = resolveSafePath(itemPath)
        const parentDir = path.dirname(sourcePath)
        const destPath = path.join(parentDir, name)

        if (!fs.existsSync(sourcePath)) {
          return {
            success: false,
            error: `路径不存在: ${itemPath}`
          }
        }

        if (fs.existsSync(destPath)) {
          return {
            success: false,
            error: `目标名称已存在: ${name}`
          }
        }

        fs.renameSync(sourcePath, destPath)

        return {
          success: true,
          content: JSON.stringify({
            message: '重命名成功',
            from: itemPath,
            to: path.join(path.dirname(itemPath), name)
          }, null, 2)
        }
      }

      case 'delete_item': {
        if (!itemPath) {
          return {
            success: false,
            error: '缺少必需参数: path'
          }
        }

        const targetPath = resolveSafePath(itemPath)

        if (!fs.existsSync(targetPath)) {
          return {
            success: false,
            error: `路径不存在: ${itemPath}`
          }
        }

        const stat = fs.statSync(targetPath)
        if (stat.isDirectory()) {
          fs.rmSync(targetPath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(targetPath)
        }

        return {
          success: true,
          content: JSON.stringify({
            message: '删除成功',
            path: itemPath
          }, null, 2)
        }
      }

      case 'glob': {
        const { pattern = '' } = args
        // 将相对路径解析为基于 basePath 的绝对路径
        const searchPath = args.path ? path.resolve(basePath, args.path) : basePath

        if (!pattern) {
          return {
            success: false,
            error: '缺少必需参数: pattern'
          }
        }

        // 验证搜索路径是否在基础路径内（使用规范化后的路径比较）
        const normalizedBasePath = path.resolve(basePath)
        const normalizedSearchPath = path.resolve(searchPath)
        const relativePath = path.relative(normalizedBasePath, normalizedSearchPath)
        if (relativePath.startsWith('..')) {
          return {
            success: false,
            error: '搜索路径必须在基础目录内'
          }
        }

        if (!fs.existsSync(searchPath)) {
          return {
            success: false,
            error: `搜索路径不存在: ${args.path}`
          }
        }

        try {
          const globPattern = path.join(searchPath, pattern)
          const { glob: globUtil } = await import('glob')
          const rawFiles = await globUtil(globPattern, {
            windowsPathsNoEscape: true,
            nodir: false,
            dot: false
          })

          // 确保 files 是一个数组（glob v11+ 可能返回 PathScurry 对象）
          const files = Array.isArray(rawFiles) ? rawFiles : Array.from(rawFiles as Iterable<string>)

          // 返回相对路径
          const relativeFiles = files.map(f => path.relative(searchPath, f))

          return {
            success: true,
            content: JSON.stringify({
              pattern,
              path: searchPath,
              files: relativeFiles,
              count: relativeFiles.length
            }, null, 2)
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Glob 搜索失败: ${error?.message || error}`
          }
        }
      }

      case 'grep': {
        const { pattern = '' } = args
        // 将相对路径解析为基于 basePath 的绝对路径
        const searchPath = args.path ? path.resolve(basePath, args.path) : basePath
        const includePattern = args.include || ''

        if (!pattern) {
          return {
            success: false,
            error: '缺少必需参数: pattern'
          }
        }

        // 验证搜索路径是否在基础路径内（使用规范化后的路径比较）
        const normalizedBasePath = path.resolve(basePath)
        const normalizedSearchPath = path.resolve(searchPath)
        const relativePath = path.relative(normalizedBasePath, normalizedSearchPath)
        if (relativePath.startsWith('..')) {
          return {
            success: false,
            error: '搜索路径必须在基础目录内'
          }
        }

        if (!fs.existsSync(searchPath)) {
          return {
            success: false,
            error: `搜索路径不存在: ${args.path}`
          }
        }

        try {
          const regex = new RegExp(pattern)
          const results: Array<{ file: string; line: number; content: string }> = []

          // 递归搜索文件
          const searchInDirectory = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true })

            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name)

              if (entry.isDirectory()) {
                // 递归搜索子目录
                searchInDirectory(fullPath)
              } else if (entry.isFile()) {
                // 检查文件扩展名是否匹配 include pattern
                if (includePattern) {
                  const ext = path.extname(entry.name)
                  const includeRegex = new RegExp(includePattern.replace(/[{}]/g, ''))
                  if (!includeRegex.test(ext) && !includeRegex.test(entry.name)) {
                    continue
                  }
                }

                try {
                  const content = fs.readFileSync(fullPath, 'utf-8')
                  const lines = content.split('\n')

                  lines.forEach((line, index) => {
                    if (regex.test(line)) {
                      results.push({
                        file: path.relative(searchPath, fullPath),
                        line: index + 1,
                        content: line.trim()
                      })
                    }
                  })
                } catch (err) {
                  // 跳过无法读取的文件（二进制文件等）
                }
              }
            }
          }

          searchInDirectory(searchPath)

          return {
            success: true,
            content: JSON.stringify({
              pattern,
              path: searchPath,
              include: includePattern,
              matches: results.length,
              results: results.slice(0, 100) // 限制结果数量
            }, null, 2)
          }
        } catch (error: any) {
          return {
            success: false,
            error: `Grep 搜索失败: ${error?.message || error}`
          }
        }
      }

      case 'read_file': {
        const { file_path = '' } = args
        const limit = args.limit || 2000
        const offset = args.offset || 1

        if (!file_path) {
          return {
            success: false,
            error: '缺少必需参数: file_path'
          }
        }

        const targetPath = path.isAbsolute(file_path) ? file_path : resolveSafePath(file_path)

        // 对于绝对路径，验证是否在基础路径内 读文件可以不校验
        // if (path.isAbsolute(file_path) && !targetPath.startsWith(path.resolve(basePath))) {
        //   return {
        //     success: false,
        //     error: '文件路径必须在基础目录内'
        //   }
        // }

        if (!fs.existsSync(targetPath)) {
          return {
            success: false,
            error: `文件不存在: ${file_path}`
          }
        }

        const stat = fs.statSync(targetPath)
        if (stat.isDirectory()) {
          return {
            success: false,
            error: `路径是目录而不是文件: ${file_path}`
          }
        }

        try {
          const content = fs.readFileSync(targetPath, 'utf-8')
          const lines = content.split('\n')

          const startLine = Math.max(0, offset - 1)
          const endLine = Math.min(lines.length, startLine + limit)
          const selectedLines = lines.slice(startLine, endLine)

          // 添加行号
          const numberedLines = selectedLines.map((line, idx) => {
            const lineNum = startLine + idx + 1
            return `${String(lineNum).padStart(4, ' ')}\t${line}`
          })

          return {
            success: true,
            content: JSON.stringify({
              file_path,
              total_lines: lines.length,
              lines_shown: selectedLines.length,
              start_line: startLine + 1,
              end_line: endLine,
              content: numberedLines.join('\n')
            }, null, 2)
          }
        } catch (error: any) {
          return {
            success: false,
            error: `读取文件失败: ${error?.message || error}`
          }
        }
      }

      case 'write_file': {
        const { file_path = '', content = '' } = args

        if (!file_path) {
          return {
            success: false,
            error: '缺少必需参数: file_path'
          }
        }

        if (content === undefined || content === null) {
          return {
            success: false,
            error: '缺少必需参数: content'
          }
        }

        const targetPath = path.isAbsolute(file_path) ? file_path : resolveSafePath(file_path)

        // 对于绝对路径，验证是否在基础路径内
        if (path.isAbsolute(file_path) && !targetPath.startsWith(path.resolve(basePath))) {
          return {
            success: false,
            error: '文件路径必须在基础目录内'
          }
        }

        // 确保父目录存在
        const parentDir = path.dirname(targetPath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }

        try {
          // 处理 content：如果是对象，先序列化为 JSON；如果是字符串，直接使用
          const contentToWrite = typeof content === 'object'
            ? JSON.stringify(content, null, 2)
            : String(content)

          fs.writeFileSync(targetPath, contentToWrite, 'utf-8')

          return {
            success: true,
            content: JSON.stringify({
              message: '文件写入成功',
              file_path,
              bytes_written: Buffer.byteLength(contentToWrite, 'utf-8')
            }, null, 2)
          }
        } catch (error: any) {
          return {
            success: false,
            error: `写入文件失败: ${error?.message || error}`
          }
        }
      }

      case 'edit_file': {
        const { file_path = '', old_string = '', new_string = '', replace_all = false } = args

        if (!file_path) {
          return {
            success: false,
            error: '缺少必需参数: file_path'
          }
        }

        if (!old_string || old_string === '') {
          return {
            success: false,
            error: '缺少必需参数: old_string（不能为空）'
          }
        }

        if (new_string === undefined || new_string === null) {
          return {
            success: false,
            error: '缺少必需参数: new_string'
          }
        }

        const targetPath = path.isAbsolute(file_path) ? file_path : resolveSafePath(file_path)

        // 对于绝对路径，验证是否在基础路径内
        if (path.isAbsolute(file_path) && !targetPath.startsWith(path.resolve(basePath))) {
          return {
            success: false,
            error: '文件路径必须在基础目录内'
          }
        }

        if (!fs.existsSync(targetPath)) {
          return {
            success: false,
            error: `文件不存在: ${file_path}`
          }
        }

        const stat = fs.statSync(targetPath)
        if (stat.isDirectory()) {
          return {
            success: false,
            error: `路径是目录而不是文件: ${file_path}`
          }
        }

        try {
          let content = fs.readFileSync(targetPath, 'utf-8')

          // 检查 old_string 是否存在
          if (!content.includes(old_string)) {
            return {
              success: false,
              error: `未找到要替换的文本: "${old_string.slice(0, 50)}${old_string.length > 50 ? '...' : ''}"`
            }
          }

          // 计算替换次数
          let replaceCount = 0
          if (replace_all) {
            const matches = content.split(old_string)
            replaceCount = matches.length - 1
            content = content.split(old_string).join(new_string)
          } else {
            // 只替换第一个匹配项
            content = content.replace(old_string, new_string)
            replaceCount = 1
          }

          fs.writeFileSync(targetPath, content, 'utf-8')

          return {
            success: true,
            content: JSON.stringify({
              message: '文件编辑成功',
              file_path,
              replacements_made: replaceCount,
              replace_all
            }, null, 2)
          }
        } catch (error: any) {
          return {
            success: false,
            error: `编辑文件失败: ${error?.message || error}`
          }
        }
      }

      case 'execute_command': {
        const { command = '', timeout = 30000 } = args

        if (!command) {
          return {
            success: false,
            error: '缺少必需参数: command'
          }
        }

        // 注意：命令限制已移除，风险命令的确认由前端处理
        try {
          console.log('[execute_command] Executing:', { command, cwd: basePath, timeout })

          // 使用异步执行，避免阻塞主进程事件循环
          const result = await execAsync(command, {
            cwd: basePath,
            timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            env: { ...process.env }
          })

          // 检查执行结果
          if (result.killed) {
            return {
              success: false,
              error: `命令执行超时（${timeout}ms）`
            }
          }

          const output = result.stdout + (result.stderr ? `\n${result.stderr}` : '')

          if (result.exitCode !== 0) {
            return {
              success: false,
              error: `命令执行失败，退出码: ${result.exitCode}${output ? `\n${output.trim()}` : ''}`
            }
          }

          return {
            success: true,
            content: JSON.stringify({
              command,
              cwd: basePath,
              output: output.trim(),
              exitCode: result.exitCode
            }, null, 2)
          }
        } catch (error: any) {
          console.error('[execute_command] Execution failed:', error)

          return {
            success: false,
            error: `命令执行失败: ${error.message}`
          }
        }
      }

      default:
        return {
          success: false,
          error: `未知的文件操作: ${operation}`
        }
    }
  } catch (error) {
    console.error('[File Operation] Failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '操作失败'
    }
  }
})

// 递归复制目录的辅助函数
function copyDirectoryRecursive(source: string, target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }

  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name)
    const destPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ============================================================================
// Skills System IPC Handlers
// ============================================================================

// Skills 类型定义
type SkillLocation = 'public' | 'examples' | 'user'

interface SkillFrontmatter {
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  triggers?: string[]
}

interface SkillMetadata {
  id: string
  name: string
  description: string
  location: SkillLocation
  path: string
  enabled: boolean
  createdAt: number
  updatedAt: number
  version?: string
  author?: string
  tags?: string[]
  triggers?: string[]
  isLoaded?: boolean
  hasError?: boolean
  errorMessage?: string
}

interface Skill extends SkillMetadata {
  body: string
}

interface SkillScanResult {
  success: boolean
  skills: SkillMetadata[]
  errors: string[]
}

interface SkillLoadResult {
  success: boolean
  skill?: Skill
  error?: string
}

// Skills 验证约束
const SKILL_CONSTRAINTS = {
  NAME_MAX_LENGTH: 64,
  NAME_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  DESCRIPTION_MAX_LENGTH: 1024,
  DESCRIPTION_FORBIDDEN_CHARS: /[<>]/
}

// Skills 优先级
const SKILL_PRIORITY: Record<SkillLocation, number> = {
  user: 3,
  public: 2,
  examples: 1
}

// 获取 Skills 基础路径
function getSkillsBasePath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    // 开发模式：使用 frontend 目录下的 skills
    return path.join(path.dirname(__dirname), 'skills')
  }
  // 生产模式：使用 app.asar.unpacked 路径（因为 skills 已配置为 asarUnpack）
  const appPath = app.getAppPath()
  const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked')
  return path.join(unpackedPath, 'skills')
}

// 获取所有 Skills 目录
function getSkillsDirectories(): Record<SkillLocation, string> {
  const base = getSkillsBasePath()
  const homePath = app.getPath('home')
  return {
    public: path.join(base, 'public'),
    examples: path.join(base, 'examples'),
    user: path.join(base, 'user'),
    installed: path.join(homePath, '.agents', 'skills')
  }
}

// 解析 YAML Frontmatter
function parseSkillFrontmatter(content: string): {
  frontmatter: SkillFrontmatter | null
  body: string
  error?: string
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return {
      frontmatter: null,
      body: content,
      error: 'Missing or invalid YAML frontmatter (must start with ---)'
    }
  }

  const [, yamlContent, body] = match
  const frontmatter: Record<string, any> = {}

  // 简单 YAML 解析（key: value 格式）
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      let value: any = line.slice(colonIndex + 1).trim()

      // 处理数组 [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value
          .slice(1, -1)
          .split(',')
          .map((v: string) => v.trim().replace(/^["']|["']$/g, ''))
          .filter((v: string) => v)
      }
      // 移除引号
      else if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      frontmatter[key] = value
    }
  }

  return { frontmatter: frontmatter as SkillFrontmatter, body }
}

// 验证 skill 名称
function validateSkillName(name: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!name || name.trim() === '') {
    errors.push('Name is required')
  } else if (name.length > SKILL_CONSTRAINTS.NAME_MAX_LENGTH) {
    errors.push(`Name must be ${SKILL_CONSTRAINTS.NAME_MAX_LENGTH} characters or less`)
  } else if (!SKILL_CONSTRAINTS.NAME_PATTERN.test(name)) {
    errors.push(
      'Name must be lowercase letters, numbers, and hyphens only (no leading/trailing/consecutive hyphens)'
    )
  }

  return { valid: errors.length === 0, errors }
}

// 验证 skill 描述
function validateSkillDescription(description: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!description || description.trim() === '') {
    errors.push('Description is required')
  } else if (description.length > SKILL_CONSTRAINTS.DESCRIPTION_MAX_LENGTH) {
    errors.push(`Description must be ${SKILL_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters or less`)
  } else if (SKILL_CONSTRAINTS.DESCRIPTION_FORBIDDEN_CHARS.test(description)) {
    errors.push('Description cannot contain < or > characters')
  }

  return { valid: errors.length === 0, errors }
}

// 验证完整 frontmatter
function validateSkillFrontmatter(fm: SkillFrontmatter): { valid: boolean; errors: string[] } {
  const nameValidation = validateSkillName(fm.name)
  const descValidation = validateSkillDescription(fm.description)

  return {
    valid: nameValidation.valid && descValidation.valid,
    errors: [...nameValidation.errors, ...descValidation.errors]
  }
}

// 扫描 Skills 目录
ipcMain.handle('skills-scan', async (): Promise<SkillScanResult> => {
  const skills: SkillMetadata[] = []
  const errors: string[] = []
  const dirs = getSkillsDirectories()

  for (const [location, dirPath] of Object.entries(dirs)) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
        continue
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = path.join(dirPath, entry.name)
        const skillMdPath = path.join(skillPath, 'SKILL.md')

        // Skip directories without SKILL.md silently
        if (!fs.existsSync(skillMdPath)) {
          continue
        }

        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const { frontmatter, error } = parseSkillFrontmatter(content)

          if (error || !frontmatter) {
            errors.push(`Skill "${entry.name}" parse error: ${error}`)
            continue
          }

          const validation = validateSkillFrontmatter(frontmatter)
          if (!validation.valid) {
            errors.push(`Skill "${entry.name}" validation failed: ${validation.errors.join('; ')}`)
            continue
          }

          // Use folder name (entry.name) for skillId to ensure correct path reconstruction
          // frontmatter.name may differ from folder name (e.g., folder: seo-1.0.3, frontmatter: seo)
          const skillId = `${location}-${entry.name}`
          const stats = fs.statSync(skillMdPath)

          skills.push({
            id: skillId,
            name: frontmatter.name,
            description: frontmatter.description,
            location: location as SkillLocation,
            path: skillPath,
            enabled: true,
            createdAt: stats.birthtimeMs,
            updatedAt: stats.mtimeMs,
            version: frontmatter.version,
            author: frontmatter.author,
            tags: frontmatter.tags,
            triggers: frontmatter.triggers,
            isLoaded: false,
            hasError: false
          })
        } catch (e) {
          errors.push(`Skill "${entry.name}" read error: ${e}`)
        }
      }
    } catch (e) {
      errors.push(`Failed to scan ${location} directory: ${e}`)
    }
  }

  // 按优先级排序 (user > public > examples)
  skills.sort((a, b) => SKILL_PRIORITY[b.location] - SKILL_PRIORITY[a.location])

  return { success: true, skills, errors }
})

// 加载 Skill 内容 (L2)
ipcMain.handle('skills-load', async (_event, skillId: string): Promise<SkillLoadResult> => {
  try {
    // 解析 skillId (格式: location-name)
    const firstDashIndex = skillId.indexOf('-')
    if (firstDashIndex === -1) {
      return { success: false, error: 'Invalid skill ID format' }
    }

    const location = skillId.slice(0, firstDashIndex) as SkillLocation
    const skillName = skillId.slice(firstDashIndex + 1)

    const dirs = getSkillsDirectories()
    const skillPath = path.join(dirs[location], skillName)
    const skillMdPath = path.join(skillPath, 'SKILL.md')

    if (!fs.existsSync(skillMdPath)) {
      return { success: false, error: 'SKILL.md not found' }
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const { frontmatter, body, error } = parseSkillFrontmatter(content)

    if (error || !frontmatter) {
      return { success: false, error }
    }

    const stats = fs.statSync(skillMdPath)

    return {
      success: true,
      skill: {
        id: skillId,
        name: frontmatter.name,
        description: frontmatter.description,
        location,
        path: skillPath,
        enabled: true,
        createdAt: stats.birthtimeMs,
        updatedAt: stats.mtimeMs,
        version: frontmatter.version,
        author: frontmatter.author,
        tags: frontmatter.tags,
        triggers: frontmatter.triggers,
        isLoaded: true,
        hasError: false,
        body: body.trim()
      }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

// 创建新 Skill (仅 user 位置)
ipcMain.handle('skills-create', async (_event, name: string, description: string): Promise<SkillLoadResult> => {
  // 先验证
  const nameValidation = validateSkillName(name)
  const descValidation = validateSkillDescription(description)

  if (!nameValidation.valid || !descValidation.valid) {
    return {
      success: false,
      error: [...nameValidation.errors, ...descValidation.errors].join('; ')
    }
  }

  const dirs = getSkillsDirectories()
  const skillPath = path.join(dirs.user, name)
  const skillMdPath = path.join(skillPath, 'SKILL.md')

  // 检查是否已存在
  if (fs.existsSync(skillPath)) {
    return { success: false, error: 'Skill with this name already exists' }
  }

  try {
    fs.mkdirSync(skillPath, { recursive: true })

    const content = `---
name: ${name}
description: "${description.replace(/"/g, '\\"')}"
version: "1.0.0"
---

# ${name}

TODO: Add skill instructions here.
`

    fs.writeFileSync(skillMdPath, content, 'utf-8')

    const skillId = `user-${name}`
    const now = Date.now()

    return {
      success: true,
      skill: {
        id: skillId,
        name,
        description,
        location: 'user',
        path: skillPath,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        isLoaded: true,
        hasError: false,
        body: 'TODO: Add skill instructions here.'
      }
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

// 更新 Skill 内容 (仅 user 位置)
ipcMain.handle('skills-update', async (_event, skillId: string, body: string): Promise<{ success: boolean; error?: string }> => {
  const firstDashIndex = skillId.indexOf('-')
  if (firstDashIndex === -1) {
    return { success: false, error: 'Invalid skill ID format' }
  }

  const location = skillId.slice(0, firstDashIndex)

  if (location !== 'user') {
    return { success: false, error: 'Only user skills can be edited' }
  }

  const skillName = skillId.slice(firstDashIndex + 1)
  const dirs = getSkillsDirectories()
  const skillMdPath = path.join(dirs.user, skillName, 'SKILL.md')

  if (!fs.existsSync(skillMdPath)) {
    return { success: false, error: 'SKILL.md not found' }
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const { frontmatter } = parseSkillFrontmatter(content)

    if (!frontmatter) {
      return { success: false, error: 'Failed to parse existing frontmatter' }
    }

    // 重建文件内容
    const newContent = `---
name: ${frontmatter.name}
description: "${frontmatter.description.replace(/"/g, '\\"')}"${frontmatter.version ? `\nversion: "${frontmatter.version}"` : ''}${frontmatter.author ? `\nauthor: ${frontmatter.author}` : ''}${frontmatter.tags ? `\ntags: [${frontmatter.tags.join(', ')}]` : ''}${frontmatter.triggers ? `\ntriggers: [${frontmatter.triggers.join(', ')}]` : ''}
---

${body}
`

    fs.writeFileSync(skillMdPath, newContent, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

// 删除 Skill (仅 user 位置)
ipcMain.handle('skills-delete', async (_event, skillId: string): Promise<{ success: boolean; error?: string }> => {
  const firstDashIndex = skillId.indexOf('-')
  if (firstDashIndex === -1) {
    return { success: false, error: 'Invalid skill ID format' }
  }

  const location = skillId.slice(0, firstDashIndex)

  if (location !== 'user') {
    return { success: false, error: 'Only user skills can be deleted' }
  }

  const skillName = skillId.slice(firstDashIndex + 1)
  const dirs = getSkillsDirectories()
  const skillPath = path.join(dirs.user, skillName)

  if (!fs.existsSync(skillPath)) {
    return { success: false, error: 'Skill not found' }
  }

  try {
    fs.rmSync(skillPath, { recursive: true, force: true })
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('chat-request', async (_event, { apiUrl, apiKey, model, messages, extra_body }) => {
  try {
    // 解析 extra_body 参数
    let extraBodyParams: Record<string, any> = {}
    if (extra_body && extra_body.trim()) {
      try {
        extraBodyParams = JSON.parse(extra_body)
      } catch (e) {
        console.error('Failed to parse extra_body:', e)
      }
    }

    // 打印最终的 system 提示词到控制台
    const systemMessage = messages.find((m: any) => m.role === 'system')
    if (systemMessage) {
      console.log('\n' + '='.repeat(60))
      console.log('[SYSTEM PROMPT]')
      console.log('='.repeat(60))
      console.log(systemMessage.content)
      console.log('='.repeat(60) + '\n')
    }

    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...extraBodyParams,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API request failed: ${response.status} ${text}`)
    }

    return {
      success: true,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// ==================== 生图模式 IPC 处理程序 ====================

// 打开生图窗口
ipcMain.handle('open-image-generator-window', () => {
  createImageGeneratorWindow()
})

// 生图窗口最小化
ipcMain.handle('image-generator-minimize', () => {
  imageGeneratorWindow?.minimize()
})

// 生图窗口最大化
ipcMain.handle('image-generator-maximize', () => {
  if (imageGeneratorWindow?.isMaximized()) {
    imageGeneratorWindow.unmaximize()
    return false
  } else {
    imageGeneratorWindow?.maximize()
    return true
  }
})

// 生图窗口关闭
ipcMain.handle('image-generator-close', () => {
  imageGeneratorWindow?.close()
})

// 生图窗口是否最大化
ipcMain.handle('image-generator-is-maximized', () => {
  return imageGeneratorWindow?.isMaximized() ?? false
})

// 图片生成请求
ipcMain.handle('image-generator-request', async (_event, params: {
  apiUrl: string
  apiKey: string
  model: string
  prompt: string
  size: string
}): Promise<{ success: boolean; error?: string; images?: string[]; created?: number }> => {
  try {
    const { apiUrl, apiKey, model, prompt, size } = params

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`API request failed: ${response.status} ${text}`)
    }

    const result = await response.json()

    // 提取图片 URL
    const images: string[] = []
    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.url) {
          images.push(item.url)
        }
        // 支持 base64 格式的图片
        if (item.b64_json) {
          images.push(`data:image/png;base64,${item.b64_json}`)
        }
      }
    }

    return {
      success: true,
      images,
      created: result.created
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// 下载图片
ipcMain.handle('download-image', async (_event, url: string): Promise<{ success: boolean; error?: string; cancelled?: boolean }> => {
  try {
    // 弹出保存对话框让用户选择保存位置
    const { canceled, filePath } = await dialog.showSaveDialog(imageGeneratorWindow!, {
      title: '保存图片',
      defaultPath: `image_${Date.now()}.png`,
      filters: [
        { name: 'PNG 图片', extensions: ['png'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    // 用户取消
    if (canceled || !filePath) {
      return { success: false, cancelled: true }
    }

    // 如果是 base64 格式
    if (url.startsWith('data:')) {
      const base64Data = url.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(filePath, buffer)
      return { success: true }
    }

    // 远程 URL，下载图片
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(filePath, buffer)

    // 通知用户文件已保存
    imageGeneratorWindow?.webContents.send('download-complete', filePath)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// 产出物输出目录
const IMAGE_OUTPUTS_PATH = path.join(app.getPath('userData'), 'image-outputs')

// 自动下载图片（无对话框，保存到默认目录）
ipcMain.handle('auto-download-image', async (_event, url: string, filename: string): Promise<{ success: boolean; path?: string; error?: string }> => {
  try {
    // 确保目录存在
    if (!fs.existsSync(IMAGE_OUTPUTS_PATH)) {
      fs.mkdirSync(IMAGE_OUTPUTS_PATH, { recursive: true })
    }

    const savePath = path.join(IMAGE_OUTPUTS_PATH, filename)

    // 如果是 base64 格式
    if (url.startsWith('data:')) {
      const base64Data = url.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(savePath, buffer)
      return { success: true, path: savePath }
    }

    // 远程 URL，下载图片
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(savePath, buffer)

    return { success: true, path: savePath }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// 打开产出物目录
ipcMain.handle('open-outputs-folder', async (): Promise<{ success: boolean; path?: string; error?: string }> => {
  try {
    // 确保目录存在
    if (!fs.existsSync(IMAGE_OUTPUTS_PATH)) {
      fs.mkdirSync(IMAGE_OUTPUTS_PATH, { recursive: true })
    }
    await shell.openPath(IMAGE_OUTPUTS_PATH)
    return { success: true, path: IMAGE_OUTPUTS_PATH }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// 获取产出物目录路径
ipcMain.handle('get-outputs-path', (): string => {
  return IMAGE_OUTPUTS_PATH
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ============================================================================
// Environment Check
// ============================================================================

interface EnvironmentCheckResult {
  name: string
  displayName: string
  status: 'success' | 'warning' | 'error'
  message: string
  details?: string
  fixSuggestion?: string
  // 自动安装相关
  canAutoInstall?: boolean
  installMethod?: 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'yum' | 'dnf' | 'script'
  installCommand?: string
  downloadUrl?: string
}

// 包管理器检测
type PackageManagerType = 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'yum' | 'dnf'

interface PackageManagerInfo {
  type: PackageManagerType
  exists: boolean
  installCommands: Record<string, string> // 环境项 -> 安装命令
}

// 检测可用的包管理器
function detectPackageManagers(): PackageManagerInfo[] {
  const managers: PackageManagerInfo[] = []
  const platform = process.platform

  if (platform === 'darwin') {
    // macOS: 优先 Homebrew
    const brewExists = commandExists('brew')
    managers.push({
      type: 'brew',
      exists: brewExists,
      installCommands: {
        'node-command': 'brew install node',
        'npx-command': 'brew install node', // npx 随 node 安装
        'uvx-command': 'brew install uv',
        'uv-command': 'brew install uv',
        'python-command': 'brew install python@3.12'
      }
    })
  } else if (platform === 'win32') {
    // Windows: winget, scoop, chocolatey
    const wingetExists = commandExists('winget')
    managers.push({
      type: 'winget',
      exists: wingetExists,
      installCommands: {
        'node-command': 'winget install OpenJS.NodeJS.LTS',
        'npx-command': 'winget install OpenJS.NodeJS.LTS',
        'uvx-command': 'winget install astral-sh.uv',
        'uv-command': 'winget install astral-sh.uv',
        'python-command': 'winget install Python.Python.3.12'
      }
    })

    const scoopExists = commandExists('scoop')
    managers.push({
      type: 'scoop',
      exists: scoopExists,
      installCommands: {
        'node-command': 'scoop install nodejs-lts',
        'npx-command': 'scoop install nodejs-lts',
        'uvx-command': 'scoop install uv',
        'uv-command': 'scoop install uv',
        'python-command': 'scoop install python'
      }
    })

    const chocoExists = commandExists('choco')
    managers.push({
      type: 'choco',
      exists: chocoExists,
      installCommands: {
        'node-command': 'choco install nodejs-lts -y',
        'npx-command': 'choco install nodejs-lts -y',
        'uvx-command': 'choco install uv -y',
        'uv-command': 'choco install uv -y',
        'python-command': 'choco install python -y'
      }
    })
  } else {
    // Linux: apt, yum, dnf
    const aptExists = commandExists('apt') || commandExists('apt-get')
    managers.push({
      type: 'apt',
      exists: aptExists,
      installCommands: {
        'node-command': 'sudo apt install -y nodejs npm',
        'npx-command': 'sudo apt install -y nodejs npm',
        'uvx-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'uv-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'python-command': 'sudo apt install -y python3 python3-pip'
      }
    })

    const yumExists = commandExists('yum')
    managers.push({
      type: 'yum',
      exists: yumExists,
      installCommands: {
        'node-command': 'sudo yum install -y nodejs npm',
        'npx-command': 'sudo yum install -y nodejs npm',
        'uvx-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'uv-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'python-command': 'sudo yum install -y python3 python3-pip'
      }
    })

    const dnfExists = commandExists('dnf')
    managers.push({
      type: 'dnf',
      exists: dnfExists,
      installCommands: {
        'node-command': 'sudo dnf install -y nodejs npm',
        'npx-command': 'sudo dnf install -y nodejs npm',
        'uvx-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'uv-command': 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        'python-command': 'sudo dnf install -y python3 python3-pip'
      }
    })
  }

  return managers
}

// 获取推荐的包管理器
function getRecommendedPackageManager(): PackageManagerInfo | null {
  const managers = detectPackageManagers()
  return managers.find(m => m.exists) || null
}

// 下载链接配置
const DOWNLOAD_URLS: Record<string, Record<string, string>> = {
  'node-command': {
    default: 'https://nodejs.org/'
  },
  'npx-command': {
    default: 'https://nodejs.org/'
  },
  'uvx-command': {
    default: 'https://docs.astral.sh/uv/getting-started/installation/'
  },
  'uv-command': {
    default: 'https://docs.astral.sh/uv/getting-started/installation/'
  },
  'python-command': {
    default: 'https://www.python.org/downloads/'
  }
}

ipcMain.handle('check-environment', async (): Promise<EnvironmentCheckResult[]> => {
  const results: EnvironmentCheckResult[] = []
  const packageManager = getRecommendedPackageManager()

  // 辅助函数：获取安装信息
  function getInstallInfo(itemName: string): {
    canAutoInstall: boolean
    installMethod?: 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'yum' | 'dnf' | 'script'
    installCommand?: string
    downloadUrl?: string
  } {
    if (packageManager && packageManager.installCommands[itemName]) {
      return {
        canAutoInstall: true,
        installMethod: packageManager.type,
        installCommand: packageManager.installCommands[itemName],
        downloadUrl: DOWNLOAD_URLS[itemName]?.default
      }
    }
    return {
      canAutoInstall: false,
      downloadUrl: DOWNLOAD_URLS[itemName]?.default
    }
  }

  // 1. 检查 node 命令
  const nodeExists = commandExists('node')
  results.push({
    name: 'node-command',
    displayName: 'node 命令',
    status: nodeExists ? 'success' : 'warning',
    message: nodeExists ? 'node 命令可用' : 'node 命令未找到（MCP 服务器可能需要）',
    details: nodeExists ? '可用于运行 MCP 服务器' : '建议安装 Node.js',
    fixSuggestion: nodeExists ? undefined : '访问 https://nodejs.org/ 下载并安装 Node.js（推荐 LTS 版本）。安装后重启终端或应用程序。',
    ...getInstallInfo('node-command')
  })

  // 2. 检查 npx 命令
  const npxExists = commandExists('npx')
  results.push({
    name: 'npx-command',
    displayName: 'npx 命令',
    status: npxExists ? 'success' : 'warning',
    message: npxExists ? 'npx 命令可用' : 'npx 命令未找到（MCP 服务器可能需要）',
    details: npxExists ? '可用于运行 npm 包形式的 MCP 服务器' : '建议安装 Node.js (包含 npx)',
    fixSuggestion: npxExists ? undefined : 'npx 随 Node.js 一起安装。请安装 Node.js：访问 https://nodejs.org/ 下载 LTS 版本。',
    ...getInstallInfo('npx-command')
  })

  // 3. 检查 uvx 命令（Python MCP 工具）
  const uvxExists = commandExists('uvx')
  results.push({
    name: 'uvx-command',
    displayName: 'uvx 命令',
    status: uvxExists ? 'success' : 'warning',
    message: uvxExists ? 'uvx 命令可用' : 'uvx 命令未找到（Python MCP 服务器可能需要）',
    details: uvxExists ? '可用于运行 Python 包形式的 MCP 服务器' : '可选：安装 uv 以使用 Python MCP 服务器',
    fixSuggestion: uvxExists ? undefined : '安装 uv 工具：\n• macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh\n• Windows: pip install uv\n或访问 https://docs.astral.sh/uv/ 查看更多安装方式。',
    ...getInstallInfo('uvx-command')
  })

  // 4. 检查 uv 命令（Python 包管理器）
  const uvExists = commandExists('uv')
  results.push({
    name: 'uv-command',
    displayName: 'uv 命令',
    status: uvExists ? 'success' : 'warning',
    message: uvExists ? 'uv 命令可用' : 'uv 命令未找到',
    details: uvExists ? 'Python 包管理器可用' : '可选：安装 uv 以使用 Python MCP 服务器',
    fixSuggestion: uvExists ? undefined : '安装 uv 工具：\n• macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh\n• Windows: pip install uv\n或访问 https://docs.astral.sh/uv/ 查看更多安装方式。',
    ...getInstallInfo('uv-command')
  })

  // 5. 检查 Python 命令（优先检测 python3，然后是 python）
  const python3Exists = commandExists('python3')
  const pythonExists = commandExists('python')
  const pythonCommand = findPythonCommand()
  const pythonCommandForMCP = findPythonCommand({ requireMinVersion: true })
  const pythonVersion = pythonCommand ? getPythonVersion(pythonCommand) : null
  const meetsMinVersion = pythonVersion && isVersionAtLeast(pythonVersion, MCP_MIN_PYTHON_VERSION)

  results.push({
    name: 'python-command',
    displayName: 'Python 命令',
    status: meetsMinVersion ? 'success' : (pythonCommand ? 'warning' : 'warning'),
    message: pythonCommand
      ? `检测到 "${pythonCommand}" 命令${pythonVersion ? ` (版本 ${pythonVersion.major}.${pythonVersion.minor})` : ''}${meetsMinVersion ? '' : ' - MCP 需要 Python 3.10+'}`
      : 'Python 命令未找到',
    details: pythonCommand
      ? `可用于运行 Python MCP 服务器（使用 ${pythonCommand}）${meetsMinVersion ? '' : '\n警告: MCP 包需要 Python 3.10 或更高版本'}`
      : `python3: ${python3Exists ? '可用' : '不可用'}, python: ${pythonExists ? '可用' : '不可用'}`,
    fixSuggestion: meetsMinVersion ? undefined :
      pythonCommand
        ? `当前 Python 版本 ${pythonVersion?.major}.${pythonVersion?.minor} 过低，MCP 包需要 Python 3.10+。\n\n` +
          `解决方案：\n` +
          `1. 使用 Homebrew 安装新版本: brew install python@3.10 (或更高版本)\n` +
          `2. 或访问 https://www.python.org/downloads/ 下载安装\n` +
          `3. 或使用 uvx 运行 Python MCP 服务器（推荐）: curl -LsSf https://astral.sh/uv/install.sh | sh`
        : '安装 Python 3.10+：\n• macOS: brew install python@3.10 或访问 https://www.python.org/downloads/\n• Windows: 访问 https://www.python.org/downloads/ 下载安装\n• Linux: sudo apt install python3.10 或 sudo yum install python3\n\n推荐使用 uvx 运行 Python MCP 服务器，无需手动安装 Python 依赖。',
    ...getInstallInfo('python-command')
  })

  // 6. 检查配置目录可写
  try {
    const testFile = path.join(app.getPath('userData'), '.write-test')
    fs.writeFileSync(testFile, 'test')
    fs.unlinkSync(testFile)
    results.push({
      name: 'config-dir',
      displayName: '配置目录',
      status: 'success',
      message: '配置目录可读写',
      details: `路径: ${app.getPath('userData')}`
    })
  } catch (error) {
    results.push({
      name: 'config-dir',
      displayName: '配置目录',
      status: 'error',
      message: '配置目录不可写',
      details: `路径: ${app.getPath('userData')}`,
      fixSuggestion: '请检查目录权限：\n1. 确保应用程序有写入用户数据目录的权限\n2. 尝试以管理员身份运行应用程序\n3. 检查磁盘是否有足够空间\n4. 如果是权限问题，可能需要修复目录权限或重新安装应用'
    })
  }

  // 7. 检查平台信息
  results.push({
    name: 'platform',
    displayName: '系统平台',
    status: 'success',
    message: `${process.platform} ${process.arch}`,
    details: `操作系统: ${process.platform}, 架构: ${process.arch}`
  })

  return results
})

// 检测可用的包管理器
ipcMain.handle('detect-package-manager', async () => {
  const managers = detectPackageManagers()
  const available = managers.filter(m => m.exists).map(m => m.type)
  const recommended = available[0] || null

  return {
    available,
    recommended,
    platform: process.platform
  }
})

// 环境安装进度接口
interface EnvironmentInstallProgress {
  name: string
  status: 'pending' | 'installing' | 'success' | 'error'
  message: string
  progress?: number
}

// 环境安装结果接口
interface EnvironmentInstallResult {
  success: boolean
  name: string
  message: string
  error?: string
  requiresRestart?: boolean
}

// 安装单个环境项
async function installEnvironmentItem(
  itemName: string,
  sendProgress: (progress: EnvironmentInstallProgress) => void
): Promise<EnvironmentInstallResult> {
  const packageManager = getRecommendedPackageManager()

  if (!packageManager) {
    return {
      success: false,
      name: itemName,
      message: '未找到可用的包管理器',
      error: '请先安装 Homebrew (macOS)、winget/scoop/chocolatey (Windows) 或使用系统包管理器 (Linux)'
    }
  }

  const installCommand = packageManager.installCommands[itemName]
  if (!installCommand) {
    return {
      success: false,
      name: itemName,
      message: '该环境项不支持自动安装',
      error: '请手动安装或访问官方网站下载'
    }
  }

  sendProgress({
    name: itemName,
    status: 'installing',
    message: `正在安装 ${itemName}...`,
    progress: 0
  })

  try {
    const enhancedEnv = getEnhancedEnv()

    // 使用 spawn 来执行命令以便获取实时输出
    return new Promise((resolve) => {
      const isSudoCommand = installCommand.startsWith('sudo')
      let command = installCommand
      let args: string[] = []

      // 解析命令和参数
      if (isSudoCommand) {
        // sudo 命令需要特殊处理
        const parts = installCommand.split(' ')
        command = parts[0] // sudo
        args = parts.slice(1)
      } else if (packageManager.type === 'brew') {
        // brew install package
        const parts = installCommand.split(' ')
        command = parts[0]
        args = parts.slice(1)
      } else if (packageManager.type === 'winget') {
        // winget install ...
        const parts = installCommand.split(' ')
        command = parts[0]
        args = parts.slice(1)
      } else if (packageManager.type === 'scoop') {
        // scoop install ...
        const parts = installCommand.split(' ')
        command = parts[0]
        args = parts.slice(1)
      } else if (packageManager.type === 'choco') {
        // choco install ... -y
        const parts = installCommand.split(' ')
        command = parts[0]
        args = parts.slice(1)
      } else {
        // 脚本命令（如 curl | sh）
        command = '/bin/bash'
        args = ['-c', installCommand]
      }

      console.log(`[Environment Install] Executing: ${command} ${args.join(' ')}`)

      const child = spawn(command, args, {
        env: enhancedEnv,
        shell: !isSudoCommand, // sudo 命令不使用 shell
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      let errorOutput = ''

      child.stdout?.on('data', (data) => {
        const text = data.toString()
        output += text
        console.log(`[Environment Install] stdout: ${text}`)

        // 发送进度更新
        sendProgress({
          name: itemName,
          status: 'installing',
          message: `正在安装 ${itemName}...`,
          progress: 50 // 简化的进度
        })
      })

      child.stderr?.on('data', (data) => {
        const text = data.toString()
        errorOutput += text
        console.log(`[Environment Install] stderr: ${text}`)
      })

      child.on('close', (code) => {
        if (code === 0) {
          sendProgress({
            name: itemName,
            status: 'success',
            message: `${itemName} 安装成功`,
            progress: 100
          })
          resolve({
            success: true,
            name: itemName,
            message: `${itemName} 安装成功`,
            requiresRestart: true
          })
        } else {
          sendProgress({
            name: itemName,
            status: 'error',
            message: `${itemName} 安装失败`,
            progress: 100
          })
          resolve({
            success: false,
            name: itemName,
            message: `${itemName} 安装失败`,
            error: errorOutput || output || `进程退出码: ${code}`
          })
        }
      })

      child.on('error', (err) => {
        sendProgress({
          name: itemName,
          status: 'error',
          message: `${itemName} 安装出错`,
          progress: 100
        })
        resolve({
          success: false,
          name: itemName,
          message: `${itemName} 安装出错`,
          error: err.message
        })
      })

      // 设置超时（10分钟）
      setTimeout(() => {
        child.kill()
        resolve({
          success: false,
          name: itemName,
          message: `${itemName} 安装超时`,
          error: '安装过程超时（超过10分钟）'
        })
      }, 10 * 60 * 1000)
    })
  } catch (error: any) {
    sendProgress({
      name: itemName,
      status: 'error',
      message: `${itemName} 安装异常`,
      progress: 100
    })
    return {
      success: false,
      name: itemName,
      message: `${itemName} 安装异常`,
      error: error?.message || '未知错误'
    }
  }
}

// 环境安装 IPC 处理器
ipcMain.handle('install-environment', async (event, items: string[]): Promise<EnvironmentInstallResult[]> => {
  const results: EnvironmentInstallResult[] = []

  // 进度回调函数
  const sendProgress = (progress: EnvironmentInstallProgress) => {
    event.sender.send('install-environment-progress', progress)
  }

  for (const item of items) {
    console.log(`[Environment Install] Installing: ${item}`)
    const result = await installEnvironmentItem(item, sendProgress)
    results.push(result)
  }

  return results
})

// 读取更新日志
ipcMain.handle('get-changelog', async () => {
  try {
    // 开发模式和生产模式下更新日志的路径不同
    let changelogPath: string

    if (process.env.VITE_DEV_SERVER_URL) {
      // 开发模式：从项目根目录读取
      changelogPath = path.join(path.dirname(__dirname), '..', 'frontend/src/upload_log/更新日志.md')
    } else {
      // 生产模式：从应用资源目录读取（需要在打包时包含）
      changelogPath = path.join(path.dirname(__dirname), '..', 'frontend/src/upload_log/更新日志.md')
    }

    if (fs.existsSync(changelogPath)) {
      const content = fs.readFileSync(changelogPath, 'utf-8')
      return {
        success: true,
        content
      }
    } else {
      // 如果文件不存在，返回默认内容
      return {
        success: true,
        content: `暂无更新内容`
      }
    }
  } catch (error) {
    console.error('[get-changelog] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '读取更新日志失败',
      content: ''
    }
  }
})

// 文件预览处理器（不依赖工作目录）
ipcMain.handle('preview-file', async (_event, filePath: string, limit: number = 500) => {
  try {
    if (!filePath) {
      return {
        success: false,
        error: '缺少文件路径'
      }
    }

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `文件不存在: ${filePath}`
      }
    }

    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      return {
        success: false,
        error: `路径是目录而不是文件`
      }
    }

    // 检查文件大小（限制为 5MB 以内）
    const maxSize = 5 * 1024 * 1024
    if (stat.size > maxSize) {
      return {
        success: false,
        error: `文件过大（超过 5MB），无法预览`
      }
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const limitedLines = lines.slice(0, limit)

    return {
      success: true,
      content: limitedLines.join('\n'),
      totalLines: lines.length,
      linesShown: limitedLines.length
    }
  } catch (error: any) {
    return {
      success: false,
      error: `读取文件失败: ${error?.message || error}`
    }
  }
})

// 读取文件为 Buffer（用于图片、PDF 等二进制文件预览）
ipcMain.handle('read-file-as-buffer', async (_event, filePath: string) => {
  try {
    if (!filePath) {
      return {
        success: false,
        error: '缺少文件路径'
      }
    }

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `文件不存在: ${filePath}`
      }
    }

    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      return {
        success: false,
        error: `路径是目录而不是文件`
      }
    }

    // 检查文件大小（限制为 50MB 以内，图片/PDF 可能较大）
    const maxSize = 50 * 1024 * 1024
    if (stat.size > maxSize) {
      return {
        success: false,
        error: `文件过大（超过 50MB），无法预览`
      }
    }

    const buffer = fs.readFileSync(filePath)
    return {
      success: true,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
  } catch (error: any) {
    return {
      success: false,
      error: `读取文件失败: ${error?.message || error}`
    }
  }
})
