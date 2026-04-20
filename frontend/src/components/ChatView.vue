<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js'
import type { ConfigList, AssistantList } from '../types/electron'
import type { Workspace } from '../types/workspace'
import { useMCP } from '../composables/useMCP'
import { useSkills } from '../composables/useSkills'
import { useLoop } from '../composables/useLoop'
import { useConnections } from '../composables/useConnections'
import type { LoopTask } from '../types/loop'
import NormalChat from './NormalChat.vue'
import WorkspaceView from './WorkspaceView.vue'
import ChatTabBar from './ChatTabBar.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
import MermaidDialog from './MermaidDialog.vue'
import { storage } from '../services/StorageService'
import SettingsIcon from './icons/SettingsIcon.vue'
import XIcon from './icons/XIcon.vue'
import EditIcon from './icons/EditIcon.vue'
import FolderOpenIcon from './icons/FolderOpenIcon.vue'

const router = useRouter()


// MCP 管理器
const mcpManager = useMCP()

// 连接管理器（用于语雀、飞书等第三方服务连接）
const connectionsManager = useConnections()

// Skills 管理器
const skillsManager = useSkills()

// Loop 定时任务管理器
const loopManager = useLoop()

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// Mermaid预览对话框状态
const showMermaidPreview = ref(false)
const mermaidPreviewContent = ref('')

// 命令确认对话框状态
const showCommandConfirmDialog = ref(false)
const pendingCommand = ref('')
const pendingCommandReason = ref('')
const commandAutoAllow = ref(false)
let commandConfirmResolve: ((confirmed: boolean) => void) | null = null

// 有趣的动态状态短语（参考 Claude Code）
const runningPhrases = [
  '正在处理',
  '努力执行中',
  '飞速运行中',
  '思考中',
  '构建中',
  '读取中',
  '编写中',
  '搜索中',
]

function getRandomRunningPhrase(): string {
  const index = Math.floor(Math.random() * runningPhrases.length)
  return runningPhrases[index] ?? '正在处理'
}

