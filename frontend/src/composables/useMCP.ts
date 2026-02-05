/**
 * MCP (Model Context Protocol) 管理组件
 * 用于管理 MCP 服务器配置、与 LLM Function Calling 集成
 */
import { ref, computed } from 'vue'
import { storage } from '@/services/StorageService'
import type {
  MCPServer,
  MCPServerList,
  MCPToolDefinition,
  OpenAIToolCall,
  MCPToolResult,
  MCPChatMessage,
} from '@/types/mcp'

// 使用 MCP 的 composable
export function useMCP() {
  const serverList = ref<MCPServerList>({
    servers: [],
    activeServerIds: []
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 加载 MCP 服务器列表
  async function loadServers() {
    loading.value = true
    error.value = null
    try {
      const data = await storage.getMCPServerList()
      serverList.value = data || { servers: [], activeServerIds: [] }
    } catch (e: any) {
      error.value = e?.message || '加载 MCP 服务器失败'
      console.error('Failed to load MCP servers:', e)
    } finally {
      loading.value = false
    }
  }

  // 保存 MCP 服务器列表
  async function saveServers() {
    loading.value = true
    error.value = null
    try {
      const success = await storage.saveMCPServerList(serverList.value)
      if (!success) {
        throw new Error('保存失败')
      }
    } catch (e: any) {
      error.value = e?.message || '保存 MCP 服务器失败'
      console.error('Failed to save MCP servers:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 添加服务器
  async function addServer(server: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>) {
    const newServer: MCPServer = {
      ...server,
      id: Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    serverList.value.servers.push(newServer)
    await saveServers()
    return newServer
  }

  // 更新服务器
  async function updateServer(id: string, updates: Partial<Omit<MCPServer, 'id' | 'createdAt'>>) {
    const index = serverList.value.servers.findIndex(s => s.id === id)
    if (index === -1) {
      throw new Error('服务器不存在')
    }
    const { id: _, createdAt: __, ...safeUpdates } = updates as any
    serverList.value.servers[index] = {
      ...serverList.value.servers[index],
      ...safeUpdates,
      updatedAt: Date.now()
    }
    await saveServers()
  }

  // 删除服务器
  async function deleteServer(id: string) {
    const index = serverList.value.servers.findIndex(s => s.id === id)
    if (index === -1) {
      throw new Error('服务器不存在')
    }
    serverList.value.servers.splice(index, 1)
    // 从激活列表中移除
    serverList.value.activeServerIds = serverList.value.activeServerIds.filter(sid => sid !== id)
    await saveServers()
  }

  // 切换服务器激活状态
  async function toggleServerActive(id: string) {
    const index = serverList.value.activeServerIds.indexOf(id)
    if (index === -1) {
      serverList.value.activeServerIds.push(id)
    } else {
      serverList.value.activeServerIds.splice(index, 1)
    }
    await saveServers()
  }

  // 切换服务器启用状态
  async function toggleServerEnabled(id: string) {
    const server = serverList.value.servers.find(s => s.id === id)
    if (server) {
      server.enabled = !server.enabled
      // 如果禁用服务器，同时从激活列表中移除
      if (!server.enabled) {
        serverList.value.activeServerIds = serverList.value.activeServerIds.filter(sid => sid !== id)
      }
      await saveServers()
    }
  }

  // 获取激活的服务器
  const activeServers = computed(() => {
    return serverList.value.servers.filter(s =>
      serverList.value.activeServerIds.includes(s.id) && s.enabled
    )
  })

  /**
   * 生成 OpenAI 格式的 tools 数组
   * 用于在 LLM 请求中传递可用的工具
   */
  function generateOpenAITools(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = []

    //console.log('[MCP] Active servers:', activeServers.value)
    //console.log('[MCP] Active servers tools:', activeServers.value.map(s => ({ name: s.name, tools: s.tools })))

    for (const server of activeServers.value) {
      if (server.tools && server.tools.length > 0) {
        //console.log(`[MCP] Server ${server.name} has ${server.tools.length} tools`)
        tools.push(...server.tools)
      } else {
        //console.log(`[MCP] Server ${server.name} has no tools configured`)
      }
    }

    //console.log('[MCP] Total tools to send:', tools.length)
    return tools
  }

  /**
   * 解析 LLM 响应中的 tool_calls
   */
  function parseToolCalls(assistantMessage: any): OpenAIToolCall[] {
    // OpenAI 格式: choices[0].message.tool_calls
    const openaiToolCalls = assistantMessage?.tool_calls
    if (openaiToolCalls && Array.isArray(openaiToolCalls)) {
      return openaiToolCalls
    }

    // 某些兼容 API 可能使用其他格式
    // 这里可以根据需要扩展

    return []
  }

  /**
   * 生成工具结果消息（role: "tool"）
   */
  function createToolResultMessage(toolCall: OpenAIToolCall, result: string, isError = false): MCPChatMessage {
    return {
      role: 'tool',
      content: isError ? `Error: ${result}` : result,
      tool_call_id: toolCall.id
    }
  }

  /**
   * 执行 MCP 工具调用
   * @param toolCall 工具调用对象
   * @returns 工具执行结果
   */
  async function executeToolCall(toolCall: OpenAIToolCall): Promise<MCPToolResult> {
    try {
      // 查找工具所属的服务器
      let targetServer: MCPServer | null = null
      for (const server of activeServers.value) {
        if (server.tools && server.tools.some(t => t.function.name === toolCall.function.name)) {
          targetServer = server
          break
        }
      }

      if (!targetServer) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: `未找到工具 "${toolCall.function.name}" 对应的服务器`
        }
      }

      // 解析参数
      let args: Record<string, any> = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch (e) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: `工具参数解析失败: ${e}`
        }
      }

      // 实际执行工具调用
      // 这里需要与 Electron 主进程通信来执行实际的 MCP 工具调用
      console.log('[MCP] Executing tool:', {
        server: targetServer.name,
        tool: toolCall.function.name,
        arguments: args
      })

      // 临时返回模拟结果
      return {
        toolCallId: toolCall.id,
        content: `工具 "${toolCall.function.name}" 执行成功（模拟结果）\n参数: ${JSON.stringify(args, null, 2)}\n\n注意：实际 MCP 工具调用功能需要在 Electron 主进程中实现 IPC 通信。`
      }

    } catch (e: any) {
      return {
        toolCallId: toolCall.id,
        content: '',
        error: e?.message || '工具调用失败'
      }
    }
  }

  /**
   * 批量执行工具调用
   * @param toolCalls 工具调用数组
   * @returns 所有工具的执行结果消息
   */
  async function executeToolCalls(toolCalls: OpenAIToolCall[]): Promise<MCPChatMessage[]> {
    const results: MCPChatMessage[] = []

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall)
      if (result.error) {
        results.push(createToolResultMessage(toolCall, result.error, true))
      } else {
        results.push(createToolResultMessage(toolCall, result.content))
      }
    }

    return results
  }

  /**
   * 检查是否有激活的 MCP 工具
   */
  const hasActiveTools = computed(() => {
    return generateOpenAITools().length > 0
  })

  return {
    serverList,
    loading,
    error,
    activeServers,
    hasActiveTools,
    loadServers,
    saveServers,
    addServer,
    updateServer,
    deleteServer,
    toggleServerActive,
    toggleServerEnabled,
    // Function Calling 相关
    generateOpenAITools,
    parseToolCalls,
    executeToolCall,
    executeToolCalls,
    createToolResultMessage
  }
}
