/**
 * La aventura en la cuerda del remo invertido (RepArena XR, elegida por el usuario: «A con tramos de B», como opción de
 * Barras; plan en docs/PLAN-BARRAS-CUERDA.md). Tumbado bajo las paralelas, mirando al cielo, cuelgas de una cuerda tendida en
 * una cuesta muy empinada sobre un cañón; cada remo te sube por ella, como en la Travesía (el impulso sale del ritmo de las
 * repeticiones) y, sin remar, **resbalas un poco hacia atrás** (pedido del usuario: «mínimamente»), nunca más allá de la
 * repisa de donde saliste. Cada tramo acaba en vertical (la chimenea: subes mirando a la salida, arriba, entre dos paredes
 * de roca) hasta una repisa: el tramo superado. Tumbado mirando arriba solo se ve bien lo que está casi encima: en la
 * chimenea, la repisa que te espera se ve sobre ti.
 *
 * Lógica pura, sin IWSDK: el recorrido (`RopeCourse`: la cuesta de cada punto, su altura y lo que avanza en horizontal), el
 * avance (`RopeRun`) y el paisaje de cada trozo (`ropeDecoPuts`: las paredes del cañón, los montes lejanos y las repisas, con
 * los modelos de los kits que ya hay). Lo pinta src/modes/bars/rope-scene.ts.
 *
 * Coordenadas del recorrido: `s`, lo que llevas de cuerda (m); `h`, lo que avanza en horizontal hacia lo alto de tu cabeza;
 * `y`, la altura; `u`, a un lado (a la derecha mirando hacia lo alto de tu cabeza, de pie en la cuerda).
 */
import { put, rockFit, type Put } from '../trek/plat/pieces.js';
import { trekRng } from '../trek/path.js';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

/** Los números de la cuerda:
 * - `perRep`: metros de cuerda que pide cada repetición del tramo (con «Repeticiones por oleada»).
 * - `v0`: la velocidad de un remo a su ritmo (m/s; a ese ritmo, unos `perRep` metros por remo), `vMax` la más alta.
 * - `repT`: el ritmo de un remo tranquilo (s, el de Barras: BAR_REP_T.row).
 * - `slide`: lo que resbalas sin remar (m/s, en lo más empinado), `slideAfter`: lo que tarda en empezar (s).
 * - `vert`: lo que se frena el avance en vertical (×; la chimenea pide más esfuerzo).
 * - `chimney`: el largo de la chimenea del final de cada tramo (m, como mucho; o un 35 % del tramo) y `ramp`, lo que tarda la
 *   cuesta en ponerse vertical y en volver (m).
 * - `flat`: la cuesta al empezar la ronda (rad) y lo que dura (m). */
export const ROPE = { perRep: 1.7, v0: 0.75, vMax: 1.6, repT: 2.6, slide: 0.1, slideAfter: 1.2, vert: 0.7, chimney: 14, ramp: 5, flat: 0.25, flatLen: 3.5 };
/** La cuesta de siempre (rad): entre unos 28° y 52°, con olas largas (nunca igual). */
const BASE = 0.7, WAVE1 = 0.15, WAVE2 = 0.06;
/** La chimenea, casi vertical (rad: 86°). */
const VERT = 1.5;
/** El paso de la tabla del recorrido (m) y lo que se prepara de más tras la última repisa (m: el paisaje de delante). */
const STEP = 0.25, TAIL = 140;
/** El trozo del paisaje (m de cuerda). */
export const ROPE_CHUNK = 8;

/** El recorrido de la ronda: la cuerda de todos los tramos, con sus repisas (`ends[i]`: dónde acaba el tramo i). */
export class RopeCourse {
  readonly ends: number[] = [];
  /** Las chimeneas (de dónde a dónde, en s). */
  readonly chimneys: [number, number][] = [];
  private readonly H: Float32Array;
  private readonly Y: Float32Array;
  private readonly T: Float32Array;
  readonly len: number;

