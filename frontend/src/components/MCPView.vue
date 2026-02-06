<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMCP } from '../composables/useMCP'
import type { MCPServer, MCPTransportType, MCPToolDefinition } from '../types/mcp'
import ConfirmDialog from './ConfirmDialog.vue'

const router = useRouter()
const {
  serverList,
  loading,
  error,
  activeServers,
  loadServers,
  addServer,
  updateServer,
  deleteServer,
  toggleServerActive,
  toggleServerEnabled,
  refreshServerTools
} = useMCP()

// 表单状态
const showAddForm = ref(false)
const showEditForm = ref(false)
const editingServer = ref<MCPServer | null>(null)
const showDeleteConfirm = ref(false)
const serverToDelete = ref<MCPServer | null>(null)
const refreshingServerId = ref<string | null>(null)

// 新建服务器表单数据
const newServerForm = ref({
  name: '',
  description: '',
  transportType: 'stdio' as MCPTransportType,
  enabled: true,
  simpleCommand: false,  // 是否为简单命令
  // STDIO 配置
  command: '',
  args: [] as string[],
  env: {} as Record<string, string>,
  // SSE 配置
  url: '',
  // 工具配置
  tools: [] as MCPToolDefinition[]
})

// 临时环境变量编辑（key=value 格式）
const envInput = ref('')

// 临时命令参数编辑（空格分隔）
const argsInput = ref('')

// 工具参数编辑（JSON 格式）
const toolParametersInput = ref<string[]>([])

const deleteMessage = computed(() => {
  return serverToDelete.value
    ? `确定要删除 "${serverToDelete.value.name}" 这个 MCP 服务器吗？此操作无法撤销。`
    : ''
})

// 传输类型选项
const transportTypeOptions = [
  { value: 'stdio' as MCPTransportType, label: 'STDIO (标准输入输出)' },
  { value: 'sse' as MCPTransportType, label: 'SSE (Server-Sent Events)' }
]

onMounted(async () => {
  await loadServers()
})

function resetForm() {
  newServerForm.value = {
    name: '',
    description: '',
    transportType: 'stdio' as MCPTransportType,
    enabled: true,
    simpleCommand: false,
    command: '',
    args: [],
    env: {},
    url: '',
    tools: []
  }
  envInput.value = ''
  argsInput.value = ''
  toolParametersInput.value = []
}

function openAddForm() {
  resetForm()
  showAddForm.value = true
}

function openEditForm(server: MCPServer) {
  editingServer.value = server
  newServerForm.value = {
    name: server.name,
    description: server.description || '',
    transportType: server.transportType,
    enabled: server.enabled,
    simpleCommand: server.simpleCommand || false,
    command: server.command || '',
    args: server.args || [],
    env: server.env || {},
    url: server.url || '',
    tools: server.tools || []
  }
  // 转换环境变量为输入格式
  envInput.value = Object.entries(server.env || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  // 转换参数为输入格式
  argsInput.value = (server.args || []).join(' ')
  // 转换工具参数为输入格式
  toolParametersInput.value = (server.tools || []).map(tool =>
    JSON.stringify(tool.function.parameters || {}, null, 2)
  )
  // 修复工具数据的类型问题（确保 description 有默认值）
  if (newServerForm.value.tools) {
    newServerForm.value.tools = newServerForm.value.tools.map(tool => ({
      ...tool,
      function: {
        ...tool.function,
        description: tool.function.description || ''
      }
    }))
  }
  showEditForm.value = true
}

function parseEnvInput(input: string): Record<string, string> {
  const env: Record<string, string> = {}
  const lines = input.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      if (key) {
        env[key] = value
      }
    }
  }
  return env
}

function parseArgsInput(input: string): string[] {
  return input.split(/\s+/).filter(arg => arg.length > 0)
}

