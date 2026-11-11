// Lo que sale en la carátula del duelo (src/combat/duel.ts: duelBoss, duelRecord, duelScene, duelName y duelSub) frente al
// código original de RepArena (src/64_intro.js: introBoss, introRecord, introScene, introName e introSub): rondas al azar
// (modos, ejercicios, oleadas —0, al fallo—, los elegidos, la batalla diminuta, la tabla del desarrollador, el historial)
// tienen que dar el mismo jefe con las mismas barras, la misma escena y el mismo récord. (Se salta sin RA_DIR.)
import { describe, expect, it } from 'vitest';
import { duelBoss, duelName, duelRecord, duelScene, duelSub, type DuelEnv, type DuelHist } from '../../src/combat/duel.js';
import { BODY_ZONES, EX_NAMES, FOE_FLY, FOE_GATE, FOE_HATCH, MODE_EX, MODE_NAMES, RANK_VALS } from '../../src/core/catalog.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface RA { introBoss(): unknown; introRecord(): string; introScene(): unknown; introName(): string; introSub(): string }

describe.skipIf(!RA_DIR)('la carátula del duelo, como en RepArena', () => {
  it('el mismo jefe, la misma escena y el mismo récord en 600 rondas al azar', () => {
    const code = [raSlice('64_intro.js', 'const INTRO_DRAW', '// La ilustración se pinta antes', false), raSlice('64_intro.js', 'const introName')].join('\n');
    const modes = ['combat', 'combat', 'combat', 'arcs', 'touch', 'bars', 'trek'], allEx = Object.keys(EX_NAMES);
    const seen = { draw: new Set<string>(), pose: new Set<string>(), what: new Set<string>(), rec: new Set<string>() };
    for (let seed = 1; seed <= 600; seed++) {
      const r = rng(seed * 7919), pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)], pickN = (l: string[], m: number) => l.filter(() => r() < m / l.length);
      r(); r(); // (las primeras salidas, con semillas pequeñas, se parecen)
      const mode = pick(modes), exercise = r() < 0.85 ? pick(MODE_EX[mode]) : pick(allEx);
      const tiny = r() < 0.3, ground = pickN((tiny ? FOE_HATCH : FOE_GATE).map((o) => o[0]), r() < 0.3 ? 1 : 3), fly = pickN(FOE_FLY.map((o) => o[0]), 2);
      const foes = pick(['robots', 'flyers', 'mix']), waves = r() < 0.3 ? 0 : 1 + Math.floor(r() * 12), two = r() < 0.4;
      const repsWave = 4 + Math.floor(r() * 20), repsInc = Math.floor(r() * 3), hangTime = 10 + Math.floor(r() * 50), hangInc = Math.floor(r() * 6);
      const rank = Math.floor(r() * 7), dvs: Record<string, number> = {};
      const dv = (k: string) => (dvs[k] ??= (RANK_VALS[k]?.[rank] as number) ?? 0);
      const dev: Record<string, { hp: number; str: number; tier: number }> = {}, tiers: Record<string, number> = {};
      const devFoe = (key: string) => (dev[key] ??= { hp: 1 + Math.floor(r() * 3), str: 1 + Math.floor(r() * 3), tier: Math.floor(r() * 5) });
      const foeTier = (k: string) => (tiers[k] ??= 1 + Math.floor(r() * 4));
      const waveReps = (i: number) => Math.max(1, Math.round(repsWave + repsInc * i)), hangSecs = (i: number) => hangTime + hangInc * i;
      const hist: DuelHist[] | null = r() < 0.15 ? null : Array.from({ length: Math.floor(r() * 8) }, () => ({ ex: r() < 0.6 ? exercise : pick(allEx), mode: r() < 0.7 ? mode : pick(modes), fail: r() < 0.5 ? 0 : 1 + Math.floor(r() * 15), reps: r() < 0.15 ? undefined : Math.floor(r() * 120) }));
      const e: DuelEnv = { mode, exercise, nWaves: waves, waveReps, hangSecs, twoShots: two, foes, tiny, ground, fly, devFoe, foeTier, dv, arcMace: r() < 0.5 ? 0 : 1 + Math.floor(r() * 3), tchArrive: pick(RANK_VALS.tchArrive as number[]), toFail: r() < 0.4, bars: mode === 'bars', floor: r() < 0.3, supine: r() < 0.15 };
      const settings = { mode, exercise, arcMace: e.arcMace, tchArrive: e.tchArrive, toFail: e.toFail };
      const ra = raRun<RA>(code, '({ introBoss, introRecord, introScene, introName, introSub })', {
        settings, FOE_GATE, FOE_HATCH, FOE_FLY, EX_NAMES, MODE_NAMES, BODY_ZONES, clamp, HIST_KEY: 'reparena3-history',
        store: (k: string) => (k === 'reparena3-history' ? hist : null),
        nWaves: () => waves, waveReps, hangSecs, dv, twoShots: () => two, foes: () => foes, isTiny: () => tiny, groundList: () => ground, flyList: () => fly,
        devFoe, foeTier, isBars: () => e.bars, isFloor: () => e.floor, isSupine: () => e.supine,
      });
      const tag = `semilla ${seed} (${mode}, ${exercise}, ${waves} oleadas)`;
      const boss = duelBoss(e), scene = duelScene(e), rec = duelRecord(e, hist);
      expect(boss, tag).toEqual(ra.introBoss());
      expect(scene, tag).toEqual(ra.introScene());
      expect(rec, tag).toBe(ra.introRecord());
      expect(duelName(e), tag).toBe(ra.introName());
      expect(duelSub(e), tag).toBe(ra.introSub());
      seen.draw.add(String(boss.draw)); seen.pose.add(scene.pose); seen.what.add(scene.what); seen.rec.add(rec.replace(/\d+/g, 'N'));
    }
    // (que las rondas al azar pasen por casi todo: siluetas, posturas, lo de en medio y los récords)
    expect(seen.draw.size).toBeGreaterThanOrEqual(9);
    expect([...seen.pose].sort()).toEqual(["deep", "hang", "lunge", "plank", "reach", "squat"]);
    expect([...seen.what].sort()).toEqual(["", "arcs", "bolt", "bubble", "diamond"]);
    expect(seen.rec.size).toBe(5);
  });
});
