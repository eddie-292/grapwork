export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
  extra_body?: string
  enable_thinking?: boolean  // 启用思考模式（非标准参数，通过 extra_body 传入）
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

// 环境检查结果
export interface EnvironmentCheckResult {
  name: string
  displayName: string
  status: 'success' | 'warning' | 'error'
  message: string
  details?: string
  fixSuggestion?: string // 修复建议
  // 自动安装相关
  canAutoInstall?: boolean // 是否支持自动安装
  installMethod?: 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'yum' | 'dnf' | 'script' // 安装方式
  installCommand?: string // 安装命令（用于显示）
  downloadUrl?: string // 下载链接（不支持自动安装时）
}

// 环境安装进度
export interface EnvironmentInstallProgress {
  name: string // 环境项名称
  status: 'pending' | 'installing' | 'success' | 'error'
  message: string
  progress?: number // 0-100
}

// 环境安装结果
export interface EnvironmentInstallResult {
  success: boolean
  name: string
  message: string
  error?: string
  requiresRestart?: boolean // 是否需要重启应用或终端
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

// MCP 依赖配置
export interface MCPDependencyConfig {
  type: 'python' | 'node' | 'uvx'
  packages: string[]
  requirementsFile?: string
}

// MCP 安装依赖结果
export interface MCPInstallDependenciesResult {
  success: boolean
  output?: string
  method?: 'uv' | 'pip' | 'npm'
  error?: string
}

// MCP 检查依赖结果
export interface MCPCheckDependenciesResult {
  success: boolean
  installed: boolean
  missingPackages: string[]
  error?: string
}

// Skills 技能系统类型
import type { SkillMetadata, Skill, SkillScanResult, SkillLoadResult } from './skill'

// 生图模式类型
export interface ImageGeneratorRequestParams {
  apiUrl: string
  apiKey: string
  model: string
  prompt: string
  size: string
}

export interface ImageGeneratorResponse {
  success: boolean
  error?: string
  images?: string[]
  created?: number
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
  // 在系统文件管理器中打开路径
  openPath: (path: string) => Promise<void>
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
  // MCP 安装依赖
  mcpInstallDependencies: (
    dependency: MCPDependencyConfig,
    serverPath?: string
  ) => Promise<MCPInstallDependenciesResult>
  // MCP 检查依赖
  mcpCheckDependencies: (
    dependency: MCPDependencyConfig
  ) => Promise<MCPCheckDependenciesResult>
  // 选择文件夹
  selectFolder: () => Promise<{ success: boolean; path: string }>
  // 读取目录内容
  readDirectory: (dirPath: string) => Promise<{
    success: boolean
    items: Array<{ name: string; type: 'file' | 'directory' }>
    path?: string
    error?: string
  }>
  // 文件预览（不依赖工作目录）
  previewFile: (filePath: string, limit?: number) => Promise<{
    success: boolean
    content?: string
    totalLines?: number
    linesShown?: number
    error?: string
  }>
  // 读取文件为 Buffer（用于图片、PDF 等二进制文件预览）
  readFileAsBuffer: (filePath: string) => Promise<{
    success: boolean
    buffer?: ArrayBuffer
    error?: string
  }>
  // 文件操作工具
  fileOperation: (operation: string, args: Record<string, any>) => Promise<{
    success: boolean
    content?: string
    error?: string
  }>
  // 环境检查
  checkEnvironment: () => Promise<EnvironmentCheckResult[]>
  // 环境安装
  installEnvironment: (
    items: string[],
    onProgress?: (progress: EnvironmentInstallProgress) => void
  ) => Promise<EnvironmentInstallResult[]>
  // 检测可用的包管理器
  detectPackageManager: () => Promise<{
    available: string[]
    recommended: string | null
    platform: string
  }>
  // 读取更新日志
  getChangelog: () => Promise<{
    success: boolean
    content: string
    error?: string
  }>
  // Skills 技能系统
  skillsScan: () => Promise<SkillScanResult>
  skillsLoad: (skillId: string) => Promise<SkillLoadResult>
  skillsCreate: (name: string, description: string) => Promise<SkillLoadResult>
  skillsUpdate: (skillId: string, body: string) => Promise<{ success: boolean; error?: string }>
  skillsDelete: (skillId: string) => Promise<{ success: boolean; error?: string }>
  // Agent Teams 多智能体协作系统
  teamInitWorkspace: (teamId: string, sessionId: string) => Promise<{ success: boolean; workspacePath?: string; error?: string }>
  teamWriteTask: (workspacePath: string, task: any) => Promise<{ success: boolean; error?: string }>
  teamReadTask: (workspacePath: string, taskId: string, status: string) => Promise<{ success: boolean; task?: any; error?: string }>
  teamMoveTask: (workspacePath: string, taskId: string, fromStatus: string, toStatus: string) => Promise<{ success: boolean; error?: string }>
  teamWriteMessage: (workspacePath: string, agentId: string, message: any) => Promise<{ success: boolean; error?: string }>
  teamReadMessages: (workspacePath: string, agentId: string) => Promise<{ success: boolean; messages?: any[]; error?: string }>
  teamWriteState: (workspacePath: string, state: any) => Promise<{ success: boolean; error?: string }>
  teamReadState: (workspacePath: string) => Promise<{ success: boolean; state?: any; error?: string }>
  teamWriteResult: (workspacePath: string, taskId: string, result: string) => Promise<{ success: boolean; resultPath?: string; error?: string }>
  teamCancelTask: (taskId: string) => Promise<{ success: boolean; error?: string }>
  teamCancelAll: () => Promise<{ success: boolean; error?: string }>
  teamCleanupWorkspace: (teamId: string) => Promise<{ success: boolean; error?: string }>
  teamGetWorkspacePath: (teamId: string) => Promise<{ success: boolean; workspacePath?: string; error?: string }>
  // 动态 Worker 管理
  teamGetActiveWorkers: () => Promise<{ success: boolean; workerIds?: string[]; count?: number; error?: string }>
  teamIsWorkerActive: (workerId: string) => Promise<{ success: boolean; isActive?: boolean; error?: string }>
  teamCleanupWorkers: () => Promise<{ success: boolean; error?: string }>
  // 窗口控制
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<boolean> // 返回当前是否最大化
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  // 生图模式窗口
  openImageGeneratorWindow: () => Promise<void>
  imageGeneratorRequest: (params: ImageGeneratorRequestParams) => Promise<ImageGeneratorResponse>
  // 通用图片 API 请求（支持自定义 headers 和方法）
  imageApiRequest: (params: {
    url: string
    method: 'GET' | 'POST'
    headers?: Record<string, string>
    body?: string
  }) => Promise<{ success: boolean; status: number; data?: string; error?: string }>
  imageGeneratorMinimize: () => Promise<void>
  imageGeneratorMaximize: () => Promise<boolean>
  imageGeneratorClose: () => Promise<void>
  imageGeneratorIsMaximized: () => Promise<boolean>
  // 图片下载
  downloadImage: (url: string) => Promise<{ success: boolean; error?: string; cancelled?: boolean }>
  onDownloadComplete: (callback: (savePath: string) => void) => void
  // 自动下载图片到产出物目录
  autoDownloadImage: (url: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>
  // 打开产出物目录
  openOutputsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>
  // 获取产出物目录路径
  getOutputsPath: () => Promise<string>
  // 删除产出物文件
  deleteOutputFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  // 迁移产出物到新目录
  migrateOutputs: (targetPath: string, moveFiles: boolean) => Promise<{ success: boolean; migratedCount?: number; error?: string }>
  // 扫描产出物目录
  scanOutputsFolder: () => Promise<{ success: boolean; files?: Array<{ filename: string; path: string; createdAt: number }>; error?: string }>
  // 选择图片文件（用于图片编辑模式）
  selectImageFile: () => Promise<{ success: boolean; data?: string; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
