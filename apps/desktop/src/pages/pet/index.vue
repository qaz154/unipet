<script setup lang="ts">
/**
 * UniPet — Professional Desktop Pet
 *
 * Architecture:
 * - Single window (render handles both display and input)
 * - Pluggable renderers: CSS pixel, SVG, sprite, Live2D (future)
 * - Adaptive tick rate: 50ms~5s based on activity level
 * - Session tracking with state priority resolution
 * - Eye tracking with lerp easing
 * - Sound effects with per-source cooldown
 */

import { ref, computed, onMounted, onUnmounted, watch, nextTick, toRef } from 'vue';
import { EventBus, StateManager, EmotionEngine, BubbleManager } from '@unipet/core';
import type { PetState } from '@unipet/core';
import { SVGRenderer, CSSPixelRenderer, SpriteRenderer, Live2DRenderer } from '@unipet/renderers';
import type { CSSPixelConfig, SpriteConfig, Live2DConfig } from '@unipet/renderers';
import { usePetStore } from '../../stores/pet';
import { useSettingsStore } from '../../stores/settings';
import { useI18n } from '../../composables/useI18n';
import { useTheme } from '../../composables/useTheme';
import { PW, PH } from '../../lib/pet-characters';
import { useBubble } from '../../composables/useBubble';
import { useParticles } from '../../composables/useParticles';
import { startEnabledAdapters, stopAllAdapters } from '../../lib/adapters';
import { usePetSize } from '../../composables/usePetSize';
import { usePetDrag } from '../../composables/usePetDrag';
import { useCharacterManager, buildStateFiles, type RendererRefs } from '../../composables/useCharacterManager';
import { usePetEngine } from '../../composables/usePetEngine';
import { useSystemMirror } from '../../composables/useSystemMirror';
import { useVoice } from '../../composables/useVoice';
import { useMeshPets } from '../../composables/useMeshPets';

/** Dynamic getter — avoids stale reference after HMR or timing issues */
const getEp = () => window.unipet;
const { t, loadLocale } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasWrapRef = ref<HTMLDivElement | null>(null);
const svgContainerRef = ref<HTMLDivElement | null>(null);
const ghostCanvasRef = ref<HTMLCanvasElement | null>(null);

// ── Render Mode ──────────────────────────────────────
const themeLoader = useTheme();
const renderMode = ref<'css-pixel' | 'svg' | 'css-theme' | 'sprite' | 'live2d'>('css-pixel');

// Shared mutable renderer references (used by character manager, lifecycle, and engine)
const renderers: RendererRefs & {
  cssPixelRenderer: CSSPixelRenderer | null;
  spriteRenderer: SpriteRenderer | null;
  live2dRenderer: Live2DRenderer | null;
} = {
  ctx: undefined,
  svgRenderer: null,
  cssPixelRenderer: null,
  spriteRenderer: null,
  live2dRenderer: null,
};

const petStore = usePetStore();
const settingsStore = useSettingsStore();
const bubble = useBubble({ hideBubbles: () => settingsStore.hideBubbles });
const { bubbleVisible, bubbleChars, bubbleKind, bubblePermissionId } = bubble;
const particleSystem = useParticles(PW, PH);
const isMiniMode = ref(false);

// ── Composables ──────────────────────────────────────
const showBubble = bubble.show;
const showPermissionBubble = bubble.showPermission;

const { currentSize, displayScale, canvasDisplayWidth, canvasDisplayHeight, cycleSize } = usePetSize(
  toRef(petStore, 'scale'),
  showBubble,
);

const charMgr = useCharacterManager({
  themeLoader,
  petStore,
  displayScale,
  showBubble,
  renderMode,
  canvasRef,
  svgContainerRef,
  renderers,
});
const { currentChar, allCharacters, charIndex, cycleCharacter, fileInput, triggerImport, onFileImport } = charMgr;
void fileInput; // template ref — used in template via ref="fileInput"

const engine = usePetEngine({
  petStore,
  settingsStore,
  particleSystem,
  currentChar,
  canvasRef,
  getCtx: () => renderers.ctx,
  showBubble,
  t,
});

const { bounceY, petRotation, squishX, squishY } = engine;

