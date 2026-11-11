// La Travesía portada (src/modes/trek: path.ts y halts.ts) frente al código original de RepArena (src/75_trek.js, con lo
// que se pinta cambiado por nada): el sendero y sus curvas; y partidas simuladas con la misma cabeza y el mismo azar
// (repeticiones a ritmos al azar, saltos, zancadas, agacharse, paradas que se superan, se dejan a medias o se hunden,
// pausas y tramos), en todos los ejercicios: en cada fotograma, lo mismo recorrido, la misma velocidad, el mismo turbo,
// los mismos retos en el mismo sitio y la misma parada; y, al final, los mismos avisos, sonidos, efectos, puntos y premios
// en el mismo orden, las mismas rocas y las mismas piezas del arroyo y el desfiladero. (Se salta sin RA_DIR.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RockBox, TrekEnv, TrekEv, TrekObs, TrekPos } from '../../src/modes/trek/env.js';
import { trekHaltEnd } from '../../src/modes/trek/halts.js';
import { Trek, trekTh } from '../../src/modes/trek/path.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const BOX: Record<string, RockBox> = { Rock_Medium_1: { w: 2.2, h: 1.6, y0: -0.1 }, Rock_Medium_2: { w: 1.8, h: 1.2, y0: 0 }, Rock_Medium_3: { w: 2.6, h: 1.9, y0: -0.2 } };
const P = (v: { x: number; y: number; z: number } | null | undefined): string => (v ? [v.x, v.y, v.z].map((n) => n.toFixed(4)).join(',') : '-');
const F5 = (a: number[]): string => a.map((v) => v.toFixed(5)).join(',');

interface RAObs {
  kind: string;
  at: number;
  judged: boolean;
  done?: boolean;
  got?: number;
  side: number;
  y: number;
  zl?: number;
  dx?: number;
  stop?: number;
  need?: number;
  len?: number;
  exit?: number;
  seed?: number;
  rr?: number;
  stones?: THREE.Vector3[];
  bandits?: { x: number; z: number; hp: number; ph: number }[];
  mesh: { rotation: { y: number }; position: THREE.Vector3 };
}
interface RATrek {
  dist: number;
  v: number;
  want: number;
  push: number;
  glide: number;
  turbo: boolean;
  tg: number;
  idle: number;
  minY: number;
  keys: number;
  ducked: number;
  hits: number;
  lunge: boolean;
  hop: { t: number; dur: number } | null;
  halt: RAObs | null;
  obs: RAObs[];
  chunks: { v: THREE.Vector3; w: THREE.Vector3; m: { position: THREE.Vector3 } }[];
  group: { position: { y: number } };
}
interface RAApi {
  TREK: RATrek;
  trekReset(): void;
  trekWave(i: number): void;
  trekRep(o: { perfect: boolean }): void;
  trekStep(dt: number, t: number): void;
  trekP(s: number, out: { x: number; z: number }): { x: number; z: number };
  trekBend(s: number, u: number, out: { x: number; z: number }): number;
  trekFrame(): void;
  trekTh(s: number): number;
  ROCKS: string[];
  MERGE: string[][];
}
interface World {
  state: string;
  wave: number;
  rank: number;
  clock: number;
  settings: Record<string, number | string>;
  HL: THREE.Vector3;
  calibRef: number;
  bandReady: boolean;
  chestReady: boolean;
  rec: string[];
  score: number;
}

