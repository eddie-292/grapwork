# OpenChat Desktop

一个支持任何 OpenAI 标准 API 的跨平台桌面聊天应用。

## 特性

- 🖥️ **跨平台桌面应用** - 支持 macOS、Windows 和 Linux
- 🔌 **API 灵活配置** - 支持任何符合 OpenAI 标准的 LLM API
- 🔒 **安全本地存储** - API 密钥安全存储在本地
- 💬 **流式对话** - 实时流式响应，体验流畅
- 🎨 **Markdown 渲染** - 支持代码高亮的完整 Markdown 显示
- ⚡ **轻量高效** - 基于 Electron + Vue 3 构建

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

### 开始对话

- 在底部输入框输入消息
- 按 Enter 发送（Shift+Enter 换行）
- 等待 AI 响应

## 支持的 API

本应用支持任何符合 OpenAI Chat Completions API 格式的服务：

- ✅ OpenAI (GPT-4, GPT-4o, GPT-3.5 等)
- ✅ Azure OpenAI
- ✅ Anthropic Claude (通过兼容层)
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
openchat/
├── frontend/           # Electron + Vue 3 前端应用
│   ├── electron/      # Electron 主进程和预加载脚本
│   ├── src/           # Vue 源代码
│   │   ├── components/  # Vue 组件
│   │   ├── types/       # TypeScript 类型定义
│   │   └── ...
│   └── package.json
└── server/            # 可选的 Web 模式后端（桌面模式不需要）
    └── index.js
```

## 配置文件位置

配置文件自动保存在以下位置：
- **macOS**: `~/Library/Application Support/openchat-desktop/config.json`
- **Windows**: `%APPDATA%/openchat-desktop/config.json`
- **Linux**: `~/.config/openchat-desktop/config.json`

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
