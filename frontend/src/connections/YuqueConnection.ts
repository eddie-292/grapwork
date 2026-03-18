/**
 * 语雀连接器
 * 实现语雀 API 的连接和文档操作
 *
 * API 文档: https://www.yuque.com/yuque/developer/openapi
 */
import { BaseConnection } from './BaseConnection'
import type {
  ConnectionType,
  ConnectionResult,
  ConnectionStatus,
  YuqueConfig,
  YuqueUser,
  YuqueRepo,
  YuqueDoc,
  YuqueDocDetail,
  YuqueDocCreateRequest,
  YuqueDocUpdateRequest,
  IDocumentOperations,
} from '@/types/connection'

// 语雀 API 基础 URL
const YUQUE_API_BASE = 'https://www.yuque.com/api/v2'

export class YuqueConnection
  extends BaseConnection
  implements IDocumentOperations
{
  readonly type: ConnectionType = 'yuque'
  readonly name: string = '语雀'

  private authToken: string | null = null
  private userAgent: string = 'GrapWork'

  /**
   * 初始化连接器
   */
  async initialize(config: Record<string, unknown>): Promise<ConnectionResult> {
    try {
      const yuqueConfig = config as YuqueConfig

      if (!yuqueConfig.authToken) {
        return {
          success: false,
          error: '缺少 authToken',
        }
      }

      this.authToken = yuqueConfig.authToken
      this.userAgent = yuqueConfig.userAgent || 'GrapWork'
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
            name: result.data.name,
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
      'X-Auth-Token': this.authToken || '',
      'User-Agent': this.userAgent,
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

    const url = `${YUQUE_API_BASE}${endpoint}`

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
          errorMessage = errorData.message || errorData.errors?.[0]?.message || errorMessage
        } catch {
          // 解析错误响应失败，使用默认消息
        }

        return { success: false, error: errorMessage }
      }

      const responseData = await response.json()

      // 语雀 API 返回格式: { data: ... }
      return {
        success: true,
        data: responseData.data !== undefined ? responseData.data : responseData,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '请求失败',
      }
    }
  }

  // ==================== 用户操作 ====================

  /**
   * 获取当前用户信息
   */
  async getUser(): Promise<ConnectionResult<YuqueUser>> {
    return this.request<YuqueUser>('/user')
  }

  // ==================== 知识库操作 ====================

  /**
   * 获取用户的知识库列表
   */
  async listRepos(): Promise<ConnectionResult<YuqueRepo[]>> {
    return this.request<YuqueRepo[]>('/repos')
  }

  /**
   * 获取指定知识库信息
   */
  async getRepo(namespace: string): Promise<ConnectionResult<YuqueRepo>> {
    return this.request<YuqueRepo>(`/repos/${namespace}`)
  }

  // ==================== 文档操作 ====================

  /**
   * 获取知识库的文档列表
   */
  async listDocs(repoNamespace: string): Promise<ConnectionResult<YuqueDoc[]>> {
    return this.request<YuqueDoc[]>(`/repos/${repoNamespace}/docs`)
  }

  /**
   * 获取文档详情
   */
  async getDoc(repoNamespace: string, docSlug: string): Promise<ConnectionResult<YuqueDocDetail>> {
    return this.request<YuqueDocDetail>(`/repos/${repoNamespace}/docs/${docSlug}`)
  }

  /**
   * 创建文档
   */
  async createDoc(
    repoNamespace: string,
    data: YuqueDocCreateRequest
  ): Promise<ConnectionResult<YuqueDoc>> {
    return this.request<YuqueDoc>(`/repos/${repoNamespace}/docs`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * 更新文档
   */
  async updateDoc(
    repoNamespace: string,
    docSlug: string,
    data: YuqueDocUpdateRequest
  ): Promise<ConnectionResult<YuqueDoc>> {
    return this.request<YuqueDoc>(`/repos/${repoNamespace}/docs/${docSlug}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * 删除文档
   */
  async deleteDoc(repoNamespace: string, docSlug: string): Promise<ConnectionResult<void>> {
    return this.request<void>(`/repos/${repoNamespace}/docs/${docSlug}`, {
      method: 'DELETE',
    })
  }

  // ==================== 辅助方法 ====================

  /**
   * 搜索文档
   */
  async searchDocs(query: string, repoNamespace?: string): Promise<ConnectionResult<YuqueDoc[]>> {
    const endpoint = repoNamespace
      ? `/repos/${repoNamespace}/search?q=${encodeURIComponent(query)}`
      : `/search?q=${encodeURIComponent(query)}`
    return this.request<YuqueDoc[]>(endpoint)
  }

  /**
   * 获取文档目录（TOC）
   */
  async getRepoToc(repoNamespace: string): Promise<ConnectionResult<unknown[]>> {
    return this.request<unknown[]>(`/repos/${repoNamespace}/toc`)
  }
}
