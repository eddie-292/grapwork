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
</script>

<template>
  <div class="execution-view">
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
  background: var(--color-bg-primary, #fff);
  padding: 12px 16px;
  border: 1px solid var(--color-border, #eee);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-height: 250px;
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
