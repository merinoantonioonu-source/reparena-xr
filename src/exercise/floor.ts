/**
 * Los ejercicios en el suelo y sentado, como en RepArena (src/70_game.js: runDetectors, con los mismos números y reglas),
 * con la misma forma que los de pie (src/exercise/standing.ts: devuelven sucesos). Lógica pura, sin IWSDK: se compara con
 * el código de RepArena en tests/compare/floor.compare.test.ts.
 *  - Fondos en silla (dips): la cabeza baja al doblar los codos y sube al estirarlos (como la sentadilla, con su bajada).
 *  - Flexiones (pushup): igual, desde la plancha.
 *  - Plancha lateral (splank): aguantar con la cadera arriba; cada «Segundos de plancha lateral» seguidos, un disparo; si
 *    la cadera cae, el tiempo vuelve a empezar.
 *  - Superman (superman): tumbado boca abajo, subir el tronco con los brazos estirados y aguantar arriba dispara.
 *  - Plancha con un brazo (plank1): en plancha, levantar un brazo dispara a su lado; una flexión aguantada abajo carga
 *    ×2-×4 para el brazo que se levante después.
 *  - Inchworm (inchworm): se sigue la cabeza. De pie, te doblas y caminas con las manos hasta que la cabeza llega a la
 *    línea del suelo (carga); cada flexión allí da más fuerza a la onda (×2-×4); vuelves andando con las manos y, de pie
 *    cerca de la salida, dispara y sale la onda (RepArena: iwStep).
 */
import { Vector3 } from 'three';
import type { Side } from '../input/hand-model.js';
import { VertDetector, type VertConfig, type VertEvent } from './vertical.js';
import type { StandEvent, StandInput } from './standing.js';
import { WARN_COL } from './standing.js';

/** Los de este detector. */
export const FLOOR_EX = ['dips', 'pushup', 'splank', 'superman', 'plank1', 'inchworm'];

/** El inchworm: la línea vale con la cabeza a 15 cm de ella (RepArena: IW_LINE). */
export const IW_LINE = 0.15;
/** Lo que se aleja la línea de donde empiezas: «Alcance del inchworm» o, sin él, según tu altura (RepArena: iwReachM). */
export const iwReach = (setting: number, standY: number): number => (setting > 0 ? Math.max(0.8, setting / 100) : clamp(standY * 0.8, 1.0, 1.6));

/** Lo que pide cada uno (de los ajustes; las bajadas, en cm). */
export interface FloorCfg {
  ex: string;
  dipDepth: number;
  pushDepth: number;
  splDrop: number;
  splHold: number;
  supRange: number;
  supHold: number;
  /** Superman: «Brazos estirados» ('no': no lo mira). */
  supArms: string;
  /** Inchworm: «Alcance» (cm; 0, según tu altura). */
  iwReach: number;
  perfectTime: number;
  powHold: number;
  powHoldInc: number;
  deepDrop: number;
  power: boolean;
}

export const floorDefaults = (ex = 'pushup'): FloorCfg => ({ ex, dipDepth: 15, pushDepth: 13, splDrop: 9, splHold: 3, supRange: 8, supHold: 2, supArms: 'yes', iwReach: 0, perfectTime: 1.2, powHold: 1.5, powHoldInc: 0.5, deepDrop: 0, power: true });

/** La muñeca de una mano apoyada en el suelo, en la plancha con un brazo: entre 2 y 30 cm (RepArena: PL_FLOOR). */
const PL_FLOOR: [number, number] = [0.02, 0.3];
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const fmtNum = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');
const POW_HEX = ['#3cf0c6', '#ffd166', '#ff8a3d', '#ff3cf0'];
const mkPl = () => ({ state: 'down' as 'down' | 'up', floor: 0.1, t0: 0, fired: false, dev: 0, lowT: 0, warned: false, lost: 0 });

export interface FloorInput extends StandInput {
  /** La cabeza: su giro (para saber hacia dónde mira el cuerpo, en el superman). */
  headQ: { x: number; y: number; z: number; w: number };
  /** ¿En plena oleada (no en el descanso)? */
  wave: boolean;
  /** El inchworm: dónde está tu cabeza en la arena (delante es −Z; la línea, en 0) y tu altura de pie. */
  iwZ: number;
  standY: number;
}

