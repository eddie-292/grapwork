/**
 * 基础连接器抽象类
 * 所有第三方服务连接器的基类
 */
import type {
  ConnectionType,
  ConnectionResult,
  ConnectionStatus,
  IConnection,
} from '@/types/connection'

export abstract class BaseConnection implements IConnection {
  abstract readonly type: ConnectionType
  abstract readonly name: string

  protected config: Record<string, unknown> | null = null
  protected _status: ConnectionStatus = { connected: false }

  /**
   * 初始化连接器
   */
  abstract initialize(config: Record<string, unknown>): Promise<ConnectionResult>

  /**
   * 检查连接状态
   */
  abstract checkConnection(): Promise<ConnectionStatus>

  /**
   * 获取当前连接状态
   */
  get status(): ConnectionStatus {
    return this._status
  }

  /**
   * 更新连接状态
   */
  protected updateStatus(status: Partial<ConnectionStatus>): void {
    this._status = { ...this._status, ...status, lastChecked: Date.now() }
  }

  /**
   * 重置连接状态
   */
  protected resetStatus(): void {
    this._status = { connected: false, lastChecked: Date.now() }
  }

  /**
   * 销毁连接器
   */
  destroy(): void {
    this.config = null
    this.resetStatus()
  }

  /**
   * 发送 HTTP 请求的通用方法
   */
  protected async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ConnectionResult<T>> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `HTTP ${response.status}`

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.errors?.[0]?.message || errorMessage
        } catch {
          // 如果不是 JSON，使用默认错误消息
        }

        return {
          success: false,
          error: errorMessage,
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data.data !== undefined ? data.data : data,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
