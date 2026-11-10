/**
 * Los ejercicios de pie de Combate, como en RepArena (src/70_game.js: vertDetector, CHAIN y chainStep, deadliftStep,
 * armStep, barStep, fraiseStep, twistStep, jumpTrack), con sus mismos números y reglas. Lógica pura, sin IWSDK: recibe la
 * cabeza y las manos de cada fotograma y devuelve lo que ha pasado (se prueba en tests/unit y se compara con el código de
 * RepArena en tests/compare).
 *
 *  - Con la cabeza (bajar y subir: src/exercise/vertical.ts): sentadilla, zancada (cada una, la otra pierna delante) y
 *    peso muerto. Aguantar abajo carga ×2, ×3 y ×4; al subir, el disparo.
 *  - En dos tiempos: sentadilla con press, con elevación frontal, con salto y swing. La bajada carga como la sentadilla y,
 *    al volver arriba, un gesto de los brazos (o el salto) dispara en 2,5 s.
 *  - Con los brazos: el curl (cada brazo por su cuenta), el curl con barra o kettlebell (las dos manos, como una sola
 *    pesa) y la elevación frontal. Arriba, aguantando, carga; el disparo sale al empezar a bajar.
 *  - Antebrazos (barra flexible): un giro de las muñecas en sentidos contrarios carga; el siguiente, al revés, dispara.
 *
 * Las manos, tal como las da IWSDK (`hands`: si se ven y dónde): RepArena filtraba antes las manos (`HF`: al alcance y sin
 * saltos imposibles) para tapar los fallos de su lectura; aquí no se porta (criterio del usuario: IWSDK de serie; ver
 * MIGRACION.md › PR 6). Si una mano no se ve, cuenta como perdida, igual que en RepArena.
 */
import { Quaternion, Vector3 } from 'three';
import type { Hand, Side } from '../input/hand-model.js';
import { powLevel, VertDetector, type VertConfig, type VertEvent } from './vertical.js';

/** Los ejercicios de pie de Combate (los de MODE_EX.combat que no van en el suelo ni sentados). */
export const STAND_EX = ['squat', 'lunge', 'jsquat', 'thruster', 'frontsq', 'swing', 'dlrow', 'curl', 'curl2', 'fraise', 'twist'];

/** Lo que pide cada ejercicio: los ajustes de «Tu cuerpo (recorridos)» y los de la carga. Se leen al empezar cada oleada. */
export interface StandCfg {
  ex: string;
  /** Bajadas de la cabeza (cm): sentadilla (también la de press, elevación y salto), zancada, swing y peso muerto. */
  squatDepth: number;
  lungeDepth: number;
  swingDrop: number;
  dlDepth: number;
  /** Manos sobre los ojos en la sentadilla con press y altura del salto (cm). */
  thrUp: number;
  jsqJump: number;
  /** Recorridos del curl y de la elevación frontal (cm) y giro de cada muñeca en los antebrazos (grados). */
  curlRange: number;
  fraiseRange: number;
  twistDeg: number;
  /** Duración mínima de una PERFECTA (s); aguante para el ×2 y lo que pide de más cada nivel (s). */
  perfectTime: number;
  powHold: number;
  powHoldInc: number;
  /** Recarga profunda (cm de más; 0: desactivada, o no es un ejercicio de piernas). */
  deepDrop: number;
  /** ¿Carga aguantando? (con pistolas o espadas, no: RepArena, `!pistolOn() && !swordActive()`) */
  power: boolean;
}

/** Los de serie de RepArena (src/00_core.js: SCHEMA). */
export const standDefaults = (ex = 'squat'): StandCfg => ({ ex, squatDepth: 26, lungeDepth: 28, swingDrop: 15, dlDepth: 28, thrUp: 20, jsqJump: 8, curlRange: 27, fraiseRange: 45, twistDeg: 70, perfectTime: 1.2, powHold: 1.5, powHoldInc: 0.5, deepDrop: 0, power: true });

/** Lo que ve el detector en cada fotograma. */
export interface StandInput {
  hands: Record<Side, Hand>;
  head: { p: Vector3; speed: number };
  /** Hacia dónde está «delante» en la arena (horizontal, unitario): de ahí sale cuánto adelantas los brazos. */
  fwd: Vector3;
  /** ¿En plena oleada? (los recordatorios solo salen jugando) */
  play: boolean;
}

