#!/usr/bin/env python3
"""
Email MCP Server - 邮件收发 MCP 服务器
支持 SMTP 发送邮件和 IMAP 接收邮件
"""

import asyncio
import json
import os
import sys
import re
from email import policy
from email.header import decode_header
from email.parser import Parser
from email.utils import parseaddr, formataddr
from typing import Any, Optional

# MCP SDK
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# 邮件相关
import smtplib
import imaplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

# 创建 MCP 服务器实例
server = Server("email-server")

# 配置 - 从环境变量读取
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

IMAP_HOST = os.getenv("IMAP_HOST", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
IMAP_USER = os.getenv("IMAP_USER", "")
IMAP_PASSWORD = os.getenv("IMAP_PASSWORD", "")

# 发件人名称（可选）
SENDER_NAME = os.getenv("SENDER_NAME", "")


def decode_str(s: str) -> str:
    """解码邮件头字符串"""
    if s is None:
        return ""
    decoded_parts = decode_header(s)
    result = []
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


def get_email_body(msg) -> str:
    """提取邮件正文"""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in content_disposition:
                continue
            try:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text = payload.decode(charset, errors="replace")
                    if content_type == "text/plain":
                        body = text
                        break
                    elif content_type == "text/html" and not body:
                        body = text
            except Exception:
                continue
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                body = payload.decode(charset, errors="replace")
        except Exception:
            body = str(msg.get_payload())
    return body


# ============================================================
# 修复核心：ID 命令必须在 LOGIN 之前发送
# ============================================================
def send_imap_id(imap):
    """
    发送 IMAP ID 命令（163/188/QQ 邮箱需要，必须在 login() 之前调用）。
    使用底层 send/readline 绕过 imaplib 的登录状态检查。
    """
    try:
        tag = imap._new_tag()
        if isinstance(tag, bytes):
            tag = tag.decode()
        cmd = (
            f'{tag} ID ("name" "OpenChat" "contact" "{IMAP_USER}"'
            f' "version" "1.0.0" "vendor" "OpenChat")\r\n'
        )
        imap.send(cmd.encode())
        imap.readline()  # 读取 * ID (...) 响应行
        imap.readline()  # 读取 tag OK 响应行
    except Exception:
        pass


def get_imap_connection():
    """
    创建 IMAP 连接并预先发送 ID 命令。
    调用方在此之后执行 imap.login() 即可。
    """
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    send_imap_id(imap)  # ✅ ID 必须在 login 之前
    return imap


@server.list_tools()
async def list_tools() -> list[Tool]:
    """列出可用的邮件工具"""
    return [
        Tool(
            name="send_email",
            description="发送邮件。可以发送纯文本或 HTML 格式的邮件给一个或多个收件人。",
            inputSchema={
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "收件人邮箱地址，多个收件人用逗号分隔"},
                    "cc": {"type": "string", "description": "抄送邮箱地址，多个地址用逗号分隔（可选）"},
                    "bcc": {"type": "string", "description": "密送邮箱地址，多个地址用逗号分隔（可选）"},
                    "subject": {"type": "string", "description": "邮件主题"},
                    "body": {"type": "string", "description": "邮件正文内容"},
                    "html": {"type": "boolean", "description": "是否为 HTML 格式邮件，默认 false"}
                },
                "required": ["to", "subject", "body"]
            }
        ),
        Tool(
            name="list_emails",
            description="获取邮件列表。可以指定文件夹和筛选条件，返回邮件的基本信息（发件人、主题、日期等）。",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "邮箱文件夹名称，如 INBOX、Sent、Drafts、Trash 等，默认为 INBOX"},
                    "limit": {"type": "number", "description": "返回的邮件数量上限，默认 10"},
                    "unread_only": {"type": "boolean", "description": "是否只获取未读邮件，默认 false"},
                    "since": {"type": "string", "description": "获取此日期之后的邮件，格式：YYYY-MM-DD"},
                    "from_filter": {"type": "string", "description": "按发件人筛选，支持部分匹配"},
                    "subject_filter": {"type": "string", "description": "按主题筛选，支持部分匹配"}
                }
            }
        ),
        Tool(
            name="read_email",
            description="读取指定邮件的完整内容，包括正文和附件信息。",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "邮件所在的文件夹，默认 INBOX"},
                    "uid": {"type": ["string", "number"], "description": "邮件的 UID（从 list_emails 获取）"},
                    "mark_read": {"type": "boolean", "description": "读取后是否标记为已读，默认 true"}
                },
                "required": ["uid"]
            }
        ),
        Tool(
            name="delete_email",
            description="删除指定邮件。",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "邮件所在的文件夹，默认 INBOX"},
                    "uid": {"type": ["string", "number"], "description": "邮件的 UID"}
                },
                "required": ["uid"]
            }
        ),
        Tool(
            name="move_email",
            description="将邮件移动到另一个文件夹。",
            inputSchema={
                "type": "object",
                "properties": {
                    "source_folder": {"type": "string", "description": "源文件夹，默认 INBOX"},
                    "target_folder": {"type": "string", "description": "目标文件夹"},
                    "uid": {"type": ["string", "number"], "description": "邮件的 UID"}
                },
                "required": ["uid", "target_folder"]
            }
        ),
        Tool(
            name="search_emails",
            description="在邮件中搜索包含特定关键词的邮件。",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder": {"type": "string", "description": "要搜索的文件夹，默认 INBOX"},
                    "query": {"type": "string", "description": "搜索关键词，将在主题和正文中搜索"},
                    "limit": {"type": "number", "description": "返回结果数量上限，默认 20"}
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="list_folders",
            description="列出邮箱中所有可用的文件夹。",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="create_folder",
            description="创建新的邮箱文件夹。",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder_name": {"type": "string", "description": "要创建的文件夹名称"}
                },
                "required": ["folder_name"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """执行工具调用"""
    try:
        if name == "send_email":
            return await handle_send_email(arguments)
        elif name == "list_emails":
            return await handle_list_emails(arguments)
        elif name == "read_email":
            return await handle_read_email(arguments)
        elif name == "delete_email":
            return await handle_delete_email(arguments)
        elif name == "move_email":
            return await handle_move_email(arguments)
        elif name == "search_emails":
            return await handle_search_emails(arguments)
        elif name == "list_folders":
            return await handle_list_folders(arguments)
        elif name == "create_folder":
            return await handle_create_folder(arguments)
        else:
            return [TextContent(type="text", text=f"未知工具: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"执行错误: {str(e)}")]


async def handle_send_email(args: dict) -> list[TextContent]:
    """发送邮件"""
    to_addr = args.get("to", "")
    cc_addr = args.get("cc", "")
    bcc_addr = args.get("bcc", "")
    subject = args.get("subject", "")
    body = args.get("body", "")
    is_html = args.get("html", False)

    if not all([to_addr, subject, body]):
        return [TextContent(type="text", text="错误：缺少必要参数（to, subject, body）")]
    if not SMTP_USER or not SMTP_PASSWORD:
        return [TextContent(type="text", text="错误：SMTP 用户名或密码未配置")]

    msg = MIMEMultipart("alternative") if is_html else MIMEMultipart()
    msg["From"] = formataddr((SENDER_NAME, SMTP_USER)) if SENDER_NAME else SMTP_USER
    msg["To"] = to_addr
    if cc_addr:
        msg["Cc"] = cc_addr
    msg["Subject"] = subject

    if is_html:
        msg.attach(MIMEText(body, "html", "utf-8"))
    else:
        msg.attach(MIMEText(body, "plain", "utf-8"))

    all_recipients = [addr.strip() for addr in to_addr.split(",")]
    if cc_addr:
        all_recipients.extend([addr.strip() for addr in cc_addr.split(",")])
    if bcc_addr:
        all_recipients.extend([addr.strip() for addr in bcc_addr.split(",")])

    try:
        if SMTP_USE_TLS:
            smtp = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
        else:
            smtp = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)

        smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.sendmail(SMTP_USER, all_recipients, msg.as_string())
        smtp.quit()

        result = {
            "success": True,
            "message": f"邮件已成功发送给: {to_addr}",
            "recipients": all_recipients
        }
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    except smtplib.SMTPAuthenticationError:
        help_msg = "错误：SMTP 认证失败，请检查用户名和密码"
        if any(domain in SMTP_HOST for domain in ["163.com", "126.com", "188.com", "yeah.net"]):
            help_msg += get_netease_auth_help()
        return [TextContent(type="text", text=help_msg)]
    except smtplib.SMTPException as e:
        return [TextContent(type="text", text=f"SMTP 错误: {str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"发送失败: {str(e)}")]


def get_netease_auth_help() -> str:
    """获取网易邮箱授权码设置帮助信息"""
    return """
========================================
网易邮箱（163/126/188/yeah）授权码设置指南
========================================

错误原因：网易邮箱不允许使用账号密码直接登录 IMAP/SMTP，
必须使用「授权码」（应用专用密码）。

解决步骤：
1. 登录网易邮箱网页版（mail.188.com 或对应邮箱）
2. 点击顶部「设置」->「POP3/SMTP/IMAP」
3. 找到「IMAP/SMTP服务」，确保已开启
4. 点击「获取授权码」或「新增授权码」
5. 按提示发送短信验证
6. 获得一个16位的授权码（类似：ABCD1234EFGH5678）
7. 将此授权码设置为 IMAP_PASSWORD 环境变量

环境变量配置示例：
  IMAP_HOST=imap.188.com
  IMAP_PORT=993
  IMAP_USER=your_email@188.com
  IMAP_PASSWORD=ABCD1234EFGH5678  # 使用授权码，不是登录密码！
  SMTP_HOST=smtp.188.com
  SMTP_PORT=465
  SMTP_USE_TLS=false
  SMTP_USER=your_email@188.com
  SMTP_PASSWORD=ABCD1234EFGH5678  # 同样使用授权码

注意：授权码只在生成时显示一次，请妥善保存！
"""


async def handle_list_emails(args: dict) -> list[TextContent]:
    """获取邮件列表"""
    folder = args.get("folder", "INBOX")
    limit = min(args.get("limit", 10), 50)
    unread_only = args.get("unread_only", False)
    since = args.get("since", "")
    from_filter = args.get("from_filter", "")
    subject_filter = args.get("subject_filter", "")

    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)

        status, data = imap.select(folder)
        select_error_detail = str(data) if data else ""
        folders = None

        if status != "OK":
            list_status, folder_list = imap.list()
            if list_status == "OK" and folder_list:
                folders = folder_list
                for f in folders:
                    f_str = f.decode() if isinstance(f, bytes) else str(f)
                    if folder.upper() == "INBOX":
                        if "INBOX" in f_str.upper() or "收件箱" in f_str:
                            actual_folder = f_str.split('"')[-2] if '"' in f_str else f_str.split()[-1]
                            status, data = imap.select(actual_folder)
                            if status == "OK":
                                folder = actual_folder
                                break

        if status != "OK":
            error_detail = f"无法选择文件夹 '{folder}' (状态: {status}, 详情: {select_error_detail})"
            if "Unsafe Login" in select_error_detail or "unsafe" in select_error_detail.lower():
                error_detail += get_netease_auth_help()
            elif folders:
                error_detail += "\n\n可用的文件夹:\n" + "\n".join([
                    f.decode() if isinstance(f, bytes) else str(f) for f in folders[:10]
                ])
            else:
                error_detail += "\n\n请使用 list_folders 工具获取可用文件夹列表。"
            try:
                imap.logout()
            except Exception:
                pass
            return [TextContent(type="text", text=error_detail)]

        search_criteria = []
        if unread_only:
            search_criteria.append("UNSEEN")
        if since:
            search_criteria.append(f'(SINCE "{since}")')

        if search_criteria:
            status, data = imap.search(None, *search_criteria)
        else:
            status, data = imap.search(None, "ALL")

        if status != "OK":
            imap.logout()
            return [TextContent(type="text", text="搜索邮件失败")]

        email_ids = data[0].split()
        email_ids = email_ids[-limit:]

        emails = []
        for email_id in reversed(email_ids):
            status, msg_data = imap.fetch(email_id, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = Parser(policy=policy.default).parsestr(raw_email.decode("utf-8", errors="replace"))

            from_addr = decode_str(msg.get("From", ""))
            subject = decode_str(msg.get("Subject", ""))
            date = msg.get("Date", "")
            flags = msg_data[0][0].decode() if isinstance(msg_data[0][0], bytes) else str(msg_data[0][0])
            is_read = "\\Seen" in flags

            if from_filter and from_filter.lower() not in from_addr.lower():
                continue
            if subject_filter and subject_filter.lower() not in subject.lower():
                continue

            status, uid_data = imap.fetch(email_id, "UID")
            if status == "OK":
                uid_str = uid_data[0].decode() if isinstance(uid_data[0], bytes) else str(uid_data[0])
                match = re.search(r'UID\s+(\d+)', uid_str)
                uid = match.group(1) if match else email_id.decode()
            else:
                uid = email_id.decode()

            emails.append({
                "uid": uid,
                "from": from_addr,
                "subject": subject,
                "date": date,
                "read": is_read,
                "folder": folder
            })

        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "folder": folder,
            "count": len(emails),
            "emails": emails
        }, ensure_ascii=False, indent=2))]

    except imaplib.IMAP4.error as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"IMAP 错误: {str(e)}")]
    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"获取邮件列表失败: {str(e)}")]


