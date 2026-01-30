export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
  name: string
  enabled: boolean
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
  }) => Promise<{ success: boolean; error?: string; status?: number; headers?: Record<string, string> }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
