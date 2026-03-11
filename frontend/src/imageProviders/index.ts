/**
 * 图片生成 Provider 注册表和工厂
 */
import type { ImageProvider, ImageProviderType, ImageProviderConfig } from './types'
import { zhipuProvider } from './zhipu'
import { qwenProvider } from './qwen'

// Provider 注册表
const providers: Map<ImageProviderType, ImageProvider> = new Map()

// 注册默认 providers
providers.set('zhipu', zhipuProvider)
providers.set('qwen', qwenProvider)

/**
 * 注册一个新的 provider
 */
export function registerProvider(provider: ImageProvider): void {
  providers.set(provider.type, provider)
}

/**
 * 获取指定类型的 provider
 */
export function getProvider(type: ImageProviderType): ImageProvider | undefined {
  return providers.get(type)
}

/**
 * 获取所有已注册的 providers
 */
export function getAllProviders(): ImageProvider[] {
  return Array.from(providers.values())
}

/**
 * 获取所有 provider 类型选项（用于 UI 选择）
 */
export function getProviderOptions(): Array<{ label: string; value: ImageProviderType }> {
  return Array.from(providers.values()).map(p => ({
    label: p.displayName,
    value: p.type
  }))
}

/**
 * 使用配置生成图片
 * 这是主要的入口函数，会根据配置中的 provider 类型选择对应的 provider
 */
export async function generateImage(
  config: ImageProviderConfig,
  params: { prompt: string; size: string; model?: string; negativePrompt?: string }
): Promise<{ success: boolean; images?: string[]; error?: string; created?: number }> {
  const provider = providers.get(config.provider)

  if (!provider) {
    return {
      success: false,
      error: `未知的图片生成 provider: ${config.provider}`
    }
  }

  // 验证配置
  const validation = provider.validateConfig(config)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error
    }
  }

  // 调用 provider 生成图片
  const result = await provider.generate(config, params)

  return {
    success: result.success,
    images: result.images,
    error: result.error,
    created: result.created
  }
}

// 导出类型
export * from './types'
export { zhipuProvider } from './zhipu'
export { qwenProvider } from './qwen'
