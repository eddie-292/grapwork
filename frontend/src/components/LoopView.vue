<template>
  <div class="loop-view">
    <div class="loop-header">
      <h2>定时任务管理</h2>
      <div class="status-bar" v-if="schedulerStatus">
        <span>总任务: {{ schedulerStatus.totalTasks }}</span>
        <span>调度中: {{ schedulerStatus.scheduledTasks }}</span>
        <span>运行中: {{ schedulerStatus.runningTasks }}</span>
        <span>最大并发: {{ schedulerStatus.maxConcurrent }}</span>
      </div>
    </div>

    <!-- 全局 LLM 配置 -->
    <div class="global-config-section">
      <div class="config-row">
        <span class="config-label">默认 LLM 配置:</span>
        <select
          class="config-select global"
          :value="defaultConfigIndex ?? -1"
          @change="handleGlobalConfigChange(($event.target as HTMLSelectElement).value)"
          :disabled="globalConfigLoading"
        >
          <option :value="-1">默认选择LLM列表中的第一个</option>
          <option
            v-for="(config, index) in configs"
            :key="index"
            :value="index"
          >
            {{ config.name }} ({{ config.model }})
          </option>
        </select>
      </div>
    </div>

    <!-- 帮助信息 -->
    <div class="help-section">
      <p>在聊天中输入 <code>/loop [时间] [任务]</code> 创建定时任务，例如：</p>
      <ul>
        <li><code>/loop 5m 提醒我休息</code> - 每5分钟提醒</li>
        <li><code>/loop 1h 检查服务状态</code> - 每小时检查</li>
        <li><code>/loop 1d 生成日报</code> - 每天执行</li>
      </ul>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- 错误提示 -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 任务列表 -->
    <div class="task-list" v-if="!loading && tasks.length > 0">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ paused: task.status === 'paused', error: task.lastError }"
      >
        <div class="task-header">
          <div class="task-name">{{ task.name }}</div>
          <div class="task-status" :class="task.status">
            {{ getStatusText(task.status) }}
          </div>
        </div>

        <div class="task-info">
          <div class="info-item">
            <span class="label">间隔:</span>
            <span class="value">{{ task.interval }} ({{ formatMs(task.intervalMs) }})</span>
          </div>
          <div class="info-item">
            <span class="label">类型:</span>
            <span class="value">{{ task.type }}</span>
          </div>
          <div class="info-item">
            <span class="label">统计:</span>
            <span class="value">
              成功 {{ task.successCount }} | 失败 {{ task.errorCount }} | 总计 {{ task.executionCount }}
            </span>
          </div>
          <div class="info-item" v-if="task.nextExecuteAt">
            <span class="label">下次执行:</span>
            <span class="value">{{ formatTime(task.nextExecuteAt) }}</span>
          </div>
          <div class="info-item" v-if="task.lastError">
            <span class="label error">最后错误:</span>
            <span class="value error">{{ task.lastError }}</span>
          </div>
        </div>

        <div class="task-actions">
          <button
            v-if="task.status !== 'paused'"
            @click="handlePause(task.id)"
            :disabled="actionLoading[task.id]"
          >
            {{ actionLoading[task.id] ? '处理中...' : '暂停' }}
          </button>
          <button
            v-else
            @click="handleResume(task.id)"
            :disabled="actionLoading[task.id]"
          >
            {{ actionLoading[task.id] ? '处理中...' : '恢复' }}
          </button>
          <button @click="handleExecuteNow(task.id)" :disabled="actionLoading[task.id]">
            {{ actionLoading[task.id] ? '处理中...' : '立即执行' }}
          </button>
          <button @click="handleDelete(task.id)" class="delete" :disabled="actionLoading[task.id]">
            {{ actionLoading[task.id] ? '处理中...' : '删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && tasks.length === 0" class="empty-state">
      <p>暂无定时任务</p>
      <p class="hint">在聊天中输入 <code>/loop 5m 任务描述</code> 创建任务</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLoop } from '@/composables/useLoop'
import { StorageService } from '@/services/StorageService'
import type { AppConfig } from '@/types/electron'

const storage = StorageService.getInstance()

const {
  tasks,
  loading,
  error,
  schedulerStatus,
  defaultConfigIndex,
  loadTasks,
  getStatus,
  pauseTask,
  resumeTask,
  executeNow,
  deleteTask,
  getDefaultConfig,
  setDefaultConfig,
  onTaskExecuted
} = useLoop()

const actionLoading = ref<Record<string, boolean>>({})
const configs = ref<AppConfig[]>([])
const globalConfigLoading = ref(false)

// 加载配置列表
async function loadConfigs() {
  try {
    const result = await storage.getConfigList()
    if (result) {
      configs.value = result.configs || []
    }
  } catch (e) {
    console.error('Failed to load configs:', e)
  }
}

// 加载任务列表
onMounted(async () => {
  await loadConfigs()
  await getDefaultConfig()
  await loadTasks()
  await getStatus()
})

// 监听任务执行完成
let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = onTaskExecuted(async () => {
    await loadTasks()
    await getStatus()
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// 暂停任务
async function handlePause(taskId: string) {
  actionLoading.value[taskId] = true
  try {
    await pauseTask(taskId)
    await loadTasks()
  } finally {
    actionLoading.value[taskId] = false
  }
}

// 恢复任务
async function handleResume(taskId: string) {
  actionLoading.value[taskId] = true
  try {
    await resumeTask(taskId)
    await loadTasks()
  } finally {
    actionLoading.value[taskId] = false
  }
}

// 立即执行
async function handleExecuteNow(taskId: string) {
  actionLoading.value[taskId] = true
  try {
    const result = await executeNow(taskId)
    console.log('Execution result:', result)
    await loadTasks()
  } catch (e: any) {
    alert('执行失败: ' + (e?.message || '未知错误'))
  } finally {
    actionLoading.value[taskId] = false
  }
}

// 删除任务
async function handleDelete(taskId: string) {
  if (!confirm('确定要删除这个任务吗？')) return

  actionLoading.value[taskId] = true
  try {
    await deleteTask(taskId)
    await loadTasks()
    await getStatus()
  } finally {
    actionLoading.value[taskId] = false
  }
}

// 修改全局默认配置
async function handleGlobalConfigChange(configIndexStr: string) {
  const configIndex = parseInt(configIndexStr, 10)

  globalConfigLoading.value = true
  try {
    await setDefaultConfig(configIndex === -1 ? undefined : configIndex)
  } catch (e: any) {
    alert('更新配置失败: ' + (e?.message || '未知错误'))
  } finally {
    globalConfigLoading.value = false
  }
}

// 状态文本
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    paused: '已暂停',
    completed: '已完成',
    cancelled: '已取消',
    error: '错误'
  }
  return statusMap[status] || status
}

// 格式化毫秒数
function formatMs(ms: number): string {
  if (ms < 60000) return `${ms / 1000}秒`
  if (ms < 3600000) return `${ms / 60000}分钟`
  if (ms < 86400000) return `${ms / 3600000}小时`
  return `${ms / 86400000}天`
}

// 格式化时间
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}
</script>

