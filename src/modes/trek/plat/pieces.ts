/**
 * La Travesía de plataformas: qué modelo va dónde. Lógica pura (sin IWSDK ni three): cada función devuelve una lista de
 * `Put` (un modelo del Pirate Kit, del bosque o de las frutas con su sitio, giro y escala) y el sistema que pinta
 * (trek-system.ts) los pone con instancias. Nada se crea de cero: todo sale de `island.glb`, `nature.glb` y `frutas.glb`.
 *
 * Las coordenadas son las del sendero: `ds` a lo largo (hacia delante), `u` a la derecha, `y` arriba sobre las tablas
 * (la pasarela está en y = 0; el suelo del paisaje, en `GROUND_Y`). Con `ry = 0` el modelo está tal cual: su +x a la
 * derecha del sendero y su −z hacia delante. Los giros siguen el orden de three (`Euler` XYZ: primero rz, luego ry y rx)
 * y se aplican después de la escala.
 *
 * Medidas de los modelos, leídas de los .glb (m, a escala 1):
 * - `Dock`: las tablas (de 6 en 6 a lo largo, x −0,98…1,00; z −1,03…1,05; cara de arriba en y = 0,49) y, bajo ellas, dos
 *   postes en el lado izquierdo que llegan a y = −2,00 (y a 1,01: sobresalen de las tablas). La caja entera, con los
 *   postes y las cuerdas, es mayor que las tablas, así que todo se mide por las TABLAS, no por la caja.
 * - `Dock_Pole`: x −0,20…0,16; y −2,00…1,01; z −0,20…0,18.
 * - `Barrel`: x −0,357…0,357; y 0,0013…0,661; z −0,357…0,357 (un cilindro de 0,714 m de diámetro).
 * - `Chest_Closed`: x −0,697…0,697; y −0,021…0,861; z −0,444…0,444 (una caja de 1,39 × 0,88 × 0,89 m). `Chest_Gold`, el
 *   mismo abierto y lleno de oro (la tapa, levantada hacia atrás): x −0,885…0,924; y −0,021…1,264; z −0,931…0,657.
 * - Rocas (cajas en la tabla `BOX`, de los vértices: son montículos cerrados, con su cara de abajo): `Cliff1` 5,6 × 3,0 × 5,4
 *   (el más llano: una meseta redonda a ~2,2 de 2,5 de alto), `Cliff3` 6,9 × 6,2 × 5,9 y `Cliff4` 7,4 × 5,5 × 7,1 (con pico),
 *   `Rock_1`…`Rock_5` de 0,6–0,8 m y, del bosque, `Rock_Medium_1`…`3` de 3,0–3,4 m.
 * - Frutas (tabla `FRUITS`): de 0,13 (el ancho de la fresa) a 0,63 m (el largo del plátano), con la base en y = 0.
 */
import { trekRng, TREK_CH } from '../path.js';
import { HEAD_TOP } from '../env.js';
import { BOARD_CLEAR_U } from '../board-spot.js';
import { SHIP_U, LEDGE_W, BOX_CLEAR, FORK_RAMP, FORK_U, FRUIT_U, GLIDE_LIFT, GOLD_Y, glideArc, glideU, LAND_PAST, SPRING_LIFT, type Piece } from './types.js';

export type Kit = 'island' | 'nature' | 'food';

/** Un modelo colocado. ds: a lo largo del sendero (en piecePuts, desde piece.at; en floorPuts y decoPuts, absoluto). */
export interface Put {
  kit: Kit;
  n: string;
  ds: number;
  u: number;
  y: number;
  ry: number;
  rx: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  /** Las frutas en arco del hueco: su número (se dejan de pintar al comérselas); la dorada de una plataforma, `GOLD_TAG`. */
  tag?: number;
  /** Las islas: el centro (a lo largo) del trozo de suelo al que pertenece (lo que sube, baja o se hunde, se mueve entero). */
  seg?: number;
}
/** La marca de la fruta dorada de encima de una plataforma (se deja de pintar al cogerla). */
export const GOLD_TAG = 99;
/** Lo que sube el salto, para las frutas en arco sobre los huecos (las de JUMP_LIFT de runner.ts: el mundo baja eso). */
const ARC_LIFT = 0.45;
/** Las frutas del arco (van variando) y la dorada (un limón grande, con su brillo dorado que pone el sistema). */
const ARC_FRUITS = ['Cherries', 'Strawberry', 'Apple', 'Orange', 'Grapes'] as const;
export const GOLD_FRUIT = 'Lemon', GOLD_SIZE = 0.3;

/** Cuánto sobresale la repisa de roca por delante de `at` y por detrás de `at + len` (m): los montículos bajan en los extremos. */
const STEP_FRONT = 0.5, STEP_BACK = 0.3;

/** A qué altura sobre las tablas está el techo del túnel al llegar (m: hay que pasar en plancha). */
export const CRAWL_ROOF = 0.75;


/** El suelo del paisaje, bajo la pasarela (m). */
export const GROUND_Y = -1.2;

/** Las tablas del `Dock` (a escala 1): su ancho, su largo, dónde acaba la cara de arriba y hasta dónde bajan los postes. */
const DK = { x0: -0.98448, x1: 1.0, z0: -1.02643, z1: 1.05486, top: 0.488067, bottom: -1.999561, under: 0.138521 } as const;
/** `Dock_Pole` (a escala 1). */
const PL = { x0: -0.201654, x1: 0.164895, y0: -1.999561, y1: 1.013127, z0: -0.200475, z1: 0.175503 } as const;
const PL_LEN = PL.y1 - PL.y0;

/** Lo que mide la pasarela de ancho (m: de borde a borde de las tablas). */
export const DOCK_W = 1.9;
/** Lo que mide un tramo de muelle a lo largo del sendero, a su escala (m): sus tablas, sin los postes que sobresalen. */
export const DOCK_LEN = DK.z1 - DK.z0;

