/**
 * All built-in agent adapters.
 *
 * Each agent is defined with its id, name, capabilities,
 * and a hook event → pet state mapping.
 *
 * 12 agents total:
 * - Hook-based: Claude Code, Codex, Cursor, Gemini, Copilot, CodeBuddy, Kiro, Kimi
 * - Plugin-based: OpenCode, OpenClaw, Hermes
 * - Protocol-based: MCP, HTTP, Git (separate adapter classes)
 */

import { BaseAdapter, type AgentCapabilities } from './adapter.js';
import type { PetState } from '@unipet/core';

// ─── Generic Hook-Based Adapter ─────────────────────────────

export interface AgentDefinition {
  id: string;
  name: string;
  capabilities: AgentCapabilities;
  hookScript: string;
  configPath: string;
  eventToState: Record<string, PetState>;
}

/** Generic adapter for any hook-based agent */
export class HookBasedAdapter extends BaseAdapter {
  readonly capabilities: AgentCapabilities;

  constructor(private readonly def: AgentDefinition) {
    super();
    this.capabilities = def.capabilities;
  }

  get id(): string { return this.def.id; }
  get name(): string { return this.def.name; }

  async detect(): Promise<boolean> {
    try {
      const { existsSync } = await import('node:fs');
      const { homedir } = await import('node:os');
      const { join } = await import('node:path');
      return existsSync(join(homedir(), ...this.def.configPath.split('/')));
    } catch {
      return false;
    }
  }

  /** Process a hook event and emit the corresponding pet state */
  processHookEvent(eventName: string, payload: Record<string, unknown>): void {
    const state = this.def.eventToState[eventName] || 'idle';
    this.ctx?.emit(this.stateEvent(state, { eventName, toolName: payload['tool_name'] }));
  }
}

// ─── Agent Registry ─────────────────────────────────────────

const STANDARD_CAPS: AgentCapabilities = {
  pushStates: true,
  mcpTools: false,
  permissionBubbles: false,
  subagentDetection: false,
  sessionEnd: true,
};

const ADVANCED_CAPS: AgentCapabilities = {
  pushStates: true,
  mcpTools: false,
  permissionBubbles: true,
  subagentDetection: true,
  sessionEnd: true,
};

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    capabilities: ADVANCED_CAPS,
    hookScript: 'claude-hook.js',
    configPath: '.claude/settings.json',
    eventToState: {
      UserPromptSubmit: 'thinking',
      PreToolUse: 'working',
      PostToolUse: 'working',
      Stop: 'attention',
      StopFailure: 'error',
      Notification: 'notification',
      SubagentStart: 'juggling',
      SubagentStop: 'working',
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    capabilities: ADVANCED_CAPS,
    hookScript: 'codex-hook.js',
    configPath: '.codex/hooks.json',
    eventToState: {
      session_start: 'thinking',
      tool_use: 'working',
      tool_result: 'working',
      turn_end: 'attention',
      error: 'error',
      permission: 'waiting',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    capabilities: STANDARD_CAPS,
    hookScript: 'cursor-hook.js',
    configPath: '.cursor/hooks.json',
    eventToState: {
      prompt_submit: 'thinking',
      tool_start: 'working',
      tool_end: 'working',
      agent_start: 'thinking',
      agent_end: 'attention',
      error: 'error',
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    capabilities: STANDARD_CAPS,
    hookScript: 'gemini-hook.js',
    configPath: '.gemini/settings.json',
    eventToState: {
      SessionStart: 'thinking',
      SessionEnd: 'idle',
      BeforeTool: 'working',
      AfterTool: 'working',
      Notification: 'notification',
      PreCompress: 'sweeping',
    },
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    capabilities: STANDARD_CAPS,
    hookScript: 'copilot-hook.js',
    configPath: '.copilot/hooks/hooks.json',
    eventToState: {
      sessionStart: 'thinking',
      userPromptSubmitted: 'thinking',
      preToolUse: 'working',
      postToolUse: 'working',
      sessionEnd: 'idle',
    },
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    capabilities: { ...STANDARD_CAPS, permissionBubbles: true },
    hookScript: 'codebuddy-hook.js',
    configPath: '.codebuddy/settings.json',
    eventToState: {
      SessionStart: 'thinking',
      UserPromptSubmit: 'thinking',
      PreToolUse: 'working',
      PostToolUse: 'working',
      Stop: 'attention',
      Notification: 'notification',
      PreCompact: 'sweeping',
      PermissionRequest: 'waiting',
    },
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    capabilities: STANDARD_CAPS,
    hookScript: 'kiro-hook.js',
    configPath: '.kiro/agents/unipet.json',
    eventToState: {
      agentSpawn: 'thinking',
      userPromptSubmit: 'thinking',
      preToolUse: 'working',
      postToolUse: 'working',
      stop: 'attention',
    },
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    capabilities: ADVANCED_CAPS,
    hookScript: 'kimi-hook.js',
    configPath: '.kimi/config.toml',
    eventToState: {
      SessionStart: 'thinking',
      UserPromptSubmit: 'thinking',
      PreToolUse: 'working',
      PostToolUse: 'working',
      PostToolUseFailure: 'error',
      Stop: 'attention',
      StopFailure: 'error',
      SubagentStart: 'juggling',
      SubagentStop: 'working',
      PreCompact: 'sweeping',
      Notification: 'notification',
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    capabilities: STANDARD_CAPS,
    hookScript: 'opencode-plugin/index.mjs',
    configPath: '.config/opencode/opencode.json',
    eventToState: {
      session_start: 'thinking',
      tool_use: 'working',
      tool_result: 'working',
      stop: 'attention',
      error: 'error',
    },
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    capabilities: STANDARD_CAPS,
    hookScript: 'openclaw-plugin/index.mjs',
    configPath: '.openclaw/openclaw.json',
    eventToState: {
      session_start: 'thinking',
      tool_use: 'working',
      stop: 'attention',
      error: 'error',
    },
  },
  {
    id: 'hermes',
    name: 'Hermes',
    capabilities: STANDARD_CAPS,
    hookScript: 'hermes-plugin/__init__.py',
    configPath: '.hermes/plugins/unipet/plugin.yaml',
    eventToState: {
      SessionStart: 'thinking',
      UserPromptSubmit: 'thinking',
      PreToolUse: 'working',
      PostToolUse: 'working',
      PostToolUseFailure: 'error',
      Stop: 'attention',
      StopFailure: 'error',
      SessionEnd: 'idle',
    },
  },
];

/** Create adapter instances for all built-in agents */
export function createBuiltinAdapters(): HookBasedAdapter[] {
  return BUILTIN_AGENTS.map((def) => new HookBasedAdapter(def));
}

/** Get agent definition by id */
export function getAgentDefinition(id: string): AgentDefinition | undefined {
  return BUILTIN_AGENTS.find((a) => a.id === id);
}

/** List all agent ids */
export function listAgentIds(): string[] {
  return BUILTIN_AGENTS.map((a) => a.id);
}
