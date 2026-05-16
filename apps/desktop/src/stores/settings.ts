import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

/** Always read window.unipet dynamically so it's never stale after HMR or timing issues */
const getEp = () => window.unipet;

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

  async function loadPersisted() {
    const ep = getEp();
    if (!ep) return;
    try {
      const s = await ep.getAllSettings();
      if (s.alwaysOnTop != null) alwaysOnTop.value = s.alwaysOnTop as boolean;
      if (s.clickThrough != null) clickThrough.value = s.clickThrough as boolean;
      if (s.edgeSnapping != null) edgeSnapping.value = s.edgeSnapping as boolean;
      if (s.sleepSequence) sleepSequence.value = s.sleepSequence as typeof sleepSequence.value;
      if (s.idleTimeoutMs != null) idleTimeoutMs.value = s.idleTimeoutMs as number;
      if (s.clickReactions != null) clickReactions.value = s.clickReactions as boolean;
      if (s.dragEnabled != null) dragEnabled.value = s.dragEnabled as boolean;
      if (s.soundEnabled != null) soundEnabled.value = s.soundEnabled as boolean;
      if (s.hideBubbles != null) hideBubbles.value = s.hideBubbles as boolean;
      if (s.screenPrivacy != null) screenPrivacy.value = s.screenPrivacy as boolean;
      if (s.colorMode != null) colorMode.value = s.colorMode as typeof colorMode.value;
      if (s.sidebarCollapsed != null) sidebarCollapsed.value = s.sidebarCollapsed as boolean;
      if (s.enabledAdapters) enabledAdapters.value = s.enabledAdapters as string[];
    } catch { /* ignore */ }
  }

  // Persist on change
  watch(alwaysOnTop, (v) => { getEp()?.setSetting('alwaysOnTop', v); getEp()?.setAlwaysOnTop(v); });
  watch(clickThrough, (v) => { getEp()?.setSetting('clickThrough', v); getEp()?.setClickThrough(v); });
  watch(edgeSnapping, (v) => getEp()?.setSetting('edgeSnapping', v));
  watch(sleepSequence, (v) => getEp()?.setSetting('sleepSequence', v));
  watch(idleTimeoutMs, (v) => getEp()?.setSetting('idleTimeoutMs', v));
  watch(clickReactions, (v) => getEp()?.setSetting('clickReactions', v));
  watch(dragEnabled, (v) => getEp()?.setSetting('dragEnabled', v));
  watch(soundEnabled, (v) => getEp()?.setSetting('soundEnabled', v));
  watch(hideBubbles, (v) => getEp()?.setSetting('hideBubbles', v));
  watch(screenPrivacy, (v) => { getEp()?.setSetting('screenPrivacy', v); getEp()?.setContentProtection?.(v); });
  watch(colorMode, (v) => getEp()?.setSetting('colorMode', v));
  watch(sidebarCollapsed, (v) => getEp()?.setSetting('sidebarCollapsed', v));
  watch(enabledAdapters, (v) => getEp()?.setSetting('enabledAdapters', v), { deep: true });

  // Listen for tray-initiated setting changes
  getEp()?.on?.('settings:changed', (...args: unknown[]) => {
    const key = args[0] as string;
    const value = args[1];
    if (key === 'hideBubbles' && typeof value === 'boolean') hideBubbles.value = value;
    if (key === 'soundEnabled' && typeof value === 'boolean') soundEnabled.value = value;
    if (key === 'screenPrivacy' && typeof value === 'boolean') screenPrivacy.value = value;
    if (key === 'alwaysOnTop' && typeof value === 'boolean') alwaysOnTop.value = value;
    if (key === 'clickThrough' && typeof value === 'boolean') clickThrough.value = value;
    if (key === 'edgeSnapping' && typeof value === 'boolean') edgeSnapping.value = value;
    if (key === 'clickReactions' && typeof value === 'boolean') clickReactions.value = value;
    if (key === 'dragEnabled' && typeof value === 'boolean') dragEnabled.value = value;
    if (key === 'colorMode' && typeof value === 'string') colorMode.value = value as typeof colorMode.value;
    if (key === 'sidebarCollapsed' && typeof value === 'boolean') sidebarCollapsed.value = value;
    if (key === 'sleepSequence' && typeof value === 'string') sleepSequence.value = value as typeof sleepSequence.value;
    if (key === 'idleTimeoutMs' && typeof value === 'number') idleTimeoutMs.value = value;
    if (key === 'enabledAdapters' && Array.isArray(value)) enabledAdapters.value = value as string[];
  });

  loadPersisted();

  return {
    alwaysOnTop, clickThrough, edgeSnapping, sleepSequence, idleTimeoutMs,
    clickReactions, dragEnabled, soundEnabled, hideBubbles, screenPrivacy,
    colorMode, sidebarCollapsed, enabledAdapters,
    loadPersisted,
  };
});
