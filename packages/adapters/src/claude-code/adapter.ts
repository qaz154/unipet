/**
 * Claude Code Adapter
 *
 * Integrates with Claude Code via command hooks and HTTP blocking hooks.
 * Ported from clawd-on-desk's hooks/clawd-hook.js + hooks/install.js.
 *
 * Claude Code supports:
 * - PreToolUse hooks (can block/approve tool calls)
 * - PostToolUse hooks (observe tool results)
 * - Notification hooks (stop, error events)
 * - UserPromptSubmit hooks
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { BaseAdapter, type AgentCapabilities, type HealthStatus } from '../adapter.js';
import type { PetState } from '@unipet/core';

const execFileAsync = promisify(execFile);

/** Claude Code hook event names → pet states */
const EVENT_TO_STATE: Record<string, PetState> = {
  UserPromptSubmit: 'thinking',
  PreToolUse: 'working',
  PostToolUse: 'working',
  Notification: 'notification',
  Stop: 'attention',
  StopFailure: 'error',
  SubagentStart: 'juggling',
  SubagentStop: 'working',
};

export class ClaudeCodeAdapter extends BaseAdapter {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';
  readonly capabilities: AgentCapabilities = {
    pushStates: true,
    mcpTools: false,
    permissionBubbles: true,
    subagentDetection: true,
    sessionEnd: true,
  };

  async detect(): Promise<boolean> {
    // Async probe — avoids blocking the Electron main loop on startup.
    try {
      await execFileAsync('claude', ['--version'], { timeout: 5000, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<HealthStatus> {
    const detected = await this.detect();
    if (!detected) {
      return { healthy: false, message: 'Claude Code CLI not found' };
    }
    return { healthy: true, message: 'Claude Code CLI detected' };
  }

  /**
   * Process a hook event from Claude Code.
   * Called by the HTTP server when it receives a hook POST.
   */
  processHookEvent(eventName: string, payload: Record<string, unknown>): void {
    const state = EVENT_TO_STATE[eventName];
    if (!state) {
      this.ctx?.log.debug(`[${this.id}] Ignoring unknown event: ${eventName}`);
      return;
    }

    const sessionId = this.extractSessionId(payload);

    // Map tool names to more specific states
    let resolvedState = state;
    if (eventName === 'PreToolUse' || eventName === 'PostToolUse') {
      resolvedState = this.classifyToolState(payload);
    }

    this.ctx?.emit(this.stateEvent(resolvedState, {
      eventName,
      toolName: payload['tool_name'],
      sessionId,
    }));
  }

  /**
   * Generate the hook configuration for Claude Code's settings.json.
   */
  generateHookConfig(_httpPort: number): Record<string, unknown> {
    const hookScript = this.getHookScriptPath();

    return {
      hooks: {
        PreToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `node "${hookScript}" PreToolUse`,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `node "${hookScript}" PostToolUse`,
              },
            ],
          },
        ],
        Notification: [
          {
            hooks: [
              {
                type: 'command',
                command: `node "${hookScript}" Notification`,
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: `node "${hookScript}" Stop`,
              },
            ],
          },
        ],
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: `node "${hookScript}" UserPromptSubmit`,
              },
            ],
          },
        ],
      },
    };
  }

  // ─── Private ──────────────────────────────────────────────

  private classifyToolState(payload: Record<string, unknown>): PetState {
    const toolName = String(payload['tool_name'] ?? '').toLowerCase();

    if (toolName.includes('edit') || toolName.includes('write') || toolName.includes('multiedit')) {
      return 'editing';
    }
    if (toolName.includes('bash')) {
      const input = String(payload['tool_input'] ?? '');
      if (/\b(test|vitest|jest|pytest|cargo test|go test)\b/.test(input)) {
        return 'testing';
      }
    }
    if (toolName.includes('agent')) {
      return 'juggling';
    }

    return 'working';
  }

  private extractSessionId(payload: Record<string, unknown>): string {
    return String(payload['session_id'] ?? payload['sessionId'] ?? 'default');
  }

  private getHookScriptPath(): string {
    const envPath = process.env['UNIPET_HOOK_PATH'];
    if (envPath) return envPath;
    // Use an absolute path under the user's config directory so the script
    // cannot be hijacked by a PATH-based trojan. The hook script should be
    // installed alongside the desktop app in a known, non-PATH location.
    return join(homedir(), '.unipet', 'hooks', 'unipet-hook');
  }
}
