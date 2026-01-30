# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Project Overview

OpenChat Desktop is a full-stack desktop chat application built with Electron that provides a clean interface for conversing with any OpenAI-compatible LLM API. Users can configure custom API endpoints, API keys, and models through a settings interface. The project follows a client-server architecture with a Vue 3 frontend running in Electron and an optional Fastify-based Node.js backend for web mode.

## Architecture

### High-Level Structure

The codebase is split into two main directories:

- **`frontend/`**: Electron + Vue 3 + TypeScript + Vite desktop application
- **`server/`**: Optional Fastify Node.js server for web-based deployment (not required for desktop mode)

### Frontend Architecture (Desktop App)

The frontend is a Vue 3 Single Page Application wrapped in Electron, built with:

- **Desktop Framework**: Electron for cross-platform desktop application
- **Build Tool**: Vite for fast development and optimized production builds
- **Language**: TypeScript with Vue 3 Composition API (`<script setup>`)
- **UI Framework**: Custom CSS with no external component library
- **Markdown Rendering**: `markdown-it` for processing assistant responses
- **Syntax Highlighting**: `highlight.js` for code blocks in chat messages

**Component Structure**:
- `main.ts`: Entry point that mounts the Vue app
- `App.vue`: Root component that renders `ChatView`
- `components/ChatView.vue`: Main chat interface handling all user interactions and API calls
- `components/SettingsView.vue`: Configuration modal for API settings (URL, key, model)

**Electron Structure**:
- `electron/main.ts`: Electron main process - handles window creation, IPC, and config persistence
- `electron/preload.ts`: Preload script that exposes safe IPC methods to renderer via `contextBridge`
- `src/types/electron.d.ts`: TypeScript definitions for Electron API exposed to renderer

**Key Frontend Features**:
- Real-time streaming of AI responses using Server-Sent Events (SSE)
- Configurable LLM endpoints supporting any OpenAI-compatible API
- Local configuration storage using Electron's userData directory
- Markdown rendering with syntax-highlighted code blocks
- Message history maintained in component state
- Abort controller for cancelling in-progress requests
- Auto-scrolling to latest messages
- Settings UI with persistent configuration

**API Communication in Desktop Mode**: 
The frontend directly calls the configured LLM API endpoint from the Electron renderer process. Configuration (API URL, key, model) is stored locally via IPC to the main process, which persists it to `app.getPath('userData')/config.json`. The main process validates requests but the renderer makes direct fetch calls to the LLM API with user-provided credentials.

**Configuration Storage**:
- Desktop mode: Config stored in `{userData}/config.json` via Electron IPC
- Web mode fallback: Config stored in browser's `localStorage`
- Config includes: `apiUrl` (API base URL), `apiKey` (authentication), `model` (model name)

### Backend Architecture (Optional - Web Mode Only)

The backend is a minimal Fastify server that can act as a proxy for web deployments:

- **Framework**: Fastify for high-performance HTTP handling
- **CORS**: Enabled via `@fastify/cors` to allow frontend requests
- **Environment**: Uses `dotenv` for configuration management
- **Port**: Defaults to 8787, configurable via `PORT` environment variable

**Note**: The backend is **not required** for the Electron desktop app, as the desktop version directly calls LLM APIs. The backend is only needed if you want to deploy as a web application.

**Key Backend Features** (Web mode):
- `/api/health`: Health check endpoint returning `{ ok: true }`
- `/api/chat`: Proxy endpoint for web mode (can forward configurable API requests)

### Data Flow (Desktop Mode)

1. User configures API settings via Settings UI (⚙️ button)
2. Settings saved to `{userData}/config.json` via IPC (`electronAPI.saveConfig`)
3. User types message in `ChatView.vue` textarea
4. Message added to local `messages` array with role `user`
5. Empty `assistant` message appended to show streaming placeholder
6. Frontend loads config from main process via IPC (`electronAPI.getConfig`)
7. Frontend makes direct fetch to configured API URL with configured API key
8. LLM API returns SSE stream of token deltas
9. Frontend parses `data:` lines, extracts `delta.content`, appends to assistant message
10. UI reactively updates as content accumulates
11. Stream ends with `data: [DONE]`

