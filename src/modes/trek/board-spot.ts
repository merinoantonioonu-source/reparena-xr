/**
 * Dónde va el marcador en la Travesía (elegido por el usuario: «lado despejado y más alto»). Flotaba como en Combate (a
 * 5 m, a un lado, con el borde de abajo a 1,2 m) y el paisaje pasaba a través de él: en el risco quedaba dentro de la pared
 * de roca y, en los demás mundos, lo atravesaban rocas y árboles. Ahora:
 *
 * - en el risco, siempre a la derecha, sobre el vacío (a la izquierda está la pared);
 * - en los demás, en el lado elegido («Marcador»), con el borde de abajo a `TREK_BOARD_BOTTOM` (por encima de arbustos y
 *   rocas), y el paisaje de ese lado no pone nada alto (árboles, islotes, palmeras) más cerca del sendero que
 *   `BOARD_CLEAR_U` (pieces.ts: `decoPuts`, `skyDecoPuts`, `coastDecoPuts`).
 *
 * Lógica pura (sin IWSDK).
 */
import type { WorldKey } from './plat/worlds.js';

/** El borde de abajo del marcador en la Travesía (m sobre las tablas). */
export const TREK_BOARD_BOTTOM = 2.0;
/** Lo más cerca del sendero (m, a un lado) que puede quedar algo alto del lado del marcador: su borde de fuera, con margen. */
export const BOARD_CLEAR_U = 6.6;

/** Las medidas del marcador a un lado (las de Combate, src/combat/game.ts: `placeBoard`): a `R` m, `W` m de ancho. */
const R = 5.0, W = 4.2, H = W * 0.445, D = 11, SP = 4.62, EYE = 1.6;

export interface BoardSpot {
  /** El lado: −1, a la izquierda; 1, a la derecha. */
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  /** Su inclinación hacia ti y su giro (rad, en orden YXZ). */
  rx: number;
  ry: number;
  /** Su ancho (m). */
  w: number;
}

/** El lado del marcador en el mundo `world` con el ajuste «Marcador» `pick` (en el risco, siempre a la derecha). */
export function trekBoardSide(world: WorldKey, pick: string): -1 | 1 {
  if (world === 'cliff') return 1;
  return pick === 'right' ? 1 : -1;
}

/** Dónde va el marcador en el mundo `world` con el ajuste `pick` («left» o «right»). */
export function trekBoardSpot(world: WorldKey, pick: string, out: BoardSpot): BoardSpot {
  const side = trekBoardSide(world, pick);
  // (el mismo ángulo que en Combate: algo por delante, a un lado, todo él a la vista)
  const a = Math.min(1.2, Math.max(0.85, Math.atan((SP + 1.3) / D) + Math.atan(W / 2 / R) + 0.03));
  const yc = TREK_BOARD_BOTTOM + H / 2;
  out.side = side;
  out.x = side * R * Math.sin(a);
  out.y = yc;
  out.z = -R * Math.cos(a);
  out.rx = Math.atan((yc - EYE) / R) * 0.8;
  out.ry = Math.atan2(-out.x, -out.z);
  out.w = W;
  return out;
}

/** Lo que ocupa a lo ancho (m desde el centro del sendero, de dentro a fuera), para comprobar que nada lo atraviesa. */
export function boardSpan(b: BoardSpot): [number, number] {
  const half = (b.w / 2) * Math.abs(Math.cos(b.ry));
  const c = Math.abs(b.x);
  return [c - half, c + half];
}
