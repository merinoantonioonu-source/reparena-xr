// Lo portado de los Arcos (src/modes/arcs/state.ts y obstacles.ts) frente al código original de RepArena (src/71_arcs.js):
// la racha, la fiebre, los metros, los orbes que salen, la línea de puntos, el fantasma y la medalla, con pasadas limpias y
// golpes al azar; los obstáculos nuevos (láser, paredes y maza) y los orbes, fotograma a fotograma con la cabeza (y las
// manos) moviéndose y el mismo azar: tienen que estar en el mismo sitio, avisar a la vez y juzgarse igual. (Se salta sin
// RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ArcsEnv } from '../../src/modes/arcs/env.js';
import { ArcObsCore, ArcOrbCore, type ObsKind } from '../../src/modes/arcs/obstacles.js';
import { arxBeatTick, arxClean, arxEnd, arxGhostDiff, arxHit, arxMul, arxReset, ArxState, arxStep, type ArxEvent, type ArxGhost } from '../../src/modes/arcs/state.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

// Un objeto de escena de mentira: solo lo que el código de RepArena lee o escribe (la posición, de verdad)
class Obj {
  position = new V3();
  rotation = { x: 0, y: 0, z: 0, set: () => {} };
  quaternion = { setFromUnitVectors: () => {} };
  scale = { x: 1, y: 1, z: 1, set: () => {}, setScalar: () => {} };
  userData: Record<string, unknown> = {};
  material = { opacity: 0, dispose: () => {} };
  geometry = { type: '', dispose: () => {} };
  add(): void {}
  traverse(): void {}
  getWorldPosition(o: THREE.Vector3): THREE.Vector3 {
    return o.copy(this.position);
  }
}
const THREE_STUB = {
  Group: Obj,
  Mesh: Obj,
  PlaneGeometry: class {},
  Vector3: V3,
  MeshBasicMaterial: class {
    opacity = 0;
    dispose(): void {}
  },
};

interface RAObs {
  z: number;
  t: number;
  alive: boolean;
  judged: boolean;
  checked: boolean;
  hit: boolean;
  warnT: number;
  leanX: number;
  tilt: number;
  drop: number;
  bx: number;
  by: number;
  bz: number;
  beam?: Obj;
  walls?: Obj[];
  update(dt: number, t: number): void;
}

