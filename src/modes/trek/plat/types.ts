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
  | 'gems' // (sin usar: las gemas del plan son las frutas)
  | 'spring' // el trampolín: una seta gigante; pisada con una sentadilla honda, te lanza lejos y alto (fluido; un premio)
  | 'fork' // la bifurcación: la pasarela se abre en dos ramas; se elige con un paso a un lado al llegar (fluido)
  | 'glide' // el barranco: ancho, con piedras abajo; se cruza planeando con los brazos en cruz (fluido)
  | 'box' // el barril sorpresa, flotando sobre la pasarela: se rompe de un cabezazo, saltando debajo (fluido; da fruta)
  | 'boss' // el jefe del mundo, al final de cada BOSS_EVERY tramos y antes del cofre (paso): esquivar y supersalto encima
  | 'chest'; // fin del tramo (paso)

/** Los que se pasan sin parar (el avance siempre sigue: se entrenan los reflejos, pedido del usuario tras probar el PR A):
 * si fallas, chocas o tropiezas (frenas y pierdes la racha, sin perder vidas, y sigues). El hueco también: si no saltas a
 * tiempo, tropiezas al cruzarlo (nunca se cae). */
export const FLUID: readonly PieceKind[] = ['gap', 'step', 'crawl', 'low', 'side', 'log', 'fruit', 'foe', 'gems', 'box', 'glide', 'spring', 'fork'];
/** Los pasos: el mundo frena suave y te para a `STOP_AT` (solo el cofre, al acabar el tramo). */
export const HALT: readonly PieceKind[] = ['chest', 'boss'];
/** Los que se cruzan saltando (entre dos seguidos, al menos `JUMP_GAP_S` a velocidad máxima). */
export const JUMPS: readonly PieceKind[] = ['gap', 'log', 'step', 'foe', 'box', 'glide', 'spring'];
/** ¿Se cruza saltando? (las de `JUMPS` y la fruta dorada, que flota alta en el centro) */
export const isJump = (p: Piece): boolean => JUMPS.includes(p.k) || (p.k === 'fruit' && p.gold);
/** Los de suelo (tras ellos, `FLOOR_UP_S` para levantarse antes de otra cosa; salvo la plataforma de un burpee, que llega
 * `BURPEE_GAP_S` después del túnel). */
export const FLOORS: readonly PieceKind[] = ['crawl'];
/** El burpee: tras el túnel, su plataforma (la de `burpee`), a lo que se recorre en estos s a velocidad máxima. */
export const BURPEE_GAP_S = 2;
/** La fruta: a qué distancia del centro flota (m, a su lado) y la ventana en la que se coge al pasar (m). */
export const FRUIT_U = 0.35, FRUIT_WIN = 0.45;
/** El barril sorpresa: lo que queda su borde de abajo por encima de tu coronilla (m; al saltar, el mundo baja `JUMP_LIFT` y
 * te lo encuentras en la cabeza). La fruta dorada: lo alta que flota sobre tus ojos (m: hay que saltar para cogerla); las
 * de cada tramo, como mucho `GOLD_N`. Las frutas en arco sobre un hueco: de `ARC_MIN` a `ARC_MAX` (siguen la curva del
 * salto: se cogen todas saltando a tiempo). */
export const BOX_CLEAR = 0.22, GOLD_Y = 0.32, GOLD_N = 3, ARC_MIN = 3, ARC_MAX = 5;
/** El barranco (pedido del usuario: planear con los brazos en cruz): lo que mide (m), las frutas que flotan sobre él (a
 * un lado u otro, hasta `GLIDE_U` m del centro: se cogen ladeando la cabeza, a menos de `GLIDE_CATCH`), lo que sube el
 * vuelo (m: el mundo baja), la velocidad mínima del vuelo (m/s) y lo que se aguanta con los brazos bajados antes de
 * perder el vuelo (s). Brazos en cruz: cada muñeca a `ARMS_OUT` m de la cabeza a un lado y a menos de `ARMS_DY` m de la
 * altura de los hombros (`ARMS_SH` bajo los ojos); se cierran al ver una a menos de `ARMS_IN`. */
export const GLIDE_MIN = 6, GLIDE_MAX = 10, GLIDE_NMIN = 4, GLIDE_NMAX = 6, GLIDE_U = 0.45, GLIDE_CATCH = 0.3, GLIDE_LIFT = 0.6, GLIDE_V = 2.4, GLIDE_DROP = 0.8;
/** El trampolín: lo que te lleva por el aire (m: libre de piezas), lo que sube (m: el mundo baja), su velocidad como poco
 * (m/s), cuánto antes de pisarlo vale la sentadilla honda (s) y sus frutas en el arco del vuelo. */