/** Lo que pasa en un fotograma (side: el brazo, en el curl; null, las dos manos o la cabeza). */
export type StandEvent =
  | { type: 'charge' }
  | { type: 'power'; level: number; deep: boolean }
  | { type: 'rep'; perfect: boolean; fast: boolean; pow: number; side: Side | null }
  | { type: 'partial'; msg: string }
  | { type: 'top'; side: Side | null }
  | { type: 'say'; msg: string; color: string };

/** Avisos de lo que se hace mal (naranja): salen también en grande en el suelo (RepArena: WARN_COLS). */
export const WARN_COL = '#ff8a3d';

interface RepOpts {
  perfect: boolean;
  fast: boolean;
  pow?: number;
}

// Los gestos de los ejercicios en dos tiempos (RepArena: CHAIN). r: la muñeca respecto a los ojos (m); f: cuánto está por
// delante de ellos (m)
//  · thruster: las dos manos por encima de la cabeza (thrUp cm sobre los ojos)
//  · frontsq: brazos estirados al frente, a la altura de los hombros
//  · swing: la kettlebell al frente, a la altura del pecho (con una mano a la vista basta: la agarran las dos)
//  · jsquat: la cabeza sube jsqJump cm sobre tu altura de pie, deprisa (un salto, no ponerse de puntillas)
interface ChainDef {
  depth: (c: StandCfg) => number;
  both?: boolean;
  jump?: boolean;
  ok?: (r: number, f: number, c: StandCfg) => boolean;
  lostOk?: (r: number) => boolean;
  low?: string;
  miss: string;
}
export const CHAIN: Record<string, ChainDef> = {
  thruster: { depth: (c) => c.squatDepth, both: true, ok: (r, _f, c) => r >= c.thrUp / 100, lostOk: (r) => r > -0.02, miss: '¡Sube las pesas por encima de la cabeza!' },
  frontsq: { depth: (c) => c.squatDepth, both: true, ok: (r, f) => r >= -0.28 && f >= 0.32, lostOk: (r) => r > -0.4, miss: '¡Brazos estirados al frente, a la altura de los hombros!' },
  swing: { depth: (c) => c.swingDrop, ok: (r, f) => r >= -0.48 && f >= 0.25, lostOk: (r) => r > -0.58, low: '¡Lleva más la cadera atrás!', miss: '¡Lanza la kettlebell al frente, a la altura del pecho!' },
  jsquat: { depth: (c) => c.squatDepth, jump: true, miss: '¡Salta al subir!' },
};
const CH_WIN = 2.5; // (segundos para el gesto, ya de pie)

