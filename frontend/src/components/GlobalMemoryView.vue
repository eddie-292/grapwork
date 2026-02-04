<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGlobalMemory } from '../composables/useGlobalMemory'
import { GlobalMemoryType, type GlobalMemoryEntry } from '../types/globalMemory'

const router = useRouter()
const globalMemoryManager = useGlobalMemory()

// State
const entries = computed(() => globalMemoryManager.entries.value ?? [])
const categories = computed(() => globalMemoryManager.categories.value ?? [])
const isLoading = ref(false)

// Filter state
const selectedType = ref<string>('all')
const selectedCategory = ref<string>('all')
const searchQuery = ref('')

// Dialog state
const showEntryDialog = ref(false)
const editingEntry = ref<GlobalMemoryEntry | null>(null)
const formData = ref({
  type: GlobalMemoryType.PREFERENCES,
  category: '',
  title: '',
  content: '',
  keywords: '',
  enabled: true
})

// Type options
const typeOptions = [
  { value: 'all', label: '全部类型' },
  { value: GlobalMemoryType.PREFERENCES, label: '用户偏好' },
  { value: GlobalMemoryType.SETTINGS, label: '通用设置' },
  { value: GlobalMemoryType.GENERAL_INFO, label: '通用信息' },
  { value: GlobalMemoryType.CUSTOM, label: '自定义' }
]

// Type label mapping
const getTypeLabel = (type: GlobalMemoryType) => {
  const labels: Record<GlobalMemoryType, string> = {
    [GlobalMemoryType.PREFERENCES]: '用户偏好',
    [GlobalMemoryType.SETTINGS]: '通用设置',
    [GlobalMemoryType.GENERAL_INFO]: '通用信息',
    [GlobalMemoryType.CUSTOM]: '自定义'
  }
  return labels[type] || type
}

// Filtered entries
const filteredEntries = computed(() => {
  let result = entries.value

  // Filter by type
  if (selectedType.value !== 'all') {
    result = result.filter(e => e.type === selectedType.value)
  }

  // Filter by category
  if (selectedCategory.value !== 'all') {
    result = result.filter(e => e.category === selectedCategory.value)
  }

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(e =>
      e.title.toLowerCase().includes(query) ||
      e.content.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query) ||
      e.keywords.some(k => k.toLowerCase().includes(query))
    )
  }

  return result
})

// Statistics
const stats = computed(() => {
  const total = entries.value.length
  const enabled = entries.value.filter(e => e.enabled).length
  const byType: Record<string, number> = {}
  entries.value.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1
  })
  return { total, enabled, disabled: total - enabled, byType }
})

// Functions
function goBack() {
  router.back()
}

function openAddDialog() {
  editingEntry.value = null
  formData.value = {
    type: GlobalMemoryType.PREFERENCES,
    category: '',
    title: '',
    content: '',
    keywords: '',
    enabled: true
  }
  showEntryDialog.value = true
}

function openEditDialog(entry: GlobalMemoryEntry) {
  editingEntry.value = entry
  formData.value = {
    type: entry.type,
    category: entry.category,
    title: entry.title,
    content: entry.content,
    keywords: entry.keywords.join(', '),
    enabled: entry.enabled
  }
  showEntryDialog.value = true
}