// 工具配置相关函数
function addToolDefinition() {
  newServerForm.value.tools.push({
    type: 'function',
    function: {
      name: '',
      description: '',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  })
  toolParametersInput.value.push(JSON.stringify({
    type: 'object',
    properties: {},
    required: []
  }, null, 2))
}

function removeToolDefinition(index: number) {
  newServerForm.value.tools.splice(index, 1)
  toolParametersInput.value.splice(index, 1)
}

function updateToolParameters(index: number, jsonString: string) {
  try {
    const parsed = JSON.parse(jsonString)
    if (newServerForm.value.tools[index]) {
      newServerForm.value.tools[index].function.parameters = parsed
    }
  } catch (e) {
    console.error('Invalid JSON for tool parameters:', e)
  }
}

async function handleAddServer() {
  try {
    const env = parseEnvInput(envInput.value)
    const args = parseArgsInput(argsInput.value)

    await addServer({
      name: newServerForm.value.name,
      description: newServerForm.value.description,
      transportType: newServerForm.value.transportType,
      enabled: newServerForm.value.enabled,
      simpleCommand: newServerForm.value.simpleCommand,
      command: newServerForm.value.command,
      args,
      env,
      url: newServerForm.value.url,
      tools: newServerForm.value.tools
    })
    showAddForm.value = false
    resetForm()
  } catch (e) {
    console.error('Failed to add server:', e)
  }
}

async function handleUpdateServer() {
  if (!editingServer.value) return
  try {
    const env = parseEnvInput(envInput.value)
    const args = parseArgsInput(argsInput.value)

    await updateServer(editingServer.value.id, {
      name: newServerForm.value.name,
      description: newServerForm.value.description,
      transportType: newServerForm.value.transportType,
      enabled: newServerForm.value.enabled,
      simpleCommand: newServerForm.value.simpleCommand,
      command: newServerForm.value.command,
      args,
      env,
      url: newServerForm.value.url,
      tools: newServerForm.value.tools
    })
    showEditForm.value = false
    editingServer.value = null
    resetForm()
  } catch (e) {
    console.error('Failed to update server:', e)
  }
}

function confirmDelete(server: MCPServer) {
  serverToDelete.value = server
  showDeleteConfirm.value = true
}

async function handleDeleteConfirm() {
  if (serverToDelete.value) {
    try {
      await deleteServer(serverToDelete.value.id)
      showDeleteConfirm.value = false
      serverToDelete.value = null
    } catch (e) {
      console.error('Failed to delete server:', e)
    }
  }
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
  serverToDelete.value = null
}

function goBack() {
  router.push('/')
}

function getTransportLabel(type: MCPTransportType): string {
  return transportTypeOptions.find(opt => opt.value === type)?.label || type
}

// 从服务器刷新工具列表
async function handleRefreshTools(server: MCPServer) {
  refreshingServerId.value = server.id
  try {
    const tools = await refreshServerTools(server.id)
    console.log(`[MCP] Server "${server.name}" tools refreshed:`, tools.length, 'tools')
    // 刷新当前表单中的工具（如果正在编辑）
    if (editingServer.value && editingServer.value.id === server.id) {
      newServerForm.value.tools = tools
      toolParametersInput.value = tools.map(tool =>
        JSON.stringify(tool.function.parameters || {}, null, 2)
      )
    }
  } catch (e) {
    console.error('Failed to refresh tools:', e)
  } finally {
    refreshingServerId.value = null
  }
}

// 判断是否可以从服务器获取工具（仅 MCP 服务器支持，简单命令不支持）
function canFetchTools(server: MCPServer): boolean {
  return !server.simpleCommand && server.enabled
}
</script>

<template>
  <div class="mcp-page">
    <header class="mcp-header">
      <button class="back-btn" @click="goBack">返回</button>
      <h1>MCP 服务器</h1>
      <button class="add-btn" @click="openAddForm">+ 添加服务器</button>
    </header>

    <!-- 添加服务器表单 -->
    <div class="modal-overlay" v-if="showAddForm" @click.self="showAddForm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加 MCP 服务器</h3>
          <button class="close-btn" @click="showAddForm = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="error" class="error-message">{{ error }}</div>

          <div class="form-group">
            <label>服务器名称 *</label>
            <input v-model="newServerForm.name" type="text" placeholder="例如: filesystem-server" class="input" />
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea v-model="newServerForm.description" placeholder="服务器的功能描述..." class="input textarea" rows="2" />
          </div>

          <div class="form-group">
            <label>传输类型 *</label>
            <select v-model="newServerForm.transportType" class="input">
              <option v-for="opt in transportTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- STDIO 配置 -->
          <template v-if="newServerForm.transportType === 'stdio'">
            <div class="form-group checkbox-group">
              <label title="勾选后表示这是一个简单命令（如 date、ls 等），不需要实现 MCP 协议">
                <input type="checkbox" v-model="newServerForm.simpleCommand" />
                简单命令模式（非 MCP 服务器）
              </label>
              <small>勾选此项表示该命令是简单的一次性命令（如 date、ls），不支持 MCP 协议</small>
            </div>

            <div class="form-group">
              <label>执行命令 *</label>
              <input v-model="newServerForm.command" type="text" placeholder="例如: npx 或 date" class="input" />
            </div>

            <div class="form-group">
              <label>命令参数</label>
              <input v-model="argsInput" type="text" placeholder="例如: -y @modelcontextprotocol/server-filesystem" class="input" />
              <small>多个参数用空格分隔</small>
            </div>

            <div class="form-group">
              <label>环境变量</label>
              <textarea v-model="envInput" placeholder="KEY1=value1&#10;KEY2=value2" class="input textarea" rows="3" />
              <small>每行一个变量，格式：KEY=value</small>
            </div>
          </template>

          <!-- SSE 配置 -->
          <template v-if="newServerForm.transportType === 'sse'">
            <div class="form-group">
              <label>服务器 URL *</label>
              <input v-model="newServerForm.url" type="text" placeholder="例如: http://localhost:3000/sse" class="input" />
            </div>
          </template>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="newServerForm.enabled" />
              启用此服务器
            </label>
          </div>

          <!-- 工具配置 -->
          <div class="form-section">
            <div class="form-section-header">
              <h4>工具配置 (OpenAI Function Calling 格式)</h4>
              <button type="button" class="btn small" @click="addToolDefinition">
                + 添加工具
              </button>
            </div>

            <div v-if="newServerForm.tools.length === 0" class="empty-tools-hint">
              <small>此服务器暂无工具定义。点击上方按钮添加工具。</small>
            </div>

            <div v-for="(tool, index) in newServerForm.tools" :key="index" class="tool-config-card">
              <div class="tool-config-header">
                <span>工具 #{{ index + 1 }}</span>
                <button type="button" class="btn-icon" @click="removeToolDefinition(index)" title="删除工具">✕</button>
              </div>

              <div class="form-group">
                <label>工具名称 *</label>
                <input v-model="tool.function.name" type="text" placeholder="例如: read_file" class="input" />
              </div>

              <div class="form-group">
                <label>工具描述 *</label>
                <textarea v-model="tool.function.description" placeholder="描述这个工具的功能..." class="input textarea" rows="2" />
              </div>

              <div class="form-group">
                <label>参数定义 (JSON Schema)</label>
                <textarea
                  v-model="toolParametersInput[index]"
                  placeholder='&#123;&#10;  "type": "object",&#10;  "properties": &#123;...&#125;,&#10;  "required": []&#10;&#125;'
                  class="input textarea code-input"
                  rows="6"
                  @blur="updateToolParameters(index, toolParametersInput[index] || '')"
                />
                <small>JSON 格式的参数定义，符合 JSON Schema 规范</small>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" @click="showAddForm = false">取消</button>
          <button type="button" class="btn primary" @click="handleAddServer" :disabled="loading || !newServerForm.name">
            添加
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑服务器表单 -->
    <div class="modal-overlay" v-if="showEditForm" @click.self="showEditForm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>编辑 MCP 服务器</h3>
          <button class="close-btn" @click="showEditForm = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="error" class="error-message">{{ error }}</div>

          <div class="form-group">
            <label>服务器名称 *</label>
            <input v-model="newServerForm.name" type="text" class="input" />
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea v-model="newServerForm.description" class="input textarea" rows="2" />
          </div>

          <div class="form-group">
            <label>传输类型 *</label>
            <select v-model="newServerForm.transportType" class="input">
              <option v-for="opt in transportTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- STDIO 配置 -->
          <template v-if="newServerForm.transportType === 'stdio'">
            <div class="form-group checkbox-group">
              <label title="勾选后表示这是一个简单命令（如 date、ls 等），不需要实现 MCP 协议">
                <input type="checkbox" v-model="newServerForm.simpleCommand" />
                简单命令模式（非 MCP 服务器）
              </label>
              <small>勾选此项表示该命令是简单的一次性命令（如 date、ls），不支持 MCP 协议</small>
            </div>

            <div class="form-group">
              <label>执行命令 *</label>
              <input v-model="newServerForm.command" type="text" class="input" />
            </div>

            <div class="form-group">
              <label>命令参数</label>
              <input v-model="argsInput" type="text" class="input" />
              <small>多个参数用空格分隔</small>
            </div>

            <div class="form-group">
              <label>环境变量</label>
              <textarea v-model="envInput" class="input textarea" rows="3" />
              <small>每行一个变量，格式：KEY=value</small>
            </div>
          </template>

          <!-- SSE 配置 -->
          <template v-if="newServerForm.transportType === 'sse'">
            <div class="form-group">
              <label>服务器 URL *</label>
              <input v-model="newServerForm.url" type="text" class="input" />
            </div>
          </template>

          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="newServerForm.enabled" />
              启用此服务器
            </label>
          </div>

          <!-- 工具配置 -->
          <div class="form-section">
            <div class="form-section-header">
              <h4>工具配置 (OpenAI Function Calling 格式)</h4>
              <div class="form-section-actions">
                <button
                  v-if="editingServer && canFetchTools(editingServer)"
                  type="button"
                  class="btn small secondary"
                  :disabled="refreshingServerId === editingServer.id"
                  @click="handleRefreshTools(editingServer)"
                >
                  {{ refreshingServerId === editingServer.id ? '刷新中...' : '从服务器获取' }}
                </button>
                <button type="button" class="btn small" @click="addToolDefinition">
                  + 添加工具
                </button>
              </div>
            </div>

            <div v-if="newServerForm.tools.length === 0" class="empty-tools-hint">
              <small v-if="editingServer && canFetchTools(editingServer)">此服务器暂无工具定义。点击"从服务器获取"自动获取工具列表，或点击"+ 添加工具"手动添加。</small>
              <small v-else>此服务器暂无工具定义。点击上方按钮添加工具。</small>
            </div>

            <div v-for="(tool, index) in newServerForm.tools" :key="index" class="tool-config-card">
              <div class="tool-config-header">
                <span>工具 #{{ index + 1 }}</span>
                <button type="button" class="btn-icon" @click="removeToolDefinition(index)" title="删除工具">✕</button>
              </div>

              <div class="form-group">
                <label>工具名称 *</label>
                <input v-model="tool.function.name" type="text" placeholder="例如: read_file" class="input" />
              </div>

              <div class="form-group">
                <label>工具描述 *</label>
                <textarea v-model="tool.function.description" placeholder="描述这个工具的功能..." class="input textarea" rows="2" />
              </div>

              <div class="form-group">
                <label>参数定义 (JSON Schema)</label>
                <textarea
                  v-model="toolParametersInput[index]"
                  placeholder='&#123;&#10;  "type": "object",&#10;  "properties": &#123;...&#125;,&#10;  "required": []&#10;&#125;'
                  class="input textarea code-input"
                  rows="6"
                  @blur="updateToolParameters(index, toolParametersInput[index] || '')"
                />
                <small>JSON 格式的参数定义，符合 JSON Schema 规范</small>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" @click="showEditForm = false">取消</button>
          <button type="button" class="btn primary" @click="handleUpdateServer" :disabled="loading || !newServerForm.name">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="deleteMessage"
      type="danger"
      confirm-text="删除"
      @confirm="handleDeleteConfirm"
      @cancel="handleDeleteCancel"
    />

    <div class="mcp-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <p>加载中...</p>
      </div>

      <!-- 空状态 -->
      <div v-else-if="serverList.servers.length === 0" class="empty-state">
        <div class="empty-icon">🔌</div>
        <p>暂无 MCP 服务器</p>
        <button class="btn primary" @click="openAddForm">+ 添加第一个服务器</button>
      </div>

      <!-- 服务器列表 -->
      <div v-else class="server-list">
        <div
          v-for="server in serverList.servers"
          :key="server.id"
          class="server-card"
          :class="{ disabled: !server.enabled, active: activeServers.some(s => s.id === server.id) }"
        >
          <div class="card-header">
            <div class="card-title">
              <h3>{{ server.name }}</h3>
              <span class="transport-badge">{{ getTransportLabel(server.transportType) }}</span>
            </div>
            <div class="card-status">
              <span v-if="!server.enabled" class="status-badge disabled">已禁用</span>
              <span v-else-if="activeServers.some(s => s.id === server.id)" class="status-badge active">已激活</span>
              <span v-else class="status-badge inactive">未激活</span>
            </div>
          </div>

          <p v-if="server.description" class="card-description">{{ server.description }}</p>

          <div class="card-details">
            <template v-if="server.transportType === 'stdio'">
              <div class="detail-item">
                <span class="detail-label">命令:</span>
                <code>{{ server.command }}</code>
              </div>
              <div v-if="server.args && server.args.length > 0" class="detail-item">
                <span class="detail-label">参数:</span>
                <code>{{ server.args.join(' ') }}</code>
              </div>
              <div v-if="server.env && Object.keys(server.env).length > 0" class="detail-item">
                <span class="detail-label">环境变量:</span>
                <code>{{ Object.keys(server.env).length }} 个变量</code>
              </div>
            </template>
            <template v-if="server.transportType === 'sse'">
              <div class="detail-item">
                <span class="detail-label">URL:</span>
                <code>{{ server.url }}</code>
              </div>
            </template>
            <div class="detail-item">
              <span class="detail-label">工具:</span>
              <code>{{ server.tools?.length || 0 }} 个</code>
            </div>
          </div>

          <div class="card-actions">
            <button
              v-if="server.enabled"
              class="action-btn toggle-btn"
              :class="{ active: activeServers.some(s => s.id === server.id) }"
              @click="toggleServerActive(server.id)"
              :title="activeServers.some(s => s.id === server.id) ? '停用' : '激活'"
            >
              {{ activeServers.some(s => s.id === server.id) ? '● 已激活' : '○ 未激活' }}
            </button>
            <button
              class="action-btn enable-btn"
              @click="toggleServerEnabled(server.id)"
              :title="server.enabled ? '禁用' : '启用'"
            >
              {{ server.enabled ? '禁用' : '启用' }}
            </button>
            <button class="action-btn edit-btn" @click="openEditForm(server)" title="编辑">
              编辑
            </button>
            <button
              v-if="canFetchTools(server)"
              class="action-btn refresh-btn"
              :class="{ loading: refreshingServerId === server.id }"
              @click="handleRefreshTools(server)"
              :disabled="refreshingServerId === server.id"
              title="从服务器刷新工具列表"
            >
              {{ refreshingServerId === server.id ? '刷新中...' : '刷新工具' }}
            </button>
            <button class="action-btn delete-btn" @click="confirmDelete(server)" title="删除">
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-page {
  min-height: 100vh;
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
}

.mcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: #ffffff;
  border-bottom: 1px solid #e8ecf1;
}

