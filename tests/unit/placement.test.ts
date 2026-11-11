import { describe, expect, it } from 'vitest';
import { islandLayout, natureLayout, ISL_SHORE, type Models } from '../../src/env/placement.js';

// un pack de mentira: todo está, todo ocupa lo mismo
const M: Models = { has: () => true, foot: () => 0.4, rad: () => 1.5 };
const GATES = [{ x: -3.5, z: -11 }, { x: 0, z: -11 }, { x: 3.5, z: -11 }];

describe('los entornos de día', () => {
  it('el bosque sale siempre igual para la misma distancia de las compuertas', () => {
    expect(natureLayout(11, false, GATES, M)).toEqual(natureLayout(11, false, GATES, M));
    expect(natureLayout(11, false, GATES, M).puts.length).toBeGreaterThan(100);
  });
  it('lo grande del bosque nunca va delante ni cerca de ti', () => {
    const big = natureLayout(11, false, GATES, M).puts.filter((p) => /Tree|Pine|Bush|Rock/.test(p.n));
    expect(big.length).toBeGreaterThan(20);
    for (const p of big) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(5);
      const front = Math.abs(Math.atan2(p.x, -p.z)) < 0.8 && Math.hypot(p.x, p.z) < 16;
      expect(front).toBe(false);
    }
  });
  it('con fondo realista, sin bosque detrás de las compuertas', () => {
    const behind = (L: ReturnType<typeof natureLayout>): number => L.puts.filter((p) => p.z < -17 && Math.abs(p.x) < 14).length;
    expect(behind(natureLayout(11, true, GATES, M))).toBeLessThan(behind(natureLayout(11, false, GATES, M)));
  });
  it('la isla: acantilados detrás de las compuertas, palmeras dentro de la orilla y muelle detrás de ti', () => {
    const L = islandLayout(11, GATES, M);
    expect(L.puts.filter((p) => p.n.startsWith('Cliff')).length).toBeGreaterThanOrEqual(7);
    for (const p of L.puts.filter((q) => q.n.startsWith('PalmTree'))) expect(Math.hypot(p.x, p.z)).toBeLessThan(ISL_SHORE);
    expect(L.puts.filter((p) => p.n === 'Dock' || p.n === 'Dock_Broken')).toHaveLength(7);
    expect(islandLayout(11, GATES, M)).toEqual(L);
  });
  it('lo que no está en el pack no se pone', () => {
    const none: Models = { has: () => false, foot: () => 1, rad: () => 1 };
    expect(natureLayout(11, false, GATES, none).puts).toHaveLength(0);
    expect(islandLayout(11, GATES, none).puts).toHaveLength(0);
  });
});
