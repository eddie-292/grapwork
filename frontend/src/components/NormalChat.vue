<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

type Role = 'user' | 'assistant' | 'system'
export type Message = { role: Role; content: string; reasoning: string; reasoningDuration?: number; visible?: boolean; copyable?: boolean; archived?: boolean }

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
}>()

// Refs
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScrollEnabled = ref(true)
const reasoningExpanded = ref<Record<number, boolean>>({})
const reasoningStartTime = ref<Record<number, number>>({})

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
  let code = token.content

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

  return `<pre><code class="hljs language-${lang}">${code}</code>${copyBtn}</pre>`
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

function toggleTaskMode(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:is-task-mode', target.checked)
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
        <!-- 任务模式切换 -->
        <div class="task-mode-toggle" v-if="currentChat?.messages.length === 0">
          <label class="toggle-label">
            <input
              type="checkbox"
              :checked="currentChat?.isTaskMode"
              :disabled="sending"
              @change="toggleTaskMode"
            >
            <span class="toggle-switch"></span>
            <span class="toggle-text">任务模式</span>
          </label>
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
        <div class="actions">
          <button type="submit" class="btn primary" :disabled="sending">发送</button>
          <button type="button" class="btn ghost" @click="handleCancel" :disabled="!sending">
            取消
          </button>
        </div>
      </div>
    </form>
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
</style>
