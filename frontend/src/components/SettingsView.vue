<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import type { AppConfig, ConfigList } from '../types/electron'

const router = useRouter()

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: function (str: string, lang?: string): string {
    try {
      return hljs.highlight(str, { language: lang || 'javascript' }).value
    } catch {
      return str
    }
  },
})

const selectedHighlightTheme = ref('atom-one-dark')

interface HighlightTheme {
  value: string
  label: string
}

// 预览代码高亮
const previewCode = `\`\`\`javascript
const hello = "Hello, World!"
console.log(hello);
\`\`\``

// 添加一个版本号，强制在主题变化时重新渲染
const renderVersion = ref(0)

// 当主题变化时，增加版本号，强制重新渲染
watch(selectedHighlightTheme, async (newTheme) => {
  await loadHighlightTheme(newTheme)
  // 等待 CSS 加载完成后再更新版本号
  await new Promise(resolve => setTimeout(resolve, 150))
  renderVersion.value++
})

// 使用 renderVersion 作为依赖，确保主题变化时重新渲染
const highlightedPreview = computed(() => {
  // 使用 renderVersion 作为依赖，确保主题变化时重新渲染
  renderVersion.value
  return md.render(previewCode)
})

const highlightThemes: HighlightTheme[] = [
  { value: 'atom-one-dark', label: 'Atom One Dark' },
  { value: 'atom-one-light', label: 'Atom One Light' },
  { value: 'github', label: 'GitHub' },
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'nord', label: 'Nord' },
  { value: 'vs2015', label: 'VS 2015' },
  { value: 'dracula', label: 'Dracula' }
]

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

const saving = ref(false)
const message = ref('')
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

onMounted(async () => {
  if (window.electronAPI) {
    configList.value = await window.electronAPI.getConfig()
    // 如果没有配置，自动显示添加表单
    if (configList.value.configs.length === 0) {
      showEditForm.value = true
    }
    return
  }

  if (!window.electronAPI || isElectronEnv) {
    const saved = localStorage.getItem('llm-config-list')
    if (saved) {
      try {
        configList.value = JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse config list:', e)
      }
    }
    // 如果没有配置，自动显示添加表单
    if (configList.value.configs.length === 0) {
      showEditForm.value = true
    }
  }

  // 加载保存的代码高亮主题
  const savedTheme = localStorage.getItem('highlight-theme')
  if (savedTheme) {
    selectedHighlightTheme.value = savedTheme
  }
})

function editConfig(index: number) {
  const configToEdit = configList.value.configs[index]
  if (configToEdit) {
    currentConfig.value = { ...configToEdit }
    editingIndex.value = index
    showEditForm.value = true
  }
}

function deleteConfig(index: number) {
  configList.value.configs.splice(index, 1)
  if (configList.value.activeIndex === index) {
    configList.value.activeIndex = -1
  } else if (configList.value.activeIndex > index) {
    configList.value.activeIndex--
  }
}

function toggleConfig(index: number) {
  const item = configList.value.configs[index]
  if (!item) return

  // 切换启用状态
  item.enabled = !item.enabled

  if (item.enabled) {
    // 禁用其他配置
    configList.value.configs.forEach((cfg, idx) => {
      if (idx !== index) cfg.enabled = false
    })
    configList.value.activeIndex = index
  } else if (configList.value.activeIndex === index) {
    configList.value.activeIndex = -1
  }
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
}

async function saveAllConfigs() {
  saving.value = true
  message.value = ''

  try {
    if (window.electronAPI) {
      // 将响应式对象转换为纯对象，避免克隆错误
      const plainConfig: ConfigList = {
        configs: configList.value.configs.map(cfg => ({
          name: cfg.name,
          apiUrl: cfg.apiUrl,
          apiKey: cfg.apiKey,
          model: cfg.model,
          enabled: cfg.enabled,
          extra_body: cfg.extra_body || ''
        })),
        activeIndex: configList.value.activeIndex
      }

      const success = await window.electronAPI.saveConfig(plainConfig)
      if (!success) {
        throw new Error('保存失败，请重试')
      }
    } else if (isElectronEnv || !window.electronAPI) {
      localStorage.setItem('llm-config-list', JSON.stringify(configList.value))
    }

    // 保存代码高亮主题
    localStorage.setItem('highlight-theme', selectedHighlightTheme.value)
    await loadHighlightTheme(selectedHighlightTheme.value)

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

// 加载代码高亮主题
function loadHighlightTheme(theme: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // 移除旧的主题样式
      const oldLink = document.getElementById('highlight-theme')
      if (oldLink) {
        oldLink.remove()
      }

      // 使用本地文件加载新主题样式
      const link = document.createElement('link')
      link.id = 'highlight-theme'
      link.rel = 'stylesheet'
      link.href = `/${theme}.css`

      link.onload = () => {
        // CSS 加载完成后稍作延迟确保样式应用
        setTimeout(() => resolve(), 50)
      }

      link.onerror = (e) => {
        console.error('Failed to load highlight theme:', e)
        reject(e)
      }

      document.head.appendChild(link)
    } catch (error) {
      console.error('Failed to load highlight theme:', error)
      reject(error)
    }
  })
}

