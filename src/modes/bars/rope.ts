/**
 * La aventura en la cuerda del remo invertido (RepArena XR, elegida por el usuario: «A con tramos de B», como opción de
 * Barras; plan en docs/PLAN-BARRAS-CUERDA.md). Tumbado bajo las paralelas, mirando al cielo, cuelgas de un cable; cada remo es
 * un tirón que te sube por él y, sin remar, **resbalas un poco hacia atrás** (pedido del usuario: «mínimamente»), nunca más allá
 * del final del tramo anterior.
 *
 * **Un solo cable, del valle a la cima** (elegido por el usuario, opción A: la cuerda «hacía pliegues antinaturales» y las
 * plataformas no tenían sentido): un cable tenso, como el de un teleférico, de la estación del valle a la de la cima, sin
 * torres ni apoyos por el medio; su cuesta crece poco a poco (abajo, suave; arriba, empinada), como la comba de un cable de
 * verdad. Cada tramo acaba en **un cofre colgado del cable** y el último, en la estación de la cima.
 *
 * Debajo, **una montaña de abajo arriba** (rope-worlds.ts): el valle, el bosque, la garganta y la cima. **Todo nace de algo**
 * (opción 1 del usuario: las cascadas «parecían emerger de ninguna parte»): un manantial en la cima da un arroyo que cae por la
 * cabecera de la garganta; las cascadas de sus paredes vienen de arroyos que corren por lo alto; el río baja por la garganta y
 * el bosque y acaba en el lago del valle. **Nada flota**: el terreno (`ground`) es la ladera de la montaña, con el cauce del río y
 * la cubeta del lago, y cada árbol y cada roca se apoyan en él.
 *
 * Lógica pura, sin IWSDK: el recorrido (`RopeCourse`: la cuesta de cada punto, su altura, lo que avanza en horizontal, el
 * terreno y el agua), el avance (`RopeRun`) y lo que hay en cada trozo (`ropeDecoPuts`: árboles, plantas, rocas, cofres y
 * estaciones, con los modelos de los kits que ya hay). Lo pinta src/modes/bars/rope-scene.ts.
 *
 * Coordenadas del recorrido: `s`, lo que llevas de cuerda (m); `h`, lo que avanza en horizontal hacia donde subes (tus pies);
 * `y`, la altura; `u`, a un lado (a la derecha mirando hacia donde subes).
 */
import { layPole, put, rockFit, standPole, type Put } from '../trek/plat/pieces.js';
import { zoneNo, zoneWeight } from './rope-worlds.js';
import { trekRng } from '../trek/path.js';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

/** Los números de la cuerda:
 * - `perRep`: metros de cuerda que pide cada repetición del tramo (con «Repeticiones por oleada»).
 * - `slide`: lo que resbalas sin remar (m/s, en lo más empinado), `slideAfter`: lo que tarda en empezar (s).
 * - `vert`: lo que se frena el avance cuanto más empinado (×, en vertical; arriba pide más esfuerzo).
 * - `pitch`: la cuesta del cable al salir y al llegar a la cima (rad: de unos 25° a unos 48°; entre medias, crece poco a poco).
 * - `clear`: lo que queda, como poco, entre la cuerda y el suelo (m; salvo al llegar a las estaciones), y `treeU`: lo cerca de
 *   la cuerda que puede haber un árbol (a un lado). */
export const ROPE = { perRep: 1.7, slide: 0.1, slideAfter: 1.2, vert: 0.7, pitch: [0.44, 0.84] as [number, number], clear: 7, treeU: 9 };
/** Cada remo, un tirón (pedido del usuario: «tiene que notarse el impulso, con cierta inercia cuando baja; no un movimiento
 * constante»): la parte que se sube mientras tiras (`share`), lo pegado que va a los brazos (1/s) y lo que dura la inercia
 * al soltar (s: lleva el resto del remo mientras bajas y se apaga). */
export const PULL = { share: 0.7, follow: 12, glideT: 0.45 };
/** El paso de la tabla del cable (m), lo que hay de cable detrás de la salida (hasta la estación del valle) y pasada la llegada
 * (hasta la rueda de la estación de la cima), y el paso de la tabla del terreno (m en horizontal). */
const STEP = 0.25, START = 8, TOP = 3, GSTEP = 1;
/** El trozo del paisaje (m en horizontal). */
export const ROPE_CHUNK = 12;
/** Lo que mide la montaña como poco (m de cable): en una ronda más corta se sube solo su principio (el valle y el bosque) y la
 * estación de llegada queda en un mirador, con el resto de la montaña delante. */
const MOUNT = 110;
/** Lo hondo del fondo del valle a los lados (m). */
const VALLEY = 120;
/** La garganta: dónde empiezan sus paredes y dónde acaban (lo lejos de la cuerda, m) y lo que suben respecto al cable (m: algo
 * por debajo, para ver desde la cuerda los arroyos que corren por lo alto y caen en cascada). */
export const GORGE = { u0: 10, u1: 16, over: -3 };
/** La cabecera de la garganta (lo subido de la ronda, 0-1): ahí el terreno sube de golpe en una pared por la que cae el arroyo
 * de la cima; y lo que queda entre la cuerda y el suelo en cada punto de la subida (m: hondo sobre la garganta; al llegar,
 * poco: la estación de la cima está sobre la roca). */
export const HEAD_F = 0.75;
/** (`k`: unos 1,5 m de cable en la ronda: la pared de la cabecera mide lo mismo en una ronda corta que en una larga) */
const clrAt = (f: number, k: number): number => {
  const P: [number, number][] = [
    [-1, 10],
    [0, 10],
    [0.2, 15],
    [0.45, 17],
    [0.55, 26],
    [HEAD_F - k, 26],
    [HEAD_F + k, 14],
    [0.92, 9],
    [1, 4.2],
    [2, 4.2],
  ];
  for (let i = 1; i < P.length; i++)
    if (f <= P[i][0]) {
      const [a, ca] = P[i - 1], [b, cb] = P[i];
      return ca + (cb - ca) * smooth(a, b, f);
    }
  return 4.2;
};

