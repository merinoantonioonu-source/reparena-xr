/**
 * Los retos y los premios de la cuerda del remo invertido (PR 2 de docs/PLAN-BARRAS-CUERDA.md): piden **otro movimiento que el
 * remo** que te hace subir, como los de la Travesía, y se ven bien tumbado mirando arriba (llegan desde lo alto o por el cable):
 *  - **El enjambre** (`swarm`): unas abejas bajan por el cable hacia tu cara; cuando llegan, **quédate abajo** (brazos estirados).
 *  - **La ráfaga** (`gust`): estelas de viento cruzan el cielo; cuando sopla, **aguanta arriba**, pegado al cable.
 *  - **La piedra** (`rock`): cae de lo alto hacia tu cara; **aparta la cabeza** a un lado justo antes de que llegue.
 *  - **El cable deshilachado** (`frayed`): un trozo del cable roto; se pasa con **un remo explosivo** (rápido) al llegar a él.
 *  - **La fruta** (`fruit`, un premio): junto al cable, a la altura de tu cara arriba; se coge **subiendo el pecho** al pasar.
 * Sin avisos de lo que viene (regla del usuario: se entrenan los reflejos; se entiende por su forma y su sonido); al fallar, se
 * dice cómo se hace. Fallar un reto frena a la mitad y rompe la racha, sin vidas; perder una fruta, nada.
 *
 * Lógica pura, sin IWSDK: dónde sale cada uno (`buildTrials`, con el azar de la ronda) y su marcha (`RopeTrials.step`), que
 * devuelve sucesos (`TrialEv`); lo que se ve, src/modes/bars/rope-trials-look.ts.
 */
import { trekRng } from '../trek/path.js';
import type { RopeCourse } from './rope.js';

export type TrialKind = 'swarm' | 'gust' | 'rock' | 'frayed' | 'fruit';

/** Los tiempos de cada reto (s): lo que tarda en llegar desde que empieza (`come`) y lo que dura el momento en que se juzga
 * (`judge`); a cuántos metros de cuerda antes de él empieza (`ahead`); lo que tiene que estar abajo la cabeza para el enjambre
 * (m sobre lo más bajo; o lo que pide la subida, ×`low`), lo que tiene que apartarse para la piedra (`side`, m), lo que hay que
 * aguantar arriba en la ráfaga (`hold`, parte del momento) y, para la fruta y el cable roto, lo cerca que hay que pasar (m). */
export const TRIAL = {
  come: { swarm: 2.4, gust: 1.6, rock: 1.9 } as Record<string, number>,
  judge: { swarm: 0.7, gust: 1.4, rock: 0.2 } as Record<string, number>,
  ahead: 2.2,
  low: 0.45,
  side: 0.08,
  hold: 0.6,
  near: 0.8,
  frayedLen: 1.4,
  /** Separación entre dos (m de cuerda) y el primero de cada tramo, a cuántos metros de su salida. */
  gap: [5, 8] as [number, number],
  first: 4,
};

export interface Trial {
  kind: TrialKind;
  /** Dónde (m de cuerda) y su número. */
  s: number;
  id: number;
  /** El tramo en que está. */
  wave: number;
  /** wait: aún no; come: llegando; judge: el momento; done: pasado. */
  st: 'wait' | 'come' | 'judge' | 'done';
  t: number;
  /** Lo que lleva bien en el momento (s) y si salió bien (null: sin juzgar). */
  good: number;
  ok: boolean | null;
}

export type TrialEv = { t: 'start'; tr: Trial } | { t: 'pass'; tr: Trial } | { t: 'fail'; tr: Trial } | { t: 'fruit'; tr: Trial };

/** Dónde sale cada reto y cada fruta de la ronda: a lo largo de cada tramo (no encima de su cofre), cada 5-8 m;
 * el primer tramo, solo frutas y enjambres; desde el segundo, también la ráfaga y la piedra; desde el tercero, el cable roto. */
export function buildTrials(C: RopeCourse): Trial[] {
  const R = trekRng((Math.imul(C.seed | 0, 0x2c1b3c6d) ^ 0x297a2d39) >>> 0), out: Trial[] = [];
  const between = (a: number, b: number): number => a + R() * (b - a);
  let id = 0, k = 0;
  // (los retos, por turnos a lo largo de toda la ronda, empezando por los nuevos de cada tramo: así salen todos)
  const order: TrialKind[] = ['gust', 'rock', 'swarm', 'frayed'];
  for (let w = 0; w < C.ends.length; w++) {
    const a = (w ? C.ends[w - 1] : 0) + TRIAL.first, b = C.ends[w] - 3; // (hasta llegar a su cofre)
    const ok = (t: TrialKind): boolean => (w === 0 ? t === 'swarm' : t === 'frayed' ? w >= 2 : true);
    let fruitNext = true;
    for (let s = a; s < b; s += between(TRIAL.gap[0], TRIAL.gap[1])) {
      // (premio y reto, por turnos; los retos, cada vez uno distinto)
      let kind: TrialKind = 'fruit';
      if (!fruitNext) {
        do kind = order[k++ % order.length];
        while (!ok(kind));
      }
      fruitNext = !fruitNext;
      out.push({ kind, s, id: id++, wave: w, st: 'wait', t: 0, good: 0, ok: null });
    }
  }
  return out;
}

