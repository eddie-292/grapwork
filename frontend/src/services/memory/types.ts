/**
 * AI Agent 记忆系统类型定义
 * 
 * 三层记忆模型：
 * 1. 用户画像 (User Context) - 当前状态摘要
 * 2. 时间线历史 (History) - 按时间组织的历史信息
 * 3. 离散事实 (Facts) - 原子化的具体信息
 */

// ==================== 事实分类 ====================

/**
 * 事实类别
 * - preference: 偏好（工具、风格、方式）
 * - knowledge: 知识/技能（技术栈、领域知识）
 * - context: 背景信息（工作、项目、环境）
 * - behavior: 行为模式（工作习惯、沟通方式）
 * - goal: 目标/计划（短期、中期、长期）
 */
export type FactCategory = 'preference' | 'knowledge' | 'context' | 'behavior' | 'goal'

// ==================== 用户画像 ====================

/**
 * 用户画像条目
 */
export interface UserProfileEntry {
  summary: string
  updatedAt: string // ISO 8601
}

/**
 * 用户画像
 * - workContext: 工作背景（2-3 句话）
 * - personalContext: 个人特点（1-2 句话）
 * - topOfMind: 当前关注点（3-5 句话，高频更新）
 */
export interface UserProfile {
  workContext: UserProfileEntry
  personalContext: UserProfileEntry
  topOfMind: UserProfileEntry
}

// ==================== 时间线历史 ====================

/**
 * 历史记录条目
 */
export interface HistoryEntry {
  summary: string
  updatedAt: string // ISO 8601
}

/**
 * 时间线历史
 * - recentMonths: 近期活动（1-3 个月，4-6 句或 1-2 段）
 * - earlierContext: 较早背景（3-12 个月，3-5 句或 1 段）
 * - longTermBackground: 长期背景（整体/长期，2-4 句）
 */
export interface History {
  recentMonths: HistoryEntry
  earlierContext: HistoryEntry
  longTermBackground: HistoryEntry
}

// ==================== 离散事实 ====================

/**
 * 离散事实
 */
export interface Fact {
  id: string
  content: string
  category: FactCategory
  confidence: number // 0-1
  createdAt: string // ISO 8601
  source: string // 线程 ID 或会话 ID
}

// ==================== 完整记忆数据 ====================

/**
 * 完整记忆数据结构
 */
export interface MemoryData {
  version: string
  lastUpdated: string // ISO 8601
  user: UserProfile
  history: History
  facts: Fact[]
}

// ==================== 更新相关类型 ====================

/**
 * 更新条目（用于 LLM 响应）
 */
export interface UpdateEntry {
  summary: string
  shouldUpdate: boolean
}

/**
 * 新事实（用于 LLM 响应）
 */
export interface NewFact {
  content: string
  category: FactCategory
  confidence: number
}

/**
 * LLM 更新响应
 */
export interface MemoryUpdateResponse {
  user: {
    workContext: UpdateEntry
    personalContext: UpdateEntry
    topOfMind: UpdateEntry
  }
  history: {
    recentMonths: UpdateEntry
    earlierContext: UpdateEntry
    longTermBackground: UpdateEntry
  }
  newFacts: NewFact[]
  factsToRemove: string[] // fact IDs
}

// ==================== 队列相关类型 ====================

/**
 * 队列项
 */
export interface QueueItem {
  threadId: string
  messages: ConversationMessage[]
  timestamp: number
}

/**
 * 对话消息（用于记忆更新）
 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// ==================== 配置类型 ====================

/**
 * 记忆系统配置
 */
export interface MemoryConfig {
  // 防抖时间（毫秒）
  debounceMs: number
  // 最大事实数量
  maxFacts: number
  // 最低置信度阈值
  minConfidence: number
  // 注入 Token 预算
  maxInjectionTokens: number
  // 记忆更新使用的模型（可选，用于指定轻量级模型）
  updateModel?: string
}

/**
 * 默认配置
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  debounceMs: 30000, // 30 秒
  maxFacts: 200,
  minConfidence: 0.7,
  maxInjectionTokens: 2000,
}

// ==================== 导出默认空记忆 ====================

/**
 * 创建空的记忆数据
 */
export function createEmptyMemory(): MemoryData {
  const now = new Date().toISOString()
  const emptyEntry: UserProfileEntry | HistoryEntry = {
    summary: '',
    updatedAt: now,
  }

  return {
    version: '1.0',
    lastUpdated: now,
    user: {
      workContext: { ...emptyEntry },
      personalContext: { ...emptyEntry },
      topOfMind: { ...emptyEntry },
    },
    history: {
      recentMonths: { ...emptyEntry },
      earlierContext: { ...emptyEntry },
      longTermBackground: { ...emptyEntry },
    },
    facts: [],
  }
}