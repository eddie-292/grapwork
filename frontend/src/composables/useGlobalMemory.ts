import { ref, computed, toRaw, type Ref } from 'vue'
import type { GlobalMemory, GlobalMemoryEntry, GlobalMemoryType } from '../types/globalMemory'

const GLOBAL_MEMORY_VERSION = 1

// 单例模式，全局共享状态
let globalMemoryManager: ReturnType<typeof useGlobalMemory> | null = null

export function useGlobalMemory() {
  // 如果已经存在实例，返回它
  if (globalMemoryManager) {
    return globalMemoryManager
  }

  const memory: Ref<GlobalMemory | null> = ref(null)
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  /**
   * 加载全局记忆
   */
  async function load(): Promise<GlobalMemory | null> {
    isLoading.value = true
    try {
      if (window.electronAPI) {
        memory.value = await window.electronAPI.getGlobalMemory()
      } else {
        // 开发环境：从 localStorage 读取
        const saved = localStorage.getItem('global-memory')
        memory.value = saved ? JSON.parse(saved) : null
      }

      if (!memory.value) {
        // 初始化默认值
        memory.value = {
          entries: [],
          version: GLOBAL_MEMORY_VERSION,
          lastUpdated: Date.now()
        }
      }

      return memory.value
    } catch (e) {
      error.value = e instanceof Error ? e : new Error('Failed to load global memory')
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 保存全局记忆
   */
  async function save(): Promise<boolean> {
    if (!memory.value) {
      console.error('[GlobalMemory] Cannot save: memory.value is null')
      return false
    }

    try {
      memory.value.lastUpdated = Date.now()

      if (window.electronAPI) {
        // Use toRaw to remove Vue's reactivity proxy before IPC
        const plainMemory = toRaw(memory.value)
        console.log('[GlobalMemory] Saving to file system via Electron API:', plainMemory)
        const result = await window.electronAPI.saveGlobalMemory(plainMemory)
        console.log('[GlobalMemory] Save result:', result)
        return result
      } else {
        console.log('[GlobalMemory] Saving to localStorage:', memory.value)
        localStorage.setItem('global-memory', JSON.stringify(memory.value))
        console.log('[GlobalMemory] Saved to localStorage successfully')
        return true
      }
    } catch (e) {
      console.error('[GlobalMemory] Save failed:', e)
      error.value = e instanceof Error ? e : new Error('Failed to save global memory')
      return false
    }
  }

  /**
   * 添加新条目
   */
  async function addEntry(
    type: GlobalMemoryType,
    category: string,
    title: string,
    content: string,
    keywords: string[] = []
  ): Promise<GlobalMemoryEntry> {
    if (!memory.value) await load()

    const entry: GlobalMemoryEntry = {
      id: `gm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      category: category.trim(),
      title: title.trim(),
      content: content.trim(),
      keywords: keywords.map(k => k.trim()).filter(k => k.length > 0),
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        usageCount: 0
      }
    }

    memory.value!.entries.push(entry)
    await save()
    return entry
  }

  /**
   * 更新条目
   */
  async function updateEntry(id: string, updates: Partial<Omit<GlobalMemoryEntry, 'id' | 'createdAt'>>): Promise<boolean> {
    if (!memory.value) return false

    const index = memory.value.entries.findIndex(e => e.id === id)
    if (index === -1) return false

    const existing = memory.value.entries[index]
    if (!existing) return false

    // 只更新提供的字段（排除 undefined）
    const cleanedUpdates: Partial<GlobalMemoryEntry> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (cleanedUpdates as any)[key] = value
      }
    }

    // Use toRaw to avoid spreading reactive proxies
    const plainExisting = toRaw(existing)
    memory.value.entries[index] = {
      ...plainExisting,
      ...cleanedUpdates,
      id, // Preserve ID
      createdAt: plainExisting.createdAt, // Preserve creation time
      updatedAt: Date.now()
    }

    return await save()
  }

  /**
   * 删除条目
   */
  async function deleteEntry(id: string): Promise<boolean> {
    if (!memory.value) return false

    memory.value.entries = memory.value.entries.filter(e => e.id !== id)
    return await save()
  }

  /**
   * 切换启用状态
   */
  async function toggleEntry(id: string): Promise<boolean> {
    if (!memory.value) return false

    const entry = memory.value.entries.find(e => e.id === id)
    if (entry) {
      entry.enabled = !entry.enabled
      entry.updatedAt = Date.now()
      return await save()
    }
    return false
  }

  /**
   * 智能匹配相关记忆条目
   * 根据用户消息的关键词计算相关性分数
   */
  function findRelevantEntries(userMessage: string, maxEntries = 5): GlobalMemoryEntry[] {
    if (!memory.value || memory.value.entries.length === 0) return []

    const messageLower = userMessage.toLowerCase()
    const messageWords = new Set(
      messageLower
        .split(/[\s\u4e00-\u9fa5,;.!?。，；！？]+/) // 支持中英文分词
        .filter(w => w.length > 1)
    )

    const enabledEntries = memory.value.entries.filter(e => e.enabled)
    if (enabledEntries.length === 0) return []

    // 计算每个条目的相关性分数
    const scored = enabledEntries.map(entry => {
      let score = 0

      // 关键词匹配（每个匹配关键词 +2 分）
      entry.keywords.forEach(kw => {
        if (messageLower.includes(kw.toLowerCase())) {
          score += 2
        }
      })

      // 分类匹配（+1 分）
      if (messageWords.has(entry.category.toLowerCase())) {
        score += 1
      }

      // 标题匹配（+1 分）
      if (messageLower.includes(entry.title.toLowerCase())) {
        score += 1
      }

      // 内容匹配（+0.5 分，最多 2 分）
      const contentMatches = entry.content
        .toLowerCase()
        .split(/\s+/)
        .filter(word => messageWords.has(word) && word.length > 2).length
      score += Math.min(contentMatches * 0.5, 2)

      // 最近使用加权（最近 7 天内使用过 +1 分）
      if (entry.metadata?.lastUsedAt) {
        const daysSinceUsed = (Date.now() - entry.metadata.lastUsedAt) / (1000 * 60 * 60 * 24)
        if (daysSinceUsed < 7) {
          score += 1
        }
      }

      return { entry, score }
    })

    // 过滤掉分数为 0 的，按分数排序，返回前 N 个
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEntries)
      .map(s => s.entry)
  }

  /**
   * 生成智能匹配的注入上下文
   * 用于 LLM 请求中
   */
  function generateInjectContext(userMessage: string): string {
    const relevantEntries = findRelevantEntries(userMessage)

    if (relevantEntries.length === 0) return ''

    const parts = relevantEntries.map(entry =>
      `[${entry.category}/${entry.title}]\n${entry.content}`
    )

    // 更新使用统计
    relevantEntries.forEach(entry => {
      entry.metadata = entry.metadata || {}
      entry.metadata.usageCount = (entry.metadata.usageCount || 0) + 1
      entry.metadata.lastUsedAt = Date.now()
    })
    save() // 异步保存，不等待

    return `用户的全局偏好和设置：\n${parts.join('\n\n')}`
  }

  // Computed properties
  const entries = computed(() => memory.value?.entries ?? [])

  const entriesByType = (type: GlobalMemoryType) =>
    computed(() => entries.value.filter(e => e.type === type))

  const entriesByCategory = (category: string) =>
    computed(() => entries.value.filter(e => e.category === category))

  // 获取所有唯一的分类
  const categories = computed(() => {
    const cats = new Set(entries.value.map(e => e.category))
    return Array.from(cats).sort()
  })

  // 获取启用的条目
  const enabledEntries = computed(() => entries.value.filter(e => e.enabled))

  const manager = {
    // State
    memory,
    isLoading,
    error,
    entries,
    enabledEntries,
    categories,

    // Methods
    load,
    save,
    addEntry,
    updateEntry,
    deleteEntry,
    toggleEntry,
    generateInjectContext,
    findRelevantEntries,
    entriesByType,
    entriesByCategory
  }

  // 设置为单例
  globalMemoryManager = manager

  return manager
}