export class FloorDetector {
  readonly di = Object.assign(new VertDetector(), { awayT: 0 });
  readonly pu = Object.assign(new VertDetector(), { awayT: 0 });
  readonly sp = { state: 'hold' as 'hold' | 'low', ref: 0, t0: 0, sec: 0, dev: 0, awayT: 0, warnT: 0 };
  readonly su = { state: 'down' as 'down' | 'up' | 'top', ref: 0.2, t0: 0, awayT: 0, sec: 0, warnT: 0, peak: 0, lift: 0, armT: 0, stillT: 0, lo: 0.2, k: 0 };
  readonly pl = { ref: 0, awayT: 0, boost: 0, left: mkPl(), right: mkPl() };
  readonly plp = new VertDetector();
  readonly iw = { phase: 'stand' as 'stand' | 'out' | 'back', g: 0, max: 0, t0: 0, pu: 0, pow: 1, pst: 'up' as 'up' | 'down', ref: 0, flash: 0 };
  /** Lo que lleva de carga la bola del superman (0-1: el aguante arriba). */
  get supK(): number {
    return this.su.state === 'up' ? this.su.k : 0;
  }
  private out: StandEvent[] = [];
  private vEv: VertEvent[] = [];
  private v: VertConfig = { req: 0.13, start: 0.05, back: 0.035, partial: 0.06, perfectDur: 1.2, power: true, powHold: 1.5, powHoldInc: 0.5, deepDrop: 0 };
  private charged = false;
  private d = new Vector3();
  private u = new Vector3();

  /** Al calibrar: la altura de la cabeza en la postura y dónde se apoyan las manos (RepArena: calibrate). */
  reset(y: number, wrists: { left: number | null; right: number | null }): void {
    for (const d of [this.di, this.pu, this.plp]) d.reset(y);
    this.di.awayT = this.pu.awayT = 0;
    Object.assign(this.sp, { state: 'hold', ref: y, t0: 0, sec: 0, dev: 0, awayT: 0, warnT: 0 });
    Object.assign(this.su, { state: 'down', ref: y, lo: y, t0: 0, awayT: 0, sec: 0, warnT: 0, peak: y, lift: 0, armT: 0, stillT: 0, k: 0 });
    Object.assign(this.pl, { ref: y, awayT: 0, boost: 0 });
    for (const s of ['left', 'right'] as const) Object.assign(this.pl[s], mkPl(), wrists[s] !== null ? { floor: wrists[s] } : {});
    this.plp.state = 'up';
    Object.assign(this.iw, { phase: 'stand', g: 0, max: 0, t0: 0, pu: 0, pow: 1, pst: 'up', ref: 0, flash: 0 });
    this.charged = false;
  }

  update(t: number, dt: number, I: FloorInput, c: FloorCfg, out: StandEvent[]): void {
    this.out = out;
    const y = I.head.p.y, pt = c.perfectTime, ex = c.ex;
    if (ex === 'dips') {
      // fondos en silla: la cabeza baja al doblar los codos y sube al estirarlos
      const d = this.di, req = c.dipDepth / 100;
      if (y > d.ref + 0.4) {
        d.awayT += dt;
        if (d.awayT > 1.5 && I.play) this.say('Vuelve a la silla');
        d.state = 'up';
        return;
      }
      d.awayT = 0;
      this.vert(d, I, t, dt, req, Math.min(0.05, req * 0.5), 0.035, req * 0.5, pt, '¡Baja hasta los 90° de codo!', c, c.power, null);
    } else if (ex === 'splank') this.splank(t, dt, I, c);
    else if (ex === 'superman') this.superman(t, dt, I, c);
    else if (ex === 'plank1') this.plank1(t, dt, I, c);
    else if (ex === 'inchworm') this.inchworm(t, dt, I, c);
    else {
      const d = this.pu, req = c.pushDepth / 100;
      if (y > d.ref + 0.35) {
        d.awayT += dt;
        if (d.awayT > 1.5 && I.play) this.say('Vuelve a la plancha');
        d.state = 'up';
        return;
      }
      d.awayT = 0;
      this.vert(d, I, t, dt, req, Math.min(0.05, req * 0.5), 0.035, req * 0.5, pt, '¡Más abajo!', c, true, null);
    }
  }

  // ---------------------------------------------------------------- lo que pasa

  private say(msg: string, color = WARN_COL): void {
    this.out.push({ type: 'say', msg, color });
  }
  private charge(): void {
    this.charged = true;
    this.out.push({ type: 'charge' });
  }
  private rep(perfect: boolean, fast: boolean, pow: number, side: Side | null = null): void {
    this.charged = false;
    this.out.push({ type: 'rep', perfect, fast, pow, side });
  }
  private partial(msg: string): void {
    this.charged = false;
    this.out.push({ type: 'partial', msg });
  }

