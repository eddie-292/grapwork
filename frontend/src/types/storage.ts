/**
 * 统一持久层类型定义
 * 支持多种存储后端（LocalStorage, FileSystem, HTTP等）
 */

// 存储键名
export const StorageKey = {
  // 用户认证
  IS_LOGGED_IN: 'isLoggedIn',
  USERNAME: 'username',

  // LLM 配置
  LLM_CONFIG_LIST: 'llm-config-list',
  HIGHLIGHT_THEME: 'highlight-theme',

  // UI 主题
  UI_THEME: 'ui-theme',

  // 助理系统
  ASSISTANT_LIST: 'assistant-list',
  ACTIVE_ASSISTANT_INDEX: 'active-assistant-index',

  // 聊天历史
  CHAT_HISTORY: 'chat-history',

  // MCP (Model Context Protocol) 服务器配置
  MCP_SERVER_LIST: 'mcp-server-list',
  BUILTIN_MCP_TOOLS: 'builtin-mcp-tools',  // 内置服务器的工具列表
  BUILTIN_MCP_CONFIG: 'builtin-mcp-config',  // 内置服务器的配置覆盖

  // 选中的文件夹路径
  SELECTED_FOLDER: 'selected-folder',

  // Skills 技能系统
  SKILL_REGISTRY: 'skill-registry',

  // 生图模式
  IMAGE_GENERATOR_CONFIG: 'image-generator-config',
  IMAGE_GENERATOR_HISTORY: 'image-generator-history',

  // 工作空间系统
  WORKSPACE_LIST: 'workspace-list',
  WORKSPACE_CHAT_HISTORY_PREFIX: 'workspace-chat-history-',

  // Loop 定时任务系统
  LOOP_TASK_REGISTRY: 'loop-task-registry',

  // 连接器系统（语雀、飞书等）
  CONNECTION_REGISTRY: 'connection-registry',
} as const

export type StorageKey = typeof StorageKey[keyof typeof StorageKey]

// 存储后端类型
export const StorageBackendType = {
  LOCAL_STORAGE: 'localStorage',
  FILE_SYSTEM: 'fileSystem',
  HTTP: 'http',
} as const

export type StorageBackendType = typeof StorageBackendType[keyof typeof StorageBackendType]

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
