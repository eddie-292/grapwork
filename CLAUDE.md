# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenChat Desktop** - A cross-platform desktop chat application (Electron + Vue 3 + TypeScript) that supports any OpenAI-compatible LLM API. Features:
- **Task Mode**: Decomposes complex user requests into executable subtasks with working memory management
- **Global Memory**: Persistent knowledge storage for user preferences and custom context
- **Assistant System**: Custom AI assistant/system prompt management
- **Unified Storage**: Pluggable storage backend system (LocalStorage, FileSystem, HTTP) with type-safe APIs

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
│   │   ├── ChatView.vue             # Main chat interface + task mode UI
│   │   ├── NormalChat.vue           # Standard chat mode component
│   │   ├── TaskModePanel.vue        # Task list display and controls
│   │   ├── SettingsView.vue         # API configuration management
│   │   ├── AssistantView.vue        # Assistant system prompt management
│   │   ├── GlobalMemoryView.vue     # Global memory management UI
│   │   ├── SaveToGlobalMemoryDialog.vue
│   │   ├── GlobalMemoryFormDialog.vue
│   │   ├── ConfirmDialog.vue        # Generic confirmation dialog
│   │   ├── HtmlPreviewDialog.vue    # HTML content preview in iframe
│   │   └── LoginView.vue            # Authentication entry point
│   ├── composables/
│   │   ├── useTaskMode.ts           # Task planning, execution, retry logic
│   │   ├── useWorkingMemory.ts      # Per-chat task memory
│   │   └── useGlobalMemory.ts       # Global knowledge storage
│   ├── services/
│   │   ├── StorageService.ts        # Unified storage layer (singleton)
│   │   └── storage/
│   │       ├── LocalStorageBackend.ts    # localStorage implementation
│   │       ├── FileSystemBackend.ts     # Electron fs implementation
│   │       └── HttpBackend.ts            # Remote HTTP storage
│   ├── types/
│   │   ├── task.ts                  # Task mode TypeScript definitions
│   │   ├── globalMemory.ts          # Global memory type definitions
│   │   ├── storage.ts               # Storage service type definitions
│   │   ├── chat.ts                  # Chat message types
│   │   └── electron.d.ts            # Electron IPC API types
│   └── router/
│       └── index.ts            # Vue Router config with auth guards
├── vite.config.ts              # Renderer build config
├── vite.electron.config.ts     # Electron build config
└── electron-builder.json       # Packaging config
```

### Task Mode Architecture

Executes complex multi-step requests:

1. **Planning Phase**: LLM decomposes user request into 3-6 subtasks
2. **Execution Phase**: Sequential task execution with streaming
3. **Working Memory**: Persistent storage of task outputs (NOTES, DRAFTS, FINAL_RESULT)
4. **Context Merge**: Automatic consolidation when token threshold exceeded

**Flow**: `ChatView.vue` → `useTaskMode.ts` → `useWorkingMemory.ts`

Key types:
- `TaskModeState`: Tracks planning/execution status
- `Task`: Individual task with status, retry count, error handling
- `WorkingMemoryEntry`: Stored by task ID and type (per-chat)
- `TaskError`: Typed errors with user-friendly messages

### Global Memory Architecture

Cross-session persistent knowledge storage system:

1. **Storage**: Uses unified StorageService (see below) - defaults to LocalStorage
2. **Types**: PREFERENCES, SETTINGS, GENERAL_INFO, CUSTOM
3. **Smart Injection**: Automatic keyword-based matching for context injection
4. **Management**: CRUD operations via `useGlobalMemory.ts` composable

**Flow**: `GlobalMemoryView.vue` → `useGlobalMemory.ts` → `StorageService` → Backend

Key types:
- `GlobalMemoryEntry`: Individual memory with keywords, metadata
- `GlobalMemory`: Container with entries array and version tracking
- `GlobalMemoryType`: Enum of memory categories

### Storage Service Architecture

**NEW**: Unified storage layer providing pluggable backends and type-safe APIs:

1. **Backends**: `LocalStorageBackend`, `FileSystemBackend`, `HttpBackend`
2. **Singleton Pattern**: `StorageService.getInstance()` provides global access
3. **Event System**: Emits events on storage operations (get, set, delete, clear)
4. **High-Level APIs**: Type-safe methods for specific data types (config, memory, assistants, etc.)

**Flow**: Components/Composables → `StorageService` → Backend (LocalStorage/FileSystem/HTTP)

Key types in `types/storage.ts`:
- `IStorageBackend`: Interface all backends must implement
- `StorageKey`: Enum of all storage keys (IS_LOGGED_IN, LLM_CONFIG_LIST, GLOBAL_MEMORY, etc.)
- `StorageResult<T>`: Wrapper for operation results with success/error handling
- `StorageBackendType`: Enum of available backend types

Usage example:
```typescript
import { storage } from '@/services/StorageService';