### Configuration

**Frontend Configuration**:
- `vite.config.ts`: Vite configuration with Electron plugins and dev server proxy
- `tsconfig.json`: TypeScript project references setup
- `package.json`: Scripts for `dev`, `electron:dev`, `build`, `electron:build`
- Build configuration for electron-builder supporting macOS, Windows, Linux

**Backend Configuration** (optional, web mode only):
- Requires `OPENAI_API_KEY` environment variable if using original proxy mode
- Optional `PORT` environment variable (defaults to 8787)
- `package.json`: Single `dev` script to start server

**Electron Configuration**:
- Main process: `electron/main.ts` - window management, IPC handlers, config persistence
- Preload script: `electron/preload.ts` - secure IPC bridge
- User data directory for config: platform-specific location managed by Electron

### State Management

No external state management library is used. The frontend uses Vue 3's reactive system:
- `messages`: Array of `{ role, content }` objects
- `input`: Current textarea value
- `sending`: Boolean flag to prevent concurrent requests
- `controller`: AbortController instance for cancellation
- `config`: Current LLM API configuration (loaded from Electron store or localStorage)
- `showSettings`: Boolean to control settings modal visibility

### Streaming Implementation

The application implements proper SSE streaming:

**Frontend (Desktop)**: Uses Fetch API with `ReadableStream` reader, decodes chunks with `TextDecoder`, splits on `\n\n` to extract SSE events, parses JSON from `data:` lines, and incrementally updates the last message's content. Directly connects to user-configured LLM API endpoint with user-provided API key.

**Electron IPC**: The main process provides IPC handlers for:
- `get-config`: Loads configuration from userData directory
- `save-config`: Persists configuration to userData directory
- `chat-request`: Validates API connectivity (used for testing/validation)

