/**
 * 工作记忆管理 Composable
 * 提供基于统一持久层的持久化任务工作记忆存储
 */

import { ref, computed, type Ref } from 'vue'
import { WorkingMemoryType } from '../types/task'
import type { WorkingMemory, WorkingMemoryEntry } from '../types/task'
import { storage } from '../services/StorageService'

const WORKING_MEMORY_VERSION = 1
const DEFAULT_MAX_ENTRIES = 50

export function useWorkingMemory(chatId: string) {
  const memory: Ref<WorkingMemory | null> = ref(null)
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  /**
   * 加载工作记忆
   */
  async function load(): Promise<WorkingMemory | null> {
    isLoading.value = true
    try {
      const result = await storage.getWorkingMemory(chatId)

      if (!result) {
        memory.value = null
        return null
      }

      // 版本检查
      if (result.version !== WORKING_MEMORY_VERSION) {
        console.warn('Working memory version mismatch, migrating...')
        const migrated = migrateWorkingMemory(result)
        memory.value = migrated
        // 自动保存迁移后的数据
        await save()
        return migrated
      }

      memory.value = result
      return result
    } catch (e) {
      error.value = e instanceof Error ? e : new Error('Failed to load working memory')
      console.error('Failed to load working memory:', e)
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 保存工作记忆
   */
  async function save(): Promise<boolean> {
    if (!memory.value) {
      console.warn('No working memory to save')
      return false
    }

    try {
      memory.value.lastUpdated = Date.now()

      // 检查配额
      const json = JSON.stringify(memory.value)
      const sizeInBytes = new Blob([json]).size
      if (sizeInBytes > 4 * 1024 * 1024) {
        // 4MB 警告阈值
        console.warn(`Working memory size exceeds 4MB (${Math.round(sizeInBytes / 1024 / 1024)}MB), consider cleanup`)
      }

      return await storage.saveWorkingMemory(chatId, memory.value)
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        // 配额超限处理
        console.error('LocalStorage quota exceeded, attempting cleanup...')
        return await handleQuotaExceeded()
      }
      error.value = e instanceof Error ? e : new Error('Failed to save working memory')
      console.error('Failed to save working memory:', e)
      return false
    }
  }

  /**
   * 添加工作记忆条目
   */
  async function addEntry(
    type: WorkingMemoryType,
    taskId: number,
    taskDescription: string,
    content: string,
    maxEntries?: number
  ): Promise<WorkingMemoryEntry | null> {
    // 初始化工作记忆
    if (!memory.value) {
      memory.value = {
        chatId,
        entries: [],
        lastUpdated: Date.now(),
        version: WORKING_MEMORY_VERSION
      }
    }

    const entry: WorkingMemoryEntry = {
      id: `${Date.now()}-${taskId}-${type}`,
      type,
      taskId,
      taskDescription,
      content,
      timestamp: Date.now(),
      metadata: {
        wordCount: content.length,
        summary: content.slice(0, 100) + (content.length > 100 ? '...' : '')
      }
    }

    memory.value.entries.push(entry)

    // 限制每种类型的条目数量
    const limit = maxEntries ?? DEFAULT_MAX_ENTRIES
    const entriesByType = memory.value.entries.filter(e => e.type === type)
    if (entriesByType.length > limit) {
      // 删除最旧的条目
      const toRemove = entriesByType.slice(0, entriesByType.length - limit)
      memory.value.entries = memory.value.entries.filter(e => !toRemove.includes(e))
    }

    await save()
    return entry
  }

  /**
   * 获取特定类型的工作记忆
   */
  function getEntriesByType(type: WorkingMemoryType): WorkingMemoryEntry[] {
    if (!memory.value) return []
    return memory.value.entries.filter(e => e.type === type)
  }

  /**
   * 获取特定任务的工作记忆
   */
  function getEntriesByTaskId(taskId: number): WorkingMemoryEntry[] {
    if (!memory.value) return []
    return memory.value.entries.filter(e => e.taskId === taskId)
  }

  /**
   * 更新工作记忆条目
   */
  async function updateEntry(id: string, content: string): Promise<boolean> {
    if (!memory.value) return false

    const entry = memory.value.entries.find(e => e.id === id)
    if (!entry) return false

    entry.content = content
    entry.timestamp = Date.now()
    entry.metadata = {
      ...entry.metadata,
      wordCount: content.length,
      summary: content.slice(0, 100) + (content.length > 100 ? '...' : '')
    }

    return await save()
  }

  /**
   * 删除工作记忆条目
   */
  async function deleteEntry(id: string): Promise<boolean> {
    if (!memory.value) return false

    memory.value.entries = memory.value.entries.filter(e => e.id !== id)
    return await save()
  }

  /**
   * 清空工作记忆
   */
  async function clear(): Promise<void> {
    await storage.deleteWorkingMemory(chatId)
    memory.value = null
  }

  /**
   * 处理配额超限
   */
  async function handleQuotaExceeded(): Promise<boolean> {
    if (!memory.value) return false

    // 策略1: 删除最旧的草稿
    const drafts = memory.value.entries.filter(e => e.type === WorkingMemoryType.DRAFTS)
    if (drafts.length > 10) {
      const toRemove = drafts.slice(0, drafts.length - 10)
      memory.value.entries = memory.value.entries.filter(e => !toRemove.includes(e))
      try {
        await save()
        console.log('Cleaned up old drafts to free space')
        return true
      } catch (e) {
        console.error('Draft cleanup failed:', e)
      }
    }

    // 策略2: 删除最旧的笔记
    const notes = memory.value.entries.filter(e => e.type === WorkingMemoryType.NOTES)
    if (notes.length > 10) {
      const toRemove = notes.slice(0, notes.length - 10)
      memory.value.entries = memory.value.entries.filter(e => !toRemove.includes(e))
      try {
        await save()
        console.log('Cleaned up old notes to free space')
        return true
      } catch (e) {
        console.error('Note cleanup failed:', e)
      }
    }

    // 策略3: 压缩内容（截断过长的内容）
    const hasLongContent = memory.value.entries.some(e => e.content.length > 5000)
    if (hasLongContent) {
      memory.value.entries = memory.value.entries.map(e => ({
        ...e,
        content: e.content.length > 5000
          ? e.content.slice(0, 5000) + '\n\n[内容过长已截断...]'
          : e.content
      }))
      try {
        await save()
        console.log('Compressed long content to free space')
        return true
      } catch (e) {
        console.error('Compression failed:', e)
      }
    }

    console.error('All cleanup strategies failed')
    return false
  }

  /**
   * 版本迁移
   */
  function migrateWorkingMemory(old: any): WorkingMemory {
    // 未来版本迁移逻辑
    if (old.version === 0) {
      // 从版本 0 迁移到版本 1
      return {
        ...old,
        version: WORKING_MEMORY_VERSION,
        entries: old.entries.map((e: any) => ({
          ...e,
          metadata: e.metadata || {}
        }))
      }
    }

    return old as WorkingMemory
  }

  // 计算属性
  const notes = computed(() => getEntriesByType(WorkingMemoryType.NOTES))
  const drafts = computed(() => getEntriesByType(WorkingMemoryType.DRAFTS))
  const finalResults = computed(() => getEntriesByType(WorkingMemoryType.FINAL_RESULT))
  const allEntries = computed(() => memory.value?.entries ?? [])

  return {
    // 状态
    memory,
    isLoading,
    error,
    notes,
    drafts,
    finalResults,
    allEntries,

    // 方法
    load,
    save,
    addEntry,
    updateEntry,
    deleteEntry,
    clear,
    getEntriesByType,
    getEntriesByTaskId
  }
}
