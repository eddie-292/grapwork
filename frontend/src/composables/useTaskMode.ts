/**
 * 任务模式核心逻辑 Composable
 * 将 ChatView.vue 中的任务模式相关逻辑抽离到此文件
 */

import { ref, computed, type Ref } from 'vue'
import type {
  Task,
  TaskModeOptions,
  TaskModeState,
  TaskStatus,
  Message,
  TaskExecutionContext,
  TaskExecutionResult,
  IntermediateMergeResult
} from '../types/task'

/**
 * 任务规划提示词
 */
const TASK_PLANNING_PROMPT = `你是一个任务规划助手。请将用户的请求分解为一系列清晰、具体的子任务。

请按照以下 JSON 格式返回任务列表：
\`\`\`json
{
  "tasks": [
    {
      "id": 1,
      "description": "任务描述"
    }
  ]
}
\`\`\`

要求：
1. 任务要具体、可执行
2. 任务之间要有逻辑顺序
3. 通常 3-6 个任务为宜
4. 只返回 JSON，不要有其他文字`

/**
 * Qwen 思考标签流式解析器
 */
interface QwenStreamParser {
  reasoningBuffer: string
  contentBuffer: string
  state: 'NORMAL' | 'IN_THINK_CONTENT'
  tagBuffer: string
}

/**
 * 错误类型
 */
export enum TaskErrorType {
  PLANNING_FAILED = 'planning_failed',
  EXECUTION_FAILED = 'execution_failed',
  MERGE_FAILED = 'merge_failed',
  SUMMARIZE_FAILED = 'summarize_failed',
  API_ERROR = 'api_error',
  PARSE_ERROR = 'parse_error',
  ABORTED = 'aborted'
}

/**
 * 任务错误类
 */
export class TaskError extends Error {
  constructor(
    public type: TaskErrorType,
    message: string,
    public taskId?: number,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'TaskError'
  }
}

/**
 * useTaskMode Composable
 */
