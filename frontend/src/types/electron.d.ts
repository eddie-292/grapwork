export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
  extra_body?: string
}

export interface Assistant {
  id: string
  name: string
  emoji: string
  systemPrompt: string
  createdAt: number
}

export interface AssistantList {
  assistants: Assistant[]
  activeIndex: number
}

export interface ConfigList {
  configs: AppConfig[]
  activeIndex: number
}

// 全局记忆类型
export type GlobalMemoryType = 'preferences' | 'settings' | 'general_info' | 'custom'

export interface GlobalMemoryEntry {
  id: string
  type: GlobalMemoryType
  category: string
  title: string
  content: string
  keywords: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
  metadata?: {
    usageCount?: number
    lastUsedAt?: number
  }
}

export interface GlobalMemory {
  entries: GlobalMemoryEntry[]
  version: number
  lastUpdated: number
}

interface ElectronAPI {
  getConfig: () => Promise<ConfigList>
  saveConfig: (config: ConfigList) => Promise<boolean>
  chatRequest: (params: {
    apiUrl: string
    apiKey: string
    model: string
    messages: any[]
    extra_body?: string
  }) => Promise<{ success: boolean; error?: string; status?: number; headers?: Record<string, string> }>
  getGlobalMemory: () => Promise<GlobalMemory>
  saveGlobalMemory: (memory: GlobalMemory) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
