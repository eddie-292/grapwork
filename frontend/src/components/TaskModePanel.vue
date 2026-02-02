<script setup lang="ts">
import { ref } from 'vue'
import type { Task } from '../types/task'

interface TaskModeOptions {
  enableTaskSummary?: boolean
  mergeThreshold?: number
}

interface Props {
  isTaskPlanning: boolean
  isTaskExecuting: boolean
  currentTaskIndex: number
  taskList: Task[]
  awaitingTaskConfirmation: boolean
  taskModeOptions?: TaskModeOptions
  showSettings?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  updateOptions: [options: TaskModeOptions]
  toggleSettings: []
  editTasks: []
  deleteTask: [id: number]
  updateTask: [id: number, description: string]
}>()

const editingTaskId = ref<number | null>(null)
const editTaskDescription = ref('')

function startEdit(task: Task) {
  editingTaskId.value = task.id
  editTaskDescription.value = task.description
}

function cancelEdit() {
  editingTaskId.value = null
  editTaskDescription.value = ''
}

function saveEdit(taskId: number) {
  if (editTaskDescription.value.trim()) {
    emit('updateTask', taskId, editTaskDescription.value.trim())
    editingTaskId.value = null
    editTaskDescription.value = ''
  }
}

function deleteTask(taskId: number) {
  if (confirm('确定要删除这个任务吗？')) {
    emit('deleteTask', taskId)
  }
}
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
        :class="['task-item', { active: idx === currentTaskIndex, completed: task.completed, editing: editingTaskId === task.id }]"
      >
        <div class="task-icon">
          <span v-if="task.completed">✓</span>
          <span v-else-if="idx === currentTaskIndex" class="active-icon">◉</span>
          <span v-else>○</span>
        </div>
        <div class="task-content">
          <span class="task-number">{{ idx + 1 }}</span>
          <!-- 编辑模式 -->
          <div v-if="editingTaskId === task.id && awaitingTaskConfirmation" class="task-edit-mode">
            <input
              v-model="editTaskDescription"
              class="task-edit-input"
              @keyup.enter="saveEdit(task.id)"
              @keyup.escape="cancelEdit"
              ref="editInput"
            />
            <button class="task-edit-btn save" @click="saveEdit(task.id)" title="保存">✓</button>
            <button class="task-edit-btn cancel" @click="cancelEdit" title="取消">✕</button>
          </div>
          <!-- 查看模式 -->
          <template v-else>
            <span class="task-description">{{ task.description }}</span>
            <div v-if="awaitingTaskConfirmation" class="task-actions">
              <button class="task-action-btn" @click="startEdit(task)" title="编辑">✎</button>
              <button class="task-action-btn delete" @click="deleteTask(task.id)" title="删除">🗑</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="task-settings">
      <div class="settings-header">
        <h4>任务模式设置</h4>
        <button class="settings-close-btn" @click="emit('toggleSettings')">✕</button>
      </div>
      <div class="settings-content">
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              :checked="taskModeOptions?.enableTaskSummary ?? false"
              @change="emit('updateOptions', { ...taskModeOptions, enableTaskSummary: ($event.target as HTMLInputElement).checked })"
            />
            <span>启用任务总结</span>
          </label>
          <p class="setting-desc">每个任务完成后生成总结（增加 API 调用）</p>
        </div>
        <div class="setting-item">
          <label class="setting-label">整合阈值</label>
          <input
            type="number"
            :value="taskModeOptions?.mergeThreshold ?? 3"
            @input="emit('updateOptions', { ...taskModeOptions, mergeThreshold: Number(($event.target as HTMLInputElement).value) })"
            min="2"
            max="10"
            class="setting-input"
          />
          <p class="setting-desc">每 N 个任务后进行一次中间整合</p>
        </div>
      </div>
    </div>

    <!-- 设置按钮 -->
    <button v-if="!showSettings && taskList.length > 0" class="settings-toggle-btn" @click="emit('toggleSettings')" title="任务模式设置">
      <span>⚙</span>
    </button>
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
  max-width: 100%;
  overflow: hidden;
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
  min-width: 0; /* 允许 flex 子元素收缩 */
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
  flex: 1;
  min-width: 0; /* 允许文本正确换行和收缩 */
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

/* 设置面板 */
.settings-toggle-btn {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #10a37f;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(16, 163, 127, 0.3);
  transition: all 0.2s;
}

.settings-toggle-btn:hover {
  background: #0d8a6c;
  transform: scale(1.05);
}

.task-settings {
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.settings-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.settings-close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
}

.settings-close-btn:hover {
  background: #f3f4f6;
  color: #0f172a;
}

.settings-content {
  padding: 12px 16px;
  max-height: 200px;
  overflow-y: auto;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
  cursor: pointer;
}

.setting-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.setting-input {
  width: 60px;
  padding: 6px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  font-size: 13px;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
}

.setting-input:focus {
  border-color: #10a37f;
}

.setting-desc {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}

.task-panel {
  position: relative;
}

/* 任务编辑样式 */
.task-item.editing {
  border-color: #10a37f;
  background: #f0fdf4;
}

.task-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.task-action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.task-action-btn:hover {
  background: #f3f4f6;
  color: #6b7280;
}

.task-action-btn.delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

.task-edit-mode {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.task-edit-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid #10a37f;
  border-radius: 4px;
  font-size: 12px;
  color: #0f172a;
  outline: none;
}

.task-edit-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.task-edit-btn.save {
  background: #10a37f;
  color: white;
}

.task-edit-btn.save:hover {
  background: #0d8a6c;
}

.task-edit-btn.cancel {
  background: #f3f4f6;
  color: #6b7280;
}

.task-edit-btn.cancel:hover {
  background: #e5e7eb;
  color: #374151;
}
</style>
