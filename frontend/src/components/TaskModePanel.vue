<script setup lang="ts">
import type { Task } from '../types/task'

interface Props {
  isTaskPlanning: boolean
  isTaskExecuting: boolean
  currentTaskIndex: number
  taskList: Task[]
  awaitingTaskConfirmation: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="task-panel">
    <div class="task-panel-header" v-if="taskList.length > 0">
      <h3>任务进度</h3>
      <div class="task-status-badge" :class="{ planning: isTaskPlanning, executing: isTaskExecuting, awaiting: awaitingTaskConfirmation }">
        <span v-if="isTaskPlanning">规划中</span>
        <span v-else-if="isTaskExecuting">执行中</span>
        <span v-else-if="awaitingTaskConfirmation">等待确认</span>
        <span v-else>已完成</span>
      </div>
    </div>

    <!-- 确认/取消按钮区域 -->
    <div v-if="awaitingTaskConfirmation" class="task-confirmation">
      <button class="confirm-btn" @click="emit('confirm')">
        <span>✓</span>
        <span>开始执行</span>
      </button>
      <button class="cancel-btn" @click="emit('cancel')">
        <span>✕</span>
        <span>取消</span>
      </button>
    </div>

    <div v-if="taskList.length === 0" class="task-panel-empty">
      <p>暂无任务</p>
    </div>

    <div v-else class="task-list">
      <div
        v-for="(task, idx) in taskList"
        :key="task.id"
        :class="['task-item', { active: idx === currentTaskIndex, completed: task.completed }]"
      >
        <div class="task-icon">
          <span v-if="task.completed">✓</span>
          <span v-else-if="idx === currentTaskIndex" class="active-icon">◉</span>
          <span v-else>○</span>
        </div>
        <div class="task-content">
          <span class="task-number">{{ idx + 1 }}</span>
          <span class="task-description">{{ task.description }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-panel {
  width: 300px;
  height: 100%;
  background: #f9fafb;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.task-panel-header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.task-status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.task-status-badge.planning {
  background: #fef3c7;
  color: #92400e;
}

.task-status-badge.executing {
  background: #d1fae5;
  color: #065f46;
}

.task-status-badge.awaiting {
  background: #fef3c7;
  color: #92400e;
}

.task-status-badge:not(.planning):not(.executing):not(.awaiting) {
  background: #e0e7ff;
  color: #3730a3;
}

.task-panel-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: #9ca3af;
  font-size: 14px;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.task-item.active {
  border-color: #10a37f;
  background: #f0fdf4;
}

.task-item.completed {
  opacity: 0.6;
}

.task-item.completed .task-description {
  text-decoration: line-through;
}

.task-icon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  color: #6b7280;
}

.task-item.active .task-icon {
  color: #10a37f;
}

.task-item.completed .task-icon {
  color: #059669;
}

.active-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.task-content {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.task-number {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}

.task-item.active .task-number {
  background: #10a37f;
  color: #ffffff;
}

.task-description {
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
  word-break: break-word;
}

.task-item.active .task-description {
  color: #065f46;
  font-weight: 500;
}

/* 确认/取消按钮区域 */
.task-confirmation {
  padding: 12px 16px;
  display: flex;
  gap: 8px;
  border-top: 1px solid #e5e7eb;
}

.confirm-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: #10a37f;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.confirm-btn:hover {
  background: #0d8a6c;
}

.confirm-btn span:first-child {
  font-size: 14px;
  font-weight: 600;
}

.cancel-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #e5e7eb;
  color: #dc2626;
  border-color: #dc2626;
}

.cancel-btn span:first-child {
  font-size: 14px;
  font-weight: 600;
}
</style>
