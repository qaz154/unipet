/**
 * LRU resource cache for theme assets (SVG files, spritesheet images, etc.).
 * Thread-safe via serial access; max 50 entries by default.
 */

export interface CacheEntry<T = ArrayBuffer> {
  key: string;
  value: T;
  size: number;
  lastAccess: number;
}

export interface ThemeAssetCache {
  get(key: string): ArrayBuffer | undefined;
  set(key: string, value: ArrayBuffer): void;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  readonly size: number;
}

export function createThemeAssetCache(maxEntries = 50, maxBytes = 10 * 1024 * 1024): ThemeAssetCache {
  const map = new Map<string, CacheEntry>();
  let totalBytes = 0;

  const evict = (): void => {
    if (map.size <= maxEntries && totalBytes <= maxBytes) return;

    const sorted = [...map.entries()]
      .map(([k, e]) => ({ key: k, value: e.value, size: e.size, lastAccess: e.lastAccess }))
      .sort((a, b) => a.lastAccess - b.lastAccess);

    for (const entry of sorted) {
      if (map.size <= maxEntries && totalBytes <= maxBytes) break;
      map.delete(entry.key);
      totalBytes -= entry.size;
    }
  };

  const touch = (entry: CacheEntry): void => {
    entry.lastAccess = Date.now();
  };

  return {
    get(key: string): ArrayBuffer | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      touch(entry);
      return entry.value;
    },

    set(key: string, value: ArrayBuffer): void {
      if (value.byteLength > maxBytes) return;

      if (map.has(key)) {
        const existing = map.get(key)!;
        totalBytes -= existing.size;
      }

      map.set(key, { key, value, size: value.byteLength, lastAccess: Date.now() });
      totalBytes += value.byteLength;
      evict();
    },

    has(key: string): boolean {
      return map.has(key);
    },

    remove(key: string): boolean {
      const entry = map.get(key);
      if (!entry) return false;
      totalBytes -= entry.size;
      return map.delete(key);
    },

    clear(): void {
      map.clear();
      totalBytes = 0;
    },

    get size(): number {
      return map.size;
    },
  };
}
