/**
 * Los retos y los premios de la cuerda del remo invertido (PR 2 de docs/PLAN-BARRAS-CUERDA.md): piden **otro movimiento que el
 * remo** que te hace subir, como los de la Travesía, y se ven bien tumbado mirando arriba (llegan desde lo alto o por el cable):
 *  - **El enjambre** (`swarm`): unas abejas bajan por el cable hacia tu cara; cuando llegan, **quédate abajo** (brazos estirados).
 *  - **La ráfaga** (`gust`): estelas de viento cruzan el cielo; cuando sopla, **aguanta arriba**, pegado al cable.
 *  - **La piedra** (`rock`): cae de lo alto hacia tu cara; **aparta la cabeza** a un lado justo antes de que llegue.
 *  - **El cable deshilachado** (`frayed`): un trozo del cable roto; se pasa con **un remo explosivo** (rápido) al llegar a él.
 *  - **La fruta** (`fruit`, un premio): junto al cable, a la altura de tu cara arriba; se coge **subiendo el pecho** al pasar.
 * Y los de «Retos en la cuerda» (elegidos por el usuario: «más emocionante, con enemigos que esquivar colgado»):
 *  - **Los murciélagos** (`bats`, 1): dos o tres pasadas seguidas por encima de tu cara, cada una por un lado; **aparta la
 *    cabeza al otro lado** en cada pasada.
 *  - **El cangrejo del cable** (`crab`, 2): baja andando por el cable hacia una de tus manos; **suelta esa mano** cuando llega
 *    (colgado un instante de la otra) y vuelve a agarrar.
 *  - **El tirador** (`shooter`, 3): un cíclope (o un yeti en la cima) de pie a un lado, en el suelo, se echa atrás y lanza: **a
 *    la cara**, aparta la cabeza; **rasante por encima**, quédate abajo; **baja**, sube del todo.
 *  - **La abeja** (`bee`, 4): se te planta delante de la cara; **un remo explosivo** la aparta.
 *  - **El remo a una mano** (`onehand`, 5): la barra de un lado echa chispas y arde; **suelta esa mano** y haz los remos que pide
 *    con la otra (el siguiente, con la contraria). Si la agarras más de un momento, te quemas.
 *  - **Coger con una mano** (`reach`, 6, un premio): una gema a un lado, fuera del cable, a tu alcance; **suelta una mano y
 *    estira el brazo** hasta ella sin dejar de colgar de la otra.
 *  - **Aguantar a media altura** (`midhold`, 7): ramas heladas por encima y por debajo; **aguanta con los brazos doblados por la
 *    mitad** mientras pasan.
 *  - **Los remos lentos** (`slow`, 8): el cable cruje; **baja despacio** (unos 3 s) los remos que pide. Si bajas de golpe, se sacude.
 * Cada zona de la montaña trae los suyos (rope-worlds.ts): el valle, el enjambre y la ráfaga; el bosque, murciélagos,
 * cangrejo, abeja y piedra; la garganta, tiradores, el cable roto y murciélagos; la cima, tiradores, piedra, ráfaga y cangrejo.
 * Sin avisos de lo que viene (regla del usuario: se entrenan los reflejos; se entiende por su forma y su sonido); al fallar, se
 * dice cómo se hace. Fallar un reto frena a la mitad y rompe la racha, sin vidas; perder una fruta, nada.
 *
 * Lógica pura, sin IWSDK: dónde sale cada uno (`buildTrials`, con el azar de la ronda) y su marcha (`RopeTrials.step`), que
 * devuelve sucesos (`TrialEv`); lo que se ve, src/modes/bars/rope-trials-look.ts.
 */
import { trekRng } from '../trek/path.js';
import type { RopeCourse } from './rope.js';

export type TrialKind = 'swarm' | 'gust' | 'rock' | 'frayed' | 'fruit' | 'bats' | 'crab' | 'shooter' | 'bee' | 'onehand' | 'reach' | 'midhold' | 'slow';
/** Lo que lanza el tirador: a la cara (aparta la cabeza), rasante por encima (quédate abajo) o bajo (sube del todo). */
export type ShotKind = 'face' | 'high' | 'low';

