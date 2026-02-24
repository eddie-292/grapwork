/**
 * 任务模式相关的类型定义
 */

/**
 * 工作记忆类型
 */
export const WorkingMemoryType = {
  NOTES: 'notes',
  DRAFTS: 'drafts',
  FINAL_RESULT: 'final'
} as const

export type WorkingMemoryType = typeof WorkingMemoryType[keyof typeof WorkingMemoryType]

/**
 * 单个工作记忆条目
 */
export interface WorkingMemoryEntry {
  id: string
  type: WorkingMemoryType
  taskId: number
  taskDescription: string
  content: string
  timestamp: number
  metadata?: {
    wordCount?: number
    summary?: string
  }
}

/**
 * 工作记忆容器
 */
export interface WorkingMemory {
  chatId: string
  entries: WorkingMemoryEntry[]
  lastUpdated: number
  version: number
}

/**
 * 单个任务
 */
export interface Task {
  id: number
  description: string
  completed: boolean
  status?: TaskStatus
  error?: string
  retryCount?: number
  /** 关联的工作记忆条目 ID */
  workingMemoryIds?: string[]
}

/**
 * 任务执行状态
 */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
} as const

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus]

/**
 * 任务模式配置选项
 */
export interface TaskModeOptions {
  /** 是否启用任务总结，默认 false */
  enableTaskSummary?: boolean
  /** TOKEN 阈值，默认 8000（累积 TOKEN 超过此值时进行整合） */
  tokenThreshold?: number
  /** 是否自动执行（跳过确认），默认 false */
  autoExecute?: boolean
  /** 最大重试次数，默认 0 */
  maxRetries?: number
  /** 失败时是否跳过继续执行，默认 false */
  skipOnError?: boolean
  /** 工作记忆配置 */
  workingMemory?: {
    /** 是否启用工作记忆，默认 true */
    enabled?: boolean
    /** 是否自动保存，默认 true */
    autoSave?: boolean
    /** 每种类型最大条目数，默认 50 */
    maxEntriesPerType?: number
  }
}

/**
 * 任务模式状态
 */
export interface TaskModeState {
  isTaskPlanning: boolean
  isTaskExecuting: boolean
  awaitingTaskConfirmation: boolean
  currentTaskIndex: number
  pendingTasks: Task[]
  taskList: Task[]
}

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  success: boolean
  content: string
  reasoning?: string
  error?: string
}

/**
 * 中间整合结果
 */
export interface IntermediateMergeResult {
  mergedContent: string
  archivedMessages: Message[]
  taskCount: number
}

/**
 * 消息类型（与 ChatView 中的 Message 保持一致）
 */
export type MessageRole = 'user' | 'assistant' | 'system'

export interface Message {
  role: MessageRole
  content: string
  reasoning: string
  reasoningDuration?: number
  visible?: boolean
  copyable?: boolean
  archived?: boolean
}

/**
 * 任务规划响应
 */
export interface TaskPlanResponse {
  tasks: Omit<Task, 'completed' | 'status'>[]
}

/**
 * 任务执行上下文
 */
export interface TaskExecutionContext {
  taskDescription: string
  previousResult?: string
  mergedContext?: string
  conversationHistory: Message[]
  taskIndex: number
  totalTasks: number
  workingMemoryContext?: string
}

/**
 * 任务模式统计信息
 */
export interface TaskModeStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  totalApiCalls: number
  estimatedTokens?: number
}

/**
 * 任务模式常量配置
 */
export const TASK_MODE_CONSTANTS = {
  /** 默认 TOKEN 阈值 */
  DEFAULT_TOKEN_THRESHOLD: 8000,
  /** 最小 TOKEN 阈值 */
  MIN_TOKEN_THRESHOLD: 2000,
  /** 最大 TOKEN 阈值 */
  MAX_TOKEN_THRESHOLD: 16000,
  /** 默认最大重试次数 */
  DEFAULT_MAX_RETRIES: 2,
} as const

/**
 * 错误类型
 */
export const TaskErrorType = {
  PLANNING_FAILED: 'planning_failed',
  EXECUTION_FAILED: 'execution_failed',
  MERGE_FAILED: 'merge_failed',
  SUMMARIZE_FAILED: 'summarize_failed',
  API_ERROR: 'api_error',
  PARSE_ERROR: 'parse_error',
  ABORTED: 'aborted',
  VALIDATION_ERROR: 'validation_error'
} as const

export type TaskErrorType = typeof TaskErrorType[keyof typeof TaskErrorType]

/**
 * 任务错误类
 */
export class TaskError extends Error {
  type: TaskErrorType
  taskId?: number
  originalError?: Error

  constructor(
    type: TaskErrorType,
    message: string,
    taskId?: number,
    originalError?: Error
  ) {
    super(message)
    this.name = 'TaskError'
    this.type = type
    this.taskId = taskId
    this.originalError = originalError
  }

  /**
   * 判断是否为特定类型的错误
   */
  isType(type: TaskErrorType): boolean {
    return this.type === type
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.type) {
      case TaskErrorType.PLANNING_FAILED:
        return '任务规划失败，请检查您的请求是否清晰'
      case TaskErrorType.EXECUTION_FAILED:
        return this.taskId !== undefined
          ? `任务 ${this.taskId + 1} 执行失败: ${this.message}`
          : `任务执行失败: ${this.message}`
      case TaskErrorType.MERGE_FAILED:
        return '任务整合失败，将使用原始结果继续'
      case TaskErrorType.SUMMARIZE_FAILED:
        return '任务总结失败，将使用完整结果'
      case TaskErrorType.API_ERROR:
        return 'API 请求失败，请检查网络连接和配置'
      case TaskErrorType.PARSE_ERROR:
        return '响应解析失败，请重试'
      case TaskErrorType.ABORTED:
        return '任务已取消'
      case TaskErrorType.VALIDATION_ERROR:
        return `输入验证失败: ${this.message}`
      default:
        return this.message
    }
  }

  /**
   * 获取可重试的判断
   */
  isRetryable(): boolean {
    const retryableTypes: TaskErrorType[] = [
      TaskErrorType.API_ERROR,
      TaskErrorType.EXECUTION_FAILED,
      TaskErrorType.MERGE_FAILED
    ]
    return retryableTypes.includes(this.type)
  }
}

/**
 * 错误处理函数类型
 */
export type ErrorHandler = (error: TaskError) => void

/**
 * 创建统一的错误处理函数
 */
export function createErrorHandler(
  onError?: ErrorHandler,
  _onRetry?: (taskId: number) => void,
  _onSkip?: (taskId: number) => void
): ErrorHandler {
  return (error: TaskError) => {
    console.error('[TaskMode Error]', {
      type: error.type,
      message: error.message,
      taskId: error.taskId,
      originalError: error.originalError
    })

    if (onError) {
      onError(error)
    }
  }
}

/**
 * 格式化错误消息用于显示
 */
export function formatTaskErrorMessage(error: TaskError | Error | unknown): string {
  if (error instanceof TaskError) {
    return error.getUserMessage()
  }

  if (error instanceof Error) {
    return error.message
  }

  return '未知错误'
}

