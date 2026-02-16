<script setup lang="ts">
import { computed } from 'vue'

interface Chat {
  id: string
  title: string
  messages: unknown[]
  createdAt: number
  assistantId?: string
  configId?: number
  sending?: boolean
  params?: Record<string, unknown>
}

interface Props {
  chatList: Chat[]
  currentChatId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'switch-chat': [chatId: string]
  'delete-chat': [chatId: string, event: Event]
  'create-chat': []
}>()

// 基于 chat.id 生成稳定的颜色
function getChatColor(chatId: string): string {
  const colors = [
    '#22c55e', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ec4899', // pink
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#14b8a6', // teal
  ]
  // 使用 DJB2 哈希算法变体
  let hash = 0
  for (let i = 0; i < chatId.length; i++) {
    hash = chatId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// 截断标题显示
function truncateTitle(title: string, maxLength: number = 12): string {
  if (title.length <= maxLength) return title
  return title.slice(0, maxLength) + '...'
}

// 处理删除点击
function handleDelete(chatId: string, event: Event) {
  event.stopPropagation()
  emit('delete-chat', chatId, event)
}
</script>

<template>
  <div class="chat-tab-bar">
    <div class="tabs-container">
      <div
        v-for="chat in chatList"
        :key="chat.id"
        :class="['chat-tab', { active: chat.id === currentChatId }]"
        @click="emit('switch-chat', chat.id)"
      >
        <span
          class="tab-indicator"
          :style="{ backgroundColor: getChatColor(chat.id) }"
        />
        <span class="tab-title">{{ truncateTitle(chat.title) }}</span>
        <button
          class="tab-close-btn"
          @click="handleDelete(chat.id, $event)"
          title="关闭"
        >
          ×
        </button>
      </div>
    </div>
    <button class="new-tab-btn" @click="emit('create-chat')" title="新建对话">
      +
    </button>
  </div>
</template>

<style scoped>
.chat-tab-bar {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--color-border, #e5e5e5);
  padding: 8px 12px;
  gap: 8px;
  min-height: 44px;
}

.tabs-container {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none; /* Firefox */
}

.tabs-container::-webkit-scrollbar {
  display: none; /* Chrome, Safari */
}

.chat-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  max-width: 160px;
  flex-shrink: 0;
}

.chat-tab:hover {
  background: var(--color-bg-tertiary, #f0f0f0);
  border-color: var(--color-border-hover, #d0d0d0);
}

.chat-tab.active {
  background: var(--color-bg-tertiary, #f0f0f0);
  border-color: var(--color-primary, #22c55e);
  box-shadow: 0 0 0 1px var(--color-primary, #22c55e);
}

.tab-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tab-title {
  font-size: 13px;
  color: var(--color-text-primary, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close-btn {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
  line-height: 1;
}

.chat-tab:hover .tab-close-btn {
  opacity: 1;
}

.tab-close-btn:hover {
  background: var(--color-danger-bg, #fee2e2);
  color: var(--color-danger, #ef4444);
}

.new-tab-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px dashed var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.new-tab-btn:hover {
  border-color: var(--color-primary, #22c55e);
  color: var(--color-primary, #22c55e);
  background: var(--color-bg-tertiary, #f0f0f0);
}

/* 深色模式 */
:global(.dark-mode) .chat-tab-bar {
  background: var(--color-bg-secondary, #1a1a1a);
  border-bottom-color: var(--color-border, #333);
}

:global(.dark-mode) .chat-tab {
  background: var(--color-bg-primary, #0d0d0d);
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .chat-tab:hover {
  background: var(--color-bg-tertiary, #252525);
  border-color: var(--color-border-hover, #444);
}

:global(.dark-mode) .chat-tab.active {
  background: var(--color-bg-tertiary, #252525);
}

:global(.dark-mode) .tab-title {
  color: var(--color-text-primary, #e5e5e5);
}

:global(.dark-mode) .new-tab-btn {
  border-color: var(--color-border, #333);
  color: var(--color-text-secondary, #888);
}

:global(.dark-mode) .new-tab-btn:hover {
  border-color: var(--color-primary, #22c55e);
  color: var(--color-primary, #22c55e);
  background: var(--color-bg-tertiary, #252525);
}
</style>
