<script setup lang="ts">
import { ref, computed } from 'vue'
import SubSessionFloatView from './SubSessionFloatView.vue'
import type { SubSession } from '@/types/agentTeam'

const props = defineProps<{
  sessions: SubSession[]
  visible?: boolean
}>()

const emit = defineEmits<{
  close: [sessionId: string]
}>()

// Local state for minimized sessions
const minimizedIds = ref<Set<string>>(new Set())

// Computed
const visibleSessions = computed(() => {
  return props.sessions.filter(s => s.status === 'working' || s.status === 'idle')
})

const completedSessions = computed(() => {
  return props.sessions.filter(s => s.status === 'completed' || s.status === 'failed')
})

// Methods
function handleMinimize(sessionId: string) {
  minimizedIds.value.add(sessionId)
}

function handleExpand(sessionId: string) {
  minimizedIds.value.delete(sessionId)
}

function handleClose(sessionId: string) {
  emit('close', sessionId)
}

function minimizeAll() {
  visibleSessions.value.forEach(s => minimizedIds.value.add(s.id))
}

function expandAll() {
  minimizedIds.value.clear()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && sessions.length > 0" class="sub-session-manager">
      <!-- Controls bar -->
      <div class="controls-bar" v-if="visibleSessions.length > 1">
        <button class="control-btn" @click="expandAll">全部展开</button>
        <button class="control-btn" @click="minimizeAll">全部最小化</button>
      </div>

      <!-- Active sessions container -->
      <div class="sessions-container">
        <SubSessionFloatView
          v-for="session in visibleSessions"
          :key="session.id"
          :session="session"
          :class="{ minimized: minimizedIds.has(session.id) }"
          @minimize="handleMinimize"
          @expand="handleExpand"
          @close="handleClose"
        />
      </div>

      <!-- Completed sessions indicator -->
      <div v-if="completedSessions.length > 0" class="completed-indicator">
        <span class="completed-count">
          {{ completedSessions.length }} 个子会话已完成
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sub-session-manager {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 340px;
}

.controls-bar {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--color-bg-primary, #fff);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.control-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-primary, #333);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: var(--color-bg-hover, #eee);
  border-color: var(--color-primary, #4a90d9);
}

.sessions-container {
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}

.sessions-container::-webkit-scrollbar {
  width: 4px;
}

.sessions-container::-webkit-scrollbar-track {
  background: transparent;
}

.sessions-container::-webkit-scrollbar-thumb {
  background: var(--color-border, #ccc);
  border-radius: 2px;
}

.completed-indicator {
  padding: 8px 12px;
  background: var(--color-bg-success, #dcfce7);
  border-radius: 6px;
  text-align: center;
}

.completed-count {
  font-size: 12px;
  color: #166534;
}
</style>
