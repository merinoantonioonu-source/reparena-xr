// Los Arcos: la racha y la fiebre, la medalla y el fantasma, y los obstáculos nuevos y los orbes (src/modes/arcs/state.ts
// y obstacles.ts). Lo que se compara con RepArena, en tests/compare/arcs-extras.compare.test.ts.
import { describe, expect, it } from 'vitest';
import type { ArcsEnv } from '../../src/modes/arcs/env.js';
import { ArcObsCore, ArcOrbCore, LASER_STILL, type ObsOutcome } from '../../src/modes/arcs/obstacles.js';
import { arxClean, arxEnd, arxGhostDiff, arxHit, arxMul, arxReset, ArxState, arxStep, ARX_GHOST } from '../../src/modes/arcs/state.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const SET: Record<string, number> = { arcFever: 1, arcFeverUp: 10, arcLaser: 100, arcMaceDrop: 20, arcMaceRound: 0, arcWallTilt: 0, arcOrbHigh: 0, arcOrbLow: 0, arcOrbSwing: 0, arcSpeed: 10 };
const mkEnv = (seed = 1, over: Record<string, number> = {}): ArcsEnv => {
  const s = { ...SET, ...over };
  return { s: (k) => s[k], dv: (k) => s[k], rnd: rng(seed), head: { x: 0, y: 1.6, z: 0 }, calibRef: 1.6, arenaDepth: 10, jumpFastT: -1, beatP: 0, time: 0 };
};

/** Hace pasar el obstáculo con la cabeza donde diga `head(o)` y devuelve el juicio. */
function run(o: ArcObsCore, env: ArcsEnv, head: (o: ArcObsCore) => void): ObsOutcome | null {
  let out: ObsOutcome | null = null;
  for (let i = 0; i < 5000 && o.alive; i++) {
    head(o);
    const f = o.update(1 / 72, env, true);
    if (f.outcome) out = f.outcome;
  }
  return out;
}

describe('la racha y la fiebre', () => {
  it('10 pasadas limpias encienden la fiebre una vez; un golpe la apaga', () => {
    const env = mkEnv(), st = new ArxState();
    arxReset(st, null);
    const evs = Array.from({ length: 15 }, () => arxClean(st, env));
    expect(evs.filter(Boolean)).toHaveLength(1);
    expect(evs[9]).toMatchObject({ feverLook: true, feverStart: true, sound: 'combo', cheer: ['¡MODO FIEBRE! Puntos ×2', '#ff4fa3', 1.8] });
    expect(st.fever).toBe(true);
    const hit = arxHit(st);
    expect(hit).toEqual({ feverLook: false, cheer: ['Fin de la fiebre', '#a49fc8', 1.2] });
    expect([st.fever, st.streak]).toEqual([false, 0]);
    expect(arxHit(st).cheer).toBeUndefined(); // (sin fiebre, sin aviso)
  });
  it('la fiebre acelera: un 20 % la primera y «Fiebre +» más cada una de las siguientes, hasta el doble', () => {
    const env = mkEnv(1, { arcFeverUp: 30 }), st = new ArxState();
    expect(arxMul(st, env)).toBe(1);
    for (let n = 1; n <= 6; n++) {
      for (let i = 0; i < 10; i++) arxClean(st, env);
      expect(st.feverN).toBe(n);
      expect(arxMul(st, env)).toBeCloseTo(Math.min(2, 1.2 + 0.3 * (n - 1)), 12);
      if (n === 2) expect(arxClean(st, env)).toBeNull();
      arxHit(st);
    }
  });
  it('sin «Modo fiebre», no hay fiebre', () => {
    const env = mkEnv(1, { arcFever: 0 }), st = new ArxState();
    for (let i = 0; i < 30; i++) expect(arxClean(st, env)).toBeNull();
    expect(st.streak).toBe(30);
  });
});

