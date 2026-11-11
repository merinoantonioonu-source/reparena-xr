// El modo Barras portado (src/modes/bars: el detector, los objetivos, la colocación y los aparatos) frente al código
// original de RepArena (src/72_bars.js y src/35_equip.js), con el mismo azar: dominadas, remo y colgado simulados (la
// cabeza subiendo y bajando a distintos ritmos, a medias, aguantando arriba, cayéndose, soltando las manos, alejándose;
// las manos en la barra, perdidas o abajo), con pompas y avispas que llegan, esperan, se escapan o pican; colocar los
// aparatos con las manos (vistas o no, arriba o abajo, juntas o separadas, quietas o moviéndose) y las cuentas de las
// poses guardadas. En cada fotograma, el mismo estado, los mismos objetivos en el mismo sitio y los mismos sucesos.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { type BarEvent, type BarsEnv, type PlaceEnv, yawOf } from '../../src/modes/bars/env.js';
import { BarDetector } from '../../src/modes/bars/detect.js';
import { BarField, buildBarWave } from '../../src/modes/bars/targets.js';
import { Placer, type PlaceEvent } from '../../src/modes/bars/place.js';
import { eqAxes, eqFromBounded, eqLocal, eqToBounded, eqTrack, eqWorld, equipFrame, equipRefReset, loadEquip, saveEquip, EQUIP_KEY, type EqKind, type EqPose } from '../../src/modes/bars/equip.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
type V = THREE.Vector3;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const rnum = (v: number) => String(Math.round(v * 1e6) / 1e6);
// los argumentos de un suceso, para compararlos: números (redondeados), textos y colores; sin posiciones
const FMT = (a: unknown[]): string =>
  a
    .filter((v) => v === undefined || typeof v !== 'object' || Array.isArray(v))
    .map((v) => (typeof v === 'number' ? rnum(v) : Array.isArray(v) ? v.map((x) => rnum(x as number)).join(',') : String(v)))
    .join(' ');
const mkMath = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });
const store = (m: Mem) => (k: string, v?: unknown): unknown => {
  if (v === undefined) return JSON.parse(m.getItem(k) as string);
  m.setItem(k, JSON.stringify(v));
  return null;
};

const EQUIP_CODE = () => [raSlice('35_equip.js', 'const EQUIP_KEY', '/* ---------- Modelos', false), raSlice('35_equip.js', 'function equipChanged'), raSlice('35_equip.js', 'function equipCommit')].join('\n');
const CORE_CODE = () =>
  [
    raSlice('00_core.js', 'const clamp'),
    raSlice('00_core.js', 'const lerp'),
    raSlice('00_core.js', 'const rand'),
    raSlice('00_core.js', 'const pick'),
    raSlice('00_core.js', 'const smooth'),
    raSlice('00_core.js', 'function store'),
    raSlice('70_game.js', 'const wrapAng'),
    raSlice('60_ui.js', 'function fwd('),
    raSlice('60_ui.js', 'function fwdH'),
    raSlice('60_ui.js', 'function yawOf'),
  ].join('\n');

interface RABars {
  frame(t: number, dt: number): void;
  start(): void;
  BAR: Record<string, unknown> & { refXZ: V; drift: V; front: V; mountXZ: V };
  REC: string[];
  get: () => { state: string; score: number; combo: number; enemies: RATarget[] };
  buildBarWave(i: number): { kind: string; hp: number }[];
}
interface RATarget {
  kind: string;
  pos: V;
  slot: V;
  mode: string;
  hp: number;
  alive: boolean;
  waitT: number;
  feint: number;
  curl: number;
  ch: number;
  side: number;
  speed: number;
  root: THREE.Object3D;
}

interface Gate {
  x: number;
  z: number;
  ry: number;
  scale: number;
}

