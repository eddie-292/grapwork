/**
 * 连接器模块类型定义
 * 用于管理第三方服务的连接（语雀、飞书等）
 */

// 连接器类型
export const ConnectionType = {
  YUQUE: 'yuque',
  FEISHU: 'feishu',
  NOTION: 'notion',
} as const

export type ConnectionType = typeof ConnectionType[keyof typeof ConnectionType]

// 连接器配置接口
export interface ConnectionConfig {
  id: string
  type: ConnectionType
  name: string
  enabled: boolean
  config: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// 语雀配置
export interface YuqueConfig {
  authToken: string
  userAgent?: string
}

// 飞书配置（预留）
export interface FeishuConfig {
  appId: string
  appSecret: string
}

// 连接器注册表
export interface ConnectionRegistry {
  connections: ConnectionConfig[]
  activeConnectionIds: string[]
  version: number
  lastUpdated: number
}

// 语雀 API 响应类型

// 语雀用户信息
export interface YuqueUser {
  id: number
  type: string
  login: string
  name: string
  description: string
  avatar_url: string
  large_avatar_url: string
  medium_avatar_url: string
  small_avatar_url: string
  created_at: string
  updated_at: string
  serializer: string
}

// 语雀知识库
export interface YuqueRepo {
  id: number
  type: string
  slug: string
  name: string
  namespace: string
  description: string
  user_id: number
  public: number
  groups_user_count: number
  likes_count: number
  watches_count: number
  comments_count: number
  contents_updated_at: string
  created_at: string
  updated_at: string
  user: YuqueUser
  toc_updated_at: string
  serializer: string
}

// 语雀文档
export interface YuqueDoc {
  id: number
  slug: string
  title: string
  book_id: number
  book: {
    id: number
    type: string
    slug: string
    name: string
    namespace: string
  }
  user_id: number
  user: YuqueUser
  format: string
  body: string
  body_draft: string
  body_html: string
  body_lake: string
  last_editor_id: number
  last_editor: YuqueUser
  public: number
  status: number
  view_status: number
  read_status: number
  comment_status: number
  comments_count: number
  likes_count: number
  content_updated_at: string
  deleted_at: string | null
  created_at: string
  updated_at: string
  published_at: string
  first_published_at: string
  hits: number
  word_count: number
  serializer: string
}

// 语雀文档详情（用于读取）
export interface YuqueDocDetail {
  id: number
  slug: string
  title: string
  book_id: number
  user_id: number
  format: string
  body: string
  body_draft: string
  body_html: string
  body_lake: string
  public: number
  status: number
  likes_count: number
  comments_count: number
  content_updated_at: string
  created_at: string
  updated_at: string
  published_at: string
  hits: number
}

// 语雀文档创建/更新请求
export interface YuqueDocCreateRequest {
  title: string
  slug?: string
  format?: 'markdown' | 'lake' | 'html'
  body?: string
  public?: 0 | 1
}

export interface YuqueDocUpdateRequest {
  title?: string
  slug?: string
  format?: 'markdown' | 'lake' | 'html'
  body?: string
  public?: 0 | 1
}

// 连接器操作结果
export interface ConnectionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// 连接器状态
export interface ConnectionStatus {
  connected: boolean
  lastChecked?: number
  error?: string
  user?: {
    name: string
    avatar?: string
  }
}

// 连接器接口（所有连接器必须实现）
export interface IConnection {
  // 连接器类型
  readonly type: ConnectionType

  // 连接器名称
  readonly name: string

  // 初始化连接器
  initialize(config: Record<string, unknown>): Promise<ConnectionResult>

  // 检查连接状态
  checkConnection(): Promise<ConnectionStatus>

  // 获取当前用户信息
  getUser?(): Promise<ConnectionResult<YuqueUser>>

  // 销毁连接器
  destroy?(): void
}

// 文档操作接口
export interface IDocumentOperations {
  // 列出知识库
  listRepos?(): Promise<ConnectionResult<YuqueRepo[]>>

  // 列出文档
  listDocs?(repoNamespace: string): Promise<ConnectionResult<YuqueDoc[]>>

  // 获取文档详情
  getDoc?(repoNamespace: string, docSlug: string): Promise<ConnectionResult<YuqueDocDetail>>

  // 创建文档
  createDoc?(repoNamespace: string, data: YuqueDocCreateRequest): Promise<ConnectionResult<YuqueDoc>>

  // 更新文档
  updateDoc?(repoNamespace: string, docSlug: string, data: YuqueDocUpdateRequest): Promise<ConnectionResult<YuqueDoc>>

  // 删除文档
  deleteDoc?(repoNamespace: string, docSlug: string): Promise<ConnectionResult<void>>
}
