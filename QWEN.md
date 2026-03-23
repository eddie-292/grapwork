# GrapWork - Qwen Code 开发指南

本文档为 Qwen Code 提供项目上下文，帮助 AI 助手更好地理解和修改代码。

## 项目概述

**GrapWork** 是一款跨平台桌面 AI Agent 助手，支持任意兼容 OpenAI 格式的 LLM API。

### 核心技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 28 + Vue 3.5 |
| 语言 | TypeScript 5.9 |
| 构建 | Vite 7 + esbuild |
| 样式 | 原生 CSS（无框架） |
| Markdown | markdown-it + highlight.js + mermaid + KaTeX |
| 打包 | electron-builder |

### 主要功能模块

- **多标签对话** - 标签式会话管理，支持搜索
- **流式响应** - 实时流式输出，支持多种推理格式
- **全局记忆** - 持久化知识存储，智能关键词匹配
- **助理系统** - 自定义 AI 助理，个性化系统提示词
- **MCP 支持** - Model Context Protocol 集成（STDIO/SSE）
- **技能系统** - 领域知识包注入
- **图片生成** - 多提供商图片生成
- **工作区** - 内置文件浏览器
- **定时任务** - Loop 任务调度系统

---

## 项目结构

```
frontend/
├── electron/                    # Electron 主进程
│   ├── main.ts                 # 主进程入口、IPC 处理、MCP 客户端
│   ├── preload.ts              # 上下文桥接
│   ├── LoopScheduler.ts        # 定时任务调度器
│   └── LoopExecutor.ts         # 定时任务执行器
├── src/
│   ├── components/             # Vue 组件
│   │   ├── settings/           # 设置相关组件
│   │   └── icons/              # 图标组件
│   ├── composables/            # Vue Composables
│   │   ├── useConnections.ts   # 第三方连接管理
│   │   ├── useImageGenerator.ts # 图片生成
│   │   ├── useLoop.ts          # 定时任务
│   │   ├── useMCP.ts           # MCP 集成
│   │   └── useSkills.ts        # 技能系统
│   ├── services/               # 服务层
│   │   ├── StorageService.ts   # 本地存储
│   │   ├── SyncService.ts      # 云同步
│   │   ├── loop/               # 定时任务服务
│   │   └── storage/            # 存储相关
│   ├── types/                  # TypeScript 类型定义
│   │   ├── electron.d.ts       # Electron API 类型
│   │   ├── connection.ts       # 连接器类型
│   │   └── llmProvider.ts      # LLM 提供商配置
│   ├── connections/            # 第三方服务连接器
│   │   ├── BaseConnection.ts   # 基础连接器
│   │   ├── FeishuConnection.ts # 飞书连接器
│   │   ├── GitHubConnection.ts # GitHub 连接器
│   │   └── YuqueConnection.ts  # 语雀连接器
│   ├── imageProviders/         # 图片生成提供商
│   ├── router/                 # Vue Router 配置
│   ├── assets/                 # 静态资源
│   ├── App.vue                 # 根组件
│   ├── main.ts                 # Vue 入口
│   └── style.css               # 全局样式
├── build/                       # 构建资源
│   ├── icons/                  # 应用图标
│   └── certificates/           # 代码签名证书
├── scripts/                     # 构建脚本
│   ├── generate-icons.js       # 图标生成
│   ├── generate-certificate.ps1 # Windows 证书生成
│   └── generate-certificate-mac.sh # macOS 证书生成
├── mcp-servers/                 # MCP 服务器配置
├── skills/                      # 技能文件
├── electron-builder.json       # electron-builder 配置
├── vite.config.ts              # Vite 渲染进程配置
├── vite.electron.config.ts     # Vite Electron 进程配置
├── tsconfig.json               # TypeScript 配置
├── tsconfig.app.json           # 应用 TS 配置
└── tsconfig.node.json          # Node.js TS 配置
```

---

## 构建命令

```bash
cd frontend

# 开发模式（热重载）
npm run electron:dev

# 构建渲染进程
npm run build:renderer

# 构建 Electron 进程
npm run build:electron

# 完整构建 + 打包当前平台
npm run electron:build

# 仅打包 macOS 版本
npm run electron:build:mac

# 仅打包 Windows 版本
npm run electron:build:win

# 同时打包 Mac 和 Windows
npm run electron:build:all

# 生成应用图标
npm run generate-icons
```

---

## 开发规范

### 代码风格

- **TypeScript**: 严格模式，所有变量和函数都需要类型注解
- **Vue**: 使用 `<script setup>` 语法糖
- **样式**: 使用 CSS 变量（定义在 `style.css`），不使用 CSS 框架
- **命名**: 
  - 组件文件: PascalCase (如 `NormalChat.vue`)
  - composables: camelCase with `use` prefix (如 `useMCP.ts`)
  - 类型文件: camelCase (如 `llmProvider.ts`)

### CSS 变量

主要颜色变量定义在 `src/style.css`:

```css
:root {
  --color-primary: #4a90d9;
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-bg-tertiary: #ebebeb;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666666;
  --color-border: #e0e0e0;
  --color-border-hover: #4a90d9;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --radius-sm: 6px;
  --radius-md: 8px;
  --transition-normal: 0.2s ease;
}
```

### Electron IPC 通信

渲染进程通过 `window.electronAPI` 调用主进程方法：

```typescript
// 渲染进程调用
const result = await window.electronAPI?.someMethod(params)

// 主进程处理 (electron/main.ts)
ipcMain.handle('some-method', async (_event, params) => {
  // 处理逻辑
  return result
})

// 预加载脚本暴露 (electron/preload.ts)
contextBridge.exposeInMainWorld('electronAPI', {
  someMethod: (params) => ipcRenderer.invoke('some-method', params)
})
```

### 类型定义位置

- **Electron API 类型**: `src/types/electron.d.ts`
- **连接器类型**: `src/types/connection.ts`
- **LLM 提供商**: `src/types/llmProvider.ts`
- **定时任务**: `src/types/loop.ts`

---

## 关键文件说明

### electron/main.ts

主进程入口，包含：
- BrowserWindow 创建和管理
- IPC 处理器（文件操作、Shell 命令、MCP 调用等）
- 定时任务调度
- 第三方服务代理请求

### src/components/NormalChat.vue

核心聊天组件，包含：
- 消息渲染（Markdown、代码高亮、Mermaid 图表）
- 流式响应处理
- 技能选择器（@ 触发）
- 斜杠命令（/ 触发）
- 文件引用（# 触发）
- 图片/文件拖拽上传

### src/composables/useMCP.ts

MCP 集成，管理：
- MCP 服务器连接
- 工具调用
- 资源访问

### src/services/StorageService.ts

本地存储服务，管理：
- 配置持久化
- 对话历史
- 助理配置
- 全局记忆

---

## 数据存储位置

- **macOS**: `~/Library/Application Support/mirrorgrap-work/`
- **Windows**: `%APPDATA%/mirrorgrap-work/`
- **Linux**: `~/.config/mirrorgrap-work/`

---

## 注意事项

1. **API Key 安全** - 切勿将 API 密钥提交到版本控制
2. **MCP 命令** - Shell 命令需要用户确认
3. **跨平台兼容** - 注意路径分隔符和平台特定代码
4. **ASAR 打包** - MCP 服务器和技能文件需要解压（`asarUnpack` 配置）

---

## 相关文档

- [BUILD.md](./BUILD.md) - 详细构建指南
- [CLAUDE.md](./CLAUDE.md) - Claude Code 开发指南
- [UI标准.md](./UI标准.md) - UI 设计规范