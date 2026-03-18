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
import type { ConfigList } from '@/types/electron';
import type { Assistant } from '@/types/electron';
import type { Chat } from '@/types/chat';
import type { MCPServerList } from '@/types/mcp';
import type { SkillRegistry } from '@/types/skill';
import type { ImageGeneratorConfigList, ImageGeneratorHistory } from '@/types/imageGenerator';
import type { WorkspaceList, Workspace } from '@/types/workspace';
import type { ConnectionRegistry } from '@/types/connection';

/**
 * 默认内置助理的System Prompt
 * 当用户没有选择社区助理时使用此默认助理
 */
export const DEFAULT_ASSISTANT_PROMPT = `
你是 GrapWork，一个专注于"先理解、再行动"的智能工作助手。
你的核心风格是：遇到不确定时主动澄清而非猜测，执行前确认而非事后道歉，提供方案时兼顾质量与效率。

## 技能使用规则

**何时触发**：当任务描述与某个技能的描述匹配时，**必须先读取该技能的 SKILL.md 文件**，再开始执行任务。不得跳过此步骤直接行动。

**如何使用**：
1. 判断当前任务是否匹配一个或多个技能描述
2. 使用 \`read_file\` 工具读取对应路径的 SKILL.md 文件
3. 严格按照 SKILL.md 中的指令和最佳实践执行任务
4. 一个任务可同时触发多个技能，需逐一读取

**叠加使用**：若任务涉及多个技能（例如"从 PDF 提取内容并生成 Excel"），需依次读取所有相关 SKILL.md，综合执行。

**不确定时**：若不确定是否需要某个技能，优先读取——SKILL.md 的内容有助于判断是否适用。

`
export class StorageService {
  private static instance: StorageService;
  private backends: Map<StorageBackendType, IStorageBackend> = new Map();
  private primaryBackend: IStorageBackend;
  private eventHandlers: Set<StorageEventHandler> = new Set();

