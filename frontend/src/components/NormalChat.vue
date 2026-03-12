<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import SaveToGlobalMemoryDialog from './SaveToGlobalMemoryDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
import MermaidDialog from './MermaidDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { storage } from '@/services/StorageService'
import CopyIcon from './icons/CopyIcon.vue'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'
import ChevronRightIcon from './icons/ChevronRightIcon.vue'
import FolderIcon from './icons/FolderIcon.vue'
import FolderOpenIcon from './icons/FolderOpenIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import XIcon from './icons/XIcon.vue'
import ArrowUpIcon from './icons/ArrowUpIcon.vue'
import SettingsIcon from './icons/SettingsIcon.vue'

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
}

// Token 使用统计类型
export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
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
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  send: [images: string[]]
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
}>()

// 思考模式
const enableThinking = computed(() => props.enableThinking ?? false)
function handleThinkingToggle() {
  emit('update:enable-thinking', !enableThinking.value)
}

// 全局记忆对话框状态
const showSaveToGlobalMemoryDialog = ref(false)
const saveToGlobalMemoryContent = ref('')
const saveToGlobalMemoryKeywords = ref<string[]>([])

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// Mermaid预览对话框状态
const showMermaidPreview = ref(false)
const mermaidPreviewContent = ref('')

// 选中的文件夹路径
const selectedFolderPath = ref<string>('')
// 文件夹对话框状态
const showFolderDialog = ref(false)
// 设置弹出框状态
const showSettingsPopover = ref(false)

// 删除确认对话框状态
const showDeleteConfirmDialog = ref(false)
const pendingDeleteIndex = ref<number | null>(null)

// 图片附件相关
const attachedImages = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

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

// 处理粘贴事件（支持粘贴图片）
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
    }
  }
}

// 移除图片
function removeImage(index: number) {
  attachedImages.value.splice(index, 1)
}

// 清空所有图片
function clearImages() {
  attachedImages.value = []
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

// 打开保存到全局记忆对话框
function openSaveToGlobalMemoryDialog(content: MessageContent) {
  const contentStr = getContentAsString(content)
  saveToGlobalMemoryContent.value = contentStr
  saveToGlobalMemoryKeywords.value = extractKeywords(contentStr)
  showSaveToGlobalMemoryDialog.value = true
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
const copyStatus = ref<Record<number, { text?: boolean; md?: boolean }>>({})

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
})

// Custom code block renderer with copy button
md.renderer.rules.fence = (tokens, idx) => {
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
  const images = [...attachedImages.value]
  emit('send', images)
  // 发送后清空图片
  clearImages()
}

function handleCancel() {
  emit('cancel')
}

function handleUpdateInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:input', target.value)
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

// 处理助手和模型选择变化（关闭弹出框）
function handleAssistantChange(e: Event) {
  changeAssistant(e)
  showSettingsPopover.value = false
}

