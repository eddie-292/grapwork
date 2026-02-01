<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Assistant, AssistantList } from '../types/electron'

const router = useRouter()

const assistantList = ref<AssistantList>({
  assistants: [],
  activeIndex: -1
})

const currentAssistant = ref<Assistant>({
  id: '',
  name: '',
  emoji: '🤖',
  systemPrompt: '',
  createdAt: 0
})

const editingIndex = ref(-1)
const showEditForm = ref(false)
const saving = ref(false)
const message = ref('')

const emojiOptions = [
  '🤖', '👨‍💻', '👩‍💻', '🧑‍🎨', '🧑‍🏫', '🧑‍⚕️', '🧑‍💼',
  '🎯', '💡', '🚀', '🎨', '📝', '🔧', '📊', '🔍',
  '🧠', '💬', '🎭', '🌟', '🔬', '🎓', '📚', '✨'
]

onMounted(async () => {
  const saved = localStorage.getItem('assistant-list')
  if (saved) {
    try {
      assistantList.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to parse assistant list:', e)
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

function deleteAssistant(index: number) {
  assistantList.value.assistants.splice(index, 1)
  if (assistantList.value.activeIndex === index) {
    assistantList.value.activeIndex = -1
  } else if (assistantList.value.activeIndex > index) {
    assistantList.value.activeIndex--
  }
  saveAssistants()
}

function saveCurrentAssistant() {
  if (editingIndex.value >= 0) {
    assistantList.value.assistants[editingIndex.value] = {
      id: currentAssistant.value.id,
      name: currentAssistant.value.name || '',
      emoji: currentAssistant.value.emoji || '🤖',
      systemPrompt: currentAssistant.value.systemPrompt || '',
      createdAt: currentAssistant.value.createdAt
    }
  } else {
    const newAssistant: Assistant = {
      id: Date.now().toString(),
      name: currentAssistant.value.name || '',
      emoji: currentAssistant.value.emoji || '🤖',
      systemPrompt: currentAssistant.value.systemPrompt || '',
      createdAt: Date.now()
    }
    assistantList.value.assistants.push(newAssistant)
  }
  currentAssistant.value = {
    id: '',
    name: '',
    emoji: '🤖',
    systemPrompt: '',
    createdAt: 0
  }
  editingIndex.value = -1
  showEditForm.value = false
  saveAssistants()
}

function saveAssistants() {
  localStorage.setItem('assistant-list', JSON.stringify(assistantList.value))
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
      <button class="add-btn" @click="showEditForm = true; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: '🤖', systemPrompt: '', createdAt: 0 }">
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
            <label>头像 (Emoji)</label>
            <div class="emoji-selector">
              <button
                v-for="emoji in emojiOptions"
                :key="emoji"
                class="emoji-btn"
                :class="{ selected: currentAssistant.emoji === emoji }"
                @click="currentAssistant.emoji = emoji"
              >
                {{ emoji }}
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

    <div class="assistant-content">
      <div v-if="assistantList.assistants.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <p>暂无社区助理</p>
        <button class="btn primary" @click="showEditForm = true; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: '🤖', systemPrompt: '', createdAt: 0 }">
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
            {{ assistant.emoji }}
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
            <button class="delete-btn" @click="deleteAssistant(index)" title="删除">
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
  background: #f5f7fa;
  display: flex;
  flex-direction: column;
}

.assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: #ffffff;
  border-bottom: 1px solid #e8ecf1;
}

.assistant-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
}

.back-btn {
  background: transparent;
  border: 1px solid #e8ecf1;
  font-size: 14px;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.2s;
  color: #4a5568;
}

.back-btn:hover {
  background: #f5f7fa;
  border-color: #d1d5db;
}

.add-btn {
  background: #10a37f;
  color: white;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 10px 20px;
  border-radius: 8px;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #0f8f6d;
}

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
  font-size: 64px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: #6b7280;
  font-size: 16px;
}

.assistant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

.assistant-card {
  background: #ffffff;
  border: 1px solid #e8ecf1;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.2s;
  cursor: default;
}

.assistant-card:hover {
  border-color: #10a37f;
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
  font-size: 32px;
  border: 2px solid #e8ecf1;
}

.card-info {
  flex: 1;
}

.card-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.card-description {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.use-btn {
  flex: 1;
  background: #10a37f;
  color: white;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 8px;
  transition: all 0.2s;
}

.use-btn:hover {
  background: #0f8f6d;
}

.edit-btn, .delete-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid #e8ecf1;
  background: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  color: #6b7280;
}

.edit-btn:hover {
  border-color: #10a37f;
  color: #10a37f;
  background: #f0fdf4;
}

.delete-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: #fef2f2;
}

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
  background: #ffffff;
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
  color: #1a1a2e;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f5f7fa;
  color: #6b7280;
}

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
  color: #1a1a2e;
}

.input {
  padding: 12px 14px;
  border: 1px solid #e8ecf1;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: #ffffff;
  font-family: inherit;
}

.input:focus {
  border-color: #10a37f;
}

.input.textarea {
  min-height: 140px;
  resize: vertical;
  line-height: 1.6;
}

.form-group small {
  color: #6b7280;
  font-size: 13px;
}

.emoji-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.emoji-btn {
  font-size: 24px;
  padding: 8px 14px;
  border: 2px solid #e8ecf1;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 46px;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emoji-btn:hover {
  border-color: #10a37f;
  background: #f0fdf4;
}

.emoji-btn.selected {
  border-color: #10a37f;
  background: #10a37f;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e8ecf1;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.secondary {
  background: #f5f7fa;
  color: #4a5568;
  border: 1px solid #e8ecf1;
}

.btn.secondary:hover:not(:disabled) {
  background: #e8ecf1;
}

.btn.primary {
  background: #10a37f;
  color: white;
  border: 1px solid #10a37f;
}

.btn.primary:hover:not(:disabled) {
  background: #0f8f6d;
}
</style>