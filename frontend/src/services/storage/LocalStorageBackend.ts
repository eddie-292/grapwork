/**
 * LocalStorage 后端实现
 */
import type { IStorageBackend, StorageResult, BatchOperationOptions } from '@/types/storage';
import { StorageBackendType } from '@/types/storage';

export class LocalStorageBackend implements IStorageBackend {
  readonly type: StorageBackendType = StorageBackendType.LOCAL_STORAGE;

  async init(): Promise<void> {
    // LocalStorage 不需要初始化
  }

  async isAvailable(): Promise<boolean> {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(key: string): Promise<StorageResult<T>> {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return { success: false, error: `Key "${key}" not found` };
      }
      const value = JSON.parse(item) as T;
      return { success: true, data: value };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async set<T>(key: string, value: T): Promise<StorageResult<void>> {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(key: string): Promise<StorageResult<void>> {
    try {
      localStorage.removeItem(key);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async has(key: string): Promise<boolean> {
    return localStorage.getItem(key) !== null;
  }

  async keys(): Promise<string[]> {
    return Object.keys(localStorage);
  }

  async clear(): Promise<StorageResult<void>> {
    try {
      localStorage.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
