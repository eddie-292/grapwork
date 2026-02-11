<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGlobalMemory } from '../composables/useGlobalMemory'
import { GlobalMemoryType, type GlobalMemoryEntry } from '../types/globalMemory'
import GlobalMemoryFormDialog from './GlobalMemoryFormDialog.vue'

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
  showEntryDialog.value = true
}

function openEditDialog(entry: GlobalMemoryEntry) {
  editingEntry.value = entry
  showEntryDialog.value = true
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
    <GlobalMemoryFormDialog
      :show="showEntryDialog"
      :entry="editingEntry"
      @close="showEntryDialog = false"
      @saved="showEntryDialog = false"
    />
  </div>
</template>

<style scoped>
.global-memory-view {
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
}

.header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* back-btn and add-btn styles moved to global style.css */

.content {
  flex: 1;
  padding: 24px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 18px;
  color: var(--color-text-secondary);
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  padding: 20px;
  background: var(--color-bg-primary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
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
  color: var(--color-primary);
}

.stat-value.disabled {
  color: var(--color-text-tertiary);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filter-select {
  padding: 10px 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.search-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  border-radius: 8px;
  font-size: 14px;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.entries-list {
  display: grid;
  gap: 15px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-tertiary);
  background: var(--color-bg-primary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.entry-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s;
}

.entry-card:hover {
  border-color: var(--color-border-hover);
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
  background: var(--color-primary);
  color: var(--color-text-on-primary);
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
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.entry-category {
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* toggle-btn styles moved to global style.css */

.entry-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.entry-content {
  margin: 0 0 12px 0;
  color: var(--color-text-secondary);
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
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.entry-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--color-bg-tertiary);
}

.entry-meta {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.entry-actions {
  display: flex;
  gap: 8px;
}

/* action-btn styles moved to global style.css */
</style>
