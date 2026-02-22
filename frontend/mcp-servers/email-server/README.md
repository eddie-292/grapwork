# Email MCP Server

邮件收发 MCP 服务器，支持通过 AI Agent 发送和接收邮件。

## 功能

- **发送邮件** - 支持纯文本和 HTML 格式，支持抄送/密送
- **获取邮件列表** - 支持筛选（未读、日期范围、发件人、主题）
- **读取邮件** - 获取邮件完整内容和附件信息
- **删除邮件** - 永久删除指定邮件
- **移动邮件** - 在文件夹之间移动邮件
- **搜索邮件** - 在主题和正文中搜索关键词
- **文件夹管理** - 列出和创建邮箱文件夹

## 安装

### 1. 安装依赖

```bash
cd frontend/mcp-servers/email-server
pip install -r requirements.txt
```

或使用 uv（推荐）:

```bash
uv pip install -r requirements.txt
```

### 2. 配置邮件服务

复制配置模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写你的邮件服务配置。

### 3. 常用邮箱配置

#### Gmail

1. 启用两步验证：Google 账户 → 安全性 → 两步验证
2. 创建应用专用密码：Google 账户 → 安全性 → 两步验证 → 应用专用密码
3. 使用应用专用密码作为 `SMTP_PASSWORD` 和 `IMAP_PASSWORD`

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password
```

#### Outlook/Hotmail

```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USE_TLS=true

IMAP_HOST=outlook.office365.com
IMAP_PORT=993
```

#### QQ 邮箱

1. 登录 QQ 邮箱网页版
2. 设置 → 账户 → POP3/IMAP/SMTP 服务 → 开启
3. 生成授权码

```
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_PASSWORD=你的授权码

IMAP_HOST=imap.qq.com
IMAP_PORT=993
IMAP_PASSWORD=你的授权码
```

#### 163 邮箱

```
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USE_TLS=false
SMTP_PASSWORD=你的授权码

IMAP_HOST=imap.163.com
IMAP_PORT=993
IMAP_PASSWORD=你的授权码
```

## 在 PrismChat 中配置

### 方法一：使用 uvx 运行（推荐）

1. 打开 PrismChat
2. 进入 设置 → MCP
3. 添加新服务器，配置如下：

```json
{
  "name": "Email Server",
  "transportType": "stdio",
  "command": "uvx",
  "args": ["--from", "/path/to/openchat/frontend/mcp-servers/email-server", "email_server"],
  "env": {
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USE_TLS": "true",
    "SMTP_USER": "your-email@gmail.com",
    "SMTP_PASSWORD": "your-app-password",
    "IMAP_HOST": "imap.gmail.com",
    "IMAP_PORT": "993",
    "IMAP_USER": "your-email@gmail.com",
    "IMAP_PASSWORD": "your-app-password",
    "SENDER_NAME": "AI Assistant"
  },
  "enabled": true
}
```

### 方法二：使用 python 运行

```json
{
  "name": "Email Server",
  "transportType": "stdio",
  "command": "python",
  "args": ["/path/to/openchat/frontend/mcp-servers/email-server/email_server.py"],
  "env": {
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": "587",
    "SMTP_USE_TLS": "true",
    "SMTP_USER": "your-email@gmail.com",
    "SMTP_PASSWORD": "your-app-password",
    "IMAP_HOST": "imap.gmail.com",
    "IMAP_PORT": "993",
    "IMAP_USER": "your-email@gmail.com",
    "IMAP_PASSWORD": "your-app-password"
  },
  "enabled": true
}
```

### 方法三：从 .env 文件读取

如果已经在 `.env` 文件中配置好了，可以使用 `python-dotenv`：

```bash
pip install python-dotenv
```

然后修改 `email_server.py` 在顶部添加：

```python
from dotenv import load_dotenv
load_dotenv()
```

## 可用工具

| 工具名称 | 描述 | 主要参数 |
|---------|------|---------|
| `send_email` | 发送邮件 | to, subject, body, cc, bcc, html |
| `list_emails` | 获取邮件列表 | folder, limit, unread_only, since |
| `read_email` | 读取邮件内容 | uid, folder, mark_read |
| `delete_email` | 删除邮件 | uid, folder |
| `move_email` | 移动邮件 | uid, source_folder, target_folder |
| `search_emails` | 搜索邮件 | query, folder, limit |
| `list_folders` | 列出文件夹 | - |
| `create_folder` | 创建文件夹 | folder_name |

## 使用示例

在 PrismChat 中与 AI 对话时，你可以这样请求：

- "帮我给 xxx@example.com 发一封邮件，主题是..."
- "检查我的收件箱，有没有未读邮件"
- "搜索包含'项目报告'的邮件"
- "把最新的那封邮件移动到归档文件夹"

AI 会自动调用相应的工具完成操作。

## 安全注意事项

1. **不要将密码提交到版本控制** - `.env` 文件已添加到 `.gitignore`
2. **使用应用专用密码** - Gmail、Outlook 等服务建议使用应用专用密码
3. **授权码** - QQ、163 等国内邮箱需要使用授权码
4. **最小权限原则** - 只配置必要的环境变量

## 故障排除

### 认证失败

- Gmail: 确保使用应用专用密码，不是账户密码
- QQ/163: 确保使用授权码，并且 IMAP/SMTP 服务已开启

### 连接超时

- 检查网络连接
- 确认防火墙没有阻止 SMTP/IMAP 端口
- 尝试更换端口（587/465 for SMTP, 993 for IMAP）

### 找不到邮件

- 确认文件夹名称正确（区分大小写）
- Gmail 的文件夹可能是 `[Gmail]/收件箱` 或 `[Gmail]/Sent`

## 开发

### 测试服务器

```bash
# 直接运行（需要先设置环境变量）
export SMTP_HOST=smtp.gmail.com
export SMTP_USER=your-email@gmail.com
# ... 其他环境变量

python email_server.py
```

### 调试

在代码中添加日志：

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```