export const SPRING_MIN = 8, SPRING_MAX = 11, SPRING_LIFT = 1.1, SPRING_V = 3.2, SPRING_DEEP = 1.2, SPRING_N = 5;
/** La bifurcación: lo que se separa cada rama del centro (m), lo que tardan en separarse y juntarse (m, a lo largo) y lo
 * que tienes que apartar la cabeza al llegar para ir por la derecha o la izquierda (m; sin apartarla, la izquierda). */
export const FORK_U = 1.5, FORK_RAMP = 4, FORK_PICK = 0.18;
/** El jefe del mundo (elegido por el usuario: al final de cada cuatro tramos). Cada cuántos tramos sale, los golpes que
 * aguanta (supersaltos encima), dónde está (m por delante de donde te paras), lo que sube el supersalto que le cae encima
 * (m: el mundo baja), lo que dura (s), sus lanzamientos antes de marearse, lo que tardan en salir y llegar (s), lo que dura
 * mareado (s) y sus puntos. Lo que te mueve cada supersalto: `BOSS_STEP` (pasas por encima y él salta hacia atrás). */
export const BOSS_EVERY = 4, BOSS_HP = 3, BOSS_Z = 3, BOSS_LIFT = 1.7, BOSS_HOP_T = 1.6, BOSS_THROWS = 3, BOSS_WIND = 1.1, BOSS_FLY = 0.55, BOSS_GAP = 0.7, BOSS_DIZZY = 5, BOSS_PTS = 1500;
/** Para esquivar lo que lanza: la alta, la coronilla bajada (m); la que va al cuerpo, la cabeza apartada de donde estaba (m). */
export const BOSS_DUCK = 0.2, BOSS_AWAY = 0.3;
/** Los jefes (uno por mundo, por turno): el modelo, su nombre y su voz. */
export const BOSSES = [
  { asset: 'foe-yeti', name: 'el Yeti', voice: 'yeti', nat: 1.67 },
  { asset: 'foe-greendemon', name: 'el Demonio verde', voice: 'greendemon', nat: 1.62 },
  { asset: 'foe-alientall', name: 'el Alien alto', voice: 'alientall', nat: 2.11 },
] as const;
/** ¿Acaba el tramo `t` (desde 0) con el jefe del mundo? Y cuál es (índice de BOSSES). */
export const bossTramo = (t: number): boolean => (t + 1) % BOSS_EVERY === 0;
export const bossOf = (t: number): number => (Math.floor((t + 1) / BOSS_EVERY) - 1 + BOSSES.length * 100) % BOSSES.length;
/** Lo que lanza el jefe: alta (agáchate), baja (salta) o al cuerpo (apártate). */
export type BossShot = 'high' | 'low' | 'body';
export const ARMS_OUT = 0.42, ARMS_DY = 0.45, ARMS_SH = 0.25, ARMS_IN = 0.25;
/** Dónde flota la fruta i del barranco p, a su derecha (m): siempre la misma para la misma pieza. */
export const glideU = (p: Piece, i: number): number => GLIDE_U * (2 * (((i * 0.618 + p.id * 0.377) % 1 + 1) % 1) - 1);
/** Lo que sube el vuelo a la fracción k del barranco (de 0 a 1): sube deprisa y baja despacio. */
export const glideArc = (k: number): number => (k < 0.2 ? (k / 0.2) * (k / 0.2) * (3 - 2 * (k / 0.2)) : 1 - ((k - 0.2) / 0.8) ** 2);
/** Los enemigos (la seta y el cangrejo, PR D) llegan andando hacia ti: salen `FOE_WALK` m más allá de su sitio (`at`) y,
 * cuando te quedan a menos de `FOE_WAKE` m, andan hacia ti a `FOE_V` m/s hasta su sitio, y allí te esperan. Así nunca
 * quedan más cerca de la pieza de antes que su sitio (las separaciones de course.ts siguen valiendo). */
export const FOE_WALK = 4, FOE_WAKE = 24, FOE_V = 0.9;
/** El cangrejo corretea a esta distancia del centro (m, a su lado): hay que apartarse al otro. */
export const CRAB_U = 0.5;
/** El escupitajo del cangrejo (pedido del usuario): lo lanza una vez, solo desde lejos (cuando te queda entre `SPIT_NEAR` y
 * `SPIT_FAR` m) y si no hay otro reto cerca de ti (`SPIT_FREE` m: nada pide dos movimientos a la vez); se encabrita
 * `SPIT_WIND` s (el aviso) y vuela deprisa, a `SPIT_V` m/s (más lo que avanzas), hacia donde estaba tu cabeza. Se esquiva
 * apartando la cabeza de ahí, a un lado o agachándote, al menos `SPIT_R` m (elegido por el usuario). */
