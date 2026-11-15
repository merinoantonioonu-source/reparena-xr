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
 * - **La plataforma** se sube de un salto en marcha al llegar a su borde (el mundo baja `h` y te deja arriba); si no
 *   saltas, tropiezas y subes a trompicones. Al acabarla, bajas sola, suave.
 * - **Pasos** (el cofre al final del tramo; el túnel de flexiones y el muro de burpee): no se baja al suelo con el mundo en
 *   marcha (seguridad), así que el mundo frena suave (`HALT_BRAKE`) hasta dejarte a `STOP_AT` (1 m), con un aviso grande.
 *   Túnel: al suelo en plancha y `n` flexiones (cada una sube su techo), y de pie. Muro: al suelo, de pie y un salto por
 *   encima. Al acabar, el mundo te lleva al otro lado y sigues con la velocidad que traías antes de frenar. Si no puedes,
 *   a los `GIVE_UP_T` s lo rodeas (sin puntos).
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
import { COL_ASK, COL_OK, COL_WARN, FLUID, HALT, HALT_BRAKE, LAND_PAST, PLAT_SEE, STOP_AT, type Course, type Piece, type PlatEnv, type PlatEv, type PlatPos } from './types.js';

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
/** Parado ante un paso sin hacer nada: cada cuánto se repite lo que hay que hacer (s) y cuándo lo rodeas (s, sin puntos). */
export const NAG_T = 6, GIVE_UP_T = 60;
/** La plataforma: lo que tarda en subirte a trompicones si no saltas y en bajarte al acabarla (s). */
export const CLIMB_T = 0.45, DROP_T = 0.45;
/** Al salir de un paso de suelo: la velocidad con que sigues como poco (m/s) y lo que hay que estar de pie antes (s). */
export const EXIT_V = 1.5, UP_HOLD = 0.3;
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

