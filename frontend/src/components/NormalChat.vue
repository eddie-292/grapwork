<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import SaveToGlobalMemoryDialog from './SaveToGlobalMemoryDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'
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
export type Message = {
  role: Role
  content: string
  reasoning: string
  reasoningDuration?: number
  visible?: boolean
  copyable?: boolean
  archived?: boolean
  tool_call_id?: string
  tool_calls?: any[]
  // 工具执行状态
  toolStatus?: 'pending' | 'running' | 'success' | 'error'
  // 错误消息标识
  isError?: boolean
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
  send: []
  cancel: []
  'update:input': [value: string]
  'toggle-reasoning': [index: number]
  'open-params-dialog': []
  'change-assistant': [id: string]
  'change-config': [index: string]
  'update:is-task-mode': [value: boolean]
  'clear-assistant': []
  'folder-changed': [path: string]
  'update:enable-thinking': [value: boolean]  // 更新思考模式
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

// 选中的文件夹路径
const selectedFolderPath = ref<string>('')
// 文件夹对话框状态
const showFolderDialog = ref(false)
// 设置弹出框状态
const showSettingsPopover = ref(false)

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

// 检测消息是否为错误消息
function isErrorMessage(message: Message): boolean {
  if (message.isError) return true
  // 检测内容是否包含错误标识
  const errorPrefixes = ['对话失败', '任务执行失败', 'API 请求失败', 'API request failed', 'Maximum context length', 'context length', 'tokens']
  return errorPrefixes.some(prefix => message.content.includes(prefix))
}

// 打开保存到全局记忆对话框
function openSaveToGlobalMemoryDialog(content: string) {
  saveToGlobalMemoryContent.value = content
  saveToGlobalMemoryKeywords.value = extractKeywords(content)
  showSaveToGlobalMemoryDialog.value = true
}

// Refs
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputbarRef = ref<HTMLFormElement | null>(null)
const autoScrollEnabled = ref(true)

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

// 获取工具名称（从 tool_calls 中查找对应的工具调用）
function getToolName(message: Message, messages: Message[]): string {
  if (!message.tool_call_id) return 'Tool'

  // 向前查找包含 tool_calls 的 assistant 消息
  for (let i = messages.indexOf(message) - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls.find((tc: any) => tc.id === message.tool_call_id)
      if (toolCall) {
        return toolCall.function.name
      }
    }
  }

  return 'Tool'
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

  return `<pre><code class="hljs language-${lang}">${code}</code>${copyBtn}${previewBtn}</pre>`
}

// Functions
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

function toggleReasoning(index: number) {
  reasoningExpanded.value[index] = !reasoningExpanded.value[index]
  emit('toggle-reasoning', index)
}

function handleSend(e: Event) {
  e.preventDefault()
  emit('send')
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
  if (!assistantId) return 'EddieLab-Agent'
  const assistant = props.assistantList.assistants.find((a: any) => a.id === assistantId)
  return assistant?.name || 'EddieLab-Agent'
})

// 计算当前模型名称
const currentConfigName = computed(() => {
  const configId = props.currentChat?.configId
  if (configId === undefined || configId === null || configId === '') return '默认'
  const config = props.configList.configs[configId]
  return config?.name || config?.model || '默认'
})

// ============ TASK MODE - DISABLED ============
// function toggleTaskMode(e: Event) {
//   const target = e.target as HTMLInputElement
//   emit('update:is-task-mode', target.checked)
// }
// =============================================

