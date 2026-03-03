# Dark Theme Reference

Industrial cyber aesthetic. Dark navy background, cyan accent, glow effects, scan-line texture on cards.

---

## Design Tokens

```css
:root {
  /* Backgrounds */
  --bg:       #070c14;   /* page background */
  --surface:  #0d1520;   /* card / layer background */
  --surface2: #111d2e;   /* node / inner chip background */

  /* Borders */
  --border:      #1a3050;
  --border-hover: #0088aa;

  /* Accent colors */
  --cyan:      #00d4ff;
  --cyan-dim:  #0088aa;
  --cyan-glow: rgba(0,212,255,0.15);
  --green:     #00ff9d;
  --green-dim: #00996b;
  --orange:    #ff8c42;
  --yellow:    #ffd166;
  --purple:    #9b5de5;
  --red:       #ef476f;

  /* Text */
  --text:       #c8dde8;
  --text-dim:   #5a7a8a;
  --text-bright:#e8f4f8;
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

/* Line grid overlay */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
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
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--cyan);
  background: rgba(0,212,255,0.08);
  border: 1px solid rgba(0,212,255,0.25);
  padding: 4px 16px;
  margin-bottom: 16px;
  clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
}

.header h1 {
  font-family: 'Rajdhani', sans-serif;
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700;
  color: var(--text-bright);
  letter-spacing: 0.05em;
  line-height: 1.1;
  text-transform: uppercase;
}

.header h1 span { color: var(--cyan); text-shadow: 0 0 20px rgba(0,212,255,0.5); }

.header-subtitle {
  font-size: clamp(14px, 2.5vw, 20px) !important;
  color: var(--text-dim) !important;
  font-weight: 400 !important;
  letter-spacing: 0.15em !important;
  text-transform: none !important;
}

.header-sub {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-dim);
  font-family: 'Share Tech Mono', monospace;
  letter-spacing: 0.08em;
}
```

---

## 3. Section Label

```html
<div class="section-label">系统架构分层</div>
```

```css
.section-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.25em;
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
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

```html
<div class="layer cyan-theme">
  <div class="layer-header">
    <div class="layer-dot"></div>
    <div class="layer-title">客户端层 &nbsp;Client Layer</div>
    <div class="layer-tag">EXTERNAL</div>
  </div>
  <div class="nodes"><!-- nodes here --></div>
</div>
```

```css
.layer {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 16px 20px;
  margin-bottom: 6px;
  background: var(--surface);
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
  animation: fadeUp 0.6s ease both;
}
.layer:hover {
  border-color: var(--border-hover);
  box-shadow: 0 0 20px rgba(0,212,255,0.08);
}

/* Scan-line texture */
.layer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(255,255,255,0.01) 50%, transparent 50%);
  background-size: 100% 4px;
  pointer-events: none;
  opacity: 0.3;
  border-radius: inherit;
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.layer-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.layer-title {
  font-family: 'Rajdhani', sans-serif;
  font-size: 14px; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase;
}
.layer-tag {
  margin-left: auto;
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px; color: var(--text-dim); letter-spacing: 0.1em;
}
```

### Color Themes (add class to `.layer` wrapper)

```css
.cyan-theme   .layer-dot  { background: var(--cyan);   box-shadow: 0 0 6px var(--cyan); }
.cyan-theme   .layer-title { color: var(--cyan); }
.cyan-theme   .layer       { border-left: 3px solid var(--cyan); }
.cyan-theme   .node:hover  { border-color: var(--cyan); box-shadow: 0 4px 12px rgba(0,212,255,0.15); }

.green-theme  .layer-dot  { background: var(--green);  box-shadow: 0 0 6px var(--green); }
.green-theme  .layer-title { color: var(--green); }
.green-theme  .layer       { border-left: 3px solid var(--green); }
.green-theme  .node:hover  { border-color: var(--green); box-shadow: 0 4px 12px rgba(0,255,157,0.15); }

.orange-theme .layer-dot  { background: var(--orange); box-shadow: 0 0 6px var(--orange); }
.orange-theme .layer-title { color: var(--orange); }
.orange-theme .layer       { border-left: 3px solid var(--orange); }
.orange-theme .node:hover  { border-color: var(--orange); box-shadow: 0 4px 12px rgba(255,140,66,0.15); }

.yellow-theme .layer-dot  { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); }
.yellow-theme .layer-title { color: var(--yellow); }
.yellow-theme .layer       { border-left: 3px solid var(--yellow); }
.yellow-theme .node:hover  { border-color: var(--yellow); box-shadow: 0 4px 12px rgba(255,209,102,0.15); }

.purple-theme .layer-dot  { background: var(--purple); box-shadow: 0 0 6px var(--purple); }
.purple-theme .layer-title { color: var(--purple); }
.purple-theme .layer       { border-left: 3px solid var(--purple); }
.purple-theme .node:hover  { border-color: var(--purple); box-shadow: 0 4px 12px rgba(155,93,229,0.15); }

.red-theme    .layer-dot  { background: var(--red);    box-shadow: 0 0 6px var(--red); }
.red-theme    .layer-title { color: var(--red); }
.red-theme    .layer       { border-left: 3px solid var(--red); }
.red-theme    .node:hover  { border-color: var(--red); box-shadow: 0 4px 12px rgba(239,71,111,0.15); }
```

---

## 5. Node

```html
<div class="node">
  <div class="node-name">MySQL</div>
  <div class="node-sub">主关系型数据库</div>
