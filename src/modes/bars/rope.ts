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
import { put, standPole, tiltPole, type Put } from '../trek/plat/pieces.js';
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

/** Las fotos de fondo, según la altura (elegido por el usuario de las propuestas: «una foto por altura»; de `public/fondos`):
 * abajo, los Alpes desde el valle; a media subida, la montaña y el valle y las colinas con nubes; en el último tramo, la vista
 * desde la cima. Solo ponen lo lejano: el cielo y las montañas del horizonte (lo de debajo, el valle de la escena). */
export const ROPE_PANOS = ['aldea', 'montana', 'lago', 'cumbre'] as const;
/** La foto del tramo i de n. */
/** La bruma de cada foto (el color de su horizonte) y lo espesa que es (la niebla de la escena: lo lejano se funde con la foto). */
export const ROPE_HAZE: Record<string, number> = { aldea: 0xd6e6ee, montana: 0xccd9e6, lago: 0xd2e8f2, cumbre: 0xd9e5ee };
export const ROPE_FOG = 0.006;
export function ropePano(i: number, n: number): (typeof ROPE_PANOS)[number] {
  if (n <= 1) return 'aldea';
  if (i >= n - 1) return 'cumbre';
  const p = i / (n - 1);
  return p < 0.3 ? 'aldea' : p < 0.6 ? 'montana' : 'lago';
}

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

  /** Lo que falta hasta la plataforma (m). */
  get left(): number {
    return Math.max(0, this.end - this.s);
  }
}

/** El paisaje del trozo `chunk` (de `chunk·ROPE_CHUNK` a `(chunk + 1)·ROPE_CHUNK` m en horizontal): pinos y alguna piedra en la
 * ladera (siempre apoyados en el suelo y lejos de la cuerda), las torres de madera que haya en él (patas en el suelo, aspas y
 * su plataforma, con el cofre). Los montes lejanos, los de la foto de fondo. Coordenadas: `ds` = h, `u` a un lado, `y` la altura. */
export function ropeDecoPuts(C: RopeCourse, chunk: number, out: Put[]): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ Math.imul(C.seed | 0, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0);
  const between = (a: number, b: number): number => a + R() * (b - a);
  const h0 = chunk * ROPE_CHUNK, h1 = h0 + ROPE_CHUNK;
  // los pinos de la ladera, a los dos lados (más espesos lejos de la cuerda), con su tronco en el suelo
  for (let i = 0; i < 9; i++) {
    const sd = R() < 0.5 ? -1 : 1, u = sd * (ROPE.treeU + Math.pow(R(), 0.7) * 55), h = between(h0, h1), sc = between(0.9, 1.5);
    const n = R() < 0.85 ? (['Pine_2', 'Pine_4', 'Pine_5'] as const)[Math.floor(R() * 3)] : 'DeadTree_1';
    out.push(put('nature', n, h, u, C.ground(h, u) - 0.15, { ry: R() * TAU, sx: sc, sy: sc, sz: sc }));
  }
  // alguna piedra medio enterrada
  if (R() < 0.6) {
    const sd = R() < 0.5 ? -1 : 1, u = sd * between(ROPE.treeU, 40), h = between(h0, h1), sc = between(0.6, 1.2);
    out.push(put('nature', (['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'] as const)[Math.floor(R() * 3)], h, u, C.ground(h, u) - 0.3 * sc, { ry: R() * TAU, sx: sc, sy: sc, sz: sc }));
  }
  // (los montes lejanos los pone la foto de fondo: las rocas grandes del kit se veían de cartón)
  // las torres de este trozo
  for (let i = 0; i < C.towers.length; i++) {
    const T = C.towers[i];
    if (T.h >= h0 && T.h < h1) towerPuts(C, T, i > 0, out);
  }
  return out;
}

/** La torre de madera: cuatro patas desde el suelo, aspas a los lados y su plataforma a un lado de la cuerda (la cuerda fija
 * sube pegada a ella), con el cofre encima (`chest`). */
export const TOWER = { u0: 0.55, u1: 3.4, d: 1.4, deck: 0.35 };
function towerPuts(C: RopeCourse, T: RopeTower, chest: boolean, out: Put[]): void {
  const top = T.top - TOWER.deck, th = 0.9;
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
  // la plataforma: tablas de muelle de 3 × 3,2 m
  out.push(put('island', 'Dock', T.h + 0.04, (TOWER.u0 + TOWER.u1) / 2 - 0.0078 * 1.5, top - 0.488 * 0.5, { sx: (TOWER.u1 - TOWER.u0 + 0.2) / 1.98448, sy: 0.5, sz: (2 * TOWER.d + 0.4) / 2.08129 }));
  if (chest) out.push(put('island', 'Chest_Closed', T.h, (TOWER.u0 + TOWER.u1) / 2 + 0.4, top + 0.02, { ry: -Math.PI / 2, sx: 0.6, sy: 0.6, sz: 0.6 }));
}

/** Los modelos que usa el paisaje de la cuerda (para preparar sus instancias). */
export const ROPE_MODELS: { kit: 'island' | 'nature'; n: string; cap: number }[] = [
  { kit: 'nature', n: 'Pine_2', cap: 160 },
  { kit: 'nature', n: 'Pine_4', cap: 160 },
  { kit: 'nature', n: 'Pine_5', cap: 160 },
  { kit: 'nature', n: 'DeadTree_1', cap: 60 },
  { kit: 'nature', n: 'Rock_Medium_1', cap: 20 },
  { kit: 'nature', n: 'Rock_Medium_2', cap: 20 },
  { kit: 'nature', n: 'Rock_Medium_3', cap: 20 },
  { kit: 'island', n: 'Dock_Pole', cap: 200 },
  { kit: 'island', n: 'Dock', cap: 12 },
  { kit: 'island', n: 'Chest_Closed', cap: 12 },
];