/** Todos los nombres de modelo que usa este archivo, por kit (el sistema que pinta los carga de aquí). */
export const KIT_MODELS: Record<Kit, string[]> = {
  island: ['Dock', 'Dock_Broken', 'Dock_Pole', 'Barrel', 'Chest_Closed', 'Chest_Gold', 'Cliff1', 'Cliff3', 'Cliff4', 'Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5', 'PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'LargeBones', 'Skulls', 'ShipLarge', 'Bottle_1'],
  nature: [
    'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_2', 'Pine_4', 'Pine_5', 'DeadTree_1', 'DeadTree_2',
    'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
    'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Flower_3_Group', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big', 'Clover_1',
    'Mushroom_Common',
  ],
  food: ['Apple', 'Banana', 'Cherries', 'Orange', 'Pear', 'Strawberry', 'Pineapple', 'Watermelon', 'Lemon', 'Grapes'],
};

function put(kit: Kit, n: string, ds: number, u: number, y: number, o: Partial<Put> = {}): Put {
  return { kit, n, ds, u, y, ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, sx: o.sx ?? 1, sy: o.sy ?? 1, sz: o.sz ?? 1 };
}

/* ------------------------------------------------------------------ el suelo */

/** Un tramo de muelle que cubre las tablas de `a` a `b` (a lo largo), con su cara de arriba en `top` y escalado a lo alto
 * por `sy` (las tablas y los postes, a la vez). Estirado o encogido a lo largo para que encaje justo. */
function dockPut(a: number, b: number, top: number, sy: number): Put {
  const sz = (b - a) / DOCK_LEN, sx = DOCK_W / (DK.x1 - DK.x0);
  // (el −z del modelo es «delante»: el centro de sus tablas está en −zc a lo largo)
  const zc = (DK.z0 + DK.z1) / 2;
  return put('island', 'Dock', (a + b) / 2 + zc * sz, -((DK.x0 + DK.x1) / 2) * sx, top - DK.top * sy, { sx, sy, sz });
}

/** Un tramo de muelle del suelo que va de (ds0, u0) a (ds1, u1): recto o en diagonal (las ramas de una bifurcación). */
function dockLine(ds0: number, u0: number, ds1: number, u1: number, out: Put[]): void {
  const L = Math.hypot(ds1 - ds0, u1 - u0), m = Math.max(1, Math.round(L / DOCK_LEN)), ry = Math.atan2(-(u1 - u0), ds1 - ds0);
  for (let i = 0; i < m; i++) {
    const a = (i + 0.5) / m, P = dockPut(0, L / m, 0, -GROUND_Y / (DK.top - DK.bottom));
    P.ds = ds0 + (ds1 - ds0) * a;
    P.u = u0 + (u1 - u0) * a;
    P.ry = ry;
    out.push(P);
  }
}

/** Un tramo de muelle del suelo: de `a` a `b`, con la cara de arriba en y = 0 y los postes hasta `GROUND_Y`. */
function dockAt(a: number, b: number, out: Put[]): void {
  out.push(dockPut(a, b, 0, -GROUND_Y / (DK.top - DK.bottom)));
}

/** Tablas de `a` a `b` sin huecos (tramos casi de `DOCK_LEN`, ni estirados ni encogidos de más). */
function dockRun(a: number, b: number, top: number, sy: number, out: Put[]): void {
  const m = Math.max(1, Math.round((b - a) / DOCK_LEN)), w = (b - a) / m;
  for (let i = 0; i < m; i++) out.push(dockPut(a + i * w, a + (i + 1) * w, top, sy));
}

/**
 * Los tramos de muelle que cubren de `s0` a `s1` sin tapar los huecos (`holes`: intervalos [a, b) de los `gap`). Los
 * tramos van en una rejilla fija de `DOCK_LEN`, así que uno dado sale igual pidas el intervalo que pidas; solo los
 * que tocan un hueco se estiran o se encogen para llegar justo a su borde. Cubren, como poco, de `s0` a `s1` (el tramo
 * del borde de la ventana sale entero, aunque se pase).
 */
export function floorPuts(s0: number, s1: number, holes: ReadonlyArray<readonly [number, number]>, out: Put[]): Put[] {
  const L = DOCK_LEN, E = 1e-9;
  // la ventana, ajustada a la rejilla (así lo que no toca un hueco sale siempre entero)
  const w0 = Math.floor(s0 / L + E) * L, w1 = Math.ceil(s1 / L - E) * L;
  const hs = holes.filter((h) => h[1] > w0 && h[0] < w1).map((h) => [Math.max(h[0], w0), Math.min(h[1], w1)] as const).sort((a, b) => a[0] - b[0]);
  let from = w0;
  const free: Array<[number, number]> = [];
  for (const [a, b] of hs) {
    if (a > from) free.push([from, a]);
    from = Math.max(from, b);
  }
  if (from < w1) free.push([from, w1]);
  for (const [a, b] of free) {
    if (b - a < 1e-6) continue;
    // sus cortes: el principio, cada línea de la rejilla que cae dentro y el final
    const cuts = [a];
    for (let k = Math.floor(a / L + E) + 1; k * L < b - E * L; k++) if (k * L > a + 1e-6) cuts.push(k * L);
    cuts.push(b);
    // un trozo corto en un extremo (lo que sobra junto al hueco) se une al vecino en vez de quedar como una tabla enana
    if (cuts.length > 2 && cuts[1] - cuts[0] < L * 0.5) cuts.splice(1, 1);
    if (cuts.length > 2 && cuts[cuts.length - 1] - cuts[cuts.length - 2] < L * 0.5) cuts.splice(cuts.length - 2, 1);
    for (let i = 0; i + 1 < cuts.length; i++) dockAt(cuts[i], cuts[i + 1], out);
  }
  return out;
}

/* ------------------------------------------------------------------ el risco (mundo 2) */

/** Lo que baja la roca del sendero del risco (m): una columna que se hunde en el vacío. */
export const CLIFF_DEPTH = 9;
/** El vacío del risco: dónde queda el suelo de abajo (m). */
export const CLIFF_FLOOR_Y = -45;

/**
 * El sendero del risco de `s0` a `s1`, en la misma rejilla que el muelle (lo que no toca nada sale siempre igual), sin tapar los
 * huecos (`holes`) y, en las cornisas (`narrow`: intervalos), estrecho, pegado a la pared (la izquierda) con `LEDGE_W` de camino.
 * Cada trozo, dos rocas del Pirate Kit: encima, la meseta de `Cliff1` aplanada (su cara de arriba es casi plana: se pisa bien;
 * estirada a lo alto salían agujas), algo más ancha que el camino y más larga que el trozo, para que su borde redondeado quede
 * fuera y los trozos se junten sin escalones; debajo, otra estirada hasta el fondo (la cara del risco, hacia el vacío).
 */
export function cliffFloorPuts(s0: number, s1: number, holes: ReadonlyArray<readonly [number, number]>, narrow: ReadonlyArray<readonly [number, number]>, out: Put[]): Put[] {
  const W = DOCK_W / 2;
  for (const [c0, c1, thin, R, e0, e1] of rockSegs(s0, s1, holes, narrow)) {
    const right = thin ? -W + LEDGE_W : W;
    // la losa: la meseta (lo plano, en su centro) cubre el camino, muy aplanada (sus bultos, de pocos cm); arriba, a ras de
    // las tablas. En la cornisa, apenas sobresale del camino: que se vea estrecha
    out.push(rockFit('island', 'Cliff1', -W - (thin ? 0.6 : 1.3), right + (thin ? 0.25 : 1.3), -0.45, 0.03, c0 - e0, c1 + e1, R() < 0.5));
    // la cara del risco, debajo
    out.push(rockFit('island', 'Cliff1', -W - 0.35, right + (thin ? 0.1 : 0.5), -CLIFF_DEPTH, -0.3, c0 - e0, c1 + e1, R() < 0.5));
  }
  return out;
}

/**
 * Los trozos de suelo de roca (el risco y las islas) de `s0` a `s1`, en la rejilla del muelle, partidos por las cornisas
 * (`narrow`): [desde, hasta, estrecho, su azar, lo que se alarga por detrás y por delante]. Cada roca se alarga un 50 % por
 * cada lado (su borde redondeado queda dentro del vecino: sin escalones), salvo junto a un hueco, que se vería tapado.
 */
function rockSegs(s0: number, s1: number, holes: ReadonlyArray<readonly [number, number]>, narrow: ReadonlyArray<readonly [number, number]>): [number, number, boolean, () => number, number, number][] {
  const tmp: Put[] = [], out: [number, number, boolean, () => number, number, number][] = [];
  floorPuts(s0, s1, holes, tmp);
  const nearHole = (s: number): boolean => holes.some(([x, y]) => Math.abs(s - x) < 0.06 || Math.abs(s - y) < 0.06);
  for (const P of tmp) {
    // (el trozo de muelle que tocaba: de a a b a lo largo)
    const half = (P.sz * DOCK_LEN) / 2, mid = P.ds - ((DK.z0 + DK.z1) / 2) * P.sz, a = mid - half, b = mid + half;
    const cuts = [a, b];
    for (const [x, y] of narrow) for (const c of [x, y]) if (c > a + 0.05 && c < b - 0.05) cuts.push(c);
    cuts.sort((m, n) => m - n);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const c0 = cuts[i], c1 = cuts[i + 1], cm = (c0 + c1) / 2, thin = narrow.some(([x, y]) => cm > x && cm < y);
      const ext = Math.max(0.4, (c1 - c0) * 0.5);
      out.push([c0, c1, thin, trekRng((Math.round(cm * 7) * 2654435761) >>> 0), nearHole(c0) ? 0.04 : ext, nearHole(c1) ? 0.04 : ext]);
    }
  }
  return out;
}

