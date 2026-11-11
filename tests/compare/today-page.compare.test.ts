// «Hoy», el progreso y el historial de la página (src/page/today-html.ts) frente al código original de RepArena
// (src/00_core.js: renderToday y renderHistory; src/73_career.js: careerHTML): historiales y carreras al azar (sin
// partidas, hoy con y sin repeticiones, meta cumplida, mejor día batido, escudos que se gastan solos y su aviso, cofre
// abierto o no, misiones de días viejos) tienen que dar el mismo HTML, letra por letra. (Se salta sin RA_DIR.)
import { describe, expect, it } from 'vitest';
import { CAREER_KEY, Career } from '../../src/core/career.js';
import { DAY_MS, dayKey, noonOf, type HistRow } from '../../src/core/days.js';
import { HIST_KEY } from '../../src/core/run.js';
import { careerHTML, historyHTML, todayHTML } from '../../src/page/today-html.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

process.env.TZ = 'Europe/Madrid';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const memStore = (m: Record<string, string>) => <T>(k: string, v?: T): T | null => {
  if (v === undefined) return k in m ? (JSON.parse(m[k]) as T) : null;
  m[k] = JSON.stringify(v);
  return null;
};
const EXS = ['squat', 'lunge', 'curl', 'curl2', 'pushup', 'hang', 'row', 'slam', 'jump', 'zzz'];
const MODES = ['combat', 'combat', 'arcs', 'touch', 'bars', 'trek'];

