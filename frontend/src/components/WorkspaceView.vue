<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'

// 文件/文件夹节点类型
interface FileNode {
  name: string
  type: 'folder' | 'file'
  path: string
}

// 文件预览类型
const PreviewType = {
  TEXT: 'text',       // 代码/文本
  IMAGE: 'image',     // 图片
  PDF: 'pdf',         // PDF
  HTML: 'html',       // HTML
  AUDIO: 'audio',     // 音频
  VIDEO: 'video',     // 视频
  OFFICE: 'office',   // Office 文件（不支持直接预览）
  BINARY: 'binary'    // 二进制文件（不支持预览）
} as const

type PreviewTypeValue = typeof PreviewType[keyof typeof PreviewType]

// Markdown 渲染器
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})

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
const previewType = ref<PreviewTypeValue>(PreviewType.TEXT)
const previewBlobUrl = ref('') // 用于图片、PDF、音视频等 blob URL
const htmlPreviewIframe = ref<HTMLIFrameElement | null>(null) // HTML 预览 iframe 引用
const showMarkdownPreview = ref(false) // Markdown 预览模式开关

// 计算当前预览文件是否为 Markdown 文件
const isMarkdownFile = computed(() => {
  const ext = previewFileName.value.split('.').pop()?.toLowerCase() || ''
  return ext === 'md'
})

// 渲染 Markdown 内容
const renderedMarkdown = computed(() => {
  if (!previewContent.value || !showMarkdownPreview.value) return ''
  return md.render(previewContent.value)
})

// 计算是否在根目录
const isAtRoot = computed(() => {
  return currentPath.value === props.currentFolder || !currentPath.value
})

// 根据文件扩展名获取预览类型
function getPreviewType(fileName: string): PreviewTypeValue {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''

  // 图片类型
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']
  if (imageExts.includes(ext)) {
    return PreviewType.IMAGE
  }

  // PDF
  if (ext === 'pdf') {
    return PreviewType.PDF
  }

  // HTML
  if (ext === 'html' || ext === 'htm') {
    return PreviewType.HTML
  }

  // 音频
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']
  if (audioExts.includes(ext)) {
    return PreviewType.AUDIO
  }

  // 视频
  const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v']
  if (videoExts.includes(ext)) {
    return PreviewType.VIDEO
  }

  // Office 文件
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
  if (officeExts.includes(ext)) {
    return PreviewType.OFFICE
  }

  // 二进制文件（不支持预览）
  const binaryExts = ['exe', 'dll', 'so', 'dylib', 'bin', 'dat', 'db', 'sqlite', 'zip', 'tar', 'gz', '7z', 'rar']
  if (binaryExts.includes(ext)) {
    return PreviewType.BINARY
  }

  // 默认为文本类型
  return PreviewType.TEXT
}

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
  previewBlobUrl.value = ''
  previewLoading.value = true
  showFilePreview.value = true

  // 检测文件类型
  const fileType = getPreviewType(node.name)
  previewType.value = fileType

  try {
    // 图片、PDF、音视频：使用 blob URL
    if (fileType === PreviewType.IMAGE ||
        fileType === PreviewType.PDF ||
        fileType === PreviewType.AUDIO ||
        fileType === PreviewType.VIDEO) {
      // 通过 IPC 读取文件为 Buffer，然后创建 blob URL
      if (window.electronAPI?.readFileAsBuffer) {
        const result = await window.electronAPI.readFileAsBuffer(node.path)
        if (result.success && result.buffer) {
          const mimeType = getMimeType(node.name)
          const blob = new Blob([new Uint8Array(result.buffer)], { type: mimeType })
          previewBlobUrl.value = URL.createObjectURL(blob)
        } else {
          previewError.value = result.error || '读取文件失败'
        }
      } else {
        // 回退到使用 file:// 协议（Electron 环境）
        previewBlobUrl.value = `file://${node.path}`
      }
    }
    // HTML 文件：读取内容
    else if (fileType === PreviewType.HTML) {
      if (window.electronAPI?.previewFile) {
        const result = await window.electronAPI.previewFile(node.path, 10000)
        if (result.success && result.content !== undefined) {
          previewContent.value = result.content
        } else {
          previewError.value = result.error || '读取文件失败'
        }
      } else {
        previewError.value = '文件预览 API 不可用'
      }
    }
    // Office 文件和二进制文件：不读取内容
    else if (fileType === PreviewType.OFFICE) {
      // Office 文件不读取内容，显示提示
    }
    else if (fileType === PreviewType.BINARY) {
      // 二进制文件不读取内容，显示提示
    }
    // 文本文件：读取内容
    else {
      if (window.electronAPI?.previewFile) {
        const result = await window.electronAPI.previewFile(node.path, 500)

        if (result.success && result.content !== undefined) {
          previewContent.value = result.content
        } else {
          previewError.value = result.error || '读取文件失败'
        }
      } else {
        previewError.value = '文件预览 API 不可用'
      }
    }
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '读取文件失败'
    console.error('Failed to read file:', err)
  } finally {
    previewLoading.value = false
  }
}

