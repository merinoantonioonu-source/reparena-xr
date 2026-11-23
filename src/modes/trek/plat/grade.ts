/**
 * Las cuestas de la Travesía (elegido por el usuario: «el terreno entero ondula»): el sendero sube y baja con el terreno;
 * cuesta arriba cada repetición te lleva menos lejos y cuesta abajo más, con más inercia. El horizonte no se inclina nunca:
 * es el mundo el que sube y baja bajo tus pies (como en los saltos y las plataformas).
 *
 * Cada tramo lleva su perfil: colinas (subida, rellano y bajada iguales: lo que se pierde subiendo se recupera bajando y la
 * ronda no se alarga) entre los retos que piden suelo llano (el cofre, el jefe, el portal, los huecos y barrancos, las
 * plataformas, los túneles, los islotes, el trampolín, la bifurcación) y los primeros metros. Lo llano queda siempre a la
 * altura 0: el perfil empieza y acaba en 0 y solo sube entre medias. Lo empinado, por mundo (el risco, lo escarpado) y por
 * rango. Siempre igual para el mismo tramo (el fantasma y las pruebas lo repiten). Lógica pura (sin IWSDK).
 */
import { trekRng } from '../path.js';
import type { WorldKey } from './worlds.js';
import type { Piece, PieceKind } from './types.js';

/** Cada cuánto se guarda la altura (m). */
export const GRADE_STEP = 0.5;
/** Lo más empinado de cada mundo (subida por metro, en el rango más alto): el bosque, colinas; el risco, lo escarpado; las
 * islas, poca pendiente dentro de cada islote; la costa, las rampas del muelle. */
export const GRADE_MAX: Record<WorldKey, number> = { forest: 0.1, cliff: 0.16, sky: 0.04, coast: 0.06 };
/** Los primeros metros de cada tramo, llanos (para arrancar). */
export const GRADE_START = 12;
/** Lo que se ablanda el perfil (m): sin esquinas al empezar y acabar cada cuesta. */
const SOFT = 3;
/** Lo que necesita suelo llano alrededor (m de margen a cada lado). */
const FLAT: Partial<Record<PieceKind, number>> = { chest: 5, boss: 6, gap: 1.5, glide: 2, step: 1.5, crawl: 1.5, bob: 1.5, sink: 1.5, spring: 2, fork: 3, ledge: 1, cannon: 1 };

/** El perfil de un tramo: desde `s0`, la altura cada `GRADE_STEP` m (0 fuera). */
export interface Grade {
  s0: number;
  h: Float32Array;
}

/** El perfil del tramo de `s0` a `s1` con sus `pieces`, en el mundo `world`, con la pendiente de `k` (0 a 1: el rango) y su
 * semilla (`seed`: el tramo). */
export function buildGrade(pieces: readonly Piece[], s0: number, s1: number, world: WorldKey, k: number, seed: number, portal?: number): Grade {
  const n = Math.max(2, Math.ceil((s1 - s0) / GRADE_STEP) + 1), slope = new Float32Array(n), R = trekRng(((seed + 1) * 2654435761) >>> 0);
  const gmax = GRADE_MAX[world] * Math.max(0, Math.min(1, 0.55 + 0.45 * k));
  // lo que pide suelo llano
  const flat: [number, number][] = [[s0 - 1, s0 + GRADE_START], [s1 - 8, s1 + 1]];
  for (const p of pieces) {
    const m = FLAT[p.k];
    if (m !== undefined) flat.push([p.at - m, p.at + p.len + m]);
  }
  if (portal !== undefined) flat.push([portal - 6, portal + 6]);
  const at = (s: number): number => Math.round((s - s0) / GRADE_STEP);
  // el siguiente trozo que pide suelo llano, desde s: [empieza, acaba]
  const nextFlat = (x: number): [number, number] => {
    let a = s1, b = s1;
    for (const [p, q] of flat) if (q > x && p < a) [a, b] = [Math.max(p, x), q];
    return [a, b];
  };
  let s = s0 + GRADE_START + SOFT / 2, sign = R() < 0.5 ? -1 : 1;
  while (s < s1 - 8) {
    const [fa, fb] = nextFlat(s);
    // (lo que cabe hasta lo siguiente que pide suelo llano; si no cabe una colina, se salta)
    const room = fa - s - SOFT / 2;
    if (fa <= s || room < 8) {
      s = Math.max(s + 1, fb + SOFT / 2 + 0.25);
      continue;
    }
    // una colina (o una hondonada) que cabe: subida, rellano y bajada iguales
    const P = Math.min(R() * 6, room * 0.25), Lmax = (room - P) / 2, L = Math.min(Lmax, 4 + R() * (world === 'cliff' ? 14 : 9));
    const g = gmax * (0.55 + 0.45 * R()) * sign, a = s, b = s + 2 * L + P;
    // (la bajada, con las mismas muestras que la subida: vuelve justo a 0)
    const i0 = at(a), nUp = at(a + L) - i0, i1 = Math.max(at(b), i0 + 2 * nUp); // (sin pisarse)
    for (let i = i0; i < i0 + nUp; i++) slope[i] = g;
    for (let i = i1 - nUp; i < i1; i++) slope[i] = -g;
    sign = R() < 0.7 ? -sign : sign;
    s = b + SOFT + R() * 6;
  }
  // sin esquinas: la pendiente, media móvil de SOFT m (la colina sigue volviendo a 0); y la altura, sumándola
  const w = Math.max(1, Math.round(SOFT / GRADE_STEP / 2)), h = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let m = 0, c = 0;
    for (let j = i - w; j <= i + w; j++)
      if (j >= 0 && j < n) {
        m += slope[j];
        c++;
      }
    acc += (m / c) * GRADE_STEP;
    h[i] = acc;
  }
  // (lo que el redondeo haya dejado al final, repartido: el tramo acaba en 0)
  const end = h[n - 1];
  if (Math.abs(end) > 1e-6) for (let i = 0; i < n; i++) h[i] -= end * (i / (n - 1));
  return { s0, h };
}

/** La altura del sendero en s (m) con los perfiles de los tramos (0 fuera de ellos). */
export function gradeH(G: readonly Grade[], s: number): number {
  for (let i = G.length - 1; i >= 0; i--) {
    const g = G[i], x = (s - g.s0) / GRADE_STEP;
    if (x < 0) continue;
    if (x >= g.h.length - 1) return 0;
    const j = Math.floor(x), f = x - j;
    return g.h[j] + (g.h[j + 1] - g.h[j]) * f;
  }
  return 0;
}

/** La pendiente del sendero en s (subida por metro; negativa, bajada). */
export function gradeSlope(G: readonly Grade[], s: number): number {
  return (gradeH(G, s + GRADE_STEP) - gradeH(G, s - GRADE_STEP)) / (2 * GRADE_STEP);
}

/** Lo que te lleva cada repetición con la pendiente `g` (1, en llano): cuesta arriba, hasta 0,65 en lo más empinado; cuesta
 * abajo, hasta 1,2 (el esfuerzo de subir y el empujón de bajar; los números, para ajustarlos con el usuario). */
export const GRADE_UP = 0.65, GRADE_DOWN = 1.2;
export function gradeK(g: number): number {
  const t = Math.min(1, Math.abs(g) / GRADE_MAX.cliff);
  return g >= 0 ? 1 - (1 - GRADE_UP) * t : 1 + (GRADE_DOWN - 1) * t;
}
