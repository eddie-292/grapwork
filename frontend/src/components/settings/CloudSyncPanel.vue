<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { syncService } from '@/services/SyncService'
import { StorageKey } from '@/types/storage'
import type { SyncConfig, SyncStatus, SyncResult, ConflictStrategy } from '@/types/sync'
import RefreshIcon from '@/components/icons/RefreshIcon.vue'
import CloudIcon from '@/components/icons/CloudIcon.vue'

// 同步配置
const config = ref<SyncConfig>({
  enabled: false,
  serverUrl: '',
  apiToken: '',
  syncKeys: [],
  autoSync: false,
  autoSyncInterval: 30,
  conflictStrategy: 'newer-wins',
})

// 同步状态
const syncStatus = ref<SyncStatus>('idle')

// 可选的同步项
const availableSyncKeys = [
  { key: StorageKey.LLM_CONFIG_LIST, label: 'LLM 配置', description: 'API 地址、密钥、模型配置' },
  { key: StorageKey.ASSISTANT_LIST, label: '社区助理', description: '自定义助理配置' },
  { key: StorageKey.MCP_SERVER_LIST, label: 'MCP 服务器', description: 'MCP 服务器配置' },
  { key: StorageKey.SKILL_REGISTRY, label: '技能管理', description: '技能注册表' },
  { key: StorageKey.IMAGE_GENERATOR_CONFIG, label: '生图配置', description: '图片生成器配置' },
  { key: StorageKey.HIGHLIGHT_THEME, label: '代码高亮主题', description: '代码高亮主题设置' },
]

// 冲突策略选项
const conflictStrategyOptions: { value: ConflictStrategy; label: string }[] = [
  { value: 'newer-wins', label: '时间戳优先（选择较新的）' },
  { value: 'local-wins', label: '本地优先（覆盖云端）' },
  { value: 'remote-wins', label: '云端优先（覆盖本地）' },
  { value: 'manual', label: '手动选择' },
]

// UI 状态
const saving = ref(false)
const testing = ref(false)
const syncing = ref(false)
const message = ref('')
const testResult = ref<{ success: boolean; error?: string } | null>(null)
const showConfirmDialog = ref(false)
const confirmAction = ref<'upload' | 'download' | null>(null)

// 格式化最后同步时间
const formattedLastSyncTime = computed(() => {
  if (!config.value.lastSyncTime) return '从未同步'
  const date = new Date(config.value.lastSyncTime)
  return date.toLocaleString('zh-CN')
})

// 同步方向文本
const syncDirectionText = computed(() => {
  if (!config.value.lastSyncDirection) return ''
  return config.value.lastSyncDirection === 'upload' ? '上传' : '下载'
})

onMounted(async () => {
  config.value = syncService.getConfig()
  syncStatus.value = syncService.getStatus()
})

// 保存配置
async function saveConfig() {
  saving.value = true
  message.value = ''
  try {
    await syncService.saveConfig(config.value)
    message.value = '配置已保存'
    setTimeout(() => { message.value = '' }, 2000)
  } catch (error) {
    message.value = '保存失败: ' + (error instanceof Error ? error.message : '未知错误')
  } finally {
    saving.value = false
  }
}

// 测试连接
async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    if (!config.value.serverUrl) {
      testResult.value = { success: false, error: '请输入服务器地址' }
      return
    }
    testResult.value = await syncService.testConnection(config.value.serverUrl, config.value.apiToken)
  } catch (error) {
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : '连接测试失败'
    }
  } finally {
    testing.value = false
  }
}

// 上传数据
async function upload() {
  confirmAction.value = 'upload'
  showConfirmDialog.value = true
}

// 下载数据
async function download() {
  confirmAction.value = 'download'
  showConfirmDialog.value = true
}

