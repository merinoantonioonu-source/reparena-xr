// Los bandidos y los lobos de la Travesía (src/modes/trek/bandits.ts y wolves.ts): agacharse esquiva la piedra alta,
// quedarse quieto ante la del cuerpo te da, el bandido cae con la 5.ª esquivada (la 6.ª desde el tercer tramo), el lobo al
// que le ganas la carrera cruza por detrás, el que llega antes muerde, y el punto de corte está en el sendero por delante.
import { describe, expect, it } from 'vitest';
import { bandAnim, bandFight, makeBanditStop, type StoneAtk, type Stone } from '../../src/modes/trek/bandits.js';
import type { BanditEvent, BanditsEnv, WolfEvent, WolvesEnv } from '../../src/modes/trek/env-foes.js';
import { makeWolves, trekCutPoint, trekWolfV, wolvesStep, TREK_WOLF_D, TREK_WOLF_X } from '../../src/modes/trek/wolves.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const CAL = 1.6;

/** Un combate: `dodge(atk)` dice si esquivas cada piedra; devuelve cómo se juzgó cada una y los sucesos. */
function fight(wave: number, dodge: (atk: StoneAtk) => boolean, seed = 3, frames = 72 * 60) {
  const rnd = rng(seed), stop = makeBanditStop(wave, rnd, null), ev: BanditEvent[] = [], all: BanditEvent[] = [];
  const head = { x: 0, y: CAL, z: 0 };
  const env: BanditsEnv = { state: 'play', head, eyeY: CAL, loc: { x: 0, z: 0 }, calibRef: CAL, jumpHeight: 6, wave, rank: 0, lunge: false, rnd, clips: null };
  const judged: { atk: StoneAtk; ok: boolean; hpAfter: number }[] = [], seen = new Set<Stone>();
  const dt = 1 / 72;
  for (let i = 0; i < frames && !stop.done; i++) {
    head.x = 0; head.y = CAL;
    const q = stop.stones.find((s) => !s.done);
    if (q && dodge(q.atk) && q.t / q.dur > 0.5) {
      if (q.atk === 'high') head.y = CAL - 0.3;
      else if (q.atk === 'low') head.y = CAL + 0.12;
      else head.x = q.x0 + 0.4;
    }
    env.eyeY = head.y; env.loc.x = head.x;
    bandAnim(stop, dt, env);
    bandFight(stop, dt, i * dt, env, ev);
    for (const s of stop.stones) if (s.done && !seen.has(s)) { seen.add(s); judged.push({ atk: s.atk, ok: s.ok, hpAfter: s.by.hp }); }
    all.push(...ev); ev.length = 0;
  }
  return { stop, judged, all };
}

describe('los bandidos de la Travesía', () => {
  it('agacharse esquiva la piedra alta (y le duele)', () => {
    const { judged, all } = fight(0, (a) => a === 'high');
    const high = judged.filter((j) => j.atk === 'high');
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((j) => j.ok)).toBe(true);
    expect(all.some((e) => e.k === 'say' && e.text.startsWith('¡Esquivada!'))).toBe(true);
    expect(all.some((e) => e.k === 'snd' && e.snd === 'banditHurt')).toBe(true);
  });

  it('quedarse quieto ante la piedra al cuerpo te da (una vida) y no le quita nada', () => {
    const { judged, all } = fight(0, () => false, 3, 72 * 15);
    const body = judged.filter((j) => j.atk === 'body');
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((j) => !j.ok && j.hpAfter === 5)).toBe(true);
    expect(all.some((e) => e.k === 'hurt')).toBe(true);
    expect(all.some((e) => e.k === 'say' && e.text === '¡Te ha dado! Apártate a un lado')).toBe(true);
  });

  it('cae muerto con la 5.ª esquivada; desde el tercer tramo, con la 6.ª; esquivándolo todo, camino libre', () => {
    for (const [wave, need] of [[0, 5], [2, 6]]) {
      const { stop, judged, all } = fight(wave, () => true);
      const first = judged.filter((j) => j.ok);
      const kill = first.findIndex((j) => j.hpAfter === 0);
      expect(kill + 1).toBe(need);
      expect(stop.bandits.every((b) => !b.alive)).toBe(true);
      expect(stop.done).toBe(true);
      expect(all.some((e) => e.k === 'end' && e.won)).toBe(true);
      expect(all.filter((e) => e.k === 'cheer' && e.text === '¡Bandido derrotado!').length).toBe(stop.bandits.length);
      expect(stop.hits).toBe(0);
    }
  });

  it('lanza de tres en tres las tres piedras, con su aviso', () => {
    const { judged, all } = fight(0, () => true);
    const atks = judged.map((j) => j.atk).slice(0, 3).sort();
    expect(atks).toEqual(['body', 'high', 'low']);
    expect(all.some((e) => e.k === 'say' && e.text === '¡PIEDRA BAJA! ¡Salta!')).toBe(true);
    expect(all.some((e) => e.k === 'snd' && e.snd === 'banditThrow')).toBe(true);
  });
});