function original(settings: Record<string, unknown>, head: { p: V; q: THREE.Quaternion; speed: number }, hands: Record<Side, Hand>, mem: Mem, gates: Gate[], random: () => number): RABars {
  const code = [
    "let state = 'idle', stateT = 0, score = 0, combo = 0, boardDirty = false, spawnTimer = 0, spawnQueue = [], enemies = [], waveIdx = 0;",
    'const REC = [], stats = { falls: 0, hold: 0, bestCombo: 0, reps: 0 };',
    'const rec = (...a) => REC.push(FMT(a));',
    'const SND = new Proxy({}, { get: (_, n) => (...a) => rec("snd", n, ...a) });',
    'const fx = new Proxy({}, { get: (_, n) => (at, ...a) => rec("fx", n, ...a) });',
    "const cheer = (t, c, d) => rec('cheer', t, c, d);",
    "const say = (t, c = '#ffffff', d = 1.4, toast = true) => rec('say', t, c, d, toast);",
    "function registerRep(perfect) { stats.reps++; combo++; rec('rep', perfect); }",
    "function onPartial(t) { combo = 0; rec('partial', t); }",
    "function hurtPlayer() { rec('hurt'); }",
    "function onKilled(e) { rec('killed', e.kind); }",
    "const warnFloor = (t, c) => rec('warn', t, c), poolGrab = () => rec('poolGrab'), vortexOn = () => false;",
    'function spawnFromQueue() { const spec = spawnQueue.shift(); if (!spec) return; enemies.push(new HeadTarget(spec)); }',
    "function startWave(i) { waveIdx = i; spawnQueue = buildBarWave(i); BAR.hold = 0; BAR.need = settings.exercise === 'hang' ? hangSecs(i) : 0; spawnTimer = 0.6; state = 'play'; stateT = 0; rec('startWave', i); }",
    'const center = { mesh: { visible: false } }, drawCenter = () => {}, boardRig = { children: [] };',
    'const HL = new V3(), _up = new V3(0, 1, 0), tmpA = new V3(), tmpB = new V3(), arena = new THREE.Group();',
    'const sesWave = () => 0, nWaves = () => settings.waves;',
    "const GATES = GATES_IN.map((g, i) => ({ x: g.x, z: g.z, scale: g.scale, g: { rotation: { y: g.ry } }, set openT(v) { rec('gate', i, v); } })), liveGates = () => GATES;",
    "function rigDebris(inst, c, f, up, mats) { rec('fx', 'debris', f, up, mats.main === M.robotStaticWasp ? 'wasp' : 'carbon'); }",
    'function arenaFromHead() { const y = yawOf(head.q), o = 1.2; arena.position.set(head.p.x - Math.sin(y) * o, 0, head.p.z - Math.cos(y) * o); arena.rotation.y = y; }',
    CORE_CODE(),
    raSlice('00_core.js', 'function repTimeOf'),
    raSlice('00_core.js', 'function waveReps'),
    raSlice('00_core.js', 'function hangSecs'),
    raSlice('70_game.js', 'function isBossWave'),
    raSlice('70_game.js', 'const POW_COL'),
    raSlice('70_game.js', 'const powLevel'),
    EQUIP_CODE(),
    raSlice('72_bars.js', 'const BAR = ', '/* ---------- Objetivos', false),
    raSlice('72_bars.js', 'const TGT', '/* =================== COLOCAR', false),
    `function frame(t, dt) {
      arena.updateMatrixWorld(); HL.copy(head.p); arena.worldToLocal(HL);
      if (state === 'mount') barMountStep(dt);
      if (state === 'play') barDetect(t, dt);
      if (state === 'play') {
        spawnTimer -= dt;
        const alive = enemies.filter(e => e.alive).length;
        if (spawnTimer <= 0 && spawnQueue.length && alive < 2) { spawnFromQueue(); spawnTimer = barGap(); }
        if (settings.exercise === 'hang' ? BAR.hold >= BAR.need : !spawnQueue.length && !enemies.some(e => e.alive)) startWave(waveIdx + 1);
      }
      for (const e of enemies) if (e.alive) e.update(dt, t);
      enemies = enemies.filter(e => e.alive);
    }`,
    'function start() { barReset(); barToMount(0); }',
  ].join('\n');
  const obj = () => new THREE.Object3D();
  return raRun<RABars>(code, '{ frame, start, BAR, REC, get: () => ({ state, score, combo, enemies }), buildBarWave }', {
    THREE,
    V3,
    Q4,
    Math: mkMath(random),
    TAU: Math.PI * 2,
    FMT,
    GATES_IN: gates,
    settings,
    head,
    hands,
    preview: false,
    localStorage: mem,
    storeHook: null,
    dv: (k: string) => settings[k],
    G: { cylRaw: (a: number, b: number, h: number, n: number) => new THREE.CylinderGeometry(a, b, h, n) },
    std: (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o),
    glowSprite: () => Object.assign(obj(), { material: { opacity: 0.25, dispose() {} } }),
    RIGS: new Proxy({}, { get: () => ({ instance: () => ({ root: new THREE.Group(), bones: { body: obj(), head: obj() }, meshes: { glow: { visible: true } }, skel: { dispose() {} } }) }) }),
    MAT_STINGER: {},
    MAT_DRONE: {},
    M: { robotStaticWasp: { w: 1 }, carbonStatic: { c: 1 } },
    makeHpBar: () => null,
    buzzLoop: () => null,
    flapStinger: () => {},
    poseStinger: () => {},
    placeRowBoard: () => {},
  });
}