/** La bruma de cada foto (el color de su horizonte) y lo espesa que es (la niebla de la escena: lo lejano se funde con la foto). */
export const ROPE_HAZE: Record<string, number> = { aldea: 0xd6e6ee, montana: 0xccd9e6, lago: 0xd2e8f2, cumbre: 0xd9e5ee, bosque: 0xcfdde8, ocaso: 0xe8b996 };
export const ROPE_FOG = 0.006;

/** Un punto del agua (en las coordenadas del recorrido): h, u y la altura de su superficie. */
export interface WaterPt {
  h: number;
  u: number;
  y: number;
}
/** Una cascada: dónde cae (h, u: su cara), de dónde a dónde (alturas), su ancho y hacia dónde mira su cara (rad: 0, hacia ti
 * —la de la cabecera—; ±π/2, hacia la cuerda desde un lado). */
export interface Fall {
  h: number;
  u: number;
  top: number;
  bot: number;
  w: number;
  face: number;
}
/** Un arroyo: su cauce (de su nacimiento a donde acaba) y su ancho (m). */
export interface Stream {
  pts: WaterPt[];
  w: number;
  /** Lo que ocupa (h desde, h hasta, u desde, u hasta: para no mirar todos sus puntos). */
  box?: [number, number, number, number];
}

/** El recorrido de la ronda: el cable entero, del valle a la cima (`ends[i]`: el final del tramo i, donde cuelga su cofre;
 * `top`, la llegada a la estación de la cima), su terreno y su agua. */
export class RopeCourse {
  readonly ends: number[] = [];
  /** La llegada (el final del último tramo) y el final del cable (la rueda de la estación de la cima). */
  readonly top: number;
  /** Lo que mide la montaña (m de cable: la ronda o, si es corta, `MOUNT`). */
  readonly mount: number;
  readonly len: number;
  /** La cuesta al salir y al llegar (rad). */
  readonly p0: number;
  readonly p1: number;
  private readonly H: Float32Array;
  private readonly Y: Float32Array;
  private readonly T: Float32Array;
  /** El terreno: la altura del suelo bajo la cuerda cada `GSTEP` m en horizontal, desde `g0`. */
  private readonly base: Float32Array;
  private readonly g0: number;
  /** El río (de la cascada de la cabecera al lago), el lago, las cascadas, los arroyos y los manantiales. */
  readonly river: WaterPt[] = [];
  readonly lake: { h: number; u: number; r: number; y: number };
  readonly falls: Fall[] = [];
  readonly streams: Stream[] = [];
  readonly springs: { h: number; u: number }[] = [];
  /** Dónde está la cabecera de la garganta (h: la pared por la que cae el arroyo de la cima). */
  readonly hHead: number;
  /** Hacia qué lado serpentea el río por el bosque y el valle (y dónde está el lago): −1, izquierda; 1, derecha. */
  readonly side: number;
  private readonly ph: number;
  private readonly rHead: number;
  private readonly rEnd: number;
  private readonly rY: Float32Array;

