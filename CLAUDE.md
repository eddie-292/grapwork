# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenChat Desktop** - A cross-platform desktop chat application (Electron + Vue 3 + TypeScript) that supports any OpenAI-compatible LLM API. Features a unique **Task Mode** that decomposes complex user requests into executable subtasks with working memory management.

## Development Commands

All commands should be run from the `/frontend` directory:

```bash
# Development: Start Electron with hot reload (Vite dev server + Electron main process)
npm run electron:dev

# Build renderer only (Vue app to dist/)
npm run build:renderer

# Build Electron processes only (main/preload to dist-electron/)
npm run build:electron

# Full production build + packaging (creates installers in release/)
npm run electron:build

# Watch Electron build during development
npm run build:electron:watch
```

For the optional web server (`/server`):
```bash
npm run dev  # Runs Fastify server on port 8787
```

## Architecture

### Process Structure

**Main Process** (`electron/main.ts`):
- Manages Electron BrowserWindow lifecycle
- Handles IPC communication for config and API requests
- Stores config in platform-specific userData directory
- Entry point: `dist-electron/main.cjs`

**Renderer Process** (Vue 3 app):
- SPA with hash-based routing
- Components in `src/components/`
- Entry point: `dist/index.html`

### Key Files and Directories

```
frontend/
├── electron/
│   ├── main.ts           # Electron main process (IPC, config, window mgmt)
│   └── preload.ts        # Context bridge for renderer→main communication
├── src/
│   ├── components/
│   │   ├── ChatView.vue        # Main chat interface + task mode UI
│   │   ├── NormalChat.vue      # Standard chat mode component
│   │   ├── TaskModePanel.vue   # Task list display and controls
│   │   ├── SettingsView.vue    # API configuration management
│   │   ├── AssistantView.vue   # Assistant system prompt management
│   │   └── LoginView.vue       # Authentication entry point
│   ├── composables/
│   │   ├── useTaskMode.ts      # Task planning, execution, retry logic
│   │   └── useWorkingMemory.ts # Persistent task memory (localStorage)
│   ├── types/
│   │   ├── task.ts             # Task mode TypeScript definitions
│   │   └── electron.d.ts       # Electron IPC API types
│   └── router/
│       └── index.ts            # Vue Router config with auth guards
├── vite.config.ts              # Renderer build config
├── vite.electron.config.ts     # Electron build config
└── electron-builder.json       # Packaging config
```

### Task Mode Architecture

The most distinctive feature - executes complex multi-step requests:

1. **Planning Phase**: LLM decomposes user request into 3-6 subtasks
2. **Execution Phase**: Sequential task execution with streaming
3. **Working Memory**: Persistent storage of task outputs (NOTES, DRAFTS, FINAL_RESULT)
4. **Context Merge**: Automatic consolidation when token threshold exceeded

**Flow**: `ChatView.vue` → `useTaskMode.ts` → `useWorkingMemory.ts`

Key types:
- `TaskModeState`: Tracks planning/execution status
- `Task`: Individual task with status, retry count, error handling
- `WorkingMemoryEntry`: Stored by task ID and type
- `TaskError`: Typed errors with user-friendly messages

### IPC Communication

Renderer → Main process handlers:
- `get-config`: Load API configurations
- `save-config`: Persist API configurations
- `chat-request`: Initiate streaming chat completion

Config storage location (platform-specific):
- macOS: `~/Library/Application Support/openchat-desktop/config.json`
- Windows: `%APPDATA%/openchat-desktop/config.json`
- Linux: `~/.config/openchat-desktop/config.json`

### Streaming Response Handling

Supports multiple reasoning formats:
- **DeepSeek**: `choices[0].delta.reasoning_content`
- **Qwen**: `<think>` tags parsed via state machine
- **Standard**: `choices[0].delta.content`

Parsed in `useTaskMode.ts`: `parseQwenStreamDelta()`

## Configuration

### API Configuration Structure

```typescript
interface AppConfig {
  apiUrl: string      // Base URL (e.g., "https://api.openai.com/v1")
  apiKey: string      // Bearer token
  model: string       // Model name (e.g., "gpt-4o-mini")
  name: string        // Display name
  enabled: boolean    // Active config flag
  extra_body?: string // JSON string merged into request body
}
```

### Task Mode Options

Per-chat configuration:
- `tokenThreshold`: Default 8000 - triggers context merge
- `autoExecute`: Skip confirmation dialog
- `maxRetries`: Retry failed tasks (default 0)
- `skipOnError`: Continue execution on task failure
- `workingMemory.{enabled, autoSave, maxEntriesPerType}`

## Common Development Patterns

### Adding New Chat Features

1. UI changes: Edit `ChatView.vue` directly
2. Business logic: Extract to `composables/` following `useTaskMode.ts` pattern
3. Types: Add/update definitions in `types/`

### Adding New API Providers

Provider must support OpenAI `/chat/completions` format. For custom parameters, use the `extra_body` config field (JSON string merged into request body).

### Extending Task Mode

1. Define new types in `types/task.ts`
2. Add execution logic in `composables/useTaskMode.ts`
3. Update `composables/useWorkingMemory.ts` for memory integration

### Routing

Uses hash-based routing with auth guard checking `localStorage.getItem('isLoggedIn')`. Routes defined in `src/router/index.ts`.

## Build System

Dual build process:
- **Renderer**: Vite → `dist/` (Vue SPA)
- **Electron**: esbuild → `dist-electron/main.cjs`, `preload.cjs`
- **Package**: electron-builder → `release/` (.dmg, .exe, .AppImage, .deb)

## Testing the Application

1. Start dev: `npm run electron:dev` (opens Electron with DevTools)
2. Configure API: Click gear icon → Add API config
3. Test chat: Send message → Verify streaming response
4. Test Task Mode: Enable → Send complex request → Verify task breakdown