  // la bajada y subida de la cabeza (RepArena: vertDetector); defer: lo que hace la repetición en vez de disparar
  private vert(d: VertDetector, I: FloorInput, t: number, dt: number, req: number, start: number, back: number, partial: number, pt: number, msg: string, c: FloorCfg, power: boolean, defer: ((pow: number) => void) | null): void {
    const v = this.v, ev = this.vEv;
    Object.assign(v, { req, start, back, partial, perfectDur: pt, power, powHold: c.powHold, powHoldInc: c.powHoldInc, deepDrop: 0 });
    ev.length = 0;
    d.update(I.head.p.y, t, dt, I.head.speed, v, ev);
    for (const e of ev) {
      if (e.type === 'charge') this.charge();
      else if (e.type === 'power') {
        if (this.charged) this.out.push({ type: 'power', level: e.level, deep: e.deep });
      } else if (e.type === 'partial') this.partial(msg);
      else if (defer) {
        this.charged = false;
        defer(e.pow);
      } else this.rep(e.perfect, e.fast, e.pow);
    }
  }

  // plancha lateral: aguantar con la cadera arriba; cada splHold segundos seguidos, un disparo. Si la cabeza baja splDrop
  // desde tu postura, la cadera ha caído y el tiempo vuelve a empezar
  private splank(t: number, dt: number, I: FloorInput, c: FloorCfg): void {
    const P = this.sp, y = I.head.p.y, drop = c.splDrop / 100, hold = c.splHold;
    // el tiempo solo corre durante la oleada; en el descanso cambias de lado y se toma la nueva postura
    if (!I.wave) {
      P.t0 = t;
      P.sec = 0;
      P.dev = 0;
      P.state = 'hold';
      if (y < 1.0) P.ref += (y - P.ref) * Math.min(1, dt * 1.5);
      return;
    }
    if (y > P.ref + 0.4) {
      P.awayT += dt;
      if (P.awayT > 1.5 && I.play) this.say('Ponte en plancha lateral');
      P.t0 = t;
      P.sec = 0;
      return;
    }
    P.awayT = 0;
    P.warnT -= dt;
    if (P.state === 'hold') {
      if (Math.abs(y - P.ref) < drop * 0.5) P.ref += (y - P.ref) * Math.min(1, dt * 0.15);
      P.dev = Math.max(P.dev, Math.abs(y - P.ref));
      if (y < P.ref - drop) {
        P.state = 'low';
        if (t - P.t0 > 0.8) this.partial('¡Sube la cadera!');
      } else {
        const held = t - P.t0;
        if (held >= hold) {
          this.charge();
          this.rep(P.dev < drop * 0.4, false, 1);
          P.t0 = t;
          P.sec = 0;
          P.dev = 0;
        } else if (Math.floor(held) > P.sec) {
          P.sec = Math.floor(held);
          const left = Math.ceil(hold - held);
          if (left > 0) this.out.push({ type: 'say', msg: `Aguanta ${left}`, color: '#ffd166' });
        }
      }
    } else if (y > P.ref - drop * 0.5) {
      P.state = 'hold';
      P.t0 = t;
      P.sec = 0;
      P.dev = 0;
    }
  }

  // Superman: ¿hay alguna mano claramente recogida junto a la cabeza? (RepArena: armsBack)
  private armsBack(I: FloorInput, c: FloorCfg): boolean {
    if (c.supArms === 'no') return false;
    const q = I.headQ, d = this.d.copy(I.fwd).add(this.u.set(0, 1, 0).applyQuaternion(q as unknown as import('three').Quaternion));
    d.y = 0;
    if (d.lengthSq() < 1e-4) return false;
    d.normalize();
    for (const s of ['left', 'right'] as const) {
      const h = I.hands[s];
      if (h.ok && (h.wrist.x - I.head.p.x) * d.x + (h.wrist.z - I.head.p.z) * d.z < 0.15) return true;
    }
    return false;
  }

