/**
 * La lectura de las manos de RepArena (src/80_main.js: handSmooth y handRescue; src/70_game.js: handFilter), portada tal
 * cual (opción B del usuario, PR 30: con lo de serie de IWSDK las manos iban peor). Lógica pura, sin IWSDK; la llama
 * HandSystem (src/input/hand-system.ts) con lo que dan las gafas y se compara con el original (tests/compare).
 *  - handSmooth: la mano que se pinta (J.s, J.sq, tipS), sin el temblor del seguimiento (filtro «One Euro»; si las gafas
 *    repiten la misma postura, se adelanta con la velocidad que llevaba) y sin los saltos imposibles de la muñeca (más de
 *    30 cm de una postura a la siguiente: no se pinta hasta que la siguiente lo confirma). El juego sigue con J.p.
 *  - handRescue: la mano perdida (solo manos desnudas, en la partida y fuera de los ejercicios que se hacen con las manos):
 *    si iba deprisa sigue su gesto un instante ('pred'); si el navegador da el cuerpo y está «Manos con el cuerpo», se
 *    coloca en la muñeca del cuerpo con la última forma que se le vio ('body'). Esa mano no se pinta ni pulsa menús.
 *  - handFilter (HF): en los ejercicios de pesa con las dos manos juntas, cada mano solo vale si está a tu alcance y sin
 *    saltar más deprisa de lo que se mueve en ese ejercicio; al reaparecer, tiene que verse igual dos fotogramas seguidos.
 */
import { Quaternion, Vector3 } from 'three';
import type { Hand, Side } from './hand-model.js';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- el suavizado (handSmooth)

/** Lo que guarda el filtro de cada mano (RepArena: h.F). */
export interface SmoothState {
  x: Float32Array;
  dx: Float32Array;
  raw: Float32Array;
  v: Float32Array;
  ok: Uint8Array;
  w: Float32Array;
  t: number;
  tRaw: number;
  cand: [number, number, number] | null;
  glitch: number;
}
export const mkSmooth = (): SmoothState => ({ x: new Float32Array(75), dx: new Float32Array(75), raw: new Float32Array(75), v: new Float32Array(75), ok: new Uint8Array(25), w: new Float32Array(25), t: 0, tRaw: 0, cand: null, glitch: 0 });

export const HSM = { minC: 1.5, beta: 20, betaQ: 2.5, dC: 4, jump: 0.3 };
const hfA = (fc: number, dt: number): number => 1 / (1 + 1 / (TAU * fc * dt));

