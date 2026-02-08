<script setup lang="ts">
import { ref, watch, computed, type Directive } from 'vue'
import { useGlobalMemory } from '../composables/useGlobalMemory'
import { GlobalMemoryType, type GlobalMemoryEntry } from '../types/globalMemory'
import PaletteIcon from './icons/PaletteIcon.vue'
import MoonIcon from './icons/MoonIcon.vue'
import RulerIcon from './icons/RulerIcon.vue'
import CodeIcon from './icons/CodeIcon.vue'
import WrenchIcon from './icons/WrenchIcon.vue'
import PackageIcon from './icons/PackageIcon.vue'
import BuildingIcon from './icons/BuildingIcon.vue'
import FileTextIcon from './icons/FileTextIcon.vue'
import MessageCircleIcon from './icons/MessageCircleIcon.vue'
import GlobeIcon from './icons/GlobeIcon.vue'
import MaskIcon from './icons/MaskIcon.vue'
import ZapIcon from './icons/ZapIcon.vue'
import FolderIcon from './icons/FolderIcon.vue'
import UsersIcon from './icons/UsersIcon.vue'
import RotateIcon from './icons/RotateIcon.vue'
import AlertTriangleIcon from './icons/AlertTriangleIcon.vue'
import TargetIcon from './icons/TargetIcon.vue'
import ChevronDownIcon from './icons/ChevronDownIcon.vue'

// v-click-outside 指令
const vClickOutside: Directive = {
  mounted(el, binding) {
    el._clickOutside = (event: MouseEvent) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event)
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  }
}

interface CategoryOption {
  value: string
  label: string
  icon: any
  group: string
}

const categoryOptions: CategoryOption[] = [
  // UI/UX 相关
  { value: 'ui_preferences', label: 'UI 偏好', icon: PaletteIcon, group: 'UI/UX' },
  { value: 'theme', label: '主题设置', icon: MoonIcon, group: 'UI/UX' },
  { value: 'layout', label: '布局偏好', icon: RulerIcon, group: 'UI/UX' },
  // 代码相关
  { value: 'code_style', label: '代码风格', icon: CodeIcon, group: '代码' },
  { value: 'programming_language', label: '编程语言', icon: WrenchIcon, group: '代码' },
  { value: 'framework', label: '框架偏好', icon: PackageIcon, group: '代码' },
  { value: 'design_pattern', label: '设计模式', icon: BuildingIcon, group: '代码' },
  // 交互相关
  { value: 'response_format', label: '回复格式', icon: FileTextIcon, group: '交互' },
  { value: 'communication', label: '沟通方式', icon: MessageCircleIcon, group: '交互' },
  { value: 'language', label: '语言偏好', icon: GlobeIcon, group: '交互' },
  { value: 'tone', label: '语气风格', icon: MaskIcon, group: '交互' },
  // 工作相关
  { value: 'workflow', label: '工作流', icon: ZapIcon, group: '工作' },
  { value: 'project_context', label: '项目上下文', icon: FolderIcon, group: '工作' },
  { value: 'team_convention', label: '团队规范', icon: UsersIcon, group: '工作' },
  // 其他
  { value: 'habits', label: '个人习惯', icon: RotateIcon, group: '其他' },
  { value: 'constraints', label: '约束条件', icon: AlertTriangleIcon, group: '其他' },
  { value: 'goals', label: '目标偏好', icon: TargetIcon, group: '其他' },
]

