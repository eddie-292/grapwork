<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import LLMConfigPanel from './settings/LLMConfigPanel.vue'
import CodeHighlightThemePanel from './settings/CodeHighlightThemePanel.vue'
import AssistantView from './AssistantView.vue'
import GlobalMemoryView from './GlobalMemoryView.vue'
import MCPView from './MCPView.vue'
import ChangelogView from './ChangelogView.vue'
import SkillsPanel from './settings/SkillsPanel.vue'
import { storage } from '../services/StorageService'
import type { EnvironmentCheckResult } from '../types/electron'
import PlugIcon from './icons/PlugIcon.vue'
import PaletteIcon from './icons/PaletteIcon.vue'
import RobotIcon from './icons/RobotIcon.vue'
import BrainIcon from './icons/BrainIcon.vue'
import ZapIcon from './icons/ZapIcon.vue'
import BookOpenIcon from './icons/BookOpenIcon.vue'
import SearchIcon from './icons/SearchIcon.vue'
import ScrollIcon from './icons/ScrollIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import CheckIcon from './icons/CheckIcon.vue'
import XIcon from './icons/XIcon.vue'
import LightbulbIcon from './icons/LightbulbIcon.vue'

const router = useRouter()
const route = useRoute()

type SettingsTab = 'llm' | 'theme' | 'assistants' | 'memory' | 'mcp' | 'skills' | 'environment' | 'changelog'

// 从 query 参数获取当前标签，默认为 llm
const activeTab = ref<SettingsTab>((route.query.tab as SettingsTab) || 'llm')

// 环境检查相关状态
const envChecking = ref(false)
const envResults = ref<EnvironmentCheckResult[]>([])
const envChecked = ref(false)

// 监听路由变化更新标签
watch(() => route.query.tab, (newTab) => {
  if (newTab) {
    activeTab.value = newTab as SettingsTab
  }
})

// 导航项配置
const navItems = computed(() => [
  { id: 'llm' as SettingsTab, label: 'LLM 接口配置', icon: 'plug' },
  { id: 'theme' as SettingsTab, label: '代码高亮主题', icon: 'palette' },
  { id: 'assistants' as SettingsTab, label: '社区助理', icon: 'robot' },
  { id: 'memory' as SettingsTab, label: '全局记忆', icon: 'brain' },
  { id: 'mcp' as SettingsTab, label: 'MCP 服务器', icon: 'zap' },
  { id: 'skills' as SettingsTab, label: '技能管理', icon: 'book-open' },
  { id: 'environment' as SettingsTab, label: '环境检测', icon: 'search' },
  { id: 'changelog' as SettingsTab, label: '更新日志', icon: 'scroll' },
])

function switchTab(tab: SettingsTab) {
  activeTab.value = tab
  // 更新路由 query 参数但不刷新页面
  router.replace({ query: { tab } })
}

function goBack() {
  router.push('/')
}

async function clearChatHistory() {
  if (confirm('确定要清空所有对话历史吗？此操作不可恢复。')) {
    await storage.delete('chat-history')
    alert('对话历史已清空')
  }
}

