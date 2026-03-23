<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConnections } from '@/composables/useConnections'
import type { ConnectionConfig, ConnectionType, YuqueConfig, FeishuConfig, GitHubConfig } from '@/types/connection'
import { FeishuConnection } from '@/connections/FeishuConnection'
import PlusIcon from '@/components/icons/PlusIcon.vue'
import RefreshIcon from '@/components/icons/RefreshIcon.vue'
import EditIcon from '@/components/icons/EditIcon.vue'
import DeleteIcon from '@/components/icons/DeleteIcon.vue'

const connectionsManager = useConnections()

// 状态
const loading = ref(false)
const message = ref('')
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const editingConnection = ref<ConnectionConfig | null>(null)
const testing = ref(false)
const testResult = ref<{ success: boolean; error?: string } | null>(null)

// OAuth 相关状态
const oauthPending = ref(false)
const oauthConnectionId = ref<string | null>(null)

// 新连接表单
const newConnection = ref<{
  type: ConnectionType
  name: string
  // 语雀配置
  authToken: string
  // 飞书配置
  appId: string
  appSecret: string
  authMode: 'tenant' | 'user'
  // GitHub 配置
  githubToken: string
  githubBaseUrl: string
}>({
  type: 'yuque',
  name: '',
  authToken: '',
  appId: '',
  appSecret: '',
  authMode: 'tenant',
  githubToken: '',
  githubBaseUrl: '',
})

// 编辑表单
const editForm = ref<{
  name: string
  // 语雀配置
  authToken: string
  // 飞书配置
  appId: string
  appSecret: string
  authMode: 'tenant' | 'user'
  // GitHub 配置
  githubToken: string
  githubBaseUrl: string
}>({
  name: '',
  authToken: '',
  appId: '',
  appSecret: '',
  authMode: 'tenant',
  githubToken: '',
  githubBaseUrl: '',
})

// 可用的连接类型
const connectionTypes: { value: ConnectionType; label: string; description: string; features: string[] }[] = [
  {
    value: 'yuque',
    label: '语雀',
    description: '专业的云端知识库，支持文档读写',
    features: ['知识库列表', '文档列表', '读取文档', '创建文档', '更新文档', '删除文档'],
  },
  {
    value: 'feishu',
    label: '飞书',
    description: '企业协作平台，支持知识库文档操作',
    features: ['知识空间列表', '文档节点列表', '读取文档', '创建文档', '更新文档', '删除文档'],
  },
  {
    value: 'github',
    label: 'GitHub',
    description: '代码托管平台，支持仓库、Issue、PR 操作',
    features: ['仓库列表', 'Issue 管理', 'Pull Request', '文件读写', '分支管理', '搜索功能'],
  },
]

// 获取连接类型的功能列表
function getTypeFeatures(type: ConnectionType): string[] {
  const found = connectionTypes.find((t) => t.value === type)
  return found?.features || []
}

// 获取连接类型标签
function getTypeLabel(type: ConnectionType): string {
  const found = connectionTypes.find((t) => t.value === type)
  return found?.label || type
}

// 计算属性
const connections = computed(() => connectionsManager.connections.value)

// OAuth 回调处理
async function handleOAuthCallback(data: { code: string; state: string; connectionId: string }) {
  if (oauthPending.value && data.connectionId === oauthConnectionId.value) {
    // 清除超时定时器
    if (oauthTimeoutId) {
      clearTimeout(oauthTimeoutId)
      oauthTimeoutId = null
    }
    oauthPending.value = false
    const instance = connectionsManager.getInstance(data.connectionId) as FeishuConnection
    if (instance && instance.exchangeOAuthCode) {
      const result = await instance.exchangeOAuthCode(data.code)
      if (result.success) {
        message.value = '授权成功'
        // 更新连接配置以保存 token
        const config = instance.getConfig()
        await connectionsManager.updateConnection(data.connectionId, { config })
        await connectionsManager.refreshStatus(data.connectionId)
      } else {
        message.value = result.error || '授权失败'
      }
    }
    setTimeout(() => {
      message.value = ''
    }, 3000)
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await connectionsManager.initialize()
    // 监听 OAuth 回调
    window.electronAPI?.onFeishuOAuthCallback?.(handleOAuthCallback)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.electronAPI?.removeFeishuOAuthCallbackListener?.()
})

