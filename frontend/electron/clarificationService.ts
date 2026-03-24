/**
 * 澄清服务 - 主进程
 * 管理 AI Agent 的澄清请求，处理用户响应
 */

import { BrowserWindow } from 'electron'
import type {
  ClarificationRequest,
  ClarificationResponse,
  ClarificationState,
  ClarificationType
} from '../src/types/clarification'

/**
 * 澄清服务类
 * 负责管理澄清请求的生命周期，协调主进程与渲染进程之间的通信
 */
export class ClarificationService {
  private pendingRequest: ClarificationRequest | null = null
  private resolveCallback: ((response: ClarificationResponse) => void) | null = null
  private rejectCallback: ((error: Error) => void) | null = null

  /**
   * 请求用户澄清
   * 由 LLM Service 调用，返回 Promise 等待用户响应
   */
  async requestClarification(
    question: string,
    clarificationType: ClarificationType,
    context?: string,
    options?: string[]
  ): Promise<ClarificationResponse> {
    // 如果已有待处理的请求，先取消
    if (this.pendingRequest) {
      this.cancelRequest('New clarification request received')
    }

    // 创建新请求
    const request: ClarificationRequest = {
      id: this.generateId(),
      question,
      clarificationType,
      context,
      options,
      timestamp: Date.now()
    }

    // 设置待处理请求
    this.pendingRequest = request

    // 通知前端
    this.notifyRequestPending(request)

    // 返回 Promise，等待用户响应
    return new Promise((resolve, reject) => {
      this.resolveCallback = resolve
      this.rejectCallback = reject
    })
  }

  /**
   * 提交用户响应
   * 由前端通过 IPC 调用
   */
  submitResponse(response: ClarificationResponse): boolean {
    if (!this.pendingRequest || this.pendingRequest.id !== response.id) {
      console.warn('[ClarificationService] No matching pending request for response:', response.id)
      return false
    }

    // 清除待处理请求
    this.pendingRequest = null

    // 触发回调
    if (this.resolveCallback) {
      this.resolveCallback(response)
      this.resolveCallback = null
      this.rejectCallback = null
    }

    // 通知前端状态更新
    this.notifyStateChanged()

    return true
  }

  /**
   * 取消当前请求
   */
  cancelRequest(reason: string = 'User cancelled'): boolean {
    if (!this.pendingRequest) {
      return false
    }

    const requestId = this.pendingRequest.id
    this.pendingRequest = null

    // 触发拒绝回调
    if (this.rejectCallback) {
      this.rejectCallback(new Error(reason))
      this.resolveCallback = null
      this.rejectCallback = null
    }

    // 通知前端状态更新
    this.notifyStateChanged()

    console.log(`[ClarificationService] Request ${requestId} cancelled: ${reason}`)
    return true
  }

  /**
   * 获取当前待处理的请求
   */
  getPendingRequest(): ClarificationRequest | null {
    return this.pendingRequest
  }

  /**
   * 获取当前状态
   */
  getState(): ClarificationState {
    return {
      pending: this.pendingRequest,
      isWaiting: this.pendingRequest !== null
    }
  }

  /**
   * 检查是否有待处理的请求
   */
  hasPendingRequest(): boolean {
    return this.pendingRequest !== null
  }

  /**
   * 通知前端有新的澄清请求
   */
  private notifyRequestPending(request: ClarificationRequest): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('clarification:pending', request)
      }
    }
    console.log('[ClarificationService] Notified frontend of pending request:', request.id)
  }

  /**
   * 通知前端状态变化
   */
  private notifyStateChanged(): void {
    const state = this.getState()
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('clarification:stateChanged', state)
      }
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `clarification_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

// 单例实例
export const clarificationService = new ClarificationService()