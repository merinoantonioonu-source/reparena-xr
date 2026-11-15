/**
 * La Travesía de plataformas (RepArena XR): los contratos. El jugador no anda por la habitación: el recorrido viene hacia él
 * a fuerza de repeticiones (`Trek`, path.ts, pone el impulso) y le pide otros movimientos (saltar un hueco, agacharse bajo
 * una viga, apartarse de un barril…). Aquí está lo que se comparten la lógica pura (moves.ts, course.ts, runner.ts) y el
 * sistema que la pinta (trek-system.ts): las piezas del recorrido, lo que la lógica pide al juego (`PlatEnv`) y lo que le
 * devuelve (`PlatEv`, sucesos que la partida aplica en orden y vacía).
 *
 * Sin IWSDK. Las distancias van en metros a lo largo del sendero (`s`, hacia delante) y a su derecha (`u`); la altura, `y`,
 * sobre el suelo de la pasarela. La cabeza, en la arena (x a un lado, y arriba, z hacia ti).
 */

/** Lo que hay en el recorrido. */
export type PieceKind =
  | 'floor' // suelo corrido (no es un reto: la pasarela de tablas)
  | 'gap' // hueco en el suelo: salto en marcha (fluido)
  | 'low' // viga baja: agacharse (fluido)
  | 'side' // obstáculo a un lado: paso lateral (fluido)
  | 'log' // tronco para saltar en marcha (fluido)
  | 'step' // plataforma más alta: se sube de un salto en marcha y se baja sola al acabar (fluido; PR B)
  | 'drop' // bajada (sin usar de momento: la plataforma ya baja sola al acabar)
  | 'crawl' // túnel bajo: al suelo en plancha y n flexiones; cada una sube el techo (paso; PR B)
  | 'burpee' // muro bajo: al suelo, arriba y salto por encima (paso; PR B)
  | 'foe' // enemigo que pisar saltando (fluido; PR D)
  | 'gems' // hilera de gemas que alcanzar con la mano (fluido; PR D)
  | 'chest'; // fin del tramo (paso)

/** Los que se pasan sin parar (el avance siempre sigue: se entrenan los reflejos, pedido del usuario tras probar el PR A):
 * si fallas, chocas o tropiezas (frenas y pierdes la racha, sin perder vidas, y sigues). El hueco también: si no saltas a
 * tiempo, tropiezas al cruzarlo (nunca se cae). */
export const FLUID: readonly PieceKind[] = ['gap', 'step', 'low', 'side', 'log', 'foe', 'gems'];
/** Los pasos: el mundo se para a `STOP_AT` y el movimiento pedido es el que te lleva al otro lado (el cofre, al acabar el
 * tramo; los de suelo del PR B, por seguridad: no se baja al suelo con el mundo en marcha). */
export const HALT: readonly PieceKind[] = ['crawl', 'burpee', 'chest'];
/** Los que se cruzan saltando (entre dos seguidos, al menos `JUMP_GAP_S` a velocidad máxima). */
export const JUMPS: readonly PieceKind[] = ['gap', 'log', 'step', 'foe', 'burpee'];
/** Los de suelo (tras ellos, `FLOOR_UP_S` para levantarse antes de otra cosa). */
export const FLOORS: readonly PieceKind[] = ['crawl', 'burpee'];

/** Dónde te paras ante un paso (m antes de su borde cercano) y dónde aterrizas como poco tras el hueco (m pasado su borde
 * lejano). */
