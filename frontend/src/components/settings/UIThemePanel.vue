<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { storage } from '../../services/StorageService'

interface UITheme {
  value: string
  label: string
  description: string
  previewBg: string
  previewText: string
}

const selectedTheme = ref('default')
const message = ref('')

const uiThemes: UITheme[] = [
  {
    value: 'default',
    label: '默认主题',
    description: 'GrapWork风格的清爽配色',
    previewBg: 'linear-gradient(135deg, #fbfbfd 0%, #ffffff 100%)',
    previewText: '#007aff'
  },
  {
    value: 'parchment',
    label: '羊皮纸',
    description: '温暖复古的羊皮纸风格',
    previewBg: 'linear-gradient(135deg, #efe4d0 0%, #f5f0e6 100%)',
    previewText: '#8b5a2b'
  }
]

// 监听主题变化
watch(selectedTheme, async (newTheme) => {
  applyTheme(newTheme)
  // 保存主题
  await storage.saveUITheme(newTheme)
  message.value = '主题已应用'
  setTimeout(() => {
    message.value = ''
  }, 2000)
})

function applyTheme(theme: string) {
  const root = document.documentElement
  if (theme === 'default') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

onMounted(async () => {
  // 加载保存的 UI 主题
  const savedTheme = await storage.getUITheme()
  if (savedTheme) {
    selectedTheme.value = savedTheme
    applyTheme(savedTheme)
  }
})
</script>

<template>
  <div class="ui-theme-panel">
    <h2 class="title">界面主题</h2>
    <p class="subtitle">选择你喜欢的界面配色方案</p>

    <div class="theme-grid">
      <div
        v-for="theme in uiThemes"
        :key="theme.value"
        class="theme-card"
        :class="{ active: selectedTheme === theme.value }"
        @click="selectedTheme = theme.value"
      >
        <div class="theme-preview" :style="{ background: theme.previewBg }">
          <div class="preview-content">
            <div class="preview-header">
              <span class="preview-dot"></span>
              <span class="preview-dot"></span>
              <span class="preview-dot"></span>
            </div>
            <div class="preview-body">
              <div class="preview-line" :style="{ background: theme.previewText, opacity: 0.8 }"></div>
              <div class="preview-line short" :style="{ background: theme.previewText, opacity: 0.5 }"></div>
              <div class="preview-line" :style="{ background: theme.previewText, opacity: 0.3 }"></div>
            </div>
          </div>
        </div>
        <div class="theme-info">
          <span class="theme-label">{{ theme.label }}</span>
          <span class="theme-description">{{ theme.description }}</span>
        </div>
        <div v-if="selectedTheme === theme.value" class="theme-check">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
    </div>

    <div v-if="message" class="message success">
      {{ message }}
    </div>
  </div>
</template>

<style scoped>
.ui-theme-panel {
  width: 100%;
}

.title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.theme-card {
  position: relative;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-normal);
  background: var(--color-bg-primary);
}

.theme-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.theme-card.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.theme-preview {
  height: 120px;
  padding: 12px;
  position: relative;
}

.preview-content {
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  height: 100%;
  padding: 10px;
  backdrop-filter: blur(4px);
}

.preview-header {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.preview-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border);
}

.preview-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  width: 100%;
}

.preview-line.short {
  width: 60%;
}

.theme-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px solid var(--color-border);
}

.theme-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.theme-description {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.theme-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.message {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  margin-top: 24px;
}

.message.success {
  background: var(--color-bg-success);
  color: var(--color-status-completed);
}
</style>
