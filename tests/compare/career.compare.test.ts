// La carrera portada (src/core/career.ts y src/core/days.ts) frente al código original de RepArena (src/73_career.js y los
// días de src/00_core.js): muchas semanas al azar (días entrenados y saltados, rondas con sus misiones y récords en plena
// ronda, cofres, escudos que se gastan solos, subidas de nivel, la campaña, colores) tienen que dar lo mismo guardado, las
// mismas notas del resumen, los mismos avisos grandes, la misma racha, los mismos días y las mismas misiones. (Se salta sin
// RA_DIR.)
import { describe, expect, it } from 'vitest';
import { CAREER_KEY, Career, type CampRun, type LiveStats, type MisItem, type RunInfo } from '../../src/core/career.js';
import { DAY_MS, dayKey, dayStats, noonOf, type HistRow } from '../../src/core/days.js';
import { HIST_KEY } from '../../src/core/run.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

// (con cambio de hora: el 29 de marzo y el 25 de octubre de 2026 en Madrid)
process.env.TZ = 'Europe/Madrid';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });
const js = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
const memStore = (m: Record<string, string>) => <T>(k: string, v?: T): T | null => {
  if (v === undefined) return k in m ? (JSON.parse(m[k]) as T) : null;
  m[k] = JSON.stringify(v);
  return null;
};

interface RA {
  careerRun(o: RunInfo): void;
  careerTake(): unknown;
  misToday(): { list: MisItem[] };
  misLive(): void;
  recLive(): void;
  misLeft(): number;
  progress(): unknown;
  dayStats(h: HistRow[]): unknown;
  lvlOf(): unknown;
  lookHex(k: string): number;
  lookSet(k: string, v: string): void;
  nextUnlock(): unknown;
  lockedLooks(): unknown;
  campStars(id: string): number;
  campOf(id: string): unknown;
  misShort(m: MisItem): string;
  bestRunOf(h: HistRow[], ex: string, mode: string): unknown;
  CAMP: { run: CampRun | null };
}

const EXS = ['squat', 'lunge', 'curl', 'curl2', 'pushup', 'hang', 'row', 'slam', 'jump', 'press', 'zzz'];
const MODES = ['combat', 'combat', 'arcs', 'touch', 'bars', 'trek'];
const LOOK_V: Record<string, string[]> = { hands: ['teal', 'pink', 'gold', 'lime', 'violet', 'white', 'nope'], bolt: ['blue', 'white', 'lime', 'violet'] };

