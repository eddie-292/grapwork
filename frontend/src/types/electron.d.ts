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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