// 命令确认回调函数
async function handleCommandConfirm(command: string, reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 如果已启用自动允许，直接确认
    if (commandAutoAllow.value) {
      resolve(true)
      return
    }
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

// 用户更新自动允许状态
function onCommandAutoAllowUpdate(checked: boolean) {
  commandAutoAllow.value = checked
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
  visible?: boolean
  copyable?: boolean
  archived?: boolean
  isError?: boolean
  // MCP Function Calling 相关
  tool_calls?: any[]
  tool_call_id?: string
  // 工具执行状态
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  // 动态状态短语（参考 Claude Code）
  runningPhrase?: string
  // 图片附件（用于UI显示）
  images?: string[]
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
md.renderer.rules.fence = (tokens: Token[], idx: number) => {
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

  // 为Mermaid代码块添加预览按钮
  if (lang === 'mermaid') {
    const utf8Bytes = encodeURIComponent(rawCode).replace(/%([0-9A-F]{2})/g, (_match, p1) => String.fromCharCode(parseInt(p1, 16)))
    const base64Code = btoa(utf8Bytes)
    previewBtn = `<button class="code-mermaid-btn" data-mermaid-code="${base64Code}" onclick="window.previewMermaid(this)" title="预览图表">图表</button>`
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

// 工作空间状态
const workspaceList = ref<Workspace[]>([])
const currentWorkspaceId = ref<string | null>(null)

// 用户名（用于侧边栏底部显示）
const username = ref('')

const currentWorkspaceName = computed(() =>
  workspaceList.value.find(w => w.id === currentWorkspaceId.value)?.name ?? '工作空间'
)

const usernameInitials = computed(() => {
  if (!username.value) return '?'
  return username.value.slice(0, 1).toUpperCase()
})

// 当前选择的文件夹路径（用于工作空间）
const currentFolder = ref<string>('')

// 目录结构缓存
const directoryStructureCache = ref<string>('')
const directoryStructureCacheTime = ref<number>(0)
const DIRECTORY_CACHE_TTL = 30000 // 缓存 30 秒

/**
 * 递归扫描目录结构，生成结构化的目录树
 * @param basePath 基础路径
 * @param currentPath 当前扫描路径（相对路径）
 * @param depth 当前深度
 * @param maxDepth 最大深度
 * @returns 结构化的目录树字符串
 */
async function scanDirectoryStructure(
  basePath: string,
  currentPath: string = '',
  depth: number = 0,
  maxDepth: number = 3
): Promise<string> {
  if (!window.electronAPI?.fileOperation) {
    return ''
  }

  if (depth > maxDepth) {
    return '  '.repeat(depth) + '... (已达最大深度)\n'
  }

  try {
    const result = await window.electronAPI.fileOperation('list_directory', {
      basePath,
      path: currentPath
    })

    if (!result.success || !result.content) {
      return ''
    }

    const { items } = JSON.parse(result.content)
    if (!items || items.length === 0) {
      return ''
    }

    let structure = ''
    const indent = '  '.repeat(depth)

    // 排序：目录在前，文件在后，按名称排序
    const sortedItems = items.sort((a: any, b: any) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    // 过滤掉隐藏文件和常见的忽略目录
    const ignorePatterns = [
      'node_modules', '.git', '.svn', '.hg', '__pycache__', '.pytest_cache',
      'dist', 'build', '.next', '.nuxt', 'coverage', '.cache', '.tmp',
      '.DS_Store', 'Thumbs.db', '*.log'
    ]

    const filteredItems = sortedItems.filter((item: any) => {
      if (item.name.startsWith('.')) return false
      return !ignorePatterns.includes(item.name)
    })

    // 限制显示的条目数量
    const maxItems = depth === 0 ? 50 : 20
    const displayItems = filteredItems.slice(0, maxItems)
    const hasMore = filteredItems.length > maxItems

    for (const item of displayItems) {
      if (item.type === 'directory') {
        structure += `${indent} ${item.name}/\n`
        // 只有当未达到最大深度时才递归扫描子目录
        if (depth < maxDepth) {
          const subPath = currentPath ? `${currentPath}/${item.name}` : item.name
          structure += await scanDirectoryStructure(basePath, subPath, depth + 1, maxDepth)
        }
      } else {
        // 显示文件
        structure += `${indent}${item.name}\n`
      }
    }

    if (hasMore) {
      structure += `${indent}... 还有 ${filteredItems.length - maxItems} 个条目\n`
    }

    return structure
  } catch (error) {
    console.error('扫描目录结构失败:', error)
    return ''
  }
}

/**
 * 获取工作目录结构上下文（带缓存）
 */
async function getWorkspaceContext(): Promise<string> {
  if (!currentFolder.value) {
    return ''
  }

  // 检查缓存是否有效
  const now = Date.now()
  if (directoryStructureCache.value && (now - directoryStructureCacheTime.value) < DIRECTORY_CACHE_TTL) {
    return directoryStructureCache.value
  }

  try {
    // 扫描目录结构（只展示当前目录，不递归子文件夹）
    const structure = await scanDirectoryStructure(currentFolder.value, '', 0, 0)

    if (!structure.trim()) {
      return ''
    }

    const context = `
## 当前工作目录结构

工作目录: \`${currentFolder.value}\`

\`\`\`
${structure}\`\`\`

> 注：这是当前工作目录的结构概览。你可以使用 \`list_directory\` 等工具查看更详细的内容。
`

    // 更新缓存
    directoryStructureCache.value = context
    directoryStructureCacheTime.value = now

    return context
  } catch (error) {
    console.error('获取工作目录上下文失败:', error)
    return ''
  }
}

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

// 所有会话都是普通会话
const normalChats = computed(() => chatList.value)
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

// handleMessagesScroll, autoResizeTextarea, render, stripHtml, copyText 函数已移至 NormalChat 组件

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
): { reasoning: string; content: string; reasoningCompleted: boolean } {
  const OPEN_TAG = '<think>'
  const CLOSE_TAG = '</think>'

  let result = { reasoning: '', content: '', reasoningCompleted: false }

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
            result.reasoningCompleted = true  // 思考结束
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

// 复制代码块和预览 HTML 函数（全局调用）

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


// 文本文件类型定义
interface AttachedFile {
  name: string
  content: string
  type: string
  size: number
}

async function send(images: string[] = [], files: AttachedFile[] = []) {
  const text = input.value.trim()
  if ((!text && images.length === 0 && files.length === 0) || (currentChat.value?.sending)) return

  // 处理 /loop 指令
  const loopResult = await handleLoopCommand(text)
  if (loopResult) {
    input.value = ''
    return
  }

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

  // 普通对话流程（默认）
  await executeNormalChat(text, images, files)
}

/**
 * 处理 /loop 定时任务指令
 * 格式: /loop [时间表达式] [任务描述]
 * 示例: /loop 5m 检查API服务状态
 */
async function handleLoopCommand(text: string): Promise<boolean> {
  // 匹配 /loop 指令
  const loopMatch = text.match(/^\/loop\s+(\S+)\s+(.+)$/i)
  if (!loopMatch) {
    // 检查是否是 /loop 相关指令
    if (text.match(/^\/loop\s*$/i)) {
      // 显示帮助信息
      addSystemMessage('**Loop 定时任务帮助**\n\n' +
        '用法: `/loop [时间] [任务描述]`\n\n' +
        '**时间表达式:**\n' +
        '- `30s` - 30秒 (最小1分钟)\n' +
        '- `5m` - 5分钟\n' +
        '- `2h` - 2小时\n' +
        '- `1d` - 1天\n\n' +
        '**示例:**\n' +
        '- `/loop 5m 检查API状态`\n' +
        '- `/loop 1h 提醒我休息`\n' +
        '- `/loop 1d 生成每日报告`')
      return true
    }
    return false
  }

  const interval = loopMatch[1]
  const description = loopMatch[2]

  if (!interval || !description) {
    return false
  }

  try {
    // 解析时间表达式
    const parsed = await loopManager.parseInterval(interval)
    if (!parsed || !parsed.isValid) {
      addSystemMessage(`❌ 时间表达式无效: "${interval}"\n\n支持格式: 30s, 5m, 2h, 1d (最小1分钟)`)
      return true
    }

    // 创建定时任务
    const task = await loopManager.createTask({
      name: description,
      description: `由对话创建: ${description}`,
      interval: interval,
      type: 'chat',
      payload: {
        prompt: description
      },
      maxRetries: 2,
      retryDelay: 5000
    })

    if (task) {
      const formatInterval = (ms: number): string => {
        if (ms < 60000) return `${ms / 1000}秒`
        if (ms < 3600000) return `${ms / 60000}分钟`
        if (ms < 86400000) return `${ms / 3600000}小时`
        return `${ms / 86400000}天`
      }

      const nextTime = new Date(Date.now() + parsed.milliseconds).toLocaleString('zh-CN')

      addSystemMessage(
        `✅ **定时任务已创建**\n\n` +
        `**任务名称:** ${description}\n` +
        `**执行间隔:** ${formatInterval(parsed.milliseconds)}\n` +
        `**任务ID:** ${task.id}\n` +
        `**下次执行:** ${nextTime}\n\n` +
        `_任务将在后台自动执行，执行结果会通知您_`
      )
    } else {
      addSystemMessage(`❌ 创建任务失败: ${loopManager.error || '未知错误'}`)
    }
  } catch (e: any) {
    addSystemMessage(`❌ 处理指令失败: ${e?.message || '未知错误'}`)
  }

  return true
}

/**
 * 添加系统消息到当前聊天
 */
function addSystemMessage(content: string) {
  if (!currentChat.value) {
    createNewChat()
  }

  const systemMessage = {
    id: `sys-${Date.now()}`,
    role: 'assistant' as const,
    content: content,
    timestamp: Date.now(),
    isSystem: true
  }

  currentChat.value?.messages.push(systemMessage)
  saveChatHistory()
  scrollToBottom()
}

function cancel() {
  const chatId = currentChat.value?.id
  if (chatId && controllers.value[chatId]) {
    controllers.value[chatId].abort()
  }
}

// 执行普通对话
async function executeNormalChat(text: string, images: string[] = [], files: AttachedFile[] = []) {
  // 格式化文本文件内容（用于发送给 LLM）
  let formattedText = text
  if (files.length > 0) {
    const fileContents = files.map(file => {
      return `\n\n---\n**文件: ${file.name}**\n\`\`\`\n${file.content}\n\`\`\``
    }).join('')
    formattedText = text + fileContents
  }

  if (currentChat.value) {
    if (currentChat.value.messages.length === 0) {
      updateChatTitle(currentChat.value.id, text, images.length > 0 || files.length > 0)
    }
    // 构建用户消息，存储格式化文本和文件信息
    // content 存储完整内容（发送给 LLM），files 用于 UI 折叠显示
    const userMessage: any = {
      role: 'user',
      content: formattedText,
      reasoning: '',
      images: images.length > 0 ? images : undefined,
      files: files.length > 0 ? files : undefined
    }
    currentChat.value.messages.push(userMessage)
    const assistantIndex = currentChat.value.messages.length
    currentChat.value.messages.push({ role: 'assistant', content: '',  reasoning: '' })
    // 清除该消息索引的推理开始时间，确保新的推理从 0 开始计时
    delete reasoningStartTime.value[assistantIndex]
    // 自动展开 reasoning section，让用户立即看到思考中的状态
    reasoningExpanded.value[assistantIndex] = true
    if (normalChatRef.value) {
      normalChatRef.value.setReasoningExpanded(assistantIndex, true)
      // 重置用户滚动状态，允许新的 AI 响应自动滚动
      ;(normalChatRef.value as any).resetUserScroll?.()
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
      // 如果消息包含图片，使用 OpenAI Vision 格式
      let content: any = m.content
      if (m.role === 'user' && (m as any).images && (m as any).images.length > 0) {
        content = [
          { type: 'text', text: m.content || '' },
          ...(m as any).images.map((img: string) => ({
            type: 'image_url',
            image_url: { url: img }
          }))
        ]
      }

      const msg: any = { role: m.role, content }
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      // DeepSeek 思考模型要求：如果历史消息中有 assistant 消息包含 reasoning_content，
      // 后续所有的 assistant 消息都必须包含此字段（即使是空字符串）
      if (m.role === 'assistant') {
        msg.reasoning_content = m.reasoning || ''
      }
      return msg
    })

    // 生成 MCP tools 数组（如果有激活的工具）
    await mcpManager.loadServers()
    // 初始化连接管理器，确保语雀、飞书等连接状态可用
    await connectionsManager.initialize()
    const mcpTools = mcpManager.generateOpenAITools()
    //console.log('[MCP] Active tools:', mcpTools.length)

    // 构建 system prompt（使用 XML 标签组织语义块）
    let systemPrompt = ''

    // <role> 定义 Agent 身份
    let roleContent = ''
    if (activeAssistant.value?.systemPrompt && activeAssistant.value.systemPrompt.trim()) {
      roleContent = activeAssistant.value.systemPrompt.trim()
    } else {
      // 使用默认内置助理的 System Prompt
      roleContent = storage.getDefaultAssistantPrompt()
    }
    systemPrompt += `<role>\n${roleContent}\n</role>`

    // 思维方式
    systemPrompt += `\n\n<thinking_style>\n
    - Think concisely and strategically about the user's request BEFORE taking action
    - Break down the task: What is clear? What is ambiguous? What is missing?
    - **PRIORITY CHECK: If anything is unclear, missing, or has multiple interpretations, you MUST ask for clarification FIRST - do NOT proceed with work**
    - Never write down your full final answer or report in thinking process, but only outline
    - CRITICAL: After thinking, you MUST provide your actual response to the user. Thinking is for planning, the response is for delivery.
    - Your response must contain the actual answer, not just a reference to what you thought about \n</thinking_style>`
      
    // <skill_system> 技能使用指南
    await skillsManager.loadRegistry()
    const skillsContext = skillsManager.generateSkillContext()
    if (skillsContext) {
      systemPrompt += `\n\n<skill_system>\n${skillsContext}\n</skill_system>`
    }

    // 澄清
    systemPrompt += `\n\n <clarification_system>
**WORKFLOW PRIORITY: CLARIFY → PLAN → ACT**
1. **FIRST**: Analyze the request in your thinking - identify what's unclear, missing, or ambiguous
2. **SECOND**: If clarification is needed, call \`ask_clarification\` tool IMMEDIATELY - do NOT start working
3. **THIRD**: Only after all clarifications are resolved, proceed with planning and execution

**CRITICAL RULE: Clarification ALWAYS comes BEFORE action. Never start working and clarify mid-execution.**

**MANDATORY Clarification Scenarios - You MUST call ask_clarification BEFORE starting work when:**

1. **Missing Information** (\`missing_info\`): Required details not provided
   - Example: User says "create a web scraper" but doesn't specify the target website
   - Example: "Deploy the app" without specifying environment
   - **REQUIRED ACTION**: Call ask_clarification to get the missing information

2. **Ambiguous Requirements** (\`ambiguous_requirement\`): Multiple valid interpretations exist
   - Example: "Optimize the code" could mean performance, readability, or memory usage
   - Example: "Make it better" is unclear what aspect to improve
   - **REQUIRED ACTION**: Call ask_clarification to clarify the exact requirement

3. **Approach Choices** (\`approach_choice\`): Several valid approaches exist
   - Example: "Add authentication" could use JWT, OAuth, session-based, or API keys
   - Example: "Store data" could use database, files, cache, etc.
   - **REQUIRED ACTION**: Call ask_clarification to let user choose the approach

4. **Risky Operations** (\`risk_confirmation\`): Destructive actions need confirmation
   - Example: Deleting files, modifying production configs, database operations
   - Example: Overwriting existing code or data
   - **REQUIRED ACTION**: Call ask_clarification to get explicit confirmation

5. **Suggestions** (\`suggestion\`): You have a recommendation but want approval
   - Example: "I recommend refactoring this code. Should I proceed?"
   - **REQUIRED ACTION**: Call ask_clarification to get approval

**STRICT ENFORCEMENT:**
- ❌ DO NOT start working and then ask for clarification mid-execution - clarify FIRST
- ❌ DO NOT skip clarification for "efficiency" - accuracy matters more than speed
- ❌ DO NOT make assumptions when information is missing - ALWAYS ask
- ❌ DO NOT proceed with guesses - STOP and call ask_clarification first
- ✅ Analyze the request in thinking → Identify unclear aspects → Ask BEFORE any action
- ✅ If you identify the need for clarification in your thinking, you MUST call the tool IMMEDIATELY
- ✅ After calling ask_clarification, execution will be interrupted automatically
- ✅ Wait for user response - do NOT continue with assumptions

**How to Use:**
\`\`\`
ask_clarification(
    question="Your specific question here?",
    clarification_type="missing_info",  # or other type
    context="Why you need this information",  # optional but recommended
    options=["option1", "option2"]  # optional, for choices
)
\`\`\`

**Example:**
User: "Deploy the application"
You (thinking): Missing environment info - I MUST ask for clarification
You (action): ask_clarification(
    question="Which environment should I deploy to?",
    clarification_type="approach_choice",
    context="I need to know the target environment for proper configuration",
    options=["development", "staging", "production"]
)
[Execution stops - wait for user response]

User: "staging"
You: "Deploying to staging..." [proceed]
</clarification_system> \n</clarification>`

    // <working_directory> 文件路径说明
    const workspaceContext = await getWorkspaceContext()
    if (workspaceContext) {
      systemPrompt += `\n\n<working_directory>\n${workspaceContext}\n</working_directory>`
    }

    // <memory> 记忆系统上下文
    if (window.electronAPI?.memoryGetFormatted) {
      try {
        const memoryResult = await window.electronAPI.memoryGetFormatted(2000)
        if (memoryResult.success && memoryResult.data) {
          systemPrompt += `\n\n<memory>\n${memoryResult.data}\n</memory>`
        }
      } catch (e) {
        console.error('[Memory] Failed to get formatted memory:', e)
      }
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

      // 打印最终的 system 提示词到控制台
      const systemMsg = messagesToSend.find((m: any) => m.role === 'system')
      if (systemMsg) {
        console.log('\n' + '='.repeat(60))
        console.log('[SYSTEM PROMPT]')
        console.log('='.repeat(60))
        console.log(systemMsg.content)
        console.log('='.repeat(60) + '\n')
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
    // 跟踪当前请求的 usage 是否已处理（防止重复累加）
    let currentRequestUsageProcessed = false

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
              // 如果��是第一��接收推理内容，记录开始时间
              if (!reasoningStartTime.value[assistantIndex]) {
                reasoningStartTime.value[assistantIndex] = Date.now()
                // 同步到 NormalChat 组件
                if (normalChatRef.value) {
                  normalChatRef.value.setReasoningStartTime(assistantIndex, Date.now())
                }
              }
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
                  // 首次检测到 tool_call 时，立即显示"正在处理..."
                  if (!preparingToolCallIndexes.has(index)) {
                    preparingToolCallIndexes.add(index)
                    const runningPhrase = getRandomRunningPhrase()
                    currentMessages.push({
                      role: 'tool' as any,
                      content: '正在处理...',
                      reasoning: '',
                      tool_call_id: `preparing_${index}`,
                      toolStatus: 'running',
                      runningPhrase
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
          // 注意：某些 API 可能在多个 chunk 中返回 usage，只在第一次遇到时累加
          const usage = json?.usage
          if (usage && currentChat.value) {
            // 检查 finish_reason 是否存在（表示流结束）
            // 或者检查 usage 是否有实际值且当前请求尚未处理过 usage
            const finishReason = json?.choices?.[0]?.finish_reason
            const hasValidUsage = (usage.prompt_tokens > 0 || usage.completion_tokens > 0)

            if ((finishReason || hasValidUsage) && !currentRequestUsageProcessed) {
              currentRequestUsageProcessed = true
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

    // 为 tool_calls 添加 alias 字段（从 mcpTools 中查找）
    if (finalToolCalls.length > 0 && mcpTools.length > 0) {
      for (const toolCall of finalToolCalls) {
        const toolDef = mcpTools.find(t => t.function?.name === toolCall.function?.name)
        if (toolDef?.function?.alias) {
          toolCall.function.alias = toolDef.function.alias
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
          // 更新工具调用消息，设置实际的 tool_call_id
          // 如果是 OpenAI 格式，使用 currentToolCallsMap 的 key（原始 index）来匹配
          // 如果是 Qwen 格式，currentToolCallsMap 为空，使用数组索引
          const toolCallEntries = currentToolCallsMap.size > 0
            ? Array.from(currentToolCallsMap.entries())
            : finalToolCalls.map((tc, i) => [i, tc])
          
          for (const [index, toolCall] of toolCallEntries) {
            const preparingMsg = currentMessages.find(
              m => m.role === 'tool' && m.tool_call_id === `preparing_${index}`
            )
            if (preparingMsg) {
              preparingMsg.tool_call_id = toolCall.id
              // 保持原有的 runningPhrase 不变
              preparingMsg.toolStatus = 'running'
            } else {
              // 如果没有找到准备中的消息（可能流式解析时未检测到），则添加新消息
              const runningPhrase = getRandomRunningPhrase()
              currentMessages.push({
                role: 'tool' as any,
                content: '正在处理...',
                reasoning: '',
                tool_call_id: toolCall.id,
                toolStatus: 'running',
                runningPhrase
              })
            }
          }
          scrollToBottom()

          const toolResults = await mcpManager.executeToolCalls(finalToolCalls)

          // 更新工具结果消息（通过 tool_call_id 匹配）
          for (const resultMsg of toolResults) {
            const targetMsg = currentMessages.find(
              m => m.role === 'tool' && m.tool_call_id === resultMsg.tool_call_id
            )
            if (targetMsg) {
              targetMsg.content = resultMsg.content
              // 根据内容判断是否成功
              targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
            }
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
        last.isError = true
      }
    }
    // 重置所有处于 running 状态的工具调用状态
    currentMessages.forEach(m => {
      if (m.role === 'tool' && m.toolStatus === 'running') {
        m.toolStatus = 'error'
        if (!m.content || m.content === '正在处理...') {
          m.content = err instanceof Error && err.name === 'AbortError' ? '对话已取消' : '对话中断'
        }
      }
    })
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

    // 触发记忆更新（异步，不阻塞 UI）
    if (window.electronAPI?.memoryRequestUpdate && currentChat.value && !last?.isError) {
      try {
        // 过滤消息，只保留用户和助手消息
        const messagesForMemory = currentMessages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .filter(m => !m.tool_calls && !m.tool_call_id) // 排除工具调用消息
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content || ''
          }))

        if (messagesForMemory.length >= 2 && activeConfig.value) {
          // 至少有一轮对话才更新，传递当前会话的 LLM 配置
          window.electronAPI.memoryRequestUpdate(currentChat.value.id, messagesForMemory, {
            apiUrl: activeConfig.value.apiUrl,
            apiKey: activeConfig.value.apiKey,
            model: activeConfig.value.model,
          })
        }
      } catch (e) {
        console.error('[Memory] Failed to request memory update:', e)
      }
    }
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

    // 打印最终的 system 提示词到控制台
    const systemMsg = messagesToSend.find((m: any) => m.role === 'system')
    if (systemMsg) {
      console.log('\n' + '='.repeat(60))
      console.log('[SYSTEM PROMPT] (MCP Tool Call)')
      console.log('='.repeat(60))
      console.log(systemMsg.content)
      console.log('='.repeat(60) + '\n')
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
        tools: mcpTools,
      }),
      signal: controllers.value[chat.id]!.signal,
    })

    // 检查响应状态���处理错误情况
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
                  // 首次检测到 tool_call 时，立即显示"正在处理..."
                  if (!preparingToolCallIndexes.has(index)) {
                    preparingToolCallIndexes.add(index)
                    const runningPhrase = getRandomRunningPhrase()
                    messages.push({
                      role: 'tool' as any,
                      content: '正在处理...',
                      reasoning: '',
                      tool_call_id: `preparing_${index}`,
                      toolStatus: 'running',
                      runningPhrase
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

    // 为 tool_calls 添加 alias 字段（从 mcpTools 中查找）
    if (finalToolCalls.length > 0 && mcpTools.length > 0) {
      for (const toolCall of finalToolCalls) {
        const toolDef = mcpTools.find(t => t.function?.name === toolCall.function?.name)
        if (toolDef?.function?.alias) {
          toolCall.function.alias = toolDef.function.alias
        }
      }
    }

    if (finalToolCalls.length > 0) {
      const msg = messages[assistantIndex]
      if (msg) {
        msg.tool_calls = finalToolCalls

        // 更新工具调用消息，设置实际的 tool_call_id
        // 如果是 OpenAI 格式，使用 currentToolCallsMap 的 key（原始 index）来匹配
        // 如果是 Qwen 格式，currentToolCallsMap 为空，使用数组索引
        const toolCallEntries = currentToolCallsMap.size > 0
          ? Array.from(currentToolCallsMap.entries())
          : finalToolCalls.map((tc, i) => [i, tc])
        
        for (const [index, toolCall] of toolCallEntries) {
          const preparingMsg = messages.find(
            m => m.role === 'tool' && m.tool_call_id === `preparing_${index}`
          )
          if (preparingMsg) {
            preparingMsg.tool_call_id = toolCall.id
            // 保持原有的 runningPhrase 不变
            preparingMsg.toolStatus = 'running'
          } else {
            // 如果没有找到准备中的消息（可能流式解析时未检测到），则添加新消息
            const runningPhrase = getRandomRunningPhrase()
            messages.push({
              role: 'tool' as any,
              content: '正在处理...',
              reasoning: '',
              tool_call_id: toolCall.id,
              toolStatus: 'running',
              runningPhrase
            })
          }
        }
        scrollToBottom()

        const toolResults = await mcpManager.executeToolCalls(finalToolCalls as any)
        // 更新工具结果消息（通过 tool_call_id 匹配）
        for (const resultMsg of toolResults) {
          const targetMsg = messages.find(
            m => m.role === 'tool' && m.tool_call_id === resultMsg.tool_call_id
          )
          if (targetMsg) {
            targetMsg.content = resultMsg.content
            // 根据内容判断是否成功
            targetMsg.toolStatus = resultMsg.content.startsWith('Error:') ? 'error' : 'success'
          }
        }
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
        msg.isError = true
      }
    }
    // 重置所有处于 running 状态的工具调用状态
    messages.forEach(m => {
      if (m.role === 'tool' && m.toolStatus === 'running') {
        m.toolStatus = 'error'
        if (!m.content || m.content === '正在处理...') {
          m.content = err instanceof Error && err.name === 'AbortError' ? '对话已取消' : '对话中断'
        }
      }
    })
  } finally {
    chat.sending = false
    delete controllers.value[chat.id]
    saveChatHistory()
    scrollToBottom()
  }
}

function createNewChat() {
  const lastAssistantId = localStorage.getItem('last-assistant-id')
  const currentAssistantId = currentChat.value?.assistantId ?? ''
  const lastConfigId = localStorage.getItem('last-config-id')
  const currentConfigId = currentChat.value?.configId

  const newParams: ChatParams = { ...DEFAULT_CHAT_PARAMS }

  const newChat: Chat = {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    // 优先使用当前聊天的助手和模型配置，如果没有则使用 localStorage 的备份
    assistantId: currentAssistantId || lastAssistantId || undefined,
    configId: currentConfigId !== undefined && currentConfigId !== null
      ? currentConfigId
      : (lastConfigId ? Number(lastConfigId) : undefined),
    params: newParams
  }
  chatList.value.unshift(newChat)
  currentChatId.value = newChat.id
  saveChatHistory()
}

function switchChat(chatId: string) {
  currentChatId.value = chatId
}

// 删除确认对话框状态
const showDeleteChatConfirm = ref(false)
const pendingDeleteChatIds = ref<string[]>([])
const pendingDeleteChatMessage = ref('')

function deleteChat(chatId: string, event: Event) {
  event.stopPropagation()
  const chat = chatList.value.find(c => c.id === chatId)
  pendingDeleteChatIds.value = [chatId]
  pendingDeleteChatMessage.value = `删除会话「${chat?.title || '未命名'}」？此操作不可撤销。`
  showDeleteChatConfirm.value = true
}

function batchDeleteChats(chatIds: string[], label: string) {
  pendingDeleteChatIds.value = chatIds
  pendingDeleteChatMessage.value = label
  showDeleteChatConfirm.value = true
}

function onDeleteChatConfirm() {
  performDeleteChats(pendingDeleteChatIds.value)
  showDeleteChatConfirm.value = false
  pendingDeleteChatIds.value = []
  pendingDeleteChatMessage.value = ''
}

function onDeleteChatCancel() {
  showDeleteChatConfirm.value = false
  pendingDeleteChatIds.value = []
  pendingDeleteChatMessage.value = ''
}

function performDeleteChats(chatIds: string[]) {
  const deletedSet = new Set(chatIds)
  const wasCurrentDeleted = deletedSet.has(currentChatId.value ?? '')
  chatList.value = chatList.value.filter(c => !deletedSet.has(c.id))
  if (wasCurrentDeleted) {
    if (chatList.value.length > 0) {
      currentChatId.value = chatList.value[0]?.id ?? null
      if (currentChatId.value) switchChat(currentChatId.value)
    } else {
      createNewChat()
    }
  } else if (chatList.value.length === 0) {
    createNewChat()
  }
  saveChatHistory()
}

function scrollToBottom() {
  nextTick(() => {
    // 调用 NormalChat 组件暴露的 scrollToBottom 方法
    normalChatRef.value?.scrollToBottom?.()
  })
}

function updateChatTitle(chatId: string, firstMessage: string, hasImages: boolean = false) {
  const chat = chatList.value.find(c => c.id === chatId)
  if (chat) {
    // 如果没有文本但有图片，使用默认标题
    if (!firstMessage && hasImages) {
      chat.title = '图片对话'
    } else {
      chat.title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : '')
    }
    saveChatHistory()
  }
}

function toggleReasoning(index: number) {
  reasoningExpanded.value[index] = !reasoningExpanded.value[index]
}

// 删除指定索引的消息及其后续内容（包括相关的 tool 消息）
function deleteMessage(messageIndex: number) {
  if (!currentChat.value) return

  const messages = currentChat.value.messages
  if (messageIndex < 0 || messageIndex >= messages.length) return

  // 找到要删除的范围：
  // 1. 删除指定消息
  // 2. 删除该消息之后的所有消息（因为上下文会断裂）
  // 3. 如果删除的是 user 消息，需要找到对应的 assistant 回复和相关 tool 消息

  // 简单处理：删除指定索引及其之后的所有消息
  // 这样可以保证上下文的完整性
  const deleteFromIndex = messageIndex

  // 删除从 deleteFromIndex 开始的所有消息
  messages.splice(deleteFromIndex)

  // 清理相关的 reasoning 状态
  for (let i = deleteFromIndex; i < messages.length + 100; i++) {
    delete reasoningExpanded.value[i]
    delete reasoningStartTime.value[i]
  }

  // 如果删除后没有消息了，重置 usage
  if (messages.length === 0) {
    currentChat.value.usage = undefined
  }

  // 保存历史
  saveChatHistory()
}

// 重试失败的消息
async function retryMessage(messageIndex: number) {
  if (!currentChat.value) return

  const messages = currentChat.value.messages
  if (messageIndex < 0 || messageIndex >= messages.length) return

  const failedMessage = messages[messageIndex]
  if (!failedMessage) return

  // 确保是错误消息
  if (!(failedMessage as any).isError && !isErrorMessage(failedMessage)) return

  // 查找失败消息之前的用户消息
  let userMessageIndex = messageIndex - 1
  while (userMessageIndex >= 0 && messages[userMessageIndex]?.role !== 'user') {
    userMessageIndex--
  }

  if (userMessageIndex < 0) return

  const userMessage = messages[userMessageIndex]
  if (!userMessage) return

  // 保存用户消息内容
  const userContent = userMessage.content
  const userImages = (userMessage as any).images || []

  // 删除从用户消息开始的所有消息
  messages.splice(userMessageIndex)

  // 清理相关的 reasoning 状态
  for (let i = userMessageIndex; i < messages.length + 100; i++) {
    delete reasoningExpanded.value[i]
    delete reasoningStartTime.value[i]
  }

  // 保存历史
  saveChatHistory()

  // 重新发送消息
  await executeNormalChat(
    typeof userContent === 'string' ? userContent : '',
    userImages
  )
}

// 检测消息是否为错误消息
function isErrorMessage(message: any): boolean {
  if (message.isError) return true
  const contentStr = typeof message.content === 'string' ? message.content : ''
  const errorPrefixes = ['对话失败', '任务执行失败', 'API 请求失败', 'API request failed', 'Maximum context length', 'context length', 'tokens']
  return errorPrefixes.some(prefix => contentStr.includes(prefix))
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

async function saveChatHistory() {
  if (!currentWorkspaceId.value) return
  await storage.saveWorkspaceChatHistory(currentWorkspaceId.value, chatList.value)
}

async function loadChatHistory() {
  if (!currentWorkspaceId.value) {
    createNewChat()
    return
  }
  try {
    const history = await storage.getWorkspaceChatHistory(currentWorkspaceId.value)
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

// 双击拖动区域切换窗口最大化
async function handleDragAreaDoubleClick() {
  if (window.electronAPI?.windowMaximize) {
    await window.electronAPI.windowMaximize()
  }
}

// ==================== 工作空间管理 ====================

// 从路径提取文件夹名称
function extractFolderName(path: string): string {
  if (!path) return '新工作空间'
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || '新工作空间'
}

// 从单工作空间迁移数据
async function migrateFromSingleWorkspace(): Promise<boolean> {
  const list = await storage.getWorkspaceList()
  if (list.workspaces.length > 0) return false // 已迁移

  const oldHistory = await storage.getChatHistory()
  const oldFolder = await storage.getSelectedFolder()

  if (oldHistory.length === 0 && !oldFolder) {
    // 没有旧数据，创建空的默认工作空间
    const defaultWorkspace: Workspace = {
      id: 'default',
      name: '默认工作空间',
      folderPath: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await storage.saveWorkspaceList({
      workspaces: [defaultWorkspace],
      activeWorkspaceId: defaultWorkspace.id
    })
    return true
  }

  // 从旧数据迁移
  const defaultWorkspace: Workspace = {
    id: 'default',
    name: '默认工作空间',
    folderPath: oldFolder || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  await storage.saveWorkspaceList({
    workspaces: [defaultWorkspace],
    activeWorkspaceId: defaultWorkspace.id
  })

  if (oldHistory.length > 0) {
    await storage.saveWorkspaceChatHistory(defaultWorkspace.id, oldHistory)
  }

  return true
}

// 切换工作空间
async function switchWorkspace(workspaceId: string) {
  if (workspaceId === currentWorkspaceId.value) return

  // 保存当前工作空间的聊天历史
  await saveChatHistory()

  // 切换工作空间
  currentWorkspaceId.value = workspaceId
  await storage.setActiveWorkspace(workspaceId)

  // 更新文件夹路径
  const workspace = workspaceList.value.find(w => w.id === workspaceId)
  if (workspace) {
    currentFolder.value = workspace.folderPath
    mcpManager.setSelectedFolder(workspace.folderPath)
    // 保存到存储
    await storage.saveSelectedFolder(workspace.folderPath)
  }

  // 加载新工作空间的聊天历史
  await loadChatHistory()

  // 清除目录结构缓存
  directoryStructureCache.value = ''
  directoryStructureCacheTime.value = 0
}

// 创建新工作空间
async function createWorkspace() {
  try {
    const result = await window.electronAPI?.selectFolder()
    if (!result?.success || !result.path) return

    // 检查是否已存在相同路径的工作空间
    const exists = workspaceList.value.some(w => w.folderPath === result.path)
    if (exists) {
      alert('该文件夹已创建工作空间')
      return
    }

    const newWorkspace: Workspace = {
      id: Date.now().toString(),
      name: extractFolderName(result.path),
      folderPath: result.path,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    // 添加到列表
    workspaceList.value.push(newWorkspace)
    await storage.saveWorkspaceList({
      workspaces: workspaceList.value,
      activeWorkspaceId: currentWorkspaceId.value
    })

    // 切换到新工作空间
    await switchWorkspace(newWorkspace.id)
  } catch (e) {
    console.error('Failed to create workspace:', e)
  }
}

// 重命名工作空间
async function renameWorkspace(workspaceId: string, newName: string) {
  const workspace = workspaceList.value.find(w => w.id === workspaceId)
  if (!workspace) return

  workspace.name = newName
  workspace.updatedAt = Date.now()

  await storage.updateWorkspace(workspace)
}

// 删除工作空间
async function deleteWorkspace(workspaceId: string) {
  if (workspaceList.value.length <= 1) {
    alert('至少需要保留一个工作空间')
    return
  }

  if (!confirm('确定要删除此工作空间吗？该工作空间的所有聊天记录将被删除。')) {
    return
  }

  // 如果删除的是当前工作空间，先切换到其他工作空间
  if (workspaceId === currentWorkspaceId.value) {
    const otherWorkspace = workspaceList.value.find(w => w.id !== workspaceId)
    if (otherWorkspace) {
      await switchWorkspace(otherWorkspace.id)
    }
  }

  // 从列表中移除
  workspaceList.value = workspaceList.value.filter(w => w.id !== workspaceId)
  await storage.deleteWorkspace(workspaceId)
}

// 加载工作空间
async function loadWorkspaces() {
  await migrateFromSingleWorkspace()

  const list = await storage.getWorkspaceList()
  workspaceList.value = list.workspaces
  currentWorkspaceId.value = list.activeWorkspaceId

  // 如果没有激活的工作空间，选择第一个
  if (!currentWorkspaceId.value && workspaceList.value.length > 0) {
    currentWorkspaceId.value = workspaceList.value[0]?.id ?? null
  }

  // 设置当前文件夹
  const activeWorkspace = workspaceList.value.find(w => w.id === currentWorkspaceId.value)
  if (activeWorkspace) {
    currentFolder.value = activeWorkspace.folderPath
    mcpManager.setSelectedFolder(activeWorkspace.folderPath)
  }
}

onMounted(async () => {
  // 先加载工作空间（包含迁移逻辑）
  await loadWorkspaces()
  // 加载当前工作空间的聊天历史
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

  // 设置命令确认回调
  mcpManager.setCommandConfirmCallback(handleCommandConfirm)

  // 监听 Loop 任务执行完成事件
  if (window.electronAPI?.onLoopTaskExecuted) {
    window.electronAPI.onLoopTaskExecuted(({ taskId, execution }: { taskId: string; execution: any }) => {
      const task = loopManager.tasks.value.find((t: LoopTask) => t.id === taskId)
      if (task) {
        const statusIcon = execution.status === 'success' ? '✅' : '❌'
        const timeStr = new Date(execution.completedAt || Date.now()).toLocaleString('zh-CN')

        let resultContent = ''
        if (execution.status === 'success' && execution.result) {
          if (execution.result.response) {
            // Chat 类型任务
            resultContent = `\n\n**响应:** ${execution.result.response}`
          } else if (execution.result.stdout !== undefined) {
            // Command 类型任务
            resultContent = `\n\n**输出:**\n\`\`\`\n${execution.result.stdout}\n\`\`\``
          } else if (execution.result.data) {
            // API 类型任务
            resultContent = `\n\n**结果:** ${JSON.stringify(execution.result.data, null, 2)}`
          }
        } else if (execution.error) {
          resultContent = `\n\n**错误:** ${execution.error}`
        }

        addSystemMessage(
          `${statusIcon} **定时任务执行完成**\n\n` +
          `**任务:** ${task.name}\n` +
          `**时间:** ${timeStr}\n` +
          `**状态:** ${execution.status === 'success' ? '成功' : '失败'}` +
          resultContent
        )
      }
    })
  }

  scrollToBottom()
})

onUnmounted(() => {
  // 清理命令确认回调
  mcpManager.setCommandConfirmCallback(null)
  // 清理 Loop 任务执行监听
  if (window.electronAPI?.removeLoopTaskExecutedListener) {
    window.electronAPI.removeLoopTaskExecutedListener()
  }
  // 中止所有正在进行的流式请求
  for (const id in controllers.value) {
    if (controllers.value[id]) {
      controllers.value[id].abort()
    }
  }
  // 重置所有会话的发送状态
  chatList.value.forEach(chat => {
    chat.sending = false
  })
  // 保存对话历史，防止页面切换时数据丢失
  saveChatHistory()
})

// 处理文件夹变化
function handleFolderChanged(path: string) {
  mcpManager.setSelectedFolder(path)
  currentFolder.value = path
  // 清除目录结构缓存，下次发送消息时会重新扫描
  directoryStructureCache.value = ''
  directoryStructureCacheTime.value = 0
}
</script>

<template>
  <div class="chat-view-wrapper">
    <!-- 双击缩放和按住拖拽区域 -->
    <div class="window-drag-area" @dblclick="handleDragAreaDoubleClick">
      <span class="app-title"></span>
    </div>
    <div class="container">
      <!-- 左侧边栏 -->
      <aside class="sidebar" :class="{ collapsed: !showSidebar }">
        <!-- 侧边栏顶部头部 -->
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <FolderOpenIcon :size="15" class="sidebar-brand-icon" />
            <span class="sidebar-brand-name">{{ currentWorkspaceName }}</span>
          </div>
          <button class="sidebar-action-btn" @click="createNewChat" title="新建对话">
            <EditIcon :size="15" />
          </button>
        </div>

        <!-- 工作空间切换器 -->
        <WorkspaceSwitcher
          :workspaces="workspaceList"
          :active-id="currentWorkspaceId"
          @switch="switchWorkspace"
          @create="createWorkspace"
          @rename="renameWorkspace"
          @delete="deleteWorkspace"
        />

        <!-- 工作空间内容 -->
        <div class="workspace-wrapper">
          <WorkspaceView :current-folder="currentFolder" />
        </div>

        <!-- 侧边栏底部固定区域 -->
        <div class="sidebar-footer">
          <div class="user-avatar">{{ usernameInitials }}</div>
          <span class="user-name">{{ username || '未设置用户名' }}</span>
          <button class="sidebar-action-btn" @click="router.push('/settings')" title="设置">
            <SettingsIcon :size="15" />
          </button>
        </div>
      </aside>
      <div class="content-wrapper">
        <div class="content-area">
          <!-- 标签栏 -->
          <ChatTabBar
            :chat-list="normalChats"
            :current-chat-id="currentChatId"
            @switch-chat="switchChat"
            @delete-chat="deleteChat"
            @batch-delete-chats="batchDeleteChats"
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
          :workspace-folder="currentFolder"
          @send="(images, files) => send(images, files)"
          @cancel="cancel"
          @update:input="input = $event"
          @toggle-reasoning="toggleReasoning"
          @open-params-dialog="openParamsDialog"
          @change-assistant="changeAssistant"
          @change-config="changeChatConfig"
          @clear-assistant="changeAssistant('')"
          @folder-changed="handleFolderChanged"
          @update:enable-thinking="handleUpdateEnableThinking"
          @delete-message="deleteMessage"
          @retry-message="retryMessage"
          ref="normalChatRef"
        />
      </div>
      </div>  <!-- content-wrapper 结束 -->

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


      <!-- HTML预览对话框 -->
      <HtmlPreviewDialog
        :show="showHtmlPreview"
        :html-content="htmlPreviewContent"
        @close="showHtmlPreview = false"
      />

      <!-- Mermaid预览对话框 -->
      <MermaidDialog
        :show="showMermaidPreview"
        :mermaid-content="mermaidPreviewContent"
        @close="showMermaidPreview = false"
      />

      <!-- 会话删除确认对话框 -->
      <ConfirmDialog
        :show="showDeleteChatConfirm"
        title="删除会话"
        :message="pendingDeleteChatMessage"
        confirm-text="删除"
        cancel-text="取消"
        type="danger"
        @confirm="onDeleteChatConfirm"
        @cancel="onDeleteChatCancel"
      />

      <!-- 命令执行确认对话框 -->
      <ConfirmDialog
        :show="showCommandConfirmDialog"
        title="确认执行命令"
        :message="`即将执行风险命令：\n${pendingCommand}\n\n风险类型：${pendingCommandReason}\n\n是否继续？`"
        confirm-text="确认执行"
        cancel-text="取消"
        type="danger"
        :show-auto-allow="true"
        :auto-allow-checked="commandAutoAllow"
        :close-on-click-overlay="false"
        @confirm="onCommandConfirm"
        @cancel="onCommandCancel"
        @update:auto-allow-checked="onCommandAutoAllowUpdate"
      />
    </div>
  </div>
  
</template>

<style scoped>
.chat-view-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.window-drag-area {
  height: 32px;
  width: 100%;
  -webkit-app-region: drag;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border, #e5e5e5);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 12px;
}

.app-title {
  font-weight: bolder;
  font-size: 13px;
  color: var(--color-text-tertiary, #888);
  -webkit-app-region: no-drag;
}

.container {
  flex: 1;
  display: flex;
  background: var(--color-bg-primary);
  min-height: 0;
  overflow: hidden;
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
  min-height: 0;
  overflow: hidden;
  position: relative;
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
  padding: 12px 12px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.sidebar-brand-icon {
  color: var(--color-primary);
  flex-shrink: 0;
  opacity: 0.8;
}

.sidebar-brand-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.sidebar-action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

/* 侧边栏底部固定区域 */
.sidebar-footer {
  margin-top: auto;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0;
  opacity: 0.9;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
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
  /* background: #0d8a6c;
  border-color: #0d8a6c; */
}

.msg-bubble :deep(.code-mermaid-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: #8b5cf6;
  border: 1px solid #8b5cf6;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: #ffffff;
}

.msg-bubble :deep(.code-mermaid-btn:hover) {
  background: #7c3aed;
  border-color: #7c3aed;
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
  /* background: #0d8a6c; */
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
