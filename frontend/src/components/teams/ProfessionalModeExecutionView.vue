<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ProfessionalSession, ProfessionalPhase } from '@/types/agentTeam'
import {
  ProfessionalPhase as PhaseEnum,
  getPhaseDisplayName,
  getPhaseStatusClass,
  TaskStatus
} from '@/types/agentTeam'
import SubSessionHistoryModal from './SubSessionHistoryModal.vue'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
})

const props = defineProps<{
  session: ProfessionalSession
}>()

const emit = defineEmits<{
  cancel: []
  confirmPhase: [confirmed: boolean, notes?: string]
  viewSubSession: [sessionId: string, workerId: string]
}>()

const showHistoryModal = ref(false)
const expandedSections = ref<Record<string, boolean>>({
  requirements: true,
  planning: true,
  workers: true,
  review: true
})

const confirmNotes = ref('')
const showConfirmDialog = ref(false)

// Computed
const currentPhase = computed(() => props.session.currentPhase)
const phaseState = computed(() => props.session.phaseState)

const pendingTasks = computed(() => props.session.taskQueue.pending)
const inProgressTasks = computed(() => props.session.taskQueue.inProgress)
const completedTasks = computed(() => props.session.taskQueue.completed)

const workersList = computed(() => Object.values(props.session.dynamicWorkers))
const activeWorkers = computed(() => workersList.value.filter(w => w.status === 'busy'))

const isWaitingUser = computed(() => phaseState.value.status === 'waiting_user')
const isPhaseBlocked = computed(() => phaseState.value.status === 'blocked')

// Type guard for execution phase state
const isExecutionPhase = computed(() => (phaseState.value as any).phase === 'execution')

const phaseProgress = computed(() => {
  const phases: ProfessionalPhase[] = [
    PhaseEnum.REQUIREMENTS,
    PhaseEnum.ISOLATION,
    PhaseEnum.PLANNING,
    PhaseEnum.TEST_FIRST,
    PhaseEnum.EXECUTION,
    PhaseEnum.REVIEW,
    PhaseEnum.COMPLETION
  ]
  const currentIndex = phases.indexOf(props.session.currentPhase)
  const completedPhases = props.session.phaseHistory.filter(h => h.status === 'completed').length
  return {
    current: currentIndex + 1,
    total: phases.length,
    percentage: (completedPhases / phases.length) * 100
  }
})

// Methods
function toggleSection(section: string) {
  expandedSections.value[section] = !expandedSections.value[section]
}

function render(content: string): string {
  return md.render(content)
}

function handleConfirmPhase(confirmed: boolean) {
  emit('confirmPhase', confirmed, confirmed ? confirmNotes.value : undefined)
  showConfirmDialog.value = false
  confirmNotes.value = ''
}

function handleViewSubSession(sessionId: string, workerId: string) {
  emit('viewSubSession', sessionId, workerId)
}
</script>

