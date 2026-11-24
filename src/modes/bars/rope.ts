/**
 * La aventura en la cuerda del remo invertido (RepArena XR, elegida por el usuario: «A con tramos de B», como opción de
 * Barras; la escena, la A de los bocetos: torres sobre un valle alpino; plan en docs/PLAN-BARRAS-CUERDA.md). Tumbado bajo las
 * paralelas, mirando al cielo, cuelgas de un cable tendido de torre en torre por la ladera de un valle; cada remo te sube por
 * él, como en la Travesía (el impulso sale del ritmo de las repeticiones) y, sin remar, **resbalas un poco hacia atrás**
 * (pedido del usuario: «mínimamente»), nunca más allá de la plataforma de donde saliste.
 *
 * Como una tirolina de verdad (pedido del usuario: «nunca tiene esas curvas»): cada tramo es **un cable recto y tenso**, con
 * su cuesta fija y una comba leve, de la plataforma de una torre a la siguiente; al llegar a ella, **lo último, en vertical**
 * por una cuerda fija junto a la torre, hasta su plataforma (el tramo superado). Tumbado mirando arriba, en esa subida se ve la
 * plataforma sobre ti. **Nada flota**: el terreno (`ground`) es una ladera que baja hacia el valle a los lados, las torres
 * apoyan en él sus patas y cada árbol, su tronco.
 *
 * Lógica pura, sin IWSDK: el recorrido (`RopeCourse`: la cuesta de cada punto, su altura, lo que avanza en horizontal, las
 * torres y el terreno), el avance (`RopeRun`) y lo que hay en cada trozo (`ropeDecoPuts`: árboles, piedras, torres y montes
 * lejanos, con los modelos de los kits que ya hay). Lo pinta src/modes/bars/rope-scene.ts.
 *
 * Coordenadas del recorrido: `s`, lo que llevas de cuerda (m); `h`, lo que avanza en horizontal hacia lo alto de tu cabeza;
 * `y`, la altura; `u`, a un lado (a la derecha mirando hacia lo alto de tu cabeza, de pie en la cuerda).
 */
import { put, rockFit, standPole, tiltPole, type Put } from '../trek/plat/pieces.js';
import type { RopeWorldKey } from './rope-worlds.js';
import { trekRng } from '../trek/path.js';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

/** Los números de la cuerda:
 * - `perRep`: metros de cuerda que pide cada repetición del tramo (con «Repeticiones por oleada»).
 * - `v0`: la velocidad de un remo a su ritmo (m/s; a ese ritmo, unos `perRep` metros por remo), `vMax` la más alta.
 * - `repT`: el ritmo de un remo tranquilo (s, el de Barras: BAR_REP_T.row).
 * - `slide`: lo que resbalas sin remar (m/s, en lo más empinado), `slideAfter`: lo que tarda en empezar (s).
 * - `vert`: lo que se frena el avance en vertical (×; la subida por la cuerda fija pide más esfuerzo).
 * - `pitch`: la cuesta de los cables (rad: de 30° a 42°); `sag`: su comba (del largo del cable).
 * - `vLen`: lo que se sube en vertical al final de cada tramo (m, de 3 a 7; un 25 % del tramo).
 * - `clear`: lo que queda, como poco, entre la cuerda y el suelo (m), y `treeU`: lo cerca que puede haber un árbol (a un lado). */
export const ROPE = { perRep: 1.7, v0: 0.75, vMax: 1.6, repT: 2.6, slide: 0.1, slideAfter: 1.2, vert: 0.7, pitch: [0.52, 0.73] as [number, number], sag: 0.009, vLen: [3, 7] as [number, number], clear: 7, treeU: 9 };
/** El paso de la tabla del recorrido (m), lo que se redondea cada esquina (muestras a cada lado: la cuerda pasa por una polea)
 * y lo que se prepara de más tras la última plataforma (m: el paisaje de delante). */
