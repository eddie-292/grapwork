<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import type { AppConfig, ConfigList } from '../../types/electron'
import type { LLMProvider } from '../../types/llmProvider'
import { LLM_PROVIDERS, getProviderModels } from '../../types/llmProvider'
import ConfirmDialog from '../ConfirmDialog.vue'
import LLMProviderIcon from '../icons/LLMProviderIcon.vue'
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
  extra_body: '',
  enable_thinking: false
})

const editingIndex = ref(-1)
const showEditForm = ref(false)
const showDeleteConfirm = ref(false)
const configToDeleteIndex = ref(-1)
const saving = ref(false)
const message = ref('')
const showApiKey = ref(false)
const showProviderSelector = ref(false)
const selectedProviderId = ref('custom')

const deleteMessage = ref('')

// 根据选中的提供商获取可用模型列表
const availableModels = computed(() => {
  return getProviderModels(selectedProviderId.value)
})

// 根据 apiUrl 获取提供商 ID
function getProviderIdByApiUrl(apiUrl: string): string {
  const provider = LLM_PROVIDERS.find(p => p.apiUrl === apiUrl)
  return provider?.id || 'custom'
}

// 标志位，防止双向同步时无限循环
let isSyncing = false

// 监听 extra_body 变化，同步到 enable_thinking 开关
watch(() => currentConfig.value.extra_body, (newVal) => {
  if (isSyncing) return
  if (newVal && newVal.trim()) {
    try {
      const parsed = JSON.parse(newVal)
      if (typeof parsed.enable_thinking === 'boolean') {
        isSyncing = true
        currentConfig.value.enable_thinking = parsed.enable_thinking
        setTimeout(() => { isSyncing = false }, 0)
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }
})

// 监听 enable_thinking 开关变化，同步到 extra_body
watch(() => currentConfig.value.enable_thinking, (newVal) => {
  if (isSyncing) return
  isSyncing = true
  try {
    let extraBody: Record<string, any> = {}
    if (currentConfig.value.extra_body && currentConfig.value.extra_body.trim()) {
      extraBody = JSON.parse(currentConfig.value.extra_body)
    }
    extraBody.enable_thinking = newVal
    currentConfig.value.extra_body = JSON.stringify(extraBody, null, 2)
  } catch {
    // 如果解析失败，创建新的 JSON
    currentConfig.value.extra_body = JSON.stringify({ enable_thinking: newVal }, null, 2)
  }
  setTimeout(() => { isSyncing = false }, 0)
})

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
    // 复制配置
    const config = { ...configToEdit }

    // 如果 enable_thinking 未定义，尝试从 extra_body 中提取
    if (config.enable_thinking === undefined && config.extra_body?.trim()) {
      try {
        const parsed = JSON.parse(config.extra_body)
        if (typeof parsed.enable_thinking === 'boolean') {
          config.enable_thinking = parsed.enable_thinking
        } else {
          config.enable_thinking = false
        }
      } catch {
        config.enable_thinking = false
      }
    } else if (config.enable_thinking === undefined) {
      config.enable_thinking = false
    }

    currentConfig.value = config
    editingIndex.value = index
    showEditForm.value = true
    
    // 尝试匹配已有的提供商
    const matchedProvider = LLM_PROVIDERS.find(p => p.apiUrl === config.apiUrl)
    selectedProviderId.value = matchedProvider?.id || 'custom'
  }
}

function confirmDelete(index: number) {
  configToDeleteIndex.value = index
  showDeleteConfirm.value = true
}

async function handleDeleteConfirm() {
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
    await saveAllConfigs()
  }
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
  configToDeleteIndex.value = -1
}

// 选择预定义提供商
function selectProvider(provider: LLMProvider) {
  selectedProviderId.value = provider.id
  currentConfig.value.name = provider.name
  currentConfig.value.apiUrl = provider.apiUrl
  currentConfig.value.model = provider.defaultModel
  showProviderSelector.value = false
}

// 快速添加提供商（只需填写 API Key）
async function quickAddProvider(provider: LLMProvider) {
  currentConfig.value = {
    name: provider.name,
    apiUrl: provider.apiUrl,
    apiKey: '',
    model: provider.defaultModel,
    enabled: false,
    extra_body: '',
    enable_thinking: false
  }
  selectedProviderId.value = provider.id
  editingIndex.value = -1
  showEditForm.value = true
  showProviderSelector.value = false
}

