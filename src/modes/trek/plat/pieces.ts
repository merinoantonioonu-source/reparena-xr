/**
 * La Travesía de plataformas: qué modelo va dónde. Lógica pura (sin IWSDK ni three): cada función devuelve una lista de
 * `Put` (un modelo del Pirate Kit o del bosque con su sitio, giro y escala) y el sistema que pinta (trek-system.ts) los
 * pone con instancias. Nada se crea de cero: todo sale de `island.glb` y `nature.glb`.
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
 * - `Chest_Closed`: x −0,697…0,697; y −0,021…0,861; z −0,444…0,444 (una caja de 1,39 × 0,88 × 0,89 m).
 */
import { trekRng, TREK_CH } from '../path.js';
import { HEAD_TOP } from '../env.js';
import type { Piece } from './types.js';

export type Kit = 'island' | 'nature';

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
  /** El techo del túnel: sube con las flexiones hechas (`roofLift`, lo suma el sistema que pinta). */
  lift?: boolean;
}

/** A qué altura sobre las tablas está el techo del túnel al llegar (m: hay que pasar en plancha). */
export const CRAWL_ROOF = 0.75;

/** Lo que ha subido el techo del túnel (m): con cada flexión, un poco; con todas, por encima de la cabeza de pie. */
export function roofLift(p: Piece, ref: number): number {
  if (p.k !== 'crawl' || p.n <= 0) return 0;
  return Math.min(1, p.done / p.n) * Math.max(0, ref + HEAD_TOP + 0.25 - CRAWL_ROOF);
}

/** El suelo del paisaje, bajo la pasarela (m). */
export const GROUND_Y = -1.2;

/** Las tablas del `Dock` (a escala 1): su ancho, su largo, dónde acaba la cara de arriba y hasta dónde bajan los postes. */
const DK = { x0: -0.98448, x1: 1.0, z0: -1.02643, z1: 1.05486, top: 0.488067, bottom: -1.999561, under: 0.138521 } as const;
/** `Barrel` y `Chest_Closed` (a escala 1): lo que miden y dónde tienen la base. */
const BR = { r: 0.357345, y0: 0.00127464, y1: 0.661185 } as const;
const CH = { x1: 0.697393, y0: -0.0205194, y1: 0.860731, z1: 0.443711 } as const;
/** `Dock_Pole` (a escala 1). */
const PL = { x0: -0.201654, x1: 0.164895, y0: -1.999561, y1: 1.013127, z0: -0.200475, z1: 0.175503 } as const;
const PL_LEN = PL.y1 - PL.y0;

/** Lo que mide la pasarela de ancho (m: de borde a borde de las tablas). */
export const DOCK_W = 1.9;
/** Lo que mide un tramo de muelle a lo largo del sendero, a su escala (m): sus tablas, sin los postes que sobresalen. */
export const DOCK_LEN = DK.z1 - DK.z0;

/** Todos los nombres de modelo que usa este archivo, por kit (el sistema que pinta los carga de aquí). */
export const KIT_MODELS: Record<Kit, string[]> = {
  island: ['Dock', 'Dock_Broken', 'Dock_Pole', 'Barrel', 'Chest_Closed'],
  nature: [
    'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_2', 'Pine_4', 'Pine_5', 'DeadTree_1', 'DeadTree_2',
    'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
    'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Flower_3_Group', 'Fern_1', 'Plant_1_Big', 'Plant_7_Big', 'Clover_1',
  ],
};

function put(kit: Kit, n: string, ds: number, u: number, y: number, o: Partial<Put> = {}): Put {
  return { kit, n, ds, u, y, ry: o.ry ?? 0, rx: o.rx ?? 0, rz: o.rz ?? 0, sx: o.sx ?? 1, sy: o.sy ?? 1, sz: o.sz ?? 1 };
}

/* ------------------------------------------------------------------ el suelo */

/** Un tramo de muelle que cubre las tablas de `a` a `b` (a lo largo), con su cara de arriba en `top` y escalado a lo alto
 * por `sy` (las tablas y los postes, a la vez). Estirado o encogido a lo largo para que encaje justo. */
function dockPut(a: number, b: number, top: number, sy: number, lift = false): Put {
  const sz = (b - a) / DOCK_LEN, sx = DOCK_W / (DK.x1 - DK.x0);
  // (el −z del modelo es «delante»: el centro de sus tablas está en −zc a lo largo)
  const zc = (DK.z0 + DK.z1) / 2;
  const q = put('island', 'Dock', (a + b) / 2 + zc * sz, -((DK.x0 + DK.x1) / 2) * sx, top - DK.top * sy, { sx, sy, sz });
  if (lift) q.lift = true;
  return q;
}

