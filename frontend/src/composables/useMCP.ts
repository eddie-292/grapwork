/**
 * MCP (Model Context Protocol) 管理组件
 * 用于管理 MCP 服务器配置、与 LLM Function Calling 集成
 */
import { ref, computed, toRaw } from 'vue'
import { storage } from '@/services/StorageService'
import type {
  MCPServer,
  MCPServerList,
  MCPToolDefinition,
  OpenAIToolCall,
  MCPToolResult,
  MCPChatMessage,
} from '@/types/mcp'

// 检查是否在 Electron 环境中
const isElectronEnv =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

// 使用 MCP 的 composable
export function useMCP() {
  const serverList = ref<MCPServerList>({
    servers: [],
    activeServerIds: []
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 内置文件操作工具的工作目录
  const selectedFolder = ref<string>('')

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

    // 添加内置文件操作工具（如果选择了文件夹）
    if (selectedFolder.value) {
      tools.push(...getBuiltinFileTools(selectedFolder.value))
    }

    //console.log('[MCP] Total tools to send:', tools.length)
    return tools
  }

  /**
   * 获取内置文件操作工具列表
   */
  function getBuiltinFileTools(workDir: string): MCPToolDefinition[] {
    // 工作目录说明，添加到每个工具描述中
    const workDirContext = `当前工作目录: ${workDir}。所有文件操作都在此目录范围内进行。`
    return [
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: `${workDirContext} 列出指定目录中的文件和子目录。在执行其他文件操作前，建议先使用此工具了解目录结构。可以递归查看子目录内容。`,
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '要列出的目录路径（相对于工作目录）。示例："." 查看当前目录，"src" 查看 src 子目录，"docs/api" 查看嵌套子目录。'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_directory',
          description: '在指定路径创建新文件夹。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '父目录路径（相对于工作目录），默认为当前目录"."'
              },
              name: {
                type: 'string',
                description: '要创建的文件夹名称'
              }
            },
            required: ['name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'move_file',
          description: '移动文件或文件夹到新位置。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '源文件或文件夹路径（相对于工作目录）'
              },
              newPath: {
                type: 'string',
                description: '目标路径（相对于工作目录）'
              }
            },
            required: ['path', 'newPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'copy_file',
          description: '复制文件或文件夹到新位置。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '源文件或文件夹路径（相对于工作目录）'
              },
              newPath: {
                type: 'string',
                description: '目标路径（相对于工作目录）'
              }
            },
            required: ['path', 'newPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'rename_item',
          description: '重命名文件或文件夹（保持在同一目录下）。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '要重命名的文件或文件夹路径（相对于工作目录）'
              },
              name: {
                type: 'string',
                description: '新名称'
              }
            },
            required: ['path', 'name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'glob',
          description: `${workDirContext} 快速进行文件模式匹配（支持 glob 通配符）。用于查找特定文件或列出目录内容。例如：pattern="*.html" 查找所有 HTML 文件。`,
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '匹配文件的模式（如 *.js, **/*.html, src/**/*.ts）'
              },
              path: {
                type: 'string',
                description: '搜索的根目录路径（相对于工作目录），默认为当前目录"."。例如："src", "docs", "."'
              }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'grep',
          description: `${workDirContext} 在文件内容中搜索指定正则表达式。使用前建议先用 list_directory 查看目录结构。如果不知道目标文件位置，可以搜索整个工作目录（path="."）并使用 include 参数限制文件类型。`,
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '要搜索的正则表达式'
              },
              path: {
                type: 'string',
                description: '搜索的目录路径（相对于工作目录）。例如："src", ".", "docs"。如果不指定则搜索整个工作目录。'
              },
              include: {
                type: 'string',
                description: '包含的文件类型模式（如 .js, .{ts,tsx}），用于过滤要搜索的文件类型'
              }
            },
            required: ['pattern']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '从本地文件系统读取文件内容。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '要读取的文件路径'
              },
              limit: {
                type: 'number',
                description: '限制读取的行数（默认为 2000）'
              },
              offset: {
                type: 'number',
                description: '从第几行开始读取（从 1 开始）'
              }
            },
            required: ['file_path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: '将内容写入本地文件系统。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '目标文件路径'
              },
              content: {
                type: 'string',
                description: '要写入的文本内容'
              }
            },
            required: ['file_path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: '在文件中执行精确的字符串替换。',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: '要修改的文件路径'
              },
              old_string: {
                type: 'string',
                description: '要被替换的原始文本'
              },
              new_string: {
                type: 'string',
                description: '替换后的新文本'
              },
              replace_all: {
                type: 'boolean',
                description: '是否替换所有匹配项（默认为 false）'
              }
            },
            required: ['file_path', 'old_string', 'new_string']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: `${workDirContext} 执行系统命令。支持安全的命令白名单：date, ls, la, ll, dir, pwd, echo, cat, head, tail, wc, grep, whoami, hostname, uname, cal, uptime, df, du, ps, env。禁止使用管道、重定向和命令链。`,
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令（如 "ls -la", "pwd", "echo hello"）。必须是白名单中的安全命令。'
              },
              timeout: {
                type: 'number',
                description: '命令超时时间（毫秒），默认 30000'
              }
            },
            required: ['command']
          }
        }
      }
      // 为了安全，删除展示不启用
      // {
      //   type: 'function',
      //   function: {
      //     name: 'delete_item',
      //     description: '删除文件或文件夹。注意：删除文件夹将递归删除其所有内容。',
      //     parameters: {
      //       type: 'object',
      //       properties: {
      //         path: {
      //           type: 'string',
      //           description: '要删除的文件或文件夹路径（相对于工作目录）'
      //         }
      //       },
      //       required: ['path']
      //     }
      //   }
      // }
    ]
  }

  /**
   * 检查工具是否为内置文件操作工具
   */
  function isBuiltinFileTool(toolName: string): boolean {
    const builtinTools = [
      'list_directory',
      'create_directory',
      'move_file',
      'copy_file',
      'rename_item',
      'glob',
      'grep',
      'read_file',
      'write_file',
      'edit_file',
      'delete_item',
      'execute_command'
    ]
    return builtinTools.includes(toolName)
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
      // 首先检查是否是内置文件操作工具
      if (isBuiltinFileTool(toolCall.function.name)) {
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

        // 添加工作目录路径
        args.basePath = selectedFolder.value

        console.log('[Builtin File Tool] Executing:', JSON.stringify({
          tool: toolCall.function.name,
          arguments: args
        }))

        // 调用 Electron 主进程的文件操作
        if (!isElectronEnv) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: '文件操作需要在 Electron 环境中运行'
          }
        }

        if (!window.electronAPI?.fileOperation) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: 'Electron API 不可用'
          }
        }

        const result = await window.electronAPI.fileOperation(
          toolCall.function.name,
          args
        )

        if (result.error) {
          return {
            toolCallId: toolCall.id,
            content: '',
            error: result.error
          }
        }

        return {
          toolCallId: toolCall.id,
          content: result.content || ''
        }
      }

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

      // 通过 Electron 主进程执行工具调用
      console.log('[MCP] Executing tool:', {
        server: targetServer.name,
        tool: toolCall.function.name,
        arguments: args
      })

      // 调用 Electron 主进程的 MCP 工具执行
      if (!isElectronEnv) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: 'MCP 工具调用需要在 Electron 环境中运行'
        }
      }

      if (!window.electronAPI?.mcpCallTool) {
        return {
          toolCallId: toolCall.id,
          content: '',
          error: 'Electron API 不可用，请确保在 Electron 应用中运行'
        }
      }

      // 使用 toRaw 确保传递的是纯对象，而不是 Vue 响应式代理
      const rawServer = toRaw(targetServer)
      const result = await window.electronAPI.mcpCallTool(
        {
          id: rawServer.id,
          name: rawServer.name,
          transportType: rawServer.transportType,
          simpleCommand: rawServer.simpleCommand,
          command: rawServer.command,
          args: rawServer.args,
          env: rawServer.env,
          url: rawServer.url
        },
        toolCall.function.name,
        args
      )

      if (result.isError || !result.success) {
        return {
          toolCallId: toolCall.id,
          content: result.content,
          error: result.error || '工具调用失败'
        }
      }

      return {
        toolCallId: toolCall.id,
        content: result.content
      }

    } catch (e: any) {
      console.log(e)
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
   * 从 MCP 服务器获取工具列表
   * @param server 服务器配置
   * @returns 工具列表
   */
  async function fetchServerTools(server: MCPServer): Promise<MCPToolDefinition[]> {
    if (!isElectronEnv || !window.electronAPI?.mcpListTools) {
      throw new Error('Electron 环境不可用')
    }

    try {
      // 使用 toRaw 移除响应式代理，避免序列化错误
      // 只传递必要的配置字段，不包含 tools 等可能包含不可序列化数据的字段
      const rawServer = toRaw(server)
      const serverConfig = {
        id: rawServer.id,
        name: rawServer.name,
        transportType: rawServer.transportType,
        simpleCommand: rawServer.simpleCommand,
        command: rawServer.command,
        args: rawServer.args ? [...rawServer.args] : [],
        env: rawServer.env ? { ...rawServer.env } : {},
        url: rawServer.url
      }
      const result = await window.electronAPI.mcpListTools(serverConfig)

      if (!result.success) {
        throw new Error(result.error || '获取工具列表失败')
      }

      // 转换为 OpenAI Function Calling 格式
      const tools: MCPToolDefinition[] = result.tools.map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }))

      return tools
    } catch (e: any) {
      throw new Error(`获取工具列表失败: ${e?.message || e}`)
    }
  }

  /**
   * 从服务器刷新工具并更新配置
   * @param serverId 服务器 ID
   */
  async function refreshServerTools(serverId: string) {
    const server = serverList.value.servers.find(s => s.id === serverId)
    if (!server) {
      throw new Error('服务器不存在')
    }

    loading.value = true
    error.value = null

    try {
      const tools = await fetchServerTools(server)
      // 更新服务器的工具列表
      await updateServer(serverId, { tools })
      return tools
    } catch (e: any) {
      error.value = e?.message || '刷新工具列表失败'
      throw e
    } finally {
      loading.value = false
    }
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
    selectedFolder,
    loadServers,
    saveServers,
    addServer,
    updateServer,
    deleteServer,
    toggleServerActive,
    toggleServerEnabled,
    // 工具获取相关
    fetchServerTools,
    refreshServerTools,
    // Function Calling 相关
    generateOpenAITools,
    parseToolCalls,
    executeToolCall,
    executeToolCalls,
    createToolResultMessage,
    // 文件工具相关
    setSelectedFolder: (folder: string) => {
      selectedFolder.value = folder
    },
    getSelectedFolder: () => selectedFolder.value,
    isBuiltinFileTool
  }
}