**Backend (Web mode)**: If deployed as a web app, can pipe LLM API responses with appropriate SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`). Connection lifecycle managed by tying an AbortController to the client's connection.

## Common Development Commands

### Desktop Development (Primary Mode)

```bash
cd frontend
npm install                # Install all dependencies including Electron
npm run electron:dev       # Start Electron app in development mode with hot reload
npm run electron:build     # Build desktop app for production (creates installers)
```

The `electron:dev` command starts both Vite dev server and Electron, with auto-reload on changes. The app runs as a native desktop application with access to the Electron API.

### Web Development (Alternative Mode)

```bash
cd frontend
npm install          # Install dependencies
npm run dev          # Start Vite dev server only (web mode)
```

In web mode, the app runs in a browser and uses localStorage for config instead of Electron IPC.

### Backend Development (Optional - Web Mode Only)

```bash
cd server
npm install          # Install dependencies
npm run dev          # Start Fastify server on port 8787
```

The backend is **not required** for desktop mode. Only needed for web deployment.

### Building for Production

**Desktop App** (recommended):
```bash
cd frontend
npm run electron:build    # Creates platform-specific installers in frontend/release/
```

Supports building for:
- macOS: DMG and ZIP
- Windows: NSIS installer and ZIP
- Linux: AppImage and DEB package

**Web App** (alternative):
```bash
cd frontend
npm run build             # Creates static files in frontend/dist/
```

Then deploy `dist/` to a static hosting service and configure backend separately.

## Project Dependencies

**Frontend Core**:
- `electron` (34.0.0): Desktop application framework
- `vue` (3.5.24): UI framework
- `vite` (7.2.4): Build tool and dev server
- `vite-plugin-electron` (0.30.3): Vite plugin for Electron support
- `electron-builder` (25.2.3): Desktop app packaging and distribution
- `typescript` (5.9.3): Type system
- `markdown-it` (14.1.0): Markdown parser for chat messages
- `highlight.js` (11.11.1): Syntax highlighting for code blocks
- `concurrently` (9.1.2): Run Vite and Electron together in dev mode
- `wait-on` (8.0.1): Wait for Vite dev server before starting Electron

**Backend Core** (optional):
- `fastify` (5.7.2): Web framework
- `@fastify/cors` (11.2.0): CORS middleware
- `dotenv` (17.2.3): Environment variable management

## Code Patterns

### Adding New Chat Features

When extending `ChatView.vue`:
- Use Composition API with `<script setup>`
- Maintain message history in reactive `ref`
- Keep UI state (loading, errors) separate from data state
- Use proper TypeScript types for message structure
- Access Electron API via `window.electronAPI` (check if exists for web compatibility)

### Modifying Configuration

When adding new config options in `SettingsView.vue`:
- Update `AppConfig` interface in `src/types/electron.d.ts`
- Update default config in `electron/main.ts`
- Update settings form in `SettingsView.vue`
- Ensure backward compatibility when loading old configs

### Adding Electron IPC Handlers

When adding new IPC communication in `electron/main.ts`:
- Use `ipcMain.handle()` for async request/response patterns
- Expose handler in `electron/preload.ts` via `contextBridge.exposeInMainWorld`
- Add TypeScript definition to `src/types/electron.d.ts`
- Handle errors gracefully and return structured responses

### Multi-Platform Support

To ensure the app works in both Electron and web modes:
- Always check `if (window.electronAPI)` before using Electron features
- Provide fallbacks for web mode (e.g., localStorage instead of IPC)
- Test in both `npm run electron:dev` and `npm run dev` modes

## Security Considerations

- **API Key Protection**: API keys are stored locally in Electron's userData directory with filesystem permissions, never transmitted except directly to the user-configured LLM API
- **Context Isolation**: Electron uses `contextIsolation: true` to separate main and renderer processes
- **Preload Script**: Only specific IPC methods are exposed via `contextBridge` - no direct Node.js access from renderer
- **Direct API Calls**: The desktop app makes direct HTTPS calls to LLM APIs, no intermediate proxy
- **CORS**: Not applicable in desktop mode (no browser CORS restrictions)
- **HTML Rendering**: `markdown-it` is configured with `html: false` to prevent XSS in chat content
- **User Control**: Users have full control over API endpoint and credentials

## Deployment Notes

### Desktop Application (Primary Distribution)

Build installers for your target platforms:

```bash
cd frontend
npm run electron:build
```

Installers will be created in `frontend/release/`:
- macOS: `.dmg` and `.zip` files
- Windows: `.exe` NSIS installer and `.zip`
- Linux: `.AppImage` and `.deb` packages

Distribute these installers to end users. No server infrastructure required.

### Web Application (Alternative)

For web deployment:

1. Build the frontend: `cd frontend && npm run build` (outputs to `frontend/dist/`)
2. Deploy `frontend/dist/` to static hosting (Vercel, Netlify, S3, etc.)
3. **Important**: Web mode stores config in localStorage, API keys visible in browser
4. Consider implementing backend proxy for enhanced security in web mode
5. Update CORS settings if using backend

**Recommendation**: Desktop mode is preferred for end-user applications as it provides better security, native OS integration, and doesn't require server infrastructure.

## LLM API Compatibility

The application supports any LLM API that follows the OpenAI chat completions format:

**Required API Format**:
- Endpoint: `POST {apiUrl}/chat/completions`
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- Body: `{ model: string, messages: Array<{role, content}>, stream: true }`
- Response: Server-Sent Events with `data: {JSON}` format containing `choices[0].delta.content`

**Compatible APIs**:
- OpenAI (GPT-4, GPT-4o, GPT-3.5, etc.)
- Azure OpenAI
- Anthropic Claude (with proxy/adapter)
- Local models via LM Studio, Ollama, vLLM, etc.
- Any OpenAI-compatible API gateway or proxy

Users configure the API URL, key, and model name in the Settings UI.
