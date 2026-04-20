<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js'
import katex from '@traptitech/markdown-it-katex'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
import MermaidDialog from './MermaidDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useSkills } from '@/composables/useSkills'
import { LLM_PROVIDERS } from '@/types/llmProvider'
import CopyIcon from './icons/CopyIcon.vue'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'
import ChevronRightIcon from './icons/ChevronRightIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import XIcon from './icons/XIcon.vue'
import ArrowUpIcon from './icons/ArrowUpIcon.vue'
import SettingsIcon from './icons/SettingsIcon.vue'
import GrapeIcon from './icons/GrapeIcon.vue'
import LLMProviderIcon from './icons/LLMProviderIcon.vue'

type Role = 'user' | 'assistant' | 'system' | 'tool'

// 图片内容类型
export interface ImageContent {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export interface TextContent {
  type: 'text'
  text: string
}

export type MessageContent = string | (TextContent | ImageContent)[]

export type Message = {
  role: Role
  content: MessageContent
  reasoning?: string
  visible?: boolean
  copyable?: boolean
  archived?: boolean
  tool_call_id?: string
  tool_calls?: any[]
  // 工具执行状态
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  // 动态状态短语（参考 Claude Code）
  runningPhrase?: string
  // 错误消息标识
  isError?: boolean
  // 图片附件（用于UI显示）
  images?: string[]
  // 文本文件附件（用于UI显示）
  files?: AttachedFile[]
}

// Token 使用统计类型
export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// 斜杠命令类型
interface SlashCommand {
  name: string
  description: string
  usage: string
  example: string
}

// Props
interface Props {
  messages: Message[]
  input: string
  sending: boolean
  activeConfig: any
  activeAssistant: any
  currentChat: any
  assistantList: any
  configList: any
  usage?: TokenUsage  // 添加 token 使用统计
  enableThinking?: boolean  // 启用思考模式
  workspaceFolder?: string  // 工作空间目录路径
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  send: [images: string[], files: AttachedFile[]]
  cancel: []
  'update:input': [value: string]
  'toggle-reasoning': [index: number]
  'open-params-dialog': []
  'change-assistant': [id: string]
  'change-config': [index: string]
  'clear-assistant': []
  'folder-changed': [path: string]
  'update:enable-thinking': [value: boolean]  // 更新思考模式
  'delete-message': [index: number]  // 删除消息
  'retry-message': [index: number]  // 重试消息
}>()

// 思考模式
const enableThinking = computed(() => props.enableThinking ?? false)
function handleThinkingToggle() {
  emit('update:enable-thinking', !enableThinking.value)
}

// 打开生图模式窗口
function openImageGenerator() {
  window.electronAPI?.openImageGeneratorWindow()
}

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// Mermaid预览对话框状态
const showMermaidPreview = ref(false)
const mermaidPreviewContent = ref('')

// 设置弹出框状态

// 删除确认对话框状态
const showDeleteConfirmDialog = ref(false)
const pendingDeleteIndex = ref<number | null>(null)

// Skills selector state
const skillsManager = useSkills()
const showSkillSelector = ref(false)
const skillSelectorQuery = ref('')  // Query from @ trigger in textarea
const skillSelectorPopupQuery = ref('')  // Query from popup filter input
const selectedSkillIndex = ref(0)
const selectedSkill = ref<string | null>(null)  // Currently selected skill name for prefix
const skillFilterInputRef = ref<HTMLInputElement | null>(null)

// 支持的斜杠命令列表
const slashCommands: SlashCommand[] = [
  {
    name: '/loop',
    description: '创建定时任务',
    usage: '/loop [时间] [任务描述]',
    example: '/loop 5m 检查API状态'
  }
]

const showSlashCommandSelector = ref(false)
const slashCommandQuery = ref('')
const slashCommandPopupQuery = ref('')
const selectedCommandIndex = ref(0)
const slashCommandFilterInputRef = ref<HTMLInputElement | null>(null)
const slashCommandTriggered = ref(false) // 记录是否已触发过斜杠命令选择器

// 文件引用选择器状态（# 触发）
interface FileItem {
  name: string
  type: 'file' | 'directory'
  path: string
}
const showFileSelector = ref(false)
const fileSelectorQuery = ref('')
const fileSelectorPopupQuery = ref('')
const selectedFileIndex = ref(0)
const fileSelectorFilterInputRef = ref<HTMLInputElement | null>(null)
const fileSelectorTriggered = ref(false)
const workspaceFiles = ref<FileItem[]>([])
const isLoadingFiles = ref(false)

// Filtered slash commands based on query
const filteredSlashCommands = computed(() => {
  const query = (slashCommandPopupQuery.value || slashCommandQuery.value).toLowerCase()
  if (!query) {
    return slashCommands
  }
  return slashCommands.filter(cmd =>
    cmd.name.toLowerCase().includes(query) ||
    cmd.description.toLowerCase().includes(query)
  )
})

// Filtered skills based on query
const filteredSkills = computed(() => {
  const allSkills = skillsManager.registry.value.skills.filter(s => s.enabled && !s.hasError)
  // Use popup query if available, otherwise use @ trigger query
  const query = (skillSelectorPopupQuery.value || skillSelectorQuery.value).toLowerCase()
  if (!query) {
    return allSkills.slice(0, 8)  // Show top 8 skills when no query
  }
  return allSkills
    .filter(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query)
    )
    .slice(0, 8)
})

// Filtered files based on query
const filteredFiles = computed(() => {
  const query = (fileSelectorPopupQuery.value || fileSelectorQuery.value).toLowerCase()
  let files = workspaceFiles.value

  // 只显示文件，不显示目录
  files = files.filter(f => f.type === 'file')

  if (!query) {
    return files.slice(0, 20)  // Show top 20 files when no query
  }
  return files
    .filter(file => file.name.toLowerCase().includes(query))
    .slice(0, 20)
})

// 加载工作空间目录文件
async function loadWorkspaceFiles(dirPath: string) {
  if (!dirPath || !window.electronAPI?.readDirectory) {
    workspaceFiles.value = []
    return
  }

  isLoadingFiles.value = true
  try {
    const result = await window.electronAPI.readDirectory(dirPath)
    if (result.success && result.items) {
      // 递归加载子目录的文件
      const allFiles: FileItem[] = []

      async function scanDirectory(path: string, depth: number = 0) {
        if (depth > 3) return // 限制递归深度

        const dirResult = await window.electronAPI!.readDirectory(path)
        if (dirResult.success && dirResult.items) {
          for (const item of dirResult.items) {
            const itemPath = `${path}/${item.name}`
            // 忽略隐藏文件和目录
            if (item.name.startsWith('.')) continue
            // 忽略 node_modules
            if (item.name === 'node_modules') continue

            allFiles.push({
              name: item.name,
              type: item.type,
              path: itemPath
            })

            // 如果是目录，递归扫描
            if (item.type === 'directory' && depth < 3) {
              await scanDirectory(itemPath, depth + 1)
            }
          }
        }
      }

      await scanDirectory(dirPath)
      workspaceFiles.value = allFiles
    }
  } catch (e) {
    console.error('Failed to load workspace files:', e)
    workspaceFiles.value = []
  } finally {
    isLoadingFiles.value = false
  }
}

// Handle keyboard events in the filter input
function handleFilterKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
    handleKeydown(e)
  }
}

// Watch input changes to detect @ and / triggers
watch(() => props.input, (newValue) => {
  // Reset slash command trigger when input is cleared
  if (!newValue) {
    slashCommandTriggered.value = false
    fileSelectorTriggered.value = false
  }

  if (selectedSkill.value) {
    // If skill is already selected, don't trigger selector again
    return
  }

  // Check for / slash command trigger (only when input is exactly "/" and not triggered before)
  if (newValue === '/' && !slashCommandTriggered.value) {
    slashCommandQuery.value = ''
    slashCommandPopupQuery.value = ''
    selectedCommandIndex.value = 0
    slashCommandTriggered.value = true
    showSlashCommandSelector.value = true
    // Close other selectors
    showSkillSelector.value = false
    showFileSelector.value = false
    nextTick(() => {
      slashCommandFilterInputRef.value?.focus()
    })
    return
  }
  showSlashCommandSelector.value = false
  slashCommandPopupQuery.value = ''

  // Check for # file selector trigger
  const hashIndex = newValue.lastIndexOf('#')
  if (hashIndex !== -1 && props.workspaceFolder) {
    const charBefore = hashIndex > 0 ? newValue[hashIndex - 1] : ' '
    if (charBefore === ' ' || charBefore === '\n' || hashIndex === 0) {
      const textAfterHash = newValue.slice(hashIndex + 1)
      if (!textAfterHash.includes(' ') && !textAfterHash.includes('\n')) {
        fileSelectorQuery.value = textAfterHash
        fileSelectorPopupQuery.value = ''
        selectedFileIndex.value = 0
        showFileSelector.value = true
        // Close other selectors
        showSkillSelector.value = false
        showSlashCommandSelector.value = false
        // Load files if not loaded yet
        if (workspaceFiles.value.length === 0) {
          loadWorkspaceFiles(props.workspaceFolder)
        }
        nextTick(() => {
          fileSelectorFilterInputRef.value?.focus()
        })
        return
      }
    }
  }
  showFileSelector.value = false
  fileSelectorPopupQuery.value = ''

  // Find @ symbol position
  const atIndex = newValue.lastIndexOf('@')
  if (atIndex !== -1) {
    // Check if @ is at start or preceded by whitespace/newline
    const charBefore = atIndex > 0 ? newValue[atIndex - 1] : ' '
    if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
      // Extract query after @
      const textAfterAt = newValue.slice(atIndex + 1)
      // Don't trigger if there's a space after @ (likely an email)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        skillSelectorQuery.value = textAfterAt
        skillSelectorPopupQuery.value = ''  // Reset popup query
        selectedSkillIndex.value = 0
        showSkillSelector.value = true
        // Close other selectors
        showFileSelector.value = false
        showSlashCommandSelector.value = false
        // Focus the filter input after popup opens
        nextTick(() => {
          skillFilterInputRef.value?.focus()
        })
        return
      }
    }
  }
  showSkillSelector.value = false
  skillSelectorPopupQuery.value = ''  // Reset popup query when closing
})

