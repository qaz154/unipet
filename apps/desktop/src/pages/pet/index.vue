<script setup lang="ts">
/**
 * UniPet — Professional Desktop Pet
 *
 * Architecture (production-grade):
 * - Dual-window: render (transparent) + hit (input) — IPC from hit window
 * - Adaptive tick rate: 50ms~5s based on activity level
 * - Session tracking with state priority resolution
 * - Eye tracking with lerp easing
 * - Sound effects with 10s cooldown
 * - S/M/L size presets
 * - Custom pet import
 * - Mini mode support
 */

import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { EventBus, StateManager, EmotionEngine, BubbleManager, STATE_PRIORITY } from '@unipet/core';
import type { PetState } from '@unipet/core';
import { SVGRenderer } from '@unipet/renderers';
import { usePetStore } from '../../stores/pet';
import { useSettingsStore } from '../../stores/settings';
import { useI18n } from '../../composables/useI18n';
import { useTheme } from '../../composables/useTheme';
import { PET_CHARACTERS, PW, PH, type PetCharacter } from '../../lib/pet-characters';
import { startEnabledAdapters, stopAllAdapters } from '../../lib/adapters';

/** Dynamic getter — avoids stale reference after HMR or timing issues */
const getEp = () => window.unipet;
const { t, loadLocale } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const canvasWrapRef = ref<HTMLDivElement | null>(null);
const svgContainerRef = ref<HTMLDivElement | null>(null);
let ctx: CanvasRenderingContext2D;
let svgRenderer: SVGRenderer | null = null;

// ── Render Mode ──────────────────────────────────────
const themeLoader = useTheme();
const renderMode = ref<'css-pixel' | 'svg'>('css-pixel');

// Resolve SVG asset paths from theme glob
const svgAssets = import.meta.glob('../../../themes/svg-cat/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function resolveSvgUrl(themeId: string, filename: string): string {
  const key = `../../../themes/${themeId}/${filename}`;
  return svgAssets[key] || filename;
}

function buildStateFiles(themeId: string, states: Record<string, { files: string[] }>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [state, def] of Object.entries(states)) {
    result[state] = def.files.map(f => resolveSvgUrl(themeId, f));
  }
  return result;
}

const petStore = usePetStore();
const settingsStore = useSettingsStore();
const bubbleText = ref('');
const bubbleVisible = ref('');
const bubbleChars = ref('');
const bubbleKind = ref<'speech' | 'permission'>('speech');
const bubblePermissionId = ref('');
const bubblePermissionTool = ref('');
const isMiniMode = ref(false);

// Character selection — built-ins + user-imported (not mutated globally)
const customCharacters = ref<PetCharacter[]>([]);
const allCharacters = computed<PetCharacter[]>(() => [...PET_CHARACTERS, ...customCharacters.value]);
const charIndex = ref(0);
const currentChar = computed(() => allCharacters.value[charIndex.value] ?? PET_CHARACTERS[0]);

// S/M/L size presets — combined with petStore.scale slider
type PetSize = 'S' | 'M' | 'L';
const sizePresets: Record<PetSize, number> = { S: 0.5, M: 0.75, L: 1.2 };
const currentSize = ref<PetSize>('M');
const displayScale = computed(() => {
  const sizeScale = sizePresets[currentSize.value];
  return Math.max(0.3, Math.min(3.0, sizeScale * petStore.scale));
});

// Canvas display dimensions in CSS pixels: native 24×32 scaled by displayScale (×8)
const canvasDisplayWidth = computed(() => PW * 8 * displayScale.value);
const canvasDisplayHeight = computed(() => PH * 8 * displayScale.value);

function cycleSize() {
  const sizes: PetSize[] = ['S', 'M', 'L'];
  const idx = sizes.indexOf(currentSize.value);
  currentSize.value = sizes[(idx + 1) % sizes.length];
  showBubble(`Size: ${currentSize.value}`);
}

// ─── Session Tracking ──────────────────────────────────

interface Session {
  state: string;
  source: string;
  agentId: string;
  timestamp: number;
  pid?: number;
}

const sessions = new Map<string, Session>();
const MAX_SESSIONS = 20;