// ── Desktop Mirror ──────────────────────────────────────
const mirror = useSystemMirror();

// ── Mesh Pets (ghost peers) ─────────────────────────────
const meshPets = useMeshPets();

const drag = usePetDrag({
  getEp,
  onMouseMove: (x: number, y: number) => {
    engine.shared.mouseX = x;
    engine.shared.mouseY = y;
    engine.shared.lastMouseTime = Date.now();
    engine.updateEyeTarget();
  },
  setIsDrag: (v: boolean) => { engine.shared.isDrag = v; },
});
const { onDragStart, onDragMove, onDragEnd } = drag;

// ── Bubble Permission ────────────────────────────────
function dismissPermission(action: string) {
  const result = bubble.dismissPermission(action);
  if (result) {
    getEp()?.invoke?.('pet:permission-response', result.permissionId, result.action).catch(() => {});
  }
}

// ── Settings Navigation ──────────────────────────────
function openSettings() {
  getEp()?.openSettings();
}

// ── Scale Reactivity ─────────────────────────────────
function applyScaleOpacity() {
  if (!canvasRef.value) return;
  canvasRef.value.style.opacity = `${petStore.opacity}`;
}

watch(displayScale, applyScaleOpacity);
watch(() => petStore.opacity, applyScaleOpacity);
watch(() => petStore.themeId, (id) => {
  const idx = allCharacters.value.findIndex(c => c.id === id);
  if (idx >= 0) charIndex.value = idx;
});

