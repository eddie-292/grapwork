<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConnections } from '@/composables/useConnections'
import type { ConnectionConfig, ConnectionType, YuqueConfig } from '@/types/connection'
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

// 新连接表单
const newConnection = ref<{
  type: ConnectionType
  name: string
  authToken: string
}>({
  type: 'yuque',
  name: '',
  authToken: '',
})

// 编辑表单
const editForm = ref<{
  name: string
  authToken: string
}>({
  name: '',
  authToken: '',
})

// 可用的连接类型
const connectionTypes: { value: ConnectionType; label: string; description: string }[] = [
  {
    value: 'yuque',
    label: '语雀',
    description: '专业的云端知识库，支持文档读写',
  },
  // 后续添加更多连接类型
  // { value: 'feishu', label: '飞书', description: '企业协作平台' },
]

// 获取连接类型标签
function getTypeLabel(type: ConnectionType): string {
  const found = connectionTypes.find((t) => t.value === type)
  return found?.label || type
}

// 计算属性
const connections = computed(() => connectionsManager.connections.value)

onMounted(async () => {
  loading.value = true
  try {
    await connectionsManager.initialize()
  } finally {
    loading.value = false
  }
})

// 打开添加对话框
function openAddDialog() {
  newConnection.value = {
    type: 'yuque',
    name: '',
    authToken: '',
  }
  testResult.value = null
  showAddDialog.value = true
}

// 打开编辑对话框
function openEditDialog(connection: ConnectionConfig) {
  editingConnection.value = connection
  const config = connection.config as YuqueConfig
  editForm.value = {
    name: connection.name,
    authToken: config.authToken || '',
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
  if (!newConnection.value.authToken.trim()) {
    message.value = '请输入认证令牌'
    return
  }

  loading.value = true
  message.value = ''

  try {
    const config: YuqueConfig = {
      authToken: newConnection.value.authToken.trim(),
    }

    const result = await connectionsManager.addConnection(
      newConnection.value.type,
      newConnection.value.name.trim(),
      config
    )

    if (result.success) {
      message.value = '连接添加成功'
      closeDialog()
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
    const config: YuqueConfig = {
      authToken: editForm.value.authToken.trim(),
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

// 格式化时间
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 打开语雀 Token 设置页面
function openYuqueTokenPage() {
  window.electronAPI?.openExternal?.('https://www.yuque.com/settings/tokens')
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
  margin-bottom: 16px;
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
