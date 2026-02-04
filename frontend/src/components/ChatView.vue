<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import type { ConfigList, AssistantList } from '../types/electron'
import {
  TaskStatus,
  TaskError,
  TaskErrorType,
  formatTaskErrorMessage,
  WorkingMemoryType
} from '../types/task'
import { useWorkingMemory } from '../composables/useWorkingMemory'
import { useGlobalMemory } from '../composables/useGlobalMemory'
import TaskModePanel from './TaskModePanel.vue'
import NormalChat from './NormalChat.vue'
import SaveToGlobalMemoryDialog from './SaveToGlobalMemoryDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
import { storage } from '../services/StorageService'

const router = useRouter()

// 工作记忆管理器（初始化为 null，在任务开始时创建）
let workingMemoryManager: ReturnType<typeof useWorkingMemory> | null = null

// 全局记忆管理器
const globalMemoryManager = useGlobalMemory()

// 快速保存到全局记忆对话框状态
const showSaveToGlobalMemoryDialog = ref(false)
const saveToGlobalMemoryContent = ref('')
const saveToGlobalMemoryKeywords = ref<string[]>([])

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// 退出登录确认对话框状态
const showLogoutConfirmDialog = ref(false)

// 提取关键词的简单函数
function extractKeywords(content: string): string[] {
  // 简单分词（中英文混合）
  const words = content
    .toLowerCase()
    .split(/[\s\u4e00-\u9fa5,;.!?。，；！？、]+/)
    .filter(w => w.length > 1)
  // 去重并返回前 5 个
  return Array.from(new Set(words)).slice(0, 5)
}

// 打开保存到全局记忆对话框
function openSaveToGlobalMemoryDialog(content: string) {
  saveToGlobalMemoryContent.value = content
  saveToGlobalMemoryKeywords.value = extractKeywords(content)
  showSaveToGlobalMemoryDialog.value = true
}

type Role = 'user' | 'assistant' | 'system'
type Message = { role: Role; content: string, reasoning: string, reasoningDuration?: number, visible?: boolean, copyable?: boolean, archived?: boolean }

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

type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  assistantId?: string
  configId?: number
  isTaskMode?: boolean
  sending?: boolean  // 当前会话的发送状态
  taskList?: {
    id: number
    description: string
    completed: boolean
    status?: TaskStatus
    error?: string
    retryCount?: number
  }[]
  params?: ChatParams  // 对话级别的参数配置
  archivedMessages?: Message[][]  // 任务模式整合时归档的消息段
  taskModeOptions?: {
    enableTaskSummary?: boolean  // 是否启用任务总结，默认 false
    tokenThreshold?: number      // TOKEN 阈值，默认 8000
    autoExecute?: boolean        // 是否自动执行（跳过确认），默认 false
    maxRetries?: number          // 最大重试次数，默认 0
    skipOnError?: boolean        // 失败时是否跳过继续执行，默认 false
    workingMemory?: {            // 工作记忆配置
      enabled?: boolean          // 是否启用工作记忆，默认 true
      autoSave?: boolean         // 是否自动保存，默认 true
      maxEntriesPerType?: number // 每种类型最大条目数，默认 50
    }
  }
  // 任务执行上下文（用于错误后继续执行）
  taskExecutionContext?: {
    nextTaskIndex: number       // 下一个要执行的任务索引
    previousResult?: string     // 上一个任务的总结结果
    mergedContext?: string      // 中间整合结果
    accumulatedTokens: number   // 累积的 TOKEN 数量
  }
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
    link.href = `/${savedTheme}.css`
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
// 任务模式 - 基于当前会话的 computed 属性
const taskMode = computed(() => currentChat.value?.isTaskMode ?? false)
// 发送状态 - 基于当前会话的 computed 属性
const sending = computed(() => currentChat.value?.sending ?? false)
// 新会话前的任务模式选择（只在会话为空时可编辑）
//const pendingTaskMode = ref(false)
const isTaskPlanning = ref(false)
const isTaskExecuting = ref(false)
const awaitingTaskConfirmation = ref(false)
const executionFailed = ref(false)  // 标记任务执行是否失败（用于显示继续执行按钮）
const pendingTasks = ref<{ id: number; description: string }[]>([])
// 保存原始用户输入用于重新规划
const originalUserInput = ref('')
// 任务模式设置状态
const showTaskSettings = ref(false)
// 参数配置对话框状态
const showParamsDialog = ref(false)
const tempParams = ref<ChatParams>({ ...DEFAULT_CHAT_PARAMS })
// taskList 从当前会话获取，如果没有则返回空数组
const taskList = computed(() => currentChat.value?.taskList ?? [])
const currentTaskIndex = ref(-1)

// 检测是否有未完成的任务（用于显示继续执行按钮）
const hasIncompleteTasks = computed(() => {
  const chat = currentChat.value
  if (!chat?.taskList || chat.taskList.length === 0) return false
  // 如果有未完成的任务，且不在执行中，也不在等待确认
  return chat.taskList.some(t => !t.completed) &&
         !isTaskExecuting.value &&
         !awaitingTaskConfirmation.value
})
//const taskResults = ref<string[]>([])
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
const messagesRef = ref<HTMLDivElement | null>(null)
const normalChatRef = ref<InstanceType<typeof NormalChat> | null>(null)
// 分组会话：任务模式和普通会话
const taskModeChats = computed(() => chatList.value.filter(c => c.isTaskMode === true))
const normalChats = computed(() => chatList.value.filter(c => c.isTaskMode === false || c.isTaskMode === undefined))
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScrollEnabled = ref(true)
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

function handleMessagesScroll() {
  const el = messagesRef.value
  if (!el) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  autoScrollEnabled.value = distanceToBottom <= 80
}

function autoResizeTextarea() {
  const textarea = textareaRef.value
  if (!textarea) return

  textarea.style.height = 'auto'
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 22), 51)
  textarea.style.height = newHeight + 'px'
}

function render(content: string) {
  return md.render(content)
}

function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

async function copyText(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    //alert('已复制')
  } catch (err) {
    console.error('Failed to copy:', err)
    alert('复制失败')
  }
}

async function copyRenderedText(content: string) {
  const rendered = render(content)
  copyText(stripHtml(rendered))
}

async function copyMarkdown(content: string) {
  copyText(content)
}

// HTML预览功能
function openHtmlPreview(base64Code: string) {
  // 使用UTF-8解码
  const utf8Bytes = atob(base64Code)
  const htmlCode = decodeURIComponent(utf8Bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  htmlPreviewContent.value = htmlCode
  showHtmlPreview.value = true
}

// 任务规划提示词
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

// 发送消息到 LLM（支持流式响应）
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
        ...extraBodyParams,
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
    throw new Error(`API request failed: ${resp.statusText}`)
  }

  const data = await resp.json()
  let content = data.choices?.[0]?.message?.content || ''
  
  // Qwen 模型在非流式输出中会携带 <think></think> 标签，需要移除
  content = content.replace(/<think[\s\S]*?<\/think>/g, '').trim()

  return content
}
// 任务规划：获取任务列表
async function planTasks(userInput: string): Promise<{ id: number; description: string }[]> {
  const planningPrompt = `${TASK_PLANNING_PROMPT}\n\n用户请求：${userInput}`

  const messagesToSend: { role: string; content: string }[] = [
    { role: 'system', content: activeAssistant.value?.systemPrompt || '你是一个有用的助手' },
    { role: 'user', content: planningPrompt }
  ]

  try {
    const response = await sendMessageToLLM(messagesToSend)

    // 解析 JSON 响应
    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
      const parsed = JSON.parse(jsonStr)

      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        return parsed.tasks
      }
      throw new TaskError(TaskErrorType.PARSE_ERROR, 'Invalid response format')
    } catch (e) {
      console.error('Failed to parse task list:', e)
      console.error('Response:', response)
      if (e instanceof TaskError) throw e
      throw new TaskError(TaskErrorType.PARSE_ERROR, '无法解析任务列表，请重试', undefined, e instanceof Error ? e : undefined)
    }
  } catch (e) {
    if (e instanceof TaskError) throw e
    throw new TaskError(TaskErrorType.PLANNING_FAILED, formatTaskErrorMessage(e), undefined, e instanceof Error ? e : undefined)
  }
}

