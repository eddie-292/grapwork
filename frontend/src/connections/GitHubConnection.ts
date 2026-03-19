/**
 * GitHub 连接器
 * 实现 GitHub REST API 的连接和操作
 *
 * API 文档: https://docs.github.com/en/rest
 */
import { BaseConnection } from './BaseConnection'
import type {
  ConnectionType,
  ConnectionResult,
  ConnectionStatus,
  GitHubConfig,
  GitHubUser,
  GitHubRepo,
  GitHubIssue,
  GitHubPullRequest,
  GitHubFileContent,
  GitHubIssueCreateRequest,
  GitHubIssueUpdateRequest,
  GitHubPRCreateRequest,
  GitHubFileCommitRequest,
} from '@/types/connection'

// GitHub API 基础 URL
const DEFAULT_GITHUB_API_BASE = 'https://api.github.com'

export class GitHubConnection extends BaseConnection {
  readonly type: ConnectionType = 'github'
  readonly name: string = 'GitHub'

  private authToken: string | null = null
  private baseUrl: string = DEFAULT_GITHUB_API_BASE

  /**
   * 初始化连接器
   */
  async initialize(config: Record<string, unknown>): Promise<ConnectionResult> {
    try {
      const githubConfig = config as GitHubConfig

      if (!githubConfig.authToken) {
        return {
          success: false,
          error: '缺少 authToken',
        }
      }

      this.authToken = githubConfig.authToken
      this.baseUrl = githubConfig.baseUrl || DEFAULT_GITHUB_API_BASE
      this.config = config

      // 验证连接
      const status = await this.checkConnection()

      if (!status.connected) {
        this.authToken = null
        this.config = null
        return {
          success: false,
          error: status.error || '连接验证失败',
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      }
    }
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<ConnectionStatus> {
    if (!this.authToken) {
      this.updateStatus({ connected: false, error: '未配置 authToken' })
      return this._status
    }

    try {
      const result = await this.getUser()

      if (result.success && result.data) {
        this.updateStatus({
          connected: true,
          error: undefined,
          user: {
            name: result.data.name || result.data.login,
            avatar: result.data.avatar_url,
          },
        })
      } else {
        this.updateStatus({
          connected: false,
          error: result.error || '获取用户信息失败',
        })
      }
    } catch (error) {
      this.updateStatus({
        connected: false,
        error: error instanceof Error ? error.message : '连接检查失败',
      })
    }

    return this._status
  }

  /**
   * 获取请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.authToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    }
  }

  /**
   * 发送请求
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ConnectionResult<T>> {
    if (!this.authToken) {
      return { success: false, error: '未配置 authToken' }
    }

    const url = `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      })

      // 处理响应
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`

        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch {
          // 解析错误响应失败，使用默认消息
        }

        return { success: false, error: errorMessage }
      }

      // 处理 204 No Content
      if (response.status === 204) {
        return { success: true, data: undefined as T }
      }

      const responseData = await response.json()
      return { success: true, data: responseData }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '请求失败',
      }
    }
  }

  // ==================== 用户操作 ====================

  /**
   * 获取当前认证用户信息
   */
  async getUser(): Promise<ConnectionResult<GitHubUser>> {
    return this.request<GitHubUser>('/user')
  }

  // ==================== 仓库操作 ====================

  /**
   * 获取当前用户的仓库列表
   */
  async listRepos(options?: {
    visibility?: 'all' | 'public' | 'private'
    affiliation?: 'owner' | 'collaborator' | 'organization_member'
    sort?: 'created' | 'updated' | 'pushed' | 'full_name'
    per_page?: number
    page?: number
  }): Promise<ConnectionResult<GitHubRepo[]>> {
    const params = new URLSearchParams()
    if (options?.visibility) params.set('visibility', options.visibility)
    if (options?.affiliation) params.set('affiliation', options.affiliation)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    const query = params.toString()
    return this.request<GitHubRepo[]>(`/user/repos${query ? `?${query}` : ''}`)
  }

  /**
   * 获取指定仓库信息
   */
  async getRepo(owner: string, repo: string): Promise<ConnectionResult<GitHubRepo>> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`)
  }

  // ==================== Issue 操作 ====================

  /**
   * 获取仓库的 Issue 列表
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all'
      labels?: string
      sort?: 'created' | 'updated' | 'comments'
      direction?: 'asc' | 'desc'
      per_page?: number
      page?: number
    }
  ): Promise<ConnectionResult<GitHubIssue[]>> {
    const params = new URLSearchParams()
    if (options?.state) params.set('state', options.state)
    if (options?.labels) params.set('labels', options.labels)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.direction) params.set('direction', options.direction)
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    const query = params.toString()
    return this.request<GitHubIssue[]>(`/repos/${owner}/${repo}/issues${query ? `?${query}` : ''}`)
  }

  /**
   * 获取单个 Issue
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`)
  }