// 获取 MIME 类型
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const mimeTypes: Record<string, string> = {
    // 图片
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'svg': 'image/svg+xml',
    // PDF
    'pdf': 'application/pdf',
    // 音频
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    'wma': 'audio/x-ms-wma',
    // 视频
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'm4v': 'video/x-m4v'
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

// 关闭预览
function closePreview() {
  showFilePreview.value = false
  previewContent.value = ''
  previewFileName.value = ''
  previewFilePath.value = ''
  previewError.value = ''
  showMarkdownPreview.value = false // 重置 Markdown 预览状态
  // 释放 blob URL
  if (previewBlobUrl.value && previewBlobUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(previewBlobUrl.value)
  }
  previewBlobUrl.value = ''
}

// 切换 Markdown 预览模式
function toggleMarkdownPreview() {
  showMarkdownPreview.value = !showMarkdownPreview.value
}

// 在系统中打开文件
async function openInSystem() {
  if (previewFilePath.value && window.electronAPI?.openPath) {
    try {
      await window.electronAPI.openPath(previewFilePath.value)
    } catch (err) {
      console.error('Failed to open file in system:', err)
    }
  }
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
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7.5C3 6.11929 4.11929 5 5.5 5H9.1C9.62919 5 10.1367 5.20982 10.5118 5.58397L11.7 6.77C12.0755 7.14483 12.5836 7.35517 13.1139 7.35517H18.5C19.8807 7.35517 21 8.47446 21 9.85517V17.5C21 18.8807 19.8807 20 18.5 20H5.5C4.11929 20 3 18.8807 3 17.5V7.5Z" fill="#F7C66A"/>
      <path d="M3 9.6C3 8.71634 3.71634 8 4.6 8H19.4C20.2837 8 21 8.71634 21 9.6V17.4C21 18.2837 20.2837 19 19.4 19H4.6C3.71634 19 3 18.2837 3 17.4V9.6Z" fill="#E8A93A"/>
      <path d="M3.75 9.5C3.75 8.80964 4.30964 8.25 5 8.25H19C19.6904 8.25 20.25 8.80964 20.25 9.5V17.25C20.25 17.9404 19.6904 18.5 19 18.5H5C4.30964 18.5 3.75 17.9404 3.75 17.25V9.5Z" stroke="#A96A12" stroke-width="1.2"/>
    </svg>`
  }

  const ext = node.name.split('.').pop()?.toLowerCase() || ''

  const createFileIcon = (color: string, label: string, innerPath: string) => `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2.75H13.7574C14.2214 2.75 14.6664 2.93437 14.9945 3.26256L18.7374 7.0055C19.0656 7.33369 19.25 7.77862 19.25 8.24264V18C19.25 19.7949 17.7949 21.25 16 21.25H7C5.20508 21.25 3.75 19.7949 3.75 18V6C3.75 4.20508 5.20508 2.75 7 2.75Z" fill="${color}18" stroke="${color}" stroke-width="1.2"/>
      <path d="M14 3V7C14 7.55228 14.4477 8 15 8H19" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${innerPath}
      <rect x="4.75" y="15.75" width="8.5" height="4" rx="1.2" fill="${color}"/>
      <text x="9" y="18.55" text-anchor="middle" font-size="3.2" font-weight="700" fill="#ffffff" font-family="Inter, Arial, sans-serif">${label}</text>
    </svg>
  `

  const fileIcons: Record<string, string> = {
    js: createFileIcon('#F7DF1E', 'JS', '<path d="M8 11.5L10.2 9.3L12.3 11.4L15.8 7.9" stroke="#B88B00" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    ts: createFileIcon('#3178C6', 'TS', '<path d="M8 11.8H15.8M8 9.2H12.5M8 14.4H13.6" stroke="#215A97" stroke-width="1.6" stroke-linecap="round"/>'),
    jsx: createFileIcon('#61DAFB', 'JSX', '<circle cx="11.8" cy="11.4" r="1.4" fill="#0B6D86"/><path d="M8.1 11.4C8.9 9.2 10.2 8.1 11.8 8.1C13.4 8.1 14.7 9.2 15.5 11.4C14.7 13.6 13.4 14.7 11.8 14.7C10.2 14.7 8.9 13.6 8.1 11.4Z" stroke="#0B6D86" stroke-width="1.2"/>'),
    tsx: createFileIcon('#149ECA', 'TSX', '<circle cx="11.8" cy="11.4" r="1.4" fill="#0C6280"/><path d="M8.1 11.4C8.9 9.2 10.2 8.1 11.8 8.1C13.4 8.1 14.7 9.2 15.5 11.4C14.7 13.6 13.4 14.7 11.8 14.7C10.2 14.7 8.9 13.6 8.1 11.4Z" stroke="#0C6280" stroke-width="1.2"/>'),
    vue: createFileIcon('#42B883', 'VUE', '<path d="M8 8.3L11 13.6L14 8.3H16.2L11 16L5.8 8.3H8Z" fill="#1D7E57"/><path d="M9.8 8.3L11 10.6L12.2 8.3H14L11 13.1L8 8.3H9.8Z" fill="#35495E"/>'),
    py: createFileIcon('#3776AB', 'PY', '<path d="M8.2 9.1C8.2 8.5 8.7 8 9.3 8H12.4C13 8 13.5 8.5 13.5 9.1V10.4C13.5 11 13 11.5 12.4 11.5H9.9" stroke="#24557E" stroke-width="1.4" stroke-linecap="round"/><path d="M15.8 13.7C15.8 14.3 15.3 14.8 14.7 14.8H11.6C11 14.8 10.5 14.3 10.5 13.7V12.4C10.5 11.8 11 11.3 11.6 11.3H14.1" stroke="#D2A22D" stroke-width="1.4" stroke-linecap="round"/><circle cx="10.3" cy="9.7" r="0.7" fill="#24557E"/><circle cx="13.7" cy="13.1" r="0.7" fill="#D2A22D"/>'),
    go: createFileIcon('#00ADD8', 'GO', '<path d="M8.2 11.6H13.3M14.6 11.6H15.9" stroke="#0B7285" stroke-width="1.5" stroke-linecap="round"/><circle cx="9.5" cy="9.4" r="0.7" fill="#0B7285"/><circle cx="13.1" cy="9.4" r="0.7" fill="#0B7285"/><path d="M8.4 13.9C9.3 14.7 10.4 15.1 11.8 15.1C13.2 15.1 14.4 14.7 15.2 13.9" stroke="#0B7285" stroke-width="1.4" stroke-linecap="round"/>'),
    rust: createFileIcon('#CE422B', 'RS', '<circle cx="11.8" cy="11.4" r="3.4" stroke="#7A2215" stroke-width="1.4"/><path d="M11.8 8.8V14M9.2 11.4H14.4" stroke="#7A2215" stroke-width="1.4" stroke-linecap="round"/>'),
    java: createFileIcon('#F89820', 'JV', '<path d="M10 14.7C10.8 15 11.7 15.2 12.7 15.2C13.8 15.2 14.7 15 15.5 14.5" stroke="#A85B05" stroke-width="1.4" stroke-linecap="round"/><path d="M12.6 8.1C13.6 9.1 12.1 9.9 12.1 10.9C12.1 11.4 12.4 11.8 12.9 12.2" stroke="#A85B05" stroke-width="1.4" stroke-linecap="round"/><path d="M10 12.8C10.6 13.4 11.5 13.7 12.7 13.7C13.9 13.7 14.8 13.4 15.4 12.8" stroke="#A85B05" stroke-width="1.4" stroke-linecap="round"/>'),
    css: createFileIcon('#264DE4', 'CSS', '<path d="M8.2 8.6H15.5L14.9 14.1L11.8 15.1L8.7 14.1L8.4 11.8H10.5L10.6 12.8L11.8 13.2L13.1 12.8L13.3 11.2H8.6L8.2 8.6Z" fill="#1939A8"/>'),
    scss: createFileIcon('#CD6799', 'SC', '<path d="M8.4 13.8C9.2 14.5 10.4 14.9 11.8 14.9C13.9 14.9 15.3 14 15.3 12.8C15.3 11.7 14.3 11.3 12.2 10.9C10.4 10.6 9.6 10.3 9.6 9.5C9.6 8.8 10.4 8.2 11.6 8.2C12.8 8.2 13.8 8.6 14.5 9.2" stroke="#8C3F64" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    less: createFileIcon('#2A4D80', 'LS', '<path d="M8.4 8.7V14.2H14.8" stroke="#1B3154" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.8 10.9H15.1" stroke="#1B3154" stroke-width="1.5" stroke-linecap="round"/>'),
    html: createFileIcon('#E34C26', 'HT', '<path d="M8.5 8.3L7.8 14.2L11.8 15.3L15.8 14.2L15.1 8.3H8.5Z" stroke="#9A2F14" stroke-width="1.4"/><path d="M10.1 10.3H13.5M10.4 12.2H13.2M11 14L12.7 13.5" stroke="#9A2F14" stroke-width="1.2" stroke-linecap="round"/>'),
    json: createFileIcon('#F59E0B', 'JSN', '<path d="M10 8.6C9.2 9.1 8.8 9.8 8.8 10.8C8.8 11.8 9.2 12.5 10 13M13.6 8.6C14.4 9.1 14.8 9.8 14.8 10.8C14.8 11.8 14.4 12.5 13.6 13" stroke="#A16207" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="10.8" r="0.9" fill="#A16207"/>'),
    yaml: createFileIcon('#EF4444', 'YML', '<path d="M9 8.5L11.7 11.4L14.4 8.5M11.7 11.5V14.4" stroke="#991B1B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    yml: createFileIcon('#EF4444', 'YML', '<path d="M9 8.5L11.7 11.4L14.4 8.5M11.7 11.5V14.4" stroke="#991B1B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    xml: createFileIcon('#0EA5E9', 'XML', '<path d="M9.6 9L7.8 11.4L9.6 13.8M14.4 9L16.2 11.4L14.4 13.8M12.9 8.3L11.1 14.5" stroke="#075985" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    toml: createFileIcon('#92400E', 'TM', '<path d="M8.7 9.2H14.9M11.8 9.2V14.2M9.6 14.2H14" stroke="#78350F" stroke-width="1.5" stroke-linecap="round"/>'),
    md: createFileIcon('#2563EB', 'MD', '<path d="M8.4 13.9V8.9L10.7 11.6L13 8.9V13.9M14.3 13.9H15.8M15.8 13.9L14.8 12.7M15.8 13.9L14.8 15.1" stroke="#1D4ED8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    txt: createFileIcon('#6B7280', 'TXT', '<path d="M8.6 9.1H15.2M8.6 11.5H15.2M8.6 13.9H12.8" stroke="#4B5563" stroke-width="1.4" stroke-linecap="round"/>'),
    pdf: createFileIcon('#DC2626', 'PDF', '<path d="M8.8 14V8.9H11.2C12.2 8.9 12.8 9.5 12.8 10.5C12.8 11.5 12.2 12.1 11.2 12.1H8.8M13.8 14V8.9H15.2C16.5 8.9 17.2 9.8 17.2 11.4C17.2 13 16.5 14 15.2 14H13.8" stroke="#991B1B" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    png: createFileIcon('#A855F7', 'IMG', '<circle cx="9.4" cy="9.5" r="1.1" fill="#6B21A8"/><path d="M8.2 14.1L10.5 11.8L12 13.3L14.8 10.5L16.1 11.8V14.1H8.2Z" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    jpg: createFileIcon('#A855F7', 'IMG', '<circle cx="9.4" cy="9.5" r="1.1" fill="#6B21A8"/><path d="M8.2 14.1L10.5 11.8L12 13.3L14.8 10.5L16.1 11.8V14.1H8.2Z" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    jpeg: createFileIcon('#A855F7', 'IMG', '<circle cx="9.4" cy="9.5" r="1.1" fill="#6B21A8"/><path d="M8.2 14.1L10.5 11.8L12 13.3L14.8 10.5L16.1 11.8V14.1H8.2Z" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    gif: createFileIcon('#A855F7', 'GIF', '<circle cx="9.4" cy="9.5" r="1.1" fill="#6B21A8"/><path d="M8.7 12.8H11.3V10.7H10" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.1 10.7H15.4M13.1 12.8H14.7" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round"/>'),
    svg: createFileIcon('#F59E0B', 'SVG', '<path d="M12 8.1L15.5 10.2V14.4L12 16.5L8.5 14.4V10.2L12 8.1Z" stroke="#B45309" stroke-width="1.3" stroke-linejoin="round"/><circle cx="12" cy="8.1" r="0.9" fill="#B45309"/>'),
    ico: createFileIcon('#A855F7', 'ICO', '<circle cx="9.4" cy="9.5" r="1.1" fill="#6B21A8"/><path d="M8.2 14.1L10.5 11.8L12 13.3L14.8 10.5L16.1 11.8V14.1H8.2Z" stroke="#6B21A8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'),
    zip: createFileIcon('#78716C', 'ZIP', '<path d="M11.8 8.2V14.7" stroke="#44403C" stroke-width="1.4" stroke-linecap="round"/><path d="M10.9 9.2H12.7M10.9 11.1H12.7M10.9 13H12.7" stroke="#44403C" stroke-width="1.2" stroke-linecap="round"/>'),
    tar: createFileIcon('#78716C', 'TAR', '<path d="M11.8 8.2V14.7" stroke="#44403C" stroke-width="1.4" stroke-linecap="round"/><path d="M10.9 9.2H12.7M10.9 11.1H12.7M10.9 13H12.7" stroke="#44403C" stroke-width="1.2" stroke-linecap="round"/>'),
    gz: createFileIcon('#78716C', 'GZ', '<path d="M11.8 8.2V14.7" stroke="#44403C" stroke-width="1.4" stroke-linecap="round"/><path d="M10.9 9.2H12.7M10.9 11.1H12.7M10.9 13H12.7" stroke="#44403C" stroke-width="1.2" stroke-linecap="round"/>'),
    '7z': createFileIcon('#78716C', '7Z', '<path d="M11.8 8.2V14.7" stroke="#44403C" stroke-width="1.4" stroke-linecap="round"/><path d="M10.9 9.2H12.7M10.9 11.1H12.7M10.9 13H12.7" stroke="#44403C" stroke-width="1.2" stroke-linecap="round"/>'),
    rar: createFileIcon('#78716C', 'RAR', '<path d="M11.8 8.2V14.7" stroke="#44403C" stroke-width="1.4" stroke-linecap="round"/><path d="M10.9 9.2H12.7M10.9 11.1H12.7M10.9 13H12.7" stroke="#44403C" stroke-width="1.2" stroke-linecap="round"/>'),
    sh: createFileIcon('#22C55E', 'SH', '<path d="M8.7 10.1L10.7 11.8L8.7 13.5M12.8 13.7H15.3" stroke="#166534" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    bash: createFileIcon('#22C55E', 'SH', '<path d="M8.7 10.1L10.7 11.8L8.7 13.5M12.8 13.7H15.3" stroke="#166534" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    zsh: createFileIcon('#22C55E', 'SH', '<path d="M8.7 10.1L10.7 11.8L8.7 13.5M12.8 13.7H15.3" stroke="#166534" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    sql: createFileIcon('#0F766E', 'SQL', '<ellipse cx="12" cy="9.2" rx="3.8" ry="1.7" stroke="#115E59" stroke-width="1.3"/><path d="M8.2 9.2V13C8.2 13.9 9.9 14.7 12 14.7C14.1 14.7 15.8 13.9 15.8 13V9.2" stroke="#115E59" stroke-width="1.3"/>'),
    db: createFileIcon('#0F766E', 'DB', '<ellipse cx="12" cy="9.2" rx="3.8" ry="1.7" stroke="#115E59" stroke-width="1.3"/><path d="M8.2 9.2V13C8.2 13.9 9.9 14.7 12 14.7C14.1 14.7 15.8 13.9 15.8 13V9.2" stroke="#115E59" stroke-width="1.3"/>'),
    ttf: createFileIcon('#52525B', 'FNT', '<path d="M9.2 9.1H14.8M12 9.1V14.4M10.4 11.8H13.6" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>'),
    woff: createFileIcon('#52525B', 'FNT', '<path d="M9.2 9.1H14.8M12 9.1V14.4M10.4 11.8H13.6" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>'),
    woff2: createFileIcon('#52525B', 'FNT', '<path d="M9.2 9.1H14.8M12 9.1V14.4M10.4 11.8H13.6" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>'),
    otf: createFileIcon('#52525B', 'FNT', '<path d="M9.2 9.1H14.8M12 9.1V14.4M10.4 11.8H13.6" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>'),
    eot: createFileIcon('#52525B', 'FNT', '<path d="M9.2 9.1H14.8M12 9.1V14.4M10.4 11.8H13.6" stroke="#27272A" stroke-width="1.4" stroke-linecap="round"/>')
  }

  return fileIcons[ext] || createFileIcon('#94A3B8', 'FILE', '<path d="M8.7 10.1H15.1M8.7 12.2H15.1M8.7 14.3H12.6" stroke="#64748B" stroke-width="1.4" stroke-linecap="round"/>')
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

// 监听 HTML 预览内容变化，更新 iframe
watch([previewContent, previewType, showFilePreview], async ([content, type, show]) => {
  if (show && type === PreviewType.HTML && content) {
    await nextTick()
    updateHtmlPreviewIframe()
  }
})

// 更新 HTML 预览 iframe 内容
function updateHtmlPreviewIframe() {
  if (!htmlPreviewIframe.value || !previewContent.value) return

  const doc = htmlPreviewIframe.value.contentDocument
  if (!doc) return

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          padding: 20px;
          line-height: 1.6;
          color: #333;
        }
        pre {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
        }
        code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
        }
        img {
          max-width: 100%;
        }
      </style>
    </head>
    <body>
      \${previewContent.value}
    </body>
    </html>
  `.replace('\\${previewContent.value}', previewContent.value))
  doc.close()
}

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
      <div></div>
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
        <div class="preview-dialog" :class="{ 'preview-dialog-image': previewType === PreviewType.IMAGE }">
          <div class="preview-header">
            <div class="preview-title">
              <span class="preview-filename">{{ previewFileName }}</span>
              <span class="preview-path" :title="previewFilePath">{{ previewFilePath }}</span>
            </div>
            <div class="preview-header-actions">
              <!-- Markdown 预览切换按钮 -->
              <button
                v-if="isMarkdownFile"
                class="preview-action-btn"
                @click="toggleMarkdownPreview"
                :title="showMarkdownPreview ? '查看源码' : 'Markdown 预览'"
                :class="{ 'active': showMarkdownPreview }"
              >
                <svg v-if="showMarkdownPreview" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M9 15l2 2 4-4"/>
                </svg>
              </button>
              <!-- 在系统打开按钮 -->
              <button class="preview-action-btn" @click="openInSystem" title="在系统中打开">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
              <button class="preview-close-btn" @click="closePreview" title="关闭">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
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
            <!-- 图片预览 -->
            <div v-else-if="previewType === PreviewType.IMAGE" class="preview-image-container">
              <img :src="previewBlobUrl" :alt="previewFileName" class="preview-image" />
            </div>
            <!-- PDF 预览 -->
            <div v-else-if="previewType === PreviewType.PDF" class="preview-pdf-container">
              <iframe :src="previewBlobUrl" class="preview-pdf-iframe" />
            </div>
            <!-- HTML 预览 -->
            <div v-else-if="previewType === PreviewType.HTML" class="preview-html-container">
              <iframe
                ref="htmlPreviewIframe"
                class="preview-html-iframe"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <!-- 音频预览 -->
            <div v-else-if="previewType === PreviewType.AUDIO" class="preview-audio-container">
              <div class="preview-media-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <audio :src="previewBlobUrl" controls class="preview-audio-player" />
            </div>
            <!-- 视频预览 -->
            <div v-else-if="previewType === PreviewType.VIDEO" class="preview-video-container">
              <video :src="previewBlobUrl" controls class="preview-video-player" />
            </div>
            <!-- Office 文件提示 -->
            <div v-else-if="previewType === PreviewType.OFFICE" class="preview-unsupported">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span class="preview-unsupported-title">Office 文件预览</span>
              <span class="preview-unsupported-desc">此文件类型暂不支持内嵌预览</span>
              <button class="preview-open-system-btn" @click="openInSystem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                在系统中打开
              </button>
            </div>
            <!-- 二进制文件提示 -->
            <div v-else-if="previewType === PreviewType.BINARY" class="preview-unsupported">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
              </svg>
              <span class="preview-unsupported-title">二进制文件</span>
              <span class="preview-unsupported-desc">此文件类型无法预览</span>
              <button class="preview-open-system-btn" @click="openInSystem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                在系统中打开
              </button>
            </div>
            <!-- Markdown 渲染预览 -->
            <div v-else-if="isMarkdownFile && showMarkdownPreview" class="preview-markdown" v-html="renderedMarkdown"></div>
            <!-- 文本/代码内容 -->
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
  padding: 11px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-primary);
}

