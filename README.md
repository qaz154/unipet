# UniPet

English · [简体中文](README.zh-CN.md)

**A desktop pet that watches your AI coding agents — so you don't have to.**

[![CI](https://github.com/qaz154/unipet/actions/workflows/ci.yml/badge.svg)](https://github.com/qaz154/unipet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)

UniPet sits on your desktop and reacts in real-time to what your AI agents are doing — thinking, coding, testing, waiting for approval, celebrating success, or panicking on errors.

Works with **Claude Code, Codex, Cursor, Gemini CLI, Copilot, Kiro, Kimi** and any MCP-capable agent.

```
  ╭──────────╮
  │  ◕    ◕  │   "Tests passing! 159/159 ✓"
  │   ╰──╯   │
  ╰──────────╯
```

## Download

Get the latest build from [**Releases**](https://github.com/qaz154/unipet/releases/latest):

| Platform | File |
|----------|------|
| **Windows** | `UniPet.Setup.0.1.9.exe` |
| **macOS** | `UniPet-0.1.9-arm64.dmg` |
| **Linux** | `UniPet-0.1.9.AppImage` |

> macOS may show a security warning on first launch. Right-click → Open, or run:
> ```
> xattr -dr com.apple.quarantine /Applications/UniPet.app
> ```
>
> Windows is the primary verified desktop target today. macOS DMG and Linux AppImage builds are published, but transparent-window behavior still needs broader real-device validation.

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
| **OpenCode** | Plugin (auto-install) |
| **OpenClaw** | Plugin (auto-install) |
| **Hermes** | Plugin (auto-install) |
| **Any MCP agent** | MCP Server |

## Feature Status

| Status | Feature | Description |
|--------|---------|-------------|
| Stable | **24 Visual States** | idle, thinking, working, editing, testing, error, happy, love, sleeping... |
| Stable | **Multi-Agent Tracking** | Priority-based state resolution across simultaneous sessions |
| Stable | **Permission Bubbles** | Allow/Deny/Once buttons — hook blocks until you decide |
| Stable | **Speech Bubbles** | Agent messages with secret/URL/path sanitization |
| Stable | **Emotion Engine** | PAD 3D emotion vector with natural time decay |
| Stable | **Eye Tracking** | Pet eyes follow your cursor |
| Stable | **Throw Physics** | Drag and flick the pet — rotation + bounce |
| Stable | **Global Hotkeys** | `Ctrl+Shift+Y` = Allow, `Ctrl+Shift+N` = Deny |
| Stable | **Mini Mode** | Drag to edge → pet hides with peek-on-hover |
| Stable | **Sleep Sequence** | Yawning → dozing → sleeping after idle timeout |
| Stable | **Renderers** | CSS pixel art, SVG, spritesheet |
| Stable | **Theme System** | JSON schema + variants + import/export |
| Stable | **Sound Effects** | Chiptune-style feedback for state changes |
| Stable | **MCP Server** | `npx @unipet/mcp` — 4 tools for any MCP agent |
| Stable | **i18n** | English, 简体中文, 繁體中文, 日本語, 한국어 |
| Stable | **Privacy** | `setContentProtection` hides pet from screen capture |
| Stable | **Sessions Dashboard** | View active agent sessions, events, jump to terminal |
| Stable | **DND Mode** | Do Not Disturb — auto-mute, suppress permission bubbles |
| Stable | **Auto Hooks** | Hooks auto-register on app startup (best-effort) |
| Stable | **CLI** | `unipet install/doctor/theme/react/say` command surface |
| Stable | **Theme Tools** | `create-theme.mjs` scaffold + `unipet theme validate` checker |
| Experimental | **Theme Marketplace** | Local and remote marketplace sources; remote behavior is still evolving |
| Experimental | **Live2D SDK Seam** | Bring your own SDK adapter, otherwise uses the built-in canvas fallback |
| Experimental | **AI Perception** | Adapter API for screenshot → multimodal LLM → pet state; requires external capture/configuration |
| Experimental | **Pet Evolution** | Git behavior analysis mapped to theme variants |
| Experimental | **Emotion Soundtrack** | Web Audio ambient music driven by PAD emotion vector |
| Experimental | **Voice Companion** | Speech recognition + synthesis command surface |
| Experimental | **Desktop Mirror** | System monitoring → pet emotions |
| Experimental | **Pet Mesh** | WebSocket cross-device pet network with relay support |
| Roadmap | **Plugin System** | Public plugin loading, trust model, and management UI |
| Stable | **Docs** | Full documentation in [docs/](docs/) |

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
pnpm start              # One-command: install + build + dev
# Or step by step:
pnpm install
pnpm build
pnpm test              # 162+ tests
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
