<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Workspace } from '@/types/workspace'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'
import PlusIcon from './icons/PlusIcon.vue'
import EditIcon from './icons/EditIcon.vue'
import TrashIcon from './icons/TrashIcon.vue'

const props = defineProps<{
  workspaces: Workspace[]
  activeId: string | null
}>()

const emit = defineEmits<{
  (e: 'switch', id: string): void
  (e: 'create'): void
  (e: 'rename', id: string, newName: string): void
  (e: 'delete', id: string): void
}>()

const isExpanded = ref(true)
const editingId = ref<string | null>(null)
const editingName = ref('')
const isEscaping = ref(false)
const contextMenuId = ref<string | null>(null)

// 截断路径显示
function truncatePath(path: string, maxLength: number = 25): string {
  if (!path) return ''
  if (path.length <= maxLength) return path
  // 保留最后部分
  return '...' + path.slice(-(maxLength - 3))
}

// 切换展开状态
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

// 选择工作空间
function selectWorkspace(id: string) {
  if (id !== props.activeId) {
    emit('switch', id)
  }
}

// 开始重命名
function startRename(workspace: Workspace) {
  editingId.value = workspace.id
  editingName.value = workspace.name
  contextMenuId.value = null
}

// 完成重命名
function finishRename(id: string) {
  if (editingName.value.trim()) {
    emit('rename', id, editingName.value.trim())
  }
  editingId.value = null
  editingName.value = ''
}

// 取消重命名
function cancelRename() {
  isEscaping.value = true
  editingId.value = null
  editingName.value = ''
}

// blur 处理（ESC 取消时不触发保存）
function handleBlur(id: string) {
  if (isEscaping.value) {
    isEscaping.value = false
    return
  }
  finishRename(id)
}

// 显示右键菜单
function showContextMenu(id: string, event: MouseEvent) {
  event.preventDefault()
  contextMenuId.value = contextMenuId.value === id ? null : id
}

// 删除工作空间
function handleDelete(id: string) {
  emit('delete', id)
  contextMenuId.value = null
}

// 关闭右键菜单（点击其他地方）
function closeContextMenu() {
  contextMenuId.value = null
}

const switcherRef = ref<HTMLElement | null>(null)

function handleDocumentClick(event: MouseEvent) {
  if (switcherRef.value && !switcherRef.value.contains(event.target as Node)) {
    contextMenuId.value = null
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    contextMenuId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="workspace-switcher" ref="switcherRef" @click="closeContextMenu">
    <!-- 可折叠标题 -->
    <div class="workspace-header" @click="toggleExpanded">
      <span class="header-title">工作空间</span>
      <div class="header-right">
        <button class="header-add-btn" @click.stop="emit('create')" title="新建工作空间">
          <PlusIcon :size="13" />
        </button>
        <ChevronDownIcon :size="13" :class="{ rotated: !isExpanded }" />
      </div>
    </div>

    <!-- 工作空间列表 -->
    <Transition name="collapse">
      <div v-if="isExpanded" class="workspace-list">
        <div
          v-for="workspace in workspaces"
          :key="workspace.id"
          :class="['workspace-item', { active: workspace.id === activeId }]"
          @click="selectWorkspace(workspace.id)"
          @contextmenu="showContextMenu(workspace.id, $event)"
        >
          <!-- 激活指示器 -->
          <div class="workspace-indicator" :class="{ active: workspace.id === activeId }"></div>

          <!-- 工作空间信息 -->
          <div class="workspace-info">
            <!-- 名称（可编辑） -->
            <div v-if="editingId === workspace.id" class="workspace-name-edit">
              <input
                v-model="editingName"
                @keyup.enter="finishRename(workspace.id)"
                @keyup.escape="cancelRename"
                @blur="handleBlur(workspace.id)"
                ref="editInput"
                autofocus
              />
            </div>
            <div v-else class="workspace-name">{{ workspace.name }}</div>

            <!-- 路径 -->
            <div class="workspace-path">{{ truncatePath(workspace.folderPath) }}</div>
          </div>

          <!-- 右键菜单 -->
          <Transition name="fade">
            <div v-if="contextMenuId === workspace.id" class="context-menu" @click.stop>
              <button class="context-menu-item" @click="startRename(workspace)">
                <EditIcon :size="14" />
                <span>重命名</span>
              </button>
              <button class="context-menu-item danger" @click="handleDelete(workspace.id)">
                <TrashIcon :size="14" />
                <span>删除</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace-switcher {
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 6px 14px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
  min-height: 30px;
}

.workspace-header:hover {
  background: var(--color-bg-hover);
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-add-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: background 0.15s, color 0.15s;
}

.header-add-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.workspace-header svg {
  color: var(--color-text-tertiary);
  transition: transform 0.2s ease;
}

.workspace-header svg.rotated {
  transform: rotate(-90deg);
}

.workspace-list {
  padding: 3px 6px 6px;
}

.workspace-item {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  margin-bottom: 1px;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.workspace-item:hover {
  background: var(--color-bg-hover);
}

.workspace-item.active {
  background: var(--color-bg-active);
}

.workspace-indicator {
  width: 3px;
  border-radius: 3px 0 0 3px;
  background: transparent;
  flex-shrink: 0;
  align-self: stretch;
  transition: background-color 0.15s;
}

.workspace-indicator.active {
  background: var(--color-primary);
}

.workspace-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 8px 7px 7px;
}

.workspace-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-name-edit input {
  width: 100%;
  font-size: 13px;
  font-weight: 500;
  padding: 2px 4px;
  border: 1px solid var(--color-primary);
  border-radius: 3px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  outline: none;
}

.workspace-path {
  font-size: 11px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px;
  z-index: 100;
  min-width: 110px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-primary);
  background: none;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.context-menu-item:hover {
  background: var(--color-bg-hover);
}

.context-menu-item.danger {
  color: var(--color-danger);
}

.context-menu-item.danger:hover {
  background: var(--color-danger-bg);
}

/* 折叠动画 */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
