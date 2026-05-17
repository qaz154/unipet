import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { PetState, EmotionVector } from '@unipet/core';

/** Always read window.unipet dynamically so it's never stale after HMR or timing issues */
const getEp = () => window.unipet;

export const usePetStore = defineStore('pet', () => {
  const currentState = ref<PetState>('idle');
  const emotion = ref<EmotionVector>({ valence: 0, arousal: 0.1, dominance: 0.5 });
  const isPaused = ref(false);
  const scale = ref(0.75);
  const opacity = ref(1.0);
  const themeId = ref('cat');

  // Persist on change
  watch(scale, (v) => getEp()?.setSetting('petScale', v));
  watch(opacity, (v) => getEp()?.setSetting('petOpacity', v));
  watch(themeId, (v) => getEp()?.setSetting('themeId', v));

  let settingsListenerRegistered = false;

  async function loadPersisted() {
    const ep = getEp();
    if (!ep) return;
    try {
      const s = await ep.getAllSettings();
      if (s.petScale != null) scale.value = s.petScale as number;
      if (s.petOpacity != null) opacity.value = s.petOpacity as number;
      if (s.themeId) themeId.value = s.themeId as string;
    } catch (err) {
      console.error('[pet-store] Failed to load persisted settings:', err instanceof Error ? err.message : err);
    }

    if (!settingsListenerRegistered) {
      settingsListenerRegistered = true;
      ep.on?.('settings:changed', (...args: unknown[]) => {
        const key = args[0] as string;
        const value = args[1];
        if (key === 'themeId' && typeof value === 'string') themeId.value = value;
        if (key === 'petScale' && typeof value === 'number') scale.value = value;
        if (key === 'petOpacity' && typeof value === 'number') opacity.value = value;
      });
    }
  }

  function setState(state: PetState) {
    if (!isPaused.value) {
      currentState.value = state;
      getEp()?.setState(state);
    }
  }

  function setEmotion(e: EmotionVector) {
    emotion.value = { ...e };
  }

  function togglePause() {
    isPaused.value = !isPaused.value;
  }

  // Auto-load on store creation
  loadPersisted();

  return {
    currentState, emotion, isPaused, scale, opacity, themeId,
    setState, setEmotion, togglePause, loadPersisted,
  };
});