// 文本文件类型定义
interface AttachedFile {
  name: string
  content: string  // 文件内容
  type: string     // 文件 MIME 类型
  size: number     // 文件大小（字节）
}

// 支持的文本文件扩展名
const TEXT_FILE_EXTENSIONS = ['.md', '.json', '.txt', '.csv', '.xml', '.yaml', '.yml', '.log', '.ini', '.cfg', '.conf']

// 图片附件相关
const attachedImages = ref<string[]>([])
// 文本文件附件相关
const attachedFiles = ref<AttachedFile[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// 拖拽状态
const isDragging = ref(false)

// 检查文件是否为支持的文本文件
function isTextFile(file: File): boolean {
  const fileName = file.name.toLowerCase()
  // 检查扩展名
  if (TEXT_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return true
  }
  // 检查 MIME 类型
  if (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml') {
    return true
  }
  // 如果 MIME 类型为空但扩展名看起来像文本文件
  if (!file.type && TEXT_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return true
  }
  return false
}

// 划词引用相关
const quoteToolbarVisible = ref(false)
const quoteToolbarPosition = ref({ x: 0, y: 0 })
const selectedQuoteText = ref('')
const quoteToolbarRef = ref<HTMLDivElement | null>(null)

// 处理文本选择
function handleTextSelection(_event: MouseEvent, _messageIndex: number, _role: 'user' | 'assistant') {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    quoteToolbarVisible.value = false
    return
  }

  const selectedText = selection.toString().trim()
  if (!selectedText) {
    quoteToolbarVisible.value = false
    return
  }

  // 获取选区的位置
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  // 计算工具栏位置（选区上方居中）
  const toolbarWidth = 80 // 工具栏大致宽度
  const x = rect.left + rect.width / 2 - toolbarWidth / 2
  const y = rect.top - 8 // 选区上方8px

  selectedQuoteText.value = selectedText
  quoteToolbarPosition.value = { x, y }
  quoteToolbarVisible.value = true
}

// 插入引用到输入框
function insertQuote() {
  if (!selectedQuoteText.value) return

  const quoteText = `> ${selectedQuoteText.value}\n\n`

  // 在当前输入框内容后添加引用
  const currentInput = props.input
  const newInput = currentInput ? `${currentInput}\n${quoteText}` : quoteText

  emit('update:input', newInput)

  // 隐藏工具栏
  quoteToolbarVisible.value = false

  // 清除选择
  window.getSelection()?.removeAllRanges()

  // 聚焦到输入框
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

// 点击其他地方隐藏引用工具栏
function handleDocumentClick(event: MouseEvent) {
  if (!quoteToolbarVisible.value) return

  const target = event.target as Node

  // 如果点击在工具栏内，不隐藏
  if (quoteToolbarRef.value && quoteToolbarRef.value.contains(target)) {
    return
  }

  // 如果点击在消息气泡内，不隐藏（用户可能正在选择文本）
  if (target instanceof Element && target.closest('.msg-bubble')) {
    return
  }

  quoteToolbarVisible.value = false
}

// 选择图片
function handleSelectImages() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理图片选择
function handleImageSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files) return

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result && !attachedImages.value.includes(result)) {
        attachedImages.value.push(result)
      }
    }
    reader.readAsDataURL(file)
  }

  // 清空 input 以便再次选择相同文件
  target.value = ''
}

// 处理粘贴事件（支持粘贴图片和文本文件）
function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()

      const file = item.getAsFile()
      if (!file) continue

      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (result && !attachedImages.value.includes(result)) {
          attachedImages.value.push(result)
        }
      }
      reader.readAsDataURL(file)
    } else if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file && isTextFile(file)) {
        event.preventDefault()
        processTextFile(file)
      }
    }
  }
}

// 处理拖拽进入
function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

// 处理拖拽悬停
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

// 处理拖拽离开
function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  // 检查是否真的离开了输入区域
  const relatedTarget = event.relatedTarget as Node
  const currentTarget = event.currentTarget as Node
  if (relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  isDragging.value = false
}

// 处理文件放下
function handleDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      // 处理图片
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (result && !attachedImages.value.includes(result)) {
          attachedImages.value.push(result)
        }
      }
      reader.readAsDataURL(file)
    } else if (isTextFile(file)) {
      // 处理文本文件
      processTextFile(file)
    }
  }
}

// 处理文本文件
function processTextFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content) {
      // 检查是否已存在同名文件
      if (!attachedFiles.value.some(f => f.name === file.name)) {
        attachedFiles.value.push({
          name: file.name,
          content: content,
          type: file.type || 'text/plain',
          size: file.size
        })
      }
    }
  }
  reader.onerror = () => {
    console.error(`Failed to read file: ${file.name}`)
  }
  reader.readAsText(file)
}

// 移除图片
function removeImage(index: number) {
  attachedImages.value.splice(index, 1)
}

// 移除文本文件
function removeFile(index: number) {
  attachedFiles.value.splice(index, 1)
}

// 清空所有图片
function clearImages() {
  attachedImages.value = []
}

// 清空所有文本文件
function clearFiles() {
  attachedFiles.value = []
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 图片预览对话框
const showImagePreview = ref(false)
const previewImageUrl = ref('')

function openImagePreview(url: string) {
  previewImageUrl.value = url
  showImagePreview.value = true
}

function closeImagePreview() {
  showImagePreview.value = false
  previewImageUrl.value = ''
}

// 文件展开状态跟踪（按消息索引和文件索引）
const expandedFiles = ref<Record<string, boolean>>({})

// 切换文件展开/折叠状态
function toggleFileExpanded(messageIndex: number, fileIndex: number) {
  const key = `${messageIndex}-${fileIndex}`
  expandedFiles.value[key] = !expandedFiles.value[key]
}

// 检查文件是否展开
function isFileExpanded(messageIndex: number, fileIndex: number): boolean {
  return expandedFiles.value[`${messageIndex}-${fileIndex}`] ?? false
}

// 获取显示用的消息文本（如果有文件，只显示原始用户输入部分）
function getDisplayContent(message: Message, _messageIndex: number): string {
  if (message.files && message.files.length > 0) {
    // 如果有文件，需要从 content 中提取原始文本部分
    // content 的格式是: 原始文本 + "\n\n---\n**文件: xxx**\n```..."
    const content = getContentAsString(message.content)
    const separatorIndex = content.indexOf('\n\n---\n**文件:')
    if (separatorIndex !== -1) {
      return content.substring(0, separatorIndex).trim()
    }
  }
  return getContentAsString(message.content)
}

// 获取消息内容的字符串形式
function getContentAsString(content: MessageContent): string {
  if (typeof content === 'string') return content
  // 如果是数组，提取所有文本内容
  return content
    .filter((item): item is TextContent => item.type === 'text')
    .map(item => item.text)
    .join('')
}

// 检测消息是否为错误消息
function isErrorMessage(message: Message): boolean {
  if (message.isError) return true
  // 检测内容是否包含错误标识
  const contentStr = getContentAsString(message.content)
  const errorPrefixes = ['对话失败', '任务执行失败', 'API 请求失败', 'API request failed', 'Maximum context length', 'context length', 'tokens']
  return errorPrefixes.some(prefix => contentStr.includes(prefix))
}

// Refs
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputbarRef = ref<HTMLFormElement | null>(null)
const autoScrollEnabled = ref(true)
const userHasScrolledUp = ref(false)  // 用户是否主动向上滚动
const showNavList = ref(false)

// 动态计算 messages 区域高度
function updateMessagesHeight() {
  nextTick(() => {
    const messagesEl = messagesRef.value
    const inputbarEl = inputbarRef.value
    const chatTabBarEl = document.getElementById('chat-tab-bar_')

    if (messagesEl && inputbarEl && chatTabBarEl) {
      const inputbarHeight = inputbarEl.offsetHeight
      const chatTabBarHeight = chatTabBarEl.offsetHeight
      messagesEl.style.height = `calc(100vh - ${inputbarHeight}px - ${chatTabBarHeight}px)`
    }
  })
}

// ResizeObserver 监听 inputbar 高度变化
let resizeObserver: ResizeObserver | null = null
const reasoningExpanded = ref<Record<number, boolean>>({})
const reasoningStartTime = ref<Record<number, number>>({})
const toolResultExpanded = ref<Record<number, boolean>>({})
const copyStatus = ref<Record<number, { text?: boolean; md?: boolean; html?: boolean }>>({})

// 获取工具名称（优先使用 toolName 字段，否则从 tool_calls 中查找）
function getToolName(message: Message, messages: Message[]): string {
  if (!message.tool_call_id) return ''

  // 优先使用消息中的 toolName 字段（Team Mode 中直接设置）
  if ((message as any).toolName) {
    return (message as any).toolName
  }

  // 向前查找包含 tool_calls 的 assistant 消息
  for (let i = messages.indexOf(message) - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls.find((tc: any) => tc.id === message.tool_call_id)
      if (toolCall) {
        // 优先使用别名（alias），其次使用工具名称
        return toolCall.function?.alias || toolCall.function?.name || ''
      }
    }
  }

  return ''
}

