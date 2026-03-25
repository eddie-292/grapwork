<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="hasPending" class="clarification-overlay">
        <div class="clarification-dialog">
          <!-- Header -->
          <div class="dialog-header">
            <span class="type-icon" v-html="typeIconSvg"></span>
            <span class="type-label">{{ typeLabel }}</span>
          </div>

          <!-- Scrollable body -->
          <div class="dialog-body">
            <!-- Context -->
            <div v-if="request?.context" class="context-box" v-html="renderMarkdown(request.context)"></div>

            <!-- Question -->
            <div v-if="displayQuestion" class="question-box" v-html="renderMarkdown(displayQuestion)"></div>

            <!-- Option buttons -->
            <div v-if="hasOptions" class="options">
              <button
                v-for="(option, index) in request?.options"
                :key="index"
                class="option-btn"
                @click="handleSelectOption(index)"
              >
                <span class="option-index">{{ index + 1 }}</span>
                <span class="option-text" v-html="renderMarkdown(option)"></span>
              </button>
            </div>

            <!-- Text input -->
            <div v-else class="input-area">
              <input
                v-model="textInput"
                type="text"
                class="text-input"
                :placeholder="inputPlaceholder"
                @keyup.enter="handleSubmitText"
                ref="inputRef"
              />
              <button class="submit-btn" @click="handleSubmitText">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="dialog-footer">
            <button class="cancel-btn" @click="handleCancel">Cancel</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'
import { useClarificationStore } from '../stores/clarification'

// Markdown renderer (simplified version without code highlighting)
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true, // Convert \n to <br>
})

function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.renderInline(content)
}

/**
 * 清理 question 文本，移除 LLM 可能嵌入的 JSON 结构
 * LLM 有时会把整个工具参数 JSON 写入 question 字段
 */
function cleanQuestionText(text: string): string {
  if (!text) return ''

  // 尝试匹配嵌入的 JSON 块（包含 clarification_type/context/options 等已知 key）
  const jsonBlockPattern = /\{[\s\S]*?\}(?=\s*$|\s*\n|$)/

  const match = text.match(jsonBlockPattern)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      // 如果 JSON 包含我们工具的已知 key，说明是嵌入的工具参数，需要移除
      if (parsed.clarification_type || parsed.question || parsed.options) {
        // 取 JSON 之前的文本作为真正的 question
        const textBefore = text.substring(0, text.indexOf(match[0])).trim()
        return textBefore || ''
      }
    } catch {
      // 不是有效 JSON，保留原始文本
    }
  }

  return text
}

const displayQuestion = computed(() => {
  return cleanQuestionText(request.value?.question || '')
})

const store = useClarificationStore()
const textInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// SVG icons for each clarification type
const typeIcons: Record<string, string> = {
  missing_info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  ambiguous_requirement: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg>`,
  approach_choice: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8l-4 4-4-4"/><path d="M12 16V8"/></svg>`,
  risk_confirmation: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  suggestion: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`
}

// 直接从 store 获取响应式值
const hasPending = computed(() => store.hasPending.value)
const request = computed(() => store.pendingRequest.value)

const typeIconSvg = computed(() => {
  const type = store.clarificationType.value
  return type ? typeIcons[type] : typeIcons.missing_info
})

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    missing_info: '需要更多信息',
    ambiguous_requirement: '需求澄清',
    approach_choice: '方案选择',
    risk_confirmation: '风险确认',
    suggestion: '建议确认'
  }
  return labels[store.clarificationType.value || ''] || '澄清'
})

const hasOptions = computed(() => {
  return request.value?.options && request.value.options.length > 0
})

const inputPlaceholder = computed(() => {
  const placeholders: Record<string, string> = {
    missing_info: '请输入...',
    ambiguous_requirement: '请说明您的需求...',
    risk_confirmation: '输入"确认"继续...',
    suggestion: '是/否',
    approach_choice: '请选择一个方案'
  }
  return placeholders[store.clarificationType.value || ''] || '请输入...'
})

// Auto-focus input when dialog appears
watch(hasPending, (pending) => {
  if (pending && !hasOptions.value) {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

async function handleSelectOption(index: number) {
  await store.respond(index)
  textInput.value = ''
}

async function handleSubmitText() {
  if (!textInput.value.trim()) return
  await store.respond(textInput.value.trim())
  textInput.value = ''
}

async function handleCancel() {
  await store.cancel()
  textInput.value = ''
}
</script>

<style scoped>
.clarification-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.clarification-dialog {
  background: var(--color-bg-primary);
  border-radius: 16px;
  padding: 0;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
  overflow: hidden;
  animation: dialogEnter 0.25s ease-out;
}

@keyframes dialogEnter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.type-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.type-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.context-box {
  margin-bottom: 12px;
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  border-left: 3px solid var(--color-primary);
}

.context-box :deep(code) {
  background: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.question-box {
  margin-bottom: 12px;
  padding: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.7;
}

.question-box :deep(p) {
  margin: 0 0 8px 0;
}

.question-box :deep(p:last-child) {
  margin-bottom: 0;
}

.question-box :deep(code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.question-box :deep(strong) {
  font-weight: 600;
  color: var(--color-text-primary);
}

.question-box :deep(em) {
  font-style: italic;
  color: var(--color-text-secondary);
}

.question-box :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.question-box :deep(a:hover) {
  text-decoration: underline;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-btn {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  font-size: 14px;
  color: var(--color-text-primary);
}

.option-btn:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  transform: translateX(2px);
}

.option-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.option-btn:hover .option-index {
  background: var(--color-primary);
  color: white;
}

.option-text {
  flex: 1;
  line-height: 1.5;
}

.option-text :deep(code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.input-area {
  display: flex;
  gap: 10px;
}

.text-input {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 14px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: all 0.15s ease;
}

.text-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.submit-btn:hover {
  background: var(--color-primary-hover);
  transform: scale(1.05);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
}

.cancel-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.cancel-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>