describe.skipIf(!RA_DIR)('«Hoy» y el historial de la página, como en RepArena', () => {
  it('el mismo HTML en 400 historiales y carreras al azar', () => {
    const code = [
      raSlice('00_core.js', 'const clamp'),
      raSlice('00_core.js', 'const EX_NAMES'),
      raSlice('00_core.js', 'const EX_SHORT'),
      raSlice('00_core.js', 'const MODE_NAMES'),
      raSlice('00_core.js', 'const MODE_EX', 'const exOk'),
      raSlice('00_core.js', 'const RANKS'),
      raSlice('00_core.js', 'function decimals'),
      raSlice('00_core.js', 'function fmtNum'),
      raSlice('00_core.js', 'const EX_MET', 'function renderHistory', false),
      raSlice('00_core.js', 'function renderHistory', '}'),
      raSlice('60_ui.js', 'const mmss'),
      raSlice('73_career.js', 'const CAREER_KEY', '/* ---------- Dibujos', false),
      raSlice('73_career.js', 'function careerHTML', '/* ---------- Metas de hoy', false),
    ].join('\n');
    const count = { empty: 0, noToday: 0, goal: 0, bestBeat: 0, savedMsg: 0, chest: 0, shields: 0, oldMis: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const now = noonOf(new Date(2026, 2, 1 + Math.floor(r() * 60)).getTime()) + (r() * 11 - 5) * 36e5;
      const m: Record<string, string> = {}, put = (k: string, v: unknown) => { m[k] = JSON.stringify(v); };
      const row = (t: number, big = false): HistRow => {
        const reps = Math.floor(r() * 90), time = big ? 600 + Math.round(r() * 3000) : Math.round(30 + r() * 700);
        const o: HistRow = { ex: EXS[Math.floor(r() * EXS.length)], mode: MODES[Math.floor(r() * MODES.length)], reps, perfect: Math.floor(reps * r()), win: r() < 0.6, time, date: t };
        if (r() < 0.7) o.kcal = Math.round(r() * 900) / 10;
        if (r() < 0.05) delete o.time;
        return o;
      };
      if (r() > 0.1) {
        const h: HistRow[] = [], gapEnd = r() < 0.4 ? 1 + Math.floor(r() * 4) : 0;
        for (let d = 20; d >= gapEnd; d--) if (r() < 0.5) for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) h.push(row(noonOf(now) - d * DAY_MS + (r() * 8 - 4) * 36e5, d === 0 && r() < 0.5));
        if (h.length) put(HIST_KEY, h);
      }
      const p = r();
      if (p < 0.7) {
        const saved: Record<string, unknown> = { xp: Math.floor(r() * 5000), seeded: r() < 0.8, own: [], equip: {}, shield: Math.floor(r() * 4), frozen: r() < 0.3 ? [dayKey(now - 3 * DAY_MS)] : [], camp: {} };
        if (r() < 0.15) saved.saved = { day: dayKey(now), n: 1 + Math.floor(r() * 3), told: false };
        const q = r();
        if (q < 0.5) saved.mis = { day: dayKey(now), list: [{ t: 'reps', n: 70, got: Math.floor(r() * 90), done: r() < 0.4 }, { t: 'mins', n: 15, got: r() * 20, done: r() < 0.3 }, { t: r() < 0.5 ? 'ex' : 'star', n: 1, got: 0, done: r() < 0.2, arg: 'curl2' }], chest: r() < 0.4 };
        else if (q < 0.7) saved.mis = { day: '2020-01-01', list: [], chest: true };
        put(CAREER_KEY, saved);
      }
      const settings = { exercise: 'squat', mode: 'combat', goalMin: 5 + Math.floor(r() * 30), weight: 45 + Math.floor(r() * 60) };
      class FakeDate extends Date {
        constructor(...a: unknown[]) {
          super(...((a.length ? a : [now]) as [number]));
        }
        static now() {
          return now;
        }
      }
      const raM = { ...m }, ptM = { ...m }, out: Record<string, { innerHTML: string }> = {};
      const ra = raRun<{ renderHistory(): void }>(code, '({ renderHistory })', {
        Date: FakeDate,
        settings,
        store: memStore(raM),
        HIST_KEY,
        CAMP: { orig: null, run: null, env: null },
        trophy: () => {},
        cheer: () => {},
        state: 'menu',
        stats: { reps: 0, hold: 0, time: 0, perfect: 0, bestCombo: 0 },
        score: 0,
        SES: { active: false },
        $: (s: string) => (out[s] ??= { innerHTML: '' }),
      });
      const cr = new Career({ store: memStore(ptM), now: () => now, goalMin: () => settings.goalMin, random: Math.random, kg: () => settings.weight, playMode: () => true, playEx: () => true, trophy: () => {}, cheer: () => {} });
      // dos veces: la segunda, ya con las misiones de hoy y los escudos gastados
      for (const pass of [1, 2]) {
        ra.renderHistory();
        const h = (ptM[HIST_KEY] ? JSON.parse(ptM[HIST_KEY]) : []) as HistRow[];
        const frozen = cr.streakSave().frozen, shield = cr.streakSave(), L = cr.lvlOf(), M = cr.misToday();
        const T = todayHTML({ h, now, goalMin: settings.goalMin, kg: settings.weight, shield, career: careerHTML(L, M, cr.cr.shield) });
        const H = historyHTML({ h, now, kg: settings.weight, frozen });
        const at = `semilla ${seed}, vez ${pass}`;
        expect(out['#todayBox'].innerHTML.length, at).toBeGreaterThan(1000);
        expect(T.box, at).toBe(out['#todayBox'].innerHTML);
        expect(T.mini, at).toBe(out['#todayMini'].innerHTML);
        expect(H.prog, at).toBe(out['#progBox'].innerHTML);
        expect(H.body, at).toBe(out['#histBody'].innerHTML);
        expect(ptM[CAREER_KEY], at).toBe(raM[CAREER_KEY]);
        if (pass === 1) {
          const box = T.box;
          if (!h.length) count.empty++;
          if (box.includes('Aún no has entrenado hoy') || box.includes('buen día para empezar')) count.noToday++;
          if (box.includes('¡Meta cumplida!')) count.goal++;
          if (box.includes('Y es tu mejor día')) count.bestBeat++;
          if (box.includes('Un escudo ha salvado')) count.savedMsg++;
          if (box.includes('Cofre del día abierto')) count.chest++;
          if (box.includes('🛡 1 escudo') || box.includes('escudos</em>')) count.shields++;
          if (m[CAREER_KEY]?.includes('2020-01-01')) count.oldMis++;
        }
      }
    }
    // que el azar haya pasado por todos los casos
    for (const [k, v] of Object.entries(count)) expect(v, k).toBeGreaterThan(3);
  });
});
