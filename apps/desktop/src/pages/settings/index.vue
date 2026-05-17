<script setup lang="ts">
/**
 * UniPet Settings — macOS Sequoia inspired redesign
 *
 * Layout:
 *   ┌─ titlebar (search + mode toggle + collapse) ─┐
 *   ├ sidebar │ scrollable settings list │ preview ┤
 *   └─────────────────────────────────────────────┘
 *
 * Features:
 * - Top search bar filters rows by label/desc match
 * - Collapsible sidebar (icon-only / labelled)
 * - Live pet preview canvas reflecting scale/opacity/theme
 * - Light / dark / auto color mode
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePetStore } from '../../stores/pet';
import { useSettingsStore } from '../../stores/settings';
import { useTheme } from '../../composables/useTheme';
import { useI18n } from '../../composables/useI18n';
import {
  PET_CHARACTERS,
  PW,
  PH,
  renderGrid,
  type PetCharacter,
} from '../../lib/pet-characters';

const petStore = usePetStore();
const settingsStore = useSettingsStore();
// Dynamic getter for window.unipet to avoid stale references
const getEp = () => window.unipet;
// Side-effect: registers built-in theme.json files with the shared ThemeLoader.
useTheme();
const { t, setLocale, getLocale, getAvailableLocales, loadLocale } = useI18n();

function onLocaleChange(value: string) {
  // Narrow the raw string from the <select> back into the Locale union.
  const available = getAvailableLocales().map((l) => l.code as string);
  if (available.includes(value)) {
    setLocale(value as never);
  }
}

onMounted(() => loadLocale());

// ─── Color mode ────────────────────────────────────────────
const prefersLight = ref(false);
let mql: MediaQueryList | null = null;
function syncSystemColor(e?: MediaQueryListEvent) {
  prefersLight.value = e
    ? !e.matches
    : !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const resolvedMode = computed<'light' | 'dark'>(() => {
  if (settingsStore.colorMode === 'light') return 'light';
  if (settingsStore.colorMode === 'dark') return 'dark';
  return prefersLight.value ? 'light' : 'dark';
});

onMounted(() => {
  mql = window.matchMedia('(prefers-color-scheme: dark)');
  syncSystemColor();
  mql.addEventListener?.('change', syncSystemColor as never);
});
onUnmounted(() => {
  mql?.removeEventListener?.('change', syncSystemColor as never);
});

// ─── Tabs ──────────────────────────────────────────────────
type TabId = 'general' | 'appearance' | 'behavior' | 'agents' | 'about';
const activeTab = ref<TabId>('general');

const tabs = computed(() => [
  { id: 'general' as TabId, icon: '⚙', label: t('settings.general') },
  { id: 'appearance' as TabId, icon: '🎨', label: t('settings.themes') },
  { id: 'behavior' as TabId, icon: '⚡', label: t('settings.behavior') },
  { id: 'agents' as TabId, icon: '🔗', label: t('settings.agents') },
  { id: 'about' as TabId, icon: 'ⓘ', label: t('settings.about') },
]);

// ─── Search filter ─────────────────────────────────────────
const search = ref('');
const normalizedSearch = computed(() => search.value.trim().toLowerCase());

function matchesSearch(...fields: (string | undefined)[]): boolean {
  if (!normalizedSearch.value) return true;
  return fields.some((f) => f && f.toLowerCase().includes(normalizedSearch.value));
}

const anyMatchAcrossTabs = computed(() => normalizedSearch.value.length > 0);

// ─── Pets ──────────────────────────────────────────────────
const currentPetId = computed(() => petStore.themeId);
function selectPet(id: string) { petStore.themeId = id; }

// ─── Agents ────────────────────────────────────────────────
const agents = [
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
const filteredAgents = computed(() =>
  agents.filter((a) => matchesSearch(a.name, a.desc, a.id, a.badge)),
);
const expandedAgent = ref<string | null>(null);
const agentInstalling = ref<string | null>(null);
const agentStatus = ref<Record<string, string>>({});

function isAgentEnabled(id: string) { return settingsStore.enabledAdapters.includes(id); }

async function toggleAgent(id: string) {
  const idx = settingsStore.enabledAdapters.indexOf(id);
  const enabling = idx === -1;
  const agent = agents.find((a) => a.id === id);
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
    settingsStore.enabledAdapters.splice(idx, 1);
    agentStatus.value[id] = t('status.disabled');
    setTimeout(() => { delete agentStatus.value[id]; }, 2000);
  }
}

// ─── Live pet preview ──────────────────────────────────────
const previewCanvas = ref<HTMLCanvasElement | null>(null);
let previewCtx: CanvasRenderingContext2D | null = null;
let previewBreath = 0;
let previewBlink = 0;
let isBlinking = false;
let previewRaf: number | null = null;
let lastTs = 0;

const previewChar = computed<PetCharacter>(() => {
  return PET_CHARACTERS.find((c) => c.id === currentPetId.value) ?? PET_CHARACTERS[0];
});

function drawPreview(dt: number) {
  if (!previewCtx || !previewCanvas.value) return;
  previewBreath += dt * 0.8;
  previewBlink += dt;
  if (!isBlinking && previewBlink > 3 + Math.random() * 3) {
    isBlinking = true;
    previewBlink = 0;
  } else if (isBlinking && previewBlink > 0.18) {
    isBlinking = false;
    previewBlink = 0;
  }

  previewCtx.clearRect(0, 0, PW, PH);
  const ch = previewChar.value;
  const eyes = ch.eyes('idle', isBlinking);
  const face = ch.face('idle', null);
  renderGrid(previewCtx, ch.sprite(), eyes, face, previewBreath, 0, 1, 1, 0, 0);
}

function loopPreview(ts: number) {
  if (lastTs === 0) lastTs = ts;
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  drawPreview(dt);
  previewRaf = requestAnimationFrame(loopPreview);
}

onMounted(async () => {
  await nextTick();
  if (previewCanvas.value) {
    previewCtx = previewCanvas.value.getContext('2d');
    if (previewCtx) {
      previewCtx.imageSmoothingEnabled = false;
      previewRaf = requestAnimationFrame(loopPreview);
    }
  }
});

onUnmounted(() => {
  if (previewRaf !== null) cancelAnimationFrame(previewRaf);
});

// Refresh canvas tints when color mode changes (the canvas background is CSS-driven)
watch(resolvedMode, () => { lastTs = 0; });

// ─── Section visibility helpers ───────────────────────────
const generalRows = computed(() => ({
  language: matchesSearch(t('settings.language'), t('settings.languageDesc'), 'locale'),
  alwaysOnTop: matchesSearch(t('settings.alwaysOnTop'), t('settings.alwaysOnTopDesc')),
  edgeSnapping: matchesSearch(t('settings.edgeSnapping'), t('settings.edgeSnappingDesc')),
  screenPrivacy: matchesSearch(t('settings.screenPrivacy'), t('settings.screenPrivacyDesc')),
  colorMode: matchesSearch('Color mode', '外观模式', 'dark', 'light', 'auto'),
}));
const showGeneralLanguage = computed(() => Object.values(generalRows.value).some(Boolean));

const appearanceRows = computed(() => ({
  character: matchesSearch(t('settings.petCharacter'), 'pet', 'character'),
  scale: matchesSearch(t('settings.petScale'), t('settings.petScaleDesc'), 'size', 'scale'),
  opacity: matchesSearch(t('settings.opacity'), t('settings.opacityDesc'), 'transparency'),
}));

const behaviorRows = computed(() => ({
  clickReactions: matchesSearch(t('settings.clickReactions'), t('settings.clickReactionsDesc')),
  drag: matchesSearch(t('settings.dragToMove'), t('settings.dragToMoveDesc')),
  sound: matchesSearch(t('settings.soundEffects'), t('settings.soundEffectsDesc')),
  sleepSeq: matchesSearch(t('settings.sleepSequence'), 'sleep'),
  idleTimeout: matchesSearch(t('settings.idleTimeout'), t('settings.idleTimeoutDesc')),
  hideBubbles: matchesSearch('Hide bubbles', '隐藏气泡', 'bubble'),
}));

function isTabVisible(tab: TabId): boolean {
  if (!normalizedSearch.value) return true;
  if (tab === 'general') return Object.values(generalRows.value).some(Boolean);
  if (tab === 'appearance') return Object.values(appearanceRows.value).some(Boolean);
  if (tab === 'behavior') return Object.values(behaviorRows.value).some(Boolean);
  if (tab === 'agents') return filteredAgents.value.length > 0;
  if (tab === 'about') return matchesSearch('about', 'version', '版本');
  return false;
}

// Auto-switch to first matching tab when search activates
watch(normalizedSearch, (q) => {
  if (!q) return;
  const order: TabId[] = ['general', 'appearance', 'behavior', 'agents', 'about'];
  const first = order.find(isTabVisible);
  if (first) activeTab.value = first;
});
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
      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-logo">🐾</span>
          <span class="sidebar-title">UniPet</span>
        </div>
        <div class="sidebar-tabs">
          <button
            v-for="tab in tabs" :key="tab.id"
            v-show="isTabVisible(tab.id)"
            :class="['sidebar-tab', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
            :title="tab.label"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
        <div class="sidebar-footer">
          <span class="sidebar-version">v0.1.0</span>
        </div>
      </nav>

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

        <!-- ─── Agents ─── -->
        <section v-if="activeTab === 'agents' || anyMatchAcrossTabs" v-show="isTabVisible('agents')" class="tab-content">
          <h1 v-if="activeTab === 'agents'">{{ t('settings.agents') }}</h1>
          <div class="card">
            <template v-for="agent in filteredAgents" :key="agent.id">
              <div class="row agent-row">
                <div class="row-text" @click="expandedAgent = expandedAgent === agent.id ? null : agent.id">
                  <div class="agent-header">
                    <span class="agent-name">{{ agent.name }}</span>
                    <span :class="['agent-badge', agent.badge]">{{ agent.badge }}</span>
                    <span v-if="agent.hasPerm" class="agent-badge perm">perm</span>
                  </div>
                  <span class="row-desc">{{ agent.desc }}</span>
                </div>
                <div class="row-control">
                  <button :class="['switch', { on: isAgentEnabled(agent.id), busy: agentInstalling === agent.id }]" @click="toggleAgent(agent.id)"><span class="switch-knob" /></button>
                </div>
              </div>
              <div v-if="expandedAgent === agent.id" class="agent-detail">
                <div class="detail-row"><span class="detail-label">Status</span><span :class="['detail-value', isAgentEnabled(agent.id) ? 'on' : 'off']">{{ agentStatus[agent.id] || (isAgentEnabled(agent.id) ? 'Enabled' : 'Disabled') }}</span></div>
                <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">{{ agent.badge }}</span></div>
              </div>
            </template>
            <div v-if="filteredAgents.length === 0" class="empty-state">No agents match "{{ search }}"</div>
          </div>
        </section>

        <!-- ─── About ─── -->
        <section v-if="activeTab === 'about'" v-show="isTabVisible('about')" class="tab-content">
          <h1>About</h1>
          <div class="card about-card">
            <div class="about-logo">🐾</div>
            <div class="about-name">UniPet</div>
            <div class="about-version">Version 0.1.0</div>
            <div class="about-desc">A unified desktop pet framework for AI coding agents.</div>
          </div>
        </section>
      </main>

      <!-- ═══ Live preview ═══ -->
      <aside class="preview">
        <div class="preview-stage" :style="{ opacity: petStore.opacity }">
          <canvas
            ref="previewCanvas"
            :width="PW" :height="PH"
            :style="{
              width: `${PW * 4 * Math.min(petStore.scale, 1.6)}px`,
              height: `${PH * 4 * Math.min(petStore.scale, 1.6)}px`,
            }"
          />
        </div>
        <div class="preview-meta">
          <div class="preview-meta-label">Live preview</div>
          <div class="preview-meta-name">{{ previewChar.emoji }} {{ previewChar.name }}</div>
          <div class="preview-meta-stats">
            <span>{{ Math.round(petStore.scale * 100) }}%</span>
            <span class="preview-dot">·</span>
            <span>{{ Math.round(petStore.opacity * 100) }}% opacity</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ─── Color tokens ──────────────────────────────────────── */
