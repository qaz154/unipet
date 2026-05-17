import { defineStore } from 'pinia';
import { ref, watch, type Ref } from 'vue';

const getEp = () => window.unipet;

type SettingDef = {
  ref: Ref;
  key: string;
  sideEffect?: (v: unknown) => void;
};

export const useSettingsStore = defineStore('settings', () => {
  const alwaysOnTop = ref(true);
  const clickThrough = ref(false);
  const edgeSnapping = ref(true);
  const sleepSequence = ref<'full' | 'direct'>('full');
  const idleTimeoutMs = ref(2 * 60 * 1000);
  const clickReactions = ref(true);
  const dragEnabled = ref(true);
  const soundEnabled = ref(true);
  const hideBubbles = ref(false);
  const screenPrivacy = ref(true);
  const colorMode = ref<'auto' | 'light' | 'dark'>('dark');
  const sidebarCollapsed = ref(false);
  const enabledAdapters = ref<string[]>([]);

  const settingDefs: SettingDef[] = [
    { ref: alwaysOnTop, key: 'alwaysOnTop', sideEffect: (v) => getEp()?.setAlwaysOnTop(v as boolean) },
    { ref: clickThrough, key: 'clickThrough', sideEffect: (v) => getEp()?.setClickThrough(v as boolean) },
    { ref: edgeSnapping, key: 'edgeSnapping' },
    { ref: sleepSequence, key: 'sleepSequence' },
    { ref: idleTimeoutMs, key: 'idleTimeoutMs' },
    { ref: clickReactions, key: 'clickReactions' },
    { ref: dragEnabled, key: 'dragEnabled' },
    { ref: soundEnabled, key: 'soundEnabled' },
    { ref: hideBubbles, key: 'hideBubbles' },
    { ref: screenPrivacy, key: 'screenPrivacy', sideEffect: (v) => getEp()?.setContentProtection?.(v as boolean) },
    { ref: colorMode, key: 'colorMode' },
    { ref: sidebarCollapsed, key: 'sidebarCollapsed' },
  ];

  const settingsByKey = new Map(settingDefs.map(d => [d.key, d]));

  for (const def of settingDefs) {
    watch(def.ref, (v) => {
      getEp()?.setSetting(def.key, v);
      def.sideEffect?.(v);
    });
  }
  watch(enabledAdapters, (v) => getEp()?.setSetting('enabledAdapters', v), { deep: true });

  async function loadPersisted() {
    const ep = getEp();
    if (!ep) return;
    try {
      const s = await ep.getAllSettings();
      for (const def of settingDefs) {
        if (s[def.key] != null) def.ref.value = s[def.key];
      }
      if (s.enabledAdapters) enabledAdapters.value = s.enabledAdapters as string[];
    } catch (err) {
      console.error('[settings] Failed to load:', err instanceof Error ? err.message : err);
    }
  }

  let listenerRegistered = false;
  if (!listenerRegistered) {
    listenerRegistered = true;
    getEp()?.on?.('settings:changed', (...args: unknown[]) => {
      const key = args[0] as string;
      const value = args[1];
      const def = settingsByKey.get(key);
      if (def && value != null) {
        def.ref.value = value;
        return;
      }
      if (key === 'enabledAdapters' && Array.isArray(value)) {
        enabledAdapters.value = value as string[];
      }
    });
  }

  loadPersisted();

  return {
    alwaysOnTop, clickThrough, edgeSnapping, sleepSequence, idleTimeoutMs,
    clickReactions, dragEnabled, soundEnabled, hideBubbles, screenPrivacy,
    colorMode, sidebarCollapsed, enabledAdapters,
    loadPersisted,
  };
});