  /** lens: el largo de cada tramo (m); seed: el azar de la ronda (la cuesta, el río y el paisaje). */
  constructor(lens: number[], readonly seed = 1) {
    const R = trekRng((seed * 2654435761) >>> 0), between = (a: number, b: number): number => a + R() * (b - a);
    let acc = 0;
    for (const L of lens) this.ends.push((acc += Math.max(8, L)));
    this.top = acc;
    this.len = acc + TOP;
    this.mount = Math.max(acc, MOUNT);
    this.p0 = between(ROPE.pitch[0] - 0.03, ROPE.pitch[0] + 0.03);
    this.p1 = between(ROPE.pitch[1] - 0.04, ROPE.pitch[1] + 0.04);
    // el cable: su cuesta en cada punto (de la estación del valle a la de la cima) y, sumando, lo que avanza y lo que sube
    const n = Math.round((START + this.len) / STEP) + 1;
    this.H = new Float32Array(n);
    this.Y = new Float32Array(n);
    this.T = new Float32Array(n);
    for (let i = 0; i < n; i++) this.T[i] = this.pitchOf(-START + i * STEP);
    for (let i = 1; i < n; i++) {
      const th = (this.T[i - 1] + this.T[i]) / 2;
      this.H[i] = this.H[i - 1] + STEP * Math.cos(th);
      this.Y[i] = this.Y[i - 1] + STEP * Math.sin(th);
    }
    // (que la salida, s = 0, quede en h = 0 y y = 0)
    const i0 = Math.round(START / STEP), h0 = this.H[i0], y0 = this.Y[i0];
    for (let i = 0; i < n; i++) {
      this.H[i] -= h0;
      this.Y[i] -= y0;
    }
    // el terreno bajo la cuerda: nunca baja al subir (el río corre siempre cuesta abajo), con lo que queda de la cuerda en cada
    // punto (clrAt); pasada la estación de la cima, sube hasta el pico y, detrás de la del valle, el fondo del valle, casi llano
    this.g0 = this.h(-START) - 90;
    const hEnd = this.h(this.len), ng = Math.ceil((hEnd + 160 - this.g0) / GSTEP) + 1;
    this.base = new Float32Array(ng);
    const M = this.mount, kc = 1.5 / M, hS = this.h(-START), yS = this.y(-START) - clrAt(-START / M, kc), hT = this.h(this.top);
    this.hHead = this.h(M * HEAD_F);
    let last = -1e9, bT = NaN;
    for (let i = 0; i < ng; i++) {
      const h = this.g0 + i * GSTEP;
      let b: number;
      if (h < hS) b = yS - (hS - h) * 0.06;
      else if (h <= hT) {
        const s = this.sAt(h);
        // (y al llegar, el suelo sube hasta la estación)
        b = this.y(s) - Math.min(clrAt(s / M, kc), 4.2 + (this.top - s) * 0.6);
      } else {
        if (Number.isNaN(bT)) bT = last;
        b = bT + Math.min(h - hT, 45) * 0.55;
      }
      last = Math.max(last, b);
      this.base[i] = last;
    }
    // el río: nace al pie de la cascada de la cabecera de la garganta y baja (por la garganta, por el centro; por el bosque y
    // el valle, serpenteando por un lado) hasta el lago del valle
    this.side = R() < 0.5 ? -1 : 1;
    this.ph = between(0, TAU);
    const hL = this.h(M * 0.1), uL = this.side * 34, RL = 16;
    // (sin garganta en la ronda —una ronda corta—, el lago lo alimenta un arroyo que nace en el bosque)
    const gorge = this.hHead + 10 < hT;
    this.rHead = gorge ? this.hHead - 3.4 : hL;
    this.rEnd = hL + RL * 0.55;
    const nr = gorge ? Math.max(2, Math.ceil((this.rHead - this.rEnd) / 1.5) + 1) : 0;
    this.rY = new Float32Array(nr);
    let ry = Infinity;
    for (let k = nr - 1; k >= 0; k--) {
      const h = this.rEnd + ((this.rHead - this.rEnd) * k) / (nr - 1), u = this.riverU(h, hL, uL, RL);
      ry = Math.min(ry, this.rawGround(h, u) - 0.35);
      this.rY[k] = ry;
    }
    for (let k = 0; k < nr; k++) {
      const h = this.rEnd + ((this.rHead - this.rEnd) * k) / (nr - 1);
      this.river.push({ h, u: this.riverU(h, hL, uL, RL), y: this.rY[k] });
    }
    this.lake = { h: hL, u: uL, r: RL, y: gorge ? this.rY[0] : this.rawGround(hL, uL) - 1 };
    // (al llegar al lago, el río baja a su nivel antes de su orilla: nunca por encima de ella)
    for (const p of this.river) {
      const dl = Math.hypot(p.h - hL, p.u - uL);
      if (dl < RL + 16) p.y = Math.min(p.y, this.lake.y + Math.max(0, dl - RL) * 0.12);
    }
    if (!gorge) {
      const sp = { h: hL + Math.max(35, (hT - hL) * 0.8), u: uL * 0.6 };
      this.springs.push(sp);
      this.addStream({ pts: this.creekDown(sp.h, sp.u, hL + RL * 0.8, uL * 0.92, 1.8), w: 1.8 });
      return;
    }
    // las cascadas: la de la cabecera (el arroyo del manantial de la cima cae por su pared al río) y las de las paredes de la
    // garganta (cada una, de un arroyo que corre por lo alto), que bajan hasta el río por el fondo
    // (la de la cabecera, delante de la pared de roca, de cara a ti; el arroyo le llega por lo alto, del manantial de la cima)
    const headU = this.river[this.river.length - 1].u, headTop = this.groundAt(this.hHead + 3, headU);
    this.falls.push({ h: this.rHead + 0.15, u: headU, top: headTop + 0.25, bot: this.river[this.river.length - 1].y, w: 5, face: 0 });
    const src = { h: this.hHead + 28, u: headU + (R() < 0.5 ? -1 : 1) * between(9, 15) };
    this.springs.push(src);
    const head = this.creek(src.h, src.u, this.hHead + 2.6, headU, 2.2);
    head.push({ h: this.rHead + 0.2, u: headU, y: headTop + 0.3 }); // (por encima de la roca, hasta el borde)
    this.addStream({ pts: head, w: 2.2 });
    const gA = this.h(this.top * 0.52), gB = this.rHead - 6;
    for (let h = gA + between(2, 6), sd = R() < 0.5 ? -1 : 1, k = 0; h < gB && k < 5; h += between(9, 15), sd = -sd, k++) {
      const top = this.groundAt(h, sd * (GORGE.u1 + 1)), at = this.riverAt(h);
      if (!at || top - at.y < 8) continue;
      const lip = sd * (GORGE.u0 - 0.35);
      this.falls.push({ h, u: lip, top: top - 0.1, bot: this.groundAt(h, lip) - 0.2, w: between(2.2, 3.4), face: sd < 0 ? Math.PI / 2 : -Math.PI / 2 });
      const sp = { h: h + between(-6, 6), u: sd * (GORGE.u1 + between(16, 24)) };
      this.springs.push(sp);
      this.addStream({ pts: this.creek(sp.h, sp.u, h, sd * (GORGE.u1 - 0.5), 1.6), w: 1.6 });
      // (y al pie, el agua corre por el fondo hasta el río)
      this.addStream({ pts: this.creek(h, sd * (GORGE.u0 - 0.8), h - 1.5, at.u + sd * 2, 1.4), w: 1.4 });
    }
  }

