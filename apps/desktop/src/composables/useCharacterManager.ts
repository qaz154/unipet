import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue';
import type { PetState } from '@unipet/core';
import { PET_CHARACTERS, PW, PH, type PetCharacter } from '../lib/pet-characters';
import { SVGRenderer } from '@unipet/renderers';
import type { ThemeLoader } from '@unipet/themes';

// ── SVG Asset Resolution ───────────────────────────────
// Vite glob for SVG theme files — path relative to this composable
const svgAssets = import.meta.glob('../../themes/svg-cat/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function resolveSvgUrl(themeId: string, filename: string): string {
  const key = `../../themes/${themeId}/${filename}`;
  return svgAssets[key] || filename;
}

export function buildStateFiles(
  themeId: string,
  states: Record<string, { files: string[] }>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [state, def] of Object.entries(states)) {
    result[state] = def.files.map(f => resolveSvgUrl(themeId, f));
  }
  return result;
}

// ── Shared mutable reference for renderers ──────────────
export interface RendererRefs {
  ctx: CanvasRenderingContext2D | undefined;
  svgRenderer: SVGRenderer | null;
}

export interface CharacterManagerOpts {
  themeLoader: ThemeLoader;
  petStore: {
    themeId: string;
    currentState: PetState;
    opacity: number;
  };
  displayScale: ComputedRef<number>;
  showBubble: (text: string) => void;
  renderMode: Ref<'css-pixel' | 'svg' | 'css-theme' | 'sprite' | 'live2d'>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  svgContainerRef: Ref<HTMLDivElement | null>;
  renderers: RendererRefs;
}

export interface UseCharacterManagerReturn {
  customCharacters: Ref<PetCharacter[]>;
  allCharacters: ComputedRef<PetCharacter[]>;
  charIndex: Ref<number>;
  currentChar: ComputedRef<PetCharacter>;
  cycleCharacter: () => void;
  fileInput: Ref<HTMLInputElement | null>;
  triggerImport: () => void;
  onFileImport: (e: Event) => void;
}

export function useCharacterManager(opts: CharacterManagerOpts): UseCharacterManagerReturn {
  const { themeLoader, petStore, displayScale, showBubble, renderMode, canvasRef, svgContainerRef, renderers } = opts;

  // ── Character Data ──────────────────────────────────
  const customCharacters = ref<PetCharacter[]>([]);
  const allCharacters = computed<PetCharacter[]>(() => [...PET_CHARACTERS, ...customCharacters.value]);
  const charIndex = ref(0);
  const currentChar = computed(() => allCharacters.value[charIndex.value] ?? PET_CHARACTERS[0]);

  // ── Character Cycling ───────────────────────────────
  function cycleCharacter(): void {
    const themes = themeLoader.list();
    const pixelIds = allCharacters.value.map(c => c.id);
    const svgThemes = themes.filter(t => t.renderer === 'svg');
    const allIds = [...pixelIds, ...svgThemes.map(t => t.id)];

    const currentId = petStore.themeId || pixelIds[0];
    const currentIdx = allIds.indexOf(currentId);
    const nextIdx = (currentIdx + 1) % allIds.length;
    const nextId = allIds[nextIdx];

    const pixelIdx = pixelIds.indexOf(nextId);
    if (pixelIdx >= 0) {
      // Switch to pixel character
      if (renderMode.value === 'svg' && renderers.svgRenderer) {
        renderers.svgRenderer.destroy();
        renderers.svgRenderer = null;
      }
      renderMode.value = 'css-pixel';
      charIndex.value = pixelIdx;
      petStore.themeId = nextId;
      showBubble(`${allCharacters.value[pixelIdx].emoji} ${allCharacters.value[pixelIdx].name}`);

      nextTick(() => {
        if (canvasRef.value && !renderers.ctx) {
          renderers.ctx = canvasRef.value.getContext('2d')!;
          renderers.ctx.imageSmoothingEnabled = false;
          canvasRef.value.width = PW;
          canvasRef.value.height = PH;
        }
      });
    } else {
      // Switch to SVG theme
      const theme = themeLoader.get(nextId);
      if (!theme) return;
      renderMode.value = 'svg';
      petStore.themeId = nextId;
      showBubble(`🎨 ${theme.displayName}`);

      nextTick(() => {
        if (svgContainerRef.value) {
          if (renderers.svgRenderer) renderers.svgRenderer.destroy();
          renderers.svgRenderer = new SVGRenderer();
          const stateFiles = buildStateFiles(theme.id, theme.states as Record<string, { files: string[] }>);
          const svgConfig = { ...(theme.rendererConfig as unknown as Record<string, unknown>), stateFiles };
          renderers.svgRenderer.init(svgContainerRef.value, { scale: displayScale.value, opacity: petStore.opacity }, svgConfig);
          renderers.svgRenderer.setState(petStore.currentState, { duration: 0 });
        }
      });
    }
  }

  // ── Custom Pet Import ───────────────────────────────
  const fileInput = ref<HTMLInputElement | null>(null);

  function triggerImport(): void {
    fileInput.value?.click();
  }

  function onFileImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // JSON theme import
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          const result = themeLoader.loadFromData(data);
          if (result.theme) {
            petStore.themeId = result.theme.id;
            if (result.theme.renderer === 'svg') {
              renderMode.value = 'svg';
            }
            showBubble(`🎨 Imported: ${result.theme.displayName}`);
          } else {
            showBubble(`❌ Invalid theme: ${result.errors[0]?.message || 'unknown error'}`);
          }
        } catch {
          showBubble('❌ Failed to parse theme JSON');
        }
      };
      reader.readAsText(file);
      input.value = '';
      return;
    }

    // Image import (pixel grid conversion)
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const customGrid: (string | null)[][] = [];
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = PW; tempCanvas.height = PH;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(img, 0, 0, PW, PH);
        const imageData = tempCtx.getImageData(0, 0, PW, PH);
        for (let y = 0; y < PH; y++) {
          const row: (string | null)[] = [];
          for (let x = 0; x < PW; x++) {
            const i = (y * PW + x) * 4;
            const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2], a = imageData.data[i + 3];
            if (a < 128) { row.push(null); continue; }
            row.push(`rgb(${r},${g},${b})`);
          }
          customGrid.push(row);
        }
        const customChar: PetCharacter = {
          id: 'custom-' + Date.now(),
          name: file.name.replace(/\.[^.]+$/, ''),
          emoji: '🎨',
          sprite: () => customGrid,
          eyes: () => [] as [number, number, string][],
          face: () => [] as [number, number, string][],
        };
        customCharacters.value = [...customCharacters.value, customChar];
        charIndex.value = allCharacters.value.length - 1;
        petStore.themeId = customChar.id;
        showBubble(`🎨 ${customChar.name}`);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  return {
    customCharacters, allCharacters, charIndex, currentChar,
    cycleCharacter, fileInput, triggerImport, onFileImport,
  };
}
