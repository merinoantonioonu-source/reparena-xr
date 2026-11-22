// La mano «aplastada» (src/input/hand-collapse.ts): el navegador de las Quest 157, al perder una mano, la mandaba con todas las
// articulaciones en un punto, y el juego pintaba un muñón delante de la cara (y contaba un pellizco continuo).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { handCollapsed } from '../../src/input/hand-collapse.js';

const joints = (f: (i: number) => [number, number, number]) => Array.from({ length: 25 }, (_, i) => ({ ok: true, p: new Vector3(...f(i)) }));

describe('la mano aplastada', () => {
  it('todas las articulaciones en un punto: no es una mano', () => {
    expect(handCollapsed(joints(() => [0, 1.69, 0]))).toBe(true);
  });
  it('una mano abierta y una cerrada en puño son manos', () => {
    // (abierta: los dedos, a lo largo de unos 18 cm; en puño, las puntas a unos 7 cm de la muñeca)
    expect(handCollapsed(joints((i) => [0.01 * (i % 5), 1.2, -0.18 * (i / 24)]))).toBe(false);
    const fist = joints(() => [0, 1.2, 0]);
    fist[9].p.set(0.02, 1.2, -0.07);
    fist[24].p.set(-0.03, 1.2, -0.065);
    expect(handCollapsed(fist)).toBe(false);
  });
  it('sin las articulaciones que mira (muñeca, punta del índice o del meñique), no se juzga', () => {
    const J = joints(() => [0, 1.69, 0]);
    J[9].ok = false;
    expect(handCollapsed(J)).toBe(false);
  });
});