  /** La cuesta del cable en s (rad): de `p0` a `p1`, creciendo poco a poco, como la comba de un cable tenso. */
  private pitchOf(s: number): number {
    return this.p0 + (this.p1 - this.p0) * Math.pow(clamp(s / this.mount, 0, 1), 1.15);
  }
  // lo de s en la tabla (cada STEP m de cable)
  private look(arr: Float32Array, s: number): number {
    const x = (s + START) / STEP, n = arr.length;
    if (x <= 0) return arr[0];
    if (x >= n - 1) return arr[n - 1];
    const i = Math.floor(x), f = x - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }
  /** La cuesta en s (rad: 0, llano; π/2, vertical). */
  pitch(s: number): number {
    return this.look(this.T, s);
  }
  /** Lo que se ha avanzado en horizontal hasta s (m; fuera del cable, siguiendo su cuesta). */
  h(s: number): number {
    if (s < -START) return this.H[0] + (s + START) * Math.cos(this.T[0]);
    if (s > this.len) return this.H[this.H.length - 1] + (s - this.len) * Math.cos(this.T[this.T.length - 1]);
    return this.look(this.H, s);
  }
  /** La altura en s (m). */
  y(s: number): number {
    if (s < -START) return this.Y[0] + (s + START) * Math.sin(this.T[0]);
    if (s > this.len) return this.Y[this.Y.length - 1] + (s - this.len) * Math.sin(this.T[this.T.length - 1]);
    return this.look(this.Y, s);
  }
  /** Lo que llevas de cable cuando has avanzado h en horizontal (lo contrario de `h`). */
  sAt(h: number): number {
    const H = this.H, n = H.length;
    if (h <= H[0]) return -START + (h - H[0]) / Math.cos(this.T[0]);
    if (h >= H[n - 1]) return this.len + (h - H[n - 1]) / Math.cos(this.T[n - 1]);
    let a = 0, b = n - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (H[m] <= h) a = m;
      else b = m;
    }
    return -START + (a + (h - H[a]) / Math.max(1e-6, H[b] - H[a])) * STEP;
  }
  /** Lo subido de la montaña en h (0, la salida; 1, la cima): de qué zona es. */
  fracAt(h: number): number {
    return this.sAt(h) / this.mount;
  }
  /** El tramo en que está s (el del cofre siguiente). */
  wave(s: number): number {
    for (let i = 0; i < this.ends.length; i++) if (s < this.ends[i] - 1e-6) return i;
    return this.ends.length;
  }

  // el suelo bajo la cuerda en h (de la tabla)
  private baseAt(h: number): number {
    const x = (h - this.g0) / GSTEP, n = this.base.length;
    if (x <= 0) return this.base[0] + x * GSTEP * 0.06;
    if (x >= n - 1) return this.base[n - 1];
    const i = Math.floor(x), f = x - i;
    return this.base[i] + (this.base[i + 1] - this.base[i]) * f;
  }
  // la ladera sin el agua: a los lados baja hacia el fondo del valle; en la garganta, sus dos paredes; en la cima, una cresta
  private rawGround(h: number, u: number): number {
    const f = this.fracAt(h), b = this.baseAt(h), au = Math.abs(u);
    const drop = au <= 120 ? 0.2 * au + 0.0015 * au * au : Math.min(VALLEY, 45.6 + 0.08 * (au - 120));
    // (las paredes crecen poco a poco al entrar en la garganta —una ladera, no un escalón— y acaban en la pared de la cabecera)
    const wg = smooth(0.36, 0.54, f) * (1 - smooth(this.hHead - 4, this.hHead - 1, h)), ws = zoneWeight(3, f);
    let side = -drop * (1 - wg) * (1 + 0.4 * ws);
    if (wg > 0) {
      // (las paredes: suben de golpe hasta por encima del cable y, por arriba, una meseta que baja poco a poco)
      const wall = this.y(this.sAt(h)) + GORGE.over - b;
      side += wg * (wall * smooth(GORGE.u0, GORGE.u1, au) - Math.max(0, au - 45) * 0.2);
    }
    return b + side - 0.6 * (1 + Math.sin(h * 0.21 + u * 0.13) * Math.sin(u * 0.07 - h * 0.05));
  }
  // por dónde va el río en h: por la garganta, por el centro (serpenteando un poco); por el bosque y el valle, por un lado, y
  // al final, hacia el lago
  private riverU(h: number, hL: number, uL: number, RL: number): number {
    const f = this.fracAt(h), wg = smooth(0.42, 0.54, f);
    const side = this.side * (16 + 6 * Math.sin(h * 0.05 + this.ph)), mid = 2.5 * Math.sin(h * 0.11 + this.ph);
    const u = side + (mid - side) * wg;
    return u + (uL - u) * smooth(hL + RL + 30, hL + RL * 0.4, h);
  }
  /** El río en h (null: allí no hay). */
  riverAt(h: number): WaterPt | null {
    const R = this.river;
    if (!R.length || h < R[0].h || h > R[R.length - 1].h) return null;
    const x = ((h - R[0].h) / (R[R.length - 1].h - R[0].h)) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x)), f = x - i;
    return { h, u: R[i].u + (R[i + 1].u - R[i].u) * f, y: R[i].y + (R[i + 1].y - R[i].y) * f };
  }
  /** El suelo en (h, u) (m): la ladera, con el cauce del río y la cubeta del lago. */
  ground(h: number, u: number): number {
    return this.groundAt(h, u);
  }
  private groundAt(h: number, u: number): number {
    let g = this.rawGround(h, u);
    // el lago: su cubeta y, alrededor, una orilla llana algo por encima del agua
    const L = this.lake;
    let dl = 1e9;
    if (L) {
      dl = Math.hypot(h - L.h, u - L.u);
      if (dl < L.r + 16) {
        const k = dl / L.r, gl = dl < L.r ? L.y - 1.8 * (1 - k * k) + 0.3 * k ** 4 : L.y + 0.3 + 0.02 * (dl - L.r) ** 2;
        g += (gl - g) * smooth(L.r + 16, L.r + 5, dl);
      }
    }
    // el cauce del río: a lo ancho, llano como su orilla (también donde baja hacia el lago), y hundido bajo el agua
    const r = this.river.length ? this.riverAt(h) : null;
    if (r) {
      const d = Math.abs(u - r.u);
      if (d < 8) {
        const band = this.rawGround(h, r.u) + 0.05 * d * d;
        g += (band - g) * smooth(8, 4, d) * (L ? smooth(L.r * 0.9, L.r + 4, dl) : 1);
        g = Math.min(g, r.y - 0.6 + 0.08 * d * d);
      }
    }
    // los arroyos: un cauce poco hondo bajo su agua
    for (const S of this.streams) {
      const B = S.box;
      if (!B || h < B[0] || h > B[1] || u < B[2] || u > B[3]) continue;
      for (const p of S.pts) {
        const d = Math.hypot(p.h - h, p.u - u);
        if (d < S.w * 1.6) g = Math.min(g, p.y - 0.25 + (0.3 * d * d) / (S.w * S.w));
      }
    }
    return g;
  }
  // un arroyo más (con su caja, para el cauce)
  private addStream(S: Stream): void {
    const m = S.w * 1.6;
    S.box = [Math.min(...S.pts.map((p) => p.h)) - m, Math.max(...S.pts.map((p) => p.h)) + m, Math.min(...S.pts.map((p) => p.u)) - m, Math.max(...S.pts.map((p) => p.u)) + m];
    this.streams.push(S);
  }
  // un arroyo de (ha, ua) a (hb, ub), serpenteando un poco, por encima del suelo (sin cauce hondo: corre por su superficie)
  private creek(ha: number, ua: number, hb: number, ub: number, w: number): WaterPt[] {
    const n = Math.max(3, Math.ceil(Math.hypot(hb - ha, ub - ua) / 1.2)), pts: WaterPt[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, wob = Math.sin(t * Math.PI) * Math.sin(t * 9 + ha) * w * 0.8;
      const dh = hb - ha, du = ub - ua, L = Math.hypot(dh, du) || 1;
      const h = ha + dh * t - (du / L) * wob, u = ua + du * t + (dh / L) * wob;
      pts.push({ h, u, y: this.groundAt(h, u) + 0.07 });
    }
    return pts;
  }
  // un arroyo que baja por la ladera (de su nacimiento hasta el lago): su agua, siempre cuesta abajo, en su cauce
  private creekDown(ha: number, ua: number, hb: number, ub: number, w: number): WaterPt[] {
    const pts = this.creek(ha, ua, hb, ub, w);
    let y = Infinity;
    for (const p of pts) {
      y = Math.min(y, p.y);
      p.y = y;
    }
    return pts;
  }
  /** ¿Hay agua (el río, el lago, un arroyo) a menos de `m` metros de (h, u)?  /** ¿Hay agua (el río, el lago, un arroyo) a menos de `m` metros de (h, u)? (para no poner árboles ni rocas en ella) */
  wet(h: number, u: number, m: number): boolean {
    const r = this.riverAt(h);
    if (r && Math.abs(u - r.u) < 2.4 + m) return true;
    if (Math.hypot(h - this.lake.h, u - this.lake.u) < this.lake.r + m) return true;
    for (const S of this.streams) for (const p of S.pts) if (Math.abs(p.h - h) < S.w + m && Math.abs(p.u - u) < S.w + m) return true;
    return false;
  }
  /** ¿Está (h, u) en la cara de una pared de la garganta o de la cabecera (empinado, cubierto de roca)? */
  steep(h: number, u: number): boolean {
    const f = this.fracAt(h), au = Math.abs(u);
    if (smooth(0.36, 0.54, f) > 0.05 && h < this.hHead && au > GORGE.u0 - 1 && au < GORGE.u1 + 2.5) return true;
    return h > this.hHead - 4 && h < this.hHead + 3 && au < 26;
  }
}

