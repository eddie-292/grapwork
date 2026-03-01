/**
 * MCP (Model Context Protocol) 类型定义
 * 用于管理和配置 MCP 服务器，并与 LLM Function Calling 集成
 */

// MCP 服务器依赖配置
export interface MCPDependency {
  type: 'python' | 'node' | 'uvx'  // 依赖类型
  packages: string[]            // 依赖包列表（如 ['mcp', 'requests']）
  requirementsFile?: string     // requirements.txt 路径（可选，用于 Python）
}

// MCP 服务器配置
export interface MCPServer {
  id: string                    // 唯一标识符
  name: string                  // 服务器名称
  description?: string          // 服务器描述
  transportType: MCPTransportType  // 传输类型
  enabled: boolean              // 是否启用
  simpleCommand?: boolean       // 是否为简单命令（非 MCP 服务器）
  builtin?: boolean             // 是否为内置服务器（不可删除和修改）
  createdAt: number             // 创建时间
  updatedAt: number             // 更新时间

  // STDIO 传输配置
  command?: string              // 执行命令
  args?: string[]               // 命令参数
  env?: Record<string, string>  // 环境变量

  // SSE 传输配置
  url?: string                  // SSE 服务器 URL

  // 工具配置（从服务器获取的工具列表）
  tools?: MCPToolDefinition[]   // 可用工具列表

  // 依赖配置（用于安装服务器所需的依赖）
  dependencies?: MCPDependency  // 依赖配置
}

// MCP 传输类型
export const MCPTransportType = {
  STDIO: 'stdio',      // 标准输入输出
  SSE: 'sse',          // Server-Sent Events
} as const

export type MCPTransportType = typeof MCPTransportType[keyof typeof MCPTransportType]

// MCP 工具定义（符合 OpenAI Function Calling 格式）
export interface MCPToolDefinition {
  type: 'function'              // 固定为 function
  function: {
    name: string                // 工具名称
    description?: string        // 工具描述
    alias?: string              // 工具别名（用于美化显示）
    parameters?: {              // JSON Schema 格式的参数定义
      type: 'object'
      properties: Record<string, {
        type: string
        description?: string
        enum?: string[]
        [key: string]: any
      }>
      required?: string[]
    }
  }
}

// OpenAI 格式的工具调用
export interface OpenAIToolCall {
  id: string                    // 工具调用 ID
  type: 'function'              // 固定为 function
  function: {
    name: string                // 工具名称
    arguments: string           // JSON 字符串格式的参数
  }
}

// MCP 服务器列表
export interface MCPServerList {
  servers: MCPServer[]
  activeServerIds: string[]     // 当前激活的服务器 ID 列表
}

// MCP 工具执行结果
export interface MCPToolResult {
  toolCallId: string            // 对应的工具调用 ID
  content: string               // 工具执行结果（文本格式）
  error?: string                // 错误信息
}

// MCP 对话消息（用于与 LLM 交互）
export interface MCPChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string         // 工具消息的调用 ID
  tool_calls?: OpenAIToolCall[] // assistant 的工具调用列表
}

// MCP 配置选项
export interface MCPOptions {
  timeout?: number              // 请求超时时间（毫秒），默认 30000
  maxRetries?: number           // 最大重试次数，默认 0
  retryDelay?: number           // 重试延迟（毫秒），默认 1000
}
