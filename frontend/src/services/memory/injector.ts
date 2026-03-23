/**
 * 记忆注入模块
 * 
 * 负责将记忆数据格式化为文本，用于注入到系统提示词中
 * 支持 Token 预算管理和优先级排序
 */

import type { MemoryData, Fact } from './types'

/**
 * Token 计算器
 * 简单估算，实际项目中可以使用 tiktoken
 */
function estimateTokens(text: string): number {
  if (!text) return 0

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  // 其他字符
  const otherChars = text.length - chineseChars

  // 中文约 1.5 字符/token，英文约 4 字符/token
  return Math.ceil(otherChars / 4 + chineseChars / 1.5)
}

/**
 * 格式化用户画像
 */
function formatUserProfile(user: MemoryData['user']): string {
  const sections: string[] = []

  if (user.workContext.summary) {
    sections.push(`- Work: ${user.workContext.summary}`)
  }
  if (user.personalContext.summary) {
    sections.push(`- Personal: ${user.personalContext.summary}`)
  }
  if (user.topOfMind.summary) {
    sections.push(`- Current Focus: ${user.topOfMind.summary}`)
  }

  if (sections.length === 0) {
    return ''
  }

  return `User Context:\n${sections.join('\n')}`
}

/**
 * 格式化历史记录
 */
function formatHistory(history: MemoryData['history']): string {
  const sections: string[] = []

  if (history.recentMonths.summary) {
    sections.push(`- Recent: ${history.recentMonths.summary}`)
  }
  if (history.earlierContext.summary) {
    sections.push(`- Earlier: ${history.earlierContext.summary}`)
  }

  if (sections.length === 0) {
    return ''
  }

  return `History:\n${sections.join('\n')}`
}

/**
 * 格式化事实列表
 * 按置信度排序，在 Token 限制内选择最重要的事实
 */
function formatFacts(facts: Fact[], maxTokens: number, currentTokens: number): string {
  if (facts.length === 0) {
    return ''
  }

  // 按置信度降序排列
  const sortedFacts = [...facts].sort((a, b) => b.confidence - a.confidence)

  const lines: string[] = []
  let remainingTokens = maxTokens - currentTokens

  for (const fact of sortedFacts) {
    const line = `- [${fact.category} | ${fact.confidence.toFixed(2)}] ${fact.content}`
    const lineTokens = estimateTokens(line)

    if (remainingTokens >= lineTokens) {
      lines.push(line)
      remainingTokens -= lineTokens
    } else {
      // Token 预算用完
      break
    }
  }

  if (lines.length === 0) {
    return ''
  }

  return `Facts:\n${lines.join('\n')}`
}

/**
 * 注入配置
 */
export interface InjectionConfig {
  maxTokens: number
  includeHistory?: boolean
  includeFacts?: boolean
}

/**
 * 格式化记忆用于注入
 * 
 * @param memory 记忆数据
 * @param config 注入配置
 * @returns 格式化后的记忆文本
 */
export function formatMemoryForInjection(
  memory: MemoryData,
  config: InjectionConfig = { maxTokens: 2000 }
): string {
  const sections: string[] = []
  let currentTokens = 0

  // 1. 用户画像（优先级最高）
  const userSection = formatUserProfile(memory.user)
  if (userSection) {
    const userTokens = estimateTokens(userSection)
    if (currentTokens + userTokens <= config.maxTokens) {
      sections.push(userSection)
      currentTokens += userTokens
    }
  }

  // 2. 历史记录
  if (config.includeHistory !== false) {
    const historySection = formatHistory(memory.history)
    if (historySection) {
      const historyTokens = estimateTokens(historySection)
      if (currentTokens + historyTokens <= config.maxTokens) {
        sections.push(historySection)
        currentTokens += historyTokens
      }
    }
  }

  // 3. 离散事实
  if (config.includeFacts !== false && memory.facts.length > 0) {
    const factsSection = formatFacts(memory.facts, config.maxTokens, currentTokens)
    if (factsSection) {
      sections.push(factsSection)
    }
  }

  return sections.join('\n\n')
}

/**
 * 生成完整的系统提示词（带记忆注入）
 * 
 * @param basePrompt 基础系统提示词
 * @param memory 记忆数据
 * @param config 注入配置
 * @returns 完整的系统提示词
 */
export function injectMemoryIntoPrompt(
  basePrompt: string,
  memory: MemoryData,
  config: InjectionConfig = { maxTokens: 2000 }
): string {
  const memoryText = formatMemoryForInjection(memory, config)

  if (!memoryText) {
    return basePrompt
  }

  // 将记忆注入到提示词中
  return `${basePrompt}

<memory>
${memoryText}
</memory>`
}

/**
 * 检查记忆是否为空
 */
export function isMemoryEmpty(memory: MemoryData): boolean {
  const hasUserProfile =
    memory.user.workContext.summary ||
    memory.user.personalContext.summary ||
    memory.user.topOfMind.summary

  const hasHistory =
    memory.history.recentMonths.summary ||
    memory.history.earlierContext.summary ||
    memory.history.longTermBackground.summary

  const hasFacts = memory.facts.length > 0

  return !hasUserProfile && !hasHistory && !hasFacts
}

/**
 * 获取记忆统计信息
 */
export function getMemoryStats(memory: MemoryData): {
  hasUserProfile: boolean
  hasHistory: boolean
  factCount: number
  estimatedTokens: number
} {
  const memoryText = formatMemoryForInjection(memory, { maxTokens: 10000 })

  return {
    hasUserProfile:
      !!(memory.user.workContext.summary ||
        memory.user.personalContext.summary ||
        memory.user.topOfMind.summary),
    hasHistory:
      !!(memory.history.recentMonths.summary ||
        memory.history.earlierContext.summary),
    factCount: memory.facts.length,
    estimatedTokens: estimateTokens(memoryText),
  }
}