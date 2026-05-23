/**
 * Remote Marketplace Source
 *
 * Fetches a JSON index from a URL and returns it as marketplace entries.
 * The remote index must be an array of objects matching MarketplaceEntry.
 *
 * Errors (network failures, bad JSON, timeouts) are thrown so the
 * ThemeMarketplace can skip this source and continue with others.
 *
 * Node.js only — depends on node:https / node:http.
 *
 * Example remote index format (hosted as a static JSON file):
 * [
 *   {
 *     "id": "neon-cat",
 *     "displayName": "Neon Cat",
 *     "description": "A glowing CSS-pixel cat",
 *     "renderer": "css-pixel",
 *     "downloadUrl": "https://example.com/themes/neon-cat.zip"
 *   }
 * ]
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { MarketplaceEntry, MarketplaceSource } from './marketplace.js';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB — enough for a large index

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = transport(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'unipet-marketplace/1' },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          reject(new Error(`Remote marketplace returned HTTP ${res.statusCode}: ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            req.destroy();
            reject(new Error(`Remote marketplace response exceeds ${MAX_BODY_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch {
            reject(new Error(`Remote marketplace response is not valid JSON: ${url}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Remote marketplace request timed out after ${FETCH_TIMEOUT_MS}ms: ${url}`));
    });

    req.end();
  });
}

function isEntryLike(item: unknown): item is Record<string, unknown> {
  return typeof item === 'object' && item !== null && !Array.isArray(item);
}

export function createRemoteMarketplaceSource(
  indexUrl: string,
  name = 'remote',
): MarketplaceSource {
  return {
    name,
    async list(): Promise<MarketplaceEntry[]> {
      const raw = await fetchJson(indexUrl);
      if (!Array.isArray(raw)) {
        throw new Error(`Remote marketplace index is not an array: ${indexUrl}`);
      }

      const entries: MarketplaceEntry[] = [];
      for (const item of raw) {
        if (!isEntryLike(item)) continue;
        const id = typeof item['id'] === 'string' ? item['id'] : '';
        if (!id) continue;
        entries.push({
          id,
          displayName: typeof item['displayName'] === 'string' ? item['displayName'] : id,
          description: typeof item['description'] === 'string' ? item['description'] : '',
          renderer: typeof item['renderer'] === 'string' ? item['renderer'] : 'unknown',
          source: name,
          downloadUrl: typeof item['downloadUrl'] === 'string' ? item['downloadUrl'] : undefined,
        });
      }
      return entries;
    },
  };
}