  // superman: tumbado boca abajo; subir el tronco con los brazos estirados y aguantar supHold segundos dispara. La
  // referencia es la altura de la cabeza tumbado: baja enseguida y sube despacio cuando no estás arriba
  private superman(t: number, dt: number, I: FloorInput, c: FloorCfg): void {
    const S = this.su, y = I.head.p.y, req = c.supRange / 100, hold = c.supHold;
    if (y > S.ref + 0.6) {
      S.awayT += dt;
      if (S.awayT > 1.5 && I.play) this.say('Túmbate boca abajo');
      S.state = 'down';
      S.peak = y;
      return;
    }
    S.awayT = 0;
    S.warnT -= dt;
    // quieto y sin subir el tronco: esa es tu altura tumbado
    S.stillT = I.head.speed < 0.05 ? S.stillT + dt : 0;
    if (S.state !== 'up') S.ref += (y - S.ref) * Math.min(1, dt * (y < S.ref ? 3 : y < S.ref + req * 0.5 ? 0.6 : S.state === 'down' && S.stillT > 1.2 ? 1.5 : 0));
    S.lo = Math.min(S.lo + (y - S.lo) * Math.min(1, dt * 0.5), y); // (lo más bajo de los últimos segundos)
    S.lift = Math.max(0, y - S.ref);
    if (S.state === 'down') {
      S.peak = Math.max(S.peak, y);
      // hay que subir de verdad: no basta con una referencia que se quedó baja
      if (y > S.ref + req && y - S.lo > req * 0.6) {
        S.state = 'up';
        S.t0 = t;
        S.sec = 0;
        S.armT = 0;
        S.peak = y;
        this.charge();
      } else if (y < S.ref + req * 0.3) {
        // subió pero no lo bastante: cuánto le faltó
        const got = S.peak - S.ref;
        if (got > req * 0.5 && I.play) this.say(`Sube un poco más: ${Math.round(got * 100)} de ${Math.round(req * 100)} cm`);
        S.peak = y;
      }
    } else if (S.state === 'up') {
      const held = t - S.t0;
      S.peak = Math.max(S.peak, y);
      S.k = clamp(held / Math.max(0.1, hold), 0, 1);
      if (y < S.ref + req * 0.6) {
        this.partial(`¡Aguanta ${fmtNum(hold)} s arriba!`);
        S.state = 'down';
        S.peak = y;
      } else {
        // manos recogidas durante un rato: el tiempo se para (un fallo suelto del seguimiento no cuenta)
        S.armT = this.armsBack(I, c) ? S.armT + dt : 0;
        if (S.armT > 0.4) {
          S.t0 += dt;
          if (S.warnT <= 0) {
            this.say('Estira los brazos');
            S.warnT = 1.5;
          }
        } else if (held >= hold) {
          this.rep(S.peak - S.ref >= req + 0.04, false, 1);
          S.state = 'top';
        } else if (Math.floor(held) > S.sec) {
          S.sec = Math.floor(held);
          const left = Math.ceil(hold - held);
          if (left > 0) this.out.push({ type: 'say', msg: `Aguanta ${left}`, color: '#ffd166' });
        }
      }
    } else if (y < S.ref + Math.max(0.03, req * 0.4)) {
      // tras disparar hay que volver a bajar
      S.state = 'down';
      S.peak = y;
    } else if (y < S.peak - req) {
      S.state = 'down';
      S.peak = y;
      S.ref = Math.max(S.ref, y - req * 0.3);
    }
  }

  // Inchworm: se sigue la cabeza (las gafas la ven siempre). De pie, te doblas y caminas con las manos hasta que la cabeza
  // llega a la línea del suelo: carga. En la plancha, cada flexión da más fuerza a la onda (×2, ×3, ×4). Vuelves andando
  // con las manos y, de pie cerca de la salida, dispara (y la partida saca la onda). Si te pones de pie sin llegar a la línea,
  // o lejos de la salida, no cuenta (RepArena: iwStep e iwHead)
  private inchworm(t: number, dt: number, I: FloorInput, c: FloorCfg): void {
    const W = this.iw, y = I.head.p.y, standing = y > I.standY - 0.22, S = iwReach(c.iwReach, I.standY) + 0.12, z1 = S - 0.25;
    const g = clamp((z1 - I.iwZ) / Math.max(0.2, z1 - IW_LINE), 0, 1);
    W.g = g;
    if (W.phase === 'stand' && !standing) {
      W.phase = 'out';
      W.max = 0;
      W.t0 = t;
    }
    if (W.phase === 'out') {
      W.max = Math.max(W.max, g);
      if (I.iwZ <= IW_LINE && y < I.standY * 0.6) {
        W.phase = 'back';
        Object.assign(W, { pu: 0, pow: 1, pst: 'up', ref: y, flash: 1 });
        this.charge();
      } else if (standing) {
        if (W.max > 0.35) this.partial('Camina con las manos hasta la línea del suelo');
        W.phase = 'stand';
      }
    } else if (W.phase === 'back' && !standing && I.iwZ <= IW_LINE + 0.3) {
      // en la plancha, al final del recorrido: cada flexión da más fuerza a la onda
      const pd = Math.max(0.05, (c.pushDepth / 100) * 0.8);
      if (W.pst === 'up') {
        W.ref = Math.max(W.ref - dt * 0.02, y);
        if (y < W.ref - pd) W.pst = 'down';
      } else if (y > W.ref - pd * 0.4) {
        W.pst = 'up';
        W.pu++;
        const p = Math.min(4, 1 + W.pu);
        if (p > W.pow) {
          W.pow = p;
          if (this.charged) this.out.push({ type: 'power', level: p, deep: false });
        }
      }
    } else if (W.phase === 'back' && standing) {
      // de pie otra vez: si has vuelto hasta la salida, dispara
      if (g < 0.45) {
        const dur = t - W.t0, pt = c.perfectTime;
        this.rep(dur >= Math.max(2, pt * 2), dur < 1.6, W.pow || 1);
      } else this.partial('Vuelve andando con las manos hasta la salida');
      W.phase = 'stand';
    }
  }