// 重新规划任务列表
async function reviseTaskPlan(
  userInput: string,
  currentTasks: { id: number; description: string }[],
  feedback: string
): Promise<{ id: number; description: string }[]> {
  // 构建当前任务列表的文本描述
  const currentTasksText = currentTasks
    .map((task, idx) => `${idx + 1}. ${task.description}`)
    .join('\n')

  const revisionPrompt = `${TASK_PLANNING_PROMPT}\n\n原始用户请求：${userInput}\n\n当前任务列表：\n${currentTasksText}\n\n用户反馈意见：${feedback}\n\n请根据用户的反馈意见，对当前任务列表进行优化调整。`

  const messagesToSend: { role: string; content: string }[] = [
    { role: 'system', content: activeAssistant.value?.systemPrompt || '你是一个有用的助手' },
    { role: 'user', content: revisionPrompt }
  ]

  try {
    const response = await sendMessageToLLM(messagesToSend)

    // 解析 JSON 响应
    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response
      const parsed = JSON.parse(jsonStr)

      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        return parsed.tasks
      }
      throw new TaskError(TaskErrorType.PARSE_ERROR, 'Invalid response format')
    } catch (e) {
      console.error('Failed to parse revised task list:', e)
      console.error('Response:', response)
      if (e instanceof TaskError) throw e
      throw new TaskError(TaskErrorType.PARSE_ERROR, '无法解析优化后的任务列表，请重试', undefined, e instanceof Error ? e : undefined)
    }
  } catch (e) {
    if (e instanceof TaskError) throw e
    throw new TaskError(TaskErrorType.PLANNING_FAILED, formatTaskErrorMessage(e), undefined, e instanceof Error ? e : undefined)
  }
}

// ============ 工作记忆辅助函数 ============

/**
 * 初始化工作记忆管理器
 */
async function initWorkingMemory(chatId: string) {
  workingMemoryManager = useWorkingMemory(chatId)
  await workingMemoryManager.load()
}

/**
 * 获取下一个任务的工作记忆上下文
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
 * 保存任务结果到工作记忆
 */
async function saveTaskResultToWorkingMemory(
  taskId: number,
  taskDescription: string,
  result: string,
  type: WorkingMemoryType
): Promise<void> {
  if (!workingMemoryManager) {
    console.error(`[Task ${taskId}] 工作记忆管理器未初始化`)
    return
  }

  // 检查是否启用工作记忆（默认启用）
  const chat = currentChat.value
  const enabled = chat?.taskModeOptions?.workingMemory?.enabled ?? true
  if (!enabled) {
    console.log(`[Task ${taskId}] 工作记忆已禁用`)
    return
  }

  console.log(`[Task ${taskId}] 正在保存到工作记忆，类型: ${type}, 内容长度: ${result.length}`)
  await workingMemoryManager.addEntry(type, taskId, taskDescription, result)
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

  try {
    return await sendMessageToLLM(messagesToSend)
  } catch (error) {
    console.error('工作记忆合并失败，使用原始内容：', error)
    return content
  }
}

