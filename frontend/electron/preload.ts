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
  // 在系统文件管理器中打开路径
  openPath: (path: string) => ipcRenderer.invoke('open-path', path),
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
  // 文件预览（不依赖工作目录）
  previewFile: (filePath: string, limit?: number) =>
    ipcRenderer.invoke('preview-file', filePath, limit),
  // 读取文件为 Buffer（用于图片、PDF 等二进制文件预览）
  readFileAsBuffer: (filePath: string) =>
    ipcRenderer.invoke('read-file-as-buffer', filePath),
  // 文件操作工具
  fileOperation: (operation: string, args: Record<string, any>) =>
    ipcRenderer.invoke('file-operation', operation, args),
  // 环境检查
  checkEnvironment: () =>
    ipcRenderer.invoke('check-environment'),
  // 读取更新日志
  getChangelog: () =>
    ipcRenderer.invoke('get-changelog'),
  // Skills 技能系统
  skillsScan: () =>
    ipcRenderer.invoke('skills-scan'),
  skillsLoad: (skillId: string) =>
    ipcRenderer.invoke('skills-load', skillId),
  skillsCreate: (name: string, description: string) =>
    ipcRenderer.invoke('skills-create', name, description),
  skillsUpdate: (skillId: string, body: string) =>
    ipcRenderer.invoke('skills-update', skillId, body),
  skillsDelete: (skillId: string) =>
    ipcRenderer.invoke('skills-delete', skillId),
  // 窗口控制
  windowMinimize: () =>
    ipcRenderer.invoke('window-minimize'),
  windowMaximize: () =>
    ipcRenderer.invoke('window-maximize'),
  windowClose: () =>
    ipcRenderer.invoke('window-close'),
  windowIsMaximized: () =>
    ipcRenderer.invoke('window-is-maximized')
})
