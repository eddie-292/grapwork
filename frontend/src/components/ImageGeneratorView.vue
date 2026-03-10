<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useImageGenerator } from '@/composables/useImageGenerator'
import { IMAGE_SIZE_OPTIONS, IMAGE_MODEL_OPTIONS } from '@/types/imageGenerator'
import type { ImageChatSession, OutputFile } from '@/types/imageGenerator'

const {
  configList,
  history,
  currentSession,
  activeConfig,
  isSending,
  loadConfig,
  loadHistory,
  saveConfig,
  createSession,
  switchSession,
  deleteSession,
  sendMessage,
  updateConfig,
  clearHistory,
  // 产出物相关
  outputs,
  loadOutputs,
  saveOutputs,
  deleteOutput
} = useImageGenerator()

// 输入框内容
const inputContent = ref('')

// 显示配置对话框
const showConfigDialog = ref(false)

// 消息列表容器引用
const messagesContainer = ref<HTMLElement | null>(null)

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听消息变化，自动滚动到底部
watch(
  () => currentSession.value?.messages.length,
  () => {
    scrollToBottom()
  }
)

// 初始化
onMounted(async () => {
  await loadConfig()
  await loadHistory()
  await loadOutputs()

  // 如果没有会话，创建一个新会话
  if (history.value.sessions.length === 0) {
    await createSession()
  }
})

// 发送消息
async function handleSend() {
  const content = inputContent.value.trim()
  if (!content || isSending.value) return

  inputContent.value = ''
  await sendMessage(content)
}

// 处理键盘事件
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// 创建新会话
async function handleNewSession() {
  await createSession()
}

// 切换会话
async function handleSwitchSession(session: ImageChatSession) {
  await switchSession(session.id)
}

// 删除会话
async function handleDeleteSession(sessionId: string, event: Event) {
  event.stopPropagation()
  if (confirm('确定要删除这个会话吗？')) {
    await deleteSession(sessionId)
  }
}

// 打开配置对话框
function openConfigDialog() {
  showConfigDialog.value = true
}

// 关闭配置对话框
function closeConfigDialog() {
  showConfigDialog.value = false
}

// 保存配置
async function handleSaveConfig() {
  if (activeConfig.value) {
    await updateConfig(configList.value.activeIndex, activeConfig.value)
  }
  closeConfigDialog()
}

// 快速设置变更（模型/尺寸）
async function handleQuickSettingChange() {
  await saveConfig()
}

// 清空历史
async function handleClearHistory() {
  if (confirm('确定要清空所有会话历史吗？')) {
    await clearHistory()
    await createSession()
  }
}

// 格式化时间
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取模型标签
function getModelLabel(value: string): string {
  const opt = IMAGE_MODEL_OPTIONS.find(o => o.value === value)
  return opt ? opt.label : value
}

// 获取尺寸标签
function getSizeLabel(value: string): string {
  const opt = IMAGE_SIZE_OPTIONS.find(o => o.value === value)
  return opt ? opt.label : value
}

// 图片预览
const previewImage = ref<string | null>(null)

// 打开图片预览
function openImagePreview(url: string) {
  previewImage.value = url
}

// 关闭图片预览
function closeImagePreview() {
  previewImage.value = null
}

// 下载图片
async function downloadImage(url: string) {
  try {
    const result = await window.electronAPI?.downloadImage(url)
    if (result?.cancelled) {
      // 用户取消了保存对话框，不做任何提示
      return
    }
    if (!result?.success) {
      alert(result?.error || '下载图片失败')
    }
  } catch (error) {
    console.error('下载图片失败:', error)
    alert('下载图片失败')
  }
}

// 打开产出物目录
async function openOutputsFolder() {
  try {
    await window.electronAPI?.openOutputsFolder()
  } catch (error) {
    console.error('打开产出物目录失败:', error)
  }
}

// 格式化产出物时间
function formatOutputTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 删除产出物
async function handleDeleteOutput(id: string, event: Event) {
  event.stopPropagation()

  // 二次确认
  if (!confirm('确定要删除这个产出物吗？\n本地文件也将被删除。')) {
    return
  }

  // 获取产出物信息
  const output = outputs.value.find(o => o.id === id)
  if (!output) return

  // 删除本地文件
  if (output.localPath) {
    try {
      await window.electronAPI?.deleteOutputFile(output.localPath)
    } catch (error) {
      console.error('删除文件失败:', error)
    }
  }

  // 从列表中移除
  await deleteOutput(id)
}