/** Lo portado, con una partida mínima que aplica los sucesos como RepArena (para comparar). */
class Mine {
  bar = new BarDetector();
  field = new BarField(this.bar);
  REC: string[] = [];
  score = 0;
  combo = 0;
  waveIdx = 0;
  out: BarEvent[] = [];
  contacts = 0;
  constructor(public env: BarsEnv) {}
  rec(...a: unknown[]): void {
    this.REC.push(FMT(a));
  }
  start(): void {
    this.bar.reset();
    this.bar.toMount(0);
    this.env.state = 'mount';
  }
  startWave(i: number): void {
    this.waveIdx = i;
    this.field.startWave(this.env, i);
    this.env.state = 'play';
    this.rec('startWave', i);
  }
  apply(): void {
    const { env, bar, field } = this;
    for (const ev of this.out) {
      if (ev.type === 'snd') this.rec('snd', ev.name, ...ev.args);
      else if (ev.type === 'fx') this.rec('fx', ev.name, ...ev.args);
      else if (ev.type === 'cheer') this.rec('cheer', ev.text, ev.col, ev.dur);
      else if (ev.type === 'say') this.rec('say', ev.text, ev.col, ev.dur, ev.toast);
      else if (ev.type === 'rep') {
        this.combo++;
        if (ev.contact) this.contacts++;
        this.rec('rep', ev.perfect);
        if (this.combo % 10 !== 0) {
          if (ev.contact) this.rec('say', '¡Bien!', '#ffffff', 0.7, false);
          else if (ev.perfect) this.rec('cheer', '¡PERFECTA!', '#3cf0c6', 1.0);
          else if (ev.fast) this.rec('say', 'Más controlado', '#ffffff', 1.0, true);
          else this.rec('say', '¡Bien!', '#ffffff', 0.7, false);
        }
      } else if (ev.type === 'hangSec') {
        this.score += 10;
        this.combo++;
      } else if (ev.type === 'partial') {
        this.combo = 0;
        this.rec('partial', ev.text);
      } else if (ev.type === 'fall') {
        if (ev.door) this.rec('poolGrab');
        else {
          this.rec('snd', 'partial');
          this.rec('fx', 'glow', [1, 0.5, 0.3], 0.5, 0.2);
        }
        this.rec('hurt');
        this.rec('cheer', ev.text, ev.col, 1.8);
        this.rec('warn', `${ev.text} (${ev.reason})`, '#ff8a3d');
        bar.toMount(0, true);
        env.state = 'mount';
      } else if (ev.type === 'mounted') {
        if (ev.resume) {
          env.state = 'play';
          this.rec('cheer', '¡Sigue!', '#3cf0c6', 1.2);
        } else this.startWave(ev.wave);
      } else if (ev.type === 'hurt') this.rec('hurt');
      else if (ev.type === 'killed') this.rec('killed', (ev.target as { kind: string }).kind);
      else if (ev.type === 'comboReset') this.combo = 0;
      else if (ev.type === 'gate') this.rec('gate', ev.index, ev.openT);
    }
    this.out.length = 0;
    void field;
  }
  frame(t: number, dt: number): void {
    const { env, bar, field, out } = this;
    if (env.state === 'mount') {
      bar.mountStep(dt, env, out);
      this.apply();
    }
    if (env.state === 'play') {
      bar.detect(t, dt, env, out, field);
      this.apply();
    }
    if (env.state === 'play') {
      field.spawnStep(dt, env, out);
      this.apply();
      if (env.str('exercise') === 'hang' ? bar.hold >= bar.need : field.cleared()) this.startWave(this.waveIdx + 1);
    }
    field.update(dt, t, env, out);
    this.apply();
  }
}

function mkEnv(settings: Record<string, unknown>, head: BarsEnv['head'], hands: Record<Side, Hand>, mem: Mem, gates: Gate[], random: () => number): BarsEnv {
  const env: BarsEnv = {
    s: (k) => settings[k] as number,
    str: (k) => settings[k] as string,
    dv: (k) => settings[k] as number,
    rnd: random,
    head,
    hands,
    state: 'idle',
    arena: { x: 0, z: 0, ry: 0 },
    eq: loadEquip(store(mem)),
    preview: false,
    gates,
    arenaFromHead() {
      const y = yawOf(head.q), o = 1.2;
      env.arena.x = head.p.x - Math.sin(y) * o;
      env.arena.z = head.p.z - Math.cos(y) * o;
      env.arena.ry = y;
    },
    sesWave: () => 0,
    nWaves: () => settings.waves as number,
  };
  return env;
}

const near = (a: V, b: V, msg: string, tol = 1e-7) => expect(a.distanceTo(b), msg).toBeLessThan(tol);

