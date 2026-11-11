// El modo Toques portado (src/modes/touch: moveSpec, TouchTarget, buildTouchWave, touchStep…) frente al código original
// de RepArena (src/74_touch.js, con lo que se ve hecho con el THREE de verdad y su azar de adorno aparte): los mismos
// ajustes, ejercicios y combinados al azar, el mismo azar; tienen que salir las mismas oleadas, los mismos objetivos en el
// mismo sitio y, con una cabeza y unas manos simuladas que van a por ellos (o no, o con la mano equivocada, o sin volver a
// la postura), los mismos toques, fallos, perfectos, avisos y vueltas a la postura de partida en cada fotograma.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import type { TouchEnv, TouchEvent } from '../../src/modes/touch/env.js';
import { moveSpec, mkTouch, type TouchState, type TouchTarget } from '../../src/modes/touch/targets.js';
import { buildTouchWave, snapBeat, tchGapFor, touchAssist, touchLeft, touchStartWave, touchStep, type TouchSpec } from '../../src/modes/touch/wave.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
type Rnd = () => number;
type Settings = Record<string, number | string>;

interface World {
  settings: Settings;
  state: string;
  HL: THREE.Vector3;
  speed: number;
  hands: Record<Side, Hand>;
  sword: boolean;
  standY: number;
  ar: boolean;
  log: string[];
  now: number;
  gate: { x: number; z: number; g: { visible: boolean }; openT: number };
}
interface RATarget {
  move: string;
  part: string;
  hand: string;
  mode: string;
  judged: boolean;
  alive: boolean;
  arriveAt: number;
  win: number;
  held: number;
  outT: number;
  popT: number;
  hold: number;
  r: number;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  n: THREE.Vector3;
  prevPos: THREE.Vector3;
  root: THREE.Object3D;
  ang?: number;
  yaw?: number;
  normal?: THREE.Vector3;
  cutDir?: THREE.Vector3;
}
interface RAApi {
  readonly touches: RATarget[];
  TCH: { ref: number; clock: number; nextArrive: number; seq: number; beat0: number; hintT: number; headArm: { armed: boolean }; arm: Record<Side, { armed: boolean; n: number }> };
  touchStep(dt: number, t: number): void;
  buildTouchWave(i: number): TouchSpec[];
  touchStartWave(): void;
  moveSpec(move: string, sd0?: number): RATarget & { pos: THREE.Vector3 };
  touchAssist(part: string): RATarget | null;
  snapBeat(c: number): number;
  tchGapFor(move: string): number;
  spawnQueue: TouchSpec[];
}

// el bloque que corta la espada (en las dos versiones, el mismo): una mano con mando a menos de 22 cm; un poco más lejos,
// el aviso de la flecha
function cutTest(w: World, p: THREE.Vector3): Side | 'hint' | null {
  for (const s of ['left', 'right'] as Side[]) {
    const h = w.hands[s];
    if (!h.ok || h.isHand) continue;
    const d = h.wrist.distanceTo(p);
    if (d < 0.22) return s;
    if (d < 0.32) return 'hint';
  }
  return null;
}