/** Los sucesos del avance, para quien lo pinta y lo cuenta. */
export type RopeEv = { t: 'ledge'; wave: number } | { t: 'slip' } | { t: 'zone'; k: number };

/** El avance por la cuerda: cada remo te empuja y, sin remar, resbalas un poco. */
export class RopeRun {
  s = 0;
  /** La velocidad de ahora (m/s; negativa, resbalando): sale de los tirones, no la manda el ritmo. */
  v = 0;
  /** Lo que falta por subir del tirón de ahora (m: se sube enseguida, pegado a los brazos), la inercia al soltar (m/s, que se
   * apaga sola) y hasta dónde has tirado en este remo (0-1: lo que ya ha contado). */
  private owe = 0;
  private glideV = 0;
  private fMax = 0;
  /** ¿Ya contó el remo de ahora? (hasta volver abajo; sin seguir el tirón —las pruebas—, cada remo cuenta entero) */
  private repDone = false;
  private idle = 0;
  private slideV = 0;
  /** Dónde empezó el tramo (no se resbala más abajo) y dónde acaba (su cofre, colgado del cable; el último, la estación de la
   * cima). */
  start = 0;
  end = 0;
  /** Hasta dónde se puede subir (m de cuerda: el jefe corta el paso; Infinity, sin límite). Ahí, ni se sube ni se resbala. */
  hold = Infinity;
  /** ¿Llegó al final del tramo? */
  reached = true;
  private slipping = false;
  private zone = 0;
  readonly ev: RopeEv[] = [];

  constructor(readonly course: RopeCourse) {}

  /** Al empezar el tramo i: desde el final del anterior (su cofre) hasta el suyo. */
  startWave(i: number): void {
    this.start = i > 0 ? this.course.ends[i - 1] ?? 0 : 0;
    this.end = this.course.ends[i] ?? this.start + 20;
    this.s = Math.max(this.s, this.start);
    this.v = this.owe = this.glideV = this.fMax = this.slideV = 0;
    this.repDone = false;
    this.idle = 0;
    this.reached = false;
  }

  /** Lo que da de sí un remo aquí (m): en la subida vertical, algo menos. */
  private reach(k: number): number {
    const th = this.course.pitch(this.s);
    return ROPE.perRep * k * (1 - (1 - ROPE.vert) * Math.sin(th) ** 4);
  }

  /** Cada fotograma, lo que llevas tirado de este remo (`f`, 0-1: el pecho desde abajo hasta la barra; 0 abajo): mientras
   * tiras, subes con los brazos (pedido del usuario: «cuando hace un remo, tiene que notarse el impulso», no una marcha
   * continua). Bajar no te devuelve: lo subido, subido queda. */
  pull(f: number): void {
    if (this.reached) return;
    if (f <= 0.02) {
      this.fMax = 0;
      this.repDone = false;
      return;
    }
    if (f > this.fMax) {
      this.owe += (Math.min(1, f) - this.fMax) * this.reach(PULL.share);
      this.fMax = Math.min(1, f);
      this.idle = 0;
    }
  }

  /** Un remo completo (arriba): lo que faltara del tirón y la inercia al soltar, que te lleva un poco más mientras bajas y se
   * apaga sola. Bien hecho, algo más; `speedK`, la «Velocidad» del jugador. (`now`, el reloj: no hace falta, el ritmo sale
   * solo de cuántos tirones das.) */
  rep(_now: number, perfect: boolean, speedK = 1): void {
    if (this.reached) return;
    const k = (perfect ? 1.1 : 1) * speedK, f0 = this.repDone ? 0 : this.fMax;
    this.owe += (1 - f0) * this.reach(PULL.share);
    this.fMax = 1;
    this.repDone = true;
    this.glideV += this.reach(k - PULL.share) / PULL.glideT;
    this.idle = 0;
  }

