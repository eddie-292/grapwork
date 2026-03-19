# 连接模块开发文档

## 概述

连接模块是一个可扩展的第三方服务集成框架，支持语雀、GitHub 等平台的连接和操作。该模块采用插件化设计，便于后续扩展新的连接类型。

## 支持的连接类型

| 连接类型 | 状态 | 功能 |
|---------|------|------|
| 语雀 (Yuque) | 已支持 | 知识库文档读写 |
| 飞书 (Feishu) | 已支持 | OAuth 授权认证 |
| GitHub | 已支持 | 仓库、Issue、PR、文件操作 |
| Notion | 计划中 | 笔记和文档操作 |

## 架构设计

```
src/
├── types/
│   └── connection.ts          # 连接器类型定义
├── connections/
│   ├── index.ts              # 模块入口
│   ├── BaseConnection.ts     # 基础连接器抽象类
│   ├── YuqueConnection.ts    # 语雀连接器实现
│   ├── FeishuConnection.ts   # 飞书连接器实现
│   └── GitHubConnection.ts   # GitHub 连接器实现
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
  GITHUB: 'github',
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

### 4. 飞书连接器 (`connections/FeishuConnection.ts`)

飞书连接器目前仅支持 OAuth 授权认证：

```typescript
export class FeishuConnection extends BaseConnection {
  // 用户操作
  getUser(userId?: string): Promise<ConnectionResult<FeishuUser>>

  // OAuth 授权相关
  startOAuthFlow(connectionId: string): Promise<ConnectionResult<void>>
  exchangeOAuthCode(code: string): Promise<ConnectionResult<FeishuOAuthToken>>
  refreshUserToken(): Promise<ConnectionResult<string>>
  needsUserAuthorization(): boolean
  getAuthorizationStatus(): FeishuAuthStatus
  setAuthMode(mode: 'tenant' | 'user'): void
  getConfig(): FeishuConfig
}
```

### 5. GitHub 连接器 (`connections/GitHubConnection.ts`)

GitHub 连接器实现了完整的仓库、Issue、Pull Request 和文件操作：

```typescript
export class GitHubConnection extends BaseConnection {
  // 用户操作
  getUser(): Promise<ConnectionResult<GitHubUser>>

  // 仓库操作
  listRepos(options?): Promise<ConnectionResult<GitHubRepo[]>>
  getRepo(owner: string, repo: string): Promise<ConnectionResult<GitHubRepo>>
  searchRepos(query: string, options?): Promise<ConnectionResult<{ total_count: number; items: GitHubRepo[] }>>

  // Issue 操作
  listIssues(owner: string, repo: string, options?): Promise<ConnectionResult<GitHubIssue[]>>
  getIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>>
  createIssue(owner: string, repo: string, data: GitHubIssueCreateRequest): Promise<ConnectionResult<GitHubIssue>>
  updateIssue(owner: string, repo: string, issueNumber: number, data: GitHubIssueUpdateRequest): Promise<ConnectionResult<GitHubIssue>>
  closeIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>>
  reopenIssue(owner: string, repo: string, issueNumber: number): Promise<ConnectionResult<GitHubIssue>>
  searchIssues(query: string, options?): Promise<ConnectionResult<{ total_count: number; items: GitHubIssue[] }>>

  // Pull Request 操作
  listPullRequests(owner: string, repo: string, options?): Promise<ConnectionResult<GitHubPullRequest[]>>
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<ConnectionResult<GitHubPullRequest>>
  createPullRequest(owner: string, repo: string, data: GitHubPRCreateRequest): Promise<ConnectionResult<GitHubPullRequest>>
  updatePullRequest(owner: string, repo: string, prNumber: number, data): Promise<ConnectionResult<GitHubPullRequest>>

  // 文件操作
  getContent(owner: string, repo: string, path: string, ref?: string): Promise<ConnectionResult<GitHubFileContent | GitHubFileContent[]>>
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<ConnectionResult<{ content: string; sha: string; path: string }>>
  createOrUpdateFile(owner: string, repo: string, path: string, data: GitHubFileCommitRequest): Promise<ConnectionResult<{ content: GitHubFileContent | null; commit: { sha: string } }>>
  deleteFile(owner: string, repo: string, path: string, message: string, sha: string, branch?: string): Promise<ConnectionResult<{ commit: { sha: string } }>>

