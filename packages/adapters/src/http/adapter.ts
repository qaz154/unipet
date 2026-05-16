/**
 * HTTP/SSE Adapter
 *
 * Provides a REST API + SSE endpoint for custom agents to connect.
 * Inspired by Agentic-Desktop-Pet's FastAPI + SSE architecture.
 *
 * Endpoints:
 * - POST /api/state  — Set pet state
 * - POST /api/speech — Show speech bubble
 * - POST /api/emotion — Set emotion vector
 * - POST /api/move   — Move pet
 * - GET  /api/events  — SSE stream of pet events
 * - GET  /api/status  — Pet status
 */

import { BaseAdapter, type AgentCapabilities } from '../adapter.js';
import { isExternallyAllowedState, sanitizeBubbleText, DEFAULT_HTTP_PORT, SPEECH_MAX_LENGTH } from '@unipet/core';
import type { PetState, EmotionVector, MoveTarget, PetEvent } from '@unipet/core';

export interface HTTPAdapterConfig {
  /** Port to listen on (default: 23333) */
  port?: number;
  /** Allowed CORS origins (default: localhost only) */
  allowedOrigins?: string[];
}

export class HTTPAdapter extends BaseAdapter {
  readonly id = 'http';
  readonly name = 'HTTP API';
  readonly capabilities: AgentCapabilities = {
    pushStates: true,
    mcpTools: false,
    permissionBubbles: false,
    subagentDetection: false,
    sessionEnd: false,
  };

  private sseClients: Array<{ write: (data: string) => void; close: () => void }> = [];
  private port = DEFAULT_HTTP_PORT;

  async start(ctx: import('../adapter.js').AdapterContext): Promise<void> {
    await super.start(ctx);
    const config = ctx.getConfig();
    const overrides = config.overrides as HTTPAdapterConfig | undefined;
    this.port = overrides?.port ?? DEFAULT_HTTP_PORT;

    // Subscribe to events and forward to SSE clients
    ctx.bus.on((event) => {
      this.broadcastSSE(event);
    });

    this.ctx.log.info(`[${this.id}] HTTP adapter configured on port ${this.port}`);
    // Actual HTTP server would be started by the platform layer
    // (Tauri Rust backend or Node.js HTTP server)
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      client.close();
    }
    this.sseClients = [];
    await super.stop();
  }

  /** Process an incoming state request */
  processStateRequest(body: { state?: string; sessionId?: string }): { success: boolean; error?: string } {
    if (!body.state) return { success: false, error: 'Missing state field' };
    if (!isExternallyAllowedState(body.state)) {
      return { success: false, error: `Invalid or disallowed state: ${body.state}` };
    }

    this.ctx.emit(this.stateEvent(body.state, { sessionId: body.sessionId }));
    return { success: true };
  }

  /** Process an incoming speech request */
  processSpeechRequest(body: { message?: string; state?: string }): { success: boolean; error?: string } {
    if (typeof body.message !== 'string' || !body.message) {
      return { success: false, error: 'Missing message field' };
    }
    const sanitized = sanitizeBubbleText(body.message, SPEECH_MAX_LENGTH);
    if (!sanitized) return { success: false, error: 'Message empty after sanitization' };

    this.ctx.emit({
      type: 'speech',
      source: this.id,
      message: sanitized,
      state: body.state as PetState | undefined,
      timestamp: Date.now(),
    });
    return { success: true };
  }

  /** Process an incoming emotion request */
  processEmotionRequest(body: { emotion?: unknown }): { success: boolean; error?: string } {
    if (!body.emotion) return { success: false, error: 'Missing emotion field' };

    // Validate emotion vector shape
    const e = body.emotion as Record<string, unknown>;
    if (
      typeof e !== 'object' ||
      typeof e.valence !== 'number' || e.valence < -1 || e.valence > 1 ||
      typeof e.arousal !== 'number' || e.arousal < 0 || e.arousal > 1 ||
      typeof e.dominance !== 'number' || e.dominance < 0 || e.dominance > 1
    ) {
      return { success: false, error: 'Invalid emotion vector (valence: -1..1, arousal: 0..1, dominance: 0..1)' };
    }

    this.ctx.emit({
      type: 'emotion',
      source: this.id,
      emotion: body.emotion as EmotionVector,
      timestamp: Date.now(),
    });
    return { success: true };
  }

  /** Process an incoming move request */
  processMoveRequest(body: { target?: string }): { success: boolean; error?: string } {
    if (!body.target) return { success: false, error: 'Missing target field' };

    const validTargets: MoveTarget[] = [
      'stay', 'center', 'edge-left', 'edge-right', 'edge-top', 'edge-bottom',
      'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
    ];
    if (!validTargets.includes(body.target as MoveTarget)) {
      return { success: false, error: `Invalid target: ${body.target}` };
    }

    this.ctx.emit({
      type: 'move',
      source: this.id,
      move: body.target as MoveTarget,
      timestamp: Date.now(),
    });
    return { success: true };
  }

  /** Get current status */
  getStatus(): { running: boolean; sseClients: number; port: number } {
    return {
      running: true,
      sseClients: this.sseClients.length,
      port: this.port,
    };
  }

  /** Register an SSE client connection */
  addSSEClient(write: (data: string) => void, close: () => void): void {
    this.sseClients.push({ write, close });
    this.ctx?.log.debug(`[${this.id}] SSE client connected (total: ${this.sseClients.length})`);
  }

  /** Remove an SSE client */
  removeSSEClient(write: (data: string) => void): void {
    this.sseClients = this.sseClients.filter((c) => c.write !== write);
  }

  private broadcastSSE(event: PetEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.removeSSEClient(client.write);
      }
    }
  }
}
