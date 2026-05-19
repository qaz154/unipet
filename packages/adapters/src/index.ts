export {
  BaseAdapter,
  type AgentAdapter,
  type AgentCapabilities,
  type AdapterConfig,
  type AdapterContext,
  type HealthStatus,
} from './adapter.js';

export { AdapterRegistry } from './registry.js';
export { ClaudeCodeAdapter } from './claude-code/adapter.js';
export { MCPAdapter, type MCPAdapterConfig } from './mcp/adapter.js';
export { HTTPAdapter, type HTTPAdapterConfig } from './http/adapter.js';
export { GitAdapter, type GitAdapterConfig } from './git/adapter.js';
export { PerceptionAdapter, type PerceptionConfig } from './perception/adapter.js';

export {
  HookBasedAdapter,
  BUILTIN_AGENTS,
  createBuiltinAdapters,
  getAgentDefinition,
  listAgentIds,
  type AgentDefinition,
} from './agents.js';

export {
  PluginLoader,
  type PluginManifest,
  type LoadedPlugin,
  getDefaultPluginDirs,
} from './plugin-system.js';