  /** lens: el largo de cada tramo (m); seed: el azar de la ronda (las olas de la cuesta). */
  constructor(lens: number[], readonly seed = 1) {
    let s = 0;
    for (const L of lens) {
      const a = s;
      s += Math.max(6, L);
      this.ends.push(s);
      // (la chimenea, al final del tramo, hasta la repisa)
      this.chimneys.push([s - Math.min(ROPE.chimney, (s - a) * 0.35), s + 0.5]);
    }
    this.len = s + TAIL;
    const n = Math.ceil(this.len / STEP) + 2;
    this.H = new Float32Array(n);
    this.Y = new Float32Array(n);
    this.T = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = this.pitchRaw(i * STEP);
      this.T[i] = t;
      if (i > 0) {
        const tm = (this.T[i - 1] + t) / 2;
        this.H[i] = this.H[i - 1] + Math.cos(tm) * STEP;
        this.Y[i] = this.Y[i - 1] + Math.sin(tm) * STEP;
      }
    }
  }

  // La cuesta en s, de la fórmula: la de siempre, la chimenea encima y, al empezar, casi llana
  private pitchRaw(s: number): number {
    const ph = (this.seed % 97) * 0.37;
    let t = BASE + WAVE1 * Math.sin((TAU * s) / 70 + ph) + WAVE2 * Math.sin((TAU * s) / 29 + 2 * ph);
    for (const [a, b] of this.chimneys) {
      const d = s < a ? a - s : s > b ? s - b : 0;
      if (d < ROPE.ramp) t += (VERT - t) * smooth(1 - d / ROPE.ramp);
    }
    // (al empezar, casi llana: arrancas sin sobresaltos)
    if (s < ROPE.flatLen * 2) t += (ROPE.flat - t) * smooth(clamp(1 - (s - ROPE.flatLen) / ROPE.flatLen, 0, 1));
    return t;
  }

  private look(arr: Float32Array, s: number): number {
    const x = clamp(s, 0, this.len) / STEP, i = Math.min(arr.length - 2, Math.floor(x)), f = x - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }
  /** La cuesta en s (rad: 0, llano; π/2, vertical). */
  pitch(s: number): number {
    return this.look(this.T, s);
  }
  /** Lo que se ha avanzado en horizontal hasta s (m). */
  h(s: number): number {
    if (s < 0) return s * Math.cos(this.T[0]);
    return this.look(this.H, s);
  }
  /** La altura en s (m). */
  y(s: number): number {
    if (s < 0) return s * Math.sin(this.T[0]);
    return this.look(this.Y, s);
  }
  /** El tramo en que está s (el de la repisa siguiente). */
  wave(s: number): number {
    for (let i = 0; i < this.ends.length; i++) if (s < this.ends[i] - 1e-6) return i;
    return this.ends.length;
  }
  /** ¿Está s en una chimenea (vertical)? */
  inChimney(s: number): boolean {
    return this.pitch(s) > 1.2;
  }
}

/** Los sucesos del avance, para quien lo pinta y lo cuenta. */
export type RopeEv = { t: 'ledge'; wave: number } | { t: 'slip' } | { t: 'chimney'; on: boolean };

/** El avance por la cuerda: cada remo te empuja y, sin remar, resbalas un poco. */
export class RopeRun {
  s = 0;
  v = 0;
  private want = 0;
  private push = 0;
  private lastRep = 0;
  private idle = 0;
  private glide = 0;
  /** Dónde empezó el tramo (no se resbala más abajo) y dónde acaba (la repisa). */
  start = 0;
  end = 0;
  /** ¿Llegó a la repisa del tramo? */
  reached = true;
  private slipping = false;
  private inCh = false;
  readonly ev: RopeEv[] = [];

  constructor(readonly course: RopeCourse) {}

  /** Al empezar el tramo i: desde su repisa de salida hasta la siguiente. */
  startWave(i: number): void {
    this.start = i > 0 ? this.course.ends[i - 1] ?? 0 : 0;
    this.end = this.course.ends[i] ?? this.start + 20;
    this.s = Math.max(this.s, this.start);
    this.v = this.want = this.push = this.glide = 0;
    this.lastRep = 0;
    this.idle = 0;
    this.reached = false;
  }

  /** Un remo (now: el reloj, s): el impulso, según su ritmo (más rápido, más lejos), como en la Travesía. */
  rep(now: number, perfect: boolean, speedK = 1): void {
    if (this.reached) return;
    const gap = this.lastRep ? now - this.lastRep : ROPE.repT;
    this.lastRep = now;
    const kc = clamp(ROPE.repT / Math.max(0.6, gap), 0.6, 1.5);
    this.want = clamp(ROPE.v0 * kc * (perfect ? 1.1 : 1), 0.3, ROPE.vMax) * speedK;
    this.push = clamp(gap * 1.25, 1.8, 3.4);
    this.idle = 0;
  }

  /** Bajando con la carga aguantada arriba (×2-×4): un tirón de más, hacia arriba. */
  boost(p: number): void {
    if (!this.reached) this.glide += 0.5 * (p - 1);
  }

  /** Cada fotograma; playing: en el tramo, colgado y sin pausa (si no, quieto). */
  step(dt: number, playing: boolean): void {
    if (!playing || this.reached) {
      this.v = 0;
      return;
    }
    const C = this.course, th = C.pitch(this.s), vertK = 1 - (1 - ROPE.vert) * Math.sin(th) ** 4;
    this.push -= dt;
    this.idle += dt;
    if (this.push > 0) this.v += Math.sign(this.want * vertK - this.v) * Math.min(Math.abs(this.want * vertK - this.v), dt * 0.7);
    else {
      // sin remar: frena y, al rato, resbala un poco cuesta abajo (más cuanto más empinado)
      const slide = this.idle > ROPE.slideAfter ? -ROPE.slide * Math.sin(th) : 0;
      this.v += Math.sign(slide - this.v) * Math.min(Math.abs(slide - this.v), dt * 0.5);
    }
    let step = this.v * dt;
    if (this.glide > 0) {
      const g = Math.min(this.glide, dt * 1.5);
      this.glide -= g;
      step += g;
    }
    this.s = Math.max(this.start, this.s + step);
    if (this.s <= this.start && this.v < 0) this.v = 0;
    const slipping = this.v < -0.03;
    if (slipping && !this.slipping) this.ev.push({ t: 'slip' });
    this.slipping = slipping;
    const ch = C.inChimney(this.s);
    if (ch !== this.inCh) {
      this.inCh = ch;
      this.ev.push({ t: 'chimney', on: ch });
    }
    if (this.s >= this.end) {
      this.s = this.end;
      this.v = 0;
      this.reached = true;
      this.ev.push({ t: 'ledge', wave: C.wave(this.end - 0.01) });
    }
  }

