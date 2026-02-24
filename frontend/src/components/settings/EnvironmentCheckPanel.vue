<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { EnvironmentCheckResult, EnvironmentInstallProgress, EnvironmentInstallResult } from '../../types/electron'
import CheckIcon from '../icons/CheckIcon.vue'
import XIcon from '../icons/XIcon.vue'
import LightbulbIcon from '../icons/LightbulbIcon.vue'
import DownloadIcon from '../icons/DownloadIcon.vue'

// Props
const props = defineProps<{
  autoRun?: boolean  // 是否自动运行检查
}>()

// Emits
const emit = defineEmits<{
  (e: 'checkComplete', results: EnvironmentCheckResult[]): void
  (e: 'continue'): void
}>()

const checking = ref(false)
const checkResults = ref<EnvironmentCheckResult[]>([])
const checkingProgress = ref(0)
const hasChecked = ref(false)  // 是否已经检查过

// 安装相关状态
const installing = ref(false)
const installProgress = ref<Map<string, EnvironmentInstallProgress>>(new Map())
const installResults = ref<EnvironmentInstallResult[]>([])

const hasErrors = computed(() => checkResults.value.some(r => r.status === 'error'))
const hasWarnings = computed(() => checkResults.value.some(r => r.status === 'warning'))
const hasProblems = computed(() => hasErrors.value || hasWarnings.value)
const canContinue = computed(() => !hasErrors.value && !installing.value)

// 分离正常项和问题项（warning + error）
const successItems = computed(() => checkResults.value.filter(r => r.status === 'success'))
const problemItems = computed(() => checkResults.value.filter(r => r.status !== 'success'))

// 可以自动安装的项目
const autoInstallableItems = computed(() =>
  problemItems.value.filter(r => r.canAutoInstall && !isInstalling(r.name))
)

// 检查某个项是否正在安装
function isInstalling(name: string): boolean {
  const progress = installProgress.value.get(name)
  return progress?.status === 'installing'
}

// 获取某个项的安装状态
function getInstallStatus(name: string): EnvironmentInstallProgress | undefined {
  return installProgress.value.get(name)
}

async function runEnvironmentCheck() {
  checking.value = true
  hasChecked.value = true
  checkResults.value = []
  checkingProgress.value = 0
  installProgress.value.clear()
  installResults.value = []

  if (!window.electronAPI?.checkEnvironment) {
    checkResults.value = [
      {
        name: 'electron',
        displayName: 'Electron 环境',
        status: 'error',
        message: '未在 Electron 环境中运行',
        details: '请使用 Electron 应用启动程序'
      }
    ]
    checking.value = false
    checkingProgress.value = 100
    emit('checkComplete', checkResults.value)
    return
  }

  let progressInterval: ReturnType<typeof setInterval> | null = null

  try {
    // 模拟进度
    progressInterval = setInterval(() => {
      if (checkingProgress.value < 90) {
        checkingProgress.value += 10
      }
    }, 100)

    const results = await window.electronAPI.checkEnvironment()
    clearInterval(progressInterval)
    progressInterval = null
    checkingProgress.value = 100

    checkResults.value = results
  } catch (error) {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null
    }
    checkingProgress.value = 100
    checkResults.value = [
      {
        name: 'unknown',
        displayName: '环境检查',
        status: 'error',
        message: '环境检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      }
    ]
  } finally {
    checking.value = false
    emit('checkComplete', checkResults.value)
  }
}

// 安装单个环境项
async function installSingleItem(itemName: string) {
  if (!window.electronAPI?.installEnvironment) {
    alert('安装功能不可用，请手动安装')
    return
  }

  installing.value = true

  try {
    const results = await window.electronAPI.installEnvironment([itemName], (progress) => {
      installProgress.value.set(progress.name, { ...progress })
    })

    installResults.value = results

    // 如果安装成功，重新检查环境
    const successResult = results.find(r => r.name === itemName && r.success)
    if (successResult) {
      // 短暂延迟后重新检查
      setTimeout(() => {
        runEnvironmentCheck()
      }, 1000)
    }
  } catch (error) {
    console.error('Install error:', error)
    installProgress.value.set(itemName, {
      name: itemName,
      status: 'error',
      message: error instanceof Error ? error.message : '安装失败'
    })
  } finally {
    installing.value = false
  }
}