/** Los tiempos de cada reto (s): lo que tarda en llegar desde que empieza (`come`) y lo que dura el momento en que se juzga
 * (`judge`); a cuántos metros de cuerda antes de él empieza (`ahead`); lo que tiene que estar abajo la cabeza para el enjambre
 * (m sobre lo más bajo; o lo que pide la subida, ×`low`), lo que tiene que apartarse para la piedra (`side`, m), lo que hay que
 * aguantar arriba en la ráfaga (`hold`, parte del momento) y, para la fruta y el cable roto, lo cerca que hay que pasar (m). */
export const TRIAL = {
  come: { swarm: 2.4, gust: 1.6, rock: 1.9, bats: 2.0, crab: 3.2, shooter: 2.6, bee: 1.4, midhold: 2.0 } as Record<string, number>,
  judge: { swarm: 0.7, gust: 1.4, rock: 0.2, bats: 0.25, crab: 0.9, shooter: 0.25, bee: 2.6, midhold: 3 } as Record<string, number>,
  /** Los murciélagos: lo que hay entre una pasada y la siguiente (s). La abeja: lo que tarda en picar si no la apartas (s, el
   * momento entero). El tirador: lo que dura su gesto antes de lanzar (s) y el momento de la rasante y la baja (s). */
  batGap: 1.25,
  windUp: 1.0,
  judgeShot: { face: 0.25, high: 0.6, low: 0.5 } as Record<ShotKind, number>,
  /** El remo a una mano: lo que tarda en prender la barra (s), cuántos remos pide y lo que se aguanta agarrada la que arde (s). */
  oneCome: 1.5,
  oneReps: 3,
  burn: 1.0,
  /** La gema: dónde está (a un lado, m; a la altura de la barra) y lo cerca que hay que llegar con la mano (m). */
  reachU: 0.75,
  reachNear: 0.25,
  /** Aguantar a media altura: cuánto dura (s), entre qué partes de la subida (de lo que pide) y qué parte del rato. */
  midT: 3,
  mid: [0.3, 0.8] as [number, number],
  midPart: 0.7,
  /** Los remos lentos: lo que tarda en crujir (s), cuántos y lo que tiene que durar cada bajada (s). */
  slowCome: 1.2,
  slowReps: 3,
  slowDown: 2.3,
  ahead: 2.2,
  low: 0.45,
  side: 0.08,
  hold: 0.6,
  near: 0.8,
  frayedLen: 1.4,
  /** Separación entre dos (m de cuerda) y el primero de cada tramo, a cuántos metros de su salida. */
  gap: [4.5, 7] as [number, number],
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
  /** A qué lado (−1, izquierda; 1, derecha; en el marco de la cuerda): por dónde pasa la primera pasada de murciélagos, la
   * mano a la que va el cangrejo o dónde está el tirador. */
  side: number;
  /** Los murciélagos: cuántas pasadas y por cuál va. El tirador: lo que lanza. */
  n: number;
  k: number;
  shot: ShotKind;
}

export type TrialEv = { t: 'start'; tr: Trial } | { t: 'pass'; tr: Trial } | { t: 'fail'; tr: Trial } | { t: 'fruit'; tr: Trial };

/** Los retos de cada zona de la montaña (el valle, el bosque, la garganta y la cima), por turnos: la subida va a más. */
export const ZONE_TRIALS: TrialKind[][] = [
  ['swarm', 'gust'],
  ['bats', 'crab', 'bee', 'rock'],
  ['shooter', 'onehand', 'frayed', 'slow', 'bats'],
  ['shooter', 'midhold', 'rock', 'onehand', 'gust', 'crab'],
];
/** Los que duran lo que tardes (los remos a una mano y los lentos): mientras, no empieza otro. */
const HELD = new Set<TrialKind>(['onehand', 'slow']);
/** Los premios: la fruta y, en el valle una de cada dos y en lo demás una de cada tres, la gema que se coge con una mano. */
const prizeOf = (z: number, n: number): TrialKind => (n % (z === 0 ? 2 : 3) === 1 ? 'reach' : 'fruit');
/** La zona de un punto de la ronda (0-3), por lo que llevas de ella (no de la montaña: en una ronda corta también se ven
 * todos). */
export const trialZone = (C: RopeCourse, s: number): number => Math.max(0, Math.min(3, Math.floor((s / Math.max(1, C.top)) * 4)));

