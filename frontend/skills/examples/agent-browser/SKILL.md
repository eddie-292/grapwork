---
name: agent-browser
version: 1.0.1
description: Browser automation for AI agents. Triggers on requests to open websites, fill forms, click buttons, take screenshots, scrape data, test web apps, login to sites, or automate browser tasks.
description_zh: 浏览器自动化工具。当用户需要打开网站、填写表单、点击按钮、截图、抓取数据、测试 Web 应用、登录网站或执行浏览器自动化任务时使用。
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## First-Time Setup (Important!)

Before using `agent-browser` for the first time, you MUST install the CLI tool and browser binary:

```bash
# Step 1: Install the agent-browser CLI globally
npm install -g agent-browser

# Step 2: Install the Chromium browser binary
agent-browser install
```

You only need to do this once.

## Session Requirement (Critical!)

**Always specify a session name** when using `agent-browser`. Without it, you may encounter the error:
> "Browser not launched. Call launch first."

There are two ways to specify a session:

1. **Environment variable** (recommended for chained commands):
```bash
export AGENT_BROWSER_SESSION=mysession
agent-browser --headed open https://example.com
agent-browser snapshot -i
agent-browser click @e1
```

2. **Command-line flag**:
```bash
agent-browser --session mysession --headed open https://example.com
agent-browser --session mysession snapshot -i
agent-browser --session mysession click @e1
```

The session name can be any string (e.g., `taobao`, `google`, `test1`). Using consistent session names allows you to maintain browser state across multiple commands.

## Browser Mode

**Mode Selection Rules**:

1. **Virtual Machine / Remote Server**: Use `--headless` mode (no display available)
2. **Local Machine (Default)**: Use `--headed` mode (visible browser window for better debugging)
3. **User Request**: Follow user's explicit preference (headless/无头模式 or headed/有头模式)

**How to detect environment**:
- Check `<env>` section in system context for platform info
- VM indicators: Linux without display, SSH session, Docker container, cloud server
- If uncertain, try `--headed` first; if it fails with display error, fallback to `--headless`

**Options**:
- `--headed`: Visible browser window (default for local machines)
- `--headless`: Invisible browser (default for VMs/servers, or when user requests)

## Core Workflow

Every browser automation follows this pattern:

1. **Setup session**: `export AGENT_BROWSER_SESSION=mysite`
2. **Navigate**: `agent-browser --headed open <url>`
3. **Snapshot**: `agent-browser snapshot -i` (get element refs like `@e1`, `@e2`)
4. **Interact**: Use refs to click, fill, select
5. **Re-snapshot**: After navigation or DOM changes, get fresh refs

```bash
# Set session first (or use --session flag on each command)
export AGENT_BROWSER_SESSION=mysite

agent-browser --headed open https://example.com/form
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Submit"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Essential Commands

**Note:** All commands below assume you have set `AGENT_BROWSER_SESSION` or use `--session <name>`.

```bash
# First-time setup (run once)
agent-browser install                 # Install Chromium browser

# Navigation (ALWAYS use --headed by default)
agent-browser --headed open <url>     # Navigate with visible browser (DEFAULT)
agent-browser --headless open <url>   # Navigate headless (only if user explicitly requests)
agent-browser close                   # Close browser

# Snapshot
agent-browser snapshot -i             # Interactive elements with refs (recommended)
agent-browser snapshot -s "#selector" # Scope to CSS selector

# Interaction (use @refs from snapshot)
agent-browser click @e1               # Click element
agent-browser fill @e2 "text"         # Clear and type text
agent-browser type @e2 "text"         # Type without clearing
agent-browser select @e1 "option"     # Select dropdown option
agent-browser check @e1               # Check checkbox
agent-browser press Enter             # Press key
agent-browser scroll down 500         # Scroll page

# Get information
agent-browser get text @e1            # Get element text
agent-browser get url                 # Get current URL
agent-browser get title               # Get page title

# Wait
agent-browser wait @e1                # Wait for element
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --url "**/page"    # Wait for URL pattern
agent-browser wait 2000               # Wait milliseconds

# Capture
agent-browser screenshot              # Screenshot to temp dir
agent-browser screenshot --full       # Full page screenshot
agent-browser pdf output.pdf          # Save as PDF
```

## Common Patterns

### Form Submission

```bash
export AGENT_BROWSER_SESSION=signup
agent-browser --headed open https://example.com/signup
agent-browser snapshot -i
agent-browser fill @e1 "Jane Doe"
agent-browser fill @e2 "jane@example.com"
agent-browser select @e3 "California"
agent-browser check @e4
agent-browser click @e5
agent-browser wait --load networkidle
```

### Authentication with State Persistence

```bash
# Login once and save state
export AGENT_BROWSER_SESSION=auth
agent-browser --headed open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "$USERNAME"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Reuse in future sessions
agent-browser state load auth.json
agent-browser --headed open https://app.example.com/dashboard
```

### Data Extraction

```bash
export AGENT_BROWSER_SESSION=scrape
agent-browser --headed open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e5           # Get specific element text
agent-browser get text body > page.txt  # Get all page text

