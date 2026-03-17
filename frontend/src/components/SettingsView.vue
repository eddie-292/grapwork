<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import LLMConfigPanel from './settings/LLMConfigPanel.vue'
import CodeHighlightThemePanel from './settings/CodeHighlightThemePanel.vue'
import UIThemePanel from './settings/UIThemePanel.vue'
import AssistantView from './AssistantView.vue'
import MCPView from './MCPView.vue'
import ChangelogView from './ChangelogView.vue'
import SkillsPanel from './settings/SkillsPanel.vue'
import EnvironmentCheckPanel from './settings/EnvironmentCheckPanel.vue'
import { storage } from '../services/StorageService'
import PlugIcon from './icons/PlugIcon.vue'
import PaletteIcon from './icons/PaletteIcon.vue'
import RobotIcon from './icons/RobotIcon.vue'
import ZapIcon from './icons/ZapIcon.vue'
import BookOpenIcon from './icons/BookOpenIcon.vue'
import SearchIcon from './icons/SearchIcon.vue'
import ScrollIcon from './icons/ScrollIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'
import UsersIcon from './icons/UsersIcon.vue'
import CloudSyncPanel from './settings/CloudSyncPanel.vue'
import CloudIcon from './icons/CloudIcon.vue'
import ClockIcon from './icons/ClockIcon.vue'
import LoopView from './LoopView.vue'
import PaintbrushIcon from './icons/PaintbrushIcon.vue'
import InfoIcon from './icons/InfoIcon.vue'
import GitHubIcon from './icons/GitHubIcon.vue'
import LogoutIcon from './icons/LogoutIcon.vue'
import changelogMd from '../upload_log/更新日志.md?raw'

const router = useRouter()
const route = useRoute()

type SettingsTab = 'llm' | 'ui-theme' | 'theme' | 'assistants' | 'mcp' | 'skills' | 'teams' | 'environment' | 'changelog' | 'sync' | 'loop' | 'about'