<template>
  <div class="professional-execution-view">
    <!-- Phase Progress Bar -->
    <div class="phase-progress">
      <div class="progress-header">
        <span class="progress-title">专业模式进度</span>
        <span class="progress-fraction">{{ phaseProgress.current }}/{{ phaseProgress.total }}</span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${phaseProgress.percentage}%` }"
        ></div>
      </div>
      <div class="phase-indicators">
        <div
          v-for="phase in [PhaseEnum.REQUIREMENTS, PhaseEnum.ISOLATION, PhaseEnum.PLANNING, PhaseEnum.TEST_FIRST, PhaseEnum.EXECUTION, PhaseEnum.REVIEW, PhaseEnum.COMPLETION]"
          :key="phase"
          class="phase-indicator"
          :class="{
            active: phase === currentPhase,
            completed: session.phaseHistory.some(h => h.phase === phase && h.status === 'completed')
          }"
          :title="getPhaseDisplayName(phase)"
        >
          <span class="indicator-dot"></span>
          <span class="indicator-label">{{ getPhaseDisplayName(phase) }}</span>
        </div>
      </div>
    </div>

    <!-- Current Phase Status -->
    <div class="current-phase-banner" :class="getPhaseStatusClass(phaseState.status)">
      <span class="phase-name">{{ getPhaseDisplayName(currentPhase) }}</span>
      <span class="phase-status">{{ phaseState.status }}</span>
      <span v-if="isWaitingUser" class="waiting-badge">等待用户确认</span>
      <span v-if="isPhaseBlocked" class="blocked-badge">已阻塞</span>
      <button v-if="!isWaitingUser && phaseState.status !== 'completed'" class="btn-cancel-execution" @click="emit('cancel')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        取消执行
      </button>
    </div>

    <!-- Phase 1: Requirements -->
    <div v-if="phaseState.phase === 'requirements'" class="phase-section requirements-phase">
      <div class="section-header" @click="toggleSection('requirements')">
        <span class="section-label">阶段 1: 需求确认</span>
        <span class="toggle-icon">{{ expandedSections.requirements ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.requirements" class="phase-content">
        <div class="ai-understanding">
          <div class="subsection-label">AI 理解</div>
          <div class="understanding-content" v-html="render((phaseState as any).aiUnderstanding || '')"></div>
        </div>
        <div v-if="(phaseState as any).questions?.length > 0" class="questions-section">
          <div class="subsection-label">关键问题 ({{ (phaseState as any).questions.length }}/3)</div>
          <div v-for="q in (phaseState as any).questions" :key="q.id" class="question-item">
            <div class="question-text">{{ q.question }}</div>
            <div v-if="q.userAnswer" class="user-answer">
              <span class="label">用户回答:</span> {{ q.userAnswer }}
            </div>
            <div class="question-status" :class="{ confirmed: q.confirmed }">
              {{ q.confirmed ? '✓ 已确认' : '等待确认' }}
            </div>
          </div>
        </div>
        <div v-if="isWaitingUser" class="user-action-panel">
          <p>请确认 AI 是否正确理解了需求，或回答问题</p>
          <button class="btn-confirm" @click="showConfirmDialog = true">确认理解正确</button>
          <button class="btn-correct" @click="showConfirmDialog = true">需要纠正</button>
        </div>
      </div>
    </div>

    <!-- Phase 2: Isolation -->
    <div v-if="phaseState.phase === 'isolation'" class="phase-section isolation-phase">
      <div class="section-label">阶段 2: 隔离环境</div>
      <div class="phase-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">工作目录:</span>
            <code>{{ (phaseState as any).workspacePath || '初始化中...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">Git 分支:</span>
            <code>{{ (phaseState as any).gitBranch || '创建中...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">状态:</span>
            <span :class="`status-${(phaseState as any).gitBranchCreated ? 'ready' : 'pending'}`">
              {{ (phaseState as any).gitBranchCreated ? '✓ 已就绪' : '初始化中' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Phase 3: Planning -->
    <div v-if="phaseState.phase === 'planning'" class="phase-section planning-phase">
      <div class="section-header" @click="toggleSection('planning')">
        <span class="section-label">阶段 3: 计划制定</span>
        <span class="toggle-icon">{{ expandedSections.planning ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.planning" class="phase-content">
        <div class="planning-summary">
          <div class="summary-stats">
            <div class="stat">
              <span class="stat-value">{{ (phaseState as any).breakdown?.length || 0 }}</span>
              <span class="stat-label">任务数</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ (phaseState as any).estimatedAgents || 0 }}</span>
              <span class="stat-label">预计 Agents</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ (phaseState as any).fileScope?.length || 0 }}</span>
              <span class="stat-label">涉及文件</span>
            </div>
          </div>
        </div>
        <div v-if="(phaseState as any).breakdown?.length > 0" class="task-breakdown">
          <div class="subsection-label">任务拆分</div>
          <div v-for="task in (phaseState as any).breakdown" :key="task.id" class="breakdown-task">
            <div class="task-title">{{ task.title }}</div>
            <div class="task-desc">{{ task.description }}</div>
            <div class="task-meta">
              <span>预期产出：{{ task.expectedOutput }}</span>
              <span>验证标准：{{ task.verificationCriteria }}</span>
              <span v-if="task.dependencies">依赖：{{ task.dependencies.join(', ') }}</span>
            </div>
          </div>
        </div>
        <div v-if="isWaitingUser" class="user-action-panel">
          <p>请确认任务拆分是否合理</p>
          <textarea
            v-model="confirmNotes"
            class="notes-input"
            placeholder="输入备注或修改建议（可选）"
          ></textarea>
          <button class="btn-confirm" @click="handleConfirmPhase(true)">确认</button>
          <button class="btn-correct" @click="handleConfirmPhase(false)">需要修改</button>
        </div>
      </div>
    </div>

    <!-- Phase 4: Test First -->
    <div v-if="phaseState.phase === 'test_first'" class="phase-section test-first-phase">
      <div class="section-label">阶段 4: 测试先行</div>
      <div class="phase-content">
        <div v-if="(phaseState as any).testFiles?.length > 0" class="test-files">
          <div class="subsection-label">生成的测试文件</div>
          <ul class="file-list">
            <li v-for="file in (phaseState as any).testFiles" :key="file" class="file-item">
              <span class="file-icon">📄</span> {{ file }}
            </li>
          </ul>
        </div>
        <div class="lock-status" :class="{ locked: (phaseState as any).testsLocked }">
          <span class="lock-icon">{{ (phaseState as any).testsLocked ? '🔒' : '🔓' }}</span>
          <span>测试{{ (phaseState as any).testsLocked ? '已锁定（不允许修改）' : '未锁定' }}</span>
        </div>
      </div>
    </div>

    <!-- Phase 5: Execution -->
    <div v-if="isExecutionPhase" class="phase-section execution-phase">
      <div class="section-header" @click="toggleSection('workers')">
        <span class="section-label">阶段 5: 子代理执行 ({{ activeWorkers.length }}/{{ workersList.length }} 活跃)</span>
        <span class="toggle-icon">{{ expandedSections.workers ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.workers" class="workers-grid">
        <div v-for="worker in workersList" :key="worker.id" class="worker-card">
          <div class="worker-header">
            <span class="worker-name">{{ worker.name }}</span>
            <span class="worker-status" :class="`status-${worker.status}`">
              {{ worker.status }}
            </span>
          </div>
          <div v-if="worker.focusArea" class="worker-focus">专注：{{ worker.focusArea }}</div>
          <div class="worker-progress">
            已完成：{{ worker.completedTaskIds.length }} 个任务
          </div>
        </div>
      </div>
      <!-- Task Stats -->
      <div class="task-stats">
        <div class="stat-item pending">
          <span class="stat-value">{{ pendingTasks.length }}</span>
          <span class="stat-label">等待</span>
        </div>
        <div class="stat-item in-progress">
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

    <!-- Phase 6: Review -->
    <div v-if="phaseState.phase === 'review'" class="phase-section review-phase">
      <div class="section-header" @click="toggleSection('review')">
        <span class="section-label">阶段 6: 两阶段审查</span>
        <span class="review-stage">{{ (phaseState as any).stage === 'initial' ? '初审' : '复审' }} ({{ (phaseState as any).reReviewCount || 0 }})</span>
        <span class="toggle-icon">{{ expandedSections.review ? '▼' : '▶' }}</span>
      </div>
      <div v-show="expandedSections.review" class="phase-content">
        <div class="review-summary">
          <div class="test-status" :class="{ passed: (phaseState as any).allTestsPassed }">
            <span class="status-icon">{{ (phaseState as any).allTestsPassed ? '✓' : '✗' }}</span>
            测试：{{ (phaseState as any).allTestsPassed ? '全绿' : '有失败' }}
          </div>
        </div>
        <div v-if="(phaseState as any).blockingIssues?.length > 0" class="issues-section">
          <div class="subsection-label">严重问题 ({{ (phaseState as any).blockingIssues.length }})</div>
          <div v-for="issue in (phaseState as any).blockingIssues" :key="issue.id" class="issue-item blocking">
            <span class="issue-severity">严重</span>
            <span class="issue-description">{{ issue.description }}</span>
            <span v-if="issue.suggestion" class="issue-suggestion">建议：{{ issue.suggestion }}</span>
            <span class="issue-status" :class="{ fixed: issue.fixed }">{{ issue.fixed ? '✓ 已修复' : '未修复' }}</span>
          </div>
        </div>
        <div v-if="(phaseState as any).minorIssues?.length > 0" class="issues-section">
          <div class="subsection-label">轻微问题 ({{ (phaseState as any).minorIssues.length }})</div>
          <div v-for="issue in (phaseState as any).minorIssues" :key="issue.id" class="issue-item minor">
            <span class="issue-severity">轻微</span>
            <span class="issue-description">{{ issue.description }}</span>
            <span class="issue-status" :class="{ fixed: issue.fixed }">{{ issue.fixed ? '✓ 已修复' : '未修复' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Phase 7: Completion -->
    <div v-if="phaseState.phase === 'completion'" class="phase-section completion-phase">
      <div class="section-label">阶段 7: 收尾验收</div>
      <div class="phase-content">
        <div class="acceptance-criteria">
          <div class="criteria-item" :class="{ met: (phaseState as any).criteria?.allTestsPassed }">
            <span class="criteria-icon">{{ (phaseState as any).criteria?.allTestsPassed ? '✓' : '✗' }}</span>
            测试全绿
          </div>
          <div class="criteria-item" :class="{ met: (phaseState as any).criteria?.noBlockingIssues }">
            <span class="criteria-icon">{{ (phaseState as any).criteria?.noBlockingIssues ? '✓' : '✗' }}</span>
            无 blocking 问题
          </div>
          <div class="criteria-item" :class="{ met: (phaseState as any).criteria?.coverageMet }">
            <span class="criteria-icon">{{ (phaseState as any).criteria?.coverageMet ? '✓' : '✗' }}</span>
            覆盖率达标
          </div>
          <div class="criteria-item" :class="{ met: (phaseState as any).criteria?.codeReviewPassed }">
            <span class="criteria-icon">{{ (phaseState as any).criteria?.codeReviewPassed ? '✓' : '✗' }}</span>
            代码审查通过
          </div>
        </div>
        <div class="completion-action">
          <span class="action-label">执行操作:</span>
          <span class="action-type" :class="`action-${(phaseState as any).action}`">
            {{ (phaseState as any).action === 'merge' ? '合并分支' : '创建 PR' }}
          </span>
          <a v-if="(phaseState as any).prUrl" :href="(phaseState as any).prUrl" target="_blank" class="pr-link">
            查看 PR →
          </a>
        </div>
      </div>
    </div>

    <!-- User Request (always visible) -->
    <div class="request-section">
      <div class="section-label">用户请求</div>
      <div class="request-content" v-html="render(session.userRequest)"></div>
    </div>

    <!-- History Modal -->
    <SubSessionHistoryModal
      :visible="showHistoryModal"
      :parentSessionId="session.id"
      @close="showHistoryModal = false"
      @selectSession="(s) => handleViewSubSession(session.id, s.workerId)"
    />

    <!-- Confirm Dialog -->
    <div v-if="showConfirmDialog" class="dialog-overlay" @click="showConfirmDialog = false">
      <div class="dialog-content" @click.stop>
        <h3>确认阶段完成</h3>
        <textarea
          v-model="confirmNotes"
          class="dialog-notes"
          placeholder="输入备注或修改建议（可选）"
          rows="4"
        ></textarea>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="showConfirmDialog = false">取消</button>
          <button class="btn-confirm" @click="handleConfirmPhase(true)">确认</button>
          <button class="btn-correct" @click="handleConfirmPhase(false)">需要修改</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.professional-execution-view {
  background: var(--color-bg-primary);
  padding: 16px;
  border: 1px solid var(--color-border);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-height: 600px;
  overflow-y: auto;
}

/* Phase Progress */
.phase-progress {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.progress-fraction {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.progress-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.phase-indicators {
  display: flex;
  gap: 4px;
  overflow-x: auto;
}

.phase-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.phase-indicator.active {
  background: var(--color-bg-info);
  color: var(--color-text-primary);
}

.phase-indicator.completed {
  color: var(--color-status-completed);
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.indicator-label {
  font-size: 9px;
}

/* Current Phase Banner */
.current-phase-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 12px;
}

.phase-name {
  font-weight: 600;
}

.phase-status {
  color: var(--color-text-secondary);
}

.waiting-badge,
.blocked-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.waiting-badge {
  background: var(--color-bg-warning);
  color: #92400e;
}

@media (prefers-color-scheme: dark) {
  .waiting-badge {
    color: #fcd34d;
  }
}

.blocked-badge {
  background: var(--color-status-failed-bg);
  color: var(--color-status-failed);
}

/* Phase Status Colors */
.phase-pending { background: var(--color-bg-secondary); }
.phase-in-progress { background: var(--color-bg-info); }
.phase-waiting { background: var(--color-bg-warning); }
.phase-completed { background: var(--color-status-completed-bg); }
.phase-blocked { background: var(--color-status-failed-bg); }

/* Sections */
.phase-section {
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: background 0.2s;
}

.section-header:hover {
  background: var(--color-bg-hover);
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.toggle-icon {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.phase-content {
  padding: 12px;
}

.subsection-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

/* Requirements Phase */
.ai-understanding {
  margin-bottom: 12px;
}

.understanding-content {
  background: var(--color-bg-secondary);
  padding: 10px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
}

.question-item {
  padding: 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  margin-bottom: 8px;
}

.question-text {
  font-weight: 500;
  margin-bottom: 6px;
}

.user-answer {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.label {
  font-weight: 500;
}

.question-status {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.question-status.confirmed {
  color: var(--color-status-completed);
}

/* Planning Phase */
.planning-summary {
  margin-bottom: 12px;
}

.summary-stats {
  display: flex;
  gap: 16px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.breakdown-task {
  padding: 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid var(--color-primary);
}

.task-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.task-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.task-meta {
  font-size: 11px;
  color: var(--color-text-tertiary);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Test First Phase */
.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 4px;
}

.lock-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 12px;
}

.lock-status.locked {
  background: var(--color-status-completed-bg);
  color: var(--color-status-completed);
}

/* Workers Grid */
.workers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.worker-card {
  padding: 10px;
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
}

.worker-status {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
}

.worker-status.idle { background: var(--color-status-idle-bg); color: var(--color-status-idle); }
.worker-status.busy { background: var(--color-status-working-bg); color: var(--color-status-working); }
.worker-status.completed { background: var(--color-status-completed-bg); color: var(--color-status-completed); }

.worker-focus,
.worker-progress {
  font-size: 10px;
  color: var(--color-text-secondary);
}

/* Task Stats */
.task-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  flex: 1;
}

.stat-item.pending { background: var(--color-status-idle-bg); }
.stat-item.in-progress { background: var(--color-status-working-bg); }
.stat-item.completed { background: var(--color-status-completed-bg); }
.stat-item.failed { background: var(--color-status-failed-bg); }

/* Review Phase */
.review-stage {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.review-summary {
  margin-bottom: 12px;
}

.test-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--color-status-failed-bg);
  color: var(--color-status-failed);
  border-radius: 6px;
}

.test-status.passed {
  background: var(--color-status-completed-bg);
  color: var(--color-status-completed);
}

.issue-item {
  padding: 8px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  margin-bottom: 6px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.issue-item.blocking {
  border-left: 3px solid var(--color-status-failed);
}

.issue-item.minor {
  border-left: 3px solid var(--color-text-tertiary);
}

.issue-severity {
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.issue-item.blocking .issue-severity {
  background: var(--color-status-failed-bg);
  color: var(--color-status-failed);
}

.issue-item.minor .issue-severity {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.issue-description {
  flex: 1;
}

.issue-suggestion {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.issue-status {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.issue-status.fixed {
  color: var(--color-status-completed);
}

/* Completion Phase */
.acceptance-criteria {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.criteria-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.criteria-item.met {
  background: var(--color-status-completed-bg);
  color: var(--color-status-completed);
}

.criteria-icon {
  font-weight: 700;
}

.completion-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--color-bg-info);
  border-radius: 6px;
}

.action-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.action-type {
  font-weight: 600;
  font-size: 13px;
}

.action-merge { color: var(--color-status-completed); }
.action-pr { color: var(--color-primary); }

.pr-link {
  margin-left: auto;
  color: var(--color-primary);
  text-decoration: none;
  font-size: 12px;
}

.pr-link:hover {
  text-decoration: underline;
}

/* Request Section */
.request-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.request-content {
  background: var(--color-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
}

/* User Action Panel */
.user-action-panel {
  margin-top: 12px;
  padding: 12px;
  background: var(--color-bg-warning);
  border-radius: 8px;
  text-align: center;
}

.user-action-panel p {
  margin-bottom: 12px;
  font-size: 13px;
}

.notes-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 8px;
}

.notes-input::placeholder {
  color: var(--color-text-tertiary);
}

.btn-confirm,
.btn-correct {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  margin: 0 4px;
  transition: all 0.2s;
}

.btn-confirm {
  background: var(--color-status-completed);
  color: white;
}

.btn-confirm:hover {
  opacity: 0.9;
}

.btn-correct {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-correct:hover {
  background: var(--color-bg-hover);
}

/* Dialog */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: var(--color-bg-primary);
  padding: 24px;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
}

.dialog-content h3 {
  margin-bottom: 16px;
  font-size: 16px;
  color: var(--color-text-primary);
}

.dialog-notes {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 16px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-primary);
}

.btn-cancel:hover {
  background: var(--color-bg-hover);
}

/* Cancel Execution Button */
.btn-cancel-execution {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-status-failed-bg);
  color: var(--color-status-failed);
  border: 1px solid var(--color-status-failed-bg);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel-execution:hover {
  opacity: 0.8;
}

.btn-cancel-execution svg {
  width: 14px;
  height: 14px;
}
</style>
