/**
 * System color-scheme detection + resolved light/dark mode.
 *
 * Listens to the OS-level `prefers-color-scheme` media query and
 * resolves the final mode based on the user's explicit preference
 * (auto / light / dark).
 */

import { ref, computed, onMounted, onUnmounted, type ComputedRef } from 'vue';

type ColorMode = 'auto' | 'light' | 'dark';

interface UseColorModeReturn {
  resolvedMode: ComputedRef<'light' | 'dark'>;
}

export function useColorMode(getColorMode: () => ColorMode): UseColorModeReturn {
  const prefersLight = ref(false);
  let mql: MediaQueryList | null = null;

  function syncSystemColor(e?: MediaQueryListEvent): void {
    prefersLight.value = e
      ? !e.matches
      : !window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  const resolvedMode = computed<'light' | 'dark'>(() => {
    const mode = getColorMode();
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
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

  return { resolvedMode };
}