describe.skipIf(!RA_DIR)('los obstáculos nuevos de los Arcos, como en RepArena', () => {
  it('láser, paredes y maza: el mismo movimiento, los mismos avisos y el mismo juicio en 300 obstáculos al azar', () => {
    const code = raSlice('71_arcs.js', 'class ArcObs', '// La maza, compartida', false) + '\nconst mk = (k) => new ArcObs(k);';
    const tally: Record<string, number> = { pass: 0, hit: 0, lane: 0, beep: 0, whoosh: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed), kind = (['laser', 'walls', 'mace'] as ObsKind[])[seed % 3];
      const settings: Record<string, number> = { arcLaser: 30 + r() * 120, arcMaceDrop: r() < 0.2 ? -1 : r() * 40, arcMaceRound: r() * 100, arcWallTilt: r() * 100, arcSpeed: 6 + r() * 10 };
      const calibRef = 1.5 + r() * 0.3, D = 8 + r() * 6, speed = settings.arcSpeed / 3.6 * (r() < 0.3 ? 1.2 : 1);
      const HL = new V3(0, calibRef, 0), state = { v: r() < 0.9 ? 'play' : 'menu' };
      const calls: string[] = [];
      const raR = rng(seed * 31), ptR = rng(seed * 31);
      const rec = (n: string) => (...a: unknown[]) => calls.push(n + (n === 'beep' ? ':' + (a[0] as number).toFixed(9) : n === 'say' ? ':' + a.join('|') : ''));
      const mk = raRun<(k: string) => RAObs>(code, 'mk', {
        THREE: THREE_STUB,
        V3,
        Math: mathWith(raR),
        TAU: Math.PI * 2,
        clamp,
        smooth,
        rand: (a: number, b: number) => a + raR() * (b - a),
        dv: (k: string) => settings[k],
        settings,
        arxSpeed: () => speed,
        arenaDepth: () => D,
        calibRef,
        HEAD_TOP: 0.1,
        HL,
        get state() {
          return state.v;
        },
        arena: { add: () => {}, remove: () => {}, localToWorld: (v: THREE.Vector3) => v },
        tmpA: new V3(),
        _mcD: new V3(),
        _mcB: new V3(),
        G: { cylRaw: () => ({}), box: () => ({}), cyl: () => ({}) },
        M: { steel: {} },
        C: { gun: 0 },
        TX: { beam: {} },
        tint: () => {},
        LASER_MAT: {},
        LASER_STILL: 1.6,
        WALL_EDGE: {},
        wallMat: () => ({ opacity: 0.9, dispose: () => {} }),
        MACE: { r: 0.26, link: {}, ball: {}, ballMat: {}, spikes: {}, spikeMat: {} },
        glowSprite: () => new Obj(),
        humLoop: () => ({ set: () => {}, stop: () => {} }),
        SND: { beep: rec('beep'), whoosh: rec('whoosh'), metalHit: rec('metalHit'), zap: rec('zap'), perfect: rec('perfect') },
        fx: { electric: rec('electric') },
        hurtPlayer: rec('hurt'),
        arxHit: rec('arxHit'),
        arxClean: rec('arxClean'),
        registerRep: (p: boolean, f: boolean) => calls.push(`rep:${p}:${f}`),
        say: rec('say'),
      });
      const ra = mk(kind);
      const env: ArcsEnv = { s: (k) => settings[k], dv: (k) => settings[k], rnd: ptR, head: HL, calibRef, arenaDepth: D, jumpFastT: -1, beatP: 0, time: 0 };
      const pt = new ArcObsCore(kind, env, speed);
      // la cabeza: se aparta, se agacha y vuelve, cada vez de otra forma (a veces se sale del carril)
      const ax = 0.2 + r() * 0.9, wx = 0.5 + r() * 2, ay = r() * 0.5, wy = 0.5 + r() * 2.5, x0 = (r() - 0.5) * 0.6, out = r() < 0.08 ? 1.2 : 0;
      let t = 0;
      for (let i = 0; i < 3000 && ra.alive; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        HL.set(x0 + out + ax * Math.sin(t * wx), calibRef - ay * Math.max(0, Math.sin(t * wy)), Math.sin(t * 0.4) * 0.15);
        calls.length = 0;
        ra.update(dt, t);
        const f = pt.update(dt, env, state.v === 'play' || state.v === 'rest');
        const at = `semilla ${seed} (${kind}), fotograma ${i}`;
        expect(Math.abs(pt.z - ra.z), at).toBeLessThan(1e-12);
        expect(pt.alive, at).toBe(ra.alive);
        expect([pt.judged, pt.checked, pt.hit], at).toEqual([ra.judged, ra.checked, ra.hit]);
        expect(Math.abs(pt.warnT - ra.warnT), at).toBeLessThan(1e-12);
        expect([pt.leanX, pt.tilt, pt.drop], at).toEqual([ra.leanX, ra.tilt, ra.drop]);
        if (kind === 'laser') expect(pt.beamX, at).toBe(ra.beam?.position.x);
        if (kind === 'walls') expect([pt.wallL, pt.wallR], at).toEqual([ra.walls?.[0].position.x, ra.walls?.[1].position.x]);
        if (kind === 'mace') expect([pt.bx, pt.by, pt.bz], at).toEqual([ra.bx, ra.by, ra.bz]);
        // lo que se oye y lo que pasa, en el mismo orden que RepArena
        const mine: string[] = [];
        if (f.whoosh) mine.push('whoosh');
        if (f.beep) mine.push('beep:' + f.beep.toFixed(9));
        const o = f.outcome;
        if (o) {
          if (o.kind === 'lane') mine.push('say:' + o.say.slice(0, 3).join('|'));
          else if (o.kind === 'hit') mine.push('electric', ...o.sounds, 'hurt', 'arxHit', 'say:' + o.say.slice(0, 3).join('|'));
          else mine.push(o.sounds[0], `rep:${o.perfect}:false`, 'arxClean', 'say:' + o.say.join('|'), o.sounds[1]);
          tally[o.kind]++;
        }
        expect(mine, at).toEqual(calls);
        if (f.beep) tally.beep++;
        if (f.whoosh) tally.whoosh++;
      }
      expect(ra.alive, `semilla ${seed}`).toBe(false);
    }
    expect(tally.pass).toBeGreaterThan(30);
    expect(tally.hit).toBeGreaterThan(30);
    expect(tally.lane).toBeGreaterThan(3);
    expect(tally.beep).toBeGreaterThan(100);
    expect(tally.whoosh).toBeGreaterThan(20);
  }, 120000);
});

interface RAOrb {
  alive: boolean;
  band: string;
  pos: THREE.Vector3;
  grp: Obj;
  update(dt: number, t: number): void;
}

