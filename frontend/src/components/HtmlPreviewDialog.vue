<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  show: boolean
  htmlContent: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const iframeRef = ref<HTMLIFrameElement | null>(null)

// 更新 iframe 内容
function updateIframe() {
  if (!props.show || !props.htmlContent || !iframeRef.value) return

  const doc = iframeRef.value.contentDocument
  if (!doc) return

  // 注入基础样式和内容
  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          padding: 20px;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      ${props.htmlContent}
    </body>
    </html>
  `)
  doc.close()
}

// 监听显示状态变化
watch(() => props.show, (show) => {
  if (show) {
    // 延迟一下，确保 DOM 已经渲染
    setTimeout(updateIframe, 50)
  }
})

// 监听内容变化
watch(() => props.htmlContent, () => {
  if (props.show) {
    updateIframe()
  }
})

function handleClose() {
  emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="html-preview-overlay" @click.self="handleClose">
      <div class="html-preview-dialog">
        <div class="html-preview-header">
          <h3>HTML 预览</h3>
          <button class="close-btn" @click="handleClose">&times;</button>
        </div>
        <div class="html-preview-content">
          <iframe
            ref="iframeRef"
            class="html-preview-iframe"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.html-preview-overlay {
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

.html-preview-dialog {
  background: var(--color-bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.html-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.html-preview-header h3 {
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

.html-preview-content {
  flex: 1;
  overflow: hidden;
  background: var(--color-bg-tertiary);
}

.html-preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
