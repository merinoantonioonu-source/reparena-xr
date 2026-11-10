// El lanzamiento portado (src/input/throw.ts y gaze-lock.ts) frente al código original de RepArena (src/70_game.js:
// throwCharge, throwStep, throwTry, throwTarget, throwPickTarget y gazeLockStep): las mismas manos al azar (en reposo,
// sacudidas hacia cualquier lado, cogiendo impulso, lentas, perdidas por las gafas, con saltos del seguimiento y con
// mandos como manos con gatillo y agarre), la misma cabeza, los mismos enemigos y las mismas cargas en los dos; tienen que
// salir los mismos rayos (cuándo, desde dónde, hacia dónde, a quién y con qué carga), los mismos avisos, vibraciones y
// dianas, y quedar las mismas cargas en cada mano. (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hands as PH, head as PHead, mkHand, SIDES, type Side } from '../../src/input/hand-model.js';
import { HTH as PHTH, throwCharge as pCharge, throwReset as pReset, throwStep as pStep, type ThrowEnv } from '../../src/input/throw.js';
import { GZL as PGZL, gazeLockReset } from '../../src/input/gaze-lock.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

interface Foe {
  alive: boolean;
  radius: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  center(out: THREE.Vector3): THREE.Vector3;
}
type RAHand = { ok: boolean; isHand: boolean; wrist: THREE.Vector3; virt: boolean; trig: boolean; grip: boolean; rayOk: boolean; rayO: THREE.Vector3; rayD: THREE.Vector3; back: boolean };
type Rec = { shots: string[]; says: string[]; buzz: string[]; locks: string[] };
type RAApi = { HTH: Record<Side, { c: { dmg: number; perfect: boolean; pow: number } | null }>; throwCharge: (dmg: number, perfect: boolean, pow: number) => boolean; throwStep: (dt: number, t: number) => void; G: Record<string, unknown> };

const f = (v: THREE.Vector3): string => `${v.x.toFixed(9)},${v.y.toFixed(9)},${v.z.toFixed(9)}`;

function original(foes: Foe[], throwPick: string, assist: number, rec: Rec, frame: () => number): { api: RAApi; hands: Record<Side, RAHand>; head: { p: THREE.Vector3; q: THREE.Quaternion }; arena: { rotation: { y: number } } } {
  const code = raSlice('70_game.js', '/* =================== LANZAR EL RAYO CON LA MANO', 'const gazeLock = () =>');
  const mkH = (): RAHand => ({ ok: false, isHand: true, wrist: new V3(), virt: false, trig: false, grip: false, rayOk: false, rayO: new V3(), rayD: new V3(0, 0, -1), back: false });
  const hands = { left: mkH(), right: mkH() }, head = { p: new V3(), q: new Q4() }, arena = { rotation: { y: 0 } };
  const idx = (e: unknown): number => foes.indexOf(e as Foe);
  const api = raRun<RAApi>(code, '{ HTH, throwCharge, throwStep, G: globalThis }', {
    THREE,
    V3,
    Q4,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    settings: { aim: 'hands', throwPick, assist },
    isCombat: () => true,
    handsFree: () => true,
    aimManual: () => true,
    pistolOn: () => false,
    bareHands: () => true,
    glowSprite: () => ({ visible: false, renderOrder: 0, position: new V3(), scale: new V3(), material: { color: { setHex() {} } } }),
    scene: { add() {} },
    BOLT_COL: [0x4aa8ff, 0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0],
    POW_COL: [0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0],
    hands,
    head,
    state: 'play',
    xrActive: true,
    boardDirty: false,
    say: (t: string) => rec.says.push(`${frame()} ${t}`),
    gloves: { left: { pulse: 0 }, right: { pulse: 0 } },
    haptic: (s: string, v: number, ms: number) => rec.buzz.push(`${frame()} ${s} ${v} ${ms}`),
    fireBolt: (o: THREE.Vector3, d: THREE.Vector3, _l: unknown, dmg: number, perfect: boolean, tg: unknown, pow: number) => rec.shots.push(`${frame()} ${f(o)} ${f(d)} ${dmg} ${perfect} ${pow} → ${idx(tg)}`),
    lockShow: (e: unknown) => {
      if (e) rec.locks.push(`${frame()} ${idx(e)}`);
    },
    locks: { gaze: { visible: false } },
    swordActive: () => false,
    fwd: () => new V3(0, 0, -1).applyQuaternion(head.q),
    arena,
    _up: new V3(0, 1, 0),
    enemies: foes,
    tmpA: new V3(),
  });
  return { api, hands, head, arena };
}