function goBack() {
  router.push('/')
}

function clearChatHistory() {
  if (confirm('确定要清空所有对话历史吗？此操作不可恢复。')) {
    localStorage.removeItem('chat-history')
    message.value = '对话历史已清空'
    setTimeout(() => {
      message.value = ''
    }, 2000)
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <button class="back-btn" @click="goBack">
      返回
      </button>
      <h1>设置</h1>
    </header>

    <div class="settings-content">
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
          :class="{ active: configList.activeIndex === index }"
        >
          <div class="config-info">
            <div class="config-header">
              <h3>{{ config.name || config.model }}</h3>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  :checked="config.enabled"
                  @change="toggleConfig(index)"
                />
                <span class="toggle-switch"></span>
              </label>
            </div>
            <div class="config-details">
              <div>模型：{{ config.model }}</div>
              <div>地址：{{ config.apiUrl }}</div>
            </div>
          </div>
          <div class="config-actions">
            <button class="btn-icon" @click="editConfig(index)" title="编辑">编辑</button>
            <button class="btn-icon" @click="deleteConfig(index)" title="删除">删除</button>
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
            <button type="button" class="btn secondary" @click="showEditForm = false; editingIndex = -1; currentConfig = { name: '', apiUrl: '', apiKey: '', model: 'gpt-4o-mini', enabled: false, extra_body: '' }">
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

      <!-- 代码高亮主题 -->
      <div class="highlight-theme-section">
        <h3 class="section-title">代码高亮主题</h3>
        <div class="theme-selector">
          <select v-model="selectedHighlightTheme" class="theme-select">
            <option v-for="theme in highlightThemes" :key="theme.value" :value="theme.value">
              {{ theme.label }}
            </option>
          </select>
          <div class="theme-preview">
          <div :key="renderVersion" v-html="highlightedPreview"></div>
        </div>
        </div>
      </div>

      <div v-if="message" class="message" :class="{ success: message.includes('成功') || message.includes('已保存') }">
        {{ message }}
      </div>

      <div class="global-actions">
        <button type="button" class="btn danger" @click="clearChatHistory">
          清空对话
        </button>
        <button type="button" class="btn primary" @click="saveAllConfigs" :disabled="saving">
          {{ saving ? '保存中...' : '保存所有配置' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
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
  background: #f0f0f0;
}

.settings-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.settings-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
  width: 100%;
}

.title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
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
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #10a37f;
}

.textarea {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  resize: vertical;
}

.textarea:focus {
  border-color: #10a37f;
}

.form-group small {
  color: #666;
  font-size: 12px;
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

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
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
  background: #f5f5f5;
  color: #111827;
  border: 1px solid #e5e7eb;
}

.btn.secondary:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn.primary {
  background: #10a37f;
  color: white;
  border: 1px solid #10a37f;
}

.btn.primary:hover:not(:disabled) {
  background: #0f8f6d;
}

.btn.danger {
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.btn.danger:hover {
  background: #fecaca;
}

.config-list {
  margin-bottom: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 20px;
}

.config-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #ffffff;
  transition: all 0.2s;
  gap: 20px;
}

.config-item:hover {
  border-color: #10a37f;
}

.config-item.active {
  border-color: #10a37f;
  background: #f0fdf4;
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
  color: #0f172a;
}

.toggle-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  gap: 8px;
}

.toggle-label input {
  display: none;
}

.toggle-switch {
  width: 44px;
  height: 24px;
  background: #e5e7eb;
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 10px;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.toggle-label input:checked + .toggle-switch {
  background: #10a37f;
}

.toggle-label input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

.config-details {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.config-details div {
  margin-bottom: 4px;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
 min-width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f5f5f5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f0f0f0;
  border-color: #d1d5db;
}

.edit-form {
  background: #f9fafb;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.edit-form h3 {
  margin: 0 0 16px 0;
  color: #0f172a;
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

.global-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 24px;
}

.highlight-theme-section {
  background: #f9fafb;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.section-title {
  margin: 0 0 16px 0;
  color: #0f172a;
}

.theme-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-select {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #ffffff;
  transition: border-color 0.2s;
}

.theme-select:focus {
  border-color: #10a37f;
}

.theme-preview {
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.theme-preview pre {
  margin: 0;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  background: transparent !important;
  padding: 0 !important;
}

/* 让 highlight.js 的主题样式能穿透到预览区域 */
.theme-preview :deep(.hljs) {
  /* 让 highlight.js 的样式生效 */
}

.theme-preview :deep(pre) {
  /* 让 highlight.js 的样式生效 */
}
</style>
