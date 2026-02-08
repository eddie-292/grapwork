/**
 * 任务模式核心逻辑 Composable
 * 将 ChatView.vue 中的任务模式相关逻辑抽离到此文件
 */

import { ref, computed, type Ref } from 'vue'
import { WorkingMemoryType } from '../types/task'
import type {
  Task,
  TaskModeState,
  TaskStatus,
  Message,
  TaskExecutionContext
} from '../types/task'
import type { OpenAIToolCall } from '../types/mcp'
import { useWorkingMemory } from './useWorkingMemory'
import { useGlobalMemory } from './useGlobalMemory'

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
3. 通常 3-6 个子任务为宜
4. **最后一个任务必须是整合验证任务**，格式为："整合验证：将以上所有子任务的输出进行整合、验证和完善，确保最终结果完整、准确、连贯"
5. 只返回 JSON，不要有其他文字

示例：
\`\`\`json
{
  "tasks": [
    {"id": 1, "description": "分析用户需求"},
    {"id": 2, "description": "设计系统架构"},
    {"id": 3, "description": "实现核心功能"},
    {"id": 4, "description": "整合验证：将以上所有子任务的输出进行整合、验证和完善，确保最终结果完整、准确、连贯"}
  ]
}
\`\`\``

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
  _onMessageUpdate: () => void,
  mcpManager?: any  // MCP 管理器（可选）
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

  // ============ 工作记忆管理 ============
  let workingMemoryManager: ReturnType<typeof useWorkingMemory> | null = null

  function initWorkingMemory(chatId: string) {
    workingMemoryManager = useWorkingMemory(chatId)
    workingMemoryManager.load()
  }

  // ============ 全局记忆管理 ============
  const globalMemoryManager = useGlobalMemory()

  // 初始化时加载全局记忆
  globalMemoryManager.load()

  // ============ Computed ============
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
    mergedContext?: string,
    workingMemoryContext?: string,
    globalMemoryContext?: string  // 新增：全局记忆上下文
  ): string {
    let prompt = `请执行以下任务：\n\n任务：${taskDescription}\n\n`

    // 构建上下文部分
    const contextParts: string[] = []

    // 全局记忆放在最前面（最高优先级）
    if (globalMemoryContext) {
      contextParts.push(globalMemoryContext)
    }

    if (mergedContext) {
      contextParts.push(`前面任务的整合结果：\n${mergedContext}`)
    }

    if (previousResult) {
      contextParts.push(`上一个任务的结果总结：${previousResult}`)
    }

    // 工作记忆上下文
    if (workingMemoryContext) {
      contextParts.push(`工作记忆（之前任务的积累）：\n${workingMemoryContext}`)
    }

    if (contextParts.length > 0) {
      prompt += contextParts.join('\n\n') + '\n\n'
    }

    prompt += '请专注于完成当前任务，保持简洁清晰。'
    return prompt
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
      const msgObj: any = { role: msg.role, content: msg.content }
      // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
      // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
      if (msg.role === 'assistant') {
        msgObj.reasoning_content = msg.reasoning || ''
      }
      messagesToSend.push(msgObj)
    })

    // 添加任务提示
    messagesToSend.push({ role: 'user', content: taskPrompt })

    return messagesToSend
  }

  /**
   * 保存任务结果到工作记忆
   */
  async function saveTaskResultToWorkingMemory(
    taskId: number,
    taskDescription: string,
    result: string,
    type: WorkingMemoryType
  ): Promise<void> {
    if (!workingMemoryManager) return

    // 检查是否启用工作记忆（默认启用）
    const options = taskModeOptions.value
    const enabled = options.workingMemory?.enabled ?? true
    if (!enabled) return

    await workingMemoryManager.addEntry(type, taskId, taskDescription, result)
  }

  /**
   * 获取下一个任务的工作记忆上下文（原始数据）
   */
  function getWorkingMemoryForNextTask(taskId: number): {
    previousNotes?: string
    previousDrafts?: string
    previousFinalResults?: string
  } {
    if (!workingMemoryManager) return {}

    const allEntries = workingMemoryManager.allEntries.value
    const previousTasks = allEntries
      .filter(e => e.taskId < taskId)
      .sort((a, b) => a.taskId - b.taskId)

    return {
      previousNotes: previousTasks
        .filter(e => e.type === 'notes')
        .map(e => `任务${e.taskId + 1}笔记: ${e.content}`)
        .join('\n\n'),
      previousDrafts: previousTasks
        .filter(e => e.type === 'drafts')
        .map(e => `任务${e.taskId + 1}草稿: ${e.content}`)
        .join('\n\n'),
      previousFinalResults: previousTasks
        .filter(e => e.type === 'final')
        .map(e => `任务${e.taskId + 1}结果: ${e.content}`)
        .join('\n\n')
    }
  }

  /**
   * 合并工作记忆（调用 LLM）
   */
  async function mergeWorkingMemory(
    notes?: string,
    drafts?: string,
    finalResults?: string
  ): Promise<string> {
    const parts: string[] = []

    if (notes) parts.push(`笔记：\n${notes}`)
    if (drafts) parts.push(`草稿：\n${drafts}`)
    if (finalResults) parts.push(`最终结果：\n${finalResults}`)

    if (parts.length === 0) return ''

    const content = parts.join('\n\n')

    // 如果内容较短，不需要合并
    if (content.length < 2000) return content

    const mergePrompt = `请将以下工作记忆内容整合成一段简洁的总结，保留关键信息和中间结论：

${content}

要求：
1. 提取关键信息，去除冗余
2. 保持逻辑连贯
3. 使用清晰的层次结构
4. 只返回整合后的内容，不要有其他文字`

    const messagesToSend: { role: string; content: string }[] = []
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
    } else {
      messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
    }
    messagesToSend.push({ role: 'user', content: mergePrompt })

    stats.value.totalApiCalls++

    try {
      return await sendMessageToLLM(messagesToSend)
    } catch (error) {
      console.error('工作记忆合并失败，使用原始内容：', error)
      return content
    }
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
        // 尝试读取响应体中的错误详情
        let errorMessage = `API request failed: ${resp.statusText}`
        try {
          const errorData = await resp.json()
          if (errorData.error?.message) {
            errorMessage = errorData.error.message
          }
        } catch {
          // 如果无法解析 JSON，使用默认错误消息
        }
        throw new TaskError(
          TaskErrorType.API_ERROR,
          errorMessage,
          undefined,
          new Error(errorMessage)
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
    onReasoningDuration: (duration: number) => void,
    onToolCalls?: (toolCalls: OpenAIToolCall[]) => Promise<void>  // 新增：工具调用回调
  ): Promise<{ toolCalls?: OpenAIToolCall[] }> {  // 返回可能包含的工具调用
    if (!activeConfig.value?.apiUrl || !activeConfig.value?.apiKey) {
      throw new TaskError(TaskErrorType.API_ERROR, '请先配置并启用一个 LLM 接口')
    }

    // 生成智能匹配的全局记忆上下文
    const globalMemoryContext = globalMemoryManager.generateInjectContext(context.taskDescription)

    const prompt = generateTaskPrompt(
      context.taskDescription,
      context.previousResult,
      context.mergedContext,
      context.workingMemoryContext,  // 工作记忆上下文
      globalMemoryContext  // 全局记忆上下文
    )

    const messagesToSend = buildMessages(context.conversationHistory, prompt)
    const extraBodyParams = parseExtraBody(activeConfig.value?.extra_body)
    const apiBase = normalizeApiUrl(activeConfig.value.apiUrl!)

    // 获取对话级别的参数配置
    const chatParams = currentChat.value?.params || {}
    const validParams: Record<string, any> = {}
    for (const [key, value] of Object.entries(chatParams)) {
      if (value !== undefined) {
        if (key === 'max_tokens' && typeof value === 'number' && value <= 0) continue
        validParams[key] = value
      }
    }

    stats.value.totalApiCalls++

    // 生成 MCP tools 数组（如果有激活的工具）
    const mcpTools = mcpManager?.generateOpenAITools ? mcpManager.generateOpenAITools() : []

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
        ...(mcpTools.length > 0 ? { tools: mcpTools } : {}),
        ...validParams,
        ...extraBodyParams,
      }),
      signal: controller.value!.signal,
    })

    if (!resp.ok) {
      // 尝试读取响应体中的错误详情
      let errorMessage = `任务执行失败 (${resp.status}): ${resp.statusText}`
      try {
        const errorData = await resp.json()
        if (errorData.error?.message) {
          errorMessage = errorData.error.message
        }
      } catch {
        // 如果无法解析 JSON，使用默认错误消息
      }
      throw new TaskError(
        TaskErrorType.EXECUTION_FAILED,
        errorMessage,
        context.taskIndex,
        new Error(errorMessage)
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

    // 用于收集 tool_calls
    const currentToolCallsMap: Map<number, OpenAIToolCall> = new Map()

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

            // 处理 tool_calls
            const deltaToolCalls = json?.choices?.[0]?.delta?.tool_calls
            if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
              for (const toolCall of deltaToolCalls) {
                const index = toolCall.index
                if (index !== undefined) {
                  if (!currentToolCallsMap.has(index)) {
                    currentToolCallsMap.set(index, {
                      id: toolCall.id || '',
                      type: toolCall.type || 'function',
                      function: {
                        name: toolCall.function?.name || '',
                        arguments: toolCall.function?.arguments || ''
                      }
                    })
                  } else {
                    const existing = currentToolCallsMap.get(index)!
                    if (toolCall.id) existing.id = toolCall.id
                    if (toolCall.function?.name) existing.function.name = toolCall.function.name
                    if (toolCall.function?.arguments) {
                      existing.function.arguments += toolCall.function.arguments
                    }
                  }
                }
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 流结束后，返回 tool_calls
      const finalToolCalls = Array.from(currentToolCallsMap.values())
      if (finalToolCalls.length > 0) {
        console.log('[TaskMode] Tool calls detected:', finalToolCalls)
        return { toolCalls: finalToolCalls }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TaskError(TaskErrorType.ABORTED, '任务已取消', context.taskIndex)
      }
      throw error
    }

    return {}
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
      const msgObj: any = { role: msg.role, content: msg.content }
      // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
      // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
      if (msg.role === 'assistant') {
        msgObj.reasoning_content = msg.reasoning || ''
      }
      messagesToSend.push(msgObj)
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

    // 工作记忆相关
    initWorkingMemory,
    saveTaskResultToWorkingMemory,
    getWorkingMemoryForNextTask,
    mergeWorkingMemory,

    // 全局记忆相关
    globalMemoryManager,

    // 工具方法
    getStats,
    reset
  }
}