const STEP = 0.25, ROUND = 5, TAIL = 140;
/** El trozo del paisaje (m en horizontal). */
export const ROPE_CHUNK = 12;
/** Pasada la última torre, lo que sigue subiendo la ladera hasta la cima (m en horizontal), y lo hondo del fondo del valle
 * bajo la ladera, a los lados (m). */
const SUMMIT = 150, VALLEY = 120;

/** La bruma de cada foto (el color de su horizonte) y lo espesa que es (la niebla de la escena: lo lejano se funde con la foto). */
export const ROPE_HAZE: Record<string, number> = { aldea: 0xd6e6ee, montana: 0xccd9e6, lago: 0xd2e8f2, cumbre: 0xd9e5ee, bosque: 0xcfdde8, ocaso: 0xe8b996 };
export const ROPE_FOG = 0.006;

/** Una torre: dónde está (h), lo alto de su plataforma (`top`), su pie en el suelo (`base`) y dónde empieza la subida vertical
 * junto a ella (`vert`; en la de salida, nada). */
export interface RopeTower {
  h: number;
  top: number;
  base: number;
  vert: number;
}

/** El recorrido de la ronda: el cable de todos los tramos, de torre en torre (`ends[i]`: la plataforma del tramo i). */
export class RopeCourse {
  readonly ends: number[] = [];
  readonly towers: RopeTower[] = [];
  /** Las subidas verticales (de dónde a dónde, en s). */
  readonly verts: [number, number][] = [];
  private readonly S: Float32Array;
  private readonly H: Float32Array;
  private readonly Y: Float32Array;
  private readonly T: Float32Array;
  readonly len: number;

