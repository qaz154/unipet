<script setup lang="ts">
/**
 * UniPet Settings — macOS Sequoia inspired redesign
 *
 * Layout:
 *   ┌─ titlebar (search + mode toggle + collapse) ─┐
 *   ├ sidebar │ scrollable settings list │ preview ┤
 *   └─────────────────────────────────────────────┘
 */

import { ref, computed, onMounted, watch } from 'vue';
import { usePetStore } from '../../stores/pet';
import { useSettingsStore } from '../../stores/settings';
import { useTheme } from '../../composables/useTheme';
import { useI18n } from '../../composables/useI18n';
import { useColorMode } from '../../composables/useColorMode';
import { useSettingsSearch, type TabId } from '../../composables/useSettingsSearch';
import { useAgents } from '../../composables/useAgents';
import { usePetPreview } from '../../composables/usePetPreview';
import { PET_CHARACTERS, PW, PH } from '../../lib/pet-characters';
import SettingsAgentList from './components/SettingsAgentList.vue';
import SettingsPreview from './components/SettingsPreview.vue';
import SettingsSidebar from './components/SettingsSidebar.vue';

const APP_VERSION = __UNIPET_VERSION__;

const petStore = usePetStore();
const settingsStore = useSettingsStore();
const getEp = () => window.unipet;
useTheme();
const { t, setLocale, getLocale, getAvailableLocales, loadLocale } = useI18n();

function onLocaleChange(value: string) {
  const available = getAvailableLocales().map((l) => l.code as string);
  if (available.includes(value)) {
    setLocale(value as never);
  }
}

onMounted(() => loadLocale());

// ─── Composables ──────────────────────────────────────────
const { resolvedMode } = useColorMode(() => settingsStore.colorMode);

const activeTab = ref<TabId>('general');

const tabs = computed(() => [
  { id: 'general' as TabId, icon: '⚙', label: t('settings.general') },
  { id: 'appearance' as TabId, icon: '🎨', label: t('settings.themes') },
  { id: 'behavior' as TabId, icon: '⚡', label: t('settings.behavior') },
  { id: 'agents' as TabId, icon: '🔗', label: t('settings.agents') },
  { id: 'about' as TabId, icon: 'ⓘ', label: t('settings.about') },
]);

const {
  search, matchesSearch, anyMatchAcrossTabs,
  generalRows, showGeneralLanguage, appearanceRows, behaviorRows, isTabVisible,
} = useSettingsSearch({
  t,
  activeTab,
  getFilteredAgentsCount: () => filteredAgents.value.length,
});

const {
  filteredAgents, expandedAgent, agentInstalling, agentStatus,
  isAgentEnabled, toggleAgent,
} = useAgents({ matchesSearch, t });

const currentPetId = computed(() => petStore.themeId);
function selectPet(id: string) { petStore.themeId = id; }

const { previewCanvas, previewChar, resetTimestamp } = usePetPreview(
  () => currentPetId.value,
);

watch(resolvedMode, () => { resetTimestamp(); });
</script>