  private constructor(config: StorageConfig) {
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
   * 获取助理列表（完整对象，包含 activeIndex）
   */
  async getAssistantListFull(): Promise<{ assistants: Assistant[]; activeIndex: number }> {
    const result = await this.get<{ assistants: Assistant[]; activeIndex: number }>(StorageKey.ASSISTANT_LIST);
    return result.data ?? { assistants: [], activeIndex: -1 };
  }

  /**
   * 获取默认内置助理的 System Prompt
   * 当用户没有选择社区助理时使用
   */
  getDefaultAssistantPrompt(): string {
    return DEFAULT_ASSISTANT_PROMPT;
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
  async getChatHistory(): Promise<Chat[]> {
    const result = await this.get<Chat[]>(StorageKey.CHAT_HISTORY);
    return result.data ?? [];
  }

  /**
   * 保存聊天历史
   */
  async saveChatHistory(history: Chat[]): Promise<boolean> {
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
   * 获取 UI 主题
   */
  async getUITheme(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.UI_THEME);
    return result.data ?? null;
  }

  /**
   * 保存 UI 主题
   */
  async saveUITheme(theme: string): Promise<boolean> {
    const result = await this.set(StorageKey.UI_THEME, theme);
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

  // ==================== Skills 技能系统 ====================

  /**
   * 获取技能注册表
   */
  async getSkillRegistry(): Promise<SkillRegistry> {
    const result = await this.get<SkillRegistry>(StorageKey.SKILL_REGISTRY);
    return result.data ?? {
      skills: [],
      activeSkillIds: [],
      version: 1,
      lastUpdated: Date.now()
    };
  }

  /**
   * 保存技能注册表
   */
  async saveSkillRegistry(registry: SkillRegistry): Promise<boolean> {
    const result = await this.set(StorageKey.SKILL_REGISTRY, registry);
    return result.success;
  }

  /**
   * 获取激活的技能列表
   */
  async getActiveSkills(): Promise<SkillRegistry['skills']> {
    const registry = await this.getSkillRegistry();
    return registry.skills.filter(
      s => registry.activeSkillIds.includes(s.id) && s.enabled && !s.hasError
    );
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

  // ==================== 生图模式 ====================

  /**
   * 获取生图配置列表
   */
  async getImageGeneratorConfigList(): Promise<ImageGeneratorConfigList | null> {
    const result = await this.get<ImageGeneratorConfigList>(StorageKey.IMAGE_GENERATOR_CONFIG);
    return result.data ?? null;
  }

  /**
   * 保存生图配置列表
   */
  async saveImageGeneratorConfigList(configList: ImageGeneratorConfigList): Promise<boolean> {
    const result = await this.set(StorageKey.IMAGE_GENERATOR_CONFIG, configList);
    return result.success;
  }

  /**
   * 获取生图历史
   */
  async getImageGeneratorHistory(): Promise<ImageGeneratorHistory | null> {
    const result = await this.get<ImageGeneratorHistory>(StorageKey.IMAGE_GENERATOR_HISTORY);
    return result.data ?? null;
  }

  /**
   * 保存生图历史
   */
  async saveImageGeneratorHistory(history: ImageGeneratorHistory): Promise<boolean> {
    const result = await this.set(StorageKey.IMAGE_GENERATOR_HISTORY, history);
    return result.success;
  }

  // ==================== 工作空间系统 ====================

  /**
   * 获取工作空间列表
   */
  async getWorkspaceList(): Promise<WorkspaceList> {
    const result = await this.get<WorkspaceList>(StorageKey.WORKSPACE_LIST)
    return result.data ?? { workspaces: [], activeWorkspaceId: null }
  }

  /**
   * 保存工作空间列表
   */
  async saveWorkspaceList(list: WorkspaceList): Promise<boolean> {
    const result = await this.set(StorageKey.WORKSPACE_LIST, list)
    return result.success
  }

  /**
   * 获取指定工作空间的聊天历史
   */
  async getWorkspaceChatHistory(workspaceId: string): Promise<Chat[]> {
    const key = `${StorageKey.WORKSPACE_CHAT_HISTORY_PREFIX}${workspaceId}`
    const result = await this.get<Chat[]>(key)
    return result.data ?? []
  }

  /**
   * 保存指定工作空间的聊天历史
   */
  async saveWorkspaceChatHistory(workspaceId: string, history: Chat[]): Promise<boolean> {
    const key = `${StorageKey.WORKSPACE_CHAT_HISTORY_PREFIX}${workspaceId}`
    const result = await this.set<Chat[]>(key, history)
    return result.success
  }

  /**
   * 删除指定工作空间的聊天历史
   */
  async deleteWorkspaceChatHistory(workspaceId: string): Promise<boolean> {
    const key = `${StorageKey.WORKSPACE_CHAT_HISTORY_PREFIX}${workspaceId}`
    const result = await this.delete(key)
    return result.success
  }

  /**
   * 获取当前激活工作空间的 ID
   */
  async getActiveWorkspaceId(): Promise<string | null> {
    const list = await this.getWorkspaceList()
    return list.activeWorkspaceId
  }

  /**
   * 设置当前激活工作空间
   */
  async setActiveWorkspace(workspaceId: string): Promise<boolean> {
    const list = await this.getWorkspaceList()
    list.activeWorkspaceId = workspaceId
    return this.saveWorkspaceList(list)
  }

  /**
   * 添加新工作空间
   */
  async addWorkspace(workspace: Workspace): Promise<boolean> {
    const list = await this.getWorkspaceList()
    list.workspaces.push(workspace)
    return this.saveWorkspaceList(list)
  }

  /**
   * 更新工作空间
   */
  async updateWorkspace(workspace: Workspace): Promise<boolean> {
    const list = await this.getWorkspaceList()
    const index = list.workspaces.findIndex(w => w.id === workspace.id)
    if (index === -1) return false
    list.workspaces[index] = { ...workspace, updatedAt: Date.now() }
    return this.saveWorkspaceList(list)
  }

  /**
   * 删除工作空间（同时删除其聊天历史）
   */
  async deleteWorkspace(workspaceId: string): Promise<boolean> {
    const list = await this.getWorkspaceList()
    list.workspaces = list.workspaces.filter(w => w.id !== workspaceId)
    if (list.activeWorkspaceId === workspaceId) {
      list.activeWorkspaceId = list.workspaces[0]?.id ?? null
    }
    await this.deleteWorkspaceChatHistory(workspaceId)
    return this.saveWorkspaceList(list)
  }

  // ==================== 连接器系统 ====================

  /**
   * 获取连接器注册表
   */
  async getConnectionRegistry(): Promise<ConnectionRegistry> {
    const result = await this.get<ConnectionRegistry>(StorageKey.CONNECTION_REGISTRY)
    return result.data ?? {
      connections: [],
      activeConnectionIds: [],
      version: 1,
      lastUpdated: Date.now()
    }
  }

  /**
   * 保存连接器注册表
   */
  async saveConnectionRegistry(registry: ConnectionRegistry): Promise<boolean> {
    const result = await this.set(StorageKey.CONNECTION_REGISTRY, registry)
    return result.success
  }
}

// 导出单例
export const storage = StorageService.getInstance();
