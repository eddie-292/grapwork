<script setup lang="ts">
import { computed } from 'vue'
import AlertTriangleIcon from './icons/AlertTriangleIcon.vue'
import InfoIcon from './icons/InfoIcon.vue'

interface Props {
  show: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  showAutoAllow?: boolean
  autoAllowChecked?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认',
  confirmText: '确认',
  cancelText: '取消',
  type: 'warning',
  showAutoAllow: false,
  autoAllowChecked: false
})

const iconComponent = computed(() => {
  switch (props.type) {
    case 'danger':
      return AlertTriangleIcon
    case 'warning':
      return AlertTriangleIcon
    case 'info':
      return InfoIcon
    default:
      return AlertTriangleIcon
  }
})
</script>

<template>
  <Transition name="modal">
    <div class="modal-overlay" v-if="show" @click.self="$emit('cancel')">
      <div class="modal-content confirm-modal">
        <div class="confirm-icon">
          <component :is="iconComponent" :size="48" />
        </div>
        <h3>{{ title }}</h3>
        <p>{{ message }}</p>
        <div v-if="showAutoAllow" class="auto-allow-checkbox">
          <label>
            <input 
              type="checkbox" 
              :checked="autoAllowChecked" 
              @change="$emit('update:autoAllowChecked', ($event.target as HTMLInputElement).checked)"
            />
            <span>当前会话自动允许</span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn secondary" @click="$emit('cancel')">
            {{ cancelText }}
          </button>
          <button :class="['btn', type]" @click="$emit('confirm')">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.confirm-modal {
  text-align: center;
  padding: 32px 24px;
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.confirm-icon svg {
  color: var(--color-text-secondary);
}

.confirm-modal h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.confirm-modal p {
  margin: 0 0 24px 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
  height: 100px;
  overflow: auto;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.auto-allow-checkbox {
  margin-bottom: 16px;
}

.auto-allow-checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.auto-allow-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

/* Button styles moved to global style.css */
.btn {
  min-width: 100px;
}

.btn.warning {
  background: #f59e0b;
  color: white;
  border: 1px solid #f59e0b;
}

.btn.warning:hover:not(:disabled) {
  background: #d97706;
}

.btn.info {
  background: var(--color-primary);
  color: white;
  border: 1px solid var(--color-primary);
}

.btn.info:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
</style>