/** Un tramo de muelle del suelo: de `a` a `b`, con la cara de arriba en y = 0 y los postes hasta `GROUND_Y`. */
function dockAt(a: number, b: number, out: Put[]): void {
  out.push(dockPut(a, b, 0, -GROUND_Y / (DK.top - DK.bottom)));
}

/** Tablas de `a` a `b` sin huecos (tramos casi de `DOCK_LEN`, ni estirados ni encogidos de más). */
function dockRun(a: number, b: number, top: number, sy: number, lift: boolean, out: Put[]): void {
  const m = Math.max(1, Math.round((b - a) / DOCK_LEN)), w = (b - a) / m;
  for (let i = 0; i < m; i++) out.push(dockPut(a + i * w, a + (i + 1) * w, top, sy, lift));
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

/** Un barril de pie con su base en `y0`, de `h` de alto y `d` de diámetro por `l` a lo largo; centrado en (`ds`, `u`). */
function barrelAt(ds: number, u: number, y0: number, h: number, d: number, l: number): Put {
  const sy = h / (BR.y1 - BR.y0);
  return put('island', 'Barrel', ds, u, y0 - BR.y0 * sy, { sx: d / (2 * BR.r), sy, sz: l / (2 * BR.r) });
}

/** Una caja (`Chest_Closed`) con su base en `y0`, de `h` de alto, `w` de ancho y `l` a lo largo; centrada en (`ds`, `u`). */
function chestAt(ds: number, u: number, y0: number, h: number, w: number, l: number): Put {
  const sy = h / (CH.y1 - CH.y0);
  return put('island', 'Chest_Closed', ds, u, y0 - CH.y0 * sy, { sx: w / (2 * CH.x1), sy, sz: l / (2 * CH.z1) });
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
    case 'side': {
      if (p.side === 0) break;
      // el barril (a 1,1: radio 0,39) con su borde interior a ~0,1 m del centro; el otro lado queda libre. Unos, uno; otros, dos
      const s = 1.1, y = -0.00127464 * s;
      if (p.id % 2) out.push(put('island', 'Barrel', 0, p.side * 0.5, y, { sx: s, sy: s, sz: s }));
      else out.push(put('island', 'Barrel', -0.45, p.side * 0.5, y, { sx: s, sy: s, sz: s }), put('island', 'Barrel', 0.45, p.side * 0.5, y, { sx: s, sy: s, sz: s }));
      break;
    }
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
      break;
    }
    case 'chest':
      // de cara al jugador (que viene de ds negativos): el frente del cofre mira a +z del modelo, hacia atrás: ry = 0
      out.push(put('island', 'Chest_Closed', 0.6, 0, 0.0205194 * 0.9, { sx: 0.9, sy: 0.9, sz: 0.9 }));
      break;
    case 'step': {
      if (p.h <= 0 || p.len <= 0) break;
      // las tablas del muelle, con su cara de arriba en y = h, de at a at + len; su grosor y sus postes (que llegan al suelo
      // del paisaje, si no se pasan de gruesos) escalados a lo alto, sin comerse más del 40 % de la altura
      const sy = Math.min(0.7, Math.max(0.45, (p.h - GROUND_Y) / (DK.top - DK.bottom)), (0.4 * p.h) / (DK.top - DK.under));
      dockRun(0, p.len, p.h, sy, false, out);
      // debajo, barriles de pie de lado a lado (dos por fila, en filas de ~0,95 m: se ven por los lados y por delante) hasta
      // las tablas; si hace falta más altura, apilados. Con poca altura, el barril se hunde un poco en el suelo (y se tapa)
      const hs = p.h - (DK.top - DK.under) * sy, n = Math.max(1, Math.round(hs / 0.8)), lh = hs / n;
      const rows = Math.max(1, Math.round(p.len / 0.95)), rl = p.len / rows, d = DOCK_W / 2 + 0.02;
      for (let k = 0; k < n; k++) {
        const top = (k + 1) * lh + (k === n - 1 ? 0.02 : 0), bh = n === 1 ? Math.min(Math.max(hs, 0.5), hs + 0.15) : lh;
        for (let i = 0; i < rows; i++) for (const u of [-DOCK_W / 4, DOCK_W / 4]) out.push(barrelAt((i + 0.5) * rl, u, top - bh, bh, d, rl));
      }
      break;
    }
    case 'crawl': {
      if (p.len <= 0) break;
      // el techo (tablas del muelle) con su cara de abajo en CRAWL_ROOF: todo él sube con las flexiones (`lift`); y a cada
      // lado, fuera de la pasarela, postes que llegan del suelo del paisaje hasta pasar el techo con todas las flexiones hechas
      const sy = 0.5;
      dockRun(0, p.len, CRAWL_ROOF + (DK.top - DK.under) * sy, sy, true, out);
      const tip = ref + HEAD_TOP + 0.25 + 0.3, th = 0.8, m = Math.max(1, Math.round(p.len / DOCK_LEN)), e = Math.min(0.2, p.len / 2);
      for (let i = 0; i <= m; i++) for (const u of [-DOCK_W / 2 - 0.25, DOCK_W / 2 + 0.25]) out.push(standPole(e + (i / m) * (p.len - 2 * e), u, GROUND_Y, tip - GROUND_Y, th));
      break;
    }
    case 'burpee': {
      if (p.h <= 0 || p.len <= 0) break;
      // el muro: cajas (cofres cerrados) de borde a borde, dos por fila, en filas de ~0,9 m de grueso y apiladas hasta h: macizo
      const n = Math.max(1, Math.ceil(p.h / 0.9)), lh = p.h / n, rows = Math.max(1, Math.round(p.len / 0.9)), rl = p.len / rows;
      for (let k = 0; k < n; k++) for (let i = 0; i < rows; i++) for (const u of [-DOCK_W / 4, DOCK_W / 4]) out.push(chestAt((i + 0.5) * rl, u, k * lh, lh, DOCK_W / 2, rl));
      break;
    }
    default:
      break; // floor, drop, foe y gems: llegan en otros PR
  }
  return out;
}

