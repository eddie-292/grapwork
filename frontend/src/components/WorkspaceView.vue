<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { storage } from '../services/StorageService'

// 文件/文件夹节点类型
interface FileNode {
  name: string
  type: 'folder' | 'file'
  path: string
  children?: FileNode[]
  expanded?: boolean
}

// Props
interface Props {
  currentFolder?: string
}

const props = defineProps<Props>()

// 工作空间数据
const workspaceData = ref<FileNode | null>(null)
const loading = ref(false)
const error = ref('')

// 刷新工作空间
async function refreshWorkspace() {
  if (!props.currentFolder) {
    error.value = '请先选择一个文件夹'
    workspaceData.value = null
    return
  }

  loading.value = true
  error.value = ''

  try {
    if (window.electronAPI?.readDirectory) {
      const result = await window.electronAPI.readDirectory(props.currentFolder)

      if (result.success && result.items) {
        // 构建文件树
        const pathParts = props.currentFolder.split(/[/\\]/)
        const rootName = pathParts[pathParts.length - 1] || props.currentFolder

        workspaceData.value = {
          name: rootName,
          type: 'folder',
          path: props.currentFolder,
          expanded: true,
          children: result.items.map(item => ({
            name: item.name,
            type: item.type === 'directory' ? 'folder' : 'file',
            path: `${props.currentFolder}/${item.name}`,
            expanded: false,
            children: item.type === 'directory' ? [] : undefined
          }))
        }
      } else {
        error.value = result.error || '读取目录失败'
        workspaceData.value = null
      }
    } else {
      error.value = 'Electron API 不可用（仅在桌面应用中可用）'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取目录失败'
    console.error('Failed to read directory:', err)
  } finally {
    loading.value = false
  }
}

// 切换文件夹展开/收起
function toggleFolder(node: FileNode) {
  if (node.type === 'folder') {
    node.expanded = !node.expanded
  }
}

// 获取文件图标
function getFileIcon(node: FileNode): string {
  if (node.type === 'folder') {
    return node.expanded ? '📂' : '📁'
  }
  // 根据文件扩展名返回不同的图标
  const ext = node.name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    'md': '📝',
    'txt': '📄',
    'js': '📜',
    'ts': '📜',
    'json': '📋',
    'html': '🌐',
    'css': '🎨',
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'svg': '🎭',
    'pdf': '📕',
    'zip': '📦',
    'default': '📄'
  }
  return iconMap[ext || ''] || iconMap['default']
}

// 监听 currentFolder 变化
watch(() => props.currentFolder, () => {
  refreshWorkspace()
})

onMounted(() => {
  refreshWorkspace()
})

// 暴露刷新方法供父组件调用
defineExpose({
  refresh: refreshWorkspace
})
</script>

<template>
  <div class="workspace-container">
    <!-- 标题栏 -->
    <div class="workspace-header">
      <h3 class="workspace-title">我的工作空间</h3>
      <button class="refresh-btn" @click="refreshWorkspace" title="刷新" :disabled="loading || !currentFolder">
        <svg v-if="!loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <span>加载中...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <span>{{ error }}</span>
      <button v-if="currentFolder" class="retry-btn" @click="refreshWorkspace">重试</button>
    </div>

    <!-- 未选择目录 -->
    <div v-else-if="!currentFolder" class="empty-folder-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>请先在聊天界面选择一个文件夹</span>
    </div>

    <!-- 文件树 -->
    <div v-else-if="workspaceData" class="file-tree">
      <!-- 根节点 -->
      <div class="tree-node">
        <div
          class="tree-node-content is-folder"
          @click="toggleFolder(workspaceData!)"
        >
          <span class="node-icon">{{ getFileIcon(workspaceData) }}</span>
          <span class="node-name">{{ workspaceData.name }}</span>
        </div>

        <!-- 子节点 -->
        <div v-if="workspaceData.expanded && workspaceData.children" class="tree-children">
          <div
            v-for="child in workspaceData.children"
            :key="child.path"
            class="tree-node"
            :style="{ paddingLeft: '16px' }"
          >
            <div
              class="tree-node-content"
              :class="{ 'is-folder': child.type === 'folder' }"
              @click="child.type === 'folder' ? toggleFolder(child) : null"
            >
              <span class="node-icon">{{ getFileIcon(child) }}</span>
              <span class="node-name">{{ child.name }}</span>
            </div>

            <!-- 第二层子节点（占位，未来可扩展为递归加载） -->
            <div v-if="child.type === 'folder' && child.expanded && child.children" class="tree-children">
              <div
                v-for="grandchild in child.children"
                :key="grandchild.path"
                class="tree-node"
                :style="{ paddingLeft: '16px' }"
              >
                <div class="tree-node-content">
                  <span class="node-icon">{{ getFileIcon(grandchild) }}</span>
                  <span class="node-name">{{ grandchild.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 空目录 -->
        <div v-if="workspaceData.expanded && (!workspaceData.children || workspaceData.children.length === 0)" class="empty-directory">
          <span>空目录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.workspace-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333333;
}

.refresh-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999999;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #f3f4f6;
  color: #666666;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-state,
.error-state,
.empty-folder-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 12px;
  color: #9ca3af;
  font-size: 14px;
  text-align: center;
}

.error-state {
  color: #dc2626;
}

.retry-btn {
  padding: 6px 16px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #b91c1c;
}

.empty-folder-state svg {
  color: #d1d5db;
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.tree-node {
  user-select: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.tree-node-content:hover {
  background: #f3f4f6;
}

.tree-node-content.is-folder {
  color: #1890FF;
}

.node-icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.node-name {
  font-size: 14px;
  color: #000000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-children {
  /* 子节点通过 paddingLeft 实现缩进 */
}

.empty-directory {
  padding: 20px 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
</style>
