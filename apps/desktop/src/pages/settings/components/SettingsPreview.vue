<script setup lang="ts">
import type { PetCharacter } from '../../../lib/pet-characters';

interface Props {
  opacity: number;
  scale: number;
  previewChar: PetCharacter;
  canvasWidth: number;
  canvasHeight: number;
}

defineProps<Props>();
const previewCanvas = defineModel<HTMLCanvasElement | null>('previewCanvas', { default: null });
void previewCanvas;
</script>

<template>
  <aside class="preview">
    <div class="preview-stage" :style="{ opacity }">
      <canvas
        ref="previewCanvas"
        :width="canvasWidth"
        :height="canvasHeight"
        :style="{
          width: `${canvasWidth * 4 * Math.min(scale, 1.6)}px`,
          height: `${canvasHeight * 4 * Math.min(scale, 1.6)}px`,
        }"
      />
    </div>
    <div class="preview-meta">
      <div class="preview-meta-label">Live preview</div>
      <div class="preview-meta-name">{{ previewChar.emoji }} {{ previewChar.name }}</div>
      <div class="preview-meta-stats">
        <span>{{ Math.round(scale * 100) }}%</span>
        <span class="preview-dot">·</span>
        <span>{{ Math.round(opacity * 100) }}% opacity</span>
      </div>
    </div>
  </aside>
</template>