// 生成任务执行提示（携带上一个任务的总结或中间整合结果）
function generateTaskPrompt(
  taskDescription: string,
  previousResult?: string,
  mergedContext?: string,
  workingMemoryContext?: string
): string {
  let prompt = `请执行以下任务：\n\n任务：${taskDescription}\n\n`

  // 构建上下文部分
  const contextParts: string[] = []

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

// 流式执行单个任务
async function executeTaskStreaming(
  taskDescription: string,
  previousResult: string | undefined,
  mergedContext: string | undefined,
  conversationHistory: Message[],
  workingMemoryContext: string | undefined,  // 新增：工作记忆上下文
  onDelta: (delta: string) => void,
  onReasoningDelta: (delta: string) => void,
  onReasoningDuration: (duration: number) => void
): Promise<void> {
  if (!activeConfig.value?.apiUrl || !activeConfig.value?.apiKey) {
    throw new Error('请先配置并启用一个 LLM 接口')
  }

  const prompt = generateTaskPrompt(taskDescription, previousResult, mergedContext, workingMemoryContext)

  // 构建消息列表：系统提示 + 对话历史（排除当前添加的用户消息） + 当前任务提示
  const messagesToSend: { role: string; content: string }[] = []
  if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
    messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
  } else {
    messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
  }

  // 添加对话历史
  conversationHistory.forEach(msg => {
    messagesToSend.push({ role: msg.role, content: msg.content })
  })

  // 添加当前任务提示
  messagesToSend.push({ role: 'user', content: prompt })

  // 解析 extra_body 参数
  let extraBodyParams: Record<string, any> = {}
  if (activeConfig.value?.extra_body && activeConfig.value.extra_body.trim()) {
    try {
      extraBodyParams = JSON.parse(activeConfig.value.extra_body)
    } catch (e) {
      console.error('Failed to parse extra_body:', e)
    }
  }

  // 浏览器开发环境走代理，Electron 环境直接请求
  const useProxy = import.meta.env.DEV && !isElectronEnv
  const apiBase = useProxy ? '/api/chat/completions' : normalizeApiUrl(activeConfig.value.apiUrl!)

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

  const resp = await fetch(`${useProxy ? apiBase : apiBase + '/chat/completions'}`, {
    method: 'POST',
    headers: {
      ...(useProxy ? {} : { 'Authorization': `Bearer ${activeConfig.value.apiKey}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: activeConfig.value.model,
      messages: messagesToSend,
      stream: true,
      ...validParams,
      ...extraBodyParams,
    }),
    signal: controllers.value[currentChat.value!.id]!.signal,
  })

  if (!resp.body) {
    throw new Error('No response body')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reasoningStartTime = Date.now()

  // 创建流式解析器
  const qwenParser = createQwenStreamParser()

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
        // DeepSeek 格式：独立的 reasoning_content 或 reasoning 字段
        let reasoning_delta = json?.choices?.[0]?.delta?.reasoning_content ?? ''
        if (!reasoning_delta) {
          reasoning_delta = json?.choices?.[0]?.delta?.reasoning ?? ''
        }
        if (reasoning_delta) {
          onReasoningDelta(reasoning_delta)
          onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
        }
        let delta = json?.choices?.[0]?.delta?.content ?? ''
        // Qwen 格式：content 中可能包含 </think> 标签
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
      } catch {}
    }
  }
}

// 总结任务执行结果
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

  return await sendMessageToLLM(messagesToSend)
}

// 执行中间整合
async function performIntermediateMerge(
  conversationHistory: Message[],
  completedTaskCount: number,
  totalTaskCount: number
): Promise<string> {
  const mergePrompt = `请将以下已完成任务的执行结果进行智能整合，为后续任务提供清晰的上下文。

已完成的任务数量：${completedTaskCount + 1}/${totalTaskCount}

## 整合策略

**必须完整保留的内容：**
- 所有代码块（包括\`\`\`代码\`\`\`标记和完整代码）
- 具体的数据结构、配置、列表
- 关键的技术细节、参数、数值
- 文章的核心段落、重要论述
- 任务的主要输出结果

**可以概括的内容：**
- 任务执行过程的描述性文字
- 过渡性说明和重复信息
- AI的思考过程（reasoning内容）
- 非实质性的礼貌用语

## 输出格式要求

1. 保持内容的原始顺序，确保上下文连贯
2. 代码块必须原样保留，不可省略
3. 用简洁的语言概括非关键部分
4. 确保后续任务能够基于整合后的内容继续工作
5. 不要添加任何额外的说明文字，直接输出整合后的内容`

  const messagesToSend: { role: string; content: string }[] = []
  if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
    messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
  } else {
    messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
  }

  // 添加对话历史
  conversationHistory.forEach(msg => {
    messagesToSend.push({ role: msg.role, content: msg.content })
  })

  messagesToSend.push({ role: 'user', content: mergePrompt })

  return await sendMessageToLLM(messagesToSend)
}

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
    createNewChat(false)
  }

  input.value = ''
  scrollToBottom()

  // 任务模式流程
  if (taskMode.value) {
    await executeTaskMode(text)
  } else {
    // 普通对话流程
    await executeNormalChat(text)
  }
}

// 执行普通对话
async function executeNormalChat(text: string) {
  if (currentChat.value) {
    if (currentChat.value.messages.length === 0) {
      updateChatTitle(currentChat.value.id, text)
    }
    currentChat.value.messages.push({ role: 'user', content: text, reasoning: '' })
    currentChat.value.messages.push({ role: 'assistant', content: '',  reasoning: '' })
  }

  if (currentChat.value) {
    currentChat.value.sending = true
    controllers.value[currentChat.value.id] = new AbortController()
  }

  try {
    const currentMessages = currentChat.value?.messages || []
    const messagesToSend = currentMessages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }))

    // 确保全局记忆已加载（如果未加载则立即加载）
    if (!globalMemoryManager.memory.value) {
      await globalMemoryManager.load()
    }

    // 调试：检查全局记忆状态
    console.log('[GlobalMemory] memory.value:', globalMemoryManager.memory.value)
    console.log('[GlobalMemory] entries:', globalMemoryManager.entries.value)
    console.log('[GlobalMemory] user message:', text)

    // 生成智能匹配的全局记忆上下文
    const globalMemoryContext = globalMemoryManager.generateInjectContext(text)
    console.log('[GlobalMemory] generated context:', globalMemoryContext)

    // 构建 system prompt（合并 assistant system prompt 和 global memory）
    let systemPrompt = ''
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      systemPrompt = activeAssistant.value.systemPrompt.trim()
    } else {
      systemPrompt = '你是一个有用的助手'
    }

    // 如果有全局记忆，追加到 system prompt
    if (globalMemoryContext) {
      systemPrompt += '\n\n' + globalMemoryContext + '\n\n请在回复时考虑这些偏好。'
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
          ...validParams,
          ...extraBodyParams,
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

    if (!resp.body) {
      throw new Error('No response body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const assistantIndex = currentMessages.length - 1

    // 创建流式解析器
    const qwenParser = createQwenStreamParser()

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
        //console.log('data:' + data)
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
        } catch {
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

// 执行任务模式
async function executeTaskMode(userInput: string) {
  const chat = currentChat.value
  if (!chat) return

  // 保存原始用户输入用于重新规划
  originalUserInput.value = userInput

  // 标记为任务模式会话
  chat.isTaskMode = true

  // 更新标题
  if (chat.messages.length === 0) {
    updateChatTitle(chat.id, userInput)
  }

  // 添加用户消息
  chat.messages.push({ role: 'user', content: userInput, reasoning: '' })

  // 添加任务模式开始的系统消息
  const planMsgIndex = chat.messages.length
  chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

  if (currentChat.value) {
    currentChat.value.sending = true
    controllers.value[currentChat.value.id] = new AbortController()
  }

  try {
    // 1. 任务规划阶段
    isTaskPlanning.value = true
    chat.messages[planMsgIndex]!.content = '正在规划任务...'
    chat.messages[planMsgIndex]!.copyable = false

    const tasks = await planTasks(userInput)
    if (chat) {
      chat.taskList = tasks.map((t, i) => ({ id: i, description: t.description, completed: false }))
    }

    // 保存待执行任务
    pendingTasks.value = tasks

    // 显示任务列表并等待确认
    let taskListDisplay = '**任务规划完成**\n\n'
    tasks.forEach((task, idx) => {
      taskListDisplay += `${idx + 1}. ${task.description}\n`
    })
    chat.messages[planMsgIndex]!.content = taskListDisplay
    chat.messages[planMsgIndex]!.copyable = false
    scrollToBottom()

    isTaskPlanning.value = false

    // 检查是否自动执行
    const autoExecute = chat.taskModeOptions?.autoExecute ?? false
    if (autoExecute) {
      // 自动执行：直接调用 confirmTaskExecution
      taskListDisplay += '\n**自动执行中...**\n'
      chat.messages[planMsgIndex]!.content = taskListDisplay
      scrollToBottom()
      await confirmTaskExecution()
    } else {
      // 等待用户确认
      awaitingTaskConfirmation.value = true
      // 等待用户确认（通过 confirmTaskExecution 函数触发继续执行）
      return
    }

  } catch (err) {
    const chat = currentChat.value
    if (chat) {
      const last = chat.messages[chat.messages.length - 1]
      if (last) {
        if (err instanceof Error && err.name === 'AbortError') {
          last.content = '任务已取消'
        } else if (err instanceof TaskError) {
          last.content = err.getUserMessage()
        } else {
          last.content = formatTaskErrorMessage(err)
        }
      }
    }
  } finally {
    // 只有在等待确认时才保持 sending 状态为 true
    if (!awaitingTaskConfirmation.value) {
      if (currentChat.value) {
        currentChat.value.sending = false
        delete controllers.value[currentChat.value.id]
      }
      isTaskPlanning.value = false
      currentTaskIndex.value = -1
      saveChatHistory()
    }
  }
}

// 用户确认后开始执行任务
async function confirmTaskExecution() {
  if (!currentChat.value || pendingTasks.value.length === 0) return

  const chat = currentChat.value
  const tasks = pendingTasks.value

  // 初始化工作记忆
  await initWorkingMemory(chat.id)

  try {
    awaitingTaskConfirmation.value = false
    isTaskExecuting.value = true

    // 2. 逐个执行任务
    let previousResult: string | undefined
    let mergedContext: string | undefined  // 存储中间整合结果
    const taskOutputs: string[] = []
    let accumulatedTokens = 0  // 累积的 TOKEN 数量
    const tokenThreshold = chat.taskModeOptions?.tokenThreshold ?? 8000  // TOKEN 阈值，超过后进行整合

    // 简单的 TOKEN 估算函数
    function estimateTokens(text: string): number {
      // 中文：约 1.5 tokens/字符，英文：约 0.25 tokens/字符
      // 简化估算：总字符数 * 0.6
      return Math.ceil(text.length * 0.6)
    }

    for (let i = 0; i < tasks.length; i++) {
      const chatController = controllers.value[currentChat.value!.id]
      if (chatController?.signal.aborted) {
        throw new Error('用户取消')
      }

      currentTaskIndex.value = i
      const task = tasks[i]
      if (!task) break

      // 获取工作记忆上下文（合并后）
      const workingMemory = getWorkingMemoryForNextTask(i)
      console.log(`[Task ${i}] 获取工作记忆:`, {
        previousNotes: workingMemory.previousNotes ? '有' : '无',
        previousDrafts: workingMemory.previousDrafts ? '有' : '无',
        previousFinalResults: workingMemory.previousFinalResults ? '有' : '无'
      })
      let workingMemoryContext = ''

      if (workingMemory.previousNotes || workingMemory.previousDrafts || workingMemory.previousFinalResults) {
        // 使用 LLM 合并工作记忆
        workingMemoryContext = await mergeWorkingMemory(
          workingMemory.previousNotes,
          workingMemory.previousDrafts,
          workingMemory.previousFinalResults
        )
      }

      // 添加任务执行消息
      const taskMsgIndex = chat.messages.length
      const taskPrompt = i === 0
        ? `**任务 ${i + 1}/${tasks.length}**: ${task.description}`
        : `请继续完成以下任务：${task.description}`
      chat.messages.push({ role: 'user', content: taskPrompt, reasoning: '', visible: false, copyable: false })
      chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

      const msg = chat.messages[taskMsgIndex + 1]
      if (!msg) break

      // 流式执行任务（携带完整的对话历史和工作记忆上下文）
      await executeTaskStreaming(
        task.description,
        i === 0 ? undefined : previousResult,
        mergedContext,
        chat.messages.slice(0, -1), // 传递当前聊天历史的所有消息
        workingMemoryContext || undefined, // 新增：工作记忆上下文
        (delta) => {
          msg.content += delta
          scrollToBottom()
        },
        (reasoningDelta) => {
          msg.reasoning += reasoningDelta
          scrollToBottom()
        },
        (duration) => {
          msg.reasoningDuration = duration
        }
      )

      // 保存任务输出到工作记忆
      await saveTaskResultToWorkingMemory(
        i,
        task.description,
        msg.content,
        WorkingMemoryType.FINAL_RESULT
      )

      // 调试：验证工作记忆是否保存成功
      const savedCount = workingMemoryManager?.allEntries.value.length ?? 0
      console.log(`[Task ${i}] 工作记忆已保存，当前条目数: ${savedCount}`)

      // 保存任务输出用于最终整合
      taskOutputs.push(msg.content)

      // 累积 TOKEN 数量
      accumulatedTokens += estimateTokens(msg.content)

      // 标记任务完成
      const taskList = currentChat.value?.taskList
      const currentTask = taskList?.[i]
      if (currentTask) {
        currentTask.completed = true
      }

      // 检查是否需要进行中间整合（基于累积 TOKEN 数量）
      const needsIntermediateMerge =
        accumulatedTokens >= tokenThreshold &&  // 达到 TOKEN 阈值
        i < tasks.length - 1                     // 且不是最后一个任务

      if (needsIntermediateMerge) {
        // 添加中间整合提示消息
        chat.messages.push({ role: 'assistant', content: '**正在进行中间整合...**', reasoning: '', copyable: false })
        scrollToBottom()

        // 执行中间整合
        const mergeResult = await performIntermediateMerge(
          chat.messages.slice(0, -1),
          i,
          tasks.length
        )

        // 更新 mergedContext
        mergedContext = mergeResult

        // 归档当前消息（保留原始用户请求和整合结果）
        const originalUserMsg = chat.messages[0]
        if (!originalUserMsg) {
          throw new Error('对话历史为空，无法重置')
        }

        // 初始化归档数组
        if (!chat.archivedMessages) chat.archivedMessages = []

        // 归档当前消息（排除原始用户请求）
        const messagesToArchive = chat.messages.slice(1).map(msg => ({
          ...msg,
          archived: true  // 标记为已归档
        }))
        chat.archivedMessages.push(messagesToArchive)

        // 重置消息为整合结果
        chat.messages = [
          originalUserMsg,
          { role: 'assistant', content: mergeResult, reasoning: '', visible: false }
        ]

        // 清空 previousResult，因为整合后的上下文已经包含了所有信息
        previousResult = undefined
      } else {
        // 正常流程：根据配置决定是否总结任务结果
        const enableSummary = chat.taskModeOptions?.enableTaskSummary ?? false
        if (i < tasks.length - 1 && task && msg && enableSummary) {
          // 只有启用总结且不是最后一个任务时才总结
          previousResult = await summarizeTaskResult(task.description, msg.content)
        }
      }

      // 推理内容完成后自动折叠
      if (msg.reasoning) {
        reasoningExpanded.value[taskMsgIndex + 1] = false
      }

      scrollToBottom()
    }

    // 3. 检查是否需要额外的最终整合
    isTaskExecuting.value = false

    // 检查最后一个任务是否已经是整合验证任务
    const lastTask = tasks[tasks.length - 1]
    const hasIntegrationTask = lastTask?.description?.includes('整合验证')

    if (!hasIntegrationTask) {
      // 向后兼容：如果没有整合验证任务，执行硬编码的最终整合
      // 添加整合消息
      chat.messages.push({ role: 'assistant', content: '**正在整合最终回答...**', reasoning: '', copyable: false })
      const integrationMsgIndex = chat.messages.length
      chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

      const integrationMsg = chat.messages[integrationMsgIndex]
      if (!integrationMsg) return

      // 发送整合请求（携带完整对话历史）
      await executeTaskStreaming(
        '整合最终回答',
        undefined,
        undefined,
        chat.messages.slice(0, -1),
        undefined, // 工作记忆上下文
        (delta) => {
          integrationMsg.content += delta
          scrollToBottom()
        },
        () => {},
        () => {}
      )

      // 移除"正在整合"消息，用最终结果替换
      chat.messages.splice(integrationMsgIndex - 1, 1)

      // 推理内容完成后自动折叠
      if (integrationMsg.reasoning) {
        reasoningExpanded.value[integrationMsgIndex] = false
      }
    }

    // 4. 任务完成
    chat.messages.push({ role: 'assistant', content: '---\n\n**所有任务已完成！**', reasoning: '', copyable: false })

  } catch (err) {
    const chat = currentChat.value
    if (chat) {
      const last = chat.messages[chat.messages.length - 1]
      if (last) {
        if (err instanceof Error && err.name === 'AbortError') {
          last.content = '任务已取消'
        } else if (err instanceof TaskError) {
          last.content = err.getUserMessage()
        } else {
          last.content = formatTaskErrorMessage(err)
        }
      }
      // 如果是网络错误等可恢复错误，保存执行上下文以便继续执行
      if (!(err instanceof Error && err.name === 'AbortError')) {
        // 找到下一个未完成的任务索引
        const nextTaskIndex = chat.taskList?.findIndex(t => !t.completed) ?? 0
        if (nextTaskIndex >= 0 && nextTaskIndex < (chat.taskList?.length ?? 0)) {
          // 保存执行上下文（这里简化处理，实际 previousResult 和 mergedContext 无法恢复）
          chat.taskExecutionContext = {
            nextTaskIndex,
            accumulatedTokens: 0  // 简化处理，重置 token 计数
          }
          executionFailed.value = true
        }
      }
    }
  } finally {
    if (currentChat.value) {
      currentChat.value.sending = false
      delete controllers.value[currentChat.value.id]
    }
    isTaskPlanning.value = false
    isTaskExecuting.value = false
    awaitingTaskConfirmation.value = false
    currentTaskIndex.value = -1
    // 如果是可恢复错误，保留 pendingTasks 以便继续执行
    if (!executionFailed.value) {
      pendingTasks.value = []
    }
    saveChatHistory()
    scrollToBottom()
  }
}

// 取消任务执行
function cancelTaskExecution() {
  if (currentChat.value) {
    // 添加取消消息
    currentChat.value.messages.push({ role: 'assistant', content: '---\n\n任务执行已取消', reasoning: '', copyable: false })
    currentChat.value.sending = false
    delete controllers.value[currentChat.value.id]
  }
  isTaskPlanning.value = false
  isTaskExecuting.value = false
  awaitingTaskConfirmation.value = false
  currentTaskIndex.value = -1
  pendingTasks.value = []
  executionFailed.value = false
  saveChatHistory()
  scrollToBottom()
}

// 继续执行任务（从失败处恢复）
async function continueTaskExecution() {
  const chat = currentChat.value
  if (!chat || !chat.taskList) return

  // 恢复 pendingTasks 从 taskList
  pendingTasks.value = chat.taskList.map(t => ({ id: t.id, description: t.description }))

  // 添加继续执行提示
  chat.messages.push({ role: 'assistant', content: '---\n\n**继续执行任务...**', reasoning: '', copyable: false })

  // 初始化工作记忆
  await initWorkingMemory(chat.id)

  // 创建 AbortController
  controllers.value[chat.id] = new AbortController()
  chat.sending = true

  try {
    isTaskExecuting.value = true
    executionFailed.value = false

    const tasks = pendingTasks.value
    // 如果有保存的执行上下文，使用它；否则自动计算下一个未完成的任务索引
    let startIndex = chat.taskExecutionContext?.nextTaskIndex
    if (startIndex === undefined) {
      startIndex = chat.taskList.findIndex(t => !t.completed)
      if (startIndex < 0) startIndex = 0
    }

    // 清除执行上下文
    chat.taskExecutionContext = undefined

    // 简单的 TOKEN 估算函数
    function estimateTokens(text: string): number {
      return Math.ceil(text.length * 0.6)
    }

    let accumulatedTokens = 0  // 简化处理，重新开始计数
    const tokenThreshold = chat.taskModeOptions?.tokenThreshold ?? 8000

    // 从失败的任务开始继续执行
    for (let i = startIndex; i < tasks.length; i++) {
      const chatController = controllers.value[currentChat.value!.id]
      if (chatController?.signal.aborted) {
        throw new Error('用户取消')
      }

      currentTaskIndex.value = i
      const task = tasks[i]
      if (!task) break

      // 获取工作记忆上下文
      const workingMemory = getWorkingMemoryForNextTask(i)
      let workingMemoryContext = ''

      if (workingMemory.previousNotes || workingMemory.previousDrafts || workingMemory.previousFinalResults) {
        workingMemoryContext = await mergeWorkingMemory(
          workingMemory.previousNotes,
          workingMemory.previousDrafts,
          workingMemory.previousFinalResults
        )
      }

      // 添加任务执行消息
      const taskMsgIndex = chat.messages.length
      const taskPrompt = i === 0
        ? `**任务 ${i + 1}/${tasks.length}**: ${task.description}`
        : `请继续完成以下任务：${task.description}`
      chat.messages.push({ role: 'user', content: taskPrompt, reasoning: '', visible: false, copyable: false })
      chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

      const msg = chat.messages[taskMsgIndex + 1]
      if (!msg) break

      // 流式执行任务
      await executeTaskStreaming(
        task.description,
        undefined,  // 简化处理，不使用 previousResult
        undefined,  // 简化处理，不使用 mergedContext
        chat.messages.slice(0, -1),
        workingMemoryContext || undefined,
        (delta) => {
          msg.content += delta
          scrollToBottom()
        },
        (reasoningDelta) => {
          msg.reasoning += reasoningDelta
          scrollToBottom()
        },
        (duration) => {
          msg.reasoningDuration = duration
        }
      )

      // 保存到工作记忆
      await saveTaskResultToWorkingMemory(
        i,
        task.description,
        msg.content,
        WorkingMemoryType.FINAL_RESULT
      )

      accumulatedTokens += estimateTokens(msg.content)

      // 标记任务完成
      const currentTask = chat.taskList[i]
      if (currentTask) {
        currentTask.completed = true
      }

      // 推理内容完成后自动折叠
      if (msg.reasoning) {
        reasoningExpanded.value[taskMsgIndex + 1] = false
      }

      scrollToBottom()
    }

    // 检查是否需要额外的最终整合
    isTaskExecuting.value = false
    const lastTask = tasks[tasks.length - 1]
    const hasIntegrationTask = lastTask?.description?.includes('整合验证')

    if (!hasIntegrationTask) {
      chat.messages.push({ role: 'assistant', content: '**正在整合最终回答...**', reasoning: '', copyable: false })
      const integrationMsgIndex = chat.messages.length
      chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

      const integrationMsg = chat.messages[integrationMsgIndex]
      if (!integrationMsg) return

      await executeTaskStreaming(
        '整合最终回答',
        undefined,
        undefined,
        chat.messages.slice(0, -1),
        undefined,
        (delta) => {
          integrationMsg.content += delta
          scrollToBottom()
        },
        () => {},
        () => {}
      )

      chat.messages.splice(integrationMsgIndex - 1, 1)

      if (integrationMsg.reasoning) {
        reasoningExpanded.value[integrationMsgIndex] = false
      }
    }

    chat.messages.push({ role: 'assistant', content: '---\n\n**所有任务已完成！**', reasoning: '', copyable: false })

  } catch (err) {
    const chat = currentChat.value
    if (chat) {
      const last = chat.messages[chat.messages.length - 1]
      if (last) {
        if (err instanceof Error && err.name === 'AbortError') {
          last.content = '任务已取消'
        } else if (err instanceof TaskError) {
          last.content = err.getUserMessage()
        } else {
          last.content = formatTaskErrorMessage(err)
        }
      }
      // 再次保存执行上下文
      if (!(err instanceof Error && err.name === 'AbortError')) {
        const nextTaskIndex = chat.taskList?.findIndex(t => !t.completed) ?? 0
        if (nextTaskIndex >= 0 && nextTaskIndex < (chat.taskList?.length ?? 0)) {
          chat.taskExecutionContext = {
            nextTaskIndex,
            accumulatedTokens: 0
          }
          executionFailed.value = true
        }
      }
    }
  } finally {
    if (currentChat.value) {
      currentChat.value.sending = false
      delete controllers.value[currentChat.value.id]
    }
    isTaskPlanning.value = false
    isTaskExecuting.value = false
    awaitingTaskConfirmation.value = false
    currentTaskIndex.value = -1
    if (!executionFailed.value) {
      pendingTasks.value = []
    }
    saveChatHistory()
    scrollToBottom()
  }
}

// 处理重新规划请求
async function handleRevisePlan(feedback: string) {
  const chat = currentChat.value
  if (!chat || pendingTasks.value.length === 0) return

  try {
    isTaskPlanning.value = true
    if (currentChat.value) {
    currentChat.value.sending = true
  }

    // 获取当前任务列表显示消息的索引（第一条用户消息之后的消息）
    const planMsgIndex = 1

    // 更新消息显示正在重新规划
    if (chat.messages[planMsgIndex]) {
      chat.messages[planMsgIndex]!.content = '**正在根据反馈优化任务规划...**'
      scrollToBottom()
    }

    // 调用重新规划函数
    const revisedTasks = await reviseTaskPlan(
      originalUserInput.value,
      pendingTasks.value,
      feedback
    )

    // 更新任务列表
    pendingTasks.value = revisedTasks
    if (chat) {
      chat.taskList = revisedTasks.map((t, i) => ({
        id: i,
        description: t.description,
        completed: false
      }))
    }

    // 显示更新后的任务列表
    let taskListDisplay = '**任务规划已更新**\n\n'
    revisedTasks.forEach((task, idx) => {
      taskListDisplay += `${idx + 1}. ${task.description}\n`
    })
    taskListDisplay += `\n💡 您的反馈：${feedback}`

    if (chat.messages[planMsgIndex]) {
      chat.messages[planMsgIndex]!.content = taskListDisplay
      chat.messages[planMsgIndex]!.copyable = false
    }

    saveChatHistory()
    scrollToBottom()

  } catch (err) {
    const planMsgIndex = 1
    if (chat && chat.messages[planMsgIndex]) {
      if (err instanceof TaskError) {
        chat.messages[planMsgIndex]!.content = err.getUserMessage()
      } else {
        chat.messages[planMsgIndex]!.content = '重新规划失败: ' + (err instanceof Error ? err.message : '未知错误')
      }
    }
  } finally {
    isTaskPlanning.value = false
    if (currentChat.value) {
      currentChat.value.sending = false
    }
    // 保持 awaitingTaskConfirmation 为 true，用户可以继续修改或开始执行
  }
}

// 重试失败的任务
async function retryTask(taskId: number) {
  const chat = currentChat.value
  if (!chat?.taskList) return

  const task = chat.taskList.find(t => t.id === taskId)
  if (!task) return

  // 重置任务状态
  task.status = undefined
  task.completed = false
  task.error = undefined
  task.retryCount = (task.retryCount || 0) + 1

  // 重新执行该任务（简化实现：从该任务开始重新执行）
  // 实际实现需要更复杂的逻辑来恢复执行上下文
  chat.messages.push({ role: 'assistant', content: `---\n\n正在重试任务 ${taskId + 1}...`, reasoning: '', copyable: false })

  // TODO: 实现完整的重试逻辑
  saveChatHistory()
  scrollToBottom()
}

// 跳过失败的任务
async function skipTask(taskId: number) {
  const chat = currentChat.value
  if (!chat?.taskList) return

  const task = chat.taskList.find(t => t.id === taskId)
  if (!task) return

  // 标记为跳过
  task.status = TaskStatus.SKIPPED
  task.completed = true // 标记为完成以便继续

  chat.messages.push({ role: 'assistant', content: `---\n\n任务 ${taskId + 1} 已跳过`, reasoning: '', copyable: false })

  // TODO: 继续执行下一个任务
  saveChatHistory()
  scrollToBottom()
}

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

function toggleArchived(index: number) {
  archivedExpanded.value[index] = !archivedExpanded.value[index]
}

// 删除任务
function deleteTask(taskId: number) {
  const chat = currentChat.value
  if (!chat?.taskList) return

  // 删除任务
  chat.taskList = chat.taskList.filter(t => t.id !== taskId)

  // 重新编号剩余任务
  chat.taskList.forEach((task, idx) => {
    task.id = idx
  })

  // 同时更新 pendingTasks
  pendingTasks.value = pendingTasks.value.filter(t => t.id !== taskId)
  pendingTasks.value.forEach((task, idx) => {
    task.id = idx
  })

  saveChatHistory()
}

// 更新任务描述
function updateTaskDescription(taskId: number, newDescription: string) {
  const chat = currentChat.value
  if (!chat?.taskList) return

  const task = chat.taskList.find(t => t.id === taskId)
  if (task) {
    task.description = newDescription
  }

  // 同时更新 pendingTasks
  const pendingTask = pendingTasks.value.find(t => t.id === taskId)
  if (pendingTask) {
    pendingTask.description = newDescription
  }

  saveChatHistory()
}

function scrollToBottom() {
  // 普通会话模式使用 NormalChat 组件的方法
  if (!taskMode.value && normalChatRef.value) {
    normalChatRef.value.scrollToBottom()
    return
  }

  // 任务模式使用原来的方式
  if (!autoScrollEnabled.value) return
  const el = messagesRef.value
  if (!el) return
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
  })
}

function createNewChat(isTaskModeChat: boolean = false) {
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
    title: isTaskModeChat ? '任务模式新对话' : '新对话',
    messages: [],
    createdAt: Date.now(),
    assistantId: lastAssistantId || currentAssistantId,
    configId: lastConfigId ?? currentConfigId,
    isTaskMode: isTaskModeChat,
    params: newParams
  }
  chatList.value.unshift(newChat)
  currentChatId.value = newChat.id
  saveChatHistory()
  // 创建会话后重置 pendingTaskMode，确保下一个新会话默认是普通会话
  //pendingTaskMode.value = false
}

