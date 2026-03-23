/**
 * 记忆系统主服务
 * 
 * 整合存储、更新、注入、队列模块，提供统一的 API
 */

import type {
  MemoryData,
  MemoryConfig,
  ConversationMessage,
} from './types'
import { DEFAULT_MEMORY_CONFIG as defaultConfig } from './types'
import type { IMemoryStore } from './store'
import { initMemoryStore } from './store'
import { formatMemoryForInjection, injectMemoryIntoPrompt, getMemoryStats, isMemoryEmpty } from './injector'
import { buildUpdatePrompt, parseUpdateResponse, applyUpdates } from './updater'
import { MemoryUpdateQueue, initMemoryQueue } from './queue'

/**
 * LLM 调用函数类型
 */
export type LLMCallFunction = (prompt: string) => Promise<string>

/**
 * 记忆服务配置
 */
export interface MemoryServiceConfig {
  store: IMemoryStore
  llmCall: LLMCallFunction
  config?: Partial<MemoryConfig>
}

/**
 * 记忆服务
 * 单例模式
 */
export class MemoryService {
  private store: IMemoryStore
  private llmCall: LLMCallFunction
  private config: MemoryConfig
  private queue: MemoryUpdateQueue

  constructor(serviceConfig: MemoryServiceConfig) {
    this.store = serviceConfig.store
    this.llmCall = serviceConfig.llmCall
    this.config = { ...defaultConfig, ...serviceConfig.config }

    // 初始化存储
    initMemoryStore(this.store)

    // 初始化队列
    this.queue = initMemoryQueue(this.config)

    // 设置队列处理器
    this.queue.setHandler(this.handleUpdate.bind(this))
  }

  /**
   * 初始化记忆文件
   * 确保记忆文件存在
   */
  async initialize(): Promise<void> {
    await this.store.load()
    console.log('[MemoryService] Memory file initialized')
  }

  /**
   * 设置 LLM 配置（用于当前会话）
   */
  setLlmConfig(config: { apiUrl: string; apiKey: string; model: string }): void {
    this._currentLlmConfig = config
  }

  /**
   * 获取当前 LLM 配置
   */
  private _currentLlmConfig: { apiUrl: string; apiKey: string; model: string } | null = null

  /**
   * 获取记忆数据
   */
  async getMemory(): Promise<MemoryData> {
    return await this.store.load()
  }

  /**
   * 保存记忆数据
   */
  async saveMemory(data: MemoryData): Promise<boolean> {
    return await this.store.save(data)
  }

  /**
   * 清空记忆
   */
  async clearMemory(): Promise<boolean> {
    return await this.store.clear()
  }

  /**
   * 获取格式化的记忆文本（用于注入）
   */
  async getFormattedMemory(maxTokens?: number): Promise<string> {
    const memory = await this.getMemory()
    return formatMemoryForInjection(memory, {
      maxTokens: maxTokens || this.config.maxInjectionTokens,
    })
  }

  /**
   * 将记忆注入到系统提示词
   */
  async injectMemory(basePrompt: string): Promise<string> {
    const memory = await this.getMemory()
    return injectMemoryIntoPrompt(basePrompt, memory, {
      maxTokens: this.config.maxInjectionTokens,
    })
  }

  /**
   * 请求更新记忆
   * 消息会被加入队列，防抖后批量处理
   */
  requestUpdate(threadId: string, messages: ConversationMessage[]): void {
    if (messages.length === 0) {
      return
    }
    this.queue.add(threadId, messages)
  }

  /**
   * 立即更新记忆（跳过队列）
   */
  async updateNow(threadId: string, messages: ConversationMessage[]): Promise<boolean> {
    return await this.handleUpdate(threadId, messages)
  }

  /**
   * 处理更新请求（队列处理器）
   */
  private async handleUpdate(threadId: string, messages: ConversationMessage[]): Promise<boolean> {
    try {
      console.log(`[MemoryService] 开始更新记忆 (thread: ${threadId})`)

      // 1. 获取当前记忆
      const currentMemory = await this.getMemory()

      // 2. 构建提示词
      const prompt = buildUpdatePrompt(currentMemory, messages)

      // 3. 调用 LLM（使用当前会话配置或默认配置）
      let llmCallToUse = this.llmCall
      if (this._currentLlmConfig) {
        // 使用当前会话的 LLM 配置
        const config = this._currentLlmConfig
        llmCallToUse = async (p: string) => {
          const response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages: [{ role: 'user', content: p }],
              temperature: 0.3,
            }),
          })
          if (!response.ok) {
            throw new Error(`LLM API error: ${response.status}`)
          }
          const data = await response.json()
          return data.choices?.[0]?.message?.content || ''
        }
      }

      const response = await llmCallToUse(prompt)

      // 4. 解析响应
      const updateData = parseUpdateResponse(response)
      if (!updateData) {
        console.warn('[MemoryService] 无法解析 LLM 响应')
        return false
      }

      // 5. 应用更新
      const updatedMemory = applyUpdates(currentMemory, updateData, threadId, this.config)

      // 6. 保存
      const saved = await this.saveMemory(updatedMemory)

      if (saved) {
        console.log('[MemoryService] 记忆更新成功')
      }

      return saved
    } catch (error) {
      console.error('[MemoryService] 更新记忆失败:', error)
      return false
    }
  }

  /**
   * 刷新队列（立即处理所有待处理项）
   */
  async flush(): Promise<void> {
    await this.queue.flush()
  }

  /**
   * 获取记忆统计信息
   */
  async getStats(): Promise<ReturnType<typeof getMemoryStats>> {
    const memory = await this.getMemory()
    return getMemoryStats(memory)
  }

  /**
   * 检查记忆是否为空
   */
  async isEmpty(): Promise<boolean> {
    const memory = await this.getMemory()
    return isMemoryEmpty(memory)
  }

  /**
   * 获取配置
   */
  getConfig(): MemoryConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
}

// ==================== 单例管理 ====================

let serviceInstance: MemoryService | null = null

/**
 * 初始化记忆服务
 */
export function initMemoryService(config: MemoryServiceConfig): MemoryService {
  if (serviceInstance) {
    console.warn('[MemoryService] 服务已初始化，将重新创建')
  }
  serviceInstance = new MemoryService(config)
  return serviceInstance
}

/**
 * 获取记忆服务实例
 */
export function getMemoryService(): MemoryService {
  if (!serviceInstance) {
    throw new Error('[MemoryService] 服务未初始化，请先调用 initMemoryService')
  }
  return serviceInstance
}

/**
 * 检查服务是否已初始化
 */
export function isMemoryServiceInitialized(): boolean {
  return serviceInstance !== null
}

// ==================== 便捷函数 ====================

/**
 * 便捷函数：获取记忆
 */
export async function getMemory(): Promise<MemoryData> {
  return await getMemoryService().getMemory()
}

/**
 * 便捷函数：获取格式化记忆
 */
export async function getFormattedMemory(maxTokens?: number): Promise<string> {
  return await getMemoryService().getFormattedMemory(maxTokens)
}

/**
 * 便捷函数：注入记忆到提示词
 */
export async function injectMemory(basePrompt: string): Promise<string> {
  return await getMemoryService().injectMemory(basePrompt)
}

/**
 * 便捷函数：请求更新记忆
 */
export function requestMemoryUpdate(threadId: string, messages: ConversationMessage[]): void {
  getMemoryService().requestUpdate(threadId, messages)
}

// ==================== 导出 ====================

export * from './types'
export * from './store'
export * from './injector'
export * from './updater'
export * from './queue'