describe.skipIf(!RA_DIR)('la carrera, como en RepArena', () => {
  it('lo mismo guardado, las mismas notas, avisos, racha, días y misiones en 120 temporadas al azar', () => {
    const code = [
      raSlice('00_core.js', 'const clamp'),
      raSlice('00_core.js', 'const EX_NAMES'),
      raSlice('00_core.js', 'const EX_SHORT'),
      raSlice('00_core.js', 'const MODE_NAMES'),
      raSlice('00_core.js', 'const MODE_EX', 'const exOk'),
      raSlice('00_core.js', 'const RANKS'),
      raSlice('00_core.js', 'const EX_MET', 'const numTxt', false),
      raSlice('60_ui.js', 'const mmss'),
      raSlice('73_career.js', 'const CAREER_KEY', '/* ---------- Dibujos', false),
      raSlice('73_career.js', 'function bestRunOf'),
      raSlice('73_career.js', 'const misGot'),
      raSlice('73_career.js', 'const MIS_SHORT'),
      raSlice('73_career.js', 'const misShort'),
    ].join('\n');
    const count = { chest: 0, shieldSpent: 0, levelUp: 0, camp: 0, rec: 0, misLive: 0, mode: 0, ex: 0, notes: 0 };
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed), raR = rng(seed * 7 + 1), ptR = rng(seed * 7 + 1);
      const clock = { t: new Date(2026, 2, 1 + Math.floor(r() * 20), 9).getTime() + Math.floor(r() * 300) * DAY_MS / 3 };
      clock.t = noonOf(clock.t) + (r() * 10 - 4) * 36e5;
      class FakeDate extends Date {
        constructor(...a: unknown[]) {
          super(...((a.length ? a : [clock.t]) as [number]));
        }
        static now() {
          return clock.t;
        }
      }
      const raM: Record<string, string> = {}, ptM: Record<string, string> = {};
      const put = (k: string, v: unknown) => { raM[k] = ptM[k] = JSON.stringify(v); };
      const hist = (): HistRow[] => (HIST_KEY in ptM ? JSON.parse(ptM[HIST_KEY]) : []);
      const row = (t: number, ex = EXS[Math.floor(r() * EXS.length)], mode = MODES[Math.floor(r() * MODES.length)], reps = Math.floor(r() * 90)): HistRow => {
        const time = Math.round(60 + r() * 900), o: HistRow = { ex, mode, reps, perfect: Math.floor(reps * r()), kills: 3, win: r() < 0.6, time, work: Math.round(time * 0.7), score: Math.floor(r() * 3000), combo: Math.floor(r() * 20), date: t };
        if (r() < 0.25) o.fail = 1 + Math.floor(r() * 9);
        if (r() < 0.8) o.kcal = Math.round(r() * 1500) / 10;
        if (mode === 'arcs' || mode === 'trek') o.dist = Math.floor(r() * 800);
        return o;
      };
      // el historial de antes (con días saltados) y lo guardado de la carrera (a veces de una versión vieja o roto)
      if (r() < 0.85) {
        const h: HistRow[] = [], gapEnd = r() < 0.5 ? 1 + Math.floor(r() * 5) : 0;
        for (let d = 30; d >= gapEnd; d--) if (r() < 0.55) for (let k = 0; k < 1 + Math.floor(r() * 2); k++) h.push(row(noonOf(clock.t) - d * DAY_MS + (r() * 8 - 3) * 36e5));
        if (h.length) put(HIST_KEY, h);
      }
      const p = r();
      if (p < 0.2) put(CAREER_KEY, 'roto');
      else if (p < 0.75) {
        const saved: Record<string, unknown> = { xp: Math.floor(r() * 4000), seeded: r() < 0.7, own: r() < 0.3 ? ['hands:white'] : [], equip: r() < 0.5 ? { hands: 'pink', bolt: 'violet' } : {}, shield: r() < 0.15 ? 'x' : Math.floor(r() * 5), frozen: [], camp: { 'combat:squat': { at: 3, stars: { 1: 2, 2: 1 } } } };
        if (r() < 0.4) saved.mis = { day: dayKey(clock.t), list: [{ t: 'star', n: 1, got: 0, done: false }, { t: 'reps', n: 60, got: 10, done: false }, { t: 'clean', n: 1, got: 1, done: true }], chest: false };
        else if (r() < 0.3) saved.mis = { day: '2020-01-01', list: [], chest: true };
        if (r() < 0.1) delete saved.camp;
        put(CAREER_KEY, saved);
      }
      const settings = { exercise: 'squat', mode: 'combat', toFail: 0 as number | boolean, weight: 50 + Math.floor(r() * 60), goalMin: 5 + Math.floor(r() * 25) };
      const w = { state: 'menu', stats: { reps: 0, hold: 0, time: 0, perfect: 0, bestCombo: 0 }, score: 0, session: false, dist: 0 };
      const raTro: unknown[] = [], ptTro: unknown[] = [];
      const CAMP = { orig: null, run: null as CampRun | null, env: null };
      const ra = raRun<RA>(code, '({ careerRun, careerTake, misToday, misLive, recLive, misLeft, progress, dayStats, lvlOf, lookHex, lookSet, nextUnlock, lockedLooks, campStars, campOf, misShort, bestRunOf, CAMP })', {
        Date: FakeDate,
        Math: mathWith(raR),
        settings,
        store: memStore(raM),
        HIST_KEY,
        CAMP,
        trophy: (...a: unknown[]) => raTro.push(['trophy', ...a]),
        cheer: (...a: unknown[]) => raTro.push(['cheer', ...a]),
        get state() { return w.state; },
        get stats() { return w.stats; },
        get score() { return w.score; },
        get SES() { return { active: w.session }; },
        get ARX() { return { dist: w.dist }; },
        get TREK() { return { dist: w.dist }; },
      });
      const cr = new Career({
        store: memStore(ptM),
        now: () => clock.t,
        goalMin: () => settings.goalMin,
        random: ptR,
        kg: () => settings.weight,
        playMode: () => true,
        playEx: () => true,
        trophy: (...a: unknown[]) => ptTro.push(['trophy', ...a]),
        cheer: (...a: unknown[]) => ptTro.push(['cheer', ...a]),
      });
      const shields = () => (JSON.parse(ptM[CAREER_KEY]) as { shield: number }).shield;
      const check = (where: string) => {
        const at = `semilla ${seed}, ${where}`;
        expect(js(JSON.parse(ptM[CAREER_KEY])), at).toEqual(js(JSON.parse(raM[CAREER_KEY])));
        expect(js(ptTro), at).toEqual(js(raTro));
        expect(js(cr.progress()), at).toEqual(js(ra.progress()));
        const h = hist();
        expect(js(dayStats(h, clock.t, settings.weight)), at).toEqual(js(ra.dayStats(h)));
        expect(js(cr.lvlOf()), at).toEqual(js(ra.lvlOf()));
        const M = cr.misToday(), RM = ra.misToday();
        expect(js(M), at).toEqual(js(RM));
        expect(M.list.map((m) => cr.misShort(m))).toEqual(RM.list.map((m) => ra.misShort(m)));
        expect(cr.misLeft()).toBe(ra.misLeft());
        for (const k of ['hands', 'bolt'] as const) expect(cr.lookHex(k), at).toBe(ra.lookHex(k));
        expect(js(cr.nextUnlock())).toEqual(js(ra.nextUnlock()));
        expect(js(cr.lockedLooks())).toEqual(js(ra.lockedLooks()));
        expect(js(JSON.parse(ptM[CAREER_KEY]))).toEqual(js(JSON.parse(raM[CAREER_KEY])));
      };
      check('al cargar');
      let run = 0;
      for (let day = 0; day < 14; day++) {
        // al día siguiente o, a veces, unos días después (los escudos se gastan solos)
        const sh0 = shields();
        clock.t = noonOf(clock.t + DAY_MS * (1 + (r() < 0.25 ? Math.floor(r() * 4) : 0))) + (r() * 9 - 4) * 36e5;
        check(`día ${day}`);
        if (shields() < sh0) count.shieldSpent++;
        const nRounds = Math.floor(r() * 4);
        for (let k = 0; k < nRounds; k++) {
          const ex = EXS[Math.floor(r() * (EXS.length - 1))], mode = MODES[Math.floor(r() * MODES.length)];
          Object.assign(settings, { exercise: ex, mode, toFail: r() < 0.3 ? 1 : 0 });
          w.session = r() < 0.15; w.state = 'play'; w.stats = { reps: 0, hold: 0, time: 0, perfect: 0, bestCombo: 0 }; w.score = 0; w.dist = 0; run++;
          // en plena ronda: misiones y récords
          for (let f = 0; f < 12; f++) {
            const s = w.stats, add = Math.floor(r() * 9);
            s.reps += add; s.perfect += Math.floor(add * r()); s.time += 20 + r() * 40; s.hold += r() * 6; s.bestCombo = Math.max(s.bestCombo, Math.floor(r() * 25)); w.score += Math.floor(r() * 200); w.dist += r() * 50;
            if (r() < 0.1) w.state = 'rest';
            const live: LiveStats = { run, playing: w.state === 'play', session: w.session, exercise: ex, mode, toFail: !!settings.toFail, reps: s.reps, hold: s.hold, time: s.time, perfect: s.perfect, bestCombo: s.bestCombo, score: w.score, dist: w.dist };
            const n0 = raTro.length;
            ra.misLive(); ra.recLive();
            cr.misLive(live); cr.recLive(live);
            if (raTro.length > n0) (raTro.slice(n0) as string[][]).forEach((t) => (t[1].startsWith('¡RÉCORD') ? count.rec++ : t[0] === 'trophy' && count.misLive++));
            expect(js(ptTro), `semilla ${seed}, ronda ${run}, ${f}`).toEqual(js(raTro));
            w.state = 'play';
            clock.t += 60e3;
          }
          // al acabar: el historial y la carrera (a veces, un nivel de la campaña)
          const s = w.stats, hang = ex === 'hang', reps = hang ? Math.round(s.hold) : s.reps;
          w.state = 'over';
          if (reps) {
            const h = hist(), win = r() < 0.6, taken = r() < 0.45 ? 0 : 1 + Math.floor(r() * 4);
            h.push({ ex, mode, reps, perfect: s.perfect, kills: 2, win, ...(settings.toFail ? { fail: 3 } : {}), time: Math.round(s.time), work: Math.round(s.time * 0.8), kcal: 12.5, score: w.score, combo: s.bestCombo, ...(mode === 'arcs' || mode === 'trek' ? { dist: Math.floor(w.dist) } : {}), date: clock.t });
            put(HIST_KEY, h.slice(-400));
            const camp = r() < 0.3 ? { id: mode + ':' + ex, lv: r() < 0.5 ? 1 + Math.floor(r() * 5) : 1 + Math.floor(r() * 35) } : null;
            const o: RunInfo = { reps, perfect: s.perfect, mins: s.time / 60, combo: s.bestCombo, win, taken, falls: r() < 0.5 ? 0 : 1, mode, ex, hang };
            CAMP.run = camp;
            const xp0 = cr.lvlOf().n;
            ra.careerRun({ ...o });
            cr.run({ ...o }, camp ? { ...camp } : null);
            CAMP.run = null;
            if (cr.lvlOf().n > xp0) count.levelUp++;
            if (camp) {
              count.camp++;
              expect(cr.campStars(camp.id)).toBe(ra.campStars(camp.id));
              expect(js(cr.campOf(camp.id))).toEqual(js(ra.campOf(camp.id)));
            }
            if (r() < 0.7) {
              const G = cr.take(), RG = ra.careerTake() as { notes: unknown[] } | null;
              expect(js(G), `semilla ${seed}, ronda ${run}`).toEqual(js(RG));
              count.notes += RG ? RG.notes.length : 0;
            }
            const h2 = hist();
            expect(js(cr.bestRunOf(h2, ex, mode))).toEqual(js(ra.bestRunOf(h2, ex, mode)));
          }
          if (r() < 0.2) {
            const key = r() < 0.5 ? 'hands' : 'bolt', v = LOOK_V[key][Math.floor(r() * LOOK_V[key].length)];
            ra.lookSet(key, v); cr.lookSet(key, v);
          }
          check(`ronda ${run}`);
          clock.t += 20 * 60e3;
        }
      }
      count.chest += (raTro as string[][]).filter((t) => t[1] === '¡COFRE DEL DÍA!').length;
      const M = ra.misToday();
      M.list.forEach((m) => { if (m.t === 'mode') count.mode++; if (m.t === 'ex') count.ex++; });
    }
    // (que la prueba pase por todo)
    expect(count.chest).toBeGreaterThan(10);
    expect(count.shieldSpent).toBeGreaterThan(5);
    expect(count.levelUp).toBeGreaterThan(20);
    expect(count.camp).toBeGreaterThan(50);
    expect(count.rec).toBeGreaterThan(20);
    expect(count.misLive).toBeGreaterThan(20);
    expect(count.notes).toBeGreaterThan(50);
    expect(count.mode + count.ex).toBeGreaterThan(5);
    console.log('carrera:', count);
  }, 300000);
});
