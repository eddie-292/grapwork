# Web Scraper MCP Server

网页爬取工具 MCP 服务器，提供网页内容抓取、解析、提取等功能。

## 功能

- **抓取网页** - 获取网页HTML、纯文本或Markdown格式内容
- **提取正文** - 智能识别并提取网页主要内容
- **获取元数据** - 提取标题、描述、关键词、Open Graph等信息
- **提取链接** - 获取网页中的所有链接，支持内链/外链过滤
- **提取图片** - 获取网页中的图片信息
- **搜索文本** - 在网页中搜索指定文本或正则表达式
- **检查URL** - 检测URL可访问性和响应状态

## 安装

### 方法一：使用 uvx（推荐）

```bash
uvx --from /path/to/openchat/frontend/mcp-servers/web-scraper web_scraper
```

### 方法二：安装依赖后运行

```bash
cd frontend/mcp-servers/web-scraper
pip install -r requirements.txt
python web_scraper.py
```

## 在 GrapWork 中配置

进入 设置 → MCP，添加新服务器：

```json
{
  "name": "Web Scraper",
  "transportType": "stdio",
  "command": "uvx",
  "args": ["--from", "/path/to/openchat/frontend/mcp-servers/web-scraper", "web_scraper"],
  "enabled": true
}
```

或使用 python 直接运行：

```json
{
  "name": "Web Scraper",
  "transportType": "stdio",
  "command": "python",
  "args": ["/path/to/openchat/frontend/mcp-servers/web-scraper/web_scraper.py"],
  "enabled": true
}
```

## 可用工具

| 工具名称 | 描述 | 主要参数 |
|---------|------|---------|
| `fetch_webpage` | 抓取网页内容 | url, output_format, timeout, include_metadata |
| `extract_content` | 提取网页正文 | url, max_length, timeout |
| `get_metadata` | 获取网页元数据 | url, timeout |
| `extract_links` | 提取网页链接 | url, filter_type, limit, timeout |
| `extract_images` | 提取网页图片 | url, limit, timeout |
| `search_text` | 搜索网页文本 | url, pattern, is_regex, context_chars, timeout |
| `check_url` | 检查URL状态 | url, timeout, follow_redirects |

## 使用示例

在 GrapWork 中与 AI 对话时：

### 抓取网页内容

```
帮我抓取 https://example.com 的内容
获取 https://news.ycombinator.com 的纯文本内容
```

### 提取正文

```
提取这篇文章的正文：https://example.com/article/123
```

### 获取元数据

```
查看这个网页的元数据：https://github.com
这个网页的标题和描述是什么？
```

### 提取链接

```
列出这个网页的所有外链：https://example.com
获取 https://example.com 页面中的所有链接
```

### 提取图片

```
提取这个页面的所有图片：https://example.com/gallery
```

### 搜索文本

```
在这个网页中搜索 "Python"：https://docs.python.org
用正则表达式在网页中搜索邮箱地址
```

### 检查URL

```
检查这个URL是否可访问：https://example.com
这个网站响应时间是多少？
```

## 输出格式说明

### fetch_webpage 的 output_format 参数

- `html` - 返回原始HTML内容
- `text` - 返回纯文本（默认）
- `markdown` - 返回Markdown格式

### extract_links 的 filter_type 参数

- `all` - 返回所有链接
- `internal` - 只返回同域名下的内链
- `external` - 只返回外部链接

## 技术细节

- 使用 `requests` 库发送HTTP请求
- 使用 `BeautifulSoup4` 解析HTML
- 默认请求超时：30秒
- 最大内容大小：10MB
- User-Agent 模拟Chrome浏览器

## 注意事项

1. **尊重 robots.txt** - 请遵守目标网站的爬虫协议
2. **频率限制** - 避免过于频繁的请求
3. **版权问题** - 抓取的内容请合理使用
4. **动态内容** - 无法抓取JavaScript渲染的内容
5. **登录页面** - 无法访问需要认证的页面

## 故障排除

### SSL证书错误

如果遇到SSL证书验证失败，可能是网站证书配置问题。可以尝试访问其他网站确认。

### 请求超时

增加 timeout 参数的值，或者检查网络连接。

### 内容过大

对于大页面，使用 `extract_content` 并设置 `max_length` 参数限制返回长度。

### 中文乱码

服务器会自动检测网页编码，如果仍有问题，请确认目标网页的编码设置。

## 开发

```bash
# 测试服务器
python web_scraper.py

# 安装到本地
pip install -e .
```

## License

MIT
