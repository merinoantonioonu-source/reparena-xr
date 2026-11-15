/**
 * La Travesía de plataformas en marcha: dónde vas en el recorrido, a qué velocidad, cuándo te paras ante un paso y cómo se
 * juzga cada pieza. El impulso es el de la Travesía de siempre (`Trek`, path.ts: cada repetición empuja según su ritmo y lo
 * hondo que bajas; sin repeticiones, frenas; seis seguidas a buen ritmo, el turbo), sin sus retos: los de aquí son las
 * piezas del recorrido (course.ts), juzgadas con lo que hace el cuerpo (moves.ts).
 *
 * - **Fluidas** (viga baja, obstáculo a un lado, tronco): se pasan sin parar; si fallas, chocas: frenas y se rompe la
 *   racha, sin perder vidas.
 * - **Pasos** (el hueco; el cofre al final del tramo): el mundo se para a `STOP_AT` (1 m) y el movimiento pedido es el que
 *   te lleva al otro lado; no hay que acertar el instante. En el hueco, un salto: el mundo te lleva al otro lado, bajando
 *   y subiendo suave bajo los pies (`dip`), sin caídas. Nunca se cae.
 *
 * Lógica pura, sin IWSDK: lo que pide del juego, en `PlatEnv`; lo que se ve y se oye, en los sucesos de `ev`, que la
 * partida aplica en orden y vacía.
 */
import { HEAD_TOP, type TrekEnv, type TrekEv } from '../env.js';
import { Trek, TREK_TURBO_V, TREK_VMAX, trekK } from '../path.js';
import { buildCourse } from './course.js';
import { BodyMoves, moveCfg, type MoveCfg } from './moves.js';
import { COL_ASK, COL_OK, COL_WARN, FLUID, HALT, LAND_PAST, PLAT_SEE, STOP_AT, type Course, type Piece, type PlatEnv, type PlatEv, type PlatPos } from './types.js';

/** El salto del hueco: a qué velocidad te lleva el mundo (m/s), cuánto dura como poco y como mucho (s) y cuánto baja el
 * mundo en medio (m: como si el salto te elevara). */
export const HOP_V = 3.2, HOP_MIN = 0.5, HOP_MAX = 1.0, HOP_DIP = 0.15;
/** Parado ante un paso sin hacer nada: cada cuánto se repite lo que hay que hacer (s) y cuándo lo rodeas (s, sin puntos). */
export const NAG_T = 6, GIVE_UP_T = 40;
/** Dónde se avisa de lo que viene (m antes de la cabeza): las fluidas, a 4 m; el obstáculo a un lado, antes (para dar el
 * paso con calma). */
export const WARN_AT = 4, SIDE_WARN_AT = 6;
/** Mientras pasa bajo ti: la ventana del tronco (m) y la del obstáculo a un lado (m). */
export const LOG_WIN = 0.45, SIDE_WIN = 0.35;
/** Lo que queda atrás de una pieza antes de quitarla (m). */
export const BEHIND = 8;
/** Cuántos segundos antes de un obstáculo a un lado el centro deja de seguir a la cabeza. */
export const SIDE_HOLD_S = 3;

/** Lo que mide el tramo hasta el cofre (m) con las repeticiones de su oleada: unos 3,5 m por repetición, entre 40 y 300. */
export const tramoLen = (reps: number): number => Math.max(40, Math.min(300, Math.round(reps * 3.5)));

/** La velocidad más alta con los ajustes (m/s): «Velocidad de avance» y el turbo. */
export const platVmax = (env: PlatEnv): number => TREK_VMAX * ((env.s('trekSpeed') || 100) / 100) * TREK_TURBO_V;

const smooth = (k: number): number => k * k * (3 - 2 * k);

/** El salto de ahora: de dónde a dónde te lleva el mundo, lo que lleva y lo que dura. */
interface Hop {
  p: Piece;
  s0: number;
  s1: number;
  t: number;
  dur: number;
  won: boolean;
}

export class Runner {
  /** Lo que ha pasado desde que la partida los aplicó (y vació: `runner.ev.length = 0`). */
  ev: PlatEv[] = [];
  /** El impulso de la Travesía (su `dist` es dónde vas). */
  readonly tk: Trek;
  readonly moves = new BodyMoves();
  readonly cfg: MoveCfg = { jumpH: 0.06, sideNeed: 0.3 };
  /** El recorrido hecho hasta ahora (los tramos ya montados, en orden) y el primero que aún no ha salido a la vista. */
  pieces: Piece[] = [];
  private nextShow = 0;
  /** Los que están a la vista (salieron y aún no han quedado atrás). */
  live: Piece[] = [];
  /** El paso ante el que estás parado (y cuánto llevas), el salto de ahora y el cofre al que has llegado. */
  stop: Piece | null = null;
  stopT = 0;
  private nagT = 0;
  hop: Hop | null = null;
  chest: Piece | null = null;
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
      s: (k) => E.s(k),
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
    this.stopT = this.nagT = this.dip = 0;
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

