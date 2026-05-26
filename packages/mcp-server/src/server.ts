/**
 * UniPet MCP Server
 *
 * Standalone MCP server that agents connect to.
 * Communicates with the UniPet desktop app via local IPC.
 * Inspired by openpets' @open-pets/mcp design.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EXTERNALLY_ALLOWED_STATES, SPEECH_MAX_LENGTH } from '@unipet/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PKG_VERSION: string = require('../package.json').version;

// Reactions match the policy in @unipet/core. MoveTargets are local because
// they aren't states — they live in a different namespace.
const VALID_REACTIONS = EXTERNALLY_ALLOWED_STATES as readonly string[];

const VALID_MOVES = [
  'stay', 'center', 'edge-left', 'edge-right', 'edge-top', 'edge-bottom',
  'corner-tl', 'corner-tr', 'corner-bl', 'corner-br',
] as const;

export interface MCPServerConfig {
  /** Pet id to target. Currently informational — multi-pet support not wired. */
  petId?: string;
  /**
   * Override the IPC discovery file location. When unset, ipc-client falls
   * back to the platform-default path written by the desktop app.
   */
  socketPath?: string;
}

export function createMCPServer(config?: MCPServerConfig): McpServer {
  // Stash config for callIPC so future plumbing can read it without changing
  // signatures across files.
  currentConfig = config;
  const server = new McpServer({
    name: 'unipet',
    version: PKG_VERSION,
  });

  // ─── Tool: unipet_status ──────────────────────────────────
  server.tool(
    'unipet_status',
    'Check if UniPet desktop pet is running and get its current status',
    {},
    async () => {
      const status = await callIPC('status', {});
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(status, null, 2),
        }],
      };
    },
  );

  // ─── Tool: unipet_react ───────────────────────────────────
  server.tool(
    'unipet_react',
    'Set a visual reaction on the desktop pet (idle, thinking, working, editing, testing, waiting, waving, attention, error, celebrating)',
    { reaction: z.enum(VALID_REACTIONS as unknown as [string, ...string[]]) },
    async ({ reaction }) => {
      const result = await callIPC('pet.react', { state: reaction });
      return {
        content: [{
          type: 'text' as const,
          text: result.success ? `Reaction set to '${reaction}'` : `Error: ${result.error}`,
        }],
      };
    },
  );

  // ─── Tool: unipet_say ─────────────────────────────────────
  server.tool(
    'unipet_say',
    `Show a short speech bubble on the desktop pet. Max ${SPEECH_MAX_LENGTH} chars, single line, no code/URLs/paths/secrets.`,
    {
      message: z.string().min(1).max(SPEECH_MAX_LENGTH),
      reaction: z.enum(VALID_REACTIONS as unknown as [string, ...string[]]).optional(),
    },
    async ({ message, reaction }) => {
      // Client-side validation
      if (message.includes('\n')) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: Message must be a single line',
          }],
        };
      }

      const result = await callIPC('pet.say', { message, reaction });
      return {
        content: [{
          type: 'text' as const,
          text: result.success ? `Said: "${message}"` : `Error: ${result.error}`,
        }],
      };
    },
  );

  // ─── Tool: unipet_move ────────────────────────────────────
  server.tool(
    'unipet_move',
    'Move the desktop pet to a screen position (stay, center, edge-left/right/top/bottom, corner-tl/tr/bl/br)',
    { target: z.enum(VALID_MOVES) },
    async ({ target }) => {
      const result = await callIPC('pet.move', { target });
      return {
        content: [{
          type: 'text' as const,
          text: result.success ? `Moved to '${target}'` : `Error: ${result.error}`,
        }],
      };
    },
  );

  // ─── Tool: unipet_mesh_connect ─────────────────────────────
  const MESH_EVENTS = [
    'ci_red', 'ci_green', 'milestone', 'celebrate', 'panic', 'wave', 'collaborate',
  ] as const;

  server.tool(
    'unipet_mesh_connect',
    'Connect this pet to a mesh room for cross-device pet social networking. Peers share state, speech, and collaborative events in real-time.',
    {
      relay_url: z.string().url().optional().describe('WebSocket relay URL (default: wss://mesh.unipet.dev)'),
      room: z.string().min(1).max(64).optional().describe('Room name (project/repo name)'),
      peer_name: z.string().min(1).max(32).optional().describe('Display name for this peer'),
    },
    async ({ relay_url, room, peer_name }) => {
      const params: Record<string, string> = {};
      if (relay_url) params.relayUrl = relay_url;
      if (room) params.room = room;
      if (peer_name) params.peerName = peer_name;
      const result = await callIPC('mesh.connect', params);
      return {
        content: [{
          type: 'text' as const,
          text: result.success ? `Connected to mesh room '${params.room || 'default'}'` : `Error: ${result.error}`,
        }],
      };
    },
  );

  // ─── Tool: unipet_mesh_broadcast ───────────────────────────
  server.tool(
    'unipet_mesh_broadcast',
    'Broadcast a mesh event (CI status, milestone, celebration) to all peers in the current room.',
    {
      event: z.enum(MESH_EVENTS as unknown as [string, ...string[]]).describe('Event type'),
      message: z.string().max(256).optional().describe('Optional message to include'),
    },
    async ({ event, message }) => {
      const result = await callIPC('mesh.broadcast', { event, message });
      return {
        content: [{
          type: 'text' as const,
          text: result.success ? `Broadcast '${event}' to mesh` : `Error: ${result.error}`,
        }],
      };
    },
  );

  return server;
}

export async function startMCPServer(config?: MCPServerConfig): Promise<void> {
  const server = createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ─── IPC Communication ───────────────────────────────────────
// In production, this connects to the desktop app via the discovery file + HTTP.
// The MCP client talks to the desktop app through packages/mcp-server/src/ipc-client.ts.

let currentConfig: MCPServerConfig | undefined;

interface IPCResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

async function callIPC(method: string, params: Record<string, unknown>): Promise<IPCResponse> {
  const { callIPC: ipcCall } = await import('./ipc-client.js');
  // Thread the optional socketPath through so future custom-location setups work.
  const opts = currentConfig?.socketPath ? { socketPath: currentConfig.socketPath } : undefined;
  return ipcCall(method, params, opts);
}
