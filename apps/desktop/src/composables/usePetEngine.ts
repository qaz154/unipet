/**
 * usePetEngine — Tick loop, render, session tracking, eye tracking,
 * physics state, annoyance system, animation state, adaptive tick rate.
 */

import { ref, type Ref, type ComputedRef } from 'vue';
import { STATE_PRIORITY } from '@unipet/core';
import type { PetState } from '@unipet/core';
import { PW, PH, type PetCharacter } from '../lib/pet-characters';
import { createSoundPlayer } from '../lib/sounds.js';
import type { Particle } from './useParticles';

// ── Shared Mutable State ─────────────────────────────────
// External code (IPC handlers, drag composable) reads/writes these.
export interface EngineSharedState {
  isDrag: boolean;
  mouseX: number;
  mouseY: number;
  lastMouseTime: number;
  throwVx: number;
  throwVy: number;
  petRotV: number;
}

// ── Engine Options ───────────────────────────────────────
export interface PetEngineOpts {
  petStore: {
    readonly currentState: string;
    setState: (state: PetState) => void;
  };
  settingsStore: {
    readonly soundEnabled: boolean;
    readonly clickReactions: boolean;
  };
  particleSystem: {
    emit: (state: string) => void;
    update: (dt: number) => void;
    getAll: () => readonly Particle[];
  };
  currentChar: ComputedRef<PetCharacter>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  getCtx: () => CanvasRenderingContext2D | undefined;
  showBubble: (text: string) => void;
  t: (key: string) => string;
}

// ── Return Type ──────────────────────────────────────────
export interface UsePetEngineReturn {
  shared: EngineSharedState;
  bounceY: Ref<number>;
  petRotation: Ref<number>;
  squishX: Ref<number>;
  squishY: Ref<number>;
  updateEyeTarget: () => void;
  updateSession: (source: string, state: string, agentId?: string) => void;
  addAnnoyance: (amount: number) => void;
  onHitClick: (...args: unknown[]) => void;
  onStateFlash: () => void;
  playStateSound: (state: string) => void;
  soundPlayer: ReturnType<typeof createSoundPlayer>;
  startTick: () => void;
  stopTick: () => void;
}

