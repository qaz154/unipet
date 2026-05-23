# Getting Started

This guide gets UniPet running on your desktop and connects an AI agent to it.

## Install

Download the latest [release](https://github.com/qaz154/unipet/releases/latest) for your platform:

- **Windows** — `UniPet.Setup.*.exe`
- **macOS** — `UniPet-*-arm64.dmg`
- **Linux** — `UniPet-*.AppImage`

On macOS you may need to clear the quarantine attribute on first launch:

```bash
xattr -dr com.apple.quarantine /Applications/UniPet.app
```

## Connect an Agent

Install hooks for any supported AI agent:

```bash
node hooks/install-hooks.js              # auto-detect
node hooks/install-hooks.js --agent claude-code
```

Or use the CLI wrapper once it is on your PATH:

```bash
unipet install                # auto-detect
unipet install --agent codex  # specific agent
unipet install --uninstall    # remove hooks
```

## Verify

```bash
unipet doctor --json
```

A healthy install reports `ok` for `cli`, `discovery`, and `desktop-http`.

## Next Steps

- [Themes](./themes.md) — switch the pet's look
- [CLI](./cli.md) — every `unipet` command
- [HTTP API](./http-api.md) — drive the pet from any agent