// Una mano al azar: tramos de reposo, sacudidas, movimientos lentos, pérdidas y saltos del seguimiento
class HandSim {
  p = new V3();
  from = new V3();
  to = new V3();
  t = 0;
  dur = 0;
  kind = 'rest';
  lost = false;
  virt = false;
  trigT = 0;
  gripT = 0;
  aim = new V3(0, 0, -1);
  constructor(
    private r: () => number,
    private side: Side,
  ) {
    this.p.set(side === 'left' ? -0.25 : 0.25, 1.0, -0.15);
    this.next();
  }
  private next(): void {
    const r = this.r, x = r();
    this.from.copy(this.p);
    this.t = 0;
    this.lost = false;
    const sx = this.side === 'left' ? -1 : 1;
    if (x < 0.3) {
      this.kind = 'rest';
      this.dur = 0.15 + r() * 0.8;
      this.to.copy(this.p);
    } else if (x < 0.62) {
      this.kind = 'flick'; // hacia delante, a un lado, arriba, abajo o atrás
      this.dur = 0.07 + r() * 0.22;
      const a = (r() - 0.5) * Math.PI * 1.6, len = 0.15 + r() * 0.5, up = (r() - 0.5) * 0.7;
      this.to.set(this.p.x + Math.sin(a) * len, this.p.y + up * len, this.p.z - Math.cos(a) * len);
    } else if (x < 0.75) {
      this.kind = 'back'; // coger impulso: hacia atrás y luego lanza
      this.dur = 0.15 + r() * 0.25;
      this.to.set(sx * (0.2 + r() * 0.15), 0.9 + r() * 0.3, 0.05 + r() * 0.15);
    } else if (x < 0.85) {
      this.kind = 'slow';
      this.dur = 0.5 + r();
      this.to.set(sx * (0.1 + r() * 0.4), 0.8 + r() * 0.7, -0.1 - r() * 0.5);
    } else if (x < 0.95) {
      this.kind = 'lost'; // las gafas no la ven (y sigue moviéndose)
      this.dur = 0.03 + r() * 0.9;
      this.lost = true;
      this.to.set(sx * (0.1 + r() * 0.4), 0.8 + r() * 0.7, -0.1 - r() * 0.6);
    } else {
      this.kind = 'glitch'; // un salto del seguimiento: un fotograma en otro sitio
      this.dur = 0.001;
      this.to.copy(this.p);
    }
    if (this.r() < 0.04) this.virt = !this.virt; // (a ratos, mandos como manos)
  }
  step(dt: number, foes: Foe[]): { p: THREE.Vector3 | null; trig: boolean; grip: boolean; virt: boolean; rayD: THREE.Vector3 } {
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = k * k * (3 - 2 * k);
    this.p.copy(this.from).lerp(this.to, e);
    // un poco de temblor del seguimiento
    this.p.x += (this.r() - 0.5) * 0.004;
    this.p.y += (this.r() - 0.5) * 0.004;
    let out: THREE.Vector3 | null = this.lost ? null : this.p;
    if (this.kind === 'glitch') out = this.p.clone().add(new V3(0.5, 0.2, -0.4));
    if (k >= 1) this.next();
    // mandos: el gatillo y el agarre a ratos, y apuntando a un enemigo (o a cualquier sitio)
    if (this.trigT > 0) this.trigT -= dt;
    else if (this.r() < 0.02) this.trigT = 0.03 + this.r() * 0.4;
    if (this.gripT > 0) this.gripT -= dt;
    else if (this.r() < 0.008) this.gripT = 0.05 + this.r() * 0.5;
    if (this.r() < 0.03) {
      const alive = foes.filter((x) => x.alive);
      if (alive.length && this.r() < 0.7) this.aim.copy(alive[Math.floor(this.r() * alive.length)].pos).sub(this.p).normalize();
      else this.aim.set(this.r() - 0.5, this.r() - 0.5, -0.3 - this.r()).normalize();
    }
    return { p: out, trig: this.trigT > 0, grip: this.gripT > 0, virt: this.virt, rayD: this.aim };
  }
}

