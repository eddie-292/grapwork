<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Task } from '../types/task'
import { TASK_MODE_CONSTANTS, WorkingMemoryType, type WorkingMemoryEntry } from '../types/task'
import { useWorkingMemory } from '../composables/useWorkingMemory'
import EditIcon from './icons/EditIcon.vue'
import DeleteIcon from './icons/DeleteIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import CircleFilledIcon from './icons/CircleFilledIcon.vue'
import CircleIcon from './icons/CircleIcon.vue'
import RefreshIcon from './icons/RefreshIcon.vue'
import ArrowRightIcon from './icons/ArrowRightIcon.vue'
import XIcon from './icons/XIcon.vue'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'
import ChevronRightIcon from './icons/ChevronRightIcon.vue'

interface TaskModeOptions {
  enableTaskSummary?: boolean
  tokenThreshold?: number
  autoExecute?: boolean
  maxRetries?: number
  skipOnError?: boolean
  workingMemory?: {
    enabled?: boolean
    autoSave?: boolean
    maxEntriesPerType?: number
  }
}

interface Props {
  isTaskPlanning: boolean
  isTaskExecuting: boolean
  currentTaskIndex: number
  taskList: Task[]
  awaitingTaskConfirmation: boolean
  taskModeOptions?: TaskModeOptions
  showSettings?: boolean
  chatId?: string
  executionFailed?: boolean  // 新增：是否执行失败（显示继续按钮）
}

const emit = defineEmits<{
  confirm: []
  cancel: []
  updateOptions: [options: TaskModeOptions]
  toggleSettings: []
  editTasks: []
  deleteTask: [id: number]
  updateTask: [id: number, description: string]
  retryTask: [id: number]
  skipTask: [id: number]
  revisePlan: [feedback: string]
  continueExecution: []  // 新增：继续执行事件
}>()

const props = defineProps<Props>()

// 任务编辑相关状态
const editingTaskId = ref<number | null>(null)
const editTaskDescription = ref('')

// 规划修改相关状态
const planRevisionFeedback = ref('')
const showRevisionInput = ref(false)

// 工作记忆相关状态
const showWorkingMemory = ref(false)
const activeType = ref<WorkingMemoryType>(WorkingMemoryType.FINAL_RESULT)
const editingEntryId = ref<string | null>(null)
const editingContent = ref('')

// 工作记忆管理
const workingMemory = ref(props.chatId ? useWorkingMemory(props.chatId) : null)

// 监听 chatId 变化，重新初始化工作记忆
watch(() => props.chatId, async (newChatId) => {
  if (newChatId) {
    workingMemory.value = useWorkingMemory(newChatId)
    await workingMemory.value?.load()
  } else {
    workingMemory.value = null
  }
})

// 监听工作记忆显示状态变化，显示时重新加载数据
watch(showWorkingMemory, async (show) => {
  if (show && workingMemory.value && props.chatId) {
    // 重新从 localStorage 加载最新数据
    await workingMemory.value.load()
  }
})

// 记忆类型配置
const memoryTypes = [
  { key: WorkingMemoryType.FINAL_RESULT, label: '结果' },
  { key: WorkingMemoryType.DRAFTS, label: '草稿' },
  { key: WorkingMemoryType.NOTES, label: '笔记' }
]

// 计算属性
const workingMemoryCount = computed(() => {
  return workingMemory.value?.allEntries.length ?? 0
})

// 获取特定类型的条目
function getEntriesByType(type: WorkingMemoryType): WorkingMemoryEntry[] {
  if (!workingMemory.value) return []
  return workingMemory.value.getEntriesByType(type)
}

// 获取当前激活类型的标签
function getActiveTypeLabel(): string {
  return memoryTypes.find(t => t.key === activeType.value)?.label ?? ''
}

// 格式化时间戳
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

// 开始编辑工作记忆条目
function startEdit(entry: WorkingMemoryEntry) {
  editingEntryId.value = entry.id
  editingContent.value = entry.content
}

// 取消编辑
function cancelEntryEdit() {
  editingEntryId.value = null
  editingContent.value = ''
}

// 保存编辑
async function saveEntryEdit(entryId: string) {
  if (!workingMemory.value) return
  await workingMemory.value.updateEntry(entryId, editingContent.value)
  editingEntryId.value = null
  editingContent.value = ''
}

