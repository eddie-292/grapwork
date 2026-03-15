/**
 * Loop 任务调度管理器
 * 使用 setTimeout 实现定时调度 (最小粒度1分钟)
 */
import type {
  LoopTask,
  LoopTaskRegistry,
  LoopTaskExecution,
  LoopTaskStatusType,
  LoopSchedulerStatus
} from '../src/types/loop'
import { LoopTaskStatus } from '../src/types/loop'
import { LoopExecutor, loopExecutor } from './LoopExecutor'

// 最大并发任务数
const MAX_CONCURRENT_TASKS = 50

// 调度器健康检查间隔 (5分钟)
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000

interface ScheduledTask {
  taskId: string
  timerId: NodeJS.Timeout
  nextExecuteAt: number
}

export class LoopScheduler {
  private static instance: LoopScheduler | null = null

  private tasks: Map<string, LoopTask> = new Map()
  private scheduledTimers: Map<string, ScheduledTask> = new Map()
  private executor: LoopExecutor
  private runningCount: number = 0
  private healthCheckTimer: NodeJS.Timeout | null = null
  private onDataChange: (() => Promise<void>) | null = null
  private onTaskExecuted: ((taskId: string, execution: LoopTaskExecution) => void) | null = null

  private constructor() {
    this.executor = loopExecutor
  }

  static getInstance(): LoopScheduler {
    if (!LoopScheduler.instance) {
      LoopScheduler.instance = new LoopScheduler()
    }
    return LoopScheduler.instance
  }

  /**
   * 初始化调度器
   */
  async initialize(
    registry: LoopTaskRegistry,
    onDataChange: () => Promise<void>,
    onTaskExecuted?: (taskId: string, execution: LoopTaskExecution) => void
  ): Promise<void> {
    this.onDataChange = onDataChange
    this.onTaskExecuted = onTaskExecuted || null

    // 加载所有任务
    for (const task of registry.tasks) {
      this.tasks.set(task.id, task)

      // 恢复启用的任务
      if (task.enabled && task.status !== LoopTaskStatus.PAUSED) {
        this.scheduleTask(task)
      }
    }

    // 启动健康检查
    this.startHealthCheck()

    console.log(`[LoopScheduler] Initialized with ${this.tasks.size} tasks, ${this.scheduledTimers.size} scheduled`)
  }

  /**
   * 添加新任务
   */
  addTask(task: LoopTask): void {
    this.tasks.set(task.id, task)
    if (task.enabled && task.status !== LoopTaskStatus.PAUSED) {
      this.scheduleTask(task)
    }
    console.log(`[LoopScheduler] Added task "${task.name}" (${task.id})`)
  }

  /**
   * 更新任务
   */
  updateTask(task: LoopTask): void {
    // 取消旧的调度
    this.unscheduleTask(task.id)

    // 更新任务
    this.tasks.set(task.id, task)

    // 重新调度
    if (task.enabled && task.status !== LoopTaskStatus.PAUSED) {
      this.scheduleTask(task)
    }
    console.log(`[LoopScheduler] Updated task "${task.name}" (${task.id})`)
  }

  /**
   * 删除任务
   */
  removeTask(taskId: string): void {
    this.unscheduleTask(taskId)
    const task = this.tasks.get(taskId)
    this.tasks.delete(taskId)
    if (task) {
      console.log(`[LoopScheduler] Removed task "${task.name}" (${taskId})`)
    }
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (task) {
      task.status = LoopTaskStatus.PAUSED
      task.updatedAt = Date.now()
      this.unscheduleTask(taskId)
      console.log(`[LoopScheduler] Paused task "${task.name}" (${taskId})`)
      return true
    }
    return false
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (task && task.status === LoopTaskStatus.PAUSED) {
      task.status = LoopTaskStatus.PENDING
      task.updatedAt = Date.now()
      if (task.enabled) {
        this.scheduleTask(task)
      }
      console.log(`[LoopScheduler] Resumed task "${task.name}" (${taskId})`)
      return true
    }
    return false
  }

