/**
 * Hit Window Renderer — handles all pointer events
 *
 * The hit window sits on top of the transparent, click-through render window.
 * It captures ALL mouse/touch events and forwards them to main via window.hitAPI
 * (the preload-exposed contextBridge), which keeps this script sandbox-compatible.
 */

const api = window.hitAPI;
const hitArea = document.getElementById('hit-area');
const DRAG_THRESHOLD = 3;
const THROW_MIN_SPEED = 200; // px/s to qualify as a throw
const THROW_MAX_SPEED = 2000;

let isDragging = false;
let didDrag = false;
let mouseDownX = 0;
let mouseDownY = 0;
let lastMoveTime = 0;
let lastHoverMoveTime = 0;

// ── Velocity Tracking (ring buffer, last 5 frames) ───
const VELOCITY_FRAMES = 5;
const velocityBuffer = [];

function trackVelocity(x, y) {
  const now = performance.now();
  velocityBuffer.push({ x, y, t: now });
  if (velocityBuffer.length > VELOCITY_FRAMES) velocityBuffer.shift();
}

function getVelocity() {
  if (velocityBuffer.length < 2) return { vx: 0, vy: 0 };
  const first = velocityBuffer[0];
  const last = velocityBuffer[velocityBuffer.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.001) return { vx: 0, vy: 0 };
  return {
    vx: (last.x - first.x) / dt,
    vy: (last.y - first.y) / dt,
  };
}

// ─── Drag ──────────────────────────────────────────────

function queueDragMove(x, y) {
  const now = performance.now();
  // Throttle to ~60fps
  if (now - lastMoveTime < 16) return;
  lastMoveTime = now;
  api.dragMove(x, y);
}

function forwardHoverMove(x, y) {
  const now = performance.now();
  // Throttle hover-move forwarding to ~30fps; eye tracking doesn't need more
  if (now - lastHoverMoveTime < 33) return;
  lastHoverMoveTime = now;
  api.mouseMove(x, y);
}

hitArea.addEventListener('pointerdown', (e) => {
  mouseDownX = e.screenX;
  mouseDownY = e.screenY;
  isDragging = true;
  didDrag = false;
  velocityBuffer.length = 0;
  trackVelocity(e.screenX, e.screenY);
  api.dragLock(e.screenX, e.screenY);
  e.preventDefault();
});

hitArea.addEventListener('pointermove', (e) => {
  // Always forward mouse position so render window can do eye tracking
  forwardHoverMove(e.screenX, e.screenY);

  // Track velocity even when not dragging (for throw-from-hover detection)
  trackVelocity(e.screenX, e.screenY);

  if (!isDragging) return;

  const dx = e.screenX - mouseDownX;
  const dy = e.screenY - mouseDownY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (!didDrag && dist > DRAG_THRESHOLD) {
    didDrag = true;
    hitArea.style.cursor = 'grabbing';
  }

  if (didDrag) {
    queueDragMove(e.screenX, e.screenY);
  }
});

hitArea.addEventListener('pointerup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  hitArea.style.cursor = 'grab';

  if (didDrag) {
    // Check throw velocity before ending drag
    const { vx, vy } = getVelocity();
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > THROW_MIN_SPEED) {
      const clampedSpeed = Math.min(speed, THROW_MAX_SPEED);
      const scale = clampedSpeed / speed;
      api.throwPet(vx * scale, vy * scale);
      api.dragEnd();
    } else {
      api.dragEnd();
    }
    didDrag = false;
  } else {
    // Click (not drag) — send to render window
    api.click(e.screenX, e.screenY);
  }
});

hitArea.addEventListener('pointerleave', () => {
  if (isDragging) {
    if (didDrag) {
      api.dragEnd();
    }
    isDragging = false;
    didDrag = false;
    hitArea.style.cursor = 'grab';
  }
});

// ─── Right-click context menu ──────────────────────────

hitArea.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.contextMenu();
});

// ─── Double-click to open settings ─────────────────────

hitArea.addEventListener('dblclick', () => {
  api.openSettings();
});
