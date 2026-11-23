// Los enemigos de élite y el jefe errante (src/combat/elite.ts): cuántos salen, de qué clase y que la oleada pida lo mismo.
import { describe, expect, it } from 'vitest';
import { eliteChance, ELITES, roamKindOf, spiceWave, type SpiceEnv } from '../../src/combat/elite.js';
import type { WaveSpec } from '../../src/combat/waves.js';

function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const wave = (n: number): WaveSpec[] => Array.from({ length: n }, (_, j) => ({ kind: j % 4 === 3 ? 'bee' : 'zombie', hp: 2 }));
const env = (o: Partial<SpiceEnv> = {}): SpiceEnv => ({ i: 4, rank: 3, elites: true, roam: false, bossWave: false, ground: ['zombie', 'skull'], isGround: (k) => k !== 'bee', rnd: rng(7), ...o });

describe('los de élite', () => {
  it('en la primera oleada, ninguno; luego, cada vez más (como mucho uno de cada tres)', () => {
    expect(eliteChance(0, 6)).toBe(0);
    expect(eliteChance(1, 0)).toBeGreaterThan(0);
    expect(eliteChance(5, 3)).toBeGreaterThan(eliteChance(2, 3));
    expect(eliteChance(40, 6)).toBeLessThanOrEqual(0.33);
  });

  it('solo los de tierra, nunca dos seguidos, con un rasgo de los cinco', () => {
    let n = 0;
    for (let seed = 1; seed < 60; seed++) {
      const L = wave(12);
      spiceWave(L, env({ rnd: rng(seed), i: 8 }));
      L.forEach((s, j) => {
        if (!s.elite) return;
        n++;
        expect(s.kind).not.toBe('bee');
        expect(ELITES).toContain(s.elite);
        expect(L[j - 1]?.elite).toBeFalsy();
      });
    }
    expect(n).toBeGreaterThan(20);
  });

  it('sin «Enemigos de élite», ninguno', () => {
    const L = wave(12);
    spiceWave(L, env({ elites: false }));
    expect(L.some((s) => s.elite)).toBe(false);
  });
});

describe('el jefe errante', () => {
  it('a veces, a mitad de la oleada, con la vida de los que quedaban al final (las mismas repeticiones)', () => {
    let seen = 0;
    for (let seed = 1; seed < 80; seed++) {
      const L = wave(10), before = L.reduce((a, s) => a + s.hp, 0);
      const r = spiceWave(L, env({ elites: false, roam: true, rnd: rng(seed) }));
      expect(L.reduce((a, s) => a + s.hp, 0)).toBe(before);
      if (!r) continue;
      seen++;
      const b = L.find((s) => s.roam)!;
      expect(b.hp).toBeGreaterThanOrEqual(3);
      expect(['zombieboss', 'skullboss']).toContain(b.kind);
      expect(L.indexOf(b)).toBeGreaterThan(0);
      expect(L.indexOf(b)).toBeLessThan(L.length - 1);
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('nunca en la oleada del jefe ni en las dos primeras', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(spiceWave(wave(10), env({ elites: false, roam: true, bossWave: true, rnd: rng(seed) }))).toBe(false);
      expect(spiceWave(wave(10), env({ elites: false, roam: true, i: 1, rnd: rng(seed) }))).toBe(false);
    }
  });

  it('el jefe de cada clase', () => {
    expect(roamKindOf('robot')).toBe('titan');
    expect(roamKindOf('puglin')).toBe('impboss');
    expect(roamKindOf('yeti')).toBe('yetiboss');
  });
});
