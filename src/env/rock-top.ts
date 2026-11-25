/**
 * Dónde está la cara de arriba de una roca de los kits (con la rejilla de alturas de rock-tops.ts): para apoyar en ella lo que
 * va encima (un pino en la pared del risco, una palmera en un islote, un árbol en una isla del cielo) en vez de ponerlo a una
 * altura a ojo, que dejaba árboles flotando (pedido del usuario: «los árboles nunca están flotando»). Lógica pura.
 */
import { ROCK_N, ROCK_TOPS } from './rock-tops.js';

/** Lo alto de la roca `n` en (x, z) de sus coordenadas (m, a escala 1); null fuera de ella o donde no hay roca. */
export function modelTop(n: string, x: number, z: number): number | null {
  const M = ROCK_TOPS[n];
  if (!M) return null;
  const [x0, z0, x1, z1] = M.b, N = ROCK_N, fx = ((x - x0) / (x1 - x0)) * N - 0.5, fz = ((z - z0) / (z1 - z0)) * N - 0.5;
  if (fx < -0.5 || fz < -0.5 || fx > N - 0.5 || fz > N - 0.5) return null;
  const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fz))), a = Math.max(0, Math.min(1, fx - i)), b = Math.max(0, Math.min(1, fz - j));
  const t00 = M.t[j * N + i], t10 = M.t[j * N + i + 1], t01 = M.t[(j + 1) * N + i], t11 = M.t[(j + 1) * N + i + 1];
  if (t00 === null || t10 === null || t01 === null || t11 === null) return null;
  return ((t00 * (1 - a) + t10 * a) * (1 - b) + (t01 * (1 - a) + t11 * a) * b) / 1000;
}

/** Lo alto de la roca `n` puesta en (X, Y, Z), girada `ry` y a escala (sx, sy, sz), en el punto (px, pz) del mundo; null si
 * no hay roca debajo. */
export function placedTop(n: string, X: number, Y: number, Z: number, ry: number, sx: number, sy: number, sz: number, px: number, pz: number): number | null {
  const dx = px - X, dz = pz - Z, c = Math.cos(ry), s = Math.sin(ry);
  const t = modelTop(n, (dx * c - dz * s) / sx, (dx * s + dz * c) / sz);
  return t === null ? null : Y + t * sy;
}

/** ¿Es la roca casi llana alrededor de (px, pz) (a r m), como para que algo se tenga en pie encima? Su desnivel, como mucho
 * `drop` m. */
export function placedFlat(n: string, X: number, Y: number, Z: number, ry: number, sx: number, sy: number, sz: number, px: number, pz: number, r = 0.5, drop = 0.6): boolean {
  let lo = Infinity, hi = -Infinity;
  for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const t = placedTop(n, X, Y, Z, ry, sx, sy, sz, px + ox, pz + oz);
    if (t === null) return false;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return hi - lo <= drop;
}