</div>
```

```css
.nodes { display: flex; flex-wrap: wrap; gap: 8px; }

.node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 3px;
  min-width: 100px;
  flex: 1;
  transition: all 0.2s;
  cursor: default;
}
.node:hover { transform: translateY(-2px); }

.node-name {
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px; font-weight: 600;
  text-align: center;
  color: var(--text-bright);
  letter-spacing: 0.05em;
}
.node-sub {
  font-family: 'Share Tech Mono', monospace;
  font-size: 9px; color: var(--text-dim);
  text-align: center; letter-spacing: 0.05em;
}

@media (max-width: 700px) {
  .nodes { gap: 6px; }
  .node  { min-width: 80px; padding: 8px 10px; }
  .node-name { font-size: 11px; }
}
```

---

## 6. Badge

```html
<span class="badge badge-cyan">Spring Boot 2.4.4</span>
<span class="badge badge-green">MyBatis-Plus</span>
<span class="badge badge-orange">RabbitMQ</span>
<span class="badge badge-yellow">Knife4j</span>
<span class="badge badge-purple">Redisson</span>
<span class="badge badge-red">Hutool</span>
```

```css
.badge {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; padding: 4px 10px;
  border-radius: 2px; letter-spacing: 0.05em; border: 1px solid;
}
.badge-cyan   { color: var(--cyan);   border-color: rgba(0,212,255,0.3);  background: rgba(0,212,255,0.06); }
.badge-green  { color: var(--green);  border-color: rgba(0,255,157,0.3);  background: rgba(0,255,157,0.06); }
.badge-orange { color: var(--orange); border-color: rgba(255,140,66,0.3); background: rgba(255,140,66,0.06); }
.badge-yellow { color: var(--yellow); border-color: rgba(255,209,102,0.3);background: rgba(255,209,102,0.06);}
.badge-purple { color: var(--purple); border-color: rgba(155,93,229,0.3); background: rgba(155,93,229,0.06); }
.badge-red    { color: var(--red);    border-color: rgba(239,71,111,0.3); background: rgba(239,71,111,0.06); }

.tech-grid { display: flex; flex-wrap: wrap; gap: 8px; }
```

---

## 7. Connector Arrow

```html
<div class="connector"><div class="connector-arrow"></div></div>
```

```css
.connector {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 28px;
  position: relative;
}
.connector::before {
  content: '';
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(to bottom, transparent, var(--cyan-dim), transparent);
  animation: pulse-line 2s ease-in-out infinite;
}
.connector-arrow {
  width: 0; height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--cyan-dim);
  position: relative; z-index: 1;
  animation: pulse-arrow 2s ease-in-out infinite;
}
@keyframes pulse-line  { 0%,100%{opacity:0.4} 50%{opacity:1} }
@keyframes pulse-arrow { 0%,100%{opacity:0.5} 50%{opacity:1;transform:translateY(2px)} }
```

---

## 8. Flow Card

```html
<div class="flow-card">
  <div class="flow-card-title">请求处理流程</div>
  <div class="flow-step">
    <div class="flow-num">01</div>
    <div class="flow-text"><strong>Client</strong> → 认证授权模块 → Token 验证</div>
  </div>
  <!-- repeat .flow-step for each step -->
</div>
```

```css
.flow-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 640px) { .flow-grid { grid-template-columns: 1fr; } }

.flow-card {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 18px;
  background: var(--surface);
}
.flow-card-title {
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--cyan);
  margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.flow-card-title::before {
  content: '';
  width: 3px; height: 14px;
  background: var(--cyan);
  display: inline-block;
  box-shadow: 0 0 6px var(--cyan);
}
.flow-step {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(26,48,80,0.5);
}
.flow-step:last-child { border-bottom: none; }
.flow-num  { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--cyan); width:18px; flex-shrink:0; margin-top:2px; }
.flow-text { font-size:12px; color:var(--text); line-height:1.5; }
.flow-text strong { color: var(--text-bright); font-weight: 500; }
```

---

## 9. Two-column Grid (Middleware pattern)

```html
<div class="two-col">
  <div class="layer" style="margin-bottom:0; border-left:3px solid var(--orange)">
    <div class="layer-header">
      <div class="layer-dot" style="background:var(--orange)"></div>
      <div class="layer-title" style="color:var(--orange);font-size:12px">RabbitMQ</div>
    </div>
    <div class="node-sub" style="font-size:11px;color:var(--text)">AMQP 消息队列</div>
    <div class="node-sub" style="margin-top:3px">spring-boot-starter-amqp 2.4.4</div>
  </div>
  <!-- second card -->
</div>
```

```css
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
```

---

## 10. Footer

```html
<div class="footer">
  <span>MechSmartOps &nbsp;/&nbsp; qcxt-jd &nbsp;/&nbsp; com.qcxt.iot</span>
  <span>Port: 9988 &nbsp;|&nbsp; v1.0 &nbsp;|&nbsp; 2026-03-02</span>
</div>
```

```css
.footer {
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
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

Apply staggered delay on repeated layer elements:
```css
.layer:nth-child(1) { animation-delay: 0.1s; }
.layer:nth-child(2) { animation-delay: 0.15s; }
.layer:nth-child(3) { animation-delay: 0.2s; }
/* continue incrementing by 0.05s */
```
