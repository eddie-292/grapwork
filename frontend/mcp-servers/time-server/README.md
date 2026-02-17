# Time MCP Server

时间工具 MCP 服务器，提供时区转换、时间计算、格式化等功能。

## 功能

- **获取当前时间** - 支持多种时区和输出格式
- **时区转换** - 将时间从一个时区转换到另一个时区
- **时间差计算** - 计算两个时间之间的差值
- **时间加减** - 在指定时间上增加或减少时间间隔
- **时间格式化** - 将时间格式化为指定格式
- **时区信息** - 获取时区详细信息和 UTC 偏移
- **列出时区** - 列出常用时区及其当前时间
- **时间比较** - 比较两个时间的先后顺序
- **星期查询** - 获取指定日期是星期几
- **倒计时** - 计算到目标时间的倒计时

## 安装

### 方法一：使用 uvx（推荐）

```bash
uvx --from /path/to/openchat/frontend/mcp-servers/time-server time_server
```

### 方法二：安装依赖后运行

```bash
cd frontend/mcp-servers/time-server
pip install -r requirements.txt
python time_server.py
```

## 在 OpenChat Desktop 中配置

进入 设置 → MCP，添加新服务器：

```json
{
  "name": "Time Server",
  "transportType": "stdio",
  "command": "uvx",
  "args": ["--from", "/path/to/openchat/frontend/mcp-servers/time-server", "time_server"],
  "enabled": true
}
```

或使用 python 直接运行：

```json
{
  "name": "Time Server",
  "transportType": "stdio",
  "command": "python",
  "args": ["/path/to/openchat/frontend/mcp-servers/time-server/time_server.py"],
  "enabled": true
}
```

## 可用工具

| 工具名称 | 描述 | 主要参数 |
|---------|------|---------|
| `get_current_time` | 获取当前时间 | timezone, format |
| `convert_timezone` | 转换时区 | time, from_timezone, to_timezone |
| `calculate_time_difference` | 计算时间差 | start_time, end_time, unit |
| `add_time` | 时间加减 | time, years, months, days, hours, minutes, seconds |
| `format_time` | 格式化时间 | time, format, locale_format |
| `get_timezone_info` | 获取时区信息 | timezone |
| `list_timezones` | 列出时区 | filter, limit |
| `compare_times` | 比较时间 | time1, time2 |
| `get_weekday` | 获取星期几 | time, language |
| `countdown` | 倒计时 | target_time |

## 使用示例

在 OpenChat Desktop 中与 AI 对话时：

### 获取当前时间

```
现在北京时间几点？
东京现在几点？
```

### 时区转换

```
北京时间下午3点，纽约是几点？
把 2024-01-15 10:00:00 从 UTC 转换到伦敦时间
```

### 时间计算

```
距离2025年1月1日还有多少天？
现在到今晚8点还有多长时间？
```

### 时间加减

```
3天后的这个时候是几点？
100小时后是哪天？
上个月的今天是几号？
```

### 格式化

```
把当前时间格式化成中文格式
用 "2024年12月25日" 的格式显示现在的时间
```

### 比较时间

```
2024-01-01 和 2024-12-31 哪个更早？
这个时间是过去还是未来？
```

### 星期查询

```
2024年12月25日是星期几？
今天周几？
```

## 支持的时区

常用时区别名：

| 别名 | IANA 时区 |
|-----|----------|
| Beijing, Shanghai | Asia/Shanghai |
| HongKong | Asia/Hong_Kong |
| Tokyo | Asia/Tokyo |
| Seoul | Asia/Seoul |
| Singapore | Asia/Singapore |
| Sydney | Australia/Sydney |
| Moscow | Europe/Moscow |
| London | Europe/London |
| Paris | Europe/Paris |
| Berlin | Europe/Berlin |
| NewYork | America/New_York |
| LosAngeles | America/Los_Angeles |
| Chicago | America/Chicago |
| Toronto | America/Toronto |
| Dubai | Asia/Dubai |
| Mumbai, Kolkata | Asia/Kolkata |
| Auckland | Pacific/Auckland |
| Hawaii | Pacific/Honolulu |

也支持完整的 IANA 时区名称，如 `America/Los_Angeles`、`Europe/Berlin` 等。

## 格式化占位符

常用格式占位符：

| 占位符 | 含义 | 示例 |
|-------|------|------|
| %Y | 年（4位） | 2024 |
| %m | 月（2位） | 01-12 |
| %d | 日（2位） | 01-31 |
| %H | 小时（24小时制） | 00-23 |
| %M | 分钟 | 00-59 |
| %S | 秒 | 00-59 |
| %I | 小时（12小时制） | 01-12 |
| %p | AM/PM | AM, PM |
| %A | 星期几（全称） | Monday |
| %a | 星期几（缩写） | Mon |
| %B | 月份（全称） | January |
| %b | 月份（缩写） | Jan |

示例格式：
- `%Y-%m-%d %H:%M:%S` → `2024-12-25 15:30:00`
- `%Y年%m月%d日` → `2024年12月25日`
- `%B %d, %Y %I:%M %p` → `December 25, 2024 03:30 PM`

## 技术细节

- 使用 Python 标准库 `datetime` 和 `zoneinfo`
- 支持 ISO 8601 格式和多种常见日期格式
- 自动处理夏令时（DST）
- 所有时间计算都考虑时区信息

## 故障排除

### 时区不支持

如果收到时区错误，请使用完整的 IANA 时区名称：
- 正确：`America/New_York`
- 错误：`EST`、`US/Eastern`

### 时间解析失败

确保时间格式符合以下之一：
- ISO 8601：`2024-12-25T15:30:00`
- 常见格式：`2024-12-25 15:30:00`、`2024/12/25`

### Python 版本问题

需要 Python 3.10+ 才能使用 `zoneinfo` 模块。

## 开发

```bash
# 测试服务器
python time_server.py

# 安装到本地
pip install -e .
```
