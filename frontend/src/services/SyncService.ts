/**
 * 云同步服务
 * 负责本地数据与云端的双向同步
 */
import { storage } from './StorageService';
import { StorageKey } from '@/types/storage';
import type {
  SyncConfig,
  SyncStatus,
  SyncResult,
  SyncConflict,
  RemoteSyncEntry,
  SyncApiResponse,
  ConflictStrategy
} from '@/types/sync';

// 同步配置的存储键
const SYNC_CONFIG_KEY = 'sync-config';

// 默认同步的存储键（排除敏感数据）
const DEFAULT_SYNC_KEYS = [
  StorageKey.LLM_CONFIG_LIST,
  StorageKey.ASSISTANT_LIST,
  StorageKey.MCP_SERVER_LIST,
  StorageKey.SKILL_REGISTRY,
  StorageKey.IMAGE_GENERATOR_CONFIG,
  StorageKey.HIGHLIGHT_THEME,
  // 注意：排除 CHAT_HISTORY（可能过大）、敏感认证信息等
];

// 默认同步配置
const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  serverUrl: '',
  apiToken: '',
  syncKeys: DEFAULT_SYNC_KEYS,
  autoSync: false,
  autoSyncInterval: 30,
  conflictStrategy: 'newer-wins',
};

class SyncService {
  private config: SyncConfig;
  private status: SyncStatus = 'idle';
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.config = this.loadConfig();
    // Resume auto-sync if it was active before app restart
    if (this.config.enabled && this.config.serverUrl && this.config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * 加载同步配置
   */
  private loadConfig(): SyncConfig {
    try {
      const saved = localStorage.getItem(SYNC_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // 合并默认配置，确保新字段有默认值
        return { ...DEFAULT_SYNC_CONFIG, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load sync config:', error);
    }
    return { ...DEFAULT_SYNC_CONFIG };
  }

  /**
   * 保存同步配置
   */
  async saveConfig(config: SyncConfig): Promise<void> {
    this.config = { ...config };
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.config));

    // 配置变更时更新自动同步
    if (config.enabled && config.serverUrl) {
      if (config.autoSync) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }
    } else {
      this.stopAutoSync();
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SyncConfig {
    return { ...this.config };
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * 测试连接
   * @param overrideServerUrl 临时服务器地址（不会保存到配置）
   * @param overrideToken 临时 Token（不会保存到配置）
   */
  async testConnection(overrideServerUrl?: string, overrideToken?: string): Promise<{ success: boolean; error?: string }> {
    const serverUrl = overrideServerUrl ?? this.config.serverUrl;
    if (!serverUrl) {
      return { success: false, error: '请输入服务器地址' };
    }

    try {
      const url = `${serverUrl}/health`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = overrideToken ?? this.config.apiToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });
      return {
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '连接测试失败',
      };
    }
  }

  /**
   * 上传（推送本地到云端）
   */
  async upload(keys?: string[]): Promise<SyncResult> {
    const targetKeys = keys || this.config.syncKeys;
    const timestamp = Date.now();

    if (!this.config.serverUrl) {
      return {
        success: false,
        direction: 'upload',
        timestamp,
        syncedKeys: [],
        errorKeys: [],
        error: '未配置同步服务器',
      };
    }

    this.status = 'uploading';

    try {
      const entries: RemoteSyncEntry[] = [];
      const errorKeys: string[] = [];

      for (const key of targetKeys) {
        const result = await storage.get(key);
        if (result.success && result.data !== undefined) {
          entries.push({
            key,
            value: result.data,
            timestamp,
          });
        } else if (result.error) {
          errorKeys.push(key);
        }
      }

      if (entries.length === 0) {
        this.status = 'idle';
        return {
          success: false,
          direction: 'upload',
          timestamp,
          syncedKeys: [],
          errorKeys,
          error: '没有可同步的数据',
        };
      }

      // 调用批量上传 API
      const response = await this.callApi('POST', '/sync/data', { entries });

      if (response.success) {
        this.config.lastSyncTime = timestamp;
        this.config.lastSyncDirection = 'upload';
        await this.saveConfig(this.config);
        this.status = 'idle';

        return {
          success: true,
          direction: 'upload',
          timestamp,
          syncedKeys: entries.map(e => e.key),
          errorKeys,
        };
      } else {
        this.status = 'error';
        return {
          success: false,
          direction: 'upload',
          timestamp,
          syncedKeys: [],
          errorKeys: targetKeys,
          error: response.error || '上传失败',
        };
      }
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        direction: 'upload',
        timestamp: Date.now(),
        syncedKeys: [],
        errorKeys: targetKeys,
        error: error instanceof Error ? error.message : '上传失败',
      };
    }
  }