/** Suaviza las articulaciones de h para pintarlas (J.s, J.sq). t: el momento (s). */
export function handSmooth(h: Hand, F: SmoothState, t: number): void {
  const dt = t - F.t, J = h.J;
  F.t = t;
  const reset = !(dt > 0 && dt < 0.25), W = J[0].p;
  const same = !reset && J[0].ok && W.x === F.raw[0] && W.y === F.raw[1] && W.z === F.raw[2], rdt = t - F.tRaw;
  // un salto imposible de la muñeca no se pinta hasta que la postura siguiente lo confirma (cerca de la nueva); si vuelve, nada
  if (!reset && !same && F.ok[0] && J[0].ok && rdt < 0.12) {
    const jx = W.x - F.raw[0], jy = W.y - F.raw[1], jz = W.z - F.raw[2];
    if (jx * jx + jy * jy + jz * jz > HSM.jump * HSM.jump) {
      const c = F.cand;
      if (!c || Math.hypot(W.x - c[0], W.y - c[1], W.z - c[2]) > 0.06) {
        F.cand = [W.x, W.y, W.z];
        F.glitch++;
        return; // (se queda como estaba)
      }
    }
  }
  F.cand = null;
  if (!same) F.tRaw = t;
  for (let i = 0; i < 25; i++) {
    const P = J[i].p, o = i * 3;
    if (!J[i].ok) {
      F.ok[i] = 0;
      continue;
    }
    if (reset || !F.ok[i] || Math.abs(P.x - F.x[o]) + Math.abs(P.y - F.x[o + 1]) + Math.abs(P.z - F.x[o + 2]) > 0.3) {
      J[i].s.copy(P);
      J[i].sq.copy(J[i].q);
      F.w[i] = 0;
      F.ok[i] = 1;
      F.x[o] = F.raw[o] = P.x;
      F.x[o + 1] = F.raw[o + 1] = P.y;
      F.x[o + 2] = F.raw[o + 2] = P.z;
      F.v.fill(0, o, o + 3);
      F.dx.fill(0, o, o + 3);
      continue;
    }
    let tx: number, ty: number, tz: number;
    if (same) {
      // (las gafas repiten la postura: se adelanta con la velocidad que llevaba)
      const k = rdt < 0.06 ? rdt : 0;
      tx = P.x + F.v[o] * k;
      ty = P.y + F.v[o + 1] * k;
      tz = P.z + F.v[o + 2] * k;
    } else {
      const ok = rdt > 0 && rdt < 0.1;
      F.v[o] = ok ? (P.x - F.raw[o]) / rdt : 0;
      F.v[o + 1] = ok ? (P.y - F.raw[o + 1]) / rdt : 0;
      F.v[o + 2] = ok ? (P.z - F.raw[o + 2]) / rdt : 0;
      F.raw[o] = tx = P.x;
      F.raw[o + 1] = ty = P.y;
      F.raw[o + 2] = tz = P.z;
    }
    const aD = hfA(HSM.dC, dt);
    F.dx[o] += aD * ((tx - F.x[o]) / dt - F.dx[o]);
    F.dx[o + 1] += aD * ((ty - F.x[o + 1]) / dt - F.dx[o + 1]);
    F.dx[o + 2] += aD * ((tz - F.x[o + 2]) / dt - F.dx[o + 2]);
    const a = hfA(HSM.minC + HSM.beta * Math.hypot(F.dx[o], F.dx[o + 1], F.dx[o + 2]), dt);
    F.x[o] += a * (tx - F.x[o]);
    F.x[o + 1] += a * (ty - F.x[o + 1]);
    F.x[o + 2] += a * (tz - F.x[o + 2]);
    J[i].s.set(F.x[o], F.x[o + 1], F.x[o + 2]);
    // el giro, con el mismo filtro: quieto, muy suave; girando deprisa, casi sin retraso (solo para pintarla)
    const Q = J[i].sq, q = J[i].q, d = Math.min(1, Math.abs(Q.x * q.x + Q.y * q.y + Q.z * q.z + Q.w * q.w)), ang = 2 * Math.acos(d);
    F.w[i] += hfA(HSM.dC, dt) * (ang / dt - F.w[i]);
    Q.slerp(q, hfA(HSM.minC + HSM.betaQ * F.w[i], dt));
  }
}

// ---------------------------------------------------------------- la mano perdida (handRescue)

export const HRS = { pred: 0.15, vmin: 0.9, k: 5, glide: 0.6 };

/** Lo que guarda de cada mano para cuando se pierde (RepArena: h.R). */
export interface RescueState {
  rel: { p: Vector3; q: Quaternion; r: number }[];
  has: boolean;
  v: Vector3;
  lastP: Vector3;
  lastQ: Quaternion;
  lostT: number;
  offP: Vector3;
  offQ: Quaternion;
  cal: boolean;
  outP: Vector3;
  outQ: Quaternion;
  tgt: Vector3;
  mode: 'pred' | 'body' | null;
  t: number;
}
export const mkRescue = (): RescueState => ({ rel: Array.from({ length: 25 }, () => ({ p: new Vector3(), q: new Quaternion(), r: 0.008 })), has: false, v: new Vector3(), lastP: new Vector3(), lastQ: new Quaternion(), lostT: 0, offP: new Vector3(), offQ: new Quaternion(), cal: false, outP: new Vector3(), outQ: new Quaternion(), tgt: new Vector3(), mode: null, t: -1 });