/** Un paso de suelo en marcha: qué toca ahora (echarte al suelo, las flexiones, levantarte o saltar) y cuánto llevas. */
interface Floor {
  p: Piece;
  phase: 'down' | 'push' | 'up' | 'jump';
  t: number;
  push0: number;
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
  readonly cfg: MoveCfg = { jumpH: 0.06, sideNeed: 0.3, plankY: 0.7, pushNeed: 0.1 };
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
  /** Un salto sin hueco (el tronco, o saltar porque sí): lo que lleva en el aire (s; −1, en el suelo). */
  airT = -1;
  /** El paso de suelo de ahora (túnel o muro) y lo que toca. */
  floor: Floor | null = null;
  /** Lo alto que está el suelo bajo tus pies (m: sobre una plataforma, su `h`), su cambio en curso y la plataforma. */
  lev = 0;
  private levTo: Lev | null = null;
  onStep: Piece | null = null;
  /** La velocidad que traías al empezar a frenar ante un paso (con ella sigues al acabarlo). */
  private brakeFor: Piece | null = null;
  private brakeV = 0;
  /** Lo que baja el mundo ahora (m, negativo: el salto te eleva). */
  dip = 0;
  /** Los tramos montados: dónde acaba cada uno (su cofre). */
  ends: number[] = [];
  /** Superadas y chocadas en la ronda. */
  passed = 0;
  hits = 0;
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
    this.stopT = this.nagT = this.dip = this.lev = this.brakeV = 0;
    this.airT = -1;
    this.floor = null;
    this.levTo = null;
    this.onStep = this.brakeFor = null;
    this.ends = [];
    this.passed = this.hits = 0;
    this.id = 1;
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
    this.addCourse(buildCourse({ vmax: platVmax(this.env), len, rnd: () => this.env.rnd() }, i, this.env.rank, start, this.id));
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
    if (this.env.state !== 'play') return false;
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
    moveCfg((k) => env.s(k), this.cfg);
    this.moves.hold = this.sideAhead();
    this.moves.update(dt, H, this.cfg);
    const d0 = tk.dist, push0 = tk.push;
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
    } else if (st === 'play' && tk.push > 0 && tk.v < tk.want) tk.v = Math.min(tk.want, tk.v + dt * PLAT_ACCEL); // (acelera antes)
    this.stepHop(dt);
    this.stepAir(dt);
    this.stepLev(dt);
    // ante un paso, frenas suave hasta quedarte a STOP_AT de su borde (nunca lo pasas sin haberlo cruzado)
    const h = this.nextHalt();
    if (h && !this.hop && this.stop !== h) {
      const room = h.at - STOP_AT - tk.dist, vcap = Math.sqrt(2 * HALT_BRAKE * Math.max(0, room));
      if (tk.v > vcap) {
        if (this.brakeFor !== h) {
          this.brakeFor = h;
          this.brakeV = tk.v;
        }
        tk.v = vcap;
      }
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
      this.levTo = { from: this.lev, to: 0, t: 0, dur: DROP_T };
    }
    tk.frame();
    this.reveal();
    if (st === 'play') {
      if (this.moves.takeoff && !this.hop && !this.stop) this.takeoff(H.z);
      for (const p of this.live) if (!p.judged && FLUID.includes(p.k) && p !== this.hop?.p) this.judge(p, p.at - tk.dist + H.z);
      this.stepStop(dt);
    } else this.airT = -1;
    this.drop();
    this.pull();
  }

  /** ¿Se acerca un obstáculo a un lado (o está pasando)? Entonces el centro no sigue a la cabeza. */
  private sideAhead(): boolean {
    const look = Math.max(SIDE_WARN_AT, SIDE_HOLD_S * Math.max(this.tk.v, 0.5));
    for (const p of this.live) if (p.k === 'side' && !p.judged && p.at - this.tk.dist < look) return true;
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
    const far = p.k === 'side' || p.k === 'gap' || p.k === 'step';
    if (!p.warned && z < Math.max(far ? SIDE_WARN_AT : WARN_AT, v * (far ? SIDE_WARN_S : WARN_S))) {
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
    if (p.k === 'side') {
      if (Math.abs(z) < SIDE_WIN && !M.clear(p.side as -1 | 1, C)) p.bad = true;
      if (z < -SIDE_WIN) this.result(p, !p.bad);
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
      this.score(p.k === 'log' ? 150 : 120);
      this.snd('whoosh', at, 'arc');
      this.cheer(p.k === 'log' ? '¡Saltado!' : p.k === 'low' ? '¡Esquivada!' : '¡Esquivado!', COL_OK, 0.9);
      return;
    }
    this.tk.v *= HIT_KEEP;
    this.hit(p, at);
    const away = p.side < 0 ? 'derecha' : 'izquierda';
    this.say(p.k === 'log' ? '¡Salta el tronco!' : p.k === 'low' ? '¡Agáchate bajo la viga!' : `¡Apártate a la ${away}!`, COL_WARN, 1.6, true);
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
      return;
    }
    this.floor = { p, phase: 'down', t: 0, push0: this.moves.pushups };
    this.ask(p, true);
  }

  /** Parado ante un paso de suelo: lo que toca, fase a fase (el cofre, no: ahí se acaba el tramo). Lo que toca se repite
   * si tardas; a los GIVE_UP_T s, lo rodeas sin puntos. */
  private stepStop(dt: number): void {
    const F = this.floor, M = this.moves;
    if (!F || this.stop !== F.p) return;
    const p = F.p;
    this.stopT += dt;
    F.t += dt;
    if (F.phase === 'down') {
      if (M.plank) this.phase(F, p.k === 'crawl' ? 'push' : 'up');
    } else if (F.phase === 'push') {
      const d = Math.min(p.n, M.pushups - F.push0);
      if (d > p.done) {
        p.done = d;
        this.score(50);
        this.snd('tick', null);
        this.ev.push({ t: 'haptic', k: 0.3, ms: 40 });
        if (p.done < p.n) this.say(`¡${p.done}! Faltan ${p.n - p.done}`, COL_ASK, 1.0, false);
      }
      if (p.done >= p.n) this.phase(F, 'up');
    } else if (F.phase === 'up') {
      if (!M.standing) F.t = 0;
      else if (F.t > UP_HOLD) {
        if (p.k === 'crawl') this.exit(p, true);
        else this.phase(F, 'jump');
      }
    } else if (M.takeoff) this.exit(p, true); // (el muro: el salto te lleva por encima)
    if (this.stop !== p) return;
    if (this.stopT > GIVE_UP_T) {
      this.say(p.k === 'crawl' ? 'Rodeas el túnel (sin puntos)' : 'Rodeas el muro (sin puntos)', '#a49fc8', 1.6, false);
      this.exit(p, false);
      return;
    }
    if ((this.nagT += dt) > NAG_T) {
      this.nagT = 0;
      this.ask(p, false);
    }
  }

  /** Lo siguiente de un paso de suelo (y lo que se pide entonces). */
  private phase(F: Floor, ph: Floor['phase']): void {
    F.phase = ph;
    F.t = 0;
    this.nagT = 0;
    this.ask(F.p, false);
  }

  /** Sales de un paso de suelo: el mundo te lleva al otro lado (por encima del muro, con el salto) y sigues con la velocidad
   * que traías antes de frenar. `won`: hecho (si no, rodeado, sin puntos). */
  private exit(p: Piece, won: boolean): void {
    const s0 = this.tk.dist, s1 = p.at + p.len + LAND_PAST, v1 = Math.max(EXIT_V, this.brakeFor === p ? this.brakeV : 0);
    const dur = Math.max(HOP_MIN, Math.min(1.2, (s1 - s0) / v1));
    const jump = won && p.k === 'burpee';
    this.hop = { p, s0, s1, t: 0, dur, won, v1, lift: jump ? JUMP_LIFT : 0, score: p.k === 'crawl' ? 100 * p.n : 300, cheer: p.k === 'crawl' ? '¡Túnel superado!' : '¡Muro saltado!' };
    this.stop = null;
    this.floor = null;
    this.brakeFor = null;
    this.ev.push({ t: 'go', p, dur });
    if (jump) {
      this.snd('whoosh', this.pos(p, 0, 0.3), 'arc');
      this.ev.push({ t: 'haptic', k: 0.5, ms: 60 });
    }
    if (!won) {
      p.judged = true;
      p.ok = false;
    }
  }

  /** Subes a la plataforma: con el salto (`won`: el mundo baja su altura mientras estás en el aire) o a trompicones (frenas
   * y se rompe la racha). Al acabarla bajas solo (en `step`). */
  private climb(p: Piece, won: boolean): void {
    p.judged = true;
    p.ok = won;
    this.onStep = p;
    if (won) {
      this.levTo = { from: this.lev, to: p.h, t: 0, dur: AIR_T * 0.6 };
      this.airT = 0;
      this.passed++;
      this.ev.push({ t: 'pass', p });
      this.score(150);
      this.snd('step', null, true);
      this.cheer('¡Arriba!', COL_OK, 0.9);
      return;
    }
    this.levTo = { from: this.lev, to: p.h, t: 0, dur: CLIMB_T };
    this.tk.v *= HIT_KEEP;
    this.hit(p, this.pos(p, 0, p.h));
    this.say('¡Salta para subir a la plataforma!', COL_WARN, 1.6, true);
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
        else this.climb(p, true);
        return;
      }
    }
    this.airT = 0;
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
    const k = this.airT / AIR_T;
    if (k >= 1) {
      this.airT = -1;
      return;
    }
    this.dip = -JUMP_LIFT * arc(k);
  }

  /** Lo que pide cada pieza (al avisar de ella, al pararte o si tardas). */
  private ask(p: Piece, first: boolean): void {
    if (p.k === 'gap') this.say('¡Un hueco! Salta al llegar al borde', COL_ASK, 1.6, false);
    else if (p.k === 'step') this.say('¡Plataforma! Sube de un salto', COL_ASK, 1.6, false);
    else if (p.k === 'crawl' || p.k === 'burpee') this.askFloor(p, first);
    else if (p.k === 'log') this.say('¡Salta!', COL_ASK, 1.2, false);
    else if (p.k === 'low') this.say('¡Agáchate!', COL_ASK, 1.2, false);
    else if (p.k === 'side') this.say(`¡Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}!`, COL_ASK, 1.4, false);
  }

  /** Lo que pide un paso de suelo según lo que toca (al llegar, un aviso grande). */
  private askFloor(p: Piece, first: boolean): void {
    const ph = this.floor?.p === p ? this.floor.phase : 'down';
    if (first) {
      this.say(p.k === 'crawl' ? `¡Túnel! Al suelo en plancha y ${p.n} flexiones` : '¡Muro! Al suelo, arriba y salta por encima', COL_ASK, 2.6, false);
      return;
    }
    const text = ph === 'down' ? '¡Al suelo, en plancha!' : ph === 'push' ? `¡Flexiones! Faltan ${p.n - p.done}` : ph === 'up' ? (p.k === 'crawl' ? '¡Arriba! El túnel está abierto' : '¡Arriba!') : '¡Salta el muro!';
    this.say(text, COL_ASK, 1.4, false);
  }

  /** Lo que toca ahora en un paso de suelo, para el marcador ('' si no hay). */
  task(): string {
    const F = this.floor;
    if (!F || this.stop !== F.p) return '';
    const p = F.p;
    if (F.phase === 'down') return 'Al suelo, en plancha';
    if (F.phase === 'push') return `Flexiones: ${p.done} de ${p.n}`;
    if (F.phase === 'up') return 'De pie';
    return 'Salta el muro';
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

  /* ---------- sucesos ---------- */

  private pos(p: Piece, ds: number, y: number): PlatPos {
    return { s: p.at + ds, u: p.side * 0.45, y };
  }
  private say(text: string, col: string, dur: number, warn: boolean): void {
    this.ev.push({ t: 'say', text, col, dur, warn });
  }
  private cheer(text: string, col: string, dur: number): void {
    this.ev.push({ t: 'cheer', text, col, dur });
  }
  private snd(name: 'whoosh' | 'metalHit' | 'perfect' | 'combo' | 'step' | 'victory' | 'tick', at: PlatPos | null, arg?: string | boolean): void {
    this.ev.push(arg === undefined ? { t: 'snd', name, at } : { t: 'snd', name, at, arg });
  }
  private score(n: number): void {
    this.ev.push({ t: 'score', n });
  }
}