export const STOP_AT = 1;
export const LAND_PAST = 0.6;
/** Ante un paso, el mundo no te para de golpe: frenas con esta deceleración (m/s²) hasta quedarte a `STOP_AT`. */
export const HALT_BRAKE = 2.5;
/** Lo que se recorre bajando de una plataforma, al acabar (m): libre antes de la pieza siguiente. */
export const DROP_ROOM = 2;
/** Hasta dónde se ve: las piezas salen allí, entre la niebla, no de golpe cerca (regla de la Travesía). */
export const PLAT_SEE = 88;
/** La carrera antes de la primera pieza de cada tramo (m). */
export const RUN_UP = 15;
/** Separaciones, en segundos a velocidad máxima (se pasan a metros con `CourseEnv.vmax`):
 * - tras un túnel o un muro, el tiempo de levantarte (BURPEE_UP de Arcos);
 * - entre dos saltos, el de caer y volver a saltar (ARX_JUMP_GAP de Arcos);
 * - tras un obstáculo a un lado, el de volver al centro. */
export const FLOOR_UP_S = 3;
export const JUMP_GAP_S = 1.1;
export const SIDE_BACK_S = 1.5;
/** Lo mínimo entre el final de una pieza y el principio de la siguiente (m), sea cual sea la velocidad. */
export const MIN_GAP = 4;

/** Una pieza del recorrido. La crea `buildCourse` (course.ts); el `Runner` (runner.ts) cambia su estado. */
export interface Piece {
  /** Única en la ronda (para que el sistema sepa cuál pintar o quitar). */
  id: number;
  k: PieceKind;
  /** Su borde cercano, a lo largo del sendero (m). */
  at: number;
  /** Lo que mide a lo largo del sendero (m): el hueco, lo de arriba de la plataforma, el túnel, el grosor del muro; 0 en
   * las finas (viga, tronco). */
  len: number;
  /** El obstáculo a un lado: a qué lado está (−1 izquierda, 1 derecha; hay que apartarse al otro). 0 en los demás. */
  side: -1 | 0 | 1;
  /** Viga baja: cuánto hay que bajar la coronilla bajo tu altura de pie (m). Plataforma: lo que sube el suelo (m). Muro:
   * su altura (m). 0 en los demás. */
  h: number;
  /** Túnel: las flexiones que pide. Gemas: cuántas. 0 en los demás. */
  n: number;
  /** El tramo al que pertenece (desde 0). */
  tramo: number;
  /* ---- su estado (lo lleva el Runner; empieza en false/0) ---- */
  /** Ya salió a la vista (suceso 'show'). */
  shown: boolean;
  /** Ya se avisó de ella (lo que pide, a unos metros). */
  warned: boolean;
  /** Ya se juzgó (pasada, chocada o cruzada). */
  judged: boolean;
  /** Cómo acabó: superada (true), chocada o rodeada (false) o aún por ver (null). */
  ok: boolean | null;
  /** Tronco: lo más alto que subió la cabeza (sobre tu altura de pie) mientras pasaba, y si fue un salto de verdad. */
  maxUp: number;
  fast: boolean;
  /** Obstáculo a un lado: si la cabeza estuvo en su lado mientras pasaba. */
  bad: boolean;
  /** Túnel: las flexiones hechas (el techo sube con ellas). */
  done: number;
}

/** Una pieza nueva, con su estado a cero. */
export function piece(id: number, k: PieceKind, at: number, tramo: number, o: Partial<Pick<Piece, 'len' | 'side' | 'h' | 'n'>> = {}): Piece {
  return { id, k, at, len: o.len ?? 0, side: o.side ?? 0, h: o.h ?? 0, n: o.n ?? 0, tramo, shown: false, warned: false, judged: false, ok: null, maxUp: -1, fast: false, bad: false, done: 0 };
}

/** Lo que `buildCourse` necesita para hacer un tramo. */
export interface CourseEnv {
  /** La velocidad más alta que se puede llevar (m/s: la de «Velocidad de avance» con el turbo): las separaciones en
   * segundos se pasan a metros con ella. */
  vmax: number;
  /** Lo que mide el tramo hasta el cofre (m). */
  len: number;
  /** El azar (de 0 a 1). */
  rnd(): number;
}

/** Un tramo hecho: sus piezas en orden (la última, el cofre) y dónde acaba. */
export interface Course {
  pieces: Piece[];
  /** Dónde está el cofre (su `at`). */
  end: number;
}