<style scoped>
.loop-view {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.loop-header {
  margin-bottom: 20px;
}

.loop-header h2 {
  margin: 0 0 10px 0;
  font-size: 18px;
  color: #333;
}

.status-bar {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #666;
}

.help-section {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 13px;
}

.help-section p {
  margin: 0 0 10px 0;
}

.help-section ul {
  margin: 0;
  padding-left: 20px;
}

.help-section li {
  margin: 5px 0;
}

.help-section code {
  background: #e0e0e0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.loading, .error {
  padding: 20px;
  text-align: center;
  color: #666;
}

.error {
  color: #e74c3c;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
}

.task-item.paused {
  opacity: 0.7;
  border-color: #f0f0f0;
}

.task-item.error {
  border-color: #ffcccc;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.task-name {
  font-weight: 500;
  color: #333;
}

.task-status {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #e0e0e0;
}

.task-status.pending { background: #d4edda; color: #155724; }
.task-status.running { background: #cce5ff; color: #004085; }
.task-status.paused { background: #f8d7da; color: #721c24; }
.task-status.error { background: #f5c6cb; color: #721c24; }

.task-info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 15px;
  font-size: 13px;
}

.info-item {
  display: flex;
  gap: 5px;
}

.info-item .label {
  color: #666;
}

.info-item .value {
  color: #333;
}

.info-item .value.error {
  color: #e74c3c;
  word-break: break-all;
}

.info-item.full-width {
  grid-column: span 2;
}

.config-select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  background: #fff;
  cursor: pointer;
  max-width: 200px;
}

.config-label {
  color: #666;
  font-size: 13px;
  white-space: nowrap;
}
.config-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.global-config-section {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-select.global {
  flex: 1;
  min-width: 200px;
}
.task-actions {
  display: flex;
  gap: 8px;
}

.task-actions button {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.task-actions button:hover:not(:disabled) {
  background: #f5f5f5;
}

.task-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-actions button.delete {
  color: #e74c3c;
  border-color: #f5c6cb;
}

.task-actions button.delete:hover:not(:disabled) {
  background: #fff5f5;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #666;
}

.empty-state .hint {
  font-size: 13px;
  margin-top: 10px;
}

.empty-state code {
  background: #e0e0e0;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
