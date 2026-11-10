// La marcha de los de tierra (src/combat/gait.ts): llegan cuando pide «Tiempo llegada», el zigzag va de lado a lado, recto
// y a rachas se paran en guardia cuando van sobrados, la amenaza sale una vez entre 3 y 7 m y las esquivas recorren lo suyo.
import { describe, expect, it } from 'vitest';
import { Gait, gaitPlan, paceOf, travelOf } from '../../src/combat/gait.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// recorre d metros con esa forma de moverse y dice cuánto tarda, cuánto se aparta de lado y cuánto rato está parado
function walk(style: 'straight' | 'zigzag' | 'bursts', travel: number, D = 9, W = 12) {
  const g = new Gait(style, gaitPlan(D, W, 1, false, travel), 1, rng(7));
  let d = D, t = 0, side = 0, maxSide = 0, still = 0;
  const dt = 1 / 72;
  while (d > 0.05 && t < 60) {
    const charged = d < g.plan.chargeD + 0.3;
    g.march(dt, d, t > 1, charged);
    let v = g.wantV;
    if (v > 0) v = Math.max(v, 0.25);
    else still += dt;
    d -= v * dt;
    side += g.lat * dt;
    maxSide = Math.max(maxSide, Math.abs(side));
    t += dt;
  }
  return { t, maxSide, still };
}

describe('la marcha', () => {
  it('los ajustes: rapidez de gestos de 0,5 a 2,5 (los jefes, algo más pausados) y velocidad de 1 a 3', () => {
    expect(paceOf(150, false)).toBe(1.5);
    expect(paceOf(400, false)).toBe(2.5);
    expect(paceOf(150, true)).toBeCloseTo(1.275);
    expect(travelOf(50)).toBe(1);
    expect(travelOf(200)).toBe(2);
  });
  it('llega más o menos cuando pide «Tiempo llegada», vaya como vaya', () => {
    for (const style of ['straight', 'zigzag', 'bursts'] as const) for (const travel of [1, 2]) {
      const { t } = walk(style, travel);
      expect(t, `${style} ×${travel}`).toBeGreaterThan(5);
      expect(t, `${style} ×${travel}`).toBeLessThan(16);
    }
  });
  it('sobrado de velocidad, el zigzag va de lado a lado y recto y a rachas se paran en guardia', () => {
    expect(walk('zigzag', 2).maxSide).toBeGreaterThan(0.3);
    expect(walk('zigzag', 1).maxSide).toBe(0);
    expect(walk('straight', 2).still).toBeGreaterThan(1);
    expect(walk('bursts', 2).still).toBeGreaterThan(1);
    expect(walk('straight', 1).still).toBe(0);
  });
  it('la amenaza: una sola vez, entre 3 y 7 m, y solo con 10 s o más de «Tiempo llegada»', () => {
    const g = new Gait('straight', gaitPlan(9, 12, 1, false, 1), 1, rng(3));
    let n = 0;
    for (let d = 11; d > 1; d -= 0.01) if (g.tauntNow(1 / 72, 12, d)) {
      n++;
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(7);
    }
    expect(n).toBe(1);
    const h = new Gait('straight', gaitPlan(9, 8, 1, false, 1), 1, rng(3));
    for (let d = 11; d > 1; d -= 0.01) expect(h.tauntNow(1 / 72, 8, d)).toBe(false);
  });
  it('las esquivas: solo con esa forma de moverse; recorren 0,9 m (1,4 con voltereta)', () => {
    const g = new Gait('dodge', gaitPlan(9, 12, 1, false, 1), 1.5, rng(5));
    let side = 0, dodges = 0, was = false;
    for (let i = 0; i < 72 * 6; i++) {
      side += Math.abs(g.dodgeStep(1 / 72, true, false, false));
      if (g.dodge > 0 && !was) dodges++;
      was = g.dodge > 0;
    }
    expect(dodges).toBeGreaterThan(0);
    expect(side / dodges).toBeCloseTo(0.9, 1);
    const s = new Gait('straight', gaitPlan(9, 12, 1, false, 1), 1.5, rng(5));
    for (let i = 0; i < 72 * 6; i++) expect(s.dodgeStep(1 / 72, true, true, true)).toBe(0);
  });
});
