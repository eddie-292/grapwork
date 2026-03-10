/**
 * 图片生成 Provider 类型定义
 */

// 提供商类型
export type ImageProviderType = 'zhipu' | 'openai' | 'stability' | 'custom'

// 生成请求参数（通用）
export interface ImageGenerationParams {
  prompt: string
  size: string
  model?: string
}

// 生成结果
export interface ImageGenerationResult {
  success: boolean
  images?: string[]      // 图片 URL 或 base64 data URI
  error?: string
  created?: number
  rawUsage?: Record<string, unknown>  // 原始用量信息
}

// 提供商配置（通用字段）
export interface ImageProviderConfig {
  id: string
  name: string
  provider: ImageProviderType
  apiUrl: string
  apiKey: string
  model: string
  size: string
  enabled: boolean
  // 提供商特定配置
  extraConfig?: Record<string, unknown>
}

// 提供商能力描述
export interface ImageProviderCapabilities {
  // 支持的尺寸
  sizes: Array<{ label: string; value: string }>
  // 支持的模型
  models: Array<{ label: string; value: string }>
  // 是否支持负面提示词
  supportsNegativePrompt: boolean
  // 是否支持多图生成
  supportsMultipleImages: boolean
  // 是否支持图片编辑
  supportsImageEditing: boolean
  // 自定义配置字段
  customConfigFields?: Array<{
    key: string
    label: string
    type: 'text' | 'password' | 'number' | 'select'
    options?: Array<{ label: string; value: string }>
    default?: string | number
    placeholder?: string
  }>
}

// 提供商接口
export interface ImageProvider {
  // 提供商类型标识
  readonly type: ImageProviderType

  // 提供商显示名称
  readonly displayName: string

  // 获取能力描述
  getCapabilities(): ImageProviderCapabilities

  // 生成图片
  generate(config: ImageProviderConfig, params: ImageGenerationParams): Promise<ImageGenerationResult>

  // 验证配置是否有效
  validateConfig(config: ImageProviderConfig): { valid: boolean; error?: string }
}