.settings-app[data-mode='dark'] {
  --bg: #1c1c1f;
  --bg-elevated: rgba(36,36,40,0.86);
  --titlebar-bg: rgba(28,28,31,0.78);
  --sidebar-bg: rgba(20,20,23,0.72);
  --card-bg: rgba(255,255,255,0.035);
  --card-border: rgba(255,255,255,0.07);
  --hairline: rgba(255,255,255,0.05);
  --text-primary: #f4f4f5;
  --text-secondary: #a8a8b0;
  --text-tertiary: #6c6c75;
  --input-bg: rgba(255,255,255,0.04);
  --input-border: rgba(255,255,255,0.08);
  --switch-off: #3f3f46;
  --hover-bg: rgba(255,255,255,0.045);
  --accent: #ff8a65;
  --accent-soft: rgba(255,138,101,0.14);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.32);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.28);
  color-scheme: dark;
}
.settings-app[data-mode='light'] {
  --bg: #f5f5f7;
  --bg-elevated: rgba(255,255,255,0.88);
  --titlebar-bg: rgba(245,245,247,0.84);
  --sidebar-bg: rgba(247,247,250,0.74);
  --card-bg: rgba(255,255,255,0.94);
  --card-border: rgba(0,0,0,0.06);
  --hairline: rgba(0,0,0,0.06);
  --text-primary: #1d1d1f;
  --text-secondary: #555562;
  --text-tertiary: #86868b;
  --input-bg: #ffffff;
  --input-border: rgba(0,0,0,0.08);
  --switch-off: #d4d4d8;
  --hover-bg: rgba(0,0,0,0.04);
  --accent: #d97757;
  --accent-soft: rgba(217,119,87,0.14);
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 6px 22px rgba(0,0,0,0.08);
  color-scheme: light;
}