<template>
  <div class="settings-app" :data-mode="resolvedMode" :class="{ collapsed: settingsStore.sidebarCollapsed }">
    <!-- ═══ Title bar ═══ -->
    <header class="titlebar">
      <div class="titlebar-window-controls">
        <button class="win-ctrl close-btn" @click="getEp()?.windowClose()" title="Close">
          <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
        </button>
        <button class="win-ctrl min-btn" @click="getEp()?.windowMinimize()" title="Minimize">
          <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 5h8" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
        </button>
        <button class="win-ctrl max-btn" @click="getEp()?.windowMaximize()" title="Maximize">
          <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1.4" fill="none" rx="1"/></svg>
        </button>
      </div>
      <button
        class="titlebar-collapse"
        @click="settingsStore.sidebarCollapsed = !settingsStore.sidebarCollapsed"
        :title="settingsStore.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            :d="settingsStore.sidebarCollapsed
              ? 'M5 3l5 5-5 5'
              : 'M11 3l-5 5 5 5'"
            fill="none" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="titlebar-search">
        <svg class="search-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M10.5 10.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <input
          v-model="search"
          class="search-input"
          type="search"
          placeholder="Search settings"
          spellcheck="false"
        />
        <kbd v-if="!search" class="search-kbd">⌘F</kbd>
        <button v-else class="search-clear" @click="search = ''" aria-label="Clear">×</button>
      </div>
      <div class="titlebar-mode" role="radiogroup" aria-label="Color mode">
        <button
          v-for="m in (['auto','light','dark'] as const)" :key="m"
          :class="['mode-pill', { active: settingsStore.colorMode === m }]"
          @click="settingsStore.colorMode = m"
          :title="m"
        >
          <span v-if="m === 'auto'">A</span>
          <span v-else-if="m === 'light'">☀</span>
          <span v-else>☾</span>
        </button>
      </div>
    </header>

    <div class="body">
      <!-- ═══ Sidebar ═══ -->
      <SettingsSidebar
        v-model:active-tab="activeTab"
        :tabs="tabs"
        :is-tab-visible="isTabVisible"
        :version="APP_VERSION"
      />

      <!-- ═══ Main content ═══ -->
      <main class="content">
        <!-- ─── General ─── -->
        <section v-if="activeTab === 'general' || anyMatchAcrossTabs" v-show="isTabVisible('general')" class="tab-content">
          <h1 v-if="activeTab === 'general'">{{ t('settings.general') }}</h1>

          <div v-if="showGeneralLanguage" class="section-title">{{ t('settings.language') }}</div>
          <div v-if="showGeneralLanguage" class="card">
            <div v-if="generalRows.language" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.language') }}</span>
                <span class="row-desc">{{ t('settings.languageDesc') }}</span>
              </div>
              <div class="row-control">
                <select :value="getLocale()" class="select-input"
                  @change="onLocaleChange(($event.target as HTMLSelectElement).value)">
                  <option v-for="loc in getAvailableLocales()" :key="loc.code" :value="loc.code">{{ loc.flag }} {{ loc.name }}</option>
                </select>
              </div>
            </div>
            <div v-if="generalRows.colorMode" class="row">
              <div class="row-text">
                <span class="row-label">Appearance</span>
                <span class="row-desc">Match system, or pick light / dark explicitly</span>
              </div>
              <div class="row-control">
                <div class="segmented">
                  <button :class="{ active: settingsStore.colorMode === 'auto' }" @click="settingsStore.colorMode = 'auto'">Auto</button>
                  <button :class="{ active: settingsStore.colorMode === 'light' }" @click="settingsStore.colorMode = 'light'">Light</button>
                  <button :class="{ active: settingsStore.colorMode === 'dark' }" @click="settingsStore.colorMode = 'dark'">Dark</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="generalRows.alwaysOnTop || generalRows.edgeSnapping || generalRows.screenPrivacy" class="section-title">{{ t('settings.desktop') }}</div>
          <div v-if="generalRows.alwaysOnTop || generalRows.edgeSnapping || generalRows.screenPrivacy" class="card">
            <div v-if="generalRows.alwaysOnTop" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.alwaysOnTop') }}</span>
                <span class="row-desc">{{ t('settings.alwaysOnTopDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.alwaysOnTop }]" @click="settingsStore.alwaysOnTop = !settingsStore.alwaysOnTop"><span class="switch-knob" /></button>
              </div>
            </div>
            <div v-if="generalRows.edgeSnapping" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.edgeSnapping') }}</span>
                <span class="row-desc">{{ t('settings.edgeSnappingDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.edgeSnapping }]" @click="settingsStore.edgeSnapping = !settingsStore.edgeSnapping"><span class="switch-knob" /></button>
              </div>
            </div>
            <div v-if="generalRows.screenPrivacy" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.screenPrivacy') }}</span>
                <span class="row-desc">{{ t('settings.screenPrivacyDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.screenPrivacy }]" @click="settingsStore.screenPrivacy = !settingsStore.screenPrivacy"><span class="switch-knob" /></button>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Appearance ─── -->
        <section v-if="activeTab === 'appearance' || anyMatchAcrossTabs" v-show="isTabVisible('appearance')" class="tab-content">
          <h1 v-if="activeTab === 'appearance'">{{ t('settings.appearance') }}</h1>

          <div v-if="appearanceRows.character" class="section-title">{{ t('settings.petCharacter') }}</div>
          <div v-if="appearanceRows.character" class="theme-grid">
            <button
              v-for="pet in PET_CHARACTERS" :key="pet.id"
              :class="['theme-card', { active: currentPetId === pet.id }]"
              @click="selectPet(pet.id)"
            >
              <div class="theme-preview"><span class="theme-emoji">{{ pet.emoji }}</span></div>
              <div class="theme-info">
                <span class="theme-name">{{ pet.name }}</span>
                <span class="theme-renderer">24×32 pixel art</span>
              </div>
              <span v-if="currentPetId === pet.id" class="theme-active-badge">✓ Active</span>
            </button>
          </div>

          <div v-if="appearanceRows.scale || appearanceRows.opacity" class="section-title">{{ t('settings.size') }}</div>
          <div v-if="appearanceRows.scale || appearanceRows.opacity" class="card">
            <div v-if="appearanceRows.scale" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.petScale') }}</span>
                <span class="row-desc">{{ t('settings.petScaleDesc') }}</span>
              </div>
              <div class="row-control">
                <div class="slider-group">
                  <input v-model.number="petStore.scale" type="range" min="0.5" max="3.0" step="0.1" class="range-input" :style="{ '--fill': `${((petStore.scale - 0.5) / 2.5) * 100}%` }" />
                  <span class="slider-value">{{ Math.round(petStore.scale * 100) }}%</span>
                </div>
              </div>
            </div>
            <div v-if="appearanceRows.opacity" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.opacity') }}</span>
                <span class="row-desc">{{ t('settings.opacityDesc') }}</span>
              </div>
              <div class="row-control">
                <div class="slider-group">
                  <input v-model.number="petStore.opacity" type="range" min="0.1" max="1.0" step="0.05" class="range-input" :style="{ '--fill': `${((petStore.opacity - 0.1) / 0.9) * 100}%` }" />
                  <span class="slider-value">{{ Math.round(petStore.opacity * 100) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Behavior ─── -->
        <section v-if="activeTab === 'behavior' || anyMatchAcrossTabs" v-show="isTabVisible('behavior')" class="tab-content">
          <h1 v-if="activeTab === 'behavior'">{{ t('settings.behavior') }}</h1>

          <div v-if="behaviorRows.clickReactions || behaviorRows.drag || behaviorRows.sound || behaviorRows.hideBubbles" class="section-title">{{ t('settings.interaction') }}</div>
          <div v-if="behaviorRows.clickReactions || behaviorRows.drag || behaviorRows.sound || behaviorRows.hideBubbles" class="card">
            <div v-if="behaviorRows.clickReactions" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.clickReactions') }}</span>
                <span class="row-desc">{{ t('settings.clickReactionsDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.clickReactions }]" @click="settingsStore.clickReactions = !settingsStore.clickReactions"><span class="switch-knob" /></button>
              </div>
            </div>
            <div v-if="behaviorRows.drag" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.dragToMove') }}</span>
                <span class="row-desc">{{ t('settings.dragToMoveDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.dragEnabled }]" @click="settingsStore.dragEnabled = !settingsStore.dragEnabled"><span class="switch-knob" /></button>
              </div>
            </div>
            <div v-if="behaviorRows.sound" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.soundEffects') }}</span>
                <span class="row-desc">{{ t('settings.soundEffectsDesc') }}</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.soundEnabled }]" @click="settingsStore.soundEnabled = !settingsStore.soundEnabled"><span class="switch-knob" /></button>
              </div>
            </div>
            <div v-if="behaviorRows.hideBubbles" class="row">
              <div class="row-text">
                <span class="row-label">Hide speech bubbles</span>
                <span class="row-desc">Suppress all chat bubbles regardless of agent activity</span>
              </div>
              <div class="row-control">
                <button :class="['switch', { on: settingsStore.hideBubbles }]" @click="settingsStore.hideBubbles = !settingsStore.hideBubbles"><span class="switch-knob" /></button>
              </div>
            </div>
          </div>

          <div v-if="behaviorRows.sleepSeq || behaviorRows.idleTimeout" class="section-title">{{ t('settings.sleep') }}</div>
          <div v-if="behaviorRows.sleepSeq || behaviorRows.idleTimeout" class="card">
            <div v-if="behaviorRows.sleepSeq" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.sleepSequence') }}</span>
              </div>
              <div class="row-control">
                <select v-model="settingsStore.sleepSequence" class="select-input">
                  <option value="full">{{ t('settings.sleepFull') }}</option>
                  <option value="direct">{{ t('settings.sleepDirect') }}</option>
                </select>
              </div>
            </div>
            <div v-if="behaviorRows.idleTimeout" class="row">
              <div class="row-text">
                <span class="row-label">{{ t('settings.idleTimeout') }}</span>
                <span class="row-desc">{{ t('settings.idleTimeoutDesc') }}</span>
              </div>
              <div class="row-control">
                <div class="slider-group">
                  <input v-model.number="settingsStore.idleTimeoutMs" type="range" min="60000" max="1800000" step="60000" class="range-input" :style="{ '--fill': `${((settingsStore.idleTimeoutMs - 60000) / 1740000) * 100}%` }" />
                  <span class="slider-value">{{ Math.round(settingsStore.idleTimeoutMs / 60000) }}m</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SettingsAgentList
          v-if="activeTab === 'agents' || anyMatchAcrossTabs"
          v-show="isTabVisible('agents')"
          v-model:expanded-agent="expandedAgent"
          :title="t('settings.agents')"
          :agents="filteredAgents"
          :agent-installing="agentInstalling"
          :agent-status="agentStatus"
          :search="search"
          :is-agent-enabled="isAgentEnabled"
          @toggle-agent="toggleAgent"
        />

        <!-- ─── About ─── -->
        <section v-if="activeTab === 'about'" v-show="isTabVisible('about')" class="tab-content">
          <h1>About</h1>
          <div class="card about-card">
            <div class="about-logo">🐾</div>
            <div class="about-name">UniPet</div>
            <div class="about-version">Version {{ APP_VERSION }}</div>
            <div class="about-desc">A unified desktop pet framework for AI coding agents.</div>
          </div>
        </section>
      </main>

      <!-- ═══ Live preview ═══ -->
      <SettingsPreview
        v-model:preview-canvas="previewCanvas"
        :opacity="petStore.opacity"
        :scale="petStore.scale"
        :preview-char="previewChar"
        :canvas-width="PW"
        :canvas-height="PH"
      />
    </div>
  </div>
</template>

<style scoped src="./settings.css"></style>
