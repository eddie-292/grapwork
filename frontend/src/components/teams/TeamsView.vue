<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAgentTeam } from '@/composables/useAgentTeam'
import type { AgentTeam } from '@/types/agentTeam'
import { TeamPattern, createDefaultExecutionConfig, createDefaultOrchestrator } from '@/types/agentTeam'
import AgentDefinitionPanel from './AgentDefinitionPanel.vue'

const teamManager = useAgentTeam()

// State
const showCreateForm = ref(false)
const showOrchestratorModal = ref(false)
const selectedTeamId = ref<string | null>(null)

// Form state
const newTeamName = ref('')
const newTeamDescription = ref('')

// Computed
const { teams, activeTeam, loading, error, currentSession } = teamManager

const selectedTeam = computed(() => {
  if (!selectedTeamId.value) return null
  return teams.value.find(t => t.id === selectedTeamId.value) ?? null
})

// Backward compatibility helpers for legacy team data
function getExecutionConfig(team: AgentTeam) {
  // New structure
  if (team.executionConfig) {
    return team.executionConfig
  }
  // Legacy structure - convert sharedConfig to executionConfig
  const legacy = team as any
  if (legacy.sharedConfig) {
    return {
      maxParallelWorkers: legacy.sharedConfig.parallelWorkers || 3,
      taskTimeout: legacy.sharedConfig.taskTimeout || 300000,
      maxRetries: legacy.sharedConfig.maxRetries || 3,
      workerIdleTimeout: 60000,
      defaultConfigId: legacy.sharedConfig.defaultConfigId
    }
  }
  // Default
  return createDefaultExecutionConfig()
}

function getOrchestrator(team: AgentTeam) {
  // New structure
  if (team.orchestrator) {
    return team.orchestrator
  }
  // Legacy structure - find orchestrator from agents array
  const legacy = team as any
  if (legacy.agents && legacy.agents.length > 0) {
    const orchestrator = legacy.agents.find((a: any) => a.role === 'orchestrator')
    if (orchestrator) return orchestrator
    // Fallback to first agent
    return legacy.agents[0]
  }
  // Default
  return createDefaultOrchestrator()
}

function getMaxWorkers(team: AgentTeam): number {
  return getExecutionConfig(team).maxParallelWorkers
}

function getTaskTimeout(team: AgentTeam): number {
  return getExecutionConfig(team).taskTimeout
}

function getMaxRetries(team: AgentTeam): number {
  return getExecutionConfig(team).maxRetries
}

// Methods
async function handleCreateTeam() {
  if (!newTeamName.value.trim()) return

  const team = await teamManager.createTeam(
    newTeamName.value.trim(),
    newTeamDescription.value.trim()
  )

  if (team) {
    newTeamName.value = ''
    newTeamDescription.value = ''
    showCreateForm.value = false
    selectedTeamId.value = team.id
  }
}

async function handleDeleteTeam(teamId: string) {
  if (confirm('确定要删除此团队吗？此操作无法撤销。')) {
    await teamManager.deleteTeam(teamId)
    if (selectedTeamId.value === teamId) {
      selectedTeamId.value = null
    }
  }
}

async function handleSetActive(teamId: string) {
  await teamManager.setActiveTeam(teamId)
}

function handleEditOrchestrator(team: AgentTeam) {
  selectedTeamId.value = team.id
  showOrchestratorModal.value = true
}

function getPatternLabel(pattern: TeamPattern): string {
  switch (pattern) {
    case TeamPattern.ORCHESTRATOR_WORKER:
      return '编排-执行'
    case TeamPattern.PIPELINE:
      return '流水线'
    case TeamPattern.PARALLEL:
      return '并行'
    default:
      return pattern
  }
}

// Lifecycle
onMounted(() => {
  teamManager.loadTeams()
  teamManager.loadSessions()
})
</script>

