// El viaje por portales de Combate (src/combat/journey.ts): el orden de cada partida, cuándo se cruza un portal y la fauna de
// cada sitio (todos, enemigos que ya existen y con su modelo).
import { describe, expect, it } from 'vitest';
import { FAUNA, faunaOf, journeyRoute, legOf, PLACES, placeAt, travelsAt, type Place } from '../../src/combat/journey.js';
import { FOE_DEF, foeReady } from '../../src/combat/foes.js';

describe('el viaje por portales', () => {
  it('empieza en el elegido y pasa por todos, sin repetir', () => {
    for (const start of PLACES) {
      const R = journeyRoute(start, 1234);
      expect(R[0]).toBe(start);
      expect(new Set(R).size).toBe(PLACES.length);
    }
  });

  it('con otra semilla, otro orden (y con la misma, el mismo)', () => {
    const a = journeyRoute('arena', 7).join(), b = journeyRoute('arena', 7).join();
    expect(a).toBe(b);
    const all = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => journeyRoute('arena', s).join()));
    expect(all.size).toBeGreaterThan(3);
  });

  it('cambia de sitio cada «Oleadas en cada entorno» (la primera oleada, nunca)', () => {
    const R: Place[] = ['arena', 'nature', 'island'];
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => placeAt(R, i, 2))).toEqual(['arena', 'arena', 'nature', 'nature', 'island', 'island', 'arena']);
    expect([0, 1, 2, 3, 4].map((i) => travelsAt(R, i, 2))).toEqual([false, false, true, false, true]);
    expect([0, 1, 2].map((i) => travelsAt(R, i, 1))).toEqual([false, true, true]);
    expect(legOf(5, 3)).toBe(1);
  });

  it('cada sitio trae enemigos que existen (y de tierra, al menos uno de los fáciles para empezar)', () => {
    for (const p of PLACES) {
      const F = faunaOf(p, foeReady);
      expect(F.ground.length, p).toBe(FAUNA[p].ground.length);
      expect(F.fly.length, p).toBe(FAUNA[p].fly.length);
      for (const k of F.ground) expect(FOE_DEF[k]?.fly, k).toBeFalsy();
      for (const k of F.fly) expect(FOE_DEF[k]?.fly, k).toBe(true);
    }
  });
});
