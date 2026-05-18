<script setup lang="ts">
import type { Agent } from '../../../composables/useAgents';

interface Props {
  title: string;
  agents: Agent[];
  expandedAgent: string | null;
  agentInstalling: string | null;
  agentStatus: Record<string, string>;
  search: string;
  isAgentEnabled: (agentId: string) => boolean;
}

interface Emits {
  'update:expandedAgent': [agentId: string | null];
  toggleAgent: [agentId: string];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function toggleExpanded(agentId: string): void {
  emit('update:expandedAgent', props.expandedAgent === agentId ? null : agentId);
}
</script>

<template>
  <section class="tab-content">
    <h1>{{ title }}</h1>
    <div class="card">
      <template v-for="agent in agents" :key="agent.id">
        <div class="row agent-row">
          <div class="row-text" @click="toggleExpanded(agent.id)">
            <div class="agent-header">
              <span class="agent-name">{{ agent.name }}</span>
              <span :class="['agent-badge', agent.badge]">{{ agent.badge }}</span>
              <span v-if="agent.hasPerm" class="agent-badge perm">perm</span>
            </div>
            <span class="row-desc">{{ agent.desc }}</span>
          </div>
          <div class="row-control">
            <button
              :class="['switch', { on: isAgentEnabled(agent.id), busy: agentInstalling === agent.id }]"
              @click="$emit('toggleAgent', agent.id)"
            >
              <span class="switch-knob" />
            </button>
          </div>
        </div>
        <div v-if="expandedAgent === agent.id" class="agent-detail">
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span :class="['detail-value', isAgentEnabled(agent.id) ? 'on' : 'off']">
              {{ agentStatus[agent.id] || (isAgentEnabled(agent.id) ? 'Enabled' : 'Disabled') }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Type</span>
            <span class="detail-value">{{ agent.badge }}</span>
          </div>
        </div>
      </template>
      <div v-if="agents.length === 0" class="empty-state">No agents match "{{ search }}"</div>
    </div>
  </section>
</template>
