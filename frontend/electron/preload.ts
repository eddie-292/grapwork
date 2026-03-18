import { contextBridge, ipcRenderer } from 'electron'

export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
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

// MCP 依赖配置
export interface MCPDependencyConfig {
  type: 'python' | 'node'
  packages: string[]
  requirementsFile?: string
}

// 环境安装进度
export interface EnvironmentInstallProgress {
  name: string
  status: 'pending' | 'installing' | 'success' | 'error'
  message: string
  progress?: number
}

// 环境安装结果
export interface EnvironmentInstallResult {
  success: boolean
  name: string
  message: string
  error?: string
  requiresRestart?: boolean
}

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),
  chatRequest: (params: { apiUrl: string; apiKey: string; model: string; messages: any[] }) =>
    ipcRenderer.invoke('chat-request', params),
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
  // MCP 安装依赖
  mcpInstallDependencies: (dependency: MCPDependencyConfig, serverPath?: string) =>
    ipcRenderer.invoke('mcp-install-dependencies', dependency, serverPath),
  // MCP 检查依赖
  mcpCheckDependencies: (dependency: MCPDependencyConfig) =>
    ipcRenderer.invoke('mcp-check-dependencies', dependency),
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
  // 环境安装
  installEnvironment: (
    items: string[],
    onProgress?: (progress: EnvironmentInstallProgress) => void
  ) => {
    // 监听进度事件
    const progressHandler = (_event: any, progress: EnvironmentInstallProgress) => {
      if (onProgress) {
        onProgress(progress)
      }
    }
    ipcRenderer.on('install-environment-progress', progressHandler)

    // 调用安装命令
    return ipcRenderer.invoke('install-environment', items).finally(() => {
      // 安装完成后移除监听器
      ipcRenderer.removeListener('install-environment-progress', progressHandler)
    })
  },
  // 检测可用的包管理器
  detectPackageManager: () =>
    ipcRenderer.invoke('detect-package-manager'),
  // 读取更新日志
  getChangelog: () =>
    ipcRenderer.invoke('get-changelog'),
  // 获取 memory.md 文件路径
  getMemoryMdPath: () =>
    ipcRenderer.invoke('get-memory-md-path'),
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
    ipcRenderer.invoke('window-is-maximized'),
  // 生图模式窗口
  openImageGeneratorWindow: () =>
    ipcRenderer.invoke('open-image-generator-window'),
  imageGeneratorRequest: (params: { apiUrl: string; apiKey: string; model: string; prompt: string; size: string }) =>
    ipcRenderer.invoke('image-generator-request', params),
  // 通用图片 API 请求（支持自定义 headers 和方法）
  imageApiRequest: (params: { url: string; method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('image-api-request', params),
  imageGeneratorMinimize: () =>
    ipcRenderer.invoke('image-generator-minimize'),
  imageGeneratorMaximize: () =>
    ipcRenderer.invoke('image-generator-maximize'),
  imageGeneratorClose: () =>
    ipcRenderer.invoke('image-generator-close'),
  imageGeneratorIsMaximized: () =>
    ipcRenderer.invoke('image-generator-is-maximized'),
  // 下载图片
  downloadImage: (url: string) =>
    ipcRenderer.invoke('download-image', url),
  // 下载完成通知
  onDownloadComplete: (callback: (savePath: string) => void) => {
    ipcRenderer.on('download-complete', (_event, savePath) => callback(savePath))
  },
  // 自动下载图片到产出物目录
  autoDownloadImage: (url: string, filename: string) =>
    ipcRenderer.invoke('auto-download-image', url, filename),
  // 打开产出物目录
  openOutputsFolder: () =>
    ipcRenderer.invoke('open-outputs-folder'),
  // 获取产出物目录路径
  getOutputsPath: () =>
    ipcRenderer.invoke('get-outputs-path'),
  // 删除产出物文件
  deleteOutputFile: (filePath: string) =>
    ipcRenderer.invoke('delete-output-file', filePath),
  // 迁移产出物到新目录
  migrateOutputs: (targetPath: string, moveFiles: boolean) =>
    ipcRenderer.invoke('migrate-outputs', targetPath, moveFiles),
  // 扫描产出物目录
  scanOutputsFolder: () =>
    ipcRenderer.invoke('scan-outputs-folder'),
  // 选择图片文件（用于图片编辑模式）
  selectImageFile: () =>
    ipcRenderer.invoke('select-image-file'),
  // 将本地文件转换为 base64 data URL（用于图片编辑模式）
  localFileToBase64: (filePath: string) =>
    ipcRenderer.invoke('local-file-to-base64', filePath),

  // Loop 定时任务系统
  loopListTasks: () =>
    ipcRenderer.invoke('loop-list-tasks'),
  loopGetTask: (taskId: string) =>
    ipcRenderer.invoke('loop-get-task', taskId),
  loopCreateTask: (params: any) =>
    ipcRenderer.invoke('loop-create-task', params),
  loopUpdateTask: (taskId: string, params: any) =>
    ipcRenderer.invoke('loop-update-task', taskId, params),
  loopDeleteTask: (taskId: string) =>
    ipcRenderer.invoke('loop-delete-task', taskId),
  loopPauseTask: (taskId: string) =>
    ipcRenderer.invoke('loop-pause-task', taskId),
  loopResumeTask: (taskId: string) =>
    ipcRenderer.invoke('loop-resume-task', taskId),
  loopExecuteNow: (taskId: string) =>
    ipcRenderer.invoke('loop-execute-now', taskId),
  loopParseInterval: (expression: string) =>
    ipcRenderer.invoke('loop-parse-interval', expression),
  loopGetStatus: () =>
    ipcRenderer.invoke('loop-get-status'),
  // 全局默认 LLM 配置
  loopSetDefaultConfig: (configIndex: number | undefined) =>
    ipcRenderer.invoke('loop-set-default-config', configIndex),
  loopGetDefaultConfig: () =>
    ipcRenderer.invoke('loop-get-default-config'),
  // Loop 任务执行完成事件
  onLoopTaskExecuted: (callback: (data: { taskId: string; execution: any }) => void) => {
    ipcRenderer.on('loop-task-executed', (_event, data) => callback(data))
  },
  removeLoopTaskExecutedListener: () => {
    ipcRenderer.removeAllListeners('loop-task-executed')
  },
  // macOS 隔离检测与修复
  checkMacOSQuarantine: () =>
    ipcRenderer.invoke('check-macos-quarantine'),
  fixMacOSQuarantine: (appPath: string) =>
    ipcRenderer.invoke('fix-macos-quarantine', appPath),
})