export function useTaskMode(
  currentChat: Ref<any>,
  activeConfig: Ref<any>,
  activeAssistant: Ref<any>,
  controller: Ref<AbortController | null>,
  onMessageUpdate: () => void
) {
  // ============ 状态管理 ============
  const state = ref<TaskModeState>({
    isTaskPlanning: false,
    isTaskExecuting: false,
    awaitingTaskConfirmation: false,
    currentTaskIndex: -1,
    pendingTasks: [],
    taskList: []
  })

  const stats = ref({
    totalApiCalls: 0,
    totalTokens: 0
  })

  // ============ Computed ============
  const taskList = computed(() => currentChat.value?.taskList ?? [])
  const taskModeOptions = computed(() => currentChat.value?.taskModeOptions ?? {})

  // ============ 辅助函数 ============

  /**
   * 创建 Qwen 流式解析器
   */
  function createQwenStreamParser(): QwenStreamParser {
    return {
      reasoningBuffer: '',
      contentBuffer: '',
      state: 'NORMAL',
      tagBuffer: ''
    }
  }

  /**
   * 解析流式 delta
   */
  function parseQwenStreamDelta(
    parser: QwenStreamParser,
    delta: string
  ): { reasoning: string; content: string } {
    const OPEN_TAG = ''
    const CLOSE_TAG = ''

    let result = { reasoning: '', content: '' }

    for (const char of delta) {
      switch (parser.state) {
        case 'NORMAL':
          if (char === OPEN_TAG[parser.tagBuffer.length]) {
            parser.tagBuffer += char
            if (parser.tagBuffer === OPEN_TAG) {
              parser.state = 'IN_THINK_CONTENT'
              parser.tagBuffer = ''
            }
          } else {
            if (parser.tagBuffer) {
              parser.contentBuffer += parser.tagBuffer
              result.content += parser.tagBuffer
              parser.tagBuffer = ''
            }
            parser.contentBuffer += char
            result.content += char
          }
          break

        case 'IN_THINK_CONTENT':
          if (char === CLOSE_TAG[parser.tagBuffer.length]) {
            parser.tagBuffer += char
            if (parser.tagBuffer === CLOSE_TAG) {
              parser.state = 'NORMAL'
              parser.tagBuffer = ''
            }
          } else {
            if (parser.tagBuffer) {
              parser.reasoningBuffer += parser.tagBuffer
              result.reasoning += parser.tagBuffer
              parser.tagBuffer = ''
            }
            parser.reasoningBuffer += char
            result.reasoning += char
          }
          break
      }
    }

    return result
  }

  /**
   * 规范化 API URL
   */
  function normalizeApiUrl(url: string) {
    return url.replace(/\/+$/, '')
  }

  /**
   * 生成任务执行提示
   */
  function generateTaskPrompt(
    taskDescription: string,
    previousResult?: string,
    mergedContext?: string
  ): string {
    if (mergedContext) {
      return `请执行以下任务：

任务：${taskDescription}

前面任务的整合结果：
${mergedContext}

请专注于完成当前任务，保持简洁清晰。`
    } else if (previousResult) {
      return `请执行以下任务：

任务：${taskDescription}

上一个任务的结果总结：${previousResult}

请专注于完成当前任务，保持简洁清晰。`
    }
    return `请执行以下任务：

任务：${taskDescription}

请专注于完成这个任务，保持简洁清晰。`
  }

  /**
   * 解析 extra_body 参数
   */
  function parseExtraBody(extraBody?: string): Record<string, any> {
    if (!extraBody || !extraBody.trim()) return {}
    try {
      return JSON.parse(extraBody)
    } catch (e) {
      console.error('Failed to parse extra_body:', e)
      return {}
    }
  }

  /**
   * 构建消息列表
   */
  function buildMessages(
    conversationHistory: Message[],
    taskPrompt: string
  ): { role: string; content: string }[] {
    const messagesToSend: { role: string; content: string }[] = []

    // 添加 system prompt
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      messagesToSend.push({
        role: 'system',
        content: activeAssistant.value.systemPrompt.trim()
      })
    } else {
      messagesToSend.push({
        role: 'system',
        content: '你是一个有用的助手'
      })
    }

    // 添加对话历史
    conversationHistory.forEach(msg => {
      messagesToSend.push({ role: msg.role, content: msg.content })
    })

    // 添加任务提示
    messagesToSend.push({ role: 'user', content: taskPrompt })

    return messagesToSend
  }

  /**
   * 发送消息到 LLM（非流式）
   */
  async function sendMessageToLLM(messages: { role: string; content: string }[]): Promise<string> {
    if (!activeConfig.value?.apiKey) {
      throw new TaskError(TaskErrorType.API_ERROR, '请先配置并启用一个 LLM 接口')
    }

    const extraBodyParams = parseExtraBody(activeConfig.value?.extra_body)
    const apiBase = normalizeApiUrl(activeConfig.value.apiUrl)

    stats.value.totalApiCalls++

    try {
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeConfig.value.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeConfig.value.model,
          messages: messages,
          stream: false,
          ...extraBodyParams,
        }),
      })

      if (!resp.ok) {
        throw new TaskError(
          TaskErrorType.API_ERROR,
          `API request failed: ${resp.statusText}`,
          undefined,
          new Error(resp.statusText)
        )
      }

      const data = await resp.json()
      let content = data.choices?.[0]?.message?.content || ''

      // Qwen 模型在非流式输出中会携带 标签，需要移除
      content = content.replace(/<think[\s\S]*?<\/think>/g, '').trim()

      return content
    } catch (error) {
      if (error instanceof TaskError) throw error
      throw new TaskError(
        TaskErrorType.API_ERROR,
        `API 请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        undefined,
        error instanceof Error ? error : undefined
      )
    }
  }

  // ============ 核心功能函数 ============

  /**
   * 任务规划：获取任务列表
   */
  async function planTasks(userInput: string): Promise<Task[]> {
    state.value.isTaskPlanning = true

    try {
      const planningPrompt = `${TASK_PLANNING_PROMPT}\n\n用户请求：${userInput}`
      const messagesToSend = [
        {
          role: 'system',
          content: activeAssistant.value?.systemPrompt || '你是一个有用的助手'
        },
        { role: 'user', content: planningPrompt }
      ]

      const response = await sendMessageToLLM(messagesToSend)

      // 解析 JSON 响应
      try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
        const parsed = JSON.parse(jsonStr)

        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          return parsed.tasks.map((t: any, i: number) => ({
            id: i,
            description: t.description,
            completed: false,
            status: 'pending' as TaskStatus
          }))
        }

        throw new TaskError(TaskErrorType.PARSE_ERROR, '无效的响应格式')
      } catch (e) {
        console.error('Failed to parse task list:', e)
        console.error('Response:', response)
        throw new TaskError(
          TaskErrorType.PARSE_ERROR,
          '无法解析任务列表，请重试',
          undefined,
          e instanceof Error ? e : undefined
        )
      }
    } finally {
      state.value.isTaskPlanning = false
    }
  }

  /**
   * 流式执行单个任务
   */
  async function executeTaskStreaming(
    context: TaskExecutionContext,
    onDelta: (delta: string) => void,
    onReasoningDelta: (delta: string) => void,
    onReasoningDuration: (duration: number) => void
  ): Promise<void> {
    if (!activeConfig.value?.apiUrl || !activeConfig.value?.apiKey) {
      throw new TaskError(TaskErrorType.API_ERROR, '请先配置并启用一个 LLM 接口')
    }

    const prompt = generateTaskPrompt(
      context.taskDescription,
      context.previousResult,
      context.mergedContext
    )

    const messagesToSend = buildMessages(context.conversationHistory, prompt)
    const extraBodyParams = parseExtraBody(activeConfig.value?.extra_body)
    const apiBase = normalizeApiUrl(activeConfig.value.apiUrl!)

    // 获取对话级别的参数配置
    const chatParams = currentChat.value?.params || {}
    const validParams: Record<string, any> = {}
    for (const [key, value] of Object.entries(chatParams)) {
      if (value !== undefined) {
        if (key === 'max_tokens' && value <= 0) continue
        validParams[key] = value
      }
    }

    stats.value.totalApiCalls++

    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeConfig.value.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeConfig.value.model,
        messages: messagesToSend,
        stream: true,
        ...validParams,
        ...extraBodyParams,
      }),
      signal: controller.value!.signal,
    })

    if (!resp.ok) {
      throw new TaskError(
        TaskErrorType.EXECUTION_FAILED,
        `任务执行失败: ${resp.statusText}`,
        context.taskIndex,
        new Error(resp.statusText)
      )
    }

    if (!resp.body) {
      throw new TaskError(TaskErrorType.EXECUTION_FAILED, 'No response body', context.taskIndex)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reasoningStartTime = Date.now()
    const qwenParser = createQwenStreamParser()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue

          const data = line.slice(5).trim()
          if (data === '[DONE]') break

          try {
            const json = JSON.parse(data)

            // DeepSeek 格式
            let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
            if (!reasoning_delta) {
              reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
            }

            if (reasoning_delta) {
              onReasoningDelta(reasoning_delta)
              onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
            }

            let delta = json?.choices?.[0]?.delta?.content ?? ''

            // Qwen 格式
            if (delta) {
              const parsed = parseQwenStreamDelta(qwenParser, delta)
              if (parsed.reasoning) {
                onReasoningDelta(parsed.reasoning)
                onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
              }
              if (parsed.content) {
                onDelta(parsed.content)
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TaskError(TaskErrorType.ABORTED, '任务已取消', context.taskIndex)
      }
      throw error
    }
  }

  /**
   * 总结任务执行结果
   */
  async function summarizeTaskResult(taskDescription: string, result: string): Promise<string> {
    const summarizePrompt = `请简洁总结以下任务的执行结果（1-2句话）：

任务：${taskDescription}

结果：
${result}

只返回总结内容，不要有其他文字。`

    const messagesToSend: { role: string; content: string }[] = []
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
    } else {
      messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
    }
    messagesToSend.push({ role: 'user', content: summarizePrompt })

    stats.value.totalApiCalls++

    try {
      return await sendMessageToLLM(messagesToSend)
    } catch (error) {
      throw new TaskError(
        TaskErrorType.SUMMARIZE_FAILED,
        '任务总结失败',
        undefined,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * 执行中间整合
   */
  async function performIntermediateMerge(
    conversationHistory: Message[],
    completedTaskCount: number,
    totalTaskCount: number
  ): Promise<string> {
    const mergePrompt = `请将以下已完成任务的执行结果整合成一段连贯的总结，这段总结将作为后续任务的上下文。

已完成的任务数量：${completedTaskCount + 1}/${totalTaskCount}

请整合这些任务的结果，提取关键信息和中间结论，为后续任务提供清晰的上下文。

只返回整合后的内容，不要有其他文字。`

    const messagesToSend: { role: string; content: string }[] = []
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
    } else {
      messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
    }

    conversationHistory.forEach(msg => {
      messagesToSend.push({ role: msg.role, content: msg.content })
    })

    messagesToSend.push({ role: 'user', content: mergePrompt })

    stats.value.totalApiCalls++

    try {
      return await sendMessageToLLM(messagesToSend)
    } catch (error) {
      throw new TaskError(
        TaskErrorType.MERGE_FAILED,
        '中间整合失败',
        undefined,
        error instanceof Error ? error : undefined
      )
    }
  }

  // ============ 公开方法 ============

  /**
   * 启动任务模式
   */
  async function startTaskMode(userInput: string) {
    const chat = currentChat.value
    if (!chat) return

    // 标记为任务模式会话
    chat.isTaskMode = true

    try {
      // 任务规划
      const tasks = await planTasks(userInput)

      // 保存到会话
      chat.taskList = tasks
      state.value.pendingTasks = tasks
      state.value.taskList = tasks

      // 检查是否自动执行
      if (taskModeOptions.value.autoExecute) {
        return { shouldConfirm: false, tasks }
      } else {
        state.value.awaitingTaskConfirmation = true
        return { shouldConfirm: true, tasks }
      }
    } catch (error) {
      if (error instanceof TaskError) {
        throw error
      }
      throw new TaskError(
        TaskErrorType.PLANNING_FAILED,
        '任务规划失败',
        undefined,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * 确认任务执行
   */
  function confirmTaskExecution() {
    state.value.awaitingTaskConfirmation = false
  }

  /**
   * 取消任务执行
   */
  function cancelTaskExecution() {
    state.value.awaitingTaskConfirmation = false
    state.value.pendingTasks = []
    state.value.isTaskPlanning = false
    state.value.isTaskExecuting = false
    state.value.currentTaskIndex = -1
  }

  /**
   * 获取统计信息
   */
  function getStats() {
    return {
      ...stats.value,
      totalTasks: state.value.taskList.length,
      completedTasks: state.value.taskList.filter(t => t.completed).length
    }
  }

  /**
   * 重置状态
   */
  function reset() {
    state.value = {
      isTaskPlanning: false,
      isTaskExecuting: false,
      awaitingTaskConfirmation: false,
      currentTaskIndex: -1,
      pendingTasks: [],
      taskList: []
    }
    stats.value = {
      totalApiCalls: 0,
      totalTokens: 0
    }
  }

  return {
    // 状态
    state: state.value,
    stats,

    // 核心方法
    startTaskMode,
    confirmTaskExecution,
    cancelTaskExecution,

    // 任务执行相关
    executeTaskStreaming,
    summarizeTaskResult,
    performIntermediateMerge,

    // 工具方法
    getStats,
    reset
  }
}