/** Una roca colgando boca abajo (rx = π: la punta, abajo), de `top` a `bottom` a lo alto, [u0, u1] a lo ancho y [s0, s1] a lo
 * largo: la panza de una isla flotante. */
function hangFit(n: string, u0: number, u1: number, top: number, bottom: number, s0: number, s1: number, o: Partial<Put> = {}): Put {
  const [x0, by0, z0, x1, by1, z1] = BOX[n], sx = (u1 - u0) / (x1 - x0), sy = (top - bottom) / (by1 - by0), sz = (s1 - s0) / (z1 - z0);
  // (boca abajo, y y z cambian de signo: lo de abajo del modelo queda arriba, en `top`)
  return put('island', n, (s0 + s1) / 2 - ((z0 + z1) / 2) * sz, (u0 + u1) / 2 - ((x0 + x1) / 2) * sx, top + by0 * sy, { rx: Math.PI, sx, sy, sz, ...o });
}

/**
 * El suelo de las islas en el cielo de `s0` a `s1`: islotes de roca flotando (sin tapar los huecos). Cada trozo, la losa de
 * la meseta de `Cliff1` aplanada (como en el risco) y, debajo, colgando boca abajo, la panza de la isla (`Cliff3`, con la
 * punta abajo y de largo distinto en cada trozo). Todas sus piezas llevan `seg`: lo que sube, baja o se hunde se mueve entero.
 */
export function skyFloorPuts(s0: number, s1: number, holes: ReadonlyArray<readonly [number, number]>, out: Put[]): Put[] {
  const W = DOCK_W / 2;
  for (const [c0, c1, , R, e0, e1] of rockSegs(s0, s1, holes, [])) {
    const seg = (c0 + c1) / 2, deep = 2.5 + R() * 3, wide = 0.4 + R() * 0.5;
    const cap = rockFit('island', 'Cliff1', -W - 0.9, W + 0.9, -0.45, 0.03, c0 - e0, c1 + e1, R() < 0.5);
    cap.seg = seg;
    out.push(cap, hangFit('Cliff3', -W - wide, W + wide, -0.3, -0.3 - deep, c0 - e0 * 0.6, c1 + e1 * 0.6, { seg, ry: R() < 0.5 ? Math.PI : 0 }));
  }
  return out;
}

/** El paisaje de las islas en el trozo `chunk`: otras islas flotando a los lados, a distintas alturas y tamaños, algunas
 * con un árbol encima (las de muy lejos, sin él: no se distinguiría). */
export function skyDecoPuts(chunk: number, out: Put[], clear: -1 | 0 | 1 = 0): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ 0x7f4a7c15) >>> 0), s0 = chunk * TREK_CH;
  const between = (a: number, b: number): number => a + R() * (b - a);
  const n = 1 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const side = R() < 0.5 ? -1 : 1, near = R() < 0.5, w = near ? between(4, 7) : between(8, 16);
    let u = side * (near ? between(7, 14) : between(18, 45));
    // (del lado del marcador, el islote cercano, más allá de él: si no, lo atravesaba)
    if (side === clear) u = side * Math.max(Math.abs(u), BOARD_CLEAR_U + w / 2 + 1);
    const ds = between(s0, s0 + TREK_CH), y = near ? between(-6, 3) : between(-14, 14), deep = w * between(0.6, 1.1);
    out.push(rockFit('island', 'Cliff1', u - w / 2, u + w / 2, y - w * 0.12, y, ds - w / 2, ds + w / 2, R() < 0.5));
    out.push(hangFit('Cliff3', u - w * 0.42, u + w * 0.42, y - w * 0.08, y - w * 0.08 - deep, ds - w * 0.4, ds + w * 0.4, { ry: R() * 6.28 }));
    if (near && R() < 0.7) {
      const sc = between(0.7, 1.1);
      out.push(put('nature', R() < 0.5 ? 'CommonTree_4' : 'Pine_4', ds + between(-1, 1), u + between(-1, 1), y - 0.05, { ry: R() * 6.28, sx: sc, sy: sc, sz: sc }));
    }
  }
  return out;
}

