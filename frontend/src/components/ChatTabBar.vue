<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Message {
  content: string
  role: string
}

interface Chat {
  id: string
  title: string
  messages: Message[]
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

// 搜索相关状态
const showSearch = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// 窗口最大化状态
const isMaximized = ref(false)

// 初始化时检查窗口状态
onMounted(async () => {
  if (window.electronAPI?.windowIsMaximized) {
    isMaximized.value = await window.electronAPI.windowIsMaximized()
  }
})

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

// 搜索匹配的会话
const filteredChats = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.chatList

  return props.chatList.filter(chat => {
    // 匹配标题
    if (chat.title.toLowerCase().includes(query)) return true
    // 匹配消息内容
    if (chat.messages?.some(msg =>
      msg.content?.toLowerCase().includes(query)
    )) return true
    return false
  })
})

// 是否正在搜索
const isSearching = computed(() => searchQuery.value.trim().length > 0)

// 切换搜索框显示
function toggleSearch() {
  showSearch.value = !showSearch.value
  if (showSearch.value) {
    setTimeout(() => searchInputRef.value?.focus(), 0)
  } else {
    searchQuery.value = ''
  }
}

// 关闭搜索
function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
}

// 切换到搜索结果的会话
function switchToResult(chatId: string) {
  emit('switch-chat', chatId)
  closeSearch()
}

// 双击标签栏切换最大化
async function handleDoubleClick() {
  if (window.electronAPI?.windowMaximize) {
    isMaximized.value = await window.electronAPI.windowMaximize()
  }
}

// 窗口控制
async function handleMinimize() {
  if (window.electronAPI?.windowMinimize) {
    await window.electronAPI.windowMinimize()
  }
}

async function handleMaximize() {
  if (window.electronAPI?.windowMaximize) {
    isMaximized.value = await window.electronAPI.windowMaximize()
  }
}

async function handleClose() {
  if (window.electronAPI?.windowClose) {
    await window.electronAPI.windowClose()
  }
}
</script>

<template>
  <div id="chat-tab-bar_" class="chat-tab-bar" @dblclick="handleDoubleClick">
    <div class="tabs-container">
      <div
        v-for="chat in (isSearching ? filteredChats : chatList)"
        :key="chat.id"
        :class="['chat-tab', { active: chat.id === currentChatId, 'search-highlight': isSearching }]"
        @click="isSearching ? switchToResult(chat.id) : emit('switch-chat', chat.id)"
      >
        <span
          class="tab-indicator"
          :style="{ backgroundColor: getChatColor(chat.id) }"
        />
        <span class="tab-title">{{ truncateTitle(chat.title) }}</span>
        <button
          v-if="!isSearching"
          class="tab-close-btn"
          @click="handleDelete(chat.id, $event)"
          title="关闭"
        >
          ×
        </button>
      </div>
      <div v-if="isSearching && filteredChats.length === 0" class="no-result">
        未找到匹配的会话
      </div>
    </div>

    <!-- 搜索输入框 -->
    <div v-if="showSearch" class="search-box">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索会话..."
        @keydown.escape="closeSearch"
      />
      <button class="search-close-btn" @click="closeSearch" title="关闭搜索">
        ×
      </button>
    </div>

    <span class="chat-count">{{ chatList.length }}</span>
    <button class="new-tab-btn" @click="emit('create-chat')" title="新建对话">
      +
    </button>
    <button :class="['search-btn', { active: showSearch }]" @click="toggleSearch" title="搜索会话">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
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
  -webkit-app-region: drag; /* 使整个标签栏可拖拽 */
}

/* macOS 风格窗口控制按钮 */
.window-controls {
  display: flex;
  gap: 8px;
  padding-right: 12px;
  -webkit-app-region: no-drag; /* 按钮区域不可拖拽 */
}

.window-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
}

.window-btn.close {
  background: #ff5f57;
}

.window-btn.minimize {
  background: #ffbd2e;
}

.window-btn.maximize {
  background: #28ca41;
}

.window-btn:hover {
  filter: brightness(0.9);
}

/* hover 时显示图标 */
.window-btn.close:hover::after {
  content: '×';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
  line-height: 1;
}

.window-btn.minimize:hover::after {
  content: '−';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
  line-height: 1;
}

.window-btn.maximize:hover::after {
  content: '+';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
  line-height: 1;
}

.window-btn.maximize.is-maximized:hover::after {
  content: '⧉';
  font-size: 8px;
}

.tabs-container {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  align-items: center;
  -webkit-app-region: no-drag; /* 标签区域不可拖拽，保持点击功能 */
}

.tabs-container::-webkit-scrollbar {
  display: none;
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
}

.chat-tab.search-highlight {
  border-color: var(--color-primary, #22c55e);
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

.no-result {
  font-size: 13px;
  color: var(--color-text-tertiary, #888);
  padding: 6px 12px;
  white-space: nowrap;
}

.chat-count {
  font-size: 12px;
  color: var(--color-text-tertiary, #888);
  padding: 2px 6px;
  min-width: 20px;
  text-align: center;
  -webkit-app-region: no-drag;
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
  -webkit-app-region: no-drag;
}

.new-tab-btn:hover {
  border-color: var(--color-primary, #22c55e);
  color: var(--color-primary, #22c55e);
  background: var(--color-bg-tertiary, #f0f0f0);
}

.search-box {
  display: flex;
  align-items: center;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  padding: 0 4px 0 8px;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--color-text-primary, #1a1a1a);
  width: 120px;
  padding: 4px 0;
}

.search-input::placeholder {
  color: var(--color-text-tertiary, #888);
}

.search-close-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.search-close-btn:hover {
  background: var(--color-danger-bg, #fee2e2);
  color: var(--color-danger, #ef4444);
}

.search-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.search-btn:hover,
.search-btn.active {
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

:global(.dark-mode) .no-result {
  color: var(--color-text-tertiary, #666);
}

:global(.dark-mode) .chat-count {
  background: var(--color-bg-primary, #0d0d0d);
  border-color: var(--color-border, #333);
  color: var(--color-text-tertiary, #888);
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

:global(.dark-mode) .search-box {
  background: var(--color-bg-primary, #0d0d0d);
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .search-input {
  color: var(--color-text-primary, #e5e5e5);
}

:global(.dark-mode) .search-input::placeholder {
  color: var(--color-text-tertiary, #666);
}

:global(.dark-mode) .search-btn {
  border-color: var(--color-border, #333);
  color: var(--color-text-secondary, #888);
}

:global(.dark-mode) .search-btn:hover,
:global(.dark-mode) .search-btn.active {
  border-color: var(--color-primary, #22c55e);
  color: var(--color-primary, #22c55e);
  background: var(--color-bg-tertiary, #252525);
}
</style>
