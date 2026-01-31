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

function selectAssistant(index: number) {
  assistantList.value.activeIndex = index
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
    </header>

    <div class="assistant-content">
      <!-- 助理列表 -->
      <div class="assistant-list">
        <div v-if="assistantList.assistants.length === 0" class="empty-state">
          暂无社区助理，点击"添加助理"创建一个
        </div>
        <div
          v-for="(assistant, index) in assistantList.assistants"
          :key="assistant.id"
          class="assistant-item"
          :class="{ active: assistantList.activeIndex === index }"
          @click="selectAssistant(index)"
        >
          <div class="assistant-icon">{{ assistant.emoji }}</div>
          <div class="assistant-info">
            <div class="assistant-header">
              <h3>{{ assistant.name }}</h3>
              <div class="assistant-actions" @click.stop>
                <button class="btn-icon" @click="editAssistant(index)" title="编辑">编辑</button>
                <button class="btn-icon" @click="deleteAssistant(index)" title="删除">删除</button>
              </div>
            </div>
            <div class="assistant-prompt">
              {{ truncateText(assistant.systemPrompt, 100) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑表单 -->
      <div class="edit-form" v-if="showEditForm">
        <h3>{{ editingIndex >= 0 ? '编辑助理' : '添加新助理' }}</h3>
        <div class="form">
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
              rows="8"
            />
            <small>描述助理的专长、性格和回答风格</small>
          </div>

          <div class="form-actions">
            <button type="button" class="btn secondary" @click="showEditForm = false; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: '🤖', systemPrompt: '', createdAt: 0 }">
              取消
            </button>
            <button type="button" class="btn primary" @click="saveCurrentAssistant">
              {{ editingIndex >= 0 ? '更新' : '添加' }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="add-section">
        <button type="button" class="btn primary" @click="showEditForm = true; editingIndex = -1; currentAssistant = { id: '', name: '', emoji: '🤖', systemPrompt: '', createdAt: 0 }">
          添加助理
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-page {
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

.assistant-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.back-btn {
  background: #f5f5f5;
  border: 1px solid #e5e7eb;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s;
}

.back-btn:hover {
  background: #f0f0f0;
}

.assistant-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.assistant-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
  width: 100%;
}

.assistant-list {
  margin-bottom: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 20px;
}

.assistant-item {
  display: flex;
  align-items: flex-start;
  padding: 20px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  margin-bottom: 12px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  gap: 16px;
}

.assistant-item:hover {
  border-color: #10a37f;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.assistant-item.active {
  border-color: #10a37f;
  background: #f0fdf4;
  box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.2);
}

.assistant-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.assistant-info {
  flex: 1;
}

.assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.assistant-header h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.assistant-prompt {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
}

.assistant-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  min-width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f5f5f5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f0f0f0;
  border-color: #d1d5db;
}

.edit-form {
  background: #f9fafb;
  padding: 24px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.edit-form h3 {
  margin: 0 0 20px 0;
  color: #0f172a;
  font-size: 18px;
}

.form {
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
  color: #0f172a;
}

.input {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: #ffffff;
}

.input:focus {
  border-color: #10a37f;
}

.input.textarea {
  min-height: 160px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
}

.form-group small {
  color: #6b7280;
  font-size: 13px;
}

.emoji-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.emoji-btn {
  font-size: 24px;
  padding: 8px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 44px;
  min-height: 44px;
}

.emoji-btn:hover {
  border-color: #10a37f;
  background: #f0fdf4;
}

.emoji-btn.selected {
  border-color: #10a37f;
  background: #10a37f;
  color: white;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.add-section {
  text-align: center;
  margin-bottom: 20px;
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
  background: #f5f5f5;
  color: #111827;
  border: 1px solid #e5e7eb;
}

.btn.secondary:hover:not(:disabled) {
  background: #f0f0f0;
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