function scenario(seed: number, frames: number): { rep: Rec; port: Rec; diffs: string[] } {
  const r = rng(seed);
  const foes: Foe[] = [];
  const mkFoe = (): Foe => {
    const a = (r() - 0.5) * 2.2, d = 2 + r() * 8;
    return { alive: true, radius: 0.25 + r() * 0.3, pos: new V3(Math.sin(a) * d, 0.4 + r() * 1.4, -Math.cos(a) * d), vel: new V3((r() - 0.5) * 0.6, 0, 0.3 + r() * 0.8), center: function (this: Foe, out) { return out.copy(this.pos); } };
  };
  for (let i = 0, n = 1 + Math.floor(r() * 4); i < n; i++) foes.push(mkFoe());
  const throwPick = r() < 0.7 ? 'gaze' : 'hand', assist = Math.floor(r() * 26);
  let fr = 0;
  const rep: Rec = { shots: [], says: [], buzz: [], locks: [] }, port: Rec = { shots: [], says: [], buzz: [], locks: [] };
  const O = original(foes, throwPick, assist, rep, () => fr);
  // el portado, desde cero
  for (const s of SIDES) Object.assign(PH[s], mkHand());
  pReset();
  for (const s of SIDES) Object.assign(PHTH[s], { trigT: 0, trigPrev: false });
  gazeLockReset();
  PGZL.t = 0;
  PGZL.d.set(0, 0, -1);
  const yaw = (r() - 0.5) * 0.8;
  O.arena.rotation.y = yaw;
  const idx = (e: unknown): number => foes.indexOf(e as Foe);
  const env: ThrowEnv = {
    on: true,
    playing: true,
    byGaze: throwPick !== 'hand',
    sword: false,
    assist,
    bodyFwd: new V3(0, 0, -1).applyAxisAngle(new V3(0, 1, 0), yaw),
    gaze: new V3(0, 0, -1),
    targets: foes,
    fire: (_s, o, d, tg, c) => port.shots.push(`${fr} ${f(o)} ${f(d)} ${c.dmg} ${c.perfect} ${c.pow} → ${idx(tg)}`),
    haptic: (s, v, ms) => port.buzz.push(`${fr} ${s} ${v} ${ms}`),
    say: (t) => port.says.push(`${fr} ${t}`),
    lockShow: (e) => port.locks.push(`${fr} ${idx(e)}`),
  };
  const sims = { left: new HandSim(r, 'left'), right: new HandSim(r, 'right') };
  const diffs: string[] = [];
  let t = 1, state = 'play', stateT = 0;
  const hq = new Q4(), eul = new THREE.Euler();
  for (fr = 0; fr < frames; fr++) {
    // fotogramas de 72 Hz, a veces más lentos (el navegador se atasca) o más rápidos
    const x = r(), dt = x < 0.05 ? 1 / 30 : x < 0.1 ? 1 / 90 : x < 0.12 ? 0.11 : 1 / 72 + (r() - 0.5) * 0.002;
    t += dt;
    // a ratos, fuera de la oleada (entre oleadas sigue lanzando; en el menú, no)
    stateT -= dt;
    if (stateT <= 0) {
      const y = r();
      state = y < 0.8 ? 'play' : y < 0.9 ? 'rest' : 'menu';
      stateT = 0.5 + r() * 4;
    }
    (O.api.G as { state: string }).state = state;
    env.on = state === 'play' || state === 'rest';
    env.playing = state === 'play';
    // la cabeza: sentadillas (sube y baja) y mira alrededor
    const hy = 1.6 - 0.3 * (0.5 - 0.5 * Math.cos(t * 1.7)), hx = 0.05 * Math.sin(t * 0.3);
    eul.set(-0.25 + 0.2 * Math.sin(t * 0.9), 0.5 * Math.sin(t * 0.21) + yaw, 0, 'YXZ');
    hq.setFromEuler(eul);
    O.head.p.set(hx, hy, 0);
    O.head.q.copy(hq);
    PHead.p.set(hx, hy, 0);
    PHead.q.copy(hq);
    env.gaze.set(0, 0, -1).applyQuaternion(hq);
    // los enemigos se acercan; alguno cae y sale otro
    for (const e of foes) {
      e.pos.addScaledVector(e.vel, dt);
      if (e.alive && r() < 0.002) e.alive = false;
    }
    if (r() < 0.004 && foes.length < 6) foes.push(mkFoe());
    // las cargas (cada repetición)
    if (r() < 0.012) {
      const perfect = r() < 0.4, pow = 1 + Math.floor(r() * 4), dmg = (perfect ? 2 : 1) + [0, 1, 2, 4][pow - 1];
      const a = O.api.throwCharge(dmg, perfect, pow), b = pCharge(dmg, perfect, pow, true, true, env.say);
      if (a !== b) diffs.push(`${fr}: throwCharge ${a} / ${b}`);
    }
    // las manos (en la cabeza: relativas a ella en horizontal)
    for (const s of SIDES) {
      const st = sims[s].step(dt, foes), ra = O.hands[s], ph = PH[s];
      for (const h of [ra, ph] as (RAHand | typeof ph)[]) {
        h.ok = !!st.p;
        if (st.p) h.wrist.set(st.p.x + hx, st.p.y, st.p.z);
        h.isHand = !st.virt;
        h.virt = st.virt && h.ok;
        h.trig = st.virt && st.trig;
        h.grip = st.virt && st.grip;
        h.rayOk = st.virt && h.ok;
        if (st.p) h.rayO.copy(h.wrist);
        h.rayD.copy(st.rayD);
      }
    }
    O.api.throwStep(dt, t);
    pStep(dt, t, env);
    for (const s of SIDES) {
      const a = O.api.HTH[s].c, b = PHTH[s].c, sa = a ? `${a.dmg} ${a.perfect} ${a.pow}` : '-', sb = b ? `${b.dmg} ${b.perfect} ${b.pow}` : '-';
      if (sa !== sb) diffs.push(`${fr}: carga ${s} RepArena ${sa} / portado ${sb}`);
    }
    if (diffs.length > 5) break;
  }
  return { rep, port, diffs };
}

describe.skipIf(!RA_DIR)('el lanzamiento, igual que en RepArena', () => {
  const seeds = +(process.env.SEEDS || 40), frames = +(process.env.FRAMES || 2500);
  it(`${seeds} partidas de ${frames} fotogramas con las manos al azar`, () => {
    let shots = 0, locks = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { rep, port, diffs } = scenario(seed, frames);
      expect(diffs, `semilla ${seed}`).toEqual([]);
      expect(port.shots, `semilla ${seed}: rayos`).toEqual(rep.shots);
      expect(port.says, `semilla ${seed}: avisos`).toEqual(rep.says);
      expect(port.buzz, `semilla ${seed}: vibraciones`).toEqual(rep.buzz);
      expect(port.locks, `semilla ${seed}: dianas`).toEqual(rep.locks);
      shots += rep.shots.length;
      locks += rep.locks.length;
    }
    // (que las partidas al azar de verdad lancen rayos y marquen dianas)
    expect(shots).toBeGreaterThan(seeds * 3);
    expect(locks).toBeGreaterThan(seeds * 10);
    console.log(`  ${shots} rayos y ${locks} dianas, idénticos`);
  });
});
