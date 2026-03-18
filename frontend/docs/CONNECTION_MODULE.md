# 连接模块开发文档

## 概述

连接模块是一个可扩展的第三方服务集成框架，支持语雀、飞书等平台的连接和操作。该模块采用插件化设计，便于后续扩展新的连接类型。

## 架构设计

```
src/
├── types/
│   └── connection.ts          # 连接器类型定义
├── connections/
│   ├── index.ts              # 模块入口
│   ├── BaseConnection.ts     # 基础连接器抽象类
│   └── YuqueConnection.ts   # 语雀连接器实现
├── composables/
│   └── useConnections.ts     # 连接器管理 Composable
└── components/settings/
    └── ConnectionsPanel.vue  # 设置面板 UI
```

## 核心组件

### 1. 类型定义 (`types/connection.ts`)

```typescript
// 连接器类型
export const ConnectionType = {
  YUQUE: 'yuque',
  FEISHU: 'feishu',
  NOTION: 'notion',
} as const

// 连接器配置
export interface ConnectionConfig {
  id: string
  type: ConnectionType
  name: string
  enabled: boolean
  config: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// 连接器状态
export interface ConnectionStatus {
  connected: boolean
  lastChecked?: number
  error?: string
  user?: { name: string; avatar?: string }
}
```

### 2. 基础连接器 (`connections/BaseConnection.ts`)

所有连接器必须继承 `BaseConnection` 类：

```typescript
export abstract class BaseConnection implements IConnection {
  abstract readonly type: ConnectionType
  abstract readonly name: string

  abstract initialize(config: Record<string, unknown>): Promise<ConnectionResult>
  abstract checkConnection(): Promise<ConnectionStatus>

  // 通用请求方法
  protected async request<T>(url: string, options?: RequestInit): Promise<ConnectionResult<T>>
}
```

### 3. 语雀连接器 (`connections/YuqueConnection.ts`)

语雀连接器实现了完整的文档 CRUD 操作：

```typescript
export class YuqueConnection extends BaseConnection {
  // 用户操作
  getUser(): Promise<ConnectionResult<YuqueUser>>

  // 知识库操作
  listRepos(): Promise<ConnectionResult<YuqueRepo[]>>

  // 文档操作
  listDocs(repoNamespace: string): Promise<ConnectionResult<YuqueDoc[]>>
  getDoc(repoNamespace: string, docSlug: string): Promise<ConnectionResult<YuqueDocDetail>>
  createDoc(repoNamespace: string, data: YuqueDocCreateRequest): Promise<ConnectionResult<YuqueDoc>>
  updateDoc(repoNamespace: string, docSlug: string, data: YuqueDocUpdateRequest): Promise<ConnectionResult<YuqueDoc>>
  deleteDoc(repoNamespace: string, docSlug: string): Promise<ConnectionResult<void>>
}
```

### 4. 连接管理 (`composables/useConnections.ts`)

提供统一的连接器管理接口：

```typescript
export function useConnections() {
  return {
    // 状态
    registry, connections, loading, initialized,

    // 管理方法
    initialize(),
    addConnection(),
    updateConnection(),
    deleteConnection(),
    refreshStatus(),

    // 语雀操作方法
    listYuqueRepos(),
    listYuqueDocs(),
    getYuqueDoc(),
    createYuqueDoc(),
    updateYuqueDoc(),
    deleteYuqueDoc(),
  }
}
```

## 添加新连接器的步骤

以添加飞书连接器为例：

### 步骤 1： 添加类型定义

在 `types/connection.ts` 中添加：

```typescript
// 飞书配置
export interface FeishuConfig {
  appId: string
  appSecret: string
}

// 在 ConnectionType 中添加
export const ConnectionType = {
  // ...
  FEISHU: 'feishu',
}
```

### 步骤 2： 创建连接器类

创建 `connections/FeishuConnection.ts`:

```typescript
import { BaseConnection } from './BaseConnection'
import type { ConnectionType, ConnectionResult, ConnectionStatus, FeishuConfig } from '@/types/connection'

export class FeishuConnection extends BaseConnection {
  readonly type: ConnectionType = 'feishu'
  readonly name: string = '飞书'

  async initialize(config: Record<string, unknown>): Promise<ConnectionResult> {
    const feishuConfig = config as FeishuConfig
    // 实现初始化逻辑...
  }

  async checkConnection(): Promise<ConnectionStatus> {
    // 实现连接检查逻辑...
  }

  // 添加飞书特定的操作方法...
}
```