const mkArm = () => ({ state: 'down' as 'down' | 'rising' | 'hold' | 'top', bottom: -0.78, max: 0, t0: 0, lost: 0, holdT: 0, pow: 1, ev: null as RepOpts | null });
const wrapAng = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class StandingDetector {
  // con la cabeza (RepArena: DET.sq, también para el peso muerto y los de dos tiempos; DET.lu, la zancada)
  readonly sq = new VertDetector();
  readonly lu = new VertDetector();
  /** La zancada: 0, la derecha delante; 1, la izquierda. */
  leg = 0;
  // los de dos tiempos (DET.th) y el salto (JUMP)
  readonly th = { pending: null as RepOpts | null, hold: null as RepOpts | null, t0: 0, armed: false, ref: 0, quiet: 0, seen: { left: false, right: false }, last: { left: -1, right: -1 }, lostT: { left: 0, right: 0 } };
  readonly jump = { vy: 0, lastY: 0, fastT: 9 };
  // los brazos (DET.curl, DET.bar, DET.fr) y los antebrazos (DET.tw)
  readonly curl = { left: mkArm(), right: mkArm() };
  readonly bar = { ...mkArm(), hv: { left: 0, right: 0 }, hy: { left: NaN, right: NaN } };
  readonly fr = { state: 'down' as 'down' | 'rising' | 'top', bottom: -0.85, max: 0, t0: 0, lost: 0, fwd: 0, o: null as RepOpts | null, holdT: 0, pow: 1 };
  readonly tw = { last: NaN, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: 0, lostT: 0, warnT: 0, ext: 0, holdT: 0, pow: 1, first: false };
  /** ¿Hay un disparo cargado? (RepArena: `charged`, que se pone al cargar y se quita al disparar o al perderlo) */
  charged = false;

  private vEv: VertEvent[] = [];
  private vCfg: VertConfig = { req: 0.26, start: 0.08, back: 0.05, partial: 0.1, perfectDur: 1.2, power: true, powHold: 1.5, powHoldInc: 0.5, deepDrop: 0 };
  private out: StandEvent[] = [];
  private c!: StandCfg;
  private I!: StandInput;
  private t = 0;
  private dt = 0;
  private tmp = new Vector3();
  private ax = new Vector3();
  private r1 = new Vector3();
  private r2 = new Vector3();
  private k = new Vector3();
  private q = new Quaternion();

  /** De pie a la altura y (al calibrar o empezar la ronda): todo como al principio. */
  reset(y: number): void {
    this.sq.reset(y);
    this.lu.reset(y);
    this.leg = 0;
    Object.assign(this.th, { pending: null, hold: null, t0: 0, armed: false, ref: y, quiet: 0 });
    this.th.seen.left = this.th.seen.right = false;
    this.th.last.left = this.th.last.right = -1;
    this.th.lostT.left = this.th.lostT.right = 0;
    Object.assign(this.jump, { vy: 0, lastY: y, fastT: 9 });
    for (const a of [this.curl.left, this.curl.right, this.bar]) Object.assign(a, mkArm());
    this.bar.hv.left = this.bar.hv.right = 0;
    this.bar.hy.left = this.bar.hy.right = NaN;
    Object.assign(this.fr, { state: 'down', bottom: -0.85, max: 0, t0: 0, lost: 0, fwd: 0, o: null, holdT: 0, pow: 1 });
    Object.assign(this.tw, { last: NaN, acc: 0, lo: 0, hi: 0, dir: 0, n: 0, t0: 0, lostT: 0, warnT: 0, ext: 0, holdT: 0, pow: 1, first: false });
    this.charged = false;
  }

  /** Un fotograma (t: el reloj, s; dt: lo que ha pasado): añade a `out` lo que haya pasado. */
  update(t: number, dt: number, I: StandInput, c: StandCfg, out: StandEvent[]): void {
    this.out = out;
    this.c = c;
    this.I = I;
    this.t = t;
    this.dt = dt;
    const ex = c.ex;
    if (ex === 'lunge') {
      // zancada: como la sentadilla, con su propia bajada (y su carga al aguantar abajo); después de cada una toca la otra pierna
      const n = out.length;
      this.vert(this.lu, c.lungeDepth, 0.08, 0.05, 0.4, '¡Baja más la rodilla de atrás!', null);
      for (let i = n; i < out.length; i++) {
        if (out[i].type !== 'rep') continue;
        this.leg ^= 1;
        this.say(`Ahora con la pierna ${this.leg ? 'izquierda' : 'derecha'} delante`, '#a49fc8');
        break;
      }
    } else if (ex === 'curl') {
      // cada brazo por su cuenta: carga al llegar al hombro y dispara al empezar a bajar
      this.armStep('left', dt);
      this.armStep('right', dt);
    } else if (ex === 'curl2') this.barStep(dt);
    else if (ex === 'twist') this.twistStep(dt);
    else if (CHAIN[ex]) this.chainStep(CHAIN[ex], dt);
    else if (ex === 'fraise') this.fraiseStep(dt);
    else if (ex === 'dlrow') this.vert(this.sq, c.dlDepth, 0.08, 0.05, 0.4, '¡Baja más el peso!', null);
    else this.vert(this.sq, c.squatDepth, 0.08, 0.05, 0.4, '¡Baja más!', null); // la sentadilla (y lo que no se conozca)
  }

  // ---------------------------------------------------------------- lo que pasa (como onCharge, onPower, onRep y onPartial)

  private charge(): void {
    this.charged = true;
    this.out.push({ type: 'charge' });
  }
  // (como onPower de RepArena: sin carga, no sube)
  private power(level: number, deep = false): void {
    if (this.charged) this.out.push({ type: 'power', level, deep });
  }
  private rep(o: RepOpts, side: Side | null = null): void {
    this.charged = false;
    this.out.push({ type: 'rep', perfect: o.perfect, fast: o.fast, pow: o.pow || 1, side });
  }
  private partial(msg: string): void {
    this.charged = false;
    this.out.push({ type: 'partial', msg });
  }
  private top(side: Side | null): void {
    this.out.push({ type: 'top', side });
  }
  private say(msg: string, color: string): void {
    this.out.push({ type: 'say', msg, color });
  }

  // ---------------------------------------------------------------- con la cabeza

  // bajar y subir (RepArena: vertDetector con start = min(startCap, req/2), back y partial = req·partialK); defer: la
  // repetición no dispara, se queda para el gesto de después (los de dos tiempos)
  private vert(d: VertDetector, depthCm: number, startCap: number, back: number, partialK: number, msg: string, defer: ((o: RepOpts) => void) | null): void {
    const c = this.c, req = depthCm / 100, v = this.vCfg, ev = this.vEv;
    v.req = req;
    v.start = Math.min(startCap, req * 0.5);
    v.back = back;
    v.partial = req * partialK;
    v.perfectDur = c.perfectTime;
    v.power = c.power;
    v.powHold = c.powHold;
    v.powHoldInc = c.powHoldInc;
    v.deepDrop = c.deepDrop / 100;
    ev.length = 0;
    d.update(this.I.head.p.y, this.t, this.dt, this.I.head.speed, v, ev);
    for (const e of ev) {
      if (e.type === 'charge') this.charge();
      else if (e.type === 'power') this.power(e.level, e.deep);
      else if (e.type === 'partial') this.partial(msg);
      else if (defer) defer(e);
      else this.rep(e);
    }
  }

  // ---------------------------------------------------------------- en dos tiempos

  // la cabeza sube deprisa: fastT, el tiempo desde la última subida rápida (más de 0,6 m/s hacia arriba)
  private jumpTrack(dt: number): void {
    const J = this.jump, y = this.I.head.p.y;
    if (dt <= 0) return;
    const v = (y - J.lastY) / dt;
    J.lastY = y;
    J.vy = J.vy * 0.5 + v * 0.5;
    J.fastT = J.vy > 0.6 ? 0 : J.fastT + dt;
  }

  // La bajada (sentadilla, cadera atrás en el swing) carga como siempre y, al volver arriba, un gesto de los brazos (o un
  // salto) dispara en CH_WIN segundos. El gesto se va mirando desde que carga (en el swing los brazos suben a la vez que la
  // cadera), pero solo dispara ya de pie. Por encima de la cabeza o pegadas al cuerpo las gafas pueden perder las manos: si
  // se pierde una que ya iba bien, cuenta
  private chainStep(K: ChainDef, dt: number): void {
    const T = this.th, S = this.sq, t = this.t, I = this.I, hp = I.head.p;
    if (K.jump) this.jumpTrack(dt);
    if (t < T.quiet) return; // recién aterrizado: la caída del salto no es otra sentadilla
    T.hold = null;
    if (!T.pending) this.vert(S, K.depth(this.c), 0.08, 0.05, 0.4, K.low || '¡Baja más!', (o) => (T.hold = o));
    if (S.state === 'down' && S.charged && !T.armed && !T.pending) {
      T.armed = true;
      T.ref = S.ref;
      T.seen.left = T.seen.right = false;
      T.lostT.left = T.lostT.right = 0;
    }
    if (T.hold) {
      T.pending = T.hold;
      T.t0 = t;
      T.armed = false;
    }
    if (!T.pending && !T.armed) return;
    if (K.jump) {
      if (hp.y - T.ref >= this.c.jsqJump / 100 && this.jump.fastT < 0.3) T.seen.left = T.seen.right = true;
    } else
      for (const s of ['left', 'right'] as const) {
        const h = I.hands[s];
        if (h.ok) {
          const r = h.wrist.y - hp.y, f = this.tmp.subVectors(h.wrist, hp).dot(I.fwd); // f: cuánto está por delante de los ojos
          if (K.ok!(r, f, this.c)) T.seen[s] = true;
          T.last[s] = r;
          T.lostT[s] = 0;
        } else {
          T.lostT[s] += dt;
          if (T.lostT[s] > 0.15 && K.lostOk!(T.last[s])) T.seen[s] = true;
        }
      }
    if (!T.pending) return;
    const L = T.seen.left, R = T.seen.right, one = !K.both || T.lostT.left > 0.3 || T.lostT.right > 0.3;
    if ((L && R) || ((L || R) && one)) {
      this.rep(T.pending);
      T.pending = null;
      if (K.jump) {
        T.quiet = t + 0.6;
        S.ref = T.ref;
        S.state = 'up';
      }
    } else if (t - T.t0 > CH_WIN) {
      this.partial(K.miss);
      T.pending = null;
    }
  }

  // ---------------------------------------------------------------- los brazos

  // Un brazo de curl: al llegar arriba (al hombro) carga y, aguantando, sube la carga (×2, ×3, ×4); dispara al empezar a
  // bajar. A medias, el aviso. Subiendo, la pesa tapa los dedos y las gafas pierden la mano: si ya iba por casi la mitad,
  // cuenta (sin ver el final); y arriba, junto a la cara, también (sale con la carga que llevaba)
  private armStep(side: Side, dt: number): void {
    const h = this.I.hands[side], d = this.curl[side], c = this.c, pt = c.perfectTime, range = c.curlRange / 100, t = this.t;
    if (!h.ok) {
      d.lost += dt;
      if (d.state === 'hold' && d.lost > 0.25) {
        d.state = 'top';
        this.rep({ ...d.ev!, pow: d.pow }, side);
      } else if (d.state === 'rising' && d.lost > 0.25 && d.max - d.bottom >= range * 0.4) {
        d.state = 'top';
        this.charge();
        this.rep({ perfect: false, fast: false }, side);
      } else if (d.lost > 0.5) d.state = 'down';
      return;
    }
    const r = h.wrist.y - this.I.head.p.y;
    d.lost = 0;
    d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : 0.0012); // lo más bajo del recorrido
    if (d.state === 'hold') {
      if (r >= d.bottom + range * 0.75) {
        d.holdT += dt;
        const p = powLevel(d.holdT, c.powHold, c.powHoldInc);
        if (p > d.pow) {
          d.pow = p;
          this.power(p);
        }
        return;
      }
      d.state = 'top';
      this.rep({ ...d.ev!, pow: d.pow }, side);
      return;
    }
    if (d.state === 'down') {
      if (r > d.bottom + Math.min(0.12, range * 0.45)) Object.assign(d, { state: 'rising', max: r, t0: t });
    } else if (d.state === 'rising') {
      d.max = Math.max(d.max, r);
      if (r - d.bottom >= range) {
        const dur = t - d.t0;
        Object.assign(d, { state: 'hold', holdT: 0, pow: 1, ev: { perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 } });
        this.charge();
        this.top(side);
        return;
      }
      if (r < d.bottom + 0.07) {
        d.state = 'down';
        if (d.max - d.bottom > range * 0.55) this.partial('Sube hasta el hombro');
      }
    } else if (r < d.bottom + 0.08) d.state = 'down';
  }

  // Curl con barra o con la kettlebell (agarrada por el asa con los puños juntos y la bola colgando): las dos manos se
  // siguen como una sola pesa, con la altura de las muñecas respecto a los ojos:
  //  · con las dos a la vista y juntas (a menos de 25 cm: en la pesa), vale su media; con una a la vista basta; con las dos
  //    separadas (no puede ser: van en la misma pesa), las gafas confunden una: vale la que se mueve (la otra suele
  //    quedarse quieta donde se perdió)
  //  · arriba, aguantando, carga el disparo, que sale al empezar a bajar
  //  · si se pierden las dos subiendo (ya por casi la mitad) o arriba aguantando, cuenta; y si reaparecen ya arriba, también
  private barStep(dt: number): void {
    const B = this.bar, c = this.c, range = c.curlRange / 100, pt = c.perfectTime, t = this.t, hp = this.I.head.p, hl = this.I.hands.left, hr = this.I.hands.right;
    const inReach = (h: Hand): boolean => {
      const d = h.wrist.y - hp.y;
      return d < 0.05 && d > -1.15 && Math.hypot(h.wrist.x - hp.x, h.wrist.z - hp.z) < 0.9;
    };
    const clasp = hl.ok && hr.ok && hl.wrist.distanceTo(hr.wrist) < 0.25 && inReach(hl) && inReach(hr);
    // cuánto se ha movido cada mano (para saber, si no coinciden, cuál es la de verdad)
    for (const s of ['left', 'right'] as const) {
      const h = this.I.hands[s];
      if (h.ok) {
        const y0 = B.hy[s];
        B.hy[s] = h.wrist.y;
        if (!Number.isNaN(y0)) B.hv[s] += (Math.abs(B.hy[s] - y0) / Math.max(dt, 1e-3) - B.hv[s]) * Math.min(1, dt * 6);
      } else B.hy[s] = NaN;
    }
    // la altura de la pesa: juntas, su media; si no, las que se vean
    let y: number;
    if (clasp) y = (hl.wrist.y + hr.wrist.y) / 2 - hp.y;
    else if (hl.ok && hr.ok) {
      const a = hl.wrist.y - hp.y, b = hr.wrist.y - hp.y;
      y = Math.abs(a - b) <= 0.15 ? (Math.max(a, b) + Math.min(a, b)) / 2 : B.hv.left >= B.hv.right ? a : b; // (no coinciden: la que se mueve)
    } else if (hl.ok || hr.ok) y = (hl.ok ? hl : hr).wrist.y - hp.y;
    else {
      B.lost += dt;
      if (B.state === 'hold' && B.lost > 0.25) {
        B.state = 'top';
        this.rep({ ...B.ev!, pow: B.pow });
      } else if (B.state === 'rising' && B.lost > 0.25 && B.max - B.bottom >= range * 0.4) {
        B.state = 'top';
        this.charge();
        this.rep({ perfect: false, fast: false });
      }
      return;
    }
    const back = B.lost;
    B.lost = 0;
    B.bottom += (y - B.bottom) * (y < B.bottom ? 0.5 : 0.0012); // lo más bajo del recorrido
    const top = (ev: RepOpts): void => {
      Object.assign(B, { state: 'hold', holdT: 0, pow: 1, ev });
      this.charge();
      this.top(null);
    };
    // reaparecen ya arriba tras perderlas un rato (subiendo): esa subida cuenta
    if (back > 0.1 && back < 2 && (B.state === 'down' || B.state === 'rising') && y - B.bottom >= range * 0.85) {
      top({ perfect: false, fast: false });
      return;
    }
    if (B.state === 'hold') {
      // aguantando arriba carga el disparo (×2, ×3, ×4); sale al empezar a bajar
      if (y >= B.bottom + range * 0.75) {
        B.holdT += dt;
        const p = powLevel(B.holdT, c.powHold, c.powHoldInc);
        if (p > B.pow) {
          B.pow = p;
          this.power(p);
        }
        return;
      }
      B.state = 'top';
      this.rep({ ...B.ev!, pow: B.pow });
      return;
    }
    if (B.state === 'down') {
      if (y > B.bottom + Math.min(0.12, range * 0.45)) Object.assign(B, { state: 'rising', max: y, t0: t });
    } else if (B.state === 'rising') {
      B.max = Math.max(B.max, y);
      if (y - B.bottom >= range) {
        const dur = t - B.t0;
        top({ perfect: dur >= pt * 0.5 && dur < 5 && y - B.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 });
        return;
      }
      if (y < B.bottom + 0.07) {
        B.state = 'down';
        if (B.max - B.bottom > range * 0.55) this.partial('Sube hasta el hombro');
      }
    } else if (y < B.bottom + 0.08) B.state = 'down';
  }

  // Elevación frontal con una sola pesa sujeta con las dos manos: las manos, juntas, suben desde los muslos con los brazos
  // estirados al frente hasta la altura de los hombros. Se sigue el punto medio de las manos que se vean (con una basta: la
  // pesa las tapa a veces) respecto a la cabeza; al empezar a subir carga y arriba ya vale (el disparo, al empezar a bajar,
  // para poder aguantar y cargar). Arriba tienen que estar lejos de la cara (brazos estirados): así un curl no cuenta
  private fraiseStep(dt: number): void {
    const d = this.fr, c = this.c, range = c.fraiseRange / 100, t = this.t, hp = this.I.head.p, m = this.tmp.set(0, 0, 0);
    let n = 0;
    for (const s of ['left', 'right'] as const)
      if (this.I.hands[s].ok) {
        m.add(this.I.hands[s].wrist);
        n++;
      }
    if (!n) {
      // la pesa tapa las manos: si se perdieron subiendo, ya por casi la mitad y con los brazos al frente, cuenta
      d.lost += dt;
      if (d.state === 'rising' && d.lost > 0.25 && d.max - d.bottom >= range * 0.4 && d.fwd >= 0.3) {
        this.rep({ perfect: false, fast: false });
        d.state = 'top';
        d.o = null;
      } else if (d.o && d.lost > 0.6) this.frFire();
      // se perdieron arriba: dispara con la carga que llevara
      else if (d.lost > 0.6 && d.state !== 'top') d.state = 'down';
      return;
    }
    m.divideScalar(n);
    d.lost = 0;
    const r = m.y - hp.y, fwd = Math.hypot(m.x - hp.x, m.z - hp.z);
    d.bottom += (r - d.bottom) * (r < d.bottom ? 0.5 : 0.0012); // lo más bajo del recorrido (se adapta a tu altura)
    if (d.state === 'down') {
      if (r > d.bottom + Math.min(0.1, range * 0.3)) {
        Object.assign(d, { state: 'rising', max: r, t0: t, fwd });
        this.charge();
      }
    } else if (d.state === 'rising') {
      d.max = Math.max(d.max, r);
      d.fwd = Math.max(d.fwd, fwd);
      if (r - d.bottom >= range) {
        if (d.fwd < 0.36) {
          this.partial('Brazos estirados: la pesa, al frente');
          d.state = 'top';
          return;
        }
        const dur = t - d.t0, pt = c.perfectTime, o = { perfect: dur >= pt * 0.5 && dur < 5 && r - d.bottom >= range + 0.03, fast: pt > 0 && dur < pt * 0.25 };
        d.state = 'top';
        d.holdT = 0;
        d.pow = 1;
        if (!c.power) this.rep(o); // (con pistolas o espadas dispara ya)
        else {
          d.o = o;
          this.top(null);
        }
      } else if (r < d.bottom + 0.06) {
        d.state = 'down';
        if (d.max - d.bottom > range * 0.55) this.partial('Sube hasta la altura de los hombros');
      }
    } else {
      // arriba, con los brazos estirados al frente: aguantar sube la carga (×2, ×3, ×4); al empezar a bajar, dispara
      if (d.o && r - d.bottom >= range - 0.04 && fwd >= 0.33) {
        d.holdT += dt;
        const p = powLevel(d.holdT, c.powHold, c.powHoldInc);
        if (p > d.pow) {
          d.pow = p;
          this.power(p);
        }
      } else if (d.o && r - d.bottom < range * 0.8) this.frFire();
      if (r < d.bottom + Math.min(0.12, range * 0.3)) {
        if (d.o) this.frFire();
        d.state = 'down'; // hay que bajarla para la siguiente
      }
    }
  }
  private frFire(): void {
    const d = this.fr, o = d.o!;
    d.o = null;
    o.pow = d.pow || 1;
    this.rep(o);
  }

  // ---------------------------------------------------------------- antebrazos

  // Barra flexible: las manos, agarradas a los extremos, giran alrededor del eje de la barra (la línea entre las muñecas)
  // en sentidos contrarios. Se mide el ángulo de cada mano alrededor de ese eje con la dirección muñeca → nudillos y se usa
  // la diferencia entre las dos: así da igual que el cuerpo o la barra entera se muevan
  private handAngle(h: Hand): number | null {
    const K = h.J[10].ok ? h.J[10].p : h.J[11].ok ? h.J[11].p : null, v = this.k, ax = this.ax; // nudillo del dedo corazón (o la falange)
    if (K) v.subVectors(K, h.wrist);
    else v.set(0, 0, -1).applyQuaternion(this.q.copy(h.wristQ));
    v.addScaledVector(ax, -v.dot(ax));
    if (v.lengthSq() < 1e-6) return null;
    return Math.atan2(v.dot(this.r2), v.dot(this.r1));
  }
  private twistAngle(): number | null {
    const L = this.I.hands.left, R = this.I.hands.right;
    if (!L.ok || !R.ok) return null;
    const ax = this.ax.subVectors(R.wrist, L.wrist), len = ax.length();
    if (len < 0.12 || len > 0.95) return null;
    ax.divideScalar(len);
    const r1 = this.r1.set(0, 1, 0).addScaledVector(ax, -ax.y);
    if (r1.lengthSq() < 0.05) r1.set(0, 0, 1).addScaledVector(ax, -ax.z);
    r1.normalize();
    this.r2.crossVectors(ax, r1);
    const a = this.handAngle(L), b = this.handAngle(R);
    return a == null || b == null ? null : wrapAng(b - a);
  }
  // Un giro (escurrir hacia un lado, ~2 × twistDeg de diferencia) carga; el siguiente, hacia el otro, dispara
  private twistStep(dt: number): void {
    const T = this.tw, c = this.c, t = this.t, req = ((2 * c.twistDeg * Math.PI) / 180) * 0.85, phi = this.twistAngle();
    T.warnT -= dt;
    if (T.t0 < 0) T.t0 = t;
    if (phi == null) {
      T.lostT += dt;
      if (T.lostT > 1.2 && this.I.play && T.warnT <= 0) {
        this.say('Mira la barra: no veo tus dos manos', WARN_COL);
        T.warnT = 4;
      }
      T.last = NaN;
      return;
    }
    T.lostT = 0;
    if (Number.isNaN(T.last)) {
      // al recuperar las manos no se cuenta el salto
      T.last = phi;
      T.lo = T.hi = T.acc;
      return;
    }
    T.acc += wrapAng(phi - T.last);
    T.last = phi;
    if (T.acc < T.lo) {
      T.lo = T.acc;
      T.ext = -1;
    }
    if (T.acc > T.hi) {
      T.hi = T.acc;
      T.ext = 1;
    } // último extremo alcanzado
    // giro completo hacia el lado que toca (el primero, hacia cualquiera)
    let done = 0;
    if (T.dir <= 0 && T.acc - T.lo >= req) done = 1;
    else if (T.dir >= 0 && T.hi - T.acc >= req) done = -1;
    if (done) {
      const span = done > 0 ? T.acc - T.lo : T.hi - T.acc, dur = t - T.t0;
      T.dir = done;
      T.lo = T.hi = T.acc;
      T.t0 = t;
      T.n++;
      if (T.n % 2) {
        this.charge();
        this.say('¡Cargado! Aguanta escurrida o gira al revés', '#3cf0c6');
        T.holdT = 0;
        T.pow = 1;
      } else this.rep({ perfect: span >= (req / 0.85) * 1.05 && dur >= c.perfectTime * 0.4, fast: c.perfectTime > 0 && dur < c.perfectTime * 0.2, pow: T.pow || 1 });
      if (!(T.n % 2)) T.pow = 1;
      return;
    }
    // cargado: aguantar la barra escurrida al máximo (sin volver más de ~10° desde el extremo) sube la carga, ×2, ×3, ×4
    if (T.n % 2 && this.charged && c.power && (T.dir > 0 ? T.hi - T.acc : T.acc - T.lo) < 0.18) {
      T.holdT += dt;
      const p = powLevel(T.holdT, c.powHold, c.powHoldInc);
      if (p > T.pow) {
        T.pow = p;
        this.power(p);
      }
    }
    // se dio la vuelta antes de completar el giro que tocaba: avisa si se quedó corto
    const sweep = T.hi - T.lo, back = T.ext > 0 ? T.hi - T.acc : T.acc - T.lo; // cuánto ha vuelto desde el último extremo
    // (el primer medio giro, desde las manos rectas hasta un extremo, no cuenta como corto)
    if (back > 0.5 && sweep > req * 0.45 && sweep < req) {
      if (T.n || T.first) {
        if (T.warnT <= 0) {
          this.partial(`Gira más las muñecas (unos ${c.twistDeg}° cada una)`);
          T.warnT = 2.5;
        }
      }
      T.first = true;
      T.lo = T.hi = T.acc;
    }
  }
}
