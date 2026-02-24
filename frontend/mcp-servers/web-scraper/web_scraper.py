#!/usr/bin/env python3
"""
Web Scraper MCP Server - 网页爬取工具 MCP 服务器
提供网页内容抓取、解析、提取等功能
"""

import asyncio
import json
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

# HTTP 请求
import requests
from requests.exceptions import RequestException, Timeout, SSLError

# HTML 解析
from bs4 import BeautifulSoup

# MCP SDK
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# 创建 MCP 服务器实例
server = Server("web-scraper")

# 默认请求配置
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

DEFAULT_TIMEOUT = 30
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB


def is_valid_url(url: str) -> bool:
    """验证URL是否有效"""
    try:
        result = urlparse(url)
        return all([result.scheme in ("http", "https"), result.netloc])
    except Exception:
        return False


def clean_text(text: str) -> str:
    """清理文本，移除多余空白"""
    if not text:
        return ""
    # 移除多余的空白字符
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_metadata(soup: BeautifulSoup, url: str) -> dict:
    """提取网页元数据"""
    metadata = {
        "url": url,
        "title": "",
        "description": "",
        "keywords": [],
        "author": "",
        "og_title": "",
        "og_description": "",
        "og_image": "",
        "canonical_url": "",
        "favicon": "",
        "language": "",
        "charset": "",
    }

    # 标题
    if soup.title:
        metadata["title"] = soup.title.string or ""

    # Meta 标签
    for meta in soup.find_all("meta"):
        name = meta.get("name", "").lower()
        prop = meta.get("property", "").lower()
        content = meta.get("content", "")

        if name == "description":
            metadata["description"] = content
        elif name == "keywords":
            metadata["keywords"] = [k.strip() for k in content.split(",") if k.strip()]
        elif name == "author":
            metadata["author"] = content
        elif prop == "og:title":
            metadata["og_title"] = content
        elif prop == "og:description":
            metadata["og_description"] = content
        elif prop == "og:image":
            metadata["og_image"] = urljoin(url, content)
        elif name == "lang" or prop == "og:locale":
            metadata["language"] = content

    # Canonical URL
    canonical = soup.find("link", rel="canonical")
    if canonical and canonical.get("href"):
        metadata["canonical_url"] = urljoin(url, canonical["href"])

    # Favicon
    favicon = soup.find("link", rel=lambda x: x and "icon" in x.lower() if x else False)
    if favicon and favicon.get("href"):
        metadata["favicon"] = urljoin(url, favicon["href"])

    # HTML lang
    html_tag = soup.find("html")
    if html_tag and html_tag.get("lang"):
        metadata["language"] = html_tag["lang"]

    # Charset
    charset_meta = soup.find("meta", charset=True)
    if charset_meta:
        metadata["charset"] = charset_meta.get("charset", "")
    else:
        content_type = soup.find("meta", {"http-equiv": lambda x: x and x.lower() == "content-type" if x else False})
        if content_type:
            content = content_type.get("content", "")
            if "charset=" in content:
                metadata["charset"] = content.split("charset=")[-1].strip()

    return metadata


def extract_main_content(soup: BeautifulSoup) -> str:
    """提取网页主要内容（正文）"""
    # 移除不需要的标签
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "iframe", "noscript"]):
        tag.decompose()

    # 尝试找到主要内容区域
    main_selectors = [
        "article",
        "[role='main']",
        "main",
        ".post-content",
        ".article-content",
        ".entry-content",
        ".content",
        "#content",
        ".post",
        ".article",
        ".main-content",
        "#main-content",
    ]

    main_content = None
    for selector in main_selectors:
        if selector.startswith("["):
            # 属性选择器
            attr_match = re.match(r"\[role='(\w+)'\]", selector)
            if attr_match:
                main_content = soup.find(attrs={"role": attr_match.group(1)})
        elif selector.startswith("."):
            # 类选择器
            main_content = soup.find(class_=selector[1:])
        elif selector.startswith("#"):
            # ID 选择器
            main_content = soup.find(id=selector[1:])
        else:
            # 标签选择器
            main_content = soup.find(selector)

        if main_content:
            break

    if not main_content:
        main_content = soup.find("body") or soup

    # 提取文本
    paragraphs = main_content.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"])
    if paragraphs:
        texts = [clean_text(p.get_text()) for p in paragraphs if clean_text(p.get_text())]
        return "\n\n".join(texts)

    # 如果没有找到段落，直接提取所有文本
    return clean_text(main_content.get_text())


