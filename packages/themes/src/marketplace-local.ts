/**
 * Local Marketplace Source
 *
 * Scans a directory of `<theme-id>/theme.json` files and produces marketplace
 * entries. Malformed theme.json files are skipped with no error so the
 * marketplace remains usable even when a single theme is broken.
 *
 * Node.js only — depends on node:fs.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketplaceEntry, MarketplaceSource } from './marketplace.js';

export function createLocalMarketplaceSource(themesDir: string, name = 'local'): MarketplaceSource {
  return {
    name,
    async list(): Promise<MarketplaceEntry[]> {
      if (!existsSync(themesDir)) return [];
      const entries = readdirSync(themesDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory());

      const results: MarketplaceEntry[] = [];
      for (const dirent of entries) {
        const themeFile = join(themesDir, dirent.name, 'theme.json');
        if (!existsSync(themeFile)) continue;
        try {
          const parsed = JSON.parse(readFileSync(themeFile, 'utf-8')) as Record<string, unknown>;
          const id = typeof parsed['id'] === 'string' ? parsed['id'] : dirent.name;
          const renderer = typeof parsed['renderer'] === 'string' ? parsed['renderer'] : 'unknown';
          const displayName = typeof parsed['displayName'] === 'string' ? parsed['displayName'] : id;
          const description = typeof parsed['description'] === 'string' ? parsed['description'] : '';
          results.push({ id, displayName, description, renderer, source: name });
        } catch {
          continue;
        }
      }
      return results;
    },
  };
}
