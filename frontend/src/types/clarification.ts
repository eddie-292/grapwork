/**
 * 澄清工具类型定义
 * ask_clarification 工具用于在 AI Agent 需要更多信息时向用户请求澄清
 */

/** 澄清类型 */
export type ClarificationType =
  | 'missing_info'        // 缺少信息：用户没有提供必要的参数
  | 'ambiguous_requirement' // 需求模糊：用户的需求有多种理解方式
  | 'approach_choice'     // 方案选择：存在多种可行的实现方案
  | 'risk_confirmation'   // 风险确认：即将执行不可逆的危险操作
  | 'suggestion'          // 建议确认：Agent 有建议但需要用户批准

/** 澄清请求 */
export interface ClarificationRequest {
  id: string
  question: string
  clarificationType: ClarificationType
  context?: string
  options?: string[]
  timestamp: number
}

/** 澄清响应 */
export interface ClarificationResponse {
  id: string
  answer: string | number  // 文本回复或选项索引
}

/** 澄清状态 */
export interface ClarificationState {
  pending: ClarificationRequest | null
  isWaiting: boolean
}

/** 澄清类型标签映射 */
export const CLARIFICATION_TYPE_LABELS: Record<ClarificationType, string> = {
  missing_info: '需要更多信息',
  ambiguous_requirement: '需求澄清',
  approach_choice: '方案选择',
  risk_confirmation: '风险确认',
  suggestion: '建议确认'
}

/** 澄清类型图标映射 */
export const CLARIFICATION_TYPE_ICONS: Record<ClarificationType, string> = {
  missing_info: '❓',
  ambiguous_requirement: '🤔',
  approach_choice: '🔀',
  risk_confirmation: '⚠️',
  suggestion: '💡'
}

/** 澄清类型输入提示映射 */
export const CLARIFICATION_TYPE_PLACEHOLDERS: Record<ClarificationType, string> = {
  missing_info: '请输入...',
  ambiguous_requirement: '请说明您的需求...',
  risk_confirmation: '输入"确认"继续...',
  suggestion: '是/否',
  approach_choice: '请选择一个方案'
}

/**
 * ask_clarification 工具定义（OpenAI Function Calling 格式）
 * 用于注入到 LLM 的 tools 参数中
 */
export const ASK_CLARIFICATION_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'ask_clarification',
    description: `Ask the user for clarification when you need more information to proceed.

Use this tool when you encounter situations where you cannot proceed without user input:
- Missing information: Required details not provided
- Ambiguous requirements: Multiple valid interpretations exist
- Approach choices: Several valid approaches exist
- Risky operations: Destructive actions need confirmation
- Suggestions: You have a recommendation but want approval

The execution will be interrupted and the question will be presented to the user.
Wait for the user's response before continuing.`,
    parameters: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The clarification question to ask the user. Be specific and clear.'
        },
        clarification_type: {
          type: 'string',
          enum: [
            'missing_info',
            'ambiguous_requirement',
            'approach_choice',
            'risk_confirmation',
            'suggestion'
          ],
          description: 'The type of clarification needed'
        },
        context: {
          type: 'string',
          description: 'Optional context explaining why clarification is needed. Helps the user understand the situation.'
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of choices for the user to select from. Use for approach_choice or suggestion types.'
        }
      },
      required: ['question', 'clarification_type']
    }
  }
}

/** ask_clarification 工具参数 */
export interface AskClarificationParams {
  question: string
  clarification_type: ClarificationType
  context?: string
  options?: string[]
}