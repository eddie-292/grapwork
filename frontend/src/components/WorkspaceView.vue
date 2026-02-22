<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { storage } from '../services/StorageService'

// 文件/文件夹节点类型
interface FileNode {
  name: string
  type: 'folder' | 'file'
  path: string
}

// Props
interface Props {
  currentFolder?: string
}

const props = defineProps<Props>()

// 当前路径和文件列表
const currentPath = ref('')
const currentPathName = ref('')
const fileNodes = ref<FileNode[]>([])
const loading = ref(false)
const error = ref('')

// 面包屑导航路径（相对于根目录的层级路径）
const breadcrumbs = ref<Array<{ name: string; path: string }>>([])

// 文件预览状态
const showFilePreview = ref(false)
const previewFileName = ref('')
const previewFilePath = ref('')
const previewContent = ref('')
const previewLoading = ref(false)
const previewError = ref('')

// 计算是否在根目录
const isAtRoot = computed(() => {
  return currentPath.value === props.currentFolder || !currentPath.value
})

// 重置工作空间状态（当选择新文件夹时调用）
function resetWorkspace() {
  currentPath.value = ''
  currentPathName.value = ''
  fileNodes.value = []
  breadcrumbs.value = []
  error.value = ''
  // 关闭预览
  showFilePreview.value = false
  previewContent.value = ''
  previewFileName.value = ''
  previewFilePath.value = ''
}

