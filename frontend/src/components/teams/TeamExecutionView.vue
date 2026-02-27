<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import type { TeamSession } from '@/types/agentTeam'
import { TaskStatus, OrchestratorAction } from '@/types/agentTeam'
import SubSessionHistoryModal from './SubSessionHistoryModal.vue'

// Markdown renderer
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
})

const props = defineProps<{
  session: TeamSession
}>()

const emit = defineEmits<{
  cancel: []
  viewSubSession: [sessionId: string, workerId: string]
}>()

// State
const showHistoryModal = ref(false)
const expandedSections = ref({
  decisions: false,
  workers: true
})

// Computed
const pendingTasks = computed(() => props.session.taskQueue.pending)
const inProgressTasks = computed(() => props.session.taskQueue.inProgress)
const completedTasks = computed(() => props.session.taskQueue.completed)

const workersList = computed(() => {
  return Object.values(props.session.dynamicWorkers)
})

const activeWorkers = computed(() => {
  return workersList.value.filter(w => w.status === 'busy')
})

const completedWorkers = computed(() => {
  return workersList.value.filter(w => w.status === 'completed')
})

const recentDecisions = computed(() => {
  return props.session.orchestratorDecisions.slice(-5).reverse()
})

const aggregationProgress = computed(() => {
  const total = workersList.value.length
  const completed = completedWorkers.value.length
  return { total, completed }
})

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

function getActionLabel(action: OrchestratorAction): string {
  switch (action) {
    case OrchestratorAction.CREATE_WORKER: return '创建 Worker'
    case OrchestratorAction.ASSIGN_TASK: return '分配任务'
    case OrchestratorAction.CREATE_TASK: return '创建任务'
    case OrchestratorAction.INTEGRATE_RESULTS: return '整合结果'
    case OrchestratorAction.COMPLETE: return '完成执行'
    case OrchestratorAction.REQUEST_INFO: return '请求信息'
    default: return action
  }
}

function getWorkerStatusLabel(status: string): string {
  switch (status) {
    case 'idle': return '空闲'
    case 'busy': return '忙碌'
    case 'completed': return '完成'
    default: return status
  }
}

function getWorkerStatusClass(status: string): string {
  return `worker-status-${status}`
}

function toggleSection(section: 'decisions' | 'workers') {
  expandedSections.value[section] = !expandedSections.value[section]
}

function openHistoryModal() {
  showHistoryModal.value = true
}

function handleViewSubSession(sessionId: string, workerId: string) {
  emit('viewSubSession', sessionId, workerId)
}

function render(content: string): string {
  return md.render(content)
}
</script>