  /** Lo que falta hasta la repisa (m). */
  get left(): number {
    return Math.max(0, this.end - this.s);
  }
}

/** Lo ancho que queda libre alrededor de la cuerda (m): las paredes, nunca más cerca. */
export const ROPE_CLEAR = 3;

/** El paisaje del trozo `chunk` (de `chunk·ROPE_CHUNK` a `(chunk + 1)·ROPE_CHUNK` m de cuerda): las paredes del cañón a los
 * dos lados (más cerca y más altas en la chimenea: un pozo), los montes lejanos y, si acaba un tramo, su repisa con el
 * cofre. Coordenadas: `ds` = h (hacia lo alto de tu cabeza), `u` a un lado, `y` la altura. */
export function ropeDecoPuts(C: RopeCourse, chunk: number, out: Put[]): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ Math.imul(C.seed | 0, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0);
  const between = (a: number, b: number): number => a + R() * (b - a);
  const s0 = chunk * ROPE_CHUNK, s1 = s0 + ROPE_CHUNK, h0 = C.h(s0), h1 = C.h(s1), y0 = C.y(s0), y1 = C.y(s1);
  const ch = C.inChimney((s0 + s1) / 2);
  // las paredes del cañón, a los dos lados: cada roca llena el trozo a lo largo (con algo de más, sin huecos) y de muy abajo
  // a bastante por encima de la cuerda
  for (const sd of [-1, 1]) {
    const near = ch ? between(ROPE_CLEAR, ROPE_CLEAR + 1) : between(4.5, 7), w = ch ? between(4, 6) : between(5, 8);
    const u0 = sd < 0 ? -near - w : near, u1 = sd < 0 ? -near : near + w;
    out.push(rockFit('island', 'Cliff4', u0, u1, Math.min(y0, y1) - between(10, 18), Math.max(y0, y1) + (ch ? between(10, 16) : between(4, 12)), h0 - between(1.5, 3), h1 + between(1.5, 3), R() < 0.5));
    // (alguna vez, un pino agarrado arriba de la pared)
    if (!ch && R() < 0.25) {
      const sc = between(0.6, 0.9);
      out.push(put('nature', R() < 0.5 ? 'Pine_4' : 'Pine_2', (h0 + h1) / 2, sd * (near + w * 0.4), Math.max(y0, y1) + between(3, 8), { ry: R() * TAU, sx: sc, sy: sc, sz: sc }));
    }
  }
  // los montes lejanos, a los lados (la sensación de altura)
  if (R() < 0.35) {
    const sd = R() < 0.5 ? -1 : 1, u = sd * between(28, 60), w = between(10, 22);
    out.push(rockFit('island', R() < 0.5 ? 'Cliff3' : 'Cliff4', u - w / 2, u + w / 2, y0 - between(40, 60), y0 + between(5, 35), h0 + between(-10, 10), h0 + between(-10, 10) + w, R() < 0.5));
  }
  // la repisa del final de cada tramo, en lo alto de la chimenea: una roca que sobresale a un lado de la cuerda (desde abajo,
  // sobre ti, la meta del tramo), con el cofre encima
  for (const e of C.ends) {
    if (e < s0 || e >= s1) continue;
    const he = C.h(e), ye = C.y(e), top = ye - 0.3;
    out.push(rockFit('island', 'Cliff1', 0.5, 4.5, top - 2.2, top, he - 2.4, he + 2.2));
    out.push(put('island', 'Chest_Closed', he, 2.5, top - 0.02, { ry: -Math.PI / 2, sx: 0.7, sy: 0.7, sz: 0.7 }));
  }
  return out;
}

/** Los modelos que usa el paisaje de la cuerda (para preparar sus instancias). */
export const ROPE_MODELS: { kit: 'island' | 'nature'; n: string; cap: number }[] = [
  { kit: 'island', n: 'Cliff4', cap: 90 },
  { kit: 'island', n: 'Cliff3', cap: 24 },
  { kit: 'island', n: 'Cliff1', cap: 8 },
  { kit: 'island', n: 'Chest_Closed', cap: 8 },
  { kit: 'nature', n: 'Pine_2', cap: 16 },
  { kit: 'nature', n: 'Pine_4', cap: 16 },
];