async def handle_read_email(args: dict) -> list[TextContent]:
    """读取邮件内容"""
    folder = args.get("folder", "INBOX")
    uid = str(args.get("uid", ""))
    mark_read = args.get("mark_read", True)

    if not uid:
        return [TextContent(type="text", text="错误：缺少邮件 UID")]
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)
        imap.select(folder)

        if mark_read:
            status, msg_data = imap.uid("fetch", uid, "(BODY[])")
        else:
            status, msg_data = imap.uid("fetch", uid, "(BODY.PEEK[])")

        if status != "OK" or not msg_data[0]:
            imap.logout()
            return [TextContent(type="text", text="未找到该邮件")]

        raw_email = msg_data[0][1]
        msg = Parser(policy=policy.default).parsestr(raw_email.decode("utf-8", errors="replace"))

        from_addr = decode_str(msg.get("From", ""))
        to_addr = decode_str(msg.get("To", ""))
        cc_addr = decode_str(msg.get("Cc", ""))
        subject = decode_str(msg.get("Subject", ""))
        date = msg.get("Date", "")
        body = get_email_body(msg)

        attachments = []
        for part in msg.walk():
            content_disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in content_disposition:
                filename = part.get_filename()
                if filename:
                    attachments.append({
                        "filename": decode_str(filename),
                        "content_type": part.get_content_type(),
                        "size": len(part.get_payload(decode=True) or b"")
                    })

        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "uid": uid,
            "from": from_addr,
            "to": to_addr,
            "cc": cc_addr,
            "subject": subject,
            "date": date,
            "body": body[:5000] if len(body) > 5000 else body,
            "attachments": attachments,
            "folder": folder
        }, ensure_ascii=False, indent=2))]

    except imaplib.IMAP4.error as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"IMAP 错误: {str(e)}")]
    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"读取邮件失败: {str(e)}")]


