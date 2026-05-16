# UniPet

English · [简体中文](README.zh-CN.md)

**A desktop pet that watches your AI coding agents — so you don't have to.**

[![CI](https://github.com/qaz154/unipet/actions/workflows/ci.yml/badge.svg)](https://github.com/qaz154/unipet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)

UniPet sits on your desktop and reacts in real-time to what your AI agents are doing — thinking, coding, testing, waiting for approval, celebrating success, or panicking on errors.

Works with **Claude Code, Codex, Cursor, Gemini CLI, Copilot, Kiro, Kimi** and any MCP-capable agent.

```
  ╭──────────╮
  │  ◕    ◕  │   "Tests passing! 149/149 ✓"
  │   ╰──╯   │
  ╰──────────╯
```

## Download

Get the latest build from [**Releases**](https://github.com/qaz154/unipet/releases/latest):

| Platform | File |
|----------|------|
| **Windows** | `UniPet.Setup.0.1.0.exe` |
| **macOS** | `UniPet-0.1.0-arm64.dmg` |
| **Linux** | `UniPet-0.1.0.AppImage` |

> macOS may show a security warning on first launch. Right-click → Open, or run:
> ```
> xattr -dr com.apple.quarantine /Applications/UniPet.app
> ```

## Quick Start

### 1. Install & Launch

Download from [Releases](https://github.com/qaz154/unipet/releases/latest) and open the app. You'll see a pixel pet on your desktop and a tray icon.

### 2. Connect Your Agent

```bash
# Auto-detect installed agents and register hooks
node hooks/install-hooks.js

# Or install for a specific agent
node hooks/install-hooks.js --agent claude-code
node hooks/install-hooks.js --agent codex
node hooks/install-hooks.js --agent cursor
```

### 3. Start Coding

The pet automatically reacts when your agent starts working. No configuration needed.

## Supported Agents

| Agent | Integration Method |
|-------|-------------------|
| **Claude Code** | Hooks (auto) |
| **Codex CLI** | Hooks (auto) |
| **Cursor** | Hooks (auto) |
| **Gemini CLI** | Hooks (auto) |
| **Copilot CLI** | Hooks (auto) |
| **Kiro CLI** | Hooks (auto) |
| **Kimi CLI** | Hooks (auto) |
| **OpenCode** | Plugin |
| **OpenClaw** | Plugin |
| **Hermes** | Plugin |
| **Any MCP agent** | MCP Server |

## Features

| Feature | Description |
|---------|-------------|
| **24 Visual States** | idle, thinking, working, editing, testing, error, happy, love, sleeping... |
| **Multi-Agent Tracking** | Priority-based state resolution across simultaneous sessions |
| **Permission Bubbles** | Allow/Deny/Once buttons — hook blocks until you decide |
| **Speech Bubbles** | Agent messages with secret/URL/path sanitization |
| **Emotion Engine** | PAD 3D emotion vector with natural time decay |
| **Eye Tracking** | Pet eyes follow your cursor |
| **Throw Physics** | Drag and flick the pet — rotation + bounce |
| **Global Hotkeys** | `Ctrl+Shift+Y` = Allow, `Ctrl+Shift+N` = Deny |
| **Mini Mode** | Drag to edge → pet hides with peek-on-hover |
| **Sleep Sequence** | Yawning → dozing → sleeping after idle timeout |
| **3 Renderers** | CSS pixel art, SVG, spritesheet |
| **Theme System** | JSON schema + variants + import/export |
| **Sound Effects** | Chiptune-style feedback for state changes |
| **MCP Server** | `npx @unipet/mcp` — 4 tools for any MCP agent |
| **i18n** | English, 简体中文, 繁體中文, 日本語, 한국어 |
| **Privacy** | `setContentProtection` hides pet from screen capture |

## MCP Integration

Any MCP-capable agent can control the pet:

```json
{
  "mcpServers": {
    "unipet": {
      "command": "npx",
      "args": ["-y", "@unipet/mcp"]
    }
  }
}
```

Available tools: `unipet_status`, `unipet_react`, `unipet_say`, `unipet_move`

## HTTP API

Any agent can talk to the pet via HTTP:

```bash
# Set state
curl -X POST http://localhost:23333/api/state -d '{"state":"working"}'

# Show speech bubble
curl -X POST http://localhost:23333/api/speech -d '{"message":"Hello!"}'

# Desktop notification
curl -X POST http://localhost:23333/api/notify -d '{"title":"Done","message":"Build passed"}'

# Permission request (blocks until user responds)
curl -X POST http://localhost:23333/api/permission \
  -d '{"permissionId":"p1","toolName":"Bash","message":"Allow rm?"}'

# SSE event stream
curl http://localhost:23333/api/events
```

Remote agents use `Authorization: Bearer <token>` from `~/.unipet/auth-token`.

## Architecture

```
┌──────────────────────────────────────────────┐
│             Electron Desktop App              │
│                                              │
│  Renderer ←─ StateManager ←─ AgentAdapters   │
│  (Canvas)    (24-state        (Hook/MCP/     │
│               priority)        HTTP/Git)     │
│     ↑            ↑                ↑          │
│  Emotion    BubbleManager    HTTP Server     │
│  Engine     (sanitized)      (:23333)        │
│                                              │
│  Platform: Electron + Vue 3 + TypeScript     │
└──────────────────────────────────────────────┘
```

Monorepo: `@unipet/core` · `@unipet/adapters` · `@unipet/renderers` · `@unipet/themes` · `@unipet/mcp-server` · `@unipet/cli` · `@unipet/desktop`

## Development

```bash
# Requirements: Node.js >= 22, pnpm >= 10
git clone https://github.com/qaz154/unipet.git
cd unipet
pnpm install
pnpm build
pnpm test              # 149 tests
pnpm --filter @unipet/desktop dev  # Dev mode with hot reload
```

## Create a Theme

```json
{
  "schemaVersion": 1,
  "id": "my-pet",
  "renderer": "css-pixel",
  "rendererConfig": {
    "gridSize": 16, "upscale": 8,
    "palette": { ".": "transparent", "#": "#000", "W": "#fff" },
    "body": ["..####..", ".#WWWW#.", "#WWWWWW#", ".#WWWW#.", "..####.."],
    "faces": { "idle": { "eyes": ["W.W"], "eyePos": { "row": 2, "col": 2 } } }
  },
  "states": { "idle": { "files": ["idle"] }, "working": { "files": ["working"] } }
}
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full theme schema reference.

## Contributing

PRs welcome. Add tests, follow existing patterns, `pnpm test` must pass.

## License

[MIT](LICENSE)