describe('los metros, la línea de puntos y el fantasma', () => {
  it('avanza a la velocidad que se le da, apunta los puntos cada 2 s y no cuenta fuera de la partida', () => {
    const env = mkEnv(), st = new ArxState();
    for (let i = 0; i < 730; i++) arxStep(st, env, 1 / 72, { play: true, winOpen: false, speed: 3, score: i, beatNow: 0 });
    expect(st.dist).toBeCloseTo(730 / 72 * 3, 6);
    expect(st.tl).toHaveLength(5);
    arxStep(st, env, 1, { play: false, winOpen: false, speed: 3, score: 0, beatNow: 0 });
    expect(st.dist).toBeCloseTo(730 / 72 * 3, 6);
  });
  it('el orbe sale cuando se acaba su cuenta, pero no con el panel entre oleadas delante', () => {
    const env = mkEnv(), st = new ArxState();
    st.orbT = 0.5;
    const f = { play: true, winOpen: true, speed: 3, score: 0, beatNow: 0 };
    for (let i = 0; i < 100; i++) expect(arxStep(st, env, 0.1, f).spawnOrb).toBe(false);
    f.winOpen = false;
    let n = 0;
    for (let i = 0; i < 100; i++) if (arxStep(st, env, 0.1, f).spawnOrb) n++;
    expect(n).toBe(1);
    expect(st.orbT).toBe(-1);
  });
  it('la diferencia con el fantasma, en el mismo momento de la ronda', () => {
    const st = new ArxState();
    expect(arxGhostDiff(st, 100)).toBeNull();
    arxReset(st, { score: 500, dist: 80, tl: [0, 40, 90] });
    expect(arxGhostDiff(st, 10)).toBe(10);
    st.tl.push(30);
    expect(arxGhostDiff(st, 50)).toBe(10);
    st.tl.push(60, 100, 150);
    expect(arxGhostDiff(st, 200)).toBe(110); // (pasada su ronda, el último)
  });
});

describe('al acabar', () => {
  it('la medalla: oro desde el 95 %, plata desde el 80 % y bronce desde el 60 %', () => {
    const st = new ArxState();
    expect(arxEnd(st, 0, 0, 0).medal).toBeNull();
    expect(arxEnd(st, 0, 95, 5).medal?.[0]).toBe('oro');
    expect(arxEnd(st, 0, 94, 6).medal?.[0]).toBe('plata');
    expect(arxEnd(st, 0, 80, 20).medal?.[0]).toBe('plata');
    expect(arxEnd(st, 0, 79, 21).medal?.[0]).toBe('bronce');
    expect(arxEnd(st, 0, 60, 40).medal?.[0]).toBe('bronce');
    expect(arxEnd(st, 0, 59, 41).medal).toBeNull();
  });
  it('el fantasma se guarda (con la forma de RepArena) solo si superas los puntos', () => {
    expect(ARX_GHOST).toBe('reparena3-arcghost');
    const st = new ArxState();
    arxReset(st, { score: 1000, dist: 50, tl: [0, 100] });
    st.dist = 61.4;
    st.tl = [0, 200, 400];
    expect(arxEnd(st, 900, 10, 0)).toMatchObject({ ghost: null, rec: false, farther: true, dist: 61 });
    expect(arxEnd(st, 1000, 10, 0).ghost).toBeNull();
    const e = arxEnd(st, 1200, 10, 0);
    expect(e.ghost).toEqual({ score: 1200, dist: 61, tl: [0, 200, 400, 1200] });
    expect(e.rec).toBe(true);
    expect(arxEnd(st, 1200, 0, 3).ghost).toBeNull(); // (sin pasar ninguno, no)
    arxReset(st, null);
    const first = arxEnd(st, 10, 1, 0);
    expect(first.ghost).not.toBeNull();
    expect(first.rec).toBe(false); // (la primera ronda no es «récord»: no había con qué compararla)
  });
});

