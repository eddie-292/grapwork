<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ImageAccentIcon from './icons/ImageAccentIcon.vue'
import PlusIcon from './icons/PlusIcon.vue'
import SearchIcon from './icons/SearchIcon.vue'
import XIcon from './icons/XIcon.vue'

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

// 右键菜单相关状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuTargetChatId = ref<string | null>(null)

// 获取当前选中的标签在列表中的索引
const targetChatIndex = computed(() => {
  if (!contextMenuTargetChatId.value) return -1
  return props.chatList.findIndex(chat => chat.id === contextMenuTargetChatId.value)
})

// 是否显示"删除左边标签"选项
const showDeleteLeft = computed(() => targetChatIndex.value > 0)

// 是否显示"删除右边标签"选项
const showDeleteRight = computed(() => {
  return targetChatIndex.value >= 0 && targetChatIndex.value < props.chatList.length - 1
})

// 是否显示"删除其他标签"选项
const showDeleteOthers = computed(() => props.chatList.length > 1)

// 是否显示"删除全部标签"选项
const showDeleteAll = computed(() => props.chatList.length > 0)

// 搜索相关状态
const showSearch = ref(false)
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

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

// 打开生图模式窗口
async function openImageGenerator() {
  await window.electronAPI?.openImageGeneratorWindow()
}

// 右键菜单相关函数
function showContextMenu(event: MouseEvent, chatId: string) {
  event.preventDefault()
  event.stopPropagation()
  
  contextMenuTargetChatId.value = chatId
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
  contextMenuTargetChatId.value = null
}

// 删除当前标签右边的所有标签
function deleteRightTabs() {
  const index = targetChatIndex.value
  if (index < 0 || index >= props.chatList.length - 1) return
  
  const tabsToDelete = props.chatList.slice(index + 1)
  tabsToDelete.forEach(chat => {
    emit('delete-chat', chat.id, new Event('delete-right'))
  })
  hideContextMenu()
}

// 删除当前标签左边的所有标签
function deleteLeftTabs() {
  const index = targetChatIndex.value
  if (index <= 0) return
  
  const tabsToDelete = props.chatList.slice(0, index)
  tabsToDelete.forEach(chat => {
    emit('delete-chat', chat.id, new Event('delete-left'))
  })
  hideContextMenu()
}

// 删除除当前标签外的所有标签
function deleteOtherTabs() {
  if (props.chatList.length <= 1) return
  
  const currentTargetId = contextMenuTargetChatId.value
  if (!currentTargetId) return
  
  props.chatList.forEach(chat => {
    if (chat.id !== currentTargetId) {
      emit('delete-chat', chat.id, new Event('delete-others'))
    }
  })
  hideContextMenu()
}

// 删除所有标签
function deleteAllTabs() {
  props.chatList.forEach(chat => {
    emit('delete-chat', chat.id, new Event('delete-all'))
  })
  hideContextMenu()
}

// 监听全局点击以关闭菜单
onMounted(() => {
  document.addEventListener('click', hideContextMenu)
  document.addEventListener('contextmenu', hideContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
  document.removeEventListener('contextmenu', hideContextMenu)
})
</script>

<template>
  <div id="chat-tab-bar_" class="chat-tab-bar">
    <div class="tabs-container">
      <div
        v-for="chat in (isSearching ? filteredChats : chatList)"
        :key="chat.id"
        :class="['chat-tab', { active: chat.id === currentChatId, 'search-highlight': isSearching }]"
        @click="isSearching ? switchToResult(chat.id) : emit('switch-chat', chat.id)"
        @contextmenu.prevent="showContextMenu($event, chat.id)"
      >
        <span class="tab-title">{{ truncateTitle(chat.title) }}</span>
        <button
          v-if="!isSearching"
          class="tab-close-btn"
          @click="handleDelete(chat.id, $event)"
          title="关闭"
        >
          <XIcon :size="14" />
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
        <XIcon :size="12" />
      </button>
    </div>

    <span class="chat-count">{{ chatList.length }}</span>
    <button class="new-tab-btn" @click="emit('create-chat')" title="新建对话">
      <PlusIcon :size="16" />
    </button>
    <button :class="['search-btn', { active: showSearch }]" @click="toggleSearch" title="搜索会话">
      <SearchIcon :size="16" />
    </button>
    <button class="image-generator-btn" @click="openImageGenerator" title="生图模式">
      <ImageAccentIcon :size="16" />
    </button>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
    >
      <div
        v-if="showDeleteLeft"
        class="context-menu-item"
        @click="deleteLeftTabs"
      >
        删除左边标签
      </div>
      <div
        v-if="showDeleteRight"
        class="context-menu-item"
        @click="deleteRightTabs"
      >
        删除右边标签
      </div>
      <div
        v-if="showDeleteOthers"
        class="context-menu-item"
        @click="deleteOtherTabs"
      >
        删除其他标签
      </div>
      <div
        v-if="showDeleteAll"
        class="context-menu-item context-menu-item-danger"
        @click="deleteAllTabs"
      >
        删除全部标签
      </div>
    </div>
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
  border-color: var(--color-primary, #333);
}

.chat-tab.search-highlight {
  border-color: var(--color-primary, #333);
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
  border-color: var(--color-border-hover, #ccc);
  color: var(--color-primary, #333);
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
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
  background: var(--color-bg-tertiary, #f0f0f0);
}

.image-generator-btn {
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

.image-generator-btn:hover {
  border-color: var(--color-border-hover, #d0d0d0);
  background: var(--color-bg-tertiary, #f0f0f0);
  color: var(--color-primary, #333);
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
  border-color: var(--color-primary, #666);
  color: var(--color-primary, #666);
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
  border-color: var(--color-primary, #666);
  color: var(--color-primary, #666);
  background: var(--color-bg-tertiary, #252525);
}

:global(.dark-mode) .image-generator-btn {
  border-color: var(--color-border, #333);
  color: var(--color-text-secondary, #888);
}

:global(.dark-mode) .image-generator-btn:hover {
  border-color: var(--color-primary, #666);
  color: var(--color-primary, #666);
  background: var(--color-bg-tertiary, #252525);
}

/* 右键菜单样式 */
.context-menu {
  position: fixed;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  padding: 4px;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  -webkit-app-region: no-drag;
}

.context-menu-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-primary, #1a1a1a);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.context-menu-item:hover {
  background: var(--color-bg-tertiary, #f0f0f0);
}

.context-menu-item-danger {
  color: var(--color-danger, #ef4444);
}

.context-menu-item-danger:hover {
  background: var(--color-danger-bg, #fee2e2);
}

/* 深色模式下的右键菜单 */
:global(.dark-mode) .context-menu {
  background: var(--color-bg-primary, #0d0d0d);
  border-color: var(--color-border, #333);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

:global(.dark-mode) .context-menu-item {
  color: var(--color-text-primary, #e5e5e5);
}

:global(.dark-mode) .context-menu-item:hover {
  background: var(--color-bg-tertiary, #252525);
}

:global(.dark-mode) .context-menu-item-danger {
  color: #f87171;
}

:global(.dark-mode) .context-menu-item-danger:hover {
  background: rgba(248, 113, 113, 0.15);
}
</style>