// 从更新日志中解析最新版本号
function parseLatestVersion(md: string): string {
  const match = md.match(/## v(\d+\.\d+\.\d+)/)
  return match ? match[1]! : '0.0.0'
}

const appVersion = parseLatestVersion(changelogMd)

// 从 query 参数获取当前标签，默认为 llm
const activeTab = ref<SettingsTab>((route.query.tab as SettingsTab) || 'llm')

// 监听路由变化更新标签
watch(() => route.query.tab, (newTab) => {
  if (newTab) {
    activeTab.value = newTab as SettingsTab
  }
})

// 导航项配置
const navItems = computed(() => [
  { id: 'llm' as SettingsTab, label: 'LLM 接口配置', icon: 'plug' },
  { id: 'ui-theme' as SettingsTab, label: '界面主题', icon: 'paintbrush' },
  { id: 'theme' as SettingsTab, label: '代码高亮主题', icon: 'palette' },
  { id: 'assistants' as SettingsTab, label: '社区助理', icon: 'robot' },
  { id: 'mcp' as SettingsTab, label: 'MCP 服务器', icon: 'zap' },
  { id: 'skills' as SettingsTab, label: '技能管理', icon: 'book-open' },
  { id: 'loop' as SettingsTab, label: '定时任务', icon: 'clock' },
  { id: 'environment' as SettingsTab, label: '环境检测', icon: 'search' },
  { id: 'changelog' as SettingsTab, label: '更新日志', icon: 'scroll' },
  { id: 'sync' as SettingsTab, label: '云同步', icon: 'cloud' },
  { id: 'about' as SettingsTab, label: '关于', icon: 'info' },
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

async function logout() {
  if (confirm('确定要退出登录吗？')) {
    await storage.clearLoginInfo()
    router.push('/login')
  }
}

function openGitHub() {
  window.electronAPI?.openExternal?.('https://github.com/eddie-292/grapwork')
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
              <PaintbrushIcon v-else-if="item.icon === 'paintbrush'" :size="18" />
              <PaletteIcon v-else-if="item.icon === 'palette'" :size="18" />
              <RobotIcon v-else-if="item.icon === 'robot'" :size="18" />
              <ZapIcon v-else-if="item.icon === 'zap'" :size="18" />
              <BookOpenIcon v-else-if="item.icon === 'book-open'" :size="18" />
              <UsersIcon v-else-if="item.icon === 'users'" :size="18" />
              <SearchIcon v-else-if="item.icon === 'search'" :size="18" />
              <ScrollIcon v-else-if="item.icon === 'scroll'" :size="18" />
              <CloudIcon v-else-if="item.icon === 'cloud'" :size="18" />
              <ClockIcon v-else-if="item.icon === 'clock'" :size="18" />
              <InfoIcon v-else-if="item.icon === 'info'" :size="18" />
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

          <button
            class="nav-item danger"
            @click="logout"
          >
            <span class="nav-icon"><LogoutIcon :size="18" /></span>
            <span class="nav-label">退出登录</span>
          </button>
        </nav>
      </aside>

      <!-- 右侧内容 -->
      <main class="settings-main">
        <Transition name="fade" mode="out-in">
          <div :key="activeTab" class="tab-content">
            <!-- LLM 接口配置 -->
            <LLMConfigPanel v-if="activeTab === 'llm'" />

            <!-- 界面主题 -->
            <UIThemePanel v-else-if="activeTab === 'ui-theme'" />

            <!-- 代码高亮主题 -->
            <CodeHighlightThemePanel v-else-if="activeTab === 'theme'" />

            <!-- 社区助理 -->
            <div v-else-if="activeTab === 'assistants'" class="panel-wrapper">
              <AssistantView />
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
              <EnvironmentCheckPanel :auto-run="false" />
            </div>

            <!-- 更新日志 -->
            <ChangelogView v-else-if="activeTab === 'changelog'" />

            <!-- 定时任务 -->
            <LoopView v-else-if="activeTab === 'loop'" />

            <!-- 云同步 -->
            <CloudSyncPanel v-else-if="activeTab === 'sync'" />

            <!-- 关于 -->
            <div v-else-if="activeTab === 'about'" class="about-panel">
              <div class="about-header">
                <div class="about-logo">
                  <svg width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="45" fill="var(--color-primary)" />
                    <text x="50" y="62" text-anchor="middle" fill="white" font-size="36" font-weight="bold">G</text>
                  </svg>
                </div>
                <h2>GrapWork</h2>
                <p class="version">v{{ appVersion }}</p>
              </div>

              <div class="about-content">
                <div class="about-item">
                  <div class="about-item-label">项目地址</div>
                  <div class="about-item-value">
                    <a href="#" @click.prevent="openGitHub" class="github-link">
                      <GitHubIcon :size="16" />
                      <span>github.com/eddie-292/grapwork</span>
                    </a>
                  </div>
                </div>

                <div class="about-item">
                  <div class="about-item-label">开源协议</div>
                  <div class="about-item-value">MIT License</div>
                </div>

                <div class="about-item">
                  <div class="about-item-label">当前版本</div>
                  <div class="about-item-value">{{ appVersion }}</div>
                </div>
              </div>

              <div class="about-footer">
                <p>跨平台桌面 AI Agent 助手</p>
                <p class="copyright">2026 GrapWork</p>
              </div>
            </div>
          </div>
        </Transition>
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
  padding: 30px 10px 10px 10px;
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
  justify-content: center;
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
  height: calc(100vh - 84px);
}

.tab-content {
  position: relative;
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
.panel-wrapper :deep(.mcp-header) {
  justify-content: flex-end;
  padding: 12px 0;
  border-bottom: none;
}

/* 调整子组件内容的 padding */
.panel-wrapper :deep(.assistant-content),
.panel-wrapper :deep(.mcp-content) {
  padding: 0;
}

/* 环境检测面板样式 */
.env-panel {
  max-width: 900px;
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

/* 关于面板样式 */
.about-panel {
  max-width: 500px;
  margin: 0 auto;
  padding: 40px 20px;
}

.about-header {
  text-align: center;
  margin-bottom: 40px;
}

.about-logo {
  margin-bottom: 16px;
}

.about-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.about-header .version {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.about-content {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 40px;
}

.about-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.about-item:last-child {
  border-bottom: none;
}

.about-item-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.about-item-value {
  font-size: 14px;
  color: var(--color-text-primary);
}

.github-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
  text-decoration: none;
  transition: opacity 0.2s;
}

.github-link:hover {
  opacity: 0.8;
}

.about-footer {
  text-align: center;
}

.about-footer p {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.about-footer .copyright {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