// ── Ghost Pet Drawing ──────────────────────────────────
import { computed } from 'vue';
let ghostRafId = 0;
const ghostCount = computed(() => meshPets.ghostPets.value.length);
function drawGhostPetsLoop() {
  const canvas = ghostCanvasRef.value;
  if (!canvas) { ghostRafId = requestAnimationFrame(drawGhostPetsLoop); return; }
  const ctx = canvas.getContext('2d');
  if (!ctx) { ghostRafId = requestAnimationFrame(drawGhostPetsLoop); return; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  meshPets.drawGhosts(ctx, canvas.width, canvas.height);
  ghostRafId = requestAnimationFrame(drawGhostPetsLoop);
}
watch(ghostCount, () => {
  if (ghostCount.value > 0 && !ghostRafId) {
    ghostRafId = requestAnimationFrame(drawGhostPetsLoop);
  }
});

// ── Lifecycle ────────────────────────────────────────
let coreBus: EventBus | null = null;
let stateManager: StateManager | null = null;
let emotionEngine: EmotionEngine | null = null;
let bubbleManager: BubbleManager | null = null;
let voiceDestroy: (() => void) | null = null;
const demoTimers: ReturnType<typeof setTimeout>[] = [];

onMounted(async () => {
  const activeTheme = themeLoader.getActive() || themeLoader.get('svg-cat');
  if (activeTheme?.renderer === 'svg') {
    renderMode.value = 'svg';
  } else if (activeTheme?.renderer === 'css-pixel') {
    renderMode.value = 'css-theme';
  } else if (activeTheme?.renderer === 'spritesheet') {
    renderMode.value = 'sprite';
  } else if (activeTheme?.renderer === 'live2d') {
    renderMode.value = 'live2d';
  }

  await nextTick();

  if (renderMode.value === 'svg' && svgContainerRef.value && activeTheme) {
    renderers.svgRenderer = new SVGRenderer();
    const stateFiles = buildStateFiles(activeTheme.id, activeTheme.states as Record<string, { files: string[] }>);
    const svgConfig = { ...(activeTheme.rendererConfig as unknown as Record<string, unknown>), stateFiles };
    await renderers.svgRenderer.init(svgContainerRef.value, { scale: displayScale.value, opacity: petStore.opacity }, svgConfig);
    renderers.svgRenderer.setState('idle', { duration: 0 });
  } else if (renderMode.value === 'css-theme' && canvasRef.value && activeTheme) {
    renderers.cssPixelRenderer = new CSSPixelRenderer();
    await renderers.cssPixelRenderer.init(
      canvasWrapRef.value!,
      { scale: displayScale.value, opacity: petStore.opacity },
      activeTheme.rendererConfig as CSSPixelConfig,
      canvasRef.value,
    );
    renderers.cssPixelRenderer.setState('idle', { duration: 0 });
  } else if (renderMode.value === 'sprite' && canvasRef.value && activeTheme) {
    renderers.spriteRenderer = new SpriteRenderer();
    await renderers.spriteRenderer.init(
      canvasWrapRef.value!,
      { scale: displayScale.value, opacity: petStore.opacity },
      activeTheme.rendererConfig as SpriteConfig,
      canvasRef.value,
    );
    renderers.spriteRenderer.setState('idle', { duration: 0 });
  } else if (renderMode.value === 'live2d' && canvasWrapRef.value && activeTheme) {
    renderers.live2dRenderer = new Live2DRenderer();
    await renderers.live2dRenderer.init(
      canvasWrapRef.value,
      { scale: displayScale.value, opacity: petStore.opacity },
      activeTheme.rendererConfig as unknown as Live2DConfig,
    );
    renderers.live2dRenderer.setState('idle', { duration: 0 });
  } else if (canvasRef.value) {
    renderers.ctx = canvasRef.value.getContext('2d')!;
    renderers.ctx.imageSmoothingEnabled = false;
    canvasRef.value.width = PW;
    canvasRef.value.height = PH;
  }

  await loadLocale();

  engine.startTick();

  // IPC event handlers
  const ep = getEp();
  if (ep?.on) {
    ep.on('pet:clicked', engine.onHitClick);
    ep.on('pet:pause-toggled', (p: unknown) => { petStore.isPaused = p as boolean; });
    ep.on('pet:mini-mode', (mini: unknown) => { isMiniMode.value = mini as boolean; });
    ep.on('pet:size-changed', (size: unknown) => {
      const s = size as { width: number; height: number };
      if (s.width <= 220) currentSize.value = 'S';
      else if (s.width <= 300) currentSize.value = 'M';
      else currentSize.value = 'L';
    });
    ep.on('pet:event', (ev: unknown) => {
      const e = ev as { type?: string; state?: PetState; message?: string; source?: string; permissionId?: string; permissionTool?: string };
      const source = e.source || 'hook';
      if (e.type === 'permission' && e.permissionId) {
        showPermissionBubble(e.permissionId, e.permissionTool || 'tool', e.message || `Allow ${e.permissionTool || 'tool'}?`);
        engine.updateSession(source, 'waiting', source);
        return;
      }
      engine.updateSession(source, e.state || 'idle', source);
      engine.playStateSound(e.state || 'idle');
    });
    ep.on('mouse-move', (x: unknown, y: unknown) => {
      engine.shared.mouseX = x as number;
      engine.shared.mouseY = y as number;
      engine.shared.lastMouseTime = Date.now();
      engine.updateEyeTarget();
    });
    ep.on('drag:started', () => { engine.shared.isDrag = true; });
    ep.on('drag:ended', () => { engine.shared.isDrag = false; });
    ep.on('throw-pet', (vx?: unknown, vy?: unknown) => {
      engine.shared.throwVx = Number(vx) || 0;
      engine.shared.throwVy = Number(vy) || 0;
      engine.shared.petRotV = engine.shared.throwVx * 0.01;
      engine.addAnnoyance(2);
    });
    ep.on('shortcut', (action: unknown) => {
      if (bubbleKind.value === 'permission' && bubblePermissionId.value) {
        if (action === 'allow') dismissPermission('allow');
        else if (action === 'deny') dismissPermission('deny');
      }
    });
    ep.on('user-idle', (idle: unknown) => {
      // System idle signal from powerMonitor in main process.
      // When the user goes idle, push an 'idle' state so the pet naturally
      // transitions toward sleeping. When the user returns, push 'idle' again
      // to cancel any deep-sleep drift (StateManager will handle the transition).
      engine.updateSession('system', idle ? 'idle' : 'idle', 'system');
    });
    ep.on('system-metrics', (metrics: unknown) => {
      // Desktop Mirror: receive CPU/memory/battery/focus metrics and update
      // the system mirror composable, which drives visual modifiers and
      // state overrides.
      mirror.update(metrics as import('../../types/unipet').SystemMetrics);

      // Apply state override from mirror (e.g. CPU stress → working, low battery → sleeping)
      const override = mirror.stateOverride.value;
      if (override) {
        engine.updateSession('system-mirror', override, 'system-mirror');
      }

      // Show status bubble if there's something notable
      const status = mirror.statusText.value;
      if (status) {
        showBubble(status);
      }

      // Emit sweat particles when CPU is stressed
      particleSystem.emit('working', { sweat: mirror.shouldSweat.value });
    });
  }

  coreBus = new EventBus();
  stateManager = new StateManager(coreBus, {
    sleepSequence: settingsStore.sleepSequence,
    idleTimeoutMs: settingsStore.idleTimeoutMs,
    oneshotDurationMs: 3000,
  });
  emotionEngine = new EmotionEngine(coreBus);
  bubbleManager = new BubbleManager(coreBus);

  watch(
    () => [settingsStore.sleepSequence, settingsStore.idleTimeoutMs] as const,
    ([seq, idle]) => {
      stateManager?.updateConfig({ sleepSequence: seq, idleTimeoutMs: idle });
    },
  );

  stateManager.onChange((s: PetState) => {
    engine.updateSession('state-manager', s);
    engine.onStateFlash();
    engine.playStateSound(s);
    if (renderers.svgRenderer) renderers.svgRenderer.setState(s, { duration: 300 });
    if (renderers.cssPixelRenderer) renderers.cssPixelRenderer.setState(s, { duration: 300 });
    if (renderers.spriteRenderer) renderers.spriteRenderer.setState(s, { duration: 300 });
    if (renderers.live2dRenderer) renderers.live2dRenderer.setState(s, { duration: 300 });
  });

  bubbleManager.onBubble((b) => showBubble(b.text));
  emotionEngine.start();

  // ── Voice Companion + Emotion Music ──────────────────
  try {
    const voiceResult = useVoice({
      voiceEnabled: toRef(settingsStore, 'voiceEnabled'),
      voiceLanguage: toRef(settingsStore, 'voiceLanguage'),
      emotionMusic: toRef(settingsStore, 'emotionMusic'),
      updateSession: (sessionId, state, source) => {
        engine.updateSession(sessionId, state as PetState, source);
      },
      showBubble,
      getEmotion: () => {
        if (emotionEngine) return emotionEngine.emotion;
        return { valence: 0, arousal: 0, dominance: 0 };
      },
    });
    voiceDestroy = voiceResult.destroy;
  } catch (err) {
    console.warn('[UniPet] Voice companion init failed:', err);
  }

  try {
    const result = await startEnabledAdapters(coreBus, settingsStore.enabledAdapters);
    if (result.failed.length > 0) {
      console.warn('[UniPet] Some adapters failed to start:', result.failed);
    }
  } catch (err) {
    console.warn('[UniPet] Adapter start failed:', err);
  }

  demoTimers.push(setTimeout(() => engine.updateSession('demo', 'thinking'), 1500));
  demoTimers.push(setTimeout(() => showBubble(t('pet.ready')), 2500));
  demoTimers.push(setTimeout(() => engine.updateSession('demo', 'happy'), 5000));
  demoTimers.push(setTimeout(() => engine.updateSession('demo', 'idle'), 7000));
});

onUnmounted(() => {
  engine.stopTick();
  if (renderers.svgRenderer) { renderers.svgRenderer.destroy(); renderers.svgRenderer = null; }
  if (renderers.cssPixelRenderer) { renderers.cssPixelRenderer.destroy(); renderers.cssPixelRenderer = null; }
  if (renderers.spriteRenderer) { renderers.spriteRenderer.destroy(); renderers.spriteRenderer = null; }
  if (renderers.live2dRenderer) { renderers.live2dRenderer.destroy(); renderers.live2dRenderer = null; }
  bubble.destroy();
  emotionEngine?.stop();
  stateManager?.reset();
  voiceDestroy?.();
  stopAllAdapters().catch(() => { /* ignore */ });
  coreBus?.clear?.();
  for (const tm of demoTimers) clearTimeout(tm);
  demoTimers.length = 0;
  coreBus = null;
  stateManager = null;
  emotionEngine = null;
  bubbleManager = null;
});
</script>

<template>
  <div class="pet-root" :class="{ mini: isMiniMode }"
       @pointerdown.left="onDragStart"
       @pointermove="onDragMove"
       @pointerup="onDragEnd">
    <div class="pet-shadow" />
    <!-- Ghost pets overlay (mesh peers) -->
    <canvas
      v-if="meshPets.ghostPets.length > 0"
      ref="ghostCanvasRef"
      class="ghost-overlay"
      :width="canvasDisplayWidth"
      :height="canvasDisplayHeight"
      :style="{ width: canvasDisplayWidth + 'px', height: canvasDisplayHeight + 'px' }"
    />
    <!-- SVG renderer container (when theme.renderer === 'svg') -->
    <div
      v-if="renderMode === 'svg'"
      ref="svgContainerRef"
      class="svg-render-container"
      :style="{
        width: canvasDisplayWidth + 'px',
        height: canvasDisplayHeight + 'px',
        transform: `rotate(${petRotation}rad) scaleX(${squishX}) scaleY(${squishY}) translateY(${bounceY}px)`,
      }"
    />
    <!-- Canvas container (when theme.renderer === 'css-pixel') -->
    <div
      v-else
      ref="canvasWrapRef"
      class="canvas-wrap"
      :style="{ width: canvasDisplayWidth + 'px', height: canvasDisplayHeight + 'px' }"
    >
      <canvas ref="canvasRef" class="pet-canvas" />
    </div>
    <Transition name="bubble">
      <div v-if="bubbleVisible" class="speech-bubble" :class="{ permission: bubbleKind === 'permission' }">
        <span>{{ bubbleChars }}</span><span v-if="bubbleKind === 'speech'" class="cursor">|</span>
        <div v-if="bubbleKind === 'permission'" class="permission-btns">
          <button class="perm-btn allow" @click="dismissPermission('allow')">{{ t('perm.allow') }}</button>
          <button class="perm-btn deny" @click="dismissPermission('deny')">{{ t('perm.deny') }}</button>
          <button class="perm-btn rule" @click="dismissPermission('allow-once')">{{ t('perm.once') }}</button>
        </div>
      </div>
    </Transition>

    <!-- Controls (hover only) -->
    <div class="pet-controls" @click.stop>
      <button class="ctrl-btn" @click.stop="cycleCharacter" :title="currentChar.name">
        {{ currentChar.emoji }}
      </button>
      <button class="ctrl-btn size-btn" @click.stop="cycleSize">
        {{ currentSize }}
      </button>
      <button class="ctrl-btn" @click.stop="triggerImport" title="Import custom pet">
        +
      </button>
      <button class="ctrl-btn settings-btn" @click.stop="openSettings" title="Settings">
        ⚙
      </button>
      <input ref="fileInput" type="file" accept="image/*,.json" style="display:none" @change="onFileImport" />
    </div>

    <div class="dot" :class="`dot-${petStore.currentState}`" />
  </div>