describe('los obstáculos nuevos', () => {
  it('el láser tiene un lado libre: se queda quieto al llegar y quien se aparta a ese lado lo esquiva', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const env = mkEnv(seed), o = new ArcObsCore('laser', env, 3);
      expect(Math.sign(o.leanX - o.xf)).toBe(-Math.sign(o.xf));
      expect(o.still).toBeCloseTo(LASER_STILL - 0.3, 12);
      let last = NaN;
      const out = run(o, env, (ob) => {
        env.head.x = ob.leanX;
        const tau = ob.tReach - ob.t;
        if (tau < ob.still - 0.05 && tau > 0 && !Number.isNaN(last)) expect(ob.beamX).toBeCloseTo(last, 12);
        last = ob.beamX;
      });
      expect(out?.kind).toBe('pass');
      expect(out).toMatchObject({ rep: true, perfect: true, say: ['¡Esquivado!', '#3cf0c6', 0.9, false] });
      // y quien se queda en el rayo, se lo lleva
      const env2 = mkEnv(seed), o2 = new ArcObsCore('laser', env2, 3);
      expect(run(o2, env2, (ob) => (env2.head.x = ob.beamX))).toMatchObject({ kind: 'hit', hurt: true, electric: true, sounds: ['zap'] });
    }
  });
  it('las paredes se cierran dejando un hueco: dentro, pasas; fuera, te dan', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const env = mkEnv(seed), o = new ArcObsCore('walls', env, 3);
      const out = run(o, env, (ob) => (env.head.x = ob.gapX(env.head.y)));
      expect(o.wallR - o.wallL).toBeCloseTo(o.gap, 6);
      expect(out?.kind).toBe('pass');
      const env2 = mkEnv(seed), o2 = new ArcObsCore('walls', env2, 3);
      expect(run(o2, env2, (ob) => (env2.head.x = ob.gx - Math.sign(ob.gx) * 0.6))?.kind).toBe('hit');
    }
  });
  it('fuera del carril, solo el aviso', () => {
    const env = mkEnv(), o = new ArcObsCore('walls', env, 3);
    expect(run(o, env, () => (env.head.x = 1.3))).toMatchObject({ kind: 'lane', hurt: false, rep: false, say: ['Quédate en el carril', '#ff8a3d', 1.2, true] });
  });
  it('la maza se juzga por la altura de la cabeza: agachado de sobra, pasa por encima', () => {
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const env = mkEnv(seed), o = new ArcObsCore('mace', env, 3);
      expect(o.H).toBeCloseTo(1.6 + 0.1 - 0.2, 12);
      // agachado 0,7 m: la bola (en lo más bajo, a 1,5 m) no llega
      expect(run(o, env, () => Object.assign(env.head, { x: 0, y: 0.9 }))?.kind).toBe('pass');
      // de pie y siguiendo la bola, siempre da
      const env2 = mkEnv(seed), o2 = new ArcObsCore('mace', env2, 3);
      const out = run(o2, env2, (ob) => Object.assign(env2.head, { x: ob.bx, y: ob.by }));
      if (out?.kind === 'hit') {
        hits++;
        expect(out.sounds).toEqual(['metalHit']);
      }
    }
    expect(hits).toBe(20);
  });
});

describe('los orbes', () => {
  it('una mano cerca lo coge: 100 puntos (200 en la fiebre) y cuenta en los cogidos', () => {
    for (const fever of [false, true]) {
      const env = mkEnv(3), st = new ArxState(), o = new ArcOrbCore(env, 3);
      st.fever = fever;
      env.head.x = 5; // (la cabeza, lejos: solo vale la mano)
      let out = null;
      for (let i = 0; i < 1000 && o.alive && !out; i++) out = o.update(1 / 72, i / 72, env, st, { right: { x: o.at.x + 0.1, y: o.at.y, z: o.at.z + 0.1 } }, true);
      expect(out?.pts).toBe(fever ? 200 : 100);
      expect(out?.say[0]).toBe(`+${fever ? 200 : 100} · ¡ORBE!`);
      expect(st.got).toBe(1);
      expect(o.alive).toBe(false);
    }
  });
  it('sin tocarlo, pasa de largo y se va; fuera de la partida no se coge', () => {
    const env = mkEnv(4), st = new ArxState(), o = new ArcOrbCore(env, 3);
    env.head.x = 5;
    for (let i = 0; i < 2000 && o.alive; i++) expect(o.update(1 / 72, i / 72, env, st, { left: { ...o.at } }, false)).toBeNull();
    expect(o.alive).toBe(false);
    expect(st.got).toBe(0);
  });
});
