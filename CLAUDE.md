# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenChat Desktop** - A cross-platform desktop chat application (Electron + Vue 3 + TypeScript) that supports any OpenAI-compatible LLM API. Features:
- **Task Mode**: Decomposes complex user requests into executable subtasks with working memory management
- **Global Memory**: Persistent knowledge storage for user preferences and custom context
- **Assistant System**: Custom AI assistant/system prompt management
- **MCP Support**: Model Context Protocol integration for extensible tool/function calling with STDIO/SSE transports
- **Unified Storage**: Pluggable storage backend system (LocalStorage, FileSystem, HTTP) with type-safe APIs
- **Skills System**: Domain knowledge packages that can be injected into AI context (SKILL.md files with frontmatter)

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

**Server Configuration:**
- Requires `OPENAI_API_KEY` environment variable
- Default port: 8787 (override with `PORT` env var)
- Endpoints:
  - `GET /api/health` - Health check
  - `POST /api/chat/completions` - Full OpenAI-compatible endpoint (supports task mode with extra params)
  - `POST /api/chat` - Simple chat endpoint (streaming only)

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
│   ├── main.ts           # Electron main process (IPC, config, window mgmt, MCP client, file operations)
│   └── preload.ts        # Context bridge for renderer→main communication
├── src/
│   ├── components/
│   │   ├── ChatView.vue             # Main chat interface + task mode UI
│   │   ├── NormalChat.vue           # Standard chat mode component
│   │   ├── TaskModePanel.vue        # Task list display and controls
│   │   ├── WorkspaceView.vue        # Workspace/file browser component
│   │   ├── SettingsView.vue         # Unified settings (tabs: LLM, assistants, memory, MCP, skills, theme)
│   │   ├── AssistantView.vue        # Assistant system prompt management
│   │   ├── MCPView.vue              # MCP server configuration management
│   │   ├── LoginView.vue            # Authentication entry point
│   │   ├── EnvironmentCheckView.vue # Environment dependency check UI
│   │   ├── ChangelogView.vue        # Update changelog display
│   │   ├── settings/
│   │   │   ├── LLMConfigPanel.vue       # LLM API configuration form
│   │   │   ├── CodeHighlightThemePanel.vue  # Code theme selection
│   │   │   └── SkillsPanel.vue          # Skills management UI
│   │   ├── GlobalMemoryFormDialog.vue
│   │   ├── SaveToGlobalMemoryDialog.vue
│   │   ├── ConfirmDialog.vue        # Generic confirmation dialog
│   │   └── HtmlPreviewDialog.vue    # HTML content preview in iframe
│   ├── composables/
│   │   ├── useTaskMode.ts           # Task planning, execution, retry logic
│   │   ├── useWorkingMemory.ts      # Per-chat task memory
│   │   ├── useGlobalMemory.ts       # Global knowledge storage
│   │   ├── useMCP.ts                # MCP server management
│   │   └── useSkills.ts             # Skills management
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
│   │   ├── mcp.ts                   # MCP (Model Context Protocol) types
│   │   ├── skill.ts                 # Skills system types
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

**Flow**: `SettingsView.vue` (memory tab) → `useGlobalMemory.ts` → `StorageService` → Backend

Key types:
- `GlobalMemoryEntry`: Individual memory with keywords, metadata
- `GlobalMemory`: Container with entries array and version tracking
- `GlobalMemoryType`: Enum of memory categories

### Skills System Architecture

Domain knowledge packages that can be injected into AI context:

1. **Skill Locations** (priority order, higher = higher priority):
   - `USER`: User-created skills in app data directory (read-write)
   - `INSTALLED`: Installed via `npx skills add`, stored in `~/.agents/skills` (read-only in app)
   - `PUBLIC`: System built-in skills (read-only)
   - `EXAMPLES`: Example skills (read-only)

2. **Skill Structure**:
   - `SKILL.md` file with YAML frontmatter (name, description, version, author, tags, triggers)
   - Optional scripts, references, and assets

3. **Context Levels**:
   - L1: Name + description only (lightweight listing)
   - L2: Full SKILL.md body content (loaded on demand)
   - L3: All assets including scripts and references

**Flow**: `SettingsView.vue` (skills tab) → `useSkills.ts` → IPC → main process file operations

Key types in `types/skill.ts`:
- `SkillFrontmatter`: Parsed SKILL.md frontmatter
- `SkillMetadata`: Skill metadata with runtime state (id, path, enabled, hasError)
- `Skill`: Complete skill with body content
- `SkillRegistry`: Stored skills and active skill IDs

**IPC Handlers** (main.ts):
- `skills-scan`: Scan all skill directories
- `skills-load`: Load skill body by ID
- `skills-create`: Create new user skill
- `skills-update`: Update skill body (user location only)
- `skills-delete`: Delete skill (user location only)

### MCP (Model Context Protocol) Architecture

Extensible tool/function calling system that integrates with OpenAI-compatible APIs:

1. **Transport Types**: STDIO (child process) and SSE (Server-Sent Events)
2. **Server Management**: Configure multiple MCP servers with enable/disable per chat
3. **Tool Integration**: Automatically converts MCP tools to OpenAI Function Calling format
4. **Execution**: Handles tool calls, results, and error handling in chat flow

**Main Process MCP Classes** (in `electron/main.ts`):
- `MCPClient`: Manages stdio communication with MCP server processes (JSON-RPC 2.0)
- `SimpleCommandExecutor`: Executes one-off shell commands (whitelisted)
- `MCPClientManager`: Manages multiple MCP client instances

**Flow**: `MCPView.vue` → `useMCP.ts` → `StorageService` → IPC → `MCPClient` in main process

