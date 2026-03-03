<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import mermaid from 'mermaid'

interface Props {
  show: boolean
  mermaidContent: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const mermaidContainer = ref<HTMLDivElement | null>(null)
const renderError = ref<string | null>(null)

// 初始化 mermaid 配置
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
})

// 渲染 mermaid 图表
async function renderMermaid() {
  if (!props.show || !props.mermaidContent || !mermaidContainer.value) return

  renderError.value = null

  try {
    // 生成唯一 ID
    const id = `mermaid-${Date.now()}`

    // 使用 mermaid.render 来渲染图表
    const { svg } = await mermaid.render(id, props.mermaidContent)

    mermaidContainer.value.innerHTML = svg
  } catch (error) {
    console.error('Mermaid render error:', error)
    renderError.value = error instanceof Error ? error.message : '渲染失败'
    if (mermaidContainer.value) {
      mermaidContainer.value.innerHTML = `
        <div class="mermaid-error">
          <p>图表渲染失败</p>
          <pre>${props.mermaidContent}</pre>
        </div>
      `
    }
  }
}

// 监听显示状态变化
watch(() => props.show, async (show) => {
  if (show) {
    await nextTick()
    // 延迟一下，确保 DOM 已经渲染
    setTimeout(renderMermaid, 50)
  }
})

// 监听内容变化
watch(() => props.mermaidContent, () => {
  if (props.show) {
    renderMermaid()
  }
})

function handleClose() {
  emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="mermaid-preview-overlay" @click.self="handleClose">
      <div class="mermaid-preview-dialog">
        <div class="mermaid-preview-header">
          <h3>Mermaid 图表预览</h3>
          <button class="close-btn" @click="handleClose">&times;</button>
        </div>
        <div class="mermaid-preview-content">
          <div v-if="renderError" class="mermaid-error-message">
            {{ renderError }}
          </div>
          <div ref="mermaidContainer" class="mermaid-container" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mermaid-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.mermaid-preview-dialog {
  background: var(--color-bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 1000px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.mermaid-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.mermaid-preview-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.mermaid-preview-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: var(--color-bg-secondary);
}

.mermaid-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 200px;
}

.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-error-message {
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 14px;
}

.mermaid-error {
  text-align: center;
  color: var(--color-text-secondary);
}

.mermaid-error p {
  color: #dc2626;
  font-weight: 500;
  margin-bottom: 12px;
}

.mermaid-error pre {
  background: var(--color-bg-tertiary);
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  overflow-x: auto;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
