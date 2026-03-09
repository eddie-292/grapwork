---
name: install-skill-dependency
version: 1.0.0
description: Diagnose and fix missing dependencies, binaries, or runtime environments required by installed skills. Use when a skill fails due to missing resources, unresolved binaries, unavailable runtime dependencies, or when the user wants to proactively install all skill dependencies.
description_zh: 诊断并修复已安装技能所需的缺失依赖、二进制文件或运行时环境。当技能因缺少资源、二进制文件未找到、运行时依赖不可用而失败时，或当用户希望主动安装所有技能依赖项时使用。
---

# Install Skill Dependencies

Scan installed skills, detect missing dependencies, and install them with user authorization.

## Workflow

Follow these steps in order:

### Step 1: Detect Environment

1. **Detect OS type**: Determine macOS, Linux, or Windows.
2. **Detect if running in a VM/sandbox**: Check indicators such as:
   - Existence of `/root/.qoderwork` (common in containers/VMs)
   - Environment variables like `CODESPACES`, `GITPOD_WORKSPACE_ID`, `REMOTE_CONTAINERS`
   - Running as root user in a Linux environment
3. **Survey existing toolchains**: Check installation status and versions of common tools:
   - Package managers: `brew`, `apt`, `yum`, `dnf`, `pacman`, `choco`, `winget`
   - Runtimes: `node`, `python`, `python3`, `ruby`, `java`, `go`, `rust`/`cargo`
   - Language package managers: `npm`, `yarn`, `pnpm`, `pip`, `pip3`, `gem`, `mvn`, `gradle`
   - Other common tools: `git`, `curl`, `wget`, `jq`, `ffmpeg`, `imagemagick`, `pandoc`, `poppler`

Use the `CheckRuntime` tool for runtime detection when available. For other tools, use `which` or `command -v` via Bash.

Present a summary table of the detected environment to the user.

### Step 2: Scan Skill Dependencies

1. **Locate skills directory**: Check these paths in order:
   - macOS / Linux: `~/.qoderwork/skills/`
   - Linux VM / Container: `/root/.qoderwork/skills/`
   - Windows: `%USERPROFILE%\.qoderwork\skills\`
2. **Parse each skill**: For every subdirectory containing a `SKILL.md`:
   - Read the `SKILL.md` content
   - Extract dependency information from:
     - Explicit dependency declarations (e.g., `requires:` in frontmatter)
     - Code blocks referencing `pip install`, `npm install`, `brew install`, `apt install`, etc.
     - Import statements or tool invocations (e.g., `import pdfplumber`, `ffmpeg`, `pandoc`)
     - Script files referenced in the skill (e.g., `scripts/*.py`, `scripts/*.sh`)
     - `requirements.txt`, `package.json`, or similar manifests if present in the skill directory
3. **Compare with environment**: Cross-reference extracted dependencies against Step 1 results.
4. **Report findings**: Present a table listing:
   - Skill name
   - Required dependency
   - Current status (installed / missing / version mismatch)
   - Recommended install command

If all dependencies are satisfied, inform the user and stop.

### Step 3: Plan Installation

Based on OS type, choose the appropriate strategy:

**macOS / Linux:**
- You can handle most installations autonomously.
- **VM/sandbox environment**: You may proceed more freely, but still ask before installing.
- **Host environment**: Be cautious. Explain each step's purpose and impact clearly before asking for permission.
- Prefer system package managers (`brew` on macOS, `apt`/`yum`/`dnf` on Linux) for system-level tools.
- Use language-specific package managers (`pip`, `npm`) for library dependencies.
- Consider using virtual environments (`venv`, `nvm`) when appropriate to avoid polluting the system.

**Windows:**
- Due to environment variability, use `AskUserQuestion` to inform the user what needs to be installed and recommend an installation method. Let the user confirm or manually execute.

### Step 4: Optimize Download Sources

Based on the user's locale (infer from system language, timezone, or ask), configure appropriate mirrors:

| Tool | China Mirror | Command |
|------|-------------|---------|
| npm | Taobao registry | `npm config set registry https://registry.npmmirror.com` |
| pip | Tsinghua mirror | `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple` |
| Homebrew | USTC mirror | Set `HOMEBREW_BREW_GIT_REMOTE` and `HOMEBREW_CORE_GIT_REMOTE` |

Only apply mirror configuration if the user is in a region where it would help. Ask the user before changing global configurations.

### Step 5: Execute Installation

**Critical rule**: Before executing ANY install, upgrade, or removal operation, you MUST use `AskUserQuestion` to get explicit user authorization.

Present to the user:
- What will be installed
- The exact command(s) to run
- Any side effects or system changes

After receiving authorization:
1. Execute installations one dependency at a time
2. Verify each installation succeeded before moving to the next
3. Report success or failure for each dependency

### Step 6: Verify and Report

After all installations complete:
1. Re-run the dependency scan from Step 2
2. Confirm all dependencies are now satisfied
3. Present a final summary showing what was installed and the current status

## Handling Uncertainty

If at any point you are unsure about:
- Whether a dependency is truly required
- The correct package name for the current OS
- Whether an installation might conflict with existing software

Use `AskUserQuestion` to ask the user for guidance. It is always better to ask than to make incorrect assumptions.

## Example Interaction Flow

```
1. Environment Detection:
   OS: macOS 14.0 (Host machine)
   Homebrew: installed (4.2.0)
   Node.js: installed (v20.11.0)
   Python: installed (3.12.1)
   pip: installed (24.0)
   ffmpeg: NOT installed
   pandoc: NOT installed

2. Skill Dependency Scan:
   ┌─────────────┬──────────────┬─────────┬─────────────────────┐
   │ Skill       │ Dependency   │ Status  │ Install Command     │
   ├─────────────┼──────────────┼─────────┼─────────────────────┤
   │ pdf         │ pdfplumber   │ Missing │ pip install pdfplum… │
   │ pdf         │ poppler      │ Missing │ brew install poppler │
   │ docx        │ python-docx  │ OK      │ -                   │
   │ pptx        │ python-pptx  │ Missing │ pip install python-… │
   │ xlsx        │ openpyxl     │ OK      │ -                   │
   └─────────────┴──────────────┴─────────┴─────────────────────┘

3. [AskUserQuestion] Request authorization to install missing dependencies
4. Execute approved installations
5. Verify all dependencies satisfied
```
