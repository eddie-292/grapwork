export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
  extra_body?: string
}

export interface Assistant {
  id: string
  name: string
  emoji: string
  systemPrompt: string
  createdAt: number
}

export interface AssistantList {
  assistants: Assistant[]
  activeIndex: number
}

export interface ConfigList {
  configs: AppConfig[]
  activeIndex: number
}

// 全局记忆类型
export type GlobalMemoryType = 'preferences' | 'settings' | 'general_info' | 'custom'

export interface GlobalMemoryEntry {
  id: string
  type: GlobalMemoryType
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
  simpleCommand?: boolean  // 是否为简单命令（非 MCP 服务器）
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

// MCP 工具调用结果
export interface MCPToolCallResult {
  success: boolean
  content: string
  error?: string
  isError?: boolean
}

// MCP 工具列表结果
export interface MCPToolsListResult {
  success: boolean
  tools: any[]
  error?: string
}

interface ElectronAPI {
  getConfig: () => Promise<ConfigList>
  saveConfig: (config: ConfigList) => Promise<boolean>
  chatRequest: (params: {
    apiUrl: string
    apiKey: string
    model: string
    messages: any[]
    extra_body?: string
  }) => Promise<{ success: boolean; error?: string; status?: number; headers?: Record<string, string> }>
  getGlobalMemory: () => Promise<GlobalMemory>
  saveGlobalMemory: (memory: GlobalMemory) => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  // MCP 工具调用
  mcpCallTool: (
    serverConfig: MCPServerConfig,
    toolName: string,
    args: Record<string, any>
  ) => Promise<MCPToolCallResult>
  // MCP 列出工具
  mcpListTools: (serverConfig: MCPServerConfig) => Promise<MCPToolsListResult>
  // MCP 清理
  mcpCleanup: () => Promise<{ success: boolean }>
  // 选择文件夹
  selectFolder: () => Promise<{ success: boolean; path: string }>
  // 读取目录内容
  readDirectory: (dirPath: string) => Promise<{
    success: boolean
    items: Array<{ name: string; type: 'file' | 'directory' }>
    path?: string
    error?: string
  }>
  // 文件操作工具
  fileOperation: (operation: string, args: Record<string, any>) => Promise<{
    success: boolean
    content?: string
    error?: string
  }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
