<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSkills } from '@/composables/useSkills'
import type { Skill, SkillMetadata } from '@/types/skill'
import RefreshIcon from '@/components/icons/RefreshIcon.vue'
import ChevronDownIcon from '@/components/icons/ChevronDownIcon.vue'

const skillsManager = useSkills()

// State
const newSkillName = ref('')
const newSkillDescription = ref('')
const editingSkill = ref<Skill | null>(null)
const editBody = ref('')
const showCreateForm = ref(false)
const showEditModal = ref(false)
const expandedDisabledSections = ref<Set<string>>(new Set())

// Computed
const { registry, loading, error, userSkills, publicSkills, installedSkills, exampleSkills } = skillsManager

// Helper to split skills by active state
function splitSkillsByActive(skills: SkillMetadata[]) {
  const activeIds = registry.value?.activeSkillIds || []
  const active = skills.filter(s => activeIds.includes(s.id))
  const disabled = skills.filter(s => !activeIds.includes(s.id))
  return { active, disabled }
}

// Helper to check if skill is active
function isSkillActive(skillId: string): boolean {
  return (registry.value?.activeSkillIds || []).includes(skillId)
}

// Toggle disabled section expansion
function toggleDisabledSection(sectionKey: string) {
  if (expandedDisabledSections.value.has(sectionKey)) {
    expandedDisabledSections.value.delete(sectionKey)
  } else {
    expandedDisabledSections.value.add(sectionKey)
  }
}

function isDisabledSectionExpanded(sectionKey: string): boolean {
  return expandedDisabledSections.value.has(sectionKey)
}

// Methods
async function handleCreateSkill() {
  if (!newSkillName.value.trim() || !newSkillDescription.value.trim()) return

  const skill = await skillsManager.createSkill(
    newSkillName.value.trim(),
    newSkillDescription.value.trim()
  )

  if (skill) {
    newSkillName.value = ''
    newSkillDescription.value = ''
    showCreateForm.value = false
  }
}

async function handleEditSkill(skill: SkillMetadata) {
  const fullSkill = await skillsManager.loadSkillBody(skill.id)
  if (fullSkill) {
    editingSkill.value = fullSkill
    editBody.value = fullSkill.body
    showEditModal.value = true
  }
}

async function handleSaveEdit() {
  if (!editingSkill.value) return

  const success = await skillsManager.updateSkillBody(
    editingSkill.value.id,
    editBody.value
  )

  if (success) {
    showEditModal.value = false
    editingSkill.value = null
    editBody.value = ''
  }
}

async function handleDeleteSkill(skillId: string) {
  if (confirm('确定要删除此技能吗？此操作无法撤销。')) {
    await skillsManager.deleteSkill(skillId)
  }
}

async function handleToggleActive(skillId: string) {
  await skillsManager.toggleSkillActive(skillId)
}

function canEdit(skill: SkillMetadata): boolean {
  return skill.location === 'user'
}

function getLocationLabel(location: string): string {
  switch (location) {
    case 'user':
      return '用户'
    case 'installed':
      return '安装'
    case 'public':
      return '系统'
    case 'examples':
      return '内置'
    default:
      return location
  }
}

function getLocationClass(location: string): string {
  switch (location) {
    case 'user':
      return 'badge-user'
    case 'installed':
      return 'badge-installed'
    case 'public':
      return 'badge-system'
    case 'examples':
      return 'badge-example'
    default:
      return ''
  }
}

function getLocationPath(skills: SkillMetadata[]): string {
  if (!skills || skills.length === 0) return ''
  // Get the parent directory of the first skill's path
  const firstSkill = skills[0]
  if (!firstSkill) return ''
  const firstSkillPath = firstSkill.path
  const lastSlash = Math.max(
    firstSkillPath.lastIndexOf('/'),
    firstSkillPath.lastIndexOf('\\')
  )
  return lastSlash > 0 ? firstSkillPath.substring(0, lastSlash) : firstSkillPath
}

onMounted(() => {
  skillsManager.loadRegistry()
})
</script>

