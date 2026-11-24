/**
 * Las cuchillas de Arcos (RepArena XR, pedido del usuario: «hachas o cuchillas de cierto tamaño que se aproximan describiendo
 * distintos movimientos que obligan a agacharse, retirar el tronco a un lado, saltar…; su vuelo no puede ser ni simple ni
 * totalmente impredecible»). Son hojas de los kits que ya hay (el sable del Capitán, las espadas de los tiburones y el ancla de
 * la isla pirata, elegidas por el usuario: no hay hachas), a 85 cm y girando:
 *  - **La hélice** (`spin`): gira en horizontal a la altura de la cabeza: agacharse.
 *  - **La rueda** (`wheel`): gira de canto, como una sierra, y se planta cerca del centro: apartar el tronco a un lado.
 *  - **La rasante** (`sweep`): gira a ras del suelo: saltarla.
 * Cómo vuelan (ni simple ni imprevisible): entran desde un lado con una curva, ondulando y cabeceando mientras llegan, y en
 * el último tramo (`BLADE_SETTLE` s) se asientan en su sitio: se lee a tiempo, pero no desde lejos. Con la dificultad ondulan
 * más y, a veces, la rueda amaga: cambia de lado una vez, antes de asentarse.
 * Lógica pura, sin IWSDK (se prueba en tests/unit/arcs-blades.test.ts); la pinta src/modes/arcs/arcs-system.ts.
 */
import { arcJumpNeed } from './arc.js';
import { HEAD_TOP, type ArcsEnv } from './env.js';
import type { ObsFrame, ObsOutcome } from './obstacles.js';
import type { ArcSpec } from './patterns.js';

export type BladeKind = 'spin' | 'wheel' | 'sweep';
export const BLADE_KINDS: readonly BladeKind[] = ['spin', 'wheel', 'sweep'];
/** El radio de la hoja girando (m: una hoja de 85 cm, «de cierto tamaño»; con 1,4 m el usuario las veía descomunales), lo
 * que se asienta antes de llegar (s, de serie) y su giro (rad/s). */
export const BLADE_R = 0.42, BLADE_SETTLE = 1.3, BLADE_SPIN = 9;
/** La hélice: por debajo de lo alto de la cabeza (m, de menos a más difícil). La rueda: lo que hay que apartar la cabeza de
 * su plano (m). La rasante: su altura (m). */
export const SPIN_DROP: [number, number] = [0.16, 0.3], WHEEL_CLEAR = 0.22, SWEEP_Y = 0.28;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);

export class BladeCore {
  alive = true;
  judged = false;
  hit = false;
  t = 0;
  z: number;
  readonly speed: number;
  readonly tReach: number;
  /** Dónde está la hoja ahora (su centro, en la arena) y su giro (rad) y cabeceo (rad). */
  x = 0;
  y = 0;
  ang = 0;
  bank = 0;
  /** Dónde se asienta (x, y), de dónde entra (x) y cuánto ondula (m de lado y de alto). */
  xf = 0;
  yf = 0;
  private x0 = 0;
  private ampX = 0;
  private ampY = 0;
  private ph = 0;
  private ph2 = 0;
  private w = 0;
  private settleT = BLADE_SETTLE;
  /** El amago (la rueda): cuándo cambia de lado (s antes de llegar; 0, sin amago) y si ya lo hizo. */
  private feintAt = 0;
  private feinted = false;
  /** Lo más que subió la cabeza al pasar (m, para la rasante) y el pitido. */
  private maxUp = -9;
  private warnT = 0;
  private spinDir = 1;
  /** De qué lado sale (−1 izquierda, 1 derecha): el robot de ese lado la lanza. */
  from: -1 | 1 = 1;
  readonly frame: ObsFrame = { danger: false, beep: 0, whoosh: false, outcome: null };

  /** Sale al fondo de la pista a la velocidad de ahora; `hard`, lo difícil de la partida (de 0 a 1: `arxHard`). */
  constructor(readonly kind: BladeKind, env: ArcsEnv, speed: number, hard: number) {
    const rand = (a: number, b: number): number => a + env.rnd() * (b - a), side = env.rnd() < 0.5 ? -1 : 1;
    this.z = -env.arenaDepth + 0.9;
    this.speed = speed;
    this.tReach = Math.max(0.8, (env.head.z - this.z) / speed);
    this.settleT = BLADE_SETTLE - 0.25 * hard;
    this.ph = rand(0, Math.PI * 2);
    this.ph2 = rand(0, Math.PI * 2);
    this.w = rand(1.6, 2.4) + 0.8 * hard;
    this.spinDir = env.rnd() < 0.5 ? -1 : 1;
    // entra desde un lado (más abierto cuanto más difícil) y describe una curva hasta su sitio
    this.x0 = side * rand(0.6, 0.9 + 0.3 * hard);
    this.from = side < 0 ? -1 : 1;
    if (kind === 'spin') {
      const d = SPIN_DROP[0] + (SPIN_DROP[1] - SPIN_DROP[0]) * clamp(hard + rand(-0.2, 0.2), 0, 1);
      this.yf = env.calibRef + HEAD_TOP - d;
      this.xf = rand(-0.15, 0.15);
      this.ampX = 0.25 + 0.25 * hard;
      this.ampY = 0.12 + 0.1 * hard;
    } else if (kind === 'wheel') {
      // (se planta cerca del centro, algo hacia un lado: hay que llevar la cabeza al otro)
      this.xf = -side * rand(0.02, 0.14);
      this.yf = env.calibRef - 0.15;
      this.ampX = 0.3 + 0.3 * hard;
      this.ampY = 0.06;
      if (env.rnd() < 0.15 + 0.35 * hard) this.feintAt = this.settleT + rand(0.5, 0.9);
    } else {
      this.xf = rand(-0.12, 0.12);
      this.yf = SWEEP_Y;
      this.ampX = 0.3 + 0.2 * hard;
      this.ampY = 0.05;
    }
    this.place();
  }