interface Props {
  show: boolean
  entry?: GlobalMemoryEntry | null
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

// 自定义下拉列表状态
const showCategoryDropdown = ref(false)

const formData = ref({
  type: GlobalMemoryType.PREFERENCES,
  category: '',
  title: '',
  content: '',
  keywords: '',
  enabled: true
})

// Reset form when dialog opens or entry changes
watch(() => props.show, (isOpen) => {
  if (isOpen) {
    if (props.entry) {
      // 编辑模式
      formData.value = {
        type: props.entry.type,
        category: props.entry.category,
        title: props.entry.title,
        content: props.entry.content,
        keywords: props.entry.keywords.join(', '),
        enabled: props.entry.enabled
      }
    } else {
      // 添加模式
      formData.value = {
        type: GlobalMemoryType.PREFERENCES,
        category: '',
        title: '',
        content: props.initialContent || '',
        keywords: props.initialKeywords?.join(', ') || '',
        enabled: true
      }
    }
  }
})

const filteredCategories = computed(() => {
  const query = formData.value.category.toLowerCase()
  if (!query) return categoryOptions
  return categoryOptions.filter(opt =>
    opt.value.toLowerCase().includes(query) ||
    opt.label.toLowerCase().includes(query)
  )
})

const groupedCategories = computed(() => {
  const groups: Record<string, CategoryOption[]> = {}
  filteredCategories.value.forEach(opt => {
    if (!groups[opt.group]) groups[opt.group] = []
    groups[opt.group].push(opt)
  })
  return groups
})

function selectCategory(value: string) {
  formData.value.category = value
  showCategoryDropdown.value = false
}

function toggleDropdown() {
  showCategoryDropdown.value = !showCategoryDropdown.value
}

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

    if (props.entry) {
      // Update existing entry
      await globalMemoryManager.updateEntry(props.entry.id, {
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
      <h2>{{ entry ? '编辑记忆' : '保存为全局记忆' }}</h2>

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
        <div class="custom-select" v-click-outside="() => showCategoryDropdown = false">
          <input
            v-model="formData.category"
            type="text"
            class="form-control"
            placeholder="选择或输入分类..."
            @focus="showCategoryDropdown = true"
            @input="showCategoryDropdown = true"
          />
          <div class="select-arrow" @click="toggleDropdown"><ChevronDownIcon :size="10" /></div>
          <div v-if="showCategoryDropdown" class="custom-dropdown">
            <div v-if="filteredCategories.length === 0" class="dropdown-item empty">
              无匹配结果
            </div>
            <template v-else>
              <div v-for="(items, group) in groupedCategories" :key="group" class="dropdown-group">
                <div class="dropdown-group-label">{{ group }}</div>
                <div
                  v-for="option in items"
                  :key="option.value"
                  class="dropdown-item"
                  :class="{ active: formData.category === option.value }"
                  @click="selectCategory(option.value)"
                >
                  <span class="dropdown-icon"><component :is="option.icon" :size="16" /></span>
                  <span class="dropdown-label">{{ option.label }}</span>
                  <span class="dropdown-value">{{ option.value }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
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
        <button class="btn-primary" @click="save">{{ entry ? '保存' : '添加' }}</button>
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
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #111827;
  font-size: 14px;
}

.checkbox-label input[type="checkbox"] {
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

/* 自定义下拉列表样式 */
.custom-select {
  position: relative;
}

.custom-select .form-control {
  padding-right: 40px;
  cursor: pointer;
}

.select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #6b7280;
  pointer-events: none;
  transition: transform 0.2s;
}

.custom-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  max-height: 280px;
  overflow-y: auto;
  z-index: 100;
}

.custom-dropdown::-webkit-scrollbar {
  width: 6px;
}

.custom-dropdown::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.custom-dropdown::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.custom-dropdown::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.dropdown-group {
  border-bottom: 1px solid #e5e7eb;
}

.dropdown-group:last-child {
  border-bottom: none;
}

.dropdown-group-label {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f9fafb;
  position: sticky;
  top: 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 1px solid #f3f4f6;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: #f0fdf4;
}

.dropdown-item.active {
  background: #dcfce7;
  border-left: 3px solid #10a37f;
}

.dropdown-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.dropdown-label {
  flex: 1;
  font-size: 14px;
  color: #111827;
  font-weight: 500;
}

.dropdown-value {
  font-size: 12px;
  color: #9ca3af;
  font-family: 'Monaco', 'Menlo', monospace;
}

.dropdown-item.empty {
  padding: 16px 12px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}
</style>