// 一键安装所有可安装的项目
async function installAllItems() {
  if (!window.electronAPI?.installEnvironment) {
    alert('安装功能不可用，请手动安装')
    return
  }

  const itemsToInstall = autoInstallableItems.value.map(r => r.name)
  if (itemsToInstall.length === 0) {
    return
  }

  installing.value = true

  try {
    const results = await window.electronAPI.installEnvironment(itemsToInstall, (progress) => {
      installProgress.value.set(progress.name, { ...progress })
    })

    installResults.value = results

    // 如果有成功的安装，重新检查环境
    const hasSuccess = results.some(r => r.success)
    if (hasSuccess) {
      // 短暂延迟后重新检查
      setTimeout(() => {
        runEnvironmentCheck()
      }, 1000)
    }
  } catch (error) {
    console.error('Install all error:', error)
  } finally {
    installing.value = false
  }
}

// 打开下载链接
function openDownloadUrl(url: string) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  }
}

function getStatusClass(status: string): string {
  return `status-${status}`
}

// 暴露方法供父组件调用
defineExpose({
  runEnvironmentCheck,
  checkResults,
  hasErrors,
  hasWarnings
})

onMounted(() => {
  if (props.autoRun !== false) {
    runEnvironmentCheck()
  }
})
</script>

<template>
  <div class="environment-check-panel">
    <!-- 检查进度 -->
    <div v-if="checking" class="checking-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${checkingProgress}%` }" />
      </div>
      <p class="progress-text">正在检查环境... {{ checkingProgress }}%</p>
    </div>

    <!-- 检查结果 -->
    <div v-else-if="hasChecked" class="check-results">
      <!-- 状态摘要 -->
      <div class="status-summary" :class="{
        'all-success': !hasErrors && !hasWarnings,
        'has-warnings': hasWarnings && !hasErrors,
        'has-errors': hasErrors
      }">
        <div class="summary-icon">
          <XIcon v-if="hasErrors" :size="24" />
          <span v-else-if="hasWarnings">!</span>
          <CheckIcon v-else :size="24" />
        </div>
        <div class="summary-text">
          <h3 v-if="hasErrors">环境检查未通过</h3>
          <h3 v-else-if="hasWarnings">环境检查通过（有警告）</h3>
          <h3 v-else>环境检查通过</h3>
          <p v-if="hasErrors">部分关键环境不满足，可能影响程序运行</p>
          <p v-else-if="hasWarnings">部分可选功能可能无法使用</p>
          <p v-else>所有环境检查均已通过</p>
        </div>
      </div>

      <!-- 一键安装按钮 -->
      <div v-if="autoInstallableItems.length > 0 && !installing" class="install-all-section">
        <button class="btn install-all" @click="installAllItems">
          <DownloadIcon :size="16" />
          一键安装缺失环境 ({{ autoInstallableItems.length }})
        </button>
        <p class="install-hint">将自动安装以下缺失的工具：{{ autoInstallableItems.map(r => r.displayName).join('、') }}</p>
      </div>

      <!-- 安装进度 -->
      <div v-if="installing" class="installing-progress">
        <div class="progress-bar installing">
          <div class="progress-fill" :style="{ width: '100%', animation: 'indeterminate 1.5s infinite linear' }" />
        </div>
        <p class="progress-text">正在安装环境，请稍候...</p>
      </div>

      <!-- 检查项目列表 - 双列布局 -->
      <div class="check-lists" :class="{ 'has-problems': hasProblems }">
        <!-- 正常项列表 -->
        <div v-if="successItems.length > 0" class="check-list success-list">
          <div
            v-for="result in successItems"
            :key="result.name"
            class="check-item status-success"
          >
            <div class="check-icon">
              <CheckIcon :size="14" />
            </div>
            <div class="check-content">
              <div class="check-title">{{ result.displayName }}</div>
              <div class="check-message">{{ result.message }}</div>
              <div v-if="result.details" class="check-details">{{ result.details }}</div>
            </div>
          </div>
        </div>

        <!-- 问题项列表（warning + error） -->
        <div v-if="problemItems.length > 0" class="check-list problem-list">
          <div class="problem-list-header" :class="{ 'has-error': hasErrors }">
            <XIcon v-if="hasErrors" :size="16" />
            <span v-else class="warning-icon">!</span>
            <span>{{ hasErrors ? '需要解决的问题' : '需要注意的项目' }}</span>
          </div>
          <div
            v-for="result in problemItems"
            :key="result.name"
            class="check-item"
            :class="[getStatusClass(result.status), { 'installing': isInstalling(result.name) }]"
          >
            <div class="check-icon">
              <XIcon v-if="result.status === 'error' && !isInstalling(result.name)" :size="14" />
              <span v-else-if="isInstalling(result.name)" class="spinner"></span>
              <span v-else>!</span>
            </div>
            <div class="check-content">
              <div class="check-title">
                {{ result.displayName }}
                <span v-if="isInstalling(result.name)" class="install-badge">安装中...</span>
              </div>
              <div class="check-message">
                <template v-if="getInstallStatus(result.name)">
                  {{ getInstallStatus(result.name)?.message }}
                </template>
                <template v-else>
                  {{ result.message }}
                </template>
              </div>
              <div v-if="result.details && !isInstalling(result.name)" class="check-details">{{ result.details }}</div>

              <!-- 安装按钮 -->
              <div v-if="result.canAutoInstall && !isInstalling(result.name)" class="install-actions">
                <button
                  class="btn-install"
                  @click="installSingleItem(result.name)"
                  :disabled="installing"
                >
                  <DownloadIcon :size="14" />
                  安装
                </button>
                <span class="install-command">{{ result.installCommand }}</span>
              </div>

              <!-- 下载链接 -->
              <div v-else-if="result.downloadUrl && !result.canAutoInstall" class="download-link">
                <button class="btn-download" @click="openDownloadUrl(result.downloadUrl!)">
                  打开下载页面
                </button>
              </div>

              <!-- 修复建议 -->
              <div v-if="result.fixSuggestion && !result.canAutoInstall" class="fix-suggestion">
                <div class="fix-label"><LightbulbIcon :size="14" /> 修复建议：</div>
                <pre class="fix-content">{{ result.fixSuggestion }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="check-actions">
        <button class="btn secondary" @click="runEnvironmentCheck" :disabled="installing">
          重新检查
        </button>
        <slot name="actions" :can-continue="canContinue">
          <!-- 默认的继续按钮，可以被父组件覆盖 -->
          <button
            v-if="canContinue"
            class="btn primary"
            @click="$emit('continue')"
          >
            继续
          </button>
        </slot>
      </div>

      <!-- 错误提示 -->
      <div v-if="!canContinue && !installing" class="error-hint">
        <p>请解决以上错误后再继续使用应用程序</p>
      </div>
    </div>

    <!-- 未检查状态 -->
    <div v-else class="not-checked">
      <button class="btn primary" @click="runEnvironmentCheck">
        开始检查
      </button>
    </div>
  </div>
</template>

<style scoped>
.environment-check-panel {
  width: 100%;
}

/* 进度条 */
.checking-progress,
.installing-progress {
  text-align: center;
  padding: 24px 0;
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar.installing .progress-fill {
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-hover) 50%, var(--color-primary) 100%);
  background-size: 200% 100%;
}

