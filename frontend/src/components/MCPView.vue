<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMCP } from '../composables/useMCP'
import type { MCPServer, MCPTransportType, MCPToolDefinition } from '../types/mcp'
import ConfirmDialog from './ConfirmDialog.vue'
import PlugIcon from './icons/PlugIcon.vue'
import XIcon from './icons/XIcon.vue'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'
import EditIcon from './icons/EditIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import RefreshIcon from './icons/RefreshIcon.vue'
import PackageIcon from './icons/PackageIcon.vue'

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
  refreshServerTools,
  installServerDependencies
} = useMCP()

// 表单状态
const showAddForm = ref(false)
const showEditForm = ref(false)
const editingServer = ref<MCPServer | null>(null)
const showDeleteConfirm = ref(false)
const serverToDelete = ref<MCPServer | null>(null)
const refreshingServerId = ref<string | null>(null)
const installingDependenciesServerId = ref<string | null>(null)
const toastError = ref<string | null>(null)
const toastSuccess = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

// 展开/折叠状态 - 默认折叠，所以 Set 初始为空
const expandedDetails = ref<Set<string>>(new Set())

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
  if (server.builtin) {
    alert('内置服务器不能被删除')
    return
  }
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

// 切换服务器详情的展开/折叠状态
function toggleDetails(serverId: string) {
  if (expandedDetails.value.has(serverId)) {
    expandedDetails.value.delete(serverId)
  } else {
    expandedDetails.value.add(serverId)
  }
}

// 检查服务器详情是否展开
function isDetailsExpanded(serverId: string): boolean {
  return expandedDetails.value.has(serverId)
}

// 显示 toast 错误提示
function showToastError(message: string) {
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastError.value = message
  toastTimer = setTimeout(() => {
    toastError.value = null
  }, 5000)
}

// 显示 toast 成功提示
function showToastSuccess(message: string) {
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastSuccess.value = message
  toastTimer = setTimeout(() => {
    toastSuccess.value = null
  }, 3000)
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
  } catch (e: any) {
    console.error('Failed to refresh tools:', e)
    showToastError(`刷新工具失败: ${e?.message || e}`)
  } finally {
    refreshingServerId.value = null
  }
}

// 判断是否可以从服务器获取工具（仅 MCP 服务器支持，简单命令不支持）
function canFetchTools(server: MCPServer): boolean {
  return !server.simpleCommand && server.enabled
}

// 判断服务器是否有依赖配置
function hasDependencies(server: MCPServer): boolean {
  return !!(server.dependencies && server.dependencies.packages.length > 0)
}

// 安装服务器依赖
async function handleInstallDependencies(server: MCPServer) {
  if (!server.dependencies) return

  installingDependenciesServerId.value = server.id
  try {
    const result = await installServerDependencies(server.id)
    if (result.success) {
      console.log(`[MCP] Dependencies installed for "${server.name}":`, result.output)
      showToastSuccess(`依赖安装成功: ${server.name}${result.method ? ` (使用 ${result.method})` : ''}`)
    } else {
      showToastError(`依赖安装失败: ${result.error || '未知错误'}`)
    }
  } catch (e: any) {
    console.error('Failed to install dependencies:', e)
    showToastError(`依赖安装失败: ${e?.message || e}`)
  } finally {
    installingDependenciesServerId.value = null
  }
}

