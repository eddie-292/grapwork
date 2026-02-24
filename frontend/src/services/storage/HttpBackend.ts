/**
 * HTTP 后端实现（预留用于将来的数据同步）
 */
import type { IStorageBackend, StorageResult, BatchOperationOptions } from '@/types/storage';
import { StorageBackendType } from '@/types/storage';

export interface HttpBackendConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpBackend implements IStorageBackend {
  readonly type: StorageBackendType = StorageBackendType.HTTP;
  private config: HttpBackendConfig;

  constructor(config: HttpBackendConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    // TODO: 实现连接测试等初始化逻辑
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: 'GET',
        headers: this.config.headers,
        signal: AbortSignal.timeout(this.config.timeout || 5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<StorageResult<T>> {
    try {
      const url = `${this.config.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
          ...options.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout || 30000),
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

  async get<T>(key: string): Promise<StorageResult<T>> {
    return this.request<T>(`/storage/${encodeURIComponent(key)}`);
  }

  async set<T>(key: string, value: T): Promise<StorageResult<void>> {
    return this.request<void>(`/storage/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    });
  }

  async delete(key: string): Promise<StorageResult<void>> {
    return this.request<void>(`/storage/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  }

  async has(key: string): Promise<boolean> {
    const result = await this.request<{ exists: boolean }>(
      `/storage/${encodeURIComponent(key)}/exists`
    );
    return result.success ? result.data?.exists ?? false : false;
  }

  async keys(): Promise<string[]> {
    const result = await this.request<{ keys: string[] }>('/storage/keys');
    return result.success ? result.data?.keys ?? [] : [];
  }

  async clear(): Promise<StorageResult<void>> {
    return this.request<void>('/storage', { method: 'DELETE' });
  }

  async getMultiple<T>(keys: string[]): Promise<StorageResult<T[]>> {
    const result = await this.request<{ data: T[] }>('/storage/batch', {
      method: 'POST',
      body: JSON.stringify({ keys }),
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data?.data ?? [] };
  }

  async setMultiple<T>(
    entries: Array<{ key: string; value: T }>,
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    const result = await this.request<void>('/storage/batch', {
      method: 'PUT',
      body: JSON.stringify({ entries, skipErrors: options?.skipErrors }),
    });

    return result;
  }

  async deleteMultiple(keys: string[], options?: BatchOperationOptions): Promise<StorageResult<void>> {
    const result = await this.request<void>('/storage/batch', {
      method: 'DELETE',
      body: JSON.stringify({ keys, skipErrors: options?.skipErrors }),
    });

    return result;
  }
}
