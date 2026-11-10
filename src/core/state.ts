/**
 * Lo que comparten los sistemas del juego: la fase de la partida, dónde está el jugador y la bola, y los números del
 * marcador. Un solo objeto (sin copias por fotograma).
 */
import { Vector3 } from '@iwsdk/core';

export type Phase = 'menu' | 'playing' | 'over';

export const GAME = {
  phase: 'menu' as Phase,
  /** El menú que se ve: el principal, Opciones o ninguno (en plena partida). */
  menu: 'lobby' as 'lobby' | 'options' | 'none',
  /** Oleada en curso (1, 2, 3…) y si está en la pausa de entre oleadas (no sale nadie). */
  wave: 0,
  between: false,
  lives: 5,
  maxLives: 5,
  kills: 0,
  reps: 0,
  perfect: 0,
  /** Los puntos, el combo (repeticiones seguidas sin que te den ni falles) y el mejor, y los golpes recibidos. */
  score: 0,
  combo: 0,
  bestCombo: 0,
  taken: 0,
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
  /** Lo que ha subido la dificultad creciente (oleadas superadas): lo leen los enemigos (dv). */
  ramp: 0,
};

/** Avisos entre sistemas (los pone el sistema del juego al arrancar). */
export const HOOKS = {
  /** Un enemigo te ha dado (str: las vidas que quita, su fuerza). */
  playerHit: (_str?: number): void => {},
  /** Ha caído uno (kind: el que es; boss: el jefe). */
  foeDown: (_kind?: string, _boss?: boolean): void => {},
  /** Puntos de más (una piedra parada o esquivada) y si suman al combo. */
  score: (_pts: number, _combo?: boolean): void => {},
  /** Empezar la ronda (EMPEZAR, o Enter en el ordenador): lo pone la partida. */
  startRound: (): void => {},
  /** Abrir el menú principal delante de ti (last: cómo fue la ronda que acaba; vacío, ninguna) y quitarlo: lo pone el menú. */
  showMenu: (_last: string): void => {},
  hideMenu: (): void => {},
  /** Un aviso en el marcador (y, si es naranja, también en grande en el suelo): lo pone la partida. */
  say: (_text: string, _color: string, _secs: number): void => {},
  /** Unas chispas (n, del color c) en p: lo pone la partida. */
  sparks: (_p: Vector3, _n: number, _c: number): void => {},
};
