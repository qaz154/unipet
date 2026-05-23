# Adapters

Adapters bridge the pet to external AI agents and signals. Every adapter implements the `AgentAdapter` interface from `@unipet/adapters`.

| Adapter         | Trigger |
|-----------------|---------|
| `claude-code`   | Hooks fired by Claude Code |
| `codex`         | Hooks fired by Codex CLI |
| `cursor`        | Hooks fired by Cursor |
| `gemini`        | Hooks fired by Gemini CLI |
| `copilot`       | Hooks fired by Copilot CLI |
| `codebuddy`     | Hooks fired by CodeBuddy |
| `kiro` / `kimi` | Hooks fired by Kiro / Kimi CLI |
| `mcp`           | Any MCP-capable agent via `@unipet/mcp` |
| `http`          | Direct HTTP/SSE clients |
| `git`           | Periodic git state polling |
| `perception`    | Screenshot → multimodal LLM → pet state |

## Perception

`PerceptionAdapter` listens on `127.0.0.1:<port>` (default `23335`) for `POST /api/perception/screenshot` with a `{ "image": "<base64>" }` body. It then forwards the image to a multimodal LLM and maps the inferred activity to a pet state.

Configure it through the adapter overrides:

```json
{
  "perception": {
    "enabled": true,
    "overrides": {
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "apiKey":   "sk-…",
      "model":    "gpt-4o",
      "captureIntervalSec": 30,
      "listenPort": 23335
    }
  }
}
```

Activity mapping is implemented by the pure function `mapActivityToState` (exported from `@unipet/adapters`); unknown activities fall back to `idle`.