# JSON output for parsing
agent-browser snapshot -i --json
agent-browser get text @e1 --json
```

### Parallel Sessions

```bash
agent-browser --headed --session site1 open https://site-a.com
agent-browser --headed --session site2 open https://site-b.com

agent-browser --session site1 snapshot -i
agent-browser --session site2 snapshot -i

agent-browser session list
```

### Headless Mode (Only When Requested)

```bash
# Only use headless when user explicitly requests it
agent-browser --headless open https://example.com
```

### Debugging Tools

```bash
agent-browser --headed open https://example.com
agent-browser highlight @e1          # Highlight element
agent-browser record start demo.webm # Record session
```

### iOS Simulator (Mobile Safari)

```bash
# List available iOS simulators
agent-browser device list

# Launch Safari on a specific device
agent-browser -p ios --device "iPhone 16 Pro" open https://example.com

# Same workflow as desktop - snapshot, interact, re-snapshot
agent-browser -p ios snapshot -i
agent-browser -p ios tap @e1          # Tap (alias for click)
agent-browser -p ios fill @e2 "text"
agent-browser -p ios swipe up         # Mobile-specific gesture

# Take screenshot
agent-browser -p ios screenshot mobile.png

# Close session (shuts down simulator)
agent-browser -p ios close
```

**Requirements:** macOS with Xcode, Appium (`npm install -g appium && appium driver install xcuitest`)

**Real devices:** Works with physical iOS devices if pre-configured. Use `--device "<UDID>"` where UDID is from `xcrun xctrace list devices`.

## Ref Lifecycle (Important)

Refs (`@e1`, `@e2`, etc.) are invalidated when the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (dropdowns, modals)

```bash
agent-browser click @e5              # Navigates to new page
agent-browser snapshot -i            # MUST re-snapshot
agent-browser click @e1              # Use new refs
```

## Semantic Locators (Alternative to Refs)

When refs are unavailable or unreliable, use semantic locators:

```bash
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find role button click --name "Submit"
agent-browser find placeholder "Search" type "query"
agent-browser find testid "submit-btn" click
```

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/commands.md](references/commands.md) | Full command reference with all options |
| [references/snapshot-refs.md](references/snapshot-refs.md) | Ref lifecycle, invalidation rules, troubleshooting |
| [references/session-management.md](references/session-management.md) | Parallel sessions, state persistence, concurrent scraping |
| [references/authentication.md](references/authentication.md) | Login flows, OAuth, 2FA handling, state reuse |
| [references/video-recording.md](references/video-recording.md) | Recording workflows for debugging and documentation |
| [references/proxy-support.md](references/proxy-support.md) | Proxy configuration, geo-testing, rotating proxies |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/form-automation.sh](templates/form-automation.sh) | Form filling with validation |
| [templates/authenticated-session.sh](templates/authenticated-session.sh) | Login once, reuse state |
| [templates/capture-workflow.sh](templates/capture-workflow.sh) | Content extraction with screenshots |

```bash
./templates/form-automation.sh https://example.com/form
./templates/authenticated-session.sh https://app.example.com/login
./templates/capture-workflow.sh https://example.com ./output
```

## Troubleshooting

### "Browser not launched. Call launch first."

This error can occur due to two reasons:

**Reason 1: No session specified**

Fix by setting the session environment variable or using the `--session` flag:
```bash
export AGENT_BROWSER_SESSION=mysession
agent-browser --headed open https://example.com
```

Or:
```bash
agent-browser --session mysession --headed open https://example.com
```

**Reason 2: Stale/zombie sessions (more common)**

If you've specified a session but still get this error, there may be stale sessions from previous runs where the browser process has terminated but the session record remains. This is the most common cause.

First, check for existing sessions:
```bash
agent-browser session list
```

If you see sessions listed, close them before starting a new one:
```bash
# Close all stale sessions first, then open
agent-browser close 2>/dev/null
agent-browser --session mysession close 2>/dev/null
sleep 1
agent-browser --session mysession --headed open https://example.com
```

**Recommended pattern for reliable startup:**
```bash
# Always close potential stale sessions before opening
agent-browser --session mysite close 2>/dev/null; sleep 1; agent-browser --session mysite --headed open https://example.com
```

### Browser binary not found

Run the install command first:
```bash
agent-browser install
```

### Other Issues

If `agent-browser` encounters issues (installation problems, display errors, compatibility issues), suggest the user to:

**Alternative: Enable Browser MCP Server**

The built-in Browser MCP server provides similar browser automation capabilities through MCP tools. Guide the user to:

1. Open **Settings** > **MCP Servers**
2. Find and enable the **Browser** MCP server
3. Use the MCP browser tools (`mcp__browser-use__*`) instead of `agent-browser` CLI

This is especially useful when:
- `agent-browser` CLI is not installed or has dependency issues
- Running in environments where CLI tools are restricted
- User prefers MCP-based browser automation
