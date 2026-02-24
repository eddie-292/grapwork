<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import type { ConfigList, AssistantList } from '../types/electron'
// ============ TASK MODE - DISABLED ============
// import {
//   TaskStatus,
//   TaskError,
//   TaskErrorType,
//   formatTaskErrorMessage,
//   WorkingMemoryType
// } from '../types/task'
// import { useWorkingMemory } from '../composables/useWorkingMemory'
// import TaskModePanel from './TaskModePanel.vue'
// import TaskChat from './TaskChat.vue'
// =============================================
import { useGlobalMemory } from '../composables/useGlobalMemory'
import { useMCP } from '../composables/useMCP'
import { useSkills } from '../composables/useSkills'
import NormalChat from './NormalChat.vue'
import WorkspaceView from './WorkspaceView.vue'
import ChatTabBar from './ChatTabBar.vue'
import SaveToGlobalMemoryDialog from './SaveToGlobalMemoryDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
import { storage } from '../services/StorageService'
import SettingsIcon from './icons/SettingsIcon.vue'
import LogoutIcon from './icons/LogoutIcon.vue'
import XIcon from './icons/XIcon.vue'

const router = useRouter()

// ============ TASK MODE - DISABLED ============
// // 工作记忆管理器（初始化为 null，在任务开始时创建）
// let workingMemoryManager: ReturnType<typeof useWorkingMemory> | null = null
// =============================================

// 全局记忆管理器
const globalMemoryManager = useGlobalMemory()

// MCP 管理器
const mcpManager = useMCP()

// Skills 管理器
const skillsManager = useSkills()

// 快速保存到全局记忆对话框状态
const showSaveToGlobalMemoryDialog = ref(false)
const saveToGlobalMemoryContent = ref('')
const saveToGlobalMemoryKeywords = ref<string[]>([])

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// 退出登录确认对话框状态
const showLogoutConfirmDialog = ref(false)

// 命令确认对话框状态
const showCommandConfirmDialog = ref(false)
const pendingCommand = ref('')
const pendingCommandReason = ref('')
let commandConfirmResolve: ((confirmed: boolean) => void) | null = null

// 命令确认回调函数
async function handleCommandConfirm(command: string, reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    pendingCommand.value = command
    pendingCommandReason.value = reason
    commandConfirmResolve = resolve
    showCommandConfirmDialog.value = true
  })
}

// 用户确认执行命令
function onCommandConfirm() {
  showCommandConfirmDialog.value = false
  if (commandConfirmResolve) {
    commandConfirmResolve(true)
    commandConfirmResolve = null
  }
}

// 用户取消执行命令
function onCommandCancel() {
  showCommandConfirmDialog.value = false
  if (commandConfirmResolve) {
    commandConfirmResolve(false)
    commandConfirmResolve = null
  }
}

// 打开保存到全局记忆对话框
// function openSaveToGlobalMemoryDialog(content: string) {
//   saveToGlobalMemoryContent.value = content
//   saveToGlobalMemoryKeywords.value = extractKeywords(content)
//   showSaveToGlobalMemoryDialog.value = true
// }

type Role = 'user' | 'assistant' | 'system' | 'tool'
type Message = {
  role: Role
  content: string
  reasoning?: string
  reasoningDuration?: number
  visible?: boolean
  copyable?: boolean
  archived?: boolean
  // MCP Function Calling 相关
  tool_calls?: any[]
  tool_call_id?: string
  // 工具执行状态
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
}

// OpenAI 兼容的对话参数配置
type ChatParams = {
  temperature?: number      // 控制输出的随机性，0-2，默认 1
  top_p?: number           // 核采样，0-1，默认 1
  max_tokens?: number      // 最大生成 token 数
  presence_penalty?: number  // 存在惩罚，-2.0 到 2.0，默认 0
  frequency_penalty?: number // 频率惩罚，-2.0 到 2.0，默认 0
  seed?: number            // 随机种子
}

// 默认参数配置
const DEFAULT_CHAT_PARAMS: ChatParams = {
  temperature: 1,
  top_p: 1,
  max_tokens: 0,
  presence_penalty: 0,
  frequency_penalty: 0,
}

// Token 使用统计类型
type TokenUsage = {
  promptTokens: number      // 输入 token 数
  completionTokens: number  // 输出 token 数
  totalTokens: number       // 总 token 数
}

type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  assistantId?: string
  configId?: number
  sending?: boolean  // 当前会话的发送状态
  params?: ChatParams  // 对话级别的参数配置
  usage?: TokenUsage   // 累计的 token 使用统计
  // ============ TASK MODE - DISABLED ============
  // isTaskMode?: boolean
  // taskList?: {
  //   id: number
  //   description: string
  //   completed: boolean
  //   status?: TaskStatus
  //   error?: string
  //   retryCount?: number
  // }[]
  // archivedMessages?: Message[][]  // 任务模式整合时归档的消息段
  // taskModeOptions?: {
  //   enableTaskSummary?: boolean  // 是否启用任务总结，默认 false
  //   tokenThreshold?: number      // TOKEN 阈值，默认 8000
  //   autoExecute?: boolean        // 是否自动执行（跳过确认），默认 false
  //   maxRetries?: number          // 最大重试次数，默认 0
  //   skipOnError?: boolean        // 失败时是否跳过继续执行，默认 false
  //   workingMemory?: {            // 工作记忆配置
  //     enabled?: boolean          // 是否启用工作记忆，默认 true
  //     autoSave?: boolean         // 是否自动保存，默认 true
  //     maxEntriesPerType?: number // 每种类型最大条目数，默认 50
  //   }
  // }
  // // 任务执行上下文（用于错误后继续执行）
  // taskExecutionContext?: {
  //   nextTaskIndex: number       // 下一个要执行的任务索引
  //   previousResult?: string     // 上一个任务的总结结果
  //   mergedContext?: string      // 中间整合结果
  //   accumulatedTokens: number   // 累积的 TOKEN 数量
  // }
  // =============================================
}

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: function (str: string, lang?: string): string {
    const language = lang || 'plaintext'
    // 检查语言是否支持
    if (lang && !hljs.getLanguage(lang)) {
      return md.utils.escapeHtml(str)
    }
    try {
      return hljs.highlight(str, { language }).value
    } catch {
      return md.utils.escapeHtml(str)
    }
  },
})

// 自定义代码块渲染器，添加复制按钮
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  if (!token) return ''

  const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
  const lang = info ? info.split(/\s+/g)[0] : ''
  const rawCode = token.content // 保存原始代码
  let code = rawCode

  // 使用 highlight.js 进行语法高亮（检查语言是否支持）
  if (lang && hljs.getLanguage(lang)) {
    try {
      code = hljs.highlight(code, { language: lang }).value
    } catch {
      code = md.utils.escapeHtml(code)
    }
  } else {
    code = md.utils.escapeHtml(code)
  }

  // 添加复制按钮
  const copyBtn = `<button class="code-copy-btn" onclick="window.copyCodeBlock(this)" title="复制代码">复制</button>`

  // 为HTML代码块添加预览按钮（使用 data 属性存储代码）
  let previewBtn = ''
  if (lang === 'html') {
    // 始终使用UTF-8编码以支持中文等Unicode字符
    const utf8Bytes = encodeURIComponent(rawCode).replace(/%([0-9A-F]{2})/g, (_match, p1) => String.fromCharCode(parseInt(p1, 16)))
    const base64Code = btoa(utf8Bytes)
    previewBtn = `<button class="code-preview-btn" data-html-code="${base64Code}" onclick="window.previewHtml(this)" title="预览HTML">预览</button>`
  }

  return `<pre><code class="hljs language-${lang}">${code}</code>${copyBtn}${previewBtn}</pre>`
}

// 加载代码高亮主题
async function loadHighlightTheme() {
  try {
    const savedTheme = await storage.getHighlightTheme()
    if (!savedTheme) return

    // 移除旧的主题样式
    const oldLink = document.getElementById('highlight-theme')
    if (oldLink) {
      oldLink.remove()
    }

    // 使用本地文件加载新主题样式
    const link = document.createElement('link')
    link.id = 'highlight-theme'
    link.rel = 'stylesheet'
    link.href = `./${savedTheme}.css`
    document.head.appendChild(link)

    // 强制页面重新加载样式
    await new Promise(resolve => setTimeout(resolve, 100))
  } catch (error) {
    console.error('Failed to load highlight theme:', error)
  }
}

const chatList = ref<Chat[]>([])
const currentChatId = ref<string | null>(null)
const input = ref('')
const controllers = ref<Record<string, AbortController>>({})
const showSidebar = ref(true)

// 用户名（用于侧边栏底部显示）
const username = ref('')

// 当前选择的文件夹路径（用于工作空间）
const currentFolder = ref<string>('')

// ============ TASK MODE - DISABLED ============
// // 任务模式 - 基于当前会话的 computed 属性
// const taskMode = computed(() => currentChat.value?.isTaskMode ?? false)
// // 发送状态 - 基于当前会话的 computed 属性
// const sending = computed(() => currentChat.value?.sending ?? false)
// // 新会话前的任务模式选择（只在会话为空时可编辑）
// //const pendingTaskMode = ref(false)
// const isTaskPlanning = ref(false)
// const isTaskExecuting = ref(false)
// const awaitingTaskConfirmation = ref(false)
// const executionFailed = ref(false)  // 标记任务执行是否失败（用于显示继续执行按钮）
// const pendingTasks = ref<{ id: number; description: string }[]>([])
// // 保存原始用户输入用于重新规划
// const originalUserInput = ref('')
// // 任务模式设置状态
// const showTaskSettings = ref(false)
// // taskList 从当前会话获取，如果没有则返回空数组
// const taskList = computed(() => currentChat.value?.taskList ?? [])
// const currentTaskIndex = ref(-1)
//
// // 检测是否有未完成的任务（用于显示继续执行按钮）
// const hasIncompleteTasks = computed(() => {
//   const chat = currentChat.value
//   if (!chat?.taskList || chat.taskList.length === 0) return false
//   // 如果有未完成的任务，且不在执行中，也不在等待确认
//   return chat.taskList.some(t => !t.completed) &&
//          !isTaskExecuting.value &&
//          !awaitingTaskConfirmation.value
// })
// =============================================

// 发送状态 - 基于当前会话的 computed 属性 (保留给普通模式)
const sending = computed(() => currentChat.value?.sending ?? false)

// 参数配置对话框状态
const showParamsDialog = ref(false)
const tempParams = ref<ChatParams>({ ...DEFAULT_CHAT_PARAMS })

const configList = ref<ConfigList>({
  configs: [],
  activeIndex: -1
})
const activeConfig = computed(() => {
  const chat = currentChat.value
  if (chat?.configId === undefined || chat.configId === null) return null
  return configList.value.configs[chat.configId] || null
})
const assistantList = ref<AssistantList>({
  assistants: [],
  activeIndex: -1
})
const currentChat = computed(() =>
  currentChatId.value ? chatList.value.find(c => c.id === currentChatId.value) : null
)
const activeAssistant = computed(() => {
  const chat = currentChat.value
  if (!chat?.assistantId) return null
  return assistantList.value.assistants.find(a => a.id === chat.assistantId) || null
})
const messages = computed(() => currentChat.value?.messages || [])

// messagesRef, textareaRef, autoScrollEnabled 已移至 NormalChat 组件
const normalChatRef = ref<InstanceType<typeof NormalChat> | null>(null)

// ============ TASK MODE - DISABLED ============
// const taskChatRef = ref<InstanceType<typeof TaskChat> | null>(null)
// // 分组会话：任务模式和普通会话
// const taskModeChats = computed(() => chatList.value.filter(c => c.isTaskMode === true))
// =============================================
// 所有会话都是普通会话
const normalChats = computed(() => chatList.value)
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')
// 推理内容展开状态映射（按消息索引）
const reasoningExpanded = ref<Record<number, boolean>>({})
// 推理开始时间映射（按消息索引）
const reasoningStartTime = ref<Record<number, number>>({})
// 归档历史展开状态（按归档索引）
const archivedExpanded = ref<Record<number, boolean>>({})

function normalizeApiUrl(url: string) {
  return url.replace(/\/+$/, '')
}

// handleMessagesScroll, autoResizeTextarea, render, stripHtml, copyText 函数已移至 NormalChat 组件

// ============ TASK MODE - DISABLED ============
// // 任务规划提示词
// const TASK_PLANNING_PROMPT = `你是一个任务规划助手。请将用户的请求分解为一系列清晰、具体的子任务。
//
// 请按照以下 JSON 格式返回任务列表：
// \`\`\`json
// {
//   "tasks": [
//     {
//       "id": 1,
//       "description": "任务描述"
//     }
//   ]
// }
// \`\`\`
//
// 要求：
// 1. 任务要具体、可执行
// 2. 任务之间要有逻辑顺序
// 3. 通常 3-6 个子任务为宜
// 4. **最后一个任务必须是整合验证任务**，格式为："整合验证：将以上所有子任务的输出进行整合、验证和完善，确保最终结果完整、准确、连贯"
// 5. 只返回 JSON，不要有其他文字
//
// 示例：
// \`\`\`json
// {
//   "tasks": [
//     {"id": 1, "description": "分析用户需求"},
//     {"id": 2, "description": "设计系统架构"},
//     {"id": 3, "description": "实现核心功能"},
//     {"id": 4, "description": "整合验证：将以上所有子任务的输出进行整合、验证和完善，确保最终结果完整、准确、连贯"}
//   ]
// }
// \`\`\``
// =============================================