// 环境检查相关函数
async function runEnvironmentCheck() {
  envChecking.value = true
  envResults.value = []

  if (!window.electronAPI?.checkEnvironment) {
    envResults.value = [
      {
        name: 'electron',
        displayName: 'Electron 环境',
        status: 'error',
        message: '未在 Electron 环境中运行',
        details: '请使用 Electron 应用启动程序'
      }
    ]
    envChecking.value = false
    envChecked.value = true
    return
  }

  try {
    const results = await window.electronAPI.checkEnvironment()
    envResults.value = results
  } catch (error) {
    envResults.value = [
      {
        name: 'unknown',
        displayName: '环境检查',
        status: 'error',
        message: '环境检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      }
    ]
  } finally {
    envChecking.value = false
    envChecked.value = true
  }
}

function getStatusClass(status: string): string {
  return `status-${status}`
}

const hasEnvErrors = computed(() => envResults.value.some(r => r.status === 'error'))
const hasEnvWarnings = computed(() => envResults.value.some(r => r.status === 'warning'))
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
      <!-- 左侧导航 -->
      <aside class="settings-sidebar">
        <nav class="sidebar-nav">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: activeTab === item.id }"
            @click="switchTab(item.id)"
          >
            <span class="nav-icon">
              <PlugIcon v-if="item.icon === 'plug'" :size="18" />
              <PaletteIcon v-else-if="item.icon === 'palette'" :size="18" />
              <RobotIcon v-else-if="item.icon === 'robot'" :size="18" />
              <BrainIcon v-else-if="item.icon === 'brain'" :size="18" />
              <ZapIcon v-else-if="item.icon === 'zap'" :size="18" />
              <BookOpenIcon v-else-if="item.icon === 'book-open'" :size="18" />
              <SearchIcon v-else-if="item.icon === 'search'" :size="18" />
              <ScrollIcon v-else-if="item.icon === 'scroll'" :size="18" />
            </span>
            <span class="nav-label">{{ item.label }}</span>
          </button>

          <div class="nav-divider"></div>

          <button
            class="nav-item danger"
            @click="clearChatHistory"
          >
            <span class="nav-icon"><TrashIcon :size="18" /></span>
            <span class="nav-label">清空对话</span>
          </button>
        </nav>
      </aside>

      <!-- 右侧内容 -->
      <main class="settings-main">
        <!-- LLM 接口配置 -->
        <LLMConfigPanel v-if="activeTab === 'llm'" />

        <!-- 代码高亮主题 -->
        <CodeHighlightThemePanel v-else-if="activeTab === 'theme'" />

        <!-- 社区助理 -->
        <div v-else-if="activeTab === 'assistants'" class="panel-wrapper">
          <AssistantView />
        </div>

        <!-- 全局记忆 -->
        <div v-else-if="activeTab === 'memory'" class="panel-wrapper">
          <GlobalMemoryView />
        </div>

        <!-- MCP 服务器 -->
        <div v-else-if="activeTab === 'mcp'" class="panel-wrapper">
          <MCPView />
        </div>

        <!-- 技能管理 -->
        <SkillsPanel v-else-if="activeTab === 'skills'" />

        <!-- 环境检测 -->
        <div v-else-if="activeTab === 'environment'" class="env-panel">
          <div class="env-panel-header">
            <h2>运行环境检测</h2>
            <p>检测 Agent 运行所需的环境依赖</p>
          </div>

          <button
            class="check-btn"
            :disabled="envChecking"
            @click="runEnvironmentCheck"
          >
            {{ envChecking ? '检测中...' : '开始检测' }}
          </button>

          <!-- 检测结果 -->
          <div v-if="envChecked" class="env-results">
            <!-- 状态摘要 -->
            <div class="status-summary" :class="{
              'all-success': !hasEnvErrors && !hasEnvWarnings,
              'has-warnings': hasEnvWarnings && !hasEnvErrors,
              'has-errors': hasEnvErrors
            }">
              <div class="summary-icon">
                <XIcon v-if="hasEnvErrors" :size="24" />
                <span v-else-if="hasEnvWarnings">!</span>
                <CheckIcon v-else :size="24" />
              </div>
              <div class="summary-text">
                <h3 v-if="hasEnvErrors">环境检测未通过</h3>
                <h3 v-else-if="hasEnvWarnings">环境检测通过（有警告）</h3>
                <h3 v-else>环境检测通过</h3>
                <p v-if="hasEnvErrors">部分关键环境不满足，可能影响程序运行</p>
                <p v-else-if="hasEnvWarnings">部分可选功能可能无法使用</p>
                <p v-else>所有环境检测均已通过</p>
              </div>
            </div>

            <!-- 检测项目列表 -->
            <div class="check-list">
              <div
                v-for="result in envResults"
                :key="result.name"
                class="check-item"
                :class="getStatusClass(result.status)"
              >
                <div class="check-icon">
                  <CheckIcon v-if="result.status === 'success'" :size="14" />
                  <span v-else-if="result.status === 'warning'">!</span>
                  <XIcon v-else-if="result.status === 'error'" :size="14" />
                  <span v-else>?</span>
                </div>
                <div class="check-content">
                  <div class="check-title">{{ result.displayName }}</div>
                  <div class="check-message">{{ result.message }}</div>
                  <div v-if="result.details" class="check-details">{{ result.details }}</div>
                  <div v-if="result.fixSuggestion" class="fix-suggestion">
                    <div class="fix-label"><LightbulbIcon :size="14" /> 修复建议：</div>
                    <pre class="fix-content">{{ result.fixSuggestion }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 未检测时的提示 -->
          <div v-else class="env-placeholder">
            <div class="placeholder-icon"><SearchIcon :size="48" /></div>
            <p>点击上方按钮开始检测运行环境</p>
          </div>
        </div>

        <!-- 更新日志 -->
        <ChangelogView v-else-if="activeTab === 'changelog'" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  justify-content: space-between;
}

