// Para las pruebas de la Travesía de plataformas: un simulador de cabeza. Mueve `env.head` fotograma a fotograma (de pie,
// sentadilla, salto, «estirarse», agacharse, paso a un lado), llama a `runner.step` en cada uno, a `runner.rep` al acabar
// cada sentadilla (el Runner no las detecta) y recoge los sucesos (`runner.ev`) con dónde y cuándo pasaron. Todo con límite
// de fotogramas: una prueba que no avanza falla, no se cuelga.
import { Runner } from '../../src/modes/trek/plat/runner.js';
import { piece, type Course, type Piece, type PlatEnv, type PlatEv } from '../../src/modes/trek/plat/types.js';

export const DT = 1 / 72;
/** Los ajustes de las pruebas (los de serie; sin curvas). */
export const SETTINGS: Record<string, number> = { trekSpeed: 130, trekCurves: 0, arcJumpH: 6, arcShift: 40, squatDepth: 26, lungeDepth: 28 };
/** Un tope de fotogramas por defecto (2 min). */
export const LIMIT = 72 * 120;

/** Azar con semilla (el mismo de trek-path.test.ts). */
export const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

export type SimEnv = PlatEnv & { mem: Map<string, unknown>; S: Record<string, number> };

/** Un `PlatEnv` de mentira: ajustes de serie (con `over` encima), azar con semilla y un almacén en memoria. */
export function mkEnv(over: Record<string, number> = {}, seed = 5): SimEnv {
  const S = { ...SETTINGS, ...over };
  const mem = new Map<string, unknown>();
  return {
    S,
    mem,
    s: (k) => S[k] ?? 0,
    dv: (k) => S[k] ?? 0,
    ex: 'squat',
    state: 'play',
    head: { x: 0, y: 1.6, z: 0 },
    calibRef: 1.6,
    wave: 0,
    rank: 0,
    now: 10,
    rnd: rng(seed),
    store: (k) => mem.get(k) ?? null,
  };
}

/** Un recorrido a mano: las piezas en orden (la última, el cofre) y dónde acaba. */
export function course(pieces: Piece[]): Course {
  return { pieces, end: pieces[pieces.length - 1].at };
}
export { piece };

const smooth = (k: number): number => k * k * (3 - 2 * k);

export type Of<T extends PlatEv['t']> = Extract<PlatEv, { t: T }>;

export class Sim {
  readonly env: SimEnv;
  readonly r: Runner;
  /** Todos los sucesos, en orden, y dónde (m recorridos) y cuándo (s desde el principio) pasó cada uno. */
  readonly log: PlatEv[] = [];
  readonly stamp = new Map<PlatEv, { d: number; t: number }>();
  /** Fotogramas y segundos pasados. */
  frames = 0;
  t = 0;

  constructor(over: Record<string, number> = {}, seed = 5) {
    this.env = mkEnv(over, seed);
    this.r = new Runner(this.env);
    this.r.reset();
  }

  get head(): { x: number; y: number; z: number } {
    return this.env.head;
  }
  get ref(): number {
    return this.env.calibRef;
  }

  /* ---------- el recorrido y los sucesos ---------- */

  /** Empieza de cero con este recorrido (lo que salga a la vista al montarlo, ya queda apuntado). */
  load(c: Course): void {
    this.r.reset();
    this.drain();
    this.r.addCourse(c);
    this.drain();
  }

  /** Pasa los sucesos del Runner al registro (y los vacía, como hace la partida). */
  private drain(): void {
    const r = this.r;
    for (const e of r.ev) {
      this.log.push(e);
      this.stamp.set(e, { d: r.dist, t: this.t });
    }
    r.ev.length = 0;
  }

  /** Los sucesos de una clase (todos, o desde el índice `from` del registro). */
  of<T extends PlatEv['t']>(t: T, from = 0): Of<T>[] {
    return this.log.slice(from).filter((e): e is Of<T> => e.t === t);
  }
  /** Los de una clase que son de la pieza `p`. */
  ofPiece<T extends 'show' | 'hide' | 'pass' | 'hit' | 'halt' | 'go' | 'chest' | 'vanish'>(t: T, p: Piece): Of<T>[] {
    return this.of(t).filter((e) => (e as { p: Piece }).p === p);
  }
  /** Dónde y cuándo pasó un suceso. */
  when(e: PlatEv): { d: number; t: number } {
    const w = this.stamp.get(e);
    if (!w) throw new Error('suceso sin apuntar');
    return w;
  }

  /* ---------- fotogramas ---------- */

  /** Un fotograma con la cabeza donde está ahora. */
  frame(): void {
    this.env.now += DT;
    this.t += DT;
    this.frames++;
    this.r.step(DT);
    this.drain();
  }

  /** Fotogramas con la cabeza quieta hasta que `cond`, como mucho `max`. Devuelve si se cumplió. */
  until(cond: () => boolean, max = LIMIT): boolean {
    for (let i = 0; i < max; i++) {
      if (cond()) return true;
      this.frame();
    }
    return cond();
  }

  /** Un movimiento de `dur` s: en cada fotograma, `f(k)` con k de 0 a 1 mueve la cabeza. */
  private play(dur: number, f: (k: number) => void): void {
    const n = Math.max(1, Math.round(dur / DT));
    for (let i = 1; i <= n; i++) {
      f(i / n);
      this.frame();
    }
  }

