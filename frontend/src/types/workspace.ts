/**
 * 工作空间类型定义
 * 支持多工作空间模式，每个工作空间有独立的聊天历史
 */

/**
 * 工作空间
 */
export interface Workspace {
  id: string
  name: string
  folderPath: string        // 关联的文件夹路径
  description?: string
  createdAt: number
  updatedAt: number
}

/**
 * 工作空间列表（带激活状态）
 */
export interface WorkspaceList {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}
