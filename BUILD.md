# MirrorGrap Work 构建指南

本文档详细说明 MirrorGrap Work 项目的构建流程、环境要求和打包配置。

## 目录

- [环境要求](#环境要求)
- [项目结构](#项目结构)
- [构建流程](#构建流程)
- [开发模式](#开发模式)
- [生产构建](#生产构建)
- [打包配置](#打包配置)
- [平台特定说明](#平台特定说明)
- [常见问题](#常见问题)

---

## 环境要求

### 必需软件

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18.0.0 | 推荐使用 LTS 版本 |
| npm | >= 9.0.0 | 随 Node.js 安装 |

### 可选依赖

| 软件 | 用途 |
|------|------|
| `uv` / `uvx` | Python MCP 服务器运行环境 |
| `npx` | Node.js MCP 服务器运行环境 |

### 验证环境

```bash
node --version
npm --version
```

---

## 项目结构

```
frontend/
├── electron/                 # Electron 主进程代码
│   ├── main.ts              # 主进程入口
│   └── preload.ts           # 预加载脚本
├── src/                      # Vue 渲染进程代码
│   ├── components/          # Vue 组件
│   ├── composables/         # Vue Composables
│   ├── services/            # 服务层
│   ├── types/               # TypeScript 类型定义
│   └── router/              # Vue Router 配置
├── build/                    # 构建资源
│   └── icons/               # 应用图标
├── dist/                     # 渲染进程构建输出
├── dist-electron/            # Electron 进程构建输出
├── release/                  # 最终打包输出
├── vite.config.ts           # Vite 渲染进程配置
├── vite.electron.config.ts  # Vite Electron 进程配置
├── electron-builder.json    # electron-builder 打包配置
└── package.json             # 项目配置
```

---

## 构建流程

### 双构建流程

MirrorGrap Work 采用双构建流程：

```
┌─────────────────────────────────────────────────────────────┐
│                      构建流程概览                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  渲染进程 (Vue 3 SPA)          Electron 进程                 │
│  ───────────────────          ──────────────                │
│  src/                         electron/                     │
│    │                            │                           │
│    ▼                            ▼                           │
│  vue-tsc + Vite              esbuild                        │
│    │                            │                           │
│    ▼                            ▼                           │
│  dist/                        dist-electron/                │
│  (index.html + assets)        (main.cjs + preload.cjs)      │
│    │                            │                           │
│    └──────────┬─────────────────┘                           │
│               ▼                                             │
│        electron-builder                                      │
│               │                                             │
│               ▼                                             │
│           release/                                          │
│     (DMG/EXE/AppImage/deb)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 构建产物

| 目录 | 内容 | 来源 |
|------|------|------|
| `dist/` | Vue SPA 静态文件 | Vite 构建 |
| `dist-electron/` | Electron 主进程和预加载脚本 | esbuild 构建 |
| `release/` | 最终安装包 | electron-builder 打包 |

---

## 开发模式

### 启动开发服务器

```bash
cd frontend
npm run electron:dev
```

此命令会并行执行：

1. **启动 Vite 开发服务器** (端口 5174)
2. **监听 Electron 进程变更** (热重载)
3. **等待依赖就绪后启动 Electron**

### 开发模式流程

```
npm run electron:dev
        │
        ├── dev:renderer          → Vite Dev Server (http://localhost:5174)
        │
        ├── build:electron:watch  → 监听 electron/*.ts 变更
        │
        └── electron              → 启动 Electron 窗口
                                    (加载 Vite Dev Server)
```

### 单独启动组件

```bash
# 仅启动渲染进程开发服务器
npm run dev:renderer

# 仅构建 Electron 进程（监听模式）
npm run build:electron:watch
```

---

## 生产构建

### 完整构建与打包

```bash
cd frontend

# 打包当前平台（Mac 上打 Mac，Windows 上打 Windows）
npm run electron:build

# 仅打包 macOS 版本
npm run electron:build:mac

# 仅打包 Windows 版本
npm run electron:build:win

# 同时打包 Mac 和 Windows 版本
npm run electron:build:all
```

这些命令会依次执行：

1. `npm run build:renderer` - 构建渲染进程
2. `npm run build:electron` - 构建 Electron 进程
3. `electron-builder` - 打包生成安装程序

### 分步构建

#### 1. 仅构建渲染进程

```bash
npm run build:renderer
```

输出目录: `dist/`

构建过程：
- TypeScript 类型检查 (`vue-tsc -b`)
- Vite 打包 Vue 应用

#### 2. 仅构建 Electron 进程

```bash
npm run build:electron
```

输出目录: `dist-electron/`

构建产物：
- `main.cjs` - 主进程脚本
- `preload.cjs` - 预加载脚本

构建参数：
```bash
esbuild electron/main.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=dist-electron/main.cjs \
  --external:electron

esbuild electron/preload.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=dist-electron/preload.cjs \
  --external:electron
```

#### 3. 仅打包（不重新构建）

```bash
npx electron-builder --config electron-builder.json
```

---

## 打包配置

### electron-builder.json 配置详解

```json
{
  "appId": "com.mirrorgrap-work.desktop",
  "productName": "MirrorGrap Work",
  "icon": "build/icons/icon.png",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": [
    "dist/**/*",
    "dist-electron/main.cjs",
    "dist-electron/preload.cjs",
    "mcp-servers/**/*",
    "skills/**/*"
  ],
  "extraMetadata": {
    "main": "dist-electron/main.cjs"
  },
  "asar": true,
  "asarUnpack": [
    "mcp-servers/**/*",
    "skills/**/*"
  ],
  "mac": {
    "target": ["dmg", "zip"],
    "category": "public.app-category.productivity"
  },
  "win": {
    "target": ["nsis", "zip"]
  },
  "linux": {
    "target": ["AppImage", "deb"]
  }
}
```

| 配置项 | 说明 |
|--------|------|
| `appId` | 应用唯一标识符 |
| `productName` | 产品名称，显示在安装包和应用中 |
| `icon` | 应用图标路径 |
| `directories.output` | 打包输出目录 |
| `directories.buildResources` | 构建资源目录 |
| `files` | 包含在安装包中的文件 |
| `extraMetadata.main` | Electron 入口文件 |
| `asar` | 是否使用 ASAR 归档格式 |
| `asarUnpack` | 不打包进 ASAR 的文件（MCP 服务器、技能文件） |
| `mac.target` | macOS 输出格式：DMG + ZIP |
| `win.target` | Windows 输出格式：NSIS 安装程序 + ZIP |
| `linux.target` | Linux 输出格式：AppImage + DEB |

### 图标生成

```bash
npm run generate-icons
```

此命令会根据 `build/icons/icon.png` 生成各平台所需图标。

---

## 平台特定说明

### macOS

**输出格式**: DMG, ZIP

```bash
# 构建 macOS 版本
npm run electron:build:mac
```

输出文件：
- `release/MirrorGrap Work-{version}.dmg`
- `release/MirrorGrap Work-{version}-mac.zip`

**系统要求**: macOS 10.13+

### Windows

**输出格式**: NSIS 安装程序, ZIP

```bash
# 构建 Windows 版本
npm run electron:build:win
```

输出文件：
- `release/MirrorGrap Work Setup {version}.exe`
- `release/MirrorGrap Work-{version}-win.zip`

**系统要求**: Windows 10+

**注意**: 在 macOS 上打包 Windows 版本需要安装 Wine。

### Linux

**输出格式**: AppImage, DEB

```bash
# 在 Linux 上构建
npm run electron:build
```

输出文件：
- `release/MirrorGrap Work-{version}.AppImage`
- `release/mirrorgrap-work_{version}_amd64.deb`

**系统要求**: glibc 2.17+

### 多平台构建

同时打包 Mac 和 Windows 版本：

```bash
npm run electron:build:all
```

**注意事项**:
- 在 macOS 上打包 Windows 版本需要安装 Wine
- 跨平台构建可能存在兼容性问题，建议在目标平台上构建
- 可使用 GitHub Actions 实现自动化多平台构建

---

## 常见问题

### 构建失败：端口被占用

```bash
# 检查端口占用
lsof -i :5174

# 终止占用进程
kill -9 <PID>
```

### TypeScript 类型检查失败

```bash
# 单独运行类型检查
npx vue-tsc --noEmit
```

### Electron 进程启动失败

1. 确保 `dist-electron/` 目录存在
2. 检查 `main.cjs` 和 `preload.cjs` 是否生成
3. 查看 DevTools 控制台错误信息

### 打包后应用无法启动

1. 检查 ASAR 打包是否影响文件读取
2. 确认相对路径配置正确 (`base: './'`)
3. 检查 Node.js 原生模块兼容性

### 跨平台构建

使用 `electron:build:all` 可同时构建多个平台：

```bash
npm run electron:build:all
```

或分别构建：

```bash
# macOS 上构建 Mac 版本
npm run electron:build:mac

# macOS 上构建 Windows 版本（需要 Wine）
npm run electron:build:win
```

如需自动化多平台构建，推荐使用 GitHub Actions 或 Docker。

---

## 构建命令速查

| 命令 | 说明 |
|------|------|
| `npm run electron:dev` | 开发模式（热重载） |
| `npm run electron:build` | 完整构建 + 打包当前平台 |
| `npm run electron:build:mac` | 完整构建 + 打包 macOS 版本 |
| `npm run electron:build:win` | 完整构建 + 打包 Windows 版本 |
| `npm run electron:build:all` | 完整构建 + 同时打包 Mac 和 Windows |
| `npm run build:renderer` | 仅构建渲染进程 |
| `npm run build:electron` | 仅构建 Electron 进程 |
| `npm run build:electron:watch` | 监听 Electron 进程变更 |
| `npm run generate-icons` | 生成应用图标 |

---

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 项目开发指南
- [Vite 配置文档](https://vitejs.dev/config/)
- [electron-builder 文档](https://www.electron.build/)
- [Electron 文档](https://www.electronjs.org/docs)
