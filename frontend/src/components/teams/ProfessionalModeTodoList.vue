<script setup lang="ts">
import { computed } from 'vue'
import type { ProfessionalSession } from '@/types/agentTeam'
import { ProfessionalPhase, getPhaseDisplayName } from '@/types/agentTeam'

const props = defineProps<{
  session: ProfessionalSession
}>()

// 计算各阶段完成状态
const phaseCompletionStatus = computed(() => {
  const phases: ProfessionalPhase[] = [
    ProfessionalPhase.REQUIREMENTS,
    ProfessionalPhase.ISOLATION,
    ProfessionalPhase.PLANNING,
    ProfessionalPhase.TEST_FIRST,
    ProfessionalPhase.EXECUTION,
    ProfessionalPhase.REVIEW,
    ProfessionalPhase.COMPLETION
  ]

  return phases.map(phase => {
    const history = props.session.phaseHistory.find(h => h.phase === phase)
    return {
      phase,
      displayName: getPhaseDisplayName(phase),
      status: history?.status || 'pending',
      isCurrent: phase === props.session.currentPhase
    }
  })
})

// 计算整体进度
const overallProgress = computed(() => {
  const phases = phaseCompletionStatus.value
  const completed = phases.filter(p => p.status === 'completed').length
  return {
    current: phases.findIndex(p => p.isCurrent) + 1,
    total: phases.length,
    percentage: (completed / phases.length) * 100
  }
})

// 获取阶段状态对应的样式类
function getStatusClass(status: string, isCurrent: boolean): string {
  if (isCurrent) return 'todo-item-current'
  if (status === 'completed') return 'todo-item-completed'
  if (status === 'blocked') return 'todo-item-blocked'
  if (status === 'waiting_user') return 'todo-item-waiting'
  return 'todo-item-pending'
}

// 获取阶段状态图标
function getStatusIcon(status: string, isCurrent: boolean): string {
  if (isCurrent) return '▶'
  if (status === 'completed') return '✓'
  if (status === 'blocked') return '✗'
  if (status === 'waiting_user') return '⏸'
  return '○'
}
</script>

<template>
  <div class="professional-todo-list">
    <div class="todo-header">
      <span class="todo-title">专业模式进度</span>
      <span class="todo-progress">{{ overallProgress.current }}/{{ overallProgress.total }}</span>
    </div>

    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div
        class="progress-bar-fill"
        :style="{ width: `${overallProgress.percentage}%` }"
      ></div>
    </div>

    <!-- TODO 列表 -->
    <div class="todo-items">
      <div
        v-for="item in phaseCompletionStatus"
        :key="item.phase"
        class="todo-item"
        :class="getStatusClass(item.status, item.isCurrent)"
      >
        <span class="todo-icon">{{ getStatusIcon(item.status, item.isCurrent) }}</span>
        <span class="todo-label">{{ item.displayName }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.professional-todo-list {
  padding: 12px;
  background: var(--color-bg-secondary);
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.todo-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.todo-progress {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.progress-bar-container {
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  transition: all 0.2s;
}

.todo-item-pending {
  color: var(--color-text-tertiary);
  background: var(--color-bg-tertiary);
}

.todo-item-current {
  color: var(--color-text-primary);
  background: var(--color-bg-info);
  font-weight: 500;
}

.todo-item-completed {
  color: var(--color-status-completed);
  background: var(--color-status-completed-bg);
}

.todo-item-blocked {
  color: var(--color-status-failed);
  background: var(--color-status-failed-bg);
}

.todo-item-waiting {
  color: #92400e;
  background: var(--color-bg-warning);
}

@media (prefers-color-scheme: dark) {
  .todo-item-waiting {
    color: #fcd34d;
  }
}

.todo-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-size: 12px;
}

.todo-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