const STUBS = `
class Obj { constructor(geo, mat) { this.geometry = geo; this.material = mat || { opacity: 1 }; this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.scale = { v: 1, setScalar(s) { this.v = s; } }; this.children = []; this.userData = {}; this.visible = true; this.parent = null; }
  add(c) { c.parent = this; this.children.push(c); } remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; }
  localToWorld(v) { return v; } worldToLocal(v) { return v; } updateMatrixWorld() {} traverse(f) { f(this); this.children.forEach(c => c.traverse(f)); } }
class Geo { constructor() { this.attributes = { position: { count: 0, getX() { return 0; }, getY() { return 0; }, setY() {} } }; } translate() {} setAttribute() {} }
const THREE = { Group: Obj, Mesh: Obj, BoxGeometry: Geo, PlaneGeometry: Geo, BufferAttribute: class {}, MeshBasicMaterial: class {} };
const ROCKS = [], MERGE = [];
let boardDirty = false;
const P = v => v ? [v.x, v.y, v.z].map(n => n.toFixed(4)).join(',') : '-';
const G = { cyl: () => new Geo(), box: () => new Geo() }, MACE = { link: {}, ballMat: {} }, TREK_BARK = {}, TREK_SHADOW = {};
const trekM = (x, y, z, ry, sx, sy = sx, sz = sx) => [x, y, z, ry, sx, sy, sz];
function trekShadow() {} function trekPart() {}
function trekMerge(g, L) { MERGE.push(L.map(([n, a]) => n + ' ' + a.map(v => v.toFixed(5)).join(','))); }
function trekWaterMat() { return { uniforms: { uRocks: { value: Array.from({ length: 8 }, () => ({ set() {} })) } } }; }
function trekPitMat() { return {}; } function trekPillar() { return []; } function trekBandMesh() {} function trekBandPlay() {}
function glowSprite() { return new Obj(null, { opacity: 0 }); }
function trekSink(p) { p.userData.sink = 0.01; rec('sink ' + TREK.halt.pillars.indexOf(p)); }
function trekBandLoad() {} function trekWolfLoad() {} function aldLoad() {} function islandLoad() {}
function trekChaseEnd() {} function trekChaseStep() {} function trekBandAnim() {}
function trekBandFight(o) { if (o.haltT > 5) trekHaltEnd(o, true); }
function trekGround() {} function trekRibbon() {} function trekLayout() {} function trekLight() {} function trekWindStep() {} function trekChunks() {} function trekDrop() {}
const arcScenic = () => false, panoStep = () => {}, arMode = false;
const NAT = { ready: true, group: { position: {} }, parts: NATPARTS };
const natGround = { rotation: {}, material: { map: { offset: { set() {} } } } };
const trekPath = {}, TREK_DECK = { position: {} }, TREK_PATH_TEX = { offset: {} };
const TREK_HOLE = { value: { set() {} } }, TREK_HOLE_M = { value: { copy() { return { invert() {} }; } } };
const TREK_WT = {}, TREK_SUN = { value: { copy() { return this; }, sub() { return this; }, normalize() { return this; } } };
const keyLight = { position: {}, target: { position: {} } }, TREK_DUSK = { value: 0 };
const arena = { add() {}, localToWorld: v => v };
const ISL = { get ready() { return W.chestReady; }, parts: {} };
const TREK_BAND = { get scene() { return W.bandReady ? {} : null; }, bare: false };
const sndF = n => (p, a) => rec('snd ' + n + ' ' + P(p) + ' ' + a);
const SND = { perfect: sndF('perfect'), combo: sndF('combo'), whoosh: sndF('whoosh'), metalHit: sndF('metalHit'), step: sndF('step'), explosion: sndF('explosion'), victory: sndF('victory') };
const fxF = n => (p, ...a) => rec('fx ' + n + ' ' + P(p) + ' ' + JSON.stringify(a));
const fx = { sparks: fxF('sparks'), smoke: fxF('smoke'), dust: fxF('dust'), glow: fxF('glow') };
function hapticBoth(k, ms) { rec('haptic ' + k.toFixed(4) + ' ' + ms); }
function say(m, c, d, toast = true) { rec((toast ? 'say ' : 'cheer ') + m + ' ' + c + ' ' + d); }
const cheer = (m, c, d) => say(m, c, d, false);
function trophy(a, b) { rec('trophy ' + a + ' | ' + b); }
function hurtPlayer() { rec('hurt'); }
const STORE = {};
function store(k, v) { if (v === undefined) return STORE[k] === undefined ? null : STORE[k]; STORE[k] = v; rec('store ' + k + ' ' + v); }
`;

