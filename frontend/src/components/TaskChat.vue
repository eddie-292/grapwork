<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import SaveToGlobalMemoryDialog from './SaveToGlobalMemoryDialog.vue'
import HtmlPreviewDialog from './HtmlPreviewDialog.vue'

type Role = 'user' | 'assistant' | 'system' | 'tool'
export type Message = {
  role: Role
  content: string
  reasoning: string
  reasoningDuration?: number
  visible?: boolean
  copyable?: boolean
  archived?: boolean
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
  'toggle-archived': [index: number]
  'open-params-dialog': []
  'change-assistant': [id: string]
  'change-config': [index: string]
  'open-save-global-memory': [content: string]
}>()

// 全局记忆对话框状态
const showSaveToGlobalMemoryDialog = ref(false)
const saveToGlobalMemoryContent = ref('')
const saveToGlobalMemoryKeywords = ref<string[]>([])

// HTML预览对话框状态
const showHtmlPreview = ref(false)
const htmlPreviewContent = ref('')

// 提取关键词的简单函数
function extractKeywords(content: string): string[] {
  const words = content
    .toLowerCase()
    .split(/[\s\u4e00-\u9fa5,;.!?。，；！？、]+/)
    .filter(w => w.length > 1)
  return Array.from(new Set(words)).slice(0, 5)
}

// 打开保存到全局记忆对话框
function openSaveToGlobalMemoryDialog(content: string) {
  saveToGlobalMemoryContent.value = content
  saveToGlobalMemoryKeywords.value = extractKeywords(content)
  emit('open-save-global-memory', content)
}

// Refs
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScrollEnabled = ref(true)
const reasoningExpanded = ref<Record<number, boolean>>({})
const reasoningStartTime = ref<Record<number, number>>({})
const archivedExpanded = ref<Record<number, boolean>>({})

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

// 自定义代码块渲染器，添加复制按钮
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  if (!token) return ''

  const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
  const lang = info ? info.split(/\s+/g)[0] : ''
  const rawCode = token.content
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

  let previewBtn = ''
  if (lang === 'html') {
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

function toggleArchived(index: number) {
  archivedExpanded.value[index] = !archivedExpanded.value[index]
  emit('toggle-archived', index)
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

// HTML预览功能
function openHtmlPreview(base64Code: string) {
  const utf8Bytes = atob(base64Code)
  const htmlCode = decodeURIComponent(utf8Bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
  htmlPreviewContent.value = htmlCode
  showHtmlPreview.value = true
}

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

// 组件挂载时设置全局函数，卸载时清理
onMounted(async () => {
  ;(window as any).previewHtml = function (btn: HTMLElement) {
    const base64Code = btn.getAttribute('data-html-code') || ''
    openHtmlPreview(base64Code)
  }
  if (textareaRef.value) {
    autoResizeTextarea()
  }
})

onUnmounted(() => {
  delete (window as any).previewHtml
})

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
  setArchivedExpanded: (index: number, value: boolean) => {
    archivedExpanded.value[index] = value
  },
  getReasoningExpanded: (index: number) => reasoningExpanded.value[index],
  getReasoningStartTime: (index: number) => reasoningStartTime.value[index],
  getArchivedExpanded: (index: number) => archivedExpanded.value[index],
})
</script>

<template>
  <main class="main">
    <div class="messages" ref="messagesRef" @scroll="handleMessagesScroll" @click="handleLinkClick">
      <div v-if="messages.length === 0" class="welcome">
        <h2>欢迎使用任务模式</h2>
        <p>任务模式可以将复杂请求分解为多个子任务并依次执行</p>
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
          <button class="archive-toggle" @click="toggleArchived(Number(groupIdx))">
            <span>{{ archivedExpanded[Number(groupIdx)] ? '▼' : '▶' }}</span>
            <span>归档历史 #{{ Number(groupIdx) + 1 }}</span>
            <span class="archive-count">({{ archiveGroup.length }} 条消息)</span>
          </button>
          <div v-show="archivedExpanded[Number(groupIdx)]" class="archive-messages">
            <template v-for="(archivedMsg, msgIdx) in archiveGroup" :key="`archived-${groupIdx}-${msgIdx}`">
              <div :class="['msg-row', archivedMsg.role, 'archived']">
                <div class="msg-content">
                  <div v-if="archivedMsg.reasoning" class="reasoning-section archived-reasoning">
                    <span class="archived-label">思考内容</span>
                    <div class="msg-reasoning-bubble" v-html="render(archivedMsg.reasoning)" />
                  </div>
                  <div class="msg-bubble-wrapper">
                    <div class="msg-bubble" v-html="render(archivedMsg.content)" />
                  </div>
                </div>
              </div>
            </template>
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
          <option value="">无助理</option>
          <option v-for="assistant in assistantList.assistants" :key="assistant.id" :value="assistant.id">
            {{ assistant.emoji }} {{ assistant.name }}
          </option>
        </select>
        <select :value="currentChat?.configId ?? ''" @change="changeConfig" class="config-select">
          <option value="">选择模型</option>
          <option v-for="(config, index) in configList.configs" :key="index" :value="index">
            {{ config.name || config.model }}
          </option>
        </select>
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
  </main>
</template>

<style scoped>
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

/* 链接样式 */
.msg-bubble :deep(a) {
  color: #000000;
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
