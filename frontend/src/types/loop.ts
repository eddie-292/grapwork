/**
 * Loop 定时任务类型定义
 */

// 任务状态枚举
export const LoopTaskStatus = {
  PENDING: 'pending',       // 等待执行
  RUNNING: 'running',       // 执行中
  PAUSED: 'paused',         // 已暂停
  COMPLETED: 'completed',   // 已完成(一次性任务)
  CANCELLED: 'cancelled',   // 已取消
  ERROR: 'error',           // 执行错误
} as const

export type LoopTaskStatusType = typeof LoopTaskStatus[keyof typeof LoopTaskStatus]

// 时间单位
export const TimeUnit = {
  SECONDS: 's',
  MINUTES: 'm',
  HOURS: 'h',
  DAYS: 'd',
} as const

export type TimeUnitType = typeof TimeUnit[keyof typeof TimeUnit]

// 解析后的时间表达式
export interface ParsedTimeExpression {
  value: number           // 数值
  unit: TimeUnitType      // 单位
  milliseconds: number    // 转换后的毫秒数
  isValid: boolean        // 是否有效
  error?: string          // 解析错误信息
}

// 任务执行记录
export interface LoopTaskExecution {
  id: string              // 执行ID
  taskId: string          // 关联任务ID
  startedAt: number       // 开始时间
  completedAt?: number    // 完成时间
  status: 'success' | 'error' | 'timeout'
  result?: any            // 执行结果
  error?: string          // 错误信息
  retryCount: number      // 重试次数
}

// 任务类型
export type LoopTaskType = 'chat' | 'command' | 'skill' | 'api'

// 任务负载
export interface LoopTaskPayload {
  // chat 类型
  prompt?: string         // 提示词
  assistantId?: string    // 助理ID
  configIndex?: number    // 配置索引

  // command 类型
  command?: string        // Shell 命令
  cwd?: string            // 工作目录

  // skill 类型
  skillId?: string        // 技能ID
  skillArgs?: Record<string, any>

  // api 类型
  apiUrl?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: any
}

// Loop 任务定义
export interface LoopTask {
  id: string              // 唯一标识
  name: string            // 任务名称
  description?: string    // 任务描述

  // 调度配置
  interval: string        // 原始时间表达式 (如 "30s", "5m", "2h", "1d")
  intervalMs: number      // 解析后的毫秒数
  cronExpression?: string // 可选的 cron 表达式 (扩展用)

  // 任务类型
  type: LoopTaskType

  // 任务负载
  payload: LoopTaskPayload

  // 状态
  status: LoopTaskStatusType
  enabled: boolean        // 是否启用

  // 执行控制
  maxRetries: number      // 最大重试次数
  retryDelay: number      // 重试延迟(ms)
  timeout: number         // 执行超时(ms)

  // 统计信息
  executionCount: number  // 总执行次数
  successCount: number    // 成功次数
  errorCount: number      // 错误次数
  lastExecutedAt?: number // 上次执行时间
  nextExecuteAt?: number  // 下次执行时间
  lastError?: string      // 最后错误信息

  // 时间戳
  createdAt: number
  updatedAt: number

  // 元数据
  tags?: string[]         // 标签
  createdBy?: string      // 创建来源
}

// 任务注册表 (用于持久化存储)
export interface LoopTaskRegistry {
  tasks: LoopTask[]
  version: number
  lastUpdated: number
}

// 任务创建参数
export interface CreateLoopTaskParams {
  name: string
  description?: string
  interval: string
  type: LoopTaskType
  payload: LoopTaskPayload
  maxRetries?: number
  retryDelay?: number
  timeout?: number
  tags?: string[]
}

// 任务更新参数
export interface UpdateLoopTaskParams {
  name?: string
  description?: string
  interval?: string
  payload?: Partial<LoopTaskPayload>
  enabled?: boolean
  maxRetries?: number
  retryDelay?: number
  timeout?: number
  tags?: string[]
}

// IPC 操作结果
export interface LoopTaskResult {
  success: boolean
  task?: LoopTask
  error?: string
}

export interface LoopTaskListResult {
  success: boolean
  tasks: LoopTask[]
  error?: string
}

// 执行结果
export interface LoopExecutionResult {
  success: boolean
  execution?: LoopTaskExecution
  error?: string
}

// 调度器状态
export interface LoopSchedulerStatus {
  totalTasks: number
  scheduledTasks: number
  runningTasks: number
  maxConcurrent: number
}
