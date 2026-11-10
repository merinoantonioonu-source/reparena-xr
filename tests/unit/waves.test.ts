// Las oleadas (src/combat/waves.ts): la resistencia de los que salen suma las repeticiones, el jefe en la última, la
// escalera (primero los fáciles) y lo que sale aquí de cada uno de RepArena.
import { describe, expect, it } from 'vitest';
import { buildWave, FOE_TIER, isBossWave, ladderTop, rampAfter, repPoints, spawnGap, xrFoe, type WaveEnv } from '../../src/combat/waves.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const env = (o: Partial<WaveEnv> = {}): WaveEnv => ({ reps: 12, twoShots: false, foes: 'robots', ground: ['zombie', 'yeti', 'raptor'], fly: [], waves: 5, rank: 2, ladder: true, hp: () => 2, tier: (k) => FOE_TIER[k] || 2, rnd: rng(1), ...o });

describe('las oleadas', () => {
  it('la resistencia de los que salen suma las repeticiones de la oleada (el doble con dos disparos)', () => {
    for (let i = 0; i < 5; i++) {
      const w = buildWave(i, env({ reps: 12 + 3 * i }), new Set());
      expect(w.list.reduce((a, s) => a + s.hp, 0)).toBe(12 + 3 * i);
      const w2 = buildWave(i, env({ reps: 12 + 3 * i, twoShots: true }), new Set());
      expect(w2.list.reduce((a, s) => a + s.hp, 0)).toBe(2 * (12 + 3 * i));
    }
  });
  it('el jefe sale en la última oleada (al fallo, cada quinta), con un 30 % de las repeticiones', () => {
    expect(isBossWave(4, 5)).toBe(true);
    expect(isBossWave(3, 5)).toBe(false);
    expect(isBossWave(9, 0)).toBe(true);
    const w = buildWave(4, env({ ground: ['captain', 'zombie'] }), new Set()), b = w.list[w.list.length - 1];
    expect(b.kind).toBe('captainboss');
    expect(b.hp).toBe(4);
    expect(buildWave(4, env({ ground: ['raptor'] }), new Set()).list.at(-1)!.kind).toBe('raptorboss');
    expect(buildWave(4, env({ foes: 'flyers', ground: [], fly: ['bee', 'dragon'] }), new Set()).list.at(-1)!.kind).toBe('dragon');
  });
  it('la escalera: en la primera oleada, solo los fáciles; luego entran los duros, que se anuncian', () => {
    expect(ladderTop(0, 0, 5)).toBe(1);
    expect(ladderTop(4, 0, 5)).toBe(4);
    const seen = new Set<string>(), w0 = buildWave(0, env(), seen);
    expect(new Set(w0.list.map((s) => s.kind))).toEqual(new Set(['zombie']));
    let fresh: string[] = [];
    for (let i = 1; i < 5; i++) fresh = fresh.concat(buildWave(i, env(), seen).fresh);
    expect(fresh).toContain('raptor');
    expect(fresh).toContain('yeti');
  });
  it('lo de RepArena que aquí es otro: el lanzador, los jefes, la nodriza y los geométricos', () => {
    expect(xrFoe('impthrow')).toEqual({ k: 'thrower', boss: false });
    expect(xrFoe('zombieboss')).toEqual({ k: 'zombie', boss: true });
    expect(xrFoe('carrier')).toEqual({ k: 'dragon', boss: true });
    expect(xrFoe('scout')).toEqual({ k: 'zgreen', boss: false });
  });
  it('la dificultad sube solo con la oleada superada con soltura; los puntos, más con combo y perfecta', () => {
    expect(rampAfter(true, 1, 12, 10, 0, 0.6).up).toBe(true);
    expect(rampAfter(true, 5, 12, 10, 0, 0.6).up).toBe(false);
    expect(rampAfter(true, 0, 12, 0, 0, 0.6).up).toBe(false);
    expect(repPoints(false, 1)).toBe(55);
    expect(repPoints(true, 10)).toBe(200);
    expect(spawnGap([{ kind: 'zombie', hp: 2 }], 2.3, false, false, 0, 0)).toBeCloseTo(3.91);
    expect(spawnGap([{ kind: 'zombie', hp: 2 }], 2.3, false, false, 4, 0)).toBe(4);
  });
});
