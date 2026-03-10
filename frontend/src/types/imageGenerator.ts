/**
 * 生图模式相关类型定义
 */

// 生图配置
export interface ImageGeneratorConfig {
  id: string
  name: string
  apiUrl: string        // API 地址 (如: https://open.bigmodel.cn/api/paas/v4/images/generations)
  apiKey: string        // API 密钥
  model: string         // 模型名称 (默认: 'glm-image')
  size: string          // 图片尺寸 (默认: '1280x1280')
  enabled: boolean      // 是否启用
}

// 生图配置列表
export interface ImageGeneratorConfigList {
  configs: ImageGeneratorConfig[]
  activeIndex: number
}

// 生图消息
export interface ImageChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string       // 消息内容 (用户输入的描述或 AI 返回的信息)
  images?: string[]     // 生成的图片 URL 列表
  error?: string        // 错误信息
  createdAt: number
}

// 生图会话
export interface ImageChatSession {
  id: string
  title: string
  messages: ImageChatMessage[]
  createdAt: number
  configId?: string     // 使用的配置 ID
  sending?: boolean     // 是否正在发送
}

// 生图历史
export interface ImageGeneratorHistory {
  sessions: ImageChatSession[]
  activeSessionId: string | null
  version: number
  lastUpdated: number
}

// 图片生成请求参数
export interface ImageGeneratorRequestParams {
  apiUrl: string
  apiKey: string
  model: string
  prompt: string
  size: string
}

// 图片生成响应
export interface ImageGeneratorResponse {
  success: boolean
  error?: string
  images?: string[]     // 图片 URL 列表
  created?: number
}

// 默认配置
export const DEFAULT_IMAGE_CONFIGS: ImageGeneratorConfigList = {
  configs: [
    {
      id: 'zhipu-default',
      name: '智谱 GLM-Image',
      apiUrl: 'https://open.bigmodel.cn/api/paas/v4/images/generations',
      apiKey: '',
      model: 'glm-image',
      size: '1280x1280',
      enabled: true
    }
  ],
  activeIndex: 0
}

// 默认历史
export const DEFAULT_IMAGE_HISTORY: ImageGeneratorHistory = {
  sessions: [],
  activeSessionId: null,
  version: 1,
  lastUpdated: Date.now()
}

// 可选的图片尺寸 (智谱 GLM-Image 推荐)
// 自定义参数: 长宽需在 512px-2048px 范围内，且长宽均需为32的整数倍
export const IMAGE_SIZE_OPTIONS = [
  { label: '1280x1280 (默认)', value: '1280x1280' },
  { label: '1568x1056 (横向)', value: '1568x1056' },
  { label: '1056x1568 (竖向)', value: '1056x1568' },
  { label: '1472x1088 (横向)', value: '1472x1088' },
  { label: '1088x1472 (竖向)', value: '1088x1472' },
  { label: '1728x960 (宽幅)', value: '1728x960' },
  { label: '960x1728 (窄幅)', value: '960x1728' }
]

// 可选的模型
export const IMAGE_MODEL_OPTIONS = [
  { label: 'GLM-Image (智谱)', value: 'glm-image' }
]