function resolveDisplayState(): string {
  let bestState = 'idle';
  let bestPriority = -1;
  for (const [, session] of sessions) {
    const priorityMap: Record<string, number> = STATE_PRIORITY;
    const p = priorityMap[session.state] ?? 1;
    if (p > bestPriority) {
      bestPriority = p;
      bestState = session.state;
    }
  }
  return bestState;
}

function updateSession(source: string, state: string, agentId: string = 'unknown') {
  sessions.set(source, { state, source, agentId, timestamp: Date.now() });
  if (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
  const displayState = resolveDisplayState();
  petStore.setState(displayState as PetState);
}

// ─── Eye Tracking (lerp easing) ────────────────────────

let eyeX = 0, eyeY = 0;
let targetEyeX = 0, targetEyeY = 0;
const EYE_EASE = 0.15;
const EYE_MAX_OFFSET = 3;
let lastMouseTime = 0;

function updateEyeTarget() {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = Math.min(1, dist / 300);
  targetEyeX = (dx / (dist || 1)) * EYE_MAX_OFFSET * scale;
  targetEyeY = (dy / (dist || 1)) * EYE_MAX_OFFSET * 0.5 * scale;
  lastMouseTime = Date.now();
}

function lerpEyes() {
  eyeX += (targetEyeX - eyeX) * EYE_EASE;
  eyeY += (targetEyeY - eyeY) * EYE_EASE;
}

// ─── Sound Effects (10s cooldown) ──────────────────────

import { createSoundPlayer, DEFAULT_SOUNDS } from '../../lib/sounds.js';

const soundPlayer = createSoundPlayer();

function playStateSound(state: string) {
  if (!settingsStore.soundEnabled) return;
  soundPlayer.playState(state, DEFAULT_SOUNDS);
}

// ─── Adaptive Tick Rate ────────────────────────────────

const FAST_TICK_MS = 50;       // during drag
const BOOST_TICK_MS = 100;     // recently active
const IDLE_TICK_MS = 250;      // idle
const LOW_POWER_TICK_MS = 5000; // low-power idle
let currentTickMs = IDLE_TICK_MS;
let tickInterval: ReturnType<typeof setInterval> | null = null;

function updateTickRate() {
  const now = Date.now();
  let nextMs: number;
  if (isDrag) {
    nextMs = FAST_TICK_MS;
  } else if (now - lastMouseTime < 2000) {
    nextMs = BOOST_TICK_MS;
  } else if (petStore.currentState === 'sleeping') {
    nextMs = LOW_POWER_TICK_MS;
  } else if (petStore.currentState === 'idle') {
    nextMs = IDLE_TICK_MS;
  } else {
    nextMs = BOOST_TICK_MS;
  }

  // Only restart interval if the rate actually changed (avoid interval churn)
  if (nextMs === currentTickMs && tickInterval) return;
  currentTickMs = nextMs;
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, currentTickMs);
}

// ─── Drag (from hit window IPC) ────────────────────────

let mouseX = 0, mouseY = 0;
let isDrag = false;
let clickCd = 0;
let bounceY = 0, bounceV = 0;
let throwVx = 0, throwVy = 0;
let petRotation = 0, petRotV = 0;
let squishX = 1, squishY = 1;
let stateFlash = 0;

// ── Annoyance System ───────────────────────────────────
let annoyanceLevel = 0;
const ANNOYANCE_THRESHOLDS = { stare: 3, hiss: 6, flee: 10 };
let lastAnnoyanceTime = 0;
const ANNOYANCE_DECAY_RATE = 0.08; // per second

function addAnnoyance(amount: number) {
  annoyanceLevel = Math.min(annoyanceLevel + amount, 15);
  lastAnnoyanceTime = Date.now();
}

function getAnnoyanceState(): string {
  if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.flee) return 'hiding';
  if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.hiss) return 'angry';
  if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.stare) return 'attention';
  return '';
}

// Listen for click from hit window — hit window sends (x, y) as two args
function onHitClick(...args: unknown[]) {
  const x = args[0] as number;
  const y = args[1] as number;
  mouseX = x; mouseY = y;
  onClick();
}

