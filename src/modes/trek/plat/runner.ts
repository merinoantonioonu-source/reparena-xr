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
import { BodyMoves, moveCfg, type MoveCfg } from './moves.js';
import { COL_ASK, COL_OK, COL_WARN, CRAB_U, FLUID, FOE_V, FOE_WAKE, platTune, FRUIT_WIN, GHOST_DT, HALT, HALT_BRAKE, LAND_PAST, PLAT_GEMS, PLAT_GHOST, PLAT_SEE, STOP_AT, type Course, type Piece, type PlatEnv, type PlatEv, type PlatPos, type PlatSnd } from './types.js';

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
/** El túnel: la velocidad que llevas como poco cerca y dentro de él, echado (m/s), y desde dónde (m antes). */
export const CRAWL_V = 1.2, CRAWL_NEAR = 15;
/** Las frutas: la energía de cada una (la especial, toda), lo que dura la supervelocidad (s) y cuánto más que la máxima. */
export const FRUIT_E = 0.25, SUPER_T = 5, SUPER_K = 1.3;
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
  readonly cfg: MoveCfg = { jumpH: 0.06, sideNeed: 0.3, plankY: 0.7, pushNeed: 0.1, deepNeed: 0.2 };
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
  /** Los tramos montados: dónde acaba cada uno (su cofre). */
  ends: number[] = [];
  /** Superadas y chocadas en la ronda, y las frutas cogidas (cuentan en `passed`). */
  passed = 0;
  hits = 0;
  fruits = 0;
  /** Las llaves de los cofres (con TREASURE_KEYS, el tesoro). */
  keys = 0;
  /** El fantasma: tu mejor ronda guardada (o null) y dónde vas cada GHOST_DT s en esta. */
  best: PlatGhost | null = null;
  tl: number[] = [];
  private tlT = 0;
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
    this.passed = this.hits = this.fruits = this.keys = 0;
    this.id = 1;
    const B = this.env.store(PLAT_GHOST) as PlatGhost | null;
    this.best = B && Array.isArray(B.tl) ? B : null;
    this.tl = [];
    this.tlT = 0;
    this.moves.reset(this.env.calibRef, this.env.head.x);
  }

  /** Tu altura de pie y el centro, al calibrar. */
  calibrate(ref: number, x0: number): void {
    this.moves.reset(ref, x0);
  }

  /** Monta el tramo i detrás de lo que ya hay (si no está): `len`, lo que mide hasta su cofre. */
  addTramo(i: number, len: number): void {
    if (this.ends.length > i) return;
    while (this.ends.length < i) this.addTramo(this.ends.length, len); // (los de antes, por orden)
    const start = this.ends.length ? this.ends[this.ends.length - 1] + 0.5 : this.tk.dist;
    this.addCourse(buildCourse({ vmax: platVmax(this.env), len, rnd: () => this.env.rnd(), tune: platTune((k) => this.env.s(k)) }, i, this.env.rank, start, this.id));
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
    if (this.env.state !== 'play' || this.moves.plank) return false; // (echado, no empujas: llevas la inercia)
    if (this.stop || this.hop) {
      if (this.stop) this.ask(this.stop, false);
      return false;
    }
    this.tk.rep(perfect);
    this.pull();
    return true;
  }

  /* ---------- cada fotograma ---------- */

  step(dt: number): void {
    const env = this.env, tk = this.tk, st = env.state, H = env.head;
    moveCfg(this.sFn, this.cfg);
    const fv = env.s('platFoeV');
    this.foeV = fv > 0 ? fv : FOE_V;
    this.cfg.deepNeed = Math.max(0.12, (0.8 * (env.dv('squatDepth') || 26)) / 100);
    this.moves.hold = this.sideAhead();
    this.moves.update(dt, H, this.cfg);
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
    } else if (st === 'play' && this.moves.plank) {
      // echado (el túnel): la inercia, sin gastarse; cerca y dentro de un túnel, como poco CRAWL_V (pasas por debajo)
      tk.v = Math.max(v0, this.crawlNear() ? CRAWL_V : 0);
      tk.push = push0;
      tk.dist = d0 + tk.v * dt;
    } else if (st === 'play' && tk.push > 0 && tk.v < tk.want) tk.v = Math.min(tk.want, tk.v + dt * PLAT_ACCEL); // (acelera antes)
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
      this.walk(dt);
      if (this.moves.takeoff && !this.hop && !this.stop) this.takeoff(H.z);
      for (const p of this.live) if (!p.judged && FLUID.includes(p.k) && p !== this.hop?.p) this.judge(p, p.at + p.walk - tk.dist + H.z);
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
        this.say(`Al final del tramo, un cofre: dentro, una llave (${this.keys + 1} de ${TREASURE_KEYS}: con ${TREASURE_KEYS}, el tesoro) y una gema`, COL_ASK, 3, false);
      }
      if ((p.k !== 'foe' && p.k !== 'side') || p.judged) continue;
      if (!p.woke && p.at + p.walk - d < FOE_WAKE) {
        p.woke = true;
        this.ev.push({ t: 'wake', p });
      }
      if (p.woke && p.walk > 0) p.walk = Math.max(0, p.walk - this.foeV * dt);
    }
  }

  /** ¿Se acerca un obstáculo a un lado (o está pasando)? Entonces el centro no sigue a la cabeza. */
  private sideAhead(): boolean {
    const look = Math.max(SIDE_WARN_AT, SIDE_HOLD_S * Math.max(this.tk.v, 0.5));
    for (const p of this.live) if ((p.k === 'side' || p.k === 'fruit') && !p.judged && p.at - this.tk.dist < look) return true;
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
    const far = p.k === 'side' || p.k === 'gap' || p.k === 'step' || p.k === 'fruit' || p.k === 'foe';
    // (el túnel, con más tiempo: hay que echarse al suelo)
    const warnAt = p.k === 'crawl' ? Math.max(10, 3.5 * v) : Math.max(far ? SIDE_WARN_AT : WARN_AT, v * (far ? SIDE_WARN_S : WARN_S));
    if (!p.warned && z < warnAt) {
      p.warned = true;
      this.ask(p, true);
    }
    if (p.k === 'gap') {
      if (z <= 0 && !this.hop) this.go(p, false); // (llegas al borde sin haber saltado: tropiezas al cruzarlo)
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
        this.say('¡De pie!', COL_ASK, 1.2, false);
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
    const at = this.pos(p, 0, p.k === 'low' ? this.env.calibRef + HEAD_TOP - p.h : 0.3);
    if (ok) {
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(p.k === 'log' ? 150 : p.k === 'side' ? CRAB_PTS : 120);
      this.snd('whoosh', at, 'arc');
      this.cheer(p.k === 'log' ? '¡Saltado!' : p.k === 'low' ? '¡Esquivada!' : '¡Cangrejo esquivado!', COL_OK, 0.9);
      return;
    }
    this.tk.v *= HIT_KEEP;
    this.hit(p, at);
    const away = p.side < 0 ? 'derecha' : 'izquierda';
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
    if (p.k === 'chest') {
      this.chest = p;
      this.ev.push({ t: 'chest', p });
      this.snd('victory', null);
      this.openChest();
      return;
    }
  }

  /** Se abre el cofre (como en la Travesía clásica): una llave (con tres, el tesoro del tramo) y una gema para tu colección,
   * con su aviso grande de lo que has conseguido y lo que falta para el premio siguiente. */
  private openChest(): void {
    this.keys++;
    this.score(CHEST_PTS);
    const gems = ((this.env.store(PLAT_GEMS) as number) || 0) + 1;
    this.ev.push({ t: 'store', key: PLAT_GEMS, val: gems });
    this.cheer(`¡Cofre abierto! Llave ${this.keys}/${TREASURE_KEYS} · gema ${gems}`, '#ffd166', 2.2);
    if (this.keys >= TREASURE_KEYS) {
      this.keys = 0;
      this.score(TREASURE_PTS);
      this.ev.push({ t: 'trophy', title: '¡TESORO DEL TRAMO!', sub: `Tres llaves: +${TREASURE_PTS} puntos (y +${CHEST_PTS} del cofre). Gema nº ${gems} para tu colección` });
    } else this.ev.push({ t: 'trophy', title: '¡COFRE ABIERTO!', sub: `+${CHEST_PTS} puntos y la llave ${this.keys} de ${TREASURE_KEYS}: ${TREASURE_KEYS - this.keys === 1 ? 'una más' : 'dos más'} y abres el tesoro del tramo (+${TREASURE_PTS}). Gema nº ${gems}` });
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
    this.energy = p.special ? 1 : Math.min(1, this.energy + FRUIT_E);
    if (this.energy >= 1) {
      this.energy = 0;
      this.superT = SUPER_T;
      this.cheer('¡SUPERVELOCIDAD!', '#c8ff3a', 1.8);
      this.snd('combo', null);
      this.ev.push({ t: 'haptic', k: 0.8, ms: 200 });
    } else this.cheer(p.special ? '¡Fruta especial!' : '¡Fruta!', COL_OK, 0.8);
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
    const v = this.tk.v, win = Math.max(GAP_EARLY_MIN, GAP_EARLY_S * v);
    for (const p of this.live) {
      if ((p.k !== 'gap' && p.k !== 'step') || p.judged) continue;
      const z = p.at - this.tk.dist + hz;
      if (z > win) break; // (el primero que queda por delante, y aún lejos: es pronto)
      if (z > -0.2) {
        if (p.k === 'gap') this.go(p, true);
        else this.climb(p, p.burpee || this.moves.deepT < DEEP_WIN); // (la alta pide sentadilla honda antes del salto)
        return;
      }
    }
    this.airT = 0;
    this.airDur = AIR_T;
    this.airLift = JUMP_LIFT;
  }

  /** Empieza el cruce del hueco: con el salto (`won`), a tu velocidad (o algo más, si no llegas al otro lado en HOP_MAX) y
   * hasta pasado su borde lejano; sin salto, un tropiezo: más despacio, frenas y se rompe la racha (nunca se cae). */
  private go(p: Piece, won: boolean): void {
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
    this.hop = { p, s0, s1, t: 0, dur, won, v1, lift: won ? JUMP_LIFT : 0, score: 200, cheer: '¡Hueco saltado!' };
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
    this.say('¡Salta el hueco!', COL_WARN, 1.6, true);
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
    this.dip = H.lift ? -H.lift * arc(k) : 0;
    if (k < 1) return;
    this.hop = null;
    this.dip = 0;
    this.tk.v = H.v1; // (sigues con la velocidad que traías; tras un tropiezo, con la mitad)
    this.tk.idle = 0;
    const p = H.p;
    if (!H.won) return;
    p.judged = true;
    p.ok = true;
    this.passed++;
    this.ev.push({ t: 'pass', p });
    this.score(H.score);
    this.ev.push({ t: 'fx', name: 'dust', at: this.pos(p, H.s1 - p.at, 0), n: 8, col: 0xd8c8a8 });
    this.snd('step', null, true);
    this.cheer(H.cheer, COL_OK, 1.2);
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
    if (p.k === 'gap') this.say('¡Un hueco! Salta al llegar al borde', COL_ASK, 1.6, false);
    else if (p.k === 'step') this.say(p.burpee ? '¡Arriba y salta a la plataforma!' : '¡Plataforma alta! Sentadilla honda y salta', COL_ASK, 1.8, false);
    else if (p.k === 'crawl') this.say('¡Túnel! Al suelo, en plancha', COL_ASK, 2.6, false);
    else if (p.k === 'fruit') this.say(`¡${p.special ? 'Fruta especial' : 'Fruta'} a la ${p.side < 0 ? 'izquierda' : 'derecha'}!`, COL_ASK, 1.2, false);
    else if (p.k === 'log') this.say('¡Salta!', COL_ASK, 1.2, false);
    else if (p.k === 'low') this.say('¡Agáchate!', COL_ASK, 1.2, false);
    else if (p.k === 'side') this.say(`¡Un cangrejo a la ${p.side < 0 ? 'izquierda' : 'derecha'}! Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}`, COL_ASK, 1.6, false);
    else if (p.k === 'foe') this.say('¡Una seta! Sáltale encima cuando llegue', COL_ASK, 1.6, false);
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
    return { s: p.at + ds, u: p.side * (p.k === 'side' ? CRAB_U : 0.45), y };
  }
  private say(text: string, col: string, dur: number, warn: boolean): void {
    this.ev.push({ t: 'say', text, col, dur, warn });
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