/** El paisaje del risco en el trozo `chunk`: la pared de roca a la izquierda, que sube muy por encima de ti, con algún pino
 * agarrado a ella; y a la derecha, en el vacío, riscos lejanos que salen de muy abajo (la sensación de altura). */
export function cliffDecoPuts(chunk: number, out: Put[]): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0), s0 = chunk * TREK_CH;
  const between = (a: number, b: number): number => a + R() * (b - a);
  // la pared: `Cliff4` sin girar, con su pico del lado del camino (su cara alta es el tercio del medio a lo largo: cada roca,
  // tres veces más larga que su paso, así siempre hay pared alta junto al camino); a trozos de 3 a 5 m, cada uno algo distinto
  for (let s = s0; s < s0 + TREK_CH; ) {
    const L = between(3, 5), e = Math.min(s0 + TREK_CH, s + L), m = (s + e) / 2, h = between(5, 8);
    out.push(rockFit('island', 'Cliff4', -between(7, 9), -DOCK_W / 2 - between(0.2, 0.5), -between(2, 4), h, m - 1.5 * L, m + 1.5 * L));
    if (R() < 0.3) {
      const sc = between(0.6, 0.9);
      out.push(put('nature', R() < 0.5 ? 'Pine_4' : 'Pine_2', m, -between(5, 7), between(5, 8), { ry: R() * 6.28, sx: sc, sy: sc, sz: sc }));
    }
    s = e;
  }
  // más arriba, detrás de la pared, la montaña
  out.push(rockFit('island', 'Cliff3', -between(22, 30), -between(9, 12), -CLIFF_DEPTH, between(18, 26), s0 - 2, s0 + TREK_CH + 2, R() < 0.5));
  // los riscos lejanos, en el vacío de la derecha
  if (R() < 0.7) {
    const u = between(22, 55), w = between(6, 14), h = between(25, 45), ds = between(s0, s0 + TREK_CH);
    out.push(rockFit('island', R() < 0.5 ? 'Cliff3' : 'Cliff4', u, u + w, CLIFF_FLOOR_Y, CLIFF_FLOOR_Y + h, ds, ds + w, R() < 0.5));
  }
  return out;
}

/** La costa: a qué altura está el mar (m, bajo las tablas; el mismo que pinta `Sea`) y el centro del barco a lo largo de su
 * casco (el modelo no está centrado: m). */
export const SEA_Y = -1.55;
const SHIP_X = 1.8;

/** El muelle de la costa de `s0` a `s1`: el de tablas (`floorPuts`) y, bajo cada trozo, dos postes que bajan hasta el mar. */
export function coastFloorPuts(s0: number, s1: number, holes: ReadonlyArray<readonly [number, number]>, out: Put[]): Put[] {
  const n0 = out.length;
  floorPuts(s0, s1, holes, out);
  for (let i = n0, n = out.length; i < n; i++) {
    const P = out[i], mid = P.ds - ((DK.z0 + DK.z1) / 2) * P.sz;
    for (const u of [-DOCK_W / 2 + 0.12, DOCK_W / 2 - 0.12]) out.push(standPole(mid, u, SEA_Y - 0.8, 0.75 - SEA_Y, 0.75));
  }
  return out;
}

/** El paisaje de la costa en el trozo `chunk`: islotes de roca con palmeras (alguno con huesos de ballena o calaveras),
 * barriles y botellas flotando junto al muelle, postes de un muelle viejo y, de vez en cuando, un barco pirata a lo lejos. */
export function coastDecoPuts(chunk: number, out: Put[], clear: -1 | 0 | 1 = 0): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x2545f491) ^ 0x6a09e667) >>> 0), s0 = chunk * TREK_CH;
  const between = (a: number, b: number): number => a + R() * (b - a);
  const side = (): -1 | 1 => (R() < 0.5 ? -1 : 1);
  // los islotes con palmeras
  const n = 1 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    const sd = side(), w0 = between(7, 22), ds = s0 + ((i + R()) / n) * TREK_CH, w = between(4, 8), top = SEA_Y + between(0.3, 0.7);
    // (del lado del marcador, el islote y sus palmeras, más allá de él)
    const u = sd * (sd === clear ? Math.max(w0, BOARD_CLEAR_U + w / 2) : w0);
    out.push(rockFit('island', 'Rock_1', u - w / 2, u + w / 2, SEA_Y - 1.2, top, ds - w / 2, ds + w / 2, R() < 0.5));
    const palms = 1 + Math.floor(R() * 3);
    for (let j = 0; j < palms; j++) {
      const sc = between(1.1, 1.6);
      out.push(put('island', `PalmTree_${1 + Math.floor(R() * 3)}`, ds + between(-w, w) * 0.25, u + between(-w, w) * 0.25, top - 0.15, { ry: R() * 6.28, sx: sc, sy: sc, sz: sc }));
    }
    if (R() < 0.35) out.push(put('island', R() < 0.6 ? 'LargeBones' : 'Skulls', ds, u, top - 0.1, { ry: R() * 6.28, sx: 0.45, sy: 0.45, sz: 0.45 }));
  }
  // barriles y botellas flotando cerca del muelle, y postes sueltos de un muelle viejo
  for (let i = 0; i < 3; i++) {
    const ds = between(s0, s0 + TREK_CH), u = side() * between(2.2, 5);
    if (R() < 0.5) out.push(put('island', 'Barrel', ds, u, SEA_Y - 0.25, { rx: R() * 0.6, ry: R() * 6.28, sx: 0.8, sy: 0.8, sz: 0.8 }));
    else if (R() < 0.5) out.push(put('island', 'Bottle_1', ds, u, SEA_Y - 0.1, { rz: 1.3, ry: R() * 6.28 }));
    else out.push(standPole(ds, side() * between(3, 8), SEA_Y - 0.8, 0.8 + between(0.4, 1.6), 0.8));
  }
  // un barco pirata a lo lejos, de vez en cuando
  if (R() < 0.3) out.push(put('island', 'ShipLarge', between(s0, s0 + TREK_CH), side() * between(45, 75), SEA_Y + 0.8, { ry: R() * 6.28 }));
  return out;
}