function switchChat(chatId: string) {
  currentChatId.value = chatId
}

function deleteChat(chatId: string, event: Event) {
  event.stopPropagation()

  // 清理工作记忆
  try {
    const wm = useWorkingMemory(chatId)
    wm.clear()
    console.log(`Working memory cleared for chat ${chatId}`)
  } catch (e) {
    console.error('Failed to clear working memory:', e)
  }

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

// 更新任务模式选项
function updateTaskModeOptions(options: { enableTaskSummary?: boolean; tokenThreshold?: number }) {
  const chat = currentChat.value
  if (chat) {
    if (!chat.taskModeOptions) {
      chat.taskModeOptions = {}
    }
    if (options.enableTaskSummary !== undefined) {
      chat.taskModeOptions.enableTaskSummary = options.enableTaskSummary
    }
    if (options.tokenThreshold !== undefined) {
      chat.taskModeOptions.tokenThreshold = options.tokenThreshold
    }
    saveChatHistory()
  }
}

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
  // 设置全局预览函数（任务模式使用）
  window.previewHtml = (btn: HTMLElement) => {
    const base64Code = btn.getAttribute('data-html-code') || ''
    openHtmlPreview(base64Code)
  }

  await loadChatHistory()
  await loadConfig()
  await loadAssistants()
  await loadHighlightTheme()
  // 加载全局记忆
  await globalMemoryManager.load()
  scrollToBottom()
  // 普通 chat 组件会在内部处理 autoResizeTextarea
  if (textareaRef.value) {
    autoResizeTextarea()
  }
})

