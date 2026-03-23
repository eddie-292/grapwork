/**
 * 连接器模块类型定义
 * 用于管理第三方服务的连接（语雀、飞书等）
 */

// 连接器类型
export const ConnectionType = {
  YUQUE: 'yuque',
  FEISHU: 'feishu',
  NOTION: 'notion',
  GITHUB: 'github',
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
  [key: string]: unknown
}

// 飞书配置
export interface FeishuConfig {
  appId: string
  appSecret: string
  // OAuth 相关字段
  authMode?: 'tenant' | 'user' // 授权模式：tenant=应用授权, user=用户授权
  userAccessToken?: string // 用户访问令牌
  userRefreshToken?: string // 刷新令牌
  tokenExpiresAt?: number // token 过期时间戳
  userAuthorizedAt?: number // 用户授权时间戳
  userInfo?: {
    // 用户信息
    openId: string
    name: string
    avatarUrl?: string
  }
  [key: string]: unknown
}

// 飞书 OAuth 回调数据
export interface FeishuOAuthCallback {
  code: string
  state: string
  connectionId: string
}

// 飞书 OAuth Token 响应
export interface FeishuOAuthToken {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  openId?: string
}

// 飞书 API 响应类型

// 飞书用户信息
export interface FeishuUser {
  union_id: string
  user_id: string
  open_id: string
  name: string
  en_name: string
  nickname: string
  avatar_url: string
  email: string
  mobile: string
  department_ids: string[]
  leader_user_id: string
  city: string
  country: string
  work_station: string
  join_time: number
  employee_no: string
  employee_type: number
  positions: string[]
  orders: number[]
  custom_attrs: Record<string, unknown>
  status: {
    is_frozen: boolean
    is_resigned: boolean
    is_unjoin: boolean
    is_activated: boolean
  }
}

// 飞书知识空间（语雀对应知识库）
// API 文档: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/list
export interface FeishuWikiSpace {
  space_id: string  // 知识空间ID（数字字符串格式，如 "7618495522755709881"）
  name: string
  description: string
  space_type: 'team' | 'personal'  // 团队空间或个人空间
  visibility: 'private' | 'public'  // 可见性
  open_sharing?: 'open' | 'closed'  // 是否开启公开分享
}

// 飞书文档节点
export interface FeishuWikiNode {
  node_id: string
  obj_type: 'doc' | 'docx' | 'wiki' | 'sheet' | 'bitable' | 'mindnote' | 'file' | 'slides'
  obj_token: string
  parent_id: string
  space_id: string
  title: string
  has_child: boolean
  create_time: number
  update_time: number
  create_user: FeishuUser
  update_user: FeishuUser
  node_create_time: number
}

// 飞书文档内容
export interface FeishuDocContent {
  content: string
  revision_id: number
  title: string
  create_time: number
  update_time: number
}

// 飞书文档创建请求
export interface FeishuDocCreateRequest {
  title: string
  content?: string
  folder_token?: string
  parent_node_token?: string
}

// 飞书文档更新请求
export interface FeishuDocUpdateRequest {
  title?: string
  content?: string
}

// ==================== GitHub 类型定义 ====================

// GitHub 配置
export interface GitHubConfig {
  authToken: string // Personal Access Token
  baseUrl?: string // API 基础 URL (默认 https://api.github.com，企业版可自定义)
  [key: string]: unknown
}

// GitHub 用户信息
export interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  company: string | null
  location: string | null
  blog: string | null
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  updated_at: string
}

// GitHub 仓库
export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  clone_url: string
  ssh_url: string
  private: boolean
  fork: boolean
  owner: {
    id: number
    login: string
    avatar_url: string
  }
  default_branch: string
  language: string | null
  stargazers_count: number
  watchers_count: number
  forks_count: number
  open_issues_count: number
  created_at: string
  updated_at: string
  pushed_at: string
}

// GitHub Issue
export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
  user: {
    id: number
    login: string
    avatar_url: string
  }
  labels: Array<{
    id: number
    name: string
    color: string
  }>
  assignees: Array<{
    id: number
    login: string
    avatar_url: string
  }>
  milestone: {
    id: number
    title: string
    number: number
  } | null
  comments: number
  created_at: string
  updated_at: string
  closed_at: string | null
}

// GitHub Pull Request
export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
  draft: boolean
  merged: boolean
  user: {
    id: number
    login: string
    avatar_url: string
  }
  head: {
    ref: string
    sha: string
    repo: {
      name: string
      full_name: string
    }
  }
  base: {
    ref: string
    sha: string
    repo: {
      name: string
      full_name: string
    }
  }
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
}

// GitHub 文件内容
export interface GitHubFileContent {
  name: string
  path: string
  sha: string
  size: number
  type: 'file' | 'dir' | 'symlink'
  content?: string // Base64 编码的内容
  encoding?: string
  download_url: string | null
  html_url: string
}

// GitHub Issue 创建请求
export interface GitHubIssueCreateRequest {
  title: string
  body?: string
  labels?: string[]
  assignees?: string[]
  milestone?: number
}

// GitHub Issue 更新请求
export interface GitHubIssueUpdateRequest {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  labels?: string[]
  assignees?: string[]
  milestone?: number | null
}

// GitHub PR 创建请求
export interface GitHubPRCreateRequest {
  title: string
  head: string // 分支名
  base: string // 目标分支
  body?: string
  draft?: boolean
}

// GitHub 文件创建/更新请求
export interface GitHubFileCommitRequest {
  message: string
  content: string // 文件内容（非 Base64）
  branch?: string
  sha?: string // 更新文件时需要提供原文件的 sha
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
