<script setup lang="ts">
import { computed } from 'vue'
import DeleteIcon from './icons/DeleteIcon.vue'
import AlertTriangleIcon from './icons/AlertTriangleIcon.vue'
import InfoIcon from './icons/InfoIcon.vue'

interface Props {
  show: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认',
  confirmText: '确认',
  cancelText: '取消',
  type: 'warning'
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const iconComponent = computed(() => {
  switch (props.type) {
    case 'danger':
      return DeleteIcon
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
  <div class="modal-overlay" v-if="show" @click.self="$emit('cancel')">
    <div class="modal-content confirm-modal">
      <div class="confirm-icon">
        <component :is="iconComponent" :size="48" />
      </div>
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
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
  background: #ffffff;
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
  color: #6b7280;
}

.confirm-modal h3 {
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.confirm-modal p {
  margin: 0 0 24px 0;
  color: #6b7280;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: #f5f7fa;
  color: #4a5568;
  border: 1px solid #e8ecf1;
}

.btn.secondary:hover:not(:disabled) {
  background: #e8ecf1;
}

.btn.danger {
  background: #ef4444;
  color: white;
  border: 1px solid #ef4444;
}

.btn.danger:hover:not(:disabled) {
  background: #dc2626;
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
  background: #10a37f;
  color: white;
  border: 1px solid #10a37f;
}

.btn.info:hover:not(:disabled) {
  background: #0f8f6d;
}
</style>
