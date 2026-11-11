// Los arcos y las oleadas de los Arcos portados (src/modes/arcs/arc.ts y patterns.ts) frente al código original de RepArena
// (src/70_game.js: Arc, arcJumpNeed, buildWave, BURPEE_UP, spawnFromQueue y arcGap; src/71_arcs.js: arxMul, arxBpmK,
// arxSpeed, arxNewKind, arxPatterns, arxHurdles, arxBurpee, arxPlankRoom y arxBeatGap): con el mismo azar y los mismos
// ajustes, los mismos arcos, fotograma a fotograma con la cabeza moviéndose, el mismo juicio, las mismas oleadas y lo
// mismo al sacar cada obstáculo de la cola. (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { ArcCore, arcSecondScore, arxSpeed, type ArcOutcome, type ArcParams, type ArxFever } from '../../src/modes/arcs/arc.js';
import type { ArcsEnv } from '../../src/modes/arcs/env.js';
import { ArcNewKind, arcGap, arcSpawnPlan, arxBeatGap, buildArcsWave, type ArcSpec } from '../../src/modes/arcs/patterns.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

type Ev = unknown[];
interface RAArc {
  hw: number; leanX?: number; drop: number; tilt: number; barY: number; z: number; sideMin: number; speed: number;
  spin?: number; tiltEnd?: number; tReach?: number; jump: boolean; plank: boolean; low: boolean; second: boolean;
  checked: boolean; maxUp: number; fast: boolean; hit: boolean; sideHit?: boolean; minClear: number; judged: boolean;
  alive: boolean; warnT: number;
  update(dt: number, t: number): void;
}
interface RA {
  Arc: new (drop: number, offset?: number, second?: boolean, tilt?: number, jump?: boolean, spin?: number, plank?: boolean, low?: boolean) => RAArc;
  ARX: { fever: boolean; feverN: number; minNext: number; nextGap: number; orbT: number };
  buildWave(i: number): ArcSpec[];
  spawnFromQueue(): void;
  arcGap(): number;
  arxBeatGap(s: number): number;
  arxSpeed(): number;
  getN(): number;
  setN(n: number): void;
}

/** El mundo que ven los dos: ajustes, cabeza, azar y lo que RepArena hace al juzgar (capturado como sucesos). */
interface World {
  settings: Record<string, number | string>;
  dvK: number;
  HL: { x: number; y: number; z: number };
  calibRef: number;
  depth: number;
  JUMP: { fastT: number };
  random: () => number;
  ev: Ev[];
  score: number;
  combo: number;
  danger: boolean;
  beeps: number[];
  arcs: unknown[];
  queue: ArcSpec[];
  spawnInterval: number;
  phrase: string;
  total: number;
}