// 切换工具结果展开状态
function toggleToolResult(index: number) {
  toolResultExpanded.value[index] = !toolResultExpanded.value[index]
}

// 复制工具结果
async function copyToolResult(content: string) {
  await copyText(content)
}

// 格式化工具结果显示（尝试解析 JSON）
function formatToolResult(content: string): { isJson: boolean; formatted: string; html?: string } {
  try {
    const parsed = JSON.parse(content)
    const formatted = JSON.stringify(parsed, null, 2)
    // 添加 JSON 语法高亮
    const highlighted = formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(?:u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
        let cls = 'json-string'
        if (/:$/.test(match)) {
          cls = 'json-key'
        }
        return `<span class="${cls}">${match}</span>`
      })
      .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>')
    return {
      isJson: true,
      formatted,
      html: highlighted
    }
  } catch {
    return {
      isJson: false,
      formatted: content
    }
  }
}

// Markdown renderer
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: function (str: string, lang?: string): string {
    const language = lang || 'plaintext'
    if (lang && !hljs.getLanguage(lang)) {
      return md.utils.escapeHtml(str)
    }
    try {
      return hljs.highlight(str, { language }).value
    } catch {
      return md.utils.escapeHtml(str)
    }
  },
}).use(katex, { throwOnError: false, errorColor: ' #cc0000' })

// Custom code block renderer with copy button
md.renderer.rules.fence = (tokens: Token[], idx: number) => {
  const token = tokens[idx]
  if (!token) return ''

  const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
  const lang = info ? info.split(/\s+/g)[0] : ''
  const rawCode = token.content // 保存原始代码
  let code = rawCode

  if (lang && hljs.getLanguage(lang)) {
    try {
      code = hljs.highlight(code, { language: lang }).value
    } catch {
      code = md.utils.escapeHtml(code)
    }
  } else {
    code = md.utils.escapeHtml(code)
  }

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

// Functions
function handleMessagesScroll() {
  const el = messagesRef.value
  if (!el) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  // 当用户手动滚动到距离底部 > 80px 时，认为用户主动向上滚动
  const wasAtBottom = distanceToBottom <= 80
  userHasScrolledUp.value = !wasAtBottom
  autoScrollEnabled.value = wasAtBottom
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
    return true
  } catch (err) {
    console.error('Failed to copy:', err)
    alert('复制失败')
    return false
  }
}

async function copyRenderedText(content: string) {
  const rendered = render(content)
  return copyText(stripHtml(rendered))
}

async function copyMarkdown(content: string) {
  return copyText(content)
}

function handleCopyText(m: any, i: number) {
  copyRenderedText(m.content).then((success) => {
    if (success) {
      copyStatus.value[i] = { ...copyStatus.value[i], text: true }
      setTimeout(() => {
        copyStatus.value[i] = { ...copyStatus.value[i], text: false }
      }, 2000)
    }
  })
}

function handleCopyMarkdown(m: any, i: number) {
  copyMarkdown(m.content).then((success) => {
    if (success) {
      copyStatus.value[i] = { ...copyStatus.value[i], md: true }
      setTimeout(() => {
        copyStatus.value[i] = { ...copyStatus.value[i], md: false }
      }, 2000)
    }
  })
}

function handleExportHtml(m: any, i: number) {
  const content = getContentAsString(m.content)
  const htmlContent = render(content)
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Message</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
    code { font-family: 'SF Mono', Monaco, 'Andale Mono', monospace; font-size: 14px; }
    blockquote { border-left: 4px solid #007aff; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `message-${Date.now()}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  copyStatus.value[i] = { ...copyStatus.value[i], html: true }
  setTimeout(() => {
    copyStatus.value[i] = { ...copyStatus.value[i], html: false }
  }, 2000)
}

function toggleReasoning(index: number) {
  reasoningExpanded.value[index] = !reasoningExpanded.value[index]
  emit('toggle-reasoning', index)
}

// Navigation list computed
const navItems = computed(() => {
  return props.messages
    .map((m, originalIndex) => ({ m, originalIndex }))
    .filter(({ m }) => m.visible !== false && m.role !== 'tool')
    .map(({ m, originalIndex }) => {
      const content = getContentAsString(m.content)
      // 对于 AI 消息，如果 content 为空则使用 reasoning 内容
      let previewContent = content
      if (m.role === 'assistant' && !content.trim()) {
        previewContent = (m.reasoning || '').trim()
      }
      const preview = previewContent.slice(0, 50) + (previewContent.length > 50 ? '...' : '')
      return {
        index: originalIndex,
        role: m.role,
        preview
      }
    })
    // 如果 preview 为空（content 和 reasoning 都为空），则不显示在导航中
    .filter(({ preview }) => preview.trim())
})

function scrollToMessage(index: number) {
  const el = messagesRef.value
  if (!el) return

  const messageEl = el.querySelector(`#msg-${index}`)
  if (messageEl) {
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    showNavList.value = false
  }
}

// 删除消息（包括该消息之后的后续内容以及相关的 tool 消息）
function deleteMessage(index: number, event: Event) {
  event.stopPropagation()  // 阻止触发 scrollToMessage
  pendingDeleteIndex.value = index
  showDeleteConfirmDialog.value = true
}

// 确认删除消息
function confirmDeleteMessage() {
  if (pendingDeleteIndex.value !== null) {
    emit('delete-message', pendingDeleteIndex.value)
    pendingDeleteIndex.value = null
  }
  showDeleteConfirmDialog.value = false
  showNavList.value = false
}

// 取消删除
function cancelDeleteMessage() {
  pendingDeleteIndex.value = null
  showDeleteConfirmDialog.value = false
}

function getMessagePreview(content: string, maxLength: number = 50): string {
  const text = typeof content === 'string' ? content : ''
  // Strip markdown for preview
  const stripped = text.replace(/[#*`_\[\]]/g, '').replace(/\n/g, ' ')
  return stripped.slice(0, maxLength) + (stripped.length > maxLength ? '...' : '')
}

function handleSend(e: Event) {
  e.preventDefault()

  // 如果技能选择器打开，不发送消息（让 handleKeydown 处理）
  if (showSkillSelector.value) {
    return
  }

  const images = [...attachedImages.value]
  const files = [...attachedFiles.value]

  // If skill is selected, emit with skill prefix
  const skill = selectedSkill.value
  const message = props.input.trim()
  if (skill && message) {
    emit('update:input', `使用 ${skill} 技能：${message}`)
  }

  emit('send', images, files)
  // 发送后清空图片、文件和选中的技能
  clearImages()
  clearFiles()
  selectedSkill.value = null
}

function handleCancel() {
  emit('cancel')
}

function handleUpdateInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:input', target.value)
}

// Handle keyboard navigation in skill selector and slash command selector
function handleKeydown(e: KeyboardEvent) {
  // Handle slash command selector
  if (showSlashCommandSelector.value) {
    const commands = filteredSlashCommands.value

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedCommandIndex.value = Math.min(selectedCommandIndex.value + 1, commands.length - 1)
      scrollCommandIntoView()
      return
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedCommandIndex.value = Math.max(selectedCommandIndex.value - 1, 0)
      scrollCommandIntoView()
      return
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const cmd = commands[selectedCommandIndex.value]
      if (cmd) {
        selectSlashCommand(cmd)
      }
      return
    } else if (e.key === 'Escape') {
      e.preventDefault()
      showSlashCommandSelector.value = false
      return
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const cmd = commands[selectedCommandIndex.value]
      if (cmd) {
        selectSlashCommand(cmd)
      }
      return
    }
    return
  }

  // Handle file selector
  if (showFileSelector.value) {
    const files = filteredFiles.value

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedFileIndex.value = Math.min(selectedFileIndex.value + 1, files.length - 1)
      scrollFileIntoView()
      return
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedFileIndex.value = Math.max(selectedFileIndex.value - 1, 0)
      scrollFileIntoView()
      return
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const file = files[selectedFileIndex.value]
      if (file) {
        selectFile(file)
      }
      return
    } else if (e.key === 'Escape') {
      e.preventDefault()
      showFileSelector.value = false
      return
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const file = files[selectedFileIndex.value]
      if (file) {
        selectFile(file)
      }
      return
    }
    return
  }

  // Handle skill selector
  if (!showSkillSelector.value) {
    return
  }

  const skills = filteredSkills.value

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedSkillIndex.value = Math.min(selectedSkillIndex.value + 1, skills.length - 1)
    scrollSkillIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedSkillIndex.value = Math.max(selectedSkillIndex.value - 1, 0)
    scrollSkillIntoView()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    const skill = skills[selectedSkillIndex.value]
    if (skill) {
      selectSkill(skill)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    showSkillSelector.value = false
  } else if (e.key === 'Tab') {
    e.preventDefault()
    const skill = skills[selectedSkillIndex.value]
    if (skill) {
      selectSkill(skill)
    }
  }
}