// 导出 MCP 配置
function exportMCPConfig() {
  // 过滤掉内置服务器
  const userServers = serverList.value.servers.filter(s => !s.builtin)
  if (userServers.length === 0) {
    alert('没有可导出的 MCP 服务器配置')
    return
  }

  // 创建导出数据（只导出用户服务器，不包含内置服务器）
  const exportData = {
    servers: userServers.map(server => ({
      name: server.name,
      description: server.description,
      transportType: server.transportType,
      enabled: server.enabled,
      simpleCommand: server.simpleCommand,
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      tools: server.tools
    })),
    exportedAt: Date.now(),
    version: '1.0'
  }

  // 创建并下载文件
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mcp-config-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// 导入 MCP 配置
async function importMCPConfig() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      // 验证格式
      if (!data.servers || !Array.isArray(data.servers)) {
        alert('无效的 MCP 配置文件格式')
        return
      }

      // 统计导入信息
      const importCount = data.servers.length
      const existingNames = new Set(serverList.value.servers.map(s => s.name))
      const newServers = data.servers.filter((s: any) => !existingNames.has(s.name))
      const duplicateCount = importCount - newServers.length

      // 确认导入
      let message = `即将导入 ${importCount} 个 MCP 服务器配置`
      if (duplicateCount > 0) {
        message += `\n\n其中 ${duplicateCount} 个与现有配置同名（将被跳过）`
      }
      message += `\n\n是否继续？`

      if (!confirm(message)) {
        return
      }

      // 添加新服务器
      let addedCount = 0
      for (const serverData of newServers) {
        try {
          await addServer({
            name: serverData.name,
            description: serverData.description,
            transportType: serverData.transportType,
            enabled: serverData.enabled ?? true,
            simpleCommand: serverData.simpleCommand,
            command: serverData.command,
            args: serverData.args,
            env: serverData.env,
            url: serverData.url,
            tools: serverData.tools
          })
          addedCount++
        } catch (err) {
          console.error('Failed to import server:', serverData.name, err)
        }
      }

      alert(`成功导入 ${addedCount} 个 MCP 服务器配置`)
    } catch (err) {
      console.error('Import failed:', err)
      alert('导入失败：文件解析错误')
    }
  }

  input.click()
}
</script>

