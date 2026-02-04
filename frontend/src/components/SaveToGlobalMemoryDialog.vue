<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGlobalMemory } from '../composables/useGlobalMemory'
import { GlobalMemoryType } from '../types/globalMemory'

interface Props {
  show: boolean
  initialContent?: string
  initialKeywords?: string[]
}

interface Emits {
  (e: 'close'): void
  (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const globalMemoryManager = useGlobalMemory()

const formData = ref({
  type: GlobalMemoryType.PREFERENCES,
  category: '',
  title: '',
  content: props.initialContent || '',
  keywords: props.initialKeywords?.join(', ') || '',
  enabled: true
})

// Reset form when dialog opens
watch(() => props.show, (isOpen) => {
  if (isOpen) {
    formData.value = {
      type: GlobalMemoryType.PREFERENCES,
      category: '',
      title: '',
      content: props.initialContent || '',
      keywords: props.initialKeywords?.join(', ') || '',
      enabled: true
    }
  }
})

const typeOptions = [
  { value: GlobalMemoryType.PREFERENCES, label: '用户偏好' },
  { value: GlobalMemoryType.SETTINGS, label: '通用设置' },
  { value: GlobalMemoryType.GENERAL_INFO, label: '通用信息' },
  { value: GlobalMemoryType.CUSTOM, label: '自定义' }
]

async function save() {
  // Validate
  if (!formData.value.category.trim()) {
    alert('请输入分类')
    return
  }
  if (!formData.value.title.trim()) {
    alert('请输入标题')
    return
  }
  if (!formData.value.content.trim()) {
    alert('请输入内容')
    return
  }

  try {
    const keywords = formData.value.keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    await globalMemoryManager.addEntry(
      formData.value.type,
      formData.value.category.trim(),
      formData.value.title.trim(),
      formData.value.content.trim(),
      keywords
    )

    emit('saved')
    emit('close')
  } catch (error) {
    console.error('Failed to save entry:', error)
    alert('保存失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

function cancel() {
  emit('close')
}
</script>

<template>
  <div v-if="show" class="dialog-overlay" @click.self="cancel">
    <div class="dialog">
      <h2>保存为全局记忆</h2>

      <div class="form-group">
        <label>类型</label>
        <select v-model="formData.type" class="form-control">
          <option v-for="type in typeOptions" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>分类</label>
        <input
          v-model="formData.category"
          type="text"
          class="form-control"
          placeholder="例如：ui_preferences, code_style"
          list="category-suggestions"
        />
        <datalist id="category-suggestions">
          <!-- UI/UX 相关 -->
          <option value="ui_preferences">🎨 UI 偏好</option>
          <option value="theme">🌓 主题设置</option>
          <option value="layout">📐 布局偏好</option>

          <!-- 代码相关 -->
          <option value="code_style">💻 代码风格</option>
          <option value="programming_language">🔧 编程语言</option>
          <option value="framework">📦 框架偏好</option>
          <option value="design_pattern">🏗️ 设计模式</option>

          <!-- 交互相关 -->
          <option value="response_format">📝 回复格式</option>
          <option value="communication">💬 沟通方式</option>
          <option value="language">🌍 语言偏好</option>
          <option value="tone">🎭 语气风格</option>

          <!-- 工作相关 -->
          <option value="workflow">⚡ 工作流</option>
          <option value="project_context">📁 项目上下文</option>
          <option value="team_convention">👥 团队规范</option>

          <!-- 其他 -->
          <option value="habits">🔄 个人习惯</option>
          <option value="constraints">⚠️ 约束条件</option>
          <option value="goals">🎯 目标偏好</option>
        </datalist>
      </div>

      <div class="form-group">
        <label>标题</label>
        <input
          v-model="formData.title"
          type="text"
          class="form-control"
          placeholder="例如：按钮颜色偏好"
        />
      </div>

      <div class="form-group">
        <label>内容</label>
        <textarea
          v-model="formData.content"
          class="form-control textarea"
          rows="6"
          placeholder="详细描述你的偏好或设置..."
        ></textarea>
      </div>

      <div class="form-group">
        <label>关键词（逗号分隔，用于智能匹配）</label>
        <input
          v-model="formData.keywords"
          type="text"
          class="form-control"
          placeholder="例如：按钮, 颜色, 样式, UI"
        />
        <small class="form-hint">关键词将用于智能匹配，当聊天内容包含这些关键词时会自动注入此记忆</small>
      </div>

      <div class="form-group checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="formData.enabled" />
          <span>启用此记忆</span>
        </label>
      </div>

      <div class="dialog-actions">
        <button class="btn-secondary" @click="cancel">取消</button>
        <button class="btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.dialog h2 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #111827;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #ddd;
  border-radius: 8px;
  color: #111827;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: #10a37f;
}

.textarea {
  resize: vertical;
  min-height: 120px;
  font-family: inherit;
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.checkbox-group {
  margin-bottom: 20px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #111827;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #10a37f;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #10a37f;
  color: white;
  border: 1px solid #10a37f;
}

.btn-primary:hover {
  background: #0f8f6d;
}

.btn-secondary {
  background: #f5f5f5;
  color: #111827;
  border: 1px solid #e5e7eb;
}

.btn-secondary:hover {
  background: #f0f0f0;
}
</style>
