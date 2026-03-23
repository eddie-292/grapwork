/**
 * 记忆更新模块
 * 
 * 负责分析对话并更新记忆，包括：
 * - 构建更新提示词
 * - 调用 LLM 分析
 * - 解析响应并应用更新
 */

import type {
  MemoryData,
  MemoryUpdateResponse,
  ConversationMessage,
  MemoryConfig,
} from './types'
import { formatMemoryForInjection } from './injector'

/**
 * 生成唯一 ID
 */
function generateFactId(): string {
  return `fact_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 移除临时性标签
 * 如 <uploaded_files> 等
 */
function removeTemporaryTags(content: string): string {
  // 移除 <uploaded_files> 标签
  let cleaned = content.replace(/<uploaded_files>[\s\S]*?<\/uploaded_files>/g, '')
  // 移除其他临时标签
  cleaned = cleaned.replace(/<temp_[^>]*>[\s\S]*?<\/temp_[^>]*>/g, '')
  // 移除文件路径引用
  cleaned = cleaned.replace(/\[文件:.*?\]/g, '')
  // 清理多余空白
  cleaned = cleaned.trim()
  return cleaned
}

/**
 * 格式化对话消息用于提示词
 */
function formatConversationForUpdate(messages: ConversationMessage[]): string {
  const lines: string[] = []

  for (const msg of messages) {
    let content = msg.content

    // 过滤临时性标签
    if (msg.role === 'user') {
      content = removeTemporaryTags(content)
      if (!content) continue
    }

    // 截断过长消息
    if (content.length > 2000) {
      content = content.substring(0, 2000) + '...'
    }

    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
    lines.push(`${roleLabel}: ${content}`)
  }

  return lines.join('\n\n')
}

/**
 * 构建记忆更新提示词
 */
export function buildUpdatePrompt(
  currentMemory: MemoryData,
  messages: ConversationMessage[]
): string {
  const currentMemoryText = formatMemoryForInjection(currentMemory, { maxTokens: 4000 })
  const conversationText = formatConversationForUpdate(messages)

  return `You are a memory management system. Your task is to analyze a conversation and update the user's memory profile.

Current Memory State:
<current_memory>
${currentMemoryText || '(Empty - no previous memory)'}
</current_memory>

New Conversation to Process:
<conversation>
${conversationText}
</conversation>

Instructions:
1. Analyze the conversation for important information about the user
2. Extract relevant facts, preferences, and context with specific details (numbers, names, technologies)
3. Update the memory sections as needed following the detailed length guidelines below

Memory Section Guidelines:

**User Context** (Current state - concise summaries):
- workContext: Professional role, company, key projects, main technologies (2-3 sentences)
  Example: Core contributor, project names with metrics (16k+ stars), technical stack
- personalContext: Languages, communication preferences, key interests (1-2 sentences)
  Example: Bilingual capabilities, specific interest areas, expertise domains
- topOfMind: Multiple ongoing focus areas and priorities (3-5 sentences, detailed paragraph)
  Example: Primary project work, parallel technical investigations, ongoing learning/tracking
  Include: Active implementation work, troubleshooting issues, market/research interests
  Note: This captures SEVERAL concurrent focus areas, not just one task

**History** (Temporal context - rich paragraphs):
- recentMonths: Detailed summary of recent activities (4-6 sentences or 1-2 paragraphs)
  Timeline: Last 1-3 months of interactions
  Include: Technologies explored, projects worked on, problems solved, interests demonstrated
- earlierContext: Important historical patterns (3-5 sentences or 1 paragraph)
  Timeline: 3-12 months ago
  Include: Past projects, learning journeys, established patterns
- longTermBackground: Persistent background and foundational context (2-4 sentences)
  Timeline: Overall/foundational information
  Include: Core expertise, longstanding interests, fundamental working style

**Facts Extraction**:
- Extract specific, quantifiable details (e.g., "16k+ GitHub stars", "200+ datasets")
- Include proper nouns (company names, project names, technology names)
- Preserve technical terminology and version numbers
- Categories:
  * preference: Tools, styles, approaches user prefers/dislikes
  * knowledge: Specific expertise, technologies mastered, domain knowledge
  * context: Background facts (job title, projects, locations, languages)
  * behavior: Working patterns, communication habits, problem-solving approaches
  * goal: Stated objectives, learning targets, project ambitions
- Confidence levels:
  * 0.9-1.0: Explicitly stated facts ("I work on X", "My role is Y")
  * 0.7-0.8: Strongly implied from actions/discussions
  * 0.5-0.6: Inferred patterns (use sparingly, only for clear patterns)

**What Goes Where**:
- workContext: Current job, active projects, primary tech stack
- personalContext: Languages, personality, interests outside direct work tasks
- topOfMind: Multiple ongoing priorities and focus areas user cares about recently (gets updated most frequently)
  Should capture 3-5 concurrent themes: main work, side explorations, learning/tracking interests
- recentMonths: Detailed account of recent technical explorations and work
- earlierContext: Patterns from slightly older interactions still relevant
- longTermBackground: Unchanging foundational facts about the user

**Multilingual Content**:
- Preserve original language for proper nouns and company names
- Keep technical terms in their original form (DeepSeek, LangGraph, etc.)
- Note language capabilities in personalContext

Output Format (JSON):
{
  "user": {
    "workContext": { "summary": "...", "shouldUpdate": true/false },
    "personalContext": { "summary": "...", "shouldUpdate": true/false },
    "topOfMind": { "summary": "...", "shouldUpdate": true/false }
  },
  "history": {
    "recentMonths": { "summary": "...", "shouldUpdate": true/false },
    "earlierContext": { "summary": "...", "shouldUpdate": true/false },
    "longTermBackground": { "summary": "...", "shouldUpdate": true/false }
  },
  "newFacts": [
    { "content": "...", "category": "preference|knowledge|context|behavior|goal", "confidence": 0.0-1.0 }
  ],
  "factsToRemove": ["fact_id_1", "fact_id_2"]
}

Important Rules:
- Only set shouldUpdate=true if there's meaningful new information
- Follow length guidelines: workContext/personalContext are concise (1-3 sentences), topOfMind and history sections are detailed (paragraphs)
- Include specific metrics, version numbers, and proper nouns in facts
- Only add facts that are clearly stated (0.9+) or strongly implied (0.7+)
- Remove facts that are contradicted by new information
- When updating topOfMind, integrate new focus areas while removing completed/abandoned ones
  Keep 3-5 concurrent focus themes that are still active and relevant
- For history sections, integrate new information chronologically into appropriate time period
- Preserve technical accuracy - keep exact names of technologies, companies, projects
- Focus on information useful for future interactions and personalization
- IMPORTANT: Do NOT record file upload events in memory. Uploaded files are
  session-specific and ephemeral — they will not be accessible in future sessions.
  Recording upload events causes confusion in subsequent conversations.

Return ONLY valid JSON, no explanation or markdown.`
}

/**
 * 解析 LLM 响应为更新数据
 */
export function parseUpdateResponse(response: string): MemoryUpdateResponse | null {
  try {
    // 尝试提取 JSON
    let jsonStr = response.trim()

    // 移除可能的 markdown 代码块标记
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7)
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3)
    }

    jsonStr = jsonStr.trim()

    const data = JSON.parse(jsonStr) as MemoryUpdateResponse

    // 验证必要字段
    if (!data.user || !data.history) {
      console.error('[MemoryUpdater] 响应缺少必要字段')
      return null
    }

    return data
  } catch (error) {
    console.error('[MemoryUpdater] 解析响应失败:', error)
    return null
  }
}

/**
 * 检查事实是否重复
 */
function isDuplicateFact(newContent: string, existingFacts: MemoryData['facts']): boolean {
  const newNormalized = newContent.trim().toLowerCase()

  for (const fact of existingFacts) {
    const existingNormalized = fact.content.trim().toLowerCase()

    // 完全匹配
    if (newNormalized === existingNormalized) {
      return true
    }

    // 包含关系（一个包含另一个）
    if (newNormalized.includes(existingNormalized) || existingNormalized.includes(newNormalized)) {
      return true
    }

    // 相似度检查（简单版本）
    const words1 = newNormalized.split(/\s+/)
    const words2 = existingNormalized.split(/\s+/)
    const commonWords = words1.filter(w => words2.includes(w))
    const similarity = commonWords.length / Math.max(words1.length, words2.length)
    if (similarity > 0.8) {
      return true
    }
  }

  return false
}

/**
 * 应用更新到记忆数据
 */
export function applyUpdates(
  currentMemory: MemoryData,
  updateData: MemoryUpdateResponse,
  threadId: string,
  config: MemoryConfig
): MemoryData {
  const now = new Date().toISOString()
  const updatedMemory: MemoryData = {
    ...currentMemory,
    lastUpdated: now,
  }

  // 更新用户画像
  const userSections = ['workContext', 'personalContext', 'topOfMind'] as const
  for (const section of userSections) {
    if (updateData.user[section].shouldUpdate && updateData.user[section].summary) {
      updatedMemory.user[section] = {
        summary: updateData.user[section].summary,
        updatedAt: now,
      }
    }
  }

  // 更新历史记录
  const historySections = ['recentMonths', 'earlierContext', 'longTermBackground'] as const
  for (const section of historySections) {
    if (updateData.history[section].shouldUpdate && updateData.history[section].summary) {
      updatedMemory.history[section] = {
        summary: updateData.history[section].summary,
        updatedAt: now,
      }
    }
  }

  // 移除事实
  const idsToRemove = new Set(updateData.factsToRemove)
  updatedMemory.facts = currentMemory.facts.filter(f => !idsToRemove.has(f.id))

  // 添加新事实（去重）
  const existingContents = new Set(
    updatedMemory.facts.map(f => f.content.trim().toLowerCase())
  )

  for (const fact of updateData.newFacts) {
    // 检查置信度
    if (fact.confidence < config.minConfidence) {
      continue
    }

    // 检查重复
    const normalizedContent = fact.content.trim()
    if (isDuplicateFact(normalizedContent, updatedMemory.facts)) {
      continue
    }

    // 添加新事实
    const newFact = {
      id: generateFactId(),
      content: normalizedContent,
      category: fact.category,
      confidence: fact.confidence,
      createdAt: now,
      source: threadId,
    }

    updatedMemory.facts.push(newFact)
    existingContents.add(normalizedContent.toLowerCase())
  }

  // 限制事实数量
  if (updatedMemory.facts.length > config.maxFacts) {
    // 按置信度排序，保留最重要的
    updatedMemory.facts.sort((a, b) => b.confidence - a.confidence)
    updatedMemory.facts = updatedMemory.facts.slice(0, config.maxFacts)
  }

  return updatedMemory
}

/**
 * 过滤对话消息
 * 只保留用户输入和最终 AI 回复
 */
export function filterMessagesForMemory(
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>
): ConversationMessage[] {
  const result: ConversationMessage[] = []

  for (const msg of messages) {
    // 用户消息
    if (msg.role === 'user' || msg.role === 'human') {
      const content = removeTemporaryTags(msg.content)
      if (content) {
        result.push({ role: 'user', content })
      }
    }
    // AI 最终回复（没有工具调用）
    else if (msg.role === 'assistant' || msg.role === 'ai') {
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        result.push({ role: 'assistant', content: msg.content })
      }
    }
    // 忽略工具消息和中间步骤
  }

  return result
}