  /** Un reto fallado: frenas a la mitad (como en la Travesía) y lo que llevabas de tirón se pierde a medias. */
  stumble(): void {
    this.v *= 0.5;
    this.owe *= 0.5;
    this.glideV *= 0.5;
  }

  /** Bajando con la carga aguantada arriba (×2-×4): un tirón de más, hacia arriba. */
  boost(p: number): void {
    if (!this.reached) this.glideV += (0.5 * (p - 1)) / PULL.glideT;
  }

  /** Cada fotograma; playing: en el tramo, colgado y sin pausa (si no, quieto). */
  step(dt: number, playing: boolean): void {
    if (!playing || this.reached || dt <= 0) {
      this.v = 0;
      return;
    }
    const C = this.course, th = C.pitch(this.s);
    this.idle += dt;
    // el tirón, pegado a los brazos (un pelín detrás: no da saltos), y la inercia, que se apaga sola
    const pay = this.owe * (1 - Math.exp(-dt * PULL.follow));
    this.owe -= pay;
    let step = pay + this.glideV * dt;
    this.glideV *= Math.exp(-dt / PULL.glideT);
    if (this.glideV < 0.01) this.glideV = 0;
    // sin remar: al rato, resbala un poco cuesta abajo (más cuanto más empinado), arrancando suave
    const still = this.owe < 0.005 && this.glideV === 0;
    const slide = still && this.idle > ROPE.slideAfter && this.s < this.hold - 0.05 ? -ROPE.slide * Math.sin(th) : 0;
    this.slideV += Math.sign(slide - this.slideV) * Math.min(Math.abs(slide - this.slideV), dt * 0.5);
    if (!still) this.slideV = 0;
    step += this.slideV * dt;
    this.s = Math.max(this.start, this.s + step);
    this.v = step / dt;
    if (this.s >= this.hold) {
      // (el jefe corta el paso: quieto delante de él)
      this.s = this.hold;
      this.v = Math.min(0, this.v);
      this.owe = this.glideV = 0;
    }
    if (this.s <= this.start && this.slideV < 0) this.slideV = this.v = 0;
    const slipping = this.v < -0.03;
    if (slipping && !this.slipping) this.ev.push({ t: 'slip' });
    this.slipping = slipping;
    // (al pasar a otra zona de la montaña: el bosque, la garganta, la cima)
    const z = zoneNo(this.s / C.mount);
    if (z !== this.zone) {
      if (z > this.zone) this.ev.push({ t: 'zone', k: z });
      this.zone = z;
    }
    if (this.s >= this.end) {
      this.s = this.end;
      this.v = 0;
      this.reached = true;
      this.ev.push({ t: 'ledge', wave: C.wave(this.end - 0.01) });
    }
  }

  /** Lo que falta hasta el final del tramo (m). */
  get left(): number {
    return Math.max(0, this.end - this.s);
  }
}


/** El cofre de cada tramo, colgado del cable (pedido del usuario: sin plataformas): a un lado de las paralelas (no tropieza con
 * las manos), por debajo del cable, colgado de un brazo. `u`, a qué lado (m); `drop`, lo que cuelga su base bajo el cable (m);
 * `size`, su escala. */
export const CHEST = { u: 0.95, drop: 0.72, size: 0.55 };
/** Las estaciones: la del valle (donde sales) y la de la cima (donde acabas): su plataforma (ancho y largo, m), lo que queda
 * bajo el cable (m) y sus postes. */
export const STATION = { w: 3.2, d: 3.4, deck: 1.15, post: 0.9 };
const NONE: ReadonlySet<number> = new Set();

/** Dónde está el cofre del tramo i (en las coordenadas del recorrido: u, y de su base, h). El último, en la plataforma de la
 * estación de la cima. */
export function chestAt(C: RopeCourse, i: number): [number, number, number] {
  const s = C.ends[i] ?? C.top;
  if (i >= C.ends.length - 1) return [STATION.w / 2 - 0.5, C.y(C.top) - STATION.deck + 0.02, C.h(C.top) + 0.6];
  return [CHEST.u, C.y(s) - CHEST.drop, C.h(s)];
}
/** Dónde está la boca del cofre del tramo i: de ahí salen sus premios. */
export function chestMouth(C: RopeCourse, i: number): [number, number, number] {
  const [u, y, h] = chestAt(C, i);
  return [u, y + 0.45, h];
}

/** El paisaje del trozo `chunk` (de `chunk·ROPE_CHUNK` a `(chunk + 1)·ROPE_CHUNK` m en horizontal): lo de su zona de la montaña
 * (rope-worlds.ts; en el paso de una a otra, mezclado), los cofres colgados del cable y las estaciones. Por zonas, no
 * salpicado: los árboles, en bosquecillos; las flores, en el prado; las rocas, al pie de los cortados y en las orillas; nada en
 * el agua ni en las paredes; todo apoyado en el suelo (nada flota). Lo que se ve a la vez (unos 16 trozos) no pide más a la
 * gráfica que el bosque de Combate (unos 50 árboles y 50 plantas). Coordenadas: `ds` = h, `u` a un lado, `y` la altura. */