<template>
  <div class="skills-panel">
    <!-- Header -->
    <div class="panel-header">
      <h3>技能管理</h3>
      <div class="header-actions">
        <button class="refresh-btn" @click="skillsManager.loadRegistry()" :disabled="loading" title="刷新技能列表">
          <RefreshIcon :class="{ spinning: loading }" />
        </button>
        <button class="add-btn" @click="showCreateForm = !showCreateForm" :disabled="loading">
          + 新建技能
        </button>
      </div>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-message">
      {{ error }}
      <button class="close-btn" @click="skillsManager.clearError()">x</button>
    </div>

    <!-- Create form -->
    <div v-if="showCreateForm" class="create-form">
      <div class="form-group">
        <label>名称（仅限小写字母、数字和连字符）</label>
        <input
          v-model="newSkillName"
          placeholder="my-skill-name"
          class="input-field"
          pattern="[a-z0-9-]+"
        />
      </div>
      <div class="form-group">
        <label>描述</label>
        <textarea
          v-model="newSkillDescription"
          placeholder="描述何时以及如何使用此技能..."
          class="input-field"
          rows="3"
        ></textarea>
      </div>
      <div class="form-actions">
        <button @click="showCreateForm = false" class="btn secondary">取消</button>
        <button
          @click="handleCreateSkill"
          class="btn primary"
          :disabled="loading || !newSkillName.trim() || !newSkillDescription.trim()"
        >
          创建
        </button>
      </div>
    </div>

    <!-- Loading indicator -->
    <div v-if="loading" class="loading-indicator">
      加载中...
    </div>

    <!-- Skills list -->
    <div class="skills-sections" v-if="!loading">
      <!-- User Skills -->
      <div v-if="userSkills.length > 0" class="skill-section">
        <h4>用户技能 ({{ userSkills.length }})</h4>
        <p class="skill-path">{{ getLocationPath(userSkills) }}</p>
        <div class="skill-list">
          <div
            v-for="skill in splitSkillsByActive(userSkills).active"
            :key="skill.id"
            class="skill-card"
            :class="{ active: isSkillActive(skill.id) }"
          >
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-badge" :class="getLocationClass(skill.location)">
                {{ getLocationLabel(skill.location) }}
              </span>
            </div>
            <p class="skill-description">{{ skill.description }}</p>
            <div class="skill-actions">
              <button
                @click="handleToggleActive(skill.id)"
                class="toggle-btn"
                :class="{ active: isSkillActive(skill.id) }"
              >
                {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
              </button>
              <button @click="handleEditSkill(skill)" class="edit-btn">编辑</button>
              <button @click="handleDeleteSkill(skill.id)" class="delete-btn">删除</button>
            </div>
          </div>
          <!-- Disabled skills (collapsible) -->
          <div
            v-if="splitSkillsByActive(userSkills).disabled.length > 0"
            class="disabled-skills-section"
          >
            <button
              class="disabled-toggle"
              @click="toggleDisabledSection('user')"
            >
              <ChevronDownIcon :class="{ rotated: !isDisabledSectionExpanded('user') }" />
              <span>未启用 ({{ splitSkillsByActive(userSkills).disabled.length }})</span>
            </button>
            <div v-show="isDisabledSectionExpanded('user')" class="disabled-skill-list">
              <div
                v-for="skill in splitSkillsByActive(userSkills).disabled"
                :key="skill.id"
                class="skill-card disabled"
              >
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-badge" :class="getLocationClass(skill.location)">
                    {{ getLocationLabel(skill.location) }}
                  </span>
                </div>
                <p class="skill-description">{{ skill.description }}</p>
                <div class="skill-actions">
                  <button
                    @click="handleToggleActive(skill.id)"
                    class="toggle-btn"
                    :class="{ active: isSkillActive(skill.id) }"
                  >
                    {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
                  </button>
                  <button @click="handleEditSkill(skill)" class="edit-btn">编辑</button>
                  <button @click="handleDeleteSkill(skill.id)" class="delete-btn">删除</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Installed Skills -->
      <div v-if="installedSkills.length > 0" class="skill-section">
        <h4>安装的技能 ({{ installedSkills.length }})</h4>
        <p class="skill-path">{{ getLocationPath(installedSkills) }}</p>
        <div class="skill-list">
          <div
            v-for="skill in splitSkillsByActive(installedSkills).active"
            :key="skill.id"
            class="skill-card"
            :class="{ active: isSkillActive(skill.id) }"
          >
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-badge" :class="getLocationClass(skill.location)">
                {{ getLocationLabel(skill.location) }}
              </span>
            </div>
            <p class="skill-description">{{ skill.description }}</p>
            <div class="skill-actions">
              <button
                @click="handleToggleActive(skill.id)"
                class="toggle-btn"
                :class="{ active: isSkillActive(skill.id) }"
              >
                {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
              </button>
              <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
            </div>
          </div>
          <!-- Disabled skills (collapsible) -->
          <div
            v-if="splitSkillsByActive(installedSkills).disabled.length > 0"
            class="disabled-skills-section"
          >
            <button
              class="disabled-toggle"
              @click="toggleDisabledSection('installed')"
            >
              <ChevronDownIcon :class="{ rotated: !isDisabledSectionExpanded('installed') }" />
              <span>未启用 ({{ splitSkillsByActive(installedSkills).disabled.length }})</span>
            </button>
            <div v-show="isDisabledSectionExpanded('installed')" class="disabled-skill-list">
              <div
                v-for="skill in splitSkillsByActive(installedSkills).disabled"
                :key="skill.id"
                class="skill-card disabled"
              >
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-badge" :class="getLocationClass(skill.location)">
                    {{ getLocationLabel(skill.location) }}
                  </span>
                </div>
                <p class="skill-description">{{ skill.description }}</p>
                <div class="skill-actions">
                  <button
                    @click="handleToggleActive(skill.id)"
                    class="toggle-btn"
                    :class="{ active: isSkillActive(skill.id) }"
                  >
                    {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
                  </button>
                  <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Public Skills -->
      <div v-if="publicSkills.length > 0" class="skill-section">
        <h4>系统技能 ({{ publicSkills.length }})</h4>
        <p class="skill-path">{{ getLocationPath(publicSkills) }}</p>
        <div class="skill-list">
          <div
            v-for="skill in splitSkillsByActive(publicSkills).active"
            :key="skill.id"
            class="skill-card"
            :class="{ active: isSkillActive(skill.id) }"
          >
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-badge" :class="getLocationClass(skill.location)">
                {{ getLocationLabel(skill.location) }}
              </span>
            </div>
            <p class="skill-description">{{ skill.description }}</p>
            <div class="skill-actions">
              <button
                @click="handleToggleActive(skill.id)"
                class="toggle-btn"
                :class="{ active: isSkillActive(skill.id) }"
              >
                {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
              </button>
              <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
            </div>
          </div>
          <!-- Disabled skills (collapsible) -->
          <div
            v-if="splitSkillsByActive(publicSkills).disabled.length > 0"
            class="disabled-skills-section"
          >
            <button
              class="disabled-toggle"
              @click="toggleDisabledSection('public')"
            >
              <ChevronDownIcon :class="{ rotated: !isDisabledSectionExpanded('public') }" />
              <span>未启用 ({{ splitSkillsByActive(publicSkills).disabled.length }})</span>
            </button>
            <div v-show="isDisabledSectionExpanded('public')" class="disabled-skill-list">
              <div
                v-for="skill in splitSkillsByActive(publicSkills).disabled"
                :key="skill.id"
                class="skill-card disabled"
              >
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-badge" :class="getLocationClass(skill.location)">
                    {{ getLocationLabel(skill.location) }}
                  </span>
                </div>
                <p class="skill-description">{{ skill.description }}</p>
                <div class="skill-actions">
                  <button
                    @click="handleToggleActive(skill.id)"
                    class="toggle-btn"
                    :class="{ active: isSkillActive(skill.id) }"
                  >
                    {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
                  </button>
                  <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Example Skills -->
      <div v-if="exampleSkills.length > 0" class="skill-section">
        <h4>内置技能 ({{ exampleSkills.length }})</h4>
        <p class="skill-path">{{ getLocationPath(exampleSkills) }}</p>
        <div class="skill-list">
          <div
            v-for="skill in splitSkillsByActive(exampleSkills).active"
            :key="skill.id"
            class="skill-card"
            :class="{ active: isSkillActive(skill.id) }"
          >
            <div class="skill-header">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-badge" :class="getLocationClass(skill.location)">
                {{ getLocationLabel(skill.location) }}
              </span>
            </div>
            <p class="skill-description">{{ skill.description }}</p>
            <div class="skill-actions">
              <button
                @click="handleToggleActive(skill.id)"
                class="toggle-btn"
                :class="{ active: isSkillActive(skill.id) }"
              >
                {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
              </button>
              <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
            </div>
          </div>
          <!-- Disabled skills (collapsible) -->
          <div
            v-if="splitSkillsByActive(exampleSkills).disabled.length > 0"
            class="disabled-skills-section"
          >
            <button
              class="disabled-toggle"
              @click="toggleDisabledSection('examples')"
            >
              <ChevronDownIcon :class="{ rotated: !isDisabledSectionExpanded('examples') }" />
              <span>未启用 ({{ splitSkillsByActive(exampleSkills).disabled.length }})</span>
            </button>
            <div v-show="isDisabledSectionExpanded('examples')" class="disabled-skill-list">
              <div
                v-for="skill in splitSkillsByActive(exampleSkills).disabled"
                :key="skill.id"
                class="skill-card disabled"
              >
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-badge" :class="getLocationClass(skill.location)">
                    {{ getLocationLabel(skill.location) }}
                  </span>
                </div>
                <p class="skill-description">{{ skill.description }}</p>
                <div class="skill-actions">
                  <button
                    @click="handleToggleActive(skill.id)"
                    class="toggle-btn"
                    :class="{ active: isSkillActive(skill.id) }"
                  >
                    {{ isSkillActive(skill.id) ? '已启用' : '已禁用' }}
                  </button>
                  <button @click="handleEditSkill(skill)" class="action-btn">查看</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="registry.skills?.length === 0" class="empty-state">
        <p>暂无技能。创建一个新技能开始使用。</p>
      </div>
    </div>

    <!-- Edit Modal -->
    <Transition name="modal">
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3>{{ canEdit(editingSkill!) ? '编辑' : '查看' }}技能: {{ editingSkill?.name }}</h3>
            <button @click="showEditModal = false" class="close-btn">x</button>
          </div>
          <div class="modal-body">
            <div class="skill-meta">
              <p><strong>描述：</strong> {{ editingSkill?.description }}</p>
              <p v-if="editingSkill?.version"><strong>版本：</strong> {{ editingSkill.version }}</p>
              <p v-if="editingSkill?.author"><strong>作者：</strong> {{ editingSkill.author }}</p>
            </div>
            <div class="form-group">
              <label>技能指令（Markdown）</label>
              <textarea
                v-model="editBody"
                class="edit-textarea"
                rows="15"
                placeholder="技能指令内容..."
                :readonly="!canEdit(editingSkill!)"
              ></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showEditModal = false" class="cancel-btn">关闭</button>
            <button
              v-if="canEdit(editingSkill!)"
              @click="handleSaveEdit"
              class="confirm-btn"
              :disabled="loading"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.skills-panel {
  
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background-color: var(--color-bg-primary, white);
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: var(--color-bg-secondary, #f7f7f8);
  color: var(--color-text-primary, #111827);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn svg {
  width: 16px;
  height: 16px;
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

.error-message {
  background-color: var(--color-danger-bg, #fef2f2);
  border: 1px solid var(--color-danger, #ef4444);
  color: var(--color-danger, #dc2626);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.create-form {
  background-color: var(--color-bg-secondary, #f7f7f8);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
}

.input-field {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  background-color: var(--color-bg-primary, white);
  color: var(--color-text-primary, #111827);
}

.input-field:focus {
  outline: none;
  border-color: var(--color-primary, #22c55e);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.loading-indicator {
  text-align: center;
  padding: 24px;
  color: var(--color-text-secondary, #6b7280);
}

.skill-section {
  margin-bottom: 24px;
}

.skill-section h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-path {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  word-break: break-all;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-card {
  background-color: var(--color-bg-secondary, #f7f7f8);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  transition: border-color 0.2s;
}

.skill-card.active {
  border-color: var(--color-primary, #22c55e);
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.skill-name {
  font-weight: 600;
  font-size: 16px;
}

.skill-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.badge-user {
  background-color: #dbeafe;
  color: #1d4ed8;
}

.badge-system {
  background-color: #dcfce7;
  color: #15803d;
}

.badge-example {
  background-color: #fef3c7;
  color: #b45309;
}

.badge-installed {
  background-color: #e0e7ff;
  color: #4338ca;
}

.skill-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.4;
}

.skill-actions {
  display: flex;
  gap: 8px;
}

/* Disabled skills section (collapsible) */
.disabled-skills-section {
  margin-top: 8px;
}

.disabled-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 8px;
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
  cursor: pointer;
  width: 100%;
  transition: all 0.2s;
}

.disabled-toggle:hover {
  background-color: var(--color-bg-secondary, #f7f7f8);
  border-color: var(--color-border-focus, #ccc);
}

.disabled-toggle svg {
  width: 16px;
  height: 16px;
  transition: transform 0.2s;
}

.disabled-toggle svg.rotated {
  transform: rotate(-90deg);
}

.disabled-skill-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-card.disabled {
  opacity: 0.7;
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-text-secondary, #6b7280);
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--color-bg-primary, white);
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.skill-meta {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--color-bg-secondary, #f7f7f8);
  border-radius: 8px;
}

.skill-meta p {
  margin: 4px 0;
  font-size: 14px;
}

.edit-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  background-color: var(--color-bg-primary, white);
  color: var(--color-text-primary, #111827);
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--color-primary, #22c55e);
}

.edit-textarea:read-only {
  background-color: var(--color-bg-secondary, #f7f7f8);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
</style>
