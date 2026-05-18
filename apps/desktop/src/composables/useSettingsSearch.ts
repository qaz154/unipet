/**
 * Settings search — filtering, row visibility, and auto-tab-switch.
 *
 * Normalises the user's query, exposes a `matchesSearch` helper that
 * other composables can share, and drives per-tab / per-row visibility
 * so the template stays declarative.
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

export type TabId = 'general' | 'appearance' | 'behavior' | 'agents' | 'about';

interface UseSettingsSearchDeps {
  /** Translation function from useI18n */
  t: (key: string) => string;
  /** Currently active sidebar tab (written to on auto-switch) */
  activeTab: Ref<TabId>;
  /** Lazy getter for filtered-agent count (avoids circular dep with useAgents) */
  getFilteredAgentsCount: () => number;
}

interface UseSettingsSearchReturn {
  search: Ref<string>;
  normalizedSearch: ComputedRef<string>;
  matchesSearch: (...fields: (string | undefined)[]) => boolean;
  anyMatchAcrossTabs: ComputedRef<boolean>;
  generalRows: ComputedRef<Record<string, boolean>>;
  showGeneralLanguage: ComputedRef<boolean>;
  appearanceRows: ComputedRef<Record<string, boolean>>;
  behaviorRows: ComputedRef<Record<string, boolean>>;
  isTabVisible: (tab: TabId) => boolean;
}

export function useSettingsSearch(deps: UseSettingsSearchDeps): UseSettingsSearchReturn {
  const { t, activeTab, getFilteredAgentsCount } = deps;

  const search = ref('');
  const normalizedSearch = computed(() => search.value.trim().toLowerCase());

  function matchesSearch(...fields: (string | undefined)[]): boolean {
    if (!normalizedSearch.value) return true;
    return fields.some((f) => f && f.toLowerCase().includes(normalizedSearch.value));
  }

  const anyMatchAcrossTabs = computed(() => normalizedSearch.value.length > 0);

  // ─── Per-tab row matchers ──────────────────────────────
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

  // ─── Tab visibility ────────────────────────────────────
  function isTabVisible(tab: TabId): boolean {
    if (!normalizedSearch.value) return true;
    if (tab === 'general') return Object.values(generalRows.value).some(Boolean);
    if (tab === 'appearance') return Object.values(appearanceRows.value).some(Boolean);
    if (tab === 'behavior') return Object.values(behaviorRows.value).some(Boolean);
    if (tab === 'agents') return getFilteredAgentsCount() > 0;
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

  return {
    search,
    normalizedSearch,
    matchesSearch,
    anyMatchAcrossTabs,
    generalRows,
    showGeneralLanguage,
    appearanceRows,
    behaviorRows,
    isTabVisible,
  };
}