export function ropeDecoPuts(C: RopeCourse, chunk: number, out: Put[], opened: ReadonlySet<number> = NONE): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ Math.imul(C.seed | 0, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0);
  const between = (a: number, b: number): number => a + R() * (b - a);
  const pick = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(R() * l.length))];
  const h0 = chunk * ROPE_CHUNK, h1 = h0 + ROPE_CHUNK, side = (): number => (R() < 0.5 ? -1 : 1);
  /** Algo apoyado en el suelo en (h, u), con su pie un poco hundido (`sink`); nunca en el agua, en una pared ni bajo la cuerda
   * (los árboles, a `ROPE.treeU` como poco). */
  const onGround = (kit: 'nature' | 'island', n: string, h: number, u: number, sc: number, sink: number, tree = false): boolean => {
    if (Math.abs(u) < (tree ? ROPE.treeU : 3) || C.wet(h, u, tree ? 3 : 1) || C.steep(h, u)) return false;
    if (h > C.h(C.top) - 6 && h < C.h(C.len) + 6 && Math.abs(u) < 8) return false; // (la estación de la cima)
    out.push(put(kit, n, h, u, C.ground(h, u) - sink, { ry: R() * TAU, sx: sc, sy: sc, sz: sc }));
    return true;
  };
  /** La zona de un punto (en el paso de una a otra, al azar según lo que pesa cada una: se mezclan). */
  const zoneAtH = (h: number): number => {
    const f = C.fracAt(h);
    let r = R();
    for (let k = 0; k < 4; k++) {
      r -= zoneWeight(k, f);
      if (r <= 0) return k;
    }
    return zoneNo(f);
  };
  // un bosquecillo a cada lado del trozo (su centro), y lo que lo rodea
  for (const sd of [-1, 1]) {
    const gh = between(h0, h1), z = zoneAtH(gh);
    if (z === 0) {
      // el valle: algún bosquecillo de árboles de hoja en los bordes del prado, y flores y hierba alta en el prado
      if (R() < 0.6) {
        const cu = sd * between(26, 70);
        for (let i = 0; i < 3; i++) onGround('nature', pick(['CommonTree_3', 'CommonTree_5', 'CommonTree_4']), gh + between(-5, 5), cu + between(-6, 6), between(1, 1.5), 0.15, true);
      }
      for (let i = 0; i < 3; i++) onGround('nature', pick(['Flower_3_Group', 'Bush_Common_Flowers', 'Clover_1', 'Flower_3_Group']), between(h0, h1), sd * between(4, 40), between(1.2, 2.2), 0.05);
    } else if (z === 1) {
      // el bosque: pinares cerrados (con claros entre uno y otro), helechos y setas a su sombra
      for (let g = 0; g < (R() < 0.5 ? 2 : 1); g++) {
        const cu = sd * between(ROPE.treeU + 4, 50), ch = g ? between(h0, h1) : gh;
        for (let i = 0; i < 5; i++) onGround('nature', R() < 0.9 ? pick(['Pine_2', 'Pine_4', 'Pine_5']) : 'DeadTree_1', ch + between(-6, 6), cu + between(-7, 7), between(1, 1.6), 0.15, true);
        onGround('nature', pick(['Fern_1', 'Fern_1', 'Mushroom_Common', 'Bush_Common']), ch + between(-6, 6), cu + between(-8, 8), between(0.7, 1.1), 0.05);
      }
      onGround('nature', pick(['Grass_Common_Tall', 'Fern_1']), between(h0, h1), sd * between(5, 25), between(0.8, 1.3), 0.05);
    } else if (z === 2) {
      // la garganta: pinos sueltos en lo alto, a los lados (por encima de las paredes)
      if (R() < 0.7) onGround('nature', pick(['Pine_2', 'Pine_4', 'Pine_5']), gh, sd * between(GORGE.u1 + 5, 45), between(0.9, 1.4), 0.15, true);
      onGround('nature', pick(['Grass_Wispy_Tall', 'Bush_Common']), between(h0, h1), sd * between(GORGE.u1 + 3, 30), between(1, 1.6), 0.05);
    } else {
      // la cima: roca y hierba rala; algún árbol seco o un pino pequeño, retorcido por el viento
      onGround('nature', pick(['Grass_Wispy_Tall', 'Grass_Wispy_Tall', 'Grass_Common_Short']), between(h0, h1), sd * between(4, 30), between(1.4, 2.4), 0.05);
      if (R() < 0.35) onGround('nature', pick(['DeadTree_1', 'DeadTree_2', 'Pine_5']), gh, sd * between(ROPE.treeU, 40), between(0.6, 0.9), 0.15, true);
      if (R() < 0.5) {
        const sc = between(1.2, 2.4);
        onGround('nature', pick(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), between(h0, h1), sd * between(6, 40), sc, 0.3 * sc);
      }
      // (peñas: grandes rocas que asoman de la ladera, hundidas en ella)
      if (R() < 0.45) {
        const h = between(h0, h1), u = sd * between(14, 45), w = between(3, 6), g = Math.min(C.ground(h - w / 2, u), C.ground(h + w / 2, u), C.ground(h, u - w / 2), C.ground(h, u + w / 2));
        if (!C.wet(h, u, w) && !C.steep(h, u)) out.push(rockFit('island', R() < 0.5 ? 'Cliff1' : 'Cliff3', u - w / 2, u + w / 2, g - 1.2, g + between(1.5, 3.5), h - w / 2, h + w / 2, R() < 0.5));
      }
    }
    // una roca medio enterrada, de vez en cuando (en el bosque y el valle)
    if (z < 2 && R() < 0.3) {
      const sc = between(0.6, 1.2);
      onGround('nature', pick(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), between(h0, h1), sd * between(6, 45), sc, 0.3 * sc);
    }
  }
  // la orilla del río: rocas y hierba alta junto al agua (fuera de ella)
  const rh = between(h0, h1), r = C.riverAt(rh);
  if (r && R() < 0.7) {
    const sd = side(), u = r.u + sd * between(3.2, 4.5), sc = between(0.5, 0.9);
    if (R() < 0.5) onGround('nature', pick(['Rock_Medium_1', 'Rock_Medium_3']), rh, u, sc, 0.3 * sc);
    else onGround('nature', 'Grass_Common_Tall', rh, u, between(1.4, 2), 0.05);
  }
  // las paredes de la garganta: roca de arriba abajo, a los dos lados (lejos de la cuerda: no agobian), y en la cabecera, la pared
  // por la que cae el arroyo de la cima
  const hm = (h0 + h1) / 2, fm = C.fracAt(hm);
  if (smooth(0.36, 0.54, fm) > 0.6 && hm < C.hHead - 4) {
    for (const sd of [-1, 1]) {
      const floor = C.ground(hm, sd * GORGE.u0), top = C.ground(hm, sd * (GORGE.u1 + 1));
      if (top - floor < 3) continue;
      // (dos capas: la de abajo, al pie, y la de arriba, más atrás, hasta el borde de la meseta: la pared entera es de roca)
      const lo: [number, number] = [GORGE.u0 - 0.4, GORGE.u0 + 5], hi: [number, number] = [GORGE.u0 + 2.5, GORGE.u1 + 3];
      for (const [a, b, y0, y1] of [[...lo, floor - 1, floor + (top - floor) * between(0.55, 0.75)], [...hi, floor + (top - floor) * 0.3, top + 0.3]] as [number, number, number, number][])
        out.push(rockFit('island', 'Cliff4', sd < 0 ? -b : a, sd < 0 ? -a : b, y0, y1, h0 - between(1.5, 3), h1 + between(1.5, 3), R() < 0.5));
    }
  }
  const hHead = C.hHead;
  if (hHead >= h0 && hHead < h1) {
    const lo = C.ground(hHead - 3.2, 0), hi = C.ground(hHead + 3, 0);
    for (let u = -24; u < 24; u += 8) out.push(rockFit('island', 'Cliff4', u, u + 8.5, lo - 1, hi + 0.2, hHead - 3, hHead + 2.5, u % 16 === 0));
  }
  // los manantiales: de entre unas rocas nace cada arroyo
  for (const S of C.springs)
    if (S.h >= h0 && S.h < h1)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + 0.5, sc = between(0.7, 1.1), h = S.h + Math.cos(a) * 2.2, u = S.u + Math.sin(a) * 2.2;
        out.push(put('nature', pick(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), h, u, C.ground(h, u) - 0.3 * sc, { ry: a, sx: sc, sy: sc, sz: sc }));
      }
  // los cofres colgados del cable (el último, en la estación de la cima) y las estaciones
  for (let i = 0; i < C.ends.length; i++) {
    const [u, y, h] = chestAt(C, i);
    if (h >= h0 && h < h1) out.push(put('island', opened.has(i) ? 'Chest_Gold' : 'Chest_Closed', h, u, y, { ry: -Math.PI / 2, sx: CHEST.size, sy: CHEST.size, sz: CHEST.size }));
  }
  for (const [s, top] of [[-6, false], [C.top, true]] as [number, boolean][]) {
    const h = C.h(s);
    if (h >= h0 && h < h1) stationPuts(C, s, top, out);
  }
  return out;
}

