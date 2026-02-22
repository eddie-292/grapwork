# PrismChat 前端

一个功能丰富的跨平台桌面聊天应用前端，支持与任何 OpenAI 兼容的 LLM API 进行对话。

## 系统概述

PrismChat 是基于 Electron + Vue 3 构建的桌面聊天应用，提供了简洁而强大的界面用于与各种大语言模型进行交互。用户可以通过设置界面配置自定义的 API 端点、API 密钥和模型名称。

### 核心功能

#### 1. 多模式对话
- **普通对话模式** - 传统的流式聊天体验，实时显示 AI 响应
- **任务模式** - 将复杂请求分解为多个子任务，逐个执行并最终整合结果
  - 自动任务规划和分解
  - 实时任务进度追踪
  - 任务结果自动总结和传递
  - 最终答案智能整合

#### 2. 社区助理系统
- 创建自定义 AI 助手，配置专属角色
- 支持 Emoji 头像选择
- 独立的 system prompt 配置
- 助手编辑和删除管理
- 会话级助理切换

#### 3. 推理过程展示
- 可展开/折叠的 AI 思考内容
- 推理时长实时显示
- 完成后自动折叠以保持界面整洁

#### 4. Markdown 渲染
- 完整 Markdown 解析支持
- 代码语法高亮（基于 highlight.js）
- 自定义代码高亮主题
- 一键复制代码块
- 表格渲染支持

#### 5. 对话管理
- 多会话支持，侧边栏管理
- 任务模式与普通会话分组
- 会话标题自动生成
- 会话删除功能
- 会话历史本地持久化

#### 6. 配置管理
- 支持多个 LLM API 配置
- 每个配置可设置：
  - 名称
  - API 地址
  - API 密钥
  - 模型名称
  - 额外请求参数（JSON 格式）
- 会话级配置切换

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Vue 3** - 渐进式 JavaScript 框架（Composition API + `<script setup>`）
- **TypeScript** - 类型安全的 JavaScript
- **Vue Router** - 客户端路由
- **Vite** - 下一代前端构建工具
- **Markdown-it** - Markdown 解析器
- **Highlight.js** - 代码语法高亮
- **ESBuild** - Electron 打包工具

## 项目结构

```
frontend/
├── electron/              # Electron 相关
│   ├── main.ts           # 主进程 - 窗口管理、IPC、配置持久化
│   └── preload.ts        # 预加载脚本 - 安全 IPC 桥接
├── public/               # 静态资源
│   └── *.css             # 代码高亮主题样式
├── src/
│   ├── components/       # Vue 组件
│   │   ├── App.vue          # 根组件
│   │   ├── ChatView.vue     # 主聊天界面
│   │   ├── SettingsView.vue # 设置页面
│   │   ├── AssistantView.vue # 助理管理页面
│   │   ├── TaskModePanel.vue # 任务进度面板
│   │   ├── LoginView.vue     # 登录页面
│   │   └── ConfirmDialog.vue # 确认对话框
│   ├── types/           # TypeScript 类型定义
│   │   ├── electron.d.ts  # Electron API 类型
│   │   └── task.d.ts      # 任务模式类型
│   ├── main.ts          # 应用入口
│   └── router.ts        # 路由配置
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动 Electron 开发模式（主模式）
npm run electron:dev

# 仅启动 Web 开发服务器
npm run dev:renderer

# 构建渲染进程
npm run build:renderer

# 构建 Electron 主进程
npm run build:electron

# 构建桌面应用（生产版本）
-- 使用国内镜像源（推荐，尤其在中国大陆）
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run electron:build
```

## 组件说明

### ChatView.vue
主聊天界面组件，负责：
- 消息发送和流式响应处理
- 任务模式执行逻辑
- 对话历史管理
- Markdown 渲染
- 推理内容展示
- 任务进度面板集成

### SettingsView.vue
设置页面组件，负责：
- API 配置的增删改查
- 配置激活/切换
- 配置表单验证

### AssistantView.vue
助理管理页面，负责：
- 助理列表展示
- 助理创建和编辑
- Emoji 头像选择
- System prompt 配置

### TaskModePanel.vue
任务进度面板组件，负责：
- 任务列表展示
- 任务状态可视化
- 当前任务高亮
- 执行进度显示

## 数据流

### 普通对话流程
1. 用户在 ChatView 输入消息
2. 消息添加到当前会话的 messages 数组
3. 加载配置（Electron IPC 或 localStorage）
4. 发送请求到 LLM API
5. SSE 流式响应实时追加到助手消息
6. UI 响应式更新
7. 自动滚动到最新消息

### 任务模式流程
1. 用户启用任务模式并输入请求
2. **任务规划阶段**：LLM 将请求分解为 JSON 格式的任务列表
3. **任务执行阶段**：
   - 逐个执行任务
   - 每个任务的输出传递给下一个任务
   - 实时更新任务面板
4. **整合阶段**：将所有任务输出整合成最终答案
5. 完成并显示最终结果

## 环境变量

开发环境支持通过 Vite 配置代理（仅浏览器模式）：

```javascript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:8787'
  }
}
```

Electron 模式直接调用用户配置的 API 地址，无需代理。

## 配置存储

- **Electron 模式**：配置存储在 `{userData}/config.json`（通过 Electron IPC）
- **Web 模式**：配置存储在浏览器的 `localStorage`

配置包括：
- API 地址
- API 密钥
- 模型名称
- 额外请求参数（可选）

## 支持的 LLM API

任何符合 OpenAI Chat Completions API 格式的服务：

- OpenAI (GPT-4, GPT-4o, GPT-3.5 等)
- Azure OpenAI
- Anthropic Claude（通过兼容层）
- 本地模型（LM Studio, Ollama, vLLM 等）
- 其他 OpenAI 兼容的 API 网关

### API 格式要求

**请求**:
```
POST {apiUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "model-name",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

**响应**: Server-Sent Events 格式，包含 `choices[0].delta.content` 和可选的 `choices[0].delta.reasoning_content`

## 安全特性

- Context Isolation: Electron 使用 `contextIsolation: true` 分离主进程和渲染进程
- Preload Script: 仅通过 `contextBridge` 暴露特定 IPC 方法
- Markdown 渲染禁用 HTML 以防止 XSS
- API 密钥仅本地存储，仅直接发送到用户配置的 LLM API
- 无中间代理，保证用户数据隐私