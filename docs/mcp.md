# MCP Tools

Any MCP-capable agent can drive the pet via `@unipet/mcp`. Register the server in your agent's MCP configuration:

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

## Tools

| Tool             | Description |
|------------------|-------------|
| `unipet_status`  | Returns whether the desktop app is running and on which port |
| `unipet_react`   | Set the pet's visual reaction (`idle`, `working`, …) |
| `unipet_say`     | Show a speech bubble with the given message |
| `unipet_move`    | Move the pet to one of the predefined positions |

Each tool is a thin wrapper around the same HTTP API documented in [http-api.md](./http-api.md). Tools that require the desktop app return a graceful error when it is not running.
