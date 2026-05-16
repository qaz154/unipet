/**
 * MCP Server Adapter
 *
 * Exposes MCP tools that any MCP-capable agent can call.
 * Inspired by openpets' @open-pets/mcp server design.
 *
 * Tools:
 * - unipet_status: Check pet status and lease
 * - unipet_react: Set a visual reaction
 * - unipet_say: Show a speech bubble
 * - unipet_move: Move the pet to a position
 */

import { BaseAdapter, type AgentCapabilities, type HealthStatus } from '../adapter.js';
import { EXTERNALLY_ALLOWED_STATES, isExternallyAllowedState, sanitizeBubbleText, SPEECH_MAX_LENGTH } from '@unipet/core';
import type { MoveTarget } from '@unipet/core';

const VALID_MOVES: MoveTarget[] = [
  'stay', 'center', 'edge-left', 'edge-right', 'edge-top', 'edge-bottom',
  'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
];

export interface MCPAdapterConfig {
  /** Pet id to target (default: 'default') */
  petId?: string;
}

export class MCPAdapter extends BaseAdapter {
  readonly id = 'mcp';
  readonly name = 'MCP Server';
  readonly capabilities: AgentCapabilities = {
    pushStates: true,
    mcpTools: true,
    permissionBubbles: false,
    subagentDetection: false,
    sessionEnd: true,
  };

  private leaseActive = false;
  private leasePetId = 'default';

  async health(): Promise<HealthStatus> {
    return {
      healthy: this.leaseActive,
      message: this.leaseActive
        ? `Lease active for pet '${this.leasePetId}'`
        : 'No active lease',
    };
  }

  /** Called when an MCP client acquires a lease */
  acquireLease(petId?: string): void {
    this.leaseActive = true;
    this.leasePetId = petId ?? 'default';
    this.ctx?.log.info(`[${this.id}] Lease acquired for pet '${this.leasePetId}'`);
  }

  /** Called when an MCP client releases its lease */
  releaseLease(): void {
    this.leaseActive = false;
    this.ctx?.log.info(`[${this.id}] Lease released`);
  }

  /** Handle unipet_status tool call */
  handleStatus(): { running: boolean; petId: string; leaseActive: boolean } {
    return {
      running: true,
      petId: this.leasePetId,
      leaseActive: this.leaseActive,
    };
  }

  /** Handle unipet_react tool call */
  handleReact(reaction: string): { success: boolean; error?: string } {
    if (!isExternallyAllowedState(reaction)) {
      return {
        success: false,
        error: `Invalid or disallowed reaction '${reaction}'`,
      };
    }

    this.ctx?.emit(this.stateEvent(reaction, { tool: 'unipet_react' }));
    return { success: true };
  }

  /** Handle unipet_say tool call */
  handleSay(message: string, reaction?: string): { success: boolean; error?: string } {
    if (typeof message !== 'string' || message.length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }
    if (message.length > SPEECH_MAX_LENGTH) {
      return { success: false, error: `Message exceeds ${SPEECH_MAX_LENGTH} character limit` };
    }
    if (message.includes('\n')) {
      return { success: false, error: 'Message cannot contain newlines' };
    }
    const sanitized = sanitizeBubbleText(message, SPEECH_MAX_LENGTH);
    if (!sanitized) return { success: false, error: 'Message empty after sanitization' };

    const state = reaction && isExternallyAllowedState(reaction) ? reaction : undefined;

    this.ctx?.emit({
      type: 'speech',
      source: this.id,
      message: sanitized,
      state,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  /** Handle unipet_move tool call */
  handleMove(target: string): { success: boolean; error?: string } {
    if (!VALID_MOVES.includes(target as MoveTarget)) {
      return {
        success: false,
        error: `Invalid move target '${target}'. Valid: ${VALID_MOVES.join(', ')}`,
      };
    }

    this.ctx?.emit({
      type: 'move',
      source: this.id,
      move: target as MoveTarget,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  /** Get the MCP tool definitions (for MCP SDK registration) */
  getToolDefinitions() {
    return [
      {
        name: 'unipet_status',
        description: 'Check if UniPet desktop pet is running and get status',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'unipet_react',
        description: 'Set a visual reaction on the desktop pet',
        inputSchema: {
          type: 'object',
          properties: {
            reaction: {
              type: 'string',
              enum: [...EXTERNALLY_ALLOWED_STATES],
              description: 'The reaction to display',
            },
          },
          required: ['reaction'],
        },
      },
      {
        name: 'unipet_say',
        description: `Show a short speech bubble message on the pet (max ${SPEECH_MAX_LENGTH} chars, single line, no code/URLs/paths)`,
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              minLength: 1,
              maxLength: SPEECH_MAX_LENGTH,
              description: 'The message to display',
            },
            reaction: {
              type: 'string',
              enum: [...EXTERNALLY_ALLOWED_STATES],
              description: 'Optional reaction to display with the message',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'unipet_move',
        description: 'Move the pet to a screen position',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              enum: VALID_MOVES,
              description: 'Where to move the pet',
            },
          },
          required: ['target'],
        },
      },
    ];
  }
}
