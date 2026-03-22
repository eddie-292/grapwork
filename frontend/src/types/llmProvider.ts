/**
 * LLM 提供商预定义配置
 * 支持快速配置主流 OpenAI 兼容 API
 */

export interface LLMProvider {
  id: string
  name: string
  apiUrl: string
  defaultModel: string
  models: string[]
  description: string
  website: string
  icon: string // SVG 图标名称或 emoji
}

/**
 * 预定义的 LLM 提供商列表
 * 所有提供商都支持 OpenAI 兼容 API 格式
 */
export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o1-preview'],
    description: 'OpenAI 官方 API',
    website: 'https://platform.openai.com',
    icon: 'openai'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    description: '深度求索 - 高性价比推理模型',
    website: 'https://platform.deepseek.com',
    icon: 'deepseek'
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    apiUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    description: '月之暗面 - 长上下文模型',
    website: 'https://platform.moonshot.cn',
    icon: 'moonshot'
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-4-air', 'glm-3-turbo'],
    description: '智谱清言 - 国产大模型',
    website: 'https://open.bigmodel.cn',
    icon: 'zhipu'
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext', 'qwen-long'],
    description: '阿里云通义千问 - OpenAI 兼容模式',
    website: 'https://dashscope.console.aliyun.com',
    icon: 'qwen'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'deepseek/deepseek-chat'
    ],
    description: 'OpenRouter - 多模型聚合平台',
    website: 'https://openrouter.ai',
    icon: 'openrouter'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    apiUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest'],
    description: 'Mistral AI - 欧洲开源大模型',
    website: 'https://console.mistral.ai',
    icon: 'mistral'
  },
  {
    id: 'groq',
    name: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    description: 'Groq - 极速推理引擎',
    website: 'https://console.groq.com',
    icon: 'groq'
  },
  {
    id: 'together',
    name: 'Together AI',
    apiUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'Qwen/Qwen2.5-72B-Instruct-Turbo'
    ],
    description: 'Together AI - 开源模型云服务',
    website: 'https://api.together.xyz',
    icon: 'together'
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    apiUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    models: [
      'accounts/fireworks/models/llama-v3p1-70b-instruct',
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
      'accounts/fireworks/models/qwen2p5-72b-instruct',
      'accounts/fireworks/models/deepseek-v3'
    ],
    description: 'Fireworks AI - 高性能推理平台',
    website: 'https://fireworks.ai',
    icon: 'fireworks'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    apiUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    models: [
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'THUDM/glm-4-9b-chat'
    ],
    description: '硅基流动 - 国内模型聚合平台',
    website: 'https://cloud.siliconflow.cn',
    icon: 'siliconflow'
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    apiUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'qwen2.5', 'deepseek-coder-v2', 'gemma2', 'mistral'],
    description: 'Ollama - 本地模型运行',
    website: 'https://ollama.ai',
    icon: 'ollama'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (本地)',
    apiUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    models: ['local-model'],
    description: 'LM Studio - 本地模型运行',
    website: 'https://lmstudio.ai',
    icon: 'lmstudio'
  },
  {
    id: 'custom',
    name: '自定义',
    apiUrl: '',
    defaultModel: '',
    models: [],
    description: '自定义 OpenAI 兼容 API',
    website: '',
    icon: 'custom'
  }
]

/**
 * 根据提供商 ID 获取提供商配置
 */
export function getProviderById(id: string): LLMProvider | undefined {
  return LLM_PROVIDERS.find(p => p.id === id)
}

/**
 * 根据提供商 ID 获取默认模型列表
 */
export function getProviderModels(providerId: string): string[] {
  const provider = getProviderById(providerId)
  return provider?.models || []
}