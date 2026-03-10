<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useImageGenerator } from '@/composables/useImageGenerator'
import { IMAGE_SIZE_OPTIONS, IMAGE_MODEL_OPTIONS } from '@/types/imageGenerator'
import type { ImageChatSession } from '@/types/imageGenerator'

const {
  configList,
  history,
  currentSession,
  activeConfig,
  isSending,
  loadConfig,
  loadHistory,
  createSession,
  switchSession,
  deleteSession,
  sendMessage,
  updateConfig,
  clearHistory
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

// 初始化
onMounted(async () => {
  await loadConfig()
  await loadHistory()

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
  scrollToBottom()
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
  await deleteSession(sessionId)
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
    // 如果是 base64 格式
    if (url.startsWith('data:')) {
      const link = document.createElement('a')
      link.href = url
      link.download = `image_${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      // 远程 URL，先获取再下载
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `image_${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    }
  } catch (error) {
    console.error('下载图片失败:', error)
    alert('下载图片失败')
  }
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
            <button class="delete-btn" @click="handleDeleteSession(session.id, $event)" title="删除">
              ×
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

      <!-- 右侧聊天区域 -->
      <div class="chat-area">
        <!-- 顶部标题栏 -->
        <div class="chat-header">
          <span class="chat-title">生图模式</span>
        </div>
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
              <!-- 图片展示 -->
              <div v-if="message.images && message.images.length > 0" class="message-images">
                <div v-for="(img, index) in message.images" :key="index" class="image-item">
                  <img
                    :src="img"
                    :alt="`生成的图片 ${index + 1}`"
                    @click="openImagePreview(img)"
                  />
                  <div class="image-actions">
                    <button class="action-btn download-btn" @click="downloadImage(img)" title="下载图片">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      下载
                    </button>
                  </div>
                </div>
              </div>
              <!-- 错误信息 -->
              <div v-if="message.error" class="message-error">
                {{ message.error }}
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <textarea
            v-model="inputContent"
            placeholder="描述你想生成的图片..."
            @keydown="handleKeydown"
            :disabled="isSending"
            rows="3"
          ></textarea>
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
  width: 30%;
  min-width: 200px;
  max-width: 300px;
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
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #888);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  font-size: 16px;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(255, 0, 0, 0.1);
  color: #ef4444;
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

.chat-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px;
  background: var(--color-bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--color-border, #e5e5e5);
}

.chat-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #1a1a1a);
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

.input-area textarea {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text-primary, #1a1a1a);
  font-size: 14px;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.input-area textarea:focus {
  border-color: var(--color-primary, #333);
}

.input-area textarea::placeholder {
  color: var(--color-text-tertiary, #888);
}

.send-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary, #333);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  background: var(--color-bg-secondary, #1a1a1a);
  border-color: var(--color-border, #333);
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
