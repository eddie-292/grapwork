<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import hljs from 'highlight.js'
import MarkdownIt from 'markdown-it'
import { storage } from '../../services/StorageService'

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

interface HighlightTheme {
  value: string
  label: string
}

const selectedHighlightTheme = ref('atom-one-dark')
const renderVersion = ref(0)
const message = ref('')

// 预览代码高亮
const previewCode = `\`\`\`javascript
const hello = "Hello, World!"
//console.log(hello);
\`\`\``

// 当主题变化时，增加版本号，强制重新渲染
watch(selectedHighlightTheme, async (newTheme) => {
  await loadHighlightTheme(newTheme)
  // 等待 CSS 加载完成后再更新版本号
  await new Promise(resolve => setTimeout(resolve, 150))
  renderVersion.value++
  // 自动保存主题
  await storage.saveHighlightTheme(newTheme)
  message.value = '主题已应用'
  setTimeout(() => {
    message.value = ''
  }, 2000)
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

onMounted(async () => {
  // 加载保存的代码高亮主题
  const savedTheme = await storage.getHighlightTheme()
  if (savedTheme) {
    selectedHighlightTheme.value = savedTheme
  } else {
    // 加载默认主题
    await loadHighlightTheme(selectedHighlightTheme.value)
  }
})

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
      link.href = `./${theme}.css`

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
</script>

<template>
  <div class="code-highlight-theme-panel">
    <h2 class="title">代码高亮主题</h2>
    <div class="highlight-theme-section">
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
    <div v-if="message" class="message" :class="{ success: message.includes('成功') || message.includes('已应用') }">
      {{ message }}
    </div>
  </div>
</template>

<style scoped>
.code-highlight-theme-panel {
  width: 100%;
}

.title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.highlight-theme-section {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

.theme-selector {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.theme-select {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--color-bg-primary);
  transition: border-color 0.2s;
}

.theme-select:focus {
  border-color: var(--color-primary);
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

.message {
  padding: 12px;
  border-radius: 8px;
  background: #fee;
  color: #c33;
  font-size: 14px;
  margin-top: 16px;
}

.message.success {
  background: #efe;
  color: #3a3;
}
</style>
