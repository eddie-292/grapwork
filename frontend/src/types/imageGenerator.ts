/**
 * 生图模式相关类型定义
 */
import type { ImageProviderType } from '@/imageProviders/types'

// 生图配置
export interface ImageGeneratorConfig {
  id: string
  name: string
  provider: ImageProviderType  // 提供商类型
  apiUrl: string        // API 地址 (如: https://open.bigmodel.cn/api/paas/v4/images/generations)
  apiKey: string        // API 密钥
  model: string         // 模型名称 (默认: 'glm-image')
  size: string          // 图片尺寸 (默认: '1280x1280')
  enabled: boolean      // 是否启用
  isDefault?: boolean   // 是否为默认配置（默认配置不可删除）
  // 提供商特定配置
  extraConfig?: Record<string, unknown>
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
  content: string         // 消息内容 (用户输入的描述或 AI 返回的信息)
  negativePrompt?: string // 反向提示词（可选）
  inputImages?: string[]  // 输入的参考图片 URL 列表（图片编辑模式）
  images?: string[]       // 生成的图片 URL 列表
  error?: string          // 错误信息
  model?: string          // 使用的模型
  size?: string           // 使用的尺寸
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
      name: 'GLM-Image',
      provider: 'zhipu',
      apiUrl: 'https://open.bigmodel.cn/api/paas/v4/images/generations',
      apiKey: '',
      model: 'glm-image',
      size: '1280x1280',
      enabled: true,
      isDefault: true
    },
    {
      id: 'qwen-default',
      name: 'Qwen-Image-Plus',
      provider: 'qwen',
      apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      apiKey: '',
      model: 'qwen-image-plus',
      size: '1664*928',
      enabled: true,
      isDefault: true,
      extraConfig: {
        promptExtend: 'true',
        watermark: 'false'
      }
    },
    {
      id: 'qwen-image-edit-default',
      name: 'Qwen-Image-Edit-Plus',
      provider: 'qwen-image-edit',
      apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      apiKey: '',
      model: 'qwen-image-edit-plus',
      size: '1024*1024',
      enabled: true,
      isDefault: true,
      extraConfig: {
        promptExtend: 'true',
        watermark: 'false',
        outputCount: '1'
      }
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
  { label: '1:1 正方形 (1280x1280)', value: '1280x1280' },
  { label: '3:2 横向 (1568x1056)', value: '1568x1056' },
  { label: '2:3 竖向 (1056x1568)', value: '1056x1568' },
  { label: '4:3 横向 (1472x1088)', value: '1472x1088' },
  { label: '3:4 竖向 (1088x1472)', value: '1088x1472' },
  { label: '16:9 宽幅 (1728x960)', value: '1728x960' },
  { label: '9:16 窄幅 (960x1728)', value: '960x1728' }
]

// 可选的模型
export const IMAGE_MODEL_OPTIONS = [
  { label: 'GLM-Image (智谱)', value: 'glm-image' }
]

// 产出物文件
export interface OutputFile {
  id: string
  filename: string           // 文件名
  localPath: string          // 本地文件路径
  originalUrl: string        // 原始 URL (用于预览)
  prompt: string             // 生成提示词
  model: string              // 使用的模型
  size: string               // 使用的尺寸
  sessionId: string          // 所属会话 ID
  createdAt: number
}

// 产出物注册表
export interface OutputsRegistry {
  files: OutputFile[]
  version: number
  lastUpdated: number
}

// 默认产出物注册表
export const DEFAULT_OUTPUTS_REGISTRY: OutputsRegistry = {
  files: [],
  version: 1,
  lastUpdated: Date.now()
}
