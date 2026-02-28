/**
 * 聊天相关类型定义
 */

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  reasoning?: string; // 推理内容（DeepSeek 等）
  // MCP Function Calling 相关
  tool_calls?: any[]; // OpenAI 格式的工具调用
  tool_call_id?: string; // 工具结果消息对应的调用 ID
  // 工具执行状态
  toolStatus?: 'pending' | 'running' | 'success' | 'error';
  visible?: boolean;
  copyable?: boolean;
  archived?: boolean;
  reasoningDuration?: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt?: number;
  assistantId?: string;
  configId?: number;
  sending?: boolean;
  isProfessionalMode?: boolean;  // 专业模式状态
  professionalSessionId?: string;  // 专业模式会话 ID
  params?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    seed?: number;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TaskModeOptions {
  enabled: boolean;
  tokenThreshold: number;
  autoExecute: boolean;
  maxRetries: number;
  skipOnError: boolean;
  workingMemory: {
    enabled: boolean;
    autoSave: boolean;
    maxEntriesPerType: number;
  };
}