describe.skipIf(!RA_DIR)('el modo Barras, como en RepArena', () => {
  it('dominadas, remo y colgado: el mismo detector, los mismos objetivos y los mismos sucesos en 60 partidas al azar', () => {
    let frames = 0, reps = 0, falls = 0, kills = 0, escapes = 0, stings = 0, powers = 0, partials = 0, contacts = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const ex = ['pullup', 'row', 'hang'][seed % 3];
      const settings: Record<string, unknown> = {
        exercise: ex,
        mode: 'bars',
        dipBars: r() < 0.5 ? '1' : '2',
        barTarget: r() < 0.5 ? 'bugs' : 'bubbles',
        barMix: [0, 0, 50, 33, 100][Math.floor(r() * 5)],
        barOffset: Math.round(20 + r() * 30),
        barWait: r() < 0.4 && seed % 4 ? 0 : Math.round(3 + r() * 5),
        barArrive: 1.5 + r() * 3,
        pullRange: Math.round(25 + r() * 20),
        rowRange: Math.round(18 + r() * 12),
        fallMargin: Math.round(8 + r() * 12),
        perfectTime: r() < 0.2 ? 0 : 1.2,
        powHold: 1 + r(),
        powHoldInc: 0.5,
        doorH: Math.round(200 + r() * 25),
        doorW: Math.round(80 + r() * 30),
        dipH: Math.round(85 + r() * 25),
        dipGap: Math.round(45 + r() * 20),
        dipLen: Math.round(80 + r() * 60),
        repsWave: Math.round(3 + r() * 6),
        repsInc: Math.round(1 + r() * 2),
        hangTime: Math.round(8 + r() * 15),
        hangInc: 5,
        waves: r() < 0.5 ? 0 : 3 + Math.floor(r() * 4),
        tchGap: 2,
        supHold: 2,
        splHold: 3,
      };
      // el aparato, guardado como lo guarda RepArena
      const kind: EqKind = ex === 'row' ? 'dip' : 'door', E = { x: (r() - 0.5) * 2, z: -0.5 - r(), yaw: (r() - 0.5) * 2 };
      const saved = { door: { x: 0, z: -0.2, yaw: 0, set: false, handle: null, b: null }, dip: { x: 0, z: -0.45, yaw: 0, set: false, handle: null, b: null }, spot: { x: 0, z: 0, yaw: 0, set: false, handle: null, b: null } };
      Object.assign(saved[kind], E, { set: true });
      const memA = new Mem(), memB = new Mem();
      memA.setItem(EQUIP_KEY, JSON.stringify(saved));
      memB.setItem(EQUIP_KEY, JSON.stringify(saved));
      const gates: Gate[] = [{ x: -3, z: -8, ry: 0.3, scale: 1 }, { x: 3.5, z: -7, ry: -0.35, scale: 1.2 }];
      const head = { p: new V3(), q: new Q4(), speed: 0 }, prev = new V3();
      const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
      const ra = original(settings, head, hands, memA, gates, rng(seed * 7919));
      const me = new Mine(mkEnv(settings, head, hands, memB, gates, rng(seed * 7919)));
      // el cuerpo colgado: dónde está la cabeza abajo (en el aparato) y la barra
      const top = ex === 'row' ? (settings.dipH as number) / 100 : (settings.doorH as number) / 100;
      const req = (ex === 'row' ? (settings.rowRange as number) : (settings.pullRange as number)) / 100;
      const base0 = ex === 'row' ? 0.3 + r() * 0.1 : top - 0.45 - r() * 0.1;
      const L0 = new V3(ex === 'row' ? (r() - 0.5) * 0.2 : (r() - 0.5) * 0.3, 0, ex === 'row' ? (r() - 0.5) * 0.3 : 0.05 + r() * 0.12);
      const lookYaw = E.yaw + (ex === 'row' ? 0 : Math.PI);
      // el guion: tramos quieto, repeticiones (de todas las alturas y ritmos, aguantando arriba a veces) y caídas
      type Seg = { k: string; dur: number; amp: number; up: number; hold: number; down: number };
      let seg: Seg = { k: 'still', dur: 6, amp: 0, up: 0, hold: 0, down: 0 }, st = 0, y = base0, dxz = 0, lowHands = false;
      const lazy = seed % 4 === 0; // (a veces se queda colgado sin subir: se escapan y pican)
      const nextSeg = (): Seg => {
        const x = r();
        if (x < 0.06) return { k: ['drop', 'hands', 'away'][Math.floor(r() * 3)], dur: 1.2, amp: 0, up: 0, hold: 0, down: 0 };
        if (x < (lazy ? 0.6 : 0.25)) return { k: 'still', dur: 0.3 + r() * (lazy ? 12 : 2), amp: 0, up: 0, hold: 0, down: 0 };
        const up = 0.25 + r() * 2, hold = r() < 0.35 ? r() * 4 : 0, down = 0.4 + r() * 1.2;
        return { k: 'rep', dur: up + hold + down, amp: req * (0.3 + r() * 1.3), up, hold, down };
      };
      ra.start();
      me.start();
      let t = 0, recN = 0;
      for (let i = 0; i < 4200; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        st += dt;
        if (st >= seg.dur) {
          if (seg.k === 'drop' || seg.k === 'hands' || seg.k === 'away') seg = { k: 'back', dur: 6.5, amp: 0, up: 0, hold: 0, down: 0 };
          else seg = nextSeg();
          st = 0;
        }
        lowHands = false;
        let yy = base0, off = 0;
        if (seg.k === 'rep') {
          const u = st < seg.up ? st / seg.up : st < seg.up + seg.hold ? 1 : Math.max(0, 1 - (st - seg.up - seg.hold) / seg.down);
          yy = base0 + seg.amp * (0.5 - 0.5 * Math.cos(Math.PI * u));
          off = 0.06 * u;
        } else if (seg.k === 'drop') yy = base0 - Math.min(1, st / 0.6) * (ex === 'row' ? 0.25 : 0.5);
        else if (seg.k === 'hands') lowHands = st > 0.2;
        else if (seg.k === 'away') dxz = Math.min(1, st / 0.5);
        else if (seg.k === 'back') dxz = Math.max(0, dxz - dt * 2);
        y += (yy - y) * Math.min(1, dt * 20);
        const lx = L0.x + dxz * 1.0 + (r() - 0.5) * 0.0006, lz = L0.z + off + (r() - 0.5) * 0.0006;
        eqWorld(E, lx, y + (r() - 0.5) * 0.0006, lz, head.p);
        head.q.setFromEuler(new THREE.Euler(ex === 'row' ? 1.2 : 0.3 + 0.1 * Math.sin(t), lookYaw + 0.2 * Math.sin(t * 0.7), 0, 'YXZ'));
        head.speed = head.speed * 0.85 + head.p.distanceTo(prev) / dt * 0.15;
        prev.copy(head.p);
        // las manos: agarradas a la barra (a veces perdidas por las gafas) o, al soltarse, abajo a la vista
        for (const s of ['left', 'right'] as Side[]) {
          const h = hands[s];
          if (r() < 0.04) h.ok = !h.ok;
          if (lowHands) h.ok = true;
          eqWorld(E, ex === 'row' ? (s === 'left' ? -0.25 : 0.25) : (s === 'left' ? -0.3 : 0.3), lowHands ? top - 0.6 : top + (r() - 0.5) * 0.04, ex === 'row' ? L0.z + 0.2 : 0, h.wrist);
        }
        ra.frame(t, dt);
        me.frame(t, dt);
        frames++;
        const msg = `semilla ${seed} (${ex}), fotograma ${i}`;
        // los mismos sucesos
        expect(me.REC.slice(recN), msg).toEqual(ra.REC.slice(recN));
        recN = ra.REC.length;
        const G = ra.get(), B = ra.BAR;
        expect(me.env.state, msg).toBe(G.state);
        expect([me.score, me.combo], msg).toEqual([G.score, G.combo]);
        expect([me.bar.phase, me.bar.det, me.bar.contact, me.bar.pw, me.bar.started], msg).toEqual([B.phase, B.det, B.contact, B.pw, B.started]);
        for (const k of ['ref', 'hangRef', 'hold', 'letGo', 'pwT', 'still', 't', 'max'] as const) expect(Math.abs((me.bar[k] as number) - (B[k] as number)), `${msg} ${k}`).toBeLessThan(1e-9);
        for (const k of ['refXZ', 'drift', 'front', 'mountXZ'] as const) near(me.bar[k], B[k], `${msg} ${k}`);
        // los mismos objetivos, en el mismo sitio
        expect(me.field.targets.length, msg).toBe(G.enemies.length);
        me.field.targets.forEach((m, j) => {
          const o = G.enemies[j];
          expect([m.kind, m.mode, m.hp, m.side], `${msg} objetivo ${j}`).toEqual([o.kind, o.mode, o.hp, o.side]);
          near(m.pos, o.pos, `${msg} objetivo ${j}: pos`);
          near(m.slot, o.slot, `${msg} objetivo ${j}: slot`);
          near(m.disp, o.root.position, `${msg} objetivo ${j}: lo que se ve`);
          for (const k of ['waitT', 'feint', 'curl', 'ch', 'speed'] as const) expect(Math.abs(m[k] - o[k]), `${msg} objetivo ${j}: ${k}`).toBeLessThan(1e-7);
        });
      }
      const all = ra.REC.join('\n');
      reps += (all.match(/^rep /gm) || []).length;
      falls += (all.match(/^warn /gm) || []).length;
      kills += (all.match(/^killed /gm) || []).length;
      escapes += (all.match(/^say Se escapó/gm) || []).length;
      stings += (all.match(/Te ha picado/gm) || []).length;
      powers += (all.match(/^cheer CARGA/gm) || []).length;
      partials += (all.match(/^partial /gm) || []).length;
      contacts += me.contacts;
    }
    // que la prueba de verdad recorra todo
    expect(frames).toBeGreaterThan(250000);
    for (const [k, v] of Object.entries({ reps, falls, kills, escapes, stings, powers, partials, contacts })) expect(v, k).toBeGreaterThan(3);
  }, 300000);

  it('las oleadas: las mismas colas con ajustes al azar', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const r = rng(seed);
      const settings: Record<string, unknown> = { exercise: ['pullup', 'row', 'hang'][seed % 3], barTarget: r() < 0.5 ? 'bugs' : 'bubbles', repsWave: Math.round(1 + r() * 20), repsInc: Math.round(r() * 4), waves: r() < 0.5 ? 0 : 1 + Math.floor(r() * 8), hangTime: 10, hangInc: 5, tchGap: 2, supHold: 2, splHold: 3 };
      const head = { p: new V3(), q: new Q4(), speed: 0 }, hands = { left: mkHand(), right: mkHand() };
      const ra = original(settings, head, hands, new Mem(), [], rng(1));
      const env = mkEnv(settings, head, hands, new Mem(), [], rng(1));
      for (let i = 0; i < 12; i++) expect(buildBarWave(env, i), `semilla ${seed}, oleada ${i}`).toEqual(ra.buildBarWave(i));
    }
  }, 120000);

  it('colocar los aparatos con las manos: los mismos estados, las mismas poses y lo mismo guardado', () => {
    let placed = 0, resets = 0, frames = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const r = rng(seed);
      const ex = ['pullup', 'row', 'hang'][seed % 3];
      const base = { exercise: ex, dipBars: r() < 0.5 ? '1' : '2', doorH: 210, doorW: 90, dipH: 95, dipGap: 55, dipLen: 100 };
      const sA: Record<string, unknown> = { ...base }, sB: Record<string, unknown> = { ...base };
      const head = { p: new V3(0, 1.7, 0), q: new Q4(), speed: 0 }, prev = new V3();
      const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
      const memA = new Mem(), memB = new Mem();
      const code = [
        'const REC = [], rec = (...a) => REC.push(FMT(a));',
        'const SND = new Proxy({}, { get: (_, n) => (...a) => rec("snd", n, ...a) });',
        'const hideMenu = () => {}, center = { mesh: { visible: false } }, drawCenter = () => {}, scene = { add() {} }, _up = new V3(0, 1, 0);',
        "function openMenu(rows) { rec('menu', rows[1].text, rows[1].color); return {}; }",
        'function setSetting(k, v) { settings[k] = v; }',
        CORE_CODE(),
        EQUIP_CODE(),
        raSlice('72_bars.js', 'const PLACE_HOLD', 'function adjustMenu', false),
        raSlice('72_bars.js', 'function adjustMenu'),
        "  const k = eqKind(), door = k === 'door', e = eqPose(k), deg = Math.PI / 180;",
        raSlice('72_bars.js', '  if (EQ.edit !== k) { EQ.edit = k; e.anchor = null; }'),
        raSlice('72_bars.js', '  const nm = eqName(k)'),
        raSlice('72_bars.js', '  const note = PLACE.note'),
        "  openMenu([{}, { text: note, color: PLACE.note ? '#3cf0c6' : e.set ? '#d8d3f5' : '#ffd166' }]);",
        '}',
        raSlice('72_bars.js', 'function placeDone', '}'),
      ].join('\n');
      type RAP = { PLACE: Record<string, unknown> & { sumL: V; sumR: V }; EQ: { xr: Record<string, EqPose>; edit: string | null; pending: string[] }; REC: string[]; startPlace(b: () => void, n?: string): void; cancelPlace(): void; updatePlace(dt: number): void; placeInFront(k: string): void; nudgeEquip(k: string, a: number, b: number, c: number): void; placeDone(): void; placeLine: THREE.Mesh; eqKind(): string };
      const ra = raRun<RAP>(code, '{ PLACE, EQ, REC, startPlace, cancelPlace, updatePlace, placeInFront, nudgeEquip, placeDone, placeLine, eqKind }', {
        THREE,
        V3,
        Q4,
        Math: mkMath(rng(1)),
        FMT,
        settings: sA,
        head,
        hands,
        preview: false,
        localStorage: memA,
        storeHook: null,
        G: { cylRaw: (a: number, b: number, h: number, n: number) => new THREE.CylinderGeometry(a, b, h, n) },
      });
      const env: PlaceEnv = { s: (k) => sB[k] as number, str: (k) => sB[k] as string, head, hands, eq: loadEquip(store(memB)), preview: false, setSetting: (k, v) => (sB[k] = v), store: store(memB) };
      const pl = new Placer(), out: PlaceEvent[] = [], REC: string[] = [];
      const apply = () => {
        for (const ev of out) {
          if (ev.type === 'snd') REC.push(FMT(['snd', ev.name, ...ev.args]));
          else {
            const n = pl.adjustNote(env);
            REC.push(FMT(['menu', n.text, n.color]));
          }
        }
        out.length = 0;
      };
      const back = () => ra.REC.push('back');
      // las manos: tramos con su forma (vistas o no, mano o mando, arriba o abajo, separadas o juntas, a la par o no,
      // quietas, con temblor o moviéndose)
      type HSeg = { dur: number; seenL: boolean; seenR: boolean; isHand: boolean; up: boolean; d: number; dy: number; jit: number; move: number; stand: boolean };
      const mkSeg = (): HSeg => ({ dur: 0.3 + r() * (r() < 0.4 ? 7 : 2), seenL: r() < 0.9, seenR: r() < 0.9, isHand: r() < 0.5, up: r() < 0.75, d: r() < 0.7 ? 0.4 + r() * 0.8 : r() * 1.8, dy: r() < 0.8 ? (r() - 0.5) * 0.1 : (r() - 0.5) * 0.5, jit: r() < 0.5 ? 0.002 : 0.01, move: r() < 0.7 ? 0 : 0.3, stand: r() < 0.7 });
      let seg = mkSeg(), st = 0, t = 0;
      const C = new V3((r() - 0.5) * 2, 0, -0.5 - r()), yaw = (r() - 0.5) * 2;
      ra.startPlace(back);
      pl.start(env, out);
      apply();
      for (let i = 0; i < 2500; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        st += dt;
        if (st > seg.dur) {
          seg = mkSeg();
          st = 0;
        }
        head.p.set(C.x + Math.sin(t * 0.5) * 0.02, seg.stand ? 1.7 : 1.0, C.z + 0.1);
        head.q.setFromEuler(new THREE.Euler(0.4, yaw + 0.1 * Math.sin(t), 0, 'YXZ'));
        head.speed = head.speed * 0.85 + head.p.distanceTo(prev) / dt * 0.15;
        prev.copy(head.p);
        const hy = head.p.y + (seg.up ? 0.3 : -0.3), mx = Math.sin(t * 3) * seg.move;
        for (const s of ['left', 'right'] as Side[]) {
          const h = hands[s], sg = s === 'left' ? -1 : 1;
          h.ok = s === 'left' ? seg.seenL : seg.seenR;
          h.isHand = seg.isHand;
          h.wrist.set(C.x + Math.cos(yaw) * sg * seg.d * 0.5 + mx + (r() - 0.5) * seg.jit, hy + sg * seg.dy * 0.5 + (r() - 0.5) * seg.jit, C.z - Math.sin(yaw) * sg * seg.d * 0.5 + (r() - 0.5) * seg.jit);
          h.J[10].ok = r() < 0.97;
          h.J[11].ok = true;
          h.J[10].p.copy(h.wrist).add(new V3(0.01, 0.02, -0.03));
          h.J[11].p.copy(h.wrist).add(new V3(0.012, 0.03, -0.06));
        }
        ra.updatePlace(dt);
        pl.step(dt, env, out);
        apply();
        // a veces se pulsa algo en los ajustes finos o se vuelve a empezar (los mismos botones en las dos)
        if (!ra.PLACE.on && !ra.PLACE.wait && r() < 0.01) {
          const k = ra.eqKind() as 'door' | 'dip', b = Math.floor(r() * 5);
          if (b === 0) {
            ra.nudgeEquip(k, 0.01, 0, 0);
            pl.nudge(env, k, 0.01, 0, 0);
          } else if (b === 1) {
            ra.nudgeEquip(k, 0, -0.01, Math.PI / 180);
            pl.nudge(env, k, 0, -0.01, Math.PI / 180);
          } else if (b === 2) {
            ra.placeInFront(k);
            pl.inFront(env, k);
          } else if (b === 3) {
            ra.placeDone();
            pl.done(env);
          } else {
            ra.startPlace(back);
            pl.start(env, out);
            apply();
          }
        } else if (ra.PLACE.on && r() < 0.0015) {
          ra.cancelPlace();
          if (pl.cancel(env, out)) {
            apply();
            REC.push('back');
          }
        }
        frames++;
        const msg = `semilla ${seed} (${ex}), fotograma ${i}`, P = ra.PLACE;
        expect(REC, msg).toEqual(ra.REC);
        expect([pl.on, pl.wait, pl.seen, pl.up, pl.ok, pl.n, pl.note, pl.kind], msg).toEqual([P.on, P.wait, P.seen, P.up, P.ok, P.n, P.note, P.kind]);
        for (const k of ['t', 'lostT', 'waitT'] as const) expect(Math.abs(pl[k] - (P[k] as number)), `${msg} ${k}`).toBeLessThan(1e-9);
        near(pl.sumL, P.sumL, `${msg} sumL`);
        near(pl.sumR, P.sumR, `${msg} sumR`);
        expect(pl.line.visible, msg).toBe(ra.placeLine.visible);
        if (pl.line.visible) {
          near(pl.line.mid, ra.placeLine.position, `${msg} línea`);
          expect(Math.abs(pl.line.len - ra.placeLine.scale.y), msg).toBeLessThan(1e-9);
        }
        expect([env.eq.edit, env.eq.pending], msg).toEqual([ra.EQ.edit, ra.EQ.pending]);
        for (const k of ['door', 'dip'] as EqKind[]) {
          const a = env.eq.xr[k], b = ra.EQ.xr[k];
          expect([a.set, a.anchor], msg).toEqual([b.set, b.anchor]);
          for (const f of ['x', 'z', 'yaw'] as const) expect(Math.abs(a[f] - b[f]), `${msg} ${k}.${f}`).toBeLessThan(1e-9);
        }
        expect([sB.doorH, sB.dipH, sB.dipGap], msg).toEqual([sA.doorH, sA.dipH, sA.dipGap]);
        expect(memB.getItem(EQUIP_KEY), msg).toBe(memA.getItem(EQUIP_KEY));
        if (pl.t === 0 && pl.on) resets++;
      }
      placed += ra.REC.filter((l) => l === 'snd perfect').length;
    }
    expect(frames).toBeGreaterThan(150000);
    expect(placed).toBeGreaterThan(20);
    expect(resets).toBeGreaterThan(100);
  }, 300000);

  it('las poses de los aparatos: ejes, coordenadas, el guardián, el temblor, recentrar, las anclas y lo guardado', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const r = rng(seed), mem = new Mem(), memB = new Mem();
      const saved: Record<string, unknown> = {};
      for (const k of ['door', 'dip', 'spot']) if (r() < 0.8) saved[k] = { x: (r() - 0.5) * 4, z: (r() - 0.5) * 4, yaw: (r() - 0.5) * 6, set: r() < 0.7, handle: r() < 0.3 ? 'h' + seed : null, b: r() < 0.5 ? { x: r(), z: r(), yaw: r() } : null };
      if (r() < 0.1) saved.door = { x: 'a', z: 1, yaw: 0 };
      mem.setItem(EQUIP_KEY, JSON.stringify(saved));
      memB.setItem(EQUIP_KEY, JSON.stringify(saved));
      const ra = raRun<{ EQ: { xr: Record<string, EqPose>; b2l: { x: number; z: number; yaw: number } | null; bref: unknown; pending: string[] }; eqLocal: typeof eqLocal; eqWorld: typeof eqWorld; eqAxes: typeof eqAxes; eqToBounded(e: EqPose): void; eqFromBounded(e: EqPose): void; eqTrack: typeof eqTrack; saveEquip(): void; onRefReset(ev: unknown): void; anchorsFrame(f: unknown, ref: unknown): void }>(
        [CORE_CODE(), EQUIP_CODE(), raSlice('35_equip.js', 'const _rq = new Q4()', 'const _eqq', true)].join('\n'),
        '{ EQ, eqLocal, eqWorld, eqAxes, eqToBounded, eqFromBounded, eqTrack, saveEquip, onRefReset, anchorsFrame }',
        { THREE, V3, Q4, Math, settings: { exercise: 'pullup' }, head: { p: new V3(), q: new Q4() }, preview: false, localStorage: mem, storeHook: null, xrActive: true },
      );
      const st = store(memB), EQ = loadEquip(st);
      const same = (msg: string) => {
        for (const k of ['door', 'dip', 'spot'] as EqKind[]) {
          const a = EQ.xr[k], b = ra.EQ.xr[k];
          expect([a.set, a.handle, a.synced, !!a.fix], `${msg} ${k}`).toEqual([b.set, b.handle, b.synced, !!b.fix]);
          for (const f of ['x', 'z', 'yaw'] as const) expect(Math.abs(a[f] - b[f]), `${msg} ${k}.${f}`).toBeLessThan(1e-9);
          expect(!!a.b, msg).toBe(!!b.b);
          if (a.b && b.b) for (const f of ['x', 'z', 'yaw'] as const) expect(Math.abs(a.b[f] - b.b[f]), `${msg} ${k}.b.${f}`).toBeLessThan(1e-9);
        }
      };
      same(`semilla ${seed}: al cargar`);
      // ejes y coordenadas
      for (let i = 0; i < 20; i++) {
        const e = { x: (r() - 0.5) * 4, z: (r() - 0.5) * 4, yaw: (r() - 0.5) * 7 }, p = new V3((r() - 0.5) * 6, r() * 2, (r() - 0.5) * 6);
        near(eqLocal(e, p, new V3()), ra.eqLocal(e, p, new V3()), 'eqLocal', 1e-12);
        near(eqWorld(e, p.x, p.y, p.z, new V3()), ra.eqWorld(e, p.x, p.y, p.z, new V3()), 'eqWorld', 1e-12);
        const a1 = new V3(), a2 = new V3(), b1 = new V3(), b2 = new V3();
        eqAxes(e, a1, a2);
        ra.eqAxes(e, b1, b2);
        near(a1, b1, 'eqAxes x', 1e-12);
        near(a2, b2, 'eqAxes z', 1e-12);
      }
      // un rato de sesión: el guardián que se mueve un poco, anclas que tiemblan o se recolocan, recentrar
      ra.EQ.bref = r() < 0.7 ? {} : null;
      const anch: Partial<Record<EqKind, { x: number; z: number; yaw: number } | null>> = {};
      for (const k of ['door', 'dip', 'spot'] as EqKind[]) if (r() < 0.5) EQ.xr[k].anchor = ra.EQ.xr[k].anchor = { anchorSpace: k };
      const b2l = { x: r(), z: r(), yaw: r() };
      for (let i = 0; i < 300; i++) {
        b2l.x += (r() - 0.5) * 0.01;
        b2l.yaw += (r() - 0.5) * 0.01;
        const bq = new Q4().setFromAxisAngle(new V3(0, 1, 0), b2l.yaw), poses: Record<string, unknown> = {};
        for (const k of ['door', 'dip', 'spot'] as EqKind[]) {
          const e = EQ.xr[k], jump = r() < 0.03 ? 0.2 : 0.003;
          const yawK = e.yaw + (r() - 0.5) * jump, q = new Q4().setFromAxisAngle(new V3(0, 1, 0), yawK), x = e.x + (r() - 0.5) * jump, z = e.z + (r() - 0.5) * jump;
          poses[k] = r() < 0.8 ? { transform: { position: { x, y: 0, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } } } : null;
          const pk = poses[k] as { transform: { position: { x: number; z: number }; orientation: THREE.Quaternion } } | null;
          anch[k] = pk ? { x: pk.transform.position.x, z: pk.transform.position.z, yaw: yawOf(new Q4(pk.transform.orientation.x, pk.transform.orientation.y, pk.transform.orientation.z, pk.transform.orientation.w)) } : null;
        }
        const frame = { session: {}, getPose: (s: unknown) => (s === ra.EQ.bref ? { transform: { position: { x: b2l.x, y: 0, z: b2l.z }, orientation: { x: bq.x, y: bq.y, z: bq.z, w: bq.w } } } : poses[s as string]) };
        if (ra.EQ.bref) EQ.b2l = { x: b2l.x, z: b2l.z, yaw: yawOf(bq) };
        ra.anchorsFrame(frame, {});
        equipFrame(EQ, anch, st);
        if (i === 100 && r() < 0.5) EQ.edit = (ra.EQ as unknown as { edit: string }).edit = 'door' as never;
        if (i % 50 === 49) {
          const q = new Q4().setFromAxisAngle(new V3(0, 1, 0), (r() - 0.5) * 2), T = { position: { x: (r() - 0.5) * 2, y: 0, z: (r() - 0.5) * 2 }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } };
          ra.onRefReset({ transform: T });
          equipRefReset(EQ, T, !!ra.EQ.bref, st);
        }
        if (i % 37 === 0) {
          const e = EQ.xr.dip, f = ra.EQ.xr.dip;
          eqToBounded(EQ, e);
          ra.eqToBounded(f);
          if (e.b && EQ.b2l) {
            eqFromBounded(EQ, e);
            ra.eqFromBounded(f);
          }
          saveEquip(EQ, st);
          ra.saveEquip();
        }
        same(`semilla ${seed}, fotograma ${i}`);
        expect(memB.getItem(EQUIP_KEY), `semilla ${seed}, fotograma ${i}`).toBe(mem.getItem(EQUIP_KEY));
      }
    }
  }, 120000);
});
