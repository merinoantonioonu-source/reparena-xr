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
  | 'side' // el cangrejo, que llega correteando pegado a un lado: paso lateral al otro (fluido; PR D)
  | 'log' // tronco para saltar en marcha (fluido)
  | 'step' // plataforma alta: se sube con un supersalto en marcha (sentadilla honda y salto) y se baja sola (fluido)
  | 'drop' // bajada (sin usar de momento: la plataforma ya baja sola al acabar)
  | 'crawl' // túnel cubierto: se pasa en plancha, con la inercia (fluido)
  | 'burpee' // (sin usar: el burpee es un túnel y, BURPEE_GAP_S después, una plataforma con `burpee`)
  | 'fruit' // fruta flotando a la altura de la cabeza, a un lado: se coge apartando la cabeza (fluido; da energía)
  | 'foe' // la seta, que llega andando por el centro: se pisa saltando encima (fluido; PR D)
  | 'gems' // hilera de gemas que alcanzar con la mano (fluido; PR D)
  | 'chest'; // fin del tramo (paso)

/** Los que se pasan sin parar (el avance siempre sigue: se entrenan los reflejos, pedido del usuario tras probar el PR A):
 * si fallas, chocas o tropiezas (frenas y pierdes la racha, sin perder vidas, y sigues). El hueco también: si no saltas a
 * tiempo, tropiezas al cruzarlo (nunca se cae). */
export const FLUID: readonly PieceKind[] = ['gap', 'step', 'crawl', 'low', 'side', 'log', 'fruit', 'foe', 'gems'];
/** Los pasos: el mundo frena suave y te para a `STOP_AT` (solo el cofre, al acabar el tramo). */
export const HALT: readonly PieceKind[] = ['chest'];
/** Los que se cruzan saltando (entre dos seguidos, al menos `JUMP_GAP_S` a velocidad máxima). */
export const JUMPS: readonly PieceKind[] = ['gap', 'log', 'step', 'foe'];
/** Los de suelo (tras ellos, `FLOOR_UP_S` para levantarse antes de otra cosa; salvo la plataforma de un burpee, que llega
 * `BURPEE_GAP_S` después del túnel). */
export const FLOORS: readonly PieceKind[] = ['crawl'];
/** El burpee: tras el túnel, su plataforma (la de `burpee`), a lo que se recorre en estos s a velocidad máxima. */
export const BURPEE_GAP_S = 2;
/** La fruta: a qué distancia del centro flota (m, a su lado) y la ventana en la que se coge al pasar (m). */
export const FRUIT_U = 0.35, FRUIT_WIN = 0.45;
/** Los enemigos (la seta y el cangrejo, PR D) llegan andando hacia ti: salen `FOE_WALK` m más allá de su sitio (`at`) y,
 * cuando te quedan a menos de `FOE_WAKE` m, andan hacia ti a `FOE_V` m/s hasta su sitio, y allí te esperan. Así nunca
 * quedan más cerca de la pieza de antes que su sitio (las separaciones de course.ts siguen valiendo). */
export const FOE_WALK = 4, FOE_WAKE = 24, FOE_V = 0.9;
/** El cangrejo corretea a esta distancia del centro (m, a su lado): hay que apartarse al otro. */
export const CRAB_U = 0.5;
/** Lo que hay que dejar tras el cofre (para el fantasma: la marca de dónde ibas en tu mejor ronda, cada `GHOST_DT` s). */
export const GHOST_DT = 2;
/** Dónde se guardan tu mejor Travesía de plataformas (el fantasma: lo de RepArena XR, aparte de la clásica) y las gemas
 * de los cofres (la colección de siempre, la misma que en RepArena). */
