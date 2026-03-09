# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MirrorGrap Work** - A cross-platform desktop AI Agent assistant (Electron + Vue 3 + TypeScript) that supports any OpenAI-compatible LLM API. Features:
- **Global Memory**: Persistent knowledge storage for user preferences and custom context with smart keyword matching
- **Assistant System**: Custom AI assistant/system prompt management with default "EddieLab-Agent (ELA)"
- **MCP Support**: Model Context Protocol integration for extensible tool/function calling with STDIO/SSE transports
- **Unified Storage**: Pluggable storage backend system (LocalStorage, FileSystem, HTTP) with type-safe APIs
- **Skills System**: Domain knowledge packages that can be injected into AI context (SKILL.md files with frontmatter)
- **Workspace View**: Built-in file browser and management capabilities
- **Multi-chat Support**: Tab-based chat management with search functionality

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

# Generate application icons
npm run generate-icons
```

For the optional web server (from `/server` directory):
```bash
cd ../server && npm run dev  # Runs Fastify server on port 8787
```

**Server Configuration:**
- Requires `OPENAI_API_KEY` environment variable
- Default port: 8787 (override with `PORT` env var)
- Endpoints:
  - `GET /api/health` - Health check
  - `POST /api/chat/completions` - Full OpenAI-compatible endpoint
  - `POST /api/chat` - Simple chat endpoint (streaming only)

## Architecture

### Process Structure

**Main Process** (`electron/main.ts`):
- Manages Electron BrowserWindow lifecycle
- Handles IPC communication for config and API requests
- MCP client implementation (JSON-RPC 2.0)
- Simple command executor with whitelist for safe shell commands
- Skills file system operations
- Entry point: `dist-electron/main.cjs`

**Renderer Process** (Vue 3 app):
- SPA with hash-based routing
- Components in `src/components/`
- Entry point: `dist/index.html`

### Key Files and Directories

```
frontend/
├── electron/
│   ├── main.ts           # Electron main process (IPC, MCP client, file operations, skills)
│   └── preload.ts        # Context bridge for renderer→main communication
├── src/
│   ├── components/
│   │   ├── ChatView.vue             # Main chat interface with multi-tab support
│   │   ├── NormalChat.vue           # Standard chat mode component
│   │   ├── ChatTabBar.vue           # Tab bar with search functionality
│   │   ├── WorkspaceView.vue        # Workspace/file browser component
│   │   ├── SettingsView.vue         # Unified settings (8 tabs)
│   │   ├── AssistantView.vue        # Assistant system prompt management
│   │   ├── GlobalMemoryView.vue     # Global memory management UI
│   │   ├── MCPView.vue              # MCP server configuration management
│   │   ├── LoginView.vue            # Authentication entry point
│   │   ├── EnvironmentCheckView.vue # Environment dependency check UI
│   │   ├── ChangelogView.vue        # Update changelog display
│   │   ├── SaveToGlobalMemoryDialog.vue
│   │   ├── ConfirmDialog.vue
│   │   ├── HtmlPreviewDialog.vue
│   │   ├── settings/
│   │   │   ├── LLMConfigPanel.vue       # LLM API configuration form
│   │   │   ├── CodeHighlightThemePanel.vue  # Code theme selection
│   │   │   ├── SkillsPanel.vue          # Skills management UI
│   │   │   └── EnvironmentCheckPanel.vue   # Environment check panel
│   │   └── icons/                   # Icon components (40+)
│   ├── composables/
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
│   │   ├── globalMemory.ts          # Global memory type definitions
│   │   ├── storage.ts               # Storage service type definitions
│   │   ├── mcp.ts                   # MCP (Model Context Protocol) types
│   │   ├── skill.ts                 # Skills system types
│   │   ├── chat.ts                  # Chat message types
│   │   └── electron.d.ts            # Electron IPC API types
│   └── router/
│       └── index.ts                 # Vue Router config with auth guards
├── vite.config.ts                   # Renderer build config
├── vite.electron.config.ts          # Electron build config
└── electron-builder.json            # Packaging config
```

### Global Memory Architecture

Cross-session persistent knowledge storage system:

1. **Storage**: Uses unified StorageService - defaults to LocalStorage
2. **Types**: PREFERENCES, SETTINGS, GENERAL_INFO, CUSTOM
3. **Smart Injection**: Automatic keyword-based matching for context injection
4. **Management**: CRUD operations via `useGlobalMemory.ts` composable

**Flow**: `GlobalMemoryView.vue` → `useGlobalMemory.ts` → `StorageService` → Backend

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

**Flow**: `SkillsPanel.vue` → `useSkills.ts` → IPC → main process file operations

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
5. **Simple Commands**: Whitelisted shell commands (non-MCP) with risk detection

**Main Process MCP Classes** (in `electron/main.ts`):
- `MCPClient`: Manages stdio communication with MCP server processes (JSON-RPC 2.0)
- `SimpleCommandExecutor`: Executes one-off shell commands with whitelist and risk detection
- `MCPClientManager`: Manages multiple MCP client instances

**Flow**: `MCPView.vue` → `useMCP.ts` → `StorageService` → IPC → `MCPClient` in main process

Key types in `types/mcp.ts`:
- `MCPServer`: Server configuration (command, args, env for STDIO; url for SSE)
- `MCPToolDefinition`: Tool schema matching OpenAI function format
- `OpenAIToolCall`: Tool call requests from LLM
- `MCPToolResult`: Tool execution results returned to LLM
- `MCPChatMessage`: Extended chat message with tool role support

**Simple Command Whitelist** (in main.ts):
- Safe commands: `date`, `ls`, `pwd`, `echo`, `cat`, `head`, `tail`, `wc`, `grep`, `whoami`, `hostname`, `uname`, `cal`, `uptime`, `df`, `du`, `ps`, `env`
- Risk detection: delete, format, chmod, shutdown, network config, package managers, kill commands, sudo

### Storage Service Architecture

Unified storage layer providing pluggable backends and type-safe APIs:

1. **Backends**: `LocalStorageBackend`, `FileSystemBackend`, `HttpBackend`
2. **Singleton Pattern**: `StorageService.getInstance()` provides global access
3. **Event System**: Emits events on storage operations (get, set, delete, clear)
4. **High-Level APIs**: Type-safe methods for specific data types (config, memory, assistants, etc.)

**Flow**: Components/Composables → `StorageService` → Backend (LocalStorage/FileSystem/HTTP)

Key types in `types/storage.ts`:
- `IStorageBackend`: Interface all backends must implement
- `StorageKey`: Enum of all storage keys (IS_LOGGED_IN, LLM_CONFIG_LIST, GLOBAL_MEMORY, MCP_SERVER_LIST, SKILL_REGISTRY, etc.)
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

**Chat/API**:
- `chat-request`: Initiate streaming chat completion

**MCP** (in main.ts):
- `mcp-list-tools`: List tools from MCP server
- `mcp-call-tool`: Execute MCP tool
- `mcp-cleanup`: Cleanup MCP clients

**File Operations**:
- `file-operation`: Unified handler for all file operations
- `select-folder` / `read-directory`: Folder selection and browsing

**Skills**:
- `skills-scan/load/create/update/delete`: Skills management

**System**:
- `open-external`: Open URL in default browser
- `check-environment`: Check system dependencies
- `window-minimize/maximize/close`: Window controls

**Note**: Most storage uses the unified `StorageService` instead of direct IPC.

Config storage location (platform-specific, when using Electron backend):
- macOS: `~/Library/Application Support/mirrorgrap-work/config.json`
- Windows: `%APPDATA%/mirrorgrap-work/config.json`
- Linux: `~/.config/mirrorgrap-work/config.json`

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
- **Qwen**: `` tags parsed via state machine
- **Standard**: `choices[0].delta.content`

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

### Chat Parameters (Per-Chat)

OpenAI-compatible parameters:
- `temperature`: Control randomness (0-2, default 1)
- `top_p`: Nucleus sampling (0-1, default 1)
- `max_tokens`: Max generation tokens (0 = unlimited)
- `presence_penalty`: Presence penalty (-2.0 to 2.0, default 0)
- `frequency_penalty`: Frequency penalty (-2.0 to 2.0, default 0)
- `seed`: Random seed for reproducibility

### Assistant System

Custom system prompts/assistants management:
- Default assistant: "EddieLab-Agent (ELA)" with comprehensive system prompt
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
2. Business logic: Extract to `composables/` following existing patterns
3. Types: Add/update definitions in `types/`

### Adding New API Providers

Provider must support OpenAI `/chat/completions` format. For custom parameters, use the `extra_body` config field (JSON string merged into request body).

### Adding MCP Tools/Integrations

For custom tools without MCP servers, configure as "Simple Commands" in `MCPView.vue`:
- Set `simpleCommand: true` on MCPServer
- Tools are exposed via OpenAI Function Calling format
- Executed through IPC to Electron main process
- Subject to whitelist and risk detection

For full MCP servers:
- STDIO: Configure `command`, `args`, `env` for local MCP server processes
- SSE: Configure `url` for remote MCP server endpoints
- Tools are auto-discovered from server via `listTools` call

### Electron IPC Patterns

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
- `/settings`: Unified settings page with tab query param (`?tab=llm|theme|assistants|memory|mcp|skills|environment|changelog`)
- Legacy routes (`/assistants`, `/global-memory`, `/mcp`) redirect to `/settings?tab=...`

**Environment Check Flow**: On first launch, checks for required commands (node, npx, uvx, uv) and config directory permissions. Results cached in `localStorage.firstEnvCheckDone`.

**Authentication**: Simple token-based auth stored via `StorageService`. The `isLoggedIn` flag gates access to main routes.

## Settings Tabs

The unified settings page (`SettingsView.vue`) contains 8 tabs:
1. **LLM 接口配置**: API configuration management
2. **代码高亮主题**: Code syntax highlighting theme selection
3. **社区助理**: Assistant/system prompt management
4. **全局记忆**: Global memory CRUD operations
5. **MCP 服务器**: MCP server configuration
6. **技能管理**: Skills management
7. **环境检测**: Environment dependency check
8. **更新日志**: Changelog viewer

Plus a "清空对话" (Clear Chats) button at the bottom.

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
4. Test Global Memory: Add entry → Verify auto-injection in new chats
5. Test Assistants: Create assistant → Select → Verify system prompt applied
6. Test MCP: Configure MCP server → Enable for chat → Verify tool calling works
7. Test Skills: Create skill → Enable → Verify skill context appears in system prompt
8. Test Workspace: Select folder → Browse files → Verify file operations

## IDE Setup

**Recommended VSCode Extension:**
- `Vue.volar` (for Vue 3 + TypeScript support)