async function saveEntry() {
  try {
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

    const keywords = formData.value.keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    if (editingEntry.value) {
      // Update existing entry
      await globalMemoryManager.updateEntry(editingEntry.value.id, {
        type: formData.value.type,
        category: formData.value.category.trim(),
        title: formData.value.title.trim(),
        content: formData.value.content.trim(),
        keywords,
        enabled: formData.value.enabled
      })
    } else {
      // Add new entry
      await globalMemoryManager.addEntry(
        formData.value.type,
        formData.value.category.trim(),
        formData.value.title.trim(),
        formData.value.content.trim(),
        keywords
      )
    }

    showEntryDialog.value = false
  } catch (error) {
    console.error('Failed to save entry:', error)
    alert('保存失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

async function deleteEntry(id: string) {
  if (!confirm('确定要删除这条记忆吗？')) return
  try {
    await globalMemoryManager.deleteEntry(id)
  } catch (error) {
    console.error('Failed to delete entry:', error)
    alert('删除失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

async function toggleEntry(id: string) {
  try {
    await globalMemoryManager.toggleEntry(id)
  } catch (error) {
    console.error('Failed to toggle entry:', error)
    alert('操作失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// Initialize
onMounted(async () => {
  isLoading.value = true
  try {
    await globalMemoryManager.load()
  } catch (error) {
    console.error('Failed to load global memory:', error)
    alert('加载全局记忆失败：' + (error instanceof Error ? error.message : '未知错误'))
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="global-memory-view">
    <!-- Header -->
    <header class="header">
      <button class="back-btn" @click="goBack">
       返回
      </button>
      <h1>全局记忆</h1>
      <button class="add-btn primary" @click="openAddDialog">
        添加记忆
      </button>
    </header>

    <!-- Loading state -->
    <div v-if="isLoading" class="loading">加载中...</div>

    <!-- Main content -->
    <div v-else class="content">
      <!-- Statistics -->
      <div class="stats">
        <div class="stat-item">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">总计</span>
        </div>
        <div class="stat-item">
          <span class="stat-value enabled">{{ stats.enabled }}</span>
          <span class="stat-label">已启用</span>
        </div>
        <div class="stat-item">
          <span class="stat-value disabled">{{ stats.disabled }}</span>
          <span class="stat-label">已禁用</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters">
        <select v-model="selectedType" class="filter-select">
          <option v-for="type in typeOptions" :key="type.value" :value="type.value">
            {{ type.label }}
          </option>
        </select>

        <select v-model="selectedCategory" class="filter-select">
          <option value="all">全部分类</option>
          <option v-for="cat in categories" :key="cat" :value="cat">
            {{ cat }}
          </option>
        </select>

        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索标题、内容、关键词..."
        />
      </div>

      <!-- Entries list -->
      <div class="entries-list">
        <div v-if="filteredEntries.length === 0" class="empty-state">
          <p v-if="entries.length === 0">还没有全局记忆，点击上方"添加记忆"开始创建</p>
          <p v-else>没有找到匹配的记忆条目</p>
        </div>

        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          :class="['entry-card', { disabled: !entry.enabled }]"
        >
          <div class="entry-header">
            <span :class="['entry-type', entry.type]">
              {{ getTypeLabel(entry.type) }}
            </span>
            <span class="entry-category">{{ entry.category }}</span>
            <button
              :class="['toggle-btn', { active: entry.enabled }]"
              @click="toggleEntry(entry.id)"
              :title="entry.enabled ? '点击禁用' : '点击启用'"
            >
              {{ entry.enabled ? '● 已启用' : '○ 已禁用' }}
            </button>
          </div>

          <h3 class="entry-title">{{ entry.title }}</h3>
          <p class="entry-content">{{ entry.content }}</p>

          <div v-if="entry.keywords.length > 0" class="entry-keywords">
            <span
              v-for="(keyword, idx) in entry.keywords"
              :key="idx"
              class="keyword-tag"
            >
              {{ keyword }}
            </span>
          </div>

          <div class="entry-footer">
            <span class="entry-meta">
              使用 {{ entry.metadata?.usageCount || 0 }} 次
            </span>
            <div class="entry-actions">
              <button class="action-btn edit" @click="openEditDialog(entry)">编辑</button>
              <button class="action-btn delete" @click="deleteEntry(entry.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <div v-if="showEntryDialog" class="dialog-overlay" @click.self="showEntryDialog = false">
      <div class="dialog">
        <h2>{{ editingEntry ? '编辑记忆' : '添加记忆' }}</h2>

        <form @submit.prevent="saveEntry">
          <div class="form-group">
            <label>类型</label>
            <select v-model="formData.type" class="form-control">
              <option :value="GlobalMemoryType.PREFERENCES">用户偏好</option>
              <option :value="GlobalMemoryType.SETTINGS">通用设置</option>
              <option :value="GlobalMemoryType.GENERAL_INFO">通用信息</option>
              <option :value="GlobalMemoryType.CUSTOM">自定义</option>
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
              <option value="ui_preferences">UI 偏好</option>
              <option value="code_style">代码风格</option>
              <option value="response_format">回复格式</option>
              <option value="communication">沟通方式</option>
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
              rows="5"
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
            <button type="button" class="btn-secondary" @click="showEntryDialog = false">
              取消
            </button>
            <button type="submit" class="btn-primary">
              {{ editingEntry ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.global-memory-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  color: #0f172a;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.back-btn {
  padding: 8px 16px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #374151;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 14px;
}

.back-btn:hover {
  background: #e5e7eb;
}

.add-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 14px;
}

.add-btn.primary {
  background: #10a37f;
  color: white;
}

.add-btn.primary:hover {
  background: #0d8c6c;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: #fafafa;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 18px;
  color: #6b7280;
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  padding: 20px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
}

.stat-value.enabled {
  color: #10a37f;
}

.stat-value.disabled {
  color: #9ca3af;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filter-select {
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #ddd;
  color: #374151;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.search-input {
  flex: 1;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #ddd;
  color: #374151;
  border-radius: 8px;
  font-size: 14px;
}

.search-input::placeholder {
  color: #9ca3af;
}

.entries-list {
  display: grid;
  gap: 15px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.entry-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s;
}

.entry-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.entry-card.disabled {
  opacity: 0.6;
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.entry-type {
  padding: 4px 10px;
  font-size: 11px;
  border-radius: 6px;
  text-transform: uppercase;
  font-weight: 600;
}

.entry-type.preferences {
  background: #dbeafe;
  color: #1e40af;
}

.entry-type.settings {
  background: #fed7aa;
  color: #9a3412;
}

.entry-type.general_info {
  background: #e9d5ff;
  color: #6b21a8;
}

.entry-type.custom {
  background: #e2e8f0;
  color: #475569;
}

.entry-category {
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  color: #6b7280;
}

.toggle-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  color: #6b7280;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: #d1fae5;
  border-color: #10a37f;
  color: #10a37f;
}

.entry-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.entry-content {
  margin: 0 0 12px 0;
  color: #4b5563;
  line-height: 1.5;
  white-space: pre-wrap;
}

.entry-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.keyword-tag {
  padding: 3px 8px;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 11px;
  color: #6b7280;
}

.entry-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.entry-meta {
  font-size: 12px;
  color: #9ca3af;
}

.entry-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #e5e7eb;
  color: #6b7280;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.edit:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.action-btn.delete:hover {
  border-color: #ef4444;
  color: #ef4444;
}

/* Dialog styles */
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
  z-index: 1000;
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
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
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
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #ddd;
  border-radius: 8px;
  color: #374151;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-control:focus {
  outline: none;
  border-color: #10a37f;
}

.textarea {
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #9ca3af;
}

.checkbox-group {
  margin-bottom: 20px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
}

.btn-primary:hover {
  background: #0d8c6c;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