// Scroll selected skill item into view
function scrollSkillIntoView() {
  nextTick(() => {
    const selectedEl = document.querySelector('.skill-item.selected')
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

// Scroll selected command item into view
function scrollCommandIntoView() {
  nextTick(() => {
    const selectedEl = document.querySelector('.slash-command-item.selected')
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

// Scroll selected file item into view
function scrollFileIntoView() {
  nextTick(() => {
    const selectedEl = document.querySelector('.file-item.selected')
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

// Select a skill and update input
function selectSkill(skill: { name: string; description?: string }) {
  const currentValue = props.input
  const atIndex = currentValue.lastIndexOf('@')
  if (atIndex !== -1) {
    // Remove the @query part and add skill prefix
    const beforeAt = currentValue.slice(0, atIndex)
    const newInput = beforeAt.trim()
    selectedSkill.value = skill.name
    emit('update:input', newInput)
    showSkillSelector.value = false

    // Focus back to textarea
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
}

// Select a slash command and update input
function selectSlashCommand(cmd: SlashCommand) {
  // Replace the current input with the command usage template
  emit('update:input', cmd.usage)
  showSlashCommandSelector.value = false

  // Focus back to textarea
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

// Select a file and insert reference
async function selectFile(file: FileItem) {
  const currentValue = props.input
  const hashIndex = currentValue.lastIndexOf('#')
  if (hashIndex !== -1) {
    // Remove the #query part and add file reference
    const beforeHash = currentValue.slice(0, hashIndex)
    // 获取相对于工作空间的相对路径
    const relativePath = getRelativePath(file.path)

    // 在新行添加文件引用
    const newInput = beforeHash.trim() + `\n\n文件: ${relativePath}\n`
    emit('update:input', newInput)
    showFileSelector.value = false

    // Focus back to textarea
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
}

// Get relative path from workspace folder
function getRelativePath(fullPath: string): string {
  const workspacePath = props.workspaceFolder || ''
  if (workspacePath && fullPath.startsWith(workspacePath)) {
    return fullPath.slice(workspacePath.length + 1)  // +1 to remove leading slash
  }
  return fullPath
}

function openParamsDialog() {
  emit('open-params-dialog')
}

function changeAssistant(e: Event) {
  const target = e.target as HTMLSelectElement
  emit('change-assistant', target.value)
}

function changeConfig(e: Event) {
  const target = e.target as HTMLSelectElement
  emit('change-config', target.value)
}

// 处理助手和模型选择变化
function handleAssistantChange(e: Event) {
  changeAssistant(e)
}

function handleConfigChange(e: Event) {
  changeConfig(e)
}

// 计算当前助手名称
const currentAssistantName = computed(() => {
  const assistantId = props.currentChat?.assistantId
  if (!assistantId) return '默认助手'
  const assistant = props.assistantList.assistants.find((a: any) => a.id === assistantId)
  return assistant?.name || '默认助手'
})

// 计算当前模型名称
const currentConfigName = computed(() => {
  const configId = props.currentChat?.configId
  if (configId === undefined || configId === null || configId === '') return '默认'
  const config = props.configList.configs[configId]
  return config?.name || config?.model || '默认'
})

// =============================================

// HTML预览功能
function openHtmlPreview(base64Code: string) {
  // 使用UTF-8解码
  const utf8Bytes = atob(base64Code)
  const htmlCode = decodeURIComponent(utf8Bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  htmlPreviewContent.value = htmlCode
  showHtmlPreview.value = true
}

// Mermaid预览功能
function openMermaidPreview(base64Code: string) {
  // 使用UTF-8解码
  const utf8Bytes = atob(base64Code)
  const mermaidCode = decodeURIComponent(utf8Bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  mermaidPreviewContent.value = mermaidCode
  showMermaidPreview.value = true
}

// 点击外部关闭技能选择器
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 关闭技能选择器（点击技能选择器外部时）
  if (!target.closest('.skill-selector-popup') && !target.closest('.textarea')) {
    showSkillSelector.value = false
  }
  // 关闭斜杠命令选择器（点击斜杠命令选择器外部时）
  if (!target.closest('.slash-command-selector-popup') && !target.closest('.textarea')) {
    showSlashCommandSelector.value = false
  }
  // 关闭文件选择器（点击文件选择器外部时）
  if (!target.closest('.file-selector-popup') && !target.closest('.textarea')) {
    showFileSelector.value = false
  }
}

// 组件挂载时设置全局函数，卸载时清理
onMounted(async () => {
  ;(window as any).previewHtml = function (btn: HTMLElement) {
    const base64Code = btn.getAttribute('data-html-code') || ''
    openHtmlPreview(base64Code)
  }
  ;(window as any).previewMermaid = function (btn: HTMLElement) {
    const base64Code = btn.getAttribute('data-mermaid-code') || ''
    openMermaidPreview(base64Code)
  }
  // 加载技能列表
  await skillsManager.loadRegistry()
  // 添加点击外部关闭弹出框的事件监听
  document.addEventListener('click', handleClickOutside)
  // 添加点击隐藏引用工具栏的事件监听
  document.addEventListener('click', handleDocumentClick)

  // 初始化高度计算
  updateMessagesHeight()

  // 监听 inputbar 高度变化
  const inputbarEl = inputbarRef.value
  if (inputbarEl) {
    resizeObserver = new ResizeObserver(() => {
      updateMessagesHeight()
    })
    resizeObserver.observe(inputbarEl)
  }

  // 监听窗口大小变化
  window.addEventListener('resize', updateMessagesHeight)
})

onUnmounted(() => {
  delete (window as any).previewHtml
  delete (window as any).previewMermaid
  // 移除事件监听
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('resize', updateMessagesHeight)

  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// 链接点击处理
async function handleLinkClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const anchor = target.closest('a')
  if (anchor) {
    e.preventDefault()
    const href = anchor.getAttribute('href')
    if (href && window.electronAPI?.openExternal) {
      try {
        await window.electronAPI.openExternal(href)
      } catch (err) {
        console.error('Failed to open external URL:', err)
      }
    }
  }
}

// 根据 apiUrl 获取提供商 ID
function getProviderIdByApiUrl(apiUrl: string): string {
  if (!apiUrl) return 'custom'
  const provider = LLM_PROVIDERS.find(p => p.apiUrl === apiUrl)
  return provider?.id || 'custom'
}

// 格式化 token 数量显示
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

// Expose functions for parent component
defineExpose({
  scrollToBottom: () => {
    // 如果用户主动向上滚动，则停止自动跟随
    if (userHasScrolledUp.value) return
    const el = messagesRef.value
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  },
  resetUserScroll: () => {
    // 重置用户滚动状态，允许新的 AI 响应自动滚动
    userHasScrolledUp.value = false
    autoScrollEnabled.value = true
  },
  autoResizeTextarea,
  setReasoningExpanded: (index: number, value: boolean) => {
    reasoningExpanded.value[index] = value
  },
  setReasoningStartTime: (index: number, value: number) => {
    reasoningStartTime.value[index] = value
  },
  getReasoningExpanded: (index: number) => reasoningExpanded.value[index],
  getReasoningStartTime: (index: number) => reasoningStartTime.value[index],
})

// Scroll to bottom button handler
function scrollToBottom() {
  const el = messagesRef.value
  if (!el) return
  el.scrollTo({
    top: el.scrollHeight,
    behavior: 'smooth'
  })
  // 重置用户滚动状态
  userHasScrolledUp.value = false
  autoScrollEnabled.value = true
}
</script>

<template>
  <main class="main">
    <!-- Scroll to bottom button -->
    <Transition name="fade">
      <button
        v-if="userHasScrolledUp"
        class="scroll-to-bottom-btn"
        @click="scrollToBottom"
        title="滚动到底部"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <polyline points="19 12 12 19 5 12"></polyline>
        </svg>
      </button>
    </Transition>
    <!-- 引用工具栏 -->
    <Teleport to="body">
      <Transition name="quote-toolbar">
        <div
          v-if="quoteToolbarVisible"
          ref="quoteToolbarRef"
          class="quote-toolbar"
          :style="{ left: quoteToolbarPosition.x + 'px', top: quoteToolbarPosition.y + 'px' }"
        >
          <button class="quote-btn" @click="insertQuote" title="引用选中的文本">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21c0 1 0 1 1 1z"/>
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
            <span>引用</span>
          </button>
        </div>
      </Transition>
    </Teleport>
    <div id="messages_dev" class="messages" ref="messagesRef" @scroll="handleMessagesScroll" @click="handleLinkClick">
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-hero">
          <h2 class="welcome-title">GrapWork</h2>
          <p class="welcome-subtitle">您好，我能帮您做什么？</p>
        </div>

        <div class="welcome-features">
          <div class="feature-card">
            <div class="feature-icon task-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <h3>文献研读</h3>
            <p>精读文献，提取核心论点与研究方法</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <h3>写作辅助</h3>
            <p>协助撰写论文、摘要与研究报告</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon memory-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a10 10 0 1010 10H12V2z"/>
                <path d="M12 2a10 10 0 00-8.66 15"/>
                <circle cx="12" cy="12" r="6"/>
              </svg>
            </div>
            <h3>数据分析</h3>
            <p>统计解读、实验结果分析与图表生成</p>
          </div>
          <div class="feature-card" @click="openImageGenerator" style="cursor: pointer;">
            <div class="feature-icon image-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <h3>学术绘图</h3>
            <p>一键生成图表，辅助研究可视化</p>
          </div>
        </div>

        <div class="welcome-prompts">
          <p class="prompts-label">常用学术查询示例</p>
          <div class="prompts-grid">
            <button class="prompt-card" @click="emit('update:input', '帮我撰写这篇文献的摘要')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <span class="prompt-text">帮我撰写这篇文献的摘要</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '整理这篇文献的核心论点与贡献')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span class="prompt-text">整理这篇文献的核心论点与贡献</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '润色这段学术文本，使其更加正式')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <span class="prompt-text">润色这段学术文本，使其更加正式</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '解释这组实验数据的统计意义')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              <span class="prompt-text">解释这组实验数据的统计意义</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '帮我拟定一份研究计划提纲')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="12" y1="14" x2="16" y2="14"/>
                <line x1="12" y1="18" x2="16" y2="18"/>
              </svg>
              <span class="prompt-text">帮我拟定一份研究计划提纲</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '按 APA 格式生成参考文献列表')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span class="prompt-text">按 APA 格式生成参考文献列表</span>
            </button>
          </div>
        </div>
      </div>
      <template v-for="(m, i) in messages" :key="i">
        <!-- 工具调用结果消息 -->
        <div v-if="m.visible !== false && m.role === 'tool'" class="msg-row tool">
          <div class="msg-content">
            <div class="tool-result-card">
              <div class="tool-result-header" @click="toggleToolResult(i)">
                <div class="tool-result-title">
                  <span class="tool-result-name">{{ getToolName(m, messages) }}</span>
                  <!-- 执行中状态（动态短语） -->
                  <span v-if="m.toolStatus === 'running'" class="tool-result-status status-running">
                    <span class="status-spinner"></span>
                    <span class="status-text">{{ m.runningPhrase || '正在处理' }}</span>
                  </span>
                  <!-- 成功状态 -->
                  <span v-else-if="m.toolStatus === 'success'" class="tool-result-status status-success">
                    <span class="status-icon status-icon-success"><CheckIcon :size="12" /></span>
                    <span class="status-text">已完成</span>
                  </span>
                  <!-- 错误状态 -->
                  <span v-else-if="m.toolStatus === 'error'" class="tool-result-status status-error">
                    <span class="status-icon status-icon-error"><XIcon :size="12" /></span>
                    <span class="status-text">执行失败</span>
                  </span>
                  <!-- 默认成功状态（向后兼容） -->
                  <span v-else class="tool-result-status status-success">
                    <span class="status-icon status-icon-success"><CheckIcon :size="12" /></span>
                    <span class="status-text">已完成</span>
                  </span>
                </div>
                <div class="tool-result-actions">
                  <button class="tool-action-btn" title="复制结果" @click.stop="copyToolResult(getContentAsString(m.content))">
                    <CopyIcon :size="14" />
                  </button>
                  <span class="expand-icon"><ChevronDownIcon v-if="toolResultExpanded[i]" :size="10" /><ChevronRightIcon v-else :size="10" /></span>
                </div>
              </div>
              <div v-show="toolResultExpanded[i]" class="tool-result-body">
                <pre class="tool-result-code"><code v-if="formatToolResult(getContentAsString(m.content)).html" v-html="formatToolResult(getContentAsString(m.content)).html"></code><code v-else>{{ formatToolResult(getContentAsString(m.content)).formatted }}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- 普通消息 -->
        <div
          v-else-if="m.visible !== false"
          :id="`msg-${i}`"
          :class="['msg-row', m.role, { 'error-message': isErrorMessage(m) }]"
        >
          <div class="msg-content">
            <div v-if="m.reasoning || (sending && i === messages.length - 1 && m.role === 'assistant')" class="reasoning-section">
              <button class="reasoning-toggle" @click="toggleReasoning(i)">
                <ChevronDownIcon v-if="reasoningExpanded[i]" :size="10" />
                <ChevronRightIcon v-else :size="10" />
                <span v-if="sending && i === messages.length - 1 && m.role === 'assistant'" class="grape-spinner">
                  <GrapeIcon :size="16" />
                </span>
                <span>分析过程</span>
              </button>
              <div v-show="reasoningExpanded[i] && m.reasoning" class="msg-reasoning-bubble" v-html="render(m.reasoning || '')" />
            </div>
            <!-- AI 消息提供商图标 -->
            <div v-if="m.role === 'assistant'" class="assistant-header">
              <LLMProviderIcon :provider="getProviderIdByApiUrl(activeConfig?.apiUrl)" :size="20" />
              <span class="assistant-provider-name">{{ activeConfig?.name || 'AI' }}</span>
            </div>
            <div class="msg-bubble-wrapper">
              <!-- 用户消息图片预览 -->
              <div v-if="m.role === 'user' && m.images && m.images.length > 0" class="message-images">
                <img v-for="(img, imgIndex) in m.images" :key="imgIndex" :src="img" class="message-image clickable" @click="openImagePreview(img)" />
              </div>
              <!-- 用户消息文件预览（折叠卡片） -->
              <div v-if="m.role === 'user' && m.files && m.files.length > 0" class="message-files">
                <div v-for="(file, fileIndex) in m.files" :key="fileIndex" class="message-file-card">
                  <div class="file-card-header" @click="toggleFileExpanded(i, fileIndex)">
                    <div class="file-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div class="file-card-info">
                      <span class="file-card-name">{{ file.name }}</span>
                      <span class="file-card-size">{{ formatFileSize(file.size) }}</span>
                    </div>
                    <svg
                      class="file-card-chevron"
                      :class="{ expanded: isFileExpanded(i, fileIndex) }"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="16"
                      height="16"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                  <div v-if="isFileExpanded(i, fileIndex)" class="file-card-content">
                    <pre><code>{{ file.content }}</code></pre>
                  </div>
                </div>
              </div>
              <!-- 渲染输出内容 -->
              <div class="msg-bubble" v-html="render(m.files && m.files.length > 0 ? getDisplayContent(m, i) : getContentAsString(m.content))" @mouseup="(e) => handleTextSelection(e, i, m.role as 'user' | 'assistant')" />
              <div class="msg-actions" v-if="m.copyable !== false">
                <!-- 重试按钮：仅在错误消息时显示 -->
                <button v-if="isErrorMessage(m) && m.role === 'assistant'" class="retry-btn" @click="emit('retry-message', i)" title="重试">
                  重试
                </button>
                <button class="copy-btn" :class="{ 'copy-success': copyStatus[i]?.html }" @click="handleExportHtml(m, i)" title="导出 HTML">
                  <span v-if="copyStatus[i]?.html" class="success-icon">✓</span>
                  <span v-else>Export HTML</span>
                </button>
                <button class="copy-btn" :class="{ 'copy-success': copyStatus[i]?.text }" @click="handleCopyText(m, i)" title="复制文本">
                  <span v-if="copyStatus[i]?.text" class="success-icon">✓</span>
                  <span v-else>Copy Text</span>
                </button>
                <button class="copy-btn" :class="{ 'copy-success': copyStatus[i]?.md }" @click="handleCopyMarkdown(m, i)" title="复制 Markdown">
                  <span v-if="copyStatus[i]?.md" class="success-icon">✓</span>
                  <span v-else>Copy Markdown</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <form id="inputbar_form" ref="inputbarRef" class="inputbar" @submit.prevent="handleSend">
      <div class="model-bar">
        <!-- Token 使用统计显示 -->
        <div v-if="usage && usage.totalTokens > 0" class="token-stats" :title="`输入: ${usage.promptTokens} | 输出: ${usage.completionTokens}`">
          <span class="token-label">Tokens:</span>
          <span class="token-value">{{ formatTokenCount(usage.totalTokens) }}</span>
          <span class="token-detail">({{ formatTokenCount(usage.promptTokens) }} → {{ formatTokenCount(usage.completionTokens) }})</span>
        </div>
      </div>

      <div
        class="composer"
        :class="{ 'drag-over': isDragging }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <!-- Selected skill indicator -->
        <div v-if="selectedSkill" class="selected-skill-indicator">
          <span>使用 {{ selectedSkill }} 技能</span>
          <button type="button" @click="selectedSkill = null" title="取消选择技能">
            <XIcon :size="12" />
          </button>
        </div>
        <!-- 隐藏的文件选择输入框 -->
        <input
          type="file"
          ref="fileInputRef"
          accept="image/*"
          multiple
          style="display: none"
          @change="handleImageSelect"
        />
        <textarea
          :value="input"
          class="textarea"
          :placeholder="'输入消息（@ 技能 / 命令 # 文件引用），回车发送，Shift+Enter 换行（支持粘贴/拖入图片和文本文件）'"
          @keydown.enter.exact.prevent="handleSend"
          @keydown="handleKeydown"
          @input="handleUpdateInput"
          @paste="handlePaste"
          ref="textareaRef"
        />
        <!-- 拖拽提示遮罩 -->
        <div v-if="isDragging" class="drag-overlay">
          <div class="drag-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>拖放图片或文本文件到此处</span>
          </div>
        </div>
        <!-- Skill Selector Popup -->
        <Transition name="skill-selector">
          <div v-if="showSkillSelector" class="skill-selector-popup">
            <div class="skill-selector-header">
              <span class="skill-selector-title">选择技能</span>
              <span class="skill-selector-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
            </div>
            <div class="skill-selector-filter">
              <input
                type="text"
                v-model="skillSelectorPopupQuery"
                class="skill-filter-input"
                placeholder="搜索技能..."
                ref="skillFilterInputRef"
                @keydown="handleFilterKeydown"
              />
            </div>
            <div class="skill-selector-list" v-if="filteredSkills.length > 0">
              <button
                v-for="(skill, index) in filteredSkills"
                :key="skill.id"
                type="button"
                class="skill-item"
                :class="{ selected: index === selectedSkillIndex }"
                @click="selectSkill(skill)"
                @mouseenter="selectedSkillIndex = index"
              >
                <span class="skill-name">{{ skill.name }}</span>
                <span class="skill-desc">{{ skill.description }}</span>
              </button>
            </div>
            <div v-else class="skill-selector-empty">
              <span>没有找到匹配的技能</span>
            </div>
          </div>
        </Transition>
        <!-- Slash Command Selector Popup -->
        <Transition name="skill-selector">
          <div v-if="showSlashCommandSelector" class="slash-command-selector-popup">
            <div class="slash-command-selector-header">
              <span class="slash-command-selector-title">斜杠命令</span>
              <span class="slash-command-selector-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
            </div>
            <div class="slash-command-selector-filter">
              <input
                type="text"
                v-model="slashCommandPopupQuery"
                class="slash-command-filter-input"
                placeholder="搜索命令..."
                ref="slashCommandFilterInputRef"
                @keydown="handleFilterKeydown"
              />
            </div>
            <div class="slash-command-selector-list" v-if="filteredSlashCommands.length > 0">
              <button
                v-for="(cmd, index) in filteredSlashCommands"
                :key="cmd.name"
                type="button"
                class="slash-command-item"
                :class="{ selected: index === selectedCommandIndex }"
                @click="selectSlashCommand(cmd)"
                @mouseenter="selectedCommandIndex = index"
              >
                <span class="slash-command-name">{{ cmd.name }}</span>
                <span class="slash-command-desc">{{ cmd.description }}</span>
                <span class="slash-command-usage">{{ cmd.usage }}</span>
              </button>
            </div>
            <div v-else class="slash-command-selector-empty">
              <span>没有找到匹配的命令</span>
            </div>
          </div>
        </Transition>
        <!-- File Selector Popup (# trigger) -->
        <Transition name="skill-selector">
          <div v-if="showFileSelector" class="file-selector-popup">
            <div class="file-selector-header">
              <span class="file-selector-title">选择文件引用</span>
              <span class="file-selector-hint">↑↓ 选择 · Enter 确认 · Esc 关闭</span>
            </div>
            <div class="file-selector-filter">
              <input
                type="text"
                v-model="fileSelectorPopupQuery"
                class="file-filter-input"
                placeholder="搜索文件..."
                ref="fileSelectorFilterInputRef"
                @keydown="handleFilterKeydown"
              />
            </div>
            <div class="file-selector-list" v-if="filteredFiles.length > 0">
              <button
                v-for="(file, index) in filteredFiles"
                :key="file.path"
                type="button"
                class="file-item"
                :class="{ selected: index === selectedFileIndex }"
                @click="selectFile(file)"
                @mouseenter="selectedFileIndex = index"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="file-item-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span class="file-item-name">{{ file.name }}</span>
                <span class="file-item-path">{{ getRelativePath(file.path) }}</span>
              </button>
            </div>
            <div v-else-if="isLoadingFiles" class="file-selector-loading">
              <span>加载中...</span>
            </div>
            <div v-else class="file-selector-empty">
              <span>{{ workspaceFolder ? '没有找到匹配的文件' : '请先设置工作空间目录' }}</span>
            </div>
          </div>
        </Transition>
        <!-- 图片预览区域 -->
        <div v-if="attachedImages.length > 0" class="image-preview-container">
          <div v-for="(img, index) in attachedImages" :key="index" class="image-preview-item">
            <img :src="img" class="image-preview-thumb" />
            <button type="button" class="image-remove-btn" @click="removeImage(index)" title="移除图片">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <!-- 文本文件预览区域 -->
        <div v-if="attachedFiles.length > 0" class="file-preview-container">
          <div v-for="(file, index) in attachedFiles" :key="index" class="file-preview-item">
            <div class="file-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div class="file-info">
              <span class="file-name" :title="file.name">{{ file.name }}</span>
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
            </div>
            <button type="button" class="file-remove-btn" @click="removeFile(index)" title="移除文件">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <!-- 操作栏 - 单行布局 -->
        <div class="action-bar">
          <!-- 中间：助手和模型选择器 -->
          <div class="settings-wrapper">
            <select
              :disabled="(currentChat?.messages?.length ?? 0) > 0"
              :value="currentChat?.assistantId || ''"
              @change="handleAssistantChange"
              class="inline-select assistant-select"
              :title="currentAssistantName"
            >
              <option value="">默认助手</option>
              <option v-for="assistant in assistantList.assistants" :key="assistant.id" :value="assistant.id">
                {{ assistant.name }}
              </option>
            </select>
            <select :value="currentChat?.configId ?? ''" @change="handleConfigChange" class="inline-select" :title="currentConfigName">
              <option value="">选择模型</option>
              <option v-for="(config, index) in configList.configs" :key="index" :value="index">
                {{ config.name || config.model }}
              </option>
            </select>
          </div>

          <!-- 右侧：操作按钮组 -->
          <div class="action-buttons">
            <!-- 图片上传按钮 -->
            <button
              type="button"
              class="icon-btn image-upload-btn"
              :class="{ active: attachedImages.length > 0 }"
              @click="handleSelectImages"
              :title="attachedImages.length > 0 ? `已选择 ${attachedImages.length} 张图片` : '上传图片'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span v-if="attachedImages.length > 0" class="image-count">{{ attachedImages.length }}</span>
            </button>

            <!-- 思考模式按钮 -->
            <button
              type="button"
              class="thinking-btn"
              :class="{ active: enableThinking }"
              @click="handleThinkingToggle"
              :title="enableThinking ? '已启用思考模式' : '点击启用思考模式'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
              </svg>
            </button>

            <!-- 参数设置按钮 -->
            <button
              type="button"
              class="icon-btn"
              @click="openParamsDialog"
              title="对话参数配置"
              :disabled="!currentChat"
            >
              <SettingsIcon :size="16" />
            </button>

            <!-- 对话导航按钮 -->
            <div class="nav-dropdown-wrapper" v-if="messages.length > 0">
              <button
                type="button"
                class="icon-btn"
                @click="showNavList = !showNavList"
                title="对话导航"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
              <Transition name="dropdown">
                <div v-if="showNavList" class="nav-dropdown">
                  <div class="nav-dropdown-header">
                    <span>对话导航</span>
                    <span class="nav-count">{{ navItems.length }} 条消息</span>
                  </div>
                  <div class="nav-dropdown-list">
                    <button
                      v-for="(item, idx) in navItems"
                      :key="idx"
                      class="nav-item"
                      :class="item.role"
                      @click="scrollToMessage(item.index)"
                    >
                      <span class="nav-role">{{ item.role === 'user' ? '我' : 'AI' }}</span>
                      <span class="nav-preview">{{ getMessagePreview(item.preview) }}</span>
                      <span class="nav-delete" @click="deleteMessage(item.index, $event)" title="删除此消息及后续内容">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              </Transition>
              <!-- 点击外部关闭 -->
              <div v-if="showNavList" class="nav-backdrop" @click="showNavList = false"></div>
            </div>

            <!-- 取消按钮（发送中显示） -->
            <button
              v-if="sending"
              type="button"
              class="icon-btn cancel-btn"
              @click="handleCancel"
              title="取消"
            >
              X
            </button>

            <!-- 发送按钮 -->
            <button
              type="submit"
              class="send-btn"
              :disabled="sending"
              :title="sending ? '发送中...' : '发送'"
            >
              <ArrowUpIcon :size="18" />
            </button>
          </div>
        </div>
      </div>
    </form>

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

    <!-- 图片预览对话框 -->
    <Transition name="modal">
      <div v-if="showImagePreview" class="image-preview-overlay" @click="closeImagePreview">
        <div class="image-preview-dialog" @click.stop>
          <button class="image-preview-close" @click="closeImagePreview" title="关闭">
            <XIcon :size="20" />
          </button>
          <img :src="previewImageUrl" class="image-preview-full" @click.stop />
        </div>
      </div>
    </Transition>

    <!-- 删除消息确认对话框 -->
    <ConfirmDialog
      :show="showDeleteConfirmDialog"
      title="删除消息"
      message="确定要删除这条消息吗？该消息之后的所有内容也将被删除，此操作不可撤销。"
      confirm-text="确认删除"
      cancel-text="取消"
      type="danger"
      @confirm="confirmDeleteMessage"
      @cancel="cancelDeleteMessage"
    />
  </main>
</template>

<style>
/* KaTeX CSS for LaTeX rendering */
@import 'katex/dist/katex.min.css';
</style>

<style scoped>
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.messages {
  background: var(--color-bg-primary);
  overflow: auto;
}

.welcome {
  max-width: 800px;
  margin: 60px auto 0;
  text-align: center;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36px;
}

/* Hero Section */
.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.welcome-logo {
  width: 72px;
  height: 72px;
  animation: float 3s ease-in-out infinite;
}

.welcome-logo svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 4px 12px rgba(16, 163, 127, 0.3));
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.welcome-title {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  color: var(--color-text-primary);
}

.welcome-subtitle {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-secondary);
  font-weight: 400;
}

/* Feature Cards */
.welcome-features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 680px;
}

.feature-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px 16px;
  transition: all 0.2s ease;
  cursor: default;
}

.feature-card:hover {
  border-color: var(--color-border-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.feature-icon svg {
  width: 22px;
  height: 22px;
}

.task-icon {
  background: #1a3a5c;
  color: white;
}

.tool-icon {
  background: #2d5a8e;
  color: white;
}

.memory-icon {
  background: #7c2d12;
  color: white;
}

.image-icon {
  background: #3d6b4f;
  color: white;
}

.feature-card h3 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.feature-card p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

/* Prompt Suggestions */
.welcome-prompts {
  width: 100%;
  max-width: 680px;
}

.prompts-label {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.prompts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.prompt-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.prompt-card:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.prompt-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.prompt-text {
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* Hint */
.welcome-hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(16, 163, 127, 0.1) 0%, rgba(26, 127, 100, 0.08) 100%);
  border: 1px solid rgba(16, 163, 127, 0.2);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.hint-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.hint-highlight {
  color: var(--color-primary);
  font-weight: 600;
  margin: 0 2px;
}

/* Responsive */
@media (max-width: 768px) {
  .welcome {
    margin-top: 24px;
    gap: 24px;
  }

  .welcome-features {
    grid-template-columns: 1fr;
    max-width: 320px;
  }

  .prompts-grid {
    grid-template-columns: 1fr;
  }
}

.msg-row {
  display: flex;
  padding: 20px 0;
  animation: msg-fade-in 0.3s ease-out;
}

@keyframes msg-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.msg-row.assistant {
  background: transparent;
}

.msg-content {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 0 28px;
}

.msg-row.user .msg-content {
  display: flex;
  justify-content: flex-end;
}

/* 错误消息样式 */
.msg-row.error-message {
  
}

.msg-row.error-message .msg-bubble {
  color: var(--color-error-text, #dc2626);
  padding: 12px 16px !important;
  border-radius: 8px;
  border: 1px solid var(--color-error-border, #fecaca);
}

.msg-row.error-message .msg-bubble :deep(code) {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error-text-dark, #b91c1c);
}

.msg-bubble {
  font-size: 15px;
  line-height: 1.65;
  max-width: 720px;
  word-break: break-word;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
}

.msg-reasoning-bubble {
  font-size: 13px;
  line-height: 1.65;
  color: var(--color-text-tertiary);
  max-width: 720px;
  word-break: break-word;
  background: var(--color-bg-tertiary);
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  animation: bubble-fade-in 0.3s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

@keyframes bubble-fade-in {
  from {
    opacity: 0;
    transform: scaleY(0.95);
    transform-origin: top;
  }
  to {
    opacity: 1;
    transform: scaleY(1);
  }
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
  color: var(--color-text-tertiary);
  transition: color 0.2s;
}

.reasoning-toggle:hover {
  color: var(--color-text-secondary);
}

.reasoning-toggle span:first-child {
  font-size: 10px;
}

/* 葡萄滚动动画 */
.grape-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  animation: grape-roll 1.2s ease-in-out infinite;
}

@keyframes grape-roll {
  0% {
    transform: rotate(0deg) translateX(0);
  }
  25% {
    transform: rotate(90deg) translateX(2px);
  }
  50% {
    transform: rotate(180deg) translateX(0);
  }
  75% {
    transform: rotate(270deg) translateX(-2px);
  }
  100% {
    transform: rotate(360deg) translateX(0);
  }
}

.msg-row.user .msg-bubble {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
  border-left: none;
}

.msg-row.assistant .msg-bubble {
  background: transparent;
  padding: 0;
}

.msg-bubble-wrapper {
  position: relative;
}

.msg-row.user .msg-bubble-wrapper {
  max-width: 72%;
}

.assistant-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 2px 0;
}

.assistant-provider-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.msg-row:hover .msg-actions {
  opacity: 1;
  pointer-events: auto;
}

.msg-actions {
  opacity: 0;
  pointer-events: none;
  display: flex;
  flex-direction: row;
  gap: 8px;
  margin-top: 10px;
  justify-content: flex-end;
  transition: opacity 0.2s ease;
}

.copy-btn {
  background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-tertiary) 100%);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.copy-btn:hover {
  background: linear-gradient(135deg, var(--color-bg-tertiary) 0%, var(--color-bg-hover) 100%);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.copy-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.copy-btn.copy-success {
  /* background: linear-gradient(135deg, var(--color-bg-success) 0%, rgba(34, 197, 94, 0.15) 100%); */
  /* border-color: #22c55e;
  color: #16a34a; */
}

.retry-btn {
  background: var(--color-bg-primary);
  border: 1px solid #dc2626;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #dc2626;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #dc2626;
  color: #fff;
}

.retry-btn:active {
  transform: scale(0.98);
}

.dark-mode .copy-btn.copy-success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.15) 100%);
  border-color: #4ade80;
  color: #4ade80;
}

.copy-btn .success-icon {
  font-weight: bold;
  animation: success-pop 0.3s ease-out;
}

.copy-btn.copy-success .success-icon {
  animation: success-pop 0.3s ease-out;
}

@keyframes success-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.msg-bubble :deep(p) {
  margin: 0 0 0.85em 0;
}


.msg-bubble :deep(img) {
    width: 100%;
}

.msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-bubble :deep(h1),
.msg-bubble :deep(h2),
.msg-bubble :deep(h3),
.msg-bubble :deep(h4) {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  margin-top: 1.2em;
  margin-bottom: 0.4em;
}

.msg-bubble :deep(ul),
.msg-bubble :deep(ol) {
  padding-left: 1.6em;
  margin: 0.4em 0 0.85em;
}

.msg-bubble :deep(li) {
  margin-bottom: 0.3em;
}

.msg-bubble :deep(blockquote) {
  margin: 12px 0;
  padding: 10px 14px 10px 18px;
  border-left: 3px solid var(--color-border-hover);
  background: var(--color-bg-secondary);
  border-radius: 0 8px 8px 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.msg-bubble :deep(blockquote p) {
  margin: 0;
}

.msg-bubble :deep(pre) {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  overflow: auto;
  border: 1px solid var(--color-border);
  position: relative;
}

.msg-bubble :deep(.code-copy-btn) {
  position: absolute;
  top: 8px;
  right: 8px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--color-text-secondary);
}

.msg-bubble :deep(.code-copy-btn:hover) {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.msg-bubble :deep(.code-preview-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 3px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  color: #ffffff;
}

.msg-bubble :deep(.code-preview-btn:hover) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.msg-bubble :deep(.code-mermaid-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: #8b5cf6;
  border: 1px solid #8b5cf6;
  border-radius: 3px;
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
  font-family: 'SF Mono', Monaco, 'Andale Mono', "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 13px;
}

/* 链接样式 - 禁用默认行为 */
.msg-bubble :deep(a) {
  color: var(--color-primary);
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
  justify-content: space-between;
  gap: 12px;
}

.controls-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* 设置按钮样式 - 简化版 */
.settings-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 内联选择器样式 */
.inline-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-primary);
  max-width: 140px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.inline-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.inline-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.inline-select.assistant-select {
  /* background: #f0fdf4;
  color: #166534;
  border-color: #86efac; */
}

.inline-select.assistant-select:hover:not(:disabled) {
  /* background: #dcfce7;
  border-color: #22c55e; */
}

.inline-select.assistant-select:focus {
  /* border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); */
}

.token-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  /* background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px; */
  font-size: 12px;
  margin-right: auto;
}

.token-label {
  color: var(--color-text-tertiary);
}

.token-value {
  font-weight: 600;
  color: var(--color-primary);
}

.token-detail {
  color: var(--color-text-tertiary);
  font-size: 11px;
  margin-left: 2px;
}

.composer {
  position: relative;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-tertiary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.textarea {
  flex: 1;
  resize: none;
  padding: 8px 4px;
  border: none;
  background: var(--color-bg-tertiary);
  outline: none;
  font-size: 15px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
  color: var(--color-text-primary);
  overflow-y: auto;
  min-height: 24px;
  max-height: 120px;
  line-height: 1.5;
}

/* 操作栏 - 单行布局 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 操作按钮组 */
.action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 图标按钮 */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.icon-btn:disabled {
  background: var(--color-button-disabled, #ccc);
  cursor: not-allowed;
}

.icon-btn.cancel-btn:hover:not(:disabled) {
  border-color: #ef4444;
  color: #ef4444;
}

/* 发送按钮 - 圆形 */
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-text-primary);
  border: none;
  border-radius: 50%;
  color: var(--color-bg-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
  transform: scale(1.05);
}

.send-btn:disabled {
  background: var(--color-border);
  color: var(--color-text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

/* 思考模式按钮样式 */
.thinking-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all 0.25s ease;
}

.thinking-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-hover);
  color: var(--color-text-secondary);
}

.thinking-btn.active {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%);
  border-color: #fbbf24;
  color: #fbbf24;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
}

.thinking-btn.active:hover {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.25) 0%, rgba(245, 158, 11, 0.15) 100%);
  color: #f59e0b;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.4);
}

.thinking-btn svg {
  width: 18px;
  height: 18px;
}

:deep(hr) {
  border-color: rgba(255, 255, 255, 0);
}

/* 工具结果样式 */
.msg-row.tool {
  padding: 12px 0;
}

.tool-result-card {
  /* background: rgba(247, 247, 248, 0.7); */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  overflow: hidden;
  margin-bottom: 8px;
  max-width: 900px;
  animation: card-slide-in 0.3s ease-out;
}

@keyframes card-slide-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.tool-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.tool-result-header:hover {
  background: var(--color-bg-secondary);
}

.tool-result-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.tool-result-name {
  font-family: 'SF Mono', Monaco, 'Andale Mono', "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* 工具执行状态通用样式 */
.tool-result-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
}

/* 执行中状态 */
.status-running {
  color: #2563eb;
  /* background: #dbeafe; */
}

.status-running .status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #2563eb;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin-smooth 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* 准备中状态 */
.status-pending {
  color: #d97706;
}

.status-pending .status-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #d97706;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin-smooth 1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes spin-smooth {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 成功状态 */
.status-success {
  color: #16a34a;
  /* background: #dcfce7; */
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
}

.status-icon-success {
  background: #22c55e;
  color: white;
}

/* 错误状态 */
.status-error {
  color: #dc2626;
}

.status-icon-error {
  background: #ef4444;
  color: white;
}

.status-text {
  font-weight: 500;
}

.tool-result-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-action-btn {
  background: transparent;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
}

.tool-action-btn:hover {
  opacity: 1;
}

.expand-icon {
  font-size: 10px;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}

.tool-result-body {
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  max-height: 200px;
  overflow: auto;
}

.tool-result-code {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  font-family: 'SF Mono', Monaco, 'Andale Mono', "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* JSON 语法高亮 */
.tool-result-code code {
  color: var(--color-text-primary);
}

.tool-result-code .json-key {
  color: #9333ea; /* 紫色 - 键名 */
}

.tool-result-code .json-string {
  color: var(--color-primary); /* 绿色 - 字符串值 */
}

.tool-result-code .json-boolean {
  color: #eab308; /* 黄色 - 布尔值和 null */
}

.tool-result-code .json-number {
  color: #3b82f6; /* 蓝色 - 数字 */
}

/* 文件夹对话框样式 */
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
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding-top: 8px;
}

/* Navigation Dropdown */
.nav-dropdown-wrapper {
  position: relative;
}

.nav-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  width: 280px;
  max-height: 320px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.nav-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
}

.nav-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.nav-dropdown-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.nav-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.nav-item:hover {
  background: var(--color-bg-hover);
}

.nav-role {
  flex-shrink: 0;
  width: 32px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-align: center;
}

.nav-item.user .nav-role {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.nav-item.assistant .nav-role {
  background: var(--color-bg-info);
  color: var(--color-status-working);
}

.nav-preview {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-delete {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--color-text-tertiary);
  opacity: 0;
  transition: all 0.15s;
  cursor: pointer;
}

.nav-item:hover .nav-delete {
  opacity: 1;
}

.nav-delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.nav-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* dialog-btn styles moved to global style.css */

/* Scroll to bottom button */
.scroll-to-bottom-btn {
  position: fixed;
  bottom: 145px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary, #10a37f);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 100;
}

.scroll-to-bottom-btn:hover {
  transform: translateY(-2px);
}

.scroll-to-bottom-btn:active {
  transform: translateY(0);
}

/* Fade transition for scroll button */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 图片上传按钮 */
.image-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.image-upload-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.image-upload-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.image-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  background: var(--color-primary);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* 图片预览容器 */
.image-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.image-preview-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.image-remove-btn:hover {
  background: rgba(239, 68, 68, 0.9);
}

/* 文本文件预览容器 */
.file-preview-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.file-preview-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary, #f5f5f7);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  max-width: 250px;
}

.file-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.file-remove-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.file-remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 拖拽状态样式 */
.composer.drag-over {
  position: relative;
}

.composer.drag-over .textarea {
  opacity: 0.3;
  pointer-events: none;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 122, 255, 0.08);
  border: 2px dashed var(--color-primary);
  border-radius: 12px;
  z-index: 10;
  pointer-events: none;
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-primary);
}

.drag-hint svg {
  opacity: 0.8;
}

.drag-hint span {
  font-size: 14px;
  font-weight: 500;
}

/* 消息中的图片 */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  max-width: 400px;
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
}

.message-image.clickable {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.message-image.clickable:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 消息中的文件卡片 */
.message-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
  max-width: 400px;
}

.message-file-card {
  background: var(--color-bg-tertiary, #f5f5f7);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.file-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.file-card-header:hover {
  background: rgba(0, 0, 0, 0.04);
}

.file-card-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.file-card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-size {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.file-card-chevron {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}

.file-card-chevron.expanded {
  transform: rotate(180deg);
}

.file-card-content {
  border-top: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.02);
  max-height: 200px;
  overflow: auto;
}

.file-card-content pre {
  margin: 0;
  padding: 12px;
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.file-card-content code {
  color: var(--color-text-primary);
}

/* 图片预览对话框 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 40px;
}

.image-preview-dialog {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-close {
  position: absolute;
  top: -40px;
  right: 0;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.image-preview-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.image-preview-full {
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Skill Selector Popup */
.skill-selector-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
  max-height: 300px;
}

.skill-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.skill-selector-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.skill-selector-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.skill-selector-filter {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.skill-filter-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.skill-filter-input:focus {
  border-color: var(--color-primary);
}

.skill-filter-input::placeholder {
  color: var(--color-text-tertiary);
}

.skill-selector-list {
  max-height: 248px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.skill-selector-empty {
  padding: 20px;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  overflow: hidden;
}

.skill-item:hover,
.skill-item.selected {
  background: var(--color-bg-hover);
}

.skill-item.selected {
  background: var(--color-bg-active, rgba(16, 163, 127, 0.1));
}

.skill-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.skill-desc {
  font-size: 12px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Skill Selector Transition */
.skill-selector-enter-active,
.skill-selector-leave-active {
  transition: all 0.2s ease;
}

.skill-selector-enter-from,
.skill-selector-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Selected skill indicator in input */
.selected-skill-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(16, 163, 127, 0.15);
  border: 1px solid rgba(16, 163, 127, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary);
  margin-bottom: 4px;
}

.selected-skill-indicator button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
}

.selected-skill-indicator button:hover {
  color: var(--color-error-text, #ef4444);
}

/* Slash Command Selector Popup */
.slash-command-selector-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
  max-height: 320px;
}

.slash-command-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.slash-command-selector-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.slash-command-selector-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.slash-command-selector-filter {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.slash-command-filter-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.slash-command-filter-input:focus {
  border-color: var(--color-primary);
}

.slash-command-filter-input::placeholder {
  color: var(--color-text-tertiary);
}

.slash-command-selector-list {
  max-height: 248px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.slash-command-selector-empty {
  padding: 20px;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.slash-command-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  overflow: hidden;
}

.slash-command-item:hover,
.slash-command-item.selected {
  background: var(--color-bg-hover);
}

.slash-command-item.selected {
  background: var(--color-bg-active, rgba(16, 163, 127, 0.1));
}

.slash-command-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
}

.slash-command-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.slash-command-usage {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
}

/* File Selector Popup (# trigger) */
.file-selector-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 100;
  overflow: hidden;
  max-height: 320px;
}

.file-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.file-selector-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.file-selector-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.file-selector-filter {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
}

.file-filter-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.file-filter-input:focus {
  border-color: var(--color-primary);
}

.file-filter-input::placeholder {
  color: var(--color-text-tertiary);
}

.file-selector-list {
  max-height: 248px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.file-selector-empty,
.file-selector-loading {
  padding: 20px;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  overflow: hidden;
}

.file-item:hover,
.file-item.selected {
  background: var(--color-bg-hover);
}

.file-item.selected {
  background: var(--color-bg-active, rgba(16, 163, 127, 0.1));
}

.file-item-icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.file-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item-path {
  font-size: 11px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* 引用工具栏样式 */
.quote-toolbar {
  position: fixed;
  z-index: 10000;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  transform: translateY(-100%);
}

.quote-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-primary);
  transition: background 0.15s;
}

.quote-btn:hover {
  background: var(--color-bg-hover);
}

.quote-btn svg {
  color: var(--color-primary);
}

/* 引用工具栏动画 */
.quote-toolbar-enter-active,
.quote-toolbar-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.quote-toolbar-enter-from,
.quote-toolbar-leave-to {
  opacity: 0;
  transform: translateY(-100%) scale(0.95);
}
</style>