/** Lo que la lógica pide al juego (como `TrekEnv`; la partida lo llena con los ajustes y la cabeza). */
export interface PlatEnv {
  /** Un ajuste numérico: trekSpeed, trekCurves (1/0), arcJumpH (cm), arcShift (cm). */
  s(key: string): number;
  /** Un ajuste con la dificultad creciente: squatDepth, lungeDepth. */
  dv(key: string): number;
  /** El ejercicio con el que se avanza (de momento, 'squat'). */
  ex: string;
  /** El estado de la partida: 'play' (en el tramo), 'rest' (entre tramos), 'ready' (antes del primero), 'paused', 'end'. */
  state: string;
  /** La cabeza en la arena y tu altura de pie (calibrada). */
  head: { x: number; y: number; z: number };
  calibRef: number;
  /** El tramo (desde 0) y el rango. */
  wave: number;
  rank: number;
  /** El reloj (s). */
  now: number;
  /** El azar (de 0 a 1). */
  rnd(): number;
  /** Leer el almacén del navegador (lo que se escribe va en un suceso). */
  store(key: string): unknown;
}

/** Un punto del recorrido: a lo largo del sendero (s), a su derecha (u) y a qué altura (y). */
export interface PlatPos {
  s: number;
  u: number;
  y: number;
}

/** Los sonidos que piden los sucesos (los del catálogo de `SND`). */
export type PlatSnd = 'whoosh' | 'metalHit' | 'perfect' | 'combo' | 'step' | 'victory' | 'tick';

/**
 * Lo que pasa (la partida lo aplica en este orden y vacía `Runner.ev`):
 * - say: un aviso breve que pide hacer algo (warn: lo que se ha hecho mal, en naranja y también en grande en el suelo).
 * - cheer: una celebración, al marcador.
 * - snd, fx, haptic: sonido, chispas o polvo y vibración (en `at`, o junto a ti si es nulo).
 * - score: puntos. combo0: se rompe la racha. turbo: el turbo se enciende o se apaga.
 * - show / hide: la pieza entra en la vista (a lo lejos) o queda atrás (fuera).
 * - pass / hit: superada o chocada (la que chocas sale despedida a un lado, nunca se atraviesa si es sólida; el hueco no
 *   saltado, tropiezo).
 * - halt: te paras ante un paso. go: empieza el salto (o el tropiezo) que te lleva al otro lado del hueco (`dur` s).
 * - lift: el suelo sube o baja `dy` m en `dur` s (las plataformas, PR B).
 * - chest: has llegado al cofre (se acaba el tramo). vanish: el cofre abierto se esfuma (al empezar el siguiente).
 */
export type PlatEv =
  | { t: 'say'; text: string; col: string; dur: number; warn: boolean }
  | { t: 'cheer'; text: string; col: string; dur: number }
  | { t: 'snd'; name: PlatSnd; at: PlatPos | null; arg?: string | boolean }
  | { t: 'fx'; name: 'sparks' | 'dust'; at: PlatPos; n: number; col: number }
  | { t: 'haptic'; k: number; ms: number }
  | { t: 'score'; n: number }
  | { t: 'combo0' }
  | { t: 'turbo'; on: boolean }
  | { t: 'show'; p: Piece }
  | { t: 'hide'; p: Piece }
  | { t: 'pass'; p: Piece }
  | { t: 'hit'; p: Piece }
  | { t: 'halt'; p: Piece }
  | { t: 'go'; p: Piece; dur: number }
  | { t: 'lift'; dy: number; dur: number }
  | { t: 'chest'; p: Piece }
  | { t: 'vanish'; p: Piece };

/** Los colores de los avisos (los de la Travesía): pedir algo, lo que se ha hecho mal y lo conseguido. */
export const COL_ASK = '#ffd166';
export const COL_WARN = '#ff8a3d';
export const COL_OK = '#3cf0c6';
