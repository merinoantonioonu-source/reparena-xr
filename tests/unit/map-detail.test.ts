/** El detalle del mapa: lo de cerca, a la nitidez elegida; lo lejano, con menos; deprisa, algo menos cerca. */
import { describe, expect, it } from 'vitest';
import { DETAIL, errorAt, fallDist, farFactor, nearRelax } from '../../src/modes/trek/map/map-detail.js';

describe('el detalle del mapa', () => {
  it('lo de cerca no se afloja por tener cola: solo por ir deprisa', () => {
    // a 260 m, en primera (40 m/s) y en tercera: la nitidez elegida
    expect(nearRelax(40, 260)).toBe(1);
    expect(nearRelax(78, 260)).toBe(1);
    // muy deprisa para la altura, se afloja, sin pasarse
    expect(nearRelax(320, 260)).toBeGreaterThan(1.5);
    expect(nearRelax(5000, 260)).toBeCloseTo(1 + DETAIL.fastK, 6);
    // rasante (7 m): la altura cuenta como 60 m para esto
    expect(nearRelax(15, 7)).toBe(1);
  });

  it('lo lejano pide menos detalle, y con mucha cola, menos', () => {
    expect(farFactor(0)).toBe(DETAIL.far);
    expect(farFactor(DETAIL.backlog0)).toBe(DETAIL.far);
    expect(farFactor(DETAIL.backlog0 + DETAIL.backlogK / 2)).toBeCloseTo((DETAIL.far + DETAIL.farMax) / 2, 6);
    expect(farFactor(5000)).toBe(DETAIL.farMax);
  });

  it('debajo de ti y alrededor, la nitidez elegida; el cambio, poco a poco con la distancia', () => {
    const near = 20, agl = 260;
    expect(errorAt(near, 2, 0, agl)).toBe(near);
    // a 500 m, casi igual (menos de un 5 % más)
    expect(errorAt(near, 2, 500, agl)).toBeLessThan(near * 1.05);
    // a 1 km, menos de un 12 % más
    expect(errorAt(near, 2, 1000, agl)).toBeLessThan(near * 1.12);
    // al fondo (8 km, con calima), casi el doble
    expect(errorAt(near, 2, 8000, agl)).toBeGreaterThan(near * 1.95);
    // siempre creciente
    let prev = 0;
    for (let d = 0; d <= 10000; d += 250) {
      const e = errorAt(near, 2, d, agl);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it('más alto, el cambio va más lejos', () => {
    expect(fallDist(260)).toBe(12 * 260);
    expect(fallDist(50)).toBe(DETAIL.fallMin);
    expect(fallDist(5000)).toBe(60000);
  });
});
