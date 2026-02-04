/**
 * FileSystem 后端实现（通过 Electron IPC）
 */
import type { IStorageBackend, StorageResult, BatchOperationOptions } from '@/types/storage';
import { StorageBackendType } from '@/types/storage';

// Electron API 接口定义
interface ElectronAPI {
  getConfig: () => Promise<{ configs: any[]; activeIndex: number }>;
  saveConfig: (config: { configs: any[]; activeIndex: number }) => Promise<void>;
  getGlobalMemory: () => Promise<{ entries: any[]; version: number; lastUpdated: number }>;
  saveGlobalMemory: (memory: { entries: any[]; version: number; lastUpdated: number }) => Promise<void>;
}

// 声明 window.electronAPI
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export class FileSystemBackend implements IStorageBackend {
  readonly type: StorageBackendType = StorageBackendType.FILE_SYSTEM;
  private api: ElectronAPI;

  constructor() {
    if (!window.electronAPI) {
      throw new Error('Electron API not available. FileSystemBackend can only be used in Electron environment.');
    }
    this.api = window.electronAPI;
  }

  async init(): Promise<void> {
    // FileSystem 后端不需要特殊初始化
  }

  async isAvailable(): Promise<boolean> {
    return typeof window.electronAPI !== 'undefined';
  }

  // 映射存储键到 Electron API 方法
  private async getFromElectron<T>(key: string): Promise<StorageResult<T>> {
    try {
      let data: any;

      switch (key) {
        case 'llm-config-list':
          data = await this.api.getConfig();
          break;
        case 'global-memory':
          data = await this.api.getGlobalMemory();
          break;
        default:
          return { success: false, error: `Key "${key}" not supported in FileSystem backend` };
      }

      return { success: true, data: data as T };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async setToElectron<T>(key: string, value: T): Promise<StorageResult<void>> {
    try {
      switch (key) {
        case 'llm-config-list':
          await this.api.saveConfig(value as any);
          break;
        case 'global-memory':
          await this.api.saveGlobalMemory(value as any);
          break;
        default:
          return { success: false, error: `Key "${key}" not supported in FileSystem backend` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    return this.getFromElectron<T>(key);
  }

  async set<T>(key: string, value: T): Promise<StorageResult<void>> {
    return this.setToElectron(key, value);
  }

  async delete(key: string): Promise<StorageResult<void>> {
    // FileSystem 后端不支持删除操作
    return { success: false, error: 'Delete operation not supported in FileSystem backend' };
  }

  async has(key: string): Promise<boolean> {
    const result = await this.get(key);
    return result.success;
  }

  async keys(): Promise<string[]> {
    // FileSystem 后端支持的键列表
    return ['llm-config-list', 'global-memory'];
  }

  async clear(): Promise<StorageResult<void>> {
    return { success: false, error: 'Clear operation not supported in FileSystem backend' };
  }

  async getMultiple<T>(keys: string[]): Promise<StorageResult<T[]>> {
    const results: T[] = [];
    const errors: string[] = [];

    for (const key of keys) {
      const result = await this.get<T>(key);
      if (result.success && result.data !== undefined) {
        results.push(result.data);
      } else {
        errors.push(result.error || `Failed to get key "${key}"`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { success: false, error: errors.join('; ') };
    }

    return { success: true, data: results };
  }

  async setMultiple<T>(
    entries: Array<{ key: string; value: T }>,
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    const errors: string[] = [];

    for (const entry of entries) {
      const result = await this.set(entry.key, entry.value);
      if (!result.success) {
        if (options?.skipErrors) {
          errors.push(result.error || `Failed to set key "${entry.key}"`);
        } else {
          return result;
        }
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    return { success: true };
  }

  async deleteMultiple(keys: string[], options?: BatchOperationOptions): Promise<StorageResult<void>> {
    const errors: string[] = [];

    for (const key of keys) {
      const result = await this.delete(key);
      if (!result.success) {
        if (options?.skipErrors) {
          errors.push(result.error || `Failed to delete key "${key}"`);
        } else {
          return result;
        }
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }

    return { success: true };
  }
}