describe.skipIf(!RA_DIR)('los orbes de los Arcos, como en RepArena', () => {
  it('el mismo vuelo y los mismos cogidos (con la cabeza o una mano, en la fiebre y al compás) en 300 orbes al azar', () => {
    const code = raSlice('71_arcs.js', 'class ArcOrb', 'const _ao = ') + '\nconst mk = () => new ArcOrb();';
    let got = 0, gotHand = 0, frames = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const settings: Record<string, number> = { arcOrbHigh: r() * 40, arcOrbLow: r() * 40, arcOrbSwing: r() * 120 };
      const calibRef = 1.5 + r() * 0.3, D = 8 + r() * 6, speed = 2 + r() * 3, P = seed % 4 === 0 ? 0.4 + r() * 0.3 : 0;
      const HL = new V3(0, calibRef, 0), fever = r() < 0.3, play = r() < 0.9;
      const ARX = { fever, got: 0, gotBeat: 0 };
      const hands = { left: { ok: false, wrist: new V3() }, right: { ok: false, wrist: new V3() } };
      const w = { score: 0, says: [] as string[], beat: 0 };
      const raR = rng(seed * 17), ptR = rng(seed * 17);
      const mk = raRun<() => RAOrb>(code, 'mk', {
        THREE: THREE_STUB,
        V3,
        Math: mathWith(raR),
        TAU: Math.PI * 2,
        clamp,
        smooth,
        rand: (a: number, b: number) => a + raR() * (b - a),
        settings,
        calibRef,
        arenaDepth: () => D,
        arxSpeed: () => speed,
        HL,
        hands,
        ARX,
        state: play ? 'play' : 'rest',
        arxBeatP: () => P,
        beatNow: () => w.beat,
        get score() {
          return w.score;
        },
        set score(v: number) {
          w.score = v;
        },
        boardDirty: false,
        arena: { add: () => {}, remove: () => {}, worldToLocal: (v: THREE.Vector3) => v },
        orbGeo: {},
        orbMat: {},
        orbCoreGeo: {},
        orbCoreMat: {},
        orbRingGeo: {},
        orbRingMat: {},
        orbRing2Mat: {},
        glowSprite: () => new Obj(),
        fx: { trail: () => {}, glow: () => {}, sparks: () => {} },
        SND: { orb: () => {} },
        PADD: { add: () => {} },
        rv: () => new V3(),
        hapticBoth: () => {},
        cheer: (s: string) => w.says.push('cheer:' + s),
        say: (s: string) => w.says.push('say:' + s),
      });
      const ra = mk();
      const env: ArcsEnv = { s: (k) => settings[k], dv: (k) => settings[k], rnd: ptR, head: HL, calibRef, arenaDepth: D, jumpFastT: -1, beatP: P, time: 0 };
      const st = new ArxState();
      st.fever = fever;
      const pt = new ArcOrbCore(env, speed);
      expect(pt.band, `semilla ${seed}`).toBe(ra.band);
      // la cabeza y las manos se mueven por la pista (a veces pasan por el orbe)
      const ax = r() * 0.6, ay = r() * 0.6, wl = 0.6 + r() * 2, useHands = r() < 0.5;
      let t = r() * 10, myScore = 0;
      const my: string[] = [];
      for (let i = 0; i < 4000 && ra.alive; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        w.beat = t / (P || 1);
        HL.set(ax * Math.sin(t * 1.3), calibRef - ay * Math.max(0, Math.sin(t * 0.9)), 0.1 * Math.sin(t * 0.5));
        hands.left.ok = useHands && Math.sin(t * 2.1) > -0.3;
        hands.right.ok = useHands && Math.sin(t * 1.7) > 0;
        hands.left.wrist.set(-0.3 + 0.5 * Math.sin(t * wl), calibRef - 0.5 + 0.9 * Math.sin(t * 1.1), -0.3);
        hands.right.wrist.set(0.3 + 0.5 * Math.sin(t * wl * 1.3), calibRef - 0.4 + 0.9 * Math.sin(t * 0.8), -0.35);
        ra.update(dt, t);
        const o = pt.update(dt, t, env, st, { left: hands.left.ok ? hands.left.wrist : null, right: hands.right.ok ? hands.right.wrist : null }, play, w.beat);
        const at = `semilla ${seed}, fotograma ${i}`;
        expect(pt.at.x, at).toBe(ra.grp.position.x);
        expect(pt.at.y, at).toBe(ra.grp.position.y);
        expect(pt.at.z, at).toBe(ra.grp.position.z);
        expect(pt.alive, at).toBe(ra.alive);
        if (o) {
          myScore += o.pts;
          if (o.cheer) my.push('cheer:' + o.cheer[0]);
          my.push('say:' + o.say[0]);
          got++;
          if (Math.hypot(pt.at.x - HL.x, pt.at.y - HL.y + 0.05, pt.at.z - HL.z) >= 0.24) gotHand++;
        }
        expect(myScore, at).toBe(w.score);
        frames++;
      }
      expect(ra.alive).toBe(false);
      expect(my, `semilla ${seed}`).toEqual(w.says);
      expect([st.got, st.gotBeat], `semilla ${seed}`).toEqual([ARX.got, ARX.gotBeat]);
    }
    expect(frames).toBeGreaterThan(50000);
    expect(got).toBeGreaterThan(30);
    expect(gotHand).toBeGreaterThan(5);
  }, 120000);
});

