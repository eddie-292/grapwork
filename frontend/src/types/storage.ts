/**
 * 统一持久层类型定义
 * 支持多种存储后端（LocalStorage, FileSystem, HTTP等）
 */

// 存储键名枚举
export enum StorageKey {
  // 用户认证
  IS_LOGGED_IN = 'isLoggedIn',
  USERNAME = 'username',

  // LLM 配置
  LLM_CONFIG_LIST = 'llm-config-list',
  HIGHLIGHT_THEME = 'highlight-theme',

  // 全局记忆
  GLOBAL_MEMORY = 'global-memory',

  // 助理系统
  ASSISTANT_LIST = 'assistant-list',
  ACTIVE_ASSISTANT_INDEX = 'active-assistant-index',

  // 聊天历史
  CHAT_HISTORY = 'chat-history',

  // 工作记忆（动态键：task-working-memory-${chatId}）
  WORKING_MEMORY_PREFIX = 'task-working-memory-',
}

// 存储后端类型
export enum StorageBackendType {
  LOCAL_STORAGE = 'localStorage',
  FILE_SYSTEM = 'fileSystem',
  HTTP = 'http',
}

// 存储操作结果
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 通用存储条目
export interface StorageEntry<T = any> {
  key: string;
  value: T;
  timestamp?: number;
}

// 批量操作选项
export interface BatchOperationOptions {
  skipErrors?: boolean; // 是否跳过错误继续执行
}

// 存储后端接口
export interface IStorageBackend {
  // 获取后端类型
  readonly type: StorageBackendType;

  // 初始化后端
  init(): Promise<void>;

  // 检查后端是否可用
  isAvailable(): Promise<boolean>;

  // 读取数据
  get<T>(key: string): Promise<StorageResult<T>>;

  // 写入数据
  set<T>(key: string, value: T): Promise<StorageResult<void>>;

  // 删除数据
  delete(key: string): Promise<StorageResult<void>>;

  // 检查键是否存在
  has(key: string): Promise<boolean>;

  // 获取所有键
  keys(): Promise<string[]>;

  // 清空所有数据
  clear(): Promise<StorageResult<void>>;

  // 批量操作
  getMultiple<T>(keys: string[]): Promise<StorageResult<T[]>>;

  setMultiple<T>(entries: StorageEntry<T>[], options?: BatchOperationOptions): Promise<StorageResult<void>>;

  deleteMultiple(keys: string[], options?: BatchOperationOptions): Promise<StorageResult<void>>;
}

// 存储配置
export interface StorageConfig {
  // 默认后端类型
  defaultBackend: StorageBackendType;

  // 是否启用缓存（仅适用于后端）
  enableCache?: boolean;

  // 缓存过期时间（毫秒）
  cacheExpiration?: number;

  // 重试配置
  retryAttempts?: number;
  retryDelay?: number;
}

// 存储服务事件
export type StorageEventHandler = (event: StorageEvent) => void;

export interface StorageEvent {
  type: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  backend: StorageBackendType;
  timestamp: number;
  error?: string;
}

// 工作记忆键生成器
export function generateWorkingMemoryKey(chatId: string): string {
  return `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
}