const _hrB = new Vector3(), _hrBQ = new Quaternion(), _hrQi = new Quaternion(), _hrP = new Vector3(), _hrQ = new Quaternion(), _hrT = new Vector3(), _hrTQ = new Quaternion();

/** Lo que necesita handRescue de fuera: la muñeca del cuerpo de ese lado (si la da el navegador) y si se puede inventar una
 * mano (en la partida, fuera de los ejercicios que se hacen con las manos). */
export interface RescueEnv {
  body(side: Side, outP: Vector3, outQ: Quaternion): boolean;
  allowed: boolean;
}

/** La mano perdida: sigue su gesto o la coloca el cuerpo (h.est). Devuelve si el cuerpo ha colocado alguna (y cuánto). */
export function handRescue(hands: Record<Side, Hand>, F: Record<Side, SmoothState>, R: Record<Side, RescueState>, t: number, env: RescueEnv): { body: boolean; usedT: number } {
  let any = false, usedT = 0;
  for (const s of ['left', 'right'] as const) {
    const h = hands[s], S = R[s], dt = S.t < 0 ? 0 : clamp(t - S.t, 0, 0.1);
    S.t = t;
    h.est = null;
    h.back = false;
    const body = env.body(s, _hrB, _hrBQ);
    if (body) any = true;
    if (h.ok && h.isHand) {
      // la ven las cámaras: su forma (respecto a la muñeca), su velocidad y su sitio respecto a la muñeca del cuerpo
      const W = h.J[0];
      _hrQi.copy(W.q).invert();
      for (let i = 0; i < 25; i++) {
        const J = h.J[i], r = S.rel[i];
        if (!J.ok) continue;
        r.p.copy(J.p).sub(W.p).applyQuaternion(_hrQi);
        r.q.copy(_hrQi).multiply(J.q);
        r.r = J.r;
      }
      S.has = true;
      const f = F[s];
      S.v.lerp(t - f.tRaw < 0.06 ? _hrT.set(f.v[0], f.v[1], f.v[2]) : _hrT.set(0, 0, 0), 0.6); // (si las gafas repiten la postura, parada)
      S.lastP.copy(W.p);
      S.lastQ.copy(W.q);
      S.lostT = 0;
      h.back = S.mode === 'body'; // (tras una mano colocada por el cuerpo puede saltar un poco: eso no es un gesto)
      S.mode = null;
      if (body) {
        _hrQi.copy(_hrBQ).invert();
        _hrTQ.copy(_hrQi).multiply(W.q);
        _hrT.copy(W.p).sub(_hrB).applyQuaternion(_hrQi);
        if (!S.cal) {
          S.offQ.copy(_hrTQ);
          S.offP.copy(_hrT);
          S.cal = true;
        } else {
          S.offQ.slerp(_hrTQ, 0.1);
          S.offP.lerp(_hrT, 0.1);
        }
      }
      continue;
    }
    if (h.ok || !h.isHand || !S.has || !env.allowed) {
      S.mode = null;
      continue;
    }
    S.lostT += dt;
    let mode: 'pred' | 'body' | null = null;
    if (S.v.length() > HRS.vmin && S.lostT < HRS.pred) {
      _hrP.copy(S.lastP).addScaledVector(S.v, (1 - Math.exp(-HRS.k * S.lostT)) / HRS.k);
      _hrQ.copy(S.lastQ);
      mode = 'pred';
    } else if (body) {
      _hrQ.copy(_hrBQ).multiply(S.offQ);
      _hrP.copy(S.offP).applyQuaternion(_hrBQ).add(_hrB);
      mode = 'body';
    }
    if (!mode) {
      S.mode = null;
      continue;
    }
    if (mode === 'pred') {
      S.outP.copy(_hrP);
      S.outQ.copy(_hrQ);
    } else {
      if (S.mode !== 'body') {
        // desde donde se la veía (quieta, aún se pinta 0,3 s) o desde donde acabó el gesto; si hace rato, ya en su sitio
        if (!S.mode) {
          if (S.lostT < 0.3) {
            S.outP.copy(S.lastP);
            S.outQ.copy(S.lastQ);
          } else {
            S.outP.copy(_hrP);
            S.outQ.copy(_hrQ);
          }
        }
        S.tgt.copy(_hrP);
      }
      S.outP.add(_hrT.subVectors(_hrP, S.tgt)); // lo que se mueve el cuerpo, tal cual
      S.tgt.copy(_hrP);
      _hrT.subVectors(_hrP, S.outP);
      const l = _hrT.length(), mx = HRS.glide * dt;
      if (l > mx) _hrT.multiplyScalar(mx / l);
      S.outP.add(_hrT); // y el salto, despacio
      S.outQ.slerp(_hrQ, 1 - Math.exp(-8 * dt));
    }
    S.mode = mode;
    for (let i = 0; i < 25; i++) {
      const J = h.J[i], r = S.rel[i];
      J.p.copy(r.p).applyQuaternion(S.outQ).add(S.outP);
      J.q.copy(S.outQ).multiply(r.q);
      J.r = r.r;
      J.ok = true;
    }
    // (sin pasar por el suavizado: la mano que se pinta se queda donde se la vio; esta solo la usa el juego)
    const T = h.J[9];
    h.ok = true;
    h.wrist.copy(S.outP);
    h.wristQ.copy(S.outQ);
    h.tipOk = true;
    h.tip.copy(T.p);
    h.tipS.copy(T.s);
    h.tipSm = true;
    h.pinch = h.trig = false;
    h.est = mode;
    if (mode === 'body') usedT = dt;
  }
  return { body: any, usedT };
}

