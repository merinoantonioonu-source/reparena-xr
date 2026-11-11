// La carrera (src/core/career.ts): la curva de niveles, los títulos, el cofre del día, los escudos de racha, lo guardado
// por versiones viejas y que lo ganado sin enseñar no se guarde.
import { describe, expect, it } from 'vitest';
import { CAREER_KEY, Career, SHIELD_MAX, lvlNeed, titleOf, type CareerEnv, type RunInfo } from '../../src/core/career.js';
import { DAY_MS, dayKey, noonOf, type HistRow } from '../../src/core/days.js';
import { HIST_KEY } from '../../src/core/run.js';

function world(saved: Record<string, unknown> = {}, opts: Partial<CareerEnv> = {}) {
  const m: Record<string, string> = {};
  for (const k in saved) m[k] = JSON.stringify(saved[k]);
  const clock = { t: noonOf(new Date(2026, 10, 11).getTime()) };
  const trophies: string[] = [];
  const env: CareerEnv = {
    store: <T>(k: string, v?: T): T | null => {
      if (v === undefined) return k in m ? (JSON.parse(m[k]) as T) : null;
      m[k] = JSON.stringify(v);
      return null;
    },
    now: () => clock.t,
    goalMin: () => 10,
    random: () => 0,
    kg: () => 70,
    playMode: () => true,
    playEx: () => true,
    trophy: (t) => trophies.push(t),
    cheer: () => {},
    ...opts,
  };
  return { m, clock, trophies, env, saved: () => JSON.parse(m[CAREER_KEY]) };
}
const round = (o: Partial<RunInfo> = {}): RunInfo => ({ reps: 0, perfect: 0, mins: 0, combo: 0, win: false, taken: 1, falls: 0, mode: 'combat', ex: 'squat', hang: false, ...o });
const row = (date: number, o: Partial<HistRow> = {}): HistRow => ({ ex: 'squat', mode: 'combat', reps: 10, perfect: 5, time: 300, date, ...o });