function onClick() {
  if (clickCd > 0 || !settingsStore.clickReactions) return;
  bounceV = -3; squishX = 1.1; squishY = 0.88; clickCd = 0.5;
  petRotation += (Math.random() - 0.5) * 0.15;
  addAnnoyance(1.5);

  const annoyState = getAnnoyanceState();
  if (annoyState === 'hiding') {
    showBubble(t('pet.annoyed') || 'Leave me alone!');
    petStore.setState('angry' as PetState);
  } else {
    showBubble(t('pet.click'));
    petStore.setState('happy' as PetState);
  }

  updateSession('click', petStore.currentState);
  soundPlayer.playClick();
  const returnState = petStore.currentState;
  setTimeout(() => {
    if (petStore.currentState === returnState) {
      petStore.setState('idle' as PetState);
      updateSession('click-return', 'idle');
    }
  }, 1500);
}

// ─── Particles ────────────────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; }
const particles: Particle[] = [];

function emitParticle(state: string) {
  if (Math.random() > 0.03) return;
  if (state === 'sleeping' || state === 'dozing') {
    particles.push({ x: PW / 2 + (Math.random() - 0.5) * 8, y: -2, vx: 0.3, vy: -0.4, life: 0, maxLife: 3, color: '#9a98a2' });
  } else if (state === 'happy' || state === 'love' || state === 'celebrating') {
    particles.push({ x: Math.random() * PW, y: Math.random() * PH * 0.5, vx: (Math.random() - 0.5) * 0.3, vy: -0.2, life: 0, maxLife: 1.5, color: state === 'love' ? '#e07050' : '#e8b848' });
  } else if (state === 'error') {
    particles.push({ x: Math.random() * PW, y: Math.random() * PH, vx: (Math.random() - 0.5) * 0.5, vy: -0.3, life: 0, maxLife: 1, color: '#d05050' });
  }
}

function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life += dt;
    if (p.life > p.maxLife) particles.splice(i, 1);
  }
  while (particles.length > 15) particles.shift();
}

// ─── Animation State ──────────────────────────────────

let blinkTimer = 0, isBlinking = false, blinkDuration = 0;
let idleTimer = 0, curAction: string | null = null, actionTimer = 0;
let breathT = 0;

// ─── Tick Loop (adaptive rate) ────────────────────────

function tick() {
  const dt = currentTickMs / 1000;
  const state = petStore.currentState;

  // Blink
  blinkTimer += dt;
  const blinkInterval = state === 'idle' || state === 'sleeping' ? 3 + Math.random() * 3 : 2 + Math.random() * 2;
  if (!isBlinking && blinkTimer > blinkInterval) { isBlinking = true; blinkDuration = 0; }
  if (isBlinking) { blinkDuration += dt; if (blinkDuration > 0.15) { isBlinking = false; blinkTimer = 0; } }

  // Breathing
  const breathSpeed = state === 'sleeping' ? 0.3 : state === 'working' || state === 'editing' ? 1.2 : 0.8;
  breathT += dt * breathSpeed;

  // Idle actions
  if (state === 'idle' || state === 'sleeping') {
    idleTimer += dt;
    if (curAction) { actionTimer -= dt; if (actionTimer <= 0) curAction = null; }
    else if (idleTimer > 5 + Math.random() * 10) {
      curAction = 'yawn'; actionTimer = 2; idleTimer = 0;
      if (Math.random() < 0.3) {
        const m = [t('pet.idle1'), t('pet.idle2'), t('pet.idle3')];
        showBubble(m[Math.floor(Math.random() * m.length)]);
      }
    }
  } else { idleTimer = 0; curAction = null; }

  // Physics (2D)
  if (!isDrag) {
    // Vertical bounce
    bounceV += 20 * dt; bounceY += bounceV;
    if (bounceY > 0) { bounceY = 0; bounceV = -bounceV * 0.35; }
    if (Math.abs(bounceV) < 0.3) { bounceV = 0; bounceY = 0; }

    // Throw physics (horizontal + rotation)
    // Clamp dt to avoid instability at low tick rates
    const pdt = Math.min(dt, 0.25);
    if (Math.abs(throwVx) > 0.1 || Math.abs(throwVy) > 0.1) {
      bounceY += throwVy * pdt;
      throwVy += 40 * pdt; // gravity
      throwVx *= Math.max(0, 1 - 3 * pdt); // friction (clamped positive)
      throwVy *= Math.max(0, 1 - 3 * pdt);
      petRotV = throwVx * 0.01;
      petRotation += petRotV * pdt;
      petRotV *= Math.max(0, 1 - 5 * pdt);

      // Screen edge bounce (visual)
      if (Math.abs(bounceY) > 30) {
        bounceY = Math.sign(bounceY) * 30;
        throwVy = -throwVy * 0.3;
      }
      if (Math.abs(throwVx) < 0.1 && Math.abs(throwVy) < 0.3) {
        throwVx = 0; throwVy = 0;
      }
    } else {
      petRotation += (0 - petRotation) * Math.min(3 * pdt, 1); // return to neutral
    }

    // Annoyance decay
    if (annoyanceLevel > 0 && Date.now() - lastAnnoyanceTime > 8000) {
      annoyanceLevel = Math.max(0, annoyanceLevel - ANNOYANCE_DECAY_RATE * pdt);
    }
  } else {
    petRotation += (0 - petRotation) * Math.min(4 * dt, 1);
    annoyanceLevel = Math.max(0, annoyanceLevel - 0.3 * Math.min(dt, 1));
  }

  squishX += (1 - squishX) * 0.1; squishY += (1 - squishY) * 0.1;
  if (clickCd > 0) clickCd -= dt;
  if (stateFlash > 0) stateFlash -= dt * 2;

  // Eye tracking lerp
  lerpEyes();

  // Particles
  emitParticle(state);
  updateParticles(dt);

  // Update tick rate based on activity
  updateTickRate();

  // Draw
  render();
}

