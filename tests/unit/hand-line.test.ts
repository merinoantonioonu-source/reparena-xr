// La línea de las manos (propuesta del usuario): con las dos manos apoyadas, la cabeza por delante de la línea que las une
// acelera y por detrás frena.
import { describe, expect, it } from 'vitest';
import { HandLine, HL } from '../../src/modes/trek/plat/fly.js';

const hand = (x: number, z: number, y = 0.08, ok = true) => ({ ok, x, y, z });
const L0 = hand(-0.25, -0.3), R0 = hand(0.25, -0.3);

/** `s` segundos con la cabeza en (x, z), mirando a −z. */
function run(L: HandLine, s: number, x: number, z: number, l = L0, r = R0, centered = false): void {
  for (let t = 0; t < s; t += 1 / 72) L.step(1 / 72, x, z, l, r, 0, -1, centered);
}

describe('la línea de las manos', () => {
  it('toma la referencia en plancha arriba, en el centro, y no antes', () => {
    const L = new HandLine();
    run(L, 0.5, 0, -0.2);
    expect(L.ok).toBe(false);
    run(L, 0.5, 0, -0.2, L0, R0, true);
    expect(L.ok).toBe(true);
    expect(Math.abs(L.lean)).toBeLessThan(0.005);
  });
  it('la cabeza por delante de la línea acelera; por detrás, frena (lean negativo)', () => {
    const L = new HandLine();
    run(L, 0.5, 0, -0.2, L0, R0, true);
    run(L, 1.5, 0, -0.2 - (HL.dead + HL.span));
    expect(L.lean).toBeGreaterThan(HL.dead + HL.span - 0.01);
    expect(L.push).toBeGreaterThan(0.9);
    run(L, 1.5, 0, -0.2 + 0.1);
    expect(L.lean).toBeLessThan(-0.09);
    expect(L.push).toBe(0);
  });
  it('un vaivén corto de la flexión no acelera', () => {
    const L = new HandLine();
    run(L, 0.5, 0, -0.2, L0, R0, true);
    run(L, 0.1, 0, -0.25);
    run(L, 0.5, 0, -0.2);
    expect(L.push).toBe(0);
  });
  it('con las manos levantadas o sin ver una, no cuenta y se olvida', () => {
    const L = new HandLine();
    run(L, 0.5, 0, -0.2, L0, R0, true);
    run(L, 1, 0, -0.4);
    expect(L.push).toBeGreaterThan(0.9);
    run(L, 2, 0, -0.4, hand(-0.25, -0.3, 0.6), R0);
    expect(L.ok).toBe(false);
    expect(L.push).toBe(0);
    run(L, 0.5, 0, -0.4, hand(-0.25, -0.3, 0.08, false), R0);
    expect(L.ok).toBe(false);
  });
  it('mide hasta la línea aunque las manos no estén de frente', () => {
    const L = new HandLine();
    // las manos giradas 30°: la cabeza, 10 cm por delante de su línea, en su normal
    const a = Math.PI / 6, l = hand(-0.25 * Math.cos(a), -0.3 - 0.25 * Math.sin(a)), r = hand(0.25 * Math.cos(a), -0.3 + 0.25 * Math.sin(a));
    const nx = Math.sin(a), nz = -Math.cos(a);
    run(L, 0.5, 0, -0.3, l, r, true);
    run(L, 1.5, 0.1 * nx, -0.3 + 0.1 * nz, l, r);
    expect(L.lean).toBeCloseTo(0.1, 2);
  });
});