def extract_links(soup: BeautifulSoup, base_url: str, limit: int = 50) -> list:
    """提取网页链接"""
    links = []
    seen = set()

    for a in soup.find_all("a", href=True):
        if len(links) >= limit:
            break

        href = a["href"]
        full_url = urljoin(base_url, href)

        # 跳过重复链接和非HTTP链接
        if full_url in seen or not full_url.startswith(("http://", "https://")):
            continue

        seen.add(full_url)

        link_text = clean_text(a.get_text()) or a.get("title", "") or ""

        links.append({
            "url": full_url,
            "text": link_text[:100] if link_text else "",
            "is_external": urlparse(full_url).netloc != urlparse(base_url).netloc
        })

    return links


def extract_images(soup: BeautifulSoup, base_url: str, limit: int = 20) -> list:
    """提取网页图片"""
    images = []
    seen = set()

    for img in soup.find_all("img", src=True):
        if len(images) >= limit:
            break

        src = img["src"]
        full_url = urljoin(base_url, src)

        # 跳过重复图片和数据 URL
        if full_url in seen or full_url.startswith("data:"):
            continue

        seen.add(full_url)

        images.append({
            "url": full_url,
            "alt": img.get("alt", ""),
            "title": img.get("title", ""),
            "width": img.get("width", ""),
            "height": img.get("height", "")
        })

    return images