  /** Lo que le falta para llegar (s). */
  get tau(): number {
    return Math.max(0, this.tReach - this.t);
  }

  /** Dónde va: su sitio, más la curva de entrada y el ondular, que se apagan al asentarse. */
  private place(): void {
    const tau = this.tau, e = smooth(clamp((tau - this.settleT) / 1.0, 0, 1)), k = clamp(this.t / Math.max(0.5, this.tReach - this.settleT), 0, 1);
    // (la curva de entrada: de su lado al sitio, con forma de S)
    const enter = (1 - smooth(k)) * (this.x0 - this.xf);
    const wob = Math.sin(this.ph + this.t * this.w), wob2 = Math.sin(this.ph2 + this.t * this.w * 1.7);
    this.x = this.xf + e * (enter + this.ampX * wob);
    this.y = Math.max(0.12, this.yf + e * this.ampY * wob2);
    // (cabecea hacia donde va, como algo lanzado)
    this.bank = clamp(-e * this.ampX * Math.cos(this.ph + this.t * this.w) * 0.6, -0.5, 0.5);
  }

  /** ¿La cabeza choca con la hoja tal como está ahora? */
  private bad(env: ArcsEnv): boolean {
    const H = env.head, top = H.y + HEAD_TOP;
    if (this.kind === 'spin') return top > this.y - 0.03 && Math.abs(H.x - this.x) < BLADE_R + 0.1;
    if (this.kind === 'wheel') return Math.abs(H.x - this.x) < WHEEL_CLEAR;
    return this.maxUp < arcJumpNeed(env) * 0.9 && Math.abs(H.x - this.x) < BLADE_R + 0.1;
  }

  /** Un fotograma. `live`: en partida (fuera, se juzga sin consecuencias). */
  update(dt: number, env: ArcsEnv, live: boolean): ObsFrame {
    const f = this.frame, H = env.head;
    f.beep = 0;
    f.whoosh = false;
    f.outcome = null;
    this.t += dt;
    this.z += this.speed * dt;
    this.ang += BLADE_SPIN * this.spinDir * dt;
    // el amago de la rueda: a su hora, el sitio pasa al otro lado (aún ondulando: se ve venir)
    if (this.feintAt && !this.feinted && this.tau <= this.feintAt) {
      this.feinted = true;
      this.xf = -this.xf;
    }
    this.place();
    const near = Math.abs(this.z - H.z) < 0.6;
    if (near) this.maxUp = Math.max(this.maxUp, H.y - env.calibRef);
    const bad = this.bad(env);
    f.danger = !this.judged && this.z < H.z && this.z > H.z - 2.4 && bad;
    if (f.danger && Math.abs(H.x) < 1) {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        const d = H.z - this.z;
        this.warnT = clamp(d * 0.18, 0.08, 0.4);
        f.beep = 1 + (2.4 - d) * 0.25;
      }
    }
    // (el silbido al pasar a tu lado)
    if (!this.judged && this.z > H.z - 1.2 && this.z - this.speed * dt <= H.z - 1.2) f.whoosh = true;
    if (!this.judged && Math.abs(this.z - H.z) < 0.15 && bad) this.hit = true;
    if (!this.judged && this.z > H.z + 0.15) {
      this.judged = true;
      f.outcome = this.resolve(env, live);
    }
    if (this.z > H.z + 3.5) this.alive = false;
    return f;
  }

  private resolve(env: ArcsEnv, live: boolean): ObsOutcome {
    const H = env.head, at = { x: H.x, y: H.y - 0.1, z: H.z - 0.6 };
    if (this.hit && live) {
      const say = this.kind === 'spin' ? '¡Agáchate!' : this.kind === 'wheel' ? `¡Aparta el tronco a la ${this.x > H.x ? 'izquierda' : 'derecha'}!` : '¡Salta!';
      return { kind: 'hit', hurt: true, rep: false, perfect: false, say: [say, '#ff3b5c', 1.3, true], sounds: ['metalHit'], electric: false, at };
    }
    return { kind: 'pass', hurt: false, rep: true, perfect: true, say: ['¡Esquivada!', '#3cf0c6', 0.9, false], sounds: ['whoosh', 'perfect'], electric: false, at };
  }
}

/**
 * Mete las cuchillas en la cola de la oleada (RepArena XR: la cola de RepArena no se toca; se le añaden): por cada hueco,
 * con «Cuchillas» % de probabilidad, una cuchilla al azar entre las tres; con la dificultad, a veces dos o tres seguidas de
 * clases distintas (una ráfaga).
 */
export function bladeMix(queue: ArcSpec[], env: ArcsEnv, hard: number): ArcSpec[] {
  const p = clamp((env.s('arcBlades') || 0) / 100, 0, 0.8);
  if (p <= 0) return queue;
  const out: ArcSpec[] = [];
  for (const q of queue) {
    out.push(q);
    if (env.rnd() >= p) continue;
    const n = env.rnd() < 0.25 + 0.35 * hard ? 2 + (env.rnd() < hard * 0.5 ? 1 : 0) : 1;
    let last = -1;
    for (let i = 0; i < n; i++) {
      let k = Math.floor(env.rnd() * BLADE_KINDS.length);
      if (k === last) k = (k + 1) % BLADE_KINDS.length;
      last = k;
      out.push({ kind: 'blade', blade: BLADE_KINDS[k], drop: 0, tilt: 0, hp: 1, gap: i < n - 1 ? 0.55 : 1 });
    }
  }
  return out;
}