interface RAX {
  ARX: { streak: number; fever: boolean; feverN: number; dist: number; orbT: number; got: number; tl: number[]; tlT: number; best: ArxGhost | null; obk: number; bk: number; orbs: unknown[] };
  arxReset(): void;
  arxClean(): void;
  arxHit(): void;
  arxStep(dt: number, t: number): void;
  arxGhostDiff(): number | null;
  arxEnd(): { medal: [string, string] | null; dist: number; orbs: number; rec: boolean; farther: boolean };
  arxBeatTick(): boolean;
  arxMul(): number;
}

describe.skipIf(!RA_DIR)('la racha, la fiebre, el fantasma y la medalla de los Arcos, como en RepArena', () => {
  it('lo mismo en 200 rondas al azar de pasadas limpias y golpes', () => {
    const code = [raSlice('71_arcs.js', 'const ARX = ', 'const arxBeatGlow', false), raSlice('71_arcs.js', 'function arxStep', '// El fantasma', false), raSlice('71_arcs.js', 'function arxGhostDiff', '// Al acabar', false), raSlice('71_arcs.js', 'function arxEnd', '}')].join('\n');
    let fevers = 0, ghosts = 0, medals = 0, orbs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const settings: Record<string, number | string> = { mode: 'arcs', arcFever: r() < 0.85 ? 1 : 0, arcFeverUp: r() < 0.3 ? -1 : r() * 60, arcSpeed: 6 + r() * 10, arcBpmSpeed: 0, arcPhrases: 1 };
      const P = seed % 3 === 0 ? 0.4 + r() * 0.3 : 0, D = 8 + r() * 6;
      const HL = new V3(0, 1.6, 0);
      const stored = new Map<string, unknown>();
      const hasPrev = r() < 0.6;
      const prev: ArxGhost | null = hasPrev ? { score: Math.floor(r() * 4000), dist: Math.floor(r() * 300), tl: Array.from({ length: Math.floor(r() * 40) }, (_, i) => i * 50) } : null;
      if (prev) stored.set('reparena3-arcghost', JSON.parse(JSON.stringify(prev)));
      const w = { state: 'play', score: 0, winT: -1, stats: { reps: 0, taken: 0 }, beat: 0, calls: [] as string[], spawned: 0 };
      const ra = raRun<RAX>(code, '({ ARX, arxReset, arxClean, arxHit, arxStep, arxGhostDiff, arxEnd, arxBeatTick, arxMul })', {
        Math: mathWith(rng(seed * 5)),
        settings,
        dv: (k: string) => settings[k],
        clamp,
        store: (k: string, v?: unknown) => {
          if (v === undefined) return stored.has(k) ? JSON.parse(JSON.stringify(stored.get(k))) : null;
          stored.set(k, JSON.parse(JSON.stringify(v)));
          return null;
        },
        arxFeverLook: (on: boolean) => w.calls.push('look:' + on),
        arxFeverStart: () => w.calls.push('start'),
        cheer: (s: string, c: string, d: number) => w.calls.push(`cheer:${s}|${c}|${d}`),
        SND: { combo: () => w.calls.push('combo'), horn: () => w.calls.push('horn') },
        arxBeatP: () => P,
        beatNow: () => w.beat,
        spawnQueue: [],
        HL,
        arenaDepth: () => D,
        arxDeco: () => {},
        ArcOrb: class {
          alive = true;
          constructor() {
            w.spawned++;
          }
          update(): void {}
        },
        get state() {
          return w.state;
        },
        WIN: { get t() {
          return w.winT;
        } },
        get score() {
          return w.score;
        },
        boardDirty: false,
        get stats() {
          return w.stats;
        },
      });
      const env: ArcsEnv = { s: (k) => settings[k] as number, dv: (k) => settings[k] as number, rnd: Math.random, head: HL, calibRef: 1.6, arenaDepth: D, jumpFastT: -1, beatP: P, time: 0 };
      const st = new ArxState();
      const my: string[] = [];
      const ev = (e: ArxEvent | null) => {
        if (!e) return;
        if (e.feverLook !== undefined && !e.feverStart) {
          // (RepArena: arxHit pone el aviso antes de apagar el aspecto)
          if (e.cheer) my.push(`cheer:${e.cheer.join('|')}`);
          my.push('look:' + e.feverLook);
          return;
        }
        if (e.feverLook) my.push('look:true');
        if (e.feverStart) my.push('start');
        if (e.cheer) my.push(`cheer:${e.cheer.join('|')}`);
        if (e.sound) my.push(e.sound);
      };
      ra.arxReset();
      ev(arxReset(st, store(stored)));
      let mySpawned = 0;
      const speedOf = () => (settings.arcSpeed as number) / 3.6 * arxMul(st, env);
      let t = 0;
      for (let i = 0; i < 5000; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        w.beat = t / (P || 1);
        if (i % 400 === 0) w.state = r() < 0.85 ? 'play' : 'rest';
        if (i % 300 === 0) w.winT = r() < 0.2 ? 1 : -1;
        HL.z = 0.2 * Math.sin(t);
        if (r() < 0.02) {
          // un arco pasado o que te da
          if (r() < 0.8) {
            ra.arxClean();
            ev(arxClean(st, env));
            w.stats.reps++;
            w.score += Math.round(10 + r() * 40) * (st.fever ? 2 : 1);
          } else {
            ra.arxHit();
            ev(arxHit(st));
            w.stats.taken++;
          }
        }
        if (r() < 0.01) {
          const v = r() * 1.5;
          ra.ARX.orbT = v;
          st.orbT = v;
        }
        expect(Math.abs(arxMul(st, env) - ra.arxMul()), `semilla ${seed}, fotograma ${i}`).toBeLessThan(1e-12);
        if (P) expect(arxBeatTick(st, env, speedOf(), w.beat)).toBe(ra.arxBeatTick());
        ra.arxStep(dt, t);
        const o = arxStep(st, env, dt, { play: w.state === 'play', winOpen: w.winT >= 0, speed: speedOf(), score: w.score, beatNow: w.beat });
        ev(o.event);
        if (o.spawnOrb) mySpawned++;
        const at = `semilla ${seed}, fotograma ${i}`;
        expect(mySpawned, at).toBe(w.spawned);
        const A = ra.ARX;
        expect([st.streak, st.fever, st.feverN, st.orbT, st.tl.length, st.obk], at).toEqual([A.streak, A.fever, A.feverN, A.orbT, A.tl.length, A.obk]);
        expect(Math.abs(st.dist - A.dist), at).toBeLessThan(1e-9);
        expect(Math.abs(st.tlT - A.tlT), at).toBeLessThan(1e-12);
        expect(arxGhostDiff(st, w.score), at).toBe(ra.arxGhostDiff());
        if (P) expect(st.bk, at).toBe(A.bk);
      }
      expect(st.tl).toEqual(ra.ARX.tl);
      expect(my, `semilla ${seed}`).toEqual(w.calls);
      if (r() < 0.5) w.score += Math.floor(r() * 3000);
      const before = stored.get('reparena3-arcghost');
      const re = ra.arxEnd(), saved = stored.get('reparena3-arcghost');
      const me = arxEnd(st, w.score, w.stats.reps, w.stats.taken);
      expect({ medal: me.medal, dist: me.dist, orbs: me.orbs, rec: me.rec, farther: me.farther }, `semilla ${seed}`).toEqual(re);
      expect(me.ghost, `semilla ${seed}`).toEqual(saved === before ? null : saved);
      fevers += st.feverN;
      orbs += mySpawned;
      if (me.ghost) ghosts++;
      if (me.medal) medals++;
    }
    expect(fevers).toBeGreaterThan(50);
    expect(ghosts).toBeGreaterThan(20);
    expect(medals).toBeGreaterThan(20);
    expect(orbs).toBeGreaterThan(100);
  }, 120000);
});

/** El fantasma guardado, como lo lee RepArena (store). */
function store(m: Map<string, unknown>): ArxGhost | null {
  const v = m.get('reparena3-arcghost');
  return v ? (JSON.parse(JSON.stringify(v)) as ArxGhost) : null;
}
