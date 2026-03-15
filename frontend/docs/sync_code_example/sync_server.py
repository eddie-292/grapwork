from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
import os
import json
import threading
from datetime import datetime

app = Flask(__name__)

# CORS 配置
CORS(app, resources={
    r"/health": {"origins": "*"},
    r"/sync/*": {
        "origins": ["http://localhost:5174", "http://127.0.0.1:5174"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# 数据文件路径（相对于当前目录）
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plugins.json")

# 文件操作锁
file_lock = threading.Lock()

def get_timestamp():
    """获取毫秒级时间戳"""
    return int(datetime.now().timestamp() * 1000)

def load_data():
    """从文件加载数据"""
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"加载数据文件失败: {e}")
    return {}

def save_data(data):
    """保存数据到文件"""
    try:
        with file_lock:
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except IOError as e:
        print(f"保存数据文件失败: {e}")
        return False

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
    data = load_data()
    return jsonify({
        'success': True,
        'data': data,
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

    # 加载现有数据
    current_data = load_data()

    # 更新数据
    for entry in entries:
        key = entry.get('key')
        value = entry.get('value')
        timestamp = entry.get('timestamp')

        if key is not None and value is not None and timestamp is not None:
            current_data[key] = {
                'key': key,
                'value': value,
                'timestamp': timestamp
            }

    # 保存数据
    if save_data(current_data):
        return jsonify({
            'success': True,
            'timestamp': get_timestamp()
        })
    else:
        return jsonify({
            'success': False,
            'error': '数据保存失败',
            'timestamp': get_timestamp()
        }), 500

# 获取单个数据
@app.route('/sync/data/<key>', methods=['GET'])
@require_auth
def get_single_data(key):
    data = load_data()
    
    if key not in data:
        return jsonify({
            'success': False,
            'error': '数据不存在',
            'timestamp': get_timestamp()
        }), 404

    return jsonify({
        'success': True,
        'data': data[key],
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

    # 加载现有数据
    current_data = load_data()
    
    # 更新指定 key
    current_data[key] = {
        'key': key,
        'value': value,
        'timestamp': timestamp
    }

    # 保存数据
    if save_data(current_data):
        return jsonify({
            'success': True,
            'timestamp': get_timestamp()
        })
    else:
        return jsonify({
            'success': False,
            'error': '数据保存失败',
            'timestamp': get_timestamp()
        }), 500

# 删除单个数据
@app.route('/sync/data/<key>', methods=['DELETE'])
@require_auth
def delete_single_data(key):
    # 加载现有数据
    current_data = load_data()
    
    if key in current_data:
        del current_data[key]
        # 保存数据
        save_data(current_data)

    return jsonify({
        'success': True,
        'timestamp': get_timestamp()
    })

# 初始化数据文件（确保文件存在）
def init_data_file():
    if not os.path.exists(DATA_FILE):
        save_data({})
        print(f"已创建数据文件：{DATA_FILE}")
    else:
        print(f"使用现有数据文件：{DATA_FILE}")

if __name__ == '__main__':
    # 初始化数据文件
    init_data_file()
    
    port = int(os.environ.get('PORT', 3000))
    print(f"服务器运行在 http://0.0.0.0:{port}")
    print(f"数据文件路径：{DATA_FILE}")
    app.run(host='0.0.0.0', port=port, debug=True)