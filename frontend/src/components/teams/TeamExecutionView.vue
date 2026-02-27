<script setup lang="ts">
import { computed } from 'vue'
import type { TeamSession } from '@/types/agentTeam'
import { TaskStatus } from '@/types/agentTeam'

const props = defineProps<{
  session: TeamSession
}>()

const emit = defineEmits<{
  cancel: []
}>()

// Computed
const progress = computed(() => {
  const total = props.session.projectState.totalTasks
  const completed = props.session.projectState.completedTasks
  const failed = props.session.projectState.failedTasks
  if (total === 0) return 0
  return Math.round(((completed + failed) / total) * 100)
})

const statusLabel = computed(() => {
  switch (props.session.status) {
    case 'planning': return '规划中'
    case 'executing': return '执行中'
    case 'integrating': return '整合中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return props.session.status
  }
})

const statusClass = computed(() => {
  return `status-${props.session.status}`
})

const pendingTasks = computed(() => props.session.taskQueue.pending)
const inProgressTasks = computed(() => props.session.taskQueue.inProgress)
const completedTasks = computed(() => props.session.taskQueue.completed)

// Methods
function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.PENDING: return '等待'
    case TaskStatus.CLAIMED: return '已认领'
    case TaskStatus.IN_PROGRESS: return '执行中'
    case TaskStatus.COMPLETED: return '完成'
    case TaskStatus.FAILED: return '失败'
    case TaskStatus.CANCELLED: return '取消'
    default: return status
  }
}

function getStatusClass(status: TaskStatus): string {
  return `task-status-${status}`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}
</script>

