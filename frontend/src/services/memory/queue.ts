/**
 * 记忆更新队列模块
 * 
 * 负责防抖和批量处理记忆更新请求：
 * - 减少频繁的 LLM 调用
 * - 合并同一会话的多条消息
 * - 批量处理提高效率
 */

import type { QueueItem, ConversationMessage, MemoryConfig } from './types'

/**
 * 更新处理器类型
 */
export type UpdateHandler = (threadId: string, messages: ConversationMessage[]) => Promise<boolean>

/**
 * 记忆更新队列
 */
export class MemoryUpdateQueue {
  private queue: QueueItem[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private processing: boolean = false
  private debounceMs: number
  private handler: UpdateHandler | null = null

  constructor(debounceMs: number = 30000) {
    this.debounceMs = debounceMs
  }

  /**
   * 设置更新处理器
   */
  setHandler(handler: UpdateHandler): void {
    this.handler = handler
  }

  /**
   * 添加消息到队列
   * 同一线程的消息会被合并
   */
  add(threadId: string, messages: ConversationMessage[]): void {
    if (messages.length === 0) {
      return
    }

    // 移除同一线程的旧消息
    this.queue = this.queue.filter(item => item.threadId !== threadId)

    // 添加新消息
    this.queue.push({
      threadId,
      messages,
      timestamp: Date.now(),
    })

    // 重置计时器
    this.resetTimer()
  }

  /**
   * 重置防抖计时器
   */
  private resetTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.processQueue()
    }, this.debounceMs)
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.handler) {
      return
    }

    this.processing = true
    const items = [...this.queue]
    this.queue = []
    this.timer = null

    console.log(`[MemoryQueue] 开始处理 ${items.length} 个更新请求`)

    for (const item of items) {
      try {
        await this.handler(item.threadId, item.messages)
      } catch (error) {
        console.error(`[MemoryQueue] 处理失败 (thread: ${item.threadId}):`, error)
      }

      // 批量处理时添加延迟，避免 API 限流
      if (items.length > 1) {
        await this.sleep(500)
      }
    }

    this.processing = false
    console.log('[MemoryQueue] 队列处理完成')

    // 如果在处理过程中有新消息加入，继续处理
    if (this.queue.length > 0) {
      this.resetTimer()
    }
  }

  /**
   * 立即处理队列（不等待防抖）
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.processQueue()
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * 获取队列长度
   */
  get length(): number {
    return this.queue.length
  }

  /**
   * 是否正在处理
   */
  get isProcessing(): boolean {
    return this.processing
  }

  /**
   * 辅助函数：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 全局队列实例
 */
let queueInstance: MemoryUpdateQueue | null = null

/**
 * 初始化队列
 */
export function initMemoryQueue(config: MemoryConfig): MemoryUpdateQueue {
  if (!queueInstance) {
    queueInstance = new MemoryUpdateQueue(config.debounceMs)
  }
  return queueInstance
}

/**
 * 获取队列实例
 */
export function getMemoryQueue(): MemoryUpdateQueue {
  if (!queueInstance) {
    throw new Error('[MemoryQueue] 队列未初始化，请先调用 initMemoryQueue')
  }
  return queueInstance
}