// 打开添加对话框
function openAddDialog() {
  newConnection.value = {
    type: 'yuque',
    name: '',
    authToken: '',
    appId: '',
    appSecret: '',
    authMode: 'tenant',
    githubToken: '',
    githubBaseUrl: '',
  }
  testResult.value = null
  showAddDialog.value = true
}

// 打开编辑对话框
function openEditDialog(connection: ConnectionConfig) {
  editingConnection.value = connection

  if (connection.type === 'yuque') {
    const config = connection.config as YuqueConfig
    editForm.value = {
      name: connection.name,
      authToken: config.authToken || '',
      appId: '',
      appSecret: '',
      authMode: 'tenant',
      githubToken: '',
      githubBaseUrl: '',
    }
  } else if (connection.type === 'feishu') {
    const config = connection.config as FeishuConfig
    editForm.value = {
      name: connection.name,
      authToken: '',
      appId: config.appId || '',
      appSecret: config.appSecret || '',
      authMode: config.authMode || 'tenant',
      githubToken: '',
      githubBaseUrl: '',
    }
  } else if (connection.type === 'github') {
    const config = connection.config as GitHubConfig
    editForm.value = {
      name: connection.name,
      authToken: '',
      appId: '',
      appSecret: '',
      authMode: 'tenant',
      githubToken: config.authToken || '',
      githubBaseUrl: config.baseUrl || '',
    }
  } else {
    editForm.value = {
      name: connection.name,
      authToken: '',
      appId: '',
      appSecret: '',
      authMode: 'tenant',
      githubToken: '',
      githubBaseUrl: '',
    }
  }

  testResult.value = null
  showEditDialog.value = true
}

// 关闭对话框
function closeDialog() {
  showAddDialog.value = false
  showEditDialog.value = false
  editingConnection.value = null
  testResult.value = null
}

