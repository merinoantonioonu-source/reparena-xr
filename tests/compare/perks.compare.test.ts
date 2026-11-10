// Los premios portados (src/combat/perks.ts: Perks y Ghost) frente al código original de RepArena (src/79_perks.js):
// rondas al azar (oleadas superadas con más o menos golpes, cartas que se eligen o se dejan, perfectas, golpes, el relámpago)
// con el mismo azar tienen que dar las mismas cartas, en el mismo momento, las mismas mejoras, los mismos escudos y combos
// salvados, las mismas vidas y los mismos puntos; y la carrera contra tu récord, el mismo texto. (Se salta sin RA_DIR.)
import { describe, expect, it } from 'vitest';
import { Ghost, Perks } from '../../src/combat/perks.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });

interface RA {
  PK: { has: Set<string>; offer: string[] | null; offerT: number; shield: number; comboSave: number };
  perkWaveCleared(): void;
  perkTake(k: string, random?: boolean): void;
  perkRestEnd(): void;
  perkWaveStart(i: number): void;
  perkPtsK(p: boolean): number;
  perkOnRep(p: boolean): void;
  perkAbsorb(): boolean;
  perkKeepCombo(): boolean;
  perkStep(dt: number, t: number): void;
  perkWaits(): boolean;
}

describe.skipIf(!RA_DIR)('los premios, como en RepArena', () => {
  it('las mismas cartas, mejoras, escudos, combos salvados y vidas en 150 rondas al azar', () => {
    const code = [raSlice('79_perks.js', 'const PERKS', '/* ---------- Carrera contra tu récord', false), raSlice('79_perks.js', 'function perkStep', '}')].join('\n');
    let offers = 0, taken = 0, lifeUps = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const raR = rng(seed * 3), ptR = rng(seed * 3), r = rng(seed);
      const livesOn = r() < 0.7;
      const w = { stats: { taken: 0 }, state: 'play', lives: 3, combo: 0, cheers: 0 };
      const settings = { perks: 1, surprises: 0, mode: 'combat', rest: 20 };
      const ra = raRun<RA>(code, '({ PK, perkWaveCleared, perkTake, perkRestEnd, perkWaveStart, perkPtsK, perkOnRep, perkAbsorb, perkKeepCombo, perkStep, perkWaits })', {
        settings,
        Math: mathWith(raR),
        pick: <T>(a: T[]) => a[Math.floor(raR() * a.length)],
        isCombat: () => true,
        nLives: () => (livesOn ? 3 : 0),
        SES: { active: false },
        chestMaybe: () => {},
        chestClear: () => {},
        cheer: () => w.cheers++,
        say: () => {},
        SND: { combo: () => {}, zap: () => {} },
        hapticBoth: () => {},
        fx: { glow: () => {} },
        head: { p: { clone: () => ({ addScaledVector: () => ({}) }) } },
        fwd: () => ({}),
        GOLD: { n: 0 },
        rushPlan: () => {},
        RUSH: { on: false },
        enemies: [],
        ghostStep: () => {},
        goldStep: () => {},
        rushStep: () => {},
        beatLightStep: () => {},
        chestStep: () => {},
        menu: null,
        hideMenu: () => {},
        openMenu: () => ({}),
        get stats() {
          return w.stats;
        },
        get state() {
          return w.state;
        },
        get lives() {
          return w.lives;
        },
        set lives(v: number) {
          w.lives = v;
        },
        get combo() {
          return w.combo;
        },
        stateT: 0,
        boardDirty: false,
      });
      const pk = new Perks(ptR);
      for (let wave = 0; wave < 12; wave++) {
        // la oleada: golpes, perfectas y el escudo
        ra.perkWaveStart(wave);
        pk.waveStart();
        for (let i = 0; i < 20; i++) {
          const perf = r() < 0.4;
          ra.perkOnRep(perf);
          const up = pk.onRep(perf, w.lives, livesOn ? 3 : 0);
          if (up) {
            lifeUps++;
            w.lives++;
          }
          if (r() < 0.06) {
            w.combo = Math.floor(r() * 8);
            const a = ra.perkAbsorb(), b = pk.absorb();
            expect(b).toBe(a);
            if (!a) {
              expect(pk.keepCombo(w.combo)).toBe(ra.perkKeepCombo());
              w.stats.taken++;
              w.lives = Math.max(1, w.lives - 1);
            }
          }
          expect(pk.ptsK(perf, false)).toBe(ra.perkPtsK(perf));
        }
        // superada: el descanso, con sus cartas (que se eligen, o no, y al acabar te toca una)
        w.state = 'rest';
        ra.perkWaveCleared();
        pk.waveCleared(w.stats.taken, true, livesOn);
        const pickNow = r() < 0.6;
        for (let f = 0; f < 200; f++) {
          ra.perkStep(1 / 60, 0);
          const ev = pk.step(1 / 60, true, livesOn, true);
          if (ev === 'offer') offers++;
          expect(pk.offer, `semilla ${seed}, oleada ${wave}, ${f}`).toEqual(ra.PK.offer);
          expect(pk.waits(true)).toBe(ra.perkWaits());
          if (pickNow && pk.offer && f === 150) {
            const k = pk.offer[Math.floor(r() * pk.offer.length)];
            ra.perkTake(k);
            pk.take(k);
            taken++;
          }
        }
        ra.perkRestEnd();
        pk.restEnd();
        w.state = 'play';
        expect([...pk.has].sort(), `semilla ${seed}, oleada ${wave}`).toEqual([...ra.PK.has].sort());
        expect(pk.shield).toBe(ra.PK.shield);
        expect(pk.comboSave).toBe(ra.PK.comboSave);
      }
    }
    expect(offers).toBeGreaterThan(100);
    expect(taken).toBeGreaterThan(50);
    expect(lifeUps).toBeGreaterThan(0);
  }, 120000);

  it('la carrera contra tu récord: el mismo texto en cada momento', () => {
    const code = raSlice('79_perks.js', 'const GHOST_KEY', '/* ---------- Sorpresas: el enemigo dorado', false);
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed), best = r() < 0.2 ? null : { n: 20 + Math.floor(r() * 30), tl: r() < 0.3 ? null : Array.from({ length: 30 }, (_, i) => Math.floor(i * (1 + r()))) };
      const w = { reps: 0, state: 'play' };
      const store = (k: string) => (k === 'reparena3-ghosts' ? (best ? { 'combat:squat': best } : {}) : []);
      const ra = raRun<{ ghostReset(): void; ghostStep(dt: number): void; ghostText(): [string, string] | null; GH: { beat: boolean } }>(code, '({ ghostReset, ghostStep, ghostText, GH })', {
        settings: { ghost: 1, mode: 'combat', exercise: 'squat' },
        SES: { active: false },
        store,
        HIST_KEY: 'reparena3-history',
        get stats() {
          return { reps: w.reps };
        },
        get state() {
          return w.state;
        },
        cheer: () => {},
        SND: { combo: () => {} },
        hapticBoth: () => {},
        fx: { sparks: () => {} },
        head: { p: { clone: () => ({ addScaledVector: () => ({}) }) } },
        fwd: () => ({}),
        boardDirty: false,
      });
      ra.ghostReset();
      const g = new Ghost();
      g.reset('combat', 'squat', true, best ? { 'combat:squat': best } : {}, []);
      for (let i = 0; i < 2000; i++) {
        if (r() < 0.02) w.reps++;
        ra.ghostStep(1 / 30);
        g.step(1 / 30, w.reps, true);
        expect(g.text(w.reps, true), `semilla ${seed}, ${i}`).toEqual(ra.ghostText());
      }
    }
  });
});