  /**
   * 创建 Issue
   */
  async createIssue(
    owner: string,
    repo: string,
    data: GitHubIssueCreateRequest
  ): Promise<ConnectionResult<GitHubIssue>> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * 更新 Issue
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    data: GitHubIssueUpdateRequest
  ): Promise<ConnectionResult<GitHubIssue>> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  /**
   * 关闭 Issue
   */
  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'closed' })
  }

  /**
   * 重新打开 Issue
   */
  async reopenIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'open' })
  }

  // ==================== Pull Request 操作 ====================

  /**
   * 获取仓库的 Pull Request 列表
   */
  async listPullRequests(
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all'
      head?: string
      base?: string
      sort?: 'created' | 'updated' | 'popularity' | 'long-running'
      direction?: 'asc' | 'desc'
      per_page?: number
      page?: number
    }
  ): Promise<ConnectionResult<GitHubPullRequest[]>> {
    const params = new URLSearchParams()
    if (options?.state) params.set('state', options.state)
    if (options?.head) params.set('head', options.head)
    if (options?.base) params.set('base', options.base)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.direction) params.set('direction', options.direction)
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    const query = params.toString()
    return this.request<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls${query ? `?${query}` : ''}`)
  }

  /**
   * 获取单个 Pull Request
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ConnectionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${prNumber}`)
  }

  /**
   * 创建 Pull Request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    data: GitHubPRCreateRequest
  ): Promise<ConnectionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * 更新 Pull Request
   */
  async updatePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    data: {
      title?: string
      body?: string
      state?: 'open' | 'closed'
      base?: string
    }
  ): Promise<ConnectionResult<GitHubPullRequest>> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ==================== 文件/内容操作 ====================

  /**
   * 获取仓库文件/目录内容
   */
  async getContent(
    owner: string,
    repo: string,
    path: string = '',
    ref?: string
  ): Promise<ConnectionResult<GitHubFileContent | GitHubFileContent[]>> {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : ''
    return this.request<GitHubFileContent | GitHubFileContent[]>(
      `/repos/${owner}/${repo}/contents/${path}${refQuery}`
    )
  }

  /**
   * 获取文件内容（解码 Base64）
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<ConnectionResult<{ content: string; sha: string; path: string }>> {
    const result = await this.getContent(owner, repo, path, ref)

    if (!result.success) {
      return result as ConnectionResult<{ content: string; sha: string; path: string }>
    }

    const fileData = result.data as GitHubFileContent

    if (fileData.type !== 'file' || !fileData.content) {
      return { success: false, error: '不是文件或内容为空' }
    }

    // 解码 Base64 内容
    const content = decodeBase64(fileData.content)

    return {
      success: true,
      data: {
        content,
        sha: fileData.sha,
        path: fileData.path,
      },
    }
  }

  /**
   * 创建或更新文件
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    data: GitHubFileCommitRequest
  ): Promise<ConnectionResult<{ content: GitHubFileContent | null; commit: { sha: string } }>> {
    // 将内容编码为 Base64
    const encodedContent = encodeBase64(data.content)

    return this.request<{ content: GitHubFileContent | null; commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: data.message,
          content: encodedContent,
          branch: data.branch,
          sha: data.sha,
        }),
      }
    )
  }

  /**
   * 删除文件
   */
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string
  ): Promise<ConnectionResult<{ commit: { sha: string } }>> {
    const body: Record<string, unknown> = { message, sha }
    if (branch) body.branch = branch

    return this.request<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'DELETE',
        body: JSON.stringify(body),
      }
    )
  }

  // ==================== 搜索操作 ====================

  /**
   * 搜索仓库
   */
  async searchRepos(
    query: string,
    options?: {
      sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'
      order?: 'asc' | 'desc'
      per_page?: number
      page?: number
    }
  ): Promise<ConnectionResult<{ total_count: number; items: GitHubRepo[] }>> {
    const params = new URLSearchParams()
    params.set('q', query)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.order) params.set('order', options.order)
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    return this.request<{ total_count: number; items: GitHubRepo[] }>(
      `/search/repositories?${params.toString()}`
    )
  }

  /**
   * 搜索 Issues
   */
  async searchIssues(
    query: string,
    options?: {
      sort?: 'comments' | 'reactions' | 'reactions-+1' | 'reactions--1' | 'reactions-smile' | 'created' | 'updated'
      order?: 'asc' | 'desc'
      per_page?: number
      page?: number
    }
  ): Promise<ConnectionResult<{ total_count: number; items: GitHubIssue[] }>> {
    const params = new URLSearchParams()
    params.set('q', query)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.order) params.set('order', options.order)
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    return this.request<{ total_count: number; items: GitHubIssue[] }>(
      `/search/issues?${params.toString()}`
    )
  }

  // ==================== 分支操作 ====================

  /**
   * 获取分支列表
   */
  async listBranches(
    owner: string,
    repo: string,
    options?: { per_page?: number; page?: number }
  ): Promise<ConnectionResult<Array<{ name: string; commit: { sha: string }; protected: boolean }>>> {
    const params = new URLSearchParams()
    if (options?.per_page) params.set('per_page', String(options.per_page))
    if (options?.page) params.set('page', String(options.page))

    const query = params.toString()
    return this.request<Array<{ name: string; commit: { sha: string }; protected: boolean }>>(
      `/repos/${owner}/${repo}/branches${query ? `?${query}` : ''}`
    )
  }

  /**
   * 获取单个分支
   */
  async getBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<ConnectionResult<{ name: string; commit: { sha: string }; protected: boolean }>> {
    return this.request<{ name: string; commit: { sha: string }; protected: boolean }>(
      `/repos/${owner}/${repo}/branches/${branch}`
    )
  }
}

// Base64 编解码辅助函数
function encodeBase64(str: string): string {
  if (typeof window !== 'undefined' && window.btoa) {
    // 浏览器环境
    return btoa(unescape(encodeURIComponent(str)))
  }
  // Node.js 环境
  return Buffer.from(str, 'utf-8').toString('base64')
}

function decodeBase64(base64: string): string {
  // 移除换行符
  const cleanBase64 = base64.replace(/\n/g, '')
  if (typeof window !== 'undefined' && window.atob) {
    // 浏览器环境
    return decodeURIComponent(escape(atob(cleanBase64)))
  }
  // Node.js 环境
  return Buffer.from(cleanBase64, 'base64').toString('utf-8')
}
