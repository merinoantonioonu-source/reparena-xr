/**
 * El parapente del remo invertido (Barras, «en pruebas»; pedido del usuario: «una mezcla de barra y travesía… va volando por
 * los mapas en función de qué brazo flexiona»; elegida la postura 1, el remo invertido en las paralelas, y estos mandos).
 *
 * Cuelgas boca arriba de las paralelas, inclinado como en la silla de un parapente, y vuelas sobre el mapa (el mismo vuelo
 * de la Travesía: `MapFlight`, que aquí recibe ya decidido lo que sube y la marcha). Lo que manda el cuerpo:
 *
 * - **Tirón con los dos brazos** (un remo): un impulso que da altura y marcha y que se va perdiendo. Para seguir en el aire
 *   hay que seguir remando; el explosivo, más.
 * - **Tirar más de un brazo** (el pecho y la cabeza se van hacia esa barra): viras hacia ese lado, más cuanto más te vas.
 * - **Aguantar arriba**: frenas (como tirando de los dos frenos) y te quedas casi en el sitio; al soltar, vuelve tu marcha.
 * - **Brazos estirados**: planeo de descanso, perdiendo altura despacio. Nunca te caes: el suelo y los tejados te sostienen.
 *
 * Lógica pura (sin IWSDK), con pruebas en `tests/unit/para.test.ts`.
 */
export const PARA = {
  /** El impulso de cada remo (y lo que suma de más el explosivo y el perfecto) y lo que tarda en perderse (s). */
  lift: 1,
  liftFast: 0.5,
  liftPerfect: 0.15,
  liftTau: 2.5,
  liftMax: 3,
  /** Lo que sube el impulso (× la subida de `MapFlight`) y lo que se pierde planeando (× su bajada: unos 1,8 m/s). */
  climbK: 0.45,
  sink: 0.04,
  /** La marcha: la de planeo (nunca menos), lo que suma cada remo, lo que se pierde por segundo y el tope. */
  gear0: 1,
  gearRep: 0.6,
  gearFast: 1,
  gearLoss: 0.08,
  gearMax: 8,
  /** Frenar: aguantando arriba (desde esta parte de la subida) más de `brakeAfter` s; la marcha que queda del todo frenado
   * y lo que tarda en entrar y en soltarse (s). */
  brakeFrom: 0.8,
  brakeAfter: 0.5,
  brakeLeft: 0.12,
  brakeIn: 0.6,
  brakeOut: 0.5,
  /** Virar: lo que no cuenta de irte a un lado (m), con cuánto viras del todo (m) y su suavizado (s). */
  sideDead: 0.03,
  sideFull: 0.14,
  sideTau: 0.15,
} as const;

/** Lo que se lee del cuerpo en cada fotograma. */
export interface ParaIn {
  /** ¿Se juega? (colgado y en la oleada: en el descanso, el parapente planea solo) */
  playing: boolean;
  /** Lo subido que llevas el pecho en este remo (0, brazos estirados; 1, en las barras). */
  up: number;
  /** Lo que se ha ido tu cabeza a un lado desde que te colgaste (m; +, a tu derecha). */
  side: number;
  /** ¿Acabas de completar un remo? ¿Explosivo? ¿Perfecto? */
  rep: boolean;
  fast: boolean;
  perfect: boolean;
}

const c01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export class ParaPilot {
  /** El impulso que queda (da altura), la marcha guardada y lo frenado que vas (0-1). */
  lift = 0;
  stored: number = PARA.gear0;
  brake = 0;
  /** Lo que sale hacia el vuelo: virar (−1 a 1; +, a la derecha), subir o bajar (−1 a 1) y la marcha. */
  steer = 0;
  climb = 0;
  gear: number = PARA.gear0;
  /** Los remos de esta oleada y de la ronda. */
  reps = 0;
  total = 0;
  /** ¿Acaba de entrar un impulso? (para que se note: vibración y golpe de aire) */
  kicked = false;
  private topT = 0;

  /** Otra ronda: de cero. */
  reset(): void {
    this.lift = this.brake = this.steer = this.climb = this.topT = 0;
    this.stored = this.gear = PARA.gear0;
    this.reps = this.total = 0;
    this.kicked = false;
  }

  /** Empieza una oleada: sus remos, de cero (el vuelo sigue como iba). */
  startWave(): void {
    this.reps = 0;
  }

  /** Un fotograma. */
  step(dt: number, I: ParaIn): void {
    this.kicked = false;
    if (dt <= 0) return;
    if (!I.playing) {
      // en el descanso planeas solo: recto, sin perder altura y a la marcha de planeo
      this.lift = this.brake = this.topT = 0;
      this.steer += (0 - this.steer) * (1 - Math.exp(-dt / PARA.sideTau));
      this.climb = 0;
      this.stored += (PARA.gear0 - this.stored) * (1 - Math.exp(-dt / 2));
      this.gear = this.stored;
      return;
    }
    // el remo: un impulso de altura y de marcha
    if (I.rep) {
      this.lift = Math.min(PARA.liftMax, this.lift + PARA.lift + (I.fast ? PARA.liftFast : 0) + (I.perfect ? PARA.liftPerfect : 0));
      this.stored = Math.min(PARA.gearMax, this.stored + (I.fast ? PARA.gearFast : PARA.gearRep));
      this.reps++;
      this.total++;
      this.kicked = true;
    }
    // el impulso se pierde; sin él, planeas perdiendo altura despacio
    this.lift *= Math.exp(-dt / PARA.liftTau);
    this.climb = Math.min(1, this.lift * PARA.climbK) - PARA.sink;
    // la marcha se va perdiendo hasta la de planeo
    this.stored = Math.max(PARA.gear0, this.stored - PARA.gearLoss * dt);
    // aguantar arriba frena (y al soltar vuelve la marcha que llevabas)
    this.topT = I.up >= PARA.brakeFrom ? this.topT + dt : 0;
    const want = this.topT > PARA.brakeAfter ? 1 : 0;
    this.brake += (want - this.brake) * (1 - Math.exp(-dt / (want ? PARA.brakeIn : PARA.brakeOut)));
    this.gear = this.stored * (1 - (1 - PARA.brakeLeft) * this.brake);
    // irte a un lado vira hacia ese lado, en proporción
    const a = Math.abs(I.side), s = Math.sign(I.side) * c01((a - PARA.sideDead) / (PARA.sideFull - PARA.sideDead));
    this.steer += (s - this.steer) * (1 - Math.exp(-dt / PARA.sideTau));
  }
}
