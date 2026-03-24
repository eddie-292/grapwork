<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="store.hasPending.value" class="clarification-overlay" @click.self="handleCancel">
        <div class="clarification-dialog">
          <!-- Header -->
          <div class="dialog-header">
            <span class="type-icon">{{ store.typeIcon.value }}</span>
            <span class="type-label">{{ typeLabel }}</span>
          </div>

          <!-- Content -->
          <div class="dialog-content">
            <p v-if="store.pendingRequest.value?.context" class="context">
              {{ store.pendingRequest.value.context }}
            </p>

            <p class="question">{{ store.pendingRequest.value?.question }}</p>

            <!-- Option buttons -->
            <div v-if="hasOptions" class="options">
              <button
                v-for="(option, index) in store.pendingRequest.value?.options"
                :key="index"
                class="option-btn"
                @click="handleSelectOption(index)"
              >
                {{ option }}
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
              <button class="submit-btn" @click="handleSubmitText">Submit</button>
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
import { useClarificationStore } from '../stores/clarification'

const store = useClarificationStore()
const textInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const typeLabel = computed(() => {
  const labels: Record<string, string> = {
    missing_info: 'More Information Needed',
    ambiguous_requirement: 'Clarification Required',
    approach_choice: 'Choose an Approach',
    risk_confirmation: 'Risk Confirmation',
    suggestion: 'Suggestion'
  }
  return labels[store.clarificationType.value || ''] || 'Clarification'
})

const hasOptions = computed(() => {
  return store.pendingRequest.value?.options && store.pendingRequest.value.options.length > 0
})

const inputPlaceholder = computed(() => {
  const placeholders: Record<string, string> = {
    missing_info: 'Please enter...',
    ambiguous_requirement: 'Please clarify your requirement...',
    risk_confirmation: 'Type "confirm" to proceed...',
    suggestion: 'Yes/No',
    approach_choice: 'Please select an option'
  }
  return placeholders[store.clarificationType.value || ''] || 'Please enter...'
})

// Auto-focus input when dialog appears
watch(() => store.hasPending.value, (hasPending) => {
  if (hasPending && !hasOptions.value) {
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
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.clarification-dialog {
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: 24px;
  max-width: 480px;
  width: 90%;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--color-border);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.type-icon {
  font-size: 24px;
}

.type-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.dialog-content {
  margin-bottom: 20px;
}

.context {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.question {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 16px;
  line-height: 1.5;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-btn {
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
  font-size: 14px;
  color: var(--color-text-primary);
}

.option-btn:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
}

.input-area {
  display: flex;
  gap: 8px;
}

.text-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast);
}

.text-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.submit-btn {
  padding: 10px 20px;
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background var(--transition-fast);
}

.submit-btn:hover {
  background: var(--color-primary-hover);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

.cancel-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 13px;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
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