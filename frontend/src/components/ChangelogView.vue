<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

const changelogContent = ref('')
const loading = ref(true)
const error = ref('')

const renderedContent = computed(() => {
  if (!changelogContent.value) return ''
  return md.render(changelogContent.value)
})

async function loadChangelog() {
  loading.value = true
  error.value = ''

  try {
    if (window.electronAPI?.getChangelog) {
      const result = await window.electronAPI.getChangelog()
      if (result.success) {
        changelogContent.value = result.content
      } else {
        error.value = result.error || '加载更新日志失败'
      }
    } else {
      // 非 Electron 环境下的备用内容
      changelogContent.value = getFallbackContent()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载更新日志失败'
  } finally {
    loading.value = false
  }
}

function getFallbackContent(): string {
  return `# PrismChat 更新日志

## v1.0.0 (2024-02-14)

### 新功能

- **多 LLM 支持**: 支持任何 OpenAI 兼容的 LLM API 接口
- **任务模式**: 智能分解复杂请求为可执行子任务，支持工作记忆管理
- **全局记忆**: 持久化知识存储，自动注入用户偏好和自定义上下文
- **助手系统**: 自定义 AI 助手和系统提示词管理
- **MCP 支持**: Model Context Protocol 集成，支持 STDIO/SSE 传输方式
- **统一存储**: 可插拔存储后端系统 (LocalStorage, FileSystem, HTTP)
- **代码高亮**: 支持多种代码高亮主题
- **环境检测**: 一键检测 Agent 运行所需的环境依赖

### 技术特性

- Electron + Vue 3 + TypeScript 技术栈
- 跨平台支持 (macOS, Windows, Linux)
- 流式响应处理，支持 DeepSeek/Qwen 等多种推理格式
- 类型安全的存储 API
- 哈希路由与认证守卫

---

*感谢使用 PrismChat!*`
}

onMounted(() => {
  loadChangelog()
})
</script>

<template>
  <div class="changelog-view">
    <div class="changelog-header">
      <h2>更新日志</h2>
      <p>查看 PrismChat 的版本更新历史</p>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon">!</span>
      <span>{{ error }}</span>
      <button class="retry-btn" @click="loadChangelog">重试</button>
    </div>

    <div v-else class="changelog-content" v-html="renderedContent"></div>
  </div>
</template>

<style scoped>
.changelog-view {
  max-width: 800px;
}

.changelog-header {
  margin-bottom: 24px;
}

.changelog-header h2 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.changelog-header p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  color: var(--color-text-secondary);
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  flex-direction: column;
  color: #ef4444;
}

.error-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fee2e2;
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
}

.retry-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: var(--color-primary-hover);
}

.changelog-content {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  padding: 24px;
  line-height: 1.8;
}

.changelog-content :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--color-primary);
}

.changelog-content :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 24px 0 12px 0;
  padding-left: 12px;
  border-left: 3px solid var(--color-primary);
}

.changelog-content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 16px 0 8px 0;
}

.changelog-content :deep(p) {
  margin: 8px 0;
  color: var(--color-text-secondary);
}

.changelog-content :deep(ul) {
  margin: 8px 0;
  padding-left: 24px;
}

.changelog-content :deep(li) {
  margin: 6px 0;
  color: var(--color-text-secondary);
}

.changelog-content :deep(strong) {
  color: var(--color-text-primary);
  font-weight: 600;
}

.changelog-content :deep(code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-primary);
}

.changelog-content :deep(hr) {
  border: none;
  height: 1px;
  background: var(--color-border);
  margin: 24px 0;
}

.changelog-content :deep(em) {
  color: var(--color-text-tertiary);
  font-style: italic;
}
</style>
