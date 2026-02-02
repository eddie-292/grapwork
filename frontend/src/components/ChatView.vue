<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import type { ConfigList, AssistantList } from '../types/electron'
import TaskModePanel from './TaskModePanel.vue'

const router = useRouter()

type Role = 'user' | 'assistant' | 'system'
type Message = { role: Role; content: string, reasoning: string, reasoningDuration?: number, visible?: boolean, copyable?: boolean }

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
  taskList?: { id: number; description: string; completed: boolean }[]
  params?: ChatParams  // 对话级别的参数配置
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
  let code = token.content

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

  return `<pre><code class="hljs language-${lang}">${code}</code>${copyBtn}</pre>`
}

// 加载代码高亮主题
async function loadHighlightTheme() {
  try {
    const savedTheme = localStorage.getItem('highlight-theme')
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
const sending = ref(false)
const controller = ref<AbortController | null>(null)
const showSidebar = ref(true)
// 任务模式 - 基于当前会话的 computed 属性
const taskMode = computed(() => currentChat.value?.isTaskMode ?? false)
// 新会话前的任务模式选择（只在会话为空时可编辑）
//const pendingTaskMode = ref(false)
const isTaskPlanning = ref(false)
const isTaskExecuting = ref(false)
// 参数配置对话框状态
const showParamsDialog = ref(false)
const tempParams = ref<ChatParams>({ ...DEFAULT_CHAT_PARAMS })
// taskList 从当前会话获取，如果没有则返回空数组
const taskList = computed(() => currentChat.value?.taskList ?? [])
const currentTaskIndex = ref(-1)
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
3. 通常 3-6 个任务为宜
4. 只返回 JSON，不要有其他文字`

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
  return data.choices?.[0]?.message?.content || ''
}

// 任务规划：获取任务列表
async function planTasks(userInput: string): Promise<{ id: number; description: string }[]> {
  const planningPrompt = `${TASK_PLANNING_PROMPT}\n\n用户请求：${userInput}`

  const messagesToSend: { role: string; content: string }[] = [
    { role: 'system', content: activeAssistant.value?.systemPrompt || '你是一个有用的助手' },
    { role: 'user', content: planningPrompt }
  ]

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
    throw new Error('Invalid response format')
  } catch (e) {
    console.error('Failed to parse task list:', e)
    console.error('Response:', response)
    throw new Error('无法解析任务列表，请重试')
  }
}

// 生成任务执行提示（携带上一个任务的总结）
function generateTaskPrompt(taskDescription: string, previousResult?: string): string {
  if (previousResult) {
    return `请执行以下任务：

任务：${taskDescription}

上一个任务的结果总结：${previousResult}

请专注于完成当前任务，保持简洁清晰。`
  }
  return `请执行以下任务：

任务：${taskDescription}

请专注于完成这个任务，保持简洁清晰。`
}

// 流式执行单个任务
async function executeTaskStreaming(
  taskDescription: string,
  previousResult: string | undefined,
  conversationHistory: Message[],
  onDelta: (delta: string) => void,
  onReasoningDelta: (delta: string) => void,
  onReasoningDuration: (duration: number) => void
): Promise<void> {
  if (!activeConfig.value?.apiUrl || !activeConfig.value?.apiKey) {
    throw new Error('请先配置并启用一个 LLM 接口')
  }

  const prompt = generateTaskPrompt(taskDescription, previousResult)

  // 构建消息列表：系统提示 + 对话历史（排除当前添加的用户消息） + 当前任务提示
  const messagesToSend: { role: string; content: string }[] = []
  if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
    messagesToSend.push({ role: 'system', content: activeAssistant.value.systemPrompt.trim() })
  } else {
    messagesToSend.push({ role: 'system', content: '你是一个有用的助手' })
  }

  // 添加对话历史（携带所有之前的消息）
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

  // 浏览器开发环境始终走代理，Electron 环境直接请求
  const useProxy = import.meta.env.DEV && !isElectronEnv
  if (useProxy) {
    throw new Error('任务模式暂时不支持浏览器开发环境，请使用 Electron')
  }
  const apiBase = normalizeApiUrl(activeConfig.value.apiUrl!)

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

  if (!resp.body) {
    throw new Error('No response body')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reasoningStartTime = Date.now()

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
        const reasoning_content = json?.choices?.[0]?.delta?.reasoning_content ?? ''
        const reasoning = json?.choices?.[0]?.delta?.reasoning ?? ''
        if (reasoning_content || reasoning) {
          onReasoningDelta(reasoning_content || reasoning)
          onReasoningDuration(Math.floor((Date.now() - reasoningStartTime) / 1000))
        }
        const delta = json?.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          onDelta(delta)
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

  const messagesToSend: { role: string; content: string }[] = [
    { role: 'user', content: summarizePrompt }
  ]

  return await sendMessageToLLM(messagesToSend)
}

// 复制代码块函数（全局调用）
declare global {
  interface Window {
    copyCodeBlock: (btn: HTMLElement) => void
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
  if (window.electronAPI) {
    // Electron 环境（优先使用 IPC）
    configList.value = await window.electronAPI.getConfig()
    return
  }

  const saved = localStorage.getItem('llm-config-list')
  if (saved) {
    try {
      configList.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse config list:', e)
    }
  }
}

function loadAssistants() {
  const saved = localStorage.getItem('assistant-list')
  if (saved) {
    try {
      assistantList.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse assistant list:', e)
    }
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

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

  sending.value = true
  controller.value = new AbortController()

  try {
    const currentMessages = currentChat.value?.messages || []
    const messagesToSend = currentMessages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }))

    // 如果配置了助理，添加 system prompt 到消息开头
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      messagesToSend.unshift({
        role: 'system',
        content: activeAssistant.value.systemPrompt.trim()
      })
    }

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
        signal: controller.value.signal,
      })
    } else {
      resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend
        }),
        signal: controller.value.signal,
      })
    }

    if (!resp.body) {
      throw new Error('No response body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const assistantIndex = currentMessages.length - 1

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
          const reasoning_content = json?.choices?.[0]?.delta?.reasoning_content ?? ''
          const reasoning = json?.choices?.[0]?.delta?.reasoning ?? ''
          if (reasoning_content || reasoning) {
            const msg = currentMessages[assistantIndex]
            if (msg) {
              // 如果这是第一次接收推理内容，记录开始时间
              if (!reasoningStartTime.value[assistantIndex]) {
                reasoningStartTime.value[assistantIndex] = Date.now()
              }
              // 实时更新消息的推理时长（秒）
              msg.reasoningDuration = Math.floor((Date.now() - reasoningStartTime.value[assistantIndex]) / 1000)
              msg.reasoning += (reasoning_content || reasoning)
            }
            scrollToBottom()
          }

          const delta = json?.choices?.[0]?.delta?.content ?? ''
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
    sending.value = false
    controller.value = null
    // 推理内容完成后自动折叠
    const currentMessages = currentChat.value?.messages || []
    const last = currentMessages[currentMessages.length - 1]
    if (last && last.reasoning) {
      reasoningExpanded.value[currentMessages.length - 1] = false
    }
    saveChatHistory()
    scrollToBottom()
  }
}

// 执行任务模式
async function executeTaskMode(userInput: string) {
  const chat = currentChat.value
  if (!chat) return

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

  sending.value = true
  controller.value = new AbortController()

  try {
    // 1. 任务规划阶段
    isTaskPlanning.value = true
    chat.messages[planMsgIndex]!.content = '正在规划任务...'
    chat.messages[planMsgIndex]!.copyable = false

    const tasks = await planTasks(userInput)
    if (chat) {
      chat.taskList = tasks.map((t, i) => ({ id: i, description: t.description, completed: false }))
    }

    // 显示任务列表
    let taskListDisplay = '📋 **任务规划完成**\n\n'
    tasks.forEach((task, idx) => {
      taskListDisplay += `${idx + 1}. ${task.description}\n`
    })
    chat.messages[planMsgIndex]!.content = taskListDisplay
    chat.messages[planMsgIndex]!.copyable = false
    scrollToBottom()

    isTaskPlanning.value = false
    isTaskExecuting.value = true

    // 2. 逐个执行任务
    let previousResult: string | undefined
    const taskOutputs: string[] = []

    for (let i = 0; i < tasks.length; i++) {
      if (controller.value!.signal.aborted) {
        throw new Error('用户取消')
      }

      currentTaskIndex.value = i
      const task = tasks[i]
      if (!task) break

      // 添加任务执行消息
      const taskMsgIndex = chat.messages.length
      const taskPrompt = i === 0
        ? `**任务 ${i + 1}/${tasks.length}**: ${task.description}`
        : `请继续完成以下任务：${task.description}`
      chat.messages.push({ role: 'user', content: taskPrompt, reasoning: '', visible: false, copyable: false })
      chat.messages.push({ role: 'assistant', content: '', reasoning: '' })

      const msg = chat.messages[taskMsgIndex + 1]
      if (!msg) break

      // 流式执行任务（携带完整的对话历史）
      await executeTaskStreaming(
        task.description,
        i === 0 ? undefined : previousResult,
        chat.messages.slice(0, -1), // 传递当前聊天历史的所有消息
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

      // 保存任务输出用于最终整合
      taskOutputs.push(msg.content)

      // 标记任务完成
      const taskList = currentChat.value?.taskList
      const currentTask = taskList?.[i]
      if (currentTask) {
        currentTask.completed = true
      }

      // 总结任务结果
      if (i < tasks.length - 1 && task && msg) {
        // 只有不是最后一个任务时才总结（最后一个任务不需要为下一个任务提供上下文）
        previousResult = await summarizeTaskResult(task.description, msg.content)
      }

      // 推理内容完成后自动折叠
      if (msg.reasoning) {
        reasoningExpanded.value[taskMsgIndex + 1] = false
      }

      scrollToBottom()
    }

    // 3. 最终整合：将所有任务输出整合成完整的回答
    isTaskExecuting.value = false

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
      chat.messages.slice(0, -1),
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

    // 4. 任务完成
    chat.messages.push({ role: 'assistant', content: '---\n\n**所有任务已完成！**', reasoning: '', copyable: false })

  } catch (err) {
    const chat = currentChat.value
    if (chat) {
      const last = chat.messages[chat.messages.length - 1]
      if (last) {
        if (err instanceof Error && err.name === 'AbortError') {
          last.content = '任务已取消'
        } else {
          last.content = '任务执行失败: ' + (err instanceof Error ? err.message : '未知错误')
        }
      }
    }
  } finally {
    sending.value = false
    controller.value = null
    isTaskPlanning.value = false
    isTaskExecuting.value = false
    currentTaskIndex.value = -1
    saveChatHistory()
    scrollToBottom()
  }
}

function cancel() {
  if (controller.value) {
    controller.value.abort()
    sending.value = false
    controller.value = null
  }
}

function toggleReasoning(index: number) {
  reasoningExpanded.value[index] = !reasoningExpanded.value[index]
}

function scrollToBottom() {
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

function saveChatHistory() {
  localStorage.setItem('chat-history', JSON.stringify(chatList.value))
}

function loadChatHistory() {
  const saved = localStorage.getItem('chat-history')
  if (saved) {
    try {
      chatList.value = JSON.parse(saved)
      if (chatList.value.length > 0) {
        currentChatId.value = chatList.value[0]?.id ?? null
      } else {
        createNewChat()
      }
    } catch (e) {
      console.error('Failed to load chat history:', e)
      createNewChat()
    }
  } else {
    createNewChat()
  }
}

function logout() {
  localStorage.removeItem('isLoggedIn')
  localStorage.removeItem('username')
  router.push('/login')
}

onMounted(() => {
  loadChatHistory()
  loadConfig()
  loadAssistants()
  loadHighlightTheme()
  scrollToBottom()
  if (textareaRef.value) {
    autoResizeTextarea()
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
      <main class="main">
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
                </div>
              </div>
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
  height: calc(78vh);
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
  color: #0f172a;
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
  color: #111827;
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

.msg-bubble :deep(code) {
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #0f172a;
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
</style>
