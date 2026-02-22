# Lab Workspace - AI-Powered Development Tools

一个现代化的实验室首页，展示 AI 驱动的开发工具集合。

## 设计风格

参考 [zcode-ai.com](https://zcode-ai.com/) 的设计语言，采用深色主题 + 紫色强调色的现代科技风格。

### 配色方案

| 用途 | 颜色值 | 说明 |
|------|--------|------|
| 主背景 | `#09090b` | 深黑色背景 |
| 主强调色 | `#7c3aed` | 紫色渐变起点 |
| 次强调色 | `#6366f1` | 紫色渐变终点 |
| 主文字 | `#fafafa` | 亮白色 |
| 次文字 | `#a1a1aa` / `#71717a` | 灰色层级 |
| 边框 | `rgba(255, 255, 255, 0.05)` | 半透明白色 |

### 字体

- **主字体**: Inter (Google Fonts)
- **字重**: 300-800
- **标题字间距**: -1px 至 -1.5px

## 页面结构

### 1. Header (导航栏)

- **位置**: 固定顶部 (`position: fixed`)
- **效果**: 毛玻璃背景 (`backdrop-filter: blur(12px)`)
- **内容**: Logo + 导航链接 + CTA 按钮

### 2. Hero Section

```
┌─────────────────────────────────────┐
│          [AI-Powered Development]   │  <- Badge
│                                     │
│    Simple, Fast, Intelligent        │  <- 主标题 (56px)
│                                     │
│     描述文字...描述文字...          │  <- 副标题
│                                     │
│   [Start Building] [Learn More]     │  <- CTA 按钮
│                                     │
│    ┌─────────────────────────┐      │
│    │                         │      │
│    │     App Preview Image   │      │  <- 应用预览图
│    │                         │      │
│    └─────────────────────────┘      │
└─────────────────────────────────────┘
```

### 3. Capabilities Section

功能特性区块，采用交替布局：

```
Feature 1 (左图右文)          Feature 2 (右图左文)
┌────────┐ ┌──────────┐       ┌──────────┐ ┌────────┐
│        │ │  01      │       │  02      │ │        │
│ Image  │ │ Title    │       │ Title    │ │ Image  │
│        │ │ Desc     │       │ Desc     │ │        │
└────────┘ └──────────┘       └──────────┘ └────────┘

Feature 3 (左图右文)          Feature 4 (右图左文)
...
```

**四个功能模块**:
1. 智能 Word 文档生成
2. Excel 数据处理
3. PPT 演示文稿生成
4. 智能邮件发送

### 4. Use Cases Section

4 列网格布局展示用例卡片：

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  📄      │ │  📊      │ │  📽      │ │  ✉️      │
│ 文档生成  │ │ 数据分析  │ │ 演示制作  │ │ 邮件助手  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 5. Footer

简洁的页脚，包含版权信息。

## 技术实现

### CSS 特性

- **CSS Grid**: 功能卡片布局
- **Flexbox**: 导航栏、按钮组
- **CSS 渐变**: 背景、按钮、文字
- **动画**: `@keyframes` + `transition`
- **毛玻璃效果**: `backdrop-filter: blur()`
- **响应式**: `@media` 查询

### JavaScript 功能

- **Intersection Observer**: 滚动触发动画
- 元素进入视口时添加淡入效果

```javascript
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
});
```

## 响应式断点

| 断点 | 布局调整 |
|------|----------|
| > 1024px | 功能卡片双列，用例四列 |
| 768px - 1024px | 功能卡片单列，用例两列 |
| < 768px | 全部单列，隐藏导航链接 |

## 图片资源

位于 `image/openchat_use_cases/` 目录：

```
image/
└── openchat_use_cases/
    ├── soft.png                    # 应用预览图
    ├── Generate_word_case/         # Word 生成用例
    ├── Generate_Excel_case/        # Excel 生成用例
    ├── Generate_PDF_case/          # PDF 生成用例
    ├── Generate_PPT_case/          # PPT 生成用例
    └── Send_email/                 # 邮件发送用例
```

## 动效说明

### 入场动画

```css
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### 交互效果

- **卡片悬停**: `translateY(-4px)` + 边框变色
- **按钮悬停**: `translateY(-2px)` + 阴影增强
- **导航链接**: 下划线滑入动画

## 项目依赖

- **Google Fonts**: Inter 字体
- **无其他外部依赖**: 纯 HTML + CSS + Vanilla JS

## 使用方式

直接在浏览器中打开 `index.html` 即可预览。

---

Built with Electron + Vue 3 | Lab Workspace © 2024
