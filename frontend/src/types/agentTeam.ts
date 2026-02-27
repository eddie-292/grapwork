/**
 * Agent Teams 类型定义
 * 多智能体协作系统
 */

// ==================== Agent Definition ====================

/**
 * Agent 在团队中的角色
 */
export const AgentRole = {
  ORCHESTRATOR: 'orchestrator',  // 编排者 - 负责任务分配和结果汇总
  WORKER: 'worker',              // 执行者 - 负责执行具体任务
  SUPERVISOR: 'supervisor'       // 监督者 - 可选，监控进度和处理失败
} as const
export type AgentRole = typeof AgentRole[keyof typeof AgentRole]

/**
 * Agent 能力配置
 */
export interface AgentCapabilities {
  canUseMCP: boolean           // 可以使用 MCP 工具
  canReadFiles: boolean        // 可以读取文件
  canWriteFiles: boolean       // 可以写入文件
  canExecuteCommands: boolean  // 可以执行 shell 命令
  maxToolCallsPerTurn: number  // 每轮最大工具调用次数（安全限制）
}

/**
 * Agent 约束配置
 */
export interface AgentConstraints {
  allowedTools?: string[]      // 允许的工具白名单
  forbiddenTools?: string[]    // 禁止的工具黑名单
  workingDirectory?: string    // 限制工作目录
}

/**
 * Agent 定义 - 定义一个 Agent 的能力和行为
 */
export interface AgentDefinition {
  id: string                     // 唯一标识符
  name: string                   // 显示名称（如 "Research Agent"）
  role: AgentRole                // 团队角色
  description: string            // 职责描述

  // 配置
  systemPrompt: string           // Agent 系统提示词（可包含 {{teamContext}} 变量）
  configId?: string              // LLM 配置 ID（不设置则继承团队配置）
  assistantId?: string           // 助理 ID（用于基础系统提示词）

  // 能力和约束
  capabilities: AgentCapabilities
  constraints?: AgentConstraints

  // 元数据
  createdAt: number
  updatedAt: number
}

// ==================== Dynamic Worker System ====================

/**
 * 动态 Worker 状态
 */
export const DynamicWorkerStatus = {
  IDLE: 'idle',           // 空闲，等待任务
  BUSY: 'busy',           // 忙碌，正在执行任务
  COMPLETED: 'completed'  // 已完成所有任务
} as const
export type DynamicWorkerStatus = typeof DynamicWorkerStatus[keyof typeof DynamicWorkerStatus]

/**
 * 动态 Worker - 由 Orchestrator 运行时创建
 */
export interface DynamicWorker {
  id: string                     // 运行时生成的唯一 ID
  name: string                   // Orchestrator 分配的名称（如 "Frontend Developer"）
  description: string            // 任务特定描述
  systemPrompt: string           // 基于模板生成的提示词
  capabilities: AgentCapabilities
  constraints?: AgentConstraints
  configId: string               // LLM 配置 ID

  // 状态
  status: DynamicWorkerStatus
  currentTaskId?: string         // 当前执行的任务 ID
  completedTaskIds: string[]     // 已完成的任务 IDs

  // 元数据
  createdAt: number
  createdBy: 'orchestrator'      // 标识为 AI 创建
  focusArea?: string             // 专注领域（如 frontend, backend, testing）
}

/**
 * Orchestrator 决策类型
 */
export const OrchestratorAction = {
  CREATE_WORKER: 'create_worker',       // 创建新 Worker
  ASSIGN_TASK: 'assign_task',           // 分配任务给 Worker
  CREATE_TASK: 'create_task',           // 创建新任务
  INTEGRATE_RESULTS: 'integrate_results', // 整合结果
  COMPLETE: 'complete',                 // 完成执行
  REQUEST_INFO: 'request_info'          // 请求用户信息
} as const
export type OrchestratorAction = typeof OrchestratorAction[keyof typeof OrchestratorAction]

/**
 * Orchestrator 决策记录
 */
export interface OrchestratorDecision {
  timestamp: number
  action: OrchestratorAction
  reasoning: string              // AI 的决策理由
  details: Record<string, any>   // 具体内容
}

// ==================== Team Definition ====================

/**
 * 团队执行模式
 */
export const TeamPattern = {
  ORCHESTRATOR_WORKER: 'orchestrator-worker',  // 编排-执行模式：Lead 分配，Workers 执行
  PIPELINE: 'pipeline',                        // 流水线模式：串行执行
  PARALLEL: 'parallel'                         // 并行模式：同时执行
} as const
export type TeamPattern = typeof TeamPattern[keyof typeof TeamPattern]

/**
 * Worker 模板配置 - 用于动态创建 Workers
 */
