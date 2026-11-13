// La lectura de las manos portada (src/input/hand-filter.ts) frente al código original de RepArena (src/80_main.js:
// handSmooth y handRescue): las mismas manos al azar (moviéndose, temblando, con saltos imposibles del seguimiento, posturas
// repetidas, perdidas un rato y con el cuerpo a ratos) tienen que dar la misma mano que se pinta (J.s, J.sq, tipS) y la misma
// mano perdida (h.est, h.back y sus articulaciones) en cada fotograma. (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { handRescue, handSmooth, mkRescue, mkSmooth } from '../../src/input/hand-filter.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const SIDES: Side[] = ['left', 'right'];

type RAApi = { handSmooth: (h: Hand, t: number) => void; handRescue: (frame: unknown, ref: unknown, t: number) => void };

function original(hands: Record<Side, Hand>, env: { allowed: boolean; bodyOn: boolean }): RAApi {
  const code = [
    'const TAU = Math.PI * 2;',
    raSlice('80_main.js', 'const HRS = ', '// Si el navegador da el cuerpo', false),
    raSlice('80_main.js', 'const HSM = ', '/* =================== CÓMO VEN', false),
  ].join('\n');
  return raRun<RAApi>(code, '{ handSmooth, handRescue }', {
    THREE,
    V3,
    Q4,
    hands,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    holdsWeights: () => !env.allowed,
    oneArm: () => false,
    get state() {
      return 'play';
    },
    get settings() {
      return { bodyHands: env.bodyOn };
    },
  });
}

// Una mano al azar: se mueve de un sitio a otro (a veces deprisa), tiembla, a ratos se pierde, a ratos el seguimiento da
// un salto imposible de un fotograma, y a veces las gafas repiten la misma postura (van a menos fotogramas que la imagen)
class Sim {
  w = new V3();
  from = new V3();
  to = new V3();
  t = 0;
  dur = 1;
  lost = 0;
  q = new Q4();
  constructor(private r: () => number, sx: number) {
    this.w.set(sx * 0.2, 1.1, -0.3);
    this.next();
  }
  next(): void {
    const r = this.r;
    this.from.copy(this.w);
    this.to.set((r() - 0.5) * 0.8, 0.6 + r() * 1.2, -0.1 - r() * 0.6);
    this.dur = r() < 0.3 ? 0.08 + r() * 0.15 : 0.3 + r() * 1.5;
    this.t = 0;
  }
  /** Llena la mano h (en J.p, J.q) para este fotograma. */
  fill(h: Hand, dt: number, repeat: boolean): void {
    const r = this.r;
    if (repeat) return; // (la misma postura que el fotograma anterior)
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = k * k * (3 - 2 * k);
    this.w.copy(this.from).lerp(this.to, e);
    if (k >= 1) this.next();
    if (this.lost > 0) this.lost -= dt;
    else if (r() < 0.01) this.lost = 0.05 + r() * 0.6;
    const ok = this.lost <= 0, glitch = ok && r() < 0.02;
    this.q.setFromAxisAngle(new V3(0, 1, 0), (r() - 0.5) * 0.05 + this.t);
    h.isHand = true;
    h.ok = ok;
    for (let i = 0; i < 25; i++) {
      const J = h.J[i];
      J.ok = ok;
      if (!ok) continue;
      J.p.set(this.w.x + (i % 5) * 0.012 + (r() - 0.5) * 0.004, this.w.y + Math.floor(i / 5) * 0.015 + (r() - 0.5) * 0.004, this.w.z - (i % 3) * 0.01);
      if (glitch) J.p.x += 0.5; // (un salto imposible del seguimiento)
      J.q.copy(this.q);
      J.r = 0.008 + (i % 4) * 0.001;
    }
    if (ok) {
      h.wrist.copy(h.J[0].p);
      h.wristQ.copy(h.J[0].q);
    }
  }
}

function copyIn(dst: Hand, src: Hand): void {
  dst.isHand = src.isHand;
  dst.ok = src.ok;
  dst.wrist.copy(src.wrist);
  dst.wristQ.copy(src.wristQ);
  for (let i = 0; i < 25; i++) {
    const a = dst.J[i], b = src.J[i];
    a.ok = b.ok;
    a.p.copy(b.p);
    a.q.copy(b.q);
    a.r = b.r;
  }
}

const near = (a: THREE.Vector3 | THREE.Quaternion, b: THREE.Vector3 | THREE.Quaternion): boolean => a.toArray().every((v, i) => Math.abs(v - b.toArray()[i]) < 1e-6);

