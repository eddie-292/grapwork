/**
 * MCP (Model Context Protocol) 管理组件
 * 用于管理 MCP 服务器配置、与 LLM Function Calling 集成
 */
import { ref, computed, toRaw } from 'vue'
import { storage } from '@/services/StorageService'
import { StorageKey } from '@/types/storage'
import type {
  MCPServer,
  MCPServerList,
  MCPToolDefinition,
  OpenAIToolCall,
  MCPToolResult,
  MCPChatMessage,
} from '@/types/mcp'

// 检查是否在 Electron 环境中
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

// 内置 MCP 服务器配置
// 注意：路径相对于 app.getAppPath()（开发时为项目根目录，打包后为 app 目录）
// 使用 python 直接运行，需要预先安装依赖：pip install -r requirements.txt
const BUILTIN_MCP_SERVERS: Omit<MCPServer, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'builtin-email-server',
    name: 'Email Server',
    description: '邮件收发 MCP 服务器，支持发送、接收、搜索邮件等功能。需要配置 .env 文件设置邮件服务。',
    transportType: 'stdio' as const,
    enabled: true,
    builtin: true,
    command: 'python',
    args: ['mcp-servers/email-server/email_server.py'],
    tools: []
  },
  {
    id: 'builtin-time-server',
    name: 'Time Server',
    description: '时间工具 MCP 服务器，提供时区转换、时间计算、格式化等功能。',
    transportType: 'stdio' as const,
    enabled: true,
    builtin: true,
    command: 'python',
    args: ['mcp-servers/time-server/time_server.py'],
    tools: []
  }
]

/**
 * 尝试修复 LLM 生成的损坏 JSON 字符串
 * 主要处理：未转义的引号、换行符等
 */