.mcp-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.back-btn {
  background: #f5f5f5;
  border: 1px solid #e5e7eb;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
}

.back-btn:hover {
  background: #f5f7fa;
  border-color: #d1d5db;
}

.add-btn {
  background: #10a37f;
  color: white;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 10px 20px;
  border-radius: 8px;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #0f8f6d;
}

.mcp-content {
  padding: 32px;
  width: 100%;
  flex: 1;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: #6b7280;
  font-size: 16px;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.server-card {
  background: #ffffff;
  border: 1px solid #e8ecf1;
  border-radius: 16px;
  padding: 24px;
  transition: all 0.2s;
}

.server-card:hover {
  border-color: #10a37f;
  box-shadow: 0 4px 12px rgba(16, 163, 127, 0.1);
}

.server-card.disabled {
  opacity: 0.6;
  background: #f9fafb;
}

.server-card.active {
  border-color: #10a37f;
  border-width: 2px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.card-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.transport-badge {
  font-size: 12px;
  padding: 4px 10px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 999px;
  font-weight: 500;
}

.card-status {
  display: flex;
  gap: 8px;
}

.status-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 500;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.status-badge.disabled {
  background: #fef2f2;
  color: #991b1b;
}

.card-description {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.detail-label {
  color: #6b7280;
  font-weight: 500;
  min-width: 80px;
}

.detail-item code {
  background: #ffffff;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  color: #1a1a2e;
  border: 1px solid #e8ecf1;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e8ecf1;
  background: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: #10a37f;
  color: #10a37f;
  background: #f0fdf4;
}

.toggle-btn.active {
  background: #10a37f;
  color: white;
  border-color: #10a37f;
}

.toggle-btn.active:hover {
  background: #0f8f6d;
  color: white;
}

.delete-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: #fef2f2;
}

.refresh-btn {
  border-color: #3b82f6;
  color: #3b82f6;
}

.refresh-btn:hover:not(:disabled) {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-btn.loading {
  background: #eff6ff;
  border-color: #3b82f6;
}

/* 模态框样式 */
.modal-overlay {
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
  padding: 20px;
}

.modal-content {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0;
  margin-bottom: 20px;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f5f7fa;
  color: #6b7280;
}

.modal-body {
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-message {
  background: #fef2f2;
  color: #991b1b;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-weight: 500;
  font-size: 14px;
  color: #1a1a2e;
}

.form-group.checkbox-group label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.input {
  padding: 12px 14px;
  border: 1px solid #e8ecf1;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: #ffffff;
  font-family: inherit;
}

.input:focus {
  border-color: #10a37f;
}

.input.textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.6;
}

.form-group small {
  color: #6b7280;
  font-size: 13px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e8ecf1;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: #f5f7fa;
  color: #4a5568;
  border: 1px solid #e8ecf1;
}

.btn.secondary:hover:not(:disabled) {
  background: #e8ecf1;
}

.btn.primary {
  background: #10a37f;
  color: white;
  border: 1px solid #10a37f;
}

.btn.primary:hover:not(:disabled) {
  background: #0f8f6d;
}

/* 工具配置相关样式 */
.form-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e8ecf1;
}

.form-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.form-section-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.form-section-actions {
  display: flex;
  gap: 8px;
}

.btn.small {
  padding: 6px 12px;
  font-size: 13px;
}

.empty-tools-hint {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  text-align: center;
  color: #6b7280;
}

.tool-config-card {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 12px;
}

.tool-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 500;
  color: #1a1a2e;
}

.btn-icon {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  font-size: 16px;
  line-height: 1;
}

.btn-icon:hover {
  background: #fee2e2;
  color: #ef4444;
}

.code-input {
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
}
</style>
