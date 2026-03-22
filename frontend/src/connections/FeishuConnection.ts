/**
 * 飞书连接器
 * 实现飞书开放平台 API 的连接和文档操作
 *
 * API 文档: https://open.feishu.cn/document/server-docs/docs-overview
 *
 * 注意: 飞书 API 不支持浏览器端直接调用（CORS 限制），
 * 所以本连接器通过 Electron 主进程代理所有 API 请求。
 */
import { BaseConnection } from './BaseConnection'
import type {
  ConnectionType,
  ConnectionResult,
  ConnectionStatus,
  FeishuConfig,
  FeishuUser,
  FeishuOAuthToken,
  FeishuWikiSpace,
  FeishuWikiNode,
  FeishuDocContent,
  FeishuDocCreateRequest,
  FeishuDocUpdateRequest,
} from '@/types/connection'

// 飞书 API 基础 URL
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'

// Token 缓存
interface TokenCache {
  accessToken: string
  expiresAt: number
  tokenType: 'tenant' | 'user'
}

// 授权状态（用于 UI 显示）
export interface FeishuAuthStatus {
  mode: 'tenant' | 'user'
  hasUserToken: boolean
  tokenExpired: boolean
  userName?: string
  userAvatar?: string
}

export class FeishuConnection extends BaseConnection {
  readonly type: ConnectionType = 'feishu'
  readonly name: string = '飞书'

  private appId: string | null = null
  private appSecret: string | null = null
  private tokenCache: TokenCache | null = null

  // OAuth 用户授权相关
  private authMode: 'tenant' | 'user' = 'tenant'
  private userAccessToken: string | null = null
  private userRefreshToken: string | null = null
  private tokenExpiresAt: number | null = null
  private userInfo: { openId: string; name: string; avatarUrl?: string } | null = null
  private oauthRedirectUri: string | null = null