// 加载指定目录
async function loadDirectory(dirPath: string, addToBreadcrumb = false) {
  loading.value = true
  error.value = ''

  try {
    if (window.electronAPI?.readDirectory) {
      const result = await window.electronAPI.readDirectory(dirPath)

      if (result.success && result.items) {
        const pathParts = dirPath.split(/[/\\]/)
        const dirName = pathParts[pathParts.length - 1] || dirPath

        currentPath.value = dirPath
        currentPathName.value = dirName

        // 分离文件夹和文件，并排序
        const nodes = result.items.map(item => ({
          name: item.name,
          type: item.type === 'directory' ? 'folder' as const : 'file' as const,
          path: `${dirPath}/${item.name}`
        }))

        // 文件夹在前，文件在后，各自按字母排序
        nodes.sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name)
          }
          return a.type === 'folder' ? -1 : 1
        })

        fileNodes.value = nodes

        // 添加到面包屑
        if (addToBreadcrumb) {
          breadcrumbs.value.push({ name: dirName, path: dirPath })
        }
      } else {
        error.value = result.error || '读取目录失败'
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

// 进入文件夹
function enterFolder(node: FileNode) {
  if (node.type === 'folder') {
    loadDirectory(node.path, true)
  } else {
    // 点击文件时预览
    previewFile(node)
  }
}

// 预览文件
async function previewFile(node: FileNode) {
  previewFileName.value = node.name
  previewFilePath.value = node.path
  previewContent.value = ''
  previewError.value = ''
  previewLoading.value = true
  showFilePreview.value = true

  try {
    if (window.electronAPI?.fileOperation) {
      const result = await window.electronAPI.fileOperation('read_file', {
        path: node.path,
        start_line: 0,
        end_line: 500 // 限制读取行数
      })

      if (result.success && result.content !== undefined) {
        previewContent.value = result.content
      } else {
        previewError.value = result.error || '读取文件失败'
      }
    } else {
      previewError.value = '文件操作 API 不可用'
    }
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '读取文件失败'
    console.error('Failed to read file:', err)
  } finally {
    previewLoading.value = false
  }
}

// 关闭预览
function closePreview() {
  showFilePreview.value = false
  previewContent.value = ''
  previewFileName.value = ''
  previewFilePath.value = ''
  previewError.value = ''
}

// 返回上级目录
function goUpDirectory() {
  if (!currentPath.value || isAtRoot.value) return

  // 从当前路径计算上级目录
  const pathParts = currentPath.value.split(/[/\\]/)
  pathParts.pop() // 移除最后一部分

  const parentPath = pathParts.join('/')

  // 检查是否回到了根目录
  if (parentPath === props.currentFolder || !parentPath) {
    // 回到根目录
    loadDirectory(props.currentFolder || '', false)
    breadcrumbs.value = []
  } else {
    // 移除面包屑最后一项并加载上级目录
    breadcrumbs.value.pop()
    loadDirectory(parentPath, false)
  }
}

// 通过面包屑导航到指定目录
function navigateToBreadcrumb(index: number) {
  if (index === -1) {
    // 返回根目录
    loadDirectory(props.currentFolder || '', false)
    breadcrumbs.value = []
  } else {
    // 导航到指定层级
    const target = breadcrumbs.value[index]
    if (target) {
      // 移除后面的层级
      breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
      loadDirectory(target.path, false)
    }
  }
}

// 获取文件 SVG 图标
function getFileIcon(node: FileNode) {
  if (node.type === 'folder') {
    // 文件夹图标
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>`
  }

  const ext = node.name.split('.').pop()?.toLowerCase()

  // 不同文件类型的 SVG 图标
  const icons: Record<string, string> = {
    // 代码文件
    'js': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f7df1e" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#f7df1e" fill-opacity="0.1"/>
      <path d="M6 8l2 8M16 8l-2 8M10 13h4" stroke="#f7df1e"/>
    </svg>`,
    'ts': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3178c6" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#3178c6" fill-opacity="0.1"/>
      <path d="M8 12h8M8 8h4M12 16h4" stroke="#3178c6"/>
    </svg>`,
    'jsx': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#61dafb" stroke-width="2">
      <circle cx="12" cy="12" r="2" fill="#61dafb" fill-opacity="0.2"/>
      <path d="M12 6c6 0 9 3 9 6s-3 6-9 6-9-3-9-6 3-6 9-6z" stroke="#61dafb"/>
      <path d="M12 18v-6M12 12l4-3M12 12l-4-3" stroke="#61dafb"/>
    </svg>`,
    'tsx': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#61dafb" stroke-width="2">
      <circle cx="12" cy="12" r="2" fill="#61dafb" fill-opacity="0.2"/>
      <path d="M12 6c6 0 9 3 9 6s-3 6-9 6-9-3-9-6 3-6 9-6z" stroke="#61dafb"/>
      <path d="M12 18v-6M12 12l4-3M12 12l-4-3" stroke="#61dafb"/>
    </svg>`,
    'vue': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#42b883" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#42b883" fill-opacity="0.2"/>
      <path d="M2 7l10 10 10-10M2 17l10 5 10-5" stroke="#42b883"/>
    </svg>`,
    'py': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3776ab" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#3776ab" fill-opacity="0.1"/>
      <path d="M8 8h8M8 12h6M8 16h4" stroke="#3776ab"/>
      <circle cx="16" cy="16" r="2" fill="#ffd43b"/>
    </svg>`,
    'go': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00add8" stroke-width="2">
      <circle cx="12" cy="12" r="8" fill="#00add8" fill-opacity="0.1"/>
      <path d="M8 12l4 4M16 12l-4-4M12 8v8" stroke="#00add8"/>
    </svg>`,
    'rust': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2">
      <circle cx="12" cy="12" r="9" fill="#000" fill-opacity="0.1"/>
      <path d="M12 6v12M6 12h12M8 8l8 8M16 8l-8 8" stroke="#000"/>
    </svg>`,
    'java': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f89820" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#f89820" fill-opacity="0.1"/>
      <path d="M8 6c0-2 2-3 4-3s4 1 4 3v2c0 2-2 3-4 3s-4-1-4-3V6z" stroke="#f89820"/>
      <path d="M7 11v2c0 3 2 5 5 5s5-2 5-5v-2" stroke="#f89820"/>
    </svg>`,

    // 样式文件
    'css': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#264de4" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#264de4" fill-opacity="0.1"/>
      <path d="M8 8h8M7 12l2 4 8-2M7 18l2-4 8 2" stroke="#264de4"/>
    </svg>`,
    'scss': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cd6799" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#cd6799" fill-opacity="0.1"/>
      <path d="M12 6v12M8 10h8M8 14h6" stroke="#cd6799"/>
    </svg>`,
    'less': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2a4d80" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2a4d80" fill-opacity="0.1"/>
      <path d="M6 8h12v3H6zM6 13h9v3H6z" stroke="#2a4d80"/>
    </svg>`,

    // Web 文件
    'html': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e34c26" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#e34c26" fill-opacity="0.1"/>
      <path d="M8 6l-2 12 6 2 6-2-2-12" stroke="#e34c26"/>
      <path d="M12 8v9M10 10h4M10 14h3" stroke="#e34c26"/>
    </svg>`,

    // 配置文件
    'json': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f7df1e" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#f7df1e" fill-opacity="0.1"/>
      <path d="M8 7h3M13 7h3M8 12h3M13 12h3M8 17h3M13 17h3" stroke="#f7df1e"/>
    </svg>`,
    'yaml': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cb171e" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#cb171e" fill-opacity="0.1"/>
      <path d="M8 7h8M8 12h6M8 17h5" stroke="#cb171e"/>
    </svg>`,
    'yml': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cb171e" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#cb171e" fill-opacity="0.1"/>
      <path d="M8 7h8M8 12h6M8 17h5" stroke="#cb171e"/>
    </svg>`,
    'xml': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0060ac" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#0060ac" fill-opacity="0.1"/>
      <path d="M7 6l3 6-3 6M17 6l-3 6 3 6" stroke="#0060ac"/>
    </svg>`,
    'toml': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9c4221" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#9c4221" fill-opacity="0.1"/>
      <path d="M8 7h8M8 12h6M8 17h4" stroke="#9c4221"/>
    </svg>`,

    // Markdown 和文档
    'md': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#083fa1" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#083fa1" fill-opacity="0.1"/>
      <path d="M8 7h8M8 12h8M8 17h5" stroke="#083fa1"/>
    </svg>`,
    'txt': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#6b7280" fill-opacity="0.1"/>
      <path d="M8 7h8M8 12h8M8 17h5" stroke="#6b7280"/>
    </svg>`,
    'pdf': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f40f02" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#f40f02" fill-opacity="0.1"/>
      <path d="M8 6v12h8V6H8z" stroke="#f40f02"/>
      <path d="M10 9h4M10 12h4M10 15h3" stroke="#f40f02"/>
    </svg>`,

    // 图片文件
    'png': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a049f7" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#a049f7" fill-opacity="0.1"/>
      <circle cx="8" cy="8" r="2" fill="#a049f7" fill-opacity="0.3"/>
      <path d="M2 18l6-6 4 4 6-8 4 4v6H2z" stroke="#a049f7"/>
    </svg>`,
    'jpg': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a049f7" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#a049f7" fill-opacity="0.1"/>
      <circle cx="8" cy="8" r="2" fill="#a049f7" fill-opacity="0.3"/>
      <path d="M2 18l6-6 4 4 6-8 4 4v6H2z" stroke="#a049f7"/>
    </svg>`,
    'jpeg': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a049f7" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#a049f7" fill-opacity="0.1"/>
      <circle cx="8" cy="8" r="2" fill="#a049f7" fill-opacity="0.3"/>
      <path d="M2 18l6-6 4 4 6-8 4 4v6H2z" stroke="#a049f7"/>
    </svg>`,
    'gif': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a049f7" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#a049f7" fill-opacity="0.1"/>
      <circle cx="8" cy="8" r="2" fill="#a049f7" fill-opacity="0.3"/>
      <path d="M2 18l6-6 4 4 6-8 4 4v6H2z" stroke="#a049f7"/>
    </svg>`,
    'svg': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffb13b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#ffb13b" fill-opacity="0.1"/>
      <circle cx="12" cy="12" r="6" stroke="#ffb13b"/>
      <path d="M12 8v4l2 2" stroke="#ffb13b"/>
    </svg>`,
    'ico': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a049f7" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#a049f7" fill-opacity="0.1"/>
      <circle cx="8" cy="8" r="2" fill="#a049f7" fill-opacity="0.3"/>
      <path d="M2 18l6-6 4 4 6-8 4 4v6H2z" stroke="#a049f7"/>
    </svg>`,

    // 压缩文件
    'zip': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c7c7c" stroke-width="2">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#7c7c7c" fill-opacity="0.1"/>
      <path d="M10 2v4M14 2v4M10 6h4M10 8h4M10 10h4" stroke="#7c7c7c"/>
    </svg>`,
    'tar': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c7c7c" stroke-width="2">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#7c7c7c" fill-opacity="0.1"/>
      <path d="M10 2v4M14 2v4M10 6h4M10 8h4M10 10h4" stroke="#7c7c7c"/>
    </svg>`,
    'gz': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c7c7c" stroke-width="2">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#7c7c7c" fill-opacity="0.1"/>
      <path d="M10 2v4M14 2v4M10 6h4M10 8h4M10 10h4" stroke="#7c7c7c"/>
    </svg>`,
    '7z': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c7c7c" stroke-width="2">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#7c7c7c" fill-opacity="0.1"/>
      <path d="M10 2v4M14 2v4M10 6h4M10 8h4M10 10h4" stroke="#7c7c7c"/>
    </svg>`,
    'rar': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c7c7c" stroke-width="2">
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#7c7c7c" fill-opacity="0.1"/>
      <path d="M10 2v4M14 2v4M10 6h4M10 8h4M10 10h4" stroke="#7c7c7c"/>
    </svg>`,

    // Shell 脚本
    'sh': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#89e051" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#89e051" fill-opacity="0.1"/>
      <path d="M6 8l-2 4 2 4M16 8l2 4-2 4" stroke="#89e051"/>
      <path d="M14 7l-4 10" stroke="#89e051"/>
    </svg>`,
    'bash': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#89e051" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#89e051" fill-opacity="0.1"/>
      <path d="M6 8l-2 4 2 4M16 8l2 4-2 4" stroke="#89e051"/>
      <path d="M14 7l-4 10" stroke="#89e051"/>
    </svg>`,
    'zsh': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#89e051" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#89e051" fill-opacity="0.1"/>
      <path d="M6 8l-2 4 2 4M16 8l2 4-2 4" stroke="#89e051"/>
      <path d="M14 7l-4 10" stroke="#89e051"/>
    </svg>`,

    // 数据库
    'sql': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00758f" stroke-width="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="#00758f"/>
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#00758f"/>
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="#00758f"/>
    </svg>`,
    'db': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00758f" stroke-width="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="#00758f"/>
      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#00758f"/>
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="#00758f"/>
    </svg>`,

    // 字体文件
    'ttf': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2b2b2b" fill-opacity="0.1"/>
      <path d="M8 18l3-12h2l3 12M10 13h4" stroke="#2b2b2b"/>
    </svg>`,
    'woff': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2b2b2b" fill-opacity="0.1"/>
      <path d="M8 18l3-12h2l3 12M10 13h4" stroke="#2b2b2b"/>
    </svg>`,
    'woff2': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2b2b2b" fill-opacity="0.1"/>
      <path d="M8 18l3-12h2l3 12M10 13h4" stroke="#2b2b2b"/>
    </svg>`,
    'otf': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2b2b2b" fill-opacity="0.1"/>
      <path d="M8 18l3-12h2l3 12M10 13h4" stroke="#2b2b2b"/>
    </svg>`,
    'eot': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b2b2b" stroke-width="2">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#2b2b2b" fill-opacity="0.1"/>
      <path d="M8 18l3-12h2l3 12M10 13h4" stroke="#2b2b2b"/>
    </svg>`,

    // 其他
    'default': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>`
  }

  return icons[ext || ''] || icons['default']
}

// 刷新工作空间
async function refreshWorkspace() {
  // 刷新当前路径，而不是回到根目录
  const pathToRefresh = currentPath.value || props.currentFolder
  if (pathToRefresh) {
    await loadDirectory(pathToRefresh, false)
  } else {
    error.value = '选择一个文件夹作为工作空间'
    fileNodes.value = []
  }
}

// 在系统文件管理器中打开当前目录
async function openCurrentDirectory() {
  const pathToOpen = currentPath.value || props.currentFolder
  if (pathToOpen && window.electronAPI?.openPath) {
    try {
      await window.electronAPI.openPath(pathToOpen)
    } catch (err) {
      console.error('Failed to open directory:', err)
    }
  }
}

// 监听 currentFolder 变化（选择新文件夹时重置状态）
watch(() => props.currentFolder, (newFolder, oldFolder) => {
  // 当文件夹路径变化时，重置工作空间并加载新目录
  if (newFolder !== oldFolder) {
    resetWorkspace()
    if (newFolder) {
      loadDirectory(newFolder, false)
    }
  }
})

onMounted(() => {
  if (props.currentFolder) {
    loadDirectory(props.currentFolder, false)
  }
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
      <h3 class="workspace-title"></h3>
      <div class="workspace-btns">
        <!-- 返回上级目录 -->
        <button
          class="refresh-btn"
          @click="goUpDirectory"
          title="返回上级目录"
          :disabled="loading || !currentFolder || isAtRoot"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <!-- 刷新 -->
        <button class="refresh-btn" @click="refreshWorkspace" title="刷新" :disabled="loading || !currentFolder">
          <svg v-if="!loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
            <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/>
          </svg>
        </button>
        <!-- 在文件管理器中打开 -->
        <button class="refresh-btn" @click="openCurrentDirectory" title="在文件管理器中打开" :disabled="!currentFolder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <path d="M12 11v6M9 14h6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 面包屑导航 -->
    <div v-if="currentPath" class="breadcrumb-nav">
      <span class="breadcrumb-item root" @click="navigateToBreadcrumb(-1)">
        <span>根目录</span>
      </span>
      <template v-if="breadcrumbs.length > 0">
        <span v-for="(crumb, index) in breadcrumbs" :key="index" class="breadcrumb-item">
          <span class="breadcrumb-separator">/</span>
          <span @click="navigateToBreadcrumb(index)">{{ crumb.name }}</span>
        </span>
      </template>
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
      <span>选择一个文件夹作为工作空间</span>
    </div>

    <!-- 文件列表 -->
    <div v-else class="file-list">
      <!-- 当前目录名称 -->
      <div class="current-dir-name">{{ currentPathName }}</div>

      <!-- 文件节点 -->
      <div
        v-for="node in fileNodes"
        :key="node.path"
        class="file-node"
        :class="{ 'is-folder': node.type === 'folder', 'is-file': node.type === 'file' }"
        @click="enterFolder(node)"
      >
        <span class="node-icon" v-html="getFileIcon(node)"></span>
        <span class="node-name">{{ node.name }}</span>
      </div>

      <!-- 空目录 -->
      <div v-if="fileNodes.length === 0" class="empty-directory">
        <span>此目录为空</span>
      </div>
    </div>

    <!-- 文件预览对话框 -->
    <Transition name="fade">
      <div v-if="showFilePreview" class="preview-overlay" @click.self="closePreview">
        <div class="preview-dialog">
          <div class="preview-header">
            <div class="preview-title">
              <span class="preview-filename">{{ previewFileName }}</span>
              <span class="preview-path" :title="previewFilePath">{{ previewFilePath }}</span>
            </div>
            <button class="preview-close-btn" @click="closePreview" title="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="preview-content">
            <!-- 加载中 -->
            <div v-if="previewLoading" class="preview-loading">
              <svg class="spinning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32" stroke-linecap="round"/>
              </svg>
              <span>加载中...</span>
            </div>
            <!-- 错误 -->
            <div v-else-if="previewError" class="preview-error">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ previewError }}</span>
            </div>
            <!-- 内容 -->
            <pre v-else class="preview-code">{{ previewContent }}</pre>
          </div>
        </div>
      </div>
    </Transition>
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
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.workspace-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333333;
}