// ---------------------------------------------------------------- las manos que valen en la pesa (HF)

/** Lo que guarda el filtro HF de cada mano (RepArena: HF). ok: esta mano vale en este fotograma. */
export interface HFState {
  n: number;
  p: Vector3;
  has: boolean;
  ok: boolean;
}
export const mkHF = (): Record<Side, HFState> => ({ left: { n: 0, p: new Vector3(), has: false, ok: false }, right: { n: 0, p: new Vector3(), has: false, ok: false } });
const HF_V: Record<string, number> = { swing: 7, chop: 6, thruster: 5, frontsq: 5, fraise: 4, press2: 4, curl2: 3.2 }, HF_UP: Record<string, number> = { press2: 0.6, thruster: 0.6, chop: 0.45 };
const _hfd = new Vector3();

/** Cada mano solo vale si está a tu alcance (por debajo de los ojos, salvo en lo que se sube por encima de la cabeza) y sin
 * saltar más deprisa de lo que se mueve en ese ejercicio; al reaparecer, igual dos fotogramas seguidos. */
export function handFilter(HF: Record<Side, HFState>, hands: Record<Side, Hand>, headP: Vector3, ex: string, dt: number): void {
  const vmax = HF_V[ex] || 4, up = HF_UP[ex] || 0.05;
  for (const s of ['left', 'right'] as const) {
    const h = hands[s], F = HF[s];
    if (!h.ok) {
      F.n = 0;
      F.has = false;
      F.ok = false;
      continue;
    }
    const d = _hfd.subVectors(h.wrist, headP), reach = d.y < up && d.y > -1.15 && Math.hypot(d.x, d.z) < 0.9;
    const steady = F.has && F.p.distanceTo(h.wrist) <= Math.max(0.03, vmax * dt);
    F.p.copy(h.wrist);
    F.has = true;
    F.n = reach && steady ? F.n + 1 : 0;
    F.ok = F.n >= 2;
  }
}