function original(w: World): RA {
  const code = [
    raSlice('71_arcs.js', 'const ARX = {'),
    raSlice('71_arcs.js', 'const ARX_NEW', 'const arxSpeed'),
    raSlice('71_arcs.js', 'function arxBeatGap', '}'),
    raSlice('71_arcs.js', 'const arxBeatGlow'),
    raSlice('71_arcs.js', 'function arxPatterns', 'function arxPlankRoom'),
    raSlice('70_game.js', 'const arcJumpNeed', '/* =================== DISPAROS', false),
    raSlice('70_game.js', 'function buildWave(i)', '// Robots: una compuerta', false),
    raSlice('70_game.js', 'const BURPEE_UP', 'function updateNextArc', false),
  ].join('\n');
  const Mth = { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random: () => w.random() };
  const disp = { dispose: () => {} };
  const mat = () => ({ opacity: 1, dispose: () => {}, color: { setHex: (h: number) => (w.danger = h === 0xffffff) } });
  const pt = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z });
  class Obj { position = { set: () => {}, x: 0, y: 0, z: 0 }; rotation = { x: 0, y: 0, z: 0 }; scale = { set: () => {}, setScalar: () => {} }; children: unknown[] = []; visible = true; geometry: unknown; material: unknown; renderOrder = 0;
    constructor(g?: unknown, m?: unknown) { this.geometry = g; this.material = m; }
    add() {} }
  return raRun<RA>(code, '{ Arc, ARX, buildWave, spawnFromQueue, arcGap, arxBeatGap, arxSpeed, getN: () => arxNewN, setN: (n) => { arxNewN = n; } }', {
    Math: Mth,
    THREE: { Mesh: Obj, Group: Obj, PlaneGeometry: class { attributes = { position: { setXYZ: () => {} } }; dispose() {} }, MeshBasicMaterial: class { opacity = 1; dispose() {} } },
    V3: class { constructor(public x = 0, public y = 0, public z = 0) {} },
    TAU: Math.PI * 2,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    rand: (a: number, b: number) => a + w.random() * (b - a),
    pick: <T>(arr: T[]) => arr[Math.floor(w.random() * arr.length)],
    get settings() { return w.settings; },
    dv: (k: string) => (w.settings[k] as number) * w.dvK,
    HEAD_TOP: 0.1,
    arMode: false,
    get calibRef() { return w.calibRef; },
    get HL() { return w.HL; },
    head: { get p() { return w.HL; } },
    get JUMP() { return w.JUMP; },
    arenaDepth: () => w.depth,
    arxBeatP: () => (w.settings.arcBeat && (w.settings.bpm as number) > 0 ? 60 / (w.settings.bpm as number) : 0),
    arxPhrase: () => w.phrase,
    beatNow: () => 0,
    state: 'play',
    get score() { return w.score; },
    set score(v: number) { w.ev.push(['score', v - w.score]); w.score = v; },
    get combo() { return w.combo; },
    boardDirty: false,
    gates: [{}, {}],
    makeArcObj: () => ({ grp: new Obj(), bar: new Obj(), coreMat: mat(), glowMat: mat(), curtainMat: mat(), curtain: { visible: true, geometry: disp }, lines: [] }),
    zapLines: () => {},
    humLoop: () => null,
    glowSprite: () => new Obj(),
    handPrintTex: () => null,
    wallMat: () => mat(),
    WALL_EDGE: {},
    G: { cylRaw: () => disp },
    arena: { add: () => {}, remove: () => {}, localToWorld: (v: unknown) => v },
    tmpA: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } },
    tmpB: {},
    fx: { sparks: () => {}, electric: (p: { x: number; y: number; z: number }, n: number) => w.ev.push(['electric', n, pt(p)]) },
    SND: { beep: (k: number) => w.beeps.push(k), zap: () => w.ev.push(['zap']), whoosh: (p: { x: number; y: number; z: number }) => w.ev.push(['whoosh', pt(p)]), perfect: () => w.ev.push(['perfect']), horn: () => w.ev.push(['horn']) },
    hurtPlayer: () => w.ev.push(['hurt']),
    arxHit: () => w.ev.push(['arxHit']),
    arxClean: () => w.ev.push(['arxClean']),
    registerRep: (perfect: boolean, fire: boolean) => w.ev.push(['rep', perfect, fire]),
    say: (text: string, color = '#ffffff', dur = 1.4, toast = true) => w.ev.push(['say', text, color, dur, toast]),
    cheer: (text: string, color: string, dur: number) => w.ev.push(['cheer', text, color, dur]),
    bigNotice: (a: string, b: string, c: string) => w.ev.push(['notice', a, b, c]),
    LADDER: { fresh: [] },
    isBars: () => false,
    waveReps: () => w.total,
    get spawnQueue() { return w.queue; },
    get arcs() { return w.arcs; },
    get spawnInterval() { return w.spawnInterval; },
    ArcObs: class { kind: string; constructor(k: string) { this.kind = k; } },
  });
}

/** Lo que RepArena habría hecho con el resultado, como sucesos (en su mismo orden). */
function outcomeEvents(o: ArcOutcome, combo: number): Ev[] {
  const hp = o.hitPoint, e: Ev[] = [];
  const say = () => o.say && e.push(['say', ...o.say]);
  if (o.kind === 'lane') say();
  else if (o.hurt) { e.push(['electric', 24, hp], ['zap'], ['hurt'], ['arxHit']); say(); }
  else if (o.kind === 'second') { e.push(['whoosh', hp], ['score', arcSecondScore(o.scoreBase, combo)]); if (o.cheer) e.push(['cheer', ...o.cheer]); }
  else { e.push(['whoosh', hp], ['rep', o.perfect, false], ['arxClean']); say(); if (o.perfectSound) e.push(['perfect']); }
  return e;
}