function render() {
  if (!ctx || !canvasRef.value) return;
  const state = petStore.currentState;
  const cw = canvasRef.value.width;
  const ch = canvasRef.value!.height;
  const sx = cw / PW; // horizontal scale (e.g., 4.5)
  const sy = ch / PH; // vertical scale (e.g., 4.5)

  ctx.clearRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(petRotation);
  ctx.scale(squishX, squishY);
  ctx.translate(-cw / 2, -ch / 2);

  // Scaled sprite rendering
  const sprite = currentChar.value.sprite();
  const basePhase = breathT * 0.8 * Math.PI * 2;
  for (let py = 0; py < PH; py++) {
    const depthFactor = (PH - py) / PH;
    const phase = basePhase + py * 0.12;
    const ox = Math.sin(phase * 0.5) * 0.15 * depthFactor;
    const oy = Math.cos(phase) * 0.4 * depthFactor;
    const row = sprite[py];
    for (let px = 0; px < PW; px++) {
      const c = row[px];
      if (c) {
        const rx = Math.round(px * sx + ox * sx);
        const ry = Math.round(py * sy + oy * sy + bounceY * sy);
        ctx.fillStyle = c;
        ctx.fillRect(rx, ry, Math.ceil(sx), Math.ceil(sy));
      }
    }
  }

  // Scaled eyes
  const eyes = currentChar.value.eyes(state, isBlinking);
  const eyeShiftX = Math.round(eyeX);
  const eyeShiftY = Math.round(eyeY * 0.5);
  for (const [ex, ey, ec] of eyes) {
    const off = { ox: Math.sin(basePhase + ey * 0.12) * 0.15 * ((PH - ey) / PH), oy: 0 };
    ctx.fillStyle = ec;
    ctx.fillRect(Math.round(ex * sx + off.ox * sx + eyeShiftX * sx), Math.round(ey * sy + off.oy * sy + bounceY * sy + eyeShiftY * sy), Math.ceil(sx), Math.ceil(sy));
  }

  // Scaled face
  const face = currentChar.value.face(state, curAction);
  for (const [fx, fy, fc] of face) {
    const off = { ox: Math.sin(basePhase + fy * 0.12) * 0.15 * ((PH - fy) / PH), oy: 0 };
    ctx.fillStyle = fc;
    ctx.fillRect(Math.round(fx * sx + off.ox * sx), Math.round(fy * sy + off.oy * sy + bounceY * sy), Math.ceil(sx), Math.ceil(sy));
  }

  ctx.restore();

  // Particles overlay (scaled)
  for (const p of particles) {
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillRect(Math.round(p.x * sx), Math.round(p.y * sy), Math.ceil(sx), Math.ceil(sy));
  }
  ctx.globalAlpha = 1;
}

