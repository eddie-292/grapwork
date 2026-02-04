/**
 * 全局记忆类型枚举
 */
export enum GlobalMemoryType {
  PREFERENCES = 'preferences',      // 用户偏好（按钮颜色、样式等）
  SETTINGS = 'settings',            // 通用设置
  GENERAL_INFO = 'general_info',    // 通用信息
  CUSTOM = 'custom'                 // 自定义类型
}

/**
 * 单个全局记忆条目
 */
export interface GlobalMemoryEntry {
  id: string                        // 唯一标识
  type: GlobalMemoryType           // 记忆类型
  category: string                 // 分类（如 "ui_preferences", "code_style"）
  title: string                    // 标题（如 "按钮颜色偏好"）
  content: string                  // 记忆内容
  keywords: string[]               // 关键词（用于智能匹配）
  enabled: boolean                 // 是否启用（自动注入时使用）
  createdAt: number               // 创建时间戳
  updatedAt: number               // 更新时间戳
  metadata?: {
    usageCount?: number            // 使用次数统计
    lastUsedAt?: number           // 最后使用时间戳
  }
}

/**
 * 全局记忆容器
 */
export interface GlobalMemory {
  entries: GlobalMemoryEntry[]
  version: number                  // 版本号（用于迁移）
  lastUpdated: number              // 最后更新时间戳
}

/**
 * 全局记忆注入选项（预留，当前使用智能注入）
 */
export interface GlobalMemoryInjectOptions {
  maxEntries?: number              // 最大返回条目数（默认5）
}