export interface WorkerTemplate {
  basePrompt: string                    // Worker 基础提示词模板
  defaultCapabilities: AgentCapabilities // 默认能力
  defaultConstraints?: AgentConstraints  // 默认约束
  inheritOrchestratorConfig: boolean    // 是否继承 Orchestrator 的 LLM 配置
}

/**
 * 团队执行配置
 */
export interface TeamExecutionConfig {
  maxParallelWorkers: number      // 最大并行 Worker 数量（默认 3）
  taskTimeout: number             // 单任务超时（毫秒）
  maxRetries: number              // 最大重试次数
  workerIdleTimeout: number       // Worker 空闲销毁时间（毫秒）
  defaultConfigId?: string        // 默认 LLM 配置 ID
}

/**
 * 团队协调配置
 */
export interface TeamCoordination {
  useTaskQueue: boolean        // 使用文件任务队列
  useMailbox: boolean          // 使用消息传递
  updateSharedState: boolean   // 更新共享状态文件
}

/**
 * Agent Team - 一个协作团队（简化版：只有 Orchestrator 是预定义的）
 */
export interface AgentTeam {
  id: string
  name: string
  description: string

  // 团队结构
  pattern: TeamPattern

  // Orchestrator 配置（唯一的预定义 agent）
  orchestrator: AgentDefinition

  // Worker 模板（用于动态创建）
  workerTemplate: WorkerTemplate

  // 执行配置
  executionConfig: TeamExecutionConfig

  // 协调设置
  coordination: TeamCoordination

  // 元数据
  enabled: boolean
  createdAt: number
  updatedAt: number
}

// ==================== Legacy Support (向后兼容) ====================

/**
 * @deprecated 使用 TeamExecutionConfig 代替
 */
export type TeamSharedConfig = TeamExecutionConfig & {
  workspacePath?: string
  parallelWorkers?: number
}

// ==================== Task System ====================

/**
 * 任务状态
 */
export const TaskStatus = {
  PENDING: 'pending',           // 等待中，未领取
  CLAIMED: 'claimed',           // 已被认领
  IN_PROGRESS: 'in_progress',   // 执行中
  COMPLETED: 'completed',       // 已完成
  FAILED: 'failed',             // 失败
  CANCELLED: 'cancelled'        // 已取消
} as const
export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus]

/**
 * 任务优先级
 */
export const TaskPriority = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
  CRITICAL: 20
} as const
export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority]

/**
 * Agent Task - 一个工作单元
 */
export interface AgentTask {
  id: string                    // 唯一任务 ID
  teamId: string                // 所属团队 ID
  sessionId: string             // 执行会话 ID

  // 任务内容
  title: string                 // 简短标题
  description: string           // 详细描述（给 Worker 的指令）

  // 分配
  assignedTo?: string           // 指定的 Agent ID（预分配）
  claimedBy?: string            // 认领的 Agent ID

  // 状态追踪
  status: TaskStatus
  priority: TaskPriority

  // 依赖关系
  dependsOn?: string[]          // 依赖的任务 IDs

  // 执行数据
  input?: Record<string, any>   // 输入数据/参数
  output?: Record<string, any>  // 输出数据（完成时）
  error?: string                // 错误信息（失败时）

  // 结果文件路径
  resultPath?: string           // 结果文件路径

  // 时间追踪
  createdAt: number
  claimedAt?: number
  startedAt?: number
  completedAt?: number

  // 重试追踪
  retryCount: number
  maxRetries: number
}

/**
 * 任务队列结构
 */
export interface TaskQueue {
  teamId: string
  sessionId: string

  pending: AgentTask[]          // tasks/pending/
  inProgress: AgentTask[]       // tasks/in_progress/
  completed: AgentTask[]        // tasks/completed/

  lastUpdated: number
}

// ==================== Message System ====================

/**
 * Agent 消息类型
 */
export const AgentMessageType = {
  TASK_ASSIGNMENT: 'task_assignment',   // 任务分配
  TASK_STATUS: 'task_status',           // 任务状态更新
  TASK_RESULT: 'task_result',           // 任务结果
  QUESTION: 'question',                 // 问题
  ANSWER: 'answer',                     // 回答
  NOTIFICATION: 'notification',         // 通知
  ERROR: 'error'                        // 错误
} as const
export type AgentMessageType = typeof AgentMessageType[keyof typeof AgentMessageType]

/**
 * Agent 间消息
 */
export interface AgentMessage {
  id: string
  sessionId: string

  from: string                  // 发送者 Agent ID
  to: string                    // 接收者 Agent ID（或 'broadcast'）

  type: AgentMessageType
  subject: string
  content: string

  // 关联任务
  taskId?: string

  // 元数据
  timestamp: number
  read: boolean
}

