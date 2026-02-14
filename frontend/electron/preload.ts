import { contextBridge, ipcRenderer } from 'electron'

export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
}

export interface GlobalMemoryEntry {
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

export interface GlobalMemory {
  entries: GlobalMemoryEntry[]
  version: number
  lastUpdated: number
}

// MCP 服务器配置
export interface MCPServerConfig {
  id: string
  name: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),
  chatRequest: (params: { apiUrl: string; apiKey: string; model: string; messages: any[] }) =>
    ipcRenderer.invoke('chat-request', params),
  getGlobalMemory: () => ipcRenderer.invoke('get-global-memory'),
  saveGlobalMemory: (memory: GlobalMemory) => ipcRenderer.invoke('save-global-memory', memory),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  // MCP 工具调用
  mcpCallTool: (serverConfig: MCPServerConfig, toolName: string, args: Record<string, any>) =>
    ipcRenderer.invoke('mcp-call-tool', serverConfig, toolName, args),
  // MCP 列出工具
  mcpListTools: (serverConfig: MCPServerConfig) =>
    ipcRenderer.invoke('mcp-list-tools', serverConfig),
  // MCP 清理
  mcpCleanup: () =>
    ipcRenderer.invoke('mcp-cleanup'),
  // 选择文件夹
  selectFolder: () =>
    ipcRenderer.invoke('select-folder'),
  // 读取目录内容
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('read-directory', dirPath),
  // 文件操作工具
  fileOperation: (operation: string, args: Record<string, any>) =>
    ipcRenderer.invoke('file-operation', operation, args),
  // 环境检查
  checkEnvironment: () =>
    ipcRenderer.invoke('check-environment')
})
