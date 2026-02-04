import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(__filename)

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
      nodeIntegration: true,
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
    console.log("GLOBAL_MEMORY_PATH:", GLOBAL_MEMORY_PATH)
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