/** Dónde sale cada reto y cada premio de la ronda: a lo largo de cada tramo (no encima de su cofre), cada 4,5-7 m; un premio y
 * dos retos por turnos, y cada reto, el que toca de los de su zona. */
export function buildTrials(C: RopeCourse): Trial[] {
  const R = trekRng((Math.imul(C.seed | 0, 0x2c1b3c6d) ^ 0x297a2d39) >>> 0), out: Trial[] = [];
  const between = (a: number, b: number): number => a + R() * (b - a);
  const side = (): number => (R() < 0.5 ? -1 : 1);
  const shots: ShotKind[] = ['face', 'high', 'low'];
  let id = 0, prizes = 0, oneSide = 1;
  const turn = [0, 0, 0, 0];
  for (let w = 0; w < C.ends.length; w++) {
    const a = (w ? C.ends[w - 1] : 0) + TRIAL.first, b = C.ends[w] - 3; // (hasta llegar a su cofre)
    let c = 0;
    for (let s = a; s < b; s += between(TRIAL.gap[0], TRIAL.gap[1])) {
      // (un premio y dos retos, por turnos: más retos, más emoción)
      const z = trialZone(C, s);
      let kind: TrialKind = prizeOf(z, prizes);
      if (c++ % 3) {
        const pool = ZONE_TRIALS[z];
        kind = pool[turn[z]++ % pool.length];
      } else prizes++;
      // (el remo a una mano, cada vez con la contraria; los que duran lo que tardes, más hueco hasta el siguiente)
      const sd = kind === 'onehand' ? (oneSide = -oneSide) : side();
      const n = kind === 'onehand' ? TRIAL.oneReps : kind === 'slow' ? TRIAL.slowReps : 2 + (R() < 0.5 ? 1 : 0);
      out.push({ kind, s, id: id++, wave: w, st: 'wait', t: 0, good: 0, ok: null, side: sd, n, k: 0, shot: shots[id % 3] });
      if (HELD.has(kind)) s += n * 1.7;
    }
  }
  return out;
}

/** Lo que miran los retos de ti, cada fotograma: por dónde vas (m de cuerda), lo que tienes subida la cabeza sobre lo más bajo
 * (m) y lo que pide la subida (m), si estás arriba, lo que tienes apartada la cabeza a un lado (m; en el marco de la cuerda), si
 * acabas de hacer un remo explosivo y qué mano está suelta (`free[0]`, la del lado izquierdo; `free[1]`, la del derecho);
 * `playing`: en el tramo (si no, todo espera). */
export interface TrialEnv {
  s: number;
  up: number;
  req: number;
  top: boolean;
  side: number;
  fast: boolean;
  free: [boolean, boolean];
  /** ¿Acabas de hacer un remo (sea como sea)? Y, si acabas de bajar, lo que has tardado (s; 0, si no). */
  rep: boolean;
  descent: number;
  /** Dónde está la muñeca de cada lado (en el marco de la cuerda: x a un lado, y sobre la barra, z hacia tu cabeza); null si no
   * se ve. */
  wrist: [Pt | null, Pt | null];
  playing: boolean;
}
/** Un punto (sin Three: la lógica es pura). */
export interface Pt {
  x: number;
  y: number;
  z: number;
}

export class RopeTrials {
  readonly ev: TrialEv[] = [];
  private next = 0;
  /** C: el recorrido (dónde queda cada cosa a lo largo; sin él, se calcula con la cuesta media). */
  constructor(readonly list: Trial[], private readonly C: RopeCourse | null = null) {}

  /** Cada fotograma: los que empiezan, los que llegan y se juzgan. */
  step(dt: number, E: TrialEnv): void {
    if (!E.playing) return;
    // los que empiezan (a `ahead` m de cuerda antes de ellos; la fruta y el cable roto, quietos: se juzgan al pasar)
    while (this.next < this.list.length && !this.holding() && E.s >= this.list[this.next].s - (this.list[this.next].kind in TRIAL.come || HELD.has(this.list[this.next].kind) ? TRIAL.ahead : TRIAL.near + 2)) {
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
      else if (T.kind === 'bats') this.bats(T, E, dt);
      else if (T.kind === 'crab') this.crab(T, E, dt);
      else if (T.kind === 'shooter') this.shooter(T, E, dt);
      else if (T.kind === 'bee') this.bee(T, E, dt);
      else if (T.kind === 'onehand') this.onehand(T, E, dt);
      else if (T.kind === 'reach') this.reach(T, E);
      else if (T.kind === 'midhold') this.midhold(T, E, dt);
      else if (T.kind === 'slow') this.slow(T, E, dt);
      else this.timed(T, E, dt);
    }
  }