/* ------------------------------------------------------------------ las piezas */

/** Un `Dock_Pole` de pie: de `y0` a `y0 + len` (m), con grosor `th` (escala en x y z). */
function standPole(ds: number, u: number, y0: number, len: number, th: number): Put {
  const sy = len / PL_LEN;
  return put('island', 'Dock_Pole', ds, u, y0 - PL.y0 * sy, { sx: th, sy, sz: th });
}

/** Un `Dock_Pole` tumbado a lo ancho (rz = π/2: su largo va en x): centrado en `u`, con su borde de abajo en `bottom`. */
function layPole(ds: number, u: number, bottom: number, len: number, th: number): Put {
  const sy = len / PL_LEN;
  // (con rz = π/2, su x pasa a ser y —de ahí el borde de abajo— y su y pasa a ser −x —de ahí el centrado—)
  return put('island', 'Dock_Pole', ds, u + ((PL.y0 + PL.y1) / 2) * sy, bottom - PL.x0 * th, { rz: Math.PI / 2, sx: th, sy, sz: th });
}

/** Lo que ocupa a lo ancho una roca del paisaje (m, [desde, hasta] en u; null si no es una roca de `BOX`): exacto sin girar
 * (o girada media vuelta, como las de `rockFit`); girada de otra forma, lo más que puede ocupar. Para comprobar que nada
 * atraviesa el marcador (tests/unit/trek-board.test.ts). */
export function putSpanU(P: Put): [number, number] | null {
  const b = BOX[P.n];
  if (!b) return null;
  const turn = Math.abs(Math.sin(P.ry)) < 1e-6;
  if (turn && Math.abs(P.rx) < 1e-6) {
    const f = Math.cos(P.ry) > 0 ? 1 : -1, p = P.u + f * b[0] * P.sx, q = P.u + f * b[3] * P.sx;
    return [Math.min(p, q), Math.max(p, q)];
  }
  const r = Math.hypot(Math.max(Math.abs(b[0]), Math.abs(b[3])), Math.max(Math.abs(b[2]), Math.abs(b[5]))) * Math.max(Math.abs(P.sx), Math.abs(P.sz));
  return [P.u - r, P.u + r];
}

/** Cajas de los modelos (a escala 1; vértices del .glb, con la escala y el giro de su nodo): [x0, y0, z0, x1, y1, z1]. */
const BOX: Record<string, readonly [number, number, number, number, number, number]> = {
  Rock_1: [-0.35, -0.24, -0.32, 0.34, 0.35, 0.33],
  Cliff1: [-2.5561, -0.482, -2.4228, 3.0647, 2.482, 2.9854],
  Cliff3: [-3.403, -0.4568, -3.4319, 3.4452, 5.712, 2.5046],
  Cliff4: [-3.3744, -0.2529, -3.6979, 3.9956, 5.2705, 3.4144],
  Rock_2: [-0.3826, -0.0334, -0.3671, 0.4006, 1.0161, 0.3914],
  Rock_3: [-0.4733, -0.0024, -0.2934, 0.2967, 0.6094, 0.2905],
  Rock_4: [-0.4166, -0.0045, -0.3984, 0.3462, 0.7069, 0.3476],
  Rock_5: [-0.3087, -0.2956, -0.2937, 0.2967, 0.309, 0.292],
  Rock_Medium_1: [-1.7273, -0.2711, -1.1499, 1.4979, 1.9887, 1.8393],
  Rock_Medium_3: [-1.8243, -0.3156, -0.8905, 1.5958, 2.0006, 2.5856],
};

/** Una roca estirada para que su caja llene justo [u0, u1] a lo ancho, [y0, y1] a lo alto y [s0, s1] a lo largo (el sendero,
 * hacia delante). `flip`: de espaldas (ry = π), para que dos seguidas no sean iguales. */
function rockFit(kit: Kit, n: string, u0: number, u1: number, y0: number, y1: number, s0: number, s1: number, flip = false): Put {
  const [x0, by0, z0, x1, by1, z1] = BOX[n], sx = (u1 - u0) / (x1 - x0), sy = (y1 - y0) / (by1 - by0), sz = (s1 - s0) / (z1 - z0), f = flip ? -1 : 1;
  // (con ry = π, x y z cambian de signo; el sendero va en −z: s = ds − z)
  return put(kit, n, (s0 + s1) / 2 + f * ((z0 + z1) / 2) * sz, (u0 + u1) / 2 - f * ((x0 + x1) / 2) * sx, y0 - by0 * sy, { ry: flip ? Math.PI : 0, sx, sy, sz });
}

/** Las frutas: su caja (a escala 1, con la base en y = 0), de los vértices de `frutas.glb`. */
const FRUITS: Record<string, readonly [number, number, number, number, number, number]> = {
  Apple: [-0.0981, 0, -0.0981, 0.0981, 0.1908, 0.0981],
  Banana: [-0.0688, 0, -0.3149, 0.0688, 0.1958, 0.3149],
  Cherries: [-0.044, 0, -0.081, 0.044, 0.1707, 0.081],
  Orange: [-0.0848, 0, -0.0848, 0.0848, 0.1622, 0.0848],
  Pear: [-0.0981, 0, -0.0981, 0.0981, 0.2708, 0.0981],
  Strawberry: [-0.0598, 0, -0.0598, 0.0598, 0.177, 0.0598],
  Pineapple: [-0.1206, 0, -0.1224, 0.1206, 0.4716, 0.1224],
  Watermelon: [-0.2277, 0, -0.2277, 0.2277, 0.4761, 0.2277],
  Lemon: [-0.0866, 0, -0.1, 0.0866, 0.224, 0.1],
  Grapes: [-0.1395, 0, -0.1193, 0.1395, 0.4226, 0.1193],
};
/** Las que salen como fruta normal (la piña es la especial). */
const FRUIT_NORMAL = ['Apple', 'Banana', 'Cherries', 'Orange', 'Pear', 'Strawberry', 'Lemon', 'Grapes', 'Watermelon'] as const;
/** Lo que mide de grande (su lado mayor, m) una fruta normal y la especial (la piña). */
export const FRUIT_SIZE = 0.28, FRUIT_SIZE_SPECIAL = 0.4;

