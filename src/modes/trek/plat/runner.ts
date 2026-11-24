/**
 * La Travesía de plataformas en marcha: dónde vas en el recorrido, a qué velocidad, cuándo te paras ante un paso y cómo se
 * juzga cada pieza. El impulso es el de la Travesía de siempre (`Trek`, path.ts: cada repetición empuja según su ritmo y lo
 * hondo que bajas; sin repeticiones, frenas; seis seguidas a buen ritmo, el turbo), sin sus retos: los de aquí son las
 * piezas del recorrido (course.ts), juzgadas con lo que hace el cuerpo (moves.ts).
 *
 * - **Fluidas** (hueco, viga baja, obstáculo a un lado, tronco): se pasan sin parar, porque el avance siempre sigue (se
 *   entrenan los reflejos: pedido del usuario tras probar el PR A); si fallas, chocas: frenas a la mitad y se rompe la
 *   racha, sin perder vidas, y sigues. El hueco se salta en marcha, al llegar a su borde: el mundo te lleva al otro lado
 *   con la velocidad que traías; si no saltas a tiempo, tropiezas al cruzarlo (nunca se cae).
 * - **Cada salto se nota**: el mundo baja y sube bajo los pies (`dip`, hasta `JUMP_LIFT`), como si el salto te elevara
 *   mucho más que lo que sube tu cabeza. En el aire llevas tu inercia: la velocidad no cae y, al aterrizar, sigues igual.
 * - **La plataforma** (alta: de 0,8 a 1,5 m) se sube con un **supersalto** en marcha al llegar a su borde: sentadilla
 *   honda (`DEEP_WIN` s antes, como mucho) y salto; el mundo baja su altura mientras estás en el aire. Sin sentadilla honda
 *   o sin salto, tropiezas y subes a trompicones. Al acabarla, bajas sola, suave. La de un **burpee** (llega tras un túnel)
 *   se sube con un salto normal.
 * - **El túnel** se pasa en marcha, en plancha: echado, no empujas, pero la velocidad que traías se mantiene (y como poco
 *   `CRAWL_V` cerca y dentro de él), así que pasas por debajo sin hacer nada más; si la cabeza no va baja, chocas con el
 *   techo. Al salir, de pie.
 * - **Las frutas** flotan a la altura de la cabeza, a un lado: se cogen apartando la cabeza hacia ellas. Llenan la barra de
 *   energía (`FRUIT_E` cada una; la especial, entera); llena, **supervelocidad** (`SUPER_K` la máxima, `SUPER_T` s).
 * - **Los enemigos** llegan andando hacia ti (`FOE_V`, desde `FOE_WAKE` m): **la seta**, por el centro, se pisa saltando
 *   cuando llega a tus pies (se chafa y rebotas: el mundo baja otra vez bajo los pies); **el cangrejo**, pegado a un lado,
 *   se esquiva con un paso al otro (elegido por el usuario). Si no, te muerden: frenas a la mitad y se rompe la racha.
 * - **Pasos**: solo el cofre al final del tramo: el mundo frena suave (`HALT_BRAKE`) hasta dejarte a `STOP_AT` (1 m). Dice
 *   al aparecer qué hay dentro (una llave —con tres, el tesoro— y una gema, como en la Travesía clásica) y al llegar se abre.
 * - **El fantasma**: cada `GHOST_DT` s se apunta dónde vas; al acabar, si llegaste más lejos que nunca, se guarda
 *   (`PLAT_GHOST`) y la ronda siguiente compara contigo (`ghostDiff`). La medalla, por las piezas superadas sin chocar.
 * - **Más deprisa que la Travesía clásica** (`PLAT_SPEED`, pedido del usuario): la misma «Velocidad de avance», un 35 % más,
 *   y acelera antes.
 *
 * Lógica pura, sin IWSDK: lo que pide del juego, en `PlatEnv`; lo que se ve y se oye, en los sucesos de `ev`, que la
 * partida aplica en orden y vacía.
 */
import { HEAD_TOP, type TrekEnv, type TrekEv } from '../env.js';
import { Trek, TREK_TURBO_V, TREK_VMAX, trekK } from '../path.js';
import { buildCourse } from './course.js';
import { PORTAL_AT, worldLenFor, worldNo, WORLD_LEN, WORLDS } from './worlds.js';
import { formText } from './texts.js';
import { buildGrade, gradeH, gradeK, gradeSlope, type Grade } from './grade.js';
import { BodyMoves, WAVE_BACK, LUNGE_FWD, LUNGE_SIDE_K, moveCfg, PRONE_FWD, PRONE_SIDE_K, PRONE_SIDE_MIN, type MoveCfg } from './moves.js';
import { boardSide, boardTilt, FLY, FlyBody, flyIn, flyModel, FlyPractice, Glider, PRACTICE, PRACTICE_GAP, PRACTICE_MAX, type FlyIn } from './fly.js';
import { ARCH_CLEAR, BERRY_R, CRACK_W, FLY_FIT, FLY_TUTO, type FlyFit, FLY_KINDS, LAND_D, PILLAR_W, RING_R, UPDRAFT_W, ASK_AHEAD, LANE_NEED, ARMS_KINDS, CLIMB_SLOPE, CLIMB_SWAY, GRIP_NARROW, GRIP_WIDE, PAW_R, PAW_U, REACH_NEED, SLAP_VY, SLIT_ROLL, TILT_NEED, WAVE_WIN, BOSS_WIND_LUNGE, BOSS_WIND_PRONE, CANNON_AT, isPirate, BOB_EARLY_MIN, BOB_EARLY_S, BOB_OK, bobY, SINK_GRACE, SINK_IDLE, SINK_V, COL_ASK, COL_OK, COL_WARN, CRAB_U, FLUID, FOE_V, FOE_WAKE, BOX_CLEAR, platTune, ARMS_DY, ARMS_IN, ARMS_OUT, ARMS_SH, GLIDE_CATCH, GLIDE_DROP, GLIDE_LIFT, GLIDE_V, glideArc, glideU, BOSSES, BOSS_AWAY, BOSS_DIZZY, BOSS_DUCK, BOSS_FLY, BOSS_GAP, BOSS_HOP_T, BOSS_HP, BOSS_LIFT, BOSS_PTS, BOSS_STEP, BOSS_THROWS, BOSS_WIND, BOSS_Z, type BossShot, CLIFF_WALL, LEAN_K, ROCKFALL_T, ASIDE_U, FIRE_AT, FIRE_DUR, FIRE_R, FIRE_WIND, QUAKE_AT, QUAKE_V, QUAKE_WIN, QUAKE_WIND, WALKERS, FORK_PICK, FORK_RAMP, FORK_U, SPRING_DEEP, SPRING_LIFT, SPRING_V, SPIT_FAR, SPIT_FREE, SPIT_NEAR, SPIT_R, SPIT_V, SPIT_WIND, FRUIT_WIN, GHOST_DT, HALT, HALT_BRAKE, LAND_PAST, PLAT_GEMS, PLAT_GHOST, PLAT_SEE, STOP_AT, type Course, type Piece, type PieceKind, type PlatEnv, type PlatEv, type PlatPos, type PlatSnd } from './types.js';

/** La Travesía de plataformas va más deprisa que la clásica (la «Velocidad de avance» por esto) y acelera antes (m/s² de
 * más mientras empuja una repetición). */
export const PLAT_SPEED = 1.35, PLAT_ACCEL = 0.6;
/** Cada salto: cuánto baja el mundo en lo más alto (m: como si te elevara) y lo que dura en el aire si no hay hueco (s). */
export const JUMP_LIFT = 0.45, AIR_T = 0.55;
/** El salto del hueco: lo que dura como poco y como mucho (s; si tu velocidad no te lleva al otro lado en HOP_MAX, el
 * mundo te lleva algo más deprisa) y desde dónde vale despegar (m antes del borde: lo que recorres en GAP_EARLY_S, como
 * poco GAP_EARLY_MIN). */
export const HOP_MIN = 0.45, HOP_MAX = 0.9, GAP_EARLY_S = 0.6, GAP_EARLY_MIN = 1.5;
/** El tropiezo (el hueco sin saltar): a qué velocidad cruzas como poco (m/s) y lo que dura como poco (s). */
export const TRIP_V = 1.2, TRIP_MIN = 0.6;
/** Chocar o tropezar: la velocidad que te queda (la mitad: frenas, pero sigues). */
export const HIT_KEEP = 0.5;
/** La plataforma: lo que tarda en subirte a trompicones si no saltas y en bajarte al acabarla (s, más por cada m de
 * altura: suave también en las altas); el supersalto, lo que dura en el aire (s) y lo que tarda el suelo en subir (s); y la
 * sentadilla honda que pide, como mucho tantos s antes del salto. */
export const CLIMB_T = 0.45, DROP_T = 0.45, LEV_PER_M = 0.4, SUPER_AIR_T = 0.9, SUPER_LEV_T = 0.6, DEEP_WIN = 1.5;
/** El supersalto vale desde antes del borde (pedido del usuario: hecho cerca de la plataforma, ya te sube a ella): desde lo
 * que recorres en STEP_EARLY_S s o, como poco, STEP_EARLY_MIN m. Si saltas antes del borde, el mundo te lleva en el aire
 * hasta encima de la plataforma (`STEP_LAND` m pasado su borde), a tu velocidad o algo más deprisa si no llegas. */
export const STEP_EARLY_S = 1.2, STEP_EARLY_MIN = 3.5, STEP_LAND = 0.5;
/** El túnel: la velocidad que llevas como poco cerca y dentro de él, echado (m/s), y desde dónde (m antes). */
export const CRAWL_V = 1.2, CRAWL_NEAR = 15;
/** Las frutas: la energía de cada una (la especial, toda), lo que dura la supervelocidad (s) y cuánto más que la máxima. */
export const FRUIT_E = 0.25, SUPER_T = 5, SUPER_K = 1.3;
/** En plancha (la Travesía con flexiones). Suave («Avance solo»): lo deprisa que avanzas sin hacer nada (× la máxima). El
 * acelerón (echar el peso adelante): lo que dura (s), a qué velocidad como poco (× la máxima) y lo que hay que esperar para el
 * siguiente (s). */
export const AUTO_K = 0.55, DASH_T = 1.5, DASH_K = 1.15, DASH_CD = 4;
/** En zancada: las bajadas con cada pierna si no se dice (el ajuste «Zancada: bajadas con cada pierna») y, en la estática
 * (que avanza sola y apenas pide bajadas), lo que se tarda como mucho en cambiar de pierna (s por cada bajada que toca). */
export const LEG_REPS = 10, LEG_S = 3;
const LUNGE_SKIP: PieceKind[] = ['crawl', 'burpee'];
/** Lo que sale además en plancha: el paso lateral (elegido por el usuario: caminar con las manos a un lado). */
const PRONE_EXTRA: PieceKind[] = ['lane'];
/** Lo que sale además en plancha en el tramo `i`: el paso lateral y tres de los demás movimientos de brazos, cada tramo otros
 * (así caben y todos acaban saliendo). */
export function proneExtra(i: number): PieceKind[] {
  const n = ARMS_KINDS.length, o = (i * 3) % n;
  return [...PRONE_EXTRA, ARMS_KINDS[o], ARMS_KINDS[(o + 1) % n], ARMS_KINDS[(o + 2) % n]];
}
/** Dónde se avisa de lo que viene (m antes de la cabeza, o lo que recorres en tantos s si es más): las fluidas, a 4 m o
 * 1,4 s; el obstáculo a un lado y el hueco, antes (para prepararse). */
export const WARN_AT = 4, WARN_S = 1.4, SIDE_WARN_AT = 6, SIDE_WARN_S = 1.8;
/** Mientras pasa bajo ti: la ventana del tronco (m, o lo que recorres en LOG_WIN_S si es más) y la del obstáculo a un lado
 * (m). */
export const LOG_WIN = 0.45, LOG_WIN_S = 0.3, SIDE_WIN = 0.35;
/** Lo que queda atrás de una pieza antes de quitarla (m). */
export const BEHIND = 8;
/** Cuántos segundos antes de un obstáculo a un lado el centro deja de seguir a la cabeza. */
export const SIDE_HOLD_S = 3;
/** Pisar la seta: el rebote (el mundo baja esto bajo los pies, m, en AIR_T s) y los puntos; esquivar el cangrejo, los suyos. */
export const BOUNCE_LIFT = 0.55, STOMP_PTS = 200, CRAB_PTS = 150;
/** El cofre: sus puntos, los del tesoro (con tres llaves) y las llaves que pide (los de la Travesía clásica). */
export const CHEST_PTS = 400, TREASURE_PTS = 1500, TREASURE_KEYS = 3;

/** Un escupitajo en el aire: de qué cangrejo, cuánto lleva, cuándo llega (s) y dónde estaba tu cabeza al lanzarlo. */
interface Spit {
  p: Piece;
  t: number;
  end: number;
  x: number;
  y: number;
}

/** Tu mejor Travesía de plataformas (el fantasma): hasta dónde llegaste, tus puntos y dónde ibas cada GHOST_DT s. */
export interface PlatGhost {
  dist: number;
  score: number;
  tl: number[];
}

/** Lo que sale al acabar la ronda: la medalla (por las piezas superadas sin chocar: 95 % oro, 80 % plata, 60 % bronce,
 * como en Arcos), los metros, si llegaste más lejos que nunca, las frutas y el fantasma nuevo que hay que guardar. */
export interface PlatEnd {
  medal: [string, string] | null;
  dist: number;
  farther: boolean;
  fruits: number;
  ghost: PlatGhost | null;
}

/** Lo que mide el tramo hasta el cofre (m) con las repeticiones de su oleada: unos 3,5 m por repetición (por PLAT_SPEED),
 * entre 40 y 400. */
export const tramoLen = (reps: number): number => Math.max(40, Math.min(400, Math.round(reps * 3.5 * PLAT_SPEED)));

/** La velocidad más alta con los ajustes (m/s): «Velocidad de avance» y el turbo. */
export const platVmax = (env: PlatEnv): number => TREK_VMAX * ((env.s('trekSpeed') || 100) / 100) * PLAT_SPEED * TREK_TURBO_V;

/** Lo alto del salto a la fracción k de su tiempo (de 0 a 1 y vuelta: la parábola de un salto de verdad). */
const arc = (k: number): number => 4 * k * (1 - k);
const smooth = (k: number): number => k * k * (3 - 2 * k);

/** El cruce del hueco de ahora: de dónde a dónde te lleva el mundo (a velocidad fija), lo que lleva y lo que dura, si es
 * un salto (`won`) o un tropiezo, y la velocidad con que sigues al acabar. */