  // ¿hay uno de los que duran lo que tardes aún en marcha? (mientras, no empieza otro)
  private holding(): boolean {
    for (let i = Math.max(0, this.next - 3); i < this.next; i++) if (HELD.has(this.list[i].kind) && this.list[i].st !== 'done') return true;
    return false;
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

  // los murciélagos: cada pasada, por su lado (por turnos), y en su momento la cabeza tiene que estar apartada al otro
  private bats(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    const at = TRIAL.come.bats + T.k * TRIAL.batGap, sd = batSide(T, T.k);
    if (T.t < at) return;
    T.st = 'judge';
    if (-sd * E.side >= TRIAL.side) T.good += dt;
    if (T.t < at + TRIAL.judge.bats) return;
    if (T.good <= 0) return this.end(T, false);
    T.good = 0;
    if (++T.k >= T.n) this.end(T, true);
    else T.st = 'come';
  }

  // el cangrejo: llega a tu mano (la de su lado) y, en su momento, esa mano tiene que estar suelta
  private crab(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    const come = TRIAL.come.crab;
    if (T.t < come - 0.25) return;
    T.st = 'judge';
    if (E.free[T.side < 0 ? 0 : 1]) return this.end(T, true);
    if (T.t >= come + TRIAL.judge.crab) this.end(T, false);
  }

  // el tirador: se echa atrás y lanza; a la cara (la cabeza, a un lado en su momento), rasante (abajo mientras pasa: en cuanto
  // subes, te da) o baja (arriba mientras pasa)
  private shooter(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    const come = TRIAL.come.shooter, j = TRIAL.judgeShot[T.shot];
    if (T.t < come) return;
    T.st = 'judge';
    const ok = T.shot === 'face' ? Math.abs(E.side) >= TRIAL.side : T.shot === 'high' ? E.up <= Math.max(0.05, E.req * TRIAL.low) : E.top || E.up >= E.req - 0.05;
    if (ok) T.good += dt;
    if (T.shot === 'high' && !ok) return this.end(T, false);
    if (T.t >= come + j) this.end(T, T.shot === 'low' ? T.good >= j * TRIAL.hold : T.good > 0 || T.shot === 'high');
  }

  // la abeja: se te planta delante y, si no la apartas con un remo explosivo, te pica
  private bee(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    if (T.t < TRIAL.come.bee) return;
    T.st = 'judge';
    if (E.fast) return this.end(T, true);
    if (T.t >= TRIAL.come.bee + TRIAL.judge.bee) this.end(T, false);
  }

  // el remo a una mano: prende la barra de su lado; luego, los remos con la otra (`k`, los que lleva). Si agarras la que arde más
  // de un momento, te quemas
  private onehand(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    if (T.t < TRIAL.oneCome) return;
    T.st = 'judge';
    const free = E.free[T.side < 0 ? 0 : 1];
    T.good = free ? 0 : T.good + dt;
    if (T.good > TRIAL.burn) return this.end(T, false);
    if (E.rep && free && ++T.k >= T.n) this.end(T, true);
  }

  // la gema: al pasar junto a ella, la mano de su lado tiene que llegar (es un premio: si no, nada)
  private reach(T: Trial, E: TrialEnv): void {
    const dz = this.along(T.s, E.s), w = E.wrist[T.side < 0 ? 0 : 1];
    if (Math.abs(dz) < TRIAL.near) {
      T.st = 'judge';
      if (w && Math.hypot(w.x - T.side * TRIAL.reachU, w.y, w.z + dz) < TRIAL.reachNear) {
        T.st = 'done';
        T.ok = true;
        this.ev.push({ t: 'fruit', tr: T });
      }
    } else if (dz < -TRIAL.near) {
      T.st = 'done';
      T.ok = false;
    }
  }
  /** Lo que queda (m, en horizontal) de `s` a `at` a lo largo de la cuerda. */
  private along(at: number, s: number): number {
    return this.C ? this.C.h(at) - this.C.h(s) : (at - s) * 0.85;
  }

  // aguantar a media altura: mientras pasan las ramas, la cabeza entre la mitad baja y la alta de la subida casi todo el rato
  private midhold(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    const come = TRIAL.come.midhold;
    if (T.t < come) return;
    T.st = 'judge';
    const f = E.req > 0 ? E.up / E.req : 0;
    if (f >= TRIAL.mid[0] && f <= TRIAL.mid[1]) T.good += dt;
    if (T.t >= come + TRIAL.midT) this.end(T, T.good >= TRIAL.midT * TRIAL.midPart);
  }

  // los remos lentos: cruje el cable; cada bajada tiene que durar lo que pide (una de golpe lo sacude: falla)
  private slow(T: Trial, E: TrialEnv, dt: number): void {
    T.t += dt;
    if (T.t < TRIAL.slowCome) return;
    T.st = 'judge';
    if (E.descent <= 0) return;
    if (E.descent < TRIAL.slowDown) return this.end(T, false);
    if (++T.k >= T.n) this.end(T, true);
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
      if (T.st === 'come' || T.st === 'judge' || (T.st === 'done' && T.kind in TRIAL.come && T.t < trialEnd(T) + 1.5) || ((T.kind === 'fruit' || T.kind === 'frayed' || T.kind === 'reach' || HELD.has(T.kind)) && T.st !== 'done' && T.st !== 'wait')) out.push(T);
    }
    return out;
  }
  /** Lo que lleva desde que acabó (para que lo que llega termine de pasar). */
  tick(dt: number): void {
    for (let i = Math.max(0, this.next - 6); i < this.next; i++) if (this.list[i].st === 'done') this.list[i].t += dt;
  }
}