async function saveCurrentConfig() {
  if (editingIndex.value >= 0) {
    configList.value.configs[editingIndex.value] = {
      name: currentConfig.value.name || '',
      apiUrl: currentConfig.value.apiUrl || '',
      apiKey: currentConfig.value.apiKey || '',
      model: currentConfig.value.model || '',
      enabled: currentConfig.value.enabled || false,
      extra_body: currentConfig.value.extra_body || '',
      enable_thinking: currentConfig.value.enable_thinking || false
    }
  } else {
    const newConfig = {
      name: currentConfig.value.name || '',
      apiUrl: currentConfig.value.apiUrl || '',
      apiKey: currentConfig.value.apiKey || '',
      model: currentConfig.value.model || '',
      enabled: currentConfig.value.enabled || false,
      extra_body: currentConfig.value.extra_body || '',
      enable_thinking: currentConfig.value.enable_thinking || false
    }
    configList.value.configs.push(newConfig)
  }
  currentConfig.value = {
    name: '',
    apiUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
    extra_body: '',
    enable_thinking: false
  }
  editingIndex.value = -1
  showEditForm.value = false
  await saveAllConfigs()
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
    extra_body: '',
    enable_thinking: false
  }
  editingIndex.value = -1
  showEditForm.value = false
  selectedProviderId.value = 'custom'
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
        暂无配置，点击下方"添加新配置"或选择预定义提供商
      </div>
      <div
        v-for="(config, index) in configList.configs"
        :key="index"
        class="config-item"
      >
        <div class="config-icon">
          <LLMProviderIcon :provider="getProviderIdByApiUrl(config.apiUrl)" :size="32" />
        </div>
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

    <!-- 快速添加提供商 -->
    <div v-if="!showEditForm" class="quick-add-section">
      <h3 class="section-title">快速添加提供商</h3>
      <p class="section-desc">选择提供商后只需填写 API Key 即可使用</p>
      <div class="provider-grid">
        <button
          v-for="provider in LLM_PROVIDERS.filter(p => p.id !== 'custom')"
          :key="provider.id"
          class="provider-card"
          @click="quickAddProvider(provider)"
          :title="provider.description"
        >
          <LLMProviderIcon :provider="provider.id" :size="24" />
          <span class="provider-name">{{ provider.name }}</span>
        </button>
      </div>
    </div>

    <!-- 编辑表单 -->
    <div class="edit-form" v-if="showEditForm">
      <h3>{{ editingIndex >= 0 ? '编辑配置' : '添加新配置' }}</h3>
      
      <!-- 提供商选择器 -->
      <div class="form-group">
        <label>选择提供商</label>
        <div class="provider-selector">
          <button 
            class="provider-selector-btn" 
            @click="showProviderSelector = !showProviderSelector"
          >
            <LLMProviderIcon :provider="selectedProviderId" :size="20" />
            <span>{{ LLM_PROVIDERS.find(p => p.id === selectedProviderId)?.name || '自定义' }}</span>
            <svg class="chevron" :class="{ open: showProviderSelector }" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div v-if="showProviderSelector" class="provider-dropdown">
            <button
              v-for="provider in LLM_PROVIDERS"
              :key="provider.id"
              class="provider-option"
              :class="{ active: provider.id === selectedProviderId }"
              @click="selectProvider(provider)"
            >
              <LLMProviderIcon :provider="provider.id" :size="18" />
              <span class="option-name">{{ provider.name }}</span>
              <span class="option-desc">{{ provider.description }}</span>
            </button>
          </div>
        </div>
      </div>

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
          <div class="api-key-input-wrapper">
            <input
              v-model="currentConfig.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk-..."
              class="input api-key-input"
            />
            <button
              type="button"
              class="toggle-visibility-btn"
              @click="showApiKey = !showApiKey"
              :title="showApiKey ? '隐藏' : '显示'"
            >
              <svg v-if="showApiKey" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <small>您的 API 密钥将安全存储在本地</small>
        </div>

        <div class="form-group">
          <label>模型</label>
          <div v-if="availableModels.length > 0" class="model-selector">
            <select v-model="currentConfig.model" class="input select">
              <option v-for="model in availableModels" :key="model" :value="model">
                {{ model }}
              </option>
              <option value="__custom__">自定义模型...</option>
            </select>
            <input
              v-if="currentConfig.model === '__custom__' || !availableModels.includes(currentConfig.model)"
              v-model="currentConfig.model"
              type="text"
              placeholder="输入模型名称"
              class="input"
              style="margin-top: 8px;"
            />
          </div>
          <input
            v-else
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

    <div v-if="!showEditForm" class="add-section">
      <button type="button" class="btn primary" @click="showEditForm = true; editingIndex = -1; currentConfig = { name: '', apiUrl: '', apiKey: '', model: 'gpt-4o-mini', enabled: false, extra_body: '', enable_thinking: false }; selectedProviderId = 'custom'">
        自定义配置
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
  font-size: 14px;
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

.config-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
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

/* 快速添加提供商 */
.quick-add-section {
  margin-bottom: 24px;
  padding: 20px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 10px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.provider-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.provider-card:active {
  transform: translateY(0);
}

.provider-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  text-align: center;
}

/* 提供商选择器 */
.provider-selector {
  position: relative;
}

.provider-selector-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s;
}

.provider-selector-btn:hover {
  border-color: var(--color-primary);
}

.chevron {
  margin-left: auto;
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.provider-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.provider-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.provider-option:hover {
  background: var(--color-bg-hover);
}

.provider-option.active {
  background: var(--color-primary-light);
}

.option-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.option-desc {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-secondary);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 编辑表单 */
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
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.input:focus {
  border-color: var(--color-border-hover);
}

.select {
  cursor: pointer;
}

.api-key-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-key-input {
  flex: 1;
}

.toggle-visibility-btn {
  flex-shrink: 0;
  padding: 8px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toggle-visibility-btn:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.textarea {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  font-family: 'SF Mono', Monaco, 'Andale Mono', "JetBrains Mono", Menlo, Consolas, monospace;
  resize: vertical;
  min-height: 100px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.textarea:focus {
  border-color: var(--color-border-hover);
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

/* 开关样式 */
.form-group-row {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.form-group-row > label:first-child {
  flex-shrink: 0;
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
  background-color: var(--color-border, #ccc);
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
  background-color: var(--color-primary, #4a90d9);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.form-group-row small {
  flex: 1;
}
</style>