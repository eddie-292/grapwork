# Light Theme Reference

Clean professional aesthetic. Off-white background, blue accent, subtle card shadows, dot-grid texture.

---

## Design Tokens

```css
:root {
  /* Backgrounds */
  --bg:       #f0f4f8;   /* page background */
  --surface:  #ffffff;   /* card / layer background */
  --surface2: #f7f9fb;   /* node / inner chip background */

  /* Borders */
  --border:       #dce4ed;
  --border-hover: #b0c4d8;

  /* Accent colors */
  --blue:       #1a6fbf;
  --blue-dim:   #4a90d9;
  --blue-light: rgba(26,111,191,0.08);
  --green:      #1a8c5b;
  --green-light:rgba(26,140,91,0.08);
  --orange:     #c4600a;
  --orange-light:rgba(196,96,10,0.08);
  --amber:      #b07d00;
  --amber-light:rgba(176,125,0,0.08);
  --purple:     #6b3db5;
  --purple-light:rgba(107,61,181,0.08);
  --red:        #b02a4a;
  --red-light:  rgba(176,42,74,0.08);

  /* Text */
  --text:       #2c3e50;
  --text-dim:   #7f96aa;
  --text-bright:#1a2733;
  --text-mid:   #4a6070;
}
```

---

## 1. Page Shell

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  font-family: 'Noto Sans SC', sans-serif;
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* Dot grid overlay */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, rgba(26,111,191,0.12) 1px, transparent 1px);
  background-size: 28px 28px;
  pointer-events: none;
  z-index: 0;
}

.wrapper {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 60px;
}
```

---

## 2. Header

```html
<div class="header">
  <div class="header-badge">SYSTEM ARCHITECTURE v1.0</div>
  <h1>Mech<span>Smart</span>Ops</h1>
  <h1 class="header-subtitle">机电智能运维系统</h1>
  <div class="header-sub">Spring Boot 2.4.4 &nbsp;|&nbsp; Port :9988 &nbsp;|&nbsp; JDK 1.8+</div>
</div>
```

```css
.header {
  text-align: center;
  margin-bottom: 48px;
  animation: fadeDown 0.7s ease both;
}
.header-badge {
  display: inline-block;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; letter-spacing: 0.2em;
  color: var(--blue);
  background: var(--blue-light);
  border: 1px solid rgba(26,111,191,0.25);
  padding: 4px 16px; margin-bottom: 16px;
  clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
}
.header h1 {
  font-family: 'Rajdhani', sans-serif;
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700; color: var(--text-bright);
  letter-spacing: 0.05em; line-height: 1.1;
  text-transform: uppercase;
}
.header h1 span { color: var(--blue); }

