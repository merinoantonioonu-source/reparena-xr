// Las piedras del lanzador (src/combat/rock-path.ts): la parábola hasta donde estaba tu cabeza, más deprisa cuanto más
// difícil, y la parada con la mano (la muñeca, la punta del índice o la de cualquier dedo).
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand } from '../../src/input/hand-model.js';
import { ROCK_PARRY, rockAt, rockFlight, rockParry } from '../../src/combat/rock-path.js';
import { throwK } from '../../src/combat/foes.js';

describe('las piedras', () => {
  it('vuelan en parábola: salen de la mano, suben y llegan justo a donde estaba tu cabeza', () => {
    const from = new Vector3(0, 1.4, -4.2), to = new Vector3(0, 1.6, 0), { T, h } = rockFlight(from.distanceTo(to), 1), p = new Vector3();
    expect(T).toBeCloseTo(4.2047 / 4.5, 3); // (a 4,2 m, menos de un segundo)
    expect(rockAt(from, to, T, h, 0, p).distanceTo(from)).toBeLessThan(1e-9);
    expect(rockAt(from, to, T, h, T, p).distanceTo(to)).toBeLessThan(1e-9);
    expect(rockAt(from, to, T, h, T / 2, p).y).toBeCloseTo(1.5 + h, 6);
  });
  it('cuanto más difícil, más deprisa (como mucho, un 40 %)', () => {
    expect(throwK(0, 0)).toBe(1);
    expect(throwK(6, 0)).toBeCloseTo(1.24, 6);
    expect(throwK(6, 0.6)).toBe(1.4);
    expect(rockFlight(4, 1.4).T).toBeCloseTo(rockFlight(4, 1).T / 1.4, 6);
  });
  it('se para con la mano: la muñeca o la punta de un dedo; lejos, no', () => {
    const hands = { left: mkHand(), right: mkHand() }, w = new Vector3(0.3, 1.4, -0.5);
    expect(rockParry(w, hands)).toBeNull();
    hands.right.ok = true;
    hands.right.isHand = true;
    hands.right.wrist.set(0.3, 1.4, -0.5 + ROCK_PARRY + 0.05);
    expect(rockParry(w, hands)).toBeNull();
    hands.right.J[9].ok = true;
    hands.right.J[9].p.set(0.3, 1.4, -0.45);
    expect(rockParry(w, hands)).toBe('right');
  });
});