function original(W: World, random: () => number): RAApi {
  const f = '75_trek.js';
  const code = [
    STUBS,
    raSlice('20_render.js', 'function rng'),
    raSlice(f, 'const TREK_VMAX', 'const trekOn'),
    raSlice(f, 'const TREK_BIOMES', '];'),
    raSlice(f, 'const trekTh', '// la cinta del sendero', false),
    raSlice(f, 'const trekLegs', 'function trekShadow', false),
    raSlice(f, 'function trekRock('),
    // (cada roca al azar, para compararlas: su modelo, su sitio, su tamaño y su giro)
    "const _trekRock0 = trekRock; trekRock = function (g, x, s) { const n = _trekRock0(g, x, s), m = g.children[g.children.length - 1]; ROCKS.push(n + ' ' + x + ' ' + s.toFixed(5) + ' ' + (m ? m.rotation.y.toFixed(5) : '-')); return n; };",
    raSlice(f, 'function trekObsMesh', '// Rocas del paisaje', false),
    raSlice(f, 'function trekRockBox', '// las orillas', false),
    raSlice(f, 'function trekBanks', '// un pilar de roca', false),
    raSlice(f, 'const TREK_SEE', '/* ---------- Turbo', false),
    raSlice(f, 'const TREK_TURBO_N', '// las estelas', false),
    raSlice(f, 'const TMV', '// La sensación de saltar', false),
    raSlice(f, 'function trekHopStep', 'function trekSink', false),
    raSlice(f, 'function trekHaltStep', '// los añicos', false),
    raSlice(f, 'function trekRockBurst', '// el cofre abierto', false),
    raSlice(f, 'function trekChestVanish', 'function trekChunks', false),
    raSlice(f, 'function trekHaltEnd', '/* ---------- Bandidos', false),
    raSlice(f, 'const trekK = '),
    raSlice(f, 'function trekStep', 'function trekDrop', false),
    raSlice(f, 'function trekReset', 'settingHooks.push', false),
  ].join('\n');
  const Mth = { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random };
  const NATPARTS = Object.fromEntries(
    Object.entries(BOX).map(([n, b]) => [n, [{ geo: { computeBoundingBox() {}, boundingBox: { min: { x: -b.w / 2, y: b.y0, z: -b.w * 0.4 }, max: { x: b.w / 2, y: b.y0 + b.h, z: b.w * 0.4 } } }, mat: {} }]]),
  );
  let combo = 5;
  return raRun<RAApi>(code, '{ TREK, trekReset, trekWave, trekRep, trekStep, trekP, trekBend, trekFrame, trekTh, ROCKS, MERGE }', {
    V3,
    Math: Mth,
    TAU: Math.PI * 2,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    rand: (a: number, b: number) => a + random() * (b - a),
    W,
    NATPARTS,
    HEAD_TOP: 0.1,
    rec: (s: string) => W.rec.push(s),
    settings: W.settings,
    dv: (k: string) => W.settings[k],
    rankIdx: () => W.rank,
    performance: { now: () => W.clock * 1000 },
    get state() {
      return W.state;
    },
    get waveIdx() {
      return W.wave;
    },
    get calibRef() {
      return W.calibRef;
    },
    get HL() {
      return W.HL;
    },
    head: {
      get p() {
        return W.HL;
      },
    },
    get score() {
      return W.score;
    },
    set score(v: number) {
      W.rec.push('score ' + (v - W.score));
      W.score = v;
    },
    get combo() {
      return combo;
    },
    set combo(v: number) {
      if (v === 0) W.rec.push('combo0');
      combo = 5;
    },
  });
}