@server.list_tools()
async def list_tools() -> list[Tool]:
    """列出可用的网页爬取工具"""
    return [
        Tool(
            name="fetch_webpage",
            description="抓取指定URL的网页内容。返回网页的HTML内容、文本内容或结构化数据。支持自定义请求头和超时设置。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要抓取的网页URL"
                    },
                    "output_format": {
                        "type": "string",
                        "description": "输出格式：'html' 返回原始HTML，'text' 返回纯文本，'markdown' 返回Markdown格式。默认为 'text'。",
                        "enum": ["html", "text", "markdown"]
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    },
                    "include_metadata": {
                        "type": "boolean",
                        "description": "是否包含网页元数据（标题、描述等）。默认为 true。"
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="extract_content",
            description="从网页中提取主要内容（正文）。自动识别并提取文章主体，过滤导航、广告等非核心内容。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要提取内容的网页URL"
                    },
                    "max_length": {
                        "type": "number",
                        "description": "返回内容的最大字符数。默认10000，设为0表示不限制。"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="get_metadata",
            description="获取网页的元数据信息，包括标题、描述、关键词、Open Graph信息、作者等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要获取元数据的网页URL"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="extract_links",
            description="从网页中提取所有链接。可选择只提取内链或外链。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要提取链接的网页URL"
                    },
                    "filter_type": {
                        "type": "string",
                        "description": "链接过滤类型：'all' 全部链接，'internal' 只返回内链，'external' 只返回外链。默认为 'all'。",
                        "enum": ["all", "internal", "external"]
                    },
                    "limit": {
                        "type": "number",
                        "description": "返回链接的最大数量。默认50，最大200。"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="extract_images",
            description="从网页中提取所有图片信息，包括图片URL、alt文本、尺寸等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要提取图片的网页URL"
                    },
                    "limit": {
                        "type": "number",
                        "description": "返回图片的最大数量。默认20，最大100。"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    }
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="search_text",
            description="在网页内容中搜索指定的文本或正则表达式，返回匹配结果。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要搜索的网页URL"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "搜索的文本或正则表达式"
                    },
                    "is_regex": {
                        "type": "boolean",
                        "description": "是否使用正则表达式搜索。默认为 false（普通文本搜索）。"
                    },
                    "context_chars": {
                        "type": "number",
                        "description": "匹配结果前后的上下文字符数。默认100。"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认30秒。"
                    }
                },
                "required": ["url", "pattern"]
            }
        ),
        Tool(
            name="check_url",
            description="检查URL是否可访问，返回HTTP状态码、响应时间、内容类型等信息。",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要检查的URL"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "请求超时时间（秒）。默认10秒。"
                    },
                    "follow_redirects": {
                        "type": "boolean",
                        "description": "是否跟随重定向。默认为 true。"
                    }
                },
                "required": ["url"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """执行工具调用"""
    try:
        if name == "fetch_webpage":
            return await handle_fetch_webpage(arguments)
        elif name == "extract_content":
            return await handle_extract_content(arguments)
        elif name == "get_metadata":
            return await handle_get_metadata(arguments)
        elif name == "extract_links":
            return await handle_extract_links(arguments)
        elif name == "extract_images":
            return await handle_extract_images(arguments)
        elif name == "search_text":
            return await handle_search_text(arguments)
        elif name == "check_url":
            return await handle_check_url(arguments)
        else:
            return [TextContent(type="text", text=f"未知工具: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"执行错误: {str(e)}")]


def fetch_url(url: str, timeout: int = DEFAULT_TIMEOUT, headers: Optional[dict] = None) -> requests.Response:
    """发送HTTP请求获取网页内容"""
    if not is_valid_url(url):
        raise ValueError(f"无效的URL: {url}")

    req_headers = {**DEFAULT_HEADERS, **(headers or {})}

    response = requests.get(
        url,
        headers=req_headers,
        timeout=timeout,
        allow_redirects=True,
        stream=True
    )

    # 检查内容长度
    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > MAX_CONTENT_LENGTH:
        raise ValueError(f"内容过大 ({int(content_length) / 1024 / 1024:.1f}MB)，超过10MB限制")

    response.raise_for_status()
    return response


def html_to_markdown(soup: BeautifulSoup) -> str:
    """将HTML转换为简单的Markdown格式"""
    # 移除不需要的标签
    for tag in soup(["script", "style", "nav", "footer", "aside", "iframe", "noscript"]):
        tag.decompose()

    result = []

    # 处理标题
    for i in range(1, 7):
        for tag in soup.find_all(f"h{i}"):
            text = clean_text(tag.get_text())
            if text:
                result.append(f"{'#' * i} {text}\n")

    # 处理段落
    for p in soup.find_all("p"):
        text = clean_text(p.get_text())
        if text:
            result.append(f"{text}\n")

    # 处理列表
    for ul in soup.find_all("ul"):
        for li in ul.find_all("li", recursive=False):
            text = clean_text(li.get_text())
            if text:
                result.append(f"- {text}")

    for ol in soup.find_all("ol"):
        for i, li in enumerate(ol.find_all("li", recursive=False), 1):
            text = clean_text(li.get_text())
            if text:
                result.append(f"{i}. {text}")

    # 处理链接
    for a in soup.find_all("a", href=True):
        text = clean_text(a.get_text())
        if text and a["href"]:
            result.append(f"[{text}]({a['href']})")

    # 处理代码块
    for pre in soup.find_all("pre"):
        code = pre.find("code") or pre
        text = code.get_text()
        if text:
            result.append(f"```\n{text}\n```")

    for code in soup.find_all("code"):
        if code.parent.name != "pre":
            text = code.get_text()
            if text:
                result.append(f"`{text}`")

    return "\n".join(result)


async def handle_fetch_webpage(args: dict) -> list[TextContent]:
    """抓取网页内容"""
    url = args.get("url", "")
    output_format = args.get("output_format", "text")
    timeout = args.get("timeout", DEFAULT_TIMEOUT)
    include_metadata = args.get("include_metadata", True)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        result = {"success": True, "url": url, "status_code": response.status_code}

        if include_metadata:
            result["metadata"] = extract_metadata(soup, url)

        if output_format == "html":
            result["content"] = soup.prettify()[:50000]  # 限制HTML大小
            result["content_type"] = "html"
        elif output_format == "markdown":
            result["content"] = html_to_markdown(soup)[:50000]
            result["content_type"] = "markdown"
        else:
            result["content"] = clean_text(soup.get_text())[:50000]
            result["content_type"] = "text"

        result["content_length"] = len(result["content"])

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_extract_content(args: dict) -> list[TextContent]:
    """提取网页主要内容"""
    url = args.get("url", "")
    max_length = args.get("max_length", 10000)
    timeout = args.get("timeout", DEFAULT_TIMEOUT)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        # 提取主要内容
        content = extract_main_content(soup)

        # 获取标题
        title = ""
        if soup.title:
            title = soup.title.string or ""

        result = {
            "success": True,
            "url": url,
            "title": title,
            "content": content[:max_length] if max_length > 0 else content,
            "content_length": len(content),
            "truncated": max_length > 0 and len(content) > max_length
        }

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_get_metadata(args: dict) -> list[TextContent]:
    """获取网页元数据"""
    url = args.get("url", "")
    timeout = args.get("timeout", DEFAULT_TIMEOUT)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        metadata = extract_metadata(soup, url)

        result = {
            "success": True,
            "status_code": response.status_code,
            "content_type": response.headers.get("content-type", ""),
            "metadata": metadata
        }

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_extract_links(args: dict) -> list[TextContent]:
    """提取网页链接"""
    url = args.get("url", "")
    filter_type = args.get("filter_type", "all")
    limit = min(args.get("limit", 50), 200)
    timeout = args.get("timeout", DEFAULT_TIMEOUT)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        all_links = extract_links(soup, url, limit=limit * 2)  # 获取更多以便过滤

        # 根据类型过滤
        if filter_type == "internal":
            links = [l for l in all_links if not l["is_external"]][:limit]
        elif filter_type == "external":
            links = [l for l in all_links if l["is_external"]][:limit]
        else:
            links = all_links[:limit]

        result = {
            "success": True,
            "url": url,
            "total_links": len(links),
            "filter_type": filter_type,
            "links": links
        }

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_extract_images(args: dict) -> list[TextContent]:
    """提取网页图片"""
    url = args.get("url", "")
    limit = min(args.get("limit", 20), 100)
    timeout = args.get("timeout", DEFAULT_TIMEOUT)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        images = extract_images(soup, url, limit=limit)

        result = {
            "success": True,
            "url": url,
            "total_images": len(images),
            "images": images
        }

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_search_text(args: dict) -> list[TextContent]:
    """在网页中搜索文本"""
    url = args.get("url", "")
    pattern = args.get("pattern", "")
    is_regex = args.get("is_regex", False)
    context_chars = args.get("context_chars", 100)
    timeout = args.get("timeout", DEFAULT_TIMEOUT)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]
    if not pattern:
        return [TextContent(type="text", text="错误：必须指定搜索模式")]

    try:
        response = fetch_url(url, timeout=timeout)
        soup = BeautifulSoup(response.content, "html.parser")

        # 移除脚本和样式
        for tag in soup(["script", "style"]):
            tag.decompose()

        text = soup.get_text()

        matches = []
        if is_regex:
            # 正则表达式搜索
            try:
                regex = re.compile(pattern, re.IGNORECASE)
                for match in regex.finditer(text):
                    start = max(0, match.start() - context_chars)
                    end = min(len(text), match.end() + context_chars)
                    matches.append({
                        "matched": match.group(),
                        "position": match.start(),
                        "context": clean_text(text[start:end])
                    })
            except re.error as e:
                return [TextContent(type="text", text=f"错误：无效的正则表达式 - {str(e)}")]
        else:
            # 普通文本搜索
            lower_text = text.lower()
            lower_pattern = pattern.lower()
            start = 0
            while True:
                pos = lower_text.find(lower_pattern, start)
                if pos == -1:
                    break
                context_start = max(0, pos - context_chars)
                context_end = min(len(text), pos + len(pattern) + context_chars)
                matches.append({
                    "matched": text[pos:pos + len(pattern)],
                    "position": pos,
                    "context": clean_text(text[context_start:context_end])
                })
                start = pos + 1

        result = {
            "success": True,
            "url": url,
            "pattern": pattern,
            "is_regex": is_regex,
            "total_matches": len(matches),
            "matches": matches[:50]  # 限制返回数量
        }

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def handle_check_url(args: dict) -> list[TextContent]:
    """检查URL状态"""
    url = args.get("url", "")
    timeout = args.get("timeout", 10)
    follow_redirects = args.get("follow_redirects", True)

    if not url:
        return [TextContent(type="text", text="错误：必须指定URL")]

    if not is_valid_url(url):
        return [TextContent(type="text", text=f"错误：无效的URL格式 - {url}")]

    try:
        import time
        start_time = time.time()

        response = requests.head(
            url,
            headers=DEFAULT_HEADERS,
            timeout=timeout,
            allow_redirects=follow_redirects
        )

        response_time = (time.time() - start_time) * 1000  # 转换为毫秒

        result = {
            "success": True,
            "url": url,
            "status_code": response.status_code,
            "status_message": response.reason,
            "response_time_ms": round(response_time, 2),
            "content_type": response.headers.get("content-type", ""),
            "content_length": response.headers.get("content-length", ""),
            "server": response.headers.get("server", ""),
            "final_url": response.url if response.url != url else url,
            "redirected": response.url != url,
            "headers": dict(response.headers)
        }

        # 状态码分类
        if 200 <= response.status_code < 300:
            result["status_category"] = "success"
        elif 300 <= response.status_code < 400:
            result["status_category"] = "redirect"
        elif 400 <= response.status_code < 500:
            result["status_category"] = "client_error"
        elif 500 <= response.status_code < 600:
            result["status_category"] = "server_error"
        else:
            result["status_category"] = "unknown"

        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except Timeout:
        return [TextContent(type="text", text=f"错误：请求超时（{timeout}秒）")]
    except SSLError:
        return [TextContent(type="text", text="错误：SSL证书验证失败")]
    except RequestException as e:
        return [TextContent(type="text", text=f"错误：请求失败 - {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]


async def async_main():
    """启动 MCP 服务器"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


def main():
    """同步入口点，供 uvx/pyproject.toml 调用"""
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