/** Por qué lado pasa la pasada k de los murciélagos (por turnos, empezando por el suyo). */
export const batSide = (T: Trial, k: number): number => (k % 2 ? -T.side : T.side);
/** Cuándo acaba lo que llega de un reto (s desde que empieza): lo que se sigue viendo después, hasta que se va. */
export const trialEnd = (T: Trial): number =>
  T.kind === 'bats' ? TRIAL.come.bats + (T.n - 1) * TRIAL.batGap + TRIAL.judge.bats : T.kind === 'shooter' ? TRIAL.come.shooter + TRIAL.judgeShot[T.shot] : (TRIAL.come[T.kind] ?? 0) + (TRIAL.judge[T.kind] ?? 0);

/** Lo que se dice al fallar cada reto: cómo se hace (sin avisos antes: así se aprende). */
export const TRIAL_FAIL: Record<string, string> = {
  swarm: '¡Te han picado! Quédate abajo',
  gust: '¡El viento! Aguanta arriba',
  rock: '¡Piedra! Aparta la cabeza',
  frayed: '¡Cable roto! Un remo explosivo',
  bats: '¡Murciélagos! Aparta la cabeza',
  crab: '¡Pellizco! Suelta esa mano',
  bee: '¡Te ha picado! Remo explosivo',
  'shooter-face': '¡Te ha dado! Aparta la cabeza',
  'shooter-high': '¡Te ha dado! Quédate abajo',
  'shooter-low': '¡Te ha dado! Sube del todo',
  onehand: '¡Quema! Suelta esa mano',
  midhold: '¡Las ramas! A media altura',
  slow: '¡Despacio! Baja en 3 segundos',
};
export const TRIAL_PASS: Record<string, string> = { swarm: '¡Esquivadas!', gust: '¡Aguantaste!', rock: '¡Por poco!', frayed: '¡Saltado!', bats: '¡Esquivados!', crab: '¡Se fue!', bee: '¡Fuera!', shooter: '¡Esquivada!', onehand: '¡A una mano!', midhold: '¡Aguantaste!', slow: '¡Bien controlado!' };
/** Quién es el tirador: en la cima, el yeti (bolas de nieve); en lo demás, el cíclope (piedras). */
export const shooterOf = (C: RopeCourse, T: Trial): 'yeti' | 'cyclops' => (trialZone(C, T.s) === 3 ? 'yeti' : 'cyclops');
/** La clave de su aviso (el tirador, según lo que lanzó). */
export const trialKey = (T: Trial): string => (T.kind === 'shooter' ? `shooter-${T.shot}` : T.kind);