async def handle_delete_email(args: dict) -> list[TextContent]:
    """删除邮件"""
    folder = args.get("folder", "INBOX")
    uid = str(args.get("uid", ""))

    if not uid:
        return [TextContent(type="text", text="错误：缺少邮件 UID")]
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)
        imap.select(folder)

        status, _ = imap.uid("store", uid, "+FLAGS", "\\Deleted")
        if status != "OK":
            imap.logout()
            return [TextContent(type="text", text="标记删除失败")]

        imap.expunge()
        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "message": f"邮件 (UID: {uid}) 已删除"
        }, ensure_ascii=False))]

    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"删除邮件失败: {str(e)}")]


async def handle_move_email(args: dict) -> list[TextContent]:
    """移动邮件到其他文件夹"""
    source_folder = args.get("source_folder", "INBOX")
    target_folder = args.get("target_folder", "")
    uid = str(args.get("uid", ""))

    if not uid or not target_folder:
        return [TextContent(type="text", text="错误：缺少 UID 或目标文件夹")]
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)
        imap.select(source_folder)

        status, _ = imap.uid("copy", uid, target_folder)
        if status != "OK":
            imap.logout()
            return [TextContent(type="text", text=f"复制到 {target_folder} 失败")]

        imap.uid("store", uid, "+FLAGS", "\\Deleted")
        imap.expunge()
        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "message": f"邮件已从 {source_folder} 移动到 {target_folder}"
        }, ensure_ascii=False))]

    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"移动邮件失败: {str(e)}")]


