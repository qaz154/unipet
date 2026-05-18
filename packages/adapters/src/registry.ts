/**
 * Adapter Registry
 *
 * Central registry for all agent adapters.
 * Inspired by clawd-on-desk's agents/registry.js.
 */

import type { AgentAdapter, AdapterContext, AdapterConfig } from './adapter.js';
import type { EventBus } from '@unipet/core';
import { DEFAULT_HTTP_PORT, createLogger } from '@unipet/core';

export class AdapterRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly activeAdapters = new Map<string, AgentAdapter>();
  private bus!: EventBus;
  private config!: AdapterConfig;
  private readonly log = createLogger('info', 'unipet').child('registry');

  /** Register an adapter */
  register(adapter: AgentAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter '${adapter.id}' is already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  /** Get a registered adapter by id */
  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  /** List all registered adapters */
  list(): readonly AgentAdapter[] {
    return [...this.adapters.values()];
  }

  /** List all adapter ids */
  listIds(): string[] {
    return [...this.adapters.keys()];
  }

  /** Start a specific adapter */
  async startAdapter(id: string, bus: EventBus, config: AdapterConfig): Promise<void> {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Adapter '${id}' not found`);

    this.bus = bus;
    this.config = config;

    const ctx = this.createContext(id);
    await adapter.start(ctx);
    this.activeAdapters.set(id, adapter);
  }

  /** Start all enabled adapters */
  async startAll(
    bus: EventBus,
    getConfig: (id: string) => AdapterConfig,
  ): Promise<{ started: string[]; failed: Array<{ id: string; error: string }> }> {
    this.bus = bus;
    const started: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const adapter of this.adapters.values()) {
      const config = getConfig(adapter.id);
      if (!config.enabled) continue;

      try {
        const ctx = this.createContext(adapter.id);
        await adapter.start(ctx);
        this.activeAdapters.set(adapter.id, adapter);
        started.push(adapter.id);
      } catch (err) {
        failed.push({
          id: adapter.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { started, failed };
  }

  /** Stop a specific adapter */
  async stopAdapter(id: string): Promise<void> {
    const adapter = this.activeAdapters.get(id);
    if (adapter) {
      await adapter.stop();
      this.activeAdapters.delete(id);
    }
  }

  /** Stop all active adapters */
  async stopAll(): Promise<void> {
    for (const [id, adapter] of this.activeAdapters) {
      try {
        await adapter.stop();
      } catch (err) {
        this.log.error(`Error stopping adapter '${id}':`, err);
      }
    }
    this.activeAdapters.clear();
  }

  /** Detect which agents are available on this system */
  async detectAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const adapter of this.adapters.values()) {
      try {
        results[adapter.id] = await adapter.detect();
      } catch {
        results[adapter.id] = false;
      }
    }
    return results;
  }

  /** Run health checks on all active adapters */
  async healthCheckAll(): Promise<Record<string, { healthy: boolean; message: string }>> {
    const results: Record<string, { healthy: boolean; message: string }> = {};
    for (const [id, adapter] of this.activeAdapters) {
      try {
        results[id] = await adapter.health();
      } catch (err) {
        results[id] = {
          healthy: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return results;
  }

  /** Whether an adapter is currently active */
  isActive(id: string): boolean {
    return this.activeAdapters.has(id);
  }

  private createContext(adapterId: string): AdapterContext {
    if (!this.bus) {
      throw new Error(`Cannot create context for adapter '${adapterId}': bus not initialized. Call startAll() first.`);
    }
    return {
      emit: (event) => {
        this.bus.emit({ ...event, source: event.source || adapterId });
      },
      getConfig: () => this.config ?? { enabled: true, httpPort: DEFAULT_HTTP_PORT },
      log: {
        info: (msg, ...args) => this.log.info(msg, ...args),
        warn: (msg, ...args) => this.log.warn(msg, ...args),
        error: (msg, ...args) => this.log.error(msg, ...args),
        debug: (msg, ...args) => this.log.debug(msg, ...args),
      },
      bus: this.bus,
    };
  }
}