<template>
  <div class="execution-view">
    <!-- Header -->
    <div class="execution-header">
      <div class="status-section">
        <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
        <span class="progress-text">{{ progress }}%</span>
      </div>
      <div class="metrics">
        <span>tokens: {{ session.metrics.totalTokensUsed }}</span>
        <span>tools: {{ session.metrics.totalToolCalls }}</span>
        <span>time: {{ formatDuration(session.metrics.totalDuration) }}</span>
      </div>
      <button
        v-if="session.status === 'executing' || session.status === 'planning'"
        class="cancel-btn"
        @click="emit('cancel')"
      >
        取消
      </button>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
    </div>

    <!-- User request -->
    <div class="request-section">
      <div class="section-label">用户请求</div>
      <div class="request-content">{{ session.userRequest }}</div>
    </div>

    <!-- Plan (if available) -->
    <div v-if="session.orchestratorPlan" class="plan-section">
      <div class="section-label">执行计划</div>
      <pre class="plan-content">{{ session.orchestratorPlan }}</pre>
    </div>

    <!-- Tasks overview -->
    <div class="tasks-overview">
      <div class="tasks-stats">
        <div class="stat-item">
          <span class="stat-value">{{ pendingTasks.length }}</span>
          <span class="stat-label">等待</span>
        </div>
        <div class="stat-item active">
          <span class="stat-value">{{ inProgressTasks.length }}</span>
          <span class="stat-label">执行中</span>
        </div>
        <div class="stat-item completed">
          <span class="stat-value">{{ completedTasks.filter(t => t.status === TaskStatus.COMPLETED).length }}</span>
          <span class="stat-label">完成</span>
        </div>
        <div class="stat-item failed">
          <span class="stat-value">{{ completedTasks.filter(t => t.status === TaskStatus.FAILED).length }}</span>
          <span class="stat-label">失败</span>
        </div>
      </div>
    </div>

    <!-- Task lists -->
    <div class="task-lists">
      <!-- In Progress -->
      <div v-if="inProgressTasks.length > 0" class="task-section">
        <div class="section-label">执行中</div>
        <div class="task-list">
          <div v-for="task in inProgressTasks" :key="task.id" class="task-card in-progress">
            <div class="task-header">
              <span class="task-title">{{ task.title }}</span>
              <span class="task-status" :class="getStatusClass(task.status)">
                {{ getStatusLabel(task.status) }}
              </span>
            </div>
            <div class="task-meta">
              <span v-if="task.claimedBy">Agent: {{ task.claimedBy }}</span>
              <span v-if="task.startedAt">开始: {{ formatTime(task.startedAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending -->
      <div v-if="pendingTasks.length > 0" class="task-section">
        <div class="section-label">等待中 ({{ pendingTasks.length }})</div>
        <div class="task-list compact">
          <div v-for="task in pendingTasks" :key="task.id" class="task-card pending">
            <span class="task-title">{{ task.title }}</span>
            <span class="priority">P{{ task.priority }}</span>
          </div>
        </div>
      </div>

      <!-- Completed -->
      <div v-if="completedTasks.length > 0" class="task-section">
        <div class="section-label">已完成 ({{ completedTasks.length }})</div>
        <div class="task-list compact">
          <div
            v-for="task in completedTasks"
            :key="task.id"
            class="task-card"
            :class="{ completed: task.status === TaskStatus.COMPLETED, failed: task.status === TaskStatus.FAILED }"
          >
            <span class="task-title">{{ task.title }}</span>
            <span class="task-status" :class="getStatusClass(task.status)">
              {{ getStatusLabel(task.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Final output -->
    <div v-if="session.finalOutput" class="output-section">
      <div class="section-label">最终输出</div>
      <div class="output-content">{{ session.finalOutput }}</div>
    </div>
  </div>
</template>

<style scoped>
.execution-view {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #eee;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.execution-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.status-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.status-planning { background: #e8f4fd; color: #4a90d9; }
.status-executing { background: #f0fdf4; color: #166534; }
.status-integrating { background: #fef9c3; color: #854d0e; }
.status-completed { background: #f0fdf4; color: #166534; }
.status-failed { background: #fee; color: #c00; }
.status-cancelled { background: #f5f5f5; color: #666; }

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #666;
}

.metrics {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
}

.cancel-btn {
  margin-left: auto;
  padding: 6px 16px;
  background: #fee;
  color: #c00;
  border: 1px solid #fcc;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #fdd;
}

.progress-bar {
  height: 4px;
  background: #eee;
  border-radius: 2px;
  margin-bottom: 16px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #333;
  transition: width 0.3s;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: #999;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.request-section {
  margin-bottom: 16px;
}

.request-content {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: #333;
  border: 1px solid #eee;
}

.plan-section {
  margin-bottom: 16px;
}

.plan-content {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
  color: #333;
  border: 1px solid #eee;
}

.tasks-overview {
  margin-bottom: 16px;
}

.tasks-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  border: 1px solid #eee;
}

.stat-item.active { background: #f0fdf4; border-color: #bbf7d0; }
.stat-item.completed { background: #f0fdf4; border-color: #bbf7d0; }
.stat-item.failed { background: #fee; border-color: #fecaca; }

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 11px;
  color: #666;
}

.task-lists {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-section {
  /* Section styles */
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-list.compact {
  gap: 4px;
}

.task-card {
  background: #f5f5f5;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.task-card.in-progress {
  border-left: 3px solid #333;
  background: #fff;
}

.task-card.pending {
  padding: 8px 12px;
}

.task-card.completed {
  opacity: 0.7;
}

.task-card.failed {
  border-left: 3px solid #c00;
  opacity: 0.7;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.task-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.task-status-pending { background: #f5f5f5; color: #666; border: 1px solid #eee; }
.task-status-claimed { background: #e8f4fd; color: #4a90d9; }
.task-status-in_progress { background: #f0fdf4; color: #166534; }
.task-status-completed { background: #f0fdf4; color: #166534; }
.task-status-failed { background: #fee; color: #c00; }

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #666;
}

.priority {
  font-size: 10px;
  background: #eee;
  color: #666;
  padding: 2px 6px;
  border-radius: 4px;
}

.output-section {
  margin-top: 16px;
}

.output-content {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  white-space: pre-wrap;
  color: #333;
  border: 1px solid #eee;
}
</style>