@keyframes indeterminate {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.progress-text {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0;
}

/* 一键安装区域 */
.install-all-section {
  background: rgba(59, 130, 246, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  text-align: center;
}

.btn.install-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  background: #3b82f6;
  color: white;
}

.btn.install-all:hover {
  background: #2563eb;
}

.install-hint {
  margin: 12px 0 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 状态摘要 */
.status-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 24px;
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

/* 检查列表容器 */
.check-lists {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.check-lists.has-problems {
  flex-direction: row;
  gap: 20px;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.check-lists.has-problems .success-list {
  flex: 1;
}

.check-lists.has-problems .problem-list {
  flex: 1.2;
}

/* 问题列表头部 */
.problem-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  color: #f59e0b;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.problem-list-header.has-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.problem-list-header .warning-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-bg-secondary);
  transition: all 0.2s;
}

.check-item.installing {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
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

/* 旋转动画 */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.install-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  background: #3b82f6;
  color: white;
  border-radius: 10px;
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

/* 安装按钮 */
.install-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.btn-install {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #3b82f6;
  background: transparent;
  color: #3b82f6;
}

.btn-install:hover:not(:disabled) {
  background: #3b82f6;
  color: white;
}

.btn-install:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.install-command {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-family: monospace;
  background: var(--color-bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
}

/* 下载链接 */
.download-link {
  margin-top: 8px;
}

.btn-download {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
}

.btn-download:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
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

/* 操作按钮 */
.check-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn.primary {
  background: var(--color-primary);
  color: white;
}

.btn.primary:hover {
  background: var(--color-primary-hover);
}

.btn.secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn.secondary:hover {
  background: var(--color-border);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 错误提示 */
.error-hint {
  text-align: center;
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  margin-top: 16px;
}

.error-hint p {
  margin: 0;
  color: #ef4444;
  font-size: 14px;
}

/* 未检查状态 */
.not-checked {
  text-align: center;
  padding: 48px 24px;
}
</style>
