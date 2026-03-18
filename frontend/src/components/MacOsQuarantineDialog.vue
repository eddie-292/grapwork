<script setup lang="ts">
import { ref, onMounted } from 'vue'

const isVisible = ref(false)
const appPath = ref('')
const isFixing = ref(false)
const fixResult = ref<'success' | 'error' | null>(null)
const errorMessage = ref('')

onMounted(async () => {
  // 仅在 macOS 上检测
  if (navigator.platform.toLowerCase().includes('mac')) {
    try {
      const result = await window.electronAPI?.checkMacOSQuarantine()
      if (result?.isQuarantined) {
        appPath.value = result.appPath
        isVisible.value = true
      }
    } catch (error) {
      console.error('检测 macOS 隔离失败:', error)
    }
  }
})

async function handleFix() {
  isFixing.value = true
  fixResult.value = null
  errorMessage.value = ''

  try {
    const result = await window.electronAPI?.fixMacOSQuarantine(appPath.value)
    if (result?.success) {
      fixResult.value = 'success'
      // 延迟关闭对话框
      setTimeout(() => {
        isVisible.value = false
      }, 1500)
    } else {
      fixResult.value = 'error'
      errorMessage.value = result?.error || '修复失败'
    }
  } catch (error: any) {
    fixResult.value = 'error'
    errorMessage.value = error.message || '未知错误'
  } finally {
    isFixing.value = false
  }
}

function handleClose() {
  isVisible.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="isVisible" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-container">
          <!-- 图标 -->
          <div class="dialog-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- 标题 -->
          <h2 class="dialog-title">检测到安全限制</h2>

          <!-- 内容 -->
          <div class="dialog-content">
            <p class="dialog-message">
              macOS 已将此应用标记为隔离状态，可能导致运行异常。
            </p>
            <p class="dialog-message">
              点击下方按钮移除隔离属性，需要输入管理员密码。
            </p>
          </div>

          <!-- 结果提示 -->
          <div v-if="fixResult" class="dialog-result" :class="fixResult">
            <template v-if="fixResult === 'success'">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>修复成功！应用将正常启动。</span>
            </template>
            <template v-else>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>{{ errorMessage || '修复失败，请手动执行命令。' }}</span>
            </template>
          </div>

          <!-- 操作按钮 -->
          <div class="dialog-actions">
            <button class="btn btn-secondary" @click="handleClose" :disabled="isFixing">
              稍后处理
            </button>
            <button
              class="btn btn-primary"
              @click="handleFix"
              :disabled="isFixing || fixResult === 'success'"
            >
              <template v-if="isFixing">
                <span class="loading-spinner"></span>
                修复中...
              </template>
              <template v-else>
                一键修复
              </template>
            </button>
          </div>

          <!-- 手动命令提示 -->
          <div class="manual-command">
            <p>或手动在终端执行：</p>
            <code>sudo xattr -cr "{{ appPath }}"</code>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog-container {
  background: #ffffff;
  border-radius: 16px;
  padding: 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  text-align: center;
}

.dialog-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff3cd;
  border-radius: 50%;
  color: #856404;
}

.dialog-title {
  font-size: 20px;
  font-weight: 600;
  color: #1d1d1f;
  margin: 0 0 16px;
}

.dialog-content {
  margin-bottom: 24px;
}

.dialog-message {
  font-size: 14px;
  color: #6e6e73;
  line-height: 1.6;
  margin: 0 0 8px;
}

.dialog-message:last-child {
  margin-bottom: 0;
}

.dialog-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

.dialog-result.success {
  background: #d4edda;
  color: #155724;
}

.dialog-result.error {
  background: #f8d7da;
  color: #721c24;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 120px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f5f5f7;
  color: #1d1d1f;
}

.btn-secondary:hover:not(:disabled) {
  background: #e8e8ed;
}

.btn-primary {
  background: #007aff;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background: #0066d6;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.manual-command {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e5e5;
}

.manual-command p {
  font-size: 12px;
  color: #86868b;
  margin: 0 0 8px;
}

.manual-command code {
  display: block;
  background: #f5f5f7;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
  color: #1d1d1f;
  word-break: break-all;
}

/* Dialog transition */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-container,
.dialog-leave-to .dialog-container {
  transform: scale(0.95);
}

/* Dark mode */
[data-theme="dark"] .dialog-container {
  background: #2c2c2e;
}

[data-theme="dark"] .dialog-title {
  color: #ffffff;
}

[data-theme="dark"] .dialog-message {
  color: #ababab;
}

[data-theme="dark"] .dialog-icon {
  background: #3d3d1f;
  color: #ffd60a;
}

[data-theme="dark"] .btn-secondary {
  background: #3a3a3c;
  color: #ffffff;
}

[data-theme="dark"] .btn-secondary:hover:not(:disabled) {
  background: #48484a;
}

[data-theme="dark"] .dialog-result.success {
  background: #1e3a2f;
  color: #32d74b;
}

[data-theme="dark"] .dialog-result.error {
  background: #3a1f1f;
  color: #ff453a;
}

[data-theme="dark"] .manual-command {
  border-top-color: #3a3a3c;
}

[data-theme="dark"] .manual-command code {
  background: #3a3a3c;
  color: #ffffff;
}
</style>
