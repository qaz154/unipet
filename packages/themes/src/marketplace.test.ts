import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeMarketplace, type MarketplaceSource, type MarketplaceEntry } from './marketplace.js';
import { createLocalMarketplaceSource } from './marketplace-local.js';

function writeTheme(root: string, id: string, overrides: Record<string, unknown> = {}): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  const theme = {
    schemaVersion: 1,
    id,
    displayName: overrides['displayName'] ?? id,
    description: overrides['description'] ?? `${id} theme`,
    renderer: overrides['renderer'] ?? 'css-pixel',
    rendererConfig: {},
    states: {
      idle: { files: ['idle'] },
      working: { files: ['working'] },
      thinking: { files: ['thinking'] },
      error: { files: ['error'] },
      attention: { files: ['attention'] },
      sleeping: { files: ['sleeping'] },
    },
  };
  writeFileSync(join(dir, 'theme.json'), JSON.stringify(theme));
}

function stubSource(entries: MarketplaceEntry[], name = 'stub'): MarketplaceSource {
  return {
    name,
    async list() {
      return entries;
    },
  };
}

describe('ThemeMarketplace', () => {
  it('aggregates entries from multiple sources', async () => {
    const marketplace = new ThemeMarketplace([
      stubSource([{ id: 'a', displayName: 'A', description: 'a', renderer: 'css-pixel', source: 'stub' }], 'local'),
      stubSource([{ id: 'b', displayName: 'B', description: 'b', renderer: 'svg', source: 'stub' }], 'remote'),
    ]);

    const list = await marketplace.list();

    expect(list.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('deduplicates by id with first source winning', async () => {
    const marketplace = new ThemeMarketplace([
      stubSource([{ id: 'shared', displayName: 'Local', description: 'local', renderer: 'css-pixel', source: 'local' }], 'local'),
      stubSource([{ id: 'shared', displayName: 'Remote', description: 'remote', renderer: 'svg', source: 'remote' }], 'remote'),
    ]);

    const list = await marketplace.list();

    expect(list).toHaveLength(1);
    expect(list[0]!.displayName).toBe('Local');
  });

  it('ignores sources that throw', async () => {
    const failing: MarketplaceSource = {
      name: 'broken',
      async list() {
        throw new Error('network down');
      },
    };
    const marketplace = new ThemeMarketplace([
      failing,
      stubSource([{ id: 'a', displayName: 'A', description: 'a', renderer: 'css-pixel', source: 'stub' }]),
    ]);

    const list = await marketplace.list();

    expect(list.map((e) => e.id)).toEqual(['a']);
  });
});

describe('createLocalMarketplaceSource', () => {
  it('lists themes from a directory of theme.json files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'unipet-marketplace-'));
    try {
      writeTheme(root, 'pixel-cat');
      writeTheme(root, 'pixel-slime', { renderer: 'svg', description: 'green' });

      const source = createLocalMarketplaceSource(root);
      const list = await source.list();

      const ids = list.map((entry) => entry.id).sort();
      expect(ids).toEqual(['pixel-cat', 'pixel-slime']);
      const slime = list.find((entry) => entry.id === 'pixel-slime')!;
      expect(slime.renderer).toBe('svg');
      expect(slime.source).toBe('local');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips malformed theme directories without throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'unipet-marketplace-'));
    try {
      writeTheme(root, 'good');
      const badDir = join(root, 'broken');
      mkdirSync(badDir, { recursive: true });
      writeFileSync(join(badDir, 'theme.json'), '{ not json');

      const list = await createLocalMarketplaceSource(root).list();
      expect(list.map((entry) => entry.id)).toEqual(['good']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
