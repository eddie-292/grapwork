/**
 * Loop 任务执行引擎
 * 负责执行不同类型的任务
 */
import type { LoopTask, LoopTaskExecution } from '../src/types/loop'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 执行选项
interface ExecOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  maxBuffer?: number
}

// Chat 配置接口
interface ChatConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
}

// 获取所有 Chat 配置的回调类型
export type GetChatConfigsCallback = () => ChatConfig[]

export class LoopExecutor {
  private getChatConfigs: GetChatConfigsCallback | null = null
  private defaultConfigIndex: number | undefined = undefined

  /**
   * 设置获取 Chat 配置列表的回调
   */
  setChatConfigProvider(callback: GetChatConfigsCallback): void {
    this.getChatConfigs = callback
  }

  /**
   * 设置全局默认配置索引
   */
  setDefaultConfigIndex(index: number | undefined): void {
    this.defaultConfigIndex = index
  }

  /**
   * 获取全局默认配置索引
   */
  getDefaultConfigIndex(): number | undefined {
    return this.defaultConfigIndex
  }

  /**
   * 获取指定的配置（按索引或默认启用配置）
   * 优先级：任务指定索引 > 全局默认索引 > 第一个启用的配置
   */
  private getConfig(configIndex?: number): ChatConfig | null {
    if (!this.getChatConfigs) return null

    const configs = this.getChatConfigs()
    if (!configs || configs.length === 0) return null

    // 如果任务指定了索引，使用该索引
    if (configIndex !== undefined && configIndex >= 0 && configIndex < configs.length) {
      return configs[configIndex]
    }

    // 如果设置了全局默认索引，使用它
    if (this.defaultConfigIndex !== undefined && this.defaultConfigIndex >= 0 && this.defaultConfigIndex < configs.length) {
      return configs[this.defaultConfigIndex]
    }

    // 否则使用第一个启用的配置
    const enabledConfig = configs.find(c => c.enabled)
    return enabledConfig || null
  }

  /**
   * 执行任务
   */
  async execute(task: LoopTask, timeout: number = 30000): Promise<LoopTaskExecution> {
    const executionId = `${task.id}-${Date.now()}`
    const startedAt = Date.now()

    try {
      let result: any

      switch (task.type) {
        case 'command':
          result = await this.executeCommand(task, timeout)
          break
        case 'chat':
          result = await this.executeChat(task, timeout)
          break
        case 'skill':
          result = await this.executeSkill(task, timeout)
          break
        case 'api':
          result = await this.executeApi(task, timeout)
          break
        default:
          throw new Error(`未知的任务类型: ${task.type}`)
      }

      return {
        id: executionId,
        taskId: task.id,
        startedAt,
        completedAt: Date.now(),
        status: 'success',
        result,
        retryCount: 0
      }
    } catch (error: any) {
      return {
        id: executionId,
        taskId: task.id,
        startedAt,
        completedAt: Date.now(),
        status: 'error',
        error: error.message || String(error),
        retryCount: 0
      }
    }
  }

  /**
   * 执行命令类型任务
   */
  private async executeCommand(task: LoopTask, timeout: number): Promise<any> {
    const { command, cwd } = task.payload
    if (!command) {
      throw new Error('命令不能为空')
    }

    const options: ExecOptions = {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    }

    try {
      const { stdout, stderr } = await execAsync(command, options)
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0
      }
    } catch (error: any) {
      // execAsync 在非零退出码时也会抛出错误，但包含 stdout/stderr
      if (error.stdout !== undefined || error.stderr !== undefined) {
        return {
          stdout: (error.stdout || '').trim(),
          stderr: (error.stderr || '').trim(),
          exitCode: error.code || 1,
          error: error.message
        }
      }
      throw error
    }
  }

  /**
   * 执行聊天类型任务
   */
  private async executeChat(task: LoopTask, timeout: number): Promise<any> {
    const { prompt, configIndex } = task.payload
    if (!prompt) {
      throw new Error('提示词不能为空')
    }

    // 获取指定的配置
    const config = this.getConfig(configIndex)
    if (!config || !config.apiKey || !config.apiUrl) {
      console.log(`[LoopExecutor] Chat task "${task.name}" skipped: no valid config (configIndex: ${configIndex})`)
      return {
        type: 'chat',
        prompt,
        status: 'skipped',
        message: '没有有效的 LLM 配置，任务已跳过'
      }
    }

    console.log(`[LoopExecutor] Executing chat task "${task.name}" with model ${config.model} (${config.name})`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API 错误 (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '无响应内容'

      return {
        type: 'chat',
        prompt,
        response: content,
        model: config.model,
        configName: config.name,
        status: 'success'
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`LLM 请求超时 (${timeout}ms)`)
      }
      throw error
    }
  }

  /**
   * 执行技能类型任务
   */
  private async executeSkill(task: LoopTask, _timeout: number): Promise<any> {
    const { skillId, skillArgs } = task.payload
    if (!skillId) {
      throw new Error('技能ID不能为空')
    }

    console.log(`[LoopExecutor] Skill task "${task.name}" ready for execution`)

    return {
      type: 'skill',
      skillId,
      skillArgs: skillArgs || {},
      status: 'pending_skill_call',
      message: '任务已准备好，等待技能执行'
    }
  }

  /**
   * 执行 API 类型任务
   */
  private async executeApi(task: LoopTask, timeout: number): Promise<any> {
    const { apiUrl, method = 'GET', headers = {}, body } = task.payload
    if (!apiUrl) {
      throw new Error('API URL 不能为空')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        signal: controller.signal
      }

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body)
      }

      const response = await fetch(apiUrl, fetchOptions)
      clearTimeout(timeoutId)

      const contentType = response.headers.get('content-type')
      let data: any

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return {
        status: response.status,
        statusText: response.statusText,
        data
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error(`请求超时 (${timeout}ms)`)
      }
      throw error
    }
  }
}

// 导出单例
export const loopExecutor = new LoopExecutor()
