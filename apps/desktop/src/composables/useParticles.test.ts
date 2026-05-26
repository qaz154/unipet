import { describe, expect, it, vi } from 'vitest';
import { useParticles } from '../composables/useParticles.js';

describe('useParticles', () => {
  it('starts with no particles', () => {
    const ps = useParticles(100, 100);
    expect(ps.getAll()).toEqual([]);
  });

  it('emit forces a particle when Math.random returns 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ps = useParticles(100, 100);
    ps.emit('sleeping');
    expect(ps.getAll().length).toBe(1);
    vi.restoreAllMocks();
  });

  it('emit does nothing when Math.random returns high value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const ps = useParticles(100, 100);
    ps.emit('idle');
    expect(ps.getAll().length).toBe(0);
    vi.restoreAllMocks();
  });

  it('sweat particles are created when option is set and random favors it', () => {
    // emit() calls random once for the 0.03 threshold (needs <=0.03 to pass),
    // then once more for the 0.6 sweat threshold (needs >0.6 to pass).
    // We alternate: first call returns 0 (emit passes), second returns 0.8 (sweat passes).
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      return callCount % 2 === 1 ? 0 : 0.8;
    });
    const ps = useParticles(100, 100);
    ps.emit('idle', { sweat: true });
    const all = ps.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.some((p) => p.color === '#7ec8e3')).toBe(true);
    vi.restoreAllMocks();
  });

  it('update removes particles after maxLife', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ps = useParticles(100, 100);
    ps.emit('error'); // maxLife = 1
    expect(ps.getAll().length).toBe(1);
    ps.update(2); // life exceeds maxLife
    expect(ps.getAll().length).toBe(0);
    vi.restoreAllMocks();
  });

  it('update caps particles at MAX_PARTICLES (15)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ps = useParticles(100, 100);
    for (let i = 0; i < 20; i++) ps.emit('error');
    // emit() does not cap; only update() enforces the limit
    ps.update(0);
    expect(ps.getAll().length).toBeLessThanOrEqual(15);
    vi.restoreAllMocks();
  });
});
