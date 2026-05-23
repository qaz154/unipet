# Themes

Themes are JSON manifests describing how the pet looks across its 24 visual states.

## Layout

```
themes/<id>/theme.json
themes/<id>/<state>.svg          # only for SVG renderer
themes/<id>/<spritesheet>.png    # only for sprite renderer
```

## Minimal Schema

```json
{
  "schemaVersion": 1,
  "id": "my-pet",
  "displayName": "My Pet",
  "renderer": "css-pixel",
  "rendererConfig": { },
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

## Validate

```bash
unipet theme validate ./themes/my-pet
node scripts/validate-theme.mjs themes/my-pet
```

Both commands accept either a theme directory or a `theme.json` file path.

## Marketplace

UniPet aggregates themes through `ThemeMarketplace` from `@unipet/themes`. Sources are tried in order — the first source that produces a given theme id wins, so a local override beats a remote one.

```ts
import { ThemeMarketplace } from '@unipet/themes';
import { createLocalMarketplaceSource } from '@unipet/themes/marketplace-local';

const marketplace = new ThemeMarketplace([
  createLocalMarketplaceSource('./themes'),
  // future: createRemoteMarketplaceSource('https://…/index.json'),
]);

const entries = await marketplace.list();
```

Sources that throw (e.g. network failure) are skipped silently — the marketplace stays usable offline.