/** La fruta de una pieza (la misma para el mismo `id`), con su centro en (`s`, `u`, `y`) y su lado mayor de `size`. */
function fruitPut(name: string, size: number, u: number, y: number): Put {
  const [x0, y0, z0, x1, y1, z1] = FRUITS[name], k = size / Math.max(x1 - x0, y1 - y0, z1 - z0);
  return put('food', name, ((z0 + z1) / 2) * k, u - ((x0 + x1) / 2) * k, y - ((y0 + y1) / 2) * k, { sx: k, sy: k, sz: k });
}

/** Lo que se ve de cada pieza (sin el suelo), relativo a `p.at` (ds 0 = su borde cercano). `ref`: la altura de los ojos de pie. */
export function piecePuts(p: Piece, ref: number, out: Put[]): Put[] {
  switch (p.k) {
    case 'low': {
      // la viga, con su borde de abajo donde obliga a agacharse; los dos postes, del suelo hasta pasarla un poco
      const bottom = ref + HEAD_TOP - p.h, th = 0.8, top = bottom + (PL.x1 - PL.x0) * th + 0.05;
      out.push(standPole(0, -1.1, GROUND_Y, top - GROUND_Y, th), standPole(0, 1.1, GROUND_Y, top - GROUND_Y, th));
      out.push(layPole(0, 0, bottom, 2.4, th));
      break;
    }
    case 'log':
      // un tronco (poste tumbado) de ~0,23 m de grueso, apoyado en las tablas
      out.push(layPole(0, 0, 0, 2.2, 0.62));
      break;
    // (la seta y el cangrejo no son instancias: son modelos animados que pinta el sistema, trek-system.ts)
    case 'gap': {
      // dos postes cortos en cada borde (uno a cada lado, sobre las tablas) marcan el hueco
      for (const ds of [-0.2, p.len + 0.2]) for (const u of [-DOCK_W / 2, DOCK_W / 2]) out.push(standPole(ds, u, -0.1, 0.9, 0.7));
      // y un trozo de muelle roto cuelga del borde cercano, hacia el hueco: dado la vuelta (ry = π) y tumbado hacia abajo
      // (rx), con los postes de debajo hacia ti, bajo las tablas, y no asomando por encima
      const rx = -1.24, S = { sx: DOCK_W / (DK.x1 - DK.x0), sy: 0.4, sz: 0.45 };
      // (se coloca por el punto de su borde delantero, que da la vuelta con él: a un palmo bajo el borde)
      const py = DK.top * S.sy, pz = -DK.z0 * S.sz;
      const oy = py * Math.cos(rx) - pz * Math.sin(rx), oz = py * Math.sin(rx) + pz * Math.cos(rx); // (dónde cae ese punto al girar)
      out.push(put('island', 'Dock_Broken', oz - 0.02, ((DK.x0 + DK.x1) / 2) * S.sx, -0.05 - oy, { ry: Math.PI, rx, ...S }));
      // las frutas en arco: siguen la curva del salto (en lo alto, a la altura de los ojos cuando el mundo baja)
      for (let i = 0; i < p.n; i++) {
        const u = (i + 0.5) / p.n, f = fruitPut(ARC_FRUITS[(p.id + i) % ARC_FRUITS.length], 0.18, 0, ref - 0.05 + ARC_LIFT * 4 * u * (1 - u));
        f.ds += u * p.len;
        f.tag = i;
        out.push(f);
      }
      break;
    }
    case 'chest':
      chestPuts(false, out);
      break;
    case 'spring': {
      // el trampolín: la seta del bosque, grande y chata, sobre las tablas (de 0,56 × 0,46 m a ~1,3 m de ancho y 0,6 de alto);
      // y las frutas del arco del vuelo, altas (con el vuelo, el mundo baja y te las encuentras a la altura de la cara)
      out.push(put('nature', 'Mushroom_Common', 0.3, 0, 0.017 * 1.3, { sx: 2.4, sy: 1.3, sz: 2.4 }));
      for (let i = 0; i < p.n; i++) {
        const u = (i + 0.5) / p.n, f = fruitPut(ARC_FRUITS[(p.id + i) % ARC_FRUITS.length], 0.22, 0, ref - 0.05 + SPRING_LIFT * 4 * u * (1 - u));
        f.ds += u * p.len;
        f.tag = i;
        out.push(f);
      }
      break;
    }
    case 'fork': {
      // la bifurcación: el sistema quita la pasarela de en medio; aquí, las dos ramas (tablas que se separan, corren a FORK_U a
      // cada lado y se vuelven a juntar) y un poste en la punta de cada separación
      for (const side of [-1, 1]) {
        dockLine(0, 0, FORK_RAMP, side * FORK_U, out);
        dockLine(FORK_RAMP, side * FORK_U, p.len - FORK_RAMP, side * FORK_U, out);
        dockLine(p.len - FORK_RAMP, side * FORK_U, p.len, 0, out);
      }
      out.push(standPole(FORK_RAMP * 0.6, 0, -0.1, 0.9, 0.7));
      break;
    }
    case 'glide': {
      // el barranco: sin tablas (el sistema deja el hueco), con postes en sus bordes, el muelle roto colgando del cercano y un
      // pedregal abajo; y sus frutas en el aire, por donde pasará tu cabeza planeando (el mundo baja con el vuelo)
      for (const ds of [-0.2, p.len + 0.2]) for (const u of [-DOCK_W / 2, DOCK_W / 2]) out.push(standPole(ds, u, -0.1, 0.9, 0.7));
      const st = ['Rock_2', 'Rock_3', 'Rock_4', 'Rock_5'];
      for (let i = 0, n = Math.max(3, Math.round(p.len / 1.1)); i < n; i++) {
        // (por debajo de las tablas: Rock_2, el más alto, mide 1,05 m; a 0,7–1, su cima queda bajo la pasarela)
        const s = 0.7 + 0.3 * (((i * 0.43 + p.id * 0.29) % 1 + 1) % 1), u = (((i * 0.71 + p.id * 0.13) % 1) - 0.5) * 2.4;
        out.push(put('island', st[(p.id + i) % 4], (i + 0.5) * (p.len / n), u, GROUND_Y - 0.05, { ry: i * 1.3, sx: s, sy: s, sz: s }));
      }
      for (let i = 0; i < p.n; i++) {
        const u = (i + 0.5) / p.n, f = fruitPut(ARC_FRUITS[(p.id + i) % ARC_FRUITS.length], 0.2, glideU(p, i), ref - 0.05 + GLIDE_LIFT * glideArc((u * p.len) / (p.len + LAND_PAST)));
        f.ds += u * p.len;
        f.tag = i;
        out.push(f);
      }
      break;
    }
    case 'box': {
      // el barril sorpresa: flotando sobre la pasarela, con su borde de abajo BOX_CLEAR por encima de tu coronilla (el
      // sistema lo hace girar); al saltar, el mundo baja y te lo encuentras en la cabeza
      const s = 0.75;
      out.push(put('island', 'Barrel', 0, 0, ref + HEAD_TOP + BOX_CLEAR - 0.00127464 * s, { sx: s, sy: s, sz: s }));
      break;
    }
    case 'step': {
      if (p.h <= 0 || p.len <= 0) break;
      // una repisa de roca: un bloque (Cliff1: el más llano, pero es un montículo: baja en los extremos) del suelo del paisaje
      // hasta justo bajo las tablas, más ancho que la pasarela, en trozos de ~4,5 m que se solapan; por delante sobresale
      // medio metro, para que la pared (el flanco del montículo) llegue a la altura de las tablas en at y se vea que hay que saltarla...
      const n = Math.max(1, Math.ceil(p.len / 4.5)), w = p.len / n, W = DOCK_W / 2 + 1;
      for (let i = 0; i < n; i++) out.push(rockFit('island', 'Cliff1', -W, W, GROUND_Y - 0.1, p.h - 0.04, i ? i * w - 0.6 : -STEP_FRONT, i < n - 1 ? (i + 1) * w + 0.6 : p.len + STEP_BACK, (p.id + i) % 2 === 1));
      // ...y encima, las tablas del muelle con su cara de arriba en y = h (el suelo por el que se sigue), de borde a borde
      dockRun(0, p.len, p.h, 0.7, out);
      // la dorada de encima: en medio, a la altura de los ojos sobre la plataforma (se coge subiendo de un supersalto)
      if (p.gold) {
        const g = fruitPut(GOLD_FRUIT, GOLD_SIZE, 0, p.h + ref);
        g.ds += p.len / 2;
        g.tag = GOLD_TAG;
        out.push(g);
      }
      break;
    }
    case 'crawl': {
      if (p.len <= 0) break;
      const L = p.len, W = DOCK_W / 2, f = p.id % 2 === 1;
      // el techo: losas de roca (Cliff1 aplastado, un montículo que baja en los extremos: se alargan más allá de las bocas y se
      // solapan) con su cara de abajo en CRAWL_ROOF, que cubren de lado a lado (y un metro de más por cada lado, sobre las
      // paredes) y de at a at + len sin huecos
      const nr = Math.max(1, Math.ceil((L + 2) / 3.5)), rw = (L + 2) / nr;
      for (let i = 0; i < nr; i++) out.push(rockFit('island', 'Cliff1', -W - 1, W + 1, CRAWL_ROOF, CRAWL_ROOF + 0.9, -1 + i * rw - (i ? 0.6 : 0), -1 + (i + 1) * rw + (i < nr - 1 ? 0.6 : 0), f !== (i % 2 === 1)));
      // las paredes: a cada lado, fuera de la pasarela, del suelo del paisaje hasta pasar el techo (se solapan con él)
      const nw = Math.max(1, Math.ceil((L + 2.8) / 3)), ww = (L + 2.8) / nw;
      for (const side of [-1, 1]) for (let i = 0; i < nw; i++) {
        const [a, b] = side > 0 ? [W, W + 1.6] : [-W - 1.6, -W];
        out.push(rockFit('island', 'Cliff1', a, b, GROUND_Y - 0.1, CRAWL_ROOF + 0.75, -1.4 + i * ww - (i ? 0.8 : 0), -1.4 + (i + 1) * ww + (i < nw - 1 ? 0.8 : 0), f !== (side > 0) !== (i % 2 === 1)));
      }
      // el interior pedregoso: piedras en el pie de las paredes, medio hundidas en ellas (fuera de la pasarela)
      const st = ['Rock_2', 'Rock_3', 'Rock_4', 'Rock_5'];
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1, s = L * (0.2 + 0.6 * ((i * 0.37 + 0.13) % 1));
        out.push(rockFit('island', st[(p.id + i) % 4], side > 0 ? W + 0.02 : -W - 0.55, side > 0 ? W + 0.55 : -W - 0.02, -0.12, 0.38, s - 0.3, s + 0.3, (p.id + i) % 3 === 1));
      }
      // la boca: dos peñascos altos a los lados, una peña encima y unos cantos a los pies, para verla de lejos
      const e = Math.min(L + 0.6, 3.4);
      out.push(rockFit('island', 'Cliff4', -4.4, -W - 0.5, GROUND_Y - 0.2, 3.4, -0.5, e, f), rockFit('island', 'Cliff3', W + 0.5, 4.4, GROUND_Y - 0.2, 3.6, -0.5, e, !f));
      out.push(rockFit('island', 'Cliff3', -W - 1.7, W + 1.7, CRAWL_ROOF + 0.4, 4.3, -0.4, e - 0.2, f));
      out.push(rockFit('nature', 'Rock_Medium_1', -5.2, -3.9, GROUND_Y - 0.15, GROUND_Y + 1.1, -0.6, 0.7), rockFit('nature', 'Rock_Medium_3', 3.9, 5.3, GROUND_Y - 0.15, GROUND_Y + 1.2, -0.5, 0.9, true));
      break;
    }
    case 'fruit': {
      if (p.side === 0 && !p.gold) break;
      // la dorada: alta, en el centro (hay que saltar)
      if (p.gold) {
        out.push(fruitPut(GOLD_FRUIT, GOLD_SIZE, 0, ref + GOLD_Y));
        break;
      }
      // flotando a la altura de la cabeza, al lado (el sistema la hace girar y flotar); la misma para el mismo id; la especial, la piña, más grande
      const name = p.special ? 'Pineapple' : FRUIT_NORMAL[Math.abs(p.id) % FRUIT_NORMAL.length];
      // (la sandía, más grande que una manzana: con el mismo tamaño parecía de juguete)
      out.push(fruitPut(name, p.special ? FRUIT_SIZE_SPECIAL : name === 'Watermelon' ? FRUIT_SIZE * 1.4 : FRUIT_SIZE, p.side * FRUIT_U, ref));
      break;
    }
    case 'cannon':
      // el barco pirata que dispara, a su lado del muelle, de costado (su largo, a lo largo del sendero); la bala la pinta el
      // sistema
      out.push(put('island', 'ShipLarge', 4 + SHIP_X, p.side * SHIP_U, SEA_Y + 0.8, { ry: p.side < 0 ? Math.PI / 2 : -Math.PI / 2 }));
      break;
    default:
      break; // floor, drop y gems: no se usan (las gemas del plan son las frutas)
  }
  return out;
}