// Qwen 思考标签流式解析器（用于流式输出场景）
interface QwenStreamParser {
  reasoningBuffer: string
  contentBuffer: string
  state: 'NORMAL' | 'IN_THINK_CONTENT'
  tagBuffer: string
}

function createQwenStreamParser(): QwenStreamParser {
  return {
    reasoningBuffer: '',
    contentBuffer: '',
    state: 'NORMAL',
    tagBuffer: ''
  }
}

// 解析流式 delta，返回本次新增的 reasoning 和 content
function parseQwenStreamDelta(
  parser: QwenStreamParser,
  delta: string
): { reasoning: string; content: string } {
  const OPEN_TAG = '<think>'
  const CLOSE_TAG = '</think>'

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
            // 可能是部分匹配但不是完整闭合标签
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
 * Qwen 工具调用格式解析器
 * Qwen 模型将工具调用以文本标签形式嵌入在 content 中
 * 格式: <tool_call>{"name": "tool_name", "arguments": {...}}</tool_call>
 */
interface QwenToolCall {
  name: string
  arguments: any
}

function parseQwenToolCalls(content: string): { toolCalls: any[]; cleanedContent: string } {
  // 匹配
  const QWEN_TOOL_CALL_PATTERN = /<tool_call>\s*\n?([\s\S]*?)\n?<\/tool_call>/g

  const toolCalls: any[] = []
  let cleanedContent = content
  let matchIndex = 0

  let match
  while ((match = QWEN_TOOL_CALL_PATTERN.exec(content)) !== null) {
    try {
      const toolCallJson = match[1] ?? ''
      const parsed: QwenToolCall = JSON.parse(toolCallJson)

      // 生成唯一的 tool_call_id
      const toolCallId = `call_${Date.now()}_${matchIndex}`

      // 转换为 OpenAI 格式
      toolCalls.push({
        id: toolCallId,
        type: 'function',
        function: {
          name: parsed.name,
          arguments: typeof parsed.arguments === 'string'
            ? parsed.arguments
            : JSON.stringify(parsed.arguments)
        }
      })

      matchIndex++
    } catch (e) {
      console.error('[Qwen Tool Call] Failed to parse tool call:', match?.[1], e)
    }
  }

  // 从内容中移除工具调用标签（保持可见内容干净）
  if (toolCalls.length > 0) {
    cleanedContent = content.replace(QWEN_TOOL_CALL_PATTERN, '').trim()
  }

  return { toolCalls, cleanedContent }
}

// 发送消息到 LLM（支持流式响应）- 保留用于任务模式
// @ts-expect-error 保留用于未来任务模式功能
async function sendMessageToLLM(messages: { role: string; content: string }[]): Promise<string> {
  if (!activeConfig.value?.apiKey) {
    throw new Error('请先配置并启用一个 LLM 接口')
  }

  // 解析 extra_body 参数
  let extraBodyParams: Record<string, any> = {}
  if (activeConfig.value?.extra_body && activeConfig.value.extra_body.trim()) {
    try {
      extraBodyParams = JSON.parse(activeConfig.value.extra_body)
    } catch (e) {
      console.error('Failed to parse extra_body:', e)
    }
  }

  // 处理 enable_thinking 参数
  // 无论 true/false 都发送，确保与配置同步
  const enableThinking = activeConfig.value?.enable_thinking ?? false
  // 同步到 extraBodyParams 中
  extraBodyParams = { ...extraBodyParams, enable_thinking: enableThinking }

  let resp: Response

  // 浏览器开发环境始终走代理，Electron 环境直接请求
  const useProxy = import.meta.env.DEV && !isElectronEnv
  if (!useProxy && window.electronAPI && activeConfig.value) {
    const apiBase = normalizeApiUrl(activeConfig.value.apiUrl)
    resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeConfig.value.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeConfig.value.model,
        messages: messages,
        stream: false,
        enable_thinking: enableThinking,  // 外层 enable_thinking，与 messages 同级
        extra_body: extraBodyParams,      // extra_body 中也有 enable_thinking
      }),
    })

  } else {
    resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages
      }),
    })
  }

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
    throw new Error(errorMessage)
  }

  const data = await resp.json()
  let content = data.choices?.[0]?.message?.content || ''
  
  // Qwen 模型在非流式输出中会携带 <think></think> 标签，需要移除
  content = content.replace(/<think[\s\S]*?<\/think>/g, '').trim()

  return content
}
// ============ TASK MODE - DISABLED ============
// // 任务规划：获取任务列表
// async function planTasks(userInput: string): Promise<{ id: number; description: string }[]> {
//   const planningPrompt = `${TASK_PLANNING_PROMPT}\n\n用户请求：${userInput}`
//
//   const messagesToSend: { role: string; content: string }[] = [
//     { role: 'system', content: activeAssistant.value?.systemPrompt || '你是一个有用的助手' },
//     { role: 'user', content: planningPrompt }
//   ]
//
//   try {
//     const response = await sendMessageToLLM(messagesToSend)
//
//     // 解析 JSON 响应
//     try {
//       // 提取 JSON 部分
//       const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
//       const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
//       const parsed = JSON.parse(jsonStr)
//
//       if (parsed.tasks && Array.isArray(parsed.tasks)) {
//         return parsed.tasks
//       }
//       throw new TaskError(TaskErrorType.PARSE_ERROR, 'Invalid response format')
//     } catch (e) {
//       console.error('Failed to parse task list:', e)
//       console.error('Response:', response)
//       if (e instanceof TaskError) throw e
//       throw new TaskError(TaskErrorType.PARSE_ERROR, '无法解析任务列表，请重试', undefined, e instanceof Error ? e : undefined)
//     }
//   } catch (e) {
//     if (e instanceof TaskError) throw e
//     throw new TaskError(TaskErrorType.PLANNING_FAILED, formatTaskErrorMessage(e), undefined, e instanceof Error ? e : undefined)
//   }
// }
//
// // 重新规划任务列表
// async function reviseTaskPlan(
//   userInput: string,
//   currentTasks: { id: number; description: string }[],
//   feedback: string
// ): Promise<{ id: number; description: string }[]> {
//   // 构建当前任务列表的文本描述
//   const currentTasksText = currentTasks
//     .map((task, idx) => `${idx + 1}. ${task.description}`)
//     .join('\n')
//
//   const revisionPrompt = `${TASK_PLANNING_PROMPT}\n\n原始用户请求：${userInput}\n\n当前任务列表：\n${currentTasksText}\n\n用户反馈意见：${feedback}\n\n请根据用户的反馈意见，对当前任务列表进行优化调整。`
//
//   const messagesToSend: { role: string; content: string }[] = [
//     { role: 'system', content: activeAssistant.value?.systemPrompt || '你是一个有用的助手' },
//     { role: 'user', content: revisionPrompt }
//   ]
//
//   try {
//     const response = await sendMessageToLLM(messagesToSend)
//
//     // 解析 JSON 响应
//     try {
//       // 提取 JSON 部分
//       const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
//       const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
//       const parsed = JSON.parse(jsonStr)
//
//       if (parsed.tasks && Array.isArray(parsed.tasks)) {
//         return parsed.tasks
//       }
//       throw new TaskError(TaskErrorType.PARSE_ERROR, 'Invalid response format')
//     } catch (e) {
//       console.error('Failed to parse revised task list:', e)
//       console.error('Response:', response)
//       if (e instanceof TaskError) throw e
//       throw new TaskError(TaskErrorType.PARSE_ERROR, '无法解析优化后的任务列表，请重试', undefined, e instanceof Error ? e : undefined)
//     }
//   } catch (e) {
//     if (e instanceof TaskError) throw e
//     throw new TaskError(TaskErrorType.PLANNING_FAILED, formatTaskErrorMessage(e), undefined, e instanceof Error ? e : undefined)
//   }
// }
// =============================================

// ============ TASK MODE - WORKING MEMORY DISABLED ============
// // ============ 工作记忆辅助函数 ============
// //
// // /**
// //  * 初始化工作记忆管理器
// //  */
// // async function initWorkingMemory(chatId: string) {
// //   workingMemoryManager = useWorkingMemory(chatId)
// //   await workingMemoryManager.load()
// // }
// //
// // /**
// //  * 获取下一个任务的工作记忆上下文
// //  */
// // function getWorkingMemoryForNextTask(taskId: number): {
// //   previousNotes?: string
// //   previousDrafts?: string
// //   previousFinalResults?: string
// // } {
// //   if (!workingMemoryManager) return {}
// //
// //   const allEntries = workingMemoryManager.allEntries.value
// //   const previousTasks = allEntries
// //     .filter(e => e.taskId < taskId)
// //     .sort((a, b) => a.taskId - b.taskId)
// //
// //   return {
// //     previousNotes: previousTasks
// //       .filter(e => e.type === 'notes')
// //       .map(e => `任务${e.taskId + 1}笔记: ${e.content}`)
// //       .join('\n\n'),
// //     previousDrafts: previousTasks
// //       .filter(e => e.type === 'drafts')
// //       .map(e => `任务${e.taskId + 1}草稿: ${e.content}`)
// //       .join('\n\n'),
// //     previousFinalResults: previousTasks
// //       .filter(e => e.type === 'final')
// //       .map(e => `任务${e.taskId + 1}结果: ${e.content}`)
// //       .join('\n\n')
// //   }
// // }
// //
// // /**
// //  * 保存任务结果到工作记忆
// //  */
// // async function saveTaskResultToWorkingMemory(
// //   taskId: number,
// //   taskDescription: string,
// //   result: string,
// //   type: WorkingMemoryType
// // ): Promise<void> {
// //   if (!workingMemoryManager) {
// //     console.error(`[Task ${taskId}] 工作记忆管理器未初始化`)
// //     return
// //   }
// //
// //   // 检查是否启用工作记忆（默认启用）
// //   const chat = currentChat.value
// //   const enabled = chat?.taskModeOptions?.workingMemory?.enabled ?? true
// //   if (!enabled) {
// //     //console.log(`[Task ${taskId}] 工作记忆已禁用`)
// //     return
// //   }
// //
// //   //console.log(`[Task ${taskId}] 正在保存到工作记忆，类型: ${type}, 内容长度: ${result.length}`)
// //   await workingMemoryManager.addEntry(type, taskId, taskDescription, result)
// // }
// //
// // /**
// //  * 合并工作记忆（调用 LLM）
// //  */
// // async function mergeWorkingMemory(
// //   notes?: string,
// //   drafts?: string,
// //   finalResults?: string
// // ): Promise<string> {
// //   const parts: string[] = []
// //
// //   if (notes) parts.push(`笔记：\n${notes}`)
// //   if (drafts) parts.push(`草稿：\n${drafts}`)
// //   if (finalResults) parts.push(`最终结果：\n${finalResults}`)
// //
// //   if (parts.length === 0) return ''
// //
// //   const content = parts.join('\n\n')
// //
// //   // 如果内容较短，不需要合并
// //   if (content.length < 2000) return content
// //
// //   const mergePrompt = `请将以下工作记忆内容整合成一段简洁的总结，保留关键信息和中间结论：
// //
// // ${content}
// //
// // 要求：
// // 1. 提取关键信息，去除冗余
// // 2. 保持逻辑连贯
// // 3. 使用清晰的层次结构
// // 4. 只返回整合后的内容，不要有其他文字`
// //
// //   const messagesToSend: { role: string; content: string }[] = []
// //   if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
// //     messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
// //   } else {
// //     messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
// //   }
// //   messagesToSend.push({ role: 'user', content: mergePrompt })
// //
// //   try {
// //     return await sendMessageToLLM(messagesToSend)
// //   } catch (error) {
// //     console.error('工作记忆合并失败，使用原始内容：', error)
// //     return content
// //   }
// // }
// //
// // // 生成任务执行提示（携带上一个任务的总结或中间整合结果）
// // function generateTaskPrompt(
// //   taskDescription: string,
// //   previousResult?: string,
// //   mergedContext?: string,
// //   workingMemoryContext?: string
// // ): string {
// //   let prompt = `请执行以下任务：\n\n任务：${taskDescription}\n\n`
// //
// //   // 构建上下文部分
// //   const contextParts: string[] = []
// //
// //   if (mergedContext) {
// //     contextParts.push(`前面任务的整合结果：\n${mergedContext}`)
// //   }
// //
// //   if (previousResult) {
// //     contextParts.push(`上一个任务的结果总结：${previousResult}`)
// //   }
// //
// //   // 工作记忆上下文
// //   if (workingMemoryContext) {
// //     contextParts.push(`工作记忆（之前任务的积累）：\n${workingMemoryContext}`)
// //   }
// //
// //   if (contextParts.length > 0) {
// //     prompt += contextParts.join('\n\n') + '\n\n'
// //   }
// //
// //   prompt += '请专注于完成当前任务，保持简洁清晰。'
// //   return prompt
// // }
// ============================================================