function randSettings(R: () => number): Record<string, number | string> {
  const pc = (p: number, max = 100) => (R() < p ? Math.round(R() * max) : 0);
  return {
    mode: 'arcs', arcMin: 5 + R() * 50, arcMax: 5 + R() * 70, arcSpeed: 1 + R() * 15, arcTiming: R() < 0.3 ? 'regular' : 'irregular',
    arcTilt: pc(0.6), arcTiltMax: 5 + R() * 30, arcRight: Math.round(R() * 10) * 10, arcShift: 15 + R() * 125, arcSideMin: R() < 0.3 ? 0 : R() * 60,
    arcTiltDrop: R() < 0.5 ? 0 : R() * 60, arcLow: pc(0.4), arcLowH: 40 + R() * 70, arcTiltW: 140 + R() * 180, arcJump: pc(0.6), arcJumpH: 2 + R() * 28,
    arcBpmSpeed: R() < 0.5 ? 1 : 0, arcBeat: R() < 0.5 ? 1 : 0, bpm: R() < 0.2 ? 0 : 50 + R() * 200, arcPatterns: R() < 0.5 ? 1 : 0, arcNew: pc(0.6),
    arcMace: pc(0.5), arcPlank: pc(0.5), arcHurdles: pc(0.5, 60), arcBurpee: pc(0.5, 60), arcPlankSpeed: 1 + R() * 14, arcPlankH: 40 + R() * 50,
    arcOrbs: pc(0.7), arcFeverUp: R() < 0.2 ? -1 : R() * 40, arcTunnel: pc(0.5, 60), arcCombo: pc(0.5, 60), arcDouble: pc(0.6),
  };
}

function mkWorld(seed: number): World {
  const R = rng(seed * 7 + 3);
  return {
    settings: randSettings(R), dvK: 0.8 + R() * 0.5, HL: { x: 0, y: 1.6, z: (R() - 0.5) * 0.4 }, calibRef: 1.4 + R() * 0.4, depth: 6 + R() * 8,
    JUMP: { fastT: 9 }, random: R, ev: [], score: 0, combo: Math.floor(R() * 20), danger: false, beeps: [], arcs: [], queue: [], spawnInterval: 1 + R() * 3,
    phrase: ['', 'hot', 'calm'][Math.floor(R() * 3)], total: 1 + Math.floor(R() * 20),
  };
}

const envOf = (w: World, rnd: () => number): ArcsEnv => ({
  s: (k) => w.settings[k] as number, dv: (k) => (w.settings[k] as number) * w.dvK, rnd, head: w.HL, calibRef: w.calibRef, arenaDepth: w.depth,
  get jumpFastT() { return w.JUMP.fastT; },
  get beatP() { return w.settings.arcBeat && (w.settings.bpm as number) > 0 ? 60 / (w.settings.bpm as number) : 0; },
  time: 0,
});

