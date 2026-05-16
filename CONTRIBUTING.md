# Contributing to UniPet

## Quick Start

```bash
git clone https://github.com/qaz154/unipet.git
cd unipet
pnpm install
pnpm build
pnpm test
pnpm --filter @unipet/desktop dev
```

Requirements: Node.js >= 22, pnpm >= 10

## Project Structure

```
packages/core          State machine, event bus, emotion engine
packages/adapters      Agent integrations (Claude Code, Codex, etc.)
packages/renderers     CSS pixel art, SVG, spritesheet renderers
packages/themes        Theme schema, loader, validation, sanitizer
packages/mcp-server    MCP server (stdio transport)
packages/cli           CLI tool
apps/desktop           Electron desktop app (Vue 3 + TypeScript)
hooks/                 Agent hook scripts
themes/                Built-in themes
```

## Development Workflow

1. Create a branch: `git checkout -b feat/my-feature`
2. Make changes
3. Run tests: `pnpm test`
4. Run typecheck: `pnpm typecheck`
5. Commit with conventional format: `feat:`, `fix:`, `docs:`, etc.
6. Push and open a PR

## Adding a New Agent

1. Add adapter definition in `packages/adapters/src/agents.ts`
2. Create hook script in `hooks/`
3. Add install logic in `hooks/install-hooks.js`
4. Add tests in `packages/adapters/src/`
5. Update README supported agents table

## Adding a New Theme

```bash
node scripts/create-theme.mjs my-theme
# Edit themes/my-theme/theme.json
node scripts/validate-theme.mjs themes/my-theme
```

## Code Style

- TypeScript strict mode
- Immutable patterns preferred
- Functions < 50 lines, files < 800 lines
- No `console.log` in production code
- All tests must pass before PR