<template>
  <div class="teams-view">
    <!-- Header -->
    <div class="view-header">
      <h2>Agent Teams</h2>
      <p class="description">AI 自主管理的多智能体协作系统 - Team Lead 动态创建和调度 Workers</p>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <!-- Main content -->
    <div class="teams-container">
      <!-- Left: Team list -->
      <div class="team-list-panel">
        <div class="panel-header">
          <h3>团队列表</h3>
          <button class="add-btn" @click="showCreateForm = !showCreateForm" :disabled="loading">
            + 新建团队
          </button>
        </div>

        <!-- Create form -->
        <div v-if="showCreateForm" class="create-form">
          <div class="form-group">
            <label>团队名称</label>
            <input
              v-model="newTeamName"
              placeholder="输入团队名称..."
              class="input-field"
            />
          </div>
          <div class="form-group">
            <label>描述（可选）</label>
            <textarea
              v-model="newTeamDescription"
              placeholder="描述团队的目标和职责..."
              class="input-field"
              rows="2"
            ></textarea>
          </div>
          <div class="form-actions">
            <button @click="showCreateForm = false" class="btn secondary">取消</button>
            <button
              @click="handleCreateTeam"
              class="btn primary"
              :disabled="loading || !newTeamName.trim()"
            >
              创建
            </button>
          </div>
        </div>

        <!-- Team list -->
        <div class="team-list">
          <div v-if="loading && teams.length === 0" class="loading">
            加载中...
          </div>
          <div v-else-if="teams.length === 0" class="empty-state">
            <p>还没有创建任何团队</p>
            <p class="hint">点击上方"新建团队"开始</p>
          </div>
          <div
            v-else
            v-for="team in teams"
            :key="team.id"
            class="team-card"
            :class="{ active: activeTeam?.id === team.id, selected: selectedTeamId === team.id }"
            @click="selectedTeamId = team.id"
          >
            <div class="team-info">
              <div class="team-name">
                {{ team.name }}
                <span v-if="activeTeam?.id === team.id" class="active-badge">激活</span>
              </div>
              <div class="team-meta">
                <span class="pattern-badge">{{ getPatternLabel(team.pattern) }}</span>
                <span class="worker-info">最多 {{ getMaxWorkers(team) }} Workers</span>
              </div>
              <div v-if="team.description" class="team-description">
                {{ team.description }}
              </div>
            </div>
            <div class="team-actions">
              <button
                v-if="activeTeam?.id !== team.id"
                class="action-btn"
                @click.stop="handleSetActive(team.id)"
                title="设为激活"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </button>
              <button
                class="action-btn danger"
                @click.stop="handleDeleteTeam(team.id)"
                title="删除"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Team details -->
      <div class="team-details-panel">
        <div v-if="!selectedTeam" class="empty-details">
          <p>选择一个团队查看详情</p>
        </div>

        <template v-else>
          <div class="panel-header">
            <h3>{{ selectedTeam.name }}</h3>
            <span class="pattern-badge">{{ getPatternLabel(selectedTeam.pattern) }}</span>
          </div>

          <div v-if="selectedTeam.description" class="detail-section">
            <p class="team-full-description">{{ selectedTeam.description }}</p>
          </div>

          <!-- Orchestrator section -->
          <div class="detail-section">
            <div class="section-header">
              <h4>Team Lead (Orchestrator)</h4>
              <button class="add-btn small" @click="handleEditOrchestrator(selectedTeam)">
                编辑
              </button>
            </div>

            <div class="orchestrator-card">
              <div class="orchestrator-header">
                <span class="orchestrator-name">{{ getOrchestrator(selectedTeam).name }}</span>
                <span class="role-badge orchestrator">编排者</span>
              </div>
              <div class="orchestrator-description">{{ getOrchestrator(selectedTeam).description }}</div>
              <div class="orchestrator-capabilities">
                <span v-if="getOrchestrator(selectedTeam).capabilities?.canReadFiles" class="capability">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  读取
                </span>
                <span v-if="getOrchestrator(selectedTeam).capabilities?.canWriteFiles" class="capability">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                  写入
                </span>
              </div>
            </div>
          </div>

          <!-- Worker Template section -->
          <div class="detail-section">
            <h4>Worker 模板</h4>
            <p class="info-text">Workers 由 Team Lead 根据任务需求动态创建，按技能类型复用。</p>
          </div>

          <!-- Execution Config section -->
          <div class="detail-section">
            <h4>执行配置</h4>
            <div class="config-grid">
              <div class="config-item">
                <label>最大并行 Workers</label>
                <span>{{ getMaxWorkers(selectedTeam) }}</span>
              </div>
              <div class="config-item">
                <label>任务超时</label>
                <span>{{ getTaskTimeout(selectedTeam) / 1000 }}s</span>
              </div>
              <div class="config-item">
                <label>最大重试</label>
                <span>{{ getMaxRetries(selectedTeam) }}</span>
              </div>
            </div>
          </div>

          <!-- Current Session section (if active) -->
          <div v-if="currentSession && currentSession.teamId === selectedTeam.id" class="detail-section">
            <h4>当前会话</h4>
            <div class="session-info">
              <div class="session-status">
                <span class="status-badge" :class="currentSession.status">
                  {{ currentSession.status }}
                </span>
              </div>
              <div class="session-metrics">
                <span>动态 Workers: {{ Object.keys(currentSession.dynamicWorkers).length }}</span>
                <span>待处理任务: {{ currentSession.taskQueue.pending.length }}</span>
                <span>已完成任务: {{ currentSession.taskQueue.completed.length }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Orchestrator Edit Modal -->
    <AgentDefinitionPanel
      v-if="showOrchestratorModal && selectedTeam"
      :team="selectedTeam"
      :agent="getOrchestrator(selectedTeam)"
      @close="showOrchestratorModal = false"
      @save="showOrchestratorModal = false"
    />
  </div>
</template>

<style scoped>
.teams-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: #fafafa;
  color: #333;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.view-header {
  margin-bottom: 20px;
}

