/** Las espadas (src/combat/sword-logic.ts; de RepArena, src/76_sword.js): la carga, el tajo, el bloqueo y el cruce de la hoja
 * con el enemigo. */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BLADE_R, BladeContact, BLOCK_LATE, blockHolds, cutOf, pickZone, pushAngle, segSeg, SWORD_ARM, SwordCharge } from '../../src/combat/sword-logic.js';

describe('las espadas', () => {
  it('cada repetición carga cada espada, sin acumular; la perfecta quita el doble', () => {
    const one = new SwordCharge(1);
    one.charge(false);
    one.charge(true);
    expect(one.perf).toEqual([true]);
    expect(one.spend()).toBe(2);
    expect(one.spend()).toBe(0);
    const two = new SwordCharge(2);
    for (let i = 0; i < 5; i++) two.charge(false);
    expect(two.perf.length).toBe(2);
  });

  it('solo corta un tajo amplio y rápido con el brazo; sin carga rebota; aturdido, contraataque', () => {
    expect(cutOf(1, 1, 1.6, true, false)).toBe('graze'); // (lento)
    expect(cutOf(3, SWORD_ARM - 0.1, 1.6, true, false)).toBe('graze'); // (solo la muñeca)
    expect(cutOf(3, 1, 1.6, false, false)).toBe('bounce');
    expect(cutOf(3, 1, 1.6, true, false)).toBe('hit');
    expect(cutOf(3, 1, 1.6, false, true)).toBe('counter');
  });

  it('el bloqueo vale con la hoja en la marca justo antes del golpe, no al principio', () => {
    expect(blockHolds(10, 10 - BLOCK_LATE * 0.5)).toBe(true);
    expect(blockHolds(10, 10 - BLOCK_LATE * 2)).toBe(false);
    const z = new Set([0, 0.3, 0.6, 0.99].map(pickZone));
    expect(z).toEqual(new Set(['high', 'mid', 'low']));
  });

  it('la hoja que barre de un fotograma a otro cruza al enemigo (una cápsula de pie)', () => {
    const a = new Vector3(-0.5, 1.2, -1), b = new Vector3(0.5, 1.2, -1), c = new Vector3(0, 0.2, -1), d = new Vector3(0, 1.9, -1);
    expect(segSeg(a, b, c, d)).toBeLessThan(1e-6);
    // (por encima de la cabeza, no)
    expect(segSeg(a.clone().setY(2.5), b.clone().setY(2.5), c, d)).toBeCloseTo(0.6, 6);
  });

  it('las dos hojas son sólidas: al cruzarse, se sabe de qué lado estaba cada una y cuánto apartarlas', () => {
    const C = new BladeContact();
    // la A, vertical delante; la B, cruzada por detrás de ella (a 20 cm), y luego las manos la pasan 5 cm por delante
    const a0 = new Vector3(0, 1, -0.5), a1 = new Vector3(0, 1.8, -0.5);
    const b0 = new Vector3(-0.4, 1.4, -0.3), b1 = new Vector3(0.4, 1.4, -0.3);
    expect(C.step(a0, a1, b0, b1)).toBe(false);
    expect(C.n.z).toBeCloseTo(-1, 6); // (la A, más adelante que la B)
    b0.z = b1.z = -0.55;
    expect(C.step(a0, a1, b0, b1)).toBe(true);
    expect(C.pen).toBeCloseTo(BLADE_R + 0.05, 6);
    // apoyadas sin cruzarse, también se tocan
    b0.z = b1.z = -0.5 + BLADE_R * 0.5;
    expect(C.step(a0, a1, b0, b1)).toBe(true);
    // el giro de cada una, más pequeño cuanto más lejos de la mano
    expect(pushAngle(0.05, 0.6)).toBeLessThan(pushAngle(0.05, 0.3));
    C.release();
    expect(C.step(a0, a1, b0, b1)).toBe(false);
  });
});
