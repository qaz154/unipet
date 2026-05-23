# Renderers

The pet surface is driven by a `RendererPlugin`. Four backends ship with the project.

| Renderer  | Use when |
|-----------|----------|
| `css-pixel`   | Pixel-art pets defined by palette + grid strings |
| `svg`         | SVG files swapped per state, with eye tracking |
| `sprite`      | Spritesheet frame animation |
| `live2d`      | Live2D model via SDK adapter; canvas fallback otherwise |

## Live2D SDK Seam

`Live2DRenderer` ships with a Canvas 2D fallback. To use the real SDK (e.g. `pixi-live2d-display`), implement `Live2DSdkAdapter` and pass it to `init()`:

```ts
import { Live2DRenderer, type Live2DSdkAdapter } from '@unipet/renderers';

const sdkAdapter: Live2DSdkAdapter = {
  async init(container, config, live2dConfig) { /* load model */ },
  async setState(state) { /* trigger motion */ },
  setOpacity(v) { /* … */ },
  setScale(v) { /* … */ },
  setVisible(v) { /* … */ },
  destroy() { /* cleanup */ },
};

const renderer = new Live2DRenderer();
await renderer.init(container, { scale: 1, opacity: 1 }, {
  modelFile: 'avatar.moc3',
  modelConfig: 'avatar.model3.json',
  preferSdk: true,
}, sdkAdapter);
```

If the SDK adapter throws during `init()`, the renderer transparently falls back to the Canvas pet, so the surface always renders.
