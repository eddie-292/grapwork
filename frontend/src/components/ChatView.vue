<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import type { ConfigList, AssistantList } from '../types/electron'

const router = useRouter()

type Role = 'user' | 'assistant' | 'system'
type Message = { role: Role; content: string, reasoning: string, reasoningDuration?: number }
type Chat = {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  assistantId?: string
  configId?: number
}

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
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScrollEnabled = ref(true)
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')
// 推理内容展开状态映射（按消息索引）
const reasoningExpanded = ref<Record<number, boolean>>({})
// 推理开始时间映射（按消息索引）
const reasoningStartTime = ref<Record<number, number>>({})

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
    createNewChat()
  }

  if (currentChat.value) {
    if (currentChat.value.messages.length === 0) {
      updateChatTitle(currentChat.value.id, text)
    }
    currentChat.value.messages.push({ role: 'user', content: text, reasoning: '' })
    currentChat.value.messages.push({ role: 'assistant', content: '',  reasoning: '' })
  }
  input.value = ''
  scrollToBottom()

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

    if (canUseElectronApi && activeConfig.value) {
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
        console.log('data:' + data)
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

function createNewChat() {
  // 使用上一个对话的助理和配置，如果没有则使用当前全局选中的
  const lastAssistantId = chatList.value[0]?.assistantId
  const currentAssistantId = assistantList.value.activeIndex >= 0
    ? assistantList.value.assistants[assistantList.value.activeIndex]?.id
    : undefined
  const lastConfigId = chatList.value[0]?.configId
  const currentConfigId = configList.value.activeIndex >= 0 ? configList.value.activeIndex : undefined

  const newChat: Chat = {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    assistantId: lastAssistantId || currentAssistantId,
    configId: lastConfigId ?? currentConfigId
  }
  chatList.value.unshift(newChat)
  currentChatId.value = newChat.id
  saveChatHistory()
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
        <button class="new-chat-btn" @click="createNewChat">
          <span class="plus-icon">+</span>
          新对话
        </button>
        <button class="toggle-sidebar-btn" @click="showSidebar = !showSidebar" title="收起/展开侧边栏">
          <span v-if="showSidebar">◀</span>
          <span v-else>▶</span>
        </button>
      </div>
      <div class="chat-list">
        <div
          v-for="chat in chatList"
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
    </aside>
    <div class="content-wrapper">
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
              <span v-if="activeAssistant">{{ activeAssistant.emoji }}</span>
              <span v-else>🤖</span>
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
          <div
            v-for="(m, i) in messages"
            :key="i"
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
                <div class="msg-actions">
                  <button class="copy-btn" @click="copyRenderedText(m.content)" title="复制文本">
                    T
                  </button>
                  <button class="copy-btn" @click="copyMarkdown(m.content)" title="复制 Markdown">
                    M
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <form class="inputbar" @submit.prevent="send">
          <div class="model-bar">
            <select :value="currentChat?.assistantId || ''" @change="changeAssistant(($event.target as HTMLSelectElement).value)" class="assistant-select">
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
  flex-direction: column;
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
  font-size: 18px;
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
  color: #1e3a8a;
  border: 1px solid #c084fc;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.config-select:hover {
  background: #e0e7ff;
  border-color: #a855f7;
}

.config-select:focus {
  outline: none;
  border-color: #a855f7;
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
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
</style>
