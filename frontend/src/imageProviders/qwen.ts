/**
 * 阿里云千问 (Qwen) 图片生成 Provider
 * 文档: https://help.aliyun.com/zh/model-studio/developer-reference/text-to-image
 *
 * 特点：
 * - 异步 API：先提交任务获取 task_id，然后轮询获取结果
 * - 支持负面提示词
 * - 不同模型支持不同的尺寸
 */
import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerationParams,
  ImageGenerationResult,
  ImageProviderCapabilities
} from './types'

// 千问万相模型 - plus/max 系列支持的固定尺寸
const QWEN_PLUS_SIZES = [
  { label: '1:1 正方形 (1328*1328)', value: '1328*1328' },
  { label: '16:9 横向 (1664*928)', value: '1664*928' },
  { label: '4:3 横向 (1472*1104)', value: '1472*1104' },
  { label: '3:4 竖向 (1104*1472)', value: '1104*1472' },
  { label: '9:16 竖向 (928*1664)', value: '928*1664' }
]

// 千问支持的模型
const QWEN_MODELS = [
  { label: 'Qwen-Image-Plus', value: 'qwen-image-plus' },
]

// 异步任务状态
type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'

// 任务提交响应
interface TaskSubmitResponse {
  output?: {
    task_id: string
    task_status: TaskStatus
  }
  code?: string
  message?: string
}

// 任务查询响应
interface TaskQueryResponse {
  output?: {
    task_id: string
    task_status: TaskStatus
    results?: Array<{
      url: string
      code?: string
      message?: string
    }>
    task_metrics?: {
      TOTAL: number
      SUCCEEDED: number
      FAILED: number
    }
    submit_time?: string
    scheduled_time?: string
    end_time?: string
  }
  code?: string
  message?: string
  request_id?: string
}

// 默认 API 地址
const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'

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

export class QwenImageProvider implements ImageProvider {
  readonly type = 'qwen' as const
  readonly displayName = '千问万相'

  getCapabilities(): ImageProviderCapabilities {
    return {
      sizes: QWEN_PLUS_SIZES, // 默认使用 plus 系列尺寸
      models: QWEN_MODELS,
      supportsNegativePrompt: true,
      supportsMultipleImages: true,
      supportsImageEditing: false,
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

  /**
   * 提交异步任务
   */
  private async submitTask(
    config: ImageProviderConfig,
    params: ImageGenerationParams
  ): Promise<{ taskId: string; error?: string }> {
    const { prompt, size, model, negativePrompt } = params

    // 获取额外配置
    const promptExtend = config.extraConfig?.promptExtend !== 'false'
    const watermark = config.extraConfig?.watermark === 'true'

    const requestBody = {
      model: model || config.model || 'qwen-image-plus',
      input: {
        prompt,
        negative_prompt: negativePrompt || ''
      },
      parameters: {
        size: size || config.size || '1664*928',
        n: params.n || 1,
        prompt_extend: promptExtend,
        watermark
      }
    }

    try {
      const response = await apiRequest(
        config.apiUrl || DEFAULT_API_URL,
        'POST',
        {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable'
        },
        requestBody
      )

      if (!response.ok) {
        return { taskId: '', error: `提交任务失败: ${response.status} ${response.data || response.error}` }
      }

      const result: TaskSubmitResponse = JSON.parse(response.data || '{}')

      if (result.code) {
        return { taskId: '', error: `${result.code}: ${result.message}` }
      }

      if (!result.output?.task_id) {
        return { taskId: '', error: '未能获取任务 ID' }
      }

      return { taskId: result.output.task_id }
    } catch (error) {
      return {
        taskId: '',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 查询任务状态
   */
  private async queryTask(
    config: ImageProviderConfig,
    taskId: string
  ): Promise<{ status: TaskStatus; images?: string[]; error?: string }> {
    // 构建查询 URL
    const queryUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`

    try {
      const response = await apiRequest(
        queryUrl,
        'GET',
        {
          'Authorization': `Bearer ${config.apiKey}`
        }
      )

      if (!response.ok) {
        return { status: 'FAILED', error: `查询任务失败: ${response.status} ${response.data || response.error}` }
      }

      const result: TaskQueryResponse = JSON.parse(response.data || '{}')

      if (result.code) {
        return { status: 'FAILED', error: `${result.code}: ${result.message}` }
      }

      const status = result.output?.task_status || 'UNKNOWN'

      if (status === 'SUCCEEDED') {
        const images: string[] = []
        if (result.output?.results) {
          for (const item of result.output.results) {
            if (item.url) {
              images.push(item.url)
            }
          }
        }
        return { status, images }
      }

      if (status === 'FAILED') {
        return {
          status,
          error: result.output?.results?.[0]?.message || '任务执行失败'
        }
      }

      return { status }
    } catch (error) {
      return {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 轮询等待任务完成
   */
  private async pollTask(
    config: ImageProviderConfig,
    taskId: string,
    options: {
      maxAttempts?: number
      intervalMs?: number
      onProgress?: (status: string) => void
    } = {}
  ): Promise<{ images?: string[]; error?: string }> {
    const {
      maxAttempts = 60,      // 最多轮询 60 次
      intervalMs = 3000,     // 每 3 秒轮询一次
      onProgress
    } = options

    let attempts = 0
    let currentInterval = intervalMs

    while (attempts < maxAttempts) {
      attempts++

      const result = await this.queryTask(config, taskId)

      if (onProgress) {
        onProgress(result.status)
      }

      if (result.status === 'SUCCEEDED') {
        return { images: result.images }
      }

      if (result.status === 'FAILED' || result.status === 'UNKNOWN') {
        return { error: result.error || '任务失败' }
      }

      // 动态调整轮询间隔：前 10 次每 3 秒，之后每 5 秒
      if (attempts > 10) {
        currentInterval = 5000
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, currentInterval))
    }

    return { error: '任务超时' }
  }

  async generate(
    config: ImageProviderConfig,
    params: ImageGenerationParams
  ): Promise<ImageGenerationResult> {
    // 1. 提交任务
    const submitResult = await this.submitTask(config, params)
    if (submitResult.error || !submitResult.taskId) {
      return {
        success: false,
        error: submitResult.error || '提交任务失败'
      }
    }

    // 2. 轮询等待结果
    const pollResult = await this.pollTask(config, submitResult.taskId)

    if (pollResult.error) {
      return {
        success: false,
        error: pollResult.error
      }
    }

    return {
      success: true,
      images: pollResult.images,
      created: Date.now()
    }
  }
}

// 导出单例实例
export const qwenProvider = new QwenImageProvider()