/** Lo que hace la partida con los sucesos, en el mismo formato que lo que apunta RepArena. */
function apply(ev: TrekEv[], out: string[], rocks: string[], merge: string[][], store: Record<string, unknown>): void {
  const p = (a: TrekPos | null) => P(a);
  const rk = (r: { n: string; x: number; s: number; ry: number[] }) => `${r.n} ${r.x} ${r.s.toFixed(5)} ${r.ry.length ? r.ry[r.ry.length - 1].toFixed(5) : '-'}`;
  for (const e of ev) {
    if (e.t === 'say' || e.t === 'cheer') out.push(`${e.t} ${e.text} ${e.col} ${e.dur}`);
    else if (e.t === 'snd') out.push(`snd ${e.name} ${p(e.at)} ${e.arg}`);
    else if (e.t === 'fx') out.push(`fx ${e.name} ${p(e.at)} ${JSON.stringify(e.args)}`);
    else if (e.t === 'haptic') out.push(`haptic ${e.k.toFixed(4)} ${e.ms}`);
    else if (e.t === 'score') out.push(`score ${e.n}`);
    else if (e.t === 'combo0' || e.t === 'hurt') out.push(e.t);
    else if (e.t === 'trophy') out.push(`trophy ${e.title} | ${e.sub}`);
    else if (e.t === 'store') {
      store[e.key] = e.val;
      out.push(`store ${e.key} ${e.val}`);
    } else if (e.t === 'sink') out.push(`sink ${e.i}`);
    else if (e.t === 'spawn') {
      for (const r of e.o.rocks || []) rocks.push(rk(r));
      if (e.o.pieces) merge.push(e.o.pieces.map((q) => `${q.n} ${F5([q.x, q.y, q.z, q.ry, q.sx, q.sy, q.sz])}`));
    } else if (e.t === 'chips') for (const c of e.chips) rocks.push(rk(c.rock));
  }
  ev.length = 0;
}

// (comparar solo cuando difiere: con expect en cada fotograma, la prueba tardaba demasiado)
function same(a: unknown, ctx: string, b: unknown): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) expect(a, ctx).toEqual(b);
}

