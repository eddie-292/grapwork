/**
 * 阿里云千问图像编辑 (Qwen-Image-Edit) Provider
 * 文档: https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide
 *
 * 特点：
 * - 同步 API：直接返回结果，无需轮询
 * - 支持多图输入（1-3张）
 * - 支持多图输出（1-6张）
 * - 支持图片编辑、风格迁移、物体增删改等
 */
import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageProviderCapabilities
} from './types'

// 千问图像编辑模型支持的尺寸
const QWEN_EDIT_SIZES = [
  { label: '1:1 正方形 (1024*1024)', value: '1024*1024' },
  { label: '1:1 正方形 (1536*1536)', value: '1536*1536' },
  { label: '2:3 竖向 (768*1152)', value: '768*1152' },
  { label: '2:3 竖向 (1024*1536)', value: '1024*1536' },
  { label: '3:2 横向 (1152*768)', value: '1152*768' },
  { label: '3:2 横向 (1536*1024)', value: '1536*1024' },
  { label: '3:4 竖向 (960*1280)', value: '960*1280' },
  { label: '3:4 竖向 (1080*1440)', value: '1080*1440' },
  { label: '4:3 横向 (1280*960)', value: '1280*960' },
  { label: '4:3 横向 (1440*1080)', value: '1440*1080' },
  { label: '9:16 竖向 (720*1280)', value: '720*1280' },
  { label: '9:16 竖向 (1080*1920)', value: '1080*1920' },
  { label: '16:9 横向 (1280*720)', value: '1280*720' },
  { label: '16:9 横向 (1920*1080)', value: '1920*1080' },
  { label: '21:9 超宽 (1344*576)', value: '1344*576' },
  { label: '21:9 超宽 (2048*872)', value: '2048*872' }
]

// 千问图像编辑支持的模型
const QWEN_EDIT_MODELS = [
  { label: 'Qwen-Image-2.0-Pro', value: 'qwen-image-2.0-pro' },
  { label: 'Qwen-Image-2.0', value: 'qwen-image-2.0' },
  { label: 'Qwen-Image-Edit-Max', value: 'qwen-image-edit-max' },
  { label: 'Qwen-Image-Edit-Plus', value: 'qwen-image-edit-plus' }
]

// 扩展的生成参数（支持输入图片）
export interface ImageEditParams extends ImageGenerationParams {
  inputImages?: string[]  // 输入图片 URL 或 base64 列表（1-3张）
}

// API 响应类型
interface QwenEditResponse {
  output?: {
    choices?: Array<{
      finish_reason: string
      message: {
        role: string
        content: Array<{ image: string }>
      }
    }>
  }
  usage?: {
    width: number
    height: number
    image_count: number
  }
  request_id?: string
  code?: string
  message?: string
}

// 默认 API 地址
const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

// 通用 API 请求辅助函数（通过 Electron IPC 避免 CORS）
async function apiRequest(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: object
): Promise<{ ok: boolean; status: number; data?: string; error?: string }> {
  try {
    const result = await window.electronAPI?.imageApiRequest({
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    if (!result) {
      return { ok: false, status: 0, error: 'IPC 请求失败' }
    }

    return {
      ok: result.success,
      status: result.status,
      data: result.data,
      error: result.error
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export class QwenImageEditProvider implements ImageProvider {
  readonly type = 'qwen-image-edit' as const
  readonly displayName = 'Qwen-Image-Edit'

  getCapabilities(): ImageProviderCapabilities {
    return {
      sizes: QWEN_EDIT_SIZES,
      models: QWEN_EDIT_MODELS,
      supportsNegativePrompt: true,
      supportsMultipleImages: true,
      supportsImageEditing: true,  // 核心特性：支持图片编辑
      customConfigFields: [
        {
          key: 'promptExtend',
          label: '智能改写提示词',
          type: 'select',
          options: [
            { label: '开启', value: 'true' },
            { label: '关闭', value: 'false' }
          ],
          default: 'true'
        },
        {
          key: 'watermark',
          label: '添加水印',
          type: 'select',
          options: [
            { label: '否', value: 'false' },
            { label: '是', value: 'true' }
          ],
          default: 'false'
        },
        {
          key: 'outputCount',
          label: '输出图片数量',
          type: 'select',
          options: [
            { label: '1 张', value: '1' },
            { label: '2 张', value: '2' },
            { label: '3 张', value: '3' },
            { label: '4 张', value: '4' },
            { label: '5 张', value: '5' },
            { label: '6 张', value: '6' }
          ],
          default: '1'
        }
      ]
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
    const { prompt, size, model, negativePrompt } = params
    const editParams = params as ImageEditParams

    // 获取额外配置
    const promptExtend = config.extraConfig?.promptExtend !== 'false'
    const watermark = config.extraConfig?.watermark === 'true'
    const outputCount = parseInt(String(config.extraConfig?.outputCount || '1'), 10)

    // 构建 content 数组
    const content: Array<{ image?: string; text?: string }> = []

    // 添加输入图片（如果有）
    if (editParams.inputImages && editParams.inputImages.length > 0) {
      for (const img of editParams.inputImages.slice(0, 3)) {  // 最多3张
        content.push({ image: img })
      }
    }

    // 添加文本提示词
    content.push({ text: prompt })

    // 构建请求体
    const requestBody = {
      model: model || config.model || 'qwen-image-edit-plus',
      input: {
        messages: [
          {
            role: 'user',
            content
          }
        ]
      },
      parameters: {
        n: outputCount,
        negative_prompt: negativePrompt || ' ',
        prompt_extend: promptExtend,
        watermark,
        size: size || config.size || '1024*1024'
      }
    }

    try {
      const response = await apiRequest(
        config.apiUrl || DEFAULT_API_URL,
        'POST',
        {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        requestBody
      )

      if (!response.ok) {
        return {
          success: false,
          error: `API 请求失败: ${response.status} ${response.data || response.error}`
        }
      }

      const result: QwenEditResponse = JSON.parse(response.data || '{}')

      // 检查错误
      if (result.code) {
        return {
          success: false,
          error: `${result.code}: ${result.message}`
        }
      }

      // 提取生成的图片 URL
      const images: string[] = []
      if (result.output?.choices?.[0]?.message?.content) {
        for (const item of result.output.choices[0].message.content) {
          if (item.image) {
            images.push(item.image)
          }
        }
      }

      if (images.length === 0) {
        return {
          success: false,
          error: '未能生成图片'
        }
      }

      return {
        success: true,
        images,
        created: Date.now(),
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
export const qwenImageEditProvider = new QwenImageEditProvider()