  /**
   * 初始化连接器
   */
  async initialize(config: Record<string, unknown>): Promise<ConnectionResult> {
    try {
      const feishuConfig = config as FeishuConfig

      if (!feishuConfig.appId || !feishuConfig.appSecret) {
        return {
          success: false,
          error: '缺少 appId 或 appSecret',
        }
      }

      this.appId = feishuConfig.appId
      this.appSecret = feishuConfig.appSecret
      this.config = config

      // 加载用户授权相关配置
      this.authMode = feishuConfig.authMode || 'tenant'
      if (feishuConfig.userAccessToken) {
        this.userAccessToken = feishuConfig.userAccessToken
      }
      if (feishuConfig.userRefreshToken) {
        this.userRefreshToken = feishuConfig.userRefreshToken
      }
      if (feishuConfig.tokenExpiresAt) {
        this.tokenExpiresAt = feishuConfig.tokenExpiresAt
      }
      if (feishuConfig.userInfo) {
        this.userInfo = feishuConfig.userInfo
      }

      // 验证连接
      const status = await this.checkConnection()

      if (!status.connected) {
        this.appId = null
        this.appSecret = null
        this.tokenCache = null
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
    if (!this.appId || !this.appSecret) {
      this.updateStatus({ connected: false, error: '未配置 appId 或 appSecret' })
      return this._status
    }

    try {
      // 用户授权模式下，如果没有用户 token，先尝试获取 tenant_access_token 来验证 App 凭证
      if (this.authMode === 'user' && !this.userAccessToken) {
        const tenantTokenResult = await this.getTenantAccessToken()
        if (tenantTokenResult.success) {
          this.updateStatus({
            connected: true,
            error: undefined,
            user: {
              name: `飞书应用 (${this.appId.substring(0, 8)}...) - 待授权`,
              avatar: undefined,
            },
          })
          return this._status
        }
        // 如果有 tenant token 也获取失败，说明 App 凭证无效
        this.updateStatus({
          connected: false,
          error: tenantTokenResult.error || '应用凭证无效',
        })
        return this._status
      }

      // 非用户授权模式或 已有用户 token，尝试获取 access token
      const tokenResult = await this.getAccessToken()

      if (!tokenResult.success) {
        this.updateStatus({
          connected: false,
          error: tokenResult.error || '获取访问令牌失败',
        })
        return this._status
      }

      // Token 获取成功，连接有效
      this.updateStatus({
        connected: true,
        error: undefined,
        user: {
          name: `飞书应用 (${this.appId.substring(0, 8)}...)`,
          avatar: undefined,
        },
      })
    } catch (error) {
      this.updateStatus({
        connected: false,
        error: error instanceof Error ? error.message : '连接检查失败',
      })
    }

    return this._status
  }

  /**
   * 通过主进程发送 HTTP 请求（绕过 CORS）
   */
  private async proxyRequest(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    headers?: Record<string, string>,
    body?: object
  ): Promise<{ status: number; data: string; error?: string }> {
    if (!window.electronAPI?.connectionRequest) {
      throw new Error('Electron API 不可用')
    }

    const result = await window.electronAPI.connectionRequest({
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // 如果请求本身失败（网络错误等）
    if (!result.success && result.error) {
      throw new Error(result.error)
    }

    return {
      status: result.status,
      data: result.data || '',
      error: result.error,
    }
  }

  /**
   * 安全解析 JSON 响应
   */
  private safeParseJson<T>(responseData: string, context: string): ConnectionResult<T> {
    if (!responseData || responseData.trim() === '') {
      return { success: false, error: `${context}: 响应为空` }
    }

    try {
      const data = JSON.parse(responseData)
      return { success: true, data }
    } catch (e) {
      console.error(`[${context}] JSON 解析失败，原始响应:`, responseData.substring(0, 500))
      return {
        success: false,
        error: `${context}: 响应格式错误`,
      }
    }
  }

  /**
   * 获取应用访问令牌（tenant_access_token）
   * 用于验证 App 凭证是否有效
   */
  private async getTenantAccessToken(): Promise<ConnectionResult<string>> {
    if (!this.appId || !this.appSecret) {
      return { success: false, error: '未配置 appId 或 appSecret' }
    }

    try {
      const response = await this.proxyRequest(
        `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
        'POST',
        { 'Content-Type': 'application/json' },
        {
          app_id: this.appId,
          app_secret: this.appSecret,
        }
      )

      if (response.status !== 200) {
        return { success: false, error: `获取令牌失败: HTTP ${response.status}` }
      }

      const parseResult = this.safeParseJson<{ code: number; msg?: string; tenant_access_token?: string; expire?: number }>(
        response.data,
        '获取应用访问令牌'
      )

      if (!parseResult.success) {
        return { success: false, error: parseResult.error }
      }

      const data = parseResult.data!

      if (data.code !== 0) {
        return { success: false, error: data.msg || `获取令牌失败: ${data.code}` }
      }

      // 缓存 token
      this.tokenCache = {
        accessToken: data.tenant_access_token!,
        expiresAt: Date.now() + ((data.expire || 7200) - 300) * 1000,
        tokenType: 'tenant',
      }

      return { success: true, data: data.tenant_access_token! }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '获取应用令牌失败' }
    }
  }

  /**
   * 获取访问令牌
   */
  private async getAccessToken(): Promise<ConnectionResult<string>> {
    // 如果使用用户授权模式
    if (this.authMode === 'user') {
      // 检查缓存的用户 token 是否有效
      if (this.userAccessToken && this.tokenExpiresAt && this.tokenExpiresAt > Date.now()) {
        return { success: true, data: this.userAccessToken }
      }

      // 尝试刷新 token
      if (this.userRefreshToken) {
        const refreshResult = await this.refreshUserToken()
        if (refreshResult.success) {
          return refreshResult
        }
        // 刷新失败，需要重新授权
        return { success: false, error: '用户令牌已过期，请重新授权' }
      }

      return { success: false, error: '未获取用户授权，请先授权' }
    }

    // 使用应用授权模式（tenant_access_token）
    // 检查缓存的 token 是否有效
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return { success: true, data: this.tokenCache.accessToken }
    }

    if (!this.appId || !this.appSecret) {
      return { success: false, error: '未配置 appId 或 appSecret' }
    }

    try {
      const response = await this.proxyRequest(
        `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
        'POST',
        { 'Content-Type': 'application/json' },
        {
          app_id: this.appId,
          app_secret: this.appSecret,
        }
      )

      // 检查 HTTP 状态码
      if (response.status !== 200) {
        return {
          success: false,
          error: `获取令牌失败: HTTP ${response.status}`,
        }
      }

      const parseResult = this.safeParseJson<{ code: number; msg?: string; tenant_access_token?: string; expire?: number }>(
        response.data,
        '获取访问令牌'
      )

      if (!parseResult.success) {
        return { success: false, error: parseResult.error }
      }

      const data = parseResult.data!

      if (data.code !== 0) {
        return {
          success: false,
          error: data.msg || `获取令牌失败: ${data.code}`,
        }
      }

      // 缓存 token（提前 5 分钟过期）
      this.tokenCache = {
        accessToken: data.tenant_access_token!,
        expiresAt: Date.now() + ((data.expire || 7200) - 300) * 1000,
        tokenType: 'tenant',
      }

      return { success: true, data: data.tenant_access_token! }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取令牌失败',
      }
    }
  }

  /**
   * 获取请求头
   */
  private async getHeaders(): Promise<Record<string, string> | null> {
    const tokenResult = await this.getAccessToken()
    if (!tokenResult.success || !tokenResult.data) {
      return null
    }

    return {
      Authorization: `Bearer ${tokenResult.data}`,
      'Content-Type': 'application/json',
    }
  }

  // ==================== OAuth 相关方法 ====================

  /**
   * 启动 OAuth 授权流程
   */
  async startOAuthFlow(connectionId: string): Promise<ConnectionResult<void>> {
    if (!this.appId) {
      return { success: false, error: '未配置 appId' }
    }

    try {
      const result = await window.electronAPI?.feishuStartOAuth({
        appId: this.appId,
        connectionId,
      })

      if (result?.success) {
        // 保存 redirectUri 用于后续的 token 交换
        this.oauthRedirectUri = result.redirectUri || null
        return { success: true }
      }
      return { success: false, error: result?.error || '启动授权失败' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '启动授权失败',
      }
    }
  }

  /**
   * 获取应用访问令牌（app_access_token）
   * 用于调用需要应用身份的接口（如 OAuth token 交换）
   */
  private async getAppAccessToken(): Promise<ConnectionResult<string>> {
    if (!this.appId || !this.appSecret) {
      return { success: false, error: '未配置 appId 或 appSecret' }
    }

    try {
      const response = await this.proxyRequest(
        `${FEISHU_API_BASE}/auth/v3/app_access_token/internal`,
        'POST',
        { 'Content-Type': 'application/json' },
        {
          app_id: this.appId,
          app_secret: this.appSecret,
        }
      )

      if (response.status !== 200) {
        return { success: false, error: `获取应用令牌失败: HTTP ${response.status}` }
      }

      const parseResult = this.safeParseJson<{ code: number; msg?: string; app_access_token?: string; expire?: number }>(
        response.data,
        '获取应用访问令牌'
      )

      if (!parseResult.success) {
        return { success: false, error: parseResult.error }
      }

      const data = parseResult.data!

      if (data.code !== 0) {
        return { success: false, error: data.msg || `获取应用令牌失败: ${data.code}` }
      }

      return { success: true, data: data.app_access_token! }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '获取应用令牌失败' }
    }
  }

  /**
   * 用授权码换取用户访问令牌
   */
  async exchangeOAuthCode(code: string): Promise<ConnectionResult<FeishuOAuthToken>> {
    if (!this.appId || !this.appSecret) {
      return { success: false, error: '未配置 appId 或 appSecret' }
    }

    // 使用固定的 redirect_uri (必须与授权时的一致)
    const redirectUri = this.oauthRedirectUri || 'http://localhost:59920/callback'

    try {
      // 飞书 OIDC 接口需要使用 app_access_token 作为 Authorization header
      const appTokenResult = await this.getAppAccessToken()
      if (!appTokenResult.success) {
        return { success: false, error: appTokenResult.error || '获取应用访问令牌失败' }
      }

      const response = await this.proxyRequest(
        `${FEISHU_API_BASE}/authen/v1/oidc/access_token`,
        'POST',
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appTokenResult.data}`,
        },
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }
      )

      if (response.status !== 200) {
        return { success: false, error: `OAuth 失败: HTTP ${response.status}` }
      }

      const parseResult = this.safeParseJson<{
        code: number
        msg?: string
        data?: {
          access_token: string
          refresh_token: string
          expires_in: number
          token_type: string
          open_id?: string
          name?: string
          avatar_url?: string
        }
      }>(response.data, 'OAuth Token Exchange')

      if (!parseResult.success) {
        return { success: false, error: parseResult.error }
      }

      const respData = parseResult.data!

      if (respData.code !== 0) {
        return { success: false, error: respData.msg || `OAuth 失败: ${respData.code}` }
      }

      const tokenData = respData.data!

      // 存储用户令牌
      this.userAccessToken = tokenData.access_token
      this.userRefreshToken = tokenData.refresh_token
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in - 300) * 1000
      this.authMode = 'user'

      // 存储用户信息
      if (tokenData.open_id) {
        this.userInfo = {
          openId: tokenData.open_id,
          name: tokenData.name || '飞书用户',
          avatarUrl: tokenData.avatar_url,
        }
      }

      // 更新 config 以便持久化
      if (this.config) {
        this.config = {
          ...this.config,
          authMode: 'user',
          userAccessToken: this.userAccessToken,
          userRefreshToken: this.userRefreshToken,
          tokenExpiresAt: this.tokenExpiresAt,
          userAuthorizedAt: Date.now(),
          userInfo: this.userInfo,
        } as FeishuConfig
      }

      return {
        success: true,
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          tokenType: tokenData.token_type,
          openId: tokenData.open_id,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth 交换失败',
      }
    }
  }

  /**
   * 刷新用户访问令牌
   */
  async refreshUserToken(): Promise<ConnectionResult<string>> {
    if (!this.userRefreshToken || !this.appId || !this.appSecret) {
      return { success: false, error: '无法刷新令牌: 缺少必要参数' }
    }

    try {
      // 飞书 OIDC 接口需要使用 app_access_token 作为 Authorization header
      const appTokenResult = await this.getAppAccessToken()
      if (!appTokenResult.success) {
        return { success: false, error: appTokenResult.error || '获取应用访问令牌失败' }
      }

      const response = await this.proxyRequest(
        `${FEISHU_API_BASE}/authen/v1/oidc/refresh_access_token`,
        'POST',
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appTokenResult.data}`,
        },
        {
          grant_type: 'refresh_token',
          refresh_token: this.userRefreshToken,
        }
      )

      if (response.status !== 200) {
        // 刷新令牌过期，需要重新授权
        this.authMode = 'tenant'
        this.userAccessToken = null
        this.userRefreshToken = null
        return { success: false, error: '令牌已过期，需要重新授权' }
      }

      const parseResult = this.safeParseJson<{
        code: number
        msg?: string
        data?: {
          access_token: string
          refresh_token: string
          expires_in: number
        }
      }>(response.data, 'Refresh Token')

      if (!parseResult.success || parseResult.data!.code !== 0) {
        return {
          success: false,
          error: parseResult.data?.msg || '刷新令牌失败',
        }
      }

      const tokenData = parseResult.data!.data!
      this.userAccessToken = tokenData.access_token
      this.userRefreshToken = tokenData.refresh_token
      this.tokenExpiresAt = Date.now() + (tokenData.expires_in - 300) * 1000

      // 更新 config
      if (this.config) {
        this.config = {
          ...this.config,
          userAccessToken: this.userAccessToken,
          userRefreshToken: this.userRefreshToken,
          tokenExpiresAt: this.tokenExpiresAt,
        } as FeishuConfig
      }

      return { success: true, data: this.userAccessToken }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '刷新令牌失败',
      }
    }
  }

  /**
   * 检查是否需要用户授权
   */
  needsUserAuthorization(): boolean {
    return (
      this.authMode === 'user' &&
      (!this.userAccessToken || (this.tokenExpiresAt !== null && this.tokenExpiresAt <= Date.now()))
    )
  }

  /**
   * 获取授权状态（用于 UI 显示）
   */
  getAuthorizationStatus(): FeishuAuthStatus {
    return {
      mode: this.authMode,
      hasUserToken: !!this.userAccessToken,
      tokenExpired: this.tokenExpiresAt ? this.tokenExpiresAt <= Date.now() : true,
      userName: this.userInfo?.name || this._status.user?.name,
      userAvatar: this.userInfo?.avatarUrl || this._status.user?.avatar,
    }
  }

  /**
   * 设置授权模式
   */
  setAuthMode(mode: 'tenant' | 'user'): void {
    this.authMode = mode
    if (this.config) {
      this.config = {
        ...this.config,
        authMode: mode,
      } as FeishuConfig
    }
  }

  /**
   * 获取当前配置（用于持久化）
   */
  getConfig(): FeishuConfig {
    return {
      appId: this.appId || '',
      appSecret: this.appSecret || '',
      authMode: this.authMode,
      userAccessToken: this.userAccessToken || undefined,
      userRefreshToken: this.userRefreshToken || undefined,
      tokenExpiresAt: this.tokenExpiresAt || undefined,
      userInfo: this.userInfo || undefined,
    }
  }

  /**
   * 发送飞书 API 请求（通过 Electron 主进程代理）
   */
  private async feishuRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      body?: object
    } = {}
  ): Promise<ConnectionResult<T>> {
    const headers = await this.getHeaders()
    if (!headers) {
      return { success: false, error: '获取访问令牌失败' }
    }

    const url = `${FEISHU_API_BASE}${endpoint}`

    try {
      const response = await this.proxyRequest(
        url,
        options.method || 'GET',
        headers,
        options.body
      )

      // 检查 HTTP 状态码
      if (response.status < 200 || response.status >= 300) {
        return {
          success: false,
          error: `请求失败: HTTP ${response.status}`,
        }
      }

      const parseResult = this.safeParseJson<{ code: number; msg?: string; data?: T }>(
        response.data,
        endpoint
      )

      if (!parseResult.success) {
        return parseResult as ConnectionResult<T>
      }

      const data = parseResult.data!

      // 飞书 API 返回格式: { code: 0, data: ..., msg: ... }
      if (data.code !== 0) {
        return {
          success: false,
          error: data.msg || `API 错误: ${data.code}`,
        }
      }

      return {
        success: true,
        data: data.data,
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
   * 获取用户信息
   */
  async getUser(userId?: string): Promise<ConnectionResult<FeishuUser>> {
    const endpoint = userId
      ? `/contact/v3/users/${userId}?user_id_type=open_id`
      : '/authen/v1/user_info'

    if (userId) {
      return this.feishuRequest<FeishuUser>(endpoint)
    } else {
      const result = await this.feishuRequest<{ user: FeishuUser }>(endpoint)
      if (result.success && result.data) {
        return { success: true, data: result.data.user }
      }
      return { success: false, error: result.error }
    }
  }

  // ==================== 知识空间与文档操作 ====================

  /**
   * 获取知识空间列表
   */
  async listSpaces(): Promise<ConnectionResult<FeishuWikiSpace[]>> {
    const result = await this.feishuRequest<{ items: FeishuWikiSpace[] }>(
      '/wiki/v2/spaces?page_size=50'
    )
    if (result.success && result.data) {
      return { success: true, data: result.data.items || [] }
    }
    return { success: false, error: result.error }
  }

  /**
   * 获取知识空间节点列表
   */
  async listNodes(spaceId: string, parentNodeToken?: string): Promise<ConnectionResult<FeishuWikiNode[]>> {
    let endpoint = `/wiki/v2/spaces/${spaceId}/nodes?page_size=50`
    if (parentNodeToken) {
      endpoint += `&parent_node_token=${parentNodeToken}`
    }
    const result = await this.feishuRequest<{ items: FeishuWikiNode[] }>(endpoint)
    if (result.success && result.data) {
      return { success: true, data: result.data.items || [] }
    }
    return { success: false, error: result.error }
  }

  /**
   * 获取文档内容
   */
  async getDoc(docToken: string): Promise<ConnectionResult<FeishuDocContent>> {
    return this.feishuRequest<FeishuDocContent>(`/docx/v1/documents/${docToken}/raw_content`)
  }

  /**
   * 创建文档
   */
  async createDoc(data: FeishuDocCreateRequest): Promise<ConnectionResult<{ document_id: string; title: string }>> {
    const result = await this.feishuRequest<{ document: { document_id: string; title: string } }>(
      '/docx/v1/documents',
      { method: 'POST', body: { title: data.title, folder_token: data.folder_token } }
    )
    if (result.success && result.data) {
      return { success: true, data: result.data.document }
    }
    return { success: false, error: result.error }
  }

  /**
   * 更新文档
   */
  async updateDoc(docToken: string, data: FeishuDocUpdateRequest): Promise<ConnectionResult<void>> {
    const result = await this.feishuRequest<void>(
      `/docx/v1/documents/${docToken}`,
      { method: 'PATCH', body: data }
    )
    return result
  }

  /**
   * 删除文档
   */
  async deleteDoc(docToken: string): Promise<ConnectionResult<void>> {
    return this.feishuRequest<void>(
      `/docx/v1/documents/${docToken}`,
      { method: 'DELETE' }
    )
  }

  /**
   * 在知识空间中创建文档节点
   */
  async createWikiNode(
    spaceId: string,
    parentToken: string,
    objType: 'doc' | 'docx',
    title: string
  ): Promise<ConnectionResult<{ node_token: string; obj_token: string }>> {
    const result = await this.feishuRequest<{ node: { node_token: string; obj_token: string } }>(
      `/wiki/v2/spaces/${spaceId}/nodes/create`,
      {
        method: 'POST',
        body: {
          parent_node_token: parentToken,
          obj_type: objType,
          title,
        },
      }
    )
    if (result.success && result.data) {
      return { success: true, data: result.data.node }
    }
    return { success: false, error: result.error }
  }

  /**
   * 销毁连接器
   */
  destroy(): void {
    this.appId = null
    this.appSecret = null
    this.tokenCache = null
    this.config = null
    // 清除 OAuth 相关字段
    this.authMode = 'tenant'
    this.userAccessToken = null
    this.userRefreshToken = null
    this.tokenExpiresAt = null
    this.userInfo = null
    this.resetStatus()
  }
}
