<script setup lang="ts">
import type { TabId } from '../../../composables/useSettingsSearch';

interface SettingsTab {
  id: TabId;
  icon: string;
  label: string;
}

interface Props {
  tabs: SettingsTab[];
  activeTab: TabId;
  isTabVisible: (tabId: TabId) => boolean;
  version: string;
}

interface Emits {
  'update:activeTab': [tabId: TabId];
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-brand">
      <span class="sidebar-logo">🐾</span>
      <span class="sidebar-title">UniPet</span>
    </div>
    <div class="sidebar-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        v-show="isTabVisible(tab.id)"
        :class="['sidebar-tab', { active: activeTab === tab.id }]"
        :title="tab.label"
        @click="$emit('update:activeTab', tab.id)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
    <div class="sidebar-footer">
      <span class="sidebar-version">v{{ version }}</span>
    </div>
  </nav>
</template>
