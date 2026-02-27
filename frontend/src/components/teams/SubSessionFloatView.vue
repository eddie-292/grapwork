<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SubSession } from '@/types/agentTeam'

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
        <div class="result-content">{{ session.result }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.float-window {
  width: 320px;
  background: var(--color-bg-primary, #fff);
  border: 1px solid var(--color-border, #e0e0e0);
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
  background: var(--color-bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  cursor: pointer;
  user-select: none;
}

.window-header:hover {
  background: var(--color-bg-hover, #eee);
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
  color: var(--color-text-primary, #333);
}

.task-title {
  font-size: 11px;
  color: var(--color-text-secondary, #666);
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

.status-idle { background: #f5f5f5; color: #666; }
.status-working { background: #e8f4fd; color: #4a90d9; }
.status-completed { background: #dcfce7; color: #166534; }
.status-failed { background: #fee2e2; color: #dc2626; }

.duration {
  font-size: 10px;
  color: var(--color-text-secondary, #888);
}

.close-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #888);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--color-bg-hover, #e0e0e0);
  color: var(--color-text-primary, #333);
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
  background: var(--color-bg-secondary, #f5f5f5);
}

.message-item.assistant {
  background: var(--color-bg-hover, #e8f4fd);
}

.message-role {
  font-size: 10px;
  color: var(--color-text-secondary, #888);
  margin-bottom: 2px;
}

.message-content {
  color: var(--color-text-primary, #333);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.empty-state {
  text-align: center;
  color: var(--color-text-secondary, #888);
  padding: 20px;
  font-size: 12px;
}

.result-summary {
  margin-top: 8px;
  padding: 8px;
  background: var(--color-bg-success, #dcfce7);
  border-radius: 6px;
}

.result-label {
  font-size: 10px;
  color: #166534;
  margin-bottom: 4px;
}

.result-content {
  font-size: 11px;
  color: #166534;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
