<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import type { SubSession } from '@/types/agentTeam'

// Markdown renderer
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
})

const props = defineProps<{
  session: SubSession
}>()

const emit = defineEmits<{
  minimize: [id: string]
  close: [id: string]
  expand: [id: string]
}>()

const isMinimized = ref(false)
const autoScrollEnabled = ref(true)
const messageContainer = ref<HTMLElement | null>(null)

// Computed
const statusLabel = computed(() => {
  switch (props.session.status) {
    case 'idle': return '等待中'
    case 'working': return '执行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return props.session.status
  }
})

const statusClass = computed(() => {
  return `status-${props.session.status}`
})

const duration = computed(() => {
  if (!props.session.startTime) return ''
  const end = props.session.endTime || Date.now()
  const seconds = Math.floor((end - props.session.startTime) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
})

const latestMessage = computed(() => {
  if (props.session.messages.length === 0) return null
  const lastMsg = props.session.messages[props.session.messages.length - 1]
  return {
    role: lastMsg.role,
    preview: getMessagePreview(lastMsg)
  }
})

// Watch messages to auto-scroll
watch(() => props.session.messages.length, () => {
  if (autoScrollEnabled.value && messageContainer.value) {
    setTimeout(() => {
      messageContainer.value?.scrollTo({
        top: messageContainer.value.scrollHeight,
        behavior: 'smooth'
      })
    }, 50)
  }
})

// Methods
function toggleMinimize() {
  isMinimized.value = !isMinimized.value
  if (isMinimized.value) {
    emit('minimize', props.session.id)
  } else {
    emit('expand', props.session.id)
  }
}

function handleClose() {
  emit('close', props.session.id)
}

function getMessagePreview(message: any): string {
  if (typeof message.content === 'string') {
    return message.content.slice(0, 200) + (message.content.length > 200 ? '...' : '')
  }
  if (Array.isArray(message.content)) {
    const textPart = message.content.find((p: any) => p.type === 'text')
    if (textPart) {
      return textPart.text.slice(0, 200) + (textPart.text.length > 200 ? '...' : '')
    }
  }
  return '[工具调用]'
}

function render(content: string): string {
  return md.render(content)
}
</script>

<template>
  <div class="float-window" :class="{ minimized: isMinimized, [statusClass]: true }">
    <!-- Header -->
    <header class="window-header" @click="toggleMinimize">
      <div class="header-left">
        <span class="worker-name">{{ session.workerName }}</span>
        <span class="task-title" v-if="session.title">{{ session.title }}</span>
      </div>
      <div class="header-right">
        <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
        <span class="duration" v-if="duration">{{ duration }}</span>
        <button class="close-btn" @click.stop="handleClose">×</button>
      </div>
    </header>

    <!-- Current Work Preview -->
    <div v-if="latestMessage && session.status === 'working'" class="current-work">
      <div class="work-label">当前工作</div>
      <div class="work-content">{{ latestMessage.preview }}</div>
    </div>

    <!-- Content -->
    <div class="window-content" v-show="!isMinimized" ref="messageContainer">
      <!-- Messages -->
      <div class="messages-list">
        <div
          v-for="(message, index) in session.messages"
          :key="index"
          class="message-item"
          :class="message.role"
        >
          <div class="message-role">
            {{ message.role === 'user' ? '任务' : message.role === 'assistant' ? 'Worker' : '系统' }}
          </div>
          <div class="message-content">{{ getMessagePreview(message) }}</div>
        </div>

        <!-- Empty state -->
        <div v-if="session.messages.length === 0" class="empty-state">
          <span v-if="session.status === 'idle'">等待执行...</span>
          <span v-else-if="session.status === 'working'">正在初始化...</span>
        </div>
      </div>

      <!-- Result summary -->
      <div v-if="session.result && session.status === 'completed'" class="result-summary">
        <div class="result-label">执行结果</div>
        <div class="result-content" v-html="render(session.result)"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.float-window {
  width: 320px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  transition: all 0.2s ease;
}

.float-window.minimized {
  max-height: 40px;
}

.window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  user-select: none;
}

.window-header:hover {
  background: var(--color-bg-hover);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.worker-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-primary);
}

.task-title {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.status-idle { background: var(--color-status-idle-bg); color: var(--color-status-idle); }
.status-working { background: var(--color-status-working-bg); color: var(--color-status-working); }
.status-completed { background: var(--color-status-completed-bg); color: var(--color-status-completed); }
.status-failed { background: var(--color-status-failed-bg); color: var(--color-status-failed); }

.duration {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.close-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.current-work {
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.work-label {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.work-content {
  font-size: 12px;
  color: var(--color-text-primary);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
}

.window-content {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-item {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
}

.message-item.user {
  background: var(--color-bg-secondary);
}

.message-item.assistant {
  background: var(--color-bg-info);
}

.message-role {
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.message-content {
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.empty-state {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 20px;
  font-size: 12px;
}

.result-summary {
  margin-top: 8px;
  padding: 8px;
  background: var(--color-status-completed-bg);
  border-radius: 6px;
}

.result-label {
  font-size: 10px;
  color: var(--color-status-completed);
  margin-bottom: 4px;
}

.result-content {
  font-size: 11px;
  color: var(--color-status-completed);
  word-break: break-word;
}

.result-content :deep(p) {
  margin: 0 0 4px 0;
}

.result-content :deep(p:last-child) {
  margin-bottom: 0;
}

.result-content :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.result-content :deep(pre) {
  background: rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 4px 0;
}

.result-content :deep(ul),
.result-content :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.result-content :deep(li) {
  margin: 2px 0;
}
</style>
