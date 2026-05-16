/**
 * Agent Adapter Interface
 *
 * Every AI agent integration implements this interface.
 * Inspired by clawd-on-desk's agent registry + openpets' MCP adapter.
 */

import type { PetEvent, PetState, EventBus } from '@unipet/core';
import { SPEECH_MAX_LENGTH } from '@unipet/core';

export interface AgentCapabilities {
  /** Pushes state changes via hooks/plugins */
  pushStates: boolean;
  /** Exposes MCP tools for agents to call */
  mcpTools: boolean;
  /** Supports blocking permission bubbles */
  permissionBubbles: boolean;
  /** Can detect subagent activity */
  subagentDetection: boolean;
  /** Notifies on session end */
  sessionEnd: boolean;
}

export interface HealthStatus {
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface AdapterConfig {
  /** Whether this adapter is enabled */
  enabled: boolean;
  /** Adapter-specific configuration */
  overrides?: Record<string, unknown>;
  /** HTTP server port for hook callbacks */
  httpPort: number;
}

export interface AdapterContext {
  /** Emit a pet event to the bus */
  emit(event: PetEvent): void;
  /** Get adapter configuration */
  getConfig(): AdapterConfig;
  /** Logger */
  log: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
  };
  /** The event bus (for advanced adapters) */
  bus: EventBus;
}

export interface AgentAdapter {
  /** Unique adapter identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** What this adapter can do */
  readonly capabilities: AgentCapabilities;

  /** Start the adapter */
  start(ctx: AdapterContext): Promise<void>;
  /** Stop the adapter */
  stop(): Promise<void>;
  /** Check if the target agent is installed/available on this system */
  detect(): Promise<boolean>;
  /** Install integration (write hooks to agent config files) */
  install(): Promise<void>;
  /** Uninstall integration */
  uninstall(): Promise<void>;
  /** Health check */
  health(): Promise<HealthStatus>;
}

/** Base class with sensible defaults — adapters can extend this */
export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly capabilities: AgentCapabilities;

  protected ctx!: AdapterContext;

  async start(ctx: AdapterContext): Promise<void> {
    this.ctx = ctx;
    this.ctx.log.info(`[${this.id}] Starting adapter`);
  }

  async stop(): Promise<void> {
    this.ctx?.log.info(`[${this.id}] Stopping adapter`);
  }

  async detect(): Promise<boolean> {
    return false;
  }

  async install(): Promise<void> {
    this.ctx?.log.warn(`[${this.id}] install() not implemented`);
  }

  async uninstall(): Promise<void> {
    this.ctx?.log.warn(`[${this.id}] uninstall() not implemented`);
  }

  async health(): Promise<HealthStatus> {
    return { healthy: true, message: 'OK' };
  }

  /** Helper: create a state event */
  protected stateEvent(state: PetState, meta?: Record<string, unknown>): PetEvent {
    return {
      type: 'state_change',
      source: this.id,
      state,
      meta,
      timestamp: Date.now(),
    };
  }

  /** Helper: create a speech event */
  protected speechEvent(message: string, state?: PetState): PetEvent {
    return {
      type: 'speech',
      source: this.id,
      message: message.slice(0, SPEECH_MAX_LENGTH),
      state,
      timestamp: Date.now(),
    };
  }
}