interface Hop {
  p: Piece;
  s0: number;
  s1: number;
  t: number;
  dur: number;
  won: boolean;
  v1: number;
  /** Lo que baja el mundo en lo más alto (m: 0 si no es un salto) y, al acabar bien, los puntos y lo que se celebra. */
  lift: number;
  score: number;
  cheer: string;
  /** El supersalto antes del borde de la plataforma: ya se celebró al despegar (al aterrizar, nada más). */
  done?: boolean;
  /** El vuelo sobre un barranco (con los brazos en cruz): lo que llevas con los brazos bajados y si ya se ha perdido. */
  glide?: boolean;
  /** El supersalto encima del jefe. */
  boss?: boolean;
  dropT?: number;
  bad?: boolean;
}

/** La pelea con el jefe: en qué va (lanzando, mareado o con tu supersalto encima), lo que lleva en ello (s; negativo, la
 * espera antes del primero), cuántos ha lanzado, lo que vuela ahora (o null), dónde estaba tu cabeza al lanzarlo, si te
 * has visto en el aire mientras llegaba la baja, las veces que se ha recuperado sin tu supersalto y si el de ahora ya le ha
 * dado. */
export interface BossFight {
  p: Piece;
  phase: 'throw' | 'dizzy' | 'hop';
  t: number;
  shots: number;
  shot: BossShot | null;
  last: BossShot | null;
  aim: { x: number; y: number };
  air: boolean;
  misses: number;
  hit: boolean;
}

/** El suelo sube o baja (la plataforma): de dónde a dónde y en cuánto. */
interface Lev {
  from: number;
  to: number;
  t: number;
  dur: number;
}

export class Runner {
  /** Lo que ha pasado desde que la partida los aplicó (y vació: `runner.ev.length = 0`). */
  ev: PlatEv[] = [];
  /** El impulso de la Travesía (su `dist` es dónde vas). */
  readonly tk: Trek;
  readonly moves = new BodyMoves();
  readonly cfg: MoveCfg = { jumpH: 0.06, sideNeed: 0.3, plankY: 0.7, pushNeed: 0.1, deepNeed: 0.2, lowNeed: 0.08 };
  /** El recorrido hecho hasta ahora (los tramos ya montados, en orden) y el primero que aún no ha salido a la vista. */
  pieces: Piece[] = [];
  private nextShow = 0;
  /** Los que están a la vista (salieron y aún no han quedado atrás). */
  live: Piece[] = [];
  /** El paso ante el que estás parado (y cuánto llevas), el cruce del hueco de ahora y el cofre al que has llegado. */
  stop: Piece | null = null;
  stopT = 0;
  private nagT = 0;
  hop: Hop | null = null;
  chest: Piece | null = null;
  /** Un salto sin hueco (el tronco, o saltar porque sí): lo que lleva en el aire (s; −1, en el suelo) y lo que dura. */
  airT = -1;
  private airDur = AIR_T;
  /** La energía de las frutas (de 0 a 1) y lo que queda de supervelocidad (s). */
  energy = 0;
  superT = 0;
  /** Lo alto que está el suelo bajo tus pies (m: sobre una plataforma, su `h`), su cambio en curso y la plataforma. */
  lev = 0;
  private levTo: Lev | null = null;
  onStep: Piece | null = null;
  /** Lo que baja el mundo ahora (m, negativo: el salto te eleva). */
  dip = 0;
  /** Las cuestas de los tramos montados (grade.ts). */
  readonly grades: Grade[] = [];
  /** Los tramos montados: dónde acaba cada uno (su cofre). */
  ends: number[] = [];
  /** Superadas y chocadas en la ronda, y las frutas cogidas (cuentan en `passed`). */
  passed = 0;
  hits = 0;
  fruits = 0;
  /** Las llaves de los cofres (con TREASURE_KEYS, el tesoro). */
  keys = 0;
  /** Las frutas doradas cogidas en cada tramo (por su índice) y los barriles sorpresa rotos en la ronda. */
  golds: number[] = [];
  boxes = 0;
  /** El fantasma: tu mejor ronda guardada (o null) y dónde vas cada GHOST_DT s en esta. */
  best: PlatGhost | null = null;
  tl: number[] = [];
  private tlT = 0;
  /** Los brazos en cruz (para planear): se abren al ver las dos muñecas a un lado y otro, a la altura de los hombros (o una, si
   * la otra no se ve: con los brazos tan abiertos, las gafas a veces la pierden) y se cierran al ver una cerca de la cabeza. */
  armsOpen = false;
  /** La bifurcación por la que vas (o null), la rama elegida (−1, 1; 0 fuera de ellas) y lo que se desplaza el mundo a un
   * lado para que tu rama quede bajo tus pies (m: el sistema lo resta a todo lo que pinta). */
  fork: Piece | null = null;
  lane: -1 | 0 | 1 = 0;
  /** El planeador (el vuelo) y lo que manda el cuerpo en cada fotograma; desde cuándo no aleteas (s). */
  readonly glider = new Glider();
  readonly flyIn: FlyIn = flyIn();
  private sinceRep = 0;
  /** El cuerpo en el vuelo (su centro, fijo en el aire), la flexión hecha que aún no ha leído el vuelo (1; 2, perfecta) y cuánto
   * llevan a la vista las dos muñecas (s: la tabla solo cuenta si se ven estables). */
  readonly flyBody = new FlyBody();
  private flyRepN = 0;
  private wristsT = 0;
  /** Lo que midió la práctica de vuelo (FLY_FIT: los recorridos de cada eje, m) o null. */
  flyFit: FlyFit | null = null;
  /** La práctica de vuelo (la primera vez, antes del primer tramo: el mundo espera) y si ya se miró si toca. */
  readonly practice = new FlyPractice();
  private practiceSeen = false;
  /** Las muñecas: su altura del fotograma anterior y su velocidad vertical (m/s; NaN, no se ven). */
  private readonly wy = [NaN, NaN];
  private readonly wvy = [0, 0];
  /** Ya se ha dicho que en las cuestas empinadas se trepa (una vez por ronda). */
  private climbSaid = false;
  uShift = 0;
  /** Los escupitajos en el aire. */
  spits: Spit[] = [];
  /** El mundo en el que estás (su número desde 0; ver `worldAt`). */
  world = 0;
  /** El reloj de la marcha (s): el de los islotes que suben y bajan (los pinta el sistema con el mismo, `bobY`). */
  time = 0;
  /** El paso de este fotograma (s), para los juicios que cuentan tiempo. */
  private dtNow = 0;
  /** En plancha: el acelerón (lo que le queda y lo que falta para poder hacer otro, s). */
  dashT = 0;
  private dashCd = 0;
  /** En zancada: la pierna que va delante (0 la derecha, 1 la izquierda), las bajadas con ella, el tiempo con ella y si ya se
   * dijo con cuál empezar. */
  leg = 0;
  legReps = 0;
  private legT = 0;
  private legAsked = false;
  /** La pelea con el jefe del mundo (o null). */
  fight: BossFight | null = null;
  /** Los jefes derrotados en la ronda. */
  bosses = 0;
  /** El paso de la seta y el cangrejo (m/s: «Paso de los enemigos», de la tabla de dificultad; se lee en cada fotograma). */
  foeV = FOE_V;
  /** Los ajustes, hecha una vez (sin crear una función en cada fotograma). */
  private readonly sFn = (k: string): number => this.env.s(k);
  /** Lo que baja el mundo en lo más alto del salto sin hueco de ahora (m: el rebote de la seta, más). */
  private airLift = JUMP_LIFT;
  private id = 1;

  constructor(public env: PlatEnv) {
    const E = env;
    const tenv: TrekEnv = {
      // (más deprisa que la Travesía clásica: la misma «Velocidad de avance», por PLAT_SPEED)
      s: (k) => (k === 'trekSpeed' ? (E.s(k) || 100) * PLAT_SPEED : E.s(k)),
      dv: (k) => E.dv(k),
      get ex() {
        return E.ex;
      },
      trek: true,
      get state() {
        return E.state;
      },
      get head() {
        return E.head;
      },
      get calibRef() {
        return E.calibRef;
      },
      get wave() {
        return E.wave;
      },
      get rank() {
        return E.rank;
      },
      get now() {
        return E.now;
      },
      rnd: () => E.rnd(),
      rockBox: () => ({ w: 1, h: 1, y0: 0 }),
      bandReady: false,
      chestReady: false,
      store: (k) => E.store(k),
    };
    this.tk = new Trek(tenv);
  }

  /** Dónde vas (m). */
  get dist(): number {
    return this.tk.dist;
  }

  /* ---------- la ronda y los tramos ---------- */

  /** Al empezar una ronda: desde el principio, sin recorrido (lo que había se quita). */
  reset(): void {
    this.grades.length = 0;
    for (const p of this.live) this.ev.push({ t: 'hide', p });
    this.tk.reset();
    this.tk.ev.length = 0;
    this.pieces = [];
    this.live = [];
    this.nextShow = 0;
    this.stop = this.hop = this.chest = null;
    this.stopT = this.dip = this.lev = this.energy = this.superT = 0;
    this.airT = -1;
    this.levTo = null;
    this.onStep = null;
    this.ends = [];
    this.passed = this.hits = this.fruits = this.keys = this.boxes = 0;
    this.golds = [];
    this.spits.length = 0;
    this.fight = null;
    this.bosses = 0;
    this.world = 0;
    this.time = 0;
    this.dashT = this.dashCd = 0;
    this.leg = this.legReps = this.legT = 0;
    this.legAsked = false;
    this.fork = null;
    this.lane = 0;
    this.climbSaid = false;
    this.glider.reset(0);
    this.sinceRep = 0;
    this.flyRepN = 0;
    this.wristsT = 0;
    this.practice.step = -1;
    this.practiceSeen = false;
    this.flyBody.set(this.env.head.x, this.env.head.z, this.env.head.yaw);
    const F = this.env.store(FLY_FIT) as FlyFit | null;
    this.flyFit = F && F.side > 0 && F.down > 0 && F.back > 0 ? F : null;
    this.uShift = 0;
    this.id = 1;
    const B = this.env.store(PLAT_GHOST) as PlatGhost | null;
    this.best = B && Array.isArray(B.tl) ? B : null;
    this.tl = [];
    this.tlT = 0;
    this.moves.reset(this.env.calibRef, this.env.head.x);
  }

  /** Tu altura de pie y el centro, al calibrar (y hacia dónde mira el cuerpo: `yaw`; sin él, el de la cabeza ahora). */
  calibrate(ref: number, x0: number, z0 = 0, yaw?: number): void {
    this.moves.reset(ref, x0, z0);
    this.flyBody.set(x0, z0, yaw ?? this.env.head.yaw);
  }

  /** Monta el tramo i detrás de lo que ya hay (si no está): `len`, lo que mide hasta su cofre. */
  addTramo(i: number, len: number): void {
    if (this.ends.length > i) return;
    while (this.ends.length < i) this.addTramo(this.ends.length, len); // (los de antes, por orden)
    const start = this.ends.length ? this.ends[this.ends.length - 1] + 0.5 : this.tk.dist;
    // (en zancada no hay túnel ni burpee: no se pasa echado)
    const c = buildCourse({ vmax: platVmax(this.env), len, rnd: () => this.env.rnd(), tune: platTune((k) => this.env.s(k)), worldLen: this.worldLen, skip: this.lunge ? LUNGE_SKIP : undefined, extra: this.prone ? proneExtra(i) : undefined, fly: this.fly }, i, this.env.rank, start, this.id);
    // en plancha, lo que pasa por encima de la cabeza (la viga, el picado, el tajo, la bala alta), a la altura de la flexión: se
    // ve justo por encima de la cabeza abajo (el juicio, `BodyMoves.under`, pide estar abajo)
    if (this.prone) {
      moveCfg(this.sFn, this.cfg);
      for (const p of c.pieces) if (p.k === 'low' || p.k === 'dive' || p.k === 'tilt' || p.k === 'wave' || (p.k === 'cannon' && !p.n)) p.h = this.cfg.lowNeed + 0.01;
    }
    this.addCourse(c);
    // las cuestas del tramo (grade.ts; «Sendero con cuestas»: sin él, llano)
    if (this.env.s('trekHills') > 0) this.grades.push(buildGrade(c.pieces, start, c.end, WORLDS[worldNo(i, this.worldLen) % WORLDS.length].key, Math.max(0, Math.min(1, this.env.rank / 6)), i));
  }

  /** Las cuestas: la altura del sendero en s (m; 0, lo llano) y su pendiente (subida por metro). */
  heightAt(s: number): number {
    return this.grades.length ? gradeH(this.grades, s) : 0;
  }
  slopeAt(s: number): number {
    return this.grades.length ? gradeSlope(this.grades, s) : 0;
  }

  /** Lo que tarda el jefe en lanzar desde que avisa (s): de pie, BOSS_WIND; en plancha y en zancada, más (bajar una flexión
   * o una zancada lleva más que agacharse: docs/PLAN-ERGONOMIA-Y-CUESTAS.md, 4.2). */
  get bossWind(): number {
    return this.prone ? BOSS_WIND_PRONE : this.lunge ? BOSS_WIND_LUNGE : BOSS_WIND;
  }
  /** ¿En plancha? (la Travesía con flexiones: elegido por el usuario, en sus dos formas) */
  get prone(): boolean {
    return this.env.ex === 'pushup';
  }
  /** ¿Volando? (la Travesía con flexiones y «Volando»: src/modes/trek/plat/fly.ts) */
  get fly(): boolean {
    return this.prone && this.env.s('trekFly') > 0;
  }
  /** La altura del vuelo (m sobre el sendero; 0 sin volar): el mundo baja eso bajo ti. */
  get flyAlt(): number {
    return this.fly ? this.glider.alt : 0;
  }
  /** ¿En zancada? (la Travesía con zancadas: de pie, con una pierna delante; elegido por el usuario, en sus dos formas) */
  get lunge(): boolean {
    return this.env.ex === 'lunge';
  }
  /** ¿La suave (en plancha) o la estática (en zancada)? Con «Avance solo»: el recorrido viene solo y los movimientos son para
   * esquivar y los premios. */
  get auto(): boolean {
    return (this.prone || this.lunge) && this.env.s('trekAuto') > 0;
  }
  /** Las bajadas con cada pierna en zancada (el ajuste; de serie, LEG_REPS). */
  get legEvery(): number {
    return Math.max(1, Math.round(this.env.s('trekLegReps') || LEG_REPS));
  }

  /** Los tramos de cada mundo (el ajuste «Tramos por mundo»; sin él, `WORLD_LEN`). */
  get worldLen(): number {
    // (los de la partida: si no da para pasar de mundo, repartidos para ver varios; worlds.ts, worldLenFor)
    return worldLenFor(this.env.s('trekWorld') || WORLD_LEN, this.env.s('toFail') ? 0 : this.env.s('waves'));
  }

