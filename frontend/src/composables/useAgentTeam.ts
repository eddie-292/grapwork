/**
 * Agent Teams 管理 Composable
 * 多智能体协作系统的核心逻辑 - 支持动态 Worker 创建
 */
import { ref, computed } from 'vue'
import { storage } from '@/services/StorageService'
import type {
  AgentTeam,
  AgentDefinition,
  TeamRegistry,
  TeamSession,
  SessionRegistry,
  AgentTask,
  AgentMessage,
  WorkerSession,
  DynamicWorker,
  AgentCapabilities,
  ProfessionalSession,
  ProfessionalPhase,
  ProfessionalPhaseState
} from '@/types/agentTeam'
import {
  generateTaskId,
  generateSessionId,
  generateMessageId,
  createDefaultTeam,
  createDynamicWorker as createDynamicWorkerObj,
  createEmptyTaskQueue,
  createInitialProjectState,
  createDefaultTeamRegistry,
  createDefaultSessionRegistry,
  createProfessionalSession,
  isProfessionalSession,
  TaskStatus,
  TaskPriority,
  AgentMessageType,
  OrchestratorAction
} from '@/types/agentTeam'

// 单例管理器
let agentTeamManager: ReturnType<typeof createAgentTeamManager> | null = null

function createAgentTeamManager() {
  // ==================== State ====================

  const teamRegistry = ref<TeamRegistry>(createDefaultTeamRegistry())
  const sessionRegistry = ref<SessionRegistry>(createDefaultSessionRegistry())
  const currentSession = ref<TeamSession | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ==================== Computed ====================

  const teams = computed(() => teamRegistry.value.teams)
  const activeTeam = computed(() => {
    if (!teamRegistry.value.activeTeamId) return null
    return teamRegistry.value.teams.find(t => t.id === teamRegistry.value.activeTeamId) ?? null
  })
  const sessions = computed(() => sessionRegistry.value.sessions)
  const activeSession = computed(() => {
    if (!sessionRegistry.value.activeSessionId) return null
    return sessionRegistry.value.sessions.find(s => s.id === sessionRegistry.value.activeSessionId) ?? null
  })

  // ==================== Team CRUD ====================

  /**
   * 加载团队注册表
   */
  async function loadTeams(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      teamRegistry.value = await storage.getTeamRegistry()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load teams'
      console.error('[AgentTeams] Failed to load teams:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存团队注册表
   */
  async function saveTeams(): Promise<boolean> {
    try {
      return await storage.saveTeamRegistry(teamRegistry.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save teams'
      console.error('[AgentTeams] Failed to save teams:', e)
      return false
    }
  }

  /**
   * 创建新团队（简化版：只需配置 Orchestrator）
   */
  async function createTeam(name: string, description: string = ''): Promise<AgentTeam> {
    const team = createDefaultTeam(name)
    team.description = description

    teamRegistry.value.teams.push(team)
    await saveTeams()

    return team
  }

  /**
   * 更新团队
   */
  async function updateTeam(teamId: string, updates: Partial<AgentTeam>): Promise<boolean> {
    const index = teamRegistry.value.teams.findIndex(t => t.id === teamId)
    if (index < 0) {
      error.value = 'Team not found'
      return false
    }

    const existingTeam = teamRegistry.value.teams[index]
    if (!existingTeam) {
      error.value = 'Team not found'
      return false
    }

    teamRegistry.value.teams[index] = {
      ...existingTeam,
      ...updates,
      id: existingTeam.id,
      name: updates.name ?? existingTeam.name,
      description: updates.description ?? existingTeam.description,
      updatedAt: Date.now()
    }

    return saveTeams()
  }

  /**
   * 删除团队
   */
  async function deleteTeam(teamId: string): Promise<boolean> {
    teamRegistry.value.teams = teamRegistry.value.teams.filter(t => t.id !== teamId)
    if (teamRegistry.value.activeTeamId === teamId) {
      teamRegistry.value.activeTeamId = undefined
    }
    return saveTeams()
  }

  /**
   * 设置激活团队
   */
  async function setActiveTeam(teamId: string | undefined): Promise<boolean> {
    teamRegistry.value.activeTeamId = teamId
    return saveTeams()
  }

  // ==================== Agent CRUD ====================

  /**
   * 更新 Orchestrator 配置
   */
  async function updateOrchestrator(teamId: string, updates: Partial<AgentDefinition>): Promise<boolean> {
    const team = teamRegistry.value.teams.find(t => t.id === teamId)
    if (!team) {
      error.value = 'Team not found'
      return false
    }

    team.orchestrator = {
      ...team.orchestrator,
      ...updates,
      updatedAt: Date.now()
    }

    return saveTeams()
  }

  /**
   * 更新 Agent（兼容旧 API，现在只更新 Orchestrator）
   */
  async function updateAgent(teamId: string, _agentId: string, updates: Partial<AgentDefinition>): Promise<boolean> {
    // 在新架构中，只有 orchestrator 是预定义的
    return updateOrchestrator(teamId, updates)
  }

  /**
   * @deprecated 在新架构中不再需要手动添加 agent
   */
  async function addAgent(_teamId: string, _agent: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentDefinition | null> {
    console.warn('[AgentTeams] addAgent is deprecated in the new architecture')
    return null
  }

  /**
   * @deprecated 在新架构中不再需要手动删除 agent
   */
  async function deleteAgent(_teamId: string, _agentId: string): Promise<boolean> {
    console.warn('[AgentTeams] deleteAgent is deprecated in the new architecture')
    return false
  }

  // ==================== Session Management ====================

  /**
   * 加载会话注册表
   */
  async function loadSessions(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      sessionRegistry.value = await storage.getSessionRegistry()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load sessions'
      console.error('[AgentTeams] Failed to load sessions:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 开始新会话
   */
  async function startSession(teamId: string, userRequest: string): Promise<TeamSession | null> {
    const team = teamRegistry.value.teams.find(t => t.id === teamId)
    if (!team) {
      error.value = 'Team not found'
      return null
    }

    const sessionId = generateSessionId()
    const now = Date.now()

    const session: TeamSession = {
      id: sessionId,
      teamId: team.id,
      userRequest,
      status: 'planning',
      taskQueue: createEmptyTaskQueue(team.id, sessionId),
      dynamicWorkers: {},        // 动态 Workers 由 Orchestrator 创建
      workerSessions: {},        // 运行时状态
      orchestratorDecisions: [], // 决策记录
      projectState: createInitialProjectState(team.id, sessionId),
      startedAt: now,
      metrics: {
        totalTokensUsed: 0,
        totalToolCalls: 0,
        totalDuration: 0,
        orchestratorTurns: 0,
        workersCreated: 0
      }
    }

    // 初始化 Orchestrator 的 session
    session.workerSessions[team.orchestrator.id] = {
      workerId: team.orchestrator.id,
      agentId: team.orchestrator.id,
      chatId: `chat_orchestrator_${sessionId}`,
      messages: [],
      status: 'idle'
    }

    sessionRegistry.value.sessions.push(session)
    sessionRegistry.value.activeSessionId = sessionId
    currentSession.value = session

    await storage.saveSessionRegistry(sessionRegistry.value)

    return session
  }

  /**
   * 更新会话
   */
  async function updateSession(session: TeamSession): Promise<boolean> {
    const index = sessionRegistry.value.sessions.findIndex(s => s.id === session.id)
    if (index < 0) {
      error.value = 'Session not found'
      return false
    }

    sessionRegistry.value.sessions[index] = session
    currentSession.value = session

    return storage.saveSessionRegistry(sessionRegistry.value)
  }

  /**
   * 取消会话
   */
  async function cancelSession(sessionId: string): Promise<boolean> {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      error.value = 'Session not found'
      return false
    }

    session.status = 'cancelled'
    session.projectState.status = 'completed'

    if (sessionRegistry.value.activeSessionId === sessionId) {
      sessionRegistry.value.activeSessionId = undefined
    }
    if (currentSession.value?.id === sessionId) {
      currentSession.value = null
    }

    return storage.saveSessionRegistry(sessionRegistry.value)
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<boolean> {
    sessionRegistry.value.sessions = sessionRegistry.value.sessions.filter(s => s.id !== sessionId)

    if (sessionRegistry.value.activeSessionId === sessionId) {
      sessionRegistry.value.activeSessionId = undefined
    }
    if (currentSession.value?.id === sessionId) {
      currentSession.value = null
    }

    return storage.saveSessionRegistry(sessionRegistry.value)
  }

  // ==================== Task Management ====================

  /**
   * 创建任务
   */
  function createTask(
    sessionId: string,
    title: string,
    description: string,
    options: {
      assignedTo?: string
      priority?: number
      input?: Record<string, any>
      dependsOn?: string[]
    } = {}
  ): AgentTask | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      error.value = 'Session not found'
      return null
    }

    const task: AgentTask = {
      id: generateTaskId(),
      teamId: session.teamId,
      sessionId,
      title,
      description,
      status: TaskStatus.PENDING,
      priority: (options.priority ?? 5) as TaskPriority,
      assignedTo: options.assignedTo,
      input: options.input,
      dependsOn: options.dependsOn,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now()
    }

    session.taskQueue.pending.push(task)
    session.taskQueue.lastUpdated = Date.now()
    session.projectState.totalTasks++

    return task
  }

  /**
   * 认领任务（原子操作）
   */
  function claimTask(taskId: string, agentId: string, sessionId: string): AgentTask | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return null

    const taskIndex = session.taskQueue.pending.findIndex(t => t.id === taskId)
    if (taskIndex < 0) return null

    const task = session.taskQueue.pending[taskIndex]
    if (!task) return null

    // 检查依赖是否满足
    if (task.dependsOn && task.dependsOn.length > 0) {
      const completedIds = session.taskQueue.completed.map(t => t.id)
      const unmetDeps = task.dependsOn.filter(depId => !completedIds.includes(depId))
      if (unmetDeps.length > 0) {
        return null // 依赖未满足
      }
    }

    // 从 pending 移除
    session.taskQueue.pending.splice(taskIndex, 1)

    // 更新任务状态
    task.status = TaskStatus.IN_PROGRESS
    task.claimedBy = agentId
    task.claimedAt = Date.now()
    task.startedAt = Date.now()

    // 添加到 inProgress
    session.taskQueue.inProgress.push(task)
    session.taskQueue.lastUpdated = Date.now()

    return task
  }

  /**
   * 完成任务
   */
  function completeTask(
    taskId: string,
    sessionId: string,
    output?: Record<string, any>,
    resultPath?: string
  ): boolean {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return false

    const taskIndex = session.taskQueue.inProgress.findIndex(t => t.id === taskId)
    if (taskIndex < 0) return false

    const task = session.taskQueue.inProgress[taskIndex]
    if (!task) return false

    // 从 inProgress 移除
    session.taskQueue.inProgress.splice(taskIndex, 1)

    // 更新任务状态
    task.status = TaskStatus.COMPLETED
    task.output = output
    task.resultPath = resultPath
    task.completedAt = Date.now()

    // 添加到 completed
    session.taskQueue.completed.push(task)
    session.taskQueue.lastUpdated = Date.now()

    // 更新项目状态
    session.projectState.completedTasks++
    session.projectState.updatedAt = Date.now()

    return true
  }

  /**
   * 任务失败
   */
  function failTask(taskId: string, sessionId: string, errorMsg: string): boolean {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return false

    const taskIndex = session.taskQueue.inProgress.findIndex(t => t.id === taskId)
    if (taskIndex < 0) return false

    const task = session.taskQueue.inProgress[taskIndex]
    if (!task) return false

    // 从 inProgress 移除
    session.taskQueue.inProgress.splice(taskIndex, 1)

    // 更新任务状态
    task.error = errorMsg
    task.retryCount++

    // 判断是否需要重试
    if (task.retryCount < task.maxRetries) {
      task.status = TaskStatus.PENDING
      task.claimedBy = undefined
      task.claimedAt = undefined
      task.startedAt = undefined
      session.taskQueue.pending.push(task)
    } else {
      task.status = TaskStatus.FAILED
      task.completedAt = Date.now()
      session.taskQueue.completed.push(task)
      session.projectState.failedTasks++
    }

    session.taskQueue.lastUpdated = Date.now()
    session.projectState.updatedAt = Date.now()

    return true
  }

  // ==================== Dynamic Worker Management ====================

  /**
   * 创建动态 Worker（由 Orchestrator 调用）
   */
  function createDynamicWorker(
    sessionId: string,
    config: {
      name: string
      description: string
      capabilities?: Partial<AgentCapabilities>
      focusArea?: string
    }
  ): DynamicWorker | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      error.value = 'Session not found'
      return null
    }

    const team = teamRegistry.value.teams.find(t => t.id === session.teamId)
    if (!team) {
      error.value = 'Team not found'
      return null
    }

    // 检查是否已达到最大并行数
    const activeWorkers = Object.values(session.dynamicWorkers).filter(
      w => w.status !== 'completed'
    ).length
    if (activeWorkers >= team.executionConfig.maxParallelWorkers) {
      error.value = 'Maximum parallel workers reached'
      return null
    }

    // 检查是否已有同名 Worker（按技能类型复用）
    const existingWorker = Object.values(session.dynamicWorkers).find(
      w => w.name === config.name && w.status !== 'completed'
    )
    if (existingWorker) {
      return existingWorker  // 复用现有 Worker
    }

    // 合并能力配置
    const capabilities: AgentCapabilities = {
      ...team.workerTemplate.defaultCapabilities,
      ...config.capabilities
    }

    // 生成系统提示词
    const systemPrompt = team.workerTemplate.basePrompt
      .replace('{{capabilities}}', JSON.stringify(capabilities, null, 2))
      .replace('{{task}}', '')  // 任务在分配时填充

    // 确定 LLM 配置
    const configId = team.workerTemplate.inheritOrchestratorConfig
      ? team.orchestrator.configId || team.executionConfig.defaultConfigId || ''
      : team.executionConfig.defaultConfigId || ''

    // 创建动态 Worker
    const worker = createDynamicWorkerObj({
      name: config.name,
      description: config.description,
      systemPrompt,
      capabilities,
      constraints: team.workerTemplate.defaultConstraints,
      configId,
      focusArea: config.focusArea
    })

    // 添加到 session
    session.dynamicWorkers[worker.id] = worker

    // 创建 Worker Session
    session.workerSessions[worker.id] = {
      workerId: worker.id,
      agentId: worker.id,
      chatId: `chat_${worker.id}_${sessionId}`,
      messages: [],
      status: 'idle'
    }

    // 更新指标
    session.metrics.workersCreated++

    // 记录决策
    session.orchestratorDecisions.push({
      timestamp: Date.now(),
      action: OrchestratorAction.CREATE_WORKER,
      reasoning: `Created worker "${config.name}" for ${config.focusArea || 'general'} tasks`,
      details: { workerId: worker.id, workerName: config.name }
    })

    return worker
  }

  /**
   * 销毁动态 Worker
   */
  function destroyWorker(sessionId: string, workerId: string): boolean {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return false

    const worker = session.dynamicWorkers[workerId]
    if (!worker) return false

    // 标记为完成
    worker.status = 'completed'

    // 更新 Worker Session 状态
    const ws = session.workerSessions[workerId]
    if (ws) {
      ws.status = 'completed'
    }

    return true
  }

  /**
   * 获取可用的动态 Worker（按技能类型）
   */
  function getAvailableWorker(
    sessionId: string,
    focusArea?: string
  ): DynamicWorker | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return null

    // 查找空闲的 Worker
    const workers = Object.values(session.dynamicWorkers)

    // 如果指定了领域，优先匹配
    if (focusArea) {
      const matched = workers.find(
        w => w.focusArea === focusArea && w.status === 'idle'
      )
      if (matched) return matched
    }

    // 返回任意空闲 Worker
    return workers.find(w => w.status === 'idle') || null
  }

  /**
   * 更新动态 Worker 状态
   */
  function updateWorkerStatus(
    sessionId: string,
    workerId: string,
    status: 'idle' | 'busy' | 'completed',
    currentTaskId?: string
  ): boolean {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return false

    const worker = session.dynamicWorkers[workerId]
    if (!worker) return false

    worker.status = status
    worker.currentTaskId = currentTaskId

    // 更新 Worker Session
    const ws = session.workerSessions[workerId]
    if (ws) {
      ws.status = status === 'busy' ? 'working' : status === 'completed' ? 'completed' : 'idle'
      ws.currentTaskId = currentTaskId
    }

    return true
  }

  /**
   * 记录 Orchestrator 决策
   */
  function recordOrchestratorDecision(
    sessionId: string,
    action: OrchestratorAction,
    reasoning: string,
    details: Record<string, any>
  ): boolean {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return false

    session.orchestratorDecisions.push({
      timestamp: Date.now(),
      action,
      reasoning,
      details
    })

    return true
  }

  // ==================== Message System ====================

  /**
   * 发送消息
   */
  function sendMessage(
    sessionId: string,
    from: string,
    to: string,
    type: AgentMessageType,
    subject: string,
    content: string,
    taskId?: string
  ): AgentMessage | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return null

    const message: AgentMessage = {
      id: generateMessageId(),
      sessionId,
      from,
      to,
      type,
      subject,
      content,
      taskId,
      timestamp: Date.now(),
      read: false
    }

    // 在实际实现中，这里会写入文件系统
    // 暂时存储在 session 的上下文中
    if (!session.projectState.context.messages) {
      session.projectState.context.messages = []
    }
    session.projectState.context.messages.push(message)

    return message
  }

  // ==================== Orchestrator Execution Engine ====================

  /**
   * 解析 Orchestrator 输出中的 JSON 指令
   */
  function parseOrchestratorOutput(content: string): {
    decisions: Array<{
      action: string
      [key: string]: any
    }>
    remainingText: string
  } {
    const decisions: Array<{ action: string; [key: string]: any }> = []
    let remainingText = content

    // 匹配 ```json ... ``` 代码块
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
    let match

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const jsonStr = match[1]
        if (!jsonStr) continue

        const parsed = JSON.parse(jsonStr)

        // 处理单个决策
        if (parsed.action && typeof parsed.action === 'string') {
          decisions.push(parsed as { action: string; [key: string]: any })
        }
        // 处理决策数组
        if (parsed.plan && Array.isArray(parsed.plan)) {
          for (const item of parsed.plan) {
            if (item.action && typeof item.action === 'string') {
              decisions.push(item as { action: string; [key: string]: any })
            }
          }
        }
        // 处理 tasks 数组
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          parsed.tasks.forEach((task: any) => {
            decisions.push({ action: 'create_task', task })
          })
        }
        // 处理 complete 动作
        if (parsed.action === 'complete' || parsed.finalOutput) {
          decisions.push({
            action: 'complete',
            finalOutput: parsed.finalOutput || parsed.output
          })
        }
      } catch (e) {
        console.warn('[AgentTeams] Failed to parse JSON block:', e)
      }
    }

    // 移除 JSON 代码块，保留其他文本
    remainingText = content.replace(jsonBlockRegex, '').trim()

    return { decisions, remainingText }
  }

  /**
   * 执行 Orchestrator 决策
   */
  async function executeOrchestratorDecision(
    sessionId: string,
    decision: {
      action: string
      [key: string]: any
    }
  ): Promise<{
    success: boolean
    result?: any
    error?: string
  }> {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    switch (decision.action) {
      case OrchestratorAction.CREATE_WORKER: {
        const workerConfig = decision.worker || decision
        const worker = createDynamicWorker(sessionId, {
          name: workerConfig.name || 'Worker',
          description: workerConfig.description || '',
          capabilities: workerConfig.capabilities,
          focusArea: workerConfig.focusArea || workerConfig.focus_area
        })

        if (!worker) {
          return { success: false, error: error.value || 'Failed to create worker' }
        }

        recordOrchestratorDecision(
          sessionId,
          OrchestratorAction.CREATE_WORKER,
          decision.reasoning || `Created worker: ${workerConfig.name}`,
          { workerId: worker.id, workerName: worker.name }
        )

        return { success: true, result: worker }
      }

      case OrchestratorAction.CREATE_TASK:
      case 'create_task': {
        const taskConfig = decision.task || decision
        const task = createTask(
          sessionId,
          taskConfig.title || taskConfig.name || 'Untitled Task',
          taskConfig.description || '',
          {
            assignedTo: taskConfig.assignedTo || taskConfig.assigned_to,
            priority: taskConfig.priority ?? 5,
            input: taskConfig.input,
            dependsOn: taskConfig.dependsOn || taskConfig.depends_on
          }
        )

        if (!task) {
          return { success: false, error: error.value || 'Failed to create task' }
        }

        recordOrchestratorDecision(
          sessionId,
          OrchestratorAction.CREATE_TASK,
          `Created task: ${taskConfig.title}`,
          { taskId: task.id, taskTitle: task.title }
        )

        return { success: true, result: task }
      }

      case OrchestratorAction.ASSIGN_TASK: {
        const { taskId, workerId } = decision
        const task = session.taskQueue.pending.find(t => t.id === taskId)

        if (!task) {
          return { success: false, error: 'Task not found' }
        }

        task.assignedTo = workerId

        recordOrchestratorDecision(
          sessionId,
          OrchestratorAction.ASSIGN_TASK,
          `Assigned task ${taskId} to worker ${workerId}`,
          { taskId, workerId }
        )

        return { success: true }
      }

      case OrchestratorAction.COMPLETE: {
        session.status = 'integrating'
        session.finalOutput = decision.finalOutput || decision.output || ''

        recordOrchestratorDecision(
          sessionId,
          OrchestratorAction.COMPLETE,
          'Execution completed',
          { finalOutput: session.finalOutput }
        )

        return { success: true, result: { completed: true, finalOutput: session.finalOutput } }
      }

      case OrchestratorAction.INTEGRATE_RESULTS: {
        session.status = 'integrating'

        recordOrchestratorDecision(
          sessionId,
          OrchestratorAction.INTEGRATE_RESULTS,
          decision.reasoning || 'Integrating results from workers',
          decision
        )

        return { success: true }
      }

      default:
        return { success: false, error: `Unknown action: ${decision.action}` }
    }
  }

  /**
   * 批量执行 Orchestrator 决策
   */
  async function executeOrchestratorDecisions(
    sessionId: string,
    content: string
  ): Promise<{
    success: boolean
    results: Array<{ success: boolean; result?: any; error?: string }>
    hasCompleteAction: boolean
  }> {
    const { decisions } = parseOrchestratorOutput(content)
    const results: Array<{ success: boolean; result?: any; error?: string }> = []
    let hasCompleteAction = false

    for (const decision of decisions) {
      const result = await executeOrchestratorDecision(sessionId, decision)
      results.push(result)

      if (decision.action === OrchestratorAction.COMPLETE || decision.action === 'complete') {
        hasCompleteAction = true
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      hasCompleteAction
    }
  }

  /**
   * 构建团队上下文（注入到 Orchestrator 提示词）
   */
  function buildTeamContext(sessionId: string): string {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return ''

    const team = teamRegistry.value.teams.find(t => t.id === session.teamId)
    if (!team) return ''

    const activeWorkers = Object.values(session.dynamicWorkers).filter(
      w => w.status !== 'completed'
    )

    const pendingTasks = session.taskQueue.pending.length
    const inProgressTasks = session.taskQueue.inProgress.length
    const completedTasks = session.taskQueue.completed.length

    return `
## 当前团队状态

**用户请求**: ${session.userRequest}

**Workers (${activeWorkers.length}/${team.executionConfig.maxParallelWorkers})**:
${activeWorkers.length > 0
  ? activeWorkers.map(w => `- ${w.name} (${w.focusArea || 'general'}) - ${w.status}`).join('\n')
  : '- 暂无活跃 Workers'}

**任务进度**:
- 等待中: ${pendingTasks}
- 执行中: ${inProgressTasks}
- 已完成: ${completedTasks}

**项目上下文**:
${Object.keys(session.projectState.context).length > 0
  ? JSON.stringify(session.projectState.context, null, 2)
  : '- 暂无'}
`
  }

  // ==================== Utility Functions ====================

  /**
   * 获取下一个可执行的任务
   */
  function getNextTask(sessionId: string, agentId?: string): AgentTask | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session || session.taskQueue.pending.length === 0) return null

    // 按 priority 降序排序
    const sortedPending = [...session.taskQueue.pending].sort((a, b) => b.priority - a.priority)

    for (const task of sortedPending) {
      // 检查是否指定了 agent
      if (agentId && task.assignedTo && task.assignedTo !== agentId) {
        continue
      }

      // 检查依赖
      if (task.dependsOn && task.dependsOn.length > 0) {
        const completedIds = session.taskQueue.completed.map(t => t.id)
        const unmetDeps = task.dependsOn.filter(depId => !completedIds.includes(depId))
        if (unmetDeps.length > 0) {
          continue
        }
      }

      return task
    }

    return null
  }

  /**
   * 获取 Worker Session
   */
  function getWorkerSession(sessionId: string, agentId: string): WorkerSession | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return null
    return session.workerSessions[agentId] ?? null
  }

  /**
   * 创建或获取 Worker Session
   */
  function getOrCreateWorkerSession(sessionId: string, agentId: string): WorkerSession | null {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session) return null

    if (!session.workerSessions[agentId]) {
      session.workerSessions[agentId] = {
        workerId: agentId,
        agentId,
        chatId: `chat_${agentId}_${sessionId}`,
        messages: [],
        status: 'idle'
      }
    }

    return session.workerSessions[agentId] ?? null
  }

  return {
    // State
    teamRegistry,
    sessionRegistry,
    currentSession,
    loading,
    error,

    // Computed
    teams,
    activeTeam,
    sessions,
    activeSession,

    // Team CRUD
    loadTeams,
    saveTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    setActiveTeam,

    // Agent CRUD (保留用于 Orchestrator 配置)
    addAgent,
    updateAgent,
    deleteAgent,

    // Dynamic Worker Management (新增)
    createDynamicWorker,
    destroyWorker,
    getAvailableWorker,
    updateWorkerStatus,
    recordOrchestratorDecision,

    // Orchestrator Execution Engine (新增)
    parseOrchestratorOutput,
    executeOrchestratorDecision,
    executeOrchestratorDecisions,
    buildTeamContext,

    // Session Management
    loadSessions,
    startSession,
    updateSession,
    cancelSession,
    deleteSession,

    // Task Management
    createTask,
    claimTask,
    completeTask,
    failTask,
    getNextTask,

    // Message System
    sendMessage,

    // Utility
    getWorkerSession,
    getOrCreateWorkerSession,

    // Professional Mode Management (专业模式)
    startProfessionalSession,
    transitionToPhase,
    confirmPhase,
    recordCheckpoint
  }

  // ==================== Professional Mode Functions ====================

  /**
   * 启动专业模式会话
   */
  async function startProfessionalSession(
    teamId: string,
    userRequest: string
  ): Promise<ProfessionalSession | null> {
    const session = createProfessionalSession(teamId, userRequest)

    sessionRegistry.value.sessions.push(session)
    sessionRegistry.value.activeSessionId = session.id
    sessionRegistry.value.version++
    sessionRegistry.value.lastUpdated = Date.now()

    try {
      await storage.saveSessionRegistry(sessionRegistry.value)
      return session
    } catch (e) {
      console.error('[ProfessionalMode] Failed to save session:', e)
      error.value = 'Failed to start professional session'
      return null
    }
  }

  /**
   * 阶段转换
   */
  async function transitionToPhase(
    sessionId: string,
    newPhase: ProfessionalPhase,
    phaseState: ProfessionalPhaseState
  ): Promise<boolean> {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session || !isProfessionalSession(session)) {
      return false
    }

    // 完成当前阶段
    const currentHistory = session.phaseHistory.find(
      h => h.phase === session.currentPhase && !h.completedAt
    )
    if (currentHistory) {
      currentHistory.completedAt = Date.now()
      currentHistory.status = phaseState.status
    }

    // 进入新阶段
    session.currentPhase = newPhase
    session.phaseState = phaseState
    session.phaseHistory.push({
      phase: newPhase,
      status: phaseState.status,
      enteredAt: Date.now()
    })
    session.status = newPhase === 'execution' ? 'executing' :
                     newPhase === 'review' ? 'integrating' :
                     newPhase === 'completion' ? 'completed' : 'planning'

    sessionRegistry.value.version++
    sessionRegistry.value.lastUpdated = Date.now()

    return storage.saveSessionRegistry(sessionRegistry.value)
  }

  /**
   * 用户确认阶段
   */
  async function confirmPhase(
    sessionId: string,
    confirmed: boolean,
    notes?: string
  ): Promise<boolean> {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session || !isProfessionalSession(session)) {
      return false
    }

    // 记录检查点
    session.userCheckpoints.push({
      phase: session.currentPhase,
      confirmed,
      confirmedAt: Date.now(),
      notes
    })

    // 更新阶段状态
    const phaseState = session.phaseState
    if (confirmed) {
      phaseState.status = 'completed'
      ;(phaseState as any).confirmedAt = Date.now()
      ;(phaseState as any).userConfirmed = true
    } else {
      phaseState.status = 'blocked'
    }

    sessionRegistry.value.version++
    sessionRegistry.value.lastUpdated = Date.now()

    return storage.saveSessionRegistry(sessionRegistry.value)
  }

  /**
   * 记录检查点
   */
  async function recordCheckpoint(
    sessionId: string,
    phase: ProfessionalPhase,
    confirmed: boolean,
    notes?: string
  ): Promise<boolean> {
    const session = sessionRegistry.value.sessions.find(s => s.id === sessionId)
    if (!session || !isProfessionalSession(session)) {
      return false
    }

    session.userCheckpoints.push({
      phase,
      confirmed,
      confirmedAt: Date.now(),
      notes
    })

    sessionRegistry.value.version++
    sessionRegistry.value.lastUpdated = Date.now()

    return storage.saveSessionRegistry(sessionRegistry.value)
  }
}

/**
 * 获取 Agent Teams 管理器单例
 */
export function useAgentTeam() {
  if (!agentTeamManager) {
    agentTeamManager = createAgentTeamManager()
  }
  return agentTeamManager
}

/**
 * 构建默认 Worker 提示词
 */
export function buildDefaultWorkerPrompt(): string {
  return `你是 Agent Team 的 Worker（执行者）。

## 你的职责

1. **认领任务** - 从任务队列中获取适合你的任务
2. **执行任务** - 按照任务描述完成工作
3. **使用工具** - 利用可用的工具（文件操作、命令执行等）
4. **报告结果** - 完成后向 Orchestrator 报告

## 执行原则

- 只修改你负责的文件和资源
- 如果发现需要修改其他范围的文件，向 Orchestrator 请求协调
- 遇到无法解决的问题，及时报告而不是猜测

## 输出格式

完成任务后，请提供：

1. **完成状态** - success / partial / failed
2. **执行摘要** - 你做了什么
3. **输出结果** - 主要产出
4. **后续建议** - 如果有需要注意的事项`
}
