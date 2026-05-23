/**
 * Theme Marketplace — source-agnostic theme registry
 *
 * A marketplace aggregates entries from one or more `MarketplaceSource`s
 * (e.g. a local themes directory, a remote JSON index). Sources are tried
 * in order; the first source that defines a given theme id wins, so a
 * local override always takes precedence over a remote entry.
 *
 * Sources that fail are skipped — the marketplace must keep working even
 * when the network is unavailable.
 */

export interface MarketplaceEntry {
  /** Stable theme id, matches the `id` in `theme.json`. */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Short description for catalog views. */
  description: string;
  /** Renderer required to display this theme. */
  renderer: string;
  /** Source name that produced this entry (e.g. 'local', 'remote'). */
  source: string;
  /** Optional URL for fetching the full theme.json bundle. */
  downloadUrl?: string;
}

export interface MarketplaceSource {
  /** Identifier for the source — used to attribute entries. */
  readonly name: string;
  list(): Promise<MarketplaceEntry[]>;
}

export class ThemeMarketplace {
  constructor(private readonly sources: ReadonlyArray<MarketplaceSource>) {}

  /** List all themes across sources, deduplicated by id with earlier sources winning. */
  async list(): Promise<MarketplaceEntry[]> {
    const seen = new Map<string, MarketplaceEntry>();
    for (const source of this.sources) {
      let entries: MarketplaceEntry[] = [];
      try {
        entries = await source.list();
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!seen.has(entry.id)) seen.set(entry.id, entry);
      }
    }
    return [...seen.values()];
  }
}