// HTML预览功能
function openHtmlPreview(base64Code: string) {
  // 使用UTF-8解码
  const utf8Bytes = atob(base64Code)
  const htmlCode = decodeURIComponent(utf8Bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  htmlPreviewContent.value = htmlCode
  showHtmlPreview.value = true
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
    if (!autoScrollEnabled.value) return
    const el = messagesRef.value
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
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
</script>

<template>
  <main class="main">
    <div id="messages_dev" class="messages" ref="messagesRef" @scroll="handleMessagesScroll" @click="handleLinkClick">
      <div v-if="messages.length === 0" class="welcome">
        <div class="welcome-hero">
          <h2 class="welcome-title">PrismChat</h2>
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
                  <!-- 执行中状态 -->
                  <span v-if="m.toolStatus === 'running'" class="tool-result-status status-running">
                    <span class="status-spinner"></span>
                    <span class="status-text">执行中</span>
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
                  <!-- 准备中状态 -->
                  <span v-else-if="m.toolStatus === 'pending'" class="tool-result-status status-pending">
                    <span class="status-spinner"></span>
                    <span class="status-text">准备中</span>
                  </span>
                  <!-- 默认成功状态（向后兼容） -->
                  <span v-else class="tool-result-status status-success">
                    <span class="status-icon status-icon-success"><CheckIcon :size="12" /></span>
                    <span class="status-text">已完成</span>
                  </span>
                </div>
                <div class="tool-result-actions">
                  <button class="tool-action-btn" title="复制结果" @click.stop="copyToolResult(m.content)">
                    <CopyIcon :size="14" />
                  </button>
                  <span class="expand-icon"><ChevronDownIcon v-if="toolResultExpanded[i]" :size="10" /><ChevronRightIcon v-else :size="10" /></span>
                </div>
              </div>
              <div v-show="toolResultExpanded[i]" class="tool-result-body">
                <pre class="tool-result-code"><code v-if="formatToolResult(m.content).html" v-html="formatToolResult(m.content).html"></code><code v-else>{{ formatToolResult(m.content).formatted }}</code></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- 普通消息 -->
        <div
          v-else-if="m.visible !== false"
          :class="['msg-row', m.role, { 'error-message': isErrorMessage(m) }]"
        >
          <div class="msg-content">
            <div v-if="m.reasoning || (sending && i === messages.length - 1 && m.role === 'assistant')" class="reasoning-section">
              <button class="reasoning-toggle" @click="toggleReasoning(i)">
                <ChevronDownIcon v-if="reasoningExpanded[i]" :size="10" />
                <ChevronRightIcon v-else :size="10" />
                <span v-if="sending && i === messages.length - 1 && m.role === 'assistant'" class="reasoning-spinner"></span>
                <span>思考</span>
                <span v-if="m.reasoningDuration">{{ m.reasoningDuration }}s</span>
              </button>
              <div v-show="reasoningExpanded[i]" class="msg-reasoning-bubble" v-html="render(m.reasoning)" />
            </div>
            <div class="msg-bubble-wrapper">
              <!-- 渲染输出内容 -->
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
        <textarea
          :value="input"
          class="textarea"
          placeholder="输入消息，回车发送，Shift+Enter 换行"
          @keydown.enter.exact.prevent="handleSend"
          @input="handleUpdateInput"
          ref="textareaRef"
        />
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
                  <option value="">EddieLab-Agent</option>
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
            <!-- 思考模式开关 -->
            <label class="thinking-toggle" :title="enableThinking ? '已启用思考模式' : '点击启用思考模式'">
              <input type="checkbox" :checked="enableThinking" @change="handleThinkingToggle" />
              <span class="thinking-slider"></span>
            </label>

            <!-- 参数设置 -->
            <button
              type="button"
              class="icon-btn"
              @click="openParamsDialog"
              title="对话参数配置"
              :disabled="!currentChat"
            >
              <SettingsIcon :size="16" />
            </button>

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
  background: linear-gradient(135deg, var(--color-primary) 0%, #1a7f64 100%);
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
  box-shadow: 0 8px 24px rgba(16, 163, 127, 0.12);
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
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
  background: var(--color-bg-secondary);
  color: var(--color-primary-text);
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
  border-color: var(--color-border);
}

.msg-bubble :deep(.code-preview-btn) {
  position: absolute;
  top: 8px;
  right: 72px;
  background: rgba(16, 163, 127, 0.9);
  border: 1px solid #22c55e;
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
  border-radius: 16px;
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
  width: 32px;
  height: 32px;
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
  opacity: 0.5;
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
  opacity: 0.5;
  cursor: not-allowed;
}

/* 思考模式开关样式 - 紧凑版 */
.thinking-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
}

.thinking-toggle:hover {
  background: var(--color-bg-tertiary);
}

.thinking-toggle input {
  display: none;
}

.thinking-slider {
  position: relative;
  width: 28px;
  height: 16px;
  background: var(--color-border);
  border-radius: 16px;
  transition: 0.2s;
}

.thinking-slider::before {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.thinking-toggle input:checked + .thinking-slider {
  background: var(--color-primary);
}

.thinking-toggle input:checked + .thinking-slider::before {
  transform: translateX(12px);
}

:deep(hr) {
  border-color: rgba(255, 255, 255, 0);
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

/* 工具结果样式 */
.msg-row.tool {
  padding: 12px 0;
}

.tool-result-card {
  background: rgba(247, 247, 248, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 8px;
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
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
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
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  word-break: break-all;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding-top: 8px;
}

/* dialog-btn styles moved to global style.css */
</style>
