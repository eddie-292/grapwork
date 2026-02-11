<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Assistant, AssistantList } from '../types/electron'
import ConfirmDialog from './ConfirmDialog.vue'
import { storage } from '../services/StorageService'

const router = useRouter()

interface AvatarIcon {
  id: string
  name: string
  path: string
  viewBox?: string
}

const avatarIcons: AvatarIcon[] = [
  { id: 'robot', name: '机器人', path: 'M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-1H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  { id: 'code', name: '代码', path: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z' },
  { id: 'terminal', name: '终端', path: 'M4 17l6-6-6-6M12 19h8' },
  { id: 'brain', name: '大脑', path: 'M9.5 2A5.5 5.5 0 0 1 15 7.5c0 1.1-.3 2.1-.9 3A5.5 5.5 0 0 1 14.5 22c-1.5 0-2.8-.6-3.8-1.5A5.5 5.5 0 0 1 2 14.5c0-1.5.6-2.8 1.5-3.8A5.5 5.5 0 0 1 9.5 2z' },
  { id: 'lightbulb', name: '想法', path: 'M9 21h6M12 3a7 7 0 0 0-7 7c0 2 1 3.8 2.6 5.2L9 18h6l1.4-2.8A7 7 0 0 0 19 10a7 7 0 0 0-7-7z' },
  { id: 'rocket', name: '火箭', path: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' },
  { id: 'palette', name: '艺术', path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z' },
  { id: 'document', name: '文档', path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z M14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { id: 'tool', name: '工具', path: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
  { id: 'chart', name: '图表', path: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3' },
  { id: 'search', name: '搜索', path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { id: 'message', name: '消息', path: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z' },
  { id: 'target', name: '目标', path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 100-12 6 6 0 000 12z M12 14a2 2 0 100-4 2 2 0 000 4z' },
  { id: 'star', name: '星星', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { id: 'microscope', name: '研究', path: 'M6 12l-4 4 4 4M18 12l4 4-4 4M9.5 4l5 16' },
  { id: 'graduation', name: '学习', path: 'M22 10v6M2 10l10-5 10 5-10 5z M12 12v9 M12 17l5-2 M12 17l-5-2' },
  { id: 'book', name: '书本', path: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { id: 'sparkle', name: '闪耀', path: 'M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2z' },
]

const assistantList = ref<AssistantList>({
  assistants: [],
  activeIndex: -1
})

const currentAssistant = ref<Assistant>({
  id: '',
  name: '',
  emoji: 'robot',
  systemPrompt: '',
  createdAt: 0
})

const editingIndex = ref(-1)
const showEditForm = ref(false)
const showDeleteConfirm = ref(false)
const assistantToDeleteIndex = ref(-1)

const deleteMessage = computed(() => {
  const name = assistantList.value.assistants[assistantToDeleteIndex.value]?.name || ''
  return `确定要删除 "${name}" 这个助理吗？此操作无法撤销。`
})

function getAvatarPath(iconId: string): string {
  const icon = avatarIcons.find(i => i.id === iconId)
  return icon?.path ?? avatarIcons[0]?.path ?? 'M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-1H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'
}

onMounted(async () => {
  // 直接从新的持久层加载（不需要迁移逻辑，因为持久层已经使用相同的 localStorage 键）
  try {
    assistantList.value = await storage.getAssistantListFull()
  } catch (e) {
    console.error('Failed to load assistant list from storage:', e)
    // 确保始终有默认值
    assistantList.value = {
      assistants: [],
      activeIndex: -1
    }
  }
})

function editAssistant(index: number) {
  const assistantToEdit = assistantList.value.assistants[index]
  if (assistantToEdit) {
    currentAssistant.value = { ...assistantToEdit }
    editingIndex.value = index
    showEditForm.value = true
  }
}

function confirmDelete(index: number) {
  assistantToDeleteIndex.value = index
  showDeleteConfirm.value = true
}

function handleDeleteConfirm() {
  if (assistantToDeleteIndex.value >= 0) {
    const index = assistantToDeleteIndex.value
    assistantList.value.assistants.splice(index, 1)
    if (assistantList.value.activeIndex === index) {
      assistantList.value.activeIndex = -1
    } else if (assistantList.value.activeIndex > index) {
      assistantList.value.activeIndex--
    }
    saveAssistants()
    showDeleteConfirm.value = false
    assistantToDeleteIndex.value = -1
  }
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
  assistantToDeleteIndex.value = -1
}

function saveCurrentAssistant() {
  if (editingIndex.value >= 0) {
    assistantList.value.assistants[editingIndex.value] = {
      id: currentAssistant.value.id,
      name: currentAssistant.value.name || '',
      emoji: currentAssistant.value.emoji || 'robot',
      systemPrompt: currentAssistant.value.systemPrompt || '',
      createdAt: currentAssistant.value.createdAt
    }
  } else {
    const newAssistant: Assistant = {
      id: Date.now().toString(),
      name: currentAssistant.value.name || '',
      emoji: currentAssistant.value.emoji || 'robot',
      systemPrompt: currentAssistant.value.systemPrompt || '',
      createdAt: Date.now()
    }
    assistantList.value.assistants.push(newAssistant)
  }
  currentAssistant.value = {
    id: '',
    name: '',
    emoji: 'robot',
    systemPrompt: '',
    createdAt: 0
  }
  editingIndex.value = -1
  showEditForm.value = false
  saveAssistants()
}

async function saveAssistants() {
  await storage.saveAssistantListFull(assistantList.value)
}

function goBack() {
  router.push('/')
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}
</script>

<template>
  <div class="assistant-page">
    <header class="assistant-header">
      <button class="back-btn" @click="goBack">
        返回
      </button>
      <h1>社区助理</h1>
      <button class="add-btn" @click="showEditForm = true; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: 'robot', systemPrompt: '', createdAt: 0 }">
        + 新建助理
      </button>
    </header>

    <!-- 编辑表单模态框 -->
    <div class="modal-overlay" v-if="showEditForm" @click.self="showEditForm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingIndex >= 0 ? '编辑助理' : '创建助理' }}</h3>
          <button class="close-btn" @click="showEditForm = false; editingIndex = -1">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>助理名称</label>
            <input
              v-model="currentAssistant.name"
              type="text"
              placeholder="例如：代码助手、写作助手..."
              class="input"
            />
          </div>

          <div class="form-group">
            <label>头像</label>
            <div class="avatar-selector">
              <button
                v-for="icon in avatarIcons"
                :key="icon.id"
                class="avatar-btn"
                :class="{ selected: currentAssistant.emoji === icon.id }"
                @click="currentAssistant.emoji = icon.id"
                :title="icon.name"
              >
                <svg :viewBox="icon.viewBox || '0 0 24 24'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="icon.path" />
                </svg>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>System 提示词</label>
            <textarea
              v-model="currentAssistant.systemPrompt"
              placeholder="设置 AI 助手的角色和行为..."
              class="input textarea"
              rows="6"
            />
            <small>描述助理的专长、性格和回答风格</small>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn secondary" @click="showEditForm = false; editingIndex = -1">
            取消
          </button>
          <button type="button" class="btn primary" @click="saveCurrentAssistant">
            {{ editingIndex >= 0 ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="deleteMessage"
      type="danger"
      confirm-text="删除"
      @confirm="handleDeleteConfirm"
      @cancel="handleDeleteCancel"
    />

    <div class="assistant-content">
      <div v-if="assistantList.assistants.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-1H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
        </div>
        <p>暂无社区助理</p>
        <button class="btn primary" @click="showEditForm = true; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: 'robot', systemPrompt: '', createdAt: 0 }">
          + 创建第一个助理
        </button>
      </div>

      <div v-else class="assistant-grid">
        <div
          v-for="(assistant, index) in assistantList.assistants"
          :key="assistant.id"
          class="assistant-card"
        >
          <div class="card-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path :d="getAvatarPath(assistant.emoji)" />
            </svg>
          </div>
          <div class="card-info">
            <h3 class="card-title">{{ assistant.name }}</h3>
            <p class="card-description">{{ truncateText(assistant.systemPrompt, 60) || '暂无描述' }}</p>
          </div>
          <div class="card-actions">
            <button class="edit-btn" @click="editAssistant(index)" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="delete-btn" @click="confirmDelete(index)" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-page {
  min-height: 100vh;
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
}

.assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.assistant-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* back-btn and add-btn styles moved to global style.css */

.assistant-content {
  padding: 32px;
  width: 100%;
  flex: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}

.empty-icon {
  width: 80px;
  height: 80px;
  opacity: 0.3;
  color: var(--color-text-secondary);
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 16px;
}

.assistant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.assistant-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.2s;
  cursor: default;
}

.assistant-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 8px 24px rgba(16, 163, 127, 0.12);
}

.card-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  color: var(--color-primary);
}

.card-avatar svg {
  width: 32px;
  height: 32px;
}

.card-info {
  flex: 1;
}

.card-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.card-description {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.card-actions {
  display: flex;
  gap: 8px;
}

/* use-btn, edit-btn, delete-btn styles moved to global style.css */

/* 模态框样式 */
.modal-overlay {
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
  padding: 20px;
}

.modal-content {
  background: var(--color-bg-primary);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0;
  margin-bottom: 20px;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* close-btn styles moved to global style.css */

.modal-body {
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  font-size: 14px;
  color: var(--color-text-primary);
}

.input {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--color-bg-primary);
  font-family: inherit;
}

.input:focus {
  border-color: var(--color-primary);
}

.input.textarea {
  min-height: 140px;
  resize: vertical;
  line-height: 1.6;
}

.form-group small {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.avatar-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.avatar-btn {
  width: 46px;
  height: 46px;
}

.avatar-btn svg {
  width: 24px;
  height: 24px;
}

.avatar-btn.selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}

/* Button styles moved to global style.css */
</style>