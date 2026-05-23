# Live2D SDK Integration Guide

UniPet's `Live2DRenderer` ships with a Canvas 2D fallback and an **SDK seam**
(`Live2DSdkAdapter`) that lets you plug in the real Live2D Cubism SDK without
modifying the renderer or theme schema.

## How it works

```
theme.json (renderer: "live2d")
        │
        ▼
Live2DRenderer.init(container, config, live2dConfig, sdkAdapter?)
        │
        ├─ sdkAdapter provided AND preferSdk: true
        │        │
        │        ▼
        │   sdkAdapter.init()  ──success──▶  SDK drives rendering
        │        │
        │        └──error──▶  fall through to Canvas fallback
        │
        └─ no sdkAdapter OR preferSdk: false
                 │
                 ▼
           Canvas 2D fallback (built-in, no dependencies)
```

## Example: pixi-live2d-display

Install the SDK in your desktop app:

```bash
pnpm --filter @unipet/desktop add pixi.js @pixi/live2d
# or
npm install pixi.js @pixi/live2d
```

Implement the adapter:

```ts
// apps/desktop/src/lib/live2d-sdk-adapter.ts
import type { Live2DSdkAdapter, Live2DConfig } from '@unipet/renderers';
import type { RendererConfig } from '@unipet/renderers';
import type { PetState } from '@unipet/core';
import { Application } from 'pixi.js';
import { Live2DModel } from '@pixi/live2d';

export function createPixiLive2DAdapter(): Live2DSdkAdapter {
  let app: Application | null = null;
  let model: InstanceType<typeof Live2DModel> | null = null;

  // Map UniPet states to Cubism motion group names
  const STATE_MOTION: Record<string, string> = {
    idle: 'Idle',
    working: 'TapBody',
    thinking: 'FlickHead',
    error: 'Shake',
    happy: 'TapBody',
    sleeping: 'Idle',
    attention: 'FlickHead',
  };

  return {
    async init(container: HTMLElement, config: RendererConfig, live2dConfig: Live2DConfig) {
      app = new Application();
      await app.init({
        width: 256,
        height: 256,
        backgroundAlpha: 0,
        antialias: true,
      });
      container.appendChild(app.canvas);
      app.canvas.style.transform = `scale(${config.scale})`;
      app.canvas.style.opacity = String(config.opacity);

      model = await Live2DModel.from(live2dConfig.modelConfig);
      app.stage.addChild(model as unknown as Parameters<typeof app.stage.addChild>[0]);
      model.scale.set(0.15);
      model.x = 128;
      model.y = 200;
    },

    async setState(state: PetState) {
      const motionGroup = STATE_MOTION[state] ?? 'Idle';
      model?.motion(motionGroup);
    },

    setOpacity(value: number) {
      if (app?.canvas) app.canvas.style.opacity = String(value);
      if (model) model.alpha = value;
    },

    setScale(value: number) {
      if (app?.canvas) app.canvas.style.transform = `scale(${value})`;
    },

    setVisible(value: boolean) {
      if (app?.canvas) app.canvas.style.display = value ? 'block' : 'none';
    },

    destroy() {
      model?.destroy();
      app?.destroy(true);
      model = null;
      app = null;
    },
  };
}
```

Wire it up in `apps/desktop/src/pages/pet/index.vue`:

```ts
import { createPixiLive2DAdapter } from '../../lib/live2d-sdk-adapter';

// Inside the live2d renderMode branch:
if (renderMode.value === 'live2d' && canvasWrapRef.value && activeTheme) {
  renderers.live2dRenderer = new Live2DRenderer();
  await renderers.live2dRenderer.init(
    canvasWrapRef.value,
    { scale: displayScale.value, opacity: petStore.opacity },
    activeTheme.rendererConfig as unknown as Live2DConfig,
    createPixiLive2DAdapter(),   // ← pass the SDK adapter here
  );
  renderers.live2dRenderer.setState('idle', { duration: 0 });
}
```

Create a theme that uses the live2d renderer:

```json
{
  "schemaVersion": 1,
  "id": "my-live2d-pet",
  "displayName": "My Live2D Pet",
  "renderer": "live2d",
  "rendererConfig": {
    "modelFile": "assets/Hiyori/Hiyori.moc3",
    "modelConfig": "assets/Hiyori/Hiyori.model3.json",
    "preferSdk": true
  },
  "states": {
    "idle":      { "files": ["idle"] },
    "working":   { "files": ["working"] },
    "thinking":  { "files": ["thinking"] },
    "error":     { "files": ["error"] },
    "attention": { "files": ["attention"] },
    "sleeping":  { "files": ["sleeping"] }
  }
}
```

## Fallback behaviour

If `createPixiLive2DAdapter()` throws during `init()` (e.g. model file not
found, WebGL not available), `Live2DRenderer` automatically falls back to the
built-in Canvas pet — the surface always renders.

## Notes

- Live2D Cubism SDK requires accepting the [Live2D Open Software License](https://www.live2d.com/en/sdk/license/).
  It is not bundled with UniPet.
- `@pixi/live2d` is a community-maintained binding; check its repo for
  current API compatibility.
- The motion group names (`Idle`, `TapBody`, etc.) depend on your model file.
  Inspect the `.model3.json` `Motions` section to find the correct names.
