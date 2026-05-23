# HTTP API

The desktop app exposes a local-only HTTP server on `127.0.0.1`. The port is auto-discovered through the IPC file (default fallback: `23333`).

Remote agents authenticate with `Authorization: Bearer <token>` where the token is read from `~/.unipet/auth-token`.

## Endpoints

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

# Server-sent events stream
curl http://localhost:23333/api/events

# Health
curl http://localhost:23333/api/status
```

## Status Response

```json
{
  "running": true,
  "port": 23333,
  "pid": 4321,
  "sseClients": 2
}
```
