/**
 * Live pet preview — canvas animation loop with breathing + blinking.
 *
 * Manages the requestAnimationFrame loop, the canvas 2D context, and
 * the breathing / blinking timers for the settings preview panel.
 */

import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  PET_CHARACTERS,
  PW,
  PH,
  renderGrid,
  type PetCharacter,
} from '../lib/pet-characters';

interface UsePetPreviewReturn {
  previewCanvas: Ref<HTMLCanvasElement | null>;
  previewChar: ComputedRef<PetCharacter>;
  /** Reset the frame timestamp (call when color mode changes). */
  resetTimestamp: () => void;
}

export function usePetPreview(getCurrentPetId: () => string): UsePetPreviewReturn {
  const previewCanvas = ref<HTMLCanvasElement | null>(null);
  let previewCtx: CanvasRenderingContext2D | null = null;
  let previewBreath = 0;
  let previewBlink = 0;
  let isBlinking = false;
  let previewRaf: number | null = null;
  let lastTs = 0;

  const previewChar = computed<PetCharacter>(() => {
    return PET_CHARACTERS.find((c) => c.id === getCurrentPetId()) ?? PET_CHARACTERS[0];
  });

  function drawPreview(dt: number): void {
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

  function loopPreview(ts: number): void {
    if (lastTs === 0) lastTs = ts;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    drawPreview(dt);
    previewRaf = requestAnimationFrame(loopPreview);
  }

  function resetTimestamp(): void {
    lastTs = 0;
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

  return { previewCanvas, previewChar, resetTimestamp };
}
