/**
 * 连接器管理 Composable
 * 提供连接器的统一管理和操作接口
 */
import { ref, computed } from 'vue'
import { storage } from '@/services/StorageService'
import { YuqueConnection } from '@/connections/YuqueConnection'
import type {
  ConnectionConfig,
  ConnectionRegistry,
  ConnectionType,
  ConnectionStatus,
  YuqueUser,
  YuqueRepo,
  YuqueDoc,
  YuqueDocDetail,
  YuqueDocCreateRequest,
  YuqueDocUpdateRequest,
} from '@/types/connection'

// 存储键
const STORAGE_KEY = 'connection-registry'

// 连接器实例映射
type ConnectionInstance = YuqueConnection // 后续可扩展为联合类型

function createConnectionsManager() {
  // 状态
  const registry = ref<ConnectionRegistry>({
    connections: [],
    activeConnectionIds: [],
    version: 1,
    lastUpdated: Date.now(),
  })

  const instances = new Map<string, ConnectionInstance>()
  const statuses = new Map<string, ConnectionStatus>()
  const loading = ref(false)
  const initialized = ref(false)

  /**
   * 根据类型创建连接器实例
   */
  function createInstance(type: ConnectionType): ConnectionInstance {
    switch (type) {
      case 'yuque':
        return new YuqueConnection()
      // 后续添加其他连接器
      // case 'feishu':
      //   return new FeishuConnection()
      default:
        throw new Error(`Unknown connection type: ${type}`)
    }
  }

  /**
   * 初始化 - 从存储加载配置
   */
  async function initialize() {
    if (initialized.value) return

    loading.value = true
    try {
      const result = await storage.get<ConnectionRegistry>(STORAGE_KEY)
      if (result.data) {
        registry.value = result.data
      }

      // 初始化已启用的连接器实例
      for (const config of registry.value.connections) {
        if (config.enabled) {
          await initConnection(config)
        }
      }

      initialized.value = true
    } catch (error) {
      console.error('Failed to initialize connections:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 初始化单个连接器
   */
  async function initConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      const instance = createInstance(config.type)
      const result = await instance.initialize(config.config)

      if (result.success) {
        instances.set(config.id, instance)
        statuses.set(config.id, instance.status)
        updateWindowStatus()
        return true
      } else {
        statuses.set(config.id, {
          connected: false,
          error: result.error,
        })
        updateWindowStatus()
        return false
      }
    } catch (error) {
      statuses.set(config.id, {
        connected: false,
        error: error instanceof Error ? error.message : '初始化失败',
      })
      updateWindowStatus()
      return false
    }
  }

  /**
   * 更新 window 对象中的连接状态
   * 供 useMCP.ts 中的 hasActiveYuqueConnection 函数使用
   */
  function updateWindowStatus() {
    // 检查是否有已连接的语雀实例
    let hasConnectedYuque = false
    let yuqueInstance: YuqueConnection | undefined

    for (const config of registry.value.connections) {
      if (config.type === 'yuque' && config.enabled) {
        const status = statuses.get(config.id)
        if (status?.connected) {
          hasConnectedYuque = true
          yuqueInstance = instances.get(config.id) as YuqueConnection | undefined
          break
        }
      }
    }

    // 更新 window 对象
    ;(window as any).__YUQUE_CONNECTED__ = hasConnectedYuque
    ;(window as any).__YUQUE_CONNECTION_INSTANCE__ = yuqueInstance
  }

  /**
   * 保存注册表到存储
   */
  async function saveRegistry() {
    registry.value.lastUpdated = Date.now()
    await storage.set(STORAGE_KEY, registry.value)
  }

  /**
   * 添加连接
   */
  async function addConnection(
    type: ConnectionType,
    name: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    const id = `${type}-${Date.now()}`

    const connectionConfig: ConnectionConfig = {
      id,
      type,
      name,
      enabled: true,
      config,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // 先验证连接
    const instance = createInstance(type)
    const result = await instance.initialize(config)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // 保存配置
    registry.value.connections.push(connectionConfig)
    instances.set(id, instance)
    statuses.set(id, instance.status)

    await saveRegistry()

    return { success: true, id }
  }

  /**
   * 更新连接配置
   */
  async function updateConnection(
    id: string,
    updates: Partial<Pick<ConnectionConfig, 'name' | 'config' | 'enabled'>>
  ): Promise<{ success: boolean; error?: string }> {
    const index = registry.value.connections.findIndex((c) => c.id === id)
    if (index === -1) {
      return { success: false, error: '连接不存在' }
    }

    const connection = registry.value.connections[index]!

    // 更新配置
    if (updates.name !== undefined) {
      connection.name = updates.name
    }
    if (updates.config !== undefined) {
      connection.config = updates.config
    }
    if (updates.enabled !== undefined) {
      connection.enabled = updates.enabled
    }
    connection.updatedAt = Date.now()

    // 如果配置或启用状态改变，重新初始化
    if (updates.config !== undefined || updates.enabled !== undefined) {
      // 销毁旧实例
      const oldInstance = instances.get(id)
      if (oldInstance) {
        oldInstance.destroy?.()
        instances.delete(id)
      }

      // 如果启用，重新初始化
      if (connection.enabled) {
        await initConnection(connection)
      } else {
        statuses.delete(id)
        updateWindowStatus()
      }
    }

    await saveRegistry()
    return { success: true }
  }

  /**
   * 删除连接
   */
  async function deleteConnection(id: string): Promise<boolean> {
    const index = registry.value.connections.findIndex((c) => c.id === id)
    if (index === -1) return false

    // 销毁实例
    const instance = instances.get(id)
    if (instance) {
      instance.destroy?.()
      instances.delete(id)
    }
    statuses.delete(id)

    // 从注册表移除
    registry.value.connections.splice(index, 1)
    registry.value.activeConnectionIds = registry.value.activeConnectionIds.filter(
      (aid) => aid !== id
    )

    await saveRegistry()
    updateWindowStatus()
    return true
  }

  /**
   * 刷新连接状态
   */
  async function refreshStatus(id: string): Promise<ConnectionStatus> {
    const instance = instances.get(id)
    if (!instance) {
      return { connected: false, error: '连接器未初始化' }
    }

    const status = await instance.checkConnection()
    statuses.set(id, status)
    return status
  }

  /**
   * 获取连接状态
   */
  function getStatus(id: string): ConnectionStatus {
    return statuses.get(id) || { connected: false }
  }

  /**
   * 获取连接器实例
   */
  function getInstance(id: string): ConnectionInstance | undefined {
    return instances.get(id)
  }

  /**
   * 获取指定类型的所有连接
   */
  function getConnectionsByType(type: ConnectionType): ConnectionConfig[] {
    return registry.value.connections.filter((c) => c.type === type)
  }

  /**
   * 获取已连接的语雀实例
   */
  function getYuqueInstance(connectionId?: string): YuqueConnection | undefined {
    if (connectionId) {
      return instances.get(connectionId) as YuqueConnection | undefined
    }

    // 如果没有指定 ID，返回第一个已连接的语雀实例
    for (const config of registry.value.connections) {
      if (config.type === 'yuque' && config.enabled) {
        const status = statuses.get(config.id)
        if (status?.connected) {
          return instances.get(config.id) as YuqueConnection
        }
      }
    }

    return undefined
  }

  // ==================== 语雀操作方法 ====================

  /**
   * 获取语雀用户信息
   */
  async function getYuqueUser(connectionId?: string): Promise<{ success: boolean; data?: YuqueUser; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.getUser()
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 获取语雀知识库列表
   */
  async function listYuqueRepos(connectionId?: string): Promise<{ success: boolean; data?: YuqueRepo[]; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.listRepos()
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 获取语雀文档列表
   */
  async function listYuqueDocs(
    repoNamespace: string,
    connectionId?: string
  ): Promise<{ success: boolean; data?: YuqueDoc[]; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.listDocs(repoNamespace)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 获取语雀文档详情
   */
  async function getYuqueDoc(
    repoNamespace: string,
    docSlug: string,
    connectionId?: string
  ): Promise<{ success: boolean; data?: YuqueDocDetail; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.getDoc(repoNamespace, docSlug)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 创建语雀文档
   */
  async function createYuqueDoc(
    repoNamespace: string,
    data: YuqueDocCreateRequest,
    connectionId?: string
  ): Promise<{ success: boolean; data?: YuqueDoc; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.createDoc(repoNamespace, data)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 更新语雀文档
   */
  async function updateYuqueDoc(
    repoNamespace: string,
    docSlug: string,
    data: YuqueDocUpdateRequest,
    connectionId?: string
  ): Promise<{ success: boolean; data?: YuqueDoc; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.updateDoc(repoNamespace, docSlug, data)
    return {
      success: result.success,
      data: result.data,
      error: result.error,
    }
  }

  /**
   * 删除语雀文档
   */
  async function deleteYuqueDoc(
    repoNamespace: string,
    docSlug: string,
    connectionId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const instance = getYuqueInstance(connectionId)
    if (!instance) {
      return { success: false, error: '没有可用的语雀连接' }
    }

    const result = await instance.deleteDoc(repoNamespace, docSlug)
    return {
      success: result.success,
      error: result.error,
    }
  }

  // 计算属性
  const connections = computed(() => registry.value.connections)
  const activeConnections = computed(() =>
    registry.value.connections.filter((c) => c.enabled && registry.value.activeConnectionIds.includes(c.id))
  )

  return {
    // 状态
    registry,
    connections,
    activeConnections,
    loading,
    initialized,

    // 管理方法
    initialize,
    addConnection,
    updateConnection,
    deleteConnection,
    refreshStatus,
    getStatus,
    getInstance,
    getConnectionsByType,
    getYuqueInstance,

    // 语雀操作
    getYuqueUser,
    listYuqueRepos,
    listYuqueDocs,
    getYuqueDoc,
    createYuqueDoc,
    updateYuqueDoc,
    deleteYuqueDoc,
  }
}

// 单例
let managerInstance: ReturnType<typeof createConnectionsManager> | null = null

export function useConnections() {
  if (!managerInstance) {
    managerInstance = createConnectionsManager()
  }
  return managerInstance
}