/**
 * Agent 邮箱（存储为 JSONL）
 */
export interface AgentMailbox {
  agentId: string
  messages: AgentMessage[]
}

// ==================== Shared State ====================

/**
 * 项目共享状态（project_state.json）
 */
export interface ProjectState {
  teamId: string
  sessionId: string

  // 当前状态
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'failed'

  // 进度追踪
  totalTasks: number
  completedTasks: number
  failedTasks: number

  // 当前工作
  activeWorkers: string[]       // 正在工作的 Agent IDs

  // 累积上下文
  context: Record<string, any>  // 共享知识/上下文

  // 时间
  startedAt: number
  updatedAt: number
  estimatedEndAt?: number

  // 最终输出
  finalOutput?: string
}

// ==================== Execution Session ====================

/**
 * Worker 会话（运行时状态）
 */
export interface WorkerSession {
  workerId: string              // DynamicWorker ID
  agentId: string               // @deprecated 使用 workerId
  chatId: string                // Worker 的聊天会话 ID
  messages: any[]               // Worker 的对话历史
  status: 'idle' | 'working' | 'completed' | 'failed'
  currentTaskId?: string        // 当前正在执行的任务 ID
  processId?: number            // ChildProcess PID（用于取消）
}

/**
 * 会话指标
 */
export interface SessionMetrics {
  totalTokensUsed: number
  totalToolCalls: number
  totalDuration: number         // 毫秒
  orchestratorTurns: number     // Orchestrator 轮次数
  workersCreated: number        // 创建的 Worker 数量
}

/**
 * Team Session - 一次执行会话（支持动态 Workers）
 */
export interface TeamSession {
  id: string                    // 会话 ID（每次执行唯一）
  teamId: string                // 执行的团队 ID

  // 用户请求
  userRequest: string           // 原始用户请求
  orchestratorPlan?: string     // Orchestrator 的计划

  // 状态
  status: 'planning' | 'executing' | 'integrating' | 'completed' | 'failed' | 'cancelled'

  // 任务追踪
  taskQueue: TaskQueue

  // 动态 Workers（由 Orchestrator 创建）
  dynamicWorkers: Record<string, DynamicWorker>

  // Worker 会话（运行时状态）
  workerSessions: Record<string, WorkerSession>

  // Orchestrator 决策记录
  orchestratorDecisions: OrchestratorDecision[]

  // 共享状态引用
  projectState: ProjectState

  // 输出
  finalOutput?: string

  // 时间
  startedAt: number
  completedAt?: number

  // 指标
  metrics: SessionMetrics
}

// ==================== Registry ====================

/**
 * 团队注册表
 */
export interface TeamRegistry {
  teams: AgentTeam[]
  activeTeamId?: string
  version: number
  lastUpdated: number
}

/**
 * 会话注册表
 */
export interface SessionRegistry {
  sessions: TeamSession[]
  activeSessionId?: string
  version: number
  lastUpdated: number
}

// ==================== Utility Functions ====================

/**
 * 生成唯一 ID
 */
export function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function generateTeamId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 创建默认 Agent 能力
 */
export function createDefaultCapabilities(): AgentCapabilities {
  return {
    canUseMCP: true,
    canReadFiles: true,
    canWriteFiles: true,
    canExecuteCommands: true,
    maxToolCallsPerTurn: 10
  }
}

/**
 * 创建默认团队共享配置
 * @deprecated 使用 createDefaultExecutionConfig 代替
 */
export function createDefaultSharedConfig(): TeamExecutionConfig {
  return createDefaultExecutionConfig()
}

/**
 * 创建默认团队协调配置
 */
export function createDefaultCoordination(): TeamCoordination {
  return {
    useTaskQueue: true,
    useMailbox: true,
    updateSharedState: true
  }
}

/**
 * 创建空任务队列
 */
export function createEmptyTaskQueue(teamId: string, sessionId: string): TaskQueue {
  return {
    teamId,
    sessionId,
    pending: [],
    inProgress: [],
    completed: [],
    lastUpdated: Date.now()
  }
}

/**
 * 创建初始项目状态
 */