</template>

<style scoped>
.pet-root {
  position: relative; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  width: 100vw; height: 100vh; background: transparent;
  border-radius: 4px;
  cursor: grab;
}
.pet-root:active { cursor: grabbing; }
.pet-root.mini { opacity: 0.7; }

.pet-shadow {
  position: absolute; bottom: 2px;
  width: 80px; height: 10px;
  background: radial-gradient(ellipse, rgba(30,20,50,0.28) 0%, transparent 75%);
  border-radius: 50%;
  z-index: 1;
}

.svg-render-container {
  position: relative;
  transition: transform 0.05s linear;
  transform-origin: center bottom;
}
.svg-render-container :deep(object),
.svg-render-container :deep(img) {
  width: 100%; height: 100%;
  pointer-events: none;
}

.canvas-wrap {
  position: relative;
}

.pet-canvas {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  position: relative;
  z-index: 2;
  display: block;
  /* Fill the 108×144 canvas-wrap container */
  width: 100%;
  height: 100%;

.ghost-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 3;
}
}

.speech-bubble {
  position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(145deg, rgba(253,250,255,0.94), rgba(245,238,248,0.94));
  backdrop-filter: blur(10px);
  border: 1px solid rgba(180,170,190,0.3); border-radius: 10px;
  padding: 5px 10px; font-size: 11px;
  font-family: 'KaiTi','STKaiti','Noto Sans SC','Hiragino Sans',sans-serif;
  color: #2e2d3a; max-width: 160px; min-width: 24px;
  word-wrap: break-word; white-space: pre-wrap;
  box-shadow: 0 2px 10px rgba(80,60,120,0.12);
  z-index: 100;
}
.speech-bubble::after {
  content: ''; position: absolute; bottom: -4px; left: 50%;
  transform: translateX(-50%);
  border-left: 4px solid transparent; border-right: 4px solid transparent;
  border-top: 4px solid rgba(180,170,190,0.2);
}
.cursor { animation: cb .8s infinite; color: rgba(80,60,120,0.5); font-weight: 100; }
@keyframes cb { 0%,50%{opacity:1} 51%,100%{opacity:0} }