// 确认同步操作
async function handleConfirm() {
  showConfirmDialog.value = false
  syncing.value = true
  message.value = ''

  try {
    let result: SyncResult
    if (confirmAction.value === 'upload') {
      result = await syncService.upload()
    } else {
      result = await syncService.download()
    }

    if (result.success) {
      message.value = `同步成功！已${result.direction === 'upload' ? '上传' : '下载'} ${result.syncedKeys.length} 项数据`
    } else {
      message.value = `同步失败: ${result.error}`
    }

    // 刷新配置（更新最后同步时间）
    config.value = syncService.getConfig()
    syncStatus.value = syncService.getStatus()
  } catch (error) {
    message.value = '同步失败: ' + (error instanceof Error ? error.message : '未知错误')
  } finally {
    syncing.value = false
    confirmAction.value = null
    setTimeout(() => { message.value = '' }, 5000)
  }
}

// 取消确认对话框
function cancelConfirm() {
  showConfirmDialog.value = false
  confirmAction.value = null
}

// 切换同步项
function toggleSyncKey(key: string) {
  const index = config.value.syncKeys.indexOf(key)
  if (index === -1) {
    config.value.syncKeys.push(key)
  } else {
    config.value.syncKeys.splice(index, 1)
  }
}
</script>

<template>
  <div class="cloud-sync-panel">
    <h2 class="title">云同步设置</h2>
    <p class="description">将本地配置同步到云端，实现跨设备数据共享</p>

    <!-- 服务器配置 -->
    <div class="config-section">
      <h3>服务器配置</h3>

      <div class="form-group">
        <label>服务器地址</label>
        <input
          v-model="config.serverUrl"
          type="text"
          placeholder="https://sync.example.com"
          class="input"
        />
        <small>同步服务器的 API 地址</small>
      </div>

      <div class="form-group">
        <label>API Token（可选）</label>
        <input
          v-model="config.apiToken"
          type="password"
          placeholder="输入认证令牌"
          class="input"
        />
        <small>用于服务器认证的 Bearer Token</small>
      </div>

      <div class="form-actions-inline">
        <button
          class="btn secondary"
          @click="testConnection"
          :disabled="testing || !config.serverUrl"
        >
          {{ testing ? '测试中...' : '测试连接' }}
        </button>
        <span v-if="testResult" class="test-result" :class="{ success: testResult.success }">
          {{ testResult.success ? '连接成功' : testResult.error }}
        </span>
      </div>
    </div>

    <!-- 同步选项 -->
    <div class="config-section">
      <h3>同步选项</h3>

      <div class="form-group-row">
        <label class="switch-label">
          <span>启用同步</span>
          <span class="switch">
            <input type="checkbox" v-model="config.enabled" />
            <span class="slider"></span>
          </span>
        </label>
      </div>

      <div class="form-group-row">
        <label class="switch-label">
          <span>自动同步</span>
          <span class="switch">
            <input type="checkbox" v-model="config.autoSync" :disabled="!config.enabled" />
            <span class="slider"></span>
          </span>
        </label>
        <small>定期自动上传本地数据到云端</small>
      </div>

      <div class="form-group" v-if="config.autoSync">
        <label>同步间隔（分钟）</label>
        <input
          v-model.number="config.autoSyncInterval"
          type="number"
          min="5"
          max="1440"
          class="input small"
        />
      </div>

      <div class="form-group">
        <label>冲突处理策略</label>
        <select v-model="config.conflictStrategy" class="input">
          <option v-for="opt in conflictStrategyOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- 同步内容 -->
    <div class="config-section">
      <h3>同步内容</h3>
      <div class="sync-keys-list">
        <label v-for="item in availableSyncKeys" :key="item.key" class="checkbox-label">
          <input
            type="checkbox"
            :checked="config.syncKeys.includes(item.key)"
            @change="toggleSyncKey(item.key)"
          />
          <div class="checkbox-content">
            <span class="checkbox-title">{{ item.label }}</span>
            <span class="checkbox-desc">{{ item.description }}</span>
          </div>
        </label>
      </div>
    </div>

    <!-- 手动同步 -->
    <div class="config-section">
      <h3>手动同步</h3>

      <div class="sync-status" v-if="config.lastSyncTime">
        <span class="status-label">最后同步：</span>
        <span class="status-value">{{ formattedLastSyncTime }} ({{ syncDirectionText }})</span>
      </div>

      <div class="sync-actions">
        <button
          class="btn primary"
          @click="upload"
          :disabled="syncing || !config.enabled || !config.serverUrl"
        >
          <CloudIcon :size="16" />
          {{ syncing && confirmAction === 'upload' ? '上传中...' : '上传到云端' }}
        </button>
        <button
          class="btn secondary"
          @click="download"
          :disabled="syncing || !config.enabled || !config.serverUrl"
        >
          <RefreshIcon :size="16" />
          {{ syncing && confirmAction === 'download' ? '下载中...' : '从云端下载' }}
        </button>
      </div>
    </div>

    <!-- 保存按钮 -->
    <div class="form-actions">
      <button type="button" class="btn primary" @click="saveConfig" :disabled="saving">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>

    <!-- 消息提示 -->
    <div v-if="message" class="message" :class="{ success: message.includes('成功') || message.includes('已保存') }">
      {{ message }}
    </div>

    <!-- 确认对话框 -->
    <div v-if="showConfirmDialog" class="confirm-dialog-overlay" @click.self="cancelConfirm">
      <div class="confirm-dialog">
        <div class="confirm-title">
          {{ confirmAction === 'upload' ? '确认上传' : '确认下载' }}
        </div>
        <div class="confirm-message">
          {{ confirmAction === 'upload'
            ? '确定要将本地配置上传到云端吗？这将覆盖云端的现有数据。'
            : '确定要从云端下载配置吗？这将覆盖本地的现有数据。' }}
        </div>
        <div class="confirm-actions">
          <button class="btn secondary" @click="cancelConfirm">取消</button>
          <button class="btn primary" @click="handleConfirm">
            {{ confirmAction === 'upload' ? '上传' : '下载' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cloud-sync-panel {
  width: 100%;
  max-width: 700px;
}

.title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.description {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.config-section {
  margin-bottom: 24px;
  padding: 20px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.config-section h3 {
  margin: 0 0 16px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-group {
  margin-bottom: 16px;
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
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
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
}

.input:focus {
  border-color: var(--color-primary);
}

.input.small {
  width: 120px;
}

select.input {
  cursor: pointer;
}

.form-group-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-border);
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--color-primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.form-actions-inline {
  display: flex;
  align-items: center;
  gap: 16px;
}

.test-result {
  font-size: 14px;
}

.test-result.success {
  color: #22c55e;
}

.test-result:not(.success) {
  color: #dc2626;
}

.sync-keys-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  padding: 12px;
  background: var(--color-bg-primary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: border-color 0.2s;
}

.checkbox-label:hover {
  border-color: var(--color-primary);
}

.checkbox-label input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
  margin-top: 2px;
  width: 16px;
  height: 16px;
  min-width: 16px;
  cursor: pointer;
  border: 1.5px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-primary);
  transition: background 0.15s, border-color 0.15s;
  position: relative;
}

.checkbox-label input[type="checkbox"]:hover {
  border-color: var(--color-primary);
}

.checkbox-label input[type="checkbox"]:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox-label input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: 1.5px solid white;
  border-top: none;
  border-left: none;
  transform: rotate(45deg);
}

.checkbox-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.checkbox-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.checkbox-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.sync-status {
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.status-label {
  margin-right: 8px;
}

.status-value {
  color: var(--color-text-primary);
}

.sync-actions {
  display: flex;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
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

.form-actions {
  margin-top: 24px;
}

.message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  background: #fee;
  color: #c33;
}

.message.success {
  background: #efe;
  color: #3a3;
}

/* 确认对话框 */
.confirm-dialog-overlay {
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

.confirm-dialog {
  background: var(--color-bg-primary);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.confirm-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