.view-header h2 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
}

.view-header .description {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.error-message {
  background: #fee;
  color: #c00;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid #fcc;
}

.teams-container {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.team-list-panel,
.team-details-panel {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  border: 1px solid #eee;
}

.team-list-panel {
  width: 300px;
  flex-shrink: 0;
}

.team-details-panel {
  flex: 1;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.add-btn {
  background: #333;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.add-btn:hover {
  background: #555;
}

.add-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.add-btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

.create-form {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid #eee;
}

.form-group {
  margin-bottom: 10px;
}

.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  margin-bottom: 4px;
}

.input-field {
  width: 100%;
  background: #fff;
  border: 1px solid #eee;
  color: #333;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: #ccc;
}

textarea.input-field {
  resize: vertical;
  min-height: 60px;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #eee;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn.primary {
  background: #333;
  color: #fff;
  border-color: #333;
}

.btn.primary:disabled {
  background: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

.btn.secondary {
  background: #f5f5f5;
  color: #333;
}

.btn.secondary:hover {
  background: #eee;
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loading,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  color: #bbb;
}

.team-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.team-card:hover {
  background: #eee;
}

.team-card.selected {
  border-color: #333;
  background: #e8f4fd;
}

.team-card.active {
  border-color: #22c55e;
}

.team-info {
  flex: 1;
  min-width: 0;
}

.team-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.active-badge {
  font-size: 10px;
  background: #22c55e;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
}

.team-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #666;
}

.pattern-badge {
  background: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid #eee;
}

.agent-count {
  font-size: 11px;
  color: #888;
}

.team-description {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s;
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.action-btn:hover {
  opacity: 1;
  background: #ddd;
}

.action-btn.danger:hover {
  background: #fee;
}

.empty-details {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
}

.detail-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-header h4,
.detail-section h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
}

.team-full-description {
  color: #666;
  font-size: 14px;
  margin: 0;
  line-height: 1.5;
}

.agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.orchestrator-card {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.orchestrator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.orchestrator-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.orchestrator-description {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  line-height: 1.4;
}

.orchestrator-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}

.role-badge.orchestrator {
  background: #e8f4fd;
  color: #4a90d9;
}

.capability {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  background: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #eee;
  color: #666;
}

.capability svg {
  flex-shrink: 0;
}

.info-text {
  font-size: 13px;
  color: #666;
  font-style: italic;
  margin: 8px 0;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.config-item {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.config-item label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.config-item span {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.worker-info {
  font-size: 11px;
  color: #888;
}

/* Session Info */
.session-info {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #eee;
}

.session-status {
  margin-bottom: 10px;
}

.status-badge {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  text-transform: uppercase;
}

.status-badge.planning {
  background: #e8f4fd;
  color: #4a90d9;
}

.status-badge.executing {
  background: #f0fdf4;
  color: #166534;
}

.status-badge.integrating {
  background: #fef9c3;
  color: #854d0e;
}

.status-badge.completed {
  background: #f0fdf4;
  color: #166534;
}

.status-badge.failed {
  background: #fee;
  color: #c00;
}

.session-metrics {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #666;
}
</style>
