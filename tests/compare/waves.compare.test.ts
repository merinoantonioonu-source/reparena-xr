// Las oleadas portadas (src/combat/waves.ts: buildWave, con la escalera y los jefes) frente al código original de RepArena
// (src/70_game.js: buildWave, isBossWave, ladderTop y ladderPick): rondas al azar (elegidos, rango, oleadas, escalera, dos
// disparos…), con el mismo azar, tienen que dar los mismos enemigos, con la misma resistencia, en el mismo orden, y los
// mismos «entra en juego». (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { buildWave, FOE_TIER, type WaveEnv } from '../../src/combat/waves.js';
import { FOE_FLY, FOE_GATE, FOE_HATCH } from '../../src/core/catalog.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });

describe.skipIf(!RA_DIR)('las oleadas, como en RepArena', () => {
  it('los mismos enemigos, con la misma resistencia, en 400 rondas al azar', () => {
    const code = [raSlice('70_game.js', 'function isBossWave', 'function buildWave', false), raSlice('70_game.js', 'function buildWave', '// Robots: una compuerta', false)].join('\n');
    let n = 0, bosses = 0, fresh = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed), pickN = (l: string[], m: number) => l.filter(() => r() < m / l.length);
      const tiny = r() < 0.3, ground = pickN((tiny ? FOE_HATCH : FOE_GATE).map((o) => o[0]), 3), fly = pickN(FOE_FLY.map((o) => o[0]), 2);
      const F = !ground.length ? 'flyers' : !fly.length ? 'robots' : (['robots', 'flyers', 'mix'] as const)[Math.floor(r() * 3)];
      const waves = r() < 0.3 ? 0 : 3 + Math.floor(r() * 8), rank = Math.floor(r() * 7), ladder = r() < 0.6, two = r() < 0.3;
      const repsWave = 6 + Math.floor(r() * 14), repsInc = Math.floor(r() * 3);
      const devHp: Record<string, number> = {};
      const hp = (key: string) => (devHp[key] ??= 1 + Math.floor(r() * 3));
      const tier = (k: string) => FOE_TIER[k] || 2;
      const raR = rng(seed * 17), ptR = rng(seed * 17);
      const settings = { mode: 'combat', foeLadder: ladder, waves, repsWave, repsInc };
      const ra = raRun<(i: number) => { kind: string; hp: number; fk?: string }[]>(code, '(i) => ({ list: buildWave(i), fresh: LADDER.fresh })', {
        settings,
        Math: mathWith(raR),
        isBars: () => false,
        waveReps: (i: number) => Math.max(1, Math.round(repsWave + repsInc * i)),
        twoShots: () => two,
        foes: () => F,
        isTiny: () => tiny,
        groundList: () => ground,
        flyList: () => fly,
        isCombat: () => true,
        nWaves: () => waves,
        rankIdx: () => rank,
        foeTier: tier,
        devFoe: (key: string) => ({ hp: hp(key), str: 1, tier: 0 }),
        pick: <T>(a: T[]) => a[Math.floor(raR() * a.length)],
      }) as unknown as (i: number) => { list: { kind: string; hp: number; fk?: string }[]; fresh: string[] };
      const seen = new Set<string>();
      for (let i = 0; i < (waves || 11); i++) {
        const a = ra(i);
        const env: WaveEnv = { reps: Math.max(1, Math.round(repsWave + repsInc * i)), twoShots: two, foes: F, ground, fly, waves, rank, ladder, hp, tier, rnd: ptR, tiny };
        const b = buildWave(i, env, seen);
        expect(b.list.map((s) => [s.kind, s.hp, s.fk ?? '']), `semilla ${seed}, oleada ${i}`).toEqual(a.list.map((s) => [s.kind, s.hp, s.fk ?? '']));
        expect(b.fresh, `semilla ${seed}, oleada ${i}`).toEqual(a.fresh);
        if (b.list.some((s) => /boss|titan|dragon|carrier/.test(s.kind))) bosses++;
        fresh += b.fresh.length;
        n++;
      }
    }
    expect(n).toBeGreaterThan(2000);
    expect(bosses).toBeGreaterThan(300);
    expect(fresh).toBeGreaterThan(50);
  });
});
