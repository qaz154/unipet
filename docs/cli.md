# CLI

The `unipet` CLI ships in `@unipet/cli` and provides a single command-line entry point.

## Commands

```text
unipet                          # Start MCP server (stdio transport)
unipet mcp                      # Same as above, explicit
unipet status [--json]          # Print desktop-app status
unipet doctor [--json]          # Diagnose CLI and desktop connectivity
unipet react <state>            # Set the pet's visual reaction
unipet say <message...>         # Show a speech bubble
unipet install [--agent <name>] [--uninstall]
                                # Install or uninstall hooks
unipet theme list [--json]      # List installed themes
unipet theme validate <path> [--json]
                                # Validate a theme directory or theme.json file
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Success |
| 1    | User error (missing argument / unknown command) |
| 2    | Invalid argument value |
| 3    | Desktop app unreachable / network error |

## Environment

- `UNIPET_IPC_PATH` — explicit path to `ipc.json` (overrides discovery)
- `UNIPET_ROOT` — override the repo root used to resolve hooks/themes (mainly for tests and local development)

## Doctor Output

`unipet doctor --json` returns a stable structure:

```json
{
  "ok": false,
  "checks": [
    { "id": "cli",          "status": "pass", "message": "CLI unipet 0.1.6" },
    { "id": "discovery",    "status": "pass", "message": "Discovery file found at …" },
    { "id": "desktop-http", "status": "fail", "message": "Desktop HTTP unreachable" }
  ]
}
```