<template>
  <div class="execution-view">
    <!-- Header with history button -->
    <div class="view-header">
      <div class="header-left">
        <span class="status-badge" :class="`session-status-${session.status}`">
          {{ session.status }}
        </span>
      </div>
      <button class="history-btn" @click="openHistoryModal">
        <span>历史记录</span>
      </button>
    </div>

    <!-- User request -->
    <div class="request-section">
      <div class="section-label">用户请求</div>
      <div class="request-content" v-html="render(session.userRequest)"></div>
    </div>

    <!-- Plan (if available) -->
    <div v-if="session.orchestratorPlan" class="plan-section">
      <div class="section-label">执行计划</div>
      <pre class="plan-content">{{ session.orchestratorPlan }}</pre>
    </div>

    <!-- Decision Timeline -->
    <div v-if="session.orchestratorDecisions.length > 0" class="decision-section">
      <div class="section-header" @click="toggleSection('decisions')">
        <span class="section-label">决策时间线</span>
        <span class="toggle-icon">{{ expandedSections.decisions ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.decisions" class="decision-timeline">
        <div
          v-for="(decision, index) in recentDecisions"
          :key="index"
          class="decision-item"
          :class="`action-${decision.action}`"
        >
          <div class="decision-time">{{ formatTime(decision.timestamp) }}</div>
          <div class="decision-action">{{ getActionLabel(decision.action) }}</div>
          <div class="decision-reasoning" v-if="decision.reasoning">
            {{ decision.reasoning.slice(0, 100) }}{{ decision.reasoning.length > 100 ? '...' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Workers Status -->
    <div v-if="workersList.length > 0" class="workers-section">
      <div class="section-header" @click="toggleSection('workers')">
        <span class="section-label">Workers ({{ activeWorkers.length }}/{{ workersList.length }} 活跃)</span>
        <span class="toggle-icon">{{ expandedSections.workers ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.workers" class="workers-list">
        <div v-for="worker in workersList" :key="worker.id" class="worker-card">
          <div class="worker-header">
            <span class="worker-name">{{ worker.name }}</span>
            <span class="worker-status" :class="getWorkerStatusClass(worker.status)">
              {{ getWorkerStatusLabel(worker.status) }}
            </span>
          </div>
          <div class="worker-focus" v-if="worker.focusArea">
            专注: {{ worker.focusArea }}
          </div>
          <div class="worker-tasks">
            已完成: {{ worker.completedTaskIds.length }} 个任务
          </div>
        </div>
      </div>
    </div>

    <!-- Aggregation Progress -->
    <div v-if="session.status === 'integrating'" class="aggregation-section">
      <div class="section-label">结果聚合中</div>
      <div class="aggregation-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${(aggregationProgress.completed / aggregationProgress.total) * 100}%` }"
          ></div>
        </div>
        <div class="progress-label">
          已收集 {{ aggregationProgress.completed }}/{{ aggregationProgress.total }} Worker 结果
        </div>
      </div>
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
      <div class="output-content" v-html="render(session.finalOutput)"></div>
    </div>

    <!-- History Modal -->
    <SubSessionHistoryModal
      :visible="showHistoryModal"
      :parentSessionId="session.id"
      @close="showHistoryModal = false"
      @selectSession="(s) => handleViewSubSession(session.id, s.workerId)"
    />
  </div>
</template>

<style scoped>
.execution-view {
  background: var(--color-bg-primary);
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-height: 400px;
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.session-status-planning { background: var(--color-bg-warning); color: #92400e; }
.session-status-executing { background: var(--color-status-working-bg); color: var(--color-status-working); }
.session-status-integrating { background: var(--color-bg-info); color: #3730a3; }
.session-status-completed { background: var(--color-status-completed-bg); color: var(--color-status-completed); }
.session-status-failed { background: var(--color-status-failed-bg); color: var(--color-status-failed); }
.session-status-cancelled { background: var(--color-status-idle-bg); color: var(--color-status-idle); }

.history-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
}

.btn-icon {
  font-size: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 4px 0;
}

.section-header:hover {
  background: var(--color-bg-hover);
  margin: -4px -8px;
  padding: 4px 8px;
  border-radius: 4px;
}

.toggle-icon {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.decision-section,
.workers-section {
  margin-bottom: 12px;
}

.decision-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.decision-item {
  padding: 8px 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 11px;
}

.decision-time {
  color: var(--color-text-tertiary);
  font-size: 10px;
}

.decision-action {
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 2px 0;
}

.decision-reasoning {
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.workers-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.worker-card {
  flex: 1;
  min-width: 140px;
  padding: 8px 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.worker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.worker-name {
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-primary);
}

.worker-status {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
}

.worker-status-idle { background: var(--color-status-idle-bg); color: var(--color-status-idle); }
.worker-status-busy { background: var(--color-status-working-bg); color: var(--color-status-working); }
.worker-status-completed { background: var(--color-status-completed-bg); color: var(--color-status-completed); }

.worker-focus,
.worker-tasks {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.aggregation-section {
  margin-bottom: 12px;
  padding: 10px;
  background: var(--color-bg-warning);
  border-radius: 8px;
}

.aggregation-progress {
  margin-top: 8px;
}

.progress-bar {
  height: 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s;
}

.progress-label {
  font-size: 11px;
  color: var(--color-text-primary);
  margin-top: 4px;
}

.progress-bar {
  height: 4px;
  background: var(--color-bg-hover);
  border-radius: 2px;
  margin-bottom: 16px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.request-section {
  margin-bottom: 16px;
}

.request-content {
  background: var(--color-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.request-content :deep(p) {
  margin: 0 0 8px 0;
}

.request-content :deep(p:last-child) {
  margin-bottom: 0;
}

.request-content :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 13px;
}

.request-content :deep(pre) {
  background: rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

.plan-section {
  margin-bottom: 16px;
}

.plan-content {
  background: var(--color-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
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
  background: var(--color-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.stat-item.active { background: var(--color-status-working-bg); border-color: var(--color-status-working); }
.stat-item.completed { background: var(--color-status-completed-bg); border-color: var(--color-status-completed); }
.stat-item.failed { background: var(--color-status-failed-bg); border-color: var(--color-status-failed); }

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-secondary);
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
  background: var(--color-bg-secondary);
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.task-card.in-progress {
  background: var(--color-bg-primary);
}

.task-card.pending {
  padding: 8px 12px;
}

.task-card.completed {
  opacity: 0.7;
}

.task-card.failed {
  border-left: 3px solid var(--color-danger);
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
  color: var(--color-text-primary);
}

.task-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.task-status-pending { background: var(--color-status-idle-bg); color: var(--color-status-idle); border: 1px solid var(--color-border); }
.task-status-claimed { background: var(--color-status-working-bg); color: var(--color-status-working); }
.task-status-in_progress { background: var(--color-status-completed-bg); color: var(--color-status-completed); }
.task-status-completed { background: var(--color-status-completed-bg); color: var(--color-status-completed); }
.task-status-failed { background: var(--color-status-failed-bg); color: var(--color-status-failed); }

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.priority {
  font-size: 10px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
}

.output-section {
  margin-top: 16px;
}

.output-content {
  background: var(--color-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.output-content :deep(p) {
  margin: 0 0 8px 0;
}

.output-content :deep(p:last-child) {
  margin-bottom: 0;
}

.output-content :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 13px;
}

.output-content :deep(pre) {
  background: rgba(0, 0, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

.output-content :deep(ul),
.output-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.output-content :deep(li) {
  margin: 4px 0;
}
</style>