  /* ---------- lo que hace el cuerpo ---------- */

  /** De pie, quieto, `sec` s (con la cabeza a la altura de pie; el lado, donde esté). */
  stand(sec: number): void {
    this.head.y = this.ref;
    this.play(sec, () => {});
  }

  /** Una sentadilla: baja `depth` m y sube en `gap` s; al acabar, la repetición. Devuelve lo que dice `rep` (si empujó). */
  squat(depth = 0.3, gap = 1.5): boolean {
    this.play(gap, (k) => (this.head.y = this.ref - depth * Math.sin(Math.PI * k)));
    this.head.y = this.ref;
    const pushed = this.r.rep(false);
    this.drain();
    return pushed;
  }

  /** Un salto de verdad: la cabeza sube `h` m en `up` s y baja en otros tantos (sube deprisa: un salto, no ponerse de puntillas). */
  jump(h = 0.15, up = 0.15): void {
    this.play(2 * up, (k) => (this.head.y = this.ref + h * Math.sin(Math.PI * k)));
    this.head.y = this.ref;
  }

  /** Estirarse despacio, de puntillas: sube `h` m en `up` s, aguanta `hold` s y baja. No es un salto. */
  stretch(h = 0.1, up = 1, hold = 0.3): void {
    this.play(up, (k) => (this.head.y = this.ref + h * k));
    this.play(hold, () => {});
    this.play(up, (k) => (this.head.y = this.ref + h * (1 - k)));
    this.head.y = this.ref;
  }

  /** Agacharse `d` m (en `ease` s), aguantar (`hold` s o hasta que `hold()`) y subir (en `ease` s). */
  duck(d: number, hold: number | (() => boolean), ease = 0.4): void {
    this.play(ease, (k) => (this.head.y = this.ref - d * smooth(k)));
    this.head.y = this.ref - d;
    if (typeof hold === 'number') this.play(hold, () => {});
    else this.until(hold, 72 * 20);
    this.play(ease, (k) => (this.head.y = this.ref - d * (1 - smooth(k))));
    this.head.y = this.ref;
  }

  /** Un paso a un lado: la x va a `dx` m (+ derecha, en `ease` s, 0,4 s), aguanta y vuelve al centro (`x` de partida). */
  side(dx: number, hold: number | (() => boolean), ease = 0.4): void {
    const x0 = this.head.x;
    this.play(ease, (k) => (this.head.x = x0 + dx * smooth(k)));
    this.head.x = x0 + dx;
    if (typeof hold === 'number') this.play(hold, () => {});
    else this.until(hold, 72 * 20);
    this.play(ease, (k) => (this.head.x = x0 + dx * (1 - smooth(k))));
    this.head.x = x0;
  }

  /* ---------- avanzar hasta algo ---------- */

  /** Cuánto falta para que la pieza llegue a la cabeza (m). */
  room(p: Piece): number {
    return p.at - this.r.dist;
  }

  /**
   * Avanza a sentadillas hasta que `room()` baje de `stopAt` (o te pares ante un paso). Si falta poco para otra sentadilla
   * entera (lo que se recorre en una, 1,5 s), deja que la inercia lleve; si se acaba, otra sentadilla.
   * Devuelve si llegó (antes de `max` fotogramas).
   */
  walk(room: () => number, stopAt: number, max = LIMIT): boolean {
    const end = this.frames + max;
    while (this.frames < end) {
      if (room() <= stopAt || this.r.stop) return true;
      // (una sentadilla dura 1,5 s: solo si hasta la pieza hay más de lo que se recorre en ella)
      if (room() > stopAt + 2 + 1.6 * Math.max(this.r.v, 2.5) || this.r.v < 0.3) this.squat();
      else this.frame();
    }
    return room() <= stopAt || !!this.r.stop;
  }

  /** Sentadillas hasta estar a `z` m de la pieza `p` (o parado ante ella). */
  squatsTo(p: Piece, z: number, max = LIMIT): boolean {
    return this.walk(() => this.room(p), z, max);
  }

  /** Hace bien lo que pide la pieza `p` (viga: agacharse; tronco: saltar; lado: apartarse; hueco: saltar; cofre: llegar). */
  pass(p: Piece): boolean {
    switch (p.k) {
      case 'low':
        if (!this.squatsTo(p, 2.5)) return false;
        this.duck(p.h + 0.03, () => p.judged);
        return p.judged;
      case 'log':
        if (!this.squatsTo(p, 0.5)) return false;
        this.jump();
        return this.until(() => p.judged, 72 * 5);
      case 'side':
        if (!this.squatsTo(p, 2.5)) return false;
        this.side(-p.side * 0.4, () => p.judged);
        return p.judged;
      case 'gap':
        if (!this.squatsTo(p, 1.0)) return false;
        this.jump();
        return this.until(() => p.judged, 72 * 5);
      case 'chest':
        return this.squatsTo(p, 1.2) && this.until(() => this.r.chest === p, 72 * 20);
      default:
        throw new Error(`pass: ${p.k} no está en esta prueba`);
    }
  }

  /** Llega a la pieza fluida `p` sin hacer nada y espera a que se juzgue (choca, o la pasa por suerte). */
  blow(p: Piece): boolean {
    if (!this.squatsTo(p, 0.5)) return false;
    this.head.y = this.ref;
    return this.until(() => p.judged, 72 * 20);
  }
}
