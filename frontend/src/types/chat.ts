/**
 * 聊天相关类型定义
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  reasoning?: string; // 推理内容（DeepSeek 等）
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
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