  /** lens: el largo de cada tramo (m); seed: el azar de la ronda (las cuestas, las torres y el paisaje). */
  constructor(lens: number[], readonly seed = 1) {
    const R = trekRng((seed * 2654435761) >>> 0), between = (a: number, b: number): number => a + R() * (b - a);
    // los puntos de la cuerda sin redondear, cada STEP m: cada tramo, un cable recto (con su comba) y la subida vertical
    const ph: number[] = [0], py: number[] = [0], endIdx: number[] = [], vertIdx: [number, number][] = [];
    let h = 0, y = 0;
    this.towers.push({ h: 0, top: 0, base: -between(10, 13), vert: 0 });
    const cable = (L: number, th: number): void => {
      const n = Math.max(1, Math.round(L / STEP)), dh = L * Math.cos(th), dy = L * Math.sin(th), sag = ROPE.sag * L;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        ph.push(h + dh * t);
        py.push(y + dy * t - 4 * sag * t * (1 - t));
      }
      h += dh;
      y += dy;
    };
    for (const L0 of lens) {
      const L = Math.max(8, L0), Lv = clamp(L * 0.25, ROPE.vLen[0], ROPE.vLen[1]);
      cable(L - Lv, between(ROPE.pitch[0], ROPE.pitch[1]));
      const v0 = ph.length - 1, n = Math.round(Lv / STEP);
      for (let k = 1; k <= n; k++) {
        ph.push(h);
        py.push(y + k * STEP);
      }
      const vBot = y;
      y += n * STEP;
      vertIdx.push([v0, ph.length - 1]);
      endIdx.push(ph.length - 1);
      this.towers.push({ h, top: y, base: y - (y - vBot) - between(8, 12), vert: vBot });
    }
    // (detrás de la última plataforma, más cable: el paisaje de delante)
    cable(TAIL, (ROPE.pitch[0] + ROPE.pitch[1]) / 2);
    // las esquinas, redondeadas (la cuerda pasa por una polea en cada torre: sin tirones al cambiar de cuesta)
    const n = ph.length, sh = new Float32Array(n), sy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0, b = 0, c = 0;
      for (let k = -ROUND; k <= ROUND; k++) {
        const j = clamp(i + k, 0, n - 1);
        a += ph[j];
        b += py[j];
        c++;
      }
      sh[i] = i < ROUND ? ph[i] : a / c;
      sy[i] = i < ROUND ? py[i] : b / c;
    }
    this.S = new Float32Array(n);
    this.T = new Float32Array(n);
    for (let i = 1; i < n; i++) this.S[i] = this.S[i - 1] + Math.hypot(sh[i] - sh[i - 1], sy[i] - sy[i - 1]);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      this.T[i] = Math.atan2(sy[b] - sy[a], sh[b] - sh[a]);
    }
    this.H = sh;
    this.Y = sy;
    for (const i of endIdx) this.ends.push(this.S[i]);
    for (const [a, b] of vertIdx) this.verts.push([this.S[a], this.S[b]]);
    this.len = this.S[n - 1];
  }

  // lo de s en la tabla (no uniforme: las esquinas redondeadas acortan un poco)
  private look(arr: Float32Array, s: number): number {
    const S = this.S, n = S.length;
    if (s <= 0) return arr[0];
    if (s >= S[n - 1]) return arr[n - 1];
    let i = Math.min(n - 2, Math.floor(s / STEP));
    while (i > 0 && S[i] > s) i--;
    while (i < n - 2 && S[i + 1] < s) i++;
    const f = (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]);
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }
  /** La cuesta en s (rad: 0, llano; π/2, vertical). */
  pitch(s: number): number {
    return this.look(this.T, s);
  }
  /** Lo que se ha avanzado en horizontal hasta s (m). */
  h(s: number): number {
    return s < 0 ? s * Math.cos(this.T[0]) : this.look(this.H, s);
  }
  /** La altura en s (m). */
  y(s: number): number {
    return s < 0 ? s * Math.sin(this.T[0]) : this.look(this.Y, s);
  }
  /** El tramo en que está s (el de la plataforma siguiente). */
  wave(s: number): number {
    for (let i = 0; i < this.ends.length; i++) if (s < this.ends[i] - 1e-6) return i;
    return this.ends.length;
  }
  /** ¿Está s en una subida vertical? */
  inChimney(s: number): boolean {
    return this.pitch(s) > 1.2;
  }
  /** El suelo en (h, u): la ladera, de pie de torre a pie de torre, que baja hacia el valle a los dos lados (m). */
  ground(h: number, u: number): number {
    const T = this.towers;
    let g: number;
    if (h <= T[0].h) g = T[0].base - (T[0].h - h) * 0.6;
    else {
      let i = 0;
      while (i < T.length - 2 && T[i + 1].h < h) i++;
      const a = T[i], b = T[i + 1] ?? a;
      // (pasada la última torre, la ladera sigue con la cuesta de los cables hasta la cima, y arriba, llano)
      g = h > b.h ? b.base + Math.min(h - b.h, SUMMIT) * Math.tan((ROPE.pitch[0] + ROPE.pitch[1]) / 2) : a.base + ((b.base - a.base) * (h - a.h)) / Math.max(1e-3, b.h - a.h);
    }
    // (los dos lados bajan al valle —cada vez más suave, hasta su fondo, a lo lejos— y la ladera ondula un poco: nunca hacia
    // arriba de la cuerda)
    const au = Math.abs(u), drop = au <= 120 ? 0.2 * au + 0.0015 * au * au : Math.min(VALLEY, 45.6 + 0.08 * (au - 120));
    return g - drop - 0.6 * (1 + Math.sin(h * 0.21 + u * 0.13) * Math.sin(u * 0.07 - h * 0.05));
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
  /** Dónde empezó el tramo (no se resbala más abajo) y dónde acaba (la plataforma de la torre). */
  start = 0;
  end = 0;
  /** Hasta dónde se puede subir (m de cuerda: el jefe corta el paso; Infinity, sin límite). Ahí, ni se sube ni se resbala. */
  hold = Infinity;
  /** ¿Llegó a la plataforma del tramo? */
  reached = true;
  private slipping = false;
  private inCh = false;
  readonly ev: RopeEv[] = [];

  constructor(readonly course: RopeCourse) {}

  /** Al empezar el tramo i: desde la plataforma de salida hasta la siguiente. */
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

  /** Un reto fallado: frenas a la mitad (como en la Travesía) y lo que llevabas de tirón se pierde. */
  stumble(): void {
    this.v *= 0.5;
    this.want *= 0.5;
    this.glide = 0;
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
      const slide = this.idle > ROPE.slideAfter && this.s < this.hold - 0.05 ? -ROPE.slide * Math.sin(th) : 0;
      this.v += Math.sign(slide - this.v) * Math.min(Math.abs(slide - this.v), dt * 0.5);
    }
    let step = this.v * dt;
    if (this.glide > 0) {
      const g = Math.min(this.glide, dt * 1.5);
      this.glide -= g;
      step += g;
    }
    this.s = Math.max(this.start, this.s + step);
    if (this.s >= this.hold) {
      // (el jefe corta el paso: quieto delante de él)
      this.s = this.hold;
      this.v = Math.min(0, this.v);
      this.glide = 0;
    }
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

  /** Lo que falta hasta la plataforma (m). */
  get left(): number {
    return Math.max(0, this.end - this.s);
  }
}