function tryFixJsonString(jsonStr: string): string {
  // 如果已经是有效的 JSON，直接返回
  try {
    JSON.parse(jsonStr)
    return jsonStr
  } catch {
    // 继续修复
  }

  // 策略1: 尝试提取并修复 content 字段的值
  // 匹配 "content": "..." 模式，其中 ... 可能包含未转义的字符
  const contentMatch = jsonStr.match(/"content"\s*:\s*"/)
  if (contentMatch && contentMatch.index !== undefined) {
    const startIndex = contentMatch.index + contentMatch[0].length
    let depth = 0
    let inString = true
    let escapeNext = false
    let endIndex = startIndex

    // 从 content 值开始，找到正确的结束位置
    for (let i = startIndex; i < jsonStr.length; i++) {
      const char = jsonStr[i]

      if (escapeNext) {
        escapeNext = false
        continue
      }

      if (char === '\\' && inString) {
        escapeNext = true
        continue
      }

      if (char === '"') {
        // 检查这是否是对象的结束引号
        // 查看后面的非空白字符
        let j = i + 1
        while (j < jsonStr.length && /\s/.test(jsonStr[j])) j++

        if (j >= jsonStr.length || jsonStr[j] === '}' || jsonStr[j] === ',') {
          // 这可能是结束引号
          endIndex = i
          break
        }
        // 否则这是内容中的引号，需要转义
      }
    }

    // 如果找到了结束位置，尝试修复
    if (endIndex > startIndex) {
      let contentValue = jsonStr.slice(startIndex, endIndex)
      // 转义内容中的特殊字符
      contentValue = contentValue
        .replace(/\\/g, '\\\\')  // 先转义反斜杠
        .replace(/"/g, '\\"')     // 转义双引号
        .replace(/\n/g, '\\n')    // 转义换行符
        .replace(/\r/g, '\\r')    // 转义回车符
        .replace(/\t/g, '\\t')    // 转义制表符

      const fixed = jsonStr.slice(0, startIndex) + contentValue + jsonStr.slice(endIndex)
      return fixed
    }
  }

  // 策略2: 尝试更宽松的修复 - 找到最后一个有效的结构
  // 查找最后一个 } 并尝试截断
  let lastBrace = jsonStr.lastIndexOf('}')
  if (lastBrace > 0) {
    // 尝试从最后一个 } 截断并添加缺失的内容
    let truncated = jsonStr.slice(0, lastBrace + 1)

    // 计算需要添加多少个 }
    let openBraces = 0
    let inStr = false
    let escape = false

    for (let i = 0; i < truncated.length; i++) {
      const c = truncated[i]
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') {
        inStr = !inStr
        continue
      }
      if (!inStr) {
        if (c === '{') openBraces++
        else if (c === '}') openBraces--
      }
    }

    // 如果还有未闭合的引号，尝试闭合
    if (inStr) {
      truncated += '"'
    }

    // 添加缺失的 }
    while (openBraces > 0) {
      truncated += '}'
      openBraces--
    }

    return truncated
  }

  return jsonStr
}

/**
 * 安全解析工具调用参数
 * 先尝试直接解析，失败后尝试修复再解析
 */
function safeParseToolArguments(argsStr: string): { success: boolean; args: Record<string, any>; error?: string } {
  // 第一次尝试：直接解析
  try {
    return { success: true, args: JSON.parse(argsStr) }
  } catch (firstError) {
    console.warn('[MCP] First JSON parse attempt failed, trying to fix...', firstError)
  }

  // 第二次尝试：修复后解析
  try {
    const fixedStr = tryFixJsonString(argsStr)
    const args = JSON.parse(fixedStr)
    console.log('[MCP] JSON fixed successfully')
    return { success: true, args }
  } catch (secondError) {
    console.error('[MCP] JSON fix attempt also failed:', secondError)
  }

  // 第三次尝试：使用正则提取关键字段
  try {
    const extractedArgs: Record<string, any> = {}

    // 提取 file_path
    const filePathMatch = argsStr.match(/"file_path"\s*:\s*"([^"]*)"/)
    if (filePathMatch) {
      extractedArgs.file_path = filePathMatch[1]
    }

    // 提取 content (可能很长，使用更宽松的匹配)
    const contentStartMatch = argsStr.match(/"content"\s*:\s*"/)
    if (contentStartMatch && contentStartMatch.index !== undefined) {
      const startIndex = contentStartMatch.index + contentStartMatch[0].length
      // 找到 content 的结束 - 查找 "file_path" 或字符串结尾或 },
      let content = ''
      let i = startIndex
      let lastValidEnd = startIndex

      while (i < argsStr.length) {
        if (argsStr[i] === '\\' && i + 1 < argsStr.length) {
          content += argsStr[i] + argsStr[i + 1]
          i += 2
          continue
        }
        if (argsStr[i] === '"') {
          // 检查是否是字段结束
          let j = i + 1
          while (j < argsStr.length && /\s/.test(argsStr[j])) j++
          if (j >= argsStr.length || argsStr[j] === '}' || argsStr[j] === ',') {
            lastValidEnd = i
            break
          }
        }
        content += argsStr[i]
        lastValidEnd = i
        i++
      }

      // 提取内容，处理转义
      extractedArgs.content = argsStr.slice(startIndex, lastValidEnd)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }

    // 提取 command
    const commandMatch = argsStr.match(/"command"\s*:\s*"([^"]*)"/)
    if (commandMatch) {
      extractedArgs.command = commandMatch[1]
    }

    if (Object.keys(extractedArgs).length > 0) {
      console.log('[MCP] Extracted args using regex fallback:', extractedArgs)
      return { success: true, args: extractedArgs }
    }
  } catch (regexError) {
    console.error('[MCP] Regex extraction failed:', regexError)
  }

  return {
    success: false,
    args: {},
    error: `Failed to parse tool call arguments as JSON: ${argsStr.slice(0, 200)}...`
  }
}

// 风险命令确认回调类型
export type CommandConfirmCallback = (command: string, reason: string) => Promise<boolean>