describe('la carrera', () => {
  it('los niveles piden cada vez un poco más y los títulos cambian a su nivel', () => {
    const { env } = world();
    const c = new Career(env);
    expect(lvlNeed(1)).toBe(100);
    expect(lvlNeed(2)).toBe(120);
    expect(c.lvlOf(0)).toEqual({ n: 1, into: 0, need: 100 });
    expect(c.lvlOf(99)).toEqual({ n: 1, into: 99, need: 100 });
    expect(c.lvlOf(100)).toEqual({ n: 2, into: 0, need: 120 });
    expect(c.lvlOf(230)).toEqual({ n: 3, into: 10, need: 140 });
    expect(c.lvlOf(1e9).n).toBe(99);
    expect([1, 2, 3, 5, 6, 10, 20, 49, 50, 99].map(titleOf)).toEqual(['Novato', 'Novato', 'Aprendiz', 'Aprendiz', 'Luchador', 'Guerrero', 'Campeón', 'Titán', 'Leyenda', 'Leyenda']);
  });

  it('la primera vez cuenta todo tu historial', () => {
    const { env, saved } = world({ [HIST_KEY]: [row(1, { reps: 30, perfect: 10, win: true }), row(2, { ex: 'hang', reps: 41 })] });
    new Career(env);
    expect(saved()).toMatchObject({ xp: 30 + 10 + 20 + 21, seeded: true });
  });

  it('con las tres misiones hechas, el cofre se abre una vez y da un escudo (como mucho tres)', () => {
    for (const sh0 of [0, 2, 3]) {
      const { env, saved, trophies } = world({ [CAREER_KEY]: { seeded: true, shield: sh0 } });
      const c = new Career(env);
      const big = round({ reps: 400, perfect: 300, mins: 60, combo: 40, win: true, taken: 0, ex: 'squat' });
      // la de variedad: se cumple con su modo o ejercicio
      for (const m of c.misToday().list) if (m.t === 'mode') big.mode = m.arg as string; else if (m.t === 'ex') big.ex = m.arg as string;
      c.run({ ...big }, null);
      expect(c.misToday().list.every((m) => m.done)).toBe(true);
      expect(c.misToday().chest).toBe(true);
      expect(saved().shield).toBe(Math.min(SHIELD_MAX, sh0 + 1));
      expect(trophies.filter((t) => t === '¡COFRE DEL DÍA!')).toHaveLength(1);
      expect(trophies.filter((t) => t === '¡ESCUDO DE RACHA!')).toHaveLength(sh0 < SHIELD_MAX ? 1 : 0);
      // (un color antes de tiempo)
      expect(saved().own).toHaveLength(1);
      c.run({ ...big }, null);
      expect(trophies.filter((t) => t === '¡COFRE DEL DÍA!')).toHaveLength(1);
      expect(saved().shield).toBe(Math.min(SHIELD_MAX, sh0 + 1));
    }
  });

  it('un día sin entrenar gasta un escudo solo y la racha sigue', () => {
    const today = noonOf(new Date(2026, 10, 11).getTime());
    const hist = [row(today - 3 * DAY_MS), row(today - 2 * DAY_MS)];
    const { env, saved } = world({ [HIST_KEY]: hist, [CAREER_KEY]: { seeded: true, shield: 2 } });
    const c = new Career(env);
    expect(saved().shield).toBe(1);
    expect(saved().frozen).toEqual([dayKey(today - DAY_MS)]);
    expect(saved().saved).toEqual({ day: dayKey(today), n: 1, told: false });
    expect(c.progress().streak).toBe(2);
    // al acabar la ronda siguiente, la nota (una sola vez)
    c.run(round({ reps: 5 }), null);
    expect(c.take()?.notes.map((n) => n[0])).toContain('Un escudo salvó tu racha: 2 días');
    c.run(round({ reps: 5 }), null);
    expect(c.take()?.notes.some((n) => n[0].startsWith('Un escudo'))).toBe(false);
  });

  it('si faltan más días que escudos, no se gastan', () => {
    const today = noonOf(new Date(2026, 10, 11).getTime());
    const { env, saved } = world({ [HIST_KEY]: [row(today - 4 * DAY_MS)], [CAREER_KEY]: { seeded: true, shield: 2 } });
    const c = new Career(env);
    expect(saved().shield).toBe(2);
    expect(c.progress().streak).toBe(0);
  });

  it('lo guardado por una versión vieja (sin campos nuevos o roto) se carga bien', () => {
    for (const old of [{ xp: 250 }, { xp: '12', shield: 9, own: 'x', equip: [1], camp: null, mis: { day: 'x' } }, 'roto', null]) {
      const { env } = world({ [CAREER_KEY]: old });
      const c = new Career(env);
      expect(c.cr.shield).toBeLessThanOrEqual(SHIELD_MAX);
      expect(Array.isArray(c.cr.own) && Array.isArray(c.cr.frozen)).toBe(true);
      expect(c.cr.camp).toEqual({});
      expect(c.misToday().list).toHaveLength(3);
      expect(c.lookHex('hands')).toBe(0x3cf0c6);
    }
  });

  it('al guardar no va lo ganado sin enseñar', () => {
    const { env, saved } = world({ [CAREER_KEY]: { seeded: true } });
    const c = new Career(env);
    c.run(round({ reps: 50, perfect: 10, win: true }), null);
    expect(c.cr.gain?.xp).toBeGreaterThanOrEqual(80);
    expect('gain' in saved()).toBe(false);
    expect(c.take()).not.toBeNull();
    expect(c.take()).toBeNull();
  });

  it('la misión de modo solo pide los modos que se pueden jugar aquí', () => {
    let modes = 0;
    for (let d = 0; d < 200; d++) {
      const { env, clock } = world({ [CAREER_KEY]: { seeded: true } }, { playMode: (m) => m === 'combat', playEx: (x) => x === 'squat' || x === 'lunge' });
      clock.t += d * DAY_MS;
      const now = clock.t;
      env.store(HIST_KEY, [row(now - 5 * DAY_MS, { ex: 'curl' }), row(now - 6 * DAY_MS, { ex: 'lunge' }), row(now - 6 * DAY_MS, { ex: 'row', mode: 'bars' })]);
      const c = new Career(env);
      for (const m of c.misToday().list) {
        if (m.t === 'mode') { modes++; expect(m.arg).toBe('combat'); }
        if (m.t === 'ex') expect(m.arg).toBe('lunge');
      }
    }
    expect(modes).toBeGreaterThan(10);
  });

  it('la campaña: estrellas y el nivel siguiente', () => {
    const { env } = world({ [CAREER_KEY]: { seeded: true } });
    const c = new Career(env);
    const id = c.campId('combat', 'squat');
    expect(c.campResult({ id, lv: 1 }, round({ reps: 20, perfect: 16, win: true, taken: 0 }))).toEqual({ lv: 1, stars: 3, prev: 0, newStars: 3, next: 2 });
    expect(c.campOf(id)).toEqual({ at: 2, stars: { 1: 3 } });
    expect(c.campResult({ id, lv: 1 }, round({ reps: 20, perfect: 1, win: true }))).toMatchObject({ stars: 1, prev: 3, newStars: 0 });
    expect(c.campStars(id)).toBe(3);
    expect(c.campLv(10)).toEqual({ r: 1, k: 4, rank: 'soldado', name: 'Bosque del eco', env: 'nature', waves: 5, boss: true });
  });
});