const ctorFields = (a: RAArc | ArcCore) => ({ hw: a.hw, leanX: a.leanX ?? 0, drop: a.drop, tilt: a.tilt, barY: a.barY, z: a.z, sideMin: a.sideMin, speed: a.speed, spin: a.spin ?? 0, tiltEnd: a.tiltEnd ?? 0, tReach: a.tReach ?? 0, jump: a.jump, plank: a.plank, low: a.low, second: a.second });
const frameFields = (a: RAArc | ArcCore) => ({ z: a.z, tilt: a.tilt, checked: a.checked, maxUp: a.maxUp, fast: a.fast, hit: a.hit, sideHit: !!a.sideHit, minClear: a.minClear, judged: a.judged, alive: a.alive, warnT: a.warnT });
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe.skipIf(!RA_DIR)('Arcos: los arcos y las oleadas como en RepArena', () => {
  it('los arcos: misma forma, mismo recorrido y mismo juicio, fotograma a fotograma', () => {
    const kinds = ['normal', 'second', 'tilt', 'jump', 'plank', 'low', 'wheel'];
    const seen = new Set<string>();
    for (let c = 0; c < 400; c++) {
      const w = mkWorld(c), ra = original(w), P = rng(c * 13 + 1);
      const kind = kinds[c % kinds.length], fever: ArxFever = { fever: P() < 0.4, feverN: 1 + Math.floor(P() * 4) };
      ra.ARX.fever = fever.fever; ra.ARX.feverN = fever.feverN;
      const sg = P() < 0.5 ? -1 : 1, drop = 0.05 + P() * 0.6;
      const p: ArcParams = { drop, offset: kind === 'second' ? 1 : 0, second: kind === 'second', tilt: kind === 'tilt' || kind === 'low' || kind === 'wheel' ? sg * (0.1 + P() * 0.5) : kind === 'second' && P() < 0.5 ? sg * 0.3 : 0, jump: kind === 'jump', spin: kind === 'wheel' ? sg * (2.2 + P() * 1.2) : 0, plank: kind === 'plank', low: kind === 'low' };
      // los ajustes del arco con el mismo azar en los dos
      w.random = rng(c + 1000);
      const a = new ra.Arc(p.drop, p.offset, p.second, p.tilt, p.jump, p.spin, p.plank, p.low);
      const env = envOf(w, rng(c + 1000)), b = new ArcCore(p, env, fever);
      expect(ctorFields(b), `arco ${c} (${kind})`).toEqual(ctorFields(a));
      w.random = rng(c + 5000);
      // la cabeza: de pie, agachándose, apartándose a un lado, saltando o en plancha, según llega el arco
      const mode = ['stand', 'duck', 'sway', 'jump', 'plank', 'side'][Math.floor(P() * 6)], duck = P() * 0.8, A = P() * 1.2, wv = 0.5 + P() * 3, x0 = (P() - 0.5) * 2.4, jh = P() * 0.3;
      const tArr = (w.HL.z - b.z) / b.speed, dt = 1 / 72, z0 = w.HL.z;
      let t = 0, lastY = w.calibRef, vy = 0;
      for (let f = 0; f < 15000 && b.alive; f++) {
        t += dt;
        const near = Math.max(0, 1 - Math.abs(t - tArr) / 0.6);
        const y = mode === 'duck' ? w.calibRef - duck * near : mode === 'jump' ? w.calibRef + jh * Math.max(0, Math.sin((t - tArr + 0.25) * Math.PI / 0.5)) * (Math.abs(t - tArr) < 0.25 ? 1 : 0) : mode === 'plank' ? 0.3 + duck * 0.3 : mode === 'side' ? w.calibRef - duck * 0.6 * near : w.calibRef + (P() - 0.5) * 0.02;
        w.HL.x = mode === 'sway' || mode === 'side' ? x0 * near + A * Math.sin(wv * t) * 0.3 : x0 * 0.2;
        w.HL.y = y;
        w.HL.z = z0 + Math.sin(t * 1.3) * 0.05;
        // (el reloj de los saltos, como el jumpTrack de RepArena)
        const v = (y - lastY) / dt; lastY = y; vy = vy * 0.5 + v * 0.5; w.JUMP.fastT = vy > 0.6 ? 0 : w.JUMP.fastT + dt;
        w.ev = []; w.beeps = [];
        a.update(dt, t);
        const out = b.update(dt, env);
        // (expect solo si difieren: así las miles de comprobaciones van deprisa)
        const mine = [frameFields(b), b.danger, b.beep ? [b.beep] : [], out ? outcomeEvents(out, w.combo) : []];
        const theirs = [frameFields(a), w.danger, w.beeps, w.ev];
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) expect(mine, `arco ${c} (${kind}, ${mode}) fotograma ${f}`).toEqual(json(theirs));
        if (out) seen.add(`${kind}:${out.kind}:${out.perfect}`);
      }
      expect(b.alive).toBe(false);
    }
    // (que se hayan visto todos los juicios)
    const ks = new Set([...seen].map((s) => s.split(':')[1]));
    for (const k of ['lane', 'hurt', 'jumpFail', 'jumpOk', 'pass', 'second']) expect(ks.has(k), `juicio ${k}`).toBe(true);
  }, 120_000);

  it('las oleadas: la misma cola (coreografías o al azar)', () => {
    for (let c = 0; c < 200; c++) {
      const w = mkWorld(c + 77), ra = original(w);
      if (c % 2) w.settings.arcPatterns = 1 - (w.settings.arcPatterns as number);
      const nk = new ArcNewKind(() => 0);
      nk.n = ra.getN();
      w.random = rng(c + 9);
      const A = json(ra.buildWave(c % 10));
      const R2 = rng(c + 9), B = buildArcsWave(w.total, envOf(w, R2), nk);
      expect(json(B), `oleada ${c}`).toEqual(A);
      expect(nk.n).toBe(ra.getN());
      expect(R2()).toBe(w.random());
    }
  });

  it('sacar de la cola: los mismos arcos, esperas, avisos y orbes', () => {
    let n = 0;
    for (let c = 0; c < 200; c++) {
      const w = mkWorld(c + 300), ra = original(w), F = rng(c);
      const fever: ArxFever = { fever: F() < 0.4, feverN: 1 + Math.floor(F() * 3) };
      ra.ARX.fever = fever.fever; ra.ARX.feverN = fever.feverN;
      const nk = new ArcNewKind(() => 0); nk.n = ra.getN();
      w.random = rng(c + 41);
      const wave = json(ra.buildWave(0)), env = envOf(w, () => 0);
      const extra: ArcSpec[] = [{ kind: 'wheel', drop: 0.3, tilt: 0, hp: 1 }, { kind: 'combo', with: 'laser', drop: 0.2, tilt: 0, hp: 1, gap: 1.4 }];
      for (const spec of [...wave, ...extra]) {
        const s2 = rng(c * 31 + n++);
        w.random = rng(c * 31 + n - 1);
        w.arcs = []; w.queue = [json(spec)]; w.ev = [];
        ra.ARX.minNext = -1; ra.ARX.nextGap = -1; ra.ARX.orbT = -7;
        ra.spawnFromQueue();
        const e2 = { ...env, rnd: s2 } as ArcsEnv;
        const obsSeen: string[] = [];
        const plan = arcSpawnPlan(json(spec), e2, fever, w.spawnInterval, (k) => obsSeen.push(k));
        const raArcs = w.arcs.filter((x): x is RAArc => !(x as { kind?: string }).kind), raObs = w.arcs.filter((x) => (x as { kind?: string }).kind).map((x) => (x as { kind: string }).kind);
        expect(plan.arcs.map(ctorFields), `obstáculo ${c} ${spec.kind}`).toEqual(raArcs.map(ctorFields));
        expect(plan.obs ? [plan.obs] : []).toEqual(raObs);
        expect(obsSeen).toEqual(raObs);
        expect(plan.minNext).toBe(ra.ARX.minNext);
        expect(plan.nextGap).toBe(ra.ARX.nextGap);
        expect(plan.orbT === null ? -7 : plan.orbT).toBe(ra.ARX.orbT);
        const ev: Ev[] = [];
        if (plan.notice) ev.push(['notice', ...plan.notice]);
        if (plan.horn) ev.push(['horn']);
        expect(ev).toEqual(w.ev);
        expect(s2()).toBe(w.random());
      }
    }
  });

  it('huecos, compás y velocidad', () => {
    for (let c = 0; c < 300; c++) {
      const w = mkWorld(c + 900), ra = original(w);
      const fever: ArxFever = { fever: c % 3 === 0, feverN: 1 + (c % 4) };
      ra.ARX.fever = fever.fever; ra.ARX.feverN = fever.feverN;
      const env = envOf(w, () => 0);
      expect(arxSpeed(env, fever)).toBe(ra.arxSpeed());
      w.random = rng(c);
      const g = ra.arcGap(), R2 = rng(c);
      expect(arcGap({ ...env, rnd: R2 } as ArcsEnv, w.settings.arcTiming === 'regular')).toBe(g);
      const sec = 0.2 + (c % 17) * 0.7;
      expect(arxBeatGap(sec, env, w.phrase)).toBe(ra.arxBeatGap(sec));
    }
  });
});