// 流式执行单个任务
// async function executeTaskStreaming(
//   taskDescription: string,
//   previousResult: string | undefined,
//   mergedContext: string | undefined,
//   conversationHistory: Message[],
//   workingMemoryContext: string | undefined,  // 新增：工作记忆上下文
//   onDelta: (delta: string) => void,
//   onReasoningDelta: (delta: string) => void,
//   onReasoningDuration: (duration: number) => void
// ): Promise<{ toolCalls?: any[] }> {  // 返回可能包含的工具调用
//   if (!activeConfig.value?.apiUrl || !activeConfig.value?.apiKey) {
//     throw new Error('请先配置并启用一个 LLM 接口')
//   }
// 
//   const prompt = generateTaskPrompt(taskDescription, previousResult, mergedContext, workingMemoryContext)
// 
//   // 构建消息列表：系统提示 + 对话历史（排除当前添加的用户消息） + 当前任务提示
//   const messagesToSend: { role: string; content: string }[] = []
//   if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
//     messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
//   } else {
//     messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
//   }
// 
//   // 添加对话历史
//   conversationHistory.forEach(msg => {
//     const msgObj: any = { role: msg.role, content: msg.content }
//     // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
//     // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
//     if (msg.role === 'assistant') {
//       msgObj.reasoning_content = msg.reasoning || ''
//     }
//     messagesToSend.push(msgObj)
//   })
// 
//   // 添加当前任务提示
//   messagesToSend.push({ role: 'user', content: prompt })
// 
//   // 解析 extra_body 参数
//   let extraBodyParams: Record<string, any> = {}
//   if (activeConfig.value?.extra_body && activeConfig.value.extra_body.trim()) {
//     try {
//       extraBodyParams = JSON.parse(activeConfig.value.extra_body)
//     } catch (e) {
//       console.error('Failed to parse extra_body:', e)
//     }
//   }
// 
//   // 浏览器开发环境走代理，Electron 环境直接请求
//   const useProxy = import.meta.env.DEV && !isElectronEnv
//   const apiBase = useProxy ? '/api/chat/completions' : normalizeApiUrl(activeConfig.value.apiUrl!)
// 
//   // 获取对话级别的参数配置
//   const chatParams = currentChat.value?.params || {}
//   // 只发送非 undefined 的参数，max_tokens 只有大于 0 才发送
//   const validParams: Record<string, any> = {}
//   for (const [key, value] of Object.entries(chatParams)) {
//     if (value !== undefined) {
//       // max_tokens 只有大于 0 才发送
//       if (key === 'max_tokens' && value <= 0) {
//         continue
//       }
//       validParams[key] = value
//     }
//   }
// 
//   // 生成 MCP tools 数组（如果有激活的工具）
//   await mcpManager.loadServers()
//   const mcpTools = mcpManager.generateOpenAITools()
//   console.log('[TaskMode] Active tools:', mcpTools.length)
// 
//   const resp = await fetch(`${useProxy ? apiBase : apiBase + '/chat/completions'}`, {
//     method: 'POST',
//     headers: {
//       ...(useProxy ? {} : { 'Authorization': `Bearer ${activeConfig.value.apiKey}` }),
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: activeConfig.value.model,
//       messages: messagesToSend,
//       stream: true,
//       ...(mcpTools.length > 0 ? { tools: mcpTools } : {}),
//       ...validParams,
//       ...extraBodyParams,
//     }),
//     signal: controllers.value[currentChat.value!.id]!.signal,
//   })
// 
//   if (!resp.body) {
//     throw new Error('No response body')
//   }
// 
//   const reader = resp.body.getReader()
//   const decoder = new TextDecoder()
//   let buffer = ''
//   let reasoningStartTime = Date.now()
// 
//   // 创建流式解析器
//   const qwenParser = createQwenStreamParser()
// 
//   // 用于收集 tool_calls
//   const currentToolCallsMap: Map<number, any> = new Map()
// 
//   while (true) {
//     const { done, value } = await reader.read()
//     if (done) break
//     buffer += decoder.decode(value, { stream: true })
//     const parts = buffer.split('\n\n')
//     buffer = parts.pop() || ''
//     for (const part of parts) {
//       const line = part.trim()
//       if (!line.startsWith('data:')) continue
//       const data = line.slice(5).trim()
//       if (data === '[DONE]') break
//       try {
//         const json = JSON.parse(data)
//         // DeepSeek 格式：独立的 reasoning_content 或 reasoning 字段
//         let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
//         if (!reasoning_delta) {
//           reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
//         }
//         if (reasoning_delta) {
//           onReasoningDelta(reasoning_delta)
//           onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
//         }
//         let delta = json?.choices?.[0]?.delta?.content ?? ''
//         // Qwen 格式：content 中可能包含 </think> 标签
//         if (delta) {
//           const parsed = parseQwenStreamDelta(qwenParser, delta)
//           if (parsed.reasoning) {
//             onReasoningDelta(parsed.reasoning)
//             onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
//           }
//           if (parsed.content) {
//             onDelta(parsed.content)
//           }
//         }
// 
//         // 处理 tool_calls
//         const deltaToolCalls = json?.choices?.[0]?.delta?.tool_calls
//         if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
//           for (const toolCall of deltaToolCalls) {
//             const index = toolCall.index
//             if (index !== undefined) {
//               if (!currentToolCallsMap.has(index)) {
//                 currentToolCallsMap.set(index, {
//                   id: toolCall.id || '',
//                   type: toolCall.type || 'function',
//                   function: {
//                     name: toolCall.function?.name || '',
//                     arguments: toolCall.function?.arguments || ''
//                   }
//                 })
//               } else {
//                 const existing = currentToolCallsMap.get(index)!
//                 if (toolCall.id) existing.id = toolCall.id
//                 if (toolCall.function?.name) existing.function.name = toolCall.function.name
//                 if (toolCall.function?.arguments) {
//                   existing.function.arguments += toolCall.function.arguments
//                 }
//               }
//             }
//           }
//         }
//       } catch {}
//     }
//   }
// 
//   // 流结束后，检查是否有 tool_calls
//   const finalToolCalls = Array.from(currentToolCallsMap.values())
//   if (finalToolCalls.length > 0) {
//     console.log('[TaskMode] Tool calls detected:', finalToolCalls)
//     return { toolCalls: finalToolCalls }
//   }
//
//   return {}
// }

// 工具调用后继续任务执行
// async function continueTaskAfterToolCalls(
//   taskDescription: string,
//   previousResult: string | undefined,
//   mergedContext: string | undefined,
//   workingMemoryContext: string | undefined,
//   originalMsg: Message
// ): Promise<void> {
//   if (!currentChat.value || !activeConfig.value) return
// 
//   const chat = currentChat.value
// 
//   // 生成 MCP tools 数组（如果有激活的工具）
//   await mcpManager.loadServers()
//   const mcpTools = mcpManager.generateOpenAITools()
// 
//   // 构建消息列表：系统提示 + 对话历史（包含工具结果）
//   const messagesToSend: { role: string; content: string }[] = []
//   if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
//     messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
//   } else {
//     messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
//   }
// 
//   // 添加对话历史（排除原始消息，保留工具结果）
//   const historyWithoutOriginal = chat.messages.slice(0, -1)
//   historyWithoutOriginal.forEach(msg => {
//     const msgObj: any = { role: msg.role, content: msg.content }
//     if (msg.tool_call_id) msgObj.tool_call_id = msg.tool_call_id
//     if (msg.tool_calls) msgObj.tool_calls = msg.tool_calls
//     if (msg.role === 'assistant') {
//       msgObj.reasoning_content = msg.reasoning || ''
//     }
//     messagesToSend.push(msgObj)
//   })
// 
//   // 解析 extra_body 参数
//   let extraBodyParams: Record<string, any> = {}
//   if (activeConfig.value?.extra_body && activeConfig.value.extra_body.trim()) {
//     try {
//       extraBodyParams = JSON.parse(activeConfig.value.extra_body)
//     } catch (e) {
//       console.error('Failed to parse extra_body:', e)
//     }
//   }
// 
//   const useProxy = import.meta.env.DEV && !isElectronEnv
//   const apiBase = useProxy ? '/api/chat/completions' : normalizeApiUrl(activeConfig.value.apiUrl!)
// 
//   const resp = await fetch(`${useProxy ? apiBase : apiBase + '/chat/completions'}`, {
//     method: 'POST',
//     headers: {
//       ...(useProxy ? {} : { 'Authorization': `Bearer ${activeConfig.value.apiKey}` }),
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: activeConfig.value.model,
//       messages: messagesToSend,
//       stream: true,
//       ...(mcpTools.length > 0 ? { tools: mcpTools } : {}),
//       ...extraBodyParams,
//     }),
//     signal: controllers.value[chat.id]!.signal,
//   })
// 
//   if (!resp.body) {
//     throw new Error('No response body')
//   }
// 
//   const reader = resp.body.getReader()
//   const decoder = new TextDecoder()
//   let buffer = ''
//   const qwenParser = createQwenStreamParser()
//   const currentToolCallsMap: Map<number, any> = new Map()
// 
//   while (true) {
//     const { done, value } = await reader.read()
//     if (done) break
//     buffer += decoder.decode(value, { stream: true })
//     const parts = buffer.split('\n\n')
//     buffer = parts.pop() || ''
//     for (const part of parts) {
//       const line = part.trim()
//       if (!line.startsWith('data:')) continue
//       const data = line.slice(5).trim()
//       if (data === '[DONE]') break
//       try {
//         const json = JSON.parse(data)
//         let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
//         if (!reasoning_delta) {
//           reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
//         }
//         if (reasoning_delta) {
//           originalMsg.reasoning += reasoning_delta
//           scrollToBottom()
//         }
//         let delta = json?.choices?.[0]?.delta?.content ?? ''
//         if (delta) {
//           const parsed = parseQwenStreamDelta(qwenParser, delta)
//           if (parsed.reasoning) {
//             originalMsg.reasoning += parsed.reasoning
//             scrollToBottom()
//           }
//           if (parsed.content) {
//             originalMsg.content += parsed.content
//             scrollToBottom()
//           }
//         }
// 
//         // 处理嵌套的 tool_calls
//         const deltaToolCalls = json?.choices?.[0]?.delta?.tool_calls
//         if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
//           for (const toolCall of deltaToolCalls) {
//             const index = toolCall.index
//             if (index !== undefined) {
//               if (!currentToolCallsMap.has(index)) {
//                 currentToolCallsMap.set(index, {
//                   id: toolCall.id || '',
//                   type: toolCall.type || 'function',
//                   function: {
//                     name: toolCall.function?.name || '',
//                     arguments: toolCall.function?.arguments || ''
//                   }
//                 })
//               } else {
//                 const existing = currentToolCallsMap.get(index)!
//                 if (toolCall.id) existing.id = toolCall.id
//                 if (toolCall.function?.name) existing.function.name = toolCall.function.name
//                 if (toolCall.function?.arguments) {
//                   existing.function.arguments += toolCall.function.arguments
//                 }
//               }
//             }
//           }
//         }
//       } catch {}
//     }
//   }
// 
//   // 处理第二轮工具调用（递归）
//   const finalToolCalls = Array.from(currentToolCallsMap.values())
//   if (finalToolCalls.length > 0) {
//     originalMsg.tool_calls = finalToolCalls
//     console.log('[TaskMode] Nested tool calls detected:', finalToolCalls)
// 
//     // 先添加执行中的工具消息
//     const toolCallIds = finalToolCalls.map((tc: any) => tc.id)
//     for (const toolCallId of toolCallIds) {
//       chat.messages.push({
//         role: 'tool' as any,
//         content: '执行中...',
//         reasoning: '',
//         tool_call_id: toolCallId,
//         toolStatus: 'running'
//       })
//     }
//     scrollToBottom()
// 
//     const toolResults = await mcpManager.executeToolCalls(finalToolCalls)
// 
//     // 更新工具结果消息
//     let resultIndex = chat.messages.length - toolResults.length
//     for (const resultMsg of toolResults) {
//       const targetMsg = chat.messages[resultIndex]
//       if (targetMsg && targetMsg.tool_call_id === resultMsg.tool_call_id) {
//         targetMsg.content = resultMsg.content
//         targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
//       }
//       resultIndex++
//     }
// 
//     // 递归调用继续对话
//     await continueTaskAfterToolCalls(
//       taskDescription,
//       previousResult,
//       mergedContext,
//       workingMemoryContext,
//       originalMsg
//     )
//   }
// }
// 
// // 总结任务执行结果
// // async function summarizeTaskResult(taskDescription: string, result: string): Promise<string> {
// //   const summarizePrompt = `请简洁总结以下任务的执行结果（1-2句话）：
// // 
// // 任务：${taskDescription}
// // 
// // 结果：
// // ${result}
// // 
// // 只返回总结内容，不要有其他文字。`
// // 
// //   const messagesToSend: { role: string; content: string }[] = []
// //   if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
// //     messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
// //   } else {
// //     messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
// //   }
//   messagesToSend.push({ role: 'user', content: summarizePrompt })
// 
//   return await sendMessageToLLM(messagesToSend)
// }
// 
// // 执行中间整合
// // async function performIntermediateMerge(
// //   conversationHistory: Message[],
// //   completedTaskCount: number,
// //   totalTaskCount: number
// // ): Promise<string> {
// //   const mergePrompt = `请将以下已完成任务的执行结果进行智能整合，为后续任务提供清晰的上下文。
// // 
// // 已完成的任务数量：${completedTaskCount + 1}/${totalTaskCount}
// // 
// // ## 整合策略
// // 
// // **必须完整保留的内容：**
// // - 所有代码块（包括\`\`\`代码\`\`\`标记和完整代码）
// // - 具体的数据结构、配置、列表
// // - 关键的技术细节、参数、数值
// // - 文章的核心段落、重要论述
// // - 任务的主要输出结果
// // 
// // **可以概括的内容：**
// // - 任务执行过程的描述性文字
// // - 过渡性说明和重复信息
// // - AI的思考过程（reasoning内容）
// // - 非实质性的礼貌用语
// // 
// // ## 输出格式要求
// // 
// // 1. 保持内容的原始顺序，确保上下文连贯
// // 2. 代码块必须原样保留，不可省略
// // 3. 用简洁的语言概括非关键部分
// // 4. 确保后续任务能够基于整合后的内容继续工作
// // 5. 不要添加任何额外的说明文字，直接输出整合后的内容`
// // 
// //   const messagesToSend: { role: string; content: string }[] = []
// //   if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
// //     messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
// //   } else {
// //     messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
// //   }
// // 
// //   // 添加对话历史
// //   conversationHistory.forEach(msg => {
// //     const msgObj: any = { role: msg.role, content: msg.content }
// //     // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
//     // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
//     if (msg.role === 'assistant') {
//       msgObj.reasoning_content = msg.reasoning || ''
//     }
//     messagesToSend.push(msgObj)
//   })
// 
//   messagesToSend.push({ role: 'user', content: mergePrompt })
// 
//   return await sendMessageToLLM(messagesToSend)
// }

