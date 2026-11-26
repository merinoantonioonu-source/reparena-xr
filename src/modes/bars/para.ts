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
  /** La inclinación del mapa («Parapente: inclinación del mapa», respecto al suelo): lo que tarda en ponerse (s); de pie (la
   * cabeza esto por encima de las paralelas, m) el mapa se pone derecho; y la mirada de colgado: su suavizado (s) y lo que
   * hay que llevar colgado para darla por buena (s). */
  tiltTau: 0.35,
  standUp: 0.2,
  gazeTau: 3,
  gazeMin: 2,
} as const;

/**
 * Lo que mira el jugador por encima del suelo, hacia sus pies (grados, de 0 a 90): `fy`, lo que sube su mirada; `fh`, lo que
 * avanza hacia los pies (las dos, de la dirección de la mirada). Mirando al techo o más atrás, 90; hacia el suelo, 0.
 */
export function gazeDeg(fy: number, fh: number): number {
  if (fy <= 0) return 0;
  if (fh <= 0) return 90;
  return (Math.atan2(fy, fh) * 180) / Math.PI;
}
/** La inclinación que se pone con «Ajustar a mi mirada»: la mirada, de 5 en 5 y entre 0 y 90. */
export const tiltOfGaze = (deg: number): number => Math.min(90, Math.max(0, Math.round(deg / 5) * 5));

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
  /** Lo que te sube una térmica (0: ninguna; `Thermals.lift`). */
  thermal?: number;
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
    // (dentro de una térmica subes sin remar)
    this.climb = Math.min(1, this.lift * PARA.climbK + (I.thermal ?? 0)) - PARA.sink;
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

/**
 * Las térmicas (segunda entrega: «aros o térmicas como retos»): columnas de aire que sube. Salen de vez en cuando por
 * delante y algo a un lado (hay que virar hacia ellas, tirando más de un brazo); dentro subes sin remar, y unos segundos
 * más al salir. Son un premio: no pasar por ellas no cuesta nada. En el mapa (x al oeste, z al norte; el rumbo, como
 * `MapFlight`: se avanza hacia (−sin, −cos)).
 */
export const THERMAL = {
  /** Su radio (m) y cuántas hay a la vez como mucho. */
  r: 80,
  max: 2,
  /** Cada cuánto sale una (s, entre estos dos), a cuánto por delante (m, × lo deprisa que va todo por la altura) y cuánto
   * a un lado como mucho (rad). */
  every: [12, 22],
  ahead: [450, 800],
  side: 0.45,
  /** Lo que duran sin usar (s) y a cuánto por detrás se dan por pasadas (m). */
  life: 70,
  behind: 250,
  /** Lo que suben (× la subida del vuelo), lo que sigue subiendo al salir (s) y los puntos al entrar. */
  lift: 0.55,
  hold: 3,
  pts: 40,
} as const;

export interface Thermal {
  x: number;
  z: number;
  on: boolean;
  t: number;
  used: boolean;
}

export class Thermals {
  readonly list: Thermal[] = [];
  /** Lo que te sube ahora (0 a `THERMAL.lift`, suave) y si acabas de entrar en una (para decirlo y puntuar). */
  lift = 0;
  entered = false;
  private next: number = THERMAL.every[0] * 0.5;
  private inT = 0;

  constructor() {
    for (let i = 0; i < THERMAL.max; i++) this.list.push({ x: 0, z: 0, on: false, t: 0, used: false });
  }

  reset(): void {
    for (const T of this.list) T.on = false;
    this.lift = this.inT = 0;
    this.entered = false;
    this.next = THERMAL.every[0] * 0.5;
  }

  /**
   * Un fotograma: dónde estás (x, z), el rumbo, lo deprisa que va todo por la altura (`scale`, 1 a ras de ciudad) y si se
   * juega (en el descanso no salen ni suben).
   */
  step(dt: number, x: number, z: number, heading: number, scale: number, playing: boolean, rnd: () => number): void {
    this.entered = false;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    let inside = false;
    for (const T of this.list) {
      if (!T.on) continue;
      T.t += dt;
      const dx = T.x - x, dz = T.z - z, r = THERMAL.r * scale;
      if (playing && dx * dx + dz * dz < r * r) {
        inside = true;
        if (!T.used) {
          T.used = true;
          this.entered = true;
        }
      } else if (T.t > THERMAL.life || dx * fx + dz * fz < -THERMAL.behind * scale || (T.used && T.t > 6 && dx * dx + dz * dz > r * r * 9)) T.on = false;
    }
    // dentro sube; al salir, unos segundos más
    this.inT = inside ? THERMAL.hold : Math.max(0, this.inT - dt);
    const want = playing && this.inT > 0 ? THERMAL.lift : 0;
    this.lift += (want - this.lift) * (1 - Math.exp(-dt / 0.6));
    // de vez en cuando, otra por delante y algo a un lado
    if (!playing) return;
    this.next -= dt;
    if (this.next > 0) return;
    const T = this.list.find((q) => !q.on);
    this.next = THERMAL.every[0] + (THERMAL.every[1] - THERMAL.every[0]) * rnd();
    if (!T) return;
    const a = heading + (rnd() * 2 - 1) * THERMAL.side, d = (THERMAL.ahead[0] + (THERMAL.ahead[1] - THERMAL.ahead[0]) * rnd()) * scale;
    T.x = x - Math.sin(a) * d;
    T.z = z - Math.cos(a) * d;
    T.on = true;
    T.used = false;
    T.t = 0;
  }
}