  // 分支操作
  listBranches(owner: string, repo: string, options?): Promise<ConnectionResult<Array<{ name: string; commit: { sha: string }; protected: boolean }>>>
  getBranch(owner: string, repo: string, branch: string): Promise<ConnectionResult<{ name: string; commit: { sha: string }; protected: boolean }>>
}
```

### 6. 连接管理 (`composables/useConnections.ts`)

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

    // 飞书操作方法
    getFeishuInstance(),
    listFeishuSpaces(),
    listFeishuNodes(),
    getFeishuDoc(),
    createFeishuDoc(),
    updateFeishuDoc(),
    deleteFeishuDoc(),
    createFeishuWikiNode(),

    // GitHub 操作方法
    getGitHubInstance(),
    getGitHubUser(),
    listGitHubRepos(),
    getGitHubRepo(),
    listGitHubIssues(),
    getGitHubIssue(),
    createGitHubIssue(),
    updateGitHubIssue(),
    listGitHubPullRequests(),
    getGitHubPullRequest(),
    createGitHubPullRequest(),
    getGitHubFileContent(),
    createOrUpdateGitHubFile(),
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

连接模块与 MCP 系统无缝集成，当连接成功后，以下工具会自动出现在 AI 对话中：

### 语雀工具

| 工具名称 | 功能描述 |
|---------|---------|
| `yuque_list_repos` | 获取语雀知识库列表 |
| `yuque_list_docs` | 获取知识库中的文档列表 |
| `yuque_get_doc` | 获取文档详细内容 |
| `yuque_create_doc` | 创建新文档 |
| `yuque_update_doc` | 更新已有文档 |
| `yuque_delete_doc` | 删除文档 |

> **注意**：飞书目前仅支持 OAuth 授权认证，暂不支持文档操作工具。

### GitHub 工具

| 工具名称 | 功能描述 |
|---------|---------|
| `github_list_repos` | 获取当前用户的仓库列表 |
| `github_get_repo` | 获取指定仓库信息 |
| `github_list_issues` | 获取仓库的 Issue 列表 |
| `github_get_issue` | 获取单个 Issue 详情 |
| `github_create_issue` | 创建新 Issue |
| `github_update_issue` | 更新已有 Issue |
| `github_list_prs` | 获取 Pull Request 列表 |
| `github_get_pr` | 获取单个 Pull Request 详情 |
| `github_create_pr` | 创建新 Pull Request |
| `github_get_file` | 获取仓库文件内容 |
| `github_create_or_update_file` | 创建或更新文件 |
| `github_search_repos` | 搜索仓库 |
| `github_search_issues` | 搜索 Issues |
| `github_list_branches` | 获取分支列表 |

### 工具注册流程

1. `useMCP.ts` 中的 `generateOpenAITools()` 检查连接状态标志（如 `window.__YUQUE_CONNECTED__`、`window.__GITHUB_CONNECTED__`）
2. 如果存在已连接的账号，动态添加对应工具到工具列表
3. AI 可以在对话中直接调用这些工具

### 工具执行流程

1. AI 调用工具（如 `yuque_list_repos` 或 `github_list_repos`）
2. `useMCP.ts` 的 `executeToolCall()` 检测到是内置连接工具
3. 调用对应的执行函数（`executeYuqueTool()` 或 `executeGitHubTool()`）
4. 通过 `window` 对象获取对应的连接实例
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

## 飞书 API 说明

- **基础 URL**: `https://open.feishu.cn/open-apis`
- **认证方式**: Bearer Token（tenant_access_token）
- **Token 获取**: 通过 App ID 和 App Secret 获取

### CORS 处理

飞书 API 不允许浏览器端直接调用（CORS 限制），因此所有 API 请求都通过 Electron 主进程代理。

实现方式：
1. 在 `electron/main.ts` 中注册 `connection-request` IPC 处理器
2. 连接器通过 `window.electronAPI.connectionRequest()` 发送请求
3. 主进程使用 Node.js fetch 发起实际请求，绕过 CORS

新增连接器时，如果目标 API 不支持 CORS，需要使用相同的模式：

```typescript
// 在连接器中使用主进程代理请求
private async proxyRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  headers?: Record<string, string>,
  body?: object
): Promise<{ status: number; data: string; error?: string }> {
  const result = await window.electronAPI.connectionRequest({
    url,
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: result.status, data: result.data || '', error: result.error }
}
```

### 获取应用凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 创建企业自建应用
3. 在应用凭证页面获取 App ID 和 App Secret
4. 配置应用权限（需要开通文档、知识空间相关权限）
5. **配置重定向 URL**（用于用户授权）：
   - 进入应用 → **安全设置** → **重定向 URL**
   - 添加：`http://localhost:59920/callback`
   - 保存配置

