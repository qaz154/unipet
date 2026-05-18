import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { PW, PH } from '../lib/pet-characters';

export type PetSize = 'S' | 'M' | 'L';

const SIZE_PRESETS: Record<PetSize, number> = { S: 0.5, M: 0.75, L: 1.2 };

export interface UsePetSizeReturn {
  currentSize: Ref<PetSize>;
  displayScale: ComputedRef<number>;
  canvasDisplayWidth: ComputedRef<number>;
  canvasDisplayHeight: ComputedRef<number>;
  cycleSize: () => void;
}

export function usePetSize(
  scale: Ref<number>,
  showBubble: (text: string) => void,
): UsePetSizeReturn {
  const currentSize = ref<PetSize>('M');

  const displayScale = computed(() => {
    const sizeScale = SIZE_PRESETS[currentSize.value];
    return Math.max(0.3, Math.min(3.0, sizeScale * scale.value));
  });

  const canvasDisplayWidth = computed(() => PW * 8 * displayScale.value);
  const canvasDisplayHeight = computed(() => PH * 8 * displayScale.value);

  function cycleSize(): void {
    const sizes: PetSize[] = ['S', 'M', 'L'];
    const idx = sizes.indexOf(currentSize.value);
    currentSize.value = sizes[(idx + 1) % sizes.length];
    showBubble(`Size: ${currentSize.value}`);
  }

  return { currentSize, displayScale, canvasDisplayWidth, canvasDisplayHeight, cycleSize };
}
