/**
 * 统一持久层服务
 * 提供统一的存储接口，支持多种后端，便于扩展和迁移
 */
import { LocalStorageBackend } from './storage/LocalStorageBackend';
import { FileSystemBackend } from './storage/FileSystemBackend';
import { HttpBackend, type HttpBackendConfig } from './storage/HttpBackend';
import type {
  IStorageBackend,
  StorageResult,
  StorageConfig,
  StorageEventHandler,
  StorageEvent,
  StorageEntry,
  BatchOperationOptions,
} from '@/types/storage';
import { StorageBackendType, StorageKey } from '@/types/storage';
import type { AppConfig, ConfigList } from '@/types/electron';
import type { GlobalMemory, GlobalMemoryEntry } from '@/types/globalMemory';
import type { Assistant } from '@/types/electron';
import type { ChatMessage } from '@/types/chat';
import type { MCPServerList } from '@/types/mcp';

export class StorageService {
  private static instance: StorageService;
  private backends: Map<StorageBackendType, IStorageBackend> = new Map();
  private primaryBackend: IStorageBackend;
  private eventHandlers: Set<StorageEventHandler> = new Set();
  private config: StorageConfig;

  private constructor(config: StorageConfig) {
    this.config = config;
    this.primaryBackend = this.createBackend(config.defaultBackend);
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: StorageConfig): StorageService {
    if (!StorageService.instance) {
      const defaultConfig: StorageConfig = {
        defaultBackend: StorageBackendType.LOCAL_STORAGE,
        enableCache: true,
        cacheExpiration: 5 * 60 * 1000, // 5分钟
        retryAttempts: 3,
        retryDelay: 1000,
      };
      StorageService.instance = new StorageService(config || defaultConfig);
    }
    return StorageService.instance;
  }

  /**
   * 创建存储后端
   */
  private createBackend(type: StorageBackendType): IStorageBackend {
    if (this.backends.has(type)) {
      return this.backends.get(type)!;
    }

    let backend: IStorageBackend;
    switch (type) {
      case StorageBackendType.LOCAL_STORAGE:
        backend = new LocalStorageBackend();
        break;
      case StorageBackendType.FILE_SYSTEM:
        try {
          backend = new FileSystemBackend();
        } catch (error) {
          console.warn('FileSystem backend not available, falling back to LocalStorage');
          backend = new LocalStorageBackend();
        }
        break;
      case StorageBackendType.HTTP:
        // HTTP backend 需要配置，这里暂时返回 LocalStorage
        console.warn('HTTP backend requires configuration, falling back to LocalStorage');
        backend = new LocalStorageBackend();
        break;
      default:
        backend = new LocalStorageBackend();
    }

    this.backends.set(type, backend);
    return backend;
  }

  /**
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.init();
    }
  }

  /**
   * 配置 HTTP 后端
   */
  configureHttpBackend(config: HttpBackendConfig): void {
    const backend = new HttpBackend(config);
    this.backends.set(StorageBackendType.HTTP, backend);
  }

  /**
   * 切换主后端
   */
  async switchBackend(backendType: StorageBackendType): Promise<boolean> {
    const backend = this.createBackend(backendType);
    const available = await backend.isAvailable();
    if (available) {
      this.primaryBackend = backend;
      return true;
    }
    return false;
  }

