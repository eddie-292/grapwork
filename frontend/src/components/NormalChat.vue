<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
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
}>()

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
const autoScrollEnabled = ref(true)
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
})

onUnmounted(() => {
  delete (window as any).previewHtml
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
    <div class="messages" ref="messagesRef" @scroll="handleMessagesScroll" @click="handleLinkClick">
      <div v-if="messages.length === 0" class="welcome">
        <h2>欢迎使用 OpenChat Desktop</h2>
        <p>支持任何 OpenAI 标准 API 的桌面聊天应用</p>
        <p>点击右上角的"设置"配置你的 LLM 接口</p>
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
                    <span class="status-icon status-icon-success">✓</span>
                    <span class="status-text">已完成</span>
                  </span>
                  <!-- 错误状态 -->
                  <span v-else-if="m.toolStatus === 'error'" class="tool-result-status status-error">
                    <span class="status-icon status-icon-error">✕</span>
                    <span class="status-text">执行失败</span>
                  </span>
                  <!-- 准备中状态 -->
                  <span v-else-if="m.toolStatus === 'pending'" class="tool-result-status status-pending">
                    <span class="status-spinner"></span>
                    <span class="status-text">准备中</span>
                  </span>
                  <!-- 默认成功状态（向后兼容） -->
                  <span v-else class="tool-result-status status-success">
                    <span class="status-icon status-icon-success">✓</span>
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
    <form class="inputbar" @submit.prevent="handleSend">
      <div class="model-bar">
        <select
          :disabled="(currentChat?.messages?.length ?? 0) > 0"
          :value="currentChat?.assistantId || ''"
          @change="changeAssistant"
          class="assistant-select"
        >
          <option value="">EddieLab-Agent</option>
          <option v-for="assistant in assistantList.assistants" :key="assistant.id" :value="assistant.id">
            {{ assistant.name }}
          </option>
        </select>
        <select :value="currentChat?.configId ?? ''" @change="changeConfig" class="config-select">
          <option value="">选择模型</option>
          <option v-for="(config, index) in configList.configs" :key="index" :value="index">
            {{ config.name || config.model }}
          </option>
        </select>
        <!-- 参数配置按钮 -->
        <button
          type="button"
          class="params-btn"
          @click="openParamsDialog"
          title="对话参数配置"
          :disabled="!currentChat"
        >
          参数
        </button>
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
        <div class="actions">
          <button type="submit" class="btn primary" :disabled="sending">发送</button>
          <button type="button" class="btn ghost" @click="handleCancel" :disabled="!sending">
            取消
          </button>
          <button
            type="button"
            class="btn folder"
            :class="{ 'has-folder': selectedFolderPath }"
            @click="handleSelectFolder"
            :title="selectedFolderPath || '选择文件夹'"
          >
            <template v-if="selectedFolderPath">
              ✓ {{ selectedFolderPath.split('/').pop() || selectedFolderPath.split('\\').pop() || '文件夹' }}
            </template>
            <template v-else>
              工作空间
            </template>
          </button>
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
  height: calc(81vh);
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
  padding: 0px 10px;
  background: var(--color-bg-primary);
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
  background: var(--color-bg-tertiary);
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
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.btn.primary:hover:not(:disabled) {
  border-color: var(--color-border-hover);
  color: var(--color-primary);
}

.btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.ghost {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn.ghost:disabled {
  color: var(--color-text-tertiary);
}

/* 文件夹按钮 */
.btn.folder {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  padding: 8px 14px;
  font-size: 13px;
  transition: all 0.2s;
  min-width: 80px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn.folder:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}

.btn.folder.has-folder {
  color: var(--color-text-secondary);
  font-weight: 400;
}

/* 参数配置按钮 */
.params-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;
}

.params-btn:hover:not(:disabled) {
  background: var(--color-bg-primary);
  border-color: var(--color-border);
}

.params-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.params-btn:focus {
  outline: none;
  border-color: var(--color-border);
  box-shadow: 0 0 0 2px rgba(161, 161, 161, 0.2);
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