/** El cofre del final del tramo, cerrado o (al llegar) abierto y lleno de oro: de cara al jugador (que viene de ds
 * negativos: el frente del cofre mira a +z del modelo, hacia atrás: ry = 0), en u = 0 y ds = 0,6, apoyado en las tablas. */
export function chestPuts(open: boolean, out: Put[]): Put[] {
  out.push(put('island', open ? 'Chest_Gold' : 'Chest_Closed', 0.6, 0, 0.0205194 * 0.9, { sx: 0.9, sy: 0.9, sz: 0.9 }));
  return out;
}

/* ------------------------------------------------------------------ el paisaje */

/** Del lado del marcador, lo más cerca del sendero que sale un árbol (m): con su copa, por fuera de él (board-spot.ts). */
const TREE_CLEAR = BOARD_CLEAR_U + 1.4;

const TREES = ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_2', 'Pine_4', 'Pine_5'];

/** El paisaje de cada tramo (los biomas de la Travesía, `TREK_BIOMES`, por orden: bosque, aldea, pradera del lago y pinar al
 * atardecer): sus árboles y cuánto lleva de cada cosa respecto al bosque (árboles, arbustos, rocas y hierbas y flores), con
 * las proporciones de RepArena (nTree, bush, rock, flower). La aldea, abierta y florida (sin casas: no hay pack de aldea);
 * el lago, pradera con matas y piedras; el atardecer, pinar cerrado con árboles secos. */
