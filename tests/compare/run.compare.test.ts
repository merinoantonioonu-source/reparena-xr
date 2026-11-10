// Lo que se guarda al acabar la ronda (src/core/run.ts: kcalOf y runRecord) frente al código original de RepArena
// (src/00_core.js: kcalOf; src/70_game.js: saveRun): las mismas calorías y la misma fila del historial (las dos versiones
// comparten el historial). (Se salta sin RA_DIR.)
import { describe, expect, it } from 'vitest';
import { kcalOf, runRecord } from '../../src/core/run.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe.skipIf(!RA_DIR)('el historial, como en RepArena', () => {
  it('las mismas calorías y la misma fila del historial en 300 rondas al azar', () => {
    const r = rng(9), EXS = ['squat', 'lunge', 'curl', 'pushup', 'inchworm', 'dips', 'superman', 'splank', 'plank1', 'swing', 'zzz'];
    for (let i = 0; i < 300; i++) {
      const ex = EXS[Math.floor(r() * EXS.length)], kg = 40 + Math.floor(r() * 80), time = r() * 1800, work = time * r(), reps = Math.floor(r() * 80), toFail = r() < 0.3, wave = 1 + Math.floor(r() * 12);
      const store: Record<string, unknown> = {};
      const settings = { exercise: ex, mode: 'combat', weight: kg, toFail };
      const ra = raRun<{ saveRun(win: boolean): void; kcal: (e: string, w: number, rs: number) => number }>(
        [raSlice('00_core.js', 'const EX_MET'), raSlice('00_core.js', 'const REST_MET'), raSlice('00_core.js', 'function kcalOf'), 'let runSaved = false;', raSlice('70_game.js', 'function saveRun', '// Calorías de esta ronda', false), raSlice('70_game.js', 'const runStatsKcal')].join('\n'),
        '{ saveRun, kcal: (e, w, rs) => kcalOf(e, w, rs) }',
        { settings, stats: { reps, perfect: Math.floor(reps / 2), kills: 3, time, work, bestCombo: 7, hold: 0 }, waveIdx: wave - 1, score: 1234, store: (k: string, v?: unknown) => (v === undefined ? (store[k] ?? null) : (store[k] = v)), HIST_KEY: 'reparena3-history', boardDayRefresh: () => {}, careerRun: () => {}, ARX: {}, TREK: {}, Date: { now: () => 42 } },
      );
      expect(kcalOf(ex, work, time - work, kg)).toBeCloseTo(ra.kcal(ex, work, time - work), 10);
      ra.saveRun(r() < 0.5);
      const raRow = (store['reparena3-history'] as Record<string, unknown>[] | undefined)?.[0] ?? null;
      const row = runRecord({ ex, mode: 'combat', reps, perfect: Math.floor(reps / 2), kills: 3, win: raRow ? (raRow.win as boolean) : false, failWave: toFail ? wave : null, time, work, score: 1234, bestCombo: 7, kg }, 42);
      expect(row).toEqual(raRow);
    }
  }, 60000);
});