export const PLAT_GHOST = 'reparenaxr-trekghost', PLAT_GEMS = 'reparena3-gems';

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
  /** El obstáculo a un lado: a qué lado está (−1 izquierda, 1 derecha; hay que apartarse al otro). La fruta: a qué lado
   * flota (hay que llevar la cabeza a ese lado). 0 en los demás. */
  side: -1 | 0 | 1;
  /** Viga baja: cuánto hay que bajar la coronilla bajo tu altura de pie (m). Plataforma: lo que sube el suelo (m). 0 en
   * los demás. */
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
  /** Obstáculo a un lado: si la cabeza estuvo en su lado mientras pasaba. Túnel: si la cabeza tocó el techo. */
  bad: boolean;
  /** Fruta: la especial (llena la energía de golpe). */
  special: boolean;
  /** Plataforma: la de un burpee (llega tras un túnel y se sube con un salto normal, sin sentadilla honda). */
  burpee: boolean;
  /** La seta y el cangrejo: lo que les queda por andar hacia ti hasta su sitio (m; están en `at + walk`) y si ya andan. */
  walk: number;
  woke: boolean;
}

/** Una pieza nueva, con su estado a cero. */
export function piece(id: number, k: PieceKind, at: number, tramo: number, o: Partial<Pick<Piece, 'len' | 'side' | 'h' | 'n'>> = {}): Piece {
  return { id, k, at, len: o.len ?? 0, side: o.side ?? 0, h: o.h ?? 0, n: o.n ?? 0, tramo, shown: false, warned: false, judged: false, ok: null, maxUp: -1, fast: false, bad: false, special: false, burpee: false, walk: k === 'foe' || k === 'side' ? FOE_WALK : 0, woke: false };
}

/** Lo que manda la tabla de dificultad (por rango, PR E; los ajustes `plat*`): el sitio de más entre retos (×, 1 = el de
 * siempre), el hueco más corto (m), lo que hay que bajar bajo la viga más alta (m), la plataforma más baja (m), el túnel más
 * corto (m) y el paso de los enemigos (m/s). En cada tramo, algo más (hasta `TUNE_UP`). */
export interface PlatTune {
  space: number;
  gap: number;
  duck: number;
  high: number;
  tunnel: number;
  foeV: number;
}
/** Los de serie (los del cabo, el rango de serie: como antes de la tabla). */
export const TUNE_DEF: PlatTune = { space: 1, gap: 0.9, duck: 0.24, high: 0.86, tunnel: 3.3, foeV: FOE_V };
/** Lo que más crece cada medida sobre la de la tabla, tramo a tramo (m). */
export const TUNE_UP = { gap: 0.8, duck: 0.12, high: 0.7, tunnel: 3 } as const;
/** Los ajustes de la tabla, de los valores de los ajustes (`s`: platSpace en %, platGap/platDuck/platHigh en cm,
 * platTunnel en m, platFoeV en m/s; 0 o sin ellos, los de serie). */
export function platTune(s: (k: string) => number): PlatTune {
  const v = (k: string, k2: number, d: number): number => (s(k) > 0 ? s(k) * k2 : d);
  return { space: v('platSpace', 0.01, TUNE_DEF.space), gap: v('platGap', 0.01, TUNE_DEF.gap), duck: v('platDuck', 0.01, TUNE_DEF.duck), high: v('platHigh', 0.01, TUNE_DEF.high), tunnel: v('platTunnel', 1, TUNE_DEF.tunnel), foeV: v('platFoeV', 1, TUNE_DEF.foeV) };
}

/** Lo que `buildCourse` necesita para hacer un tramo. */
export interface CourseEnv {
  /** Lo que manda la tabla de dificultad (sin él, `TUNE_DEF`). */
  tune?: PlatTune;
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
export type PlatSnd = 'whoosh' | 'metalHit' | 'perfect' | 'combo' | 'step' | 'victory' | 'tick' | 'squish' | 'voice';

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
 * - chest: has llegado al cofre (se acaba el tramo; se abre). vanish: el cofre abierto se esfuma (al empezar el siguiente).
 * - wake: la seta o el cangrejo empiezan a andar hacia ti (su voz).
 * - trophy: un logro grande y dorado (lo que da el cofre). store: guardar en el almacén del navegador (las gemas).
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
  | { t: 'vanish'; p: Piece }
  | { t: 'wake'; p: Piece }
  | { t: 'trophy'; title: string; sub: string }
  | { t: 'store'; key: string; val: unknown };

/** Los colores de los avisos (los de la Travesía): pedir algo, lo que se ha hecho mal y lo conseguido. */
export const COL_ASK = '#ffd166';
export const COL_WARN = '#ff8a3d';
export const COL_OK = '#3cf0c6';