  /** Una repetición del ejercicio. Empuja si vas en marcha; parado ante un paso, recuerda lo que toca (y no empuja).
   * Devuelve si ha empujado (las de una parada no cuentan para el tramo). */
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
    const d0 = tk.dist;
    if (this.stop || this.hop) tk.idle = 0; // (el turbo espera en las paradas)
    tk.step(dt, env.now);
    if (this.stop || this.hop) {
      tk.dist = d0;
      tk.v = 0;
      tk.push = 0;
    }
    this.stepHop(dt);
    // nunca pasas el sitio de parada de un paso que aún no has cruzado
    const h = this.nextHalt();
    if (h && !this.hop && tk.dist > h.at - STOP_AT) {
      tk.dist = h.at - STOP_AT;
      if (st === 'play' || h.k === 'chest') this.halt(h);
      else tk.v = 0;
    }
    tk.frame();
    this.reveal();
    if (st === 'play') {
      for (const p of this.live) if (!p.judged && FLUID.includes(p.k)) this.judge(p, p.at - tk.dist + H.z);
      this.stepStop(dt);
    }
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
    const M = this.moves, C = this.cfg;
    if (!p.warned && z < (p.k === 'side' ? SIDE_WARN_AT : WARN_AT)) {
      p.warned = true;
      this.ask(p, true);
    }
    if (p.k === 'side') {
      if (Math.abs(z) < SIDE_WIN && !M.clear(p.side as -1 | 1, C)) p.bad = true;
      if (z < -SIDE_WIN) this.result(p, !p.bad);
      return;
    }
    if (p.k === 'log') {
      if (Math.abs(z) < LOG_WIN) {
        p.maxUp = Math.max(p.maxUp, M.up);
        if (M.air) p.fast = true;
      }
      if (z < -LOG_WIN) this.result(p, p.maxUp >= C.jumpH && p.fast);
      return;
    }
    if (p.k === 'low' && z < 0.1) this.result(p, M.under(p.h));
  }

  /** Superada o chocada. Chocar frena (la viga te para del todo; el tronco y el barril, casi) y rompe la racha. */
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
    this.hits++;
    const tk = this.tk;
    // (la viga te para del todo, también el empuje de la última repetición; el tronco y el barril, casi)
    if (p.k === 'low') tk.v = tk.push = tk.want = 0;
    else tk.v *= 0.2;
    this.ev.push({ t: 'hit', p });
    this.ev.push({ t: 'combo0' });
    tk.turboSet(false);
    this.snd('metalHit', at, false);
    this.ev.push({ t: 'fx', name: 'dust', at, n: 10, col: 0xd8c8a8 });
    this.ev.push({ t: 'haptic', k: 0.8, ms: 120 });
    const away = p.side < 0 ? 'derecha' : 'izquierda';
    this.say(p.k === 'log' ? '¡Salta el tronco!' : p.k === 'low' ? '¡Agáchate bajo la viga!' : `¡Apártate a la ${away}!`, COL_WARN, 1.6, true);
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
    this.ask(p, true);
  }

  /** Parado ante un paso: el movimiento que lo cruza (en el hueco, el salto). */
  private stepStop(dt: number): void {
    const p = this.stop;
    if (!p || p.k === 'chest' || this.hop) return;
    this.stopT += dt;
    if (p.k === 'gap' && this.moves.takeoff) {
      this.go(p, true);
      return;
    }
    if (this.stopT > GIVE_UP_T) {
      this.say('Rodeas el hueco por el borde', '#a49fc8', 1.6, false);
      this.go(p, false);
      return;
    }
    if ((this.nagT += dt) > NAG_T) {
      this.nagT = 0;
      this.ask(p, false);
    }
  }

  /** Empieza el movimiento que te lleva al otro lado (`won`: con el salto; si no, rodeándolo, sin puntos). */
  private go(p: Piece, won: boolean): void {
    const s0 = this.tk.dist, s1 = p.at + p.len + LAND_PAST, dur = Math.max(HOP_MIN, Math.min(HOP_MAX, (s1 - s0) / HOP_V));
    this.hop = { p, s0, s1, t: 0, dur, won };
    this.stop = null;
    this.ev.push({ t: 'go', p, dur });
    if (won) {
      this.snd('whoosh', this.pos(p, 0, 0.3), 'arc');
      this.ev.push({ t: 'haptic', k: 0.5, ms: 60 });
    }
  }

  /** El salto: el mundo te lleva al otro lado (suave al empezar y al acabar) y baja y sube en medio, como si te elevara. */
  private stepHop(dt: number): void {
    const H = this.hop;
    this.dip = 0;
    if (!H) return;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    this.tk.dist = H.s0 + (H.s1 - H.s0) * smooth(k);
    this.dip = -HOP_DIP * Math.sin(Math.PI * k);
    if (k < 1) return;
    this.hop = null;
    this.dip = 0;
    const p = H.p;
    p.judged = true;
    p.ok = H.won;
    this.tk.idle = 0;
    if (!H.won) return;
    this.passed++;
    this.ev.push({ t: 'pass', p });
    this.score(200);
    this.ev.push({ t: 'fx', name: 'dust', at: this.pos(p, p.len + LAND_PAST, 0), n: 8, col: 0xd8c8a8 });
    this.snd('step', null, true);
    this.cheer('¡Hueco saltado!', COL_OK, 1.2);
  }

  /** Lo que pide cada pieza (al avisar de ella, al pararte o si tardas). */
  private ask(p: Piece, first: boolean): void {
    if (p.k === 'gap') this.say(first ? '¡Un hueco! Salta para cruzarlo' : '¡Salta para cruzar el hueco!', COL_ASK, first ? 2.4 : 1.4, false);
    else if (p.k === 'log') this.say('¡Salta!', COL_ASK, 1.2, false);
    else if (p.k === 'low') this.say('¡Agáchate!', COL_ASK, 1.2, false);
    else if (p.k === 'side') this.say(`¡Apártate a la ${p.side < 0 ? 'derecha' : 'izquierda'}!`, COL_ASK, 1.4, false);
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
