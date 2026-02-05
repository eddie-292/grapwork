import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'

const __dirname = path.dirname(__filename)

// ============================================================================
// MCP Client Implementation
// ============================================================================

// MCP 相关类型定义
interface MCPServerConfig {
  id: string
  name: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
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

// MCP 客户端类 - 用于与 MCP 服务器通信
class MCPClient {
  private process: ChildProcess | null = null
  private messageId = 0
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void
    reject: (error: Error) => void
  }>()
  private initialized = false

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
        const args = this.config.args || []
        const env = { ...process.env, ...this.config.env }

        console.log('[MCP] Starting process:', {
          command: this.config.command,
          args,
          env: Object.keys(env)
        })

        this.process = spawn(this.config.command, args, {
          env,
          stdio: ['pipe', 'pipe', 'inherit']
        })

        if (!this.process.stdin || !this.process.stdout) {
          throw new Error('Failed to create stdio pipes')
        }

        // 处理 stdout（接收响应）
        this.process.stdout.on('data', (data: Buffer) => {
          this.handleMessage(data.toString())
        })

        // 处理错误
        this.process.on('error', (error) => {
          console.error('[MCP] Process error:', error)
          this.rejectAllPending(error)
        })

        this.process.on('exit', (code, signal) => {
          console.log(`[MCP] Process exited: code=${code}, signal=${signal}`)
          this.rejectAllPending(new Error(`Process exited: ${signal || code}`))
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
    const lines = data.split('\n').filter((line: string) => line.trim())

    for (const line of lines) {
      try {
        const message: MCPMessage = JSON.parse(line)

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
        }
      } catch (error) {
        console.error('[MCP] Failed to parse message:', error, line)
      }
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

  // 获取或创建客户端
  async getClient(config: MCPServerConfig): Promise<MCPClient> {
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
  }

  // 清理所有客户端
  cleanup(): void {
    for (const client of this.clients.values()) {
      client.stop()
    }
    this.clients.clear()
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

// ============================================================================
// MCP IPC Handlers
// ============================================================================

// MCP 工具调用
ipcMain.handle('mcp-call-tool', async (_event, serverConfig: MCPServerConfig, toolName: string, args: Record<string, any>) => {
  try {
    console.log('[MCP IPC] Calling tool:', { server: serverConfig.name, tool: toolName, args })

    const client = await mcpManager.getClient(serverConfig)
    const result = await client.callTool(toolName, args)

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
