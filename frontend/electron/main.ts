import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess, execSync } from 'child_process'

const __dirname = path.dirname(__filename)

// ============================================================================
// MCP Client Implementation
// ============================================================================

// 检查命令是否存在
function commandExists(command: string): boolean {
  try {
    // 检查是否是绝对路径
    if (path.isAbsolute(command)) {
      return fs.existsSync(command)
    }

    // 检查命令是否在 PATH 中
    const isWindows = process.platform === 'win32'
    const exts = isWindows ? ['.exe', '.cmd', '.bat'] : ['']

    for (const ext of exts) {
      try {
        execSync(`command -v "${command}${ext}" 2>/dev/null || which "${command}${ext}" 2>/dev/null || type "${command}${ext}" > /dev/null 2>&1`, {
          stdio: 'ignore'
        })
        return true
      } catch {
        // 继续尝试下一个扩展
      }
    }

    // Windows 上尝试 where 命令
    if (isWindows) {
      try {
        execSync(`where "${command}"`, { stdio: 'ignore' })
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

  // 验证命令是否在白名单中
  private validateCommand(command: string): { valid: boolean; error?: string } {
    // 获取基础命令（忽略路径和参数）
    let baseCommand = command.split(' ')[0]
    baseCommand = path.basename(baseCommand) // 提取命令名称，忽略路径如 /bin/date

    if (!SIMPLE_COMMAND_WHITELIST.includes(baseCommand)) {
      return {
        valid: false,
        error: `Command "${baseCommand}" is not in the whitelist. ` +
          `Allowed commands: ${SIMPLE_COMMAND_WHITELIST.join(', ')}`
      }
    }

    // 额外安全检查：禁止危险的命令组合
    const fullCmd = command.toLowerCase()
    if (fullCmd.includes(' rm ') || fullCmd.startsWith('rm ') || fullCmd.includes('\trm\t')) {
      return { valid: false, error: 'Command "rm" is not allowed for safety reasons' }
    }

    if (fullCmd.includes('>') || fullCmd.includes('>>')) {
      return { valid: false, error: 'Output redirection is not allowed' }
    }

    if (fullCmd.includes('|')) {
      return { valid: false, error: 'Pipe is not allowed for security reasons' }
    }

    if (fullCmd.includes('&') || fullCmd.includes(';')) {
      return { valid: false, error: 'Command chaining is not allowed' }
    }

    return { valid: true }
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

    // 验证命令
    const validation = this.validateCommand(command)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    console.log('[SimpleCommand] Executing:', { command, args: commandArgs })

    try {
      const fullCommand = commandArgs.length > 0 ? `${command} ${commandArgs.join(' ')}` : command

      const output = execSync(fullCommand, {
        encoding: 'utf-8',
        env: { ...process.env, ...this.config.env },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })

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
          text: error.stderr?.toString() || error.message || 'Command execution failed'
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
        // 检查命令是否存在
        if (!commandExists(this.config.command!)) {
          reject(new Error(
            `MCP server command not found: "${this.config.command}"\n\n` +
            `Please check:\n` +
            `1. The command path is correct\n` +
            `2. Use an absolute path if the command is not in your PATH\n` +
            `3. For npm packages, use: npx <package-name>\n` +
            `4. For Python scripts, use: python /path/to/script.py\n` +
            `5. For Node scripts, use: node /path/to/script.js`
          ))
          return
        }

        const args = this.config.args || []
        const env = { ...process.env, ...this.config.env }

        console.log('[MCP] Starting process:', {
          command: this.config.command,
          args,
          env: Object.keys(env)
        })

        this.process = spawn(this.config.command, args, {
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
            `Please check if the command "${this.config.command}" is valid and in your PATH.`
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
            errorMsg = `Command not found: "${this.config.command}". ` +
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
          name: 'openchat-desktop',
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  }

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

// ============================================================================
// MCP IPC Handlers
// ============================================================================

// MCP 工具调用
ipcMain.handle('mcp-call-tool', async (_event, serverConfig: MCPServerConfig, toolName: string, args: Record<string, any>) => {
  try {
    console.log('[MCP IPC] Calling tool:', { server: serverConfig.name, tool: toolName, args })

    const client = await mcpManager.getClient(serverConfig)
    const result = await client.callTool(toolName, args)

    // 检查结果中是否包含错误标志（SimpleCommandExecutor 可能返回）
    if (result.isError) {
      return {
        success: false,
        content: '',
        error: 'Command execution failed',
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