### 步骤 3： 注册连接器

在 `composables/useConnections.ts` 的 `createInstance` 函数中添加：

```typescript
import { FeishuConnection } from '@/connections/FeishuConnection'

function createInstance(type: ConnectionType): ConnectionInstance {
  switch (type) {
    case 'yuque':
      return new YuqueConnection()
    case 'feishu':
      return new FeishuConnection()
    default:
      throw new Error(`Unknown connection type: ${type}`)
  }
}
```

### 步骤 4： 更新 UI

在 `ConnectionsPanel.vue` 的 `connectionTypes` 数组中添加：

```typescript
const connectionTypes = [
  { value: 'yuque', label: '语雀', description: '...' },
  { value: 'feishu', label: '飞书', description: '...' },
]
```

## MCP 工具集成

连接模块与 MCP 系统无缝集成，当语雀连接成功后，以下工具会自动出现在 AI 对话中：

| 工具名称 | 功能描述 |
|---------|---------|
| `yuque_list_repos` | 获取语雀知识库列表 |
| `yuque_list_docs` | 获取知识库中的文档列表 |
| `yuque_get_doc` | 获取文档详细内容 |
| `yuque_create_doc` | 创建新文档 |
| `yuque_update_doc` | 更新已有文档 |
| `yuque_delete_doc` | 删除文档 |

### 工具注册流程

1. `useMCP.ts` 中的 `generateOpenAITools()` 检查 `window.__YUQUE_CONNECTED__` 标志
2. 如果存在已连接的语雀账号，动态添加语雀工具到工具列表
3. AI 可以在对话中直接调用这些工具

### 工具执行流程

1. AI 调用语雀工具（如 `yuque_list_repos`）
2. `useMCP.ts` 的 `executeToolCall()` 检测到是语雀工具
3. 调用 `executeYuqueTool()` 执行具体操作
4. 通过 `getYuqueConnectionInstance()` 获取语雀连接实例
5. 调用实例的相应方法并返回结果

## 存储设计

连接配置存储在 `StorageService` 中：

- **存储键**: `connection-registry`
- **存储位置**:
  - macOS: `~/Library/Application Support/mirrorgrap-work/`
  - Windows: `%APPDATA%/mirrorgrap-work/`

### 数据结构

```typescript
interface ConnectionRegistry {
  connections: ConnectionConfig[]
  activeConnectionIds: string[]
  version: number
  lastUpdated: number
}
```

## 语雀 API 说明

- **基础 URL**: `https://www.yuque.com/api/v2`
- **认证方式**: `X-Auth-Token` 请求头
- **必需请求头**:
  - `X-Auth-Token`: 用户 Token
  - `User-Agent`: 应用名称

### 获取 Token

1. 访问语雀个人设置 → Token
2. 创建新的 API Token
3. 复制 Token 到应用配置中

## 安全考虑

1. **Token 存储**: Token 存储在本地，不上传到云端（除非启用云同步）
2. **敏感操作确认**: 删除文档等危险操作需要用户确认
3. **错误处理**: 所有 API 调用都有完善的错误处理和用户友好的错误提示

## 最佳实践

1. **单例模式**: `useConnections` 使用单例模式，确保全局只有一个管理器实例
2. **状态同步**: 连接状态实时同步到 `window` 对象，供其他模块使用
3. **懒加载**: 连接器实例在首次使用时才创建
4. **错误恢复**: 连接失败后可以重试，状态会自动更新

## 调试技巧

在浏览器控制台中：

```javascript
// 检查语雀连接状态
console.log(window.__YUQUE_CONNECTED__)

// 获取语雀连接实例
const instance = window.__YUQUE_CONNECTION_INSTANCE__
console.log(instance?.status)
```

## 常见问题

### Q: 为什么 AI 看不到语雀工具？

A: 确保已在设置中成功连接语雀，连接状态为"已连接"。检查 `window.__YUQUE_CONNECTED__` 是否为 `true`。

### Q: 如何处理 Token 过期？

A: Token 过期后连接状态会变为"未连接"，需要重新配置 Token。

### Q: 支持多少个同类型连接？

A: 支持添加多个相同类型的连接，但 AI 调用工具时会使用第一个成功连接的实例。