async def handle_search_emails(args: dict) -> list[TextContent]:
    """搜索邮件"""
    folder = args.get("folder", "INBOX")
    query = args.get("query", "")
    limit = min(args.get("limit", 20), 50)

    if not query:
        return [TextContent(type="text", text="错误：缺少搜索关键词")]
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)
        imap.select(folder)

        status, data = imap.search(None, f'OR SUBJECT "{query}" BODY "{query}"')
        if status != "OK":
            imap.logout()
            return [TextContent(type="text", text="搜索失败")]

        email_ids = data[0].split()[-limit:]

        emails = []
        for email_id in reversed(email_ids):
            status, msg_data = imap.fetch(email_id, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = Parser(policy=policy.default).parsestr(raw_email.decode("utf-8", errors="replace"))

            status, uid_data = imap.fetch(email_id, "UID")
            if status == "OK":
                uid_str = uid_data[0].decode() if isinstance(uid_data[0], bytes) else str(uid_data[0])
                match = re.search(r'UID\s+(\d+)', uid_str)
                uid = match.group(1) if match else email_id.decode()
            else:
                uid = email_id.decode()
            flags = msg_data[0][0].decode() if isinstance(msg_data[0][0], bytes) else str(msg_data[0][0])

            emails.append({
                "uid": uid,
                "from": decode_str(msg.get("From", "")),
                "subject": decode_str(msg.get("Subject", "")),
                "date": msg.get("Date", ""),
                "read": "\\Seen" in flags
            })

        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "query": query,
            "folder": folder,
            "count": len(emails),
            "emails": emails
        }, ensure_ascii=False, indent=2))]

    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"搜索失败: {str(e)}")]