export const SPIT_FAR = 15, SPIT_NEAR = 10, SPIT_FREE = 4, SPIT_WIND = 0.45, SPIT_V = 12, SPIT_R = 0.22;
/** Lo que hay que dejar tras el cofre (para el fantasma: la marca de dónde ibas en tu mejor ronda, cada `GHOST_DT` s). */
export const GHOST_DT = 2;
/** Dónde se guardan tu mejor Travesía de plataformas (el fantasma: lo de RepArena XR, aparte de la clásica) y las gemas
 * de los cofres (la colección de siempre, la misma que en RepArena). */
export const PLAT_GHOST = 'reparenaxr-trekghost', PLAT_GEMS = 'reparena3-gems';

/** Dónde te paras ante un paso (m antes de su borde cercano) y dónde aterrizas como poco tras el hueco (m pasado su borde
 * lejano). */
export const STOP_AT = 1;
/** El jefe: lo que te mueve cada supersalto encima de él (pasas por encima y él salta hacia atrás) y lo que mide su pieza. */
export const BOSS_STEP = 2 * (STOP_AT + BOSS_Z), BOSS_LEN = BOSS_HP * BOSS_STEP + BOSS_Z + 1;
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
  /** Túnel: las flexiones que pide. Hueco: las frutas en arco sobre él (0, ninguna). 0 en los demás. */
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
  /** El cangrejo: ya escupió (lo hace una vez, desde lejos). */
  spat: boolean;
  /** La fruta dorada (alta, en el centro: se coge saltando) o la plataforma con una encima (se coge subiendo de un
   * supersalto). */
  gold: boolean;
  /** Las frutas en arco del hueco que ya te has comido (en el barranco, las que ya han pasado) y cuáles te has comido (por bits). */
  got: number;
  mask: number;
  /** En una bifurcación, la rama de la pieza (−1 izquierda —la tranquila—, 1 derecha —la difícil, con más premios—; 0, la
   * pasarela de siempre): solo se juzga si vas por ella. */
  lane: -1 | 0 | 1;
}

/** Una pieza nueva, con su estado a cero. */
export function piece(id: number, k: PieceKind, at: number, tramo: number, o: Partial<Pick<Piece, 'len' | 'side' | 'h' | 'n'>> = {}): Piece {
  return { id, k, at, len: o.len ?? 0, side: o.side ?? 0, h: o.h ?? 0, n: o.n ?? 0, tramo, shown: false, warned: false, judged: false, ok: null, maxUp: -1, fast: false, bad: false, special: false, burpee: false, walk: k === 'foe' || k === 'side' ? FOE_WALK : 0, woke: false, spat: false, gold: false, got: 0, mask: 0, lane: 0 };
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
  /** Las muñecas (en la arena) y si se ven de verdad (una calculada al perderla, no): para planear con los brazos en cruz. */
  hands: { l: { ok: boolean; x: number; y: number; z: number }; r: { ok: boolean; x: number; y: number; z: number } };
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
 * - pick: te comes la fruta i del arco de un hueco. gold: coges una fruta dorada (la n de las `of` del tramo).
 * - spit: el cangrejo escupe (se encabrita `wind` s y el escupitajo vuela `dur` s hacia `aim`, donde estaba tu cabeza, en la
 *   arena); spat: llega (ok: lo esquivaste).

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
  | { t: 'pick'; p: Piece; i: number }
  | { t: 'gold'; p: Piece; n: number; of: number }
  | { t: 'spit'; p: Piece; wind: number; dur: number; aim: { x: number; y: number; z: number } }
  | { t: 'spat'; p: Piece; ok: boolean }
  | { t: 'trophy'; title: string; sub: string }
  | { t: 'store'; key: string; val: unknown }
  /** El jefe: empieza la pelea, lanza (`shot`: tarda `wind` en soltarla y `dur` en llegar a `aim`), lo esquivas o te da,
   * se marea, recibe un supersalto (y salta hacia atrás de `from` a `to`, o muere al final del salto) o se recupera. */
  | { t: 'boss'; p: Piece; act: 'start' | 'dizzy' | 'wake' | 'hurt' | 'die'; from?: number; to?: number }
  | { t: 'bthrow'; p: Piece; shot: BossShot; wind: number; dur: number; aim: { x: number; y: number; z: number } }
  | { t: 'bdodge'; p: Piece; ok: boolean };

/** Los colores de los avisos (los de la Travesía): pedir algo, lo que se ha hecho mal y lo conseguido. */
export const COL_ASK = '#ffd166';
export const COL_WARN = '#ff8a3d';
export const COL_OK = '#3cf0c6';
