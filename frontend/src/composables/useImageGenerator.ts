/**
 * 生图模式 Composable
 * 提供图片生成的状态管理和业务逻辑
 */
import { ref, computed } from 'vue'
import { storage } from '@/services/StorageService'
import type {
  ImageGeneratorConfig,
  ImageGeneratorConfigList,
  ImageGeneratorHistory,
  ImageChatSession,
  ImageChatMessage,
  OutputFile,
  OutputsRegistry
} from '@/types/imageGenerator'
import {
  DEFAULT_IMAGE_CONFIGS,
  DEFAULT_IMAGE_HISTORY
} from '@/types/imageGenerator'

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useImageGenerator() {
  // 配置列表
  const configList = ref<ImageGeneratorConfigList>(JSON.parse(JSON.stringify(DEFAULT_IMAGE_CONFIGS)))

  // 历史记录
  const history = ref<ImageGeneratorHistory>(JSON.parse(JSON.stringify(DEFAULT_IMAGE_HISTORY)))

  // 产出物列表
  const outputs = ref<OutputFile[]>([])

  // 加载产出物
  async function loadOutputs() {
    try {
      const saved = await storage.get<OutputsRegistry>('outputs-registry')
      if (saved?.data?.files) {
        outputs.value = saved.data.files
      }
    } catch (error) {
      console.error('加载产出物失败:', error)
    }
  }

  // 保存产出物
  async function saveOutputs() {
    try {
      const registry: OutputsRegistry = {
        files: outputs.value,
        version: 1,
        lastUpdated: Date.now()
      }
      await storage.set('outputs-registry', registry)
    } catch (error) {
      console.error('保存产出物失败:', error)
    }
  }

  // 自动下载图片并添加到产出物列表
  async function autoDownloadImage(url: string, metadata: {
    prompt: string
    model: string
    size: string
    sessionId: string
  }) {
    try {
      const filename = `img_${Date.now()}.png`
      const result = await window.electronAPI?.autoDownloadImage(url, filename)

      if (result?.success && result.path) {
        const outputFile: OutputFile = {
          id: generateId(),
          filename,
          localPath: result.path,
          originalUrl: url,
          prompt: metadata.prompt,
          model: metadata.model,
          size: metadata.size,
          sessionId: metadata.sessionId,
          createdAt: Date.now()
        }
        outputs.value.unshift(outputFile)
        await saveOutputs()
      }
    } catch (error) {
      console.error('自动下载图片失败:', error)
    }
  }

  // 删除产出物
  async function deleteOutput(id: string) {
    const index = outputs.value.findIndex(f => f.id === id)
    if (index !== -1) {
      outputs.value.splice(index, 1)
      await saveOutputs()
    }
  }

  // 当前会话
  const currentSession = computed(() => {
    if (!history.value.activeSessionId) return null
    return history.value.sessions.find(s => s.id === history.value.activeSessionId) || null
  })

  // 当前激活的配置
  const activeConfig = computed(() => {
    if (configList.value.configs.length === 0) return null
    const index = configList.value.activeIndex
    if (index < 0 || index >= configList.value.configs.length) return null
    return configList.value.configs[index] || null
  })

  // 是否正在发送
  const isSending = computed(() => currentSession.value?.sending || false)

  // 加载配置
  async function loadConfig() {
    const saved = await storage.getImageGeneratorConfigList()
    if (saved) {
      configList.value = saved
    }
  }

  // 保存配置
  async function saveConfig() {
    await storage.saveImageGeneratorConfigList(configList.value)
  }

  // 加载历史
  async function loadHistory() {
    const saved = await storage.getImageGeneratorHistory()
    if (saved) {
      history.value = saved
    }
  }

  // 保存历史
  async function saveHistory() {
    await storage.saveImageGeneratorHistory(history.value)
  }

  // 创建新会话
  async function createSession(): Promise<ImageChatSession> {
    const session: ImageChatSession = {
      id: generateId(),
      title: '新会话',
      messages: [],
      createdAt: Date.now(),
      sending: false
    }
    history.value.sessions.unshift(session)
    history.value.activeSessionId = session.id
    await saveHistory()
    return session
  }

  // 切换会话
  async function switchSession(sessionId: string) {
    const session = history.value.sessions.find(s => s.id === sessionId)
    if (session) {
      history.value.activeSessionId = sessionId
      await saveHistory()
    }
  }

  // 删除会话
  async function deleteSession(sessionId: string) {
    const index = history.value.sessions.findIndex(s => s.id === sessionId)
    if (index !== -1) {
      history.value.sessions.splice(index, 1)
      // 如果删除的是当前会话，切换到第一个会话
      if (history.value.activeSessionId === sessionId) {
        history.value.activeSessionId = history.value.sessions[0]?.id || null
      }
      await saveHistory()
    }
  }

  // 发送消息并生成图片
  async function sendMessage(content: string): Promise<{ success: boolean; error?: string }> {
    const config = activeConfig.value
    if (!config || !config.apiKey) {
      return { success: false, error: '请先配置生图模型 API' }
    }

    let session = currentSession.value
    if (!session) {
      session = await createSession()
    }

    // 添加用户消息
    const userMessage: ImageChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      model: config.model,
      size: config.size,
      createdAt: Date.now()
    }
    session.messages.push(userMessage)

    // 更新会话标题（使用第一条消息）
    if (session.messages.length === 1) {
      session.title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
    }

    // 标记为发送中
    session.sending = true
    await saveHistory()

    try {
      // 调用图片生成 API
      const result = await window.electronAPI?.imageGeneratorRequest({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        prompt: content,
        size: config.size
      })

      // 添加助手消息
      const assistantMessage: ImageChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: result?.success ? '图片生成成功' : '生成失败',
        images: result?.images,
        error: result?.error,
        model: config.model,
        size: config.size,
        createdAt: Date.now()
      }
      session.messages.push(assistantMessage)
      session.sending = false

      await saveHistory()

      // 自动下载生成的图片
      if (result?.success && result.images && session) {
        for (const imgUrl of result.images) {
          await autoDownloadImage(imgUrl, {
            prompt: content,
            model: config.model,
            size: config.size,
            sessionId: session.id
          })
        }
      }

      return {
        success: result?.success || false,
        error: result?.error
      }
    } catch (error) {
      // 添加错误消息
      const errorMessage: ImageChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '生成图片时发生错误',
        error: error instanceof Error ? error.message : String(error),
        createdAt: Date.now()
      }
      session.messages.push(errorMessage)
      session.sending = false

      await saveHistory()

      return { success: false, error: errorMessage.error }
    }
  }

  // 更新配置
  async function updateConfig(index: number, config: ImageGeneratorConfig) {
    if (index >= 0 && index < configList.value.configs.length) {
      configList.value.configs[index] = config
      await saveConfig()
    }
  }

  // 添加配置
  async function addConfig(config: ImageGeneratorConfig) {
    configList.value.configs.push(config)
    await saveConfig()
  }

  // 删除配置
  async function deleteConfig(index: number) {
    if (index >= 0 && index < configList.value.configs.length) {
      configList.value.configs.splice(index, 1)
      // 调整 activeIndex
      if (configList.value.activeIndex >= configList.value.configs.length) {
        configList.value.activeIndex = Math.max(0, configList.value.configs.length - 1)
      }
      await saveConfig()
    }
  }

  // 设置激活的配置索引
  async function setActiveConfigIndex(index: number) {
    if (index >= 0 && index < configList.value.configs.length) {
      configList.value.activeIndex = index
      await saveConfig()
    }
  }

  // 清空所有历史
  async function clearHistory() {
    history.value = JSON.parse(JSON.stringify(DEFAULT_IMAGE_HISTORY))
    await saveHistory()
  }

  return {
    // 状态
    configList,
    history,
    currentSession,
    activeConfig,
    isSending,

    // 配置相关
    loadConfig,
    saveConfig,
    updateConfig,
    addConfig,
    deleteConfig,
    setActiveConfigIndex,

    // 历史相关
    loadHistory,
    saveHistory,
    createSession,
    switchSession,
    deleteSession,
    clearHistory,

    // 产出物相关
    outputs,
    loadOutputs,
    saveOutputs,
    deleteOutput,

    // 消息相关
    sendMessage
  }
}
