/**
 * useMeshPets — Renders ghost pets for mesh peers on the canvas
 *
 * Listens for mesh events from the main process and renders
 * semi-transparent ghost pets near the main pet.
 */

import { ref, onMounted, onUnmounted } from 'vue';
import type { MeshPeer, PetState } from '@unipet/core';

/** Get the unipet bridge */
const getEp = () => window.unipet;

// ─── State-to-color mapping for ghost pets ─────────────────

const GHOST_COLORS: Record<string, string> = {
  idle: '#5bc0be',
  thinking: '#a29bfe',
  working: '#feca57',
  editing: '#5bc0be',
  testing: '#00cec9',
  error: '#e74c3c',
  happy: '#fdcb6e',
  love: '#ff9ff3',
  sleeping: '#a29bfe',
  attention: '#0984e3',
  celebrating: '#00b894',
  waiting: '#636e72',
  waving: '#5bc0be',
  sweeping: '#b2bec3',
  juggling: '#fdcb6e',
  breathing: '#5bc0be',
  yawning: '#a29bfe',
  dozing: '#a29bfe',
  waking: '#a29bfe',
  collapsing: '#636e72',
  sniffing: '#5bc0be',
  hissing: '#e74c3c',
  fleeing: '#d63031',
};

interface GhostPet {
  id: string;
  name: string;
  state: PetState;
  x: number;
  y: number;
  alpha: number;
  targetAlpha: number;
}

export function useMeshPets() {
  const ghostPets = ref<GhostPet[]>([]);
  let animFrame = 0;

  function addOrUpdatePeer(peer: MeshPeer): void {
    const existing = ghostPets.value.find((g) => g.id === peer.peerId);
    if (existing) {
      existing.state = peer.petState;
      existing.name = peer.peerName;
      // Smoothly move toward target position
      existing.x += (peer.x - existing.x) * 0.1;
      existing.y += (peer.y - existing.y) * 0.1;
    } else {
      ghostPets.value = [
        ...ghostPets.value,
        {
          id: peer.peerId,
          name: peer.peerName,
          state: peer.petState,
          x: peer.x,
          y: peer.y,
          alpha: 0,
          targetAlpha: 0.6,
        },
      ];
    }
  }

  function removePeer(peerId: string): void {
    ghostPets.value = ghostPets.value.filter((g) => g.id !== peerId);
  }

  function drawGhosts(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    for (const ghost of ghostPets.value) {
      // Smoothly fade in/out
      ghost.alpha += (ghost.targetAlpha - ghost.alpha) * 0.05;

      if (ghost.alpha < 0.01) continue;

      const x = ghost.x * canvasW;
      const y = ghost.y * canvasH;
      const color = GHOST_COLORS[ghost.state] ?? '#5bc0be';

      ctx.save();
      ctx.globalAlpha = ghost.alpha;

      // Draw small ghost body (blob)
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Draw eyes (2 dots)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 5, y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5, y - 3, 3, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.arc(x - 5, y - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5, y - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Name label
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = ghost.alpha * 0.9;
      ctx.fillText(ghost.name, x, y + 24);

      ctx.restore();
    }
  }

  function updateGhostStates(peers: MeshPeer[]): void {
    const peerIds = new Set(peers.map((p) => p.peerId));
    // Remove ghosts for peers no longer present
    for (const ghost of ghostPets.value) {
      if (!peerIds.has(ghost.id)) {
        removePeer(ghost.id);
      }
    }
    // Add/update existing peers
    for (const peer of peers) {
      addOrUpdatePeer(peer);
    }
  }

  onMounted(() => {
    const ep = getEp();
    if (!ep?.on) return;

    ep.on('mesh:event', (payload: unknown) => {
      const p = payload as { event?: string; data?: unknown };
      if (!p) return;

      switch (p.event) {
        case 'peer_joined': {
          const peer = p.data as MeshPeer;
          addOrUpdatePeer(peer);
          break;
        }
        case 'peer_left': {
          const d = p.data as { peerId?: string };
          if (d?.peerId) removePeer(d.peerId);
          break;
        }
        case 'peer_state': {
          const d = p.data as { peerId?: string; petState?: PetState };
          if (d?.peerId && d?.petState) {
            const existing = ghostPets.value.find((g) => g.id === d.peerId);
            if (existing) {
              existing.state = d.petState;
            }
          }
          break;
        }
        case 'connected': {
          // Reset ghosts on new connection
          ghostPets.value = [];
          break;
        }
        case 'disconnected': {
          // Fade out all ghosts
          for (const ghost of ghostPets.value) {
            ghost.targetAlpha = 0;
          }
          break;
        }
      }
    });
  });

  onUnmounted(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
  });

  return {
    ghostPets,
    drawGhosts,
    addOrUpdatePeer,
    removePeer,
    updateGhostStates,
  };
}