export function createInitialProjectState(teamId: string, sessionId: string): ProjectState {
  return {
    teamId,
    sessionId,
    status: 'initializing',
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    activeWorkers: [],
    context: {},
    startedAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 创建默认团队注册表
 */
export function createDefaultTeamRegistry(): TeamRegistry {
  return {
    teams: [],
    activeTeamId: undefined,
    version: 1,
    lastUpdated: Date.now()
  }
}

/**
 * 创建默认会话注册表
 */
export function createDefaultSessionRegistry(): SessionRegistry {
  return {
    sessions: [],
    activeSessionId: undefined,
    version: 1,
    lastUpdated: Date.now()
  }
}

// ==================== Dynamic Worker Utilities ====================

/**
 * 生成动态 Worker ID
 */
export function generateDynamicWorkerId(): string {
  return `worker_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 创建默认 Worker 模板
 */
export function createDefaultWorkerTemplate(): WorkerTemplate {
  return {
    basePrompt: `你是一个专业的 AI Worker，负责执行团队分配给你的任务。

## 你的职责
1. 仔细理解分配给你的任务
2. 使用可用的工具和资源完成任务
3. 向 Team Lead 报告进度和结果

## 工作原则
- 专注完成当前任务，不要超出范围
- 遇到问题及时报告
- 保持输出清晰、结构化

## 可用能力
{{capabilities}}

## 当前任务
{{task}}`,
    defaultCapabilities: createDefaultCapabilities(),
    defaultConstraints: undefined,
    inheritOrchestratorConfig: true
  }
}

/**
 * 创建默认执行配置
 */
export function createDefaultExecutionConfig(): TeamExecutionConfig {
  return {
    maxParallelWorkers: 3,
    taskTimeout: 300000,      // 5 分钟
    maxRetries: 3,
    workerIdleTimeout: 60000  // 1 分钟
  }
}

/**
 * 创建动态 Worker
 */
export function createDynamicWorker(config: {
  name: string
  description: string
  systemPrompt: string
  capabilities: AgentCapabilities
  constraints?: AgentConstraints
  configId: string
  focusArea?: string
}): DynamicWorker {
  return {
    id: generateDynamicWorkerId(),
    name: config.name,
    description: config.description,
    systemPrompt: config.systemPrompt,
    capabilities: config.capabilities,
    constraints: config.constraints,
    configId: config.configId,
    status: 'idle',
    completedTaskIds: [],
    createdAt: Date.now(),
    createdBy: 'orchestrator',
    focusArea: config.focusArea
  }
}

/**
 * 创建默认 Orchestrator 定义
 */
export function createDefaultOrchestrator(): AgentDefinition {
  return {
    id: generateAgentId(),
    name: 'Team Lead',
    role: 'orchestrator',
    description: '负责分析用户请求、规划任务、分配给 Workers 并整合结果',
    systemPrompt: buildDefaultOrchestratorPrompt(),
    capabilities: {
      canUseMCP: false,
      canReadFiles: true,
      canWriteFiles: true,
      canExecuteCommands: false,
      maxToolCallsPerTurn: 5
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

/**
 * 构建默认 Orchestrator 提示词
 */
export function buildDefaultOrchestratorPrompt(): string {
  return `你是 Team Lead，负责协调 AI Workers 团队完成复杂任务。

## 你的角色
- 分析用户请求，分解为可执行的子任务
- 创建专业的 Workers 来处理不同类型的任务
- 分配任务给合适的 Worker
- 监控执行进度
- 整合所有 Worker 的结果

## 创建 Worker
当你决定需要创建 Worker 时，输出 JSON 格式：
\`\`\`json
{
  "action": "create_worker",
  "worker": {
    "name": "Worker 名称（如 Frontend Developer）",
    "description": "Worker 的职责描述",
    "focusArea": "专注领域（如 frontend, backend, testing）",
    "capabilities": {
      "canUseMCP": true,
      "canReadFiles": true,
      "canWriteFiles": true,
      "canExecuteCommands": false
    }
  }
}
\`\`\`

## 分配任务
创建任务时，输出：
\`\`\`json
{
  "action": "create_task",
  "task": {
    "title": "任务标题",
    "description": "详细任务描述",
    "assignedTo": "Worker 名称",
    "priority": 5
  }
}
\`\`\`

## 完成执行
当所有任务完成时，输出：
\`\`\`json
{
  "action": "complete",
  "finalOutput": "整合后的最终结果"
}
\`\`\`

## 决策原则
1. 按技能类型创建 Workers（如前端开发、后端开发、测试）
2. 每个 Worker 可以处理多个相关任务
3. 任务之间如果有依赖，确保顺序正确
4. 及时整合结果，避免 Workers 等待

{{teamContext}}`
}

/**
 * 创建默认团队（简化版：只需配置 Orchestrator）
 */
export function createDefaultTeam(name: string = 'My Team'): AgentTeam {
  const now = Date.now()
  return {
    id: generateTeamId(),
    name,
    description: 'AI 自主管理的协作团队',
    pattern: 'orchestrator-worker',
    orchestrator: createDefaultOrchestrator(),
    workerTemplate: createDefaultWorkerTemplate(),
    executionConfig: createDefaultExecutionConfig(),
    coordination: createDefaultCoordination(),
    enabled: true,
    createdAt: now,
    updatedAt: now
  }
}