.speech-bubble.permission {
  background: rgba(30, 30, 45, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  padding: 8px 12px 4px;
  min-width: 140px;
  color: #e8e4f0;
}
.speech-bubble.permission .cursor { display: none; }
.permission-btns { display: flex; gap: 6px; margin-top: 6px; justify-content: center; }
.perm-btn {
  -webkit-app-region: no-drag;
  border: none; border-radius: 6px; padding: 3px 10px; font-size: 11px;
  font-weight: 600; cursor: pointer; transition: background 0.15s;
  color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.perm-btn.allow { background: #3b9b5c; }
.perm-btn.allow:hover { background: #2d7d48; }
.perm-btn.deny { background: #c44a3a; }
.perm-btn.deny:hover { background: #a03a2e; }
.perm-btn.rule { background: #4a6090; }
.perm-btn.rule:hover { background: #3a4e72; }

.pet-controls {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px; z-index: 50;
  /* Settings button always visible; others appear on hover */
}
.pet-controls .ctrl-btn.settings-btn {
  opacity: 1;
}
.pet-controls .ctrl-btn:not(.settings-btn) {
  opacity: 0;
  transition: opacity 0.15s;
}
.pet-root:hover .pet-controls .ctrl-btn:not(.settings-btn) {
  opacity: 1;
}

.ctrl-btn {
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(245,240,255,0.92); border: 1px solid rgba(160,140,200,0.25);
  font-size: 11px; cursor: pointer; padding: 0;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(80,60,120,0.12);
  transition: all 0.12s;
  backdrop-filter: blur(4px);
  color: #5a5080;
}
.ctrl-btn:hover {
  transform: scale(1.15);
  box-shadow: 0 2px 8px rgba(100,80,150,0.2);
  background: rgba(235,228,255,0.96);
}
.size-btn { font-size: 8px; font-weight: 700; color: #8880aa; }

.dot {
  position: absolute; bottom: 0px; left: 50%; transform: translateX(-50%);
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(140,120,180,0.4); transition: all .3s ease;
  z-index: 3;
}
.dot-thinking { background: rgba(80,128,192,0.6); box-shadow: 0 0 6px rgba(80,128,192,0.4); }
.dot-working, .dot-editing { background: rgba(224,176,96,0.6); }
.dot-error { background: rgba(208,80,80,0.6); animation: pe 1s infinite; }
.dot-sleeping { background: rgba(120,110,130,0.3); }
.dot-happy, .dot-celebrating { background: rgba(74,138,94,0.6); animation: ph .5s infinite; }
.dot-love { background: rgba(208,96,128,0.6); }
@keyframes pe { 0%,100%{opacity:1;transform:translateX(-50%) scale(1)} 50%{opacity:.3;transform:translateX(-50%) scale(1.4)} }
@keyframes ph { 0%,100%{transform:translateX(-50%) scale(1)} 50%{transform:translateX(-50%) scale(1.5)} }

.bubble-enter-active { transition: all .25s cubic-bezier(.34,1.56,.64,1); }
.bubble-leave-active { transition: all .12s ease-in; }
.bubble-enter-from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(.85); }
.bubble-leave-to { opacity: 0; transform: translateX(-50%) translateY(-3px) scale(.92); }
</style>