<template>
  <div class="mcp-page">
    <header class="mcp-header">
      <button class="back-btn" @click="goBack">返回</button>
      <h1>MCP 服务器</h1>
      <div class="header-actions">
        <button class="btn secondary small" @click="importMCPConfig" :disabled="loading">导入</button>
        <button class="btn secondary small" @click="exportMCPConfig" :disabled="loading || serverList.servers.filter(s => !s.builtin).length === 0">导出</button>
        <button class="add-btn" @click="openAddForm">+ 添加服务器</button>
      </div>
    </header>

    <!-- Toast 错误提示 -->
    <Transition name="toast">
      <div v-if="toastError" class="toast-error">
        <span>{{ toastError }}</span>
        <button class="toast-close" @click="toastError = null">×</button>
      </div>
    </Transition>

    <!-- Toast 成功提示 -->
    <Transition name="toast">
      <div v-if="toastSuccess" class="toast-success">
        <span>{{ toastSuccess }}</span>
        <button class="toast-close" @click="toastSuccess = null">×</button>
      </div>
    </Transition>

    <!-- 添加服务器表单 -->
    <Transition name="modal">
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
                <button type="button" class="btn-icon" @click="removeToolDefinition(index)" title="删除工具"><XIcon :size="14" /></button>
              </div>

              <div class="form-group">
                <label>工具名称 *</label>
                <input v-model="tool.function.name" type="text" placeholder="例如: read_file" class="input" />
              </div>

              <div class="form-group">
              <div class="form-group">
                <label>工具别名（可选）</label>
                <input v-model="tool.function.alias" type="text" placeholder="例如：读取文件（用于美化显示）" class="input" />
                <small>可选，用于在前端美化显示，留空则显示工具名称</small>
              </div>

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
    </Transition>

    <!-- 编辑服务器表单 -->
    <Transition name="modal">
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
            <input v-model="newServerForm.name" type="text" class="input" :disabled="editingServer?.builtin" />
            <small v-if="editingServer?.builtin">内置服务器名称不可修改</small>
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
                <button type="button" class="btn-icon" @click="removeToolDefinition(index)" title="删除工具"><XIcon :size="14" /></button>
              </div>

              <div class="form-group">
                <label>工具名称 *</label>
                <input v-model="tool.function.name" type="text" placeholder="例如: read_file" class="input" />
              </div>
              <div class="form-group">
                <label>工具别名（可选）</label>
                <input v-model="tool.function.alias" type="text" placeholder="例如：读取文件（用于美化显示）" class="input" />
                <small>可选，用于在前端美化显示，留空则显示工具名称</small>
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
    </Transition>

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
        <div class="empty-icon"><PlugIcon :size="48" /></div>
        <p>暂无 MCP 服务器</p>
        <button class="btn primary" @click="openAddForm">+ 添加第一个服务器</button>
      </div>

      <!-- 服务器列表 -->
      <div v-else class="server-list">
        <div
          v-for="server in serverList.servers"
          :key="server.id"
          class="server-card"
          :class="{
            disabled: !server.enabled,
            active: activeServers.some(s => s.id === server.id),
            builtin: server.builtin
          }"
        >
          <!-- 状态色条 -->
          <span
            class="status-bar"
            :class="!server.enabled ? 'disabled' : (activeServers.some(s => s.id === server.id) ? 'active' : 'inactive')"
          />

          <div class="card-body">
            <!-- 头部：名称 + 徽章 + 状态 -->
            <div class="card-head">
              <h3 class="server-name">{{ server.name }}</h3>
              <span v-if="server.builtin" class="badge builtin">内置</span>
              <span class="badge transport" :title="getTransportLabel(server.transportType)">{{ server.transportType.toUpperCase() }}</span>
              <span class="head-spacer" />
              <span
                class="status-chip"
                :class="!server.enabled ? 'disabled' : (activeServers.some(s => s.id === server.id) ? 'active' : 'inactive')"
              >
                <span class="status-dot" />
                {{ !server.enabled ? '已禁用' : (activeServers.some(s => s.id === server.id) ? '已激活' : '未激活') }}
              </span>
            </div>

            <!-- 描述 -->
            <p v-if="server.description" class="server-description">{{ server.description }}</p>

            <!-- 详情（可折叠） -->
            <div class="details-section">
              <button class="details-toggle" @click="toggleDetails(server.id)">
                <ChevronDownIcon :class="{ rotated: !isDetailsExpanded(server.id) }" />
                <span>{{ isDetailsExpanded(server.id) ? '收起详情' : '详细信息' }}</span>
              </button>

              <div class="card-details" v-show="isDetailsExpanded(server.id)">
                <template v-if="server.transportType === 'stdio'">
                  <div class="detail-item">
                    <span class="detail-label">命令</span>
                    <code>{{ server.command }}</code>
                  </div>
                  <div v-if="server.args && server.args.length > 0" class="detail-item">
                    <span class="detail-label">参数</span>
                    <code>{{ server.args.join(' ') }}</code>
                  </div>
                  <div v-if="server.env && Object.keys(server.env).length > 0" class="detail-item">
                    <span class="detail-label">环境变量</span>
                    <code>{{ Object.keys(server.env).length }} 个变量</code>
                  </div>
                </template>
                <template v-if="server.transportType === 'sse'">
                  <div class="detail-item">
                    <span class="detail-label">URL</span>
                    <code>{{ server.url }}</code>
                  </div>
                </template>
                <div class="detail-item">
                  <span class="detail-label">工具</span>
                  <code>{{ server.tools?.length || 0 }} 个</code>
                </div>
                <div v-if="server.dependencies && server.dependencies.packages.length > 0" class="detail-item">
                  <span class="detail-label">依赖</span>
                  <code :title="server.dependencies.packages.join(', ')">
                    {{ server.dependencies.type === 'python' ? 'pip' : server.dependencies.type === 'uvx' ? 'uvx' : 'npm' }}:
                    {{ server.dependencies.packages.length > 2
                      ? server.dependencies.packages.slice(0, 2).join(', ') + '...'
                      : server.dependencies.packages.join(', ') }}
                  </code>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="card-actions">
              <button
                v-if="server.enabled"
                class="act-btn primary-act"
                :class="{ on: activeServers.some(s => s.id === server.id) }"
                @click="toggleServerActive(server.id)"
                :title="activeServers.some(s => s.id === server.id) ? '点击停用' : '点击激活'"
              >
                {{ activeServers.some(s => s.id === server.id) ? '停用' : '激活' }}
              </button>
              <button
                class="act-btn"
                @click="toggleServerEnabled(server.id)"
                :title="server.enabled ? '禁用此服务器' : '启用此服务器'"
                :disabled="server.builtin"
              >
                {{ server.enabled ? '禁用' : '启用' }}
              </button>
              <button
                class="act-btn icon-btn"
                @click="openEditForm(server)"
                title="编辑"
              >
                <EditIcon :size="14" />
                <span>编辑</span>
              </button>
              <button
                v-if="canFetchTools(server)"
                class="act-btn icon-btn"
                :class="{ loading: refreshingServerId === server.id }"
                @click="handleRefreshTools(server)"
                :disabled="refreshingServerId === server.id"
                title="从服务器刷新工具列表"
              >
                <RefreshIcon :size="14" />
                <span>{{ refreshingServerId === server.id ? '刷新中' : '刷新工具' }}</span>
              </button>
              <button
                v-if="hasDependencies(server)"
                class="act-btn icon-btn"
                :class="{ loading: installingDependenciesServerId === server.id }"
                @click="handleInstallDependencies(server)"
                :disabled="installingDependenciesServerId === server.id"
                title="安装服务器依赖"
              >
                <PackageIcon :size="14" />
                <span>{{ installingDependenciesServerId === server.id ? '安装中' : '安装依赖' }}</span>
              </button>
              <button
                v-if="!server.builtin"
                class="act-btn icon-btn danger"
                @click="confirmDelete(server)"
                title="删除"
              >
                <TrashIcon :size="14" />
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-page {
  display: flex;
  flex-direction: column;
}

.mcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
}

.mcp-header h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* back-btn and add-btn styles moved to global style.css */

.mcp-content {
  padding: 20px 24px;
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
  color: var(--color-text-secondary);
  font-size: 16px;
}

.server-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 14px;
}

.server-card {
  position: relative;
  display: flex;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.server-card:hover {
  border-color: var(--color-border-hover);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.server-card.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary) inset;
}

.server-card.disabled {
  background: var(--color-bg-tertiary);
  opacity: 0.75;
}

/* 左侧状态色条 */
.status-bar {
  width: 3px;
  flex-shrink: 0;
  background: var(--color-border);
}
.status-bar.active {
  background: var(--color-primary);
}
.status-bar.inactive {
  background: var(--color-border-hover);
}
.status-bar.disabled {
  background: var(--color-danger);
}

.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  min-width: 0;
  gap: 10px;
}

/* 头部 */
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.server-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.badge.builtin {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.badge.transport {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
  letter-spacing: 0.3px;
}

.head-spacer {
  flex: 1;
}

/* 状态标签 */
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 500;
  white-space: nowrap;
}

.status-chip .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-chip.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.status-chip.inactive {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}
.status-chip.disabled {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

/* 描述 */
.server-description {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 详情 */
.details-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.details-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  margin: 0;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.details-toggle:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.details-toggle svg {
  width: 12px;
  height: 12px;
  transition: transform 0.2s;
}

.details-toggle svg.rotated {
  transform: rotate(-90deg);
}

.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  min-width: 0;
}

.detail-label {
  color: var(--color-text-secondary);
  font-weight: 500;
  flex-shrink: 0;
  min-width: 64px;
}

.detail-item code {
  flex: 1;
  background: var(--color-bg-primary);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
  font-size: 11px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮 */
.card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 4px;
}

.act-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
}

.act-btn:hover:not(:disabled) {
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.act-btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.act-btn svg {
  flex-shrink: 0;
}

/* 主操作按钮（激活/停用） */
.act-btn.primary-act {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.act-btn.primary-act:hover:not(:disabled) {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-primary);
}
.act-btn.primary-act.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-on-primary);
}
.act-btn.primary-act.on:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--color-text-on-primary);
}

.act-btn.danger:hover:not(:disabled) {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
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
  background: var(--color-bg-primary);
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
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* close-btn styles moved to global style.css */

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
  color: var(--color-text-primary);
}

.form-group.checkbox-group label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--color-bg-primary);
  font-family: inherit;
}

.input:focus {
  border-color: var(--color-border-hover);
}

.input.textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.6;
}

.form-group small {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}

/* Button styles moved to global style.css */

/* 工具配置相关样式 */
.form-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
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
  color: var(--color-text-primary);
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
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  text-align: center;
  color: var(--color-text-secondary);
}

.tool-config-card {
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  margin-bottom: 12px;
}

.tool-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.btn-icon {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
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

/* Toast 错误提示样式 */
.toast-error {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #dc2626;
  border: 1px solid #b91c1c;
  color: #ffffff !important;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 600px;
  width: calc(100% - 40px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  font-size: 14px;
  line-height: 1.5;
}

.toast-error span {
  color: #ffffff !important;
}

.toast-error .toast-close {
  color: #ffffff !important;
}

.toast-success {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #16a34a;
  border: 1px solid #15803d;
  color: #ffffff !important;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 600px;
  width: calc(100% - 40px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  font-size: 14px;
  line-height: 1.5;
}

.toast-success span {
  color: #ffffff !important;
}

.toast-success .toast-close {
  color: #ffffff !important;
}

.toast-error span {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-close {
  background: transparent;
  border: none;
  color: #991b1b;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