/** Lo que miran los retos de ti, cada fotograma: por dónde vas (m de cuerda), lo que tienes subida la cabeza sobre lo más bajo
 * (m) y lo que pide la subida (m), si estás arriba, lo que tienes apartada la cabeza a un lado (m) y si acabas de hacer un remo
 * explosivo; `playing`: en el tramo (si no, todo espera). */
export interface TrialEnv {
  s: number;
  up: number;
  req: number;
  top: boolean;
  side: number;
  fast: boolean;
  playing: boolean;
}

export class RopeTrials {
  readonly ev: TrialEv[] = [];
  private next = 0;
  constructor(readonly list: Trial[]) {}

  /** Cada fotograma: los que empiezan, los que llegan y se juzgan. */
  step(dt: number, E: TrialEnv): void {
    if (!E.playing) return;
    // los que empiezan (a `ahead` m de cuerda antes de ellos; la fruta y el cable roto, quietos: se juzgan al pasar)
    while (this.next < this.list.length && E.s >= this.list[this.next].s - (this.list[this.next].kind in TRIAL.come ? TRIAL.ahead : TRIAL.near + 2)) {
      const T = this.list[this.next++];
      T.st = 'come';
      T.t = 0;
      this.ev.push({ t: 'start', tr: T });
    }
    for (let i = Math.max(0, this.next - 6); i < this.next; i++) {
      const T = this.list[i];
      if (T.st === 'done' || T.st === 'wait') continue;
      if (T.kind === 'fruit') this.fruit(T, E);
      else if (T.kind === 'frayed') this.frayed(T, E);
      else this.timed(T, E, dt);
    }
  }

  // la fruta: se coge arriba, al pasar junto a ella
  private fruit(T: Trial, E: TrialEnv): void {
    if (E.top && Math.abs(E.s - T.s) < TRIAL.near) {
      T.st = 'done';
      T.ok = true;
      this.ev.push({ t: 'fruit', tr: T });
    } else if (E.s > T.s + TRIAL.near) {
      T.st = 'done';
      T.ok = false;
    }
  }

  // el cable roto: un remo explosivo mientras pasas por él (desde un poco antes); si lo cruzas sin él, falla
  private frayed(T: Trial, E: TrialEnv): void {
    if (E.fast && E.s >= T.s - TRIAL.near - 0.6 && E.s <= T.s + TRIAL.frayedLen) return this.end(T, true);
    if (E.s > T.s + TRIAL.frayedLen) this.end(T, false);
  }

  // los que llegan con su tiempo: el enjambre (abajo), la ráfaga (arriba) y la piedra (la cabeza a un lado)
  private timed(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    const come = TRIAL.come[T.kind], judge = TRIAL.judge[T.kind];
    if (T.st === 'come' && T.t >= come) {
      T.st = 'judge';
      T.good = 0;
    }
    if (T.st !== 'judge') return;
    const okNow = T.kind === 'swarm' ? E.up <= Math.max(0.05, E.req * TRIAL.low) : T.kind === 'gust' ? E.top || E.up >= E.req - 0.05 : Math.abs(E.side) >= TRIAL.side;
    if (okNow) T.good += dt;
    // (el enjambre pica en cuanto subes; la piedra da si no te has apartado en su momento)
    if (T.kind === 'swarm' && !okNow) return this.end(T, false);
    if (T.t >= come + judge) {
      if (T.kind === 'gust') this.end(T, T.good >= judge * TRIAL.hold);
      else if (T.kind === 'rock') this.end(T, T.good > 0);
      else this.end(T, true);
    }
  }

  private end(T: Trial, ok: boolean): void {
    T.st = 'done';
    T.ok = ok;
    this.ev.push({ t: ok ? 'pass' : 'fail', tr: T });
  }

  /** Los que se ven ahora (llegando, en su momento o recién pasados, y las frutas y los cables rotos aún sin pasar), en `out`
   * (se vacía y se llena: sin crear nada en cada fotograma). */
  live(out: Trial[]): Trial[] {
    out.length = 0;
    for (let i = Math.max(0, this.next - 6); i < this.list.length && i < this.next + 8; i++) {
      const T = this.list[i];
      if (T.st === 'come' || T.st === 'judge' || (T.st === 'done' && T.kind in TRIAL.come && T.t < TRIAL.come[T.kind] + 1.5) || ((T.kind === 'fruit' || T.kind === 'frayed') && T.st !== 'done' && T.st !== 'wait')) out.push(T);
    }
    return out;
  }
  /** Lo que lleva desde que acabó (para que lo que llega termine de pasar). */
  tick(dt: number): void {
    for (let i = Math.max(0, this.next - 6); i < this.next; i++) if (this.list[i].st === 'done') this.list[i].t += dt;
  }
}

/** Lo que se dice al fallar cada reto: cómo se hace (sin avisos antes: así se aprende). */
export const TRIAL_FAIL: Record<string, string> = {
  swarm: '¡Te han picado! Quédate abajo',
  gust: '¡El viento! Aguanta arriba',
  rock: '¡Piedra! Aparta la cabeza',
  frayed: '¡Cable roto! Un remo explosivo',
};
export const TRIAL_PASS: Record<string, string> = { swarm: '¡Esquivadas!', gust: '¡Aguantaste!', rock: '¡Por poco!', frayed: '¡Saltado!' };