  // plancha con un brazo: la cabeza se mantiene a su altura de plancha; levantar un brazo dispara a su lado
  private plank1(t: number, dt: number, I: FloorInput, c: FloorCfg): void {
    const P = this.pl, y = I.head.p.y, LIFT = 0.18, pt = c.perfectTime;
    if (y > P.ref + 0.35) {
      P.awayT += dt;
      if (P.awayT > 1.5 && I.play) this.say('Vuelve a la plancha');
      return;
    }
    P.awayT = 0;
    if (Math.abs(y - P.ref) < 0.1) P.ref += (y - P.ref) * Math.min(1, dt * 0.15);
    const floorOf = (d: ReturnType<typeof mkPl>): number => clamp(d.floor, PL_FLOOR[0], PL_FLOOR[1]);
    const lifted = (s: Side): boolean => I.hands[s].ok && I.hands[s].wrist.y > floorOf(P[s]) + LIFT;
    // una flexión aguantada abajo carga ×2, ×3 y ×4; al subir, el próximo brazo que levantes lanza esa carga
    const Q = this.plp, req = c.pushDepth / 100;
    if (P.left.state === 'up' || P.right.state === 'up') {
      if (Q.state === 'down' && Q.charged && Q.pow > 1) P.boost = Math.max(P.boost || 0, Q.pow);
      Q.state = 'up';
      Q.ref = Math.max(Q.ref, y);
      Q.peak = y;
    } else if (c.power)
      this.vert(Q, I, t, dt, req, Math.min(0.05, req * 0.5), 0.035, req * 0.8, pt, '¡Más abajo para cargar!', c, true, (pow) => {
        if (pow > 1) {
          P.boost = Math.max(P.boost || 0, pow);
          this.out.push({ type: 'say', msg: `¡Carga ×${P.boost}! Levanta un brazo`, color: POW_HEX[P.boost - 1] });
        } else this.say('Aguanta abajo en la flexión para cargar');
      });
    for (const side of ['left', 'right'] as const) {
      const h = I.hands[side], d = P[side], other: Side = side === 'left' ? 'right' : 'left';
      if (!h.ok) {
        d.lost += dt;
        if (d.lost > 0.6) {
          d.state = 'down';
          d.fired = false;
        }
        continue;
      }
      d.lost = 0;
      const r = h.wrist.y;
      if (r < d.floor || d.state === 'down') d.floor = clamp(d.floor + (r - d.floor) * Math.min(1, r < d.floor ? 0.5 : dt * 0.3), PL_FLOOR[0], PL_FLOOR[1]); // (la muñeca apoyada)
      const fl = floorOf(d);
      if (d.state === 'down') {
        if (r > fl + LIFT && !lifted(other)) {
          d.state = 'up';
          d.t0 = t;
          d.fired = false;
          d.dev = 0;
          d.lowT = 0;
        } else if (r > fl + LIFT && lifted(other)) {
          if (I.play) this.say('Apoya bien la otra mano en el suelo');
        } else if (r > fl + LIFT * 0.5) {
          d.lowT = (d.lowT || 0) + dt;
          if (d.lowT > 0.7 && !d.warned) {
            d.warned = true;
            this.partial('Levanta más el brazo, a la altura del hombro');
          }
        } else {
          d.lowT = 0;
          d.warned = false;
        }
      } else {
        d.dev = Math.max(d.dev, Math.abs(y - P.ref));
        if (r < fl + LIFT * 0.5) d.state = 'down';
        else if (lifted(other)) d.fired = true; // (las dos manos arriba: esta subida ya no dispara)
        else if (!d.fired && t - d.t0 > 0.35) {
          d.fired = true;
          this.charge();
          this.rep(d.dev < 0.05 && pt > 0, false, P.boost || 1, side);
          P.boost = 0;
        }
      }
    }
  }
}