> **重要**：飞书不支持自定义协议（如 `myapp://`）作为重定向 URL，只支持 HTTP/HTTPS URL。应用使用固定端口 59920 启动本地 HTTP 服务器接收 OAuth 回调。

### 配置 OAuth 重定向 URL（用户授权模式必需）

如果需要使用用户授权模式（获取用户身份信息），需要在飞书开放平台配置重定向 URL：

1. 进入应用详情页
2. 点击左侧菜单 **安全设置**
3. 在 **重定向 URL** 区域添加：
   ```
   http://localhost:59920/callback
   ```
4. 保存配置

> **注意**：飞书不支持自定义协议（如 `myapp://`）作为重定向 URL，只支持 HTTP/HTTPS URL。应用使用固定端口 59920 启动本地 HTTP 服务器接收回调。

### 必需权限

飞书应用需要以下权限：

- `drive:drive:readonly` - 获取云空间文件夹
- `docs:doc:readonly` - 获取文档内容
- `docs:doc` - 创建和编辑文档
- `wiki:wiki:readonly` - 获取知识空间列表
- `wiki:wiki` - 在知识空间中创建节点

## GitHub API 说明

- **基础 URL**: `https://api.github.com`
- **认证方式**: Bearer Token（Personal Access Token）
- **API 版本**: `2022-11-28`

### 获取 Personal Access Token

1. 访问 [GitHub Token 设置页面](https://github.com/settings/tokens)
2. 点击 "Generate new token (classic)"
3. 选择需要的权限范围（Scopes）：
   - `repo` - 完整的仓库访问权限（推荐）
   - `read:org` - 读取组织信息
   - `write:discussion` - 写入讨论
4. 点击 "Generate token"
5. 复制 Token 到应用配置中

> **重要**：Token 只会显示一次，请妥善保存。如果忘记了 Token，需要重新生成。

### 推荐权限范围

| 权限范围 | 说明 |
|---------|------|
| `repo` | 完整的仓库访问权限，包括读写代码、Issue、PR 等 |
| `read:org` | 读取组织信息，用于访问组织下的仓库 |
| `workflow` | 更新 GitHub Actions 工作流（可选） |

### 企业版 GitHub

如果您使用的是 GitHub Enterprise Server，可以在配置中设置自定义的 Base URL：
```
https://github.yourcompany.com/api/v3
```

### 速率限制

GitHub API 有速率限制：
- 认证请求：每小时 5,000 次
- 未认证请求：每小时 60 次

使用 Personal Access Token 可以获得更高的速率限制。

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
const yuqueInstance = window.__YUQUE_CONNECTION_INSTANCE__
console.log(yuqueInstance?.status)

// 检查 GitHub 连接状态
console.log(window.__GITHUB_CONNECTED__)

// 获取 GitHub 连接实例
const githubInstance = window.__GITHUB_CONNECTION_INSTANCE__
console.log(githubInstance?.status)
```

## 常见问题

### Q: 为什么 AI 看不到语雀工具？

A: 确保已在设置中成功连接语雀服务，连接状态为"已连接"。检查 `window.__YUQUE_CONNECTED__` 是否为 `true`。

### Q: 语雀 Token 过期怎么办？

A: Token 过期后连接状态会变为"未连接"，需要重新配置 Token。

### Q: 飞书连接支持哪些功能？

A: 飞书连接器目前仅支持 OAuth 授权认证，可以验证 App ID 和 App Secret，获取用户信息。文档操作功能暂未实现。

### Q: GitHub Token 需要哪些权限？

A: 推荐使用 `repo` 权限范围，这样可以完整访问仓库、Issue、Pull Request 和文件操作。如果只需要读取公开仓库，可以使用 `public_repo` 权限。

### Q: GitHub 连接失败怎么办？

A: 请检查以下几点：
1. Token 是否正确复制（没有多余空格）
2. Token 是否已过期或被撤销
3. Token 是否有足够的权限
4. 如果是企业版 GitHub，Base URL 是否正确配置

### Q: 为什么 AI 看不到 GitHub 工具？

A: 确保已在设置中成功连接 GitHub，连接状态为"已连接"。检查 `window.__GITHUB_CONNECTED__` 是否为 `true`。

### Q: 支持多少个同类型连接？

A: 支持添加多个相同类型的连接，但 AI 调用工具时会使用第一个成功连接的实例。
