/**
 * OpenCode Plugin for UniPet
 *
 * Config: ~/.config/opencode/opencode.json
 * Register: { "plugin": ["/path/to/hooks/opencode-plugin"] }
 *
 * OpenCode loads plugins as ES module directories.
 * This plugin hooks into tool use events via the OpenCode plugin API.
 */

import { postState, classifyToolState } from '../shared.mjs';

export default {
  name: 'unipet',
  description: 'Desktop pet integration for UniPet',

  onSessionStart() {
    postState('thinking', 'opencode', 'opencode');
  },

  onToolUse(event) {
    const state = classifyToolState(event.tool, event.input);
    postState(state, 'opencode', 'opencode', { tool: event.tool });
  },

  onToolResult(event) {
    if (event.error) {
      postState('error', 'opencode', 'opencode');
    } else {
      postState('working', 'opencode', 'opencode');
    }
  },

  onStop() {
    postState('attention', 'opencode', 'opencode');
  },

  onError() {
    postState('error', 'opencode', 'opencode');
  },
};
