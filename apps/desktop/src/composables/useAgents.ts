/**
 * Agent definitions, filtering, and toggle / install logic.
 *
 * Encapsulates the static agent catalogue, the filtered list driven by
 * the current search query, and the async toggle that installs or
 * disables an adapter through the Electron bridge.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useSettingsStore } from '../stores/settings';

export interface Agent {
  id: string;
  name: string;
  desc: string;
  badge: string;
  hasPerm: boolean;
}

interface UseAgentsDeps {
  matchesSearch: (...fields: (string | undefined)[]) => boolean;
  t: (key: string) => string;
}

interface UseAgentsReturn {
  agents: readonly Agent[];
  filteredAgents: ComputedRef<Agent[]>;
  expandedAgent: Ref<string | null>;
  agentInstalling: Ref<string | null>;
  agentStatus: Ref<Record<string, string>>;
  isAgentEnabled: (id: string) => boolean;
  toggleAgent: (id: string) => Promise<void>;
}

const AGENT_DEFINITIONS: readonly Agent[] = [
  { id: 'claude-code', name: 'Claude Code', desc: 'Anthropic AI', badge: 'hooks', hasPerm: true },
  { id: 'codex', name: 'Codex CLI', desc: 'OpenAI', badge: 'hooks', hasPerm: true },
  { id: 'cursor', name: 'Cursor', desc: 'AI editor', badge: 'hooks', hasPerm: false },
  { id: 'gemini', name: 'Gemini CLI', desc: 'Google AI', badge: 'hooks', hasPerm: false },
  { id: 'copilot', name: 'Copilot', desc: 'GitHub', badge: 'hooks', hasPerm: false },
  { id: 'codebuddy', name: 'CodeBuddy', desc: 'Tencent', badge: 'hooks', hasPerm: true },
  { id: 'kiro', name: 'Kiro CLI', desc: 'AWS', badge: 'hooks', hasPerm: false },
  { id: 'kimi', name: 'Kimi CLI', desc: 'Moonshot', badge: 'hooks', hasPerm: true },
  { id: 'opencode', name: 'OpenCode', desc: 'Open source', badge: 'plugin', hasPerm: false },
  { id: 'openclaw', name: 'OpenClaw', desc: 'Open source', badge: 'plugin', hasPerm: false },
  { id: 'hermes', name: 'Hermes', desc: 'Python', badge: 'plugin', hasPerm: false },
  { id: 'mcp', name: 'MCP Server', desc: 'Any MCP agent', badge: 'protocol', hasPerm: false },
  { id: 'http', name: 'HTTP API', desc: 'REST + SSE', badge: 'protocol', hasPerm: false },
  { id: 'git', name: 'Git Monitor', desc: 'Git state', badge: 'protocol', hasPerm: false },
];

export function useAgents(deps: UseAgentsDeps): UseAgentsReturn {
  const { matchesSearch, t } = deps;
  const settingsStore = useSettingsStore();

  const filteredAgents = computed(() =>
    AGENT_DEFINITIONS.filter((a) => matchesSearch(a.name, a.desc, a.id, a.badge)),
  );

  const expandedAgent = ref<string | null>(null);
  const agentInstalling = ref<string | null>(null);
  const agentStatus = ref<Record<string, string>>({});

  function isAgentEnabled(id: string): boolean {
    return settingsStore.enabledAdapters.includes(id);
  }

  async function toggleAgent(id: string): Promise<void> {
    const idx = settingsStore.enabledAdapters.indexOf(id);
    const enabling = idx === -1;
    const agent = AGENT_DEFINITIONS.find((a) => a.id === id);
    const needsInstall = agent?.badge !== 'protocol';

    if (enabling) {
      settingsStore.enabledAdapters.push(id);

      if (!needsInstall) {
        agentStatus.value[id] = t('status.installed');
        setTimeout(() => { delete agentStatus.value[id]; }, 3000);
        return;
      }

      agentInstalling.value = id;
      agentStatus.value[id] = t('status.installing');

      try {
        const ep = window.unipet;
        if (ep?.installAgent) {
          const result = await ep.installAgent(id);
          if (result?.success) {
            agentStatus.value[id] = t('status.installed');
          } else {
            agentStatus.value[id] = `${t('status.error')}: ${result?.error || 'Unknown'}`;
            settingsStore.enabledAdapters.splice(settingsStore.enabledAdapters.indexOf(id), 1);
          }
        } else {
          agentStatus.value[id] = 'Installed ✓';
        }
      } catch (err) {
        agentStatus.value[id] = `Error: ${(err as Error).message}`;
        settingsStore.enabledAdapters.splice(settingsStore.enabledAdapters.indexOf(id), 1);
      } finally {
        agentInstalling.value = null;
        setTimeout(() => { delete agentStatus.value[id]; }, 8000);
      }
    } else {
      if (!needsInstall) {
        settingsStore.enabledAdapters.splice(idx, 1);
        agentStatus.value[id] = t('status.disabled');
        setTimeout(() => { delete agentStatus.value[id]; }, 2000);
        return;
      }

      agentInstalling.value = id;
      agentStatus.value[id] = t('status.installing');

      try {
        const ep = window.unipet;
        if (ep?.uninstallAgent) {
          const result = await ep.uninstallAgent(id);
          if (result?.success) {
            settingsStore.enabledAdapters.splice(idx, 1);
            agentStatus.value[id] = t('status.disabled');
          } else {
            agentStatus.value[id] = `${t('status.error')}: ${result?.error || 'Unknown'}`;
          }
        } else {
          settingsStore.enabledAdapters.splice(idx, 1);
          agentStatus.value[id] = t('status.disabled');
        }
      } catch (err) {
        agentStatus.value[id] = `Error: ${(err as Error).message}`;
      } finally {
        agentInstalling.value = null;
        setTimeout(() => { delete agentStatus.value[id]; }, 8000);
      }
    }
  }

  return {
    agents: AGENT_DEFINITIONS,
    filteredAgents,
    expandedAgent,
    agentInstalling,
    agentStatus,
    isAgentEnabled,
    toggleAgent,
  };
}