// 复制代码块和预览HTML函数（全局调用）
declare global {
  interface Window {
    copyCodeBlock: (btn: HTMLElement) => void
    previewHtml: (btn: HTMLElement) => void
  }
}

window.copyCodeBlock = async (btn: HTMLElement) => {
  const pre = btn.parentElement
  const code = pre?.querySelector('code')
  if (code) {
    try {
      await navigator.clipboard.writeText(code.textContent || '')
      btn.textContent = '已复制'
      setTimeout(() => {
        btn.textContent = '复制'
      }, 2000)
    } catch {
      alert('复制失败')
    }
  }
}

async function loadConfig() {
  const config = await storage.getConfigList()
  if (config) {
    configList.value = config
  }
}

async function loadAssistants() {
  try {
    const assistants = await storage.getAssistantList()
    assistantList.value = {
      assistants,
      activeIndex: assistantList.value.activeIndex
    }
  } catch (e) {
    console.error('Failed to load assistant list:', e)
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || (currentChat.value?.sending)) return

  if (!activeConfig.value?.apiKey) {
    alert('请先配置并启用一个 LLM 接口')
    router.push('/settings')
    return
  }

  if (!currentChat.value) {
    createNewChat()
  }

  input.value = ''
  scrollToBottom()

  // ============ TASK MODE - DISABLED ============
  // // 任务模式流程
  // if (taskMode.value) {
  //   await executeTaskMode(text)
  // } else {
  //   // 普通对话流程
  //   await executeNormalChat(text)
  // }
  // =============================================

  // 普通对话流程（默认）
  await executeNormalChat(text)
}

// 执行普通对话
async function executeNormalChat(text: string) {
  if (currentChat.value) {
    if (currentChat.value.messages.length === 0) {
      updateChatTitle(currentChat.value.id, text)
    }
    currentChat.value.messages.push({ role: 'user', content: text, reasoning: '' })
    const assistantIndex = currentChat.value.messages.length
    currentChat.value.messages.push({ role: 'assistant', content: '',  reasoning: '' })
    // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
    delete reasoningStartTime.value[assistantIndex]
    // 自动展开 reasoning section，让用户立即看到思考中的状态
    reasoningExpanded.value[assistantIndex] = true
    if (normalChatRef.value) {
      normalChatRef.value.setReasoningExpanded(assistantIndex, true)
    }
  }

  if (currentChat.value) {
    currentChat.value.sending = true
    controllers.value[currentChat.value.id] = new AbortController()
  }

  try {
    const currentMessages = currentChat.value?.messages || []
    // 构建消息数组，需要包含 tool_call_id 和 tool_calls 字段
    const messagesToSend = currentMessages.slice(0, -1).map(m => {
      const msg: any = { role: m.role, content: m.content }
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
      // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
      if (m.role === 'assistant') {
        msg.reasoning_content = m.reasoning || ''
      }
      return msg
    })

    // 确保全局记忆已加载（如果未加载则立即加载）
    if (!globalMemoryManager.memory.value) {
      await globalMemoryManager.load()
    }

    // 调试：检查全局记忆状态
    ////console.log('[GlobalMemory] memory.value:', globalMemoryManager.memory.value)
    ////console.log('[GlobalMemory] entries:', globalMemoryManager.entries.value)
    ////console.log('[GlobalMemory] user message:', text)

    // 生成智能匹配的全局记忆上下文
    const globalMemoryContext = globalMemoryManager.generateInjectContext(text)
    ////console.log('[GlobalMemory] generated context:', globalMemoryContext)

    // 生成 MCP tools 数组（如果有激活的工具）
    await mcpManager.loadServers()
    const mcpTools = mcpManager.generateOpenAITools()
    //console.log('[MCP] Active tools:', mcpTools.length)

    // 构建 system prompt（合并 assistant system prompt 和 global memory）
    let systemPrompt = ''
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      systemPrompt = activeAssistant.value.systemPrompt.trim()
    } else {
      // 使用默认内置助理的 System Prompt
      systemPrompt = storage.getDefaultAssistantPrompt()
    }

    // 如果有全局记忆，追加到 system prompt
    if (globalMemoryContext) {
      systemPrompt += '\n\n' + globalMemoryContext + '\n\n请在回复时考虑这些偏好。'
    }

    // 加载 Skills 注册表并生成上下文
    await skillsManager.loadRegistry()
    const skillsContext = skillsManager.generateSkillContext()
    if (skillsContext) {
      systemPrompt += '\n\n' + skillsContext
    }

    // 添加合并后的 system prompt 到消息开头
    messagesToSend.unshift({
      role: 'system',
      content: systemPrompt
    })

    let resp: Response

    // 解析 extra_body 参数
    let extraBodyParams: Record<string, any> = {}
    if (activeConfig.value?.extra_body && activeConfig.value.extra_body.trim()) {
      try {
        extraBodyParams = JSON.parse(activeConfig.value.extra_body)
      } catch (e) {
        console.error('Failed to parse extra_body:', e)
      }
    }

    // 处理 enable_thinking 参数
    // 无论 true/false 都发送，确保与配置同步
    const enableThinking = activeConfig.value?.enable_thinking ?? false
    // 同步到 extraBodyParams 中
    extraBodyParams = { ...extraBodyParams, enable_thinking: enableThinking }

    // 浏览器开发环境始终走代理，Electron 环境直接请求
    const useProxy = import.meta.env.DEV && !isElectronEnv
    if (!useProxy && window.electronAPI && activeConfig.value) {
      const apiBase = normalizeApiUrl(activeConfig.value.apiUrl)

      // 获取对话级别的参数配置
      const chatParams = currentChat.value?.params || {}
      // 只发送非 undefined 的参数，max_tokens 只有大于 0 才发送
      const validParams: Record<string, any> = {}
      for (const [key, value] of Object.entries(chatParams)) {
        if (value !== undefined) {
          // max_tokens 只有大于 0 才发送
          if (key === 'max_tokens' && value <= 0) {
            continue
          }
          validParams[key] = value
        }
      }

      resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeConfig.value.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeConfig.value.model,
          messages: messagesToSend,
          stream: true,
          stream_options: { include_usage: true },  // 启用 token 使用统计
          ...(mcpTools.length > 0 ? { tools: mcpTools } : {}),
          ...validParams,
          enable_thinking: enableThinking,  // 外层 enable_thinking，与 messages 同级
          extra_body: extraBodyParams,      // extra_body 中也有 enable_thinking
        }),
        signal: controllers.value[currentChat.value!.id]!.signal,
      })
    } else {
      resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend
        }),
        signal: controllers.value[currentChat.value!.id]!.signal,
      })
    }

    // 检查响应状态，处理错误情况
    if (!resp.ok) {
      let errorMessage = `API request failed (${resp.status}): ${resp.statusText}`
      try {
        const errorData = await resp.json()
        if (errorData.error?.message) {
          errorMessage = errorData.error.message
        }
      } catch {
        // 如果无法解析 JSON，使用默认错误消息
      }
      throw new Error(errorMessage)
    }

    if (!resp.body) {
      throw new Error('No response body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const assistantIndex = currentMessages.length - 1

    // 创建流式解析器
    const qwenParser = createQwenStreamParser()

    // 用于收集 tool_calls
    const currentToolCallsMap: Map<number, any> = new Map()
    // 跟踪已添加"准备中"消息的 tool call index
    const preparingToolCallIndexes: Set<number> = new Set()

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
        //console.log(data)
        if (data === '[DONE]') {
          break
        }
        try {
          const json = JSON.parse(data)
          // DeepSeek 格式：独立的 reasoning_content 或 reasoning 字段
          let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
          if (!reasoning_delta) {
            reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
          }
          // Qwen 格式：content 中可能包含 </think> 标签
          let delta = json?.choices?.[0]?.delta?.content ?? ''
          if (delta && !reasoning_delta) {
            const parsed = parseQwenStreamDelta(qwenParser, delta)
            if (parsed.reasoning) {
              reasoning_delta = parsed.reasoning
            }
            delta = parsed.content
          }
          if (reasoning_delta) {
            const msg = currentMessages[assistantIndex]
            if (msg) {
              // 如果这是第一次接收推理内容，记录开始时间
              if (!reasoningStartTime.value[assistantIndex]) {
                reasoningStartTime.value[assistantIndex] = Date.now()
                // 同步到 NormalChat 组件
                if (normalChatRef.value) {
                  normalChatRef.value.setReasoningStartTime(assistantIndex, Date.now())
                }
              }
              // 实时更新消息的推理时长（秒）
              msg.reasoningDuration = Math.floor((Date.now() - reasoningStartTime.value[assistantIndex]) / 1000)
              msg.reasoning += reasoning_delta
            }
            scrollToBottom()
          }

          if (delta) {
            const msg = currentMessages[assistantIndex]
            if (msg) msg.content += delta
            scrollToBottom()
          }

          //配置--tool-call-parser llama4_json返回格式：
          //<tool_call> {"name": "bing_search", "arguments": {"query": "TypeScript 教程 入门 初学者"}} </tool_call>
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
                  // 首次检测到 tool_call 时，立即显示"准备中..."
                  if (!preparingToolCallIndexes.has(index)) {
                    preparingToolCallIndexes.add(index)
                    currentMessages.push({
                      role: 'tool' as any,
                      content: '准备中...',
                      reasoning: '',
                      tool_call_id: `preparing_${index}`,
                      toolStatus: 'pending'
                    })
                    scrollToBottom()
                  }
                } else {
                  const existing = currentToolCallsMap.get(index)!
                  if (toolCall.id) existing.id = toolCall.id
                  if (toolCall.function?.name) existing.function.name = toolCall.function.name
                  if (toolCall.function?.arguments) {
                    //工具参数拼接
                    existing.function.arguments += toolCall.function.arguments
                  }
                }
              }
            }
          }

          // 解析 token 使用统计（流式响应的最后一个 chunk 包含 usage）
          const usage = json?.usage
          if (usage && currentChat.value) {
            const promptTokens = usage.prompt_tokens ?? 0
            const completionTokens = usage.completion_tokens ?? 0
            const totalTokens = usage.total_tokens ?? 0

            // 累加到会话的 usage 统计
            if (!currentChat.value.usage) {
              currentChat.value.usage = {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
              }
            }
            currentChat.value.usage.promptTokens += promptTokens
            currentChat.value.usage.completionTokens += completionTokens
            currentChat.value.usage.totalTokens += totalTokens
          }
        } catch {
        }
      }
    }

    // 流结束后，检查是否有 tool_calls
    let finalToolCalls = Array.from(currentToolCallsMap.values())

    // 如果没有检测到 OpenAI 格式的 tool_calls，检查 Qwen 格式的工具调用
    if (finalToolCalls.length === 0 && mcpTools.length > 0) {
      const msg = currentMessages[assistantIndex]
      if (msg) {
        const { toolCalls: qwenToolCalls, cleanedContent } = parseQwenToolCalls(msg.content)
        if (qwenToolCalls.length > 0) {
          console.log('[Qwen Tool Call] Detected Qwen-style tool calls:', qwenToolCalls)
          finalToolCalls = qwenToolCalls
          // 清理内容中的工具调用标签
          msg.content = cleanedContent
        }
      }
    }

    if (finalToolCalls.length > 0 && mcpTools.length > 0) {
      const msg = currentMessages[assistantIndex]
      if (msg) {
        msg.tool_calls = finalToolCalls
        //console.log('[MCP] Processing tool_calls:', finalToolCalls)

        // 执行工具调用
        try {
          // 更新"准备中..."消息为"执行中..."，并设置实际的 tool_call_id
          finalToolCalls.forEach((toolCall, index) => {
            const preparingMsg = currentMessages.find(
              m => m.role === 'tool' && m.tool_call_id === `preparing_${index}`
            )
            if (preparingMsg) {
              preparingMsg.tool_call_id = toolCall.id
              preparingMsg.content = '执行中...'
              preparingMsg.toolStatus = 'running'
            } else {
              // 如果没有找到准备中的消息（可能流式解析时未检测到），则添加新消息
              currentMessages.push({
                role: 'tool' as any,
                content: '执行中...',
                reasoning: '',
                tool_call_id: toolCall.id,
                toolStatus: 'running'
              })
            }
          })
          scrollToBottom()

          const toolResults = await mcpManager.executeToolCalls(finalToolCalls)

          // 更新工具结果消息
          let resultIndex = currentMessages.length - toolResults.length
          for (const resultMsg of toolResults) {
            const targetMsg = currentMessages[resultIndex]
            if (targetMsg && targetMsg.tool_call_id === resultMsg.tool_call_id) {
              targetMsg.content = resultMsg.content
              // 根据内容判断是否成功
              targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
            }
            resultIndex++
          }

          // 继续对话，发送包含工具结果的请求
          await continueChatAfterToolCalls(currentMessages, mcpTools)
        } catch (e) {
          console.error('[MCP] Tool execution failed:', e)
          msg.content += `\n\n[工具执行失败: ${e}]`
        }
      }
    }
  } catch (err) {
    const currentMessages = currentChat.value?.messages || []
    const last = currentMessages[currentMessages.length - 1]
    if (last) {
      if (err instanceof Error && err.name === 'AbortError') {
        last.content = '对话已取消'
      } else {
        last.content = '对话失败: ' + (err instanceof Error ? err.message : '未知错误')
      }
    }
  } finally {
    if (currentChat.value) {
      currentChat.value.sending = false
      delete controllers.value[currentChat.value.id]
    }
    // 推理内容完成后自动折叠
    const currentMessages = currentChat.value?.messages || []
    const last = currentMessages[currentMessages.length - 1]
    if (last && last.reasoning) {
      reasoningExpanded.value[currentMessages.length - 1] = false
      // 同步到 NormalChat 组件
      if (normalChatRef.value) {
        normalChatRef.value.setReasoningExpanded(currentMessages.length - 1, false)
      }
    }
    saveChatHistory()
    scrollToBottom()
  }
}

