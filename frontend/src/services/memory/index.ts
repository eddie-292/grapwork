/**
 * 记忆系统模块入口
 * 
 * 导出所有公共 API
 * 
 * 注意：此模块包含 Node.js 依赖，仅可在 Electron 主进程中使用
 */

// 主服务
export {
  MemoryService,
  initMemoryService,
  getMemoryService,
  isMemoryServiceInitialized,
  getMemory,
  getFormattedMemory,
  injectMemory,
  requestMemoryUpdate,
} from './MemoryService'

// 类型
export type {
  FactCategory,
  UserProfileEntry,
  UserProfile,
  HistoryEntry,
  History,
  Fact,
  MemoryData,
  UpdateEntry,
  NewFact,
  MemoryUpdateResponse,
  QueueItem,
  ConversationMessage,
  MemoryConfig,
} from './types'

export { DEFAULT_MEMORY_CONFIG, createEmptyMemory } from './types'

// 存储
export type { IMemoryStore } from './store'
export {
  FileMemoryStore,
  InMemoryStore,
  initMemoryStore,
  getMemoryStore,
  createDefaultFileStore,
} from './store'

// 注入
export {
  formatMemoryForInjection,
  injectMemoryIntoPrompt,
  isMemoryEmpty,
  getMemoryStats,
} from './injector'
export type { InjectionConfig } from './injector'

// 更新
export {
  buildUpdatePrompt,
  parseUpdateResponse,
  applyUpdates,
  filterMessagesForMemory,
} from './updater'

// 队列
export {
  MemoryUpdateQueue,
  initMemoryQueue,
  getMemoryQueue,
} from './queue'
export type { UpdateHandler } from './queue'