// 删除条目
async function deleteEntry(entryId: string) {
  if (!confirm('确定要删除这条记忆吗？')) return
  if (!workingMemory.value) return
  await workingMemory.value.deleteEntry(entryId)
}

// 组件挂载时加载工作记忆
onMounted(async () => {
  if (workingMemory.value && props.chatId) {
    await workingMemory.value.load()
  }
})

// 任务编辑相关函数
function startTaskEdit(task: Task) {
  editingTaskId.value = task.id
  editTaskDescription.value = task.description
}

function cancelTaskEdit() {
  editingTaskId.value = null
  editTaskDescription.value = ''
}

function saveTaskEdit(taskId: number) {
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

// 提交重新规划请求
function submitRevision() {
  const feedback = planRevisionFeedback.value.trim()
  if (feedback) {
    emit('revisePlan', feedback)
    planRevisionFeedback.value = ''
    showRevisionInput.value = false
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

    <!-- 工作记忆切换按钮 -->
    <div class="working-memory-toggle" v-if="taskList.length > 0">
      <button
        @click="showWorkingMemory = !showWorkingMemory"
        class="wm-toggle-btn"
        :class="{ active: showWorkingMemory }"
      >
        <span>工作记忆</span>
        <span class="wm-badge">{{ workingMemoryCount }}</span>
      </button>
    </div>

    <!-- 确认/取消按钮区域 -->
    <div v-if="awaitingTaskConfirmation" class="task-confirmation">
      <button class="confirm-btn" @click="emit('confirm')">
        <span>开始执行</span>
      </button>
      <button class="revise-btn" @click="showRevisionInput = !showRevisionInput" title="重新规划">
        <span>重新规划</span>
      </button>
      <button class="cancel-btn" @click="emit('cancel')">
        <span>取消</span>
      </button>
    </div>

    <!-- 继续执行按钮区域（任务执行失败时显示） -->
    <div v-if="executionFailed && taskList.length > 0" class="task-confirmation">
      <button class="continue-btn" @click="emit('continueExecution')">
        <span>继续执行</span>
      </button>
      <button class="cancel-btn" @click="emit('cancel')">
        <span>取消</span>
      </button>
    </div>

    <!-- 重新规划输入框 -->
    <div v-if="awaitingTaskConfirmation && showRevisionInput" class="plan-revision-section">
      <div class="revision-header">
        <span>请输入修改意见：</span>
        <button class="close-revision-btn" @click="showRevisionInput = false; planRevisionFeedback = ''"><XIcon :size="14" /></button>
      </div>
      <textarea
        v-model="planRevisionFeedback"
        class="revision-textarea"
        rows="3"
        placeholder="例如：将任务2和任务3合并、增加测试任务、减少任务数量等..."
      ></textarea>
      <button class="submit-revision-btn" @click="submitRevision" :disabled="!planRevisionFeedback.trim()">
        重新生成任务列表
      </button>
    </div>

    <!-- 工作记忆内容区域 -->
    <div v-if="showWorkingMemory" class="working-memory-section">
      <!-- 类型筛选 Tab -->
      <div class="wm-tabs">
        <button
          v-for="type in memoryTypes"
          :key="type.key"
          @click="activeType = type.key"
          :class="['wm-tab', { active: activeType === type.key }]"
        >
          {{ type.label }}
          <span class="wm-count">{{ getEntriesByType(type.key).length }}</span>
        </button>
      </div>

      <!-- 记忆条目列表 -->
      <div class="wm-entries">
        <div
          v-for="entry in getEntriesByType(activeType)"
          :key="entry.id"
          :class="['wm-entry', { editing: editingEntryId === entry.id }]"
        >
          <!-- 查看模式 -->
          <div v-if="editingEntryId !== entry.id" class="wm-entry-view">
            <div class="wm-entry-header">
              <span class="wm-task-ref">任务 {{ entry.taskId + 1 }}</span>
              <span class="wm-timestamp">{{ formatTimestamp(entry.timestamp) }}</span>
              <div class="wm-entry-actions">
                <button @click="startEdit(entry)" class="wm-action-btn" title="编辑"><EditIcon :size="12" /></button>
                <button @click="deleteEntry(entry.id)" class="wm-action-btn delete" title="删除"><DeleteIcon :size="12" /></button>
              </div>
            </div>
            <div class="wm-entry-content">{{ entry.metadata?.summary || entry.content.slice(0, 100) }}</div>
          </div>

          <!-- 编辑模式 -->
          <div v-else class="wm-entry-edit">
            <textarea
              v-model="editingContent"
              class="wm-edit-textarea"
              rows="6"
            ></textarea>
            <div class="wm-edit-actions">
              <button @click="saveEntryEdit(entry.id)" class="wm-edit-btn save">保存</button>
              <button @click="cancelEntryEdit" class="wm-edit-btn cancel">取消</button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="getEntriesByType(activeType).length === 0" class="wm-empty">
          <p>暂无{{ getActiveTypeLabel() }}内容</p>
        </div>
      </div>
    </div>

    <!-- 任务列表（当不显示工作记忆时） -->
    <div v-else-if="taskList.length === 0" class="task-panel-empty">
      <p>暂无任务</p>
    </div>

    <div v-else class="task-list-container">
      <div class="task-list">
        <div
          v-for="(task, idx) in taskList"
          :key="task.id"
          :class="['task-item', { active: idx === currentTaskIndex, completed: task.completed, editing: editingTaskId === task.id }]"
        >
          <!-- 第一行：状态、序号、按钮 -->
          <div class="task-header">
            <div class="task-icon">
              <CheckIcon v-if="task.completed" :size="14" />
              <CircleFilledIcon v-else-if="idx === currentTaskIndex" class="active-icon" :size="12" />
              <CircleIcon v-else :size="12" />
            </div>
            <span class="task-number">{{ idx + 1 }}</span>
            <!-- 确认阶段的操作按钮 -->
            <div v-if="awaitingTaskConfirmation && editingTaskId !== task.id" class="task-actions">
              <button class="task-action-btn" @click="startTaskEdit(task)" title="编辑"><EditIcon :size="12" /></button>
              <button class="task-action-btn delete" @click="deleteTask(task.id)" title="删除"><DeleteIcon :size="12" /></button>
            </div>
            <!-- 失败任务的操作按钮 -->
            <div v-else-if="task.status === 'failed' && editingTaskId !== task.id" class="task-actions task-error-actions">
              <button class="task-action-btn retry" @click="emit('retryTask', task.id)" title="重试"><RefreshIcon :size="12" /></button>
              <button class="task-action-btn skip" @click="emit('skipTask', task.id)" title="跳过"><ArrowRightIcon :size="12" /></button>
            </div>
          </div>
          <!-- 第二行：内容 -->
          <div class="task-body">
            <!-- 编辑模式 -->
            <div v-if="editingTaskId === task.id && awaitingTaskConfirmation" class="task-edit-mode">
              <input
                v-model="editTaskDescription"
                class="task-edit-input"
                @keyup.enter="saveTaskEdit(task.id)"
                @keyup.escape="cancelTaskEdit"
                ref="editInput"
              />
              <button class="task-edit-btn save" @click="saveTaskEdit(task.id)" title="保存"><CheckIcon :size="12" /></button>
              <button class="task-edit-btn cancel" @click="cancelTaskEdit" title="取消"><XIcon :size="12" /></button>
            </div>
            <!-- 查看模式 -->
            <span v-else class="task-description">{{ task.description }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部设置按钮区域 -->
    <div class="bottom-actions">
      <button class="settings-btn" @click="emit('toggleSettings')" title="任务模式设置">
        <span>设置</span>
      </button>
    </div>
  </div>

  <!-- 设置对话框 (Teleport to body) -->
  <Teleport to="body">
    <div v-if="showSettings" class="dialog-overlay" @click.self="emit('toggleSettings')">
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>任务模式设置</h3>
          <button class="dialog-close" @click="emit('toggleSettings')"><XIcon :size="20" /></button>
        </div>
        <div class="dialog-body">
          <div class="setting-group">
            <label class="setting-label">
              <input
                type="checkbox"
                :checked="taskModeOptions?.autoExecute ?? false"
                @change="emit('updateOptions', { ...taskModeOptions, autoExecute: ($event.target as HTMLInputElement).checked })"
              />
              <span>自动执行</span>
            </label>
            <p class="setting-desc">跳过确认步骤，任务规划完成后自动开始执行</p>
          </div>

          <div class="setting-group">
            <label class="setting-label">
              <input
                type="checkbox"
                :checked="taskModeOptions?.skipOnError ?? false"
                @change="emit('updateOptions', { ...taskModeOptions, skipOnError: ($event.target as HTMLInputElement).checked })"
              />
              <span>失败时跳过</span>
            </label>
            <p class="setting-desc">任务失败时自动跳过，继续执行后续任务</p>
          </div>

          <div class="setting-group">
            <label class="setting-label">最大重试次数</label>
            <div class="setting-value-control">
              <input
                type="number"
                :value="taskModeOptions?.maxRetries ?? TASK_MODE_CONSTANTS.DEFAULT_MAX_RETRIES"
                @input="emit('updateOptions', { ...taskModeOptions, maxRetries: Number(($event.target as HTMLInputElement).value) })"
                min="0"
                max="5"
                class="setting-number"
              />
              <span class="setting-value">{{ taskModeOptions?.maxRetries ?? TASK_MODE_CONSTANTS.DEFAULT_MAX_RETRIES }}</span>
            </div>
            <p class="setting-desc">任务失败时的最大重试次数</p>
          </div>

          <div class="setting-group">
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

          <div class="setting-group">
            <label class="setting-label">TOKEN 阈值</label>
            <div class="setting-value-control">
              <input
                type="range"
                :value="taskModeOptions?.tokenThreshold ?? TASK_MODE_CONSTANTS.DEFAULT_TOKEN_THRESHOLD"
                @input="emit('updateOptions', { ...taskModeOptions, tokenThreshold: Number(($event.target as HTMLInputElement).value) })"
                :min="TASK_MODE_CONSTANTS.MIN_TOKEN_THRESHOLD"
                :max="TASK_MODE_CONSTANTS.MAX_TOKEN_THRESHOLD"
                step="1000"
                class="setting-range"
              />
              <span class="setting-value">{{ taskModeOptions?.tokenThreshold ?? TASK_MODE_CONSTANTS.DEFAULT_TOKEN_THRESHOLD }}</span>
            </div>
            <p class="setting-desc">累积内容超过此 TOKEN 数时进行中间整合</p>
          </div>

          <div class="setting-group">
            <label class="setting-label">
              <input
                type="checkbox"
                :checked="taskModeOptions?.workingMemory?.enabled ?? true"
                @change="emit('updateOptions', { ...taskModeOptions, workingMemory: { ...taskModeOptions?.workingMemory, enabled: ($event.target as HTMLInputElement).checked } })"
              />
              <span>启用工作记忆</span>
            </label>
            <p class="setting-desc">使用 localStorage 持久化存储任务中间成果</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
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
  /* flex: 1;
  overflow-y: auto;
  padding: 12px; */
  overflow-y: auto;
  padding: 12px;
  height: calc(72vh);
}

.task-list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  border-color: #22c55e;
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
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.task-item.active .task-icon {
  color: #22c55e;
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

/* 第一行：状态、序号、按钮 */
.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 第二行：内容 */
.task-body {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  padding-left: 28px; /* 对齐序号右侧 */
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
  background: #22c55e;
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
  padding: 8px 10px;
  background: #22c55e;
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
  padding: 8px 10px;
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

.revise-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #92400e;
  cursor: pointer;
  transition: all 0.2s;
}

.revise-btn:hover {
  background: #fde68a;
}

.revise-btn span:first-child {
  font-size: 14px;
  font-weight: 600;
}

/* 继续执行按钮样式 */
.continue-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: #dbeafe;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1d4ed8;
  cursor: pointer;
  transition: all 0.2s;
}

.continue-btn:hover {
  background: #bfdbfe;
}

.continue-btn span:first-child {
  font-size: 14px;
  font-weight: 600;
}

/* 重新规划输入框区域 */
.plan-revision-section {
  padding: 12px 16px;
  background: #fefce8;
  border-top: 1px solid #fde047;
  border-bottom: 1px solid #fde047;
}

.revision-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #854d0e;
}

.close-revision-btn {
  background: none;
  border: none;
  color: #854d0e;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  line-height: 1;
}

.close-revision-btn:hover {
  color: #713f12;
}

.revision-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #fde047;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 60px;
  background: #ffffff;
  box-sizing: border-box;
}

.revision-textarea:focus {
  outline: none;
  border-color: #eab308;
  box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.1);
}