// 工具调用后继续对话
async function continueChatAfterToolCalls(messages: any[], mcpTools: any[]) {
  if (!currentChat.value || !activeConfig.value) return

  const chat = currentChat.value
  chat.sending = true
  controllers.value[chat.id] = new AbortController()

  // 添加新的 assistant 消息用于接收后续响应
  messages.push({ role: 'assistant', content: '', reasoning: '' })
  const assistantIndex = messages.length - 1
  // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
  delete reasoningStartTime.value[assistantIndex]
  // 自动展开 reasoning section，让用户立即看到思考中的状态
  reasoningExpanded.value[assistantIndex] = true
  if (normalChatRef.value) {
    normalChatRef.value.setReasoningExpanded(assistantIndex, true)
  }

  try {
    const apiBase = normalizeApiUrl(activeConfig.value.apiUrl)

    // 构建消息数组（包含工具结果）
    const messagesToSend = messages.slice(0, -1).map(m => {
      const msg: any = { role: m.role, content: m.content }
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
      // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
      if (m.role === 'assistant') {
        msg.reasoning_content = m.reasoning || ''
      }
      return msg
    })

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
        tools: mcpTools,
      }),
      signal: controllers.value[chat.id]!.signal,
    })

    // 检查响应状态，处理错误情况
    if (!resp.ok) {
      let errorMessage = `API request failed (${resp.status}): ${resp.statusText}`
      try {
        const errorData = await resp.json()
        if (errorData.error?.message) {
          errorMessage = errorData.error.message
        }
      } catch {
        // 如果无法解析 JSON，使用默认错误消息
      }
      throw new Error(errorMessage)
    }

    if (!resp.body) {
      throw new Error('No response body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const qwenParser = createQwenStreamParser()
    const currentToolCallsMap: Map<number, any> = new Map()
    // 跟踪已添加"准备中"消息的 tool call index
    const preparingToolCallIndexes: Set<number> = new Set()

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
          let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
          if (!reasoning_delta) {
            reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
          }
          let delta = json?.choices?.[0]?.delta?.content ?? ''

          if (delta && !reasoning_delta) {
            const parsed = parseQwenStreamDelta(qwenParser, delta)
            if (parsed.reasoning) reasoning_delta = parsed.reasoning
            delta = parsed.content
          }

          const msg = messages[assistantIndex]
          if (reasoning_delta) {
            if (!reasoningStartTime.value[assistantIndex]) {
              reasoningStartTime.value[assistantIndex] = Date.now()
            }
            msg.reasoningDuration = Math.floor((Date.now() - reasoningStartTime.value[assistantIndex]) / 1000)
            msg.reasoning += reasoning_delta
            scrollToBottom()
          }

          if (delta) {
            msg.content += delta
            scrollToBottom()
          }

          // 处理嵌套的 tool_calls（LLM 可能再次调用工具）
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
                  // 首次检测到 tool_call 时，立即显示"准备中..."
                  if (!preparingToolCallIndexes.has(index)) {
                    preparingToolCallIndexes.add(index)
                    messages.push({
                      role: 'tool' as any,
                      content: '准备中...',
                      reasoning: '',
                      tool_call_id: `preparing_${index}`,
                      toolStatus: 'pending'
                    })
                    scrollToBottom()
                  }
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
        }
      }
    }

    // 处理第二轮工具调用
    let finalToolCalls = Array.from(currentToolCallsMap.values())

    // 如果没有检测到 OpenAI 格式的 tool_calls，检查 Qwen 格式的工具调用
    if (finalToolCalls.length === 0) {
      const msg = messages[assistantIndex]
      if (msg) {
        const { toolCalls: qwenToolCalls, cleanedContent } = parseQwenToolCalls(msg.content)
        if (qwenToolCalls.length > 0) {
          console.log('[Qwen Tool Call] Detected Qwen-style tool calls (nested):', qwenToolCalls)
          finalToolCalls = qwenToolCalls
          // 清理内容中的工具调用标签
          msg.content = cleanedContent
        }
      }
    }

    if (finalToolCalls.length > 0) {
      const msg = messages[assistantIndex]
      if (msg) {
        msg.tool_calls = finalToolCalls

        // 更新"准备中..."消息为"执行中..."，并设置实际的 tool_call_id
        finalToolCalls.forEach((toolCall, index) => {
          const preparingMsg = messages.find(
            m => m.role === 'tool' && m.tool_call_id === `preparing_${index}`
          )
          if (preparingMsg) {
            preparingMsg.tool_call_id = toolCall.id
            preparingMsg.content = '执行中...'
            preparingMsg.toolStatus = 'running'
          } else {
            // 如果没有找到准备中的消息（可能流式解析时未检测到），则添加新消息
            messages.push({
              role: 'tool' as any,
              content: '执行中...',
              reasoning: '',
              tool_call_id: toolCall.id,
              toolStatus: 'running'
            })
          }
        })
        scrollToBottom()

        const toolResults = await mcpManager.executeToolCalls(finalToolCalls as any)

        // 更新工具结果消息
        let resultIndex = messages.length - toolResults.length
        for (const resultMsg of toolResults) {
          const targetMsg = messages[resultIndex]
          if (targetMsg && targetMsg.tool_call_id === resultMsg.tool_call_id) {
            targetMsg.content = resultMsg.content
            // 根据内容判断是否成功
            targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
          }
          resultIndex++
        }

        // 递归调用继续对话
        await continueChatAfterToolCalls(messages, mcpTools)
      }
    }
  } catch (err) {
    const msg = messages[assistantIndex]
    if (msg) {
      if (err instanceof Error && err.name === 'AbortError') {
        msg.content = '对话已取消'
      } else {
        msg.content = '对话失败: ' + (err instanceof Error ? err.message : '未知错误')
      }
    }
  } finally {
    chat.sending = false
    delete controllers.value[chat.id]
    saveChatHistory()
    scrollToBottom()
  }
}