Key types in `types/mcp.ts`:
- `MCPServer`: Server configuration (command, args, env for STDIO; url for SSE)
- `MCPToolDefinition`: Tool schema matching OpenAI function format
- `OpenAIToolCall`: Tool call requests from LLM
- `MCPToolResult`: Tool execution results returned to LLM
- `MCPChatMessage`: Extended chat message with tool role support

Usage pattern:
- MCP tools are automatically injected into API requests as `tools` array
- LLM responses with `tool_calls` are executed via configured MCP servers
- Tool results are appended as `role: 'tool'` messages for context

**MCP Server Examples** (`mcp-servers/` directory):
- `email-server/`: Python-based email MCP server (SMTP/IMAP)
  - Run with: `uvx --from ./mcp-servers/email-server email_server`
  - Configure via environment variables (see `.env.example`)
  - See `mcp-servers/email-server/README.md` for setup details

### Storage Service Architecture

Unified storage layer providing pluggable backends and type-safe APIs:

1. **Backends**: `LocalStorageBackend`, `FileSystemBackend`, `HttpBackend`
2. **Singleton Pattern**: `StorageService.getInstance()` provides global access
3. **Event System**: Emits events on storage operations (get, set, delete, clear)
4. **High-Level APIs**: Type-safe methods for specific data types (config, memory, assistants, etc.)

**Flow**: Components/Composables → `StorageService` → Backend (LocalStorage/FileSystem/HTTP)

Key types in `types/storage.ts`:
- `IStorageBackend`: Interface all backends must implement
- `StorageKey`: Enum of all storage keys (IS_LOGGED_IN, LLM_CONFIG_LIST, GLOBAL_MEMORY, MCP_SERVER_LIST, etc.)
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

Renderer → Main process handlers:

**Config/Storage** (legacy, mostly migrated to StorageService):
- `get-config` / `save-config`: API configurations
- `get-global-memory` / `save-global-memory`: Global memory entries

**Chat/API**:
- `chat-request`: Initiate streaming chat completion

**MCP** (in main.ts):
- `mcp-list-tools`: List tools from MCP server
- `mcp-call-tool`: Execute MCP tool
- `mcp-cleanup`: Cleanup MCP clients

**File Operations** (see Built-in File Operations above):
- `file-operation`: Unified handler for all file operations
- `select-folder` / `read-directory`: Folder selection and browsing

**System**:
- `open-external`: Open URL in default browser
- `check-environment`: Check system dependencies
- `get-changelog`: Read 更新日志.md

**Note**: Most storage now uses the unified `StorageService` instead of direct IPC.

Config storage location (platform-specific, when using Electron backend):
- macOS: `~/Library/Application Support/openchat-desktop/config.json`
- Windows: `%APPDATA%/openchat-desktop/config.json`
- Linux: `~/.config/openchat-desktop/config.json`

### Built-in File Operations (Main Process)

The Electron main process provides native file operations via `file-operation` IPC handler (used by WorkspaceView):

- `list_directory`: List directory contents
- `create_directory`: Create new directory
- `move_file`: Move file/directory
- `copy_file`: Copy file/directory (recursive for dirs)
- `rename_item`: Rename file/directory
- `delete_item`: Delete file/directory
- `glob`: Search files by pattern
- `grep`: Search file contents by regex
- `read_file`: Read file with line range support
- `write_file`: Write/create file
- `edit_file`: String replacement in file
- `execute_command`: Execute shell command in workspace

All operations include path traversal protection (paths must stay within base directory).

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
- Stored as `{ assistants: Assistant[], activeIndex: number }` structure
- Active assistant tracked via `activeIndex` field
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
2. Update UI in `SettingsView.vue` (memory tab) to handle new type
3. Add matching logic in `useGlobalMemory.ts` if needed

### Adding MCP Tools/Integrations

For custom tools without MCP servers, configure as "Simple Commands" in `MCPView.vue`:
- Set `simpleCommand: true` on MCPServer
- Tools are exposed via OpenAI Function Calling format
- Executed through IPC to Electron main process

For full MCP servers:
- STDIO: Configure `command`, `args`, `env` for local MCP server processes
- SSE: Configure `url` for remote MCP server endpoints
- Tools are auto-discovered from server via `listTools` call

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

**Route structure**:
- `/environment-check`: Environment check page (no auth required, skips itself)
- `/login`: Authentication page
- `/`: Main chat view
- `/settings`: Unified settings page with tab query param (`?tab=assistants|memory|mcp|skills`)
- Legacy routes (`/assistants`, `/global-memory`, `/mcp`) redirect to `/settings?tab=...`

**Environment Check Flow**: On first launch, checks for required commands (node, npx, uvx, uv) and config directory permissions. Results cached in `sessionStorage.envCheckPassed`.

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

## Code Quality

**TypeScript**: Strict mode enabled with additional checks (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`).

**No linting/formatting tools**: No ESLint or Prettier configured. Follow existing code patterns.

**No automated tests**: Manual testing via `npm run electron:dev` is required.

## Testing the Application

1. Start dev: `npm run electron:dev` (opens Electron with DevTools)
2. Configure API: Click gear icon → Add API config
3. Test chat: Send message → Verify streaming response
4. Test Task Mode: Enable → Send complex request → Verify task breakdown
5. Test Global Memory: Add entry via dialog → Verify auto-injection in new chats
6. Test Assistants: Create assistant → Select → Verify system prompt applied
7. Test MCP: Configure MCP server → Enable for chat → Verify tool calling works
8. Test Skills: Create skill → Enable → Verify skill context appears in system prompt

## IDE Setup

**Recommended VSCode Extension:**
- `Vue.volar` (for Vue 3 + TypeScript support)
