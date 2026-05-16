/**
 * OpenClaw Plugin for UniPet
 *
 * Config: ~/.openclaw/openclaw.json
 * Register: { "plugins": { "load": { "paths": ["/path/to/hooks/openclaw-plugin"] } } }
 */

import { postState, classifyToolState } from '../shared.mjs';

export default {
  name: 'unipet',
  description: 'Desktop pet integration',

  onEvent(event) {
    const type = event.type || '';
    if (type.includes('prompt') || type.includes('session_start')) {
      postState('thinking', 'openclaw', 'openclaw');
    } else if (type.includes('tool')) {
      const state = classifyToolState(event.tool, event.input);
      postState(state, 'openclaw', 'openclaw');
    } else if (type.includes('stop') || type.includes('complete')) {
      postState('attention', 'openclaw', 'openclaw');
    } else if (type.includes('error')) {
      postState('error', 'openclaw', 'openclaw');
    }
  },
};
