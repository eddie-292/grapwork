# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GrapWork is a cross-platform desktop AI Agent assistant built with Electron 28 + Vue 3.5 + TypeScript 5.9. It supports any OpenAI-compatible LLM API and provides features like multi-tab chat, MCP (Model Context Protocol) integration, skills system, image generation, and cloud sync.

## Commands

All commands should be run from the `frontend/` directory:

```bash
# Development
npm run electron:dev              # Start dev server with hot reload

# Build
npm run build:renderer            # Build Vue app only (output: dist/)
npm run build:electron            # Build Electron processes only (output: dist-electron/)
npm run electron:build            # Full build + package for current platform
npm run electron:build:mac        # Build for macOS
npm run electron:build:win        # Build for Windows
npm run electron:build:all        # Build for both Mac and Windows

# Type checking
npx vue-tsc --noEmit              # Run TypeScript type check

# Icons
npm run generate-icons            # Generate app icons from build/icons/icon.png
```

## Architecture

### Dual Process Architecture

- **Main Process** (`electron/main.ts`): IPC handlers, MCP client, file operations, shell command execution, window management, loop scheduler
- **Renderer Process** (`src/`): Vue 3 SPA with components, composables, services, and types

### Build Flow

```
src/ (Vue)      →  vue-tsc + Vite  →  dist/
electron/       →  esbuild         →  dist-electron/
dist/ + dist-electron/ → electron-builder → release/
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `electron/` | Electron main process (IPC, MCP client, LoopScheduler) |
| `src/components/` | Vue components (ChatView, NormalChat, MCPView, LoopView, etc.) |
| `src/composables/` | Vue composables for stateful logic (useMCP, useSkills, useImageGenerator) |
| `src/services/` | StorageService (multi-backend) and SyncService (cloud sync) |
| `src/types/` | TypeScript type definitions including `electron.d.ts` for IPC |
| `src/imageProviders/` | Image generation providers (zhipu, qwen) |
| `mcp-servers/` | Built-in Python MCP servers (email, time, web-scraper) |
| `skills/` | Skill packages for AI context injection (examples/, public/, user/) |
| `server/` | Optional Fastify backend proxy |

### IPC Communication

Renderer-to-main communication goes through `preload.ts` context bridge, exposing `window.electronAPI`. All IPC methods are typed in `src/types/electron.d.ts`.

### Storage Architecture

StorageService uses a multi-backend architecture:
- `LocalStorageBackend` - Browser localStorage (fallback)
- `FileSystemBackend` - Electron file system (primary)
- `HttpBackend` - Remote sync server (optional cloud sync)

Data is stored at:
- macOS: `~/Library/Application Support/mirrorgrap-work/`
- Windows: `%APPDATA%/mirrorgrap-work/`
- Linux: `~/.config/mirrorgrap-work/`

## MCP Integration

MCP (Model Context Protocol) servers enable extensible tool/function calling:
- Transports: STDIO and SSE
- Built-in servers: email-server, time-server, web-scraper (Python-based, require `uv`/`uvx`)
- Custom servers can be added via MCPView component
- MCP servers and skills are unpacked from ASAR for runtime execution

## Skills System

Skills are domain knowledge packages injected into AI context:
- Located in `frontend/skills/` directory
- Categories: `examples/` (docx, pdf, xlsx, pptx), `public/`, `user/`
- Each skill has a `SKILL.md` file with instructions
- Managed through useSkills composable

## Code Conventions

### Path Alias

`@/` is aliased to `src/` in TypeScript and Vite configs.

### Vue Composables Pattern

Stateful logic is extracted into composables in `src/composables/`:
- `useMCP.ts` - MCP server management
- `useSkills.ts` - Skills loading and injection
- `useImageGenerator.ts` - Image generation

### Styling

CSS-only (no framework). See `UI标准.md` for complete specifications.

Key points:
- No gradients or emoji (use SVG instead)
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Code font: `'SF Mono', Monaco, 'Andale Mono', monospace`
- Primary button: `#007aff` bg, `44px × 44px`, circular
- Border: `rgba(60, 60, 67, 0.12)` (default), focus: `#007aff`
- Background: `#fbfbfd` (main), `#ffffff` (panel)
- Chat input: `24px` border-radius, `12px 16px` padding

## Environment Requirements

- Node.js >= 18
- npm >= 9
- Optional: `uv`/`uvx` for Python MCP servers, `npx` for Node.js MCP servers

## Related Documentation

| Document | Description |
|----------|-------------|
| `README.md` | Project overview (bilingual) |
| `BUILD.md` | Detailed build guide |
| `UI标准.md` | Complete UI design standards |
| `frontend/docs/SYNC_API_SPEC.md` | Cloud sync API specification |