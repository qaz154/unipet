# UniPet 🐾

**Universal Desktop Pet Framework** — a pixel pet that reacts to your AI coding agents in real-time.

Works with **Claude Code, Codex, Cursor, Gemini CLI, Copilot, Kiro, Kimi** and any MCP-capable agent.

<!-- TODO: Replace with actual screenshot/GIF after packaging -->
```
  ╭──────────╮
  │  ◕    ◕  │   "Tests passing! 149/149 ✓"
  │   ╰──╯   │
  ╰──────────╯
```

## Requirements

- **Node.js** >= 22
- **pnpm** >= 10

## Install

### Pre-built Release

Download from [Releases](https://github.com/qaz154/unipet/releases):
- **Windows**: `UniPet-Setup.exe` (x64)
- **macOS**: `UniPet.dmg`
- **Linux**: `UniPet.AppImage`

### From Source

```bash
git clone https://github.com/qaz154/unipet.git
cd unipet && pnpm install && pnpm build
pnpm --filter @unipet/desktop dev
```

## Connect Your Agent (One Command)

```bash
# Auto-detect installed agents and register hooks
node hooks/install-hooks.js

# Or install for a specific agent
node hooks/install-hooks.js --agent claude-code
node hooks/install-hooks.js --agent codex
node hooks/install-hooks.js --agent cursor
```

Supported agents: Claude Code, Codex CLI, Cursor, Gemini CLI, Copilot CLI, CodeBuddy, Kiro CLI, Kimi CLI, OpenCode, OpenClaw, Hermes.

## Features

| Feature | Description |
|---------|-------------|
| **24 Visual States** | idle, thinking, working, editing, testing, juggling, error, happy, love, sleeping... |
| **Multi-Agent Tracking** | Priority-based state resolution across multiple simultaneous agent sessions |
| **Permission Bubbles** | Allow/Deny/Once buttons — hook blocks until you decide |
| **Desktop Notifications** | System-level notification via `POST /api/notify` |
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
| **Auto Update** | GitHub Releases integration |
| **i18n** | English, Chinese, Japanese, Korean |
| **Privacy** | `setContentProtection` hides pet from screen capture |

## HTTP API

```bash
# Any agent can talk to the pet via HTTP:
curl -X POST http://localhost:23333/api/state   -d '{"state":"working"}'
curl -X POST http://localhost:23333/api/speech  -d '{"message":"Hello!"}'
curl -X POST http://localhost:23333/api/notify  -d '{"title":"Done","message":"Build passed"}'
curl -X POST http://localhost:23333/api/emotion -d '{"valence":0.8,"arousal":0.5,"dominance":0.6}'

# Permission request (blocks hook until user responds):
curl -X POST http://localhost:23333/api/permission \
  -d '{"permissionId":"p1","toolName":"Bash","message":"Allow rm?"}'

# Long-poll for permission result:
curl http://localhost:23333/api/permission-result?id=p1

# SSE event stream:
curl http://localhost:23333/api/events
```

Remote agents use `Authorization: Bearer <token>` from `~/.unipet/auth-token`.

## MCP Integration

```bash
npx @unipet/mcp
```

Tools: `unipet_status`, `unipet_react`, `unipet_say`, `unipet_move`

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
pnpm install          # Install dependencies
pnpm build            # Build all 7 packages
pnpm test             # Run 149 tests
pnpm typecheck        # Type check
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

## Contributing

PRs welcome. Add tests, follow existing patterns, `pnpm test` must pass.

## License

MIT