/* ─── Frame ─────────────────────────────────────────────── */
.settings-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable",
               "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  font-feature-settings: "ss01", "cv01";
  -webkit-font-smoothing: antialiased;
  user-select: none;
  overflow: hidden;
}

/* ─── Titlebar ──────────────────────────────────────────── */
.titlebar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--titlebar-bg);
  backdrop-filter: saturate(140%) blur(20px);
  -webkit-backdrop-filter: saturate(140%) blur(20px);
  border-bottom: 1px solid var(--hairline);
  -webkit-app-region: drag;
}
.titlebar-collapse,
.titlebar-mode,
.titlebar-search,
.titlebar-window-controls { -webkit-app-region: no-drag; }

.titlebar-window-controls {
  display: flex; gap: 4px;
}
.win-ctrl {
  width: 14px; height: 14px;
  border: none; border-radius: 50%;
  cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s;
}
.win-ctrl.close-btn { background: #ff5f57; color: rgba(0,0,0,0.5); }
.win-ctrl.min-btn { background: #febc2e; color: rgba(0,0,0,0.5); }
.win-ctrl.max-btn { background: #28c840; color: rgba(0,0,0,0.5); }
.win-ctrl:hover { filter: brightness(1.15); }
.win-ctrl svg { display: block; }

.titlebar-collapse {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: none; background: transparent;
  border-radius: 6px; cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
}
.titlebar-collapse:hover { background: var(--hover-bg); color: var(--text-primary); }

.titlebar-search {
  flex: 1;
  display: flex; align-items: center; gap: 6px;
  max-width: 480px;
  padding: 5px 10px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.titlebar-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search-icon { color: var(--text-tertiary); flex-shrink: 0; }
.search-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: var(--text-primary); font-size: 13px;
  font-family: inherit;
}
.search-input::placeholder { color: var(--text-tertiary); }
.search-input::-webkit-search-cancel-button { display: none; }
.search-kbd {
  font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 1px 5px; border-radius: 3px;
  background: var(--hover-bg);
  color: var(--text-tertiary);
}
.search-clear {
  width: 16px; height: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: var(--switch-off); color: var(--text-primary);
  cursor: pointer; font-size: 12px; line-height: 1;
  padding: 0;
}

.titlebar-mode { display: flex; padding: 2px; background: var(--input-bg); border-radius: 8px; border: 1px solid var(--input-border); }
.mode-pill {
  width: 26px; height: 22px;
  border: none; background: transparent;
  border-radius: 6px; cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.mode-pill:hover { color: var(--text-primary); }
.mode-pill.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* ─── Body layout ───────────────────────────────────────── */
.body {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  flex: 1;
  min-height: 0;
  transition: grid-template-columns 0.24s cubic-bezier(0.4,0,0.2,1);
}
.settings-app.collapsed .body { grid-template-columns: 64px 1fr 260px; }

@media (max-width: 880px) {
  .body { grid-template-columns: 220px 1fr; }
  .settings-app.collapsed .body { grid-template-columns: 64px 1fr; }
  .preview { display: none; }
}

/* ─── Sidebar ───────────────────────────────────────────── */
.sidebar {
  display: flex; flex-direction: column;
  background: var(--sidebar-bg);
  backdrop-filter: saturate(140%) blur(18px);
  -webkit-backdrop-filter: saturate(140%) blur(18px);
  border-right: 1px solid var(--hairline);
  overflow: hidden;
}
.sidebar-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 16px 14px;
  white-space: nowrap; overflow: hidden;
}
.sidebar-logo { font-size: 22px; }
.sidebar-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.collapsed .sidebar-title { opacity: 0; }
.collapsed .sidebar-brand { padding-left: 21px; }

.sidebar-tabs { flex: 1; padding: 4px 8px; display: flex; flex-direction: column; gap: 2px; }
.sidebar-tab {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px;
  border: none; background: transparent;
  color: var(--text-secondary);
  font-size: 13px; font-weight: 500;
  border-radius: 7px; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap; overflow: hidden;
}
.sidebar-tab:hover { background: var(--hover-bg); color: var(--text-primary); }
.sidebar-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.tab-icon { font-size: 15px; width: 20px; flex-shrink: 0; text-align: center; }
.tab-label { transition: opacity 0.15s; }
.collapsed .tab-label { opacity: 0; pointer-events: none; }

.sidebar-footer { padding: 14px 16px; border-top: 1px solid var(--hairline); white-space: nowrap; overflow: hidden; }
.sidebar-version { font-size: 11px; color: var(--text-tertiary); }
.collapsed .sidebar-version { opacity: 0; }

/* ─── Content ───────────────────────────────────────────── */
.content {
  overflow-y: auto;
  padding: 22px 28px 28px;
  scroll-behavior: smooth;
}
.content::-webkit-scrollbar { width: 8px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
.content::-webkit-scrollbar-thumb:hover { background: var(--input-border); background-clip: padding-box; }

.tab-content > h1 {
  font-size: 24px; font-weight: 700;
  margin: 0 0 22px;
  letter-spacing: -0.02em;
}
.section-title {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin: 22px 0 8px;
  padding: 0 4px;
}

/* ─── Cards (sections) ──────────────────────────────────── */
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--hairline);
  transition: background 0.12s;
}
.row:last-child { border-bottom: none; }
.row:hover { background: var(--hover-bg); }

.row-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; cursor: default; }
.row-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.row-desc { font-size: 11.5px; color: var(--text-tertiary); line-height: 1.4; }
.row-control { flex-shrink: 0; margin-left: 16px; }

/* ─── Switch ────────────────────────────────────────────── */
.switch {
  position: relative; width: 38px; height: 22px;
  border: none; border-radius: 999px;
  background: var(--switch-off); cursor: pointer;
  transition: background 0.24s cubic-bezier(0.2,0.8,0.2,1);
  padding: 0;
}
.switch.on { background: var(--accent); }
.switch.busy { opacity: 0.6; pointer-events: none; }
.switch-knob {
  position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  transition: transform 0.24s cubic-bezier(0.2,0.8,0.2,1);
}
.switch.on .switch-knob { transform: translateX(16px); }

/* ─── Slider ────────────────────────────────────────────── */
.slider-group { display: flex; align-items: center; gap: 10px; }
.range-input {
  -webkit-appearance: none;
  width: 150px; height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, var(--accent) 0%, var(--accent) var(--fill), var(--switch-off) var(--fill), var(--switch-off) 100%);
  outline: none; cursor: pointer;
}
.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff;
  border: 0.5px solid rgba(0,0,0,0.18);
  box-shadow: 0 1px 4px rgba(0,0,0,0.22);
  cursor: pointer;
}
.slider-value {
  font-size: 12px; font-weight: 600;
  color: var(--accent); min-width: 38px; text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ─── Segmented control ─────────────────────────────────── */
.segmented {
  display: inline-flex; padding: 2px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
}
.segmented button {
  padding: 4px 12px;
  border: none; background: transparent;
  color: var(--text-secondary);
  font-size: 12px; font-weight: 500;
  border-radius: 6px; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.segmented button:hover { color: var(--text-primary); }
.segmented button.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

/* ─── Select ────────────────────────────────────────────── */
.select-input {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 5px 24px 5px 10px;
  font-size: 12px;
  outline: none; cursor: pointer;
  appearance: none;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="%23999" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.select-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

/* ─── Theme grid ────────────────────────────────────────── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 4px;
}
.theme-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
  text-align: left;
  padding: 0;
  font: inherit;
  color: inherit;
}
.theme-card:hover { transform: translateY(-1px); border-color: var(--accent); box-shadow: var(--shadow-md); }
.theme-card.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.theme-preview {
  aspect-ratio: 1;
  background: linear-gradient(135deg, var(--hover-bg), var(--card-bg));
  display: flex; align-items: center; justify-content: center;
}
.theme-emoji { font-size: 48px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12)); }
.theme-info { padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 2px; }
.theme-name { font-size: 13px; font-weight: 600; }
.theme-renderer { font-size: 11px; color: var(--text-tertiary); }
.theme-active-badge {
  display: block; padding: 0 12px 10px;
  font-size: 11px; font-weight: 600; color: var(--accent);
}

/* ─── Agent rows ────────────────────────────────────────── */
.agent-row .row-text { cursor: pointer; }
.agent-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.agent-name { font-size: 13px; font-weight: 500; }
.agent-badge {
  font-size: 9.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 2px 6px; border-radius: 4px;
  background: var(--hover-bg);
  color: var(--text-tertiary);
}
.agent-badge.hooks { background: rgba(91,142,201,0.18); color: #5b8ec9; }
.agent-badge.plugin { background: rgba(107,143,113,0.18); color: #6b8f71; }
.agent-badge.protocol { background: rgba(212,115,138,0.18); color: #d4738a; }
.agent-badge.perm { background: var(--accent-soft); color: var(--accent); }
.agent-detail {
  padding: 8px 16px 12px 36px;
  background: var(--hover-bg);
  border-bottom: 1px solid var(--hairline);
}
.detail-row { display: flex; justify-content: space-between; padding: 4px 0; }
.detail-label { font-size: 11px; color: var(--text-tertiary); }
.detail-value { font-size: 11px; font-weight: 500; }
.detail-value.on { color: #6b8f71; }
.detail-value.off { color: var(--text-tertiary); }

.empty-state {
  padding: 28px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ─── About card ───────────────────────────────────────── */
.about-card {
  padding: 28px 24px;
  display: flex; flex-direction: column;
  align-items: center; gap: 6px;
  text-align: center;
}
.about-logo { font-size: 56px; margin-bottom: 6px; }
.about-name { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.about-version { font-size: 12px; color: var(--text-tertiary); }
.about-desc { margin-top: 8px; font-size: 12px; color: var(--text-secondary); max-width: 320px; }

/* ─── Preview panel ─────────────────────────────────────── */
.preview {
  background: var(--sidebar-bg);
  backdrop-filter: saturate(140%) blur(18px);
  -webkit-backdrop-filter: saturate(140%) blur(18px);
  border-left: 1px solid var(--hairline);
  padding: 24px 18px;
  display: flex; flex-direction: column;
  align-items: center;
}
.preview-stage {
  width: 100%;
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 80% at 50% 110%, var(--accent-soft), transparent 70%);
  border-radius: 16px;
  margin-bottom: 14px;
  transition: opacity 0.18s;
}
.preview-stage canvas {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 6px 16px rgba(0,0,0,0.18));
  transition: width 0.18s ease, height 0.18s ease;
}
.preview-meta {
  width: 100%;
  padding: 12px 14px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  text-align: center;
}
.preview-meta-label {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.preview-meta-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.preview-meta-stats {
  margin-top: 4px;
  font-size: 11px; color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.preview-dot { margin: 0 6px; color: var(--text-tertiary); }
</style>
