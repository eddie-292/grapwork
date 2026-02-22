<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { EnvironmentCheckResult } from '../types/electron'
import CheckIcon from './icons/CheckIcon.vue'
import XIcon from './icons/XIcon.vue'
import LightbulbIcon from './icons/LightbulbIcon.vue'

const router = useRouter()
const checking = ref(true)
const checkResults = ref<EnvironmentCheckResult[]>([])
const checkingProgress = ref(0)

const hasErrors = computed(() => checkResults.value.some(r => r.status === 'error'))
const hasWarnings = computed(() => checkResults.value.some(r => r.status === 'warning'))
const hasProblems = computed(() => hasErrors.value || hasWarnings.value)
const canContinue = computed(() => !hasErrors.value)

// 分离正常项和问题项（warning + error）
const successItems = computed(() => checkResults.value.filter(r => r.status === 'success'))
const problemItems = computed(() => checkResults.value.filter(r => r.status !== 'success'))

async function runEnvironmentCheck() {
  checking.value = true
  checkResults.value = []
  checkingProgress.value = 0

  if (!window.electronAPI?.checkEnvironment) {
    // 非 Electron 环境，显示错误
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
    return
  }

  try {
    // 模拟进度
    const progressInterval = setInterval(() => {
      if (checkingProgress.value < 90) {
        checkingProgress.value += 10
      }
    }, 100)

    const results = await window.electronAPI.checkEnvironment()
    clearInterval(progressInterval)
    checkingProgress.value = 100

    checkResults.value = results
  } catch (error) {
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
  }
}

function handleContinue() {
  // 标记环境检查已通过
  sessionStorage.setItem('envCheckPassed', 'true')
  router.replace('/login')
}

function handleRetry() {
  runEnvironmentCheck()
}

function getStatusClass(status: string): string {
  return `status-${status}`
}

onMounted(() => {
  runEnvironmentCheck()
})
</script>

<template>
  <div class="env-check-container">
    <div class="env-check-card" :class="{ 'wide': hasProblems && !checking }">
      <div class="env-check-header">
        <div class="brand">
          <div class="brand-dot" />
          <span>PrismChat</span>
        </div>
        <h2>环境检查</h2>
        <p>正在检查运行环境，请稍候...</p>
      </div>

      <!-- 检查进度 -->
      <div v-if="checking" class="checking-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${checkingProgress}%` }" />
        </div>
        <p class="progress-text">正在检查环境... {{ checkingProgress }}%</p>
      </div>

      <!-- 检查结果 -->
      <div v-else class="check-results">
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
              :class="getStatusClass(result.status)"
            >
              <div class="check-icon">
                <XIcon v-if="result.status === 'error'" :size="14" />
                <span v-else>!</span>
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

        <!-- 操作按钮 -->
        <div class="check-actions">
          <button class="btn secondary" @click="handleRetry">
            重新检查
          </button>
          <button
            v-if="canContinue"
            class="btn primary"
            @click="handleContinue"
          >
            继续使用
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="!canContinue" class="error-hint">
          <p>请解决以上错误后再继续使用应用程序</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.env-check-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  padding: 20px;
}

.env-check-card {
  background: var(--color-bg-primary);
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 560px;
}

/* 有错误时扩展卡片宽度以适应双列布局 */
.env-check-card.wide {
  max-width: 900px;
}

.env-check-header {
  text-align: center;
  margin-bottom: 32px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 24px;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-primary);
}

.env-check-header h2 {
  margin: 0 0 8px 0;
  color: var(--color-text-primary);
  font-size: 28px;
  font-weight: 700;
}

.env-check-header p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

/* 进度条 */
.checking-progress {
  text-align: center;
  padding: 24px 0;
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin: 0;
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
</style>
