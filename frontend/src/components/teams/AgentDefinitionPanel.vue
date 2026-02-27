<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAgentTeam } from '@/composables/useAgentTeam'
import type { AgentTeam, AgentDefinition, AgentCapabilities } from '@/types/agentTeam'
import { createDefaultCapabilities } from '@/types/agentTeam'

const props = defineProps<{
  team: AgentTeam
  agent: AgentDefinition | null
}>()

const emit = defineEmits<{
  close: []
  save: []
}>()

const teamManager = useAgentTeam()

// Form state
const formData = ref({
  name: '',
  description: '',
  systemPrompt: '',
  capabilities: createDefaultCapabilities()
})

// Computed
const isEditing = computed(() => !!props.agent)
const modalTitle = computed(() => isEditing.value ? '编辑 Team Lead' : '配置 Team Lead')

// Watch for agent changes
watch(() => props.agent, (agent) => {
  if (agent) {
    formData.value = {
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      capabilities: { ...agent.capabilities }
    }
  } else {
    resetForm()
  }
}, { immediate: true })

// Methods
function resetForm() {
  const orchestrator = props.team.orchestrator
  formData.value = {
    name: orchestrator.name,
    description: orchestrator.description,
    systemPrompt: orchestrator.systemPrompt,
    capabilities: { ...orchestrator.capabilities }
  }
}

async function handleSave() {
  if (!formData.value.name.trim()) return

  // 在新架构中，只更新 Orchestrator
  await teamManager.updateAgent(props.team.id, props.team.orchestrator.id, {
    name: formData.value.name,
    description: formData.value.description,
    systemPrompt: formData.value.systemPrompt,
    capabilities: { ...formData.value.capabilities }
  })

  emit('save')
}

function handleClose() {
  emit('close')
}

function toggleCapability(key: keyof AgentCapabilities) {
  if (key === 'maxToolCallsPerTurn') return
  formData.value.capabilities[key] = !formData.value.capabilities[key]
}
</script>

<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{{ modalTitle }}</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div class="modal-body">
        <!-- Name -->
        <div class="form-group">
          <label>名称 <span class="required">*</span></label>
          <input
            v-model="formData.name"
            placeholder="Agent 名称..."
            class="input-field"
          />
        </div>

        <!-- Description -->
        <div class="form-group">
          <label>描述</label>
          <textarea
            v-model="formData.description"
            placeholder="描述此 Agent 的职责和能力..."
            class="input-field"
            rows="2"
          ></textarea>
        </div>

        <!-- System Prompt -->
        <div class="form-group">
          <label>系统提示词</label>
          <textarea
            v-model="formData.systemPrompt"
            placeholder="Agent 的系统提示词..."
            class="input-field prompt-field"
            rows="8"
          ></textarea>
        </div>

        <!-- Capabilities -->
        <div class="form-group">
          <label>能力</label>
          <div class="capabilities-grid">
            <label class="capability-toggle">
              <input
                type="checkbox"
                :checked="formData.capabilities.canUseMCP"
                @change="toggleCapability('canUseMCP')"
              />
              <span>MCP 工具</span>
            </label>
            <label class="capability-toggle">
              <input
                type="checkbox"
                :checked="formData.capabilities.canReadFiles"
                @change="toggleCapability('canReadFiles')"
              />
              <span>读取文件</span>
            </label>
            <label class="capability-toggle">
              <input
                type="checkbox"
                :checked="formData.capabilities.canWriteFiles"
                @change="toggleCapability('canWriteFiles')"
              />
              <span>写入文件</span>
            </label>
            <label class="capability-toggle">
              <input
                type="checkbox"
                :checked="formData.capabilities.canExecuteCommands"
                @change="toggleCapability('canExecuteCommands')"
              />
              <span>执行命令</span>
            </label>
          </div>
        </div>

        <!-- Max tool calls -->
        <div class="form-group">
          <label>每轮最大工具调用次数</label>
          <input
            type="number"
            v-model.number="formData.capabilities.maxToolCallsPerTurn"
            min="1"
            max="50"
            class="input-field small"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn secondary" @click="handleClose">取消</button>
        <button
          class="btn primary"
          @click="handleSave"
          :disabled="!formData.name.trim()"
        >
          {{ isEditing ? '保存' : '添加' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 6px;
}

.required {
  color: #c00;
}

.input-field {
  width: 100%;
  background: #fafafa;
  border: 1px solid #eee;
  color: #333;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: #ccc;
  background: #fff;
}

.input-field.small {
  width: 120px;
}

textarea.input-field {
  resize: vertical;
  font-family: inherit;
  min-height: 80px;
}

.prompt-field {
  font-family: 'SF Mono', Monaco, 'Andale Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.capability-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid #eee;
  transition: all 0.2s;
}

.capability-toggle:hover {
  background: #eee;
  border-color: #ccc;
}

.capability-toggle input {
  accent-color: #333;
}

.capability-toggle span {
  font-size: 13px;
  color: #333;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #eee;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn.primary {
  background: #333;
  color: #fff;
  border-color: #333;
}

.btn.primary:disabled {
  background: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

.btn.secondary {
  background: #f5f5f5;
  color: #333;
}

.btn.secondary:hover {
  background: #eee;
}
</style>