/** Una estación: su plataforma de tablas bajo el cable (a tu lado: llegas junto a ella), sus postes hasta el suelo y el pórtico
 * con la rueda donde acaba (o empieza) el cable. */
function stationPuts(C: RopeCourse, s: number, top: boolean, out: Put[]): void {
  const h = C.h(s), y = C.y(s), deck = y - STATION.deck, u0 = -STATION.w / 2, hc = h + (top ? STATION.d / 2 - 0.6 : -STATION.d / 2 + 0.6);
  out.push(put('island', 'Dock', hc, 0.0117, deck - 0.488 * 0.5, { sx: STATION.w / 1.98448, sy: 0.5, sz: STATION.d / 2.08129 }));
  for (const u of [u0 + 0.2, -u0 - 0.2])
    for (const dh of [-STATION.d / 2 + 0.2, STATION.d / 2 - 0.2]) {
      const g = C.ground(hc + dh, u);
      if (deck - g > 0.2) out.push(standPole(hc + dh, u, g - 0.4, deck - g + 0.4, STATION.post));
    }
  // el pórtico: dos postes y un travesaño por encima del cable, en el extremo de la plataforma
  const hp = top ? C.h(C.len) : C.h(-8), yp = C.y(top ? C.len : -8) + 0.6;
  for (const u of [-1.3, 1.3]) {
    const g = Math.min(C.ground(hp, u), deck);
    out.push(standPole(hp, u, g - 0.4, yp - g + 0.4, 1.1));
  }
  out.push(layPole(hp, 0, yp, 2.9, 0.9));
}

/** Los modelos que usa el paisaje de la cuerda (para preparar sus instancias). */
export const ROPE_MODELS: { kit: 'island' | 'nature'; n: string; cap: number }[] = [
  { kit: 'nature', n: 'CommonTree_3', cap: 30 },
  { kit: 'nature', n: 'CommonTree_4', cap: 30 },
  { kit: 'nature', n: 'CommonTree_5', cap: 30 },
  { kit: 'nature', n: 'Pine_2', cap: 40 },
  { kit: 'nature', n: 'Pine_4', cap: 40 },
  { kit: 'nature', n: 'Pine_5', cap: 40 },
  { kit: 'nature', n: 'DeadTree_1', cap: 20 },
  { kit: 'nature', n: 'DeadTree_2', cap: 12 },
  { kit: 'nature', n: 'Fern_1', cap: 30 },
  { kit: 'nature', n: 'Bush_Common', cap: 20 },
  { kit: 'nature', n: 'Bush_Common_Flowers', cap: 30 },
  { kit: 'nature', n: 'Flower_3_Group', cap: 50 },
  { kit: 'nature', n: 'Clover_1', cap: 30 },
  { kit: 'nature', n: 'Mushroom_Common', cap: 20 },
  { kit: 'nature', n: 'Grass_Common_Tall', cap: 40 },
  { kit: 'nature', n: 'Grass_Common_Short', cap: 30 },
  { kit: 'nature', n: 'Grass_Wispy_Tall', cap: 50 },
  { kit: 'nature', n: 'Rock_Medium_1', cap: 30 },
  { kit: 'nature', n: 'Rock_Medium_2', cap: 30 },
  { kit: 'nature', n: 'Rock_Medium_3', cap: 30 },
  { kit: 'island', n: 'Cliff4', cap: 80 },
  { kit: 'island', n: 'Cliff1', cap: 16 },
  { kit: 'island', n: 'Cliff3', cap: 16 },
  { kit: 'island', n: 'Dock_Pole', cap: 24 },
  { kit: 'island', n: 'Dock', cap: 4 },
  { kit: 'island', n: 'Chest_Closed', cap: 12 },
  { kit: 'island', n: 'Chest_Gold', cap: 12 },
];