const SEEN = { pred: 0, body: 0, glitch: 0, back: 0 };

function run(seed: number, frames: number, body: boolean, allowed: boolean): string[] {
  const r = rng(seed);
  const raw = { left: mkHand(), right: mkHand() }, A = { left: mkHand(), right: mkHand() }, B = { left: mkHand(), right: mkHand() };
  const sims = { left: new Sim(r, -1), right: new Sim(r, 1) };
  const env = { allowed, bodyOn: body };
  const ra = original(A, env);
  const F = { left: mkSmooth(), right: mkSmooth() }, R = { left: mkRescue(), right: mkRescue() };
  // el cuerpo: la muñeca de cada lado, un poco apartada de la de verdad (y con su giro)
  const bodyP = { left: new V3(), right: new V3() }, bodyQ = new Q4().setFromAxisAngle(new V3(1, 0, 0), 0.3);
  const frame = {
    body: { 'left-hand-wrist': { s: 'left' }, 'right-hand-wrist': { s: 'right' } },
    getPose: (sp: { s: Side }) => ({ transform: { position: { x: bodyP[sp.s].x, y: bodyP[sp.s].y, z: bodyP[sp.s].z }, orientation: { x: bodyQ.x, y: bodyQ.y, z: bodyQ.z, w: bodyQ.w } } }),
  };
  const penv = {
    allowed,
    body: (s: Side, p: THREE.Vector3, q: THREE.Quaternion): boolean => {
      if (!body) return false;
      p.copy(bodyP[s]);
      q.copy(bodyQ);
      return true;
    },
  };
  const diffs: string[] = [];
  let t = 0;
  for (let n = 0; n < frames; n++) {
    const dt = r() < 0.02 ? 0.03 : 1 / 72;
    t += dt;
    const repeat = r() < 0.3;
    for (const s of SIDES) {
      sims[s].fill(raw[s], dt, repeat);
      bodyP[s].copy(sims[s].w).add(new V3(0.02, -0.03, 0.01));
      copyIn(A[s], raw[s]);
      copyIn(B[s], raw[s]);
      // como readXR: la mano vista se suaviza (perdida, el filtro se queda como estaba) y se copian la muñeca y la punta
      if (A[s].J[0].ok) ra.handSmooth(A[s], t);
      if (B[s].J[0].ok) handSmooth(B[s], F[s], t);
      for (const h of [A[s], B[s]])
        if (h.J[9].ok) {
          h.tipOk = true;
          h.tip.copy(h.J[9].p);
          h.tipS.copy(h.J[9].s);
          h.tipSm = true;
        }
    }
    ra.handRescue(frame, {}, t);
    handRescue(B, F, R, t, penv);
    for (const s of SIDES) {
      const a = A[s], b = B[s];
      if (b.est) SEEN[b.est]++;
      if (b.back) SEEN.back++;
      if (a.ok !== b.ok || a.est !== b.est || a.back !== b.back) diffs.push(`${n} ${s}: ok ${a.ok}/${b.ok} est ${a.est}/${b.est} back ${a.back}/${b.back}`);
      for (let i = 0; i < 25; i++) {
        const x = a.J[i], y = b.J[i];
        if (x.ok !== y.ok || (x.ok && (!near(x.p, y.p) || !near(x.s, y.s) || !near(x.sq, y.sq)))) {
          diffs.push(`${n} ${s} J${i}: p ${x.p.toArray()} / ${y.p.toArray()} s ${x.s.toArray()} / ${y.s.toArray()}`);
          break;
        }
      }
      if (diffs.length > 5) return diffs;
    }
  }
  SEEN.glitch += F.left.glitch + F.right.glitch;
  return diffs;
}

describe.skipIf(!RA_DIR)('las manos, frente a RepArena (src/80_main.js)', () => {
  for (const [seed, body, allowed] of [
    [1, false, true],
    [2, true, true],
    [3, true, false],
    [4, false, false],
    [5, true, true],
  ] as [number, boolean, boolean][])
    it(`suavizado, saltos y mano perdida (semilla ${seed}${body ? ', con cuerpo' : ''}${allowed ? '' : ', sin inventar manos'})`, () => {
      expect(run(seed, 3000, body, allowed)).toEqual([]);
    });
  it('las pruebas pasan por los saltos imposibles, la mano que sigue su gesto y la que coloca el cuerpo', () => {
    expect(SEEN.glitch).toBeGreaterThan(10);
    expect(SEEN.pred).toBeGreaterThan(0);
    expect(SEEN.body).toBeGreaterThan(10);
    expect(SEEN.back).toBeGreaterThan(0);
  });
});
