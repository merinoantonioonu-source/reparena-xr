/**
 * Lo que comparten los sistemas del juego: la fase de la partida, dónde está el jugador y la bola, y los números del
 * marcador. Un solo objeto (sin copias por fotograma).
 */
import { Vector3 } from '@iwsdk/core';

export type Phase = 'menu' | 'playing' | 'over';

export const GAME = {
  phase: 'menu' as Phase,
  /** Oleada en curso (1, 2, 3…) y si está en la pausa de entre oleadas (no sale nadie). */
  wave: 0,
  between: false,
  lives: 5,
  maxLives: 5,
  kills: 0,
  reps: 0,
  perfect: 0,
  best: 0,
  startTime: 0,
  /** Dónde está la cabeza (mundo) y hacia dónde mira el cuerpo (horizontal, unitario). */
  head: new Vector3(0, 1.6, 0),
  fwd: new Vector3(0, 0, -1),
  /** La bola: si se ve (y los zombis la rodean), dónde está y su radio. */
  ballOn: false,
  ballPos: new Vector3(),
  ballR: 0.26,
  /** La rapidez de los zombis de esta oleada (m/s). */
  foeSpeed: 1.0,
};

/** Avisos entre sistemas (los pone el sistema del juego al arrancar). */
export const HOOKS = {
  /** Un zombi te ha dado. */
  playerHit: (): void => {},
  /** Ha caído un zombi. */
  foeDown: (): void => {},
};