/* ------------------------------------------------------------------ el paisaje */

const TREES = ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'Pine_2', 'Pine_4', 'Pine_5'];
const DEAD = ['DeadTree_1', 'DeadTree_2'];
const BUSHES = ['Bush_Common', 'Bush_Common', 'Bush_Common_Flowers'];
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
/** Hierbas y flores: escala mínima, lo que puede crecer y lo más cerca del centro (m) que pueden estar (el helecho abre
 * hojas de ~9 m a escala 1: no debe asomar sobre las tablas). */
const PLANTS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['Grass_Common_Short', 0.2, 0.15, 2.5], ['Grass_Common_Tall', 0.2, 0.15, 2.5], ['Grass_Wispy_Short', 0.2, 0.15, 2.5], ['Grass_Wispy_Tall', 0.2, 0.15, 2.5],
  ['Flower_3_Group', 0.22, 0.12, 2.5], ['Fern_1', 0.3, 0.2, 4.2], ['Plant_1_Big', 0.3, 0.2, 3], ['Plant_7_Big', 0.3, 0.2, 2.5], ['Clover_1', 0.3, 0.2, 2.5],
];

/** El paisaje a los lados de la pasarela en el trozo `chunk` (ds de chunk·24 a (chunk+1)·24): siempre el mismo para el mismo trozo. */
export function decoPuts(chunk: number, out: Put[]): Put[] {
  const R = trekRng((Math.imul(chunk | 0, 0x9e3779b1) ^ 0x5bd1e995) >>> 0), s0 = chunk * TREK_CH;
  const between = (a: number, b: number): number => a + R() * (b - a);
  const pick = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(R() * l.length))];
  /** `n` cosas repartidas a lo largo del trozo (cada una en su franja, para que no se amontonen), a un lado u otro. */
  const scatter = (n: number, umin: number, umax: number, add: (ds: number, u: number) => void): void => {
    for (let i = 0; i < n; i++) add(s0 + ((i + R()) / n) * TREK_CH, (R() < 0.5 ? -1 : 1) * between(umin, umax));
  };
  // árboles: más lejos (el follaje de un árbol ancho no entra en la pasarela)
  scatter(5 + Math.floor(R() * 3), 5, 14, (ds, u) => {
    const s = between(0.7, 1.1);
    out.push(put('nature', pick(R() < 0.1 ? DEAD : TREES), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s * between(0.95, 1.05), sz: s }));
  });
  scatter(3 + Math.floor(R() * 2), 2.5, 10, (ds, u) => {
    const s = between(0.45, 0.75);
    out.push(put('nature', pick(BUSHES), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s, sz: s }));
  });
  scatter(2 + Math.floor(R() * 2), 3, 12, (ds, u) => {
    const s = between(0.3, 0.75);
    out.push(put('nature', pick(ROCKS), ds, u, GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s * between(0.8, 1), sz: s }));
  });
  const n = 6 + Math.floor(R() * 5);
  for (let i = 0; i < n; i++) {
    const [name, base, spread, umin] = pick(PLANTS), s = base + R() * spread;
    out.push(put('nature', name, s0 + ((i + R()) / n) * TREK_CH, (R() < 0.5 ? -1 : 1) * between(umin, 10), GROUND_Y, { ry: R() * Math.PI * 2, sx: s, sy: s, sz: s }));
  }
  return out;
}