function handleConfigChange(e: Event) {
  changeConfig(e)
  showSettingsPopover.value = false
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

// 点击外部关闭设置弹出框
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.settings-wrapper')) {
    showSettingsPopover.value = false
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
  // 加载已保存的文件夹路径
  const savedFolder = await storage.getSelectedFolder()
  if (savedFolder) {
    selectedFolderPath.value = savedFolder
  }
  // 添加点击外部关闭弹出框的事件监听
  document.addEventListener('click', handleClickOutside)

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

// 选择文件夹
function handleSelectFolder() {
  showFolderDialog.value = true
}

// 从对话框选择文件夹
async function selectFolderFromDialog() {
  if (window.electronAPI?.selectFolder) {
    try {
      const result = await window.electronAPI.selectFolder()
      if (result.success && result.path) {
        selectedFolderPath.value = result.path
        await storage.saveSelectedFolder(result.path)
        // 通知父组件文件夹已更改
        emit('folder-changed', result.path)
        // 清空助理选择
        emit('clear-assistant')
        showFolderDialog.value = false
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
      alert('选择文件夹失败')
    }
  }
}

// 清除文件夹
async function handleClearFolder() {
  selectedFolderPath.value = ''
  await storage.clearSelectedFolder()
  emit('folder-changed', '')
  showFolderDialog.value = false
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
    <div id="messages_dev" class="messages" ref="messagesRef" @scroll="handleMessagesScroll" @click="handleLinkClick">
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-hero">
          <h2 class="welcome-title">GrapWork</h2>
          <p class="welcome-subtitle">跨平台桌面 AI Agent 助手</p>
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
            <h3>任务分解</h3>
            <p>复杂任务自动拆解为可执行步骤</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <h3>工具调用</h3>
            <p>MCP 协议支持丰富的工具扩展</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon memory-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a10 10 0 1010 10H12V2z"/>
                <path d="M12 2a10 10 0 00-8.66 15"/>
                <circle cx="12" cy="12" r="6"/>
              </svg>
            </div>
            <h3>持久记忆</h3>
            <p>全局记忆存储用户偏好与知识</p>
          </div>
        </div>

        <div class="welcome-prompts">
          <p class="prompts-label">试试这些</p>
          <div class="prompts-grid">
            <button class="prompt-card" @click="emit('update:input', '帮我分析这个项目的代码结构')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span class="prompt-text">分析项目代码结构</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '帮我写一个 Python 脚本来处理 Excel 文件')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span class="prompt-text">编写数据处理脚本</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '帮我优化这个函数的性能')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span class="prompt-text">优化代码性能</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '查看我的未读邮件')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <span class="prompt-text">查看未读邮件</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '发送明日会议邀请邮件')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="12" y1="14" x2="16" y2="14"/>
                <line x1="12" y1="18" x2="16" y2="18"/>
              </svg>
              <span class="prompt-text">发送会议邀请</span>
            </button>
            <button class="prompt-card" @click="emit('update:input', '帮我整理当前目录下的文件')">
              <svg class="prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span class="prompt-text">整理目录文件</span>
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
                <span v-if="sending && i === messages.length - 1 && m.role === 'assistant'" class="reasoning-spinner"></span>
                <span>思考</span>
              </button>
              <div v-show="reasoningExpanded[i]" class="msg-reasoning-bubble" v-html="render(m.reasoning || '')" />
            </div>
            <div class="msg-bubble-wrapper">
              <!-- 用户消息图片预览 -->
              <div v-if="m.role === 'user' && m.images && m.images.length > 0" class="message-images">
                <img v-for="(img, imgIndex) in m.images" :key="imgIndex" :src="img" class="message-image clickable" @click="openImagePreview(img)" />
              </div>
              <!-- 渲染输出内容 -->
              <div class="msg-bubble" v-html="render(getContentAsString(m.content))" />
              <div class="msg-actions" v-if="m.copyable !== false">
                <button class="copy-btn" :class="{ 'copy-success': copyStatus[i]?.text }" @click="handleCopyText(m, i)" title="复制文本">
                  <span v-if="copyStatus[i]?.text" class="success-icon">✓</span>
                  <span v-else>Copy Text</span>
                </button>
                <button class="copy-btn" :class="{ 'copy-success': copyStatus[i]?.md }" @click="handleCopyMarkdown(m, i)" title="复制 Markdown">
                  <span v-if="copyStatus[i]?.md" class="success-icon">✓</span>
                  <span v-else>Copy Markdown</span>
                </button>
                <button class="copy-btn" @click="openSaveToGlobalMemoryDialog(m.content)" title="保存为全局记忆">
                  + Global Memory
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

      <div class="composer">
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
          placeholder="输入消息，回车发送，Shift+Enter 换行（支持粘贴图片）"
          @keydown.enter.exact.prevent="handleSend"
          @input="handleUpdateInput"
          @paste="handlePaste"
          ref="textareaRef"
        />
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
        <!-- 操作栏 - 单行布局 -->
        <div class="action-bar">
          <!-- 左侧：工作空间选择 -->
          <button
            type="button"
            class="action-btn workspace-btn"
            :class="{ active: selectedFolderPath }"
            @click="handleSelectFolder"
            :title="selectedFolderPath || '选择工作空间'"
          >
            <FolderIcon :size="16" />
            <span class="btn-text">{{ selectedFolderPath ? (selectedFolderPath.split('/').pop() || selectedFolderPath.split('\\').pop()) : '工作空间' }}</span>
          </button>

          <!-- 中间：模型选择器 -->
          <div class="settings-wrapper">
            <button
              type="button"
              class="model-selector"
              @click.stop="showSettingsPopover = !showSettingsPopover"
              :title="`${currentAssistantName} / ${currentConfigName}`"
            >
              <span class="model-name">{{ currentConfigName }}</span>
              <ChevronDownIcon :size="12" />
            </button>
            <!-- 模型选择弹出框 -->
            <div v-if="showSettingsPopover" class="settings-popover" @click.stop>
              <div class="popover-li">
                <label>助手</label>
                <select
                  :disabled="(currentChat?.messages?.length ?? 0) > 0"
                  :value="currentChat?.assistantId || ''"
                  @change="handleAssistantChange"
                  class="popover-select"
                >
                  <option value="">默认</option>
                  <option v-for="assistant in assistantList.assistants" :key="assistant.id" :value="assistant.id">
                    {{ assistant.name }}
                  </option>
                </select>
              </div>
              <div class="popover-li">
                <label>模型</label>
                <select :value="currentChat?.configId ?? ''" @change="handleConfigChange" class="popover-select">
                  <option value="">选择模型</option>
                  <option v-for="(config, index) in configList.configs" :key="index" :value="index">
                    {{ config.name || config.model }}
                  </option>
                </select>
              </div>
            </div>
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
              <XIcon :size="16" />
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

    <!-- 文件夹选择对话框 -->
    <Transition name="modal">
      <div v-if="showFolderDialog" class="dialog-overlay" @click.self="showFolderDialog = false">
        <div class="dialog-content folder-dialog">
          <h3 class="folder-dialog-title">
            <FolderIcon :size="20" />
            选择文件夹
          </h3>
          <div v-if="selectedFolderPath" class="current-folder">
            <span class="folder-label">当前选中的文件夹</span>
            <span class="folder-path" :title="selectedFolderPath">{{ selectedFolderPath }}</span>
          </div>
          <div v-else class="no-folder">
            <FolderOpenIcon :size="32" />
            <span>暂未选择文件夹</span>
          </div>
          <div class="dialog-actions">
            <button v-if="selectedFolderPath" type="button" class="dialog-btn danger" @click="handleClearFolder">
              清除
            </button>
            <button type="button" class="dialog-btn primary" @click="selectFolderFromDialog">
              {{ selectedFolderPath ? '更换文件夹' : '选择文件夹' }}
            </button>
            <button type="button" class="dialog-btn ghost" @click="showFolderDialog = false">
              取消
            </button>
          </div>
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
  margin: 40px auto 0;
  text-align: center;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
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
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, #555 0%, #333 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  grid-template-columns: repeat(3, 1fr);
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
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(51, 51, 51, 0.12);
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
  background: linear-gradient(135deg, #555 0%, #333 100%);
  color: white;
}

.tool-icon {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
}

.memory-icon {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.feature-card h3 {
  margin: 0 0 6px;
  font-size: 15px;
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
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  font-size: 14px;
  line-height: 1.5;
  max-width: 720px;
  word-break: break-word;
}

.msg-reasoning-bubble {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-tertiary);
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
  color: var(--color-text-tertiary);
  transition: color 0.2s;
}

.reasoning-toggle:hover {
  color: var(--color-text-secondary);
}

.reasoning-toggle span:first-child {
  font-size: 10px;
}

.msg-row.user .msg-bubble {
  background: var(--color-bg-secondary);
  color: var(--color-primary-text);
  padding: 12px 16px;
  border-radius: 16px;
}

.msg-row.assistant .msg-bubble {
  background: transparent;
  padding: 0;
}

.msg-bubble-wrapper {
  position: relative;
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
  background: linear-gradient(135deg, var(--color-bg-success) 0%, rgba(34, 197, 94, 0.15) 100%);
  border-color: #22c55e;
  color: #16a34a;
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
  margin: 0 0 10px 0;
}

.msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
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
  justify-content: center;
}

/* 设置弹出框样式 */
.settings-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  min-width: 180px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.popover-li {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.popover-li + .popover-li {
  margin-top: 12px;
}

.popover-li label {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.popover-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-primary);
}

.popover-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.token-stats {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
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
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-tertiary);
}

.textarea {
  flex: 1;
  resize: none;
  padding: 8px 4px;
  border: none;
  background: var(--color-bg-tertiary);
  outline: none;
  font-size: 14px;
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

/* 工作空间按钮 */
.workspace-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 100px;
  overflow: hidden;
}

.workspace-btn:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.workspace-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.workspace-btn .btn-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 模型选择器 */
.model-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.model-selector:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.model-name {
  font-weight: 500;
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
  width: 44px;
  height: 44px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.send-btn:disabled {
  background: var(--color-button-disabled, #ccc);
  cursor: not-allowed;
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
  animation: spin 0.8s linear infinite;
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
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
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

.folder-dialog {
  min-width: 400px;
  max-width: 600px;
}

.folder-dialog h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  text-align: center;
}

.folder-dialog-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.folder-dialog-title svg {
  color: var(--color-primary);
}

.current-folder {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 20px;
}

.no-folder {
  padding: 32px 16px;
  background: var(--color-bg-tertiary);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  margin-bottom: 20px;
  color: var(--color-text-tertiary);
  text-align: center;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.no-folder svg {
  color: var(--color-text-tertiary);
}

.folder-dialog .folder-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.folder-dialog .folder-path {
  font-size: 14px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', Monaco, 'Andale Mono', "JetBrains Mono", Menlo, Consolas, monospace;
  word-break: break-all;
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
</style>
