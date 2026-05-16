# UniPet — Electron e2e tests

Playwright drives a real Electron build of the desktop app. Each spec spins up
a fresh app instance with an isolated `HOME` so the settings/discovery files
don't bleed between tests.

## Run

```bash
# One-time, install Playwright + Electron browsers binaries
pnpm install
pnpm --filter @unipet/desktop exec playwright install

# Build first, then run all e2e specs
pnpm --filter @unipet/desktop run test:e2e

# Re-run without rebuilding (fast iteration)
pnpm --filter @unipet/desktop run test:e2e:fast
```

## Coverage

- **dual-window.spec.ts** — render + hit windows boot, discovery file written,
  pet canvas mounts, both windows are always-on-top with matching size.
- **http-api.spec.ts** — `/api/state` accepts allowed states & rejects
  disallowed ones, `/api/speech` sanitises secrets and URLs, oversized bodies
  return 413, and the renderer receives `pet:event` IPC propagation.

## Adding tests

1. Drop a new `*.spec.ts` under `tests/e2e/`.
2. Use `launchUniPet()` from `helpers.ts` — it returns an `ElectronApplication`
   plus the discovery file path so you can `waitForDiscovery(...)` before
   talking to the HTTP API.
3. **Always** `await app.close()` in a `finally` block — leaked Electron
   processes will keep ports 23333+ busy across runs.
4. Use `classifyWindows(app)` to disambiguate the render window from the hit
   window by URL.

## CI notes

Linux runners need `xvfb-run` to give Electron a virtual display:

```yaml
- run: xvfb-run -a pnpm --filter @unipet/desktop run test:e2e
```

On macOS / Windows runners no extra setup is needed.