  /** El mundo en el que estás (su número desde 0, sin dar la vuelta): cambia al cruzar el portal que hay tras el cofre del
   * último tramo de cada mundo; el del punto `s` del sendero, igual. */
  worldAt(s: number): number {
    let k = 0;
    while (k < this.ends.length && s > this.ends[k] + PORTAL_AT) k++;
    return worldNo(k, this.worldLen);
  }

  /** Añade un tramo ya hecho detrás de lo que hay (lo usa `addTramo`; las pruebas, con recorridos a mano). */
  addCourse(c: Course): void {
    for (const p of c.pieces) this.id = Math.max(this.id, p.id + 1);
    this.pieces.push(...c.pieces);
    this.ends.push(c.end);
    this.reveal();
  }

  /** Empieza el tramo i: si estabas ante el cofre del anterior, se esfuma y sigues. */
  startTramo(): void {
    const c = this.chest;
    if (!c) return;
    this.chest = this.stop = null;
    c.judged = true;
    c.ok = true;
    this.ev.push({ t: 'vanish', p: c });
    this.snd('whoosh', this.pos(c, 0, 0.4), 'arc');
  }

  /** ¿Has llegado al cofre del tramo i? (El tramo se acaba entonces, no a mitad de un paso.) */
  atChest(i: number): boolean {
    return !!this.chest && this.chest.tramo === i;
  }

  /** Lo que queda hasta el cofre del tramo i (m). */
  toChest(i: number): number {
    const e = this.ends[i];
    return e === undefined ? 0 : Math.max(0, e - this.tk.dist);
  }

  /* ---------- cada repetición ---------- */

  /** Una repetición del ejercicio. Empuja si vas en marcha; parado ante un paso, recuerda lo que toca (y no empuja); en
   * el aire, no empuja. Devuelve si ha empujado (las de una parada no cuentan para el tramo). */
  rep(perfect: boolean): boolean {
    if (this.fly && this.env.state === 'play') this.flyRepN = Math.max(this.flyRepN, perfect ? 2 : 1); // (volando, un aletazo)
    if (this.env.state !== 'play' || (this.moves.plank && !this.prone)) return false; // (echado, no empujas: llevas la inercia)
    if (this.lunge) this.legRep();
    if (this.auto) return false; // (en la suave avanzas solo: las flexiones o las bajadas no empujan)
    if (this.stop || this.hop) {
      if (this.stop && this.stop.k !== 'boss') this.ask(this.stop, false);
      return false;
    }
    this.tk.rep(perfect);
    this.pull();
    this.sinceRep = 0;
    return true;
  }

  /* ---------- cada fotograma ---------- */

  step(dt: number): void {
    const env = this.env, tk = this.tk, st = env.state, H = env.head;
    moveCfg(this.sFn, this.cfg);
    this.time += dt;
    this.dtNow = dt;
    const fv = env.s('platFoeV');
    this.foeV = fv > 0 ? fv : FOE_V;
    this.cfg.deepNeed = Math.max(0.12, (0.8 * (env.dv('squatDepth') || 26)) / 100);
    const prone = this.prone;
    // (en plancha, escorarse mueve la cabeza menos que un paso de pie; en zancada, inclinar el tronco, algo menos también)
    if (prone) this.cfg.sideNeed = Math.max(PRONE_SIDE_MIN, this.cfg.sideNeed * PRONE_SIDE_K);
    else if (this.lunge) this.cfg.sideNeed *= LUNGE_SIDE_K;
    if (this.lunge) this.legStep(dt, st);
    this.moves.prone = prone;
    this.moves.hold = this.sideAhead() || !!this.hop?.glide || this.fly; // (planeando, la cabeza a un lado coge las frutas; volando, el centro no se mueve)
    this.armsStep();
    this.moves.sway = CLIMB_SWAY;
    this.moves.update(dt, H, this.cfg);
    this.wristStep(dt);
    if (this.fly) {
      this.flyStep(dt, st);
      this.uShift = this.glider.u; // (volando, el mundo se desplaza a tu lado: lo que te apartas se ve)
    }
    // (en plancha, «abrir los brazos» para planear es aguantar abajo)
    if (prone) this.armsOpen = this.moves.plank;
    // trepar (en plancha, en la dura): en una cuesta empinada, cada vaivén de ir mano a mano empuja como una flexión
    if (prone && !this.auto && st === 'play' && this.grades.length && this.slopeAt(tk.dist) > CLIMB_SLOPE) {
      if (!this.climbSaid) {
        this.climbSaid = true;
        this.say('¡Cuesta empinada! Trepa mano a mano', COL_ASK, 2, false);
      }
      if (this.moves.climb) this.rep(false);
    }
    // la suave: el recorrido viene solo, a su paso (sin turbo: no hay repeticiones)
    if (this.auto && st === 'play' && !this.stop) {
      tk.want = this.vmax * AUTO_K;
      tk.push = 1;
      tk.idle = 0;
    }
    this.dashStep(dt, st);
    const d0 = tk.dist, push0 = tk.push, v0 = tk.v;
    if (this.stop || this.hop) tk.idle = 0; // (el turbo espera en las paradas y en el aire)
    tk.step(dt, env.now);
    if (this.stop) {
      tk.dist = d0;
      tk.v = 0;
      tk.push = 0;
    } else if (this.hop) {
      // en el aire, la inercia: lo que avanzas lo pone el salto; la velocidad y el empuje que traías no se gastan
      tk.dist = d0;
      tk.v = this.hop.v1;
      tk.push = push0;
    } else if (st === 'play' && this.airT >= 0) {
      // en el aire (el tronco, el supersalto o saltar porque sí), la inercia: no frenas
      tk.v = Math.max(tk.v, v0);
      tk.push = push0;
    } else if (st === 'play' && this.moves.plank && !this.auto) {
      // echado (el túnel): la inercia, sin gastarse; cerca y dentro de un túnel, como poco CRAWL_V (pasas por debajo)
      tk.v = Math.max(v0, this.crawlNear() ? CRAWL_V : 0);
      tk.push = push0;
      tk.dist = d0 + tk.v * dt;
    } else if (st === 'play' && tk.push > 0 && tk.v < tk.want) tk.v = Math.min(tk.want, tk.v + dt * PLAT_ACCEL); // (acelera antes)
    // las cuestas: cuesta arriba cada repetición te lleva menos lejos, cuesta abajo más; y cuesta abajo, sin repeticiones, la
    // inercia se gasta más despacio (sin repeticiones te sigues parando, también bajando)
    if (this.grades.length && st === 'play' && !this.stop && !this.hop) {
      const g = this.slopeAt(tk.dist);
      tk.dist = d0 + (tk.dist - d0) * gradeK(g);
      if (g < -0.01 && tk.push <= 0 && tk.v < v0) tk.v += (v0 - tk.v) * 0.3 * Math.min(1, -g / 0.08);
    }
    // el vuelo: en picado, como poco la máxima; frenando en pica, cada vez más despacio
    if (this.fly && st === 'play' && !this.stop) {
      if (this.glider.diving) tk.v = Math.max(tk.v, this.vmax);
      else if (this.glider.braking) tk.v *= Math.max(0, 1 - FLY.brake * this.glider.brakeK * dt);
    }
    // el acelerón (en plancha): como poco DASH_K la máxima, mientras dura
    if (this.dashT > 0 && st === 'play' && !this.stop && !this.hop) tk.v = Math.max(tk.v, this.vmax * DASH_K);
    // la supervelocidad: como poco SUPER_K la máxima, mientras dura
    if (this.superT > 0 && st === 'play') {
      this.superT = Math.max(0, this.superT - dt);
      if (!this.stop && !this.hop) tk.v = Math.max(tk.v, this.vmax * SUPER_K);
    }
    this.stepHop(dt);
    this.stepAir(dt);
    this.stepLev(dt);
    // ante un paso, frenas suave hasta quedarte a STOP_AT de su borde (nunca lo pasas sin haberlo cruzado)
    const h = this.nextHalt();
    if (h && !this.hop && this.stop !== h) {
      const room = h.at - STOP_AT - tk.dist, vcap = Math.sqrt(2 * HALT_BRAKE * Math.max(0, room));
      if (tk.v > vcap) tk.v = vcap;
      if (room < 0.02) {
        tk.dist = h.at - STOP_AT;
        if (st === 'play' || h.k === 'chest') this.halt(h);
        else tk.v = 0;
      }
    }
    // al acabar la plataforma, bajas (suave)
    const S = this.onStep;
    if (S && !this.hop && tk.dist + H.z >= S.at + S.len) {
      this.onStep = null;
      this.levTo = { from: this.lev, to: 0, t: 0, dur: DROP_T + LEV_PER_M * this.lev };
    }
    tk.frame();
    this.reveal();
    if (st === 'play') {
      this.bossStep(dt);
      this.walk(dt);
      this.attack(dt);
      this.spit(dt);
      if (this.moves.takeoff && !this.hop && !this.stop && !this.fly) this.takeoff(H.z); // (volando, una explosiva es un aletazo)
      this.forkStep();
      // el portal: al cruzarlo, otro mundo
      const w = this.worldAt(tk.dist - H.z);
      if (w !== this.world) {
        this.world = w;
        const W = WORLDS[w % WORLDS.length];
        this.ev.push({ t: 'world', w });
        this.snd('victory', null);
        this.ev.push({ t: 'trophy', title: `MUNDO ${w + 1}`, sub: W.name });
      }
      for (const p of this.live) {
        if (p.judged || !FLUID.includes(p.k) || p === this.hop?.p) continue;
        const z = p.at + p.walk - tk.dist + H.z;
        // (lo de la otra rama de una bifurcación no te toca: pasa de largo)
        if (p.lane && p.lane !== this.lane) {
          if (z < -1) p.judged = true;
          continue;
        }
        this.judge(p, z);
      }
      // el fantasma: dónde vas, cada GHOST_DT s
      this.tlT += dt;
      if (this.tlT >= GHOST_DT) {
        this.tlT -= GHOST_DT;
        if (this.tl.length < 900) this.tl.push(Math.round(tk.dist));
      }
    } else this.airT = -1;
    this.drop();
    this.pull();
  }


  /** La seta y el cangrejo: cuando te quedan a FOE_WAKE m, andan hacia ti hasta su sitio (y allí te esperan). */
  private walk(dt: number): void {
    const d = this.tk.dist;
    for (const p of this.live) {
      // el cofre dice al aparecer (o al empezar el tramo, si ya se veía) qué hay dentro (regla del usuario)
      if (p.k === 'chest' && !p.warned && !p.judged && p !== this.chest) {
        p.warned = true;
        // (lo que hay dentro, al marcador: no es lo que viene, es información; decidido por el usuario)
        this.cheer(`Al final del tramo, un cofre: dentro, una llave (${this.keys + 1} de ${TREASURE_KEYS}: con ${TREASURE_KEYS}, el tesoro) y una gema`, COL_ASK, 3);
      }
      if (!WALKERS.includes(p.k) || p.judged) continue;
      if (!p.woke && p.at + p.walk - d < FOE_WAKE) {
        p.woke = true;
        this.ev.push({ t: 'wake', p });
      }
      if (p.woke && p.walk > 0) p.walk = Math.max(0, p.walk - this.foeV * dt);
    }
  }