.workspace-logo {
  height: 24px;
  width: auto;
}

.workspace-btns {
  display: flex;
  gap: 6px;
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
  background: transparent;
  border: none;
  box-shadow: none;
}

.refresh-btn:hover,
.open-folder-btn:hover {
  background: var(--color-bg-hover);
  border: none;
  box-shadow: none;
  transform: none;
}

.refresh-btn:active,
.open-folder-btn:active {
  transform: scale(0.95);
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
  color: #000000;
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-item.root:hover {
  color: #000000;
}

.breadcrumb-item span:not(.breadcrumb-separator) {
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-item span:not(.breadcrumb-separator):hover {
  color: #000000;
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
  /* background: var(--color-primary); */
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

/* 预览对话框头部操作按钮 */
.preview-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-action-btn {
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

.preview-action-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

/* 图片预览对话框调整 */
.preview-dialog-image {
  max-width: 95vw;
  max-height: 95vh;
  background: rgba(0, 0, 0, 0.9);
}

.preview-dialog-image .preview-header {
  background: rgba(0, 0, 0, 0.8);
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.preview-dialog-image .preview-filename,
.preview-dialog-image .preview-path {
  color: rgba(255, 255, 255, 0.9);
}

.preview-dialog-image .preview-action-btn,
.preview-dialog-image .preview-close-btn {
  color: rgba(255, 255, 255, 0.7);
}

.preview-dialog-image .preview-action-btn:hover,
.preview-dialog-image .preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.preview-dialog-image .preview-content {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

/* 图片预览 */
.preview-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 300px;
  max-height: calc(95vh - 70px);
}

.preview-image {
  max-width: 100%;
  max-height: calc(95vh - 70px);
  object-fit: contain;
}

/* PDF 预览 */
.preview-pdf-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.preview-pdf-iframe {
  width: 100%;
  height: 60vh;
  border: none;
  border-radius: 4px;
}

/* HTML 预览 */
.preview-html-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.preview-html-iframe {
  width: 100%;
  height: 60vh;
  border: none;
  border-radius: 4px;
  background: #fff;
}

/* 音频预览 */
.preview-audio-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px;
  min-height: 200px;
}

.preview-media-icon {
  color: var(--color-text-tertiary);
}

.preview-audio-player {
  width: 100%;
  max-width: 400px;
}

/* 视频预览 */
.preview-video-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 300px;
}

.preview-video-player {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
}

/* 不支持的文件类型提示 */
.preview-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 60px 40px;
  text-align: center;
}

.preview-unsupported svg {
  color: var(--color-text-tertiary);
}

.preview-unsupported-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.preview-unsupported-desc {
  font-size: 14px;
  color: var(--color-text-tertiary);
}

.preview-open-system-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 20px;
  color: var(--color-text-primary);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.preview-open-system-btn:hover {
  background: var(--color-primary-hover);
}

/* Markdown 预览按钮激活状态 */
.preview-action-btn.active {
  background: var(--color-primary);
  color: white;
}

/* Markdown 预览内容样式 */
.preview-markdown {
  padding: 16px;
  line-height: 1.8;
  font-size: 14px;
}

.preview-markdown :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--color-primary);
}