  /**
   * 触发事件
   */
  private emit(event: StorageEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in storage event handler:', error);
      }
    });
  }

  /**
   * 添加事件监听器
   */
  on(handler: StorageEventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * 移除事件监听器
   */
  off(handler: StorageEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  // ==================== 通用 CRUD 操作 ====================

  /**
   * 获取数据
   */
  async get<T>(key: string): Promise<StorageResult<T>> {
    const result = await this.primaryBackend.get<T>(key);
    this.emit({
      type: 'get',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 设置数据
   */
  async set<T>(key: string, value: T): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.set<T>(key, value);
    this.emit({
      type: 'set',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.delete(key);
    this.emit({
      type: 'delete',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    return this.primaryBackend.has(key);
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    return this.primaryBackend.keys();
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.clear();
    this.emit({
      type: 'clear',
      key: '*',
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量获取
   */
  async getMultiple<T>(keys: string[]): Promise<StorageResult<T[]>> {
    return this.primaryBackend.getMultiple<T>(keys);
  }

  /**
   * 批量设置
   */
  async setMultiple<T>(
    entries: StorageEntry<T>[],
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    return this.primaryBackend.setMultiple(entries, options);
  }

  /**
   * 批量删除
   */
  async deleteMultiple(
    keys: string[],
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    return this.primaryBackend.deleteMultiple(keys, options);
  }

  // ==================== 类型安全的高层 API ====================

  /**
   * 获取配置列表
   */
  async getConfigList(): Promise<ConfigList | null> {
    const result = await this.get<ConfigList>(StorageKey.LLM_CONFIG_LIST);
    return result.data ?? null;
  }

  /**
   * 保存配置列表
   */
  async saveConfigList(configList: ConfigList): Promise<boolean> {
    const result = await this.set(StorageKey.LLM_CONFIG_LIST, configList);
    return result.success;
  }

  /**
   * 获取全局记忆
   */
  async getGlobalMemory(): Promise<GlobalMemory | null> {
    const result = await this.get<GlobalMemory>(StorageKey.GLOBAL_MEMORY);
    return result.data ?? null;
  }

  /**
   * 保存全局记忆
   */
  async saveGlobalMemory(memory: GlobalMemory): Promise<boolean> {
    const result = await this.set(StorageKey.GLOBAL_MEMORY, memory);
    return result.success;
  }

  /**
   * 获取助理列表（完整对象，包含 activeIndex）
   */
  async getAssistantListFull(): Promise<{ assistants: Assistant[]; activeIndex: number }> {
    const result = await this.get<{ assistants: Assistant[]; activeIndex: number }>(StorageKey.ASSISTANT_LIST);
    return result.data ?? { assistants: [], activeIndex: -1 };
  }

  /**
   * 保存助理列表（完整对象，包含 activeIndex）
   */
  async saveAssistantListFull(list: { assistants: Assistant[]; activeIndex: number }): Promise<boolean> {
    const result = await this.set(StorageKey.ASSISTANT_LIST, list);
    return result.success;
  }

  /**
   * 获取助理列表（仅数组，向后兼容）
   */
  async getAssistantList(): Promise<Assistant[]> {
    const full = await this.getAssistantListFull();
    return full.assistants;
  }

  /**
   * 保存助理列表（仅数组，向后兼容）
   */
  async saveAssistantList(assistants: Assistant[]): Promise<boolean> {
    const full = await this.getAssistantListFull();
    return this.saveAssistantListFull({ assistants, activeIndex: full.activeIndex });
  }

  /**
   * 获取聊天历史
   */
  async getChatHistory(): Promise<ChatMessage[][]> {
    const result = await this.get<ChatMessage[][]>(StorageKey.CHAT_HISTORY);
    return result.data ?? [];
  }

  /**
   * 保存聊天历史
   */
  async saveChatHistory(history: ChatMessage[][]): Promise<boolean> {
    const result = await this.set(StorageKey.CHAT_HISTORY, history);
    return result.success;
  }

  /**
   * 获取高亮主题
   */
  async getHighlightTheme(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.HIGHLIGHT_THEME);
    return result.data ?? null;
  }

  /**
   * 保存高亮主题
   */
  async saveHighlightTheme(theme: string): Promise<boolean> {
    const result = await this.set(StorageKey.HIGHLIGHT_THEME, theme);
    return result.success;
  }

  /**
   * 获取用户登录状态
   */
  async getIsLoggedIn(): Promise<boolean> {
    const result = await this.get<string>(StorageKey.IS_LOGGED_IN);
    return result.data === 'true';
  }

  /**
   * 设置用户登录状态
   */
  async setIsLoggedIn(loggedIn: boolean): Promise<boolean> {
    const result = await this.set(StorageKey.IS_LOGGED_IN, loggedIn ? 'true' : 'false');
    return result.success;
  }

  /**
   * 获取用户名
   */
  async getUsername(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.USERNAME);
    return result.data ?? null;
  }

  /**
   * 设置用户名
   */
  async setUsername(username: string): Promise<boolean> {
    const result = await this.set(StorageKey.USERNAME, username);
    return result.success;
  }

  /**
   * 清除登录信息
   */
  async clearLoginInfo(): Promise<void> {
    await this.delete(StorageKey.IS_LOGGED_IN);
    await this.delete(StorageKey.USERNAME);
  }

  // ==================== 工作记忆特殊处理 ====================

  /**
   * 获取工作记忆
   */
  async getWorkingMemory(chatId: string): Promise<GlobalMemory | null> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.get<GlobalMemory>(key);
    return result.data ?? null;
  }

  /**
   * 保存工作记忆
   */
  async saveWorkingMemory(chatId: string, memory: GlobalMemory): Promise<boolean> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.set(key, memory);
    return result.success;
  }

  /**
   * 删除工作记忆
   */
  async deleteWorkingMemory(chatId: string): Promise<boolean> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.delete(key);
    return result.success;
  }

  /**
   * 获取所有工作记忆的聊天ID
   */
  async getWorkingMemoryChatIds(): Promise<string[]> {
    const allKeys = await this.keys();
    return allKeys
      .filter(key => key.startsWith(StorageKey.WORKING_MEMORY_PREFIX))
      .map(key => key.replace(StorageKey.WORKING_MEMORY_PREFIX, ''));
  }

  // ==================== MCP 服务器配置 ====================

  /**
   * 获取 MCP 服务器列表
   */
  async getMCPServerList(): Promise<MCPServerList | null> {
    const result = await this.get<MCPServerList>(StorageKey.MCP_SERVER_LIST);
    return result.data ?? { servers: [], activeServerIds: [] };
  }

  /**
   * 保存 MCP 服务器列表
   */
  async saveMCPServerList(serverList: MCPServerList): Promise<boolean> {
    const result = await this.set(StorageKey.MCP_SERVER_LIST, serverList);
    return result.success;
  }

  /**
   * 获取激活的 MCP 服务器列表
   */
  async getActiveMCPServers(): Promise<MCPServerList['servers']> {
    const serverList = await this.getMCPServerList();
    if (!serverList) return [];
    return serverList.servers.filter(s => serverList.activeServerIds.includes(s.id) && s.enabled);
  }

  // ==================== 选中的文件夹 ====================

  /**
   * 获取选中的文件夹路径
   */
  async getSelectedFolder(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.SELECTED_FOLDER);
    return result.data ?? null;
  }

  /**
   * 保存选中的文件夹路径
   */
  async saveSelectedFolder(folderPath: string): Promise<boolean> {
    const result = await this.set(StorageKey.SELECTED_FOLDER, folderPath);
    return result.success;
  }

  /**
   * 清除选中的文件夹路径
   */
  async clearSelectedFolder(): Promise<boolean> {
    const result = await this.delete(StorageKey.SELECTED_FOLDER);
    return result.success;
  }
}

// 导出单例
export const storage = StorageService.getInstance();