  /** El cangrejo escupe, una vez y solo desde lejos (entre SPIT_NEAR y SPIT_FAR m de tu cabeza) si no hay otro reto cerca de
   * ti; el escupitajo vuela hacia donde estaba tu cabeza y, al llegar, si la has apartado SPIT_R m, lo esquivas. */
  private spit(dt: number): void {
    const d = this.tk.dist, H = this.env.head, v = Math.max(0, this.tk.v);
    for (const p of this.live) {
      if (p.k !== 'side' || p.n || p.judged || p.spat || !p.woke) continue; // (el esqueleto pirata no escupe)
      const z = p.at + p.walk - d + H.z;
      if (z < SPIT_NEAR) p.spat = true; // (ya cerca: nunca)
      if (z > SPIT_FAR || p.spat || !this.spitFree(p, SPIT_FREE + v * 1.3)) continue;
      p.spat = true;
      const dur = z / (SPIT_V + v);
      this.spits.push({ p, t: 0, end: SPIT_WIND + dur, x: H.x, y: H.y });
      this.ev.push({ t: 'spit', p, wind: SPIT_WIND, dur, aim: { x: H.x, y: H.y, z: H.z } });
      if (ASK_AHEAD) this.say('¡El cangrejo escupe! Aparta la cabeza', COL_ASK, 1.2, false);
    }
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const S = this.spits[i];
      S.t += dt;
      if (S.t < S.end) continue;
      this.spits.splice(i, 1);
      if (S.p.k === 'fire') {
        this.burn(S);
        continue;
      }
      const ok = Math.hypot(H.x - S.x, H.y - S.y) >= SPIT_R;
      this.ev.push({ t: 'spat', p: S.p, ok });
      if (ok) {
        this.passed++;
        this.score(120);
        this.snd('whoosh', null, 'arc');
        this.cheer('¡Escupitajo esquivado!', COL_OK, 0.9);
        continue;
      }
      // te da: frenas a la mitad y se rompe la racha (sin vidas)
      this.hits++;
      this.tk.v *= HIT_KEEP;
      this.ev.push({ t: 'combo0' });
      this.tk.turboSet(false);
      this.snd('squish', null);
      this.ev.push({ t: 'haptic', k: 0.7, ms: 140 });
      this.say('¡Te ha escupido! Aparta la cabeza', COL_WARN, 1.6, true);
    }
  }

  /** El cíclope y el demonio, a un lado: al acercarte, el cíclope golpea el suelo (su onda corre por la pasarela hacia ti) y
   * el demonio lanza su bola de fuego en arco hacia donde está tu cabeza. */
  private attack(dt: number): void {
    const d = this.tk.dist, H = this.env.head;
    for (const p of this.live) {
      if (p.judged || (p.k !== 'quake' && p.k !== 'fire') || (p.lane && p.lane !== this.lane)) continue;
      const z = p.at - d + H.z;
      if (p.k === 'quake') {
        if (p.spat) p.fx += QUAKE_V * dt;
        else if (z < QUAKE_AT) {
          p.spat = true;
          p.fx = -QUAKE_WIND * QUAKE_V; // (sale cuando el puño llega al suelo)
          this.ev.push({ t: 'slam', p, wind: QUAKE_WIND });
          if (ASK_AHEAD) this.say('¡Salta la onda!', COL_ASK, 1.2, false);
        }
        continue;
      }
      if (p.spat || z > FIRE_AT) continue;
      p.spat = true;
      this.spits.push({ p, t: 0, end: FIRE_WIND + FIRE_DUR, x: H.x, y: H.y });
      this.ev.push({ t: 'spit', p, wind: FIRE_WIND, dur: FIRE_DUR, aim: { x: H.x, y: Math.max(0.3, H.y - 0.7), z: H.z } });
      if (ASK_AHEAD) this.say('¡Bola de fuego! Un paso a un lado', COL_ASK, 1.4, false);
    }
  }

  /** La bola de fuego llega: si te has apartado FIRE_R m de donde estaba tu cabeza, la esquivas; si no, te quemas (frenas a
   * la mitad y se rompe la racha, sin vidas). */
  private burn(S: Spit): void {
    const p = S.p, ok = Math.abs(this.env.head.x - S.x) >= FIRE_R;
    this.ev.push({ t: 'spat', p, ok });
    p.judged = true;
    p.ok = ok;
    if (ok) {
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(150);
      this.snd('whoosh', null, 'arc');
      this.cheer('¡Bola de fuego esquivada!', COL_OK, 0.9);
      return;
    }
    this.tk.v *= HIT_KEEP;
    this.hit(p, this.pos(p, 0, 0.6));
    this.say('¡Te has quemado! Un paso a un lado cuando la lance', COL_WARN, 1.6, true);
  }

  /** ¿No hay otro reto (que pida un movimiento) a menos de `room` m por delante de tu cabeza, ni pasando ahora? */
  private spitFree(crab: Piece, room: number): boolean {
    const d = this.tk.dist, hz = this.env.head.z;
    for (const q of this.live) {
      if (q === crab || q.judged || q.k === 'fruit' || q.k === 'chest' || q.k === 'floor') continue;
      const z = q.at + q.walk - d + hz;
      if (z > -0.6 - q.len && z < room) return false;
    }
    return !this.hop && !this.stop;
  }

  /** La bifurcación: el mundo se desplaza a un lado (suave, en sus rampas) para que tu rama quede bajo tus pies; al acabarla,
   * vuelves a la pasarela de siempre. */
  private forkStep(): void {
    const F = this.fork;
    if (!F) return;
    const d = this.tk.dist - this.env.head.z;
    if (d > F.at + F.len) {
      this.fork = null;
      this.lane = 0;
      this.uShift = 0;
      return;
    }
    const kin = smooth(Math.min(1, Math.max(0, (d - F.at) / FORK_RAMP))), kout = smooth(Math.min(1, Math.max(0, (F.at + F.len - d) / FORK_RAMP)));
    this.uShift = this.lane * FORK_U * Math.min(kin, kout);
  }

  /** Los brazos en cruz (ver `armsOpen`). */
  private armsStep(): void {
    const H = this.env.head, A = this.env.hands, sh = H.y - ARMS_SH;
    const out = (h: { ok: boolean; x: number; y: number }): boolean => h.ok && Math.abs(h.x - H.x) >= ARMS_OUT && Math.abs(h.y - sh) <= ARMS_DY;
    const near = (h: { ok: boolean; x: number }): boolean => h.ok && Math.abs(h.x - H.x) < ARMS_IN;
    const L = A.l, R = A.r;
    if ((out(L) && out(R)) || (out(L) && !R.ok) || (out(R) && !L.ok)) this.armsOpen = true;
    else if (near(L) || near(R)) this.armsOpen = false;
  }

  /** En zancada, el cambio de pierna (opción 1 del usuario: el juego lo avisa y confía en ti; las gafas no ven las piernas): al
   * empezar, con cuál; cada `legEvery` bajadas, a la otra. */
  private legRep(): void {
    if (++this.legReps >= this.legEvery) this.legSwap();
  }
  /** Cada fotograma en zancada: el primer aviso y, en la estática (que apenas pide bajadas), el cambio también por tiempo. */
  private legStep(dt: number, st: string): void {
    if (st !== 'play' || this.stop) return;
    if (!this.legAsked) {
      this.legAsked = true;
      this.say('Empieza con la pierna derecha delante', COL_ASK, 2.5, true);
    }
    if (this.auto && (this.legT += dt) >= this.legEvery * LEG_S) this.legSwap();
  }
  private legSwap(): void {
    this.leg ^= 1;
    this.legReps = 0;
    this.legT = 0;
    this.say(`¡Cambia de pierna! Ahora, la ${this.leg ? 'izquierda' : 'derecha'} delante`, COL_ASK, 2.5, true);
    this.ev.push({ t: 'haptic', k: 0.3, ms: 60 });
  }

  /** En plancha, el acelerón: echar el peso adelante (la cabeza, PRONE_FWD m por delante de su sitio) da DASH_T s más deprisa;
   * el siguiente, pasados DASH_CD s. */
  private dashStep(dt: number, st: string): void {
    this.dashT = Math.max(0, this.dashT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (!(this.prone || this.lunge) || st !== 'play' || this.stop || this.hop || this.dashCd > 0 || this.moves.fwd < (this.prone ? PRONE_FWD : LUNGE_FWD)) return;
    this.dashT = DASH_T;
    this.dashCd = DASH_CD;
    this.snd('whoosh', null, 'arc');
    this.ev.push({ t: 'haptic', k: 0.4, ms: 70 });
    this.cheer('¡Acelerón!', COL_OK, 0.9);
  }

  /** ¿Se acerca un obstáculo a un lado (o está pasando)? Entonces el centro no sigue a la cabeza. */
  private sideAhead(): boolean {
    const look = Math.max(SIDE_WARN_AT, SIDE_HOLD_S * Math.max(this.tk.v, 0.5));
    for (const p of this.live) if ((p.k === 'side' || p.k === 'fruit' || p.k === 'fork' || p.k === 'fire' || p.k === 'ledge' || p.k === 'gust' || p.k === 'rockfall' || p.k === 'lane' || ARMS_KINDS.includes(p.k)) && !p.judged && p.at - this.tk.dist < look + (p.k === 'fire' ? FIRE_AT : 0)) return true;
    return false;
  }

  /** ¿Hay un túnel cerca por delante (CRAWL_NEAR m) o lo estás pasando? */
  private crawlNear(): boolean {
    const d = this.tk.dist;
    for (const p of this.live) if (p.k === 'crawl' && !p.judged && p.at - d < CRAWL_NEAR && p.at + p.len > d - 0.5) return true;
    return false;
  }

  /** El primer paso que aún no has cruzado. */
  private nextHalt(): Piece | null {
    for (const p of this.live) if (HALT.includes(p.k) && !p.judged) return p;
    for (let i = this.nextShow; i < this.pieces.length; i++) if (HALT.includes(this.pieces[i].k) && !this.pieces[i].judged) return this.pieces[i];
    return null;
  }

  /** Las piezas que entran en la vista (a `PLAT_SEE` m, entre la niebla). */
  private reveal(): void {
    const d = this.tk.dist;
    while (this.nextShow < this.pieces.length && this.pieces[this.nextShow].at - d < PLAT_SEE) {
      const p = this.pieces[this.nextShow++];
      p.shown = true;
      this.live.push(p);
      this.ev.push({ t: 'show', p });
    }
  }

  /** Las que han quedado atrás, fuera (sin crear otra lista). */
  private drop(): void {
    const d = this.tk.dist;
    let k = 0;
    for (const p of this.live) {
      if (p.at + p.len < d - BEHIND && p !== this.chest) this.ev.push({ t: 'hide', p });
      else this.live[k++] = p;
    }
    this.live.length = k;
  }

  /* ---------- las fluidas ---------- */

  /** El juicio de una fluida; `z`, lo que le falta para llegar a tu cabeza (m). */
  private judge(p: Piece, z: number): void {
    const M = this.moves, C = this.cfg, v = this.tk.v;
    const far = p.k === 'lane' || p.k === 'side' || p.k === 'gap' || p.k === 'step' || p.k === 'fruit' || p.k === 'foe' || p.k === 'box' || p.k === 'spring' || p.k === 'fork' || p.k === 'dive' || p.k === 'skull' || p.k === 'ledge' || p.k === 'gust' || p.k === 'bob' || p.k === 'sink' || p.k === 'cannon';
    // (el túnel, con más tiempo: hay que echarse al suelo; el cíclope y el demonio, antes de su ataque)
    const warnAt = p.k === 'cannon' ? CANNON_AT + 2 : p.k === 'quake' ? QUAKE_AT + 4 : p.k === 'rockfall' ? Math.max(10, (v + 0.2) * ROCKFALL_T + 6) : p.k === 'fire' ? FIRE_AT + 4 : p.k === 'crawl' || p.k === 'glide' ? Math.max(10, 3.5 * v) : Math.max(far ? SIDE_WARN_AT : WARN_AT, v * (far ? SIDE_WARN_S : WARN_S));
    if (!p.warned && z < warnAt) {
      p.warned = true;
      this.ask(p, true);
    }
    if (p.k === 'bob') {
      // llegas al borde sin haber saltado: tropiezas al cruzarlo (el islote se queda a ras para que pases)
      if (z <= 0 && !this.hop) this.go(p, false, '¡Salta al islote cuando esté a ras!');
      return;
    }
    if (p.k === 'sink') {
      // el islote que se hunde: al pisarlo empieza a hundirse; si te paras en él (dejas de hacer repeticiones SINK_IDLE s, o
      // vas más despacio que SINK_V más de SINK_GRACE s), se te hunde: frenas y se rompe la racha, una vez
      if (z < 0.1 && !p.woke) {
        p.woke = true;
        this.ev.push({ t: 'sinking', p });
        this.snd('metalHit', this.pos(p, 0, 0), false);
      }
      if (z < 0.1 && z > -p.len && !p.bad && !this.hop) {
        p.got = v < SINK_V ? p.got + this.dtNow : 0; // (lo que llevas casi parado en él, en `got`)
        if (p.got > SINK_GRACE || this.tk.idle > SINK_IDLE) {
          p.bad = true;
          this.tk.v *= HIT_KEEP;
          this.hit(p, this.pos(p, 0, 0));
          this.say('¡Que se hunde! No te pares', COL_WARN, 1.6, true);
        }
      }
      if (z < -p.len - 0.3) {
        p.judged = true;
        p.ok = !p.bad;
        if (p.ok) {
          this.passed++;
          this.ev.push({ t: 'pass', p });
          this.score(180);
          this.cheer('¡Islote cruzado!', COL_OK, 1.0);
        }
      }
      return;
    }
    if (ARMS_KINDS.includes(p.k)) {
      this.judgeArms(p, z);
      return;
    }
    if (FLY_KINDS.includes(p.k)) {
      this.judgeFly(p, z);
      return;
    }
    if (p.k === 'lane') {
      // el paso lateral en plancha (elegido por el usuario): las rocas ocupan tu lado (`side`); hay que caminar con las manos
      // al otro y aguantar ahí todo su largo; si no, una vez, chocas: frenas y se rompe la racha
      const away = -p.side * M.dx;
      if (z < 0.1 && z > -p.len && !p.bad && away < LANE_NEED) {
        p.bad = true;
        this.tk.v *= HIT_KEEP;
        this.hit(p, this.pos(p, 0, 0.4));
        this.say(`¡Camina con las manos a la ${p.side < 0 ? 'derecha' : 'izquierda'}!`, COL_WARN, 1.6, true);
      }
      if (z < -p.len - 0.3) {
        p.judged = true;
        p.ok = !p.bad;
        if (p.ok) {
          this.passed++;
          this.ev.push({ t: 'pass', p });
          this.score(180);
          this.cheer('¡Carril cambiado!', COL_OK, 1.0);
        }
      }
      return;
    }
    if (p.k === 'ledge' || p.k === 'gust') {
      // la cornisa (pegado a la pared: el vacío, al lado `side`) y la racha (inclinado contra el viento, que sopla desde
      // `side`): todo su largo; si no, una vez, frenas y se rompe la racha
      const need = C.sideNeed * LEAN_K, lean = p.k === 'ledge' ? -p.side * M.dx : p.side * M.dx;
      if (z < 0.1 && z > -p.len && !p.bad && lean < need) {
        p.bad = true;
        this.tk.v *= HIT_KEEP;
        this.hit(p, this.pos(p, 0, 0.6));
        this.say(p.k === 'ledge' ? '¡Pégate a la pared!' : `¡Inclínate contra el viento, a la ${p.side < 0 ? 'izquierda' : 'derecha'}!`, COL_WARN, 1.6, true);
      }
      if (z < -p.len - 0.3) {
        p.judged = true;
        p.ok = !p.bad;
        if (p.ok) {
          this.passed++;
          this.ev.push({ t: 'pass', p });
          this.score(180);
          this.cheer(p.k === 'ledge' ? '¡Cornisa superada!' : '¡Has aguantado el viento!', COL_OK, 1.0);
        }
      }
      return;
    }
    if (p.k === 'rockfall') {
      // el desprendimiento: las rocas empiezan a caer cuando te queda ROCKFALL_T para llegar (con su ruido) y caen a tu lado
      // del camino al llegar: hay que estar en el otro
      if (!p.woke && z < Math.max(2.5, (v + 0.2) * ROCKFALL_T)) {
        p.woke = true;
        this.ev.push({ t: 'rockfall', p, dur: ROCKFALL_T });
      }
      if (Math.abs(z) < SIDE_WIN && !M.clear(p.side as -1 | 1, C)) p.bad = true;
      if (z < -SIDE_WIN) this.result(p, !p.bad);
      return;
    }
    if (p.k === 'dive') {
      // la abeja o el murciélago en picado (en la costa, el tiburón pirata y su tajo alto): cuando llega a tu cabeza,
      // agachado (como bajo una viga)
      if (z < 0.1) this.result(p, M.under(p.h));
      return;
    }
    if (p.k === 'cannon') {
      // el cañonazo: el barco dispara a CANNON_AT m (la bala llega cuando la pieza llega a ti); la alta, agachado, como bajo
      // una viga; la baja, que rueda por el muelle, en el aire al pasar (como un tronco)
      if (!p.woke && z < CANNON_AT) {
        p.woke = true;
        this.ev.push({ t: 'cannon', p });
        if (ASK_AHEAD) this.say(p.n ? '¡Bala baja! Sáltala' : '¡Bala alta! Agáchate', COL_ASK, 1.4, false);
      }
      if (!p.n) {
        if (z < 0.1) this.result(p, M.under(p.h));
        return;
      }
      const win = Math.max(LOG_WIN, LOG_WIN_S * v);
      if (Math.abs(z) < win) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air) p.fast = true;
      }
      if (z < -win) this.result(p, p.maxUp >= C.jumpH && p.fast);
      return;
    }
    if (p.k === 'skull') {
      // la calavera que bota: en el aire cuando pasa bajo ti (llega andando: la ventana, con su paso)
      const win = Math.max(LOG_WIN, LOG_WIN_S * (v + (p.walk > 0 ? this.foeV : 0)));
      if (Math.abs(z) < win) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air) p.fast = true;
      }
      if (z < -win) this.result(p, p.maxUp >= C.jumpH && p.fast);
      return;
    }
    if (p.k === 'quake') {
      // la onda del cíclope: en el aire cuando pasa bajo tus pies
      if (!p.spat) return;
      const zw = p.at - Math.max(0, p.fx) - this.tk.dist + this.env.head.z, win = Math.max(QUAKE_WIN, LOG_WIN_S * (v + QUAKE_V));
      if (Math.abs(zw) < win && M.air) p.fast = true;
      if (zw < -win) this.result(p, p.fast);
      return;
    }
    if (p.k === 'fire') {
      // (lo juzga su bola de fuego; si la pasas sin que la lance, nada)
      if (z < -2 && !p.spat) {
        p.judged = true;
        p.ok = true;
      }
      return;
    }
    if (p.k === 'gap') {
      if (z <= 0 && !this.hop) this.go(p, false); // (llegas al borde sin haber saltado: tropiezas al cruzarlo)
      return;
    }
    if (p.k === 'spring') {
      // el trampolín: pisado con una sentadilla honda (hecha hace poco), te lanza; si no, lo pisas sin más (es un premio)
      if (z <= 0 && !this.hop) {
        if (this.moves.deepT < SPRING_DEEP) this.springLaunch(p);
        else {
          p.judged = true;
          p.ok = false;
        }
      }
      return;
    }
    if (p.k === 'fork') {
      // la bifurcación: al llegar, por la rama hacia la que tengas apartada la cabeza (sin apartarla, la tranquila)
      if (z <= 0) {
        const dx = this.moves.dx;
        this.lane = dx >= FORK_PICK ? 1 : -1;
        this.fork = p;
        p.judged = true;
        p.ok = true;
        this.ev.push({ t: 'pass', p });
        this.cheer(this.lane > 0 ? '¡Por el camino difícil!' : 'Por el camino tranquilo', COL_OK, 1.2);
      }
      return;
    }
    if (p.k === 'glide') {
      // el barranco: al llegar a su borde con los brazos en cruz, planeas; si no, lo cruzas a trompicones (nunca se cae)
      if (z <= 0 && !this.hop) this.glideStart(p, this.armsOpen);
      return;
    }
    if (p.k === 'step') {
      if (z <= 0) this.climb(p, false); // (sin saltar: subes a trompicones)
      return;
    }
    if (p.k === 'crawl') {
      // bajo el techo: la cabeza, abajo (en plancha); si no, chocas una vez (frenas y se rompe la racha) y sigues
      if (z < 0.1 && z > -p.len && !M.plank && !p.bad) {
        p.bad = true;
        this.tk.v *= HIT_KEEP;
        this.hit(p, this.pos(p, 0, 0.75));
        this.say('¡Cabeza abajo en el túnel!', COL_WARN, 1.6, true);
      }
      if (z < -p.len - 0.3) {
        p.judged = true;
        p.ok = !p.bad;
        if (p.ok) {
          this.passed++;
          this.ev.push({ t: 'pass', p });
          this.score(200);
          this.cheer('¡Túnel superado!', COL_OK, 1.0);
        }
        if (ASK_AHEAD) this.say('¡De pie!', COL_ASK, 1.2, false);
      }
      return;
    }
    if (p.k === 'box') {
      // el barril sorpresa: en el aire cuando pasa sobre tu cabeza (con el salto, el mundo baja y te lo encuentras), se rompe;
      // si no, pasa por encima sin más (es un premio, no un obstáculo)
      const win = Math.max(LOG_WIN, LOG_WIN_S * v);
      if (Math.abs(z) < win) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air && p.maxUp >= C.jumpH) this.bonk(p);
      } else if (z < -win) {
        p.judged = true;
        p.ok = false;
      }
      return;
    }
    if (p.k === 'fruit' && p.gold) {
      // la dorada: alta, en el centro: se coge saltando cuando pasa
      if (Math.abs(z) < FRUIT_WIN && M.air && M.up >= C.jumpH) {
        p.judged = true;
        p.ok = true;
        this.passed++;
        this.ev.push({ t: 'pass', p });
        this.goldGot(p);
      } else if (z < -FRUIT_WIN) {
        p.judged = true;
        p.ok = false;
      }
      return;
    }
    if (p.k === 'fruit') {
      if (Math.abs(z) < FRUIT_WIN && p.side * M.dx >= C.sideNeed * 0.8) this.eat(p);
      else if (z < -FRUIT_WIN) {
        p.judged = true;
        p.ok = false;
      }
      return;
    }
    if (p.k === 'side') {
      // el cangrejo: mientras pasa a tu lado, la cabeza (el cuerpo) apartada al otro
      if (Math.abs(z) < SIDE_WIN && !M.clear(p.side as -1 | 1, C)) p.bad = true;
      if (z < -SIDE_WIN) this.result(p, !p.bad);
      return;
    }
    if (p.k === 'foe') {
      // la seta: en el aire cuando llega a tus pies (andando hacia ti, llega antes: la ventana, con su paso), la pisas
      const win = Math.max(LOG_WIN, LOG_WIN_S * (v + (p.walk > 0 ? this.foeV : 0)));
      if (Math.abs(z) < win) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air && p.maxUp >= C.jumpH) this.stomp(p);
        return;
      }
      if (z < -win) this.result(p, false);
      return;
    }
    if (p.k === 'log') {
      const win = Math.max(LOG_WIN, LOG_WIN_S * v);
      if (Math.abs(z) < win) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air) p.fast = true;
      }
      if (z < -win) this.result(p, p.maxUp >= C.jumpH && p.fast);
      return;
    }
    if (p.k === 'low' && z < 0.1) this.result(p, M.under(p.h));
  }

  /** Superada o chocada. Chocar frena (te queda la mitad de la velocidad: sigues) y rompe la racha. */
  private result(p: Piece, ok: boolean): void {
    p.judged = true;
    p.ok = ok;
    const at = this.pos(p, p.k === 'quake' ? -Math.max(0, p.fx) : p.walk, p.k === 'low' || p.k === 'dive' || (p.k === 'cannon' && !p.n) ? this.env.calibRef + HEAD_TOP - p.h : 0.3);
    if (ok) {
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(p.k === 'cannon' ? 160 : p.k === 'log' || p.k === 'dive' || p.k === 'skull' ? 150 : p.k === 'quake' ? 180 : p.k === 'side' ? CRAB_PTS : 120);
      this.snd('whoosh', at, 'arc');
      this.cheer(p.k === 'cannon' ? '¡Bala esquivada!' : isPirate(p) ? (p.k === 'dive' ? '¡Tajo esquivado!' : '¡Esqueleto esquivado!') : p.k === 'log' ? '¡Saltado!' : p.k === 'low' ? '¡Esquivada!' : p.k === 'dive' ? '¡Picado esquivado!' : p.k === 'skull' ? '¡Calavera saltada!' : p.k === 'quake' ? '¡Onda saltada!' : p.k === 'rockfall' ? '¡Desprendimiento esquivado!' : '¡Cangrejo esquivado!', COL_OK, 0.9);
      return;
    }
    this.tk.v *= HIT_KEEP;
    this.hit(p, at);
    const away = p.side < 0 ? 'derecha' : 'izquierda';
    if (p.k === 'cannon' || isPirate(p)) {
      this.say(p.k === 'cannon' ? (p.n ? '¡Te ha dado la bala! Salta la que rueda' : '¡Te ha dado la bala! Agáchate con la alta') : p.k === 'dive' ? '¡Te ha dado con la espada! Agáchate' : `¡Te ha dado el esqueleto! Apártate a la ${away}`, COL_WARN, 1.6, true);
      return;
    }
    if (p.k === 'dive' || p.k === 'skull' || p.k === 'quake' || p.k === 'rockfall') {
      this.say(p.k === 'rockfall' ? `¡Te han dado las rocas! Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}` : p.k === 'dive' ? `¡Te ha ${p.n % 2 ? 'mordido' : 'picado'}! Agáchate cuando baje en picado` : p.k === 'skull' ? '¡Salta la calavera!' : '¡Salta la onda del cíclope!', COL_WARN, 1.6, true);
      return;
    }
    this.say(p.k === 'log' ? '¡Salta el tronco!' : p.k === 'low' ? '¡Agáchate bajo la viga!' : p.k === 'foe' ? '¡Te ha mordido! Sáltale encima a la seta' : `¡Te ha mordido! Apártate a la ${away}`, COL_WARN, 1.6, true);
  }

  /** Pisas la seta: se chafa, puntos y rebote (el mundo vuelve a bajar bajo los pies, algo más que un salto). */
  private stomp(p: Piece): void {
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.ev.push({ t: 'pass', p });
    this.score(STOMP_PTS);
    this.snd('squish', this.pos(p, p.walk, 0.2));
    this.ev.push({ t: 'fx', name: 'sparks', at: this.pos(p, p.walk, 0.2), n: 14, col: 0xc8ff3a });
    this.ev.push({ t: 'haptic', k: 0.7, ms: 90 });
    this.cheer('¡Aplastada!', COL_OK, 1.0);
    this.airT = 0;
    this.airDur = AIR_T;
    this.airLift = BOUNCE_LIFT;
  }

  /** Lo de chocar o tropezar: se rompe la racha, se apaga el turbo, golpe, polvo y vibración. */
  /** El vuelo, cada fotograma: lo que manda el cuerpo (y la tabla), al planeador; al acercarte al cofre, a posarte; tras él,
   * a despegar (en cuanto empieza el tramo siguiente). */
  private flyStep(dt: number, st: string): void {
    const M = this.moves, I = this.flyIn, A = this.env.hands, H = this.env.head, B = this.flyBody, G = this.glider, play = st === 'play';
    const board = this.env.s('flyBoard') > 0, F = this.flyFit;
    // (sin flexiones solo cuenta jugando y ya en el aire: antes de empezar, calibrando, despegando o entre tramos no se pierde
    // altura; en la práctica, tampoco: sus pasos no son flexiones)
    this.sinceRep = play && !this.practice.active && !G.rising ? this.sinceRep + dt : 0;
    // posado (en plancha arriba, ante el cofre o antes de despegar): el centro se pone donde estás; en el aire, quieto
    if (G.alt < 0.3 && (this.stop || !play) && Math.abs(H.y - M.ref) < 0.05) B.follow(H.x, H.z, dt, 0.6);
    B.read(H.x, H.z);
    // la tabla: las dos muñecas a la vista y estables un instante
    this.wristsT = A.l.ok && A.r.ok ? this.wristsT + dt : 0;
    const tilt = board && this.wristsT > 0.15 ? boardSide(boardTilt(A.l, A.r)) : 0;
    I.side = play ? B.side + tilt : 0;
    I.back = play ? -B.fwd : 0;
    I.down = play ? Math.max(M.down, board ? B.fwd - 0.02 : 0) : 0;
    // (los recorridos, los de los ajustes «Vuelo: recorrido para bajar / para subir / de lado»; lo medido en la práctica, solo
    // si es más largo: más corto, todo era hipersensible)
    I.depth = Math.max(F ? F.down : 0, Math.max(0.04, (this.env.s('flyDown') || 13) / 100));
    I.lowNeed = Math.min(this.cfg.lowNeed, I.depth * 0.6);
    // (el lado, siempre el ajuste «Vuelo: recorrido de lado»: lo que mida la práctica no lo pisa)
    I.range = Math.max(0.08, (this.env.s('flySide') || FLY.sideRange * 100) / 100);
    I.backTo = Math.max(F ? F.back : 0, Math.max(FLY.pikeFrom + 0.03, (this.env.s('flyUp') || FLY.pikeTo * 100) / 100));
    I.flapK = Math.max(0.1, (this.env.s('flyFlap') || 100) / 100);
    I.rateK = Math.max(0.1, (this.env.s('flyRate') || 100) / 100);
    I.rep = play ? this.flyRepN : 0;
    this.flyRepN = 0;
    I.flap = play && M.takeoff;
    I.pair = I.flap && M.deepT < 1e-6;
    I.auto = this.auto;
    I.model = flyModel(this.env.s('flyAlt'), this.auto);
    I.sinceRep = this.auto ? 0 : this.sinceRep;
    I.updraft = false;
    for (const p of this.live) {
      if (p.k !== 'updraft' || p.judged) continue;
      const z = p.at - this.tk.dist;
      if (z < 0.5 && z > -p.len && Math.abs(G.u - p.u) < UPDRAFT_W) I.updraft = true;
    }
    // posarse ante el cofre (y quedarse en él hasta el tramo siguiente)
    const c = this.nextHalt(), room = c ? c.at - STOP_AT - this.tk.dist : Infinity;
    // (antes de empezar —colocándote y calibrando—, en el suelo: se despega al empezar el tramo)
    I.land = this.stop || st === 'ready' ? 1 : st !== 'play' && st !== 'rest' ? 0 : Math.max(0, Math.min(1, 1 - room / LAND_D));
    if (this.practice.active) I.land = 0;
    if (play) this.practiceStep(dt);
    G.step(dt, I);
  }

  /** Cómo se vuela con cada mando de altura (el aviso de al empezar y al acabar la práctica). */
  private flyHow(m: FlyIn['model']): string {
    return m === 'mid' ? 'Brazos estirados: subes · Media flexión: recto · Más abajo: bajas' : m === 'pos' ? 'Escórate: a un lado · Pecho abajo: bajas · Cadera arriba: subes' : 'Escórate: a un lado · Cada flexión, un aletazo · Abajo quieto: picas';
  }

  /** La práctica de vuelo (fly.ts, `FlyPractice`): la primera vez que vuelas (o con «Vuelo: repetir la práctica»), al empezar;
   * si no, lo que hay que hacer, en el aviso breve. */
  private practiceStep(dt: number): void {
    const P = this.practice, I = this.flyIn;
    if (!this.practiceSeen) {
      this.practiceSeen = true;
      if (!this.env.store(FLY_TUTO) || this.env.s('flyPractice') > 0) P.begin();
      else this.say(this.flyHow(I.model), COL_ASK, 4, false);
    }
    if (!P.active) return;
    const r = P.update(dt, this.flyBody.side, I.down, I.back, this.moves.roll, I.rep > 0);
    if (r === 'next') {
      if (P.step === 0) this.cheer('Práctica de vuelo', COL_ASK, 2);
      // (con su número: que se vea que es la práctica y no lo que viene)
      this.say(`Práctica ${P.step + 1}/${PRACTICE.length} · ${PRACTICE[P.step].text}`, COL_ASK, PRACTICE_MAX, false);
    } else if (r === 'ok') {
      this.say(`✓ ${PRACTICE[P.step].done}`, COL_OK, PRACTICE_GAP, false);
      this.snd('perfect', null);
    } else if (r === 'skip') this.say('Seguimos', COL_ASK, PRACTICE_GAP, false);
    else if (r === 'end') {
      // lo medido (al 80 %): el vuelo, a tu medida; lo que no se midió, como estaba
      const f = P.fit(), F = this.flyFit;
      const fit: FlyFit = {
        side: f.side ?? F?.side ?? Math.max(0.08, (this.env.s('flySide') || FLY.sideRange * 100) / 100),
        down: f.down ?? F?.down ?? Math.max(0.05, (this.env.s('pushDepth') || 13) / 100),
        back: f.back ?? F?.back ?? FLY.pikeTo,
      };
      this.flyFit = fit;
      this.ev.push({ t: 'store', key: FLY_FIT, val: fit });
      this.ev.push({ t: 'store', key: FLY_TUTO, val: 1 });
      // (no «¡A volar!»: ya ibas volando; y, de paso, cómo se sube y se baja, que el usuario no lo sabía)
      this.say(`✓ Práctica hecha · ${this.flyHow(I.model)}`, COL_OK, 5, false);
      this.snd('victory', null);
    }
  }

  /** El reto del aire que viene (o null) y lo que le falta para llegar (m): para las reglillas y la caja negra del vuelo. */
  flyNext(): Piece | null {
    let best: Piece | null = null;
    for (const p of this.live) {
      if (p.judged || !FLY_KINDS.includes(p.k)) continue;
      if (!best || p.at < best.at) best = p;
    }
    return best;
  }

  /** Lo del vuelo, al pasar (z: lo que le falta para llegar a ti, m). */
  private judgeFly(p: Piece, z: number): void {
    const G = this.glider;
    const fail = (text: string): void => {
      this.tk.v *= HIT_KEEP;
      this.hit(p, this.pos(p, 0, G.alt + this.env.calibRef));
      this.say(text, COL_WARN, 1.8, true);
    };
    const won = (text: string, pts: number): void => {
      p.judged = true;
      p.ok = true;
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(pts);
      this.snd('whoosh', this.pos(p, 0, G.alt + this.env.calibRef), 'arc');
      this.cheer(text, COL_OK, 0.9);
    };
    const miss = (text: string): void => {
      p.judged = true;
      p.ok = false;
      this.say(text, COL_ASK, 1.4, false);
    };
    if (p.k === 'ring') {
      // el aro: por dentro (un premio: fallarlo no frena)
      if (z < 0.1) {
        if (Math.abs(G.u - p.u) < RING_R && Math.abs(G.alt - p.h) < RING_R) {
          won('¡Por el aro!', 150);
          this.addEnergy(0.15);
        } else miss(G.alt > p.h ? 'Pica para pasar por el aro' : 'Más arriba: aletea');
      }
      return;
    }
    if (p.k === 'pillar') {
      // la columna: hay que estar a otro lado al pasar
      if (z < 0.1) {
        if (Math.abs(G.u - p.u) >= PILLAR_W / 2 + 0.3) won('¡Esquivada!', 120);
        else {
          p.judged = true;
          p.ok = false;
          fail(`¡Escórate a la ${p.u > G.u ? 'izquierda' : 'derecha'}!`);
        }
      }
      return;
    }
    if (p.k === 'arch') {
      // el puente: por debajo
      if (z < 0.1) {
        if (G.alt < p.h - ARCH_CLEAR) won('¡Por debajo del puente!', 160);
        else {
          p.judged = true;
          p.ok = false;
          fail('¡Pica para pasar por debajo!');
        }
      }
      return;
    }
    if (p.k === 'crack') {
      // la grieta: de canto y por ella, todo su largo
      if (z < 0 && z > -p.len && !p.bad && (this.moves.roll < SLIT_ROLL || Math.abs(G.u - p.u) > CRACK_W)) {
        p.bad = true;
        fail(this.moves.roll < SLIT_ROLL ? '¡De canto por la grieta!' : '¡Por la grieta!');
      }
      if (z < -p.len - 0.3) {
        if (p.bad) {
          p.judged = true;
          p.ok = false;
        } else won('¡Giro por la grieta!', 200);
      }
      return;
    }
    if (p.k === 'updraft') {
      // la corriente: si la has cogido, al salir de ella, su premio (la subida la da `flyStep`)
      if (z < 0.5 && z > -p.len && Math.abs(G.u - p.u) < UPDRAFT_W) p.mask |= 1;
      if (z < -p.len) {
        if (p.mask & 1) won('¡Corriente de aire!', 100);
        else {
          p.judged = true;
          p.ok = false;
        }
      }
      return;
    }
    if (p.k === 'berries') {
      // las frutas en fila: cada una, al pasar por ella
      for (let i = 0; i < p.n; i++) {
        const zi = z + (i / Math.max(1, p.n - 1)) * p.len;
        if (!((p.mask >> i) & 1) && Math.abs(zi) < 0.4 && Math.abs(G.u - p.u) < BERRY_R && Math.abs(G.alt - p.h) < BERRY_R) {
          p.mask |= 1 << i;
          p.got++;
          this.fruits++;
          this.score(40);
          this.addEnergy(0.06);
          this.ev.push({ t: 'pick', p, i });
        }
      }
      if (z < -p.len - 0.5) {
        p.judged = true;
        p.ok = p.got > 0;
        if (p.got) {
          this.passed++;
          this.ev.push({ t: 'pass', p });
          this.cheer(p.got === p.n ? '¡Todas las frutas!' : `¡${p.got} frutas!`, COL_OK, 0.9);
        }
      }
    }
  }

  /** Las muñecas: su velocidad hacia abajo (m/s, suavizada; para la palmada). */
  private wristStep(dt: number): void {
    const A = this.env.hands, k = dt > 0 ? 1 - Math.exp(-dt / 0.03) : 0;
    for (const [h, i] of [[A.l, 0], [A.r, 1]] as const) {
      const was = this.wy[i];
      this.wy[i] = h.ok ? h.y : NaN;
      const v = h.ok && !Number.isNaN(was) && dt > 0 ? (h.y - was) / dt : 0;
      this.wvy[i] += (v - this.wvy[i]) * k;
    }
  }

  /** ¿Llega una mano que se ve de verdad a lo que está en las tablas a `z` m de tu cabeza, a su lado (`p.side`)? Con `slap`,
   * bajando deprisa (la palmada). (`seen`: si se ha visto alguna mano.) */
  private handAt(p: Piece, z: number, slap: boolean): { hit: boolean; seen: boolean } {
    const A = this.env.hands, M = this.moves, x = M.x0 + p.side * PAW_U, zz = M.z0 - z;
    let hit = false, seen = false;
    for (const [h, i] of [[A.l, 0], [A.r, 1]] as const) {
      if (!h.ok) continue;
      seen = true;
      const d = Math.hypot(h.x - x, h.z - zz);
      if (d < PAW_R && h.y < (slap ? 0.2 : 0.3) && (!slap || this.wvy[i] <= -SLAP_VY)) hit = true;
    }
    return { hit, seen };
  }

  /** Los movimientos de brazos en plancha (docs/PLAN-ERGONOMIA-Y-CUESTAS.md, apartado 5). Sin avisos de lo que viene: lo que
   * dicen al fallar enseña cómo se hace. */
  private judgeArms(p: Piece, z: number): void {
    const M = this.moves, C = this.cfg, A = this.env.hands;
    const fail = (text: string): void => {
      this.tk.v *= HIT_KEEP;
      this.hit(p, this.pos(p, 0, 0.3));
      this.say(text, COL_WARN, 1.8, true);
    };
    const won = (text: string, pts: number): void => {
      p.judged = true;
      p.ok = true;
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(pts);
      this.snd('whoosh', this.pos(p, 0, 0.3), 'arc');
      this.cheer(text, COL_OK, 1.0);
    };
    if (p.k === 'tilt') {
      // la viga inclinada, baja de su lado: abajo en la flexión y con la cabeza hacia el lado alto (la flexión arquera)
      if (z < 0.1) {
        const ok = M.under(p.h) && -p.side * M.dx >= TILT_NEED;
        if (ok) won('¡Flexión arquera!', 160);
        else {
          p.judged = true;
          p.ok = false;
          fail(`¡Baja cargando el peso a la ${p.side < 0 ? 'derecha' : 'izquierda'}!`);
        }
      }
      return;
    }
    if (p.k === 'wave') {
      // la valla baja y larga: hay que pasar por debajo con la ola (pica, zambullirse y salir en cobra)
      if (z < 0.1) {
        if (M.waveT < WAVE_WIN || M.diving) won('¡La ola!', 200);
        else {
          p.judged = true;
          p.ok = false;
          fail('¡La ola! Pica, zambúllete y sal');
        }
      }
      return;
    }
    if (p.k === 'slit') {
      // la rendija: de canto todo su largo (el giro abierto, como en la plancha lateral)
      if (z < 0 && z > -p.len && !p.bad && M.roll < SLIT_ROLL) {
        p.bad = true;
        fail('¡Ponte de canto! Abre el pecho a un lado');
      }
      if (z < -p.len - 0.3) {
        if (p.bad) {
          p.judged = true;
          p.ok = false;
        } else won('¡De canto por la rendija!', 200);
      }
      return;
    }
    if (p.k === 'reach') {
      // las frutas lejanas, a ras de las tablas: se alcanzan caminando con las manos hacia delante (un premio: fallar no frena)
      if (z < 0.4 && z > -0.6 && M.fwd >= REACH_NEED) {
        p.got = p.n;
        p.judged = true;
        p.ok = true;
        this.passed++;
        this.fruits += p.n;
        this.ev.push({ t: 'pass', p });
        this.score(250);
        this.snd('perfect', this.pos(p, 0, 0.2));
        this.ev.push({ t: 'haptic', k: 0.4, ms: 50 });
        if (!this.addEnergy(FRUIT_E * 2)) this.cheer('¡Frutas alcanzadas!', COL_OK, 0.9);
      } else if (z <= -0.6) {
        p.judged = true;
        p.ok = false;
        this.say('Camina con las manos adelante', COL_ASK, 1.4, false);
      }
      return;
    }
    if (p.k === 'paw' || p.k === 'slap') {
      // las uvas (el zarpazo: cogerlas con la mano) y la seta (la palmada: chafarla bajando la mano de golpe). Si las gafas no
      // ven ninguna mano, vale llevar la cabeza hacia ella (un premio: fallar no frena)
      if (z < 0.9 && z > -0.2) {
        const h = this.handAt(p, z, p.k === 'slap');
        if (h.seen) p.mask |= 1;
        if (p.side * M.dx >= C.sideNeed) p.mask |= 2;
        if (h.hit) {
          won(p.k === 'paw' ? '¡Uvas cogidas!' : '¡Seta chafada!', 180);
          this.addEnergy(FRUIT_E);
          this.ev.push({ t: 'haptic', k: 0.6, ms: 70 });
        }
      } else if (z <= -0.2) {
        if (!(p.mask & 1) && p.mask & 2) {
          won(p.k === 'paw' ? '¡Uvas cogidas!' : '¡Seta chafada!', 180);
          this.addEnergy(FRUIT_E);
        } else {
          p.judged = true;
          p.ok = false;
          this.say(p.k === 'paw' ? 'Coge las uvas con la mano' : 'Chafa la seta de una palmada', COL_ASK, 1.4, false);
        }
      }
      return;
    }
    if (p.k === 'grip') {
      // manos juntas (la pasarela, estrecha) o anchas (una roca en medio): solo si se ven las dos muñecas
      if (z < 0.3 && z > -p.len && !p.bad && A.l.ok && A.r.ok) {
        const w = Math.abs(A.l.x - A.r.x), ok = p.n ? w >= GRIP_WIDE : w <= GRIP_NARROW;
        if (!ok) {
          p.bad = true;
          fail(p.n ? '¡Manos anchas, a los lados de la roca!' : '¡Manos juntas, que no caben!');
        }
      }
      if (z < -p.len - 0.3) {
        if (p.bad) {
          p.judged = true;
          p.ok = false;
        } else won(p.n ? '¡Manos anchas!' : '¡Manos juntas!', 160);
      }
    }
  }

  private hit(p: Piece, at: PlatPos): void {
    this.hits++;
    const tk = this.tk;
    this.ev.push({ t: 'hit', p });
    this.ev.push({ t: 'combo0' });
    tk.turboSet(false);
    this.snd('metalHit', at, false);
    this.ev.push({ t: 'fx', name: 'dust', at, n: 10, col: 0xd8c8a8 });
    this.ev.push({ t: 'haptic', k: 0.8, ms: 120 });
  }

  /* ---------- los pasos ---------- */

  /** Te paras ante un paso. */
  private halt(p: Piece): void {
    if (this.stop === p) return;
    const tk = this.tk;
    tk.v = 0;
    tk.push = 0;
    tk.glide = 0;
    this.stop = p;
    this.stopT = 0;
    this.nagT = 0;
    this.ev.push({ t: 'halt', p });
    if (p.k === 'boss') {
      this.bossHalt(p);
      return;
    }
    if (p.k === 'chest') {
      this.chest = p;
      this.snd('victory', null);
      this.openChest(p);
      return;
    }
  }

  /** Se abre el cofre (como en la Travesía clásica): una llave (con tres, el tesoro del tramo) y una gema para tu colección,
   * con su aviso grande de lo que has conseguido y lo que falta para el premio siguiente. */
  private openChest(p: Piece): void {
    // (las doradas del tramo que acaba: cuántas has cogido)
    const t = this.chest?.tramo ?? 0, of = this.goldsOf(t);
    this.keys++;
    this.score(CHEST_PTS);
    const gems = ((this.env.store(PLAT_GEMS) as number) || 0) + 1;
    // lo que lleva dentro sale flotando al abrirse (la llave, la gema, los puntos, las doradas del tramo y, con tres llaves, el
    // tesoro): sin aviso grande ni mensaje (pedido del usuario: que se abre ya se ve, y la letra pequeña no se leía)
    this.ev.push({ t: 'chest', p, key: this.keys, gem: gems, pts: CHEST_PTS, treasure: this.keys >= TREASURE_KEYS ? TREASURE_PTS : 0, golds: this.golds[t] ?? 0, goldsOf: of });
    this.ev.push({ t: 'store', key: PLAT_GEMS, val: gems });
    if (this.keys >= TREASURE_KEYS) {
      this.keys = 0;
      this.score(TREASURE_PTS);
    }
  }

  /** Subes a la plataforma: con el supersalto (`won`: el mundo baja su altura mientras estás en el aire) o a trompicones
   * (frenas y se rompe la racha). Al acabarla bajas solo (en `step`). La de un burpee celebra el burpee. */
  private climb(p: Piece, won: boolean): void {
    p.judged = true;
    p.ok = won;
    this.onStep = p;
    if (won) {
      this.levTo = { from: this.lev, to: p.h, t: 0, dur: SUPER_LEV_T };
      this.airT = 0;
      this.airDur = SUPER_AIR_T;
      this.airLift = JUMP_LIFT;
      this.passed++;
      this.ev.push({ t: 'pass', p });
      const burpee = p.burpee && this.prevOk(p, 'crawl');
      this.score(burpee ? 400 : 250);
      this.snd('step', null, true);
      this.cheer(burpee ? '¡BURPEE!' : '¡Supersalto!', COL_OK, 1.1);
      if (p.gold) this.goldGot(p); // (la dorada de encima: la coges al subir de un supersalto)
      return;
    }
    this.levTo = { from: this.lev, to: p.h, t: 0, dur: CLIMB_T + LEV_PER_M * p.h };
    this.tk.v *= HIT_KEEP;
    this.hit(p, this.pos(p, 0, p.h));
    this.say(p.burpee ? '¡Salta para subir!' : '¡Sentadilla honda y salta!', COL_WARN, 1.6, true);
  }

  /** ¿La pieza de clase `k` anterior a `p` se superó? (El burpee: el túnel antes de su plataforma.) */
  private prevOk(p: Piece, k: Piece['k']): boolean {
    const i = this.pieces.indexOf(p);
    for (let j = i - 1; j >= 0; j--) if (this.pieces[j].k === k) return this.pieces[j].ok === true;
    return false;
  }

  /** Coges una fruta: energía (la especial, toda) y, con la barra llena, supervelocidad. */
  private eat(p: Piece): void {
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.fruits++;
    this.ev.push({ t: 'pass', p });
    this.score(p.special ? 300 : 100);
    this.snd('perfect', this.pos(p, 0, this.env.calibRef));
    this.ev.push({ t: 'haptic', k: 0.4, ms: 50 });
    if (!this.addEnergy(p.special ? 1 : FRUIT_E)) this.cheer(p.special ? '¡Fruta especial!' : '¡Fruta!', COL_OK, 0.8);
  }

  /** Suma energía; llena, la supervelocidad (devuelve si se ha llenado). */
  private addEnergy(e: number): boolean {
    this.energy = Math.min(1, this.energy + e);
    if (this.energy < 1) return false;
    this.energy = 0;
    this.superT = SUPER_T;
    this.cheer('¡SUPERVELOCIDAD!', '#c8ff3a', 1.8);
    this.snd('combo', null);
    this.ev.push({ t: 'haptic', k: 0.8, ms: 200 });
    return true;
  }

  /** Rompes el barril sorpresa de un cabezazo: dentro, fruta (energía) y puntos; uno de cada cuatro, un racimo que la llena. */
  private bonk(p: Piece): void {
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.boxes++;
    this.ev.push({ t: 'pass', p });
    const big = this.boxes % 4 === 0;
    this.score(big ? 300 : 150);
    this.snd('metalHit', this.pos(p, 0, this.env.calibRef + HEAD_TOP + BOX_CLEAR), true);
    this.ev.push({ t: 'haptic', k: 0.6, ms: 70 });
    if (!this.addEnergy(big ? 1 : FRUIT_E)) this.cheer(big ? '¡Barril sorpresa: un racimo!' : '¡Barril sorpresa: fruta!', COL_OK, 1.0);
  }

  /** Coges una fruta dorada (de las GOLD_N del tramo): puntos y la cuenta del tramo. */
  private goldGot(p: Piece): void {
    const t = p.tramo, n = (this.golds[t] = (this.golds[t] ?? 0) + 1), of = this.goldsOf(t);
    if (p.k === 'step') p.got = 1; // (la de encima de la plataforma: ya no se pinta)
    this.score(500);
    this.snd('combo', null);
    this.ev.push({ t: 'haptic', k: 0.7, ms: 120 });
    this.ev.push({ t: 'gold', p, n, of });
    this.cheer(`¡Fruta dorada! ${n} de ${of}`, '#ffd166', 1.4);
  }

  /** Cuántas doradas tiene el tramo t. */
  goldsOf(t: number): number {
    let n = 0;
    for (const q of this.pieces) if (q.tramo === t && q.gold) n++;
    return n;
  }

  /** El suelo que sube o baja bajo los pies (suave). */
  private stepLev(dt: number): void {
    const L = this.levTo;
    if (L) {
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      this.lev = L.from + (L.to - L.from) * smooth(k);
      if (k >= 1) this.levTo = null;
    }
    if (this.lev) this.dip -= this.lev;
  }

  /** Has despegado (en marcha): si llegas al borde de un hueco, lo saltas; si no, un salto sin más (el tronco se juzga solo,
   * con lo que sube la cabeza); al borde de una plataforma, subes a ella. Todos se notan: el mundo baja y sube bajo los
   * pies. `hz`, la cabeza hacia ti (m). */
  private takeoff(hz: number): void {
    const v = this.tk.v, win = Math.max(GAP_EARLY_MIN, GAP_EARLY_S * v), stepWin = Math.max(STEP_EARLY_MIN, STEP_EARLY_S * v), bobWin = Math.max(BOB_EARLY_MIN, BOB_EARLY_S * v);
    let between = false; // (otro reto por delante de la plataforma: el salto no te lleva por encima de él)
    for (const p of this.live) {
      if (p.judged) continue;
      const z = p.at - this.tk.dist + hz;
      if (p.k !== 'gap' && p.k !== 'step' && p.k !== 'bob') {
        if (p.k !== 'fruit' && p.k !== 'chest' && z > -0.2) between = true;
        continue;
      }
      if (z > (p.k === 'step' ? stepWin : p.k === 'bob' ? bobWin : win)) break; // (el primero que queda por delante, y aún lejos: es pronto)
      if (z > -0.2) {
        if (p.k === 'gap') this.go(p, true);
        else if (p.k === 'bob') {
          // el islote: si está a ras al despegar, el salto vale; si no, chocas con él (alto) o no llegas (bajo)
          const y = bobY(p, this.time), ok = Math.abs(y) <= BOB_OK;
          this.ev.push({ t: 'settle', p, y });
          this.go(p, ok, y > 0 ? '¡Has chocado con el islote! Salta cuando esté a ras' : '¡El islote estaba abajo! Salta cuando esté a ras');
        }
        else {
          // la alta pide sentadilla honda antes del salto (la del burpee, un salto); antes del borde, solo el bueno y sin
          // nada en medio: si no, es un salto sin más y la plataforma se juzga al llegar a ella
          const won = p.burpee || this.moves.deepT < DEEP_WIN;
          if (z > win && (!won || between)) break;
          if (!won && this.prone) break; // (en plancha, la primera explosiva de las dos es un salto sin más: aún llega la segunda)
          this.climb(p, won);
          if (won && z > 0.3) this.leap(p, hz);
        }
        return;
      }
    }
    this.airT = 0;
    this.airDur = AIR_T;
    this.airLift = JUMP_LIFT;
  }

  /** El supersalto antes del borde: el mundo te lleva en el aire hasta encima de la plataforma (a tu velocidad o algo más
   * deprisa si no llegas en SUPER_AIR_T), mientras el suelo sube su altura; al aterrizar, ya estás arriba. */
  private leap(p: Piece, hz: number): void {
    const tk = this.tk, v0 = tk.v, s0 = tk.dist, land = p.at + hz + STEP_LAND, need = Math.max(0, land - s0);
    const dur = Math.max(HOP_MIN, Math.min(SUPER_AIR_T, need / Math.max(v0, 1e-3)));
    const s1 = Math.max(land, s0 + v0 * dur);
    this.hop = { p, s0, s1, t: 0, dur, won: true, v1: v0, lift: JUMP_LIFT, score: 0, cheer: '', done: true };
    this.airT = -1; // (el arco del salto lo lleva el cruce)
    this.levTo = { from: this.lev, to: p.h, t: 0, dur: Math.min(SUPER_LEV_T, dur * 0.85) };
    this.ev.push({ t: 'go', p, dur });
    this.snd('whoosh', this.pos(p, 0, p.h), 'arc');
  }

  /** Empieza el cruce del hueco: con el salto (`won`), a tu velocidad (o algo más, si no llegas al otro lado en HOP_MAX) y
   * hasta pasado su borde lejano; sin salto, un tropiezo: más despacio, frenas y se rompe la racha (nunca se cae). */
  private go(p: Piece, won: boolean, why = '¡Salta el hueco!'): void {
    const tk = this.tk, v0 = tk.v, s0 = tk.dist;
    const land = p.at + p.len + LAND_PAST, need = Math.max(0, land - s0);
    let dur: number, s1: number, v1: number;
    if (won) {
      dur = Math.max(HOP_MIN, Math.min(HOP_MAX, need / Math.max(v0, 1e-3)));
      s1 = Math.max(land, s0 + v0 * dur); // (con tu velocidad: si vas deprisa, aterrizas más lejos)
      v1 = v0;
    } else {
      v1 = v0 * HIT_KEEP;
      dur = Math.max(TRIP_MIN, need / Math.max(TRIP_V, v1));
      s1 = land;
    }
    this.hop = { p, s0, s1, t: 0, dur, won, v1, lift: won ? JUMP_LIFT : 0, score: 200, cheer: p.k === 'bob' ? '¡Al islote!' : '¡Hueco saltado!' };
    this.airT = -1;
    this.stop = null;
    this.ev.push({ t: 'go', p, dur });
    if (won) {
      this.snd('whoosh', this.pos(p, 0, 0.3), 'arc');
      this.ev.push({ t: 'haptic', k: 0.5, ms: 60 });
      return;
    }
    p.judged = true;
    p.ok = false;
    this.hit(p, this.pos(p, 0, 0));
    this.say(why, COL_WARN, 1.6, true);
  }

  /** El trampolín te lanza: lejos (su largo) y alto (el mundo baja SPRING_LIFT), comiéndote las frutas del arco del vuelo. */
  private springLaunch(p: Piece): void {
    const tk = this.tk, s0 = tk.dist, s1 = Math.max(p.at + p.len, s0 + 1), v0 = tk.v;
    const dur = Math.min(2.8, Math.max(1.6, (s1 - s0) / Math.max(v0, SPRING_V)));
    this.hop = { p, s0, s1, t: 0, dur, won: true, v1: v0, lift: SPRING_LIFT, score: 250, cheer: '¡Trampolín!' };
    this.airT = -1;
    this.ev.push({ t: 'go', p, dur });
    this.snd('step', null, true);
    this.ev.push({ t: 'haptic', k: 0.8, ms: 120 });
  }

  /** Empieza el cruce del barranco: planeando (`won`), a tu velocidad o como poco GLIDE_V, subiendo deprisa y bajando
   * despacio (el mundo baja `GLIDE_LIFT`); sin los brazos en cruz, a trompicones (frenas y se rompe la racha). */
  private glideStart(p: Piece, won: boolean): void {
    const tk = this.tk, s0 = tk.dist, land = p.at + p.len + LAND_PAST, need = Math.max(0, land - s0), v0 = tk.v;
    const v = Math.max(GLIDE_V, v0), dur = need / v;
    this.hop = { p, s0, s1: land, t: 0, dur, won, v1: won ? Math.max(v0, GLIDE_V * 0.8) : v0 * HIT_KEEP, lift: won ? GLIDE_LIFT : 0, score: 300, cheer: '¡Has planeado sobre el barranco!', glide: true, dropT: 0, bad: false };
    this.airT = -1;
    this.ev.push({ t: 'go', p, dur });
    if (won) {
      this.snd('whoosh', this.pos(p, 0, 0.5), 'arc');
      this.ev.push({ t: 'haptic', k: 0.5, ms: 90 });
      this.cheer('¡Planeando!', COL_OK, 1.0);
      return;
    }
    p.judged = true;
    p.ok = false;
    this.hit(p, this.pos(p, 0, 0));
    this.say('¡Abre los brazos en cruz para planear!', COL_WARN, 1.8, true);
  }

  /** El cruce (del hueco o de un paso de suelo): el mundo te lleva al otro lado a velocidad fija (tu inercia) y, si es un
   * salto, baja y sube como si te elevara. */
  private stepHop(dt: number): void {
    const H = this.hop;
    this.dip = 0;
    if (!H) return;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    this.tk.dist = H.s0 + (H.s1 - H.s0) * k;
    this.dip = H.lift ? -H.lift * (H.glide ? glideArc(k) : arc(k)) : 0;
    if (H.glide && H.won) this.glideStep(H, dt);
    if (H.boss && k >= 0.5) this.bossHurt(H);
    // las frutas en arco sobre el hueco: saltando, te las vas comiendo según las pasas (siguen la curva del salto)
    const p0 = H.p;
    if (H.won && (p0.k === 'gap' || p0.k === 'spring') && p0.n > 0) {
      const head = this.tk.dist - this.env.head.z;
      while (p0.got < p0.n && head >= p0.at + ((p0.got + 0.5) / p0.n) * p0.len) {
        this.ev.push({ t: 'pick', p: p0, i: p0.got });
        p0.got++;
        this.fruits++;
        this.score(50);
        this.snd('perfect', null);
        this.addEnergy(FRUIT_E / 2);
      }
    }
    if (k < 1) return;
    this.hop = null;
    this.dip = 0;
    this.tk.v = H.v1; // (sigues con la velocidad que traías; tras un tropiezo, con la mitad)
    this.tk.idle = 0;
    const p = H.p;
    if (!H.won || H.done) return;
    if (H.bad) {
      // bajaste los brazos en pleno vuelo: aterrizas, pero frenando y sin racha
      p.judged = true;
      p.ok = false;
      this.tk.v *= HIT_KEEP;
      this.hit(p, this.pos(p, p.len, 0));
      return;
    }
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.ev.push({ t: 'pass', p });
    this.score(H.score);
    this.ev.push({ t: 'fx', name: 'dust', at: this.pos(p, H.s1 - p.at, 0), n: 8, col: 0xd8c8a8 });
    this.snd('step', null, true);
    this.cheer(H.cheer, COL_OK, 1.2);
  }

  /** Planeando: los brazos (bajados más de GLIDE_DROP s, pierdes el vuelo: aterrizas frenando) y las frutas del aire, que
   * se cogen con la cabeza ladeada hacia ellas al pasar. */
  private glideStep(H: Hop, dt: number): void {
    const p = H.p;
    H.dropT = this.armsOpen ? 0 : (H.dropT ?? 0) + dt;
    if (!H.bad && (H.dropT ?? 0) > GLIDE_DROP) {
      H.bad = true;
      this.say('¡Abre los brazos!', COL_WARN, 1.4, true);
    }
    const head = this.tk.dist - this.env.head.z;
    while (p.got < p.n && head >= p.at + ((p.got + 0.5) / p.n) * p.len) {
      const i = p.got++;
      if (H.bad || Math.abs(this.moves.dx - glideU(p, i)) > GLIDE_CATCH) continue;
      p.mask |= 1 << i;
      this.ev.push({ t: 'pick', p, i });
      this.fruits++;
      this.score(80);
      this.snd('perfect', null);
      this.addEnergy(FRUIT_E / 2);
    }
  }

  /** Un salto sin hueco: el mundo baja y sube bajo los pies (AIR_T s), sin cambiar lo que avanzas. */
  private stepAir(dt: number): void {
    if (this.airT < 0 || this.hop) return;
    this.airT += dt;
    const k = this.airT / this.airDur;
    if (k >= 1) {
      this.airT = -1;
      return;
    }
    this.dip = -this.airLift * arc(k);
  }

  /** Lo que pide cada pieza (al avisar de ella, al pararte o si tardas). */
  private ask(p: Piece, first: boolean): void {
    // (no se avisa de lo que viene: se entrenan los reflejos —decidido por el usuario—; solo la pelea con el jefe)
    if (!ASK_AHEAD && p.k !== 'boss') return;
    if (p.k === 'gap') this.say('¡Un hueco! Salta al llegar al borde', COL_ASK, 1.6, false);
    else if (p.k === 'step') this.say(p.burpee ? '¡Arriba y salta a la plataforma!' : '¡Plataforma alta! Sentadilla honda y salta', COL_ASK, 1.8, false);
    else if (p.k === 'crawl') this.say('¡Túnel! Al suelo, en plancha', COL_ASK, 2.6, false);
    else if (p.k === 'spring') this.say('¡Un trampolín! Písalo con una sentadilla honda', COL_ASK, 1.8, false);
    else if (p.k === 'fork') this.say('¡El camino se divide! Paso a la derecha: más difícil y más premios', COL_ASK, 2.4, false);
    else if (p.k === 'glide') this.say('¡Un barranco! Abre los brazos en cruz para planear', COL_ASK, 2.4, false);
    else if (p.k === 'boss') {
      if (this.fight?.phase === 'dizzy') this.say('¡Está mareado! Sentadilla honda y salta encima', COL_ASK, 1.6, false);
    } else if (p.k === 'box') this.say('¡Un barril sorpresa! Salta debajo y dale con la cabeza', COL_ASK, 1.6, false);
    else if (p.k === 'fruit' && p.gold) this.say('¡Una fruta dorada! Salta para cogerla', COL_ASK, 1.6, false);
    else if (p.k === 'fruit') this.say(`¡${p.special ? 'Fruta especial' : 'Fruta'} a la ${p.side < 0 ? 'izquierda' : 'derecha'}!`, COL_ASK, 1.2, false);
    else if (p.k === 'log') this.say('¡Salta!', COL_ASK, 1.2, false);
    else if (p.k === 'low') this.say('¡Agáchate!', COL_ASK, 1.2, false);
    else if (p.k === 'side' && p.n) this.say(`¡Un esqueleto pirata a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}`, COL_ASK, 1.6, false);
    else if (p.k === 'side') this.say(`¡Un cangrejo a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}`, COL_ASK, 1.6, false);
    else if (p.k === 'foe') this.say('¡Una seta! Sáltale encima cuando llegue', COL_ASK, 1.6, false);
    else if (p.k === 'dive') this.say(isPirate(p) ? '¡Un tiburón pirata! Agáchate cuando tire el tajo' : `¡${p.n % 2 ? 'Un murciélago' : 'Una abeja'} en picado! Agáchate`, COL_ASK, 1.6, false);
    else if (p.k === 'cannon') this.say(`¡Cañonazo desde el barco, a la ${p.side < 0 ? 'izquierda' : 'derecha'}!`, COL_ASK, 1.6, false);
    else if (p.k === 'skull') this.say('¡Una calavera botando! Sáltala', COL_ASK, 1.6, false);
    else if (p.k === 'quake') this.say(`¡Un cíclope a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Va a golpear el suelo: salta su onda`, COL_ASK, 2, false);
    else if (p.k === 'fire') this.say(`¡Un demonio a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Esquiva su bola de fuego con un paso`, COL_ASK, 2, false);
    else if (p.k === 'ledge') this.say('¡Cornisa! Pégate a la pared, a la izquierda', COL_ASK, 2, false);
    else if (p.k === 'bob') this.say('¡Islote que sube y baja! Salta cuando esté a ras', COL_ASK, 2, false);
    else if (p.k === 'sink') this.say('¡Islote que se hunde! Crúzalo sin pararte', COL_ASK, 2, false);
    else if (p.k === 'gust') this.say(`¡Viento! Inclínate a la ${p.side < 0 ? 'izquierda' : 'derecha'} y aguanta`, COL_ASK, 2, false);
    else if (p.k === 'rockfall') this.say(`¡Desprendimiento a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}`, COL_ASK, 2, false);
  }

  /* ---------- el jefe del mundo ---------- */

  /** Te paras ante el jefe: la pelea empieza (o sigue, tras tu supersalto: él ha saltado hacia atrás y tú has aterrizado). */
  private bossHalt(p: Piece): void {
    const F = this.fight;
    if (F && F.p === p) {
      F.phase = 'throw';
      F.t = -0.9;
      F.shots = 0;
      F.shot = null;
      return;
    }
    this.fight = { p, phase: 'throw', t: -2.2, shots: 0, shot: null, last: null, aim: { x: 0, y: 0 }, air: false, misses: 0, hit: false };
    this.ev.push({ t: 'boss', p, act: 'start' });
    const B = BOSSES[p.n % BOSSES.length];
    this.say(`¡${B.name[0].toUpperCase()}${B.name.slice(1)} te corta el paso! Esquiva lo que te lanza`, COL_ASK, 2.2, false);
  }

  /** La pelea, cada fotograma (en pleno juego y sin tu supersalto en el aire): lanza BOSS_THROWS (alta, baja o al cuerpo, con
   * su aviso), se marea BOSS_DIZZY s (un supersalto le cae encima; sin él, se recupera y vuelve a lanzar). */
  private bossStep(dt: number): void {
    const F = this.fight;
    if (!F || F.phase === 'hop' || this.hop) return;
    const M = this.moves, H = this.env.head;
    F.t += dt;
    if (F.phase === 'dizzy') {
      if (M.takeoff) {
        // (tras dos mareos sin supersalto, vale un salto sin más: que la pelea siempre se pueda acabar)
        if (M.deepT < DEEP_WIN || F.misses >= 2) this.bossHop(F);
        else this.say('¡Más hondo! Sentadilla honda y salta', COL_WARN, 1.4, true);
        return;
      }
      if (F.t < BOSS_DIZZY) return;
      F.misses++;
      F.phase = 'throw';
      F.t = -1;
      F.shots = 0;
      this.ev.push({ t: 'boss', p: F.p, act: 'wake' });
      this.say(F.misses >= 2 ? 'Se ha recuperado. Cuando se maree, ¡salta encima!' : 'Se ha recuperado. Cuando se maree: sentadilla honda y salta', COL_ASK, 1.8, false);
      return;
    }
    // lanzando
    if (!F.shot) {
      if (F.t < 0) return;
      if (F.shots >= BOSS_THROWS) {
        F.phase = 'dizzy';
        F.t = 0;
        this.ev.push({ t: 'boss', p: F.p, act: 'dizzy' });
        this.say(F.misses >= 2 ? '¡Está mareado! ¡Salta encima!' : '¡Está mareado! Sentadilla honda y salta encima', COL_ASK, 2, false);
        return;
      }
      // (nunca tres iguales seguidos: la que toca, al azar entre las otras si repite)
      const all: BossShot[] = ['high', 'low', 'body'];
      let s = all[Math.floor(this.env.rnd() * 3) % 3];
      if (s === F.last && this.env.rnd() < 0.6) s = all[(all.indexOf(s) + 1 + Math.floor(this.env.rnd() * 2)) % 3];
      F.shot = F.last = s;
      F.t = 0;
      F.air = false;
      F.aim.x = H.x;
      F.aim.y = H.y;
      // (en plancha, la del cuerpo va a la cabeza, que es lo que se aparta escorándose)
      this.ev.push({ t: 'bthrow', p: F.p, shot: s, wind: this.bossWind, dur: BOSS_FLY, aim: { x: H.x, y: s === 'low' ? 0.25 : s === 'high' ? this.env.calibRef + 0.05 : this.prone ? H.y : H.y - 0.35, z: H.z } });
      this.say(s === 'high' ? '¡Alta! Agáchate' : s === 'low' ? '¡Baja! Salta' : '¡Al cuerpo! Apártate', COL_ASK, 1.1, false);
      return;
    }
    // la baja: vale si te ves en el aire mientras llega (desde un poco antes de soltarla)
    if (F.shot === 'low' && F.t > this.bossWind - 0.25 && M.air) F.air = true;
    if (F.t < this.bossWind + BOSS_FLY) return;
    const s = F.shot, ok = s === 'high' ? M.down >= BOSS_DUCK : s === 'low' ? F.air : Math.abs(H.x - F.aim.x) >= BOSS_AWAY;
    F.shot = null;
    F.shots++;
    F.t = -BOSS_GAP;
    this.ev.push({ t: 'bdodge', p: F.p, ok });
    if (ok) {
      this.passed++;
      this.score(150);
      this.snd('whoosh', null, 'arc');
      this.cheer('¡Esquivada!', COL_OK, 0.8);
      return;
    }
    // te da: se rompe la racha (parado ante él, sin más; nunca vidas)
    this.hits++;
    this.ev.push({ t: 'combo0' });
    this.tk.turboSet(false);
    this.snd('metalHit', null, false);
    this.ev.push({ t: 'haptic', k: 0.8, ms: 140 });
    this.say(s === 'high' ? '¡Te ha dado! La alta: agáchate' : s === 'low' ? '¡Te ha dado! La baja: salta' : '¡Te ha dado! Al cuerpo: apártate a un lado', COL_WARN, 1.6, true);
  }

  /** Tu supersalto encima del jefe: el mundo te lleva por encima de él (BOSS_STEP m, subiendo BOSS_LIFT) y, en lo más alto, le
   * cae encima (`bossHurt`). */
  private bossHop(F: BossFight): void {
    F.phase = 'hop';
    F.hit = false;
    const s0 = this.tk.dist;
    this.stop = null;
    this.hop = { p: F.p, s0, s1: s0 + BOSS_STEP, t: 0, dur: BOSS_HOP_T, won: true, v1: 0, lift: BOSS_LIFT, score: 0, cheer: '', done: true, boss: true };
    this.airT = -1;
    this.ev.push({ t: 'go', p: F.p, dur: BOSS_HOP_T });
    this.snd('whoosh', this.pos(F.p, BOSS_Z, 1), 'arc');
    this.ev.push({ t: 'haptic', k: 0.5, ms: 60 });
  }

  /** Le caes encima: un golpe (con BOSS_HP, derrotado) y salta hacia atrás, para quedar otra vez delante de donde aterrizas. */
  private bossHurt(H: Hop): void {
    const F = this.fight;
    if (!F || F.hit) return;
    F.hit = true;
    const p = F.p, from = p.at + BOSS_Z;
    p.got++;
    p.at += BOSS_STEP;
    p.len = Math.max(0, p.len - BOSS_STEP);
    const to = p.at + BOSS_Z, dead = p.got >= BOSS_HP;
    this.ev.push({ t: 'boss', p, act: dead ? 'die' : 'hurt', from, to });
    this.ev.push({ t: 'haptic', k: 1, ms: 160 });
    this.snd('squish', null);
    this.score(300);
    if (!dead) {
      this.cheer(`¡Toma! ${p.got} de ${BOSS_HP}`, COL_OK, 1.2);
      return;
    }
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.bosses++;
    this.fight = null;
    H.done = true;
    this.score(BOSS_PTS);
    this.snd('victory', null);
    const B = BOSSES[p.n % BOSSES.length];
    this.ev.push({ t: 'trophy', title: '¡JEFE DERROTADO!', sub: `${B.name}: +${BOSS_PTS} puntos` });
  }

  /* ---------- lo de la marcha ---------- */

  /** Los sucesos del impulso (avisos, celebraciones, sonidos, vibración y el turbo), pasados a los de aquí. */
  private pull(): void {
    const E = this.tk.ev;
    for (const e of E) this.fromTrek(e);
    E.length = 0;
  }
  private fromTrek(e: TrekEv): void {
    if (e.t === 'say') this.say(e.text, e.col, e.dur, false);
    else if (e.t === 'cheer') this.cheer(e.text, e.col, e.dur);
    else if (e.t === 'haptic') this.ev.push({ t: 'haptic', k: e.k, ms: e.ms });
    else if (e.t === 'turbo') this.ev.push({ t: 'turbo', on: e.on });
    else if (e.t === 'score') this.score(e.n);
    else if (e.t === 'snd' && (e.name === 'perfect' || e.name === 'combo')) this.snd(e.name, null);
  }

  /** La velocidad de la marcha ahora (m/s) y la más alta posible con los ajustes. */
  get v(): number {
    return this.tk.v;
  }
  get vmax(): number {
    return TREK_VMAX * trekK(this.tk.env) * TREK_TURBO_V;
  }

  /* ---------- el fantasma y la medalla ---------- */

  /** Lo que llevas de más (m, positivo) o de menos que en tu mejor ronda a estas alturas; null sin fantasma. */
  ghostDiff(): number | null {
    const B = this.best;
    if (!B || !B.tl.length) return null;
    const i = Math.min(B.tl.length - 1, this.tl.length - 1);
    return i < 0 ? 0 : this.tk.dist - (B.tl[i] || 0);
  }

  /** Al acabar la ronda (`score`, tus puntos): la medalla, los metros y, si llegaste más lejos que nunca, el fantasma nuevo. */
  end(score: number): PlatEnd {
    const ok = this.passed - this.fruits, n = ok + this.hits, k = n ? ok / n : 0, dist = Math.round(this.tk.dist);
    const medal: [string, string] | null = !n ? null : k >= 0.95 ? ['oro', '#ffd166'] : k >= 0.8 ? ['plata', '#d8dce6'] : k >= 0.6 ? ['bronce', '#e0975a'] : null;
    const prev = this.best, farther = !prev || dist > (prev.dist || 0);
    const ghost = farther && dist > 0 ? { dist, score, tl: this.tl.concat(dist).slice(0, 900) } : null;
    return { medal, dist, farther: farther && !!prev && dist > 0, fruits: this.fruits, ghost };
  }

  /* ---------- sucesos ---------- */

  private pos(p: Piece, ds: number, y: number): PlatPos {
    return { s: p.at + ds, u: p.side * (p.k === 'side' ? CRAB_U : p.k === 'quake' || p.k === 'fire' ? ASIDE_U : 0.45) + p.lane * FORK_U, y };
  }
  private say(text: string, col: string, dur: number, warn: boolean): void {
    // (dicho para la forma en que juegas: en plancha, nada de sentadillas ni brazos en cruz; texts.ts)
    this.ev.push({ t: 'say', text: formText(text, this.prone ? 'prone' : this.lunge ? 'lunge' : 'stand'), col, dur, warn });
  }
  private cheer(text: string, col: string, dur: number): void {
    this.ev.push({ t: 'cheer', text, col, dur });
  }
  private snd(name: PlatSnd, at: PlatPos | null, arg?: string | boolean): void {
    this.ev.push(arg === undefined ? { t: 'snd', name, at } : { t: 'snd', name, at, arg });
  }
  private score(n: number): void {
    this.ev.push({ t: 'score', n });
  }
}