/** El paisaje del trozo `chunk` (de `chunk·ROPE_CHUNK` a `(chunk + 1)·ROPE_CHUNK` m en horizontal) en el mundo `world`
 * (rope-worlds.ts): sus árboles y piedras en la ladera (siempre apoyados en el suelo y lejos de la cuerda), lo suyo (las paredes
 * y las cascadas de la garganta, las palmeras y el barco de la costa) y las torres que haya en él (con su plataforma y su
 * cofre). Los montes lejanos, los de la foto de fondo. `seaY`: el nivel del mar (la costa; nada por debajo). Coordenadas:
 * `ds` = h, `u` a un lado, `y` la altura. */
export function ropeDecoPuts(C: RopeCourse, chunk: number, out: Put[], opened: ReadonlySet<number> = NONE, world: RopeWorldKey = 'alps', seaY = -1e9, shipH = NaN): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ Math.imul(C.seed | 0, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0);
  const between = (a: number, b: number): number => a + R() * (b - a);
  const pick = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(R() * l.length))];
  const h0 = chunk * ROPE_CHUNK, h1 = h0 + ROPE_CHUNK, side = (): number => (R() < 0.5 ? -1 : 1);
  /** Algo apoyado en el suelo, en (h, u): su pie, un poco hundido (`sink`); en la costa, solo si está por encima del mar. */
  const onGround = (kit: 'nature' | 'island', n: string, h: number, u: number, sc: number, sink: number): void => {
    const g = C.ground(h, u);
    if (g < seaY + 0.4) return;
    out.push(put(kit, n, h, u, g - sink, { ry: R() * TAU, sx: sc, sy: sc, sz: sc }));
  };
  if (world === 'alps') {
    // los pinos de la ladera, a los dos lados (más espesos lejos de la cuerda). Cuántos, como en todo el paisaje: lo que se ve a la
    // vez (unos 16 trozos) no pide más a la gráfica que el bosque de Combate (unos 50 árboles y 50 plantas)
    for (let i = 0; i < 4; i++) {
      const u = side() * (ROPE.treeU + Math.pow(R(), 0.7) * 55), h = between(h0, h1), sc = between(0.9, 1.5);
      onGround('nature', R() < 0.85 ? pick(['Pine_2', 'Pine_4', 'Pine_5']) : 'DeadTree_1', h, u, sc, 0.15);
    }
  } else if (world === 'jungle') {
    // la selva: árboles grandes y espesos, y matorral (helechos, plantas y arbustos) entre ellos
    for (let i = 0; i < 4; i++) {
      const u = side() * (ROPE.treeU + Math.pow(R(), 0.8) * 45), h = between(h0, h1), sc = between(1.4, 2.2);
      onGround('nature', pick(['CommonTree_3', 'CommonTree_4', 'CommonTree_5']), h, u, sc, 0.15);
    }
    for (let i = 0; i < 3; i++) {
      const u = side() * between(4, 40), h = between(h0, h1);
      onGround('nature', pick(['Fern_1', 'Plant_1_Big', 'Plant_7_Big', 'Bush_Common']), h, u, between(1.5, 3), 0.1);
    }
  } else if (world === 'gorge') {
    // la garganta: dos paredes de roca a los lados (lejos: no agobian), muy altas, con alguna cascada por su cara
    for (const sd of [-1, 1]) {
      const near = between(11, 14), w = between(8, 12), g = C.ground((h0 + h1) / 2, sd * near), top = C.ground((h0 + h1) / 2, 0) + between(26, 36);
      out.push(rockFit('island', 'Cliff4', sd < 0 ? -near - w : near, sd < 0 ? -near : near + w, g - 8, top, h0 - between(2, 4), h1 + between(2, 4), R() < 0.5));
      if (R() < 0.3) out.push(put('island', FALL, (h0 + h1) / 2, sd * (near - 0.2), g, { sx: between(2.5, 4), sy: top - g - 2, sz: 1 }));
    }
    if (R() < 0.6) onGround('nature', pick(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), between(h0, h1), side() * between(5, 9), between(0.8, 1.5), 0.4);
  } else {
    // la costa: palmeras en la ladera (por encima del mar) y, al empezar, el barco pirata fondeado
    for (let i = 0; i < 3; i++) {
      const u = side() * (ROPE.treeU + Math.pow(R(), 0.8) * 40), h = between(h0, h1);
      onGround('island', pick(['PalmTree_1', 'PalmTree_2', 'PalmTree_3']), h, u, between(1.3, 1.9), 0.1);
    }
    if (shipH >= h0 && shipH < h1) out.push(put('island', 'ShipLarge', shipH, -26, seaY + 0.8, { ry: 0.4 }));
  }
  // alguna piedra medio enterrada (menos en la selva, tapada por el matorral)
  if (world !== 'gorge' && R() < (world === 'jungle' ? 0.2 : 0.6)) {
    const sc = between(0.6, 1.2);
    onGround('nature', pick(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']), between(h0, h1), side() * between(ROPE.treeU, 40), sc, 0.3 * sc);
  }
  // las torres de este trozo, con el aspecto de su mundo
  for (let i = 0; i < C.towers.length; i++) {
    const T = C.towers[i];
    if (T.h >= h0 && T.h < h1) towerPuts(C, T, i > 0, opened.has(i), out, world);
  }
  return out;
}

/** La cascada de la garganta (no es un modelo de los kits: la pinta la escena, con su agua que cae). `sx`, su ancho; `sy`, su
 * alto; el pie, en `y`. */
export const FALL = 'Cascada';

/** La torre de madera: cuatro patas desde el suelo, aspas a los lados y su plataforma a un lado de la cuerda (la cuerda fija
 * sube pegada a ella), con el cofre encima (`chest`). */
export const TOWER = { u0: 0.55, u1: 3.4, d: 1.4, deck: 0.35 };
const NONE: ReadonlySet<number> = new Set();
/** Dónde está la boca del cofre de una torre (en las coordenadas del recorrido: u, y, h): de ahí salen sus premios. */
export function chestMouth(T: RopeTower): [number, number, number] {
  return [(TOWER.u0 + TOWER.u1) / 2 + 0.4, T.top - TOWER.deck + 0.55, T.h];
}
function towerPuts(C: RopeCourse, T: RopeTower, chest: boolean, open: boolean, out: Put[], world: RopeWorldKey = 'alps'): void {
  const top = T.top - TOWER.deck, th = 0.9, style = world === 'gorge' ? 'rock' : world === 'jungle' ? 'tree' : 'wood';
  if (style === 'rock') {
    // un pilar de roca desde el fondo de la garganta, con la plataforma encima
    const g = Math.min(C.ground(T.h - 1.8, TOWER.u1), C.ground(T.h + 1.8, TOWER.u1));
    out.push(rockFit('island', 'Cliff4', TOWER.u0 + 0.1, TOWER.u1 + 0.8, g - 1, top - 0.05, T.h - 1.9, T.h + 1.9));
  } else if (style === 'tree') {
    // un árbol gigante, con la plataforma alrededor del tronco, en lo alto (la copa, por encima)
    const g = C.ground(T.h, TREE_U), sc = Math.max(2.6, (top - g) / 5.5);
    out.push(put('nature', 'CommonTree_4', T.h, TREE_U, g - 0.3 * sc, { ry: (T.h * 1.7) % TAU, sx: sc, sy: sc, sz: sc }));
  } else {
    for (const u of [TOWER.u0 + 0.15, TOWER.u1 - 0.15])
      for (const dh of [-TOWER.d, TOWER.d]) {
        const g = C.ground(T.h + dh, u);
        out.push(standPole(T.h + dh, u, g - 0.4, top - g + 0.4, th));
      }
    // las aspas: de lado a lado, cada 3 m de alto
    for (const dh of [-TOWER.d, TOWER.d]) {
      const g = Math.max(C.ground(T.h + dh, TOWER.u0), C.ground(T.h + dh, TOWER.u1));
      for (let y = g + 0.5; y + 3 < top; y += 3) {
        out.push(tiltPole(T.h + dh, TOWER.u0 + 0.15, y, TOWER.u1 - 0.15, y + 3, 0.5));
        out.push(tiltPole(T.h + dh, TOWER.u1 - 0.15, y, TOWER.u0 + 0.15, y + 3, 0.5));
      }
    }
  }
  // la plataforma: tablas de muelle de 3 × 3,2 m
  out.push(put('island', 'Dock', T.h + 0.04, (TOWER.u0 + TOWER.u1) / 2 - 0.0078 * 1.5, top - 0.488 * 0.5, { sx: (TOWER.u1 - TOWER.u0 + 0.2) / 1.98448, sy: 0.5, sz: (2 * TOWER.d + 0.4) / 2.08129 }));
  // (el cofre, cerrado hasta que llegas; abierto, lleno de oro)
  if (chest) out.push(put('island', open ? 'Chest_Gold' : 'Chest_Closed', T.h, (TOWER.u0 + TOWER.u1) / 2 + 0.4, top + 0.02, { ry: -Math.PI / 2, sx: 0.6, sy: 0.6, sz: 0.6 }));
}
/** El tronco del árbol gigante de la selva, a un lado de la cuerda (m). */
const TREE_U = 2.3;

/** Los modelos que usa el paisaje de la cuerda (para preparar sus instancias). */
export const ROPE_MODELS: { kit: 'island' | 'nature'; n: string; cap: number }[] = [
  { kit: 'nature', n: 'CommonTree_3', cap: 40 },
  { kit: 'nature', n: 'CommonTree_4', cap: 50 },
  { kit: 'nature', n: 'CommonTree_5', cap: 40 },
  { kit: 'nature', n: 'Fern_1', cap: 30 },
  { kit: 'nature', n: 'Plant_1_Big', cap: 30 },
  { kit: 'nature', n: 'Plant_7_Big', cap: 30 },
  { kit: 'nature', n: 'Bush_Common', cap: 30 },
  { kit: 'island', n: 'PalmTree_1', cap: 25 },
  { kit: 'island', n: 'PalmTree_2', cap: 25 },
  { kit: 'island', n: 'PalmTree_3', cap: 25 },
  { kit: 'island', n: 'Cliff4', cap: 80 },
  { kit: 'island', n: 'ShipLarge', cap: 2 },
  { kit: 'nature', n: 'Pine_2', cap: 40 },
  { kit: 'nature', n: 'Pine_4', cap: 40 },
  { kit: 'nature', n: 'Pine_5', cap: 40 },
  { kit: 'nature', n: 'DeadTree_1', cap: 20 },
  { kit: 'nature', n: 'Rock_Medium_1', cap: 20 },
  { kit: 'nature', n: 'Rock_Medium_2', cap: 20 },
  { kit: 'nature', n: 'Rock_Medium_3', cap: 20 },
  { kit: 'island', n: 'Dock_Pole', cap: 200 },
  { kit: 'island', n: 'Dock', cap: 12 },
  { kit: 'island', n: 'Chest_Closed', cap: 12 },
  { kit: 'island', n: 'Chest_Gold', cap: 12 },
];
