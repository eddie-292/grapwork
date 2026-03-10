/**
 * 智谱 GLM-Image 图片生成 Provider
 * 文档: https://open.bigmodel.cn/dev/api#image-generation
 */
import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageProviderCapabilities
} from './types'

// 智谱支持的图片尺寸
const ZHIPU_SIZES = [
  { label: '1:1 正方形 (1280x1280)', value: '1280x1280' },
  { label: '3:2 横向 (1568x1056)', value: '1568x1056' },
  { label: '2:3 竖向 (1056x1568)', value: '1056x1568' },
  { label: '4:3 横向 (1472x1088)', value: '1472x1088' },
  { label: '3:4 竖向 (1088x1472)', value: '1088x1472' },
  { label: '16:9 宽幅 (1728x960)', value: '1728x960' },
  { label: '9:16 窄幅 (960x1728)', value: '960x1728' }
]

// 智谱支持的模型
const ZHIPU_MODELS = [
  { label: 'GLM-Image (智谱)', value: 'glm-image' }
]

export class ZhipuImageProvider implements ImageProvider {
  readonly type = 'zhipu' as const
  readonly displayName = 'GLM-Image'

  getCapabilities(): ImageProviderCapabilities {
    return {
      sizes: ZHIPU_SIZES,
      models: ZHIPU_MODELS,
      supportsNegativePrompt: false,
      supportsMultipleImages: true,
      supportsImageEditing: false
    }
  }

  validateConfig(config: ImageProviderConfig): { valid: boolean; error?: string } {
    if (!config.apiKey) {
      return { valid: false, error: '请输入 API Key' }
    }
    if (!config.apiUrl) {
      return { valid: false, error: '请输入 API 地址' }
    }
    return { valid: true }
  }

  async generate(
    config: ImageProviderConfig,
    params: ImageGenerationParams
  ): Promise<ImageGenerationResult> {
    const { prompt, size, model } = params

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || config.model || 'glm-image',
          prompt,
          size: size || config.size || '1280x1280'
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`API 请求失败: ${response.status} ${text}`)
      }

      const result = await response.json()

      // 提取图片 URL
      const images: string[] = []
      if (result.data && Array.isArray(result.data)) {
        for (const item of result.data) {
          if (item.url) {
            images.push(item.url)
          }
          // 支持 base64 格式的图片
          if (item.b64_json) {
            images.push(`data:image/png;base64,${item.b64_json}`)
          }
        }
      }

      return {
        success: true,
        images,
        created: result.created,
        rawUsage: result.usage
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// 导出单例实例
export const zhipuProvider = new ZhipuImageProvider()
