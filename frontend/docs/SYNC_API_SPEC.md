# 云同步接口开发规范

本文档描述了 GrapWork 云同步功能所需的远程同步接口规范。

## 1. 概述

云同步功能允许用户将本地配置数据同步到自建的云端服务器，实现跨设备数据共享。

## 2. API 端点

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/health` | GET | 健康检查 | 否 |
| `/sync/data` | GET | 批量获取所有数据 | 是 |
| `/sync/data` | POST | 批量上传数据 | 是 |
| `/sync/data/{key}` | GET | 获取单个数据 | 是 |
| `/sync/data/{key}` | PUT | 更新单个数据 | 是 |
| `/sync/data/{key}` | DELETE | 删除单个数据 | 是 |

## 3. 认证方式

所有 `/sync/*` 接口需要在请求头中携带 Bearer Token：

```
Authorization: Bearer <your-api-token>
```

## 4. 请求与响应格式

### 4.1 健康检查

**请求**
```http
GET /health
```

**响应**
```json
{
  "success": true,
  "timestamp": 1710123456789
}
```

### 4.2 批量获取数据

**请求**
```http
GET /sync/data
Authorization: Bearer <token>
```

**响应**
```json
{
  "success": true,
  "data": {
    "llm-config-list": {
      "key": "llm-config-list",
      "value": { ... },
      "timestamp": 1710123456789
    },
    "mcp-server-list": {
      "key": "mcp-server-list",
      "value": { ... },
      "timestamp": 1710123456789
    }
  },
  "timestamp": 1710123457000
}
```

### 4.3 批量上传数据

**请求**
```http
POST /sync/data
Content-Type: application/json
Authorization: Bearer <token>

{
  "entries": [
    {
      "key": "llm-config-list",
      "value": { ... },
      "timestamp": 1710123456789
    },
    {
      "key": "mcp-server-list",
      "value": { ... },
      "timestamp": 1710123456789
    }
  ]
}
```

**响应**
```json
{
  "success": true,
  "timestamp": 1710123457000
}
```

### 4.4 获取单个数据

**请求**
```http
GET /sync/data/llm-config-list
Authorization: Bearer <token>
```

**响应**
```json
{
  "success": true,
  "data": {
    "key": "llm-config-list",
    "value": { ... },
    "timestamp": 1710123456789
  },
  "timestamp": 1710123457000
}
```

### 4.5 更新单个数据

**请求**
```http
PUT /sync/data/llm-config-list
Content-Type: application/json
Authorization: Bearer <token>

{
  "key": "llm-config-list",
  "value": { ... },
  "timestamp": 1710123456789
}
```

**响应**
```json
{
  "success": true,
  "timestamp": 1710123457000
}
```

### 4.6 删除单个数据

**请求**
```http
DELETE /sync/data/llm-config-list
Authorization: Bearer <token>
```

**响应**
```json
{
  "success": true,
  "timestamp": 1710123457000
}
```

## 5. 错误响应

所有错误响应格式统一如下：

```json
{
  "success": false,
  "error": "错误描述信息",
  "timestamp": 1710123456789
}
```

**常见错误码**

| 状态码 | 说明 |
|--------|------|
| 400 | 请求格式错误 |
| 401 | 未授权（Token 无效或缺失） |
| 404 | 数据不存在 |
| 500 | 服务器内部错误 |

**认证失败示例**
```json
{
  "success": false,
  "error": "未授权：无效的 API Token",
  "timestamp": 1710123456789
}
```

## 6. 数据字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 存储键名 |
| `value` | any | 是 | 数据内容（任意 JSON 结构） |
| `timestamp` | number | 是 | 数据时间戳（毫秒级） |

## 7. 存储键名对照表

| 键名 | 说明 |
|------|------|
| `llm-config-list` | LLM 配置列表 |
| `assistant-list` | 社区助理列表 |
| `mcp-server-list` | MCP 服务器配置 |
| `skill-registry` | 技能注册表 |
| `image-generator-config` | 图片生成器配置 |
| `highlight-theme` | 代码高亮主题 |

## 8. Python 服务端实现示例

以下是基于 Flask 的完整实现：

```python
from flask import Flask, request, jsonify
from functools import wraps
import os
from datetime import datetime

app = Flask(__name__)

# 简单的内存存储（生产环境应使用数据库）
data_store = {}

def get_timestamp():
    """获取毫秒级时间戳"""
    return int(datetime.now().timestamp() * 1000)

def require_auth(f):
    """认证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': '未授权：缺少或无效的 Authorization 头',
                'timestamp': get_timestamp()
            }), 401

        token = auth_header[7:]
        if token != os.environ.get('SYNC_API_TOKEN'):
            return jsonify({
                'success': False,
                'error': '未授权：无效的 API Token',
                'timestamp': get_timestamp()
            }), 401

        return f(*args, **kwargs)
    return decorated

# 健康检查（无需认证）
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'success': True,
        'timestamp': get_timestamp()
    })

# 批量获取所有数据
@app.route('/sync/data', methods=['GET'])
@require_auth
def get_all_data():
    return jsonify({
        'success': True,
        'data': data_store,
        'timestamp': get_timestamp()
    })

# 批量上传数据
@app.route('/sync/data', methods=['POST'])
@require_auth
def upload_data():
    data = request.get_json()
    entries = data.get('entries', [])

    if not isinstance(entries, list):
        return jsonify({
            'success': False,
            'error': '请求体必须包含 entries 数组',
            'timestamp': get_timestamp()
        }), 400

    for entry in entries:
        key = entry.get('key')
        value = entry.get('value')
        timestamp = entry.get('timestamp')

        if key is not None and value is not None and timestamp is not None:
            data_store[key] = {
                'key': key,
                'value': value,
                'timestamp': timestamp
            }

    return jsonify({
        'success': True,
        'timestamp': get_timestamp()
    })

# 获取单个数据
@app.route('/sync/data/<key>', methods=['GET'])
@require_auth
def get_single_data(key):
    if key not in data_store:
        return jsonify({
            'success': False,
            'error': '数据不存在',
            'timestamp': get_timestamp()
        }), 404

    return jsonify({
        'success': True,
        'data': data_store[key],
        'timestamp': get_timestamp()
    })

# 更新单个数据
@app.route('/sync/data/<key>', methods=['PUT'])
@require_auth
def update_single_data(key):
    data = request.get_json()
    value = data.get('value')
    timestamp = data.get('timestamp')

    if value is None or timestamp is None:
        return jsonify({
            'success': False,
            'error': '请求体必须包含 value 和 timestamp',
            'timestamp': get_timestamp()
        }), 400

    data_store[key] = {
        'key': key,
        'value': value,
        'timestamp': timestamp
    }

    return jsonify({
        'success': True,
        'timestamp': get_timestamp()
    })

# 删除单个数据
@app.route('/sync/data/<key>', methods=['DELETE'])
@require_auth
def delete_single_data(key):
    if key in data_store:
        del data_store[key]

    return jsonify({
        'success': True,
        'timestamp': get_timestamp()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=True)
```

**运行方式**

```bash
# 安装依赖
pip install flask

# 设置环境变量
export SYNC_API_TOKEN=your-secure-token
export PORT=3000

# 启动服务
python sync_server.py
```

## 9. Docker 部署

**Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sync_server.py .

ENV PORT=3000
ENV SYNC_API_TOKEN=your-secure-token

EXPOSE 3000

CMD ["python", "sync_server.py"]
```

**requirements.txt**
```
flask>=2.0.0
```

**构建与运行**
```bash
# 构建镜像
docker build -t grapwork-sync-server .

# 运行容器
docker run -d -p 3000:3000 -e SYNC_API_TOKEN=your-secure-token grapwork-sync-server
```

## 10. 生产环境建议

1. **持久化存储**：使用数据库（PostgreSQL、MongoDB、Redis）替代内存存储
2. **认证安全**：使用 JWT 替代简单 Token，支持 Token 过期和刷新机制
3. **数据加密**：敏感数据应在存储前加密
4. **限流控制**：防止 API 滥用
5. **日志记录**：记录所有同步操作用于审计

## 11. 安全注意事项

1. **必须使用 HTTPS**：生产环境禁止使用 HTTP
2. **Token 安全**：
   - 使用足够长度的随机 Token（建议 32 字符以上）
   - 定期更换 Token
   - 不要在代码中硬编码 Token
3. **输入验证**：
   - 验证所有输入数据的格式和大小
   - 限制请求体大小（建议最大 10MB）
4. **CORS 配置**：如需跨域访问，配置适当的 CORS 策略