/** Una persecución con el jugador avanzando a v m/s; devuelve los sucesos y lo que hizo cada lobo. */
function chase(v: number, frames = 72 * 60) {
  const rnd = rng(11), W = makeWolves(), ev: WolfEvent[] = [], all: WolfEvent[] = [];
  const path = { P: (s: number) => ({ x: 0, z: -s }), th: () => 0, dist: 30, v };
  const env: WolvesEnv = { state: 'play', path, halted: false, headU: 0, lunge: false, wave: 0, rank: 0, trekSpeed: 100, rnd };
  const dt = 1 / 72;
  let crossedBehind = false;
  for (let i = 0; i < frames; i++) {
    path.dist += v * dt;
    const before = W.chase?.wolves.map((w) => w.st);
    wolvesStep(W, dt, i * dt, env, ev);
    W.chase?.wolves.forEach((w, j) => { if (before?.[j] === 'race' && w.st === 'chase' && w.s < path.dist) crossedBehind = true; });
    all.push(...ev); ev.length = 0;
    if (all.some((e) => e.k === 'chaseEnd')) break;
  }
  return { all, crossedBehind };
}

describe('los lobos de la Travesía', () => {
  it('el punto de corte está en el sendero por delante, donde llegáis a la vez', () => {
    for (const [D, X, rho] of [[28, 9, 1], [33, 10, 1], [20, 4, 1.3], [40, 15, 0.8]]) {
      const c = trekCutPoint(D, X, rho);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(D);
      expect(Math.abs(c - rho * Math.hypot(D - c, X))).toBeLessThan(1e-6);
    }
  });

  it('al que le ganas la carrera cruza por detrás, se queda atrás y no muerde', () => {
    const { all, crossedBehind } = chase(trekWolfV(0, 0, 100) * 1.3);
    expect(all[0].k).toBe('chaseStart');
    expect(all.some((e) => e.k === 'snd' && e.snd === 'wolfHowl')).toBe(true);
    expect(crossedBehind).toBe(true);
    expect(all.some((e) => e.k === 'hurt')).toBe(false);
    expect(all.some((e) => e.k === 'cheer' && e.text === '¡Has dejado atrás a los lobos!')).toBe(true);
    expect(all.some((e) => e.k === 'score' && e.n === 250)).toBe(true);
  });

  it('el que llega antes muerde (una vida), y antes gruñe más fuerte según se acerca', () => {
    const { all } = chase(trekWolfV(0, 0, 100) * 0.5);
    expect(all.some((e) => e.k === 'hurt')).toBe(true);
    expect(all.some((e) => e.k === 'snd' && e.snd === 'wolfBite')).toBe(true);
    const growls = all.filter((e): e is Extract<WolfEvent, { k: 'snd' }> => e.k === 'snd' && e.snd === 'wolfGrowl').map((e) => e.vol as number);
    expect(growls.length).toBeGreaterThan(1);
    expect(growls[growls.length - 1]).toBeGreaterThan(growls[0]);
  });

  it('salen a 28 m por delante y a 9 m a un lado', () => {
    const W = makeWolves(), ev: WolfEvent[] = [];
    const env: WolvesEnv = { state: 'play', path: { P: () => ({ x: 0, z: 0 }), th: () => 0, dist: 30, v: 0 }, halted: false, headU: 0, lunge: false, wave: 0, rank: 0, trekSpeed: 100, rnd: rng(2) };
    wolvesStep(W, 0, 0, env, ev);
    const w = W.chase!.wolves[0];
    expect(W.chase!.wolves.length).toBe(1);
    expect(w.s).toBe(30 + TREK_WOLF_D);
    expect(Math.abs(w.u)).toBe(TREK_WOLF_X);
    expect(w.mark.opacity).toBeGreaterThan(0.9); // (la flecha roja, a la vista de lejos)
  });
});
