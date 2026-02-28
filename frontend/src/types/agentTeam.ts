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
  // 新增字段 - 子会话支持
  title?: string                // 子会话标题
  startTime?: number            // 开始时间
  endTime?: number              // 结束时间
  result?: string               // 执行结果摘要
}

/**
 * 子会话 - 独立持久化的 Worker 执行记录
 * 用于悬浮窗口展示和历史查询
 */
export interface SubSession {
  id: string                    // 子会话唯一 ID
  parentChatId: string          // 父聊天 ID
  parentSessionId: string       // 父 TeamSession ID
  workerId: string              // DynamicWorker ID
  workerName: string            // Worker 显示名称
  title: string                 // 子会话标题（通常是任务名称）
  messages: any[]               // 完整消息历史
  status: WorkerSession['status']
  startTime: number             // 开始时间
  endTime?: number              // 结束时间
  result?: string               // 执行结果摘要
  taskIds: string[]             // 关联的任务 IDs
}

/**
 * 子会话注册表
 */
export interface SubSessionRegistry {
  sessions: SubSession[]
  version: number
  lastUpdated: number
  lastCleanupTime: number       // 上次清理时间
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
 * 生成子会话 ID
 */
export function generateSubSessionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
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
2. **优先使用可用的工具**（MCP 工具、文件操作等）来完成任务
3. 向 Team Lead 报告进度和结果

## 工具使用原则（重要！）
- **主动使用工具**：如果任务涉及文件操作、命令执行、网络请求等，立即调用相应的工具
- **不要只是描述**：不要只输出"我将..."，而是直接调用工具执行
- **工具优先于描述**：能用工具完成的操作，不要用文字描述
- **保存结果**：完成任务后，使用 write_file 工具将结果保存到工作空间目录
- **示例**：
  - 需要读取文件？调用 read_file 工具
  - 需要写入文件？调用 write_file 工具
  - 需要执行命令？调用 execute_command 工具
  - 需要列出目录？调用 list_directory 工具

## 工作原则
- 专注完成当前任务，不要超出范围
- 遇到问题及时报告
- 保持输出清晰、结构化
- **完成操作后，将结果保存到工作空间目录**

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
      canUseMCP: true,  // 允许使用 MCP 工具
      canReadFiles: true,
      canWriteFiles: true,
      canExecuteCommands: false,
      maxToolCallsPerTurn: 10
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

## 你的角色（重要：你只负责协调，不执行具体任务）

### 你应该做的：
- 分析用户请求，分解为可执行的子任务
- 创建专业的 Workers 来处理不同类型的任务
- 分配任务给合适的 Worker（在任务描述中明确指定要使用的工具）
- 监控执行进度，检查 Worker 的产出
- 整合所有 Worker 的结果，生成最终输出
- 在 Workers 遇到问题时，调整策略或创建新的 Worker

### 你绝对不应该做的：
- **不要自己执行任务**（如读写文件、执行命令等）
- **不要自己调用工具** - 所有工具调用都由 Workers 完成
- **不要自己编写代码或生成文件内容** - 这是 Worker 的职责
- 你的职责是**协调和同步**，不是**执行**

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

## 分配任务（重要：明确指定工具使用）
创建任务时，输出：
\`\`\`json
{
  "action": "create_task",
  "task": {
    "title": "任务标题",
    "description": "详细任务描述，包括应该使用的工具名称（如：使用 write_file 工具将结果保存到工作空间）",
    "assignedTo": "Worker 名称",
    "priority": 5,
    "recommendedTools": ["工具名称1", "工具名称2"]
  }
}
\`\`\`

## 检查和同步（重要：每轮必做）
每轮 Worker 执行完成后，你必须：

### 1. 检查成果质量
- 仔细阅读 Worker 的输出内容
- 验证是否完成了任务目标
- 检查结果是否符合用户的原始需求

### 2. 评估结果
- 如果结果**符合要求**：继续下一个任务或准备完成
- 如果结果**不符合要求**：
  - 创建优化任务，明确指出问题所在
  - 要求 Worker 修改、补充或重做
  - 提供具体的改进建议

### 3. 处理失败情况
- 如果 Worker 失败，分析失败原因
- 可以重新分配任务给同一个 Worker（附带更详细的指导）
- 或者创建新的 Worker 来处理

### 4. 示例：要求 Worker 优化
\`\`\`json
{
  "action": "create_task",
  "task": {
    "title": "优化代码质量",
    "description": "上次提交的代码存在以下问题：1. 缺少错误处理 2. 变量命名不规范。请使用 edit_file 工具优化这些问题。",
    "assignedTo": "Worker 名称",
    "priority": 8,
    "recommendedTools": ["read_file", "edit_file"]
  }
}
\`\`\`

## 完成执行
当所有任务完成时，输出：
\`\`\`json
{
  "action": "complete",
  "finalOutput": "整合后的最终结果（基于 Workers 的产出）"
}
\`\`\`

## 决策原则
1. **你的核心职责是协调** - 创建 Worker，分配任务，检查结果
2. **任务执行交给 Workers** - 不要尝试自己完成具体工作
3. 按技能类型创建 Workers（如前端开发、后端开发、测试）
4. 每个 Worker 可以处理多个相关任务
5. 任务之间如果有依赖，确保顺序正确
6. 及时整合结果，避免 Workers 等待
7. **确保 Workers 将结果写入工作空间目录，而不是只输出文本**

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

// ==================== SubSession Utilities ====================

/**
 * 创建子会话
 */
export function createSubSession(config: {
  parentChatId: string
  parentSessionId: string
  workerId: string
  workerName: string
  title: string
  taskId?: string
}): SubSession {
  return {
    id: generateSubSessionId(),
    parentChatId: config.parentChatId,
    parentSessionId: config.parentSessionId,
    workerId: config.workerId,
    workerName: config.workerName,
    title: config.title,
    messages: [],
    status: 'idle',
    startTime: Date.now(),
    taskIds: config.taskId ? [config.taskId] : []
  }
}

/**
 * 创建默认子会话注册表
 */
export function createDefaultSubSessionRegistry(): SubSessionRegistry {
  return {
    sessions: [],
    version: 1,
    lastUpdated: Date.now(),
    lastCleanupTime: Date.now()
  }
}

// ==================== Professional Mode (专业模式) ====================

/**
 * 专业模式 7 个阶段
 */
export const ProfessionalPhase = {
  REQUIREMENTS: 'requirements',        // 阶段 1: 需求确认
  ISOLATION: 'isolation',              // 阶段 2: 隔离环境
  PLANNING: 'planning',                // 阶段 3: 计划制定
  TEST_FIRST: 'test_first',            // 阶段 4: 测试先行
  EXECUTION: 'execution',              // 阶段 5: 子代理执行
  REVIEW: 'review',                    // 阶段 6: 两阶段审查
  COMPLETION: 'completion'             // 阶段 7: 收尾验收
} as const
export type ProfessionalPhase = typeof ProfessionalPhase[keyof typeof ProfessionalPhase]

/**
 * 阶段状态
 */
export const PhaseStatus = {
  PENDING: 'pending',      // 等待进入
  IN_PROGRESS: 'in_progress',  // 进行中
  WAITING_USER: 'waiting_user',  // 等待用户确认
  COMPLETED: 'completed',  // 已完成
  BLOCKED: 'blocked'       // 被阻塞（审查发现问题）
} as const
export type PhaseStatus = typeof PhaseStatus[keyof typeof PhaseStatus]

/**
 * 需求确认阶段 - 多选题选项
 */
export interface RequirementOption {
  key: 'A' | 'B' | 'C' | 'D' | 'other'  // 选项标识
  text: string  // 选项内容
}

/**
 * 需求确认阶段 - 关键问题（多选题形式）
 */
export interface RequirementQuestion {
  id: string
  question: string         // AI 提出的问题/需要确认的要点
  options: RequirementOption[]  // ABCD + Other 选项
  selectedOption?: 'A' | 'B' | 'C' | 'D' | 'other'  // 用户选择的选项
  otherInput?: string      // 选择 "Other" 时的自定义输入
  confirmed: boolean       // 用户是否确认理解正确
}

/**
 * 需求确认阶段状态
 */
export interface RequirementsPhaseState {
  phase: 'requirements'
  status: PhaseStatus
  aiUnderstanding: string  // AI 对需求的理解
  questions: RequirementQuestion[]  // ≤3 个关键问题
  confirmedAt?: number
}

/**
 * 隔离环境阶段状态
 */
export interface IsolationPhaseState {
  phase: 'isolation'
  status: PhaseStatus
  workspacePath: string    // 工作目录
  gitBranch?: string       // Git 分支名
  gitBranchCreated?: boolean
  initializedAt?: number
}

/**
 * 计划制定阶段 - 任务拆分
 */
export interface TaskBreakdown {
  id: string
  title: string
  description: string
  expectedOutput: string   // 预期产出
  verificationCriteria: string  // 验证标准
  estimatedAgents: number  // 预计需要的 agent 数量
  dependencies?: string[]  // 依赖的其他任务
}

/**
 * 计划制定阶段状态
 */
export interface PlanningPhaseState {
  phase: 'planning'
  status: PhaseStatus
  breakdown: TaskBreakdown[]  // 任务拆分结果
  fileScope: string[]         // 涉及的文件范围
  estimatedAgents: number     // 预计 agent 总数
  userConfirmed: boolean      // 用户是否确认
  confirmedAt?: number
}

/**
 * 测试先行阶段状态
 */
export interface TestFirstPhaseState {
  phase: 'test_first'
  status: PhaseStatus
  testFiles: string[]      // 生成的测试文件
  testsLocked: boolean     // 测试是否已锁定（不允许修改）
  testAgentId?: string     // 测试 agent ID
  completedAt?: number
}

/**
 * 审查问题级别
 */
export const ReviewSeverity = {
  BLOCKING: 'blocking',    // 严重问题，必须修复
  MAJOR: 'major',          // 重要问题，建议修复
  MINOR: 'minor'           // 轻微问题，可记录不阻塞
} as const
export type ReviewSeverity = typeof ReviewSeverity[keyof typeof ReviewSeverity]

/**
 * 审查问题
 */
export interface ReviewIssue {
  id: string
  severity: ReviewSeverity
  file?: string            // 相关文件
  description: string      // 问题描述
  suggestion?: string      // 修复建议
  fixed: boolean           // 是否已修复
}

/**
 * 两阶段审查状态
 */
export interface ReviewPhaseState {
  phase: 'review'
  status: PhaseStatus
  stage: 'initial' | 're_review'  // 初审 / 复审
  blockingIssues: ReviewIssue[]   // 严重问题（阻塞）
  minorIssues: ReviewIssue[]      // 轻微问题（记录）
  allTestsPassed: boolean         // 测试是否全绿
  reReviewCount: number           // 复审次数
  completedAt?: number
}

/**
 * 收尾验收标准
 */
export interface AcceptanceCriteria {
  allTestsPassed: boolean      // 测试全绿
  noBlockingIssues: boolean    // 无 blocking 问题
  coverageMet: boolean         // 覆盖率达标
  codeReviewPassed: boolean    // 代码审查通过
}

/**
 * 收尾验收阶段状态
 */
export interface CompletionPhaseState {
  phase: 'completion'
  status: PhaseStatus
  criteria: AcceptanceCriteria
  mergeReady: boolean        // 是否可合并
  action: 'merge' | 'pr'     // 合并或创建 PR
  prUrl?: string             // PR 链接
  mergedAt?: number
  completedAt?: number
}

/**
 * 专业模式会话状态
 */
export type ProfessionalPhaseState =
  | RequirementsPhaseState
  | IsolationPhaseState
  | PlanningPhaseState
  | TestFirstPhaseState
  | ReviewPhaseState
  | CompletionPhaseState

/**
 * 专业模式会话 - 扩展 TeamSession
 */
export interface ProfessionalSession extends TeamSession {
  mode: 'professional'
  currentPhase: ProfessionalPhase
  phaseState: ProfessionalPhaseState
  phaseHistory: Array<{
    phase: ProfessionalPhase
    status: PhaseStatus
    enteredAt: number
    completedAt?: number
  }>
  userCheckpoints: Array<{
    phase: ProfessionalPhase
    confirmed: boolean
    confirmedAt: number
    notes?: string
  }>
}

/**
 * 判断是否为专业模式会话
 */
export function isProfessionalSession(session: TeamSession | ProfessionalSession): session is ProfessionalSession {
  return 'mode' in session && session.mode === 'professional'
}

/**
 * 创建团队会话
 */
export function createTeamSession(
  teamId: string,
  userRequest: string
): TeamSession {
  const sessionId = generateSessionId()
  const now = Date.now()
  return {
    id: sessionId,
    teamId,
    userRequest,
    status: 'planning',
    taskQueue: createEmptyTaskQueue(teamId, sessionId),
    dynamicWorkers: {},
    workerSessions: {},
    orchestratorDecisions: [],
    projectState: createInitialProjectState(teamId, sessionId),
    metrics: {
      totalTokensUsed: 0,
      totalToolCalls: 0,
      totalDuration: 0,
      orchestratorTurns: 0,
      workersCreated: 0
    },
    startedAt: now
  }
}

/**
 * 创建专业模式会话
 */
export function createProfessionalSession(
  teamId: string,
  userRequest: string
): ProfessionalSession {
  const baseSession = createTeamSession(teamId, userRequest)
  return {
    ...baseSession,
    mode: 'professional',
    currentPhase: 'requirements',
    phaseState: {
      phase: 'requirements',
      status: 'pending',
      aiUnderstanding: '',
      questions: []
    },
    phaseHistory: [{
      phase: 'requirements',
      status: 'pending',
      enteredAt: Date.now()
    }],
    userCheckpoints: []
  }
}

/**
 * 获取当前阶段的显示名称
 */
export function getPhaseDisplayName(phase: ProfessionalPhase): string {
  const names: Record<ProfessionalPhase, string> = {
    requirements: '需求确认',
    isolation: '隔离环境',
    planning: '计划制定',
    test_first: '测试先行',
    execution: '子代理执行',
    review: '两阶段审查',
    completion: '收尾验收'
  }
  return names[phase]
}

/**
 * 获取阶段状态的显示颜色类
 */
export function getPhaseStatusClass(status: PhaseStatus): string {
  const classes: Record<PhaseStatus, string> = {
    pending: 'phase-pending',
    in_progress: 'phase-in-progress',
    waiting_user: 'phase-waiting',
    completed: 'phase-completed',
    blocked: 'phase-blocked'
  }
  return classes[status]
}