  /**
   * 立即执行任务
   */
  async executeNow(taskId: string): Promise<LoopTaskExecution> {
    if (this.runningCount >= MAX_CONCURRENT_TASKS) {
      throw new Error('已达到最大并发任务数限制 (50)')
    }

    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    return this.executeTask(task)
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): LoopTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): LoopTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 获取运行状态
   */
  getStatus(): LoopSchedulerStatus {
    return {
      totalTasks: this.tasks.size,
      scheduledTasks: this.scheduledTimers.size,
      runningTasks: this.runningCount,
      maxConcurrent: MAX_CONCURRENT_TASKS
    }
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    // 停止所有定时器
    for (const taskId of this.scheduledTimers.keys()) {
      this.unscheduleTask(taskId)
    }

    // 停止健康检查
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    this.tasks.clear()
    LoopScheduler.instance = null
    console.log('[LoopScheduler] Destroyed')
  }

  // ==================== 私有方法 ====================

  /**
   * 调度任务
   */
  private scheduleTask(task: LoopTask): void {
    // 取消已有调度
    this.unscheduleTask(task.id)

    const nextExecuteAt = Date.now() + task.intervalMs
    task.nextExecuteAt = nextExecuteAt
    task.status = LoopTaskStatus.PENDING

    // 使用 setTimeout 调度
    const timerId = setTimeout(() => {
      this.onTaskTimer(task.id)
    }, task.intervalMs)

    this.scheduledTimers.set(task.id, {
      taskId: task.id,
      timerId,
      nextExecuteAt
    })
  }

  /**
   * 取消任务调度
   */
  private unscheduleTask(taskId: string): void {
    const scheduled = this.scheduledTimers.get(taskId)
    if (scheduled) {
      clearTimeout(scheduled.timerId)
      this.scheduledTimers.delete(taskId)
    }
  }

  /**
   * 任务定时器触发
   */
  private async onTaskTimer(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || !task.enabled) {
      this.scheduledTimers.delete(taskId)
      return
    }

    try {
      const execution = await this.executeTask(task)

      // 通知任务执行完成
      if (this.onTaskExecuted) {
        this.onTaskExecuted(taskId, execution)
      }
    } catch (error: any) {
      console.error(`[LoopScheduler] Task "${task.name}" execution failed:`, error)
      task.lastError = error.message
      task.errorCount++
    }

    // 重新调度
    if (task.enabled && task.status !== LoopTaskStatus.PAUSED) {
      this.scheduleTask(task)
    } else {
      this.scheduledTimers.delete(taskId)
    }

    // 通知数据变更
    if (this.onDataChange) {
      await this.onDataChange()
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: LoopTask): Promise<LoopTaskExecution> {
    if (this.runningCount >= MAX_CONCURRENT_TASKS) {
      console.warn(`[LoopScheduler] Max concurrent tasks reached, skipping task "${task.name}"`)
      task.lastError = '已达到最大并发任务数限制'
      return {
        id: `${task.id}-${Date.now()}`,
        taskId: task.id,
        startedAt: Date.now(),
        status: 'error',
        error: '已达到最大并发任务数限制',
        retryCount: 0
      }
    }

    this.runningCount++
    task.status = LoopTaskStatus.RUNNING
    task.lastExecutedAt = Date.now()

    let retryCount = 0
    let execution: LoopTaskExecution | null = null

    while (retryCount <= task.maxRetries) {
      try {
        execution = await this.executor.execute(task, task.timeout)

        if (execution.status === 'success') {
          task.successCount++
          task.lastError = undefined
          break
        }

        // 执行失败，检查是否需要重试
        if (retryCount < task.maxRetries) {
          retryCount++
          console.log(`[LoopScheduler] Retrying task "${task.name}" (${retryCount}/${task.maxRetries})`)
          await this.sleep(task.retryDelay)
          continue
        }

        // 重试次数用尽
        task.errorCount++
        task.lastError = execution.error
        execution.retryCount = retryCount
        break
      } catch (error: any) {
        retryCount++
        if (retryCount > task.maxRetries) {
          task.errorCount++
          task.lastError = error.message
          execution = {
            id: `${task.id}-${Date.now()}`,
            taskId: task.id,
            startedAt: task.lastExecutedAt,
            completedAt: Date.now(),
            status: 'error',
            error: error.message,
            retryCount
          }
        }
      }
    }

    task.executionCount++
    task.status = task.enabled ? LoopTaskStatus.PENDING : LoopTaskStatus.PAUSED
    task.updatedAt = Date.now()

    this.runningCount--
    return execution!
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth()
    }, HEALTH_CHECK_INTERVAL)
  }

  /**
   * 健康检查
   */
  private checkHealth(): void {
    const now = Date.now()
    const status = this.getStatus()

    console.log(`[LoopScheduler] Health check: ${JSON.stringify(status)}`)

    // 检查错过的任务
    for (const task of this.tasks.values()) {
      if (task.enabled && task.nextExecuteAt && task.nextExecuteAt <= now - 60000) {
        // 任务应该已执行但未执行超过1分钟
        if (!this.scheduledTimers.has(task.id)) {
          console.warn(`[LoopScheduler] Task "${task.name}" missed, rescheduling`)
          this.scheduleTask(task)
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 导出单例获取函数
export const getLoopScheduler = () => LoopScheduler.getInstance()