// 添加连接
async function addConnection() {
  if (!newConnection.value.name.trim()) {
    message.value = '请输入连接名称'
    return
  }

  // 根据类型验证不同的字段
  if (newConnection.value.type === 'yuque') {
    if (!newConnection.value.authToken.trim()) {
      message.value = '请输入认证令牌'
      return
    }
  } else if (newConnection.value.type === 'feishu') {
    if (!newConnection.value.appId.trim() || !newConnection.value.appSecret.trim()) {
      message.value = '请输入 App ID 和 App Secret'
      return
    }
  } else if (newConnection.value.type === 'github') {
    if (!newConnection.value.githubToken.trim()) {
      message.value = '请输入 GitHub Personal Access Token'
      return
    }
  }

  loading.value = true
  message.value = ''

  try {
    let config: Record<string, unknown>

    if (newConnection.value.type === 'yuque') {
      config = {
        authToken: newConnection.value.authToken.trim(),
      }
    } else if (newConnection.value.type === 'feishu') {
      config = {
        appId: newConnection.value.appId.trim(),
        appSecret: newConnection.value.appSecret.trim(),
        authMode: newConnection.value.authMode,
      }
    } else if (newConnection.value.type === 'github') {
      config = {
        authToken: newConnection.value.githubToken.trim(),
        baseUrl: newConnection.value.githubBaseUrl.trim() || undefined,
      }
    } else {
      config = {}
    }

    const result = await connectionsManager.addConnection(
      newConnection.value.type,
      newConnection.value.name.trim(),
      config
    )

    if (result.success) {
      message.value = '连接添加成功'
      closeDialog()

      // 如果是飞书用户授权模式，自动触发授权流程
      if (newConnection.value.type === 'feishu' && newConnection.value.authMode === 'user' && result.id) {
        startFeishuOAuth(result.id)
      }

      setTimeout(() => {
        message.value = ''
      }, 2000)
    } else {
      message.value = result.error || '添加失败'
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '添加失败'
  } finally {
    loading.value = false
  }
}

// 更新连接
async function updateConnection() {
  if (!editingConnection.value) return
  if (!editForm.value.name.trim()) {
    message.value = '请输入连接名称'
    return
  }

  loading.value = true
  message.value = ''

  try {
    let config: Record<string, unknown>

    if (editingConnection.value.type === 'yuque') {
      // 如果 Token 为空，保持原有配置
      const existingConfig = editingConnection.value.config as YuqueConfig
      config = {
        authToken: editForm.value.authToken.trim() || existingConfig.authToken,
      }
    } else if (editingConnection.value.type === 'feishu') {
      const existingConfig = editingConnection.value.config as FeishuConfig
      config = {
        appId: editForm.value.appId.trim() || existingConfig.appId,
        appSecret: editForm.value.appSecret.trim() || existingConfig.appSecret,
        authMode: editForm.value.authMode,
        // 保留现有的 OAuth token
        userAccessToken: existingConfig.userAccessToken,
        userRefreshToken: existingConfig.userRefreshToken,
        tokenExpiresAt: existingConfig.tokenExpiresAt,
        userInfo: existingConfig.userInfo,
      }
    } else if (editingConnection.value.type === 'github') {
      const existingConfig = editingConnection.value.config as GitHubConfig
      config = {
        authToken: editForm.value.githubToken.trim() || existingConfig.authToken,
        baseUrl: editForm.value.githubBaseUrl.trim() || existingConfig.baseUrl,
      }
    } else {
      config = editingConnection.value.config
    }

    const result = await connectionsManager.updateConnection(editingConnection.value.id, {
      name: editForm.value.name.trim(),
      config,
    })

    if (result.success) {
      message.value = '连接更新成功'
      closeDialog()
      setTimeout(() => {
        message.value = ''
      }, 2000)
    } else {
      message.value = result.error || '更新失败'
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '更新失败'
  } finally {
    loading.value = false
  }
}

// 删除连接
async function deleteConnection(connection: ConnectionConfig) {
  if (!confirm(`确定要删除连接 "${connection.name}" 吗？`)) {
    return
  }

  loading.value = true
  message.value = ''

  try {
    const success = await connectionsManager.deleteConnection(connection.id)
    if (success) {
      message.value = '连接已删除'
      setTimeout(() => {
        message.value = ''
      }, 2000)
    } else {
      message.value = '删除失败'
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除失败'
  } finally {
    loading.value = false
  }
}

// 刷新连接状态
async function refreshStatus(connection: ConnectionConfig) {
  testing.value = true
  testResult.value = null

  try {
    const status = await connectionsManager.refreshStatus(connection.id)
    testResult.value = {
      success: status.connected,
      error: status.error,
    }
  } catch (error) {
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : '刷新失败',
    }
  } finally {
    testing.value = false
  }
}

// 获取连接状态
function getConnectionStatus(connectionId: string) {
  return connectionsManager.getStatus(connectionId)
}

// 获取飞书授权状态
function getFeishuAuthStatus(connectionId: string) {
  const instance = connectionsManager.getInstance(connectionId) as FeishuConnection
  return instance?.getAuthorizationStatus?.() || { mode: 'tenant', hasUserToken: false, tokenExpired: true }
}

// OAuth 超时定时器
let oauthTimeoutId: ReturnType<typeof setTimeout> | null = null

// 启动飞书 OAuth 授权
async function startFeishuOAuth(connectionId: string) {
  oauthPending.value = true
  oauthConnectionId.value = connectionId

  // 设置 5 分钟超时
  if (oauthTimeoutId) {
    clearTimeout(oauthTimeoutId)
  }
  oauthTimeoutId = setTimeout(() => {
    if (oauthPending.value && oauthConnectionId.value === connectionId) {
      oauthPending.value = false
      oauthConnectionId.value = null
      message.value = '授权超时，请重试'
      setTimeout(() => {
        message.value = ''
      }, 3000)
    }
  }, 5 * 60 * 1000)

  try {
    const instance = connectionsManager.getInstance(connectionId) as FeishuConnection
    if (instance && instance.startOAuthFlow) {
      const result = await instance.startOAuthFlow(connectionId)
      if (!result.success) {
        // 启动失败，清除超时
        if (oauthTimeoutId) {
          clearTimeout(oauthTimeoutId)
          oauthTimeoutId = null
        }
        oauthPending.value = false
        message.value = result.error || '启动授权失败'
        setTimeout(() => {
          message.value = ''
        }, 3000)
      }
    } else {
      // 没有实例，清除超时
      if (oauthTimeoutId) {
        clearTimeout(oauthTimeoutId)
        oauthTimeoutId = null
      }
      oauthPending.value = false
      message.value = '连接实例不存在'
      setTimeout(() => {
        message.value = ''
      }, 3000)
    }
  } catch (error) {
    // 异常处理
    if (oauthTimeoutId) {
      clearTimeout(oauthTimeoutId)
      oauthTimeoutId = null
    }
    oauthPending.value = false
    message.value = error instanceof Error ? error.message : '授权失败'
    setTimeout(() => {
      message.value = ''
    }, 3000)
  }
}

// 格式化时间
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 打开语雀 Token 设置页面
function openYuqueTokenPage() {
  window.electronAPI?.openExternal?.('https://www.yuque.com/settings/tokens')
}

// 打开飞书开放平台页面
function openFeishuDevPage() {
  window.electronAPI?.openExternal?.('https://open.feishu.cn/app')
}

// 打开 GitHub Token 设置页面
function openGitHubTokenPage() {
  window.electronAPI?.openExternal?.('https://github.com/settings/tokens')
}
</script>

<template>
  <div class="connections-panel">
    <div class="header">
      <div class="header-content">
        <h2 class="title">第三方连接</h2>
        <p class="description">连接第三方服务，实现文档读写等操作</p>
      </div>
      <button class="btn primary" @click="openAddDialog">
        <PlusIcon :size="16" />
        添加连接
      </button>
    </div>

    <!-- 连接列表 -->
    <div class="connections-list" v-if="connections.length > 0">
      <div
        v-for="connection in connections"
        :key="connection.id"
        class="connection-card"
      >
        <div class="connection-header">
          <div class="connection-info">
            <div class="connection-type">{{ getTypeLabel(connection.type) }}</div>
            <div class="connection-name">{{ connection.name }}</div>
          </div>
          <div class="connection-status">
            <span
              class="status-dot"
              :class="{
                connected: getConnectionStatus(connection.id).connected,
                disconnected: !getConnectionStatus(connection.id).connected,
              }"
            ></span>
            <span class="status-text">
              {{ getConnectionStatus(connection.id).connected ? '已连接' : '未连接' }}
            </span>
          </div>
        </div>

        <!-- 飞书授权状态 -->
        <div v-if="connection.type === 'feishu'" class="auth-status">
          <span class="auth-label">授权模式:</span>
          <span class="auth-value" :class="getFeishuAuthStatus(connection.id).mode">
            {{ getFeishuAuthStatus(connection.id).mode === 'user' ? '用户授权' : '应用授权' }}
          </span>
          <button
            v-if="getFeishuAuthStatus(connection.id).mode === 'user'"
            class="btn small"
            :class="getFeishuAuthStatus(connection.id).tokenExpired ? 'warning' : 'success'"
            @click="startFeishuOAuth(connection.id)"
            :disabled="oauthPending && oauthConnectionId === connection.id"
          >
            {{ oauthPending && oauthConnectionId === connection.id ? '授权中...' :
               getFeishuAuthStatus(connection.id).tokenExpired ? '重新授权' : '已授权' }}
          </button>
        </div>

        <div class="connection-user" v-if="getConnectionStatus(connection.id).user">
          <img
            v-if="getConnectionStatus(connection.id).user?.avatar"
            :src="getConnectionStatus(connection.id).user?.avatar"
            class="user-avatar"
            alt="avatar"
          />
          <span class="user-name">{{ getConnectionStatus(connection.id).user?.name }}</span>
        </div>

        <div class="connection-meta">
          <span>创建于 {{ formatTime(connection.createdAt) }}</span>
        </div>

        <!-- 支持的功能 -->
        <div class="connection-features">
          <span class="features-label">支持操作:</span>
          <div class="features-tags">
            <span
              v-for="feature in getTypeFeatures(connection.type)"
              :key="feature"
              class="feature-tag"
            >
              {{ feature }}
            </span>
          </div>
        </div>

        <div class="connection-actions">
          <button
            class="btn-icon"
            @click="refreshStatus(connection)"
            :disabled="testing"
            title="刷新状态"
          >
            <RefreshIcon :size="16" />
          </button>
          <button
            class="btn-icon"
            @click="openEditDialog(connection)"
            title="编辑"
          >
            <EditIcon :size="16" />
          </button>
          <button
            class="btn-icon danger"
            @click="deleteConnection(connection)"
            title="删除"
          >
            <DeleteIcon :size="16" />
          </button>
        </div>

        <div
          v-if="getConnectionStatus(connection.id).error"
          class="connection-error"
        >
          {{ getConnectionStatus(connection.id).error }}
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else-if="!loading">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <p>暂无连接</p>
      <button class="btn primary" @click="openAddDialog">添加第一个连接</button>
    </div>

    <!-- 消息提示 -->
    <div
      v-if="message"
      class="message"
      :class="{ success: message.includes('成功') || message.includes('删除') }"
    >
      {{ message }}
    </div>

    <!-- 添加连接对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>添加连接</h3>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label>连接类型</label>
            <div class="connection-type-list">
              <label
                v-for="type in connectionTypes"
                :key="type.value"
                class="connection-type-option"
                :class="{ active: newConnection.type === type.value }"
              >
                <input
                  type="radio"
                  :value="type.value"
                  v-model="newConnection.type"
                />
                <div class="type-info">
                  <span class="type-label">{{ type.label }}</span>
                  <span class="type-desc">{{ type.description }}</span>
                  <div class="type-features">
                    <span v-for="feature in type.features" :key="feature" class="type-feature-tag">
                      {{ feature }}
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>连接名称</label>
            <input
              v-model="newConnection.name"
              type="text"
              class="input"
              placeholder="例如：我的语雀"
            />
          </div>

          <div class="form-group" v-if="newConnection.type === 'yuque'">
            <label>认证令牌 (Token)</label>
            <input
              v-model="newConnection.authToken"
              type="password"
              class="input"
              placeholder="输入语雀 API Token"
            />
            <small>
              在语雀
              <a href="#" @click.prevent="openYuqueTokenPage">个人设置 -> Token</a>
              中创建
            </small>
          </div>

          <template v-if="newConnection.type === 'feishu'">
            <div class="form-group">
              <label>App ID</label>
              <input
                v-model="newConnection.appId"
                type="text"
                class="input"
                placeholder="输入飞书应用 App ID"
              />
            </div>
            <div class="form-group">
              <label>App Secret</label>
              <input
                v-model="newConnection.appSecret"
                type="password"
                class="input"
                placeholder="输入飞书应用 App Secret"
              />
              <small>
                在
                <a href="#" @click.prevent="openFeishuDevPage">飞书开放平台</a>
                创建企业自建应用获取
              </small>
            </div>
            <div class="form-group">
              <label>授权模式</label>
              <div class="auth-mode-list">
                <label
                  class="auth-mode-option"
                  :class="{ active: newConnection.authMode === 'tenant' }"
                >
                  <input type="radio" value="tenant" v-model="newConnection.authMode" />
                  <div class="mode-info">
                    <span class="mode-label">应用授权</span>
                    <span class="mode-desc">使用应用凭证访问，适合企业内部应用</span>
                  </div>
                </label>
                <label
                  class="auth-mode-option"
                  :class="{ active: newConnection.authMode === 'user' }"
                >
                  <input type="radio" value="user" v-model="newConnection.authMode" />
                  <div class="mode-info">
                    <span class="mode-label">用户授权</span>
                    <span class="mode-desc">OAuth 授权访问用户数据，适合需要用户身份的场景</span>
                  </div>
                </label>
              </div>
            </div>
            <!-- 用户授权提示 -->
            <div class="form-group" v-if="newConnection.authMode === 'user'">
              <label>用户授权</label>
              <div class="oauth-hint">
                <span class="oauth-icon info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
                <span class="oauth-text">添加连接后将自动打开授权页面</span>
              </div>
            </div>
          </template>

          <template v-if="newConnection.type === 'github'">
            <div class="form-group">
              <label>Personal Access Token</label>
              <input
                v-model="newConnection.githubToken"
                type="password"
                class="input"
                placeholder="输入 GitHub Personal Access Token"
              />
              <small>
                在 GitHub
                <a href="#" @click.prevent="openGitHubTokenPage">Settings -> Developer settings -> Personal access tokens</a>
                中创建
              </small>
            </div>
            <div class="form-group">
              <label>API Base URL (可选)</label>
              <input
                v-model="newConnection.githubBaseUrl"
                type="text"
                class="input"
                placeholder="https://api.github.com (默认)"
              />
              <small>企业版 GitHub 可自定义 API 地址</small>
            </div>
          </template>

          <div v-if="testResult" class="test-result" :class="{ success: testResult.success }">
            {{ testResult.success ? '连接测试成功' : testResult.error }}
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn secondary" @click="closeDialog">取消</button>
          <button
            class="btn primary"
            @click="addConnection"
            :disabled="loading"
          >
            {{ loading ? '添加中...' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑连接对话框 -->
    <div v-if="showEditDialog" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>编辑连接</h3>
        </div>
        <div class="dialog-content">
          <div class="form-group">
            <label>连接名称</label>
            <input
              v-model="editForm.name"
              type="text"
              class="input"
              placeholder="例如：我的语雀"
            />
          </div>

          <div class="form-group" v-if="editingConnection?.type === 'yuque'">
            <label>认证令牌 (Token)</label>
            <input
              v-model="editForm.authToken"
              type="password"
              class="input"
              placeholder="输入语雀 API Token"
            />
            <small>留空则保持原有 Token 不变</small>
          </div>

          <template v-if="editingConnection?.type === 'feishu'">
            <div class="form-group">
              <label>App ID</label>
              <input
                v-model="editForm.appId"
                type="text"
                class="input"
                placeholder="输入飞书应用 App ID"
              />
              <small>留空则保持原有 App ID 不变</small>
            </div>
            <div class="form-group">
              <label>App Secret</label>
              <input
                v-model="editForm.appSecret"
                type="password"
                class="input"
                placeholder="输入飞书应用 App Secret"
              />
              <small>留空则保持原有 App Secret 不变</small>
            </div>
            <div class="form-group">
              <label>授权模式</label>
              <div class="auth-mode-list">
                <label
                  class="auth-mode-option"
                  :class="{ active: editForm.authMode === 'tenant' }"
                >
                  <input type="radio" value="tenant" v-model="editForm.authMode" />
                  <div class="mode-info">
                    <span class="mode-label">应用授权</span>
                    <span class="mode-desc">使用应用凭证访问，适合企业内部应用</span>
                  </div>
                </label>
                <label
                  class="auth-mode-option"
                  :class="{ active: editForm.authMode === 'user' }"
                >
                  <input type="radio" value="user" v-model="editForm.authMode" />
                  <div class="mode-info">
                    <span class="mode-label">用户授权</span>
                    <span class="mode-desc">OAuth 授权访问用户数据，需要点击授权按钮完成授权</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- 用户授权按钮 -->
            <div class="form-group" v-if="editForm.authMode === 'user'">
              <label>用户授权</label>
              <div class="oauth-section">
                <template v-if="editingConnection">
                  <div class="oauth-status" v-if="getFeishuAuthStatus(editingConnection.id).hasUserToken && !getFeishuAuthStatus(editingConnection.id).tokenExpired">
                    <span class="oauth-icon success">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </span>
                    <span class="oauth-text">
                      已授权
                      <span v-if="getFeishuAuthStatus(editingConnection.id).userName">
                        ({{ getFeishuAuthStatus(editingConnection.id).userName }})
                      </span>
                    </span>
                    <button
                      class="btn small secondary"
                      @click="startFeishuOAuth(editingConnection.id)"
                      :disabled="oauthPending && oauthConnectionId === editingConnection.id"
                    >
                      {{ oauthPending && oauthConnectionId === editingConnection.id ? '授权中...' : '重新授权' }}
                    </button>
                  </div>
                  <div class="oauth-status" v-else>
                    <span class="oauth-icon warning">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                    <span class="oauth-text">
                      {{ getFeishuAuthStatus(editingConnection.id).tokenExpired ? '授权已过期' : '未授权' }}
                    </span>
                    <button
                      class="btn small primary"
                      @click="startFeishuOAuth(editingConnection.id)"
                      :disabled="oauthPending && oauthConnectionId === editingConnection.id"
                    >
                      {{ oauthPending && oauthConnectionId === editingConnection.id ? '授权中...' : '去授权' }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="oauth-hint">
                    <span class="oauth-icon info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </span>
                    <span class="oauth-text">保存连接后可进行用户授权</span>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <template v-if="editingConnection?.type === 'github'">
            <div class="form-group">
              <label>Personal Access Token</label>
              <input
                v-model="editForm.githubToken"
                type="password"
                class="input"
                placeholder="输入 GitHub Personal Access Token"
              />
              <small>留空则保持原有 Token 不变</small>
            </div>
            <div class="form-group">
              <label>API Base URL (可选)</label>
              <input
                v-model="editForm.githubBaseUrl"
                type="text"
                class="input"
                placeholder="https://api.github.com (默认)"
              />
              <small>企业版 GitHub 可自定义 API 地址</small>
            </div>
          </template>

          <div v-if="testResult" class="test-result" :class="{ success: testResult.success }">
            {{ testResult.success ? '连接测试成功' : testResult.error }}
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn secondary" @click="closeDialog">取消</button>
          <button
            class="btn primary"
            @click="updateConnection"
            :disabled="loading"
          >
            {{ loading ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connections-panel {
  width: 100%;
  max-width: 800px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-content {
  flex: 1;
}

.title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.description {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* 连接列表 */
.connections-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.connection-card {
  padding: 20px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.connection-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.connection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.connection-type {
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 500;
}

.connection-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected {
  background: #22c55e;
}

.status-dot.disconnected {
  background: #dc2626;
}

.status-text {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 授权状态 */
.auth-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  font-size: 13px;
}

.auth-label {
  color: var(--color-text-secondary);
}

.auth-value {
  font-weight: 500;
}

.auth-value.user {
  color: var(--color-primary);
}

.auth-value.tenant {
  color: var(--color-text-primary);
}

.btn.small {
  padding: 4px 10px;
  font-size: 12px;
  margin-left: auto;
}

.btn.warning {
  background: #f59e0b;
  color: white;
}

.btn.success {
  background: #22c55e;
  color: white;
}

.btn.warning:hover:not(:disabled),
.btn.success:hover:not(:disabled) {
  opacity: 0.9;
}

.connection-user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.user-name {
  font-size: 13px;
  color: var(--color-text-primary);
}

.connection-meta {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}

/* 支持的功能标签 */
.connection-features {
  margin-bottom: 16px;
}

.features-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-right: 8px;
}

.features-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  vertical-align: middle;
}

.feature-tag {
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--color-primary);
  background: rgba(0, 122, 255, 0.08);
  border-radius: 4px;
  white-space: nowrap;
}

.connection-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.btn-icon.danger:hover {
  background: #fee2e2;
  color: #dc2626;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connection-error {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 8px;
  font-size: 13px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px dashed var(--color-border);
}

.empty-icon {
  color: var(--color-text-tertiary);
  margin-bottom: 16px;
}

.empty-state p {
  margin: 0 0 20px 0;
  color: var(--color-text-secondary);
  font-size: 15px;
}

/* 按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--color-primary);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn.secondary {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn.secondary:hover:not(:disabled) {
  border-color: var(--color-primary);
}

/* 消息 */
.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  background: #fee2e2;
  color: #dc2626;
}

.message.success {
  background: #dcfce7;
  color: #16a34a;
}

/* 对话框 */
.dialog-overlay {
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
}

.dialog {
  background: var(--color-bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.dialog-content {
  padding: 24px;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 表单 */
.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
  color: var(--color-text-primary);
}

.form-group small {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.form-group small a {
  color: var(--color-primary);
  cursor: pointer;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-sizing: border-box;
}

.input:focus {
  border-color: var(--color-primary);
}

/* 连接类型选择 */
.connection-type-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.connection-type-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.connection-type-option:hover {
  border-color: var(--color-primary);
}

.connection-type-option.active {
  border-color: var(--color-primary);
  background: rgba(0, 122, 255, 0.05);
}

.connection-type-option input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.type-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.type-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.type-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.type-features {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.type-feature-tag {
  padding: 2px 6px;
  font-size: 10px;
  color: var(--color-primary);
  background: rgba(0, 122, 255, 0.08);
  border-radius: 3px;
}

/* 授权模式选择 */
.auth-mode-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-mode-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-mode-option:hover {
  border-color: var(--color-primary);
}

.auth-mode-option.active {
  border-color: var(--color-primary);
  background: rgba(0, 122, 255, 0.05);
}

.auth-mode-option input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.mode-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* OAuth 授权区域 */
.oauth-section {
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.oauth-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.oauth-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.oauth-icon.success {
  background: #dcfce7;
  color: #16a34a;
}

.oauth-icon.warning {
  background: #fef3c7;
  color: #d97706;
}

.oauth-icon.info {
  background: #dbeafe;
  color: #2563eb;
}

.oauth-text {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
}

.oauth-hint {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn.small.primary {
  padding: 6px 12px;
  font-size: 13px;
  background: var(--color-primary);
  color: white;
}

.btn.small.secondary {
  padding: 6px 12px;
  font-size: 13px;
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn.small.secondary:hover:not(:disabled) {
  border-color: var(--color-primary);
}

/* 测试结果 */
.test-result {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  background: #fee2e2;
  color: #dc2626;
}

.test-result.success {
  background: #dcfce7;
  color: #16a34a;
}
</style>
