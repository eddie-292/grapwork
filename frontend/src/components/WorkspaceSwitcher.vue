<script setup lang="ts">
import { ref } from 'vue'
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
  editingId.value = null
  editingName.value = ''
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
</script>

<template>
  <div class="workspace-switcher" @click="closeContextMenu">
    <!-- 可折叠标题 -->
    <div class="workspace-header" @click="toggleExpanded">
      <span class="header-title">工作空间</span>
      <ChevronDownIcon :size="16" :class="{ rotated: !isExpanded }" />
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
                @blur="finishRename(workspace.id)"
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

        <!-- 新建工作空间按钮 -->
        <button class="new-workspace-btn" @click="emit('create')">
          <PlusIcon :size="16" />
          <span>新建工作空间</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace-switcher {
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}

.workspace-header:hover {
  background: var(--color-bg-hover);
}

.header-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.workspace-header svg {
  color: var(--color-text-secondary);
  transition: transform 0.2s ease;
}

.workspace-header svg.rotated {
  transform: rotate(-90deg);
}

.workspace-list {
  padding: 4px 8px 8px;
}

.workspace-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 8px 8px 4px;
  margin-bottom: 2px;
  border-radius: 6px;
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
  height: 32px;
  border-radius: 2px;
  background: transparent;
  flex-shrink: 0;
  margin-top: 2px;
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
  gap: 2px;
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
  color: var(--color-text-secondary);
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
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  z-index: 100;
  min-width: 100px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--color-text-primary);
  background: none;
  border: none;
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

.new-workspace-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.new-workspace-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
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
