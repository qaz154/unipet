#!/usr/bin/env node
/**
 * UniPet Hook Installer
 *
 * Automatically detects installed AI agents and registers
 * UniPet hook scripts in their configuration files.
 *
 * Usage: node hooks/install-hooks.js [--agent <name>] [--uninstall]
 *
 * Supports: Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI,
 *           CodeBuddy, Kiro CLI, Kimi CLI, OpenCode, OpenClaw, Hermes
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const HOOKS_DIR = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const HOME = homedir();

// ─── Agent Definitions ──────────────────────────────────────

const AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    hookScript: 'claude-hook.js',
    detect: () => existsSync(join(HOME, '.claude')),
    configPath: join(HOME, '.claude', 'settings.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath);
      config.hooks = config.hooks || {};
      const events = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'StopFailure', 'Notification'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        const entry = { matcher: '', hooks: [{ type: 'command', command: hookCmd }] };
        if (!config.hooks[event].some((e) => e.hooks?.[0]?.command === hookCmd)) {
          config.hooks[event].push(entry);
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    hookScript: 'codex-hook.js',
    detect: () => existsSync(join(HOME, '.codex')),
    configPath: join(HOME, '.codex', 'hooks.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath, { version: 1, hooks: {} });
      const events = ['session_start', 'tool_use', 'tool_result', 'turn_end', 'error'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        if (!config.hooks[event].some((e) => e.command === hookCmd)) {
          config.hooks[event].push({ command: hookCmd });
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    hookScript: 'cursor-hook.js',
    detect: () => existsSync(join(HOME, '.cursor')),
    configPath: join(HOME, '.cursor', 'hooks.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath, { hooks: {} });
      const events = ['prompt_submit', 'tool_start', 'tool_end', 'agent_end', 'error'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        if (!config.hooks[event].some((e) => e.command === hookCmd)) {
          config.hooks[event].push({ command: hookCmd });
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    hookScript: 'gemini-hook.js',
    detect: () => existsSync(join(HOME, '.gemini')),
    configPath: join(HOME, '.gemini', 'settings.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath);
      config.hooks = config.hooks || {};
      const events = ['SessionStart', 'BeforeTool', 'AfterTool', 'Notification'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        const entry = { matcher: '*', hooks: [{ name: 'unipet', type: 'command', command: hookCmd }] };
        if (!config.hooks[event].some((e) => e.hooks?.[0]?.command === hookCmd)) {
          config.hooks[event].push(entry);
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'copilot',
    name: 'Copilot CLI',
    hookScript: 'copilot-hook.js',
    detect: () => existsSync(join(HOME, '.copilot')),
    configPath: join(HOME, '.copilot', 'hooks', 'hooks.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath, { version: 1, hooks: {} });
      const events = ['sessionStart', 'userPromptSubmitted', 'preToolUse', 'postToolUse', 'sessionEnd'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        if (!config.hooks[event].some((e) => e.bash === hookCmd)) {
          config.hooks[event].push({
            type: 'command',
            bash: hookCmd,
            powershell: hookCmd,
            timeoutSec: 5,
          });
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    hookScript: 'codebuddy-hook.js',
    detect: () => existsSync(join(HOME, '.codebuddy')),
    configPath: join(HOME, '.codebuddy', 'settings.json'),
    install(configPath, hookCmd) {
      const config = readJson(configPath);
      config.hooks = config.hooks || {};
      const events = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification'];
      for (const event of events) {
        config.hooks[event] = config.hooks[event] || [];
        const entry = { matcher: '', hooks: [{ type: 'command', command: hookCmd }] };
        if (!config.hooks[event].some((e) => e.hooks?.[0]?.command === hookCmd)) {
          config.hooks[event].push(entry);
        }
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    hookScript: 'kiro-hook.js',
    detect: () => existsSync(join(HOME, '.kiro')),
    configPath: join(HOME, '.kiro', 'agents', 'unipet.json'),
    install(configPath, hookCmd) {
      mkdirSync(dirname(configPath), { recursive: true });
      const config = {
        name: 'unipet',
        description: 'UniPet desktop pet hook integration',
        hooks: {
          agentSpawn: [{ command: hookCmd }],
          userPromptSubmit: [{ command: hookCmd }],
          preToolUse: [{ command: hookCmd }],
          postToolUse: [{ command: hookCmd }],
          stop: [{ command: hookCmd }],
        },
      };
      writeJson(configPath, config);
    },
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    hookScript: 'kimi-hook.js',
    detect: () => existsSync(join(HOME, '.kimi')),
    configPath: join(HOME, '.kimi', 'config.toml'),
    install(configPath, hookCmd) {
      // Kimi uses TOML — append hook entries
      const events = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification'];
      let toml = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
      for (const event of events) {
        const block = `\n[[hooks]]\nevent = "${event}"\ncommand = '${hookCmd}'\nmatcher = ""\ntimeout = 30\n`;
        if (!toml.includes(hookCmd)) {
          toml += block;
        }
      }
      writeFileSync(configPath, toml);
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    hookScript: null,
    detect: () => existsSync(join(HOME, '.config', 'opencode')),
    configPath: join(HOME, '.config', 'opencode', 'opencode.json'),
    install(configPath, _hookCmd) {
      const config = readJson(configPath);
      config.plugin = config.plugin || [];
      const pluginPath = join(HOOKS_DIR, 'opencode-plugin');
      if (!config.plugin.includes(pluginPath)) {
        config.plugin.push(pluginPath);
      }
      writeJson(configPath, config);
    },
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    hookScript: null,
    detect: () => existsSync(join(HOME, '.openclaw')),
    configPath: join(HOME, '.openclaw', 'openclaw.json'),
    install(configPath, _hookCmd) {
      const config = readJson(configPath);
      config.plugins = config.plugins || {};
      config.plugins.load = config.plugins.load || {};
      config.plugins.load.paths = config.plugins.load.paths || [];
      const pluginPath = join(HOOKS_DIR, 'openclaw-plugin');
      if (!config.plugins.load.paths.includes(pluginPath)) {
        config.plugins.load.paths.push(pluginPath);
      }
      config.plugins.entries = config.plugins.entries || {};
      config.plugins.entries['unipet'] = { enabled: true, hooks: {} };
      writeJson(configPath, config);
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// ─── Main ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetAgent = args.includes('--agent') ? args[args.indexOf('--agent') + 1] : null;
const uninstall = args.includes('--uninstall');

function removeEntries(entries, predicate) {
  return Array.isArray(entries) ? entries.filter((entry) => !predicate(entry)) : [];
}

function hookEntryMatches(hookCmd) {
  return (entry) => Boolean(
    entry && typeof entry === 'object' && (
      entry.command === hookCmd ||
      entry.bash === hookCmd ||
      entry.powershell === hookCmd ||
      (Array.isArray(entry.hooks) && entry.hooks.some((hook) => hook?.command === hookCmd))
    ),
  );
}

function pruneEmptyHookConfig(config) {
  if (!config.hooks || typeof config.hooks !== 'object') return;
  for (const key of Object.keys(config.hooks)) {
    const value = config.hooks[key];
    if (Array.isArray(value) && value.length === 0) delete config.hooks[key];
  }
  if (Object.keys(config.hooks).length === 0) delete config.hooks;
}

function uninstallAgent(agent, hookCmd) {
  switch (agent.id) {
    case 'claude-code':
    case 'codebuddy': {
      const config = readJson(agent.configPath, {});
      config.hooks = config.hooks || {};
      const events = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'StopFailure', 'Notification'];
      for (const event of events) {
        config.hooks[event] = removeEntries(config.hooks[event], hookEntryMatches(hookCmd));
      }
      pruneEmptyHookConfig(config);
      writeJson(agent.configPath, config);
      return;
    }
    case 'codex': {
      const config = readJson(agent.configPath, { version: 1, hooks: {} });
      const events = ['session_start', 'tool_use', 'tool_result', 'turn_end', 'error'];
      for (const event of events) {
        config.hooks[event] = removeEntries(config.hooks[event], (entry) => entry.command === hookCmd);
      }
      writeJson(agent.configPath, config);
      return;
    }
    case 'cursor': {
      const config = readJson(agent.configPath, { hooks: {} });
      const events = ['prompt_submit', 'tool_start', 'tool_end', 'agent_end', 'error'];
      for (const event of events) {
        config.hooks[event] = removeEntries(config.hooks[event], (entry) => entry.command === hookCmd);
      }
      writeJson(agent.configPath, config);
      return;
    }
    case 'gemini': {
      const config = readJson(agent.configPath, {});
      config.hooks = config.hooks || {};
      const events = ['SessionStart', 'BeforeTool', 'AfterTool', 'Notification'];
      for (const event of events) {
        config.hooks[event] = removeEntries(config.hooks[event], hookEntryMatches(hookCmd));
      }
      pruneEmptyHookConfig(config);
      writeJson(agent.configPath, config);
      return;
    }
    case 'copilot': {
      const config = readJson(agent.configPath, { version: 1, hooks: {} });
      const events = ['sessionStart', 'userPromptSubmitted', 'preToolUse', 'postToolUse', 'sessionEnd'];
      for (const event of events) {
        config.hooks[event] = removeEntries(config.hooks[event], (entry) => entry.bash === hookCmd || entry.powershell === hookCmd);
      }
      writeJson(agent.configPath, config);
      return;
    }
    case 'kiro': {
      const config = readJson(agent.configPath, {});
      const hooks = config.hooks || {};
      for (const key of Object.keys(hooks)) {
        hooks[key] = removeEntries(hooks[key], (entry) => entry.command === hookCmd);
      }
      config.hooks = hooks;
      writeJson(agent.configPath, config);
      return;
    }
    case 'kimi': {
      if (!existsSync(agent.configPath)) return;
      const toml = readFileSync(agent.configPath, 'utf-8');
      const blocks = toml.split(/\n(?=\[\[hooks\]\])/g).filter((block) => !block.includes(hookCmd));
      const next = blocks.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
      writeFileSync(agent.configPath, next ? `${next}\n` : '');
      return;
    }
    case 'opencode': {
      const config = readJson(agent.configPath, {});
      config.plugin = removeEntries(config.plugin, (entry) => entry === join(HOOKS_DIR, 'opencode-plugin'));
      writeJson(agent.configPath, config);
      return;
    }
    case 'openclaw': {
      const config = readJson(agent.configPath, {});
      config.plugins = config.plugins || {};
      config.plugins.load = config.plugins.load || {};
      config.plugins.load.paths = removeEntries(config.plugins.load.paths, (entry) => entry === join(HOOKS_DIR, 'openclaw-plugin'));
      if (config.plugins.entries && config.plugins.entries.unipet) {
        delete config.plugins.entries.unipet;
      }
      writeJson(agent.configPath, config);
      return;
    }
    case 'hermes': {
      if (existsSync(agent.configPath)) {
        try {
          unlinkSync(agent.configPath);
        } catch {
          // best effort
        }
      }
      return;
    }
    default:
      return;
  }
}

console.log('UniPet Hook Installer');
console.log('=====================\n');

let changed = 0;
let skipped = 0;

for (const agent of AGENTS) {
  if (targetAgent && agent.id !== targetAgent) continue;

  const detected = agent.detect();
  if (!uninstall && !detected) {
    console.log(`  ⬚ ${agent.name}: not installed, skipping`);
    skipped++;
    continue;
  }

  if (agent.hookScript) {
    const hookPath = join(HOOKS_DIR, agent.hookScript);
    const hookCmd = `node "${hookPath}"`;
    try {
      if (uninstall) {
        uninstallAgent(agent, hookCmd);
      } else {
        agent.install(agent.configPath, hookCmd);
      }
      console.log(`  ✓ ${agent.name}: hooks ${uninstall ? 'removed' : 'registered'}`);
      changed++;
    } catch (err) {
      console.log(`  ✗ ${agent.name}: ${err.message}`);
    }
  } else {
    try {
      if (uninstall) {
        uninstallAgent(agent, '');
      } else {
        agent.install(agent.configPath, '');
      }
      console.log(`  ✓ ${agent.name}: plugin ${uninstall ? 'removed' : 'registered'}`);
      changed++;
    } catch (err) {
      console.log(`  ✗ ${agent.name}: ${err.message}`);
    }
  }
}

console.log(`\nDone: ${changed} modified, ${skipped} skipped`);
