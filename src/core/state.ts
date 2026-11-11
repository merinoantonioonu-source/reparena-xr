/**
 * Lo que comparten los sistemas del juego: la fase de la partida, dónde está el jugador y la bola, y los números del
 * marcador. Un solo objeto (sin copias por fotograma).
 */
import { Vector3 } from '@iwsdk/core';

export type Phase = 'menu' | 'playing' | 'over';

export const GAME = {
  phase: 'menu' as Phase,
  /** El menú que se ve: el principal, Opciones o ninguno (en plena partida). */
  menu: 'lobby' as 'lobby' | 'options' | 'summary' | 'pause' | 'none',
  /** En pausa (la ronda se para: nadie se mueve ni sale). */
  paused: false,
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
  /** Tumbado (superman, plancha lateral): la altura a la que vienen los voladores (0: de pie). */
  lowFly: 0,
  /** El superman: lo que aguantas arriba, si estás arriba, el tiempo de la ronda y cuándo puede lanzarse el siguiente. */
  sup: null as { hold: number; up: boolean; time: number; next: { t: number } } | null,
  /** Lo que ha subido la dificultad creciente (oleadas superadas): lo leen los enemigos (dv). */
  ramp: 0,
};

/** Lo que dice el aviso del centro de la vista (RepArena: drawCenter): la calibración (título, dos líneas, una nota arriba a
 * la derecha, un estado, la cuenta y la barra) o «¡PREPÁRATE!» con la cuenta atrás. */
export interface CenterInfo {
  kind: 'calib' | 'ready';
  title: string;
  lines: string[];
  note: [string, string] | null;
  status: [string, string] | null;
  count: string;
  bar: number;
}

/** Los avisos de la vista (src/ui/view-panels.ts): lo que dice el del centro (null: no se ve) y si se ve la carátula del
 * duelo (mientras, la ronda espera: no se calibra ni empieza nada). */
export const VIEW = {
  center: null as CenterInfo | null,
  duel: false,
};

/** Avisos entre sistemas (los pone el sistema del juego al arrancar). */
export const HOOKS = {
  /** Un enemigo te ha dado (str: las vidas que quita, su fuerza). */
  playerHit: (_str?: number): void => {},
  /** Ha caído uno (kind: el que es; boss: el jefe). */
  foeDown: (_kind?: string, _boss?: boolean, _target?: unknown): void => {},
  /** Puntos de más (una piedra parada o esquivada) y si suman al combo. */
  score: (_pts: number, _combo?: boolean): void => {},
  /** Empezar la ronda (EMPEZAR, o Enter en el ordenador): lo pone la partida. */
  startRound: (): void => {},
  /** Abrir el menú principal delante de ti (last: cómo fue la ronda que acaba; vacío, ninguna) y quitarlo: lo pone el menú. */
  showMenu: (_last: string): void => {},
  hideMenu: (): void => {},
  /** El resumen de la ronda (RepArena, opción A): lo enseña el menú. */
  showSummary: (_s: unknown): void => {},
  /** La pausa: pararla y seguir (los pone el menú), recolocarse, terminar la ronda y volver al menú (los pone la partida). */
  pause: (): void => {},
  resume: (): void => {},
  recalibrate: (): void => {},
  endRound: (): void => {},
  toLobby: (): void => {},
  /** Un aviso en el marcador o, si pide hacer algo ya (toast), en la vista (y, si es naranja, también en grande en el
   * suelo): lo pone la partida. */
  say: (_text: string, _color: string, _secs: number, _toast?: boolean): void => {},
  /** Un logro grande y dorado (RepArena: trophy): lo pone la partida. */
  trophy: (_title: string, _sub?: string, _color?: string): void => {},
  /** Un aviso breve en la vista (lo que pide hacer algo ya): lo pone el sistema de los avisos de la vista. */
  toast: (_text: string, _color: string, _secs: number): void => {},
  /** La carátula del duelo al empezar la ronda: la enseña el sistema de los avisos de la vista (si no toca, no hace nada). */
  duel: (): void => {},
  /** Unas chispas (n, del color c) en p: lo pone la partida. */
  sparks: (_p: Vector3, _n: number, _c: number): void => {},
};
