/**
 * El vuelo de la Travesía (RepArena XR, pedido del usuario: «un modo de travesía que sea vuelo», en plancha; las formas A, B y
 * C de la propuesta): vuelas por encima del recorrido y lo manejas con el cuerpo, como un planeador.
 *
 * - **A, en plancha** (la base): escorarte lleva el vuelo a ese lado (más cuanto más te escoras); bajar en la flexión y
 *   aguantar abajo es el **picado** (bajas deprisa y aceleras); una **flexión explosiva**, un **aletazo** (subes); dos
 *   seguidas, un gran remonte; arriba con los brazos estirados, **planeas**; de canto (el giro abierto), un **tonel**.
 * - **B, con la tabla de equilibrio** (las manos en la tabla): además, inclinar la tabla a un lado (una muñeca más baja que
 *   la otra) lleva el vuelo a ese lado, y echar el peso adelante es picar.
 * - **C, la pica**: subir la cadera (la cabeza va atrás) **frena** en el aire y remonta, como abrir las alas.
 *
 * En la dura, sin aletear (sin flexiones) un rato vas perdiendo altura poco a poco (nunca te caes: como poco, `FLY.altMin`);
 * en la suave, el vuelo mantiene la altura. Al acercarte al cofre del tramo bajas solo hasta posarte en él.
 * Lógica pura, sin IWSDK (se prueba en tests/unit/plat-fly.test.ts).
 */

/** Los números del vuelo (m, m/s y s). */
export const FLY = {
  /** La altura de vuelo: la de salida, la mínima y la máxima (sobre el sendero). */
  alt0: 6,
  altMin: 2,
  altMax: 11,
  /** Lo que te puedes apartar del centro (a cada lado) y lo deprisa, con la cabeza escorada `lean` m o más. */
  uMax: 2.4,
  uV: 3,
  lean: 0.12,
  /** El picado (bajando, m/s), el aletazo y el gran remonte (m/s de subida que dan) y lo que se pierde sin aletear en la
   * dura (m/s, pasados `idle` s sin flexiones). */
  diveV: 3.2,
  flap: 2.4,
  pair: 4.5,
  sink: 0.45,
  idle: 2.5,
  /** Lo que tarda en apagarse la subida o la bajada (s) y la corriente de aire (m/s de subida). */
  tau: 0.6,
  lift: 3.2,
  /** La pica: lo que frena (× la velocidad por segundo) y lo que sube (m/s). */
  brake: 1.4,
  brakeUp: 1.2,
  /** Lo deprisa que se sube hasta la altura mínima (al despegar, m/s). */
  takeoff: 1.6,
  /** La tabla: lo que pesa su inclinación (la diferencia de altura de las muñecas / su separación) en el lado. */
  tilt: 4,
} as const;

/** Lo que manda el cuerpo en este fotograma (de `BodyMoves` y las muñecas). */
export interface FlyIn {
  /** Lo que se escora la cabeza (m, + derecha). */
  dx: number;
  /** Abajo en la flexión (el picado). */
  low: boolean;
  /** Este fotograma: una explosiva (aletazo) y dos seguidas (gran remonte). */
  flap: boolean;
  pair: boolean;
  /** La pica (la cabeza atrás): frenar y remontar. */
  pike: boolean;
  /** Con la tabla de equilibrio: su inclinación de lado (+ derecha; 0 sin ella o sin ver las dos muñecas) y si se echa el peso
   * adelante (picar). */
  tilt: number;
  tiltDive: boolean;
  /** La forma suave (el vuelo mantiene la altura) y si has hecho una flexión hace poco (s). */
  auto: boolean;
  sinceRep: number;
  /** Dentro de una corriente de aire. */
  updraft: boolean;
  /** Posarse (de 0 a 1: al acercarte al cofre, la altura va a 0). */
  land: number;
}

export class Glider {
  /** A tu derecha (m) y la altura (m sobre el sendero), con sus velocidades. */
  u = 0;
  alt: number = FLY.alt0;
  vU = 0;
  vAlt = 0;
  /** En picado o frenando (en pica) este fotograma: la marcha lo usa para acelerar o frenar. */
  diving = false;
  braking = false;
  /** Despegando (al empezar y tras posarte en un cofre): sube solo hasta la altura de salida. */
  rising = false;

  reset(alt: number = FLY.alt0): void {
    this.u = this.vU = this.vAlt = 0;
    this.alt = alt;
    this.diving = this.braking = false;
    this.rising = alt < FLY.alt0;
  }

  /** Un fotograma. */
  step(dt: number, I: FlyIn): void {
    if (dt <= 0) return;
    // el lado: escorarse (y la tabla) da la velocidad de lado; se suaviza para que no dé tirones
    const lean = Math.max(-1, Math.min(1, I.dx / FLY.lean + I.tilt * FLY.tilt));
    this.vU += (lean * FLY.uV - this.vU) * Math.min(1, dt / 0.25);
    this.u = Math.max(-FLY.uMax, Math.min(FLY.uMax, this.u + this.vU * dt));
    // la altura
    this.diving = (I.low || I.tiltDive) && I.land <= 0;
    this.braking = I.pike && !this.diving && I.land <= 0;
    if (I.flap) this.vAlt = Math.max(this.vAlt, 0) + FLY.flap;
    if (I.pair) this.vAlt = Math.max(this.vAlt, 0) + FLY.pair;
    let want = 0;
    if (this.diving) want = -FLY.diveV;
    else if (this.braking) want = FLY.brakeUp;
    else if (I.updraft) want = FLY.lift;
    else if (!I.auto && I.sinceRep > FLY.idle) want = -FLY.sink;
    // (lo que ya subía o bajaba se va apagando hacia lo que piden el cuerpo y el aire)
    this.vAlt += (want - this.vAlt) * Math.min(1, dt / FLY.tau);
    this.alt += this.vAlt * dt;
    if (I.land > 0) {
      // posarse: cada vez más cerca del suelo, hasta el cofre (luego, a despegar otra vez)
      this.alt += (0 - this.alt) * Math.min(1, I.land * dt * 3);
      if (I.land >= 1) this.alt = 0;
      this.u += (0 - this.u) * Math.min(1, I.land * dt * 3);
      this.vAlt = 0;
      this.rising = true;
      return;
    }
    if (this.rising) {
      // (al llegar a la altura de salida, se queda ahí: sin pasarse)
      if (this.alt >= FLY.alt0) {
        this.alt = FLY.alt0;
        this.vAlt = 0;
        this.rising = false;
      } else if (this.diving || I.flap) this.rising = false;
      else this.vAlt = Math.max(this.vAlt, FLY.takeoff);
    }
    if (this.alt < FLY.altMin) {
      // (por debajo de lo mínimo —al despegar del cofre, o picando—: subes suave hasta ella; nunca te caes)
      this.vAlt = Math.max(this.vAlt, FLY.takeoff);
      if (this.alt < 0) this.alt = 0;
    } else if (this.alt > FLY.altMax) {
      this.alt = FLY.altMax;
      this.vAlt = Math.min(0, this.vAlt);
    }
  }
}

/** La inclinación de la tabla de lado, de las muñecas (la derecha más baja: a la derecha, +): 0 si no se ven las dos. */
export function boardTilt(l: { ok: boolean; x: number; y: number }, r: { ok: boolean; x: number; y: number }): number {
  if (!l.ok || !r.ok) return 0;
  const w = Math.abs(r.x - l.x);
  if (w < 0.15) return 0; // (las manos juntas: no se sabe hacia dónde)
  return (l.y - r.y) / w;
}
