/**
 * Loop 定时任务管理 Composable
 * 遵循 useMCP.ts 和 useSkills.ts 的模式
 */
import { ref, computed, toRaw } from 'vue'
import type {
  LoopTask,
  CreateLoopTaskParams,
  UpdateLoopTaskParams,
  LoopTaskExecution,
  LoopSchedulerStatus,
  ParsedTimeExpression
} from '@/types/loop'

// 检测 Electron 环境
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

// 单例模式
let loopManager: ReturnType<typeof createLoopManager> | null = null

function createLoopManager() {
  const tasks = ref<LoopTask[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const schedulerStatus = ref<LoopSchedulerStatus | null>(null)

  // 任务执行事件回调
  const onTaskExecutedCallbacks = new Set<(taskId: string, execution: LoopTaskExecution) => void>()

  /**
   * 初始化事件监听
   */
  function initEventListeners(): void {
    if (!isElectronEnv || !window.electronAPI?.onLoopTaskExecuted) return

    window.electronAPI.onLoopTaskExecuted((data: { taskId: string; execution: LoopTaskExecution }) => {
      // 更新本地任务列表
      const task = tasks.value.find(t => t.id === data.taskId)
      if (task && data.execution) {
        task.lastExecutedAt = data.execution.startedAt
        task.executionCount++
        if (data.execution.status === 'success') {
          task.successCount++
        } else {
          task.errorCount++
          task.lastError = data.execution.error
        }
      }

      // 触发回调
      onTaskExecutedCallbacks.forEach(cb => {
        try {
          cb(data.taskId, data.execution)
        } catch (e) {
          console.error('[useLoop] Callback error:', e)
        }
      })
    })
  }

  /**
   * 加载任务列表
   */
  async function loadTasks(): Promise<void> {
    if (!isElectronEnv || !window.electronAPI?.loopListTasks) {
      error.value = 'Loop 需要 Electron 环境'
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.loopListTasks()
      if (result.success) {
        tasks.value = result.tasks
      } else {
        error.value = result.error || '加载任务失败'
      }
    } catch (e: any) {
      error.value = e?.message || '加载任务失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建任务
   */
  async function createTask(params: CreateLoopTaskParams): Promise<LoopTask | null> {
    if (!isElectronEnv || !window.electronAPI?.loopCreateTask) {
      error.value = 'Loop 需要 Electron 环境'
      return null
    }

    loading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.loopCreateTask(toRaw(params))
      if (result.success && result.task) {
        tasks.value.push(result.task)
        return result.task
      }
      error.value = result.error || '创建任务失败'
      return null
    } catch (e: any) {
      error.value = e?.message || '创建任务失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新任务
   */
  async function updateTask(taskId: string, params: UpdateLoopTaskParams): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.loopUpdateTask) {
      return false
    }

    try {
      const result = await window.electronAPI.loopUpdateTask(taskId, toRaw(params))
      if (result.success && result.task) {
        const index = tasks.value.findIndex(t => t.id === taskId)
        if (index !== -1) {
          tasks.value[index] = result.task
        }
        return true
      }
      error.value = result.error || '更新任务失败'
      return false
    } catch (e: any) {
      error.value = e?.message || '更新任务失败'
      return false
    }
  }

  /**
   * 删除任务
   */
  async function deleteTask(taskId: string): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.loopDeleteTask) {
      return false
    }

    loading.value = true
    try {
      const result = await window.electronAPI.loopDeleteTask(taskId)
      if (result.success) {
        tasks.value = tasks.value.filter(t => t.id !== taskId)
        return true
      }
      error.value = result.error || '删除任务失败'
      return false
    } catch (e: any) {
      error.value = e?.message || '删除任务失败'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 暂停任务
   */
  async function pauseTask(taskId: string): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.loopPauseTask) {
      return false
    }

    try {
      const result = await window.electronAPI.loopPauseTask(taskId)
      if (result.success) {
        await loadTasks()
        return true
      }
      error.value = result.error || '暂停任务失败'
      return false
    } catch (e: any) {
      error.value = e?.message || '暂停任务失败'
      return false
    }
  }

  /**
   * 恢复任务
   */
  async function resumeTask(taskId: string): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.loopResumeTask) {
      return false
    }

    try {
      const result = await window.electronAPI.loopResumeTask(taskId)
      if (result.success) {
        await loadTasks()
        return true
      }
      error.value = result.error || '恢复任务失败'
      return false
    } catch (e: any) {
      error.value = e?.message || '恢复任务失败'
      return false
    }
  }

  /**
   * 立即执行任务
   */
  async function executeNow(taskId: string): Promise<LoopTaskExecution | null> {
    if (!isElectronEnv || !window.electronAPI?.loopExecuteNow) {
      throw new Error('Loop 需要 Electron 环境')
    }

    try {
      const result = await window.electronAPI.loopExecuteNow(taskId)
      if (result.success) {
        await loadTasks()
        return result.execution
      }
      throw new Error(result.error || '执行失败')
    } catch (e: any) {
      throw e
    }
  }

  /**
   * 解析时间表达式
   */
  async function parseInterval(expression: string): Promise<ParsedTimeExpression | null> {
    if (!isElectronEnv || !window.electronAPI?.loopParseInterval) {
      return null
    }

    try {
      const result = await window.electronAPI.loopParseInterval(expression)
      return result.success ? result.parsed : null
    } catch {
      return null
    }
  }

  /**
   * 获取调度器状态
   */
  async function getStatus(): Promise<void> {
    if (!isElectronEnv || !window.electronAPI?.loopGetStatus) {
      return
    }

    try {
      const result = await window.electronAPI.loopGetStatus()
      if (result.success) {
        schedulerStatus.value = result.status
      }
    } catch {
      // ignore
    }
  }

  /**
   * 切换任务启用状态
   */
  async function toggleTaskEnabled(taskId: string): Promise<boolean> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return false
    return updateTask(taskId, { enabled: !task.enabled })
  }

  /**
   * 注册任务执行回调
   */
  function onTaskExecuted(callback: (taskId: string, execution: LoopTaskExecution) => void): () => void {
    onTaskExecutedCallbacks.add(callback)
    return () => {
      onTaskExecutedCallbacks.delete(callback)
    }
  }

  /**
   * 清除错误
   */
  function clearError(): void {
    error.value = null
  }

  // 计算属性
  const activeTasks = computed(() =>
    tasks.value.filter(t => t.enabled && t.status !== 'paused')
  )

  const pausedTasks = computed(() =>
    tasks.value.filter(t => t.status === 'paused')
  )

  const errorTasks = computed(() =>
    tasks.value.filter(t => t.status === 'error' || t.lastError)
  )

  // 全局默认 LLM 配置
  const defaultConfigIndex = ref<number | undefined>(undefined)

  /**
   * 获取全局默认配置
   */
  async function getDefaultConfig(): Promise<void> {
    if (!isElectronEnv || !window.electronAPI?.loopGetDefaultConfig) {
      return
    }

    try {
      const result = await window.electronAPI.loopGetDefaultConfig()
      if (result.success) {
        defaultConfigIndex.value = result.configIndex
      }
    } catch {
      // ignore
    }
  }

  /**
   * 设置全局默认配置
   */
  async function setDefaultConfig(configIndex: number | undefined): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.loopSetDefaultConfig) {
      return false
    }

    try {
      const result = await window.electronAPI.loopSetDefaultConfig(configIndex)
      if (result.success) {
        defaultConfigIndex.value = configIndex
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // 初始化
  initEventListeners()

  return {
    // State
    tasks,
    loading,
    error,
    schedulerStatus,
    defaultConfigIndex,

    // Computed
    activeTasks,
    pausedTasks,
    errorTasks,

    // Methods
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    pauseTask,
    resumeTask,
    executeNow,
    toggleTaskEnabled,
    parseInterval,
    getStatus,
    getDefaultConfig,
    setDefaultConfig,
    onTaskExecuted,
    clearError
  }
}

export function useLoop() {
  if (!loopManager) {
    loopManager = createLoopManager()
  }
  return loopManager
}
