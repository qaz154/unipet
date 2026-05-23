/**
 * Shared hook utilities for all agent integrations.
 *
 * Every hook script imports this module for:
 * - Reading stdin payload
 * - Finding the HTTP server port via discovery file
 * - POSTing state changes
 * - Classifying tool names into pet states
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { request } from 'node:http';

/** Read stdin JSON payload from the agent. Returns {} on failure. */
export function readStdinPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return {};
  }
}

/** Validate port is a number in range 1-65535. */
function isValidPort(port) {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function getServerInfo() {
  const paths = [
    join(homedir(), '.local', 'state', 'unipet', 'ipc.json'),
    join(homedir(), 'AppData', 'Local', 'unipet', 'ipc.json'),
  ];
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (isValidPort(data.httpPort)) return data;
    } catch { /* next */ }
  }
  return { httpPort: 23333 };
}

/** Find the UniPet HTTP server port from the discovery file. */
export function getServerPort() {
  return getServerInfo().httpPort;
}

export function getAuthToken() {
  const tokenPaths = [
    join(homedir(), '.unipet', 'auth-token'),
  ];
  for (const p of tokenPaths) {
    try {
      const token = readFileSync(p, 'utf-8').trim();
      if (token) return token;
    } catch { /* next */ }
  }
  return '';
}

function authHeaders(contentLength) {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    'Content-Length': contentLength,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Classify a tool name + input into a specific pet state.
 * Used by hook-based agents that report tool usage events.
 */
export function classifyToolState(toolName, toolInput) {
  const name = (toolName || '').toLowerCase();
  const input = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || '');

  if (name.includes('edit') || name.includes('write') || name.includes('multiedit') || name.includes('save')) {
    return 'editing';
  }
  if (name.includes('bash') || name.includes('terminal') || name.includes('command')) {
    if (/\b(test|vitest|jest|pytest|cargo test|go test|npm test|pnpm test)\b/.test(input)) {
      return 'testing';
    }
    return 'working';
  }
  if (name.includes('agent') || name.includes('subagent')) {
    return 'juggling';
  }
  return 'working';
}

/**
 * Map generic event names to pet states.
 * Works for Claude Code, CodeBuddy, Copilot, and similar hook-based agents.
 */
export function mapEventToState(eventName, payload) {
  const map = {
    // Lifecycle
    SessionStart: 'thinking',
    SessionEnd: 'idle',
    UserPromptSubmit: 'thinking',
    userPromptSubmitted: 'thinking',

    // Tool use
    PreToolUse: 'working',
    preToolUse: 'working',
    BeforeTool: 'working',
    PostToolUse: 'working',
    postToolUse: 'working',
    AfterTool: 'working',
    PostToolUseFailure: 'error',

    // Completion
    Stop: 'attention',
    stop: 'attention',
    StopFailure: 'error',

    // Notifications
    Notification: 'notification',

    // Subagents
    SubagentStart: 'juggling',
    SubagentStop: 'working',
    agentSpawn: 'thinking',

    // Kiro-specific
    BeforeAgent: 'thinking',
    AfterAgent: 'attention',

    // Permission
    PermissionRequest: 'waiting',
    PreCompact: 'sweeping',
    PostCompact: 'working',
    PreCompress: 'sweeping',
  };

  const baseState = map[eventName] || 'idle';

  // Refine tool-based events
  if (['PreToolUse', 'PostToolUse', 'preToolUse', 'postToolUse', 'BeforeTool', 'AfterTool'].includes(eventName)) {
    return classifyToolState(payload.tool_name || payload.name, payload.tool_input || payload.input);
  }

  return baseState;
}

/**
 * POST a state event to the UniPet HTTP server.
 * Silently exits on failure — never breaks the agent.
 */
export function postState(state, source, sessionId, meta = {}) {
  const port = getServerPort();
  const postData = JSON.stringify({ state, source, sessionId, meta });

  const req = request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/state',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 2000,
    },
    () => process.exit(0),
  );

  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(postData);
  req.end();
}

/**
 * POST a permission request, then long-poll for the user's decision.
 * The hook blocks until the user clicks Allow/Deny in the pet UI.
 * Exit 0 = allow, exit 2 = deny.
 */
export function postPermission(permissionId, toolName, message, source, sessionId) {
  const port = getServerPort();
  const postData = JSON.stringify({ permissionId, toolName, message, source, sessionId });

  const postReq = request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/permission',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3000,
    },
    () => {
      // Permission sent to UI. Now long-poll for the user's decision.
      const pollReq = request(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/permission-result?id=${encodeURIComponent(permissionId)}`,
          method: 'GET',
          timeout: 130_000, // 2min + 10s buffer
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              const allowed = result.action === 'allow' || result.action === 'allow-once';
              process.exit(allowed ? 0 : 2);
            } catch {
              process.exit(0); // parse error → allow (safe default)
            }
          });
        },
      );
      pollReq.on('error', () => process.exit(0));
      pollReq.on('timeout', () => { pollReq.destroy(); process.exit(0); });
      pollReq.end();
    },
  );

  postReq.on('error', () => process.exit(0));
  postReq.on('timeout', () => { postReq.destroy(); process.exit(0); });
  postReq.write(postData);
  postReq.end();
}

/**
 * Full hook handler: reads stdin, maps event, POSTs state or permission.
 */
export function handleHook(source, eventName, payload) {
  if (!eventName) process.exit(0);

  const sessionId = payload.session_id || payload.sessionId || payload.turn_id || payload.conversation_id || source;

  // Permission events go to the dedicated permission endpoint
  if (eventName === 'PermissionRequest') {
    const toolName = payload.tool_name || payload.name || 'unknown';
    const message = payload.message || `Allow "${toolName}"?`;
    const permId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    postPermission(permId, toolName, message, source, sessionId);
    return;
  }

  const state = mapEventToState(eventName, payload);

  postState(state, source, sessionId, {
    eventName,
    toolName: payload.tool_name || payload.name,
  });
}

/**
 * Derive agent source from the calling hook script filename.
 * E.g. claude-hook.js → 'claude-code', cursor-hook.js → 'cursor'
 */
const SCRIPT_TO_SOURCE = {
  'claude-hook.js': 'claude-code',
  'codex-hook.js': 'codex',
  'cursor-hook.js': 'cursor',
  'gemini-hook.js': 'gemini',
  'copilot-hook.js': 'copilot',
  'codebuddy-hook.js': 'codebuddy',
  'kiro-hook.js': 'kiro',
  'kimi-hook.js': 'kimi',
};

/** Auto-detected entry point. Reads stdin, maps event, posts to UniPet. */
export function main() {
  const source = SCRIPT_TO_SOURCE[process.argv[1].split(/[\\/]/).pop()] || 'unknown';
  const payload = readStdinPayload();
  handleHook(source, process.argv[2], payload);
}
