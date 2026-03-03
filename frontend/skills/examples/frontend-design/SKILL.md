---
name: frontend design
description: Apply the dual-theme UI design system when building any HTML page, dashboard, diagram, report, or web component. Use this skill whenever the user asks to create or style a page/component in the "dark theme", "light theme", "深色风格", "浅色风格", "工业风", "科技感", or when they say "用我们的风格" / "保持一致的风格" / "沿用之前的设计". Also trigger when generating any new HTML artifact that should match the existing design visual language. Do NOT use generic Inter/system-font aesthetics — always apply this design system.
---

# UI Design System

A dual-theme (dark industrial + light professional) design system extracted from the design architecture diagram. Use this skill to build any new page or component that needs to match the established visual language.

## Quick Decision

| User wants | Do |
|---|---|
| 深色 / dark / 工业风 / 科技感 | Use **Dark Theme** — see `references/dark.md` |
| 浅色 / light / 简洁 / 白色 | Use **Light Theme** — see `references/light.md` |
| Both / 两套 / 深浅 | Generate two files, one per theme |
| Unspecified, new component | Ask, or default to dark |

Read the relevant reference file **before writing any CSS**.

## Core Rules (both themes)

### Fonts — always import all three
```html
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
```

| Role | Font | Usage |
|------|------|-------|
| Display / headings | Rajdhani | Titles, layer names — uppercase, letter-spacing 0.05–0.15em |
| Monospace / labels | Share Tech Mono | Badges, tags, footers, section labels, step numbers |
| Body / Chinese | Noto Sans SC | Paragraph text, subtitles, descriptions |

### No Emoji
Never use emoji. Use text labels, geometric shapes, or CSS-only decorations.

### Animation Principles
- Page load: staggered fadeUp + fadeDown
- Hover: translateY(-2px) lift on interactive cards/nodes
- Connectors: slow pulse loops (2s ease-in-out infinite)
- All transitions: 0.2s ease

### Layout
- Max width: 1200px, centered, padding: 40px 24px 60px
- Gaps: 8px tight, 16px standard, 24px section
- Border radius: 3px nodes, 4-6px cards, 2px badges

### No inline color values
All colors via CSS variables only. No hardcoded hex in HTML.

---

## Component Index

Both reference files document these with full CSS + HTML snippets:

1. Page Shell — background texture, wrapper
2. Header — badge chip, H1 accent, subtitle
3. Section Label — mono label with leading line
4. Card / Layer — bordered surface, left accent, color themes
5. Node — small chip inside card, hover lift
6. Badge — inline tech tag, color variants
7. Connector Arrow — animated vertical flow arrow
8. Flow Card — numbered step list
9. Two-column Grid — side-by-side layout
10. Footer — monospace meta line

---

## Reference Files

- references/dark.md  — Dark theme: full tokens + every component
- references/light.md — Light theme: full tokens + every component

Read only the one needed. Each file is self-contained.