// 重新生成图片
async function handleRegenerate(messageId: string) {
  const session = currentSession.value
  if (!session || isSending.value) return

  const messages = session.messages
  const messageIndex = messages.findIndex(m => m.id === messageId)
  if (messageIndex === -1) return

  // 找到这条助手消息之前的用户消息
  for (let i = messageIndex - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.role === 'user') {
      // 重新发送该用户消息
      const userMessage = msg.content
      // 删除当前助手消息及之后的所有消息
      messages.splice(messageIndex)
      // 重新发送
      await sendMessage(userMessage)
      break
    }
  }
}

// 保存到产出物
async function handleSaveToOutputs(message: { images?: string[], prompt?: string, model?: string, size?: string }) {
  if (!message.images || message.images.length === 0) return

  const config = activeConfig.value
  const sessionId = currentSession.value?.id
  let hasNewOutput = false

  for (const imgUrl of message.images) {
    // 检查图片是否已存在于产出物列表中
    const existingOutput = outputs.value.find(o => o.originalUrl === imgUrl)
    if (existingOutput) {
      console.log('图片已存在于产出物中，跳过保存')
      continue
    }

    try {
      const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.png`
      const result = await window.electronAPI?.autoDownloadImage(imgUrl, filename)

      if (result?.success && result.path) {
        const outputFile: OutputFile = {
          id: generateId(),
          filename,
          localPath: result.path,
          originalUrl: imgUrl,
          prompt: message.prompt || '',
          model: message.model || config?.model || '',
          size: message.size || config?.size || '',
          sessionId: sessionId || '',
          createdAt: Date.now()
        }
        outputs.value.unshift(outputFile)
        hasNewOutput = true
      }
    } catch (error) {
      console.error('保存图片失败:', error)
    }
  }

  // 只有在有新产出物时才保存
  if (hasNewOutput) {
    await saveOutputs()
  }
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
</script>

<template>
  <div class="image-generator">
    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 左侧会话列表 -->
      <div class="sidebar">
        <div class="sidebar-header">
          <button class="new-session-btn" @click="handleNewSession">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            新会话
          </button>
        </div>

        <div class="session-list">
          <div
            v-for="session in history.sessions"
            :key="session.id"
            :class="['session-item', { active: session.id === history.activeSessionId }]"
            @click="handleSwitchSession(session)"
          >
            <span class="session-title">{{ session.title }}</span>
            <button class="delete-btn" @click="handleDeleteSession(session.id, $event)" title="删除会话">
              x
            </button>
          </div>
        </div>

        <div class="sidebar-footer">
          <button class="config-btn" @click="openConfigDialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            配置
          </button>
          <button class="clear-btn" @click="handleClearHistory" title="清空历史">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- 中间聊天区域 -->
      <div class="chat-area">
        <!-- 消息列表 -->
        <div ref="messagesContainer" class="messages-container">
          <div v-if="!currentSession || currentSession.messages.length === 0" class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
            <p>描述你想生成的图片</p>
            <p class="hint">例如：一只可爱的小猫咪，坐在阳光明媚的窗台上</p>
          </div>

          <div v-else class="messages">
            <div
              v-for="message in currentSession.messages"
              :key="message.id"
              :class="['message', message.role]"
            >
              <div class="message-header">
                <span class="role">{{ message.role === 'user' ? '你' : 'AI' }}</span>
                <span class="time">{{ formatTime(message.createdAt) }}</span>
              </div>
              <div class="message-content">{{ message.content }}</div>
              <!-- 用户消息显示参数 -->
              <div v-if="message.role === 'user' && (message.model || message.size)" class="message-params">
                <span v-if="message.model" class="param-tag">{{ getModelLabel(message.model) }}</span>
                <span v-if="message.size" class="param-tag">{{ getSizeLabel(message.size) }}</span>
              </div>
              <!-- 图片展示 -->
              <div v-if="message.images && message.images.length > 0" class="message-images">
                <div v-for="(img, index) in message.images" :key="index" class="image-item">
                  <img
                    :src="img"
                    :alt="`生成的图片 ${index + 1}`"
                    @click="openImagePreview(img)"
                  />
                  <div class="image-actions">
                    <button class="download-btn" @click="downloadImage(img)" title="下载图片">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <!-- 重新生成按钮 -->
              <button
                v-if="(message.images && message.images.length > 0) || message.error"
                class="regenerate-btn"
                @click="handleRegenerate(message.id)"
                :disabled="isSending"
                title="重新生成"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                重新生成
              </button>
              <!-- 保存到产出物按钮 -->
              <button
                v-if="message.images && message.images.length > 0"
                class="save-output-btn"
                @click="handleSaveToOutputs(message)"
                :disabled="isSending"
                title="保存到产出物"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2l2-3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                保存
              </button>
              <!-- 错误信息 -->
              <div v-if="message.error" class="message-error">
                {{ message.error }}
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <div class="input-container">
            <div class="input-toolbar">
              <div class="toolbar-item">
                <label>模型</label>
                <select v-model="activeConfig.model" class="toolbar-select" v-if="activeConfig" @change="handleQuickSettingChange">
                  <option v-for="opt in IMAGE_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="toolbar-item">
                <label>尺寸</label>
                <select v-model="activeConfig.size" class="toolbar-select" v-if="activeConfig" @change="handleQuickSettingChange">
                  <option v-for="opt in IMAGE_SIZE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="input-wrapper">
              <textarea
                v-model="inputContent"
                placeholder="描述你想生成的图片..."
                @keydown="handleKeydown"
                :disabled="isSending"
                rows="3"
              ></textarea>
            </div>
          </div>
          <button
            class="send-btn"
            @click="handleSend"
            :disabled="isSending || !inputContent.trim()"
          >
            <svg v-if="!isSending" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span v-else class="loading-spinner"></span>
          </button>
        </div>
      </div>

      <!-- 右侧产出物面板 -->
      <div class="outputs-panel">
        <div class="outputs-header">
          <span class="outputs-title">产出物</span>
          <button class="open-folder-btn" @click="openOutputsFolder" title="打开目录">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
        <div class="outputs-list">
          <div v-for="file in outputs" :key="file.id" class="output-item" @click="openImagePreview(file.originalUrl)">
            <img :src="file.originalUrl" class="output-thumb" :alt="file.prompt" />
            <div class="output-info">
              <span class="output-prompt">{{ file.prompt.slice(0, 40) }}{{ file.prompt.length > 40 ? '...' : '' }}</span>
              <span class="output-meta">{{ formatOutputTime(file.createdAt) }}</span>
            </div>
            <button class="delete-output-btn" @click="handleDeleteOutput(file.id, $event)" title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div v-if="outputs.length === 0" class="empty-outputs">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p>暂无产出物</p>
            <p class="hint">生成的图片将自动保存在这里</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 配置对话框 -->
    <div v-if="showConfigDialog" class="config-dialog-overlay" @click.self="closeConfigDialog">
      <div class="config-dialog">
        <div class="dialog-header">
          <h3>生图配置</h3>
          <button class="close-btn" @click="closeConfigDialog">×</button>
        </div>
        <div class="dialog-content" v-if="activeConfig">
          <div class="form-group">
            <label>配置名称</label>
            <input v-model="activeConfig.name" type="text" placeholder="配置名称" />
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="activeConfig.apiUrl" type="text" placeholder="https://open.bigmodel.cn/api/paas/v4/images/generations" />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input v-model="activeConfig.apiKey" type="password" placeholder="输入 API Key" />
          </div>
          <div class="form-group">
            <label>模型</label>
            <select v-model="activeConfig.model">
              <option v-for="opt in IMAGE_MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>图片尺寸</label>
            <select v-model="activeConfig.size">
              <option v-for="opt in IMAGE_SIZE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="cancel-btn" @click="closeConfigDialog">取消</button>
          <button class="save-btn" @click="handleSaveConfig">保存</button>
        </div>
      </div>
    </div>

    <!-- 图片预览 -->
    <div v-if="previewImage" class="image-preview-overlay" @click="closeImagePreview">
      <div class="image-preview-content" @click.stop>
        <button class="preview-close-btn" @click="closeImagePreview">×</button>
        <img :src="previewImage" alt="预览图片" />
        <div class="preview-actions">
          <button class="preview-download-btn" @click="downloadImage(previewImage)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            下载图片
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-generator {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-bg-primary, #ffffff);
  color: var(--color-text-primary, #1a1a1a);
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏 */
.sidebar {
  width: 20%;
  min-width: 180px;
  max-width: 250px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary, #f5f5f5);
  border-right: 1px solid var(--color-border, #e5e5e5);
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--color-border, #e5e5e5);
}

.new-session-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px dashed var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.15s ease;
}

.new-session-btn:hover {
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
  background: var(--color-bg-primary, #ffffff);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.session-item:hover {
  background: var(--color-bg-tertiary, #f0f0f0);
}

.session-item.active {
  background: var(--color-primary, #333);
  color: white;
}

.session-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.delete-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #888);
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.session-item.active .delete-btn {
  color: rgba(255, 255, 255, 0.6);
}

.session-item.active .delete-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--color-border, #e5e5e5);
  display: flex;
  gap: 8px;
}

.config-btn,
.clear-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  transition: all 0.15s ease;
}

.config-btn:hover,
.clear-btn:hover {
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
}

/* 聊天区域 */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #ffffff);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary, #888);
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  margin: 4px 0;
}

.hint {
  font-size: 13px;
  opacity: 0.7;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
}

.message.user {
  align-self: flex-end;
  background: var(--color-primary, #333);
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-primary, #1a1a1a);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  opacity: 0.7;
}

.message-content {
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
}

.message-params {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.param-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
  opacity: 0.85;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.message-images img {
  max-width: 300px;
  max-height: 300px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.message-images img:hover {
  transform: scale(1.02);
}

.image-item {
  position: relative;
}

.image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.image-item:hover .image-actions {
  opacity: 1;
}

.download-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.download-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.regenerate-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s ease;
}

.regenerate-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
  background: var(--color-bg-tertiary, #f0f0f0);
}

.regenerate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-output-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  margin-left: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s ease;
}

.save-output-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
  background: var(--color-bg-tertiary, #f0f0f0);
}

.save-output-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  color: #ef4444;
  font-size: 13px;
}

/* 输入区域 */
.input-area {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-primary, #ffffff);
}

.input-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
}

.toolbar-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-item label {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  white-space: nowrap;
}

.toolbar-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-primary, #1a1a1a);
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.toolbar-select:hover {
  border-color: var(--color-primary, #333);
}

.toolbar-select:focus {
  border-color: var(--color-primary, #333);
}

.input-wrapper {
  flex: 1;
  border-radius: 16px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-secondary, #f5f5f5);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input-wrapper:focus-within {
  border-color: var(--color-primary, #333);
  box-shadow: 0 0 0 3px rgba(51, 51, 51, 0.1);
}

.input-wrapper textarea {
  width: 100%;
  height: 100%;
  min-height: 48px;
  max-height: 200px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: var(--color-text-primary, #1a1a1a);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.input-wrapper textarea::placeholder {
  color: var(--color-text-tertiary, #888);
}

/* 自定义滚动条 */
.input-wrapper textarea::-webkit-scrollbar {
  width: 6px;
}

.input-wrapper textarea::-webkit-scrollbar-track {
  background: transparent;
}

.input-wrapper textarea::-webkit-scrollbar-thumb {
  background: var(--color-border, #ccc);
  border-radius: 3px;
}

.input-wrapper textarea::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary, #aaa);
}

.send-btn {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  border: none;
  background: var(--color-primary, #333);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(51, 51, 51, 0.3);
}

.send-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 产出物面板 */
.outputs-panel {
  width: 25%;
  min-width: 200px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary, #f5f5f5);
  border-left: 1px solid var(--color-border, #e5e5e5);
}

.outputs-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-primary, #ffffff);
}

.outputs-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #1a1a1a);
}

.open-folder-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.open-folder-btn:hover {
  border-color: var(--color-primary, #333);
  color: var(--color-primary, #333);
  background: var(--color-bg-tertiary, #f0f0f0);
}

.outputs-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.output-item {
  position: relative;
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-primary, #ffffff);
  border: 1px solid var(--color-border, #e5e5e5);
  cursor: pointer;
  transition: all 0.15s ease;
}

.output-item:hover {
  border-color: var(--color-primary, #333);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.output-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.output-info {
  padding: 8px 10px;
}

.output-prompt {
  font-size: 12px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary, #1a1a1a);
}

.output-meta {
  font-size: 11px;
  color: var(--color-text-tertiary, #888);
  margin-top: 4px;
  display: block;
}

.delete-output-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  cursor: pointer;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.output-item:hover .delete-output-btn {
  opacity: 1;
}

.delete-output-btn:hover {
  background: rgba(239, 68, 68, 0.9);
}

.empty-outputs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-tertiary, #888);
}

.empty-outputs svg {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-outputs p {
  margin: 4px 0;
  font-size: 13px;
}

.empty-outputs .hint {
  font-size: 12px;
  opacity: 0.7;
}

/* 配置对话框 */
.config-dialog-overlay {
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

.config-dialog {
  width: 400px;
  background: var(--color-bg-primary, #ffffff);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e5e5);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--color-bg-tertiary, #f0f0f0);
}

.dialog-content {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #666);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-primary, #1a1a1a);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--color-primary, #333);
}

.dialog-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e5e5e5);
  justify-content: flex-end;
}

.cancel-btn,
.save-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cancel-btn {
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-secondary, #666);
}

.cancel-btn:hover {
  background: var(--color-bg-tertiary, #f0f0f0);
}

.save-btn {
  background: var(--color-primary, #333);
  color: white;
}

.save-btn:hover {
  opacity: 0.9;
}

/* 深色模式 */
:global(.dark-mode) .image-generator {
  background: var(--color-bg-primary, #0d0d0d);
}

:global(.dark-mode) .title-bar {
  background: var(--color-bg-secondary, #1a1a1a);
  border-bottom-color: var(--color-border, #333);
}

:global(.dark-mode) .sidebar {
  background: var(--color-bg-secondary, #1a1a1a);
  border-right-color: var(--color-border, #333);
}

:global(.dark-mode) .session-item:hover {
  background: var(--color-bg-tertiary, #252525);
}

:global(.dark-mode) .session-item.active {
  background: var(--color-primary, #666);
}

:global(.dark-mode) .message.assistant {
  background: var(--color-bg-secondary, #1a1a1a);
}

:global(.dark-mode) .input-area textarea {
  background: transparent;
}

:global(.dark-mode) .input-wrapper {
  background: var(--color-bg-secondary, #1a1a1a);
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .input-wrapper:focus-within {
  border-color: var(--color-primary, #666);
  box-shadow: 0 0 0 3px rgba(102, 102, 102, 0.2);
}

:global(.dark-mode) .input-wrapper textarea::-webkit-scrollbar-thumb {
  background: var(--color-border, #444);
}

:global(.dark-mode) .input-wrapper textarea::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary, #666);
}

:global(.dark-mode) .toolbar-select {
  background: var(--color-bg-secondary, #1a1a1a);
  border-color: var(--color-border, #333);
  color: var(--color-text-primary, #e5e5e5);
}

:global(.dark-mode) .toolbar-select:hover,
:global(.dark-mode) .toolbar-select:focus {
  border-color: var(--color-primary, #666);
}

:global(.dark-mode) .config-dialog {
  background: var(--color-bg-primary, #0d0d0d);
}

:global(.dark-mode) .dialog-header,
:global(.dark-mode) .dialog-footer {
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .form-group input,
:global(.dark-mode) .form-group select {
  background: var(--color-bg-secondary, #1a1a1a);
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .outputs-panel {
  background: var(--color-bg-secondary, #1a1a1a);
  border-left-color: var(--color-border, #333);
}

:global(.dark-mode) .outputs-header {
  background: var(--color-bg-tertiary, #252525);
  border-bottom-color: var(--color-border, #333);
}

:global(.dark-mode) .open-folder-btn {
  border-color: var(--color-border, #333);
  color: var(--color-text-secondary, #888);
}

:global(.dark-mode) .open-folder-btn:hover {
  border-color: var(--color-primary, #666);
  color: var(--color-text-primary, #e5e5e5);
  background: var(--color-bg-tertiary, #333);
}

:global(.dark-mode) .output-item {
  background: var(--color-bg-tertiary, #252525);
  border-color: var(--color-border, #333);
}

:global(.dark-mode) .output-item:hover {
  border-color: var(--color-primary, #666);
}

:global(.dark-mode) .output-prompt {
  color: var(--color-text-primary, #e5e5e5);
}

/* 图片预览 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  cursor: pointer;
}

.image-preview-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 90%;
  max-height: 90%;
}

.image-preview-content img {
  max-width: 100%;
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.preview-close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.preview-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}

.preview-download-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.15s ease;
}

.preview-download-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