// High-level API
const config = await storage.getConfigList();
await storage.saveConfigList(newConfig);

// Low-level API
const result = await storage.get<CustomType>('custom-key');
await storage.set('custom-key', customValue);
```

### IPC Communication

Renderer → Main process handlers (legacy, being migrated to StorageService):
- `get-config`: Load API configurations
- `save-config`: Persist API configurations
- `chat-request`: Initiate streaming chat completion
- `getGlobalMemory`: Load global memory entries (migrated to StorageService)
- `saveGlobalMemory`: Persist global memory entries (migrated to StorageService)

**Note**: Most storage now uses the unified `StorageService` instead of direct IPC. See Storage Service Architecture above.

Config storage location (platform-specific, when using Electron backend):
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

### Assistant System

Custom system prompts/assistants management:
- Stored via `StorageService` (defaults to LocalStorage backend)
- Each assistant has: `id`, `name`, `emoji`, `systemPrompt`, `createdAt`
- Active assistant tracked via `activeIndex`
- Managed in `AssistantView.vue` component
- Storage key: `StorageKey.ASSISTANT_LIST`

### Global Memory Types

Memory entry categories:
- `PREFERENCES`: User UI preferences (colors, styles)
- `SETTINGS`: General application settings
- `GENERAL_INFO`: General knowledge/information
- `CUSTOM`: User-defined custom types

Each entry includes keywords for smart matching and metadata tracking (usage count, last used).

## Common Development Patterns

### Adding Storage Operations

1. Use `StorageService` from `@/services/StorageService` (singleton)
2. Import the singleton: `import { storage } from '@/services/StorageService'`
3. For new storage keys, add to `StorageKey` enum in `types/storage.ts`
4. Use high-level APIs when available (e.g., `storage.getConfigList()`)
5. For custom data, use low-level `storage.get<T>()` / `storage.set<T>()`

**Do NOT** use `localStorage` directly - always use `StorageService` for consistency.

### Adding New Storage Backends

1. Create new backend class in `services/storage/` implementing `IStorageBackend`
2. Add new enum value to `StorageBackendType` in `types/storage.ts`
3. Register backend in `StorageService.createBackend()` method
4. Configure and switch via `storage.configureHttpBackend()` / `storage.switchBackend()`

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

### Adding Global Memory Types

1. Add new enum value to `GlobalMemoryType` in `types/globalMemory.ts`
2. Update UI in `GlobalMemoryView.vue` to handle new type
3. Add matching logic in `useGlobalMemory.ts` if needed

### Electron IPC Patterns

**Note**: Most storage now uses `StorageService` instead of IPC. Only use IPC for:
- Native OS operations (file dialogs, system notifications)
- Window management
- Processes/external applications

To add new IPC handlers:
1. Define interface in `src/types/electron.d.ts` (window.electronAPI)
2. Add handler in `electron/main.ts` using `ipcMain.handle()`
3. Expose in `electron/preload.ts` via `contextBridge.exposeInMainWorld()`

### Routing

Uses hash-based routing with auth guard checking `storage.getIsLoggedIn()`. Routes defined in `src/router/index.ts`.

**Authentication**: Simple token-based auth stored via `StorageService`. The `isLoggedIn` flag gates access to main routes (LoginView.vue sets it on successful auth).

## Build System

Dual build process:
- **Renderer**: Vite → `dist/` (Vue SPA)
- **Electron**: esbuild → `dist-electron/main.cjs`, `preload.cjs`
- **Package**: electron-builder → `release/` (.dmg, .exe, .AppImage, .deb)

**Build details**:
- Path alias `@` maps to `src/` directory (configured in vite.config.ts)
- ASAR packaging enabled (`asar: true` in electron-builder.json)
- Dev server proxies `/api` to `localhost:8787` for optional web server mode

## Testing the Application

1. Start dev: `npm run electron:dev` (opens Electron with DevTools)
2. Configure API: Click gear icon → Add API config
3. Test chat: Send message → Verify streaming response
4. Test Task Mode: Enable → Send complex request → Verify task breakdown
5. Test Global Memory: Add entry via dialog → Verify auto-injection in new chats
6. Test Assistants: Create assistant → Select → Verify system prompt applied