async def handle_list_folders(args: dict) -> list[TextContent]:
    """列出所有文件夹"""
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)

        status, folders = imap.list()
        if status != "OK":
            imap.logout()
            return [TextContent(type="text", text=f"获取文件夹列表失败: status={status}")]

        folder_list = []
        raw_folders = []
        for folder in folders:
            if folder:
                raw_str = folder.decode() if isinstance(folder, bytes) else str(folder)
                raw_folders.append(raw_str)
                try:
                    if '"' in raw_str:
                        parts = raw_str.split('"')
                        folder_name = parts[-2] if len(parts) >= 2 else raw_str.split()[-1]
                    else:
                        folder_name = raw_str.split()[-1]
                    folder_list.append(folder_name)
                except Exception:
                    folder_list.append(raw_str)

        imap.logout()
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "folders": folder_list,
            "raw": raw_folders,
            "host": IMAP_HOST,
            "user": IMAP_USER
        }, ensure_ascii=False, indent=2))]

    except imaplib.IMAP4.error as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"IMAP 错误: {str(e)}")]
    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"获取文件夹列表失败: {str(e)}")]


async def handle_create_folder(args: dict) -> list[TextContent]:
    """创建文件夹"""
    folder_name = args.get("folder_name", "")

    if not folder_name:
        return [TextContent(type="text", text="错误：缺少文件夹名称")]
    if not IMAP_USER or not IMAP_PASSWORD:
        return [TextContent(type="text", text="错误：IMAP 用户名或密码未配置")]

    imap = None
    try:
        # ✅ 修复：先发 ID，再 login
        imap = get_imap_connection()
        imap.login(IMAP_USER, IMAP_PASSWORD)

        status, _ = imap.create(folder_name)
        imap.logout()

        if status == "OK":
            return [TextContent(type="text", text=json.dumps({
                "success": True,
                "message": f"文件夹 '{folder_name}' 创建成功"
            }, ensure_ascii=False))]
        else:
            return [TextContent(type="text", text="创建文件夹失败")]

    except Exception as e:
        if imap:
            try:
                imap.logout()
            except Exception:
                pass
        return [TextContent(type="text", text=f"创建文件夹失败: {str(e)}")]


async def main():
    """启动 MCP 服务器"""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


def run():
    """Entry point for uvx/pip installed script."""
    asyncio.run(main())


if __name__ == "__main__":
    run()