const DECO_BIOMES: ReadonlyArray<{ trees: readonly string[]; kT: number; kB: number; kR: number; kP: number }> = [
  { trees: TREES, kT: 1, kB: 1, kR: 1, kP: 1 },
  { trees: ['CommonTree_4', 'CommonTree_3', 'CommonTree_5'], kT: 0.2, kB: 0.8, kR: 0.35, kP: 1.8 },
  { trees: ['CommonTree_4', 'CommonTree_3', 'Pine_2'], kT: 0.45, kB: 1.2, kR: 1.35, kP: 2 },
  { trees: ['Pine_2', 'Pine_4', 'Pine_5', 'Pine_4', 'DeadTree_1'], kT: 1.1, kB: 0.6, kR: 1.65, kP: 0.5 },
];
/** Cuántos paisajes hay (uno por tramo, y vuelta a empezar). */
export const DECO_N = DECO_BIOMES.length;
const DEAD = ['DeadTree_1', 'DeadTree_2'];
const BUSHES = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
/** Hierbas y flores: escala mínima, lo que puede crecer y lo más cerca del centro (m) que pueden estar (el helecho abre
 * hojas de ~9 m a escala 1: no debe asomar sobre las tablas). */
const PLANTS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['Grass_Common_Short', 0.2, 0.15, 2.5], ['Grass_Common_Tall', 0.2, 0.15, 2.5], ['Grass_Wispy_Short', 0.2, 0.15, 2.5], ['Grass_Wispy_Tall', 0.2, 0.15, 2.5],
  ['Flower_3_Group', 0.22, 0.12, 2.5], ['Fern_1', 0.3, 0.2, 4.2], ['Plant_1_Big', 0.3, 0.2, 3], ['Plant_7_Big', 0.3, 0.2, 2.5], ['Clover_1', 0.3, 0.2, 2.5],
];

/** El paisaje a los lados de la pasarela en el trozo `chunk` (ds de chunk·24 a (chunk+1)·24), con el bioma `biome` (de
 * `DECO_BIOMES`; 0, el bosque): siempre el mismo para el mismo trozo y bioma. */
export function decoPuts(chunk: number, out: Put[], biome = 0, clear: -1 | 0 | 1 = 0): Put[] {
  const B = DECO_BIOMES[((biome % DECO_N) + DECO_N) % DECO_N], cnt = (base: number, k: number): number => Math.max(k < 1 ? 1 : 0, Math.round(base * k));
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0), s0 = chunk * TREK_CH;
  const between = (a: number, b: number): number => a + R() * (b - a);
  const pick = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(R() * l.length))];
  /** `n` cosas repartidas a lo largo del trozo (cada una en su franja, para que no se amontonen), a un lado u otro. */
  const scatter = (n: number, umin: number, umax: number, add: (ds: number, u: number) => void): void => {
    for (let i = 0; i < n; i++) add(s0 + ((i + R()) / n) * TREK_CH, (R() < 0.5 ? -1 : 1) * between(umin, umax));
  };
  // árboles: más lejos (el follaje de un árbol ancho no entra en la pasarela)
  scatter(cnt(5, B.kT) + Math.floor(R() * 3), 5, 14, (ds, u0) => {
    const s = between(0.7, 1.1);
    // (del lado del marcador, más allá de él: de 5–14 m pasan a 8–14)
    const u = Math.sign(u0) === clear ? clear * (TREE_CLEAR + ((Math.abs(u0) - 5) / 9) * (14 - TREE_CLEAR)) : u0;
    out.push(put('nature', pick(R() < 0.1 ? DEAD : B.trees), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s * between(0.95, 1.05), sz: s }));
  });
  scatter(cnt(3, B.kB) + Math.floor(R() * 2), 2.5, 10, (ds, u) => {
    const s = between(0.45, 0.75);
    out.push(put('nature', pick(BUSHES), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s, sz: s }));
  });
  scatter(cnt(2, B.kR) + Math.floor(R() * 2), 3, 12, (ds, u) => {
    const s = between(0.3, 0.75);
    out.push(put('nature', pick(ROCKS), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s * between(0.8, 1), sz: s }));
  });
  const n = cnt(6, B.kP) + Math.floor(R() * 5);
  for (let i = 0; i < n; i++) {
    const [name, base, spread, umin] = pick(PLANTS), s = base + R() * spread;
    out.push(put('nature', name, s0 + ((i + R()) / n) * TREK_CH, (R() < 0.5 ? -1 : 1) * between(umin, 10), GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s, sz: s }));
  }
  return out;
}