.settings-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.settings-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 左侧导航 */
.settings-sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  padding: 24px 0;
  background: var(--color-bg-secondary);
  overflow-y: auto;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary);
  border-radius: 8px;
  width: 100%;
}

.nav-item:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.nav-item.active {
  background: var(--color-primary);
  color: white;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
}

.nav-divider {
  height: 1px;
  background: var(--color-border);
  margin: 12px 8px;
}

.nav-item.danger {
  color: #dc2626;
}

.nav-item.danger:hover {
  background: #fee2e2;
}

/* 右侧内容 */
.settings-main {
  flex: 1;
  padding: 20px;
  overflow: auto;
  height: calc(100vh - 71px);
}

.panel-wrapper {
  
}

/* 只隐藏子组件 header 中的标题和返回按钮，保留添加按钮 */
.panel-wrapper :deep(.assistant-header h1),
.panel-wrapper :deep(.assistant-header .back-btn),
.panel-wrapper :deep(.global-memory-view > .header h1),
.panel-wrapper :deep(.global-memory-view > .header .back-btn),
.panel-wrapper :deep(.mcp-header h1),
.panel-wrapper :deep(.mcp-header .back-btn) {
  display: none;
}

/* 调整子组件 header 布局，只显示添加按钮 */
.panel-wrapper :deep(.assistant-header),
.panel-wrapper :deep(.global-memory-view > .header),
.panel-wrapper :deep(.mcp-header) {
  justify-content: flex-end;
  padding: 12px 0;
  border-bottom: none;
}

/* 调整子组件内容的 padding */
.panel-wrapper :deep(.assistant-content),
.panel-wrapper :deep(.global-memory-view > .content),
.panel-wrapper :deep(.mcp-content) {
  padding: 0;
}

/* 环境检测面板样式 */
.env-panel {
  max-width: 600px;
}

.env-panel-header {
  margin-bottom: 24px;
}

.env-panel-header h2 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.env-panel-header p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.check-btn {
  padding: 12px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 24px;
}

.check-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.check-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.env-placeholder {
  text-align: center;
  padding: 48px 24px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.env-placeholder p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.env-results {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 状态摘要 */
.status-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
}

.status-summary.all-success {
  background: rgba(34, 197, 94, 0.1);
}

.status-summary.has-warnings {
  background: rgba(245, 158, 11, 0.1);
}

.status-summary.has-errors {
  background: rgba(239, 68, 68, 0.1);
}

.summary-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: bold;
}

.all-success .summary-icon {
  background: var(--color-primary);
  color: white;
}

.has-warnings .summary-icon {
  background: #f59e0b;
  color: white;
}

.has-errors .summary-icon {
  background: #ef4444;
  color: white;
}

.summary-text h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.summary-text p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* 检查列表 */
.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.check-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
}

.check-item.status-success .check-icon {
  background: var(--color-primary);
  color: white;
}

.check-item.status-warning .check-icon {
  background: #f59e0b;
  color: white;
}

.check-item.status-error .check-icon {
  background: #ef4444;
  color: white;
}

.check-content {
  flex: 1;
  min-width: 0;
}

.check-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.check-message {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.check-details {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
  word-break: break-all;
}

/* 修复建议 */
.fix-suggestion {
  margin-top: 8px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
}

.fix-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  margin-bottom: 4px;
}

.fix-content {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.5;
}
</style>
