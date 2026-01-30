# OpenChat Desktop - 安装和运行指南

## 📦 安装依赖

首次使用需要安装依赖：

```bash
cd frontend
npm install
```

## 🚀 运行应用

### 方式一：开发模式（推荐用于开发）

```bash
cd frontend
npm run electron:dev
```

这将启动开发服务器并打开 Electron 应用，支持热重载。

### 方式二：构建独立应用

```bash
cd frontend
npm run electron:build
```

构建完成后，在 `frontend/release/` 目录找到对应平台的安装包：

- **macOS**: `OpenChat-1.0.0.dmg` 或 `OpenChat-1.0.0-mac.zip`
- **Windows**: `OpenChat Setup 1.0.0.exe` 或 `OpenChat-1.0.0-win.zip`
- **Linux**: `OpenChat-1.0.0.AppImage` 或 `openchat-desktop_1.0.0_amd64.deb`

双击安装包即可安装使用。

## ⚙️ 首次配置

1. 启动应用
2. 点击右上角的 ⚙️ 图标
3. 填写配置信息：

### OpenAI 配置示例

```
API 地址: https://api.openai.com/v1
API Key: sk-your-api-key-here
模型: gpt-4o-mini
```

### 本地 LM Studio 配置示例

```
API 地址: http://localhost:1234/v1
API Key: lm-studio
模型: local-model
```

### Azure OpenAI 配置示例

```
API 地址: https://your-resource.openai.azure.com/openai/deployments/your-deployment
API Key: your-azure-key
模型: gpt-4
```

## 💡 使用技巧

- **发送消息**: 输入内容后按 Enter
- **换行**: Shift + Enter
- **取消生成**: 点击"取消"按钮
- **修改配置**: 随时点击 ⚙️ 重新配置

## 🔧 故障排除

### 问题：无法连接到 API

**解决方案**:
1. 检查 API 地址是否正确（注意不要包含尾部斜杠）
2. 验证 API Key 是否有效
3. 确认网络连接正常
4. 如果使用本地 API，确保服务已启动

### 问题：提示 "Failed to fetch"

**解决方案**:
1. 检查 API URL 格式是否正确
2. 本地 API 确保使用 `http://` 而非 `https://`
3. 检查防火墙设置

### 问题：消息无响应

**解决方案**:
1. 检查模型名称是否正确
2. 验证 API Key 权限
3. 查看开发者工具的错误信息（开发模式）

## 📝 开发者选项

### 查看开发者工具

在开发模式下，应用会自动打开 DevTools。

在生产版本中，可以通过以下方式打开：
- macOS: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

### 查看配置文件位置

配置保存在：
- macOS: `~/Library/Application Support/openchat-desktop/config.json`
- Windows: `%APPDATA%/openchat-desktop/config.json`
- Linux: `~/.config/openchat-desktop/config.json`

### 重置配置

如需重置配置，删除上述配置文件即可。

## 📚 更多信息

详细的开发文档请查看 `CODEBUDDY.md`
