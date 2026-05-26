export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const MAX_PARTICLES = 15;

export function useParticles(gridWidth: number, gridHeight: number) {
  const particles: Particle[] = [];

  function emit(state: string, options?: { sweat?: boolean }) {
    if (Math.random() > 0.03) return;
    if (state === 'sleeping' || state === 'dozing') {
      particles.push({ x: gridWidth / 2 + (Math.random() - 0.5) * 8, y: -2, vx: 0.3, vy: -0.4, life: 0, maxLife: 3, color: '#9a98a2' });
    } else if (state === 'happy' || state === 'love' || state === 'celebrating') {
      particles.push({
        x: Math.random() * gridWidth, y: Math.random() * gridHeight * 0.5,
        vx: (Math.random() - 0.5) * 0.3, vy: -0.2, life: 0, maxLife: 1.5,
        color: state === 'love' ? '#e07050' : '#e8b848',
      });
    } else if (state === 'error') {
      particles.push({
        x: Math.random() * gridWidth, y: Math.random() * gridHeight,
        vx: (Math.random() - 0.5) * 0.5, vy: -0.3, life: 0, maxLife: 1,
        color: '#d05050',
      });
    }

    // Sweat drops — emitted when CPU is stressed
    if (options?.sweat && Math.random() > 0.6) {
      const side = Math.random() > 0.5 ? 1 : -1;
      particles.push({
        x: gridWidth / 2 + side * (6 + Math.random() * 4),
        y: gridHeight * 0.3 + Math.random() * 4,
        vx: side * 0.2,
        vy: 0.6 + Math.random() * 0.3,
        life: 0,
        maxLife: 1.2,
        color: '#7ec8e3',
      });
    }
  }

  function update(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life += dt;
      if (p.life > p.maxLife) particles.splice(i, 1);
    }
    while (particles.length > MAX_PARTICLES) particles.shift();
  }

  function getAll(): readonly Particle[] {
    return particles;
  }

  return { emit, update, getAll };
}
