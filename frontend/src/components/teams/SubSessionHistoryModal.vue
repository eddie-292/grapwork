<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storage } from '@/services/StorageService'
import type { SubSession } from '@/types/agentTeam'

const props = defineProps<{
  visible: boolean
  parentSessionId?: string
  parentChatId?: string
}>()

const emit = defineEmits<{
  close: []
  selectSession: [session: SubSession]
}>()

const sessions = ref<SubSession[]>([])
const selectedSession = ref<SubSession | null>(null)
const loading = ref(false)

// Computed
const sortedSessions = computed(() => {
  return [...sessions.value].sort((a, b) => b.startTime - a.startTime)
})

const groupedByStatus = computed(() => {
  return {
    completed: sortedSessions.value.filter(s => s.status === 'completed'),
    failed: sortedSessions.value.filter(s => s.status === 'failed'),
    other: sortedSessions.value.filter(s => s.status !== 'completed' && s.status !== 'failed')
  }
})

// Watch for visibility changes
watch(() => props.visible, async (visible) => {
  if (visible) {
    await loadSessions()
  }
})

// Methods
async function loadSessions() {
  loading.value = true
  try {
    if (props.parentSessionId) {
      sessions.value = await storage.getSubSessionsByParentSession(props.parentSessionId)
    } else if (props.parentChatId) {
      sessions.value = await storage.getSubSessionsByParentChat(props.parentChatId)
    } else {
      const registry = await storage.getSubSessionRegistry()
      sessions.value = registry.sessions
    }
  } catch (error) {
    console.error('Failed to load sub sessions:', error)
    sessions.value = []
  } finally {
    loading.value = false
  }
}

function selectSession(session: SubSession) {
  selectedSession.value = session
  emit('selectSession', session)
}

function close() {
  selectedSession.value = null
  emit('close')
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatDuration(session: SubSession): string {
  if (!session.startTime) return '-'
  const end = session.endTime || Date.now()
  const seconds = Math.floor((end - session.startTime) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'idle': return '等待'
    case 'working': return '执行中'
    case 'completed': return '完成'
    case 'failed': return '失败'
    default: return status
  }
}

function getStatusClass(status: string): string {
  return `status-${status}`
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <!-- Header -->
      <div class="modal-header">
        <h3>子会话历史</h3>
        <button class="close-btn" @click="close">×</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <div v-if="loading" class="loading-state">加载中...</div>

        <div v-else-if="sessions.length === 0" class="empty-state">
          暂无子会话记录
        </div>

        <div v-else class="sessions-list">
          <!-- Completed sessions -->
          <div v-if="groupedByStatus.completed.length > 0" class="session-group">
            <div class="group-label">已完成 ({{ groupedByStatus.completed.length }})</div>
            <div
              v-for="session in groupedByStatus.completed"
              :key="session.id"
              class="session-item"
              :class="{ selected: selectedSession?.id === session.id }"
              @click="selectSession(session)"
            >
              <div class="session-header">
                <span class="worker-name">{{ session.workerName }}</span>
                <span class="status-badge" :class="getStatusClass(session.status)">
                  {{ getStatusLabel(session.status) }}
                </span>
              </div>
              <div class="session-title">{{ session.title }}</div>
              <div class="session-meta">
                <span>{{ formatDate(session.startTime) }}</span>
                <span>{{ formatDuration(session) }}</span>
              </div>
            </div>
          </div>

          <!-- Failed sessions -->
          <div v-if="groupedByStatus.failed.length > 0" class="session-group">
            <div class="group-label">失败 ({{ groupedByStatus.failed.length }})</div>
            <div
              v-for="session in groupedByStatus.failed"
              :key="session.id"
              class="session-item"
              :class="{ selected: selectedSession?.id === session.id }"
              @click="selectSession(session)"
            >
              <div class="session-header">
                <span class="worker-name">{{ session.workerName }}</span>
                <span class="status-badge" :class="getStatusClass(session.status)">
                  {{ getStatusLabel(session.status) }}
                </span>
              </div>
              <div class="session-title">{{ session.title }}</div>
              <div class="session-meta">
                <span>{{ formatDate(session.startTime) }}</span>
                <span>{{ formatDuration(session) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected session detail -->
      <div v-if="selectedSession" class="session-detail">
        <div class="detail-header">
          <span>{{ selectedSession.workerName }} - {{ selectedSession.title }}</span>
          <button class="back-btn" @click="selectedSession = null">返回列表</button>
        </div>
        <div class="detail-content">
          <div class="messages-list">
            <div
              v-for="(message, index) in selectedSession.messages"
              :key="index"
              class="message-item"
              :class="message.role"
            >
              <div class="message-role">
                {{ message.role === 'user' ? '任务' : message.role === 'assistant' ? '响应' : '系统' }}
              </div>
              <div class="message-content">
                {{ typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2) }}
              </div>
            </div>
          </div>

          <!-- Result -->
          <div v-if="selectedSession.result" class="result-section">
            <div class="result-label">执行结果</div>
            <div class="result-content">{{ selectedSession.result }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: var(--color-bg-primary, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #333);
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #888);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.close-btn:hover {
  background: var(--color-bg-hover, #f0f0f0);
  color: var(--color-text-primary, #333);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--color-text-secondary, #888);
}

.session-group {
  margin-bottom: 16px;
}

.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  margin-bottom: 8px;
  padding-left: 4px;
}

.session-item {
  padding: 12px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  border-color: var(--color-primary, #4a90d9);
  background: var(--color-bg-hover, #f8f8f8);
}

.session-item.selected {
  border-color: var(--color-primary, #4a90d9);
  background: var(--color-bg-selected, #e8f4fd);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.worker-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-primary, #333);
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-completed { background: #dcfce7; color: #166534; }
.status-failed { background: #fee2e2; color: #dc2626; }
.status-working { background: #e8f4fd; color: #4a90d9; }
.status-idle { background: #f5f5f5; color: #666; }

.session-title {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
}

.session-detail {
  border-top: 1px solid var(--color-border, #e0e0e0);
  background: var(--color-bg-secondary, #fafafa);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  font-weight: 600;
  font-size: 13px;
}

.back-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  background: var(--color-bg-primary, #fff);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.back-btn:hover {
  background: var(--color-bg-hover, #f0f0f0);
}

.detail-content {
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.message-item.user {
  background: var(--color-bg-primary, #fff);
}

.message-item.assistant {
  background: var(--color-bg-secondary, #f0f0f0);
}

.message-role {
  font-size: 10px;
  color: var(--color-text-secondary, #888);
  margin-bottom: 4px;
}

.message-content {
  color: var(--color-text-primary, #333);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.result-section {
  margin-top: 12px;
  padding: 10px;
  background: var(--color-bg-success, #dcfce7);
  border-radius: 6px;
}

.result-label {
  font-size: 10px;
  color: #166534;
  margin-bottom: 4px;
}

.result-content {
  font-size: 12px;
  color: #166534;
  white-space: pre-wrap;
}
</style>