.preview-markdown :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 20px 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid var(--color-primary);
}

.preview-markdown :deep(h3) {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 16px 0 8px 0;
}

.preview-markdown :deep(h4) {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 12px 0 6px 0;
}

.preview-markdown :deep(p) {
  margin: 8px 0;
  color: var(--color-text-primary);
}

.preview-markdown :deep(ul),
.preview-markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.preview-markdown :deep(li) {
  margin: 4px 0;
  color: var(--color-text-primary);
}

.preview-markdown :deep(strong) {
  color: var(--color-text-primary);
  font-weight: 600;
}

.preview-markdown :deep(code) {
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Fira Code', 'Consolas', monospace;
  color: #e96900;
}

.preview-markdown :deep(pre) {
  background: var(--color-bg-tertiary);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 12px 0;
}

.preview-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  color: var(--color-text-primary);
}

.preview-markdown :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--color-primary);
  background: var(--color-bg-tertiary);
  border-radius: 0 8px 8px 0;
}

.preview-markdown :deep(blockquote p) {
  margin: 4px 0;
  color: var(--color-text-secondary);
}

.preview-markdown :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}

.preview-markdown :deep(a:hover) {
  text-decoration: underline;
}

.preview-markdown :deep(hr) {
  border: none;
  height: 1px;
  background: var(--color-border);
  margin: 20px 0;
}

.preview-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.preview-markdown :deep(th),
.preview-markdown :deep(td) {
  border: 1px solid var(--color-border);
  padding: 8px 12px;
  text-align: left;
}

.preview-markdown :deep(th) {
  background: var(--color-bg-tertiary);
  font-weight: 600;
}

.preview-markdown :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
</style>
