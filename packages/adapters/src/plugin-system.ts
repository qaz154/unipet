/**
 * Plugin System
 *
 * Allows external developers to create adapters, renderers,
 * and theme extensions that integrate with UniPet.
 *
 * Plugins are loaded from:
 * - ~/.unipet/plugins/ (user plugins)
 * - <app>/plugins/ (bundled plugins)
 *
 * A plugin exports a manifest (plugin.json) and entry point.
 */

import type { AgentAdapter } from './adapter.js';
import { createLogger } from '@unipet/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: 'adapter' | 'renderer' | 'theme' | 'all';
  entryPoint: string;
  minUniPetVersion?: string;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  adapter?: AgentAdapter;
  renderer?: unknown;
  instance: unknown;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const REQUIRED_MANIFEST_FIELDS: readonly (keyof PluginManifest)[] = [
  'id',
  'name',
  'version',
  'description',
  'author',
  'type',
  'entryPoint',
];

function validateManifest(raw: Record<string, unknown>): boolean {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (typeof raw[field] !== 'string') return false;
  }
  const validTypes = ['adapter', 'renderer', 'theme', 'all'];
  if (!validTypes.includes(raw['type'] as string)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Default plugin directories
// ---------------------------------------------------------------------------

function getDefaultPluginDirs(): string[] {
  const dirs: string[] = [];
  // User plugins
  const userDir = join(homedir(), '.unipet', 'plugins');
  if (existsSync(userDir)) dirs.push(userDir);
  return dirs;
}

// ---------------------------------------------------------------------------
// PluginLoader
// ---------------------------------------------------------------------------

class PluginLoader {
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly log = createLogger('info', 'unipet').child('plugins');

  /**
   * Scan plugin directories for plugin.json manifests.
   * Returns parsed manifests for every valid plugin found.
   */
  scan(pluginDirs: string[]): PluginManifest[] {
    const manifests: PluginManifest[] = [];

    for (const dir of pluginDirs) {
      if (!existsSync(dir)) {
        this.log.warn(`Plugin directory does not exist: ${dir}`);
        continue;
      }

      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = join(dir, entry.name, 'plugin.json');
        if (!existsSync(manifestPath)) continue;

        try {
          const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
          if (!validateManifest(raw)) {
            this.log.warn(`Invalid manifest skipped: ${manifestPath}`);
            continue;
          }
          manifests.push(raw as unknown as PluginManifest);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log.error(`Failed to parse ${manifestPath}: ${msg}`);
        }
      }
    }

    this.log.info(`Scanned ${manifests.length} plugin(s) from ${pluginDirs.length} directory(ies)`);
    return manifests;
  }

  /**
   * Load a plugin by resolving its manifest path.
   * The manifestPath should point to a `plugin.json` file.
   */
  async load(manifestPath: string): Promise<LoadedPlugin | null> {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
      if (!validateManifest(raw)) {
        this.log.error(`Invalid manifest: ${manifestPath}`);
        return null;
      }

      const manifest = raw as unknown as PluginManifest;
      const pluginDir = resolve(manifestPath, '..');
      const entryPath = resolve(pluginDir, manifest.entryPoint);

      if (!existsSync(entryPath)) {
        this.log.error(`Entry point not found: ${entryPath}`);
        return null;
      }

      // Dynamic import — works for both ESM and CJS depending on host config
      const mod = await import(entryPath);

      const loaded: LoadedPlugin = {
        manifest,
        instance: mod,
      };

      // Extract adapter if present
      const adapterExport = mod.adapter ?? mod.default?.adapter;
      if (
        (manifest.type === 'adapter' || manifest.type === 'all') &&
        adapterExport != null
      ) {
        loaded.adapter = adapterExport as AgentAdapter;
      }

      // Extract renderer if present
      const rendererExport = mod.renderer ?? mod.default?.renderer;
      if (
        (manifest.type === 'renderer' || manifest.type === 'all') &&
        rendererExport != null
      ) {
        loaded.renderer = rendererExport;
      }

      this.plugins.set(manifest.id, loaded);
      this.log.info(`Loaded plugin: ${manifest.name}@${manifest.version}`);
      return loaded;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to load plugin from ${manifestPath}: ${msg}`);
      return null;
    }
  }

  /** Return all currently loaded plugins. */
  getLoaded(): readonly LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Unload a single plugin by its manifest id.
   * If the adapter exposes a stop() method, it will be called first.
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      this.log.warn(`Plugin "${pluginId}" is not loaded`);
      return;
    }

    if (plugin.adapter && typeof plugin.adapter.stop === 'function') {
      try {
        await plugin.adapter.stop();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`Error stopping adapter for "${pluginId}": ${msg}`);
      }
    }

    this.plugins.delete(pluginId);
    this.log.info(`Unloaded plugin: ${pluginId}`);
  }

  /** Unload every loaded plugin. */
  async unloadAll(): Promise<void> {
    const ids = [...this.plugins.keys()];
    for (const id of ids) {
      await this.unload(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export {
  PluginLoader,
  type PluginManifest,
  type LoadedPlugin,
  getDefaultPluginDirs,
};