// 执行任务模式
// async function executeTaskMode(userInput: string) {
//   const chat = currentChat.value
//   if (!chat) return
// 
//   // 保存原始用户输入用于重新规划
//   originalUserInput.value = userInput
// 
//   // 标记为任务模式会话
//   chat.isTaskMode = true
// 
//   // 更新标题
//   if (chat.messages.length === 0) {
//     updateChatTitle(chat.id, userInput)
//   }
// 
//   // 添加用户消息
//   chat.messages.push({ role: 'user', content: userInput, reasoning: '' })
// 
//   // 添加任务模式开始的系统消息
//   const planMsgIndex = chat.messages.length
//   chat.messages.push({ role: 'assistant', content: '', reasoning: '' })
//   // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
//   delete reasoningStartTime.value[planMsgIndex]
// 
//   if (currentChat.value) {
//     currentChat.value.sending = true
//     controllers.value[currentChat.value.id] = new AbortController()
//   }
// 
//   try {
//     // 1. 任务规划阶段
//     isTaskPlanning.value = true
//     chat.messages[planMsgIndex]!.content = '正在规划任务...'
//     chat.messages[planMsgIndex]!.copyable = false
// 
//     const tasks = await planTasks(userInput)
//     if (chat) {
//       chat.taskList = tasks.map((t, i) => ({ id: i, description: t.description, completed: false }))
//     }
// 
//     // 保存待执行任务
//     pendingTasks.value = tasks
// 
//     // 显示任务列表并等待确认
//     let taskListDisplay = '**任务规划完成**\n\n'
//     tasks.forEach((task, idx) => {
//       taskListDisplay += `${idx + 1}. ${task.description}\n`
//     })
//     chat.messages[planMsgIndex]!.content = taskListDisplay
//     chat.messages[planMsgIndex]!.copyable = false
//     scrollToBottom()
// 
//     isTaskPlanning.value = false
// 
//     // 检查是否自动执行
//     const autoExecute = chat.taskModeOptions?.autoExecute ?? false
//     if (autoExecute) {
//       // 自动执行：直接调用 confirmTaskExecution
//       taskListDisplay += '\n**自动执行中...**\n'
//       chat.messages[planMsgIndex]!.content = taskListDisplay
//       scrollToBottom()
//       await confirmTaskExecution()
//     } else {
//       // 等待用户确认
//       awaitingTaskConfirmation.value = true
//       // 等待用户确认（通过 confirmTaskExecution 函数触发继续执行）
//       return
//     }
// 
//   } catch (err) {
//     const chat = currentChat.value
//     if (chat) {
//       const last = chat.messages[chat.messages.length - 1]
//       if (last) {
//         if (err instanceof Error && err.name === 'AbortError') {
//           last.content = '任务已取消'
//         } else if (err instanceof TaskError) {
//           last.content = err.getUserMessage()
//         } else {
//           last.content = formatTaskErrorMessage(err)
//         }
//       }
//     }
//   } finally {
//     // 只有在等待确认时才保持 sending 状态为 true
//     if (!awaitingTaskConfirmation.value) {
//       if (currentChat.value) {
//         currentChat.value.sending = false
//         delete controllers.value[currentChat.value.id]
//       }
//       isTaskPlanning.value = false
//       currentTaskIndex.value = -1
//       saveChatHistory()
//     }
//   }
// }
// 
// 用户确认后开始执行任务
// async function confirmTaskExecution() {
//   if (!currentChat.value || pendingTasks.value.length === 0) return
// 
//   const chat = currentChat.value
//   const tasks = pendingTasks.value
// 
//   // 初始化 AbortController
//   controllers.value[chat.id] = new AbortController()
//   chat.sending = true
// 
//   // 初始化工作记忆
//   await initWorkingMemory(chat.id)
// 
//   try {
//     awaitingTaskConfirmation.value = false
//     isTaskExecuting.value = true
// 
//     // 2. 逐个执行任务
//     let previousResult: string | undefined
//     let mergedContext: string | undefined  // 存储中间整合结果
//     const taskOutputs: string[] = []
//     let accumulatedTokens = 0  // 累积的 TOKEN 数量
//     const tokenThreshold = chat.taskModeOptions?.tokenThreshold ?? 8000  // TOKEN 阈值，超过后进行整合
// 
//     // 简单的 TOKEN 估算函数
//     function estimateTokens(text: string): number {
//       // 中文：约 1.5 tokens/字符，英文：约 0.25 tokens/字符
//       // 简化估算：总字符数 * 0.6
//       return Math.ceil(text.length * 0.6)
//     }
// 
//     for (let i = 0; i < tasks.length; i++) {
//       const chatController = controllers.value[currentChat.value!.id]
//       if (chatController?.signal.aborted) {
//         throw new Error('用户取消')
//       }
// 
//       currentTaskIndex.value = i
//       const task = tasks[i]
//       if (!task) break
// 
//       // 获取工作记忆上下文（合并后）
//       const workingMemory = getWorkingMemoryForNextTask(i)
//       //console.log(`[Task ${i}] 获取工作记忆:`, {
//       //   previousNotes: workingMemory.previousNotes ? '有' : '无',
//       //   previousDrafts: workingMemory.previousDrafts ? '有' : '无',
//       //   previousFinalResults: workingMemory.previousFinalResults ? '有' : '无'
//       // })
//       let workingMemoryContext = ''
// 
//       if (workingMemory.previousNotes || workingMemory.previousDrafts || workingMemory.previousFinalResults) {
//         // 使用 LLM 合并工作记忆
//         workingMemoryContext = await mergeWorkingMemory(
//           workingMemory.previousNotes,
//           workingMemory.previousDrafts,
//           workingMemory.previousFinalResults
//         )
//       }
// 
//       // 添加任务执行消息
//       const taskMsgIndex = chat.messages.length
//       const taskPrompt = i === 0
//         ? `**任务 ${i + 1}/${tasks.length}**: ${task.description}`
//         : `请继续完成以下任务：${task.description}`
//       chat.messages.push({ role: 'user', content: taskPrompt, reasoning: '', visible: false, copyable: false })
//       chat.messages.push({ role: 'assistant', content: '', reasoning: '' })
// 
//       const msg = chat.messages[taskMsgIndex + 1]
//       // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
//       delete reasoningStartTime.value[taskMsgIndex + 1]
//       if (!msg) break
// 
//       // 流式执行任务（携带完整的对话历史和工作记忆上下文）
//       const result = await executeTaskStreaming(
//         task.description,
//         i === 0 ? undefined : previousResult,
//         mergedContext,
//         chat.messages.slice(0, -1), // 传递当前聊天历史的所有消息
//         workingMemoryContext || undefined, // 新增：工作记忆上下文
//         (delta) => {
//           msg.content += delta
//           scrollToBottom()
//         },
//         (reasoningDelta) => {
//           msg.reasoning += reasoningDelta
//           scrollToBottom()
//         },
//         (duration) => {
//           msg.reasoningDuration = duration
//         }
//       )
// 
//       // 处理工具调用
//       if (result.toolCalls && result.toolCalls.length > 0) {
//         msg.tool_calls = result.toolCalls
//         console.log('[TaskMode] Processing tool_calls:', result.toolCalls)
// 
//         // 执行工具调用
//         try {
//           // 先添加执行中的工具消息
//           const toolCallIds = result.toolCalls.map((tc: any) => tc.id)
//           for (const toolCallId of toolCallIds) {
//             chat.messages.push({
//               role: 'tool' as any,
//               content: '执行中...',
//               reasoning: '',
//               tool_call_id: toolCallId,
//               toolStatus: 'running'
//             })
//           }
//           scrollToBottom()
// 
//           const toolResults = await mcpManager.executeToolCalls(result.toolCalls)
// 
//           // 更新工具结果消息
//           let resultIndex = chat.messages.length - toolResults.length
//           for (const resultMsg of toolResults) {
//             const targetMsg = chat.messages[resultIndex]
//             if (targetMsg && targetMsg.tool_call_id === resultMsg.tool_call_id) {
//               targetMsg.content = resultMsg.content
//               // 根据内容判断是否成功
//               targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
//             }
//             resultIndex++
//           }
// 
//           // 继续任务执行，发送包含工具结果的请求
//           await continueTaskAfterToolCalls(
//             task.description,
//             i === 0 ? undefined : previousResult,
//             mergedContext,
//             workingMemoryContext,
//             msg
//           )
//         } catch (e) {
//           console.error('[TaskMode] Tool execution failed:', e)
//           msg.content += `\n\n[工具执行失败: ${e}]`
//         }
//       }
// 
//       // 保存任务输出到工作记忆
//       await saveTaskResultToWorkingMemory(
//         i,
//         task.description,
//         msg.content,
//         WorkingMemoryType.FINAL_RESULT
//       )
// 
//       // 保存任务输出用于最终整合
//       taskOutputs.push(msg.content)
// 
//       // 累积 TOKEN 数量
//       accumulatedTokens += estimateTokens(msg.content)
// 
//       // 标记任务完成
//       const taskList = currentChat.value?.taskList
//       const currentTask = taskList?.[i]
//       if (currentTask) {
//         currentTask.completed = true
//       }
// 
//       // 检查是否需要进行中间整合（基于累积 TOKEN 数量）
//       const needsIntermediateMerge =
//         accumulatedTokens >= tokenThreshold &&  // 达到 TOKEN 阈值
//         i < tasks.length - 1                     // 且不是最后一个任务
// 
//       if (needsIntermediateMerge) {
//         // 添加中间整合提示消息
//         chat.messages.push({ role: 'assistant', content: '**正在进行中间整合...**', reasoning: '', copyable: false })
//         scrollToBottom()
// 
//         // 执行中间整合
//         const mergeResult = await performIntermediateMerge(
//           chat.messages.slice(0, -1),
//           i,
//           tasks.length
//         )
// 
//         // 更新 mergedContext
//         mergedContext = mergeResult
// 
//         // 归档当前消息（保留原始用户请求和整合结果）
//         const originalUserMsg = chat.messages[0]
//         if (!originalUserMsg) {
//           throw new Error('对话历史为空，无法重置')
//         }
// 
//         // 初始化归档数组
//         if (!chat.archivedMessages) chat.archivedMessages = []
// 
//         // 归档当前消息（排除原始用户请求）
//         const messagesToArchive = chat.messages.slice(1).map(msg => ({
//           ...msg,
//           archived: true  // 标记为已归档
//         }))
//         chat.archivedMessages.push(messagesToArchive)
// 
//         // 重置消息为整合结果
//         chat.messages = [
//           originalUserMsg,
//           { role: 'assistant', content: mergeResult, reasoning: '', visible: false }
//         ]
// 
//         // 清空 previousResult，因为整合后的上下文已经包含了所有信息
//         previousResult = undefined
//       } else {
//         // 正常流程：根据配置决定是否总结任务结果
//         const enableSummary = chat.taskModeOptions?.enableTaskSummary ?? false
//         if (i < tasks.length - 1 && task && msg && enableSummary) {
//           // 只有启用总结且不是最后一个任务时才总结
//           previousResult = await summarizeTaskResult(task.description, msg.content)
//         }
//       }
// 
//       // 推理内容完成后自动折叠
//       if (msg.reasoning) {
//         reasoningExpanded.value[taskMsgIndex + 1] = false
//       }
// 
//       scrollToBottom()
//     }
// 
//     // 3. 检查是否需要额外的最终整合
//     isTaskExecuting.value = false
// 
//     // 检查最后一个任务是否已经是整合验证任务
//     const lastTask = tasks[tasks.length - 1]
//     const hasIntegrationTask = lastTask?.description?.includes('整合验证')
// 
//     if (!hasIntegrationTask) {
//       // 向后兼容：如果没有整合验证任务，执行硬编码的最终整合
//       // 添加整合消息
//       chat.messages.push({ role: 'assistant', content: '**正在整合最终回答...**', reasoning: '', copyable: false })
//       const integrationMsgIndex = chat.messages.length
//       chat.messages.push({ role: 'assistant', content: '', reasoning: '' })
//       // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
//       delete reasoningStartTime.value[integrationMsgIndex]
// 
//       const integrationMsg = chat.messages[integrationMsgIndex]
//       if (!integrationMsg) return
// 
//       // 发送整合请求（携带完整对话历史）
//       await executeTaskStreaming(
//         '整合最终回答',
//         undefined,
//         undefined,
//         chat.messages.slice(0, -1),
//         undefined, // 工作记忆上下文
//         (delta) => {
//           integrationMsg.content += delta
//           scrollToBottom()
//         },
//         () => {},
//         () => {}
//       )
// 
//       // 移除"正在整合"消息，用最终结果替换
//       chat.messages.splice(integrationMsgIndex - 1, 1)
// 
//       // 推理内容完成后自动折叠
//       if (integrationMsg.reasoning) {
//         reasoningExpanded.value[integrationMsgIndex] = false
//       }
//     }
// 
//     // 4. 任务完成
//     chat.messages.push({ role: 'assistant', content: '---\n\n**所有任务已完成！**', reasoning: '', copyable: false })
// 
//   } catch (err) {
//     const chat = currentChat.value
//     if (chat) {
//       const last = chat.messages[chat.messages.length - 1]
//       if (last) {
//         if (err instanceof Error && err.name === 'AbortError') {
//           last.content = '任务已取消'
//         } else if (err instanceof TaskError) {
//           last.content = err.getUserMessage()
//         } else {
//           last.content = formatTaskErrorMessage(err)
//         }
//       }
//       // 如果是网络错误等可恢复错误，保存执行上下文以便继续执行
//       if (!(err instanceof Error && err.name === 'AbortError')) {
//         // 找到下一个未完成的任务索引
//         const nextTaskIndex = chat.taskList?.findIndex(t => !t.completed) ?? 0
//         if (nextTaskIndex >= 0 && nextTaskIndex < (chat.taskList?.length ?? 0)) {
//           // 保存执行上下文（这里简化处理，实际 previousResult 和 mergedContext 无法恢复）
//           chat.taskExecutionContext = {
//             nextTaskIndex,
//             accumulatedTokens: 0  // 简化处理，重置 token 计数
//           }
//           executionFailed.value = true
//         }
//       }
//     }
//   } finally {
//     if (currentChat.value) {
//       currentChat.value.sending = false
//       delete controllers.value[currentChat.value.id]
//     }
//     isTaskPlanning.value = false
//     isTaskExecuting.value = false
//     awaitingTaskConfirmation.value = false
//     currentTaskIndex.value = -1
//     // 如果是可恢复错误，保留 pendingTasks 以便继续执行
//     if (!executionFailed.value) {
//       pendingTasks.value = []
//     }
//     saveChatHistory()
//     scrollToBottom()
//   }
// }

// ============ TASK MODE - DISABLED ============
// // 取消任务执行
// function cancelTaskExecution() {
//   if (currentChat.value) {
//     // 添加取消消息
//     currentChat.value.messages.push({ role: 'assistant', content: '---\n\n任务执行已取消', reasoning: '', copyable: false })
//     currentChat.value.sending = false
//     delete controllers.value[currentChat.value.id]
//   }
//   isTaskPlanning.value = false
//   isTaskExecuting.value = false
//   awaitingTaskConfirmation.value = false
//   currentTaskIndex.value = -1
//   pendingTasks.value = []
//   executionFailed.value = false
//   saveChatHistory()
//   scrollToBottom()
// }
// =============================================

// ============ TASK MODE - DISABLED ============
// // 继续执行任务（从失败处恢复）
// async function continueTaskExecution() {
//   // ... (省略函数体，约200行)
// }
// =============================================

// ============ TASK MODE - DISABLED ============
// // 处理重新规划请求
// async function handleRevisePlan(feedback: string) { ... }
// // 重试失败的任务
// async function retryTask(taskId: number) { ... }
// // 跳过失败的任务
// async function skipTask(taskId: number) { ... }
// // 删除任务
// function deleteTask(taskId: number) { ... }
// // 更新任务描述
// function updateTaskDescription(taskId: number, newDescription: string) { ... }
// // 切换模式
// function switchMode(isTaskMode: boolean) { ... }
// // 更新任务模式选项
// function updateTaskModeOptions(options: ...) { ... }
// =============================================

function cancel() {
  if (currentChat.value) {
    const chatController = controllers.value[currentChat.value.id]
    if (chatController) {
      chatController.abort()
      currentChat.value.sending = false
      delete controllers.value[currentChat.value.id]
    }
  }
}

function toggleReasoning(index: number) {
  reasoningExpanded.value[index] = !reasoningExpanded.value[index]
}

// @ts-expect-error 保留用于未来功能
function toggleArchived(index: number) {
  archivedExpanded.value[index] = !archivedExpanded.value[index]
}

