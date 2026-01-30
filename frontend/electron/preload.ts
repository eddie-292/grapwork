import { contextBridge, ipcRenderer } from 'electron'

export interface AppConfig {
  apiUrl: string
  apiKey: string
  model: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),
  chatRequest: (params: { apiUrl: string; apiKey: string; model: string; messages: any[] }) =>
    ipcRenderer.invoke('chat-request', params)
})