describe.skipIf(!RA_DIR)('la Travesía, como en RepArena', () => {
  it('el mismo sendero: sus puntos, su rumbo y dónde queda cada cosa, con curvas y sin ellas', () => {
    for (const curves of [1, 0]) {
      const W: World = { state: 'play', wave: 0, rank: 0, clock: 0, settings: { mode: 'trek', exercise: 'squat', trekCurves: curves, trekSpeed: 130, jumpHeight: 10, squatDepth: 26, lungeDepth: 28 }, HL: new V3(0, 1.6, 0), calibRef: 1.6, bandReady: false, chestReady: true, rec: [], score: 0 };
      const ra = original(W, Math.random);
      const env = { s: (k: string) => W.settings[k] as number, trek: true } as unknown as TrekEnv;
      const tk = new Trek(env);
      const a = { x: 0, z: 0 }, b = { x: 0, z: 0 }, r = rng(curves + 3);
      for (let i = 0; i < 3000; i++) {
        const s = -60 + r() * 900;
        expect(tk.th(s)).toBe(ra.trekTh(s));
        expect(trekTh(s, !!curves)).toBe(ra.trekTh(s));
        ra.trekP(s, a);
        tk.p(s, b);
        expect([b.x, b.z]).toEqual([a.x, a.z]);
        if (i % 10 === 0) {
          ra.TREK.dist = tk.dist = r() * 800;
          ra.trekFrame();
          tk.frame();
        }
        const u = (r() - 0.5) * 30;
        expect(tk.bend(s, u, b)).toBe(ra.trekBend(s, u, a));
        expect([b.x, b.z]).toEqual([a.x, a.z]);
      }
    }
  });

  it('las mismas partidas: avance, turbo, retos y paradas, fotograma a fotograma (60 al azar)', () => {
    let frames = 0, halts = 0, wins = 0;
    const kindsSeen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 31 + 7);
      const ex = ['squat', 'lunge', 'frontsq', 'jsquat', 'curl'][seed % 5];
      const W: World = {
        state: 'play', wave: 0, rank: Math.floor(r() * 7), clock: 1 + r() * 100,
        settings: { mode: 'trek', exercise: ex, trekCurves: r() < 0.7 ? 1 : 0, trekSpeed: 60 + Math.floor(r() * 15) * 10, jumpHeight: 6 + Math.floor(r() * 10), squatDepth: 18 + Math.floor(r() * 20), lungeDepth: 20 + Math.floor(r() * 16) },
        HL: new V3(0, 1.6, 0), calibRef: 1.55 + r() * 0.2, bandReady: r() < 0.6, chestReady: r() < 0.8, rec: [], score: 0,
      };
      W.HL.y = W.calibRef;
      const raR = rng(seed * 7919), ptR = rng(seed * 7919);
      const ra = original(W, raR);
      const myStore: Record<string, unknown> = {}, out: string[] = [], rocks: string[] = [], merge: string[][] = [];
      const env: TrekEnv = {
        s: (k) => W.settings[k] as number,
        dv: (k) => W.settings[k] as number,
        ex,
        trek: true,
        get state() {
          return W.state;
        },
        head: W.HL,
        get calibRef() {
          return W.calibRef;
        },
        get wave() {
          return W.wave;
        },
        get rank() {
          return W.rank;
        },
        get now() {
          return (W.clock * 1000) / 1000; // (como RepArena: performance.now() / 1000)
        },
        rnd: ptR,
        rockBox: (n) => BOX[n],
        get bandReady() {
          return W.bandReady;
        },
        get chestReady() {
          return W.chestReady;
        },
        store: (k) => (myStore[k] === undefined ? null : myStore[k]),
      };
      const tk: Trek = new Trek(env, { bandFight: (o: TrekObs) => { if ((o.haltT || 0) > 5) trekHaltEnd(tk, o, true); } });
      ra.trekReset();
      tk.reset();
      ra.trekWave(0);
      tk.wave(0);
      apply(tk.ev, out, rocks, merge, myStore);
      // la cabeza: lo que está haciendo ahora (cuánto dura, cómo sube o baja y avanza, y si es una repetición)
      let act = { t: 0, dur: 0.5, dy: 0, dz: 0, shape: 0, rep: false, perfect: false };
      const seen = new Set<RAObs>(), haltSeen = new Set<RAObs>();
      let playT = 0, restT = 0, pauseT = 0;
      const dt = 1 / 72, N = 72 * 80;
      for (let i = 0; i < N; i++, frames++) {
        const t = i * dt;
        W.clock += dt;
        // la partida: tramos de ~20 s con su descanso, y alguna pausa
        if (W.state === 'play') {
          playT += dt;
          if (playT > 20 && !ra.TREK.halt) {
            W.state = 'rest';
            restT = 0;
          } else if (r() < 0.0008) {
            W.state = 'paused';
            pauseT = 0;
          }
        } else if (W.state === 'rest' && (restT += dt) > 2) {
          W.state = 'play';
          playT = 0;
          W.wave++;
          ra.trekWave(W.wave);
          tk.wave(W.wave);
        } else if (W.state === 'paused' && (pauseT += dt) > 1) W.state = 'play';
        if (i === N - 60) W.state = 'end';
        // lo siguiente que hace la cabeza
        act.t += dt;
        if (act.t >= act.dur) {
          if (act.rep && W.state === 'play') {
            ra.trekRep({ perfect: act.perfect });
            tk.rep(act.perfect);
          }
          const H = ra.TREK.halt, ahead = ra.TREK.obs.find((o) => !o.judged && (o.kind === 'log' || o.kind === 'branch') && o.at - ra.TREK.dist < ra.TREK.v * 1.1 + 0.7);
          const mk = (dur: number, dy: number, dz: number, shape: number, rep = false) => ({ t: 0, dur, dy, dz, shape, rep, perfect: r() < 0.3 });
          if (H) {
            const mv = (H as unknown as { move?: string }).move, k = r();
            if (k < 0.04) act = mk(42, 0, 0, 0);
            else if (k < 0.25) act = mk(1 + r() * 5, 0, 0, 0);
            else if (k < 0.32) act = mk(0.6 + r(), -0.3, 0, 1, true); // (la repetición del ejercicio, parado: no cuenta)
            else if (mv === 'jump' || H.kind === 'bandit') act = mk(0.45 + r() * 0.3, 0.06 + r() * 0.16, 0, 1);
            else if (mv === 'lunge') act = mk(0.7 + r() * 0.5, -(0.08 + r() * 0.15), -(0.05 + r() * 0.25), 1);
            else act = mk(0.7 + r() * 0.6, -(0.1 + r() * 0.25), 0, 1);
          } else if (ahead && r() < 0.75) act = ahead.kind === 'log' ? mk(0.5, 0.05 + r() * 0.15, 0, 1) : mk(1.2, -(0.3 + r() * 0.25), 0, 1);
          else if (r() < 0.12) act = mk(0.5 + r() * 4, 0, 0, 0);
          else act = mk(0.4 + r() * 2.2, -(0.08 + r() * 0.4), ex === 'lunge' ? -0.1 : 0, 1, true);
        }
        const k = act.t / act.dur, bump = act.shape ? Math.sin(Math.PI * Math.min(1, k)) : 0;
        W.HL.set(Math.sin(t * 0.7) * 0.05, W.calibRef + act.dy * bump, act.dz * bump);
        ra.trekStep(dt, t);
        tk.step(dt, t);
        apply(tk.ev, out, rocks, merge, myStore);
        const A = ra.TREK;
        const ctx = `semilla ${seed} (${ex}) fotograma ${i}`;
        same([tk.dist, tk.v, tk.want, tk.push, tk.glide, tk.turbo, tk.tg, tk.idle, tk.minY, tk.keys, tk.ducked, tk.hits, tk.lunge, tk.hopY], ctx, [A.dist, A.v, A.want, A.push, A.glide, A.turbo, A.tg, A.idle, A.minY, A.keys, A.ducked, A.hits, A.lunge, A.group.position.y]);
        same(tk.halt && [tk.halt.kind, tk.halt.at, tk.halt.got], ctx, A.halt && [A.halt.kind, A.halt.at, A.halt.got]);
        expect(tk.obs.length, ctx).toBe(A.obs.length);
        for (let j = 0; j < A.obs.length; j++) {
          const a = A.obs[j], b = tk.obs[j];
          same([b.kind, b.at, b.judged, !!b.done, b.got, b.side, b.zl, b.dx, b.ry, b.px, b.pz], ctx, [a.kind, a.at, a.judged, !!a.done, a.got, a.side, a.zl, a.dx, a.mesh.rotation.y, a.mesh.position.x, a.mesh.position.z]);
          if (!seen.has(a)) {
            seen.add(a);
            kindsSeen.add(a.kind);
            expect([b.y, b.stop, b.need, b.len, b.exit, b.seed, b.rr, (b.stones || []).map(P), (b.bandits || []).map((q) => [q.x, q.z, q.hp, q.ph])], ctx).toEqual([a.y, a.stop, a.need, a.len, a.exit, a.seed, a.rr, (a.stones || []).map(P), (a.bandits || []).map((q) => [q.x, q.z, q.hp, q.ph])]);
          }
        }
        if (A.halt && !haltSeen.has(A.halt)) {
          haltSeen.add(A.halt);
          halts++;
        }
      }
      expect(out, `semilla ${seed} (${ex})`).toEqual(W.rec);
      expect(rocks, `semilla ${seed}`).toEqual(ra.ROCKS);
      expect(merge, `semilla ${seed}`).toEqual(ra.MERGE);
      expect(W.score).toBeGreaterThanOrEqual(0);
      wins += W.rec.filter((s) => /cruzado|añicos|Cofre abierto|Camino libre/.test(s)).length;
    }
    // (que de verdad se hayan visto todos los retos y paradas superadas)
    expect([...kindsSeen].sort()).toEqual(['bandit', 'branch', 'chasm', 'chest', 'log', 'rock', 'stream']);
    expect(wins).toBeGreaterThan(20);
    expect(halts).toBeGreaterThan(100);
    expect(frames).toBe(60 * 72 * 80);
  }, 300_000);
});