// 监听会话切换，加载工作记忆
watch(currentChatId, (newChatId) => {
  if (newChatId) {
    const chat = chatList.value.find(c => c.id === newChatId)
    if (chat?.isTaskMode) {
      initWorkingMemory(newChatId)
    }
  }
})

// 监听任务模式切换，确保全局函数正确设置
watch(taskMode, async (isTaskMode) => {
  if (isTaskMode) {
    // 等待 NormalChat 组件卸载完成后再设置函数
    await new Promise(resolve => setTimeout(resolve, 0))
    window.previewHtml = (btn: HTMLElement) => {
      const base64Code = btn.getAttribute('data-html-code') || ''
      openHtmlPreview(base64Code)
    }
  }
})
</script>

<template>
  <div class="container">
    <aside class="sidebar" :class="{ collapsed: !showSidebar }">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="createNewChat(false)">
          <span class="plus-icon">+</span>
          新对话
        </button>
        <button class="toggle-sidebar-btn" @click="showSidebar = !showSidebar" title="收起/展开侧边栏">
          <span v-if="showSidebar">◀</span>
          <span v-else>▶</span>
        </button>
      </div>
      <div class="chat-list">
        <!-- 任务模式会话分组 -->
        <div v-if="taskModeChats.length > 0" class="chat-group">
          <div class="chat-group-title">任务模式</div>
          <div
            v-for="chat in taskModeChats"
            :key="chat.id"
            :class="['chat-item', { active: chat.id === currentChatId }]"
            @click="switchChat(chat.id)"
          >
            <div class="chat-title">{{ chat.title }}</div>
            <button class="delete-chat-btn" @click="deleteChat(chat.id, $event)" title="删除对话">
              ✕
            </button>
          </div>
        </div>

        <!-- 普通会话分组 -->
        <div class="chat-group">
          <div class="chat-group-title">普通会话</div>
          <div
            v-for="chat in normalChats"
            :key="chat.id"
            :class="['chat-item', { active: chat.id === currentChatId }]"
            @click="switchChat(chat.id)"
          >
            <div class="chat-title">{{ chat.title }}</div>
            <button class="delete-chat-btn" @click="deleteChat(chat.id, $event)" title="删除对话">
              ✕
            </button>
          </div>
        </div>

        <!-- 空状态提示 -->
        <div v-if="chatList.length === 0" class="empty-state">
          暂无对话
        </div>
      </div>
    </aside>
    <div class="content-wrapper">
      <div class="content-area" :class="{ 'with-task-panel': taskMode }">
        <header class="header">
        <div class="header-inner">
          <button class="sidebar-toggle" @click="showSidebar = !showSidebar" v-if="!showSidebar" title="展开侧边栏">
            ☰ <span>OpenChat Desktop</span>
          </button>
          <div class="brand" v-if="showSidebar" >
            <div class="brand-dot" />
            <span>OpenChat Desktop</span>
          </div>
          <div class="header-actions">
            <button class="assistant-btn" @click="router.push('/assistants')" title="社区助理">
              <span>社区助理</span>
            </button>
            <button class="settings-btn" @click="router.push('/settings')" title="设置">
              设置
            </button>
            <button class="logout-btn" @click="logout" title="退出登录">
              退出
            </button>
          </div>
        </div>
      </header>
      <!-- 普通会话模式 -->
      <NormalChat
        v-if="!taskMode"
        :messages="messages"
        :input="input"
        :sending="sending"
        :active-config="activeConfig"
        :active-assistant="activeAssistant"
        :current-chat="currentChat"
        :assistant-list="assistantList"
        :config-list="configList"
        @send="send"
        @cancel="cancel"
        @update:input="input = $event"
        @toggle-reasoning="toggleReasoning"
        @open-params-dialog="openParamsDialog"
        @change-assistant="changeAssistant"
        @change-config="changeChatConfig"
        @update:is-task-mode="val => { if (currentChat) currentChat.isTaskMode = val }"
        ref="normalChatRef"
      />

      <!-- 任务模式 -->
      <main v-else class="main">
        <div class="messages" ref="messagesRef" @scroll="handleMessagesScroll">
          <div v-if="messages.length === 0" class="welcome">
            <h2>欢迎使用 OpenChat Desktop</h2>
            <p>支持任何 OpenAI 标准 API 的桌面聊天应用</p>
            <p>点击右上角的"设置"配置你的 LLM 接口</p>
          </div>
          <template v-for="(m, i) in messages" :key="i">
          <div
            v-if="m.visible !== false"
            :class="['msg-row', m.role]"
          >
            <div class="msg-content">
              <div v-if="m.reasoning" class="reasoning-section">
                <button class="reasoning-toggle" @click="toggleReasoning(i)">
                  <span>{{ reasoningExpanded[i] ? '▼' : '▶' }}</span>
                  <span v-if="sending && i === messages.length - 1 && m.reasoning" class="reasoning-spinner"></span>
                  <span>思考</span>
                  <span v-if="m.reasoningDuration">{{ m.reasoningDuration }}s</span>
                </button>
                <div v-show="reasoningExpanded[i]" class="msg-reasoning-bubble" v-html="render(m.reasoning)" />
              </div>
              <div class="msg-bubble-wrapper">
                <div class="msg-bubble" v-html="render(m.content)" />
                <div class="msg-actions" v-if="m.copyable !== false">
                  <button class="copy-btn" @click="copyRenderedText(m.content)" title="复制文本">
                    Copy Text
                  </button>
                  <button class="copy-btn" @click="copyMarkdown(m.content)" title="复制 Markdown">
                    Copy Markdown
                  </button>
                  <button class="copy-btn" @click="openSaveToGlobalMemoryDialog(m.content)" title="保存为全局记忆">
                    + Global Memory
                  </button>
                </div>
              </div>
            </div>
          </div>
          </template>

          <!-- 归档历史消息区域 -->
          <template v-if="currentChat?.archivedMessages && currentChat.archivedMessages.length > 0">
            <div v-for="(archiveGroup, groupIdx) in currentChat.archivedMessages" :key="`archive-${groupIdx}`" class="archive-section">
              <button class="archive-toggle" @click="toggleArchived(groupIdx)">
                <span>{{ archivedExpanded[groupIdx] ? '▼' : '▶' }}</span>
                <span>归档历史 #{{ groupIdx + 1 }}</span>
                <span class="archive-count">({{ archiveGroup.length }} 条消息)</span>
              </button>
              <div v-show="archivedExpanded[groupIdx]" class="archive-messages">
                <template v-for="(archivedMsg, msgIdx) in archiveGroup" :key="`archived-${groupIdx}-${msgIdx}`">
                  <div :class="['msg-row', archivedMsg.role, 'archived']">
                    <div class="msg-content">
                      <div v-if="archivedMsg.reasoning" class="reasoning-section archived-reasoning">
                        <span class="archived-label">思考内容</span>
                        <div class="msg-reasoning-bubble" v-html="render(archivedMsg.reasoning)" />
                      </div>
                      <div class="msg-bubble-wrapper">
                        <!-- 渲染输出内容 -->
                        <div class="msg-bubble" v-html="render(archivedMsg.content)" />
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
        <form class="inputbar" @submit.prevent="send">
          <div class="model-bar">
            <select :disabled="(currentChat?.messages?.length ?? 0) > 0" :value="currentChat?.assistantId || ''" @change="changeAssistant(($event.target as HTMLSelectElement).value)" class="assistant-select">
              <option value="">无助理</option>
              <option v-for="assistant in assistantList.assistants" :key="assistant.id" :value="assistant.id">
                {{ assistant.emoji }} {{ assistant.name }}
              </option>
            </select>
            <select :value="currentChat?.configId ?? ''" @change="changeChatConfig(($event.target as HTMLSelectElement).value)" class="config-select">
              <option value="">选择模型</option>
              <option v-for="(config, index) in configList.configs" :key="index" :value="index">
                {{ config.name || config.model }}
              </option>
            </select>
            <!-- 参数配置按钮 -->
            <button type="button" class="params-btn" @click="openParamsDialog" title="对话参数配置" :disabled="!currentChat">
              参数
            </button>
            <!-- 任务模式 -->
            <div class="task-mode-toggle" v-if="currentChat?.messages.length === 0">
              <label class="toggle-label">
                <input type="checkbox" v-model="currentChat.isTaskMode" :disabled="sending">
                <span class="toggle-switch"></span>
                <span class="toggle-text">任务模式</span>
              </label>
            </div>
          </div>

          <div class="composer">
            <textarea
              v-model="input"
              class="textarea"
              placeholder="输入消息，回车发送，Shift+Enter 换行"
              @keydown.enter.exact.prevent="send"
              @input="autoResizeTextarea"
              ref="textareaRef"
            />
            <div class="actions">
              <button type="submit" class="btn primary" :disabled="sending">发送</button>
              <button type="button" class="btn ghost" @click="cancel" :disabled="!sending">
                取消
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
      <TaskModePanel
        v-if="taskMode"
        :is-task-planning="isTaskPlanning"
        :is-task-executing="isTaskExecuting"
        :current-task-index="currentTaskIndex"
        :task-list="taskList"
        :awaiting-task-confirmation="awaitingTaskConfirmation"
        :execution-failed="hasIncompleteTasks || executionFailed"
        :task-mode-options="currentChat?.taskModeOptions"
        :show-settings="showTaskSettings"
        :chat-id="currentChatId ?? undefined"
        @confirm="confirmTaskExecution"
        @cancel="cancelTaskExecution"
        @continue-execution="continueTaskExecution"
        @update-options="updateTaskModeOptions"
        @toggle-settings="showTaskSettings = !showTaskSettings"
        @delete-task="deleteTask"
        @update-task="updateTaskDescription"
        @retry-task="retryTask"
        @skip-task="skipTask"
        @revise-plan="handleRevisePlan"
      />
    </div>

    <!-- 参数配置对话框 -->
    <Teleport to="body">
      <div v-if="showParamsDialog" class="dialog-overlay" @click.self="showParamsDialog = false">
        <div class="dialog-content">
          <div class="dialog-header">
            <h3>对话参数配置</h3>
            <button class="dialog-close" @click="showParamsDialog = false">✕</button>
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
                  >✕</button>
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
                  >✕</button>
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
  </div>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  background: #ffffff;
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
  background: #f9f9f9;
  border-right: 1px solid #e5e7eb;
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
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  gap: 8px;
}