// ─── Character Switching ──────────────────────────────

function cycleCharacter() {
  // Cycle through both pixel characters AND SVG themes
  const themes = themeLoader.list();
  const pixelIds = allCharacters.value.map(c => c.id);
  const svgThemes = themes.filter(t => t.renderer === 'svg');
  const allIds = [...pixelIds, ...svgThemes.map(t => t.id)];

  const currentId = petStore.themeId || pixelIds[0];
  const currentIdx = allIds.indexOf(currentId);
  const nextIdx = (currentIdx + 1) % allIds.length;
  const nextId = allIds[nextIdx];

  // Check if it's a pixel character or SVG theme
  const pixelIdx = pixelIds.indexOf(nextId);
  if (pixelIdx >= 0) {
    // Switch to pixel character
    if (renderMode.value === 'svg' && svgRenderer) {
      svgRenderer.destroy();
      svgRenderer = null;
    }
    renderMode.value = 'css-pixel';
    charIndex.value = pixelIdx;
    petStore.themeId = nextId;
    showBubble(`${allCharacters.value[pixelIdx].emoji} ${allCharacters.value[pixelIdx].name}`);

    nextTick(() => {
      if (canvasRef.value && !ctx) {
        ctx = canvasRef.value.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
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
        if (svgRenderer) svgRenderer.destroy();
        svgRenderer = new SVGRenderer();
        const stateFiles = buildStateFiles(theme.id, theme.states as Record<string, { files: string[] }>);
        const svgConfig = { ...(theme.rendererConfig as any), stateFiles };
        svgRenderer.init(svgContainerRef.value, { scale: displayScale.value, opacity: petStore.opacity }, svgConfig);
        svgRenderer.setState(petStore.currentState, { duration: 0 });
      }
    });
  }
}

// ─── Custom Pet Import ────────────────────────────────

const fileInput = ref<HTMLInputElement | null>(null);
function triggerImport() { fileInput.value?.click(); }

function onFileImport(e: Event) {
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
      } catch (err) {
        showBubble('❌ Failed to parse theme JSON');
      }
    };
    reader.readAsText(file);
    input.value = '';
    return;
  }

  // Image import (existing pixel grid conversion)
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
      customCharacters.value.push(customChar);
      charIndex.value = allCharacters.value.length - 1;
      petStore.themeId = customChar.id;
      showBubble(`🎨 ${customChar.name}`);
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// ─── Bubble ───────────────────────────────────────────

let typewriterTimer: ReturnType<typeof setTimeout> | null = null;
let bubbleDismissTimer: ReturnType<typeof setTimeout> | null = null;

function showBubble(text: string) {
  if (settingsStore.hideBubbles) return;
  if (bubbleKind.value === 'permission' && bubblePermissionId.value) return;
  if (typewriterTimer) { clearTimeout(typewriterTimer); typewriterTimer = null; }
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null; }
  bubbleKind.value = 'speech';
  bubblePermissionId.value = '';
  bubbleVisible.value = text;
  bubbleChars.value = '';
  bubbleText.value = text;
  let i = 0; const sp = Math.max(20, 60 - text.length);
  const tp = () => { if (i < text.length) { bubbleChars.value += text[i]; i++; typewriterTimer = setTimeout(tp, sp); } };
  tp();
  bubbleDismissTimer = setTimeout(() => { if (bubbleKind.value === 'speech') bubbleVisible.value = ''; }, 2500 + text.length * 30);
}

function showPermissionBubble(permissionId: string, toolName: string, message: string) {
  if (typewriterTimer) { clearTimeout(typewriterTimer); typewriterTimer = null; }
  if (bubbleDismissTimer) { clearTimeout(bubbleDismissTimer); bubbleDismissTimer = null; }
  bubbleKind.value = 'permission';
  bubblePermissionId.value = permissionId;
  bubblePermissionTool.value = toolName;
  bubbleVisible.value = message;
  bubbleChars.value = message;
}