  /**
   * 下载（从云端拉取）
   */
  async download(keys?: string[], conflictStrategy?: ConflictStrategy): Promise<SyncResult> {
    const targetKeys = keys || this.config.syncKeys;
    const timestamp = Date.now();

    if (!this.config.serverUrl) {
      return {
        success: false,
        direction: 'download',
        timestamp,
        syncedKeys: [],
        errorKeys: [],
        error: '未配置同步服务器',
      };
    }

    this.status = 'downloading';

    try {
      // 获取远程数据
      const response = await this.callApi<Record<string, RemoteSyncEntry>>('GET', '/sync/data');

      if (!response.success) {
        this.status = 'error';
        return {
          success: false,
          direction: 'download',
          timestamp,
          syncedKeys: [],
          errorKeys: targetKeys,
          error: response.error || '获取远程数据失败',
        };
      }

      const remoteData = response.data || {};
      const syncedKeys: string[] = [];
      const errorKeys: string[] = [];
      const conflicts: SyncConflict[] = [];

      // 处理每个键
      for (const key of targetKeys) {
        const remoteEntry = remoteData[key];

        if (!remoteEntry) {
          // 远程没有此数据
          continue;
        }

        const localResult = await storage.get(key);

        if (localResult.success && localResult.data !== undefined) {
          // 本地有数据，检查冲突
          const strategy = conflictStrategy || this.config.conflictStrategy;

          if (strategy === 'remote-wins') {
            await storage.set(key, remoteEntry.value);
            syncedKeys.push(key);
          } else if (strategy === 'local-wins') {
            // 保留本地数据
            syncedKeys.push(key);
          } else if (strategy === 'newer-wins') {
            // 比较时间戳，远程较新则更新
            const localTimestamp = this.getLocalTimestamp(key);
            if (remoteEntry.timestamp > localTimestamp) {
              await storage.set(key, remoteEntry.value);
            }
            syncedKeys.push(key);
          } else {
            // manual: 记录冲突
            conflicts.push({
              key,
              localValue: localResult.data,
              remoteValue: remoteEntry.value,
              localTimestamp: this.getLocalTimestamp(key),
              remoteTimestamp: remoteEntry.timestamp,
            });
            errorKeys.push(key);
          }
        } else {
          // 本地没有数据，直接写入
          await storage.set(key, remoteEntry.value);
          syncedKeys.push(key);
        }
      }

      this.config.lastSyncTime = timestamp;
      this.config.lastSyncDirection = 'download';
      await this.saveConfig(this.config);
      this.status = 'idle';

      return {
        success: true,
        direction: 'download',
        timestamp,
        syncedKeys,
        errorKeys,
        error: conflicts.length > 0 ? `有 ${conflicts.length} 个冲突需要手动处理` : undefined,
      };
    } catch (error) {
      this.status = 'error';
      return {
        success: false,
        direction: 'download',
        timestamp: Date.now(),
        syncedKeys: [],
        errorKeys: targetKeys,
        error: error instanceof Error ? error.message : '下载失败',
      };
    }
  }

  /**
   * 获取本地数据的时间戳
   * 简化实现：使用当前时间
   * TODO: 可以扩展 StorageService 来存储每个键的时间戳
   */
  private getLocalTimestamp(_key: string): number {
    return Date.now();
  }

  /**
   * 启动自动同步
   */
  private startAutoSync(): void {
    this.stopAutoSync();
    if (this.config.autoSyncInterval > 0) {
      this.syncTimer = setInterval(() => {
        this.upload().catch(console.error);
      }, this.config.autoSyncInterval * 60 * 1000);
    }
  }

  /**
   * 停止自动同步
   */
  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 通用 API 调用方法
   */
  private async callApi<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<SyncApiResponse<T>> {
    if (!this.config.serverUrl) {
      return { success: false, error: '未配置同步服务器' };
    }

    const url = `${this.config.serverUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiToken) {
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stopAutoSync();
  }
}

// 导出单例
export const syncService = new SyncService();
