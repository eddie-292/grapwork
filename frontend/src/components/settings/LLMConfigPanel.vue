<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { AppConfig, ConfigList } from '../../types/electron'
import ConfirmDialog from '../ConfirmDialog.vue'
import { storage } from '../../services/StorageService'

const configList = ref<ConfigList>({
  configs: [],
  activeIndex: -1
})

const currentConfig = ref<AppConfig>({
  name: 'OpenAI',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  enabled: false,
  extra_body: ''
})

const editingIndex = ref(-1)
const showEditForm = ref(false)
const showDeleteConfirm = ref(false)
const configToDeleteIndex = ref(-1)
const saving = ref(false)
const message = ref('')

const deleteMessage = ref('')

// Emits
const emit = defineEmits<{
  save: []
}>()

onMounted(async () => {
  const config = await storage.getConfigList()
  if (config) {
    configList.value = config
  }
  if (configList.value.configs.length === 0) {
    showEditForm.value = true
  }
})

watch(configToDeleteIndex, (index) => {
  const config = configList.value.configs[index]
  const name = config?.name || config?.model || '此配置'
  deleteMessage.value = `确定要删除 "${name}" 这个 LLM 接口配置吗？此操作无法撤销。`
})

function editConfig(index: number) {
  const configToEdit = configList.value.configs[index]
  if (configToEdit) {
    currentConfig.value = { ...configToEdit }
    editingIndex.value = index
    showEditForm.value = true
  }
}

function confirmDelete(index: number) {
  configToDeleteIndex.value = index
  showDeleteConfirm.value = true
}

function handleDeleteConfirm() {
  if (configToDeleteIndex.value >= 0) {
    const index = configToDeleteIndex.value
    configList.value.configs.splice(index, 1)
    if (configList.value.activeIndex === index) {
      configList.value.activeIndex = -1
    } else if (configList.value.activeIndex > index) {
      configList.value.activeIndex--
    }
    showDeleteConfirm.value = false
    configToDeleteIndex.value = -1
    emit('save')
  }
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
  configToDeleteIndex.value = -1
}

function saveCurrentConfig() {
  if (editingIndex.value >= 0) {
    configList.value.configs[editingIndex.value] = {
      name: currentConfig.value.name || '',
      apiUrl: currentConfig.value.apiUrl || '',
      apiKey: currentConfig.value.apiKey || '',
      model: currentConfig.value.model || '',
      enabled: currentConfig.value.enabled || false,
      extra_body: currentConfig.value.extra_body || ''
    }
  } else {
    const newConfig = {
      name: currentConfig.value.name || '',
      apiUrl: currentConfig.value.apiUrl || '',
      apiKey: currentConfig.value.apiKey || '',
      model: currentConfig.value.model || '',
      enabled: currentConfig.value.enabled || false,
      extra_body: currentConfig.value.extra_body || ''
    }
    configList.value.configs.push(newConfig)
  }
  currentConfig.value = {
    name: '',
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
    extra_body: ''
  }
  editingIndex.value = -1
  showEditForm.value = false
  emit('save')
}

async function saveAllConfigs() {
  saving.value = true
  message.value = ''
  try {
    const configSuccess = await storage.saveConfigList(configList.value)
    if (!configSuccess) {
      throw new Error('配置保存失败，请重试')
    }
    message.value = '设置已保存'
    setTimeout(() => {
      message.value = ''
    }, 2000)
  } catch (error) {
    message.value = '保存失败: ' + (error instanceof Error ? error.message : '未知错误')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  currentConfig.value = {
    name: '',
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
    extra_body: ''
  }
  editingIndex.value = -1
  showEditForm.value = false
}

// Expose save function for parent
defineExpose({
  saveAllConfigs
})
</script>

<template>
  <div class="llm-config-panel">
    <h2 class="title">LLM 接口配置</h2>

    <!-- 配置列表 -->
    <div class="config-list">
      <div v-if="configList.configs.length === 0" class="empty-state">
        暂无配置，点击"添加新配置"创建一个
      </div>
      <div
        v-for="(config, index) in configList.configs"
        :key="index"
        class="config-item"
      >
        <div class="config-info">
          <div class="config-header">
            <h3>{{ config.name || config.model }}</h3>
          </div>
          <div class="config-details">
            <div>模型：{{ config.model }}</div>
            <div>地址：{{ config.apiUrl }}</div>
          </div>
        </div>
        <div class="config-actions">
          <button class="btn-icon" @click="editConfig(index)" title="编辑">编辑</button>
          <button class="btn-icon" @click="confirmDelete(index)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <!-- 编辑表单 -->
    <div class="edit-form" v-if="showEditForm">
      <h3>{{ editingIndex >= 0 ? '编辑配置' : '添加新配置' }}</h3>
      <div class="form">
        <div class="form-group">
          <label>配置名称</label>
          <input
            v-model="currentConfig.name"
            type="text"
            placeholder="例如：OpenAI、Claude、本地模型"
            class="input"
          />
        </div>

        <div class="form-group">
          <label>API 地址</label>
          <input
            v-model="currentConfig.apiUrl"
            type="text"
            placeholder="https://api.openai.com/v1"
            class="input"
          />
          <small>支持任何 OpenAI 标准的 API 端点</small>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input
            v-model="currentConfig.apiKey"
            type="password"
            placeholder="sk-..."
            class="input"
          />
          <small>您的 API 密钥将安全存储在本地</small>
        </div>

        <div class="form-group">
          <label>模型</label>
          <input
            v-model="currentConfig.model"
            type="text"
            placeholder="gpt-4o-mini"
            class="input"
          />
          <small>例如: gpt-4o, gpt-4o-mini, claude-3-5-sonnet 等</small>
        </div>

        <div class="form-group">
          <label>额外请求参数 (JSON 格式)</label>
          <textarea
            v-model="currentConfig.extra_body"
            type="text"
            placeholder='{}'
            class="textarea"
            rows="4"
          />
        </div>

        <div class="form-actions">
          <button type="button" class="btn secondary" @click="resetForm">
            取消
          </button>
          <button type="button" class="btn primary" @click="saveCurrentConfig">
            {{ editingIndex >= 0 ? '更新' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="add-section">
      <button type="button" class="btn primary" @click="showEditForm = true; editingIndex = -1; currentConfig = { name: '', apiUrl: '', apiKey: '', model: 'gpt-4o-mini', enabled: false, extra_body: '' }">
        添加新配置
      </button>
    </div>

    <div v-if="message" class="message" :class="{ success: message.includes('成功') || message.includes('已保存') }">
      {{ message }}
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
  </div>
</template>

<style scoped>
.llm-config-panel {
  width: 100%;
}

.title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.config-list {
  margin-bottom: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  margin-bottom: 20px;
}

.config-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 12px;
  background: var(--color-bg-primary);
  transition: all 0.2s;
  gap: 20px;
}

.config-item:hover {
  border-color: var(--color-primary);
}

.config-info {
  flex: 1;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.config-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text-primary);
}

.config-details {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.config-details div {
  margin-bottom: 4px;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.edit-form {
  background: var(--color-bg-tertiary);
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.edit-form h3 {
  margin: 0 0 16px 0;
  color: var(--color-text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  font-size: 14px;
}

.input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--color-primary);
}

.textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  resize: vertical;
}

.textarea:focus {
  border-color: var(--color-primary);
}

.form-group small {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.add-section {
  text-align: center;
  margin-bottom: 20px;
}

.message {
  padding: 12px;
  border-radius: 8px;
  background: #fee;
  color: #c33;
  font-size: 14px;
}

.message.success {
  background: #efe;
  color: #3a3;
}
</style>