function original(w: World, random: Rnd, vr: Rnd): RAApi {
  const viz = (s: string) => s.replace(/Math\.random\(\)/g, 'VR()').replace(/\brand\(/g, 'vrand(');
  const code = [
    raSlice('00_core.js', 'const swordSet'),
    raSlice('00_core.js', 'const isFloor'),
    raSlice('00_core.js', 'const isSupine'),
    raSlice('74_touch.js', 'let touches', 'function neonZap', false),
    viz(raSlice('74_touch.js', 'function neonZap', 'const neonRingMat', false)),
    raSlice('74_touch.js', 'const neonRingMat', '  update(dt, t) {', false),
    viz(raSlice('74_touch.js', '  update(dt, t) {', '  hit() {', false)),
    raSlice('74_touch.js', '  hit() {', '  split(c, rgb) {', false),
    viz(raSlice('74_touch.js', '  split(c, rgb) {', '  miss() {', false)),
    raSlice('74_touch.js', '  miss() {', '/* ---------- Ritmo', false),
    "function swordCutTest(x) { const s = CUT(x.root.position); if (s === 'hint') { touchHint('Corta en la dirección de la flecha'); return null; } return s; }",
  ].join('\n');
  const Mth = { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random };
  const ctx2d: unknown = new Proxy(function () {}, { get: () => ctx2d, set: () => true, apply: () => ctx2d });
  const log = (s: string) => w.log.push(s);
  const SND = new Proxy({} as Record<string, unknown>, {
    get: (_o, k: string) => (k === 'charge' || k === 'tick' || k === 'perfect' ? () => log(k) : k === 'beep' ? (v: number) => log('beep ' + v) : () => {}),
  });
  const fx = new Proxy({}, { get: () => () => {} });
  const arena = new THREE.Group();
  arena.worldToLocal = (v: THREE.Vector3) => v;
  arena.localToWorld = (v: THREE.Vector3) => v;
  const queue: TouchSpec[] = [];
  const api = raRun<RAApi>(code, '({ get touches() { return touches; }, TCH, touchStep, buildTouchWave, touchStartWave, moveSpec, touchAssist, snapBeat, tchGapFor })', {
    THREE,
    V3,
    Q4: THREE.Quaternion,
    Math: Mth,
    TAU: Math.PI * 2,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    rand: (a: number, b: number) => a + random() * (b - a),
    pick: <T>(arr: T[]) => arr[Math.floor(random() * arr.length)],
    smooth: (t: number) => t * t * (3 - 2 * t),
    VR: vr,
    vrand: (a: number, b: number) => a + vr() * (b - a),
    texFrom: () => null,
    mkCanvas: () => ({ getContext: () => ctx2d }),
    rr: () => {},
    FD: 'x',
    std: (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o),
    glowSprite: () => new THREE.Sprite(new THREE.SpriteMaterial()),
    humLoop: () => null,
    shockRing: () => {},
    addDebris: () => {},
    settings: w.settings,
    dv: (k: string) => w.settings[k],
    get state() {
      return w.state;
    },
    get arMode() {
      return w.ar;
    },
    HL: w.HL,
    head: { get speed() {
      return w.speed;
    } },
    hands: w.hands,
    arena,
    standHeadY: () => Math.max(1.2, Math.min(2.05, w.standY || 1.6)),
    swordActive: () => w.sword,
    isCombat: () => false,
    handsFree: () => true,
    foes: () => 'robots',
    CUT: (p: THREE.Vector3) => cutTest(w, p),
    waveReps: (i: number) => Math.max(1, Math.round(+w.settings.repsWave + +w.settings.repsInc * i)),
    spawnQueue: queue,
    liveGates: () => [w.gate],
    boardDirty: false,
    SND,
    fx,
    say: (m: string, col: string) => log('say ' + m + ' ' + col),
    haptic: (s: string, v: number, ms: number) => log(`haptic ${s} ${v} ${ms}`),
    registerRep: (p: boolean) => log('rep ' + p),
    hurtPlayer: () => log('hurt'),
    stats: { kills: 0 },
    performance: { now: () => w.now * 1000 },
  });
  api.spawnQueue = queue;
  return api;
}

function portEnv(w: World, random: Rnd): TouchEnv {
  return {
    s: (k) => +w.settings[k] || 0,
    str: (k) => String(w.settings[k] ?? ''),
    dv: (k) => +w.settings[k] || 0,
    rnd: random,
    now: () => (w.now * 1000) / 1000, // (como perfNow: performance.now() / 1000)
    get state() {
      return w.state;
    },
    head: w.HL,
    get headSpeed() {
      return w.speed;
    },
    hands: w.hands,
    toArena: (v) => v,
    get ar() {
      return w.ar;
    },
    get standY() {
      return w.standY;
    },
    swordActive: () => w.sword,
    swordCut: (t, hint) => {
      const s = cutTest(w, t.at);
      if (s === 'hint') {
        hint('Corta en la dirección de la flecha');
        return null;
      }
      return s;
    },
    waveReps: (i) => Math.max(1, Math.round(+w.settings.repsWave + +w.settings.repsInc * i)),
  } as TouchEnv;
}

// los sucesos del portado, escritos como los registra RepArena
function logEvents(ev: TouchEvent[], out: string[]): void {
  for (const e of ev) {
    if (e.type === 'hint') out.push('say ' + e.text + ' #ffd166');
    else if (e.type === 'haptic') out.push(`haptic ${e.side} ${e.v} ${e.ms}`);
    else if (e.type === 'charge' || e.type === 'tick') out.push(e.type);
    else if (e.type === 'hold') out.push(`say Aguanta ${e.left} #ffd166`, 'beep ' + e.beep);
    else if (e.type === 'hit') {
      out.push('rep ' + e.perfect, 'say ' + e.text + ' ' + e.color);
      if (e.perfect) out.push('perfect');
      const by = e.t.by || e.t.hand;
      if (e.t.part === 'hand') out.push(`haptic ${by} 0.5 50`);
      if (e.t.part === 'hand' && e.t.move === 'floor') out.push(`haptic ${by} 0.8 70`);
      if (e.t.part === 'cut') out.push(`haptic ${e.t.by} 0.7 60`);
    } else if (e.type === 'miss' && e.hurt) out.push('hurt', 'say ' + e.text + ' #ff3b5c');
  }
}

const sub = (r: Rnd, all: string[]): string => {
  const l = all.filter(() => r() < 0.55);
  return (l.length ? l : [all[Math.floor(r() * all.length)]]).join(',');
};
const pickR = <T>(r: Rnd, a: T[]): T => a[Math.floor(r() * a.length)];

function randomSettings(r: Rnd): Settings {
  const ex = pickR(r, ['squat', 'lunge', 'jump', 'slam', 'abs', 'pushup', 'combo', 'slam', 'abs', 'combo']);
  return {
    mode: 'touch',
    exercise: ex,
    comboBase: pickR(r, ['stand', 'floor', 'abs']),
    comboStand: sub(r, ['squat', 'lunge', 'jump', 'punch', 'reach']),
    comboFloor: sub(r, ['push', 'plank', 'tap']),
    comboAbs: sub(r, ['crunch', 'twist', 'side', 'knee']),
    comboOrder: r() < 0.5 ? 'seq' : 'random',
    absMoves: sub(r, ['crunch', 'twist', 'side', 'knee']),
    tchRing: 8 + Math.floor(r() * 23),
    slamDeep: 2 * Math.floor(r() * 21),
    jumpHeight: 3 + Math.floor(r() * 38),
    squatDepth: 8 + Math.floor(r() * 63),
    pushDepth: 5 + Math.floor(r() * 31),
    lungeDepth: 10 + Math.floor(r() * 51),
    tchPushLo: r() < 0.3 ? 5 + Math.floor(r() * 40) : 0,
    tchPushHi: r() < 0.3 ? 10 + Math.floor(r() * 50) : 0,
    plankHold: 2 + Math.floor(r() * 6),
    abTwist: 5 * Math.floor(r() * 10),
    abMin: 10 + 5 * Math.floor(r() * 13),
    abMax: 20 + 5 * Math.floor(r() * 14),
    tchHands: 10 * Math.floor(r() * 11),
    tchWindow: 0.4 + Math.round(r() * 26) / 10,
    tchGap: 0.8 + Math.round(r() * 52) / 10,
    tchArrive: 1 + Math.floor(r() * 15) / 2,
    bpm: r() < 0.25 ? 60 + Math.floor(r() * 100) : 0,
    sword: r() < 0.35 ? pickR(r, ['one', 'two']) : 'off',
    swordHand: pickR(r, ['left', 'right']),
    repsWave: 3 + Math.floor(r() * 10),
    repsInc: Math.floor(r() * 3),
  };
}

function mkWorld(settings: Settings): World {
  return { settings, state: 'play', HL: new V3(0, 1.6, 0), speed: 0, hands: { left: mkHand(), right: mkHand() }, sword: false, standY: 1.7, ar: false, log: [], now: 1000, gate: { x: 0, z: -10, g: { visible: true }, openT: 0 } };
}

const near = (a: THREE.Vector3, b: THREE.Vector3, tol = 1e-9) => a.distanceTo(b) < tol;

const ALL_MOVES = ['squat', 'lunge', 'jump', 'duck', 'lside', 'lfwd', 'low', 'floor', 'punch', 'reach', 'push', 'plank', 'tap', 'cutLow', 'cutFwd', 'cutSide', 'cutHigh', 'knee', 'twist', 'side', 'crunch'];

describe.skipIf(!RA_DIR)('el modo Toques, como en RepArena', () => {
  it('moveSpec: cada movimiento sale en el mismo sitio, con el mismo hueco, la misma mano y la misma flecha', () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed), settings = randomSettings(r), w = mkWorld(settings);
      w.ar = r() < 0.3;
      w.standY = r() < 0.2 ? 0 : 1.1 + r() * 1.1;
      const raR = rng(seed * 31), ptR = rng(seed * 31), ra = original(w, raR, rng(1)), env = portEnv(w, ptR);
      const S = 0.2 + r() * 1.7;
      ra.TCH.ref = S;
      for (const move of ALL_MOVES) {
        const sd0 = pickR(r, [0, 0, -1, 1]);
        const a = ra.moveSpec(move, sd0 || undefined), b = moveSpec(env, S, move, sd0);
        const msg = `semilla ${seed}, ${move}`;
        expect([b.part, b.hand, b.hold], msg).toEqual([a.part, a.hand, a.hold]);
        expect(Math.abs(b.r - a.r), msg).toBeLessThan(1e-12);
        expect(near(a.pos, b.pos, 1e-12) && near(a.from, b.from, 1e-12) && near(a.n, b.n, 1e-12), msg).toBe(true);
        if (a.part === 'cut') {
          expect(Math.abs((a.ang as number) - b.ang) + Math.abs((a.yaw as number) - b.yaw), msg).toBeLessThan(1e-12);
          expect(near(a.normal as THREE.Vector3, b.normal as THREE.Vector3) && near(a.cutDir as THREE.Vector3, b.cutDir as THREE.Vector3), msg).toBe(true);
        }
        expect(ptR(), msg).toBe(raR()); // (el mismo azar gastado)
        n++;
      }
    }
    expect(n).toBe(300 * ALL_MOVES.length);
  });

  it('las mismas oleadas (500 ajustes al azar, varias oleadas cada uno) y los mismos pulsos y separaciones', () => {
    let total = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed), settings = randomSettings(r), w = mkWorld(settings);
      const raR = rng(seed * 97), ptR = rng(seed * 97), ra = original(w, raR, rng(1)), tch = mkTouch(portEnv(w, ptR));
      for (let i = 0; i < 6; i++) {
        const a = ra.buildTouchWave(i), b = buildTouchWave(tch, i);
        expect(b, `semilla ${seed} (${settings.exercise}), oleada ${i}`).toEqual(a);
        expect(tch.seq).toBe(ra.TCH.seq);
        total += b.length;
      }
      expect(ptR()).toBe(raR());
      for (const mv of ['squat', 'plank', 'punch']) expect(tchGapFor(tch.env, mv)).toBe(ra.tchGapFor(mv));
      ra.TCH.clock = tch.clock = r() * 50;
      ra.TCH.beat0 = tch.beat0 = 1000 + r() * 3;
      w.now = 1000 + r() * 100;
      const c = tch.clock + r() * 5;
      expect(Math.abs(snapBeat(tch, c) - ra.snapBeat(c))).toBeLessThan(1e-9);
    }
    expect(total).toBeGreaterThan(10000);
  });

  it('fotograma a fotograma: objetivos que llegan y una cabeza y unas manos que van a por ellos (200 partidas de 50 s)', () => {
    let frames = 0, hits = 0, misses = 0, perfects = 0, hints = 0, holds = 0, cuts = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 13 + 5), settings = randomSettings(r), w = mkWorld(settings);
      const bare = r() < 0.6;
      w.sword = settings.sword !== 'off' && !bare;
      w.ar = r() < 0.2;
      const ex = String(settings.exercise), base = String(settings.comboBase);
      const supine = ex === 'abs' || (ex === 'combo' && base === 'abs'), floor = supine || ex === 'pushup' || (ex === 'combo' && base === 'floor');
      const ref = supine ? 0.15 + r() * 0.1 : floor ? 0.4 + r() * 0.2 : 1.5 + r() * 0.3;
      w.standY = 1.5 + r() * 0.3;
      const raR = rng(seed * 7919), ptR = rng(seed * 7919), ra = original(w, raR, rng(seed + 3)), tch: TouchState = mkTouch(portEnv(w, ptR));
      ra.TCH.ref = tch.ref = ref;
      const rest = new V3(0, ref, 0);
      w.HL.copy(rest);
      const handRest = (s: Side, out: THREE.Vector3) => out.set(s === 'left' ? -0.25 : 0.25, supine ? ref + 0.05 : floor ? 0.05 : ref - 0.6, supine ? -0.3 : -0.15);
      for (const s of ['left', 'right'] as Side[]) {
        const h = w.hands[s];
        h.isHand = bare;
        handRest(s, h.wrist);
      }
      // el plan para cada objetivo: ir con la parte buena, con la mano equivocada, no ir, o sin volver a la postura
      const plan = new Map<TouchTarget, { k: number; off: THREE.Vector3; wrong: boolean; pose: boolean }>();
      const lost: Record<Side, number> = { left: 0, right: 0 };
      let wave = 0, waitT = 0, t = 0, pauseT = 0;
      const ptLog: string[] = [];
      const q: TouchSpec[] = [];
      const start = () => {
        const a = ra.buildTouchWave(wave), b = buildTouchWave(tch, wave);
        expect(b, `semilla ${seed}, oleada ${wave}`).toEqual(a);
        ra.spawnQueue.push(...a);
        q.push(...b);
        ra.touchStartWave();
        touchStartWave(tch);
        wave++;
      };
      start();
      const goal = new V3(), tmp = new V3(), prevHL = new V3();
      for (let i = 0; i < 3600; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        w.now += dt;
        // de vez en cuando, la pausa o el descanso
        if (pauseT > 0) pauseT -= dt;
        else if (r() < 0.002) {
          pauseT = 0.3 + r() * 0.6;
          w.state = r() < 0.6 ? 'paused' : 'rest';
        } else w.state = 'play';
        if (pauseT <= 0 && w.state !== 'play') w.state = 'play';
        // la siguiente oleada, cuando se acaba esta
        if (!q.length && !touchLeft(tch)) {
          waitT += dt;
          if (waitT > 1) {
            waitT = 0;
            start();
          }
        }
        // a por el siguiente
        let tg: TouchTarget | null = null;
        for (const x of tch.touches) if (x.alive && !x.judged && (x.mode !== 'approach' || tch.clock > x.arriveAt - 0.9)) { tg = x; break; }
        let p = tg ? plan.get(tg) : undefined;
        if (tg && !p) {
          p = { k: r(), off: new V3((r() - 0.5) * 0.2, (r() - 0.5) * 0.2, (r() - 0.5) * 0.1), wrong: r() < 0.2, pose: r() < 0.6 };
          plan.set(tg, p);
        }
        prevHL.copy(w.HL);
        const go = tg && p && p.k > 0.15;
        goal.copy(rest).x += Math.sin(t * 0.7) * 0.05;
        if (go && tg && p && tg.part === 'head') goal.copy(tg.at).add(p.off.clone().multiplyScalar(p.k < 0.4 ? 1.5 : 0.4));
        if (go && tg && p && tg.part === 'cut' && p.pose) {
          const sd = +settings.squatDepth / 100, jh = +settings.jumpHeight / 100;
          if (tg.move === 'cutLow') goal.y = ref - sd - 0.05;
          else if (tg.move === 'cutFwd') goal.z = -0.25;
          else if (tg.move === 'cutSide') goal.x = Math.sign(tg.pos.x) * 0.2;
          else goal.y = ref + jh;
        }
        w.HL.lerp(goal, Math.min(1, dt * (4 + r() * 3)));
        w.speed = w.speed * 0.8 + 0.2 * (w.HL.distanceTo(prevHL) / dt);
        for (const s of ['left', 'right'] as Side[]) {
          const h = w.hands[s];
          if (lost[s] > 0) lost[s]--;
          else if (r() < 0.004) lost[s] = 5 + Math.floor(r() * 40);
          h.ok = lost[s] === 0;
          const want = go && tg && p && tg.part !== 'head' && (s === tg.hand) !== p.wrong;
          if (want && tg) tmp.copy(tg.at).addScaledVector(p!.off, 0.3);
          else handRest(s, tmp);
          h.wrist.lerp(tmp, Math.min(1, dt * (5 + r() * 4)));
          h.tip.copy(h.wrist).z -= 0.06;
          h.tipOk = r() < 0.9;
          for (let j = 0; j < 25; j++) {
            h.J[j].p.set(h.wrist.x + (j % 5) * 0.008 * (s === 'left' ? 1 : -1), h.wrist.y + 0.002 * j, h.wrist.z - 0.004 * j);
            h.J[j].ok = r() < 0.97;
          }
        }
        w.gate.openT = 0;
        w.log.length = 0;
        ptLog.length = 0;
        ra.touchStep(dt, t);
        const ev = touchStep(tch, q, dt, t);
        logEvents(ev, ptLog);
        for (const e of ev) {
          if (e.type === 'hit') {
            hits++;
            if (e.perfect) perfects++;
            if (e.t.part === 'cut') cuts++;
          } else if (e.type === 'miss') misses++;
          else if (e.type === 'hint') hints++;
          else if (e.type === 'charge') holds++;
        }
        const msg = `semilla ${seed} (${ex}/${base}${w.sword ? ', espada' : ''}), fotograma ${i}`;
        expect(ptLog, msg).toEqual(w.log);
        expect(tch.clock, msg).toBe(ra.TCH.clock);
        expect(tch.nextArrive, msg).toBe(ra.TCH.nextArrive);
        expect(Math.abs(tch.ref - ra.TCH.ref), msg).toBeLessThan(1e-12);
        expect(tch.hintT, msg).toBe(ra.TCH.hintT);
        expect([tch.headArm.armed, tch.arm.left.armed, tch.arm.right.armed, tch.arm.left.n, tch.arm.right.n], msg).toEqual([ra.TCH.headArm.armed, ra.TCH.arm.left.armed, ra.TCH.arm.right.armed, ra.TCH.arm.left.n, ra.TCH.arm.right.n]);
        expect(tch.gatesOpen, msg).toBe(w.gate.openT >= 0.6);
        expect(tch.touches.length, msg).toBe(ra.touches.length);
        for (let k = 0; k < ra.touches.length; k++) {
          const a = ra.touches[k], b = tch.touches[k];
          expect([b.move, b.part, b.hand, b.mode, b.judged, b.alive, b.arriveAt, b.win, b.held, b.outT, b.popT], msg).toEqual([a.move, a.part, a.hand, a.mode, a.judged, a.alive, a.arriveAt, a.win, a.held, a.outT, a.popT]);
          expect(near(b.at, a.root.position) && near(b.prevPos, a.prevPos), msg).toBe(true);
          if (b.part === 'head') expect(Math.abs(b.q.angleTo(a.root.quaternion)), msg).toBeLessThan(1e-7);
        }
        for (const part of ['head', 'hand'] as const) {
          const a = ra.touchAssist(part), b = touchAssist(tch, part);
          expect(b ? tch.touches.indexOf(b) : -1, msg).toBe(a ? ra.touches.indexOf(a) : -1);
        }
        frames++;
      }
      expect(ptR(), `semilla ${seed}`).toBe(raR());
    }
    expect(frames).toBe(200 * 3600);
    expect(hits).toBeGreaterThan(500);
    expect(misses).toBeGreaterThan(200);
    expect(perfects).toBeGreaterThan(50);
    expect(hints).toBeGreaterThan(50);
    expect(holds).toBeGreaterThan(0);
    expect(cuts).toBeGreaterThan(0);
  }, 600000);
});
