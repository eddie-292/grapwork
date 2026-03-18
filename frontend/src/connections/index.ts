/**
 * 连接器模块入口
 * 导出所有连接器和相关类型
 */

// 基类
export { BaseConnection } from './BaseConnection'

// 连接器实现
export { YuqueConnection } from './YuqueConnection'

// 类型导出
export type {
  ConnectionType as ConnectionTypeValue,
  ConnectionConfig,
  YuqueConfig,
  FeishuConfig,
  ConnectionRegistry,
  YuqueUser,
  YuqueRepo,
  YuqueDoc,
  YuqueDocDetail,
  YuqueDocCreateRequest,
  YuqueDocUpdateRequest,
  ConnectionResult,
  ConnectionStatus,
  IConnection,
  IDocumentOperations,
} from '@/types/connection'

export { ConnectionType } from '@/types/connection'
