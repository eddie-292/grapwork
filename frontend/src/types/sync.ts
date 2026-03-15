/**
 * 云同步相关类型定义
 */

// 冲突处理策略
export type ConflictStrategy =
  | 'local-wins'    // 本地优先（覆盖云端）
  | 'remote-wins'   // 云端优先（覆盖本地）
  | 'newer-wins'    // 时间戳优先（选择较新的）
  | 'manual'        // 手动选择

// 同步状态
export type SyncStatus =
  | 'idle'           // 空闲
  | 'uploading'      // 上传中
  | 'downloading'    // 下载中
  | 'error'          // 错误

// 同步配置
export interface SyncConfig {
  enabled: boolean                    // 是否启用同步
  serverUrl: string                   // 同步服务器地址
  apiToken?: string                   // API 认证令牌
  syncKeys: string[]                  // 需要同步的存储键
  autoSync: boolean                   // 是否自动同步
  autoSyncInterval: number            // 自动同步间隔（分钟）
  lastSyncTime?: number               // 最后同步时间戳
  lastSyncDirection?: 'upload' | 'download'  // 最后同步方向
  conflictStrategy: ConflictStrategy  // 冲突处理策略
}

// 同步结果
export interface SyncResult {
  success: boolean
  direction: 'upload' | 'download'
  timestamp: number
  syncedKeys: string[]
  errorKeys: string[]
  error?: string
}

// 同步冲突项
export interface SyncConflict {
  key: string
  localValue: any
  remoteValue: any
  localTimestamp?: number
  remoteTimestamp?: number
}

// 远程同步 API 响应格式
export interface SyncApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  timestamp?: number  // 服务器时间戳
}

// 远程数据条目（带元数据）
export interface RemoteSyncEntry {
  key: string
  value: any
  timestamp: number
  checksum?: string  // 数据校验和
}

// 可选同步项的配置
export interface SyncKeyOption {
  key: string
  label: string
  description: string
}
