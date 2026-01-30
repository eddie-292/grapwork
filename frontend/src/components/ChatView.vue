<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import SettingsView from './SettingsView.vue'
import type { ConfigList } from '../types/electron'

type Role = 'user' | 'assistant'
type Message = { role: Role; content: string }

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: function (str: string, lang?: string): string {
    try {
      return hljs.highlight(str, { language: lang || 'plaintext' }).value
    } catch {
      return md.utils.escapeHtml(str)
    }
  },
})

const messages = ref<Message[]>([])
const input = ref('')
const sending = ref(false)
const controller = ref<AbortController | null>(null)
const showSettings = ref(false)
const configList = ref<ConfigList>({
  configs: [],
  activeIndex: -1
})
const activeConfig = computed(() => 
  configList.value.activeIndex >= 0 ? configList.value.configs[configList.value.activeIndex] : null
)
const messagesRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScrollEnabled = ref(true)
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

const canUseElectronApi = !!window.electronAPI || isElectronEnv

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
  const newHeight = Math.min(Math.max(textarea.scrollHeight, 22), 120)
  textarea.style.height = newHeight + 'px'
}

function render(content: string) {
  return md.render(content)
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

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

  if (!activeConfig.value?.apiKey) {
    alert('请先配置并启用一个 LLM 接口')
    showSettings.value = true
    return
  }

  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  input.value = ''
  scrollToBottom()

  sending.value = true
  controller.value = new AbortController()
  
  try {
    // 准备发送的消息（只包含 role 和 content）
    const messagesToSend = messages.value.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }))

    let resp: Response

    if (canUseElectronApi && activeConfig.value) {
      // Electron 环境：直接请求当前启用的 LLM API
      const apiBase = normalizeApiUrl(activeConfig.value.apiUrl)
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
        }),
        signal: controller.value.signal,
      })
    } else {
      // Web 环境：通过后端代理（如果存在）
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
    const assistantIndex = messages.value.length - 1

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
        if (data === '[DONE]') {
          break
        }
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            const msg = messages.value[assistantIndex]
            if (msg) msg.content += delta
            scrollToBottom()
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } catch (err) {
    const last = messages.value[messages.value.length - 1]
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

function scrollToBottom() {
  if (!autoScrollEnabled.value) return
  const el = messagesRef.value
  if (!el) return
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
  })
}

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
  loadConfig()
}

onMounted(() => {
  loadConfig()
  scrollToBottom()
  if (textareaRef.value) {
    autoResizeTextarea()
  }
})
</script>

<template>
  <div class="container">
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <div class="brand-dot" />
          <span>OpenChat Desktop</span>
        </div>
        <button class="settings-btn" @click="openSettings" title="设置">
          设置
        </button>
      </div>
    </header>
    <main class="main">
      <div class="messages" ref="messagesRef" @scroll="handleMessagesScroll">
        <div v-if="messages.length === 0" class="welcome">
          <h2>欢迎使用 OpenChat Desktop</h2>
          <p>支持任何 OpenAI 标准 API 的桌面聊天应用</p>
          <p>点击右上角的“设置”配置你的 LLM 接口</p>
        </div>
        <div
          v-for="(m, i) in messages"
          :key="i"
          :class="['msg-row', m.role]"
        >
          <div class="msg-content">
            <div class="msg-bubble" v-html="render(m.content)" />
          </div>
        </div>
      </div>
      <form class="inputbar" @submit.prevent="send">
      <div class="model-bar">
        当前模型：{{ activeConfig?.name || activeConfig?.model || '未配置' }}
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
    <SettingsView v-if="showSettings" @close="closeSettings" />
  </div>
</template>

<style scoped>
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
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
  background: #f5f5f5;
  border: 1px solid #e5e7eb;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
}

.settings-btn:hover {
  background: #f0f0f0;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.messages {
    /*flex: 1; */
    /* overflow-y: auto; */
    /* overflow-x: hidden; */
    /* padding: 24px 0 40px; */
    background: #ffffff;
    height: calc(82vh);
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

.msg-bubble :deep(p) {
  margin: 0 0 10px 0;
}

.msg-bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-bubble :deep(pre) {
  background: #f5f5f5;
  color: #111827;
  padding: 14px;
  border-radius: 10px;
  overflow: auto;
  border: 1px solid #e5e7eb;
}

.msg-bubble :deep(code) {
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #0f172a;
}

.inputbar {
  border-top: 1px solid #e5e7eb;
  padding: 16px 20px 12px;
  background: #ffffff;
}

.model-bar {
  max-width: 900px;
  margin: 0 auto 16px;
  color: #6b7280;
  font-size: 12px;
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
  overflow-y: hidden;
  min-height: 22px;
  max-height: 120px;
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
</style>