function dismissPermission(action: string) {
  const permId = bubblePermissionId.value;
  if (!permId) return;
  bubbleVisible.value = '';
  bubblePermissionId.value = '';
  bubbleKind.value = 'speech';
  getEp()?.invoke?.('pet:permission-response', permId, action).catch(() => {});
}

// ─── Settings Navigation ────────────────────────────────

function openSettings() {
  getEp()?.openSettings();
}

// ─── Direct Drag (smooth manual window move) ─────────
let dragActive = false;
let dragDidMove = false;
const DRAG_THRESHOLD = 3;
let dragStartX = 0;
let dragStartY = 0;

function onDragStart(e: PointerEvent) {
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  dragDidMove = false;
  dragActive = true;
  getEp()?.dragLock(e.screenX, e.screenY);
  (e.currentTarget as HTMLElement)?.setPointerCapture(e.pointerId);
}

function onDragMove(e: PointerEvent) {
  if (!dragActive) {
    mouseX = e.screenX;
    mouseY = e.screenY;
    lastMouseTime = Date.now();
    updateEyeTarget();
    return;
  }
  const dx = e.screenX - dragStartX;
  const dy = e.screenY - dragStartY;
  if (!dragDidMove && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
  dragDidMove = true;
  isDrag = true;
  getEp()?.dragMove(e.screenX, e.screenY);
}

function onDragEnd(e: PointerEvent) {
  if (!dragActive) return;
  dragActive = false;
  isDrag = false;
  getEp()?.dragEnd();
  try { (e.currentTarget as HTMLElement)?.releasePointerCapture(e.pointerId); } catch {}
}

// ─── Scale Reactivity ─────────────────────────────────

function applyScaleOpacity() {
  // Width/height are set by Vue's :style binding on the container.
  // Only opacity is set here.
  if (!canvasRef.value) return;
  canvasRef.value.style.opacity = `${petStore.opacity}`;
}

watch(displayScale, applyScaleOpacity);
watch(() => petStore.opacity, applyScaleOpacity);
watch(() => petStore.themeId, (id) => {
  const idx = allCharacters.value.findIndex(c => c.id === id);
  if (idx >= 0) charIndex.value = idx;
});

// ─── Lifecycle ────────────────────────────────────────

// Engine references for cleanup
let coreBus: EventBus | null = null;
let stateManager: StateManager | null = null;
let emotionEngine: EmotionEngine | null = null;
let bubbleManager: BubbleManager | null = null;
let adapterStarted = false;
const demoTimers: ReturnType<typeof setTimeout>[] = [];

onMounted(async () => {
  // Determine render mode from active theme
  const activeTheme = themeLoader.getActive() || themeLoader.get('svg-cat');
  if (activeTheme && activeTheme.renderer === 'svg') {
    renderMode.value = 'svg';
  }

  await nextTick();

  if (renderMode.value === 'svg' && svgContainerRef.value && activeTheme) {
    // SVG render path
    svgRenderer = new SVGRenderer();
    const stateFiles = buildStateFiles(activeTheme.id, activeTheme.states as Record<string, { files: string[] }>);
    const svgConfig = {
      ...(activeTheme.rendererConfig as any),
      stateFiles,
    };
    await svgRenderer.init(svgContainerRef.value, { scale: displayScale.value, opacity: petStore.opacity }, svgConfig);
    svgRenderer.setState('idle', { duration: 0 });
  } else if (canvasRef.value) {
    // Canvas render path (existing)
    ctx = canvasRef.value.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    canvasRef.value.width = PW;
    canvasRef.value.height = PH;
  }

  await loadLocale();

  // Start adaptive tick
  tick();
  tickInterval = setInterval(tick, currentTickMs);

  // Note: render window is click-through, so DOM mousemove never fires here.
  // Mouse tracking comes from hit window via IPC 'mouse-move' event (registered below).

  // Listen for IPC from hit window
  const ep = getEp();
  if (ep?.on) {
    ep.on('pet:clicked', onHitClick);
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
        updateSession(source, 'waiting', source);
        return;
      }

      updateSession(source, e.state || 'idle', source);
      playStateSound(e.state || 'idle');
    });
    // Eye tracking: hit window forwards mouse position via main process
    ep.on('mouse-move', (x: unknown, y: unknown) => {
      mouseX = x as number;
      mouseY = y as number;
      lastMouseTime = Date.now();
      updateEyeTarget();
    });
    // Drag state sync from main process
    ep.on('drag:started', () => { isDrag = true; });
    ep.on('drag:ended', () => { isDrag = false; });
    ep.on('throw-pet', (vx?: unknown, vy?: unknown) => {
      throwVx = Number(vx) || 0;
      throwVy = Number(vy) || 0;
      petRotV = throwVx * 0.01;
      addAnnoyance(2);
    });
    ep.on('shortcut', (action: unknown) => {
      if (bubbleKind.value === 'permission' && bubblePermissionId.value) {
        if (action === 'allow') dismissPermission('allow');
        else if (action === 'deny') dismissPermission('deny');
      }
    });
  }

  coreBus = new EventBus();
  // Read live values from the settings store so the Behavior tab actually
  // controls the state machine. Watcher below propagates later changes.
  stateManager = new StateManager(coreBus, {
    sleepSequence: settingsStore.sleepSequence,
    idleTimeoutMs: settingsStore.idleTimeoutMs,
    oneshotDurationMs: 3000,
  });
  emotionEngine = new EmotionEngine(coreBus);
  bubbleManager = new BubbleManager(coreBus);

  // React to behavior-tab changes without rebuilding the manager
  watch(
    () => [settingsStore.sleepSequence, settingsStore.idleTimeoutMs] as const,
    ([seq, idle]) => {
      stateManager?.updateConfig({ sleepSequence: seq, idleTimeoutMs: idle });
    },
  );

  stateManager.onChange((s: PetState) => {
    updateSession('state-manager', s);
    stateFlash = 1;
    playStateSound(s);
    if (svgRenderer) {
      svgRenderer.setState(s, { duration: 300 });
    }
  });

  bubbleManager.onBubble((b) => showBubble(b.text));
  emotionEngine.start();

  // Start adapters via IPC (they run in the main process)
  try {
    const result = await startEnabledAdapters(coreBus, settingsStore.enabledAdapters);
    adapterStarted = result.started.length > 0;
    if (result.failed.length > 0) {
      console.warn('[UniPet] Some adapters failed to start:', result.failed);
    }
  } catch (err) {
    console.warn('[UniPet] Adapter start failed:', err);
  }

  // Demo sequence (tracked so we can cancel on unmount)
  demoTimers.push(setTimeout(() => updateSession('demo', 'thinking'), 1500));
  demoTimers.push(setTimeout(() => showBubble(t('pet.ready')), 2500));
  demoTimers.push(setTimeout(() => updateSession('demo', 'happy'), 5000));
  demoTimers.push(setTimeout(() => updateSession('demo', 'idle'), 7000));
});

onUnmounted(() => {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (svgRenderer) {
    svgRenderer.destroy();
    svgRenderer = null;
  }
  if (typewriterTimer) clearTimeout(typewriterTimer);
  if (bubbleDismissTimer) clearTimeout(bubbleDismissTimer);
  emotionEngine?.stop();
  stateManager?.reset();
  stopAllAdapters().catch(() => { /* ignore */ });
  coreBus?.clear?.();
  for (const tm of demoTimers) clearTimeout(tm);
  demoTimers.length = 0;
  coreBus = null;
  stateManager = null;
  emotionEngine = null;
  bubbleManager = null;
  adapterStarted = false;
});
</script>

<template>
  <div class="pet-root" :class="{ mini: isMiniMode }"
       @pointerdown.left="onDragStart"
       @pointermove="onDragMove"
       @pointerup="onDragEnd">
    <div class="pet-shadow" />
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
          <button class="perm-btn allow" @click="dismissPermission('allow')">Allow</button>
          <button class="perm-btn deny" @click="dismissPermission('deny')">Deny</button>
          <button class="perm-btn rule" @click="dismissPermission('allow-once')">Once</button>
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