.workspace-btns {
  display: flex;
}

/* refresh-btn styles moved to global style.css */
.refresh-btn,
.open-folder-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

/* 面包屑导航 */
.breadcrumb-nav {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  overflow-x: auto;
  white-space: nowrap;
  gap: 4px;
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) transparent;
}

.breadcrumb-nav::-webkit-scrollbar {
  height: 4px;
}

.breadcrumb-nav::-webkit-scrollbar-track {
  background: transparent;
}

.breadcrumb-nav::-webkit-scrollbar-thumb {
  background-color: var(--color-border-hover);
  border-radius: 2px;
}

.breadcrumb-nav::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-tertiary);
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  color: var(--color-text-secondary);
}

.breadcrumb-item.root {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #0f8f6d;
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-item.root:hover {
  color: #0f8f6d;
}

.breadcrumb-item span:not(.breadcrumb-separator) {
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-item span:not(.breadcrumb-separator):hover {
  color: #0f8f6d;
}

.breadcrumb-separator {
  margin: 0 4px;
  color: var(--color-border-hover);
  cursor: default;
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
  color: var(--color-text-tertiary);
  font-size: 14px;
  text-align: center;
}

.error-state {
  color: #dc2626;
}

/* retry-btn styles moved to global style.css */

.empty-folder-state svg {
  color: var(--color-border-hover);
}

.file-list {
  height: calc(100vh - 153px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 12px 8px 8px;
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover) transparent;
}

.file-list::-webkit-scrollbar {
  width: 6px;
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background-color: var(--color-border-hover);
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-tertiary);
}

.current-dir-name {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.file-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: default;
  transition: background 0.15s;
  border-radius: 6px;
  margin: 0 4px;
}

.file-node:hover {
  background: var(--color-bg-tertiary);
}

.file-node.is-folder {
  cursor: pointer;
}

.file-node.is-folder:hover {
  background: var(--color-primary);
}

.node-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.node-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.node-name {
  font-size: 14px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-node.is-file {
  cursor: pointer;
}

.file-node.is-file:hover {
  background: var(--color-bg-tertiary);
}

.empty-directory {
  padding: 40px 12px;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

/* 文件预览对话框 */
.preview-overlay {
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
}

.preview-dialog {
  background: var(--color-bg-primary);
  border-radius: 12px;
  width: 80%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.preview-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.preview-filename {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.preview-path {
  font-size: 12px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.preview-close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
  min-height: 200px;
}

.preview-loading,
.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--color-text-tertiary);
}

.preview-error {
  color: #dc2626;
}

.preview-code {
  margin: 0;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
  color: var(--color-text-primary);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-active .preview-dialog,
.fade-leave-active .preview-dialog {
  transition: transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .preview-dialog,
.fade-leave-to .preview-dialog {
  transform: scale(0.95);
}

/* spinning 动画 */
.preview-loading svg.spinning {
  animation: spin 1s linear infinite;
}
</style>
