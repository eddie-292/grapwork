/**
 * Skills Management Composable
 * Following the useMCP.ts pattern
 */
import { ref, computed, toRaw } from 'vue'
import { storage } from '@/services/StorageService'
import type {
  Skill,
  SkillRegistry,
  SkillContext,
  SkillLocation
} from '@/types/skill'

// Check if in Electron environment
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

// Singleton pattern
let skillsManager: ReturnType<typeof createSkillsManager> | null = null

function createSkillsManager() {
  const registry = ref<SkillRegistry>({
    skills: [],
    activeSkillIds: [],
    version: 1,
    lastUpdated: Date.now()
  })

  const loading = ref(false)
  const error = ref<string | null>(null)

  // Cache for loaded skill bodies (L2)
  const loadedSkills = ref<Map<string, Skill>>(new Map())

  /**
   * Scan and refresh skills from file system
   */
  async function scanSkills(): Promise<void> {
    if (!isElectronEnv || !window.electronAPI?.skillsScan) {
      error.value = 'Skills require Electron environment'
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.skillsScan()

      if (!result.success) {
        error.value = 'Failed to scan skills'
        return
      }

      // Merge with existing registry to preserve enabled/active state
      const existingEnabledMap = new Map(
        registry.value.skills.map(s => [s.id, s.enabled])
      )

      registry.value.skills = result.skills.map(skill => ({
        ...skill,
        enabled: existingEnabledMap.get(skill.id) ?? true
      }))

      // Preserve active IDs that still exist
      const validSkillIds = new Set(result.skills.map(s => s.id))
      registry.value.activeSkillIds = registry.value.activeSkillIds.filter(
        id => validSkillIds.has(id)
      )

      // Log scan errors
      if (result.errors.length > 0) {
        console.warn('[Skills] Scan errors:', result.errors)
      }

      await saveRegistry()
    } catch (e: any) {
      error.value = e?.message || 'Failed to scan skills'
      console.error('[Skills] Scan failed:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Load registry from storage
   */
  async function loadRegistry(): Promise<void> {
    loading.value = true
    try {
      const data = await storage.getSkillRegistry()
      registry.value = data

      // Scan file system to detect changes
      await scanSkills()
    } catch (e: any) {
      error.value = e?.message || 'Failed to load skills registry'
      console.error('[Skills] Load failed:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Save registry to storage
   */
  async function saveRegistry(): Promise<void> {
    registry.value.lastUpdated = Date.now()
    const plainRegistry = toRaw(registry.value)
    await storage.saveSkillRegistry(plainRegistry)
  }

  /**
   * Load skill body (L2)
   */
  async function loadSkillBody(skillId: string): Promise<Skill | null> {
    // Check cache first
    if (loadedSkills.value.has(skillId)) {
      return loadedSkills.value.get(skillId)!
    }

    if (!isElectronEnv || !window.electronAPI?.skillsLoad) {
      return null
    }

    try {
      const result = await window.electronAPI.skillsLoad(skillId)

      if (result.success && result.skill) {
        loadedSkills.value.set(skillId, result.skill)
        return result.skill
      }

      console.error('[Skills] Load body failed:', result.error)
      return null
    } catch (e) {
      console.error('[Skills] Load body error:', e)
      return null
    }
  }

  /**
   * Create new skill (user location)
   */
  async function createSkill(
    name: string,
    description: string
  ): Promise<Skill | null> {
    if (!isElectronEnv || !window.electronAPI?.skillsCreate) {
      error.value = 'Skills require Electron environment'
      return null
    }

    loading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.skillsCreate(name, description)

      if (result.success && result.skill) {
        registry.value.skills.push(result.skill)
        await saveRegistry()
        loadedSkills.value.set(result.skill.id, result.skill)
        return result.skill
      }

      error.value = result.error || 'Failed to create skill'
      return null
    } catch (e: any) {
      error.value = e?.message || 'Failed to create skill'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Update skill body (user location only)
   */
  async function updateSkillBody(
    skillId: string,
    body: string
  ): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.skillsUpdate) {
      return false
    }

    try {
      const result = await window.electronAPI.skillsUpdate(skillId, body)

      if (result.success) {
        // Update cache
        const cached = loadedSkills.value.get(skillId)
        if (cached) {
          cached.body = body
          cached.updatedAt = Date.now()
        }
        return true
      }

      error.value = result.error || 'Failed to update skill'
      return false
    } catch (e: any) {
      error.value = e?.message || 'Failed to update skill'
      return false
    }
  }

  /**
   * Delete skill (user location only)
   */
  async function deleteSkill(skillId: string): Promise<boolean> {
    if (!isElectronEnv || !window.electronAPI?.skillsDelete) {
      return false
    }

    loading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.skillsDelete(skillId)

      if (result.success) {
        registry.value.skills = registry.value.skills.filter(s => s.id !== skillId)
        registry.value.activeSkillIds = registry.value.activeSkillIds.filter(id => id !== skillId)
        loadedSkills.value.delete(skillId)
        await saveRegistry()
        return true
      }

      error.value = result.error || 'Failed to delete skill'
      return false
    } catch (e: any) {
      error.value = e?.message || 'Failed to delete skill'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Toggle skill active state
   */
  async function toggleSkillActive(skillId: string): Promise<void> {
    const index = registry.value.activeSkillIds.indexOf(skillId)

    if (index === -1) {
      registry.value.activeSkillIds.push(skillId)
    } else {
      registry.value.activeSkillIds.splice(index, 1)
    }

    await saveRegistry()
  }

  /**
   * Toggle skill enabled state
   */
  async function toggleSkillEnabled(skillId: string): Promise<void> {
    const skill = registry.value.skills.find(s => s.id === skillId)

    if (skill) {
      skill.enabled = !skill.enabled

      if (!skill.enabled) {
        // Remove from active if disabled
        registry.value.activeSkillIds = registry.value.activeSkillIds.filter(
          id => id !== skillId
        )
      }

      await saveRegistry()
    }
  }

  // Computed properties
  const activeSkills = computed(() => {
    return registry.value.skills.filter(
      s => registry.value.activeSkillIds.includes(s.id) && s.enabled && !s.hasError
    )
  })

  const userSkills = computed(() =>
    registry.value.skills.filter(s => s.location === 'user')
  )

  const publicSkills = computed(() =>
    registry.value.skills.filter(s => s.location === 'public')
  )

  const installedSkills = computed(() =>
    registry.value.skills.filter(s => s.location === 'installed')
  )

  const exampleSkills = computed(() =>
    registry.value.skills.filter(s => s.location === 'examples')
  )

  /**
   * Generate context for LLM injection (L1 - name + description only)
   */
  function generateSkillContext(): string {
    const active = activeSkills.value

    if (active.length === 0) return ''

    const skillList = active
      .map((skill, index) => {
        //const locationLabel = skill.location === 'user' ? '用户' : skill.location === 'installed' ? '安装' : skill.location === 'public' ? '系统' : '内置'
        const skillMdPath = `${skill.path}/SKILL.md`
        return `${index + 1}. **${skill.name}**
   描述: ${skill.description}
   路径: ${skillMdPath}`
      })
      .join('\n\n')

    return `## 可用技能列表

以下技能可根据任务需求加载使用。当你认为当前任务需要某个技能时，请使用 read_file 工具读取对应路径的 SKILL.md 文件来获取完整的技能说明。

${skillList}

**使用说明**: 当任务与某个技能描述匹配时，先读取该技能的 SKILL.md 文件，然后按照其中的指令执行任务。`
  }

  /**
   * Generate L1 context as structured data
   */
  function getSkillContexts(): SkillContext[] {
    return activeSkills.value.map(skill => ({
      name: skill.name,
      description: skill.description,
      location: skill.location as SkillLocation
    }))
  }

  /**
   * Load and generate L2 context (full skill bodies)
   */
  async function generateFullSkillContext(): Promise<string> {
    const active = activeSkills.value

    if (active.length === 0) return ''

    const parts: string[] = []

    for (const skill of active) {
      const fullSkill = await loadSkillBody(skill.id)

      if (fullSkill) {
        parts.push(`## Skill: ${skill.name}\n\n${fullSkill.body}`)
      }
    }

    return parts.join('\n\n---\n\n')
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null
  }

  return {
    // State
    registry,
    loading,
    error,
    loadedSkills,

    // Computed
    activeSkills,
    userSkills,
    publicSkills,
    installedSkills,
    exampleSkills,

    // Methods
    scanSkills,
    loadRegistry,
    saveRegistry,
    loadSkillBody,
    createSkill,
    updateSkillBody,
    deleteSkill,
    toggleSkillActive,
    toggleSkillEnabled,
    clearError,

    // Context generation
    generateSkillContext,
    getSkillContexts,
    generateFullSkillContext
  }
}

export function useSkills() {
  if (!skillsManager) {
    skillsManager = createSkillsManager()
  }
  return skillsManager
}