export function usePetEngine(opts: PetEngineOpts): UsePetEngineReturn {
  const { petStore, settingsStore, particleSystem, currentChar, canvasRef, getCtx, showBubble, t } = opts;

  // ── Session Tracking ──────────────────────────────────
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

  function updateSession(source: string, state: string, agentId: string = 'unknown'): void {
    sessions.set(source, { state, source, agentId, timestamp: Date.now() });
    if (sessions.size > MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    const displayState = resolveDisplayState();
    petStore.setState(displayState as PetState);
  }

  // ── Eye Tracking (lerp easing) ────────────────────────
  let eyeX = 0, eyeY = 0;
  let targetEyeX = 0, targetEyeY = 0;
  const EYE_EASE = 0.15;
  const EYE_MAX_OFFSET = 3;

  function updateEyeTarget(): void {
    if (!canvasRef.value) return;
    const rect = canvasRef.value.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = shared.mouseX - cx;
    const dy = shared.mouseY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = Math.min(1, dist / 300);
    targetEyeX = (dx / (dist || 1)) * EYE_MAX_OFFSET * scale;
    targetEyeY = (dy / (dist || 1)) * EYE_MAX_OFFSET * 0.5 * scale;
    shared.lastMouseTime = Date.now();
  }

  function lerpEyes(): void {
    eyeX += (targetEyeX - eyeX) * EYE_EASE;
    eyeY += (targetEyeY - eyeY) * EYE_EASE;
  }

  // ── Sound Effects ─────────────────────────────────────
  const soundPlayer = createSoundPlayer();

  function playStateSound(state: string): void {
    if (!settingsStore.soundEnabled) return;
    soundPlayer.playState(state);
  }

  // ── Adaptive Tick Rate ────────────────────────────────
  const FAST_TICK_MS = 50;
  const BOOST_TICK_MS = 100;
  const IDLE_TICK_MS = 250;
  const LOW_POWER_TICK_MS = 5000;
  let currentTickMs = IDLE_TICK_MS;
  let tickInterval: ReturnType<typeof setInterval> | null = null;

  function updateTickRate(): void {
    const now = Date.now();
    let nextMs: number;
    if (shared.isDrag) {
      nextMs = FAST_TICK_MS;
    } else if (now - shared.lastMouseTime < 2000) {
      nextMs = BOOST_TICK_MS;
    } else if (petStore.currentState === 'sleeping') {
      nextMs = LOW_POWER_TICK_MS;
    } else if (petStore.currentState === 'idle') {
      nextMs = IDLE_TICK_MS;
    } else {
      nextMs = BOOST_TICK_MS;
    }
    if (nextMs === currentTickMs && tickInterval) return;
    currentTickMs = nextMs;
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(tick, currentTickMs);
  }

  // ── Shared State ──────────────────────────────────────
  const shared: EngineSharedState = {
    isDrag: false,
    mouseX: 0,
    mouseY: 0,
    lastMouseTime: 0,
    throwVx: 0,
    throwVy: 0,
    petRotV: 0,
  };

  // ── Physics State ─────────────────────────────────────
  let clickCd = 0;
  let _bounceY = 0, bounceV = 0;
  let _petRotation = 0;
  let _squishX = 1, _squishY = 1;
  let stateFlash = 0;

  // Template-bound refs (synced from internal state each tick)
  const bounceY = ref(0);
  const petRotation = ref(0);
  const squishX = ref(1);
  const squishY = ref(1);

  // ── Annoyance System ──────────────────────────────────
  let annoyanceLevel = 0;
  const ANNOYANCE_THRESHOLDS = { stare: 3, hiss: 6, flee: 10 };
  let lastAnnoyanceTime = 0;
  const ANNOYANCE_DECAY_RATE = 0.08;

  function addAnnoyance(amount: number): void {
    annoyanceLevel = Math.min(annoyanceLevel + amount, 15);
    lastAnnoyanceTime = Date.now();
  }

  function getAnnoyanceState(): string {
    if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.flee) return 'hiding';
    if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.hiss) return 'angry';
    if (annoyanceLevel >= ANNOYANCE_THRESHOLDS.stare) return 'attention';
    return '';
  }

  // ── Click Handling ────────────────────────────────────
  function onHitClick(...args: unknown[]): void {
    const x = args[0] as number;
    const y = args[1] as number;
    shared.mouseX = x; shared.mouseY = y;
    onClick();
  }

  function onClick(): void {
    if (clickCd > 0 || !settingsStore.clickReactions) return;
    bounceV = -3; _squishX = 1.1; _squishY = 0.88; clickCd = 0.5;
    _petRotation += (Math.random() - 0.5) * 0.15;
    addAnnoyance(1.5);

    const annoyState = getAnnoyanceState();
    if (annoyState === 'hiding') {
      showBubble(t('pet.annoyed'));
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

  // ── Animation State ───────────────────────────────────
  let blinkTimer = 0, isBlinking = false, blinkDuration = 0;
  let idleTimer = 0, curAction: string | null = null, actionTimer = 0;
  let breathT = 0;

  // ── State Flash ───────────────────────────────────────
  function onStateFlash(): void {
    stateFlash = 1;
  }

  // ── Tick Loop ─────────────────────────────────────────
  function tick(): void {
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
    if (!shared.isDrag) {
      bounceV += 20 * dt; _bounceY += bounceV;
      if (_bounceY > 0) { _bounceY = 0; bounceV = -bounceV * 0.35; }
      if (Math.abs(bounceV) < 0.3) { bounceV = 0; _bounceY = 0; }

      const pdt = Math.min(dt, 0.25);
      if (Math.abs(shared.throwVx) > 0.1 || Math.abs(shared.throwVy) > 0.1) {
        _bounceY += shared.throwVy * pdt;
        shared.throwVy += 40 * pdt;
        shared.throwVx *= Math.max(0, 1 - 3 * pdt);
        shared.throwVy *= Math.max(0, 1 - 3 * pdt);
        shared.petRotV = shared.throwVx * 0.01;
        _petRotation += shared.petRotV * pdt;
        shared.petRotV *= Math.max(0, 1 - 5 * pdt);

        if (Math.abs(_bounceY) > 30) {
          _bounceY = Math.sign(_bounceY) * 30;
          shared.throwVy = -shared.throwVy * 0.3;
        }
        if (Math.abs(shared.throwVx) < 0.1 && Math.abs(shared.throwVy) < 0.3) {
          shared.throwVx = 0; shared.throwVy = 0;
        }
      } else {
        _petRotation += (0 - _petRotation) * Math.min(3 * pdt, 1);
      }

      if (annoyanceLevel > 0 && Date.now() - lastAnnoyanceTime > 8000) {
        annoyanceLevel = Math.max(0, annoyanceLevel - ANNOYANCE_DECAY_RATE * pdt);
      }
    } else {
      _petRotation += (0 - _petRotation) * Math.min(4 * dt, 1);
      annoyanceLevel = Math.max(0, annoyanceLevel - 0.3 * Math.min(dt, 1));
    }

    _squishX += (1 - _squishX) * 0.1; _squishY += (1 - _squishY) * 0.1;
    if (clickCd > 0) clickCd -= dt;
    if (stateFlash > 0) stateFlash -= dt * 2;

    lerpEyes();
    particleSystem.emit(state);
    particleSystem.update(dt);
    updateTickRate();

    // Sync to template-bound refs
    bounceY.value = _bounceY;
    petRotation.value = _petRotation;
    squishX.value = _squishX;
    squishY.value = _squishY;

    render();
  }

  // ── Render ────────────────────────────────────────────
  function render(): void {
    const ctx = getCtx();
    if (!ctx || !canvasRef.value) return;
    const state = petStore.currentState;
    const cw = canvasRef.value.width;
    const ch = canvasRef.value.height;
    const sx = cw / PW;
    const sy = ch / PH;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(_petRotation);
    ctx.scale(_squishX, _squishY);
    ctx.translate(-cw / 2, -ch / 2);

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
          const ry = Math.round(py * sy + oy * sy + _bounceY * sy);
          ctx.fillStyle = c;
          ctx.fillRect(rx, ry, Math.ceil(sx), Math.ceil(sy));
        }
      }
    }

    const eyes = currentChar.value.eyes(state, isBlinking);
    const eyeShiftX = Math.round(eyeX);
    const eyeShiftY = Math.round(eyeY * 0.5);
    for (const [ex, ey, ec] of eyes) {
      const off = { ox: Math.sin(basePhase + ey * 0.12) * 0.15 * ((PH - ey) / PH), oy: 0 };
      ctx.fillStyle = ec;
      ctx.fillRect(Math.round(ex * sx + off.ox * sx + eyeShiftX * sx), Math.round(ey * sy + off.oy * sy + _bounceY * sy + eyeShiftY * sy), Math.ceil(sx), Math.ceil(sy));
    }

    const face = currentChar.value.face(state, curAction);
    for (const [fx, fy, fc] of face) {
      const off = { ox: Math.sin(basePhase + fy * 0.12) * 0.15 * ((PH - fy) / PH), oy: 0 };
      ctx.fillStyle = fc;
      ctx.fillRect(Math.round(fx * sx + off.ox * sx), Math.round(fy * sy + off.oy * sy + _bounceY * sy), Math.ceil(sx), Math.ceil(sy));
    }

    ctx.restore();

    for (const p of particleSystem.getAll()) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillRect(Math.round(p.x * sx), Math.round(p.y * sy), Math.ceil(sx), Math.ceil(sy));
    }
    ctx.globalAlpha = 1;
  }

  // ── Lifecycle ─────────────────────────────────────────
  function startTick(): void {
    tick();
    tickInterval = setInterval(tick, currentTickMs);
  }

  function stopTick(): void {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    soundPlayer.destroy();
  }

  return {
    shared,
    bounceY, petRotation, squishX, squishY,
    updateEyeTarget, updateSession, addAnnoyance,
    onHitClick, onStateFlash, playStateSound,
    soundPlayer, startTick, stopTick,
  };
}