function scrollToBottom() {
  // ============ TASK MODE - DISABLED ============
  // // 普通会话模式使用 NormalChat 组件的方法
  // if (!taskMode.value && normalChatRef.value) {
  //   normalChatRef.value.scrollToBottom()
  //   return
  // }
  //
  // // 任务模式使用 TaskChat 组件的方法
  // if (taskMode.value && taskChatRef.value) {
  //   taskChatRef.value.scrollToBottom()
  //   return
  // }
  // =============================================

  // 普通会话模式使用 NormalChat 组件的方法
  if (normalChatRef.value) {
    normalChatRef.value.scrollToBottom()
    return
  }
}

function createNewChat() {
  // ============ TASK MODE - DISABLED ============
  // // 移除 isTaskModeChat 参数，始终创建普通会话
  // function createNewChat(isTaskModeChat: boolean = false) {
  // =============================================

  // 使用上一个对话的助理和配置，如果没有则使用当前全局选中的
  const lastAssistantId = chatList.value[0]?.assistantId
  const currentAssistantId = assistantList.value.activeIndex >= 0
    ? assistantList.value.assistants[assistantList.value.activeIndex]?.id
    : undefined
  const lastConfigId = chatList.value[0]?.configId
  const currentConfigId = configList.value.activeIndex >= 0 ? configList.value.activeIndex : undefined

  // 使用上一个对话的参数配置，如果没有则使用默认值
  const lastParams = chatList.value[0]?.params
  const newParams = lastParams ? { ...lastParams } : { ...DEFAULT_CHAT_PARAMS }

  const newChat: Chat = {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    assistantId: lastAssistantId || currentAssistantId,
    configId: lastConfigId ?? currentConfigId,
    params: newParams
  }
  chatList.value.unshift(newChat)
  currentChatId.value = newChat.id
  saveChatHistory()
}

function switchChat(chatId: string) {
  currentChatId.value = chatId
}

// ============ TASK MODE - DISABLED ============
// function switchMode(isTaskMode: boolean) {
//   // 如果当前没有对话，创建新对话
//   if (!currentChatId.value) {
//     createNewChat(isTaskMode)
//     return
//   }
//
//   // 如果当前对话已经是目标模式，不做处理
//   const current = currentChat.value
//   if (current && current.isTaskMode === isTaskMode) return
//
//   // 查找目标模式的第一个会话
//   const targetModeChats = isTaskMode ? taskModeChats.value : normalChats.value
//   if (targetModeChats.length > 0) {
//     // 切换到目标模式的第一个会话
//     switchChat(targetModeChats[0].id)
//   } else {
//     // 如果目标模式没有会话，创建新会话
//     createNewChat(isTaskMode)
//   }
// }
// =============================================

function deleteChat(chatId: string, event: Event) {
  event.stopPropagation()

  // ============ TASK MODE - DISABLED ============
  // // 清理工作记忆
  // try {
  //   const wm = useWorkingMemory(chatId)
  //   wm.clear()
  //   //console.log(`Working memory cleared for chat ${chatId}`)
  // } catch (e) {
  //   console.error('Failed to clear working memory:', e)
  // }
  // =============================================

  chatList.value = chatList.value.filter(c => c.id !== chatId)
  if (currentChatId.value === chatId) {
    currentChatId.value = chatList.value.length > 0 ? chatList.value[0]?.id ?? null : null
  }
  saveChatHistory()
}

function updateChatTitle(chatId: string, firstMessage: string) {
  const chat = chatList.value.find(c => c.id === chatId)
  if (chat) {
    chat.title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : '')
    saveChatHistory()
  }
}

function changeAssistant(assistantId: string) {
  const chat = currentChat.value
  if (chat) {
    chat.assistantId = assistantId || undefined
    saveChatHistory()
  }
}

function changeChatConfig(configIndex: string) {
  const chat = currentChat.value
  if (chat) {
    chat.configId = configIndex ? Number(configIndex) : undefined
    saveChatHistory()
  }
}

// 更新思考模式设置
async function handleUpdateEnableThinking(value: boolean) {
  const chat = currentChat.value
  if (chat && chat.configId !== undefined && chat.configId !== null) {
    const config = configList.value.configs[chat.configId]
    if (!config) return

    // 更新配置中的 enable_thinking
    config.enable_thinking = value

    // 同步更新 extra_body 中的 enable_thinking
    try {
      let extraBody: Record<string, any> = {}
      const currentExtraBody = config.extra_body
      if (currentExtraBody && currentExtraBody.trim()) {
        extraBody = JSON.parse(currentExtraBody)
      }
      extraBody.enable_thinking = value
      config.extra_body = JSON.stringify(extraBody, null, 2)
    } catch {
      config.extra_body = JSON.stringify({ enable_thinking: value }, null, 2)
    }

    // 保存配置
    await storage.saveConfigList(configList.value)
  }
}

// 打开参数配置对话框
function openParamsDialog() {
  const chat = currentChat.value
  if (chat) {
    // 合并已保存的参数和默认参数
    const saved = chat.params || {}
    tempParams.value = {
      temperature: saved.temperature ?? DEFAULT_CHAT_PARAMS.temperature,
      top_p: saved.top_p ?? DEFAULT_CHAT_PARAMS.top_p,
      max_tokens: saved.max_tokens ?? DEFAULT_CHAT_PARAMS.max_tokens,  // 默认 0
      presence_penalty: saved.presence_penalty ?? DEFAULT_CHAT_PARAMS.presence_penalty,
      frequency_penalty: saved.frequency_penalty ?? DEFAULT_CHAT_PARAMS.frequency_penalty,
      seed: saved.seed,  // seed 如果未设置则为 undefined
    }
    showParamsDialog.value = true
  }
}

// 保存参数配置
function saveParams() {
  const chat = currentChat.value
  if (chat) {
    // 只保存非 undefined 的参数，max_tokens 只有大于 0 才保存
    const savedParams: ChatParams = {}
    if (tempParams.value.temperature !== undefined && tempParams.value.temperature !== DEFAULT_CHAT_PARAMS.temperature) {
      savedParams.temperature = tempParams.value.temperature
    }
    if (tempParams.value.top_p !== undefined && tempParams.value.top_p !== DEFAULT_CHAT_PARAMS.top_p) {
      savedParams.top_p = tempParams.value.top_p
    }
    // max_tokens 只有大于 0 才保存
    if (tempParams.value.max_tokens !== undefined && tempParams.value.max_tokens > 0 && tempParams.value.max_tokens !== DEFAULT_CHAT_PARAMS.max_tokens) {
      savedParams.max_tokens = tempParams.value.max_tokens
    }
    if (tempParams.value.presence_penalty !== undefined && tempParams.value.presence_penalty !== DEFAULT_CHAT_PARAMS.presence_penalty) {
      savedParams.presence_penalty = tempParams.value.presence_penalty
    }
    if (tempParams.value.frequency_penalty !== undefined && tempParams.value.frequency_penalty !== DEFAULT_CHAT_PARAMS.frequency_penalty) {
      savedParams.frequency_penalty = tempParams.value.frequency_penalty
    }
    // seed 只有明确设置了才保存
    if (tempParams.value.seed !== undefined && tempParams.value.seed !== 0) {
      savedParams.seed = tempParams.value.seed
    }
    chat.params = Object.keys(savedParams).length > 0 ? savedParams : undefined
    saveChatHistory()
  }
  showParamsDialog.value = false
}

// 重置参数为默认值
function resetParams() {
  tempParams.value = { ...DEFAULT_CHAT_PARAMS }
}

// ============ TASK MODE - DISABLED ============
// // 更新任务模式选项
// function updateTaskModeOptions(options: { enableTaskSummary?: boolean; tokenThreshold?: number }) {
//   const chat = currentChat.value
//   if (chat) {
//     if (!chat.taskModeOptions) {
//       chat.taskModeOptions = {}
//     }
//     if (options.enableTaskSummary !== undefined) {
//       chat.taskModeOptions.enableTaskSummary = options.enableTaskSummary
//     }
//     if (options.tokenThreshold !== undefined) {
//       chat.taskModeOptions.tokenThreshold = options.tokenThreshold
//     }
//     saveChatHistory()
//   }
// }
// =============================================

async function saveChatHistory() {
  await storage.saveChatHistory(chatList.value)
}

async function loadChatHistory() {
  try {
    const history = await storage.getChatHistory()
    chatList.value = history
    if (chatList.value.length > 0) {
      currentChatId.value = chatList.value[0]?.id ?? null
    } else {
      createNewChat()
    }
  } catch (e) {
    console.error('Failed to load chat history:', e)
    createNewChat()
  }
}

function logout() {
  showLogoutConfirmDialog.value = true
}

async function confirmLogout() {
  await storage.clearLoginInfo()
  router.push('/login')
  showLogoutConfirmDialog.value = false
}

function cancelLogout() {
  showLogoutConfirmDialog.value = false
}

onMounted(async () => {
  await loadChatHistory()
  await loadConfig()
  await loadAssistants()
  await loadHighlightTheme()
  await mcpManager.loadServers()
  // 加载用户名
  const savedUsername = await storage.getUsername()
  if (savedUsername) {
    username.value = savedUsername
  }
  // 加载全局记忆
  await globalMemoryManager.load()

  // 加载选中的文件夹并同步到 mcpManager 和 currentFolder
  const savedFolder = await storage.getSelectedFolder()
  if (savedFolder) {
    mcpManager.setSelectedFolder(savedFolder)
    currentFolder.value = savedFolder
  }

  // 设置命令确认回调
  mcpManager.setCommandConfirmCallback(handleCommandConfirm)

  scrollToBottom()
})

onUnmounted(() => {
  // 清理命令确认回调
  mcpManager.setCommandConfirmCallback(null)
})

// 处理文件夹变化
function handleFolderChanged(path: string) {
  mcpManager.setSelectedFolder(path)
  currentFolder.value = path
}

// ============ TASK MODE - DISABLED ============
// // 监听会话切换，加载工作记忆
// watch(currentChatId, (newChatId) => {
//   if (newChatId) {
//     const chat = chatList.value.find(c => c.id === newChatId)
//     if (chat?.isTaskMode) {
//       initWorkingMemory(newChatId)
//     }
//   }
// })
// =============================================
</script>