.new-chat-btn {
  flex: 1;
  padding: 10px 16px;
  background: #10a37f;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}

.new-chat-btn:hover {
  background: #0d8a6c;
}

.plus-icon {
  font-size: 18px;
  line-height: 1;
}

.toggle-sidebar-btn {
  width: 36px;
  padding: 0;
  background: #e5e7eb;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.toggle-sidebar-btn:hover {
  background: #d4d4d8;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
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
  background: #e5e7eb;
}

.chat-item.active {
  background: #e5e7eb;
}

.chat-title {
  flex: 1;
  font-size: 14px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-group {
  margin-bottom: 12px;
}

.chat-group-title {
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
  padding: 4px 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 13px;
}

.delete-chat-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s;
}

.chat-item:hover .delete-chat-btn {
  opacity: 1;
}

.delete-chat-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.header-inner {
  max-width: 900px;
  margin: 0 auto;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  font-weight: 600;
}

.sidebar-toggle {
  background: white;
  border: 1px solid #e5e7eb;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f172a;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #10a37f;
}

.settings-btn {
  background: #f5f5f500;
  border: 1px solid #e5e7eb00;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
}

.settings-btn:hover {
  background: #f0f0f0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.assistant-btn {
  background: #f0fdf400;
  border: 1px solid #86efac00;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
  min-width: 40px;
}

.assistant-btn:hover {
  background: #dcfce7;
}

.logout-btn {
  background: #fee2e200;
  border: 1px solid #fecaca00;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
}

.logout-btn:hover {
  background: #fecaca;
  color: #dc2626;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.messages {
  background: #ffffff;
  height: calc(75vh);
  overflow: auto;
}

.welcome {
  max-width: 720px;
  margin: 80px auto 0;
  text-align: center;
  color: #4b5563;
  padding: 0 20px;
}

.welcome h2 {
  margin: 0 0 12px 0;
  color: #0f172a;
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
  background: #f7f7f8;
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
  color: #4b5563;
  max-width: 720px;
  word-break: break-word;
  background: #f3f4f6;
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
  color: #6b7280;
  transition: color 0.2s;
}

.reasoning-toggle:hover {
  color: #0f172a;
}

.reasoning-toggle span:first-child {
  font-size: 10px;
}

.msg-row.user .msg-bubble {
  background: #10a37f;
  color: #ffffff;
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
  background: #f5f5f5;
  border: 1px solid #e5e7eb;
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
  background: #e5e7eb;
}

.msg-bubble :deep(p) {
  margin: 0 0 10px 0;
}

.msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-bubble :deep(pre) {
  background: #f5f5f5;
  border-radius: 10px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  position: relative;
}

.msg-bubble :deep(.code-copy-btn) {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: #6b7280;
}

.msg-bubble :deep(.code-copy-btn:hover) {
  background: #ffffff;
  color: #0f172a;
  border-color: #d1d5db;
}

.msg-bubble :deep(.code-preview-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: rgba(16, 163, 127, 0.9);
  border: 1px solid #10a37f;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: #ffffff;
}

.msg-bubble :deep(.code-preview-btn:hover) {
  background: #0d8a6c;
  border-color: #0d8a6c;
}

.msg-bubble :deep(code) {
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
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
  border: 1px solid #e5e7eb;
  padding: 8px 12px;
  text-align: left;
}

.msg-bubble :deep(table th) {
  background: #f9fafb;
  font-weight: 500;
}

.msg-bubble :deep(table tr:hover td) {
  background: #f8fafc;
}

.inputbar {
  position: relative;
  border-top: 1px solid #e5e7eb;
  padding: 16px 20px 12px;
  background: #ffffff;
}

.model-bar {
  max-width: 900px;
  margin: 0 auto 16px;
  color: #6b7280;
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
  border-color: #22c55e;
}

.assistant-select:focus {
  outline: none;
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.config-select {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.config-select:hover {
  background: #ffffff;
  border-color: #e5e7eb;
}

.config-select:focus {
  outline: none;
  border-color: #e5e7eb;
  box-shadow: 0 0 0 2px rgba(161, 161, 161, 0.2);
}

.composer {
  outline: none;
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.composer {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #f9fafb;
}

.textarea {
  flex: 1;
  resize: none;
  padding: 6px 8px;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: #0f172a;
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
  border: 1px solid #e5e7eb;
  cursor: pointer;
  font-size: 13px;
}

.btn.primary {
  background: #10a37f;
  color: #ffffff;
  border-color: #10a37f;
}

.btn.primary:disabled {
  background: #b7b7b7;
  border-color: #b7b7b7;
  cursor: not-allowed;
}

.btn.ghost {
  background: #f5f5f5;
  color: #111827;
}

.btn.ghost:disabled {
  color: #9ca3af;
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
  background: #10a37f;
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
  color: #374151;
  font-weight: 500;
}

/* 参数配置按钮 */
.params-btn {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;
}

.params-btn:hover:not(:disabled) {
  background: #ffffff;
  border-color: #e5e7eb;
}

.params-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.params-btn:focus {
  outline: none;
  border-color: #e5e7eb;
  box-shadow: 0 0 0 2px rgba(161, 161, 161, 0.2);
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
  background: #ffffff;
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
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.dialog-close {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.dialog-close:hover {
  background: #f3f4f6;
  color: #0f172a;
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
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
}

.param-value-with-action {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clear-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  color: #9ca3af;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}

.clear-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

.param-range {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e5e7eb;
  outline: none;
  -webkit-appearance: none;
}

.param-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #10a37f;
  cursor: pointer;
  transition: background 0.2s;
}

.param-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #10a37f;
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
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
}

.param-number:focus {
  border-color: #10a37f;
}

.param-desc {
  margin: 6px 0 0 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.btn.secondary {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}

.btn.secondary:hover {
  background: #e5e7eb;
}

/* 归档历史消息样式 */
.archive-section {
  margin: 12px 0;
  overflow: hidden;
  background: #fafafa;
}

.archive-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f3f4f6;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  transition: background 0.2s;
}

.archive-toggle:hover {
  background: #e5e7eb;
  color: #374151;
}

.archive-toggle span:first-child {
  font-size: 10px;
  transition: transform 0.2s;
}

.archive-count {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
}

.archive-messages {
  padding: 8px 0;
  max-height: 500px;
  overflow-y: auto;
}

.msg-row.archived {
  opacity: 0.7;
  background: #f9f9f9;
}

.msg-row.archived .msg-bubble {
  font-size: 14px;
}

.msg-row.archived .msg-reasoning-bubble {
  background: #f0f0f0;
  font-size: 13px;
  padding: 10px 14px;
}

.archived-reasoning {
  margin-bottom: 10px;
}

.archived-label {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  display: inline-block;
}
</style>