.header-subtitle {
  font-size: clamp(14px, 2.5vw, 20px) !important;
  color: var(--text-dim) !important;
  font-weight: 400 !important;
  letter-spacing: 0.15em !important;
  text-transform: none !important;
}
.header-sub {
  margin-top: 8px; font-size: 13px;
  color: var(--text-dim);
  font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.08em;
}
```

---

## 3. Section Label

Same HTML as dark theme. CSS:

```css
.section-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px; letter-spacing: 0.25em;
  color: var(--text-dim); text-transform: uppercase;
  margin-bottom: 10px;
  display: flex; align-items: center; gap: 8px;
}
.section-label::before {
  content: '';
  display: inline-block;
  width: 20px; height: 1px;
  background: var(--text-dim);
}
```

---

## 4. Card / Layer

Same HTML structure as dark. CSS:

```css
.layer {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px 20px; margin-bottom: 6px;
  background: var(--surface);
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
  animation: fadeUp 0.6s ease both;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.layer:hover {
  border-color: var(--border-hover);
  box-shadow: 0 4px 16px rgba(26,111,191,0.08);
}
.layer-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.layer-dot    { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.layer-title  {
  font-family:'Rajdhani',sans-serif;
  font-size:14px; font-weight:600;
  letter-spacing:0.12em; text-transform:uppercase;
}
.layer-tag {
  margin-left: auto;
  font-family:'Share Tech Mono',monospace;
  font-size:10px; color:var(--text-dim); letter-spacing:0.1em;
  background:var(--surface2);
  padding:2px 8px; border-radius:2px;
  border:1px solid var(--border);
}
```

### Color Themes

```css
.blue-theme   .layer-dot  { background: var(--blue); }
.blue-theme   .layer-title { color: var(--blue); }
.blue-theme   .layer       { border-left: 3px solid var(--blue); }
.blue-theme   .node:hover  { border-color: var(--blue-dim); box-shadow: 0 4px 12px rgba(26,111,191,0.12); }

.green-theme  .layer-dot  { background: var(--green); }
.green-theme  .layer-title { color: var(--green); }
.green-theme  .layer       { border-left: 3px solid var(--green); }
.green-theme  .node:hover  { border-color: var(--green); box-shadow: 0 4px 12px rgba(26,140,91,0.12); }

.orange-theme .layer-dot  { background: var(--orange); }
.orange-theme .layer-title { color: var(--orange); }
.orange-theme .layer       { border-left: 3px solid var(--orange); }
.orange-theme .node:hover  { border-color: var(--orange); box-shadow: 0 4px 12px rgba(196,96,10,0.12); }

.amber-theme  .layer-dot  { background: var(--amber); }
.amber-theme  .layer-title { color: var(--amber); }
.amber-theme  .layer       { border-left: 3px solid var(--amber); }
.amber-theme  .node:hover  { border-color: var(--amber); box-shadow: 0 4px 12px rgba(176,125,0,0.12); }

.purple-theme .layer-dot  { background: var(--purple); }
.purple-theme .layer-title { color: var(--purple); }
.purple-theme .layer       { border-left: 3px solid var(--purple); }
.purple-theme .node:hover  { border-color: var(--purple); box-shadow: 0 4px 12px rgba(107,61,181,0.12); }

.red-theme    .layer-dot  { background: var(--red); }
.red-theme    .layer-title { color: var(--red); }
.red-theme    .layer       { border-left: 3px solid var(--red); }
.red-theme    .node:hover  { border-color: var(--red); box-shadow: 0 4px 12px rgba(176,42,74,0.12); }
```

**Key difference from dark**: no `box-shadow` glow on `.layer-dot`, no scan-line `::after` effect.

---

## 5. Node

Same HTML as dark. CSS differences: lighter background, visible card shadow on hover.

```css
.nodes { display: flex; flex-wrap: wrap; gap: 8px; }
.node {
  display: flex; flex-direction: column;
  align-items: center; gap: 5px;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  min-width: 100px; flex: 1;
  transition: all 0.2s; cursor: default;
}
.node:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.node-name {
  font-family:'Rajdhani',sans-serif;
  font-size:13px; font-weight:600;
  text-align:center; color:var(--text-bright); letter-spacing:0.04em;
}
.node-sub {
  font-family:'Share Tech Mono',monospace;
  font-size:9px; color:var(--text-dim);
  text-align:center; letter-spacing:0.04em;
}
```

---

## 6. Badge

```html
<span class="badge badge-blue">Spring Boot 2.4.4</span>
<span class="badge badge-green">MyBatis-Plus</span>
<span class="badge badge-orange">RabbitMQ</span>
<span class="badge badge-amber">Knife4j</span>
<span class="badge badge-purple">Redisson</span>
<span class="badge badge-red">Hutool</span>
```

```css
.badge {
  font-family:'Share Tech Mono',monospace;
  font-size:11px; padding:4px 10px;
  border-radius:3px; letter-spacing:0.04em; border:1px solid;
}
.badge-blue   { color:var(--blue);   border-color:rgba(26,111,191,0.3);  background:var(--blue-light); }
.badge-green  { color:var(--green);  border-color:rgba(26,140,91,0.3);   background:var(--green-light); }
.badge-orange { color:var(--orange); border-color:rgba(196,96,10,0.3);   background:var(--orange-light); }
.badge-amber  { color:var(--amber);  border-color:rgba(176,125,0,0.3);   background:var(--amber-light); }
.badge-purple { color:var(--purple); border-color:rgba(107,61,181,0.3);  background:var(--purple-light); }
.badge-red    { color:var(--red);    border-color:rgba(176,42,74,0.3);   background:var(--red-light); }

.tech-grid { display: flex; flex-wrap: wrap; gap: 8px; }
```

---

## 7. Connector Arrow

```css
.connector {
  display: flex; justify-content: center; align-items: center;
  height: 28px; position: relative;
}
.connector::before {
  content: '';
  position: absolute; left: 50%; top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(to bottom, transparent, var(--blue-dim), transparent);
  opacity: 0.5;
}
.connector-arrow {
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--blue-dim);
  position: relative; z-index: 1; opacity: 0.7;
  animation: bounce-arrow 2s ease-in-out infinite;
}
@keyframes bounce-arrow {
  0%,100% { transform: translateY(0); opacity: 0.6; }
  50%     { transform: translateY(3px); opacity: 1; }
}
```

---

## 8. Flow Card

Same HTML as dark. CSS differences: blue accent instead of cyan, no glow on title bar.

```css
.flow-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width: 640px) { .flow-grid { grid-template-columns: 1fr; } }

