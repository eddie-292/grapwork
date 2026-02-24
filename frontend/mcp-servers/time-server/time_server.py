#!/usr/bin/env python3
"""
Time MCP Server - 时间工具 MCP 服务器
提供时间获取、时区转换、时间计算等功能
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

# MCP SDK
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# 创建 MCP 服务器实例
server = Server("time-server")

# 常用时区映射
COMMON_TIMEZONES = {
    "UTC": "UTC",
    "GMT": "GMT",
    "Beijing": "Asia/Shanghai",
    "Shanghai": "Asia/Shanghai",
    "HongKong": "Asia/Hong_Kong",
    "Tokyo": "Asia/Tokyo",
    "Seoul": "Asia/Seoul",
    "Singapore": "Asia/Singapore",
    "Sydney": "Australia/Sydney",
    "Moscow": "Europe/Moscow",
    "London": "Europe/London",
    "Paris": "Europe/Paris",
    "Berlin": "Europe/Berlin",
    "NewYork": "America/New_York",
    "LosAngeles": "America/Los_Angeles",
    "Chicago": "America/Chicago",
    "Toronto": "America/Toronto",
    "Vancouver": "America/Vancouver",
    "SaoPaulo": "America/Sao_Paulo",
    "Dubai": "Asia/Dubai",
    "Mumbai": "Asia/Kolkata",
    "Kolkata": "Asia/Kolkata",
    "Bangkok": "Asia/Bangkok",
    "Jakarta": "Asia/Jakarta",
    "Auckland": "Pacific/Auckland",
    "Hawaii": "Pacific/Honolulu",
}


def get_timezone(tz_name: str) -> timezone:
    """获取时区对象，支持常用名称和 IANA 时区名"""
    if not tz_name:
        return timezone.utc

    # 检查是否是常用时区别名
    iana_tz = COMMON_TIMEZONES.get(tz_name, tz_name)

    try:
        return ZoneInfo(iana_tz)
    except Exception:
        # 回退到 UTC
        return timezone.utc


def format_datetime(dt: datetime, fmt: Optional[str] = None) -> str:
    """格式化日期时间"""
    if fmt:
        return dt.strftime(fmt)

    # 默认格式：ISO 8601
    return dt.isoformat()


def parse_datetime(dt_str: str, tz_name: Optional[str] = None) -> Optional[datetime]:
    """解析日期时间字符串"""
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
    ]

    # 首先尝试 ISO 格式
    try:
        # 处理带时区的 ISO 格式
        if "+" in dt_str or dt_str.endswith("Z"):
            dt_str_normalized = dt_str.replace("Z", "+00:00")
            return datetime.fromisoformat(dt_str_normalized)
    except ValueError:
        pass

    # 尝试各种格式
    for fmt in formats:
        try:
            dt = datetime.strptime(dt_str, fmt)
            if tz_name:
                tz = get_timezone(tz_name)
                dt = dt.replace(tzinfo=tz)
            return dt
        except ValueError:
            continue

    return None


@server.list_tools()
async def list_tools() -> list[Tool]:
    """列出可用的时间工具"""
    return [
        Tool(
            name="get_current_time",
            description="获取当前时间。支持指定时区，返回多种格式的日期时间信息。",
            inputSchema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "时区名称，如 'Beijing'、'UTC'、'America/New_York' 等。默认为本地时区。"
                    },
                    "format": {
                        "type": "string",
                        "description": "输出格式，可选 'iso'、'readable'、'date'、'time'、'unix'。默认为 'iso'。"
                    }
                }
            }
        ),
        Tool(
            name="convert_timezone",
            description="将时间从一个时区转换到另一个时区。支持多种输入格式。",
            inputSchema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "要转换的时间，可以是 ISO 格式或常见日期格式。不指定则使用当前时间。"
                    },
                    "from_timezone": {
                        "type": "string",
                        "description": "源时区名称。默认为 UTC。"
                    },
                    "to_timezone": {
                        "type": "string",
                        "description": "目标时区名称。默认为本地时区。"
                    }
                },
                "required": ["to_timezone"]
            }
        ),
        Tool(
            name="calculate_time_difference",
            description="计算两个时间之间的差值，或计算与当前时间的差值。",
            inputSchema={
                "type": "object",
                "properties": {
                    "start_time": {
                        "type": "string",
                        "description": "开始时间。不指定则使用当前时间。"
                    },
                    "end_time": {
                        "type": "string",
                        "description": "结束时间。不指定则使用当前时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    },
                    "unit": {
                        "type": "string",
                        "description": "输出单位，可选 'seconds'、'minutes'、'hours'、'days'、'all'。默认为 'all'。",
                        "enum": ["seconds", "minutes", "hours", "days", "all"]
                    }
                }
            }
        ),
        Tool(
            name="add_time",
            description="在指定时间上增加或减少时间间隔。",
            inputSchema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "基准时间。不指定则使用当前时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    },
                    "years": {
                        "type": "number",
                        "description": "年数（可为负数）。默认 0。"
                    },
                    "months": {
                        "type": "number",
                        "description": "月数（可为负数）。默认 0。"
                    },
                    "days": {
                        "type": "number",
                        "description": "天数（可为负数）。默认 0。"
                    },
                    "hours": {
                        "type": "number",
                        "description": "小时数（可为负数）。默认 0。"
                    },
                    "minutes": {
                        "type": "number",
                        "description": "分钟数（可为负数）。默认 0。"
                    },
                    "seconds": {
                        "type": "number",
                        "description": "秒数（可为负数）。默认 0。"
                    }
                }
            }
        ),
        Tool(
            name="format_time",
            description="将时间格式化为指定的字符串格式。支持自定义格式字符串。",
            inputSchema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "要格式化的时间。不指定则使用当前时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    },
                    "format": {
                        "type": "string",
                        "description": "格式字符串。如 '%Y-%m-%d %H:%M:%S'、'%Y年%m月%d日' 等。默认为 ISO 格式。"
                    },
                    "locale_format": {
                        "type": "string",
                        "description": "预设格式：'iso'、'date'、'time'、'datetime'、'readable'、'chinese'。优先于 format 参数。",
                        "enum": ["iso", "date", "time", "datetime", "readable", "chinese"]
                    }
                }
            }
        ),
        Tool(
            name="get_timezone_info",
            description="获取指定时区的详细信息，包括当前时间、UTC偏移量、夏令时状态等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    }
                }
            }
        ),
        Tool(
            name="list_timezones",
            description="列出常用时区及其当前时间。",
            inputSchema={
                "type": "object",
                "properties": {
                    "filter": {
                        "type": "string",
                        "description": "筛选时区名称（支持部分匹配）。"
                    },
                    "limit": {
                        "type": "number",
                        "description": "返回数量限制。默认 20，最大 50。"
                    }
                }
            }
        ),
        Tool(
            name="compare_times",
            description="比较两个时间的先后顺序。",
            inputSchema={
                "type": "object",
                "properties": {
                    "time1": {
                        "type": "string",
                        "description": "第一个时间。"
                    },
                    "time2": {
                        "type": "string",
                        "description": "第二个时间。不指定则使用当前时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    }
                },
                "required": ["time1"]
            }
        ),
        Tool(
            name="get_weekday",
            description="获取指定日期是星期几。",
            inputSchema={
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "日期时间。不指定则使用当前时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    },
                    "language": {
                        "type": "string",
                        "description": "输出语言：'en' 英文、'zh' 中文。默认 'zh'。",
                        "enum": ["en", "zh"]
                    }
                }
            }
        ),
        Tool(
            name="countdown",
            description="计算到目标时间的倒计时。",
            inputSchema={
                "type": "object",
                "properties": {
                    "target_time": {
                        "type": "string",
                        "description": "目标时间。"
                    },
                    "timezone": {
                        "type": "string",
                        "description": "时区名称。默认为本地时区。"
                    }
                },
                "required": ["target_time"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """执行工具调用"""
    try:
        if name == "get_current_time":
            return await handle_get_current_time(arguments)
        elif name == "convert_timezone":
            return await handle_convert_timezone(arguments)
        elif name == "calculate_time_difference":
            return await handle_calculate_time_difference(arguments)
        elif name == "add_time":
            return await handle_add_time(arguments)
        elif name == "format_time":
            return await handle_format_time(arguments)
        elif name == "get_timezone_info":
            return await handle_get_timezone_info(arguments)
        elif name == "list_timezones":
            return await handle_list_timezones(arguments)
        elif name == "compare_times":
            return await handle_compare_times(arguments)
        elif name == "get_weekday":
            return await handle_get_weekday(arguments)
        elif name == "countdown":
            return await handle_countdown(arguments)
        else:
            return [TextContent(type="text", text=f"未知工具: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"执行错误: {str(e)}")]


async def handle_get_current_time(args: dict) -> list[TextContent]:
    """获取当前时间"""
    tz_name = args.get("timezone", "")
    fmt = args.get("format", "iso")

    tz = get_timezone(tz_name) if tz_name else None
    now = datetime.now(tz) if tz else datetime.now()

    if fmt == "unix":
        result = int(now.timestamp())
        return [TextContent(type="text", text=json.dumps({
            "success": True,
            "unix_timestamp": result,
            "timezone": str(now.tzinfo) if now.tzinfo else "local"
        }, ensure_ascii=False))]

    result = {
        "success": True,
        "iso": now.isoformat(),
        "timezone": str(now.tzinfo) if now.tzinfo else "local",
    }

    if fmt in ("readable", "all"):
        result["readable"] = now.strftime("%Y年%m月%d日 %H:%M:%S")
        result["readable_en"] = now.strftime("%B %d, %Y %I:%M:%S %p")
    if fmt in ("date", "all"):
        result["date"] = now.strftime("%Y-%m-%d")
    if fmt in ("time", "all"):
        result["time"] = now.strftime("%H:%M:%S")

    # 默认返回所有格式
    if fmt == "iso":
        result["readable"] = now.strftime("%Y年%m月%d日 %H:%M:%S")
        result["readable_en"] = now.strftime("%B %d, %Y %I:%M:%S %p")
        result["date"] = now.strftime("%Y-%m-%d")
        result["time"] = now.strftime("%H:%M:%S")
        result["unix"] = int(now.timestamp())

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_convert_timezone(args: dict) -> list[TextContent]:
    """转换时区"""
    time_str = args.get("time", "")
    from_tz_name = args.get("from_timezone", "UTC")
    to_tz_name = args.get("to_timezone", "")

    if not to_tz_name:
        return [TextContent(type="text", text="错误：必须指定目标时区")]

    from_tz = get_timezone(from_tz_name)
    to_tz = get_timezone(to_tz_name)

    if time_str:
        dt = parse_datetime(time_str, from_tz_name)
        if dt is None:
            return [TextContent(type="text", text=f"错误：无法解析时间 '{time_str}'")]
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=from_tz)
    else:
        dt = datetime.now(from_tz)

    converted = dt.astimezone(to_tz)

    result = {
        "success": True,
        "original_time": dt.isoformat(),
        "original_timezone": str(dt.tzinfo),
        "converted_time": converted.isoformat(),
        "converted_timezone": str(converted.tzinfo),
        "readable": converted.strftime("%Y年%m月%d日 %H:%M:%S"),
        "readable_en": converted.strftime("%B %d, %Y %I:%M:%S %p")
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_calculate_time_difference(args: dict) -> list[TextContent]:
    """计算时间差"""
    start_str = args.get("start_time", "")
    end_str = args.get("end_time", "")
    tz_name = args.get("timezone", "")
    unit = args.get("unit", "all")

    tz = get_timezone(tz_name) if tz_name else None

    if start_str:
        start_dt = parse_datetime(start_str, tz_name)
        if start_dt is None:
            return [TextContent(type="text", text=f"错误：无法解析开始时间 '{start_str}'")]
    else:
        start_dt = datetime.now(tz) if tz else datetime.now()

    if end_str:
        end_dt = parse_datetime(end_str, tz_name)
        if end_dt is None:
            return [TextContent(type="text", text=f"错误：无法解析结束时间 '{end_str}'")]
    else:
        end_dt = datetime.now(tz) if tz else datetime.now()

    if start_dt.tzinfo is None and end_dt.tzinfo is None:
        pass
    elif start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=end_dt.tzinfo)
    elif end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=start_dt.tzinfo)

    diff = end_dt - start_dt
    total_seconds = int(diff.total_seconds())

    result = {
        "success": True,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "direction": "future" if total_seconds >= 0 else "past"
    }

    if unit in ("seconds", "all"):
        result["seconds"] = abs(total_seconds)
    if unit in ("minutes", "all"):
        result["minutes"] = abs(total_seconds / 60)
    if unit in ("hours", "all"):
        result["hours"] = abs(total_seconds / 3600)
    if unit in ("days", "all"):
        result["days"] = abs(total_seconds / 86400)

    # 人类可读格式
    if unit == "all":
        abs_seconds = abs(total_seconds)
        days = abs_seconds // 86400
        hours = (abs_seconds % 86400) // 3600
        minutes = (abs_seconds % 3600) // 60
        seconds = abs_seconds % 60

        parts = []
        if days > 0:
            parts.append(f"{days}天")
        if hours > 0:
            parts.append(f"{hours}小时")
        if minutes > 0:
            parts.append(f"{minutes}分钟")
        if seconds > 0 or not parts:
            parts.append(f"{seconds}秒")

        result["human_readable"] = "".join(parts)
        result["human_readable_en"] = f"{days}d {hours}h {minutes}m {seconds}s"

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_add_time(args: dict) -> list[TextContent]:
    """时间加减"""
    time_str = args.get("time", "")
    tz_name = args.get("timezone", "")

    years = args.get("years", 0)
    months = args.get("months", 0)
    days = args.get("days", 0)
    hours = args.get("hours", 0)
    minutes = args.get("minutes", 0)
    seconds = args.get("seconds", 0)

    tz = get_timezone(tz_name) if tz_name else None

    if time_str:
        dt = parse_datetime(time_str, tz_name)
        if dt is None:
            return [TextContent(type="text", text=f"错误：无法解析时间 '{time_str}'")]
    else:
        dt = datetime.now(tz) if tz else datetime.now()

    original = dt.isoformat()

    # 处理年和月（需要特殊处理）
    if years or months:
        new_year = dt.year + int(years)
        new_month = dt.month + int(months)

        # 处理月份溢出
        while new_month > 12:
            new_month -= 12
            new_year += 1
        while new_month < 1:
            new_month += 12
            new_year -= 1

        # 处理日期溢出（如 1月31日 + 1月 = 2月28/29日）
        import calendar
        max_day = calendar.monthrange(new_year, new_month)[1]
        new_day = min(dt.day, max_day)

        dt = dt.replace(year=new_year, month=new_month, day=new_day)

    # 处理天、小时、分钟、秒
    dt = dt + timedelta(days=int(days), hours=int(hours), minutes=int(minutes), seconds=int(seconds))

    result = {
        "success": True,
        "original_time": original,
        "result_time": dt.isoformat(),
        "readable": dt.strftime("%Y年%m月%d日 %H:%M:%S"),
        "readable_en": dt.strftime("%B %d, %Y %I:%M:%S %p"),
        "added": {
            "years": years,
            "months": months,
            "days": days,
            "hours": hours,
            "minutes": minutes,
            "seconds": seconds
        }
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_format_time(args: dict) -> list[TextContent]:
    """格式化时间"""
    time_str = args.get("time", "")
    tz_name = args.get("timezone", "")
    fmt = args.get("format", "")
    locale_format = args.get("locale_format", "")

    tz = get_timezone(tz_name) if tz_name else None

    if time_str:
        dt = parse_datetime(time_str, tz_name)
        if dt is None:
            return [TextContent(type="text", text=f"错误：无法解析时间 '{time_str}'")]
    else:
        dt = datetime.now(tz) if tz else datetime.now()

    # 预设格式
    if locale_format:
        formats = {
            "iso": "%Y-%m-%dT%H:%M:%S%z",
            "date": "%Y-%m-%d",
            "time": "%H:%M:%S",
            "datetime": "%Y-%m-%d %H:%M:%S",
            "readable": "%B %d, %Y %I:%M:%S %p",
            "chinese": "%Y年%m月%d日 %H:%M:%S"
        }
        fmt = formats.get(locale_format, "%Y-%m-%d %H:%M:%S")

    if not fmt:
        fmt = "%Y-%m-%dT%H:%M:%S%z"

    formatted = dt.strftime(fmt)

    result = {
        "success": True,
        "original_time": time_str if time_str else "now",
        "timezone": str(dt.tzinfo) if dt.tzinfo else "local",
        "format": fmt,
        "formatted": formatted
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_get_timezone_info(args: dict) -> list[TextContent]:
    """获取时区信息"""
    tz_name = args.get("timezone", "")

    if not tz_name:
        tz = datetime.now().astimezone().tzinfo
    else:
        tz = get_timezone(tz_name)

    now = datetime.now(tz)

    # 计算 UTC 偏移
    offset = now.strftime("%z")
    offset_hours = int(offset[:3])
    offset_minutes = int(offset[0] + offset[3:5])

    # 检查夏令时（简化判断）
    is_dst = False
    try:
        import time
        if hasattr(tz, 'dst'):
            dst_delta = tz.dst(now) if hasattr(tz, 'dst') else None
            is_dst = dst_delta is not None and dst_delta.total_seconds() != 0
    except Exception:
        pass

    result = {
        "success": True,
        "timezone": str(tz),
        "current_time": now.isoformat(),
        "current_time_readable": now.strftime("%Y年%m月%d日 %H:%M:%S"),
        "utc_offset": offset,
        "utc_offset_hours": offset_hours,
        "utc_offset_minutes": offset_minutes,
        "is_dst": is_dst,
        "utc_offset_formatted": f"UTC{'+' if offset_hours >= 0 else ''}{offset_hours}:{abs(offset_minutes):02d}"
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_list_timezones(args: dict) -> list[TextContent]:
    """列出常用时区"""
    filter_str = args.get("filter", "").lower()
    limit = min(args.get("limit", 20), 50)

    now = datetime.now(timezone.utc)
    timezones = []

    for name, iana in COMMON_TIMEZONES.items():
        if filter_str and filter_str not in name.lower() and filter_str not in iana.lower():
            continue

        try:
            tz = ZoneInfo(iana)
            local_time = now.astimezone(tz)
            offset = local_time.strftime("%z")

            timezones.append({
                "name": name,
                "iana": iana,
                "current_time": local_time.strftime("%H:%M:%S"),
                "date": local_time.strftime("%Y-%m-%d"),
                "utc_offset": f"UTC{'+' if int(offset[:3]) >= 0 else ''}{int(offset[:3])}"
            })
        except Exception:
            continue

        if len(timezones) >= limit:
            break

    result = {
        "success": True,
        "count": len(timezones),
        "timezones": timezones
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_compare_times(args: dict) -> list[TextContent]:
    """比较两个时间"""
    time1_str = args.get("time1", "")
    time2_str = args.get("time2", "")
    tz_name = args.get("timezone", "")

    if not time1_str:
        return [TextContent(type="text", text="错误：必须指定 time1")]

    tz = get_timezone(tz_name) if tz_name else None

    dt1 = parse_datetime(time1_str, tz_name)
    if dt1 is None:
        return [TextContent(type="text", text=f"错误：无法解析时间 '{time1_str}'")]

    if time2_str:
        dt2 = parse_datetime(time2_str, tz_name)
        if dt2 is None:
            return [TextContent(type="text", text=f"错误：无法解析时间 '{time2_str}'")]
    else:
        dt2 = datetime.now(tz) if tz else datetime.now()

    # 统一时区
    if dt1.tzinfo is None and dt2.tzinfo is None:
        pass
    elif dt1.tzinfo is None:
        dt1 = dt1.replace(tzinfo=dt2.tzinfo)
    elif dt2.tzinfo is None:
        dt2 = dt2.replace(tzinfo=dt1.tzinfo)

    if dt1 < dt2:
        comparison = "before"
        comparison_zh = "早于"
    elif dt1 > dt2:
        comparison = "after"
        comparison_zh = "晚于"
    else:
        comparison = "equal"
        comparison_zh = "等于"

    diff = dt2 - dt1
    total_seconds = int(diff.total_seconds())

    result = {
        "success": True,
        "time1": dt1.isoformat(),
        "time2": dt2.isoformat(),
        "comparison": comparison,
        "comparison_zh": comparison_zh,
        "difference_seconds": abs(total_seconds),
        "difference_human": f"{abs(total_seconds // 3600)}小时{(abs(total_seconds) % 3600) // 60}分钟"
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_get_weekday(args: dict) -> list[TextContent]:
    """获取星期几"""
    time_str = args.get("time", "")
    tz_name = args.get("timezone", "")
    language = args.get("language", "zh")

    tz = get_timezone(tz_name) if tz_name else None

    if time_str:
        dt = parse_datetime(time_str, tz_name)
        if dt is None:
            return [TextContent(type="text", text=f"错误：无法解析时间 '{time_str}'")]
    else:
        dt = datetime.now(tz) if tz else datetime.now()

    weekday_num = dt.weekday()  # 0=Monday

    weekdays = {
        "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "zh": ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    }

    weekday_short = {
        "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "zh": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    }

    result = {
        "success": True,
        "date": dt.strftime("%Y-%m-%d"),
        "weekday_number": weekday_num,
        "weekday": weekdays[language][weekday_num],
        "weekday_short": weekday_short[language][weekday_num],
        "is_weekend": weekday_num >= 5,
        "time": dt.strftime("%H:%M:%S")
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


async def handle_countdown(args: dict) -> list[TextContent]:
    """计算倒计时"""
    target_str = args.get("target_time", "")
    tz_name = args.get("timezone", "")

    if not target_str:
        return [TextContent(type="text", text="错误：必须指定目标时间")]

    tz = get_timezone(tz_name) if tz_name else None

    target_dt = parse_datetime(target_str, tz_name)
    if target_dt is None:
        return [TextContent(type="text", text=f"错误：无法解析时间 '{target_str}'")]

    now = datetime.now(tz) if tz else datetime.now()

    # 统一时区
    if target_dt.tzinfo is None and now.tzinfo is None:
        pass
    elif target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=now.tzinfo)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=target_dt.tzinfo)

    diff = target_dt - now
    total_seconds = int(diff.total_seconds())

    if total_seconds < 0:
        status = "past"
        total_seconds = abs(total_seconds)
    else:
        status = "future"

    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    result = {
        "success": True,
        "target_time": target_dt.isoformat(),
        "current_time": now.isoformat(),
        "status": status,
        "countdown": {
            "days": days,
            "hours": hours,
            "minutes": minutes,
            "seconds": seconds
        },
        "total_seconds": total_seconds,
        "human_readable": f"{days}天 {hours}小时 {minutes}分钟 {seconds}秒",
        "human_readable_short": f"{days}d {hours}h {minutes}m {seconds}s"
    }

    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


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