<template>
  <div class="container">
    <aside class="sidebar" :class="{ collapsed: !showSidebar }">
      <!-- 工作空间内容 -->
      <div class="workspace-wrapper">
        <WorkspaceView :current-folder="currentFolder" />
      </div>

      <!-- 侧边栏底部固定区域 -->
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">{{ username.charAt(0).toUpperCase() }}</div>
          <div class="user-details">
            <div class="user-name">{{ username }}</div>
          </div>
        </div>
        <div class="footer-actions">
          <button class="footer-btn" @click="router.push('/settings')" title="设置">
            <SettingsIcon :size="18" />
          </button>
          <button class="footer-btn" @click="logout" title="退出登录">
            <LogoutIcon :size="18" />
          </button>
        </div>
      </div>
    </aside>
    <div class="content-wrapper">
      <!-- ============ TASK MODE - DISABLED ============ -->
      <!-- <div class="content-area" :class="{ 'with-task-panel': taskMode }"> -->
      <div class="content-area">
        <!-- 标签栏 -->
        <ChatTabBar
          :chat-list="normalChats"
          :current-chat-id="currentChatId"
          @switch-chat="switchChat"
          @delete-chat="deleteChat"
          @create-chat="createNewChat"
        />
      <!-- ============================================= -->
      <!-- 普通会话模式 -->
      <NormalChat
        :messages="messages"
        :input="input"
        :sending="sending"
        :active-config="activeConfig"
        :active-assistant="activeAssistant"
        :current-chat="currentChat"
        :assistant-list="assistantList"
        :config-list="configList"
        :usage="currentChat?.usage"
        :enable-thinking="activeConfig?.enable_thinking ?? false"
        @send="send"
        @cancel="cancel"
        @update:input="input = $event"
        @toggle-reasoning="toggleReasoning"
        @open-params-dialog="openParamsDialog"
        @change-assistant="changeAssistant"
        @change-config="changeChatConfig"
        @clear-assistant="changeAssistant('')"
        @folder-changed="handleFolderChanged"
        @update:enable-thinking="handleUpdateEnableThinking"
        ref="normalChatRef"
      />

      <!-- ============ TASK MODE - DISABLED ============ -->
      <!-- 任务模式组件已移除 -->
      <!-- <TaskChat v-else ... /> -->
      <!-- <TaskModePanel ... /> -->
      <!-- ============================================ -->
    </div>
    </div>  <!-- content-area 结束 -->

    <!-- 参数配置对话框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showParamsDialog" class="dialog-overlay" @click.self="showParamsDialog = false">
          <div class="dialog-content">
          <div class="dialog-header">
            <h3>对话参数配置</h3>
            <button class="dialog-close" @click="showParamsDialog = false"><XIcon :size="16" /></button>
          </div>
          <div class="dialog-body">
            <div class="param-group">
              <label class="param-label">
                <span>Temperature (温度)</span>
                <span class="param-value">{{ tempParams.temperature }}</span>
              </label>
              <input
                type="range"
                v-model.number="tempParams.temperature"
                min="0"
                max="2"
                step="0.1"
                class="param-range"
              />
              <p class="param-desc">控制输出的随机性，值越高越随机，值越低越确定</p>
            </div>

            <div class="param-group">
              <label class="param-label">
                <span>Top P (核采样)</span>
                <span class="param-value">{{ tempParams.top_p }}</span>
              </label>
              <input
                type="range"
                v-model.number="tempParams.top_p"
                min="0"
                max="1"
                step="0.05"
                class="param-range"
              />
              <p class="param-desc">控制词汇选择范围，值越小越保守</p>
            </div>

            <div class="param-group">
              <label class="param-label">
                <span>Max Tokens (最大生成长度)</span>
                <div class="param-value-with-action">
                  <span class="param-value">{{ tempParams.max_tokens === 0 ? '未设置' : tempParams.max_tokens }}</span>
                  <button
                    v-if="tempParams.max_tokens !== undefined && tempParams.max_tokens > 0"
                    type="button"
                    class="clear-btn"
                    @click="tempParams.max_tokens = 0"
                    title="清空限制"
                  ><XIcon :size="12" /></button>
                </div>
              </label>
              <input
                type="number"
                v-model.number="tempParams.max_tokens"
                min="0"
                max="128000"
                class="param-number"
                placeholder="留空或 0 则不限制"
              />
              <p class="param-desc">限制生成的最大 token 数量，0 或留空则不限制</p>
            </div>

            <div class="param-group">
              <label class="param-label">
                <span>Presence Penalty (存在惩罚)</span>
                <span class="param-value">{{ tempParams.presence_penalty }}</span>
              </label>
              <input
                type="range"
                v-model.number="tempParams.presence_penalty"
                min="-2"
                max="2"
                step="0.1"
                class="param-range"
              />
              <p class="param-desc">惩罚已出现的话题，鼓励讨论新话题</p>
            </div>

            <div class="param-group">
              <label class="param-label">
                <span>Frequency Penalty (频率惩罚)</span>
                <span class="param-value">{{ tempParams.frequency_penalty }}</span>
              </label>
              <input
                type="range"
                v-model.number="tempParams.frequency_penalty"
                min="-2"
                max="2"
                step="0.1"
                class="param-range"
              />
              <p class="param-desc">惩罚重复的 token，鼓励多样性</p>
            </div>

            <div class="param-group">
              <label class="param-label">
                <span>Seed (随机种子)</span>
                <div class="param-value-with-action">
                  <span class="param-value">{{ tempParams.seed === undefined || tempParams.seed === 0 ? '未设置' : tempParams.seed }}</span>
                  <button
                    v-if="tempParams.seed !== undefined && tempParams.seed !== 0"
                    type="button"
                    class="clear-btn"
                    @click="tempParams.seed = undefined"
                    title="清空种子"
                  ><XIcon :size="12" /></button>
                </div>
              </label>
              <input
                type="number"
                v-model.number="tempParams.seed"
                min="0"
                max="4294967295"
                class="param-number"
                placeholder="留空则不使用固定种子"
              />
              <p class="param-desc">固定随机种子以获得可重复的结果</p>
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn secondary" @click="resetParams">
              重置默认
            </button>
            <button type="button" class="btn ghost" @click="showParamsDialog = false">
              取消
            </button>
            <button type="button" class="btn primary" @click="saveParams">
              保存
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>

    <!-- 快速保存到全局记忆对话框 -->
    <SaveToGlobalMemoryDialog
      :show="showSaveToGlobalMemoryDialog"
      :initial-content="saveToGlobalMemoryContent"
      :initial-keywords="saveToGlobalMemoryKeywords"
      @close="showSaveToGlobalMemoryDialog = false"
      @saved="showSaveToGlobalMemoryDialog = false"
    />

    <!-- HTML预览对话框 -->
    <HtmlPreviewDialog
      :show="showHtmlPreview"
      :html-content="htmlPreviewContent"
      @close="showHtmlPreview = false"
    />

    <!-- 退出登录确认对话框 -->
    <ConfirmDialog
      :show="showLogoutConfirmDialog"
      title="退出登录"
      message="确定要退出登录吗？"
      confirm-text="确认退出"
      cancel-text="取消"
      type="warning"
      @confirm="confirmLogout"
      @cancel="cancelLogout"
    />

    <!-- 命令执行确认对话框 -->
    <ConfirmDialog
      :show="showCommandConfirmDialog"
      title="确认执行命令"
      :message="`即将执行风险命令：\n${pendingCommand}\n\n风险类型：${pendingCommandReason}\n\n是否继续？`"
      confirm-text="确认执行"
      cancel-text="取消"
      type="danger"
      @confirm="onCommandConfirm"
      @cancel="onCommandCancel"
    />
  </div>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  background: var(--color-bg-primary);
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-width: 0;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar {
  width: 260px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 0;
  overflow: hidden;
  border: none;
}

.sidebar-header {
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: 8px;
}

/* new-chat-btn and toggle-sidebar-btn styles moved to global style.css */
.new-chat-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.plus-icon {
  font-size: 18px;
  line-height: 1;
}

.toggle-sidebar-btn {
  width: 36px;
  padding: 0;
}

/* 侧边栏标签栏样式 */
.sidebar-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.sidebar-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.sidebar-tab:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border-radius: 6px 6px 0 0;
}

.sidebar-tab.active {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 500;
}

.tab-icon {
  flex-shrink: 0;
}

/* 侧边栏底部固定区域 */
.sidebar-footer {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.footer-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

/* 工作空间包装器 */
.workspace-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-primary);
}

.chat-list {
  height: calc(100vh - 170px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) transparent;
}

.chat-list::-webkit-scrollbar {
  width: 6px;
}

.chat-list::-webkit-scrollbar-track {
  background: transparent;
}

.chat-list::-webkit-scrollbar-thumb {
  background-color: var(--color-border-hover);
  border-radius: 3px;
}

.chat-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-tertiary);
}

.chat-item {
  padding: 12px 14px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
  position: relative;
}

.chat-item:hover {
  background: var(--color-bg-tertiary);
}

.chat-item.active {
  background: var(--color-bg-tertiary);
}

.chat-title {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-group {
  margin-bottom: 12px;
}

.chat-group-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 600;
  padding: 4px 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

/* delete-chat-btn styles moved to global style.css */
.delete-chat-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
}

.chat-item:hover .delete-chat-btn {
  opacity: 1;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-bg-primary);
}

.header-inner {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  font-weight: 600;
}

.sidebar-toggle {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  display: flex;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-primary);
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-primary);
}

/* 模式切换器样式 */
.mode-switcher {
  display: flex;
  align-items: center;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
  margin-left: 16px;
}

/* mode-switcher-btn styles moved to global style.css */

/* settings-btn, assistant-btn, mcp-btn, logout-btn styles moved to global style.css */
.settings-btn, .assistant-btn, .mcp-btn, .logout-btn {
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 999px;
  min-width: 40px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.messages {
  background: var(--color-bg-primary);
  height: calc(76vh);
  overflow: auto;
}

.welcome {
  max-width: 720px;
  margin: 80px auto 0;
  text-align: center;
  color: var(--color-text-secondary);
  padding: 0 20px;
}

.welcome h2 {
  margin: 0 0 12px 0;
  color: var(--color-text-primary);
  font-size: 24px;
}

.welcome p {
  margin: 8px 0;
  font-size: 14px;
}

.msg-row {
  display: flex;
  padding: 14px 0;
}

.msg-row.assistant {
  background: var(--color-bg-secondary);
}

.msg-content {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;
}

.msg-row.user .msg-content {
  display: flex;
  justify-content: flex-end;
}

.msg-bubble {
  font-size: 15px;
  line-height: 1.7;
  max-width: 720px;
  word-break: break-word;
}

.msg-reasoning-bubble {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  max-width: 720px;
  word-break: break-word;
  background: var(--color-bg-tertiary);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.reasoning-section {
  margin-bottom: 12px;
}

.reasoning-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: color 0.2s;
}

.reasoning-toggle:hover {
  color: var(--color-text-primary);
}

.reasoning-toggle span:first-child {
  font-size: 10px;
}

.msg-row.user .msg-bubble {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  padding: 12px 16px;
  border-radius: 14px;
}

.msg-row.assistant .msg-bubble {
  background: transparent;
  padding: 0;
}

.msg-bubble-wrapper {
  position: relative;
}

.msg-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: flex-end;
}

.copy-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: var(--color-bg-secondary);
}

.msg-bubble :deep(p) {
  margin: 0 0 10px 0;
}

.msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-bubble :deep(pre) {
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  overflow: auto;
  border: 1px solid var(--color-border);
  position: relative;
}

.msg-bubble :deep(.code-copy-btn) {
  position: absolute;
  top: 8px;
  right: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--color-text-secondary);
}

.msg-bubble :deep(.code-copy-btn:hover) {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.msg-bubble :deep(.code-preview-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: rgba(16, 163, 127, 0.9);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--color-text-on-primary);
}

.msg-bubble :deep(.code-preview-btn:hover) {
  background: #0d8a6c;
  border-color: #0d8a6c;
}

.msg-bubble :deep(code) {
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
}

/* 链接样式 - 禁用默认行为 */
.msg-bubble :deep(a) {
  color: var(--color-text-primary);
  text-decoration: none;
  cursor: pointer;
}

/* Table styles */
.msg-bubble :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 14px;
}

.msg-bubble :deep(table th),
.msg-bubble :deep(table td) {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  text-align: left;
}

.msg-bubble :deep(table th) {
  background: var(--color-bg-tertiary);
  font-weight: 500;
}

.msg-bubble :deep(table tr:hover td) {
  background: var(--color-bg-secondary);
}

.inputbar {
  position: relative;
  padding: 10px 10px;
}

.model-bar {
  max-width: 900px;
  margin: 0 auto 16px;
  color: var(--color-text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.assistant-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f0fdf4;
  color: #166534;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 13px;
}

.assistant-select {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #86efac;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.assistant-select:hover {
  background: #dcfce7;
  border-color: var(--color-primary);
}

.assistant-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.config-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.config-select:hover {
  background: var(--color-bg-primary);
  border-color: var(--color-border);
}

.config-select:focus {
  outline: none;
  border-color: var(--color-border);
  box-shadow: 0 0 0 2px rgba(161, 161, 161, 0.2);
}

.composer {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.composer {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-tertiary);
}

.textarea {
  flex: 1;
  resize: none;
  padding: 6px 8px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--color-text-primary);
  overflow-y: auto;
  height: 51px;
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 13px;
}

.btn.primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-color: var(--color-primary);
}

.btn.primary:disabled {
  background: #b7b7b7;
  border-color: #b7b7b7;
  cursor: not-allowed;
}

.btn.ghost {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn.ghost:disabled {
  color: var(--color-text-tertiary);
}

:deep(hr) {
  border-color:rgba(255, 255, 255, 0);
}

/* 任务模式样式 */
.task-mode-toggle {
  /* display: flex;
  align-items: center;
  margin-left: auto; */
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggle-label input[type="checkbox"] {
  display: none;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: #d1d5db;
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-label input:checked + .toggle-switch {
  background: var(--color-primary);
}

.toggle-label input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

.toggle-label input:disabled + .toggle-switch {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-text {
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* params-btn styles moved to global style.css */
.params-btn {
  margin-left: auto;
}

/* 参数配置对话框 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--color-bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.dialog-close {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.dialog-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
}

.param-group {
  margin-bottom: 20px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.param-value {
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
}

.param-value-with-action {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* clear-btn styles moved to global style.css */

.param-range {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  outline: none;
  -webkit-appearance: none;
}

.param-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  transition: background 0.2s;
}

.param-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  transition: background 0.2s;
  border: none;
}

.param-range::-webkit-slider-thumb:hover {
  background: #0d8a6c;
}

.param-number {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.param-number:focus {
  border-color: var(--color-primary);
}

.param-desc {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
}

.btn.secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.btn.secondary:hover {
  background: var(--color-border);
}

/* 归档历史消息样式 */
.archive-section {
  margin: 12px 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

.archive-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border: none;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: background 0.2s;
}

.archive-toggle:hover {
  background: var(--color-border);
  color: var(--color-text-primary);
}

.archive-toggle span:first-child {
  font-size: 10px;
  transition: transform 0.2s;
}

.archive-count {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-weight: 400;
}

.archive-messages {
  padding: 8px 0;
  max-height: 500px;
  overflow-y: auto;
}

.msg-row.archived {
  opacity: 0.7;
  background: var(--color-bg-secondary);
}

.msg-row.archived .msg-bubble {
  font-size: 14px;
}

.msg-row.archived .msg-reasoning-bubble {
  background: var(--color-bg-tertiary);
  font-size: 13px;
  padding: 10px 14px;
}

.archived-reasoning {
  margin-bottom: 10px;
}

.archived-label {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  display: inline-block;
}
</style>