// 使用 MCP 的 composable
export function useMCP() {
  const serverList = ref<MCPServerList>({
    servers: [],
    activeServerIds: []
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 内置文件操作工具的工作目录
  const selectedFolder = ref<string>('')

  // 命令确认回调（由外部组件设置）
  let commandConfirmCallback: CommandConfirmCallback | null = null

  // 设置命令确认回调
  function setCommandConfirmCallback(callback: CommandConfirmCallback | null) {
    commandConfirmCallback = callback
  }

  // 检测命令是否为风险命令
  function checkRiskyCommand(command: string): { isRisky: boolean; reason?: string } {
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

    // 检测管道和重定向（可能造成数据泄露或损坏）
    if (fullCmd.includes('|') || fullCmd.includes('>') || fullCmd.includes('>>')) {
      return { isRisky: true, reason: '使用管道或重定向' }
    }

    // 检测命令链
    if (fullCmd.includes('&&') || fullCmd.includes('||') || fullCmd.includes(';')) {
      return { isRisky: true, reason: '命令链操作' }
    }

    // 检测 curl/wget（可能下载恶意文件）
    if (/\bcurl\b/.test(fullCmd) || /\bwget\b/.test(fullCmd)) {
      return { isRisky: true, reason: '网络下载命令' }
    }

    return { isRisky: false }
  }

  // 加载 MCP 服务器列表
  async function loadServers() {
    loading.value = true
    error.value = null
    try {
      const data = await storage.getMCPServerList()
      const userServers = data?.servers || []
      const userActiveIds = data?.activeServerIds || []

      // 加载内置服务器的工具列表（之前刷新保存的）
      const builtinToolsResult = await storage.get<Record<string, MCPToolDefinition[]>>(StorageKey.BUILTIN_MCP_TOOLS)
      const builtinTools = builtinToolsResult?.data || {}

      // 加载内置服务器的配置覆盖（用户自定义的命令、参数等）
      const builtinConfigResult = await storage.get<Record<string, Partial<MCPServer>>>(StorageKey.BUILTIN_MCP_CONFIG)
      const builtinConfig = builtinConfigResult?.data || {}

      // 合并内置服务器和用户服务器
      const now = Date.now()
      const builtinServers: MCPServer[] = BUILTIN_MCP_SERVERS.map(s => ({
        ...s,
        createdAt: now,
        updatedAt: now,
        // 应用用户自定义的配置覆盖
        ...(builtinConfig[s.id] || {}),
        // 确保关键属性不被覆盖
        id: s.id,
        name: s.name,
        builtin: true,
        // 恢复之前保存的工具列表
        tools: builtinTools[s.id] || builtinConfig[s.id]?.tools || []
      }))

      // 过滤掉用户服务器中可能存在的旧版本内置服务器（通过名称匹配）
      const filteredUserServers = userServers.filter(
        s => !s.builtin && !BUILTIN_MCP_SERVERS.some(bs => bs.name === s.name)
      )

      // 合并服务器列表（内置服务器在前）
      serverList.value = {
        servers: [...builtinServers, ...filteredUserServers],
        activeServerIds: [...userActiveIds]
      }
    } catch (e: any) {
      error.value = e?.message || '加载 MCP 服务器失败'
      console.error('Failed to load MCP servers:', e)
    } finally {
      loading.value = false
    }
  }

  // 保存 MCP 服务器列表（只保存用户服务器，不保存内置服务器）
  async function saveServers() {
    loading.value = true
    error.value = null
    try {
      // 过滤出非内置服务器
      const userServers = serverList.value.servers.filter(s => !s.builtin)
      const dataToSave: MCPServerList = {
        servers: userServers,
        activeServerIds: serverList.value.activeServerIds
      }
      const success = await storage.saveMCPServerList(dataToSave)
      if (!success) {
        throw new Error('保存失败')
      }
    } catch (e: any) {
      error.value = e?.message || '保存 MCP 服务器失败'
      console.error('Failed to save MCP servers:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 添加服务器
  async function addServer(server: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>) {
    const newServer: MCPServer = {
      ...server,
      id: Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    serverList.value.servers.push(newServer)
    await saveServers()
    return newServer
  }

  // 更新服务器（允许更新内置服务器的配置，但不允许改变 builtin 属性）
  async function updateServer(id: string, updates: Partial<Omit<MCPServer, 'id' | 'createdAt'>>) {
    const server = serverList.value.servers.find(s => s.id === id)
    if (!server) {
      throw new Error('服务器不存在')
    }
    const index = serverList.value.servers.findIndex(s => s.id === id)
    const { id: _, createdAt: __, ...safeUpdates } = updates as any

    // 对于内置服务器，不允许修改 builtin 和 name 属性
    if (server.builtin) {
      delete safeUpdates.builtin
      delete safeUpdates.name
    }

    serverList.value.servers[index] = {
      ...serverList.value.servers[index],
      ...safeUpdates,
      updatedAt: Date.now()
    }

    // 内置服务器保存到单独的存储
    if (server.builtin) {
      // 保存内置服务器的配置到单独的存储键
      const builtinConfigResult = await storage.get<Record<string, Partial<MCPServer>>>(StorageKey.BUILTIN_MCP_CONFIG)
      const builtinConfig = builtinConfigResult?.data || {}
      builtinConfig[id] = {
        command: safeUpdates.command,
        args: safeUpdates.args,
        env: safeUpdates.env,
        url: safeUpdates.url,
        description: safeUpdates.description,
        tools: safeUpdates.tools
      }
      await storage.set(StorageKey.BUILTIN_MCP_CONFIG, builtinConfig)
    } else {
      await saveServers()
    }
  }

  // 删除服务器（不允许删除内置服务器）
  async function deleteServer(id: string) {
    const server = serverList.value.servers.find(s => s.id === id)
    if (!server) {
      throw new Error('服务器不存在')
    }
    if (server.builtin) {
      throw new Error('内置服务器不能被删除')
    }
    const index = serverList.value.servers.findIndex(s => s.id === id)
    serverList.value.servers.splice(index, 1)
    // 从激活列表中移除
    serverList.value.activeServerIds = serverList.value.activeServerIds.filter(sid => sid !== id)
    await saveServers()
  }

  // 切换服务器激活状态
  async function toggleServerActive(id: string) {
    const index = serverList.value.activeServerIds.indexOf(id)
    if (index === -1) {
      serverList.value.activeServerIds.push(id)
    } else {
      serverList.value.activeServerIds.splice(index, 1)
    }
    await saveServers()
  }

  // 切换服务器启用状态
  async function toggleServerEnabled(id: string) {
    const server = serverList.value.servers.find(s => s.id === id)
    if (server) {
      server.enabled = !server.enabled
      // 如果禁用服务器，同时从激活列表中移除
      if (!server.enabled) {
        serverList.value.activeServerIds = serverList.value.activeServerIds.filter(sid => sid !== id)
      }
      await saveServers()
    }
  }

  // 获取激活的服务器
  const activeServers = computed(() => {
    return serverList.value.servers.filter(s =>
      serverList.value.activeServerIds.includes(s.id) && s.enabled
    )
  })

  /**
   * 生成 OpenAI 格式的 tools 数组
   * 用于在 LLM 请求中传递可用的工具
   */
  function generateOpenAITools(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = []

    //console.log('[MCP] Active servers:', activeServers.value)
    //console.log('[MCP] Active servers tools:', activeServers.value.map(s => ({ name: s.name, tools: s.tools })))

    for (const server of activeServers.value) {
      if (server.tools && server.tools.length > 0) {
        //console.log(`[MCP] Server ${server.name} has ${server.tools.length} tools`)
        tools.push(...server.tools)
      } else {
        //console.log(`[MCP] Server ${server.name} has no tools configured`)
      }
    }

    // 添加内置文件操作工具（如果选择了文件夹）
    if (selectedFolder.value) {
      tools.push(...getBuiltinFileTools(selectedFolder.value))
    }

    //console.log('[MCP] Total tools to send:', tools.length)
    return tools
  }

  /**
   * 获取内置文件操作工具列表
   */
  function getBuiltinFileTools(workDir: string): MCPToolDefinition[] {
    // 工作目录说明，添加到每个工具描述中
    const workDirContext = `当前工作目录: ${workDir}。所有文件操作都在此目录范围内进行。`
    return [
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: `${workDirContext} 列出指定目录中的文件和子目录。在执行其他文件操作前，建议先使用此工具了解目录结构。可以递归查看子目录内容。`,
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '要列出的目录路径（相对于工作目录）。示例："." 查看当前目录，"src" 查看 src 子目录，"docs/api" 查看嵌套子目录。'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_directory',
          description: '在指定路径创建新文件夹。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '父目录路径（相对于工作目录），默认为当前目录"."'
              },
              name: {
                type: 'string',
                description: '要创建的文件夹名称'
              }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'move_file',
          description: '移动文件或文件夹到新位置。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '源文件或文件夹路径（相对于工作目录）'
              },
              newPath: {
                type: 'string',
                description: '目标路径（相对于工作目录）'
              }
            },
            required: ['path', 'newPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'copy_file',
          description: '复制文件或文件夹到新位置。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '源文件或文件夹路径（相对于工作目录）'
              },
              newPath: {
                type: 'string',
                description: '目标路径（相对于工作目录）'
              }
            },
            required: ['path', 'newPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'rename_item',
          description: '重命名文件或文件夹（保持在同一目录下）。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '要重命名的文件或文件夹路径（相对于工作目录）'
              },
              name: {
                type: 'string',
                description: '新名称'
              }
            },
            required: ['path', 'name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'glob',
          description: `${workDirContext} 快速进行文件模式匹配（支持 glob 通配符）。用于查找特定文件或列出目录内容。例如：pattern="*.html" 查找所有 HTML 文件。`,
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '匹配文件的模式（如 *.js, **/*.html, src/**/*.ts）'
              },
              path: {
                type: 'string',
                description: '搜索的根目录路径（相对于工作目录），默认为当前目录"."。例如："src", "docs", "."'
              }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'grep',
          description: `${workDirContext} 在文件内容中搜索指定正则表达式。使用前建议先用 list_directory 查看目录结构。如果不知道目标文件位置，可以搜索整个工作目录（path="."）并使用 include 参数限制文件类型。`,
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '要搜索的正则表达式'
              },
              path: {
                type: 'string',
                description: '搜索的目录路径（相对于工作目录）。例如："src", ".", "docs"。如果不指定则搜索整个工作目录。'
              },
              include: {
                type: 'string',
                description: '包含的文件类型模式（如 .js, .{ts,tsx}），用于过滤要搜索的文件类型'
              }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '从本地文件系统读取文件内容。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '要读取的文件路径'
              },
              limit: {
                type: 'number',
                description: '限制读取的行数（默认为 2000）'
              },
              offset: {
                type: 'number',
                description: '从第几行开始读取（从 1 开始）'
              }
            },
            required: ['file_path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: '将内容写入本地文件系统。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '目标文件路径'
              },
              content: {
                type: 'string',
                description: '要写入的文本内容'
              }
            },
            required: ['file_path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: '在文件中执行精确的字符串替换。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '要修改的文件路径'
              },
              old_string: {
                type: 'string',
                description: '要被替换的原始文本'
              },
              new_string: {
                type: 'string',
                description: '替换后的新文本'
              },
              replace_all: {
                type: 'boolean',
                description: '是否替换所有匹配项（默认为 false）'
              }
            },
            required: ['file_path', 'old_string', 'new_string']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: `${workDirContext} 执行系统命令。可以执行任意命令，但风险命令（如删除、格式化、sudo等）需要用户确认后才会执行。`,
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令（如 "ls -la", "npm install", "rm file.txt"）。风险命令会弹出确认对话框。'
              },
              timeout: {
                type: 'number',
                description: '命令超时时间（毫秒），默认 30000'
              }
            },
            required: ['command']
          }
        }
      }
      // 为了安全，删除展示不启用
      // {
      //   type: 'function',
      //   function: {
      //     name: 'delete_item',
      //     description: '删除文件或文件夹。注意：删除文件夹将递归删除其所有内容。',
      //     parameters: {
      //       type: 'object',
      //       properties: {
      //         path: {
      //           type: 'string',
      //           description: '要删除的文件或文件夹路径（相对于工作目录）'
      //         }
      //       },
      //       required: ['path']
      //     }
      //   }
      // }
    ]
  }

  /**
   * 检查工具是否为内置文件操作工具
   */
  function isBuiltinFileTool(toolName: string): boolean {
    const builtinTools = [
      'list_directory',
      'create_directory',
      'move_file',
      'copy_file',
      'rename_item',
      'glob',
      'grep',
      'read_file',
      'write_file',
      'edit_file',
      'delete_item',
      'execute_command'
    ]
    return builtinTools.includes(toolName)
  }

  /**
   * 解析 LLM 响应中的 tool_calls
   */
  function parseToolCalls(assistantMessage: any): OpenAIToolCall[] {
    // OpenAI 格式: choices[0].message.tool_calls
    const openaiToolCalls = assistantMessage?.tool_calls
    if (openaiToolCalls && Array.isArray(openaiToolCalls)) {
      return openaiToolCalls
    }

    // 某些兼容 API 可能使用其他格式
    // 这里可以根据需要扩展

    return []
  }

  /**
   * 生成工具结果消息（role: "tool"）
   */
  function createToolResultMessage(toolCall: OpenAIToolCall, result: string, isError = false): MCPChatMessage {
    return {
      role: 'tool',
      content: isError ? `Error: ${result}` : result,
      tool_call_id: toolCall.id
    }
  }

  /**
   * 执行 MCP 工具调用
   * @param toolCall 工具调用对象
   * @returns 工具执行结果
   */
  async function executeToolCall(toolCall: OpenAIToolCall): Promise<MCPToolResult> {
    try {
      // 首先检查是否是内置文件操作工具
      if (isBuiltinFileTool(toolCall.function.name)) {
        // 解析参数（使用安全解析函数）
        const parseResult = safeParseToolArguments(toolCall.function.arguments)
        if (!parseResult.success) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: parseResult.error || '工具参数解析失败'
          }
        }
        const args = parseResult.args

        // 如果是 execute_command，检查是否为风险命令并需要确认
        if (toolCall.function.name === 'execute_command' && args.command) {
          const riskCheck = checkRiskyCommand(args.command)
          if (riskCheck.isRisky) {
            console.log('[execute_command] Risky command detected:', args.command, riskCheck.reason)
            // 如果有确认回调，调用它
            if (commandConfirmCallback) {
              const confirmed = await commandConfirmCallback(args.command, riskCheck.reason || '风险命令')
              if (!confirmed) {
                return {
                  toolCallId: toolCall.id,
                  content: '',
                  error: `用户取消了命令执行: ${args.command}`
                }
              }
            }
          }
        }

        // 添加工作目录路径
        args.basePath = selectedFolder.value

        // console.log('[Builtin File Tool] Executing:', JSON.stringify({
        //   tool: toolCall.function.name,
        //   arguments: args
        // }))

        // 调用 Electron 主进程的文件操作
        if (!isElectronEnv) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: '文件操作需要在 Electron 环境中运行'
          }
        }

        if (!window.electronAPI?.fileOperation) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: 'Electron API 不可用'
          }
        }

        const result = await window.electronAPI.fileOperation(
          toolCall.function.name,
          args
        )

        if (result.error) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: result.error
          }
        }

        return {
          toolCallId: toolCall.id,
          content: result.content || ''
        }
      }

      // 查找工具所属的服务器
      let targetServer: MCPServer | null = null
      for (const server of activeServers.value) {
        if (server.tools && server.tools.some(t => t.function.name === toolCall.function.name)) {
          targetServer = server
          break
        }
      }

      if (!targetServer) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: `未找到工具 "${toolCall.function.name}" 对应的服务器`
        }
      }

      // 解析参数（使用安全解析函数）
      const parseResult = safeParseToolArguments(toolCall.function.arguments)
      if (!parseResult.success) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: parseResult.error || '工具参数解析失败'
        }
      }
      const args = parseResult.args

      // 通过 Electron 主进程执行工具调用
      console.log('[MCP] Executing tool:', {
        server: targetServer.name,
        tool: toolCall.function.name,
        arguments: args
      })

      // 调用 Electron 主进程的 MCP 工具执行
      if (!isElectronEnv) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: 'MCP 工具调用需要在 Electron 环境中运行'
        }
      }

      if (!window.electronAPI?.mcpCallTool) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: 'Electron API 不可用，请确保在 Electron 应用中运行'
        }
      }

      // 使用 toRaw 确保传递的是纯对象，而不是 Vue 响应式代理
      const rawServer = toRaw(targetServer)
      const result = await window.electronAPI.mcpCallTool(
        {
          id: rawServer.id,
          name: rawServer.name,
          transportType: rawServer.transportType,
          simpleCommand: rawServer.simpleCommand,
          command: rawServer.command,
          args: rawServer.args,
          env: rawServer.env,
          url: rawServer.url
        },
        toolCall.function.name,
        args
      )

      if (result.isError || !result.success) {
        return {
          toolCallId: toolCall.id,
          content: result.content,
          error: result.error || '工具调用失败'
        }
      }

      return {
        toolCallId: toolCall.id,
        content: result.content
      }

    } catch (e: any) {
      console.log(e)
      return {
        toolCallId: toolCall.id,
        content: '',
        error: e?.message || '工具调用失败'
      }
    }
  }

  /**
   * 批量执行工具调用
   * @param toolCalls 工具调用数组
   * @returns 所有工具的执行结果消息
   */
  async function executeToolCalls(toolCalls: OpenAIToolCall[]): Promise<MCPChatMessage[]> {
    const results: MCPChatMessage[] = []

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall)
      if (result.error) {
        results.push(createToolResultMessage(toolCall, result.error, true))
      } else {
        results.push(createToolResultMessage(toolCall, result.content))
      }
    }

    return results
  }

  /**
   * 从 MCP 服务器获取工具列表
   * @param server 服务器配置
   * @returns 工具列表
   */
  async function fetchServerTools(server: MCPServer): Promise<MCPToolDefinition[]> {
    if (!isElectronEnv || !window.electronAPI?.mcpListTools) {
      throw new Error('Electron 环境不可用')
    }

    try {
      // 使用 toRaw 移除响应式代理，避免序列化错误
      // 只传递必要的配置字段，不包含 tools 等可能包含不可序列化数据的字段
      const rawServer = toRaw(server)
      const serverConfig = {
        id: rawServer.id,
        name: rawServer.name,
        transportType: rawServer.transportType,
        simpleCommand: rawServer.simpleCommand,
        command: rawServer.command,
        args: rawServer.args ? [...rawServer.args] : [],
        env: rawServer.env ? { ...rawServer.env } : {},
        url: rawServer.url
      }
      const result = await window.electronAPI.mcpListTools(serverConfig)

      if (!result.success) {
        throw new Error(result.error || '获取工具列表失败')
      }

      // 转换为 OpenAI Function Calling 格式
      const tools: MCPToolDefinition[] = result.tools.map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }))

      return tools
    } catch (e: any) {
      throw new Error(`获取工具列表失败: ${e?.message || e}`)
    }
  }

  /**
   * 从服务器刷新工具并更新配置
   * @param serverId 服务器 ID
   */
  async function refreshServerTools(serverId: string) {
    const server = serverList.value.servers.find(s => s.id === serverId)
    if (!server) {
      throw new Error('服务器不存在')
    }

    loading.value = true
    error.value = null

    try {
      const tools = await fetchServerTools(server)
      // 直接更新服务器列表中的工具（不调用 updateServer，因为内置服务器不允许通过 updateServer 修改）
      const index = serverList.value.servers.findIndex(s => s.id === serverId)
      const targetServer = index !== -1 ? serverList.value.servers[index] : null
      if (targetServer) {
        targetServer.tools = tools
        targetServer.updatedAt = Date.now()
      }

      // 保存工具列表到存储
      if (server.builtin) {
        // 内置服务器：保存到单独的存储键
        const builtinToolsResult = await storage.get<Record<string, MCPToolDefinition[]>>(StorageKey.BUILTIN_MCP_TOOLS)
        const builtinTools = builtinToolsResult?.data || {}
        builtinTools[serverId] = tools
        await storage.set(StorageKey.BUILTIN_MCP_TOOLS, builtinTools)
      } else {
        // 用户服务器：保存到主存储
        await saveServers()
      }
      return tools
    } catch (e: any) {
      error.value = e?.message || '刷新工具列表失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * 检查是否有激活的 MCP 工具
   */
  const hasActiveTools = computed(() => {
    return generateOpenAITools().length > 0
  })

  return {
    serverList,
    loading,
    error,
    activeServers,
    hasActiveTools,
    selectedFolder,
    loadServers,
    saveServers,
    addServer,
    updateServer,
    deleteServer,
    toggleServerActive,
    toggleServerEnabled,
    // 工具获取相关
    fetchServerTools,
    refreshServerTools,
    // Function Calling 相关
    generateOpenAITools,
    parseToolCalls,
    executeToolCall,
    executeToolCalls,
    createToolResultMessage,
    // 文件工具相关
    setSelectedFolder: (folder: string) => {
      selectedFolder.value = folder
    },
    getSelectedFolder: () => selectedFolder.value,
    isBuiltinFileTool,
    // 命令确认相关
    setCommandConfirmCallback,
    checkRiskyCommand
  }
}