.flow-card {
  border:1px solid var(--border); border-radius:6px;
  padding:18px; background:var(--surface);
  box-shadow:0 1px 4px rgba(0,0,0,0.04);
}
.flow-card-title {
  font-family:'Rajdhani',sans-serif;
  font-size:13px; font-weight:600;
  letter-spacing:0.1em; text-transform:uppercase;
  color:var(--blue); margin-bottom:14px;
  display:flex; align-items:center; gap:8px;
}
.flow-card-title::before {
  content:''; width:3px; height:14px;
  background:var(--blue); display:inline-block; border-radius:2px;
}
.flow-step {
  display:flex; align-items:flex-start; gap:10px;
  padding:6px 0; border-bottom:1px solid var(--border);
}
.flow-step:last-child { border-bottom:none; }
.flow-num  { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--blue); width:18px; flex-shrink:0; margin-top:2px; }
.flow-text { font-size:12px; color:var(--text-mid); line-height:1.5; }
.flow-text strong { color:var(--text-bright); font-weight:500; }
```

---

## 9. Two-column Grid

```css
.two-col { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
```

---

## 10. Footer

```css
.footer {
  margin-top:48px; padding-top:20px;
  border-top:1px solid var(--border);
  display:flex; justify-content:space-between;
  align-items:center; flex-wrap:wrap; gap:12px;
  font-family:'Share Tech Mono',monospace;
  font-size:11px; color:var(--text-dim);
}
```

---

## Animations (global keyframes)

```css
@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Stagger layer animations identically to dark theme.

---

## Dark vs Light: Key Differences Summary

| Property | Dark | Light |
|---|---|---|
| Background | `#070c14` navy | `#f0f4f8` off-white |
| Surface | `#0d1520` | `#ffffff` |
| Grid texture | Line grid (cyan 3% opacity) | Dot grid (blue 12% opacity) |
| Primary accent | `--cyan #00d4ff` | `--blue #1a6fbf` |
| Layer dot | Colored + glow box-shadow | Colored, no glow |
| Card hover shadow | Cyan glow `rgba(0,212,255,0.08)` | Blue shadow `rgba(26,111,191,0.08)` |
| Scan-line effect | Yes (`::after` on .layer) | No |
| Badge border-radius | `2px` | `3px` |
| Card border-radius | `4px` | `6px` |
| Layer tag style | Plain text | Boxed chip with border |
| Yellow accent | `--yellow #ffd166` | `--amber #b07d00` (same role) |
