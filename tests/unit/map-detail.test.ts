/** El detalle del mapa: lo de cerca, a la nitidez elegida; lo lejano, con menos; deprisa, algo menos cerca. */
import { describe, expect, it } from 'vitest';
import { DETAIL, errorAt, fallDist, farFactor, MEM, nearRelax, squeezeFar, squeezeNear, squeezeStep } from '../../src/modes/trek/map/map-detail.js';

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

describe('la memoria del mapa: nunca se llena, se aprieta lo que se pide', () => {
  const run = (q: number, usedMB: number, fps: number, loading: boolean, secs: number): number => {
    for (let t = 0; t < secs; t += 0.5) q = squeezeStep(q, usedMB, fps, loading, 0.5);
    return q;
  };

  it('con holgura no aprieta nada: la nitidez elegida', () => {
    expect(run(0, MEM.budgetMB * 0.5, 72, false, 30)).toBe(0);
    expect(squeezeFar(0)).toBe(DETAIL.far);
    expect(squeezeNear(0)).toBe(1);
  });

  it('pasado el presupuesto aprieta deprisa: primero lo lejano y, si no basta, lo cercano', () => {
    // como en el registro del usuario: 631 MB en uso
    const q3 = run(0, 631, 23, true, 3), q12 = run(0, 631, 23, true, 12);
    expect(q3).toBeGreaterThan(0.4);
    expect(q3).toBeLessThan(1); // (a los 3 s, aún solo lo lejano)
    expect(squeezeNear(q3)).toBe(1);
    expect(squeezeFar(q3)).toBeGreaterThan(DETAIL.far);
    expect(q12).toBeGreaterThan(1); // (si sigue pasado, también lo cercano)
    expect(squeezeNear(q12)).toBeGreaterThan(1);
    // nunca más del tope
    expect(run(0, 5000, 23, true, 60)).toBe(2);
    expect(squeezeFar(2)).toBe(DETAIL.farMax);
    expect(squeezeNear(2)).toBe(2);
  });

  it('afloja despacio y sin vaivén: cerca del presupuesto se queda como está', () => {
    expect(run(1.5, MEM.budgetMB * 0.9, 72, false, 60)).toBe(1.5);
    const q = run(1.5, MEM.budgetMB * 0.4, 72, false, 5);
    expect(q).toBeLessThan(1.5);
    expect(q).toBeGreaterThan(0.9); // (despacio: pasarse es lo peligroso)
    expect(run(1.5, MEM.budgetMB * 0.4, 72, false, 60)).toBe(0);
  });

  it('con pocas imágenes por segundo aprieta solo lo lejano, y no mientras carga', () => {
    const q = run(0, 200, 22, false, 60);
    expect(q).toBe(MEM.fpsMax);
    expect(squeezeNear(q)).toBe(1);
    // cargando, las imágenes por segundo bajan por la carga: no cuenta
    expect(run(0, 200, 22, true, 60)).toBe(0);
    // y con pocas imágenes por segundo no afloja
    expect(run(0.4, 200, 34, false, 30)).toBe(0.4);
  });

  it('el tope de la memoria queda lejos de lo que se quiere usar', () => {
    expect(MEM.keepMB).toBeGreaterThan(MEM.budgetMB);
    expect(MEM.hardMB).toBeGreaterThan(MEM.budgetMB * 1.5);
    expect(MEM.ceilMB).toBeGreaterThan(MEM.hardMB);
  });
});
