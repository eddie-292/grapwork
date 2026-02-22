# PrismChat

一个支持任何 OpenAI 标准 API 的跨平台桌面 AI Agent 助手应用。

## 特性

### 核心功能

- 🖥️ **跨平台桌面应用** - 支持 macOS、Windows 和 Linux
- 🔌 **API 灵活配置** - 支持任何符合 OpenAI 标准的 LLM API
- 🔒 **安全本地存储** - API 密钥安全存储在本地
- 💬 **流式对话** - 实时流式响应，体验流畅
- 🎨 **Markdown 渲染** - 支持代码高亮的完整 Markdown 显示

### 高级功能

- 🧠 **全局记忆 (Global Memory)** - 持久化知识存储，记录用户偏好和自定义上下文
- 👤 **助手系统 (Assistants)** - 自定义 AI 助手和系统提示词管理
- 🔧 **MCP 支持** - Model Context Protocol 集成，支持 STDIO/SSE 传输的工具调用
- 📦 **技能系统 (Skills)** - 领域知识包，可注入到 AI 上下文中
- 💾 **统一存储** - 可插拔的存储后端系统（LocalStorage、FileSystem、HTTP）

## 快速开始

### 开发环境

```bash
# 安装依赖
cd frontend
npm install

# 启动开发模式
npm run electron:dev
```

### 构建应用

```bash
# 构建生产版本
cd frontend
npm run electron:build
```

构建完成后，安装包将生成在 `frontend/release/` 目录：
- macOS: `.dmg` 和 `.zip`
- Windows: `.exe` 安装程序和 `.zip`
- Linux: `.AppImage` 和 `.deb`

## 使用说明

### 首次配置

1. 启动应用后，点击右上角的 ⚙️ 按钮打开设置
2. 配置以下信息：
   - **API 地址**: LLM API 的基础 URL（例如：`https://api.openai.com/v1`）
   - **API Key**: 你的 API 密钥
   - **模型**: 要使用的模型名称（例如：`gpt-4o-mini`）
3. 保存设置

### 任务模式

任务模式可以自动将复杂的用户请求分解为多个子任务并顺序执行：

1. 在聊天界面启用「任务模式」开关
2. 输入复杂请求，例如：「帮我分析项目结构并生成 README」
3. AI 将自动规划 3-6 个子任务
4. 确认后开始执行，支持重试和跳过失败任务
5. 执行过程中的笔记、草稿和结果保存在工作记忆中

### 全局记忆

全局记忆用于存储跨会话的持久知识：

- **偏好设置**: 存储 UI 偏好、颜色、样式等
- **应用设置**: 通用应用配置
- **通用信息**: 通用知识和信息
- **自定义**: 用户自定义类型

添加记忆后，系统会根据关键词自动匹配并注入到对话上下文中。

### 助手管理

创建自定义助手来预设系统提示词：

1. 进入设置 → 助手标签页
2. 点击「新建助手」
3. 设置名称、图标和系统提示词
4. 在聊天时选择要使用的助手

### MCP 工具集成

配置 MCP 服务器来扩展 AI 的能力：

1. 进入设置 → MCP 标签页
2. 添加 MCP 服务器配置：
   - **STDIO**: 本地进程型服务器（命令、参数、环境变量）
   - **SSE**: 远程服务器（URL 端点）
3. 在聊天中启用需要的服务器
4. AI 将自动发现并调用可用的工具

### 技能系统

技能是可注入 AI 上下文的领域知识包：

- **用户技能**: 用户创建的技能（可读写）
- **已安装技能**: 通过 `npx skills add` 安装的技能
- **公共技能**: 系统内置技能
- **示例技能**: 示例和模板

技能文件结构：
```
skill-name/
├── SKILL.md          # 主文件（包含 YAML frontmatter）
├── scripts/          # 可选脚本
└── references/       # 可选参考文件
```

## 支持的 API

本应用支持任何符合 OpenAI Chat Completions API 格式的服务：

- ✅ OpenAI (GPT-4, GPT-4o, GPT-3.5 等)
- ✅ Azure OpenAI
- ✅ Anthropic Claude (通过兼容层)
- ✅ DeepSeek (支持 reasoning_content 推理格式)
- ✅ 通义千问 Qwen (支持 ` MarkeDown 思考标签)
- ✅ 本地模型 (LM Studio, Ollama, vLLM 等)
- ✅ 其他 OpenAI 兼容的 API 网关

### API 格式要求

你的 API 需要支持以下格式：

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

**响应**: Server-Sent Events 格式，包含 `choices[0].delta.content`

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 下一代前端构建工具
- **Markdown-it** - Markdown 解析器
- **Highlight.js** - 代码语法高亮

## 项目结构

```
prismchat/
├── frontend/               # Electron + Vue 3 前端应用
│   ├── electron/          # Electron 主进程和预加载脚本
│   │   ├── main.ts        # 主进程（IPC、配置、窗口管理、MCP 客户端）
│   │   └── preload.ts     # 渲染进程通信桥接
│   ├── src/
│   │   ├── components/    # Vue 组件
│   │   │   ├── ChatView.vue        # 主聊天界面
│   │   │   ├── TaskModePanel.vue   # 任务模式面板
│   │   │   ├── SettingsView.vue    # 统一设置页面
│   │   │   ├── MCPView.vue         # MCP 服务器配置
│   │   │   └── ...
│   │   ├── composables/   # Vue Composables
│   │   │   ├── useTaskMode.ts      # 任务模式逻辑
│   │   │   ├── useWorkingMemory.ts # 工作记忆管理
│   │   │   ├── useGlobalMemory.ts  # 全局记忆管理
│   │   │   ├── useMCP.ts           # MCP 服务器管理
│   │   │   └── useSkills.ts        # 技能管理
│   │   ├── services/      # 服务层
│   │   │   ├── StorageService.ts   # 统一存储服务
│   │   │   └── storage/            # 存储后端实现
│   │   ├── types/         # TypeScript 类型定义
│   │   └── router/        # Vue Router 配置
│   ├── mcp-servers/       # MCP 服务器示例
│   └── package.json
└── server/                # 可选的 Web 模式后端（桌面模式不需要）
    └── index.js
```

## 配置文件位置

配置文件自动保存在以下位置：
- **macOS**: `~/Library/Application Support/prismchat/config.json`
- **Windows**: `%APPDATA%/prismchat/config.json`
- **Linux**: `~/.config/prismchat/config.json`

## 开发命令

```bash
# 开发模式（热重载）
npm run electron:dev

# 仅构建渲染器
npm run build:renderer

# 仅构建 Electron 进程
npm run build:electron

# 监听 Electron 构建
npm run build:electron:watch

# 完整构建并打包
npm run electron:build
```

## 可选 Web 服务器

项目包含一个可选的 Web 服务器模式：

```bash
cd server
npm run dev  # 在 8787 端口启动 Fastify 服务器
```

**端点**:
- `GET /api/health` - 健康检查
- `POST /api/chat/completions` - 完整 OpenAI 兼容端点
- `POST /api/chat` - 简单聊天端点（仅流式）

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
