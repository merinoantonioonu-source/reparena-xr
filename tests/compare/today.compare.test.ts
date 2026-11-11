// Lo de hoy para el marcador (src/core/today.ts: dayBoard y dayLive) y el orden de los logros del resumen
// (src/core/run.ts: sumChips) frente al código original de RepArena (src/70_game.js: boardDayRefresh, boardDay y sumChips):
// historiales al azar (varios días, ejercicios, rondas sin calorías guardadas), con la ronda en curso o no, tienen que dar
// lo mismo. (Se salta sin RA_DIR.)
import { describe, expect, it } from 'vitest';
import { DAY_MS, noonOf, type HistRow } from '../../src/core/days.js';
import { sumChips } from '../../src/core/run.js';
import { dayBoard, dayLive } from '../../src/core/today.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

process.env.TZ = 'Europe/Madrid';
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe.skipIf(!RA_DIR)('lo de hoy y los logros del resumen, como en RepArena', () => {
  it('el mismo «hoy» del marcador en 200 historiales al azar', () => {
    const code = [
      raSlice('00_core.js', 'const EX_MET', 'const numTxt', false),
      raSlice('70_game.js', 'const DAYB'),
      raSlice('70_game.js', 'function boardDayRefresh', 'function boardDay()', false),
      raSlice('70_game.js', 'function boardDay()', 'settingHooks.push', false),
    ].join('\n');
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed), now = noonOf(new Date(2026, 2, 10 + Math.floor(r() * 40)).getTime()) + Math.floor(r() * 10) * 36e5, kg = 40 + Math.floor(r() * 60);
      const EXS = ['squat', 'lunge', 'curl', 'pushup', 'zzz'], x = EXS[Math.floor(r() * EXS.length)], h: HistRow[] = [];
      for (let i = 0, n = Math.floor(r() * 30); i < n; i++) {
        const ex = EXS[Math.floor(r() * EXS.length)], time = Math.floor(r() * 900), row: HistRow = { ex, mode: 'combat', reps: Math.floor(r() * 80), perfect: 3, win: r() < 0.5, time, date: now - Math.floor(r() * 12) * DAY_MS - Math.floor(r() * 20) * 36e5 };
        if (r() < 0.6) row.kcal = Math.round(r() * 300) / 10;
        h.push(row);
      }
      const frozen = r() < 0.3 ? [] : ['2026-03-0' + (1 + Math.floor(r() * 8))];
      const live = r() < 0.5 ? { time: Math.floor(r() * 600), kcal: r() * 30, n: r() * 50 } : null;
      const settings = { exercise: x, weight: kg };
      const state = { v: live ? 'play' : 'menu' };
      const stats = { time: live?.time ?? 0, reps: live?.n ?? 0, hold: 0, work: 0 };
      const ra = raRun<{ refresh(): void; day(): Record<string, number>; B: Record<string, number> }>(code, '{ refresh: boardDayRefresh, day: boardDay, B: DAYB }', {
        settings,
        store: (k: string) => (k === 'reparena3-history' ? JSON.parse(JSON.stringify(h)) : k === 'reparena3-career' ? { frozen, shield: 0 } : null),
        HIST_KEY: 'reparena3-history',
        Date: class extends Date { constructor(...a: unknown[]) { super(...((a.length ? a : [now]) as [number])); } static now() { return now; } },
        get state() { return state.v; },
        GAME_STATES: ['calib', 'ready', 'play', 'rest', 'mount'],
        get stats() { return stats; },
        get runSaved() { return false; },
        runStatsKcal: () => live?.kcal ?? 0,
        get boardDirty() { return false; },
        set boardDirty(_v: boolean) {},
      });
      ra.refresh();
      const D = dayBoard(h, now, x, frozen, kg);
      expect(D, `semilla ${seed}`).toEqual({ time: ra.B.time, kcal: ra.B.kcal, ex: ra.B.ex, best: ra.B.best, streak: ra.B.streak });
      expect(dayLive(D, live), `semilla ${seed}`).toEqual(ra.day());
    }
  });

  it('los logros del resumen, en el mismo orden', () => {
    const sum = raRun<(chips: [string, string][], G: { notes: [string, string][] } | null) => [string, string][]>(raSlice('70_game.js', 'const sumChips'), 'sumChips', {});
    const r = rng(5), pool: [string, string][] = [['¡Cofre del día! +100 XP', '#ffd166'], ['¡Nivel 4! Ahora eres Aprendiz', '#ffd166'], ['Desbloqueado: Rayo: Plasma', '#ff4fa3'], ['Misión cumplida: Haz 60 repeticiones', '#3cf0c6'], ['Campaña: una estrella nueva', '#ffd166'], ['Un escudo salvó tu racha: 3 días', '#7fd4ff']];
    const pick = (a: [string, string][]): [string, string][] => a.filter(() => r() < 0.5);
    for (let i = 0; i < 300; i++) {
      const chips = pick([['¡Nuevo récord!', '#ffd166'], ['3 días seguidos', '#3cf0c6'], ['¡Récord al fallo!', '#ffd166']]), notes = r() < 0.2 ? null : pick(pool);
      expect(sumChips(chips, notes)).toEqual(sum(chips, notes ? { notes } : null));
    }
  });
});