.revision-textarea::placeholder {
  color: #ca8a04;
  opacity: 0.7;
}

.submit-revision-btn {
  margin-top: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #f59e0b;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.submit-revision-btn:hover:not(:disabled) {
  background: #d97706;
}

.submit-revision-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 设置面板 */
/* 底部操作区域 */
.bottom-actions {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
}

.settings-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.settings-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #374151;
}

.settings-btn span:first-child {
  font-size: 16px;
}

/* 弹出对话框样式 (参考 ChatView.vue) */
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
  background: #ffffff;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.dialog-close {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.dialog-close:hover {
  background: #f3f4f6;
  color: #0f172a;
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.setting-group {
  margin-bottom: 20px;
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
  cursor: pointer;
}

.setting-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #22c55e;
}

.setting-value-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-number {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
}

.setting-number:focus {
  border-color: #22c55e;
}

.setting-range {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #e5e7eb;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.setting-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #22c55e;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.setting-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #22c55e;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.setting-value {
  min-width: 30px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #22c55e;
}

.setting-desc {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

/* 任务编辑样式 */

/* 任务编辑样式 */
.task-item.editing {
  border-color: #22c55e;
  background: #f0fdf4;
}

.task-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
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

.task-action-btn.retry:hover {
  background: #dbeafe;
  color: #2563eb;
}

.task-action-btn.skip:hover {
  background: #fef3c7;
  color: #d97706;
}

.task-error-actions {
  display: flex;
  gap: 2px;
}

/* 失败状态的任务样式 */
.task-item:has(.task-error-actions) {
  border-color: #fecaca;
  background: #fef2f2;
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
  border: 1px solid #22c55e;
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
  background: #22c55e;
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

/* 工作记忆区域样式 */
.working-memory-toggle {
  padding: 8px 16px;
  /* border-bottom: 1px solid #e5e7eb; */
}

.wm-toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.wm-toggle-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.wm-toggle-btn.active {
  background: #ecfdf5;
  border-color: #22c55e;
  color: #065f46;
}

.wm-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: #e5e7eb;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.wm-toggle-btn.active .wm-badge {
  background: #22c55e;
  color: white;
}

.working-memory-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wm-tabs {
  display: flex;
  gap: 4px;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.wm-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.wm-tab:hover {
  background: #f3f4f6;
}

.wm-tab.active {
  background: #22c55e;
  color: white;
}

.wm-count {
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.wm-tab.active .wm-count {
  background: rgba(255, 255, 255, 0.2);
}

.wm-entries {
  /* flex: 1;
  overflow-y: auto;
  padding: 12px; */
  overflow: auto;
  padding: 12px;
  height: calc(73vh);
}

.wm-entry {
  margin-bottom: 12px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;
}

.wm-entry:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.wm-entry.editing {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(16, 163, 127, 0.1);
}

.wm-entry-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.wm-task-ref {
  padding: 2px 8px;
  background: #ecfdf5;
  color: #065f46;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.wm-timestamp {
  margin-left: auto;
  font-size: 11px;
  color: #9ca3af;
}

.wm-entry-actions {
  display: flex;
  gap: 2px;
}

.wm-action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.wm-action-btn:hover {
  background: #f3f4f6;
  color: #6b7280;
}

.wm-action-btn.delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

.wm-entry-content {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.wm-edit-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  min-height: 120px;
}

.wm-edit-textarea:focus {
  outline: none;
  border-color: #22c55e;
}

.wm-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}

.wm-edit-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.wm-edit-btn.save {
  background: #22c55e;
  color: white;
}

.wm-edit-btn.save:hover {
  background: #0d8a6c;
}

.wm-edit-btn.cancel {
  background: #f3f4f6;
  color: #6b7280;
}

.wm-edit-btn.cancel:hover {
  background: #e5e7eb;
}

.wm-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #9ca3af;
  font-size: 13px;
}
</style>
