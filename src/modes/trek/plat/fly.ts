/**
 * El vuelo de la Travesía (RepArena XR, pedido del usuario: «un modo de travesía que sea vuelo», en plancha; las formas A, B y
 * C de la propuesta): vuelas por encima del recorrido y lo manejas con el cuerpo, como un planeador.
 *
 * Afinado con docs/PLAN-VUELO.md (el usuario lo probó y no se entendían los controles): **la cabeza es la palanca**. El vuelo
 * va donde va tu cabeza, en proporción y sin memoria, respecto a un centro que no se mueve mientras vuelas (`FlyBody`: se toma
 * al calibrar y, posado en cada cofre, en plancha arriba):
 * - **A los lados** (escorarte): la **posición** de lado. Tanto te escoras, tanto te apartas; vuelves al centro y el vuelo
 *   vuelve (zona muerta de 1,5 cm; el recorrido entero, «Vuelo: recorrido de lado», que pone a tu gusto el asistente: fly-coach.ts).
 * - **Abajo** (bajar el pecho) y **atrás** (subir la cadera, la pica): la altura, según el mando de altura (`FlyModel`):
 *   - **P, posición** («el cuerpo es el avión»): tu altura sale de tu cabeza. Bajar el pecho baja el vuelo en proporción
 *     (la flexión entera, 3,5 m); la pica lo sube (hasta 3 m) y frena. En la dura, cada flexión sube el crucero y sin
 *     flexiones baja despacio.
 *   - **A, aleteo** («cada flexión, un aletazo»): cada flexión sube un poco (perfecta, más; explosiva, mucho); aguantar abajo
 *     es el picado, en proporción a lo hondo; la pica remonta y frena.
 *   De serie, P en la suave (el recorrido viene solo) y A en la dura (cada flexión te empuja): «Vuelo: mando de altura».
 *   **La pica manda sobre el picado** (en pica también baja la cabeza: no es picar).
 * - **De canto** (giro abierto): un giro, para pasar las grietas (lo juzga el corredor).
 * - **Con la tabla de equilibrio**: su inclinación (las muñecas) se suma a escorarse y echar el peso adelante, a bajar.
 *
 * Nunca te caes (como poco, `FLY.altMin`). Al acercarte al cofre del tramo bajas solo hasta posarte en él y luego despegas.
 * Lógica pura, sin IWSDK (se prueba en tests/unit/plat-fly.test.ts; la caja negra del vuelo, src/core/flybox.ts).
 */

/** Los números del vuelo (m, m/s y s; de partida: se afinan con la caja negra del vuelo del usuario). */
export const FLY = {
  /** La altura de vuelo: la de salida, la mínima y la máxima (sobre el sendero). */
  alt0: 6,
  altMin: 2,
  altMax: 11,
  /** Lo que te puedes apartar del centro (a cada lado). */
  uMax: 2.4,
  /** El lado: la zona muerta (m de cabeza), el recorrido de serie (m), la curva (exponente: más de 1, suave cerca del centro y
   * más fuerte hacia el borde; el usuario lo notaba hipersensible), la rapidez del muelle (rad/s: amortiguado justo, sin
   * rebote; arranca y se para suave, como un ala: antes iba a tirones de velocidad fija, «brusco y lineal», dijo el usuario) y
   * su tope de velocidad (m/s). */
  sideDead: 0.025,
  sideRange: 0.15,
  sideCurve: 1.9,
  // (con inercia, pedido del usuario: «el giro es una sacudida que se frena en seco»: un muelle más blando y algo menos
  // amortiguado —`uZ`: 1 sería sin rebote— que arranca suave, se pasa un pelo y se asienta, como un ala; y más fino cerca del
  // centro —`sideCurve`—: «un ligero movimiento lateral me aparta bruscamente de la hilera de frutas»)
  uW: 3,
  uZ: 0.8,
  uV: 2.6,
  /** Lo que se suaviza lo que lees de la cabeza antes del muelle (s): el vaivén de cada flexión movía la cabeza unos
   * centímetros y el vuelo daba sacudidas a los lados (vídeo del usuario: costaba alinearse con las frutas). */
  sideIn: 0.3,
  /** Rápido, rápido (pedido del usuario: para esquivar algo deprisa): cuanto más deprisa mueves la cabeza, menos se suaviza y
   * más deprisa responde el vuelo, como el filtro «1 €» (quieto, suave; deprisa, al momento). La velocidad de la cabeza
   * (m/s) a la que ya responde el doble y lo más que se aviva (veces). */
  // (con el triple, cada gesto era un latigazo: ahora, como mucho, un 60 % más vivo)
  fastV: 0.3,
  fastMax: 1.6,
  /** P: la zona muerta de bajar el pecho (m) y lo que baja la flexión entera (m de vuelo). */
  downDead: 0.02,
  downAlt: 3.5,
  /** La pica: desde cuánto atrás manda (m; y hasta cuánto sigue mandando, para no parpadear) y de dónde a dónde sube y frena
   * (m de cabeza → `pikeAlt` m de vuelo en P; en A, hasta `pikeV` m/s de subida). */
  pikeOn: 0.04,
  pikeOff: 0.025,
  pikeFrom: 0.06,
  pikeTo: 0.18,
  pikeAlt: 3,
  pikeV: 2.4,
  /** Lo que frena la pica entera (× la velocidad por segundo). */
  brake: 1.4,
  /** P, el crucero: en la dura, lo que sube cada flexión (m), su tope, su suelo, cuánto sin flexiones para bajar (s) y a cuánto
   * baja (m/s); en la suave, a cuánto vuelve a la altura de salida (m/s). La explosiva lo sube `burst` m (dos, el doble). */
  cruiseRep: 0.6,
  cruiseMax: 9,
  cruiseMin: 3,
  cruiseIdle: 2,
  cruiseSink: 0.3,
  cruiseBack: 0.3,
  burst: 1.2,
  /** P: el muelle de la altura (s) y sus topes de velocidad (m/s) y de aceleración (m/s²), por comodidad. */
  altTau: 0.35,
  altV: 2.5,
  altA: 6,
  /** A: el aletazo de cada flexión (m/s de subida: ×`tau` es lo que sube; 1,2 m), la perfecta (1,6 m), la explosiva (2,5 m) y
   * dos seguidas (3,6 m); sin aletear en la dura, lo que se pierde (m/s, pasados `idle` s); en la suave, la vuelta a la altura
   * de salida (m/s); y lo que tarda en apagarse la subida o la bajada (s). */
  flap: 2,
  flapPerfect: 2.67,
  flapBurst: 4.2,
  pair: 6,
  sink: 0.45,
  idle: 2,
  tau: 0.6,
  /** A: el techo de los aletazos de las flexiones (m: por encima de la altura de salida, cada uno sube menos y aquí ya nada; las
   * explosivas, hasta la máxima). */
  flapCeil: 9,
  /** El picado (en A, aguantar abajo; en los dos, para acelerar y para las alas): cuánto hay que aguantar quieto (s; quieto: la
   * cabeza, a menos de `holdV` m/s: lo de abajo de una flexión normal no llega) y su bajada en A (m/s, justo en el umbral y
   * abajo del todo). */
  diveHold: 0.35,
  holdV: 0.035,
  diveMin: 1,
  diveMax: 3.5,
  /** La corriente de aire (m/s de subida) y lo deprisa que se sube hasta la altura de salida al despegar (m/s). */
  lift: 3.2,
  takeoff: 1.6,
  /** La tabla: su zona muerta (la diferencia de altura de las muñecas / su separación: unos 2°) y lo que vale en m de escora. */
  tiltDead: 0.035,
  tilt: 0.4,
} as const;

/** El mando de altura: P (posición) o A (aleteo). */
export type FlyModel = 'mid' | 'pos' | 'flap';

/** El mando de altura del ajuste «Vuelo: mando de altura» (0: media flexión, elegido por el usuario; 1: P; 2: A). */
export function flyModel(setting: number, _auto: boolean): FlyModel {
  return setting === 1 ? 'pos' : setting === 2 ? 'flap' : 'mid';
}

/** El mando de media flexión (elegido por el usuario: «media flexión = recto»): la zona muerta alrededor de la mitad (× media
 * bajada) y lo deprisa que se sube y se baja del todo (m/s: con los brazos estirados y con el pecho abajo del todo). */
// (tau: lo que tarda en coger la velocidad de subir o bajar; con 0,3 s cada flexión daba un tirón de altura)
// (0,7 s y sin avivarse apenas con la cabeza: subir y bajar también eran bruscos; el vaivén de la flexión no da tirones)
export const MID = { dead: 0.15, up: 2.2, down: 3, tau: 0.7, fast: 1.3 } as const;

/** Lo que manda el cuerpo en este fotograma (de `FlyBody`, la marcha y las muñecas). */
export interface FlyIn {
  /** Lo que te escoras respecto al centro (m, + derecha; con la tabla, más su inclinación). */
  side: number;
  /** Lo que baja la cabeza bajo arriba de la plancha (m; con la tabla, también el peso adelante) y lo que va atrás (m: la pica). */
  down: number;
  back: number;
  /** Lo que baja una flexión entera («Bajada en la flexión», m) y, en A, desde cuánto se pica (m). */
  depth: number;
  lowNeed: number;
  /** El recorrido de lado entero y el de la pica (m de cabeza: hasta dónde atrás sube del todo). */
  range: number;
  backTo: number;
  /** Lo que sube cada aletazo (× lo de serie: «Vuelo: fuerza del aletazo») y, con media flexión, lo deprisa que se sube y se
   * baja (× lo de serie: «Vuelo: velocidad al subir y bajar»). */
  flapK: number;
  rateK: number;
  /** Este fotograma: una flexión hecha (1; 2, perfecta), una explosiva y dos seguidas. */
  rep: number;
  flap: boolean;
  pair: boolean;
  /** La forma suave (el recorrido viene solo) y cuánto hace de la última flexión que empujó (s). */
  auto: boolean;
  sinceRep: number;
  /** Dentro de una corriente de aire. */
  updraft: boolean;
  /** Posarse (de 0 a 1: al acercarte al cofre, la altura va a 0) y si estás ya sobre la zona de aterrizaje (ahí se puede bajar
   * por debajo de la altura mínima: aterrizas tú). */
  land: number;
  zone: boolean;
  /** El mando de altura. */
  model: FlyModel;
}

/** Un `FlyIn` vacío (para reservarlo una vez). */
export const flyIn = (): FlyIn => ({ side: 0, down: 0, back: 0, depth: 0.13, lowNeed: 0.078, range: FLY.sideRange, backTo: FLY.pikeTo, flapK: 1, rateK: 1, rep: 0, flap: false, pair: false, auto: true, sinceRep: 0, updraft: false, land: 0, zone: false, model: 'pos' });

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Lo que se aviva el vuelo con la cabeza moviéndose a `v` m/s: 1 quieta; el doble a `FLY.fastV`; como mucho `FLY.fastMax`. */
export function fastK(v: number): number {
  return Math.min(FLY.fastMax, 1 + Math.max(0, v) / FLY.fastV);
}

/** El lado que pide la cabeza (m de vuelo, + derecha): `side` m escorado con un recorrido entero de `range` m. */
export function sideTarget(side: number, range: number): number {
  const r = Math.max(FLY.sideDead + 0.02, range), n = clamp((Math.abs(side) - FLY.sideDead) / (r - FLY.sideDead), 0, 1);
  return Math.sign(side) * Math.pow(n, FLY.sideCurve) * FLY.uMax;
}

export class Glider {
  /** A tu derecha (m) y la altura (m sobre el sendero), con sus velocidades. */
  u = 0;
  alt: number = FLY.alt0;
  vU = 0;
  /** Lo que pide la cabeza de lado, suavizado (m), lo que pedía antes (m) y lo deprisa que se mueve (m/s, suavizado). */
  sideF = 0;
  private sideL = NaN;
  private sideV = 0;
  vAlt = 0;
  /** Lo que piden el cuerpo y el aire ahora: el lado y (en P) la altura (para las reglillas). */
  tgtU = 0;
  tgtAlt: number = FLY.alt0;
  /** P: la altura de crucero (la de los brazos estirados). */
  cruise: number = FLY.alt0;
  /** En picado (bajando y aguantado `diveHold` s: la marcha acelera), en pica (frenando: lo que frena, de 0 a 1) y cuánto lleva
   * la cabeza abajo (s). */
  diving = false;
  pike = false;
  brakeK = 0;
  private lowT = 0;
  private lastDown = NaN;
  private vDown = 0;
  /** Lo que se baja ahora (de 0 a 1 de la flexión entera; para las alas) y si este fotograma hubo un aletazo. */
  dip = 0;
  flapped = false;
  /** Despegando (al empezar y tras posarte en un cofre): sube solo hasta la altura de salida. */
  rising = false;

  get braking(): boolean {
    return this.brakeK > 0;
  }

  reset(alt: number = FLY.alt0): void {
    this.u = this.vU = this.vAlt = this.tgtU = this.sideF = this.sideV = 0;
    this.sideL = NaN;
    this.alt = alt;
    this.tgtAlt = this.cruise = FLY.alt0;
    this.diving = this.pike = this.flapped = false;
    this.brakeK = this.lowT = this.dip = this.vDown = 0;
    this.lastDown = NaN;
    this.rising = alt < FLY.alt0;
  }

  /** Un fotograma. */
  step(dt: number, I: FlyIn): void {
    if (dt <= 0) return;
    this.flapped = false;
    // el lado: la posición que pide la cabeza, con un muelle sin rebote y su tope de velocidad
    // (lo que pide la cabeza, suavizado: sin las sacudidas del vaivén de cada flexión; pero deprisa, deprisa)
    const sv = Number.isNaN(this.sideL) ? 0 : (I.side - this.sideL) / dt;
    this.sideL = I.side;
    // (sube enseguida y baja despacio: el empujón dura todo el gesto, no solo mientras la cabeza se mueve)
    this.sideV += (Math.abs(sv) - this.sideV) * Math.min(1, dt / (Math.abs(sv) > this.sideV ? 0.05 : 0.5));
    const fast = fastK(this.sideV);
    this.sideF += (I.side - this.sideF) * Math.min(1, (dt * fast) / FLY.sideIn);
    this.tgtU = sideTarget(this.sideF, I.range);
    // (un muelle amortiguado justo, en pasos cortos para que no dependa de las imágenes por segundo)
    const w = FLY.uW * fast, vMax = FLY.uV * fast;
    for (let n = Math.ceil(dt / 0.01), h = dt / n; n > 0; n--) {
      this.vU = clamp(this.vU + (w * w * (this.tgtU - this.u) - 2 * FLY.uZ * w * this.vU) * h, -vMax, vMax);
      this.u = clamp(this.u + this.vU * h, -FLY.uMax, FLY.uMax);
    }
    // la pica (la cabeza atrás) manda sobre el picado, con su margen para no parpadear entre los dos
    if (this.pike) this.pike = I.back >= FLY.pikeOff;
    else this.pike = I.back >= FLY.pikeOn;
    const b = this.pike ? clamp((I.back - FLY.pikeFrom) / Math.max(0.03, I.backTo - FLY.pikeFrom), 0, 1) : 0;
    const depth = Math.max(0.04, I.depth);
    this.dip = this.pike ? 0 : clamp((I.down - FLY.downDead) / (depth - FLY.downDead), 0, 1);
    // el picado: abajo y aguantando quieto (la velocidad de la cabeza, suavizada); ya picando, sigue mientras estés abajo
    const v = Number.isNaN(this.lastDown) ? 0 : (I.down - this.lastDown) / dt;
    this.lastDown = I.down;
    this.vDown += (v - this.vDown) * Math.min(1, dt / 0.1);
    const low = !this.pike && I.down >= I.lowNeed;
    if (!low) this.lowT = 0;
    else if (Math.abs(this.vDown) < FLY.holdV) this.lowT += dt;
    else if (this.lowT <= FLY.diveHold && Math.abs(this.vDown) > 2 * FLY.holdV) this.lowT = 0;
    if (I.land > 0) {
      // posarse: cada vez más cerca del suelo, hasta el cofre (luego, a despegar otra vez)
      this.alt += (0 - this.alt) * Math.min(1, I.land * dt * 3);
      if (I.land >= 1) this.alt = 0;
      this.u += (0 - this.u) * Math.min(1, I.land * dt * 3);
      this.vAlt = this.vU = 0;
      this.tgtAlt = this.alt;
      this.cruise = FLY.alt0;
      this.diving = false;
      this.brakeK = 0;
      this.rising = true;
      return;
    }
    this.brakeK = b;
    this.diving = this.lowT > FLY.diveHold;
    if (I.model === 'mid') this.stepMid(dt, I);
    else if (I.model === 'pos') this.stepPos(dt, I, b);
    else this.stepFlap(dt, I, b);
    if (this.alt < FLY.altMin && !I.zone) {
      // (por debajo de lo mínimo —al despegar del cofre—: subes suave hasta ella; nunca te caes)
      this.vAlt = Math.max(this.vAlt, FLY.takeoff);
      if (this.alt < 0) this.alt = 0;
    } else if (this.alt > FLY.altMax) {
      this.alt = FLY.altMax;
      this.vAlt = Math.min(0, this.vAlt);
    }
  }

  /** Media flexión: aguantar a media bajada, recto; más arriba (los brazos estirados), subes; más abajo, bajas; más deprisa
   * cuanto más lejos de la mitad. La pica frena (lo pone `brakeK`); la explosiva, un empujón hacia arriba. */
  private stepMid(dt: number, I: FlyIn): void {
    // (al despegar —al empezar y tras posarte en un cofre— sube solo hasta la altura de vuelo; luego mandas tú)
    if (this.rising) {
      if (this.alt >= FLY.alt0) {
        this.alt = FLY.alt0;
        this.vAlt = 0;
        this.rising = false;
      } else {
        this.vAlt = Math.max(this.vAlt, FLY.takeoff);
        this.alt += this.vAlt * dt;
        this.tgtAlt = FLY.alt0;
        this.diving = false;
        return;
      }
    }
    const half = Math.max(0.02, I.depth / 2);
    // (+1 arriba del todo, 0 en la mitad, −1 abajo del todo; en la pica no se sube ni se baja: la cabeza va atrás, no arriba)
    let e = this.pike ? 0 : clamp((half - I.down) / half, -1, 1);
    e = Math.abs(e) < MID.dead ? 0 : Math.sign(e) * (Math.abs(e) - MID.dead) / (1 - MID.dead);
    this.dip = e < 0 ? -e : 0;
    this.diving = e < -0.3;
    let want = (e > 0 ? MID.up : MID.down) * e * I.rateK;
    if (I.updraft) want += FLY.lift;
    if (I.flap) {
      this.vAlt = Math.max(this.vAlt, (I.pair ? FLY.pair : FLY.flapBurst) * I.flapK);
      this.flapped = true;
    }
    if (I.rep) this.flapped = true;
    // (bajar o subir la cabeza deprisa, el vuelo responde deprisa: como de lado)
    this.vAlt += (want - this.vAlt) * Math.min(1, (dt * Math.min(MID.fast, fastK(Math.abs(this.vDown)))) / MID.tau);
    this.alt += this.vAlt * dt;
    if (this.alt > FLY.altMax) this.vAlt = Math.min(0, this.vAlt);
    // (para la reglilla: dónde estarás en un segundo y medio si sigues así)
    this.tgtAlt = clamp(this.alt + this.vAlt * 1.5, FLY.altMin, FLY.altMax);
  }

  /** P: la altura sale de la cabeza (el crucero, menos lo que bajas el pecho, más la pica). */
  private stepPos(dt: number, I: FlyIn, b: number): void {
    this.rising = false; // (el muelle ya te sube al crucero)
    if (I.auto) {
      const d = FLY.alt0 - this.cruise, m = FLY.cruiseBack * dt;
      this.cruise += clamp(d, -m, m);
    } else {
      if (I.rep) this.cruise = Math.min(FLY.cruiseMax, this.cruise + FLY.cruiseRep * I.flapK);
      if (I.sinceRep > FLY.cruiseIdle) this.cruise = Math.max(FLY.cruiseMin, this.cruise - FLY.cruiseSink * dt);
    }
    if (I.flap) {
      this.cruise = Math.min(FLY.cruiseMax, this.cruise + (I.pair ? 2 : 1) * FLY.burst * I.flapK);
      this.flapped = true;
    }
    if (I.rep) this.flapped = true;
    if (I.updraft) this.cruise = Math.min(FLY.altMax - 1, this.cruise + FLY.lift * dt);
    this.tgtAlt = clamp(this.cruise - FLY.downAlt * this.dip + FLY.pikeAlt * b, FLY.altMin, FLY.altMax);
    const wantV = clamp((this.tgtAlt - this.alt) / FLY.altTau, -FLY.altV, FLY.altV);
    this.vAlt += clamp(wantV - this.vAlt, -FLY.altA * dt, FLY.altA * dt);
    this.alt += this.vAlt * dt;
  }

  /** A: cada flexión, un aletazo; aguantar abajo, el picado en proporción; la pica remonta. */
  private stepFlap(dt: number, I: FlyIn, b: number): void {
    // (por encima de la altura de salida, cada aletazo sube menos: las flexiones a buen ritmo te mantienen, no te suben sin fin)
    const over = (top: number): number => (this.alt <= FLY.alt0 ? 1 : clamp(1 - (this.alt - FLY.alt0) / (top - FLY.alt0), 0, 1));
    if (I.rep) {
      this.vAlt = Math.max(this.vAlt, (I.rep > 1 ? FLY.flapPerfect : FLY.flap) * I.flapK * over(FLY.flapCeil));
      this.flapped = true;
    }
    if (I.flap) {
      this.vAlt = Math.max(this.vAlt, (I.pair ? FLY.pair : FLY.flapBurst) * I.flapK * over(FLY.altMax));
      this.flapped = true;
    }
    const k = clamp((I.down - I.lowNeed) / Math.max(0.01, I.depth - I.lowNeed), 0, 1);
    let want = 0;
    if (this.diving) want = -(FLY.diveMin + (FLY.diveMax - FLY.diveMin) * k);
    else if (this.pike) want = 0.5 + (FLY.pikeV - 0.5) * b;
    else if (I.updraft) want = FLY.lift;
    else if (!I.auto && I.sinceRep > FLY.idle) want = -FLY.sink;
    else if (I.auto && !this.rising && Math.abs(this.alt - FLY.alt0) > 0.05) want = Math.sign(FLY.alt0 - this.alt) * FLY.cruiseBack;
    // (lo que ya subía o bajaba se va apagando hacia lo que piden el cuerpo y el aire)
    this.vAlt += (want - this.vAlt) * Math.min(1, dt / FLY.tau);
    if (this.rising) {
      // (al llegar a la altura de salida, se queda ahí: sin pasarse)
      if (this.alt >= FLY.alt0) {
        this.alt = FLY.alt0;
        this.vAlt = 0;
        this.rising = false;
      } else if (this.diving || this.flapped) this.rising = false;
      else this.vAlt = Math.max(this.vAlt, FLY.takeoff);
    }
    this.alt += this.vAlt * dt;
    this.tgtAlt = this.alt;
  }
}

/**
 * El cuerpo en el vuelo: lo que te escoras, bajas y vas atrás **respecto a un centro que no se mueve en el aire** (con el
 * centro que sigue a la cabeza, escorado y quieto la lectura se iba a cero y, al volver, el juego leía que te habías ido al
 * otro lado: PLAN-VUELO, causa 2). Los lados se miden en perpendicular a hacia donde mira el cuerpo al tomar el centro (si te
 * pones en plancha algo girado, escorarte no se mezcla con ir adelante o atrás).
 */
export class FlyBody {
  x0 = 0;
  z0 = 0;
  /** Hacia dónde mira el cuerpo (en horizontal, de largo 1; −z de serie). */
  fx = 0;
  fz = -1;
  side = 0;
  fwd = 0;

  /** Toma el centro donde está la cabeza (y, si se sabe, hacia dónde mira el cuerpo: `yaw`, 0 hacia −z, + a la derecha). */
  set(x: number, z: number, yaw?: number): void {
    this.x0 = x;
    this.z0 = z;
    if (yaw !== undefined && Number.isFinite(yaw)) {
      this.fx = Math.sin(yaw);
      this.fz = -Math.cos(yaw);
    }
  }

  /** Posado (en plancha arriba, ante el cofre): el centro se acerca a la cabeza (en `tau` s). */
  follow(x: number, z: number, dt: number, tau: number): void {
    const k = Math.min(1, dt / tau);
    this.x0 += (x - this.x0) * k;
    this.z0 += (z - this.z0) * k;
  }

  /** Lee la cabeza: `side` (+ derecha) y `fwd` (+ adelante), en m. */
  read(x: number, z: number): void {
    const dx = x - this.x0, dz = z - this.z0;
    this.side = dx * -this.fz + dz * this.fx;
    this.fwd = dx * this.fx + dz * this.fz;
  }
}

/** La inclinación de la tabla de lado, de las muñecas (la derecha más baja: a la derecha, +): 0 si no se ven las dos. */
export function boardTilt(l: { ok: boolean; x: number; y: number }, r: { ok: boolean; x: number; y: number }): number {
  if (!l.ok || !r.ok) return 0;
  const w = Math.abs(r.x - l.x);
  if (w < 0.15) return 0; // (las manos juntas: no se sabe hacia dónde)
  return (l.y - r.y) / w;
}

/** Lo que suma la tabla a escorarse (m): sin su zona muerta (unos 2°) y por su peso. */
export function boardSide(tilt: number): number {
  const a = Math.abs(tilt) - FLY.tiltDead;
  return a > 0 ? Math.sign(tilt) * a * FLY.tilt : 0;
}

/**
 * La línea de las manos (propuesta del usuario: «las gafas detectan las manos que están en el suelo»): la cabeza por delante
 * de la línea que une las manos acelera y por detrás frena (la pica también echa la cabeza atrás).
 *
 * Lo que se lee es **cuánto te has echado adelante o atrás respecto a como sueles estar** (caja negra del usuario: con una
 * referencia tomada una vez, al calibrar o al volver a poner el centro, bastaba con recolocarse un palmo para que el juego
 * leyera «atrás» —la pica, frenando del todo— durante minutos): la referencia sigue despacio a donde estás (`adapt` s), así
 * que recolocarte se olvida solo y un gesto (un impulso adelante, echarte atrás para frenar) se lee siempre.
 * Con las dos manos apoyadas y a la vista se mide hasta su línea (no cambia si te recolocas con ellas); si no, respecto al
 * centro del vuelo.
 * `floor`: lo más alto que se ve una muñeca apoyada (m); `wMin`/`wMax`: lo separadas que están (m); `stable`: lo que tienen que
 * verse antes de contar (s); `tau`: el suavizado (s: la flexión mueve la cabeza adelante y atrás); `adapt`: lo que tarda la
 * referencia en seguirte (s); `dead` y `span`: desde cuánto por delante se acelera y cuánto más hace falta para el todo (m);
 * `kick` y `kickV`: el impulso (m por delante y m/s hacia delante: un gesto brusco); `boost`: lo que se pasa de la máxima con
 * el todo y `acc`: lo deprisa que se gana (de la máxima por segundo).
 */
export const HL = { floor: 0.5, wMin: 0.18, wMax: 1, stable: 0.2, tau: 0.2, adapt: 8, dead: 0.05, span: 0.1, kick: 0.05, kickV: 0.12, boost: 0.5, acc: 0.6 } as const;

type Wrist = { ok: boolean; x: number; y: number; z: number };

export class HandLine {
  /** Lo que te has echado adelante (+) o atrás (−) respecto a como sueles estar (m, suavizado), lo deprisa que va (m/s) y si
   * este fotograma has dado un impulso hacia delante (un gesto brusco, pasada la zona muerta: uno por gesto). */
  lean = 0;
  vel = 0;
  kick = false;
  /** Si se mide con las manos (su línea) o con el centro del vuelo. */
  hands = false;
  private base = NaN;
  private armed = true;
  private t = 0;

  /** Otra vez de cero (al calibrar). */
  reset(): void {
    this.base = NaN;
    this.lean = this.vel = 0;
    this.kick = this.hands = false;
    this.armed = true;
    this.t = 0;
  }

  /** Lo que acelera (0 a 1): echado adelante, pasada la zona muerta. */
  get push(): number {
    return Math.max(0, Math.min(1, (this.lean - HL.dead) / HL.span));
  }

  /**
   * Un fotograma: la cabeza, las muñecas, hacia dónde mira el cuerpo (fx, fz) y lo que va la cabeza adelante respecto al
   * centro del vuelo (`fwd`, m: lo que se usa sin manos).
   */
  step(dt: number, hx: number, hz: number, l: Wrist, r: Wrist, fx: number, fz: number, fwd: number): void {
    this.kick = false;
    if (dt <= 0) return;
    const w = Math.hypot(r.x - l.x, r.z - l.z);
    const on = l.ok && r.ok && l.y < HL.floor && r.y < HL.floor && w > HL.wMin && w < HL.wMax;
    this.t = on ? this.t + dt : 0;
    const hands = this.t >= HL.stable;
    let d = fwd;
    if (hands) {
      // la distancia de la cabeza a la línea, hacia delante (la normal de la línea que mira adonde mira el cuerpo)
      let nx = -(r.z - l.z) / w, nz = (r.x - l.x) / w;
      if (nx * fx + nz * fz < 0) {
        nx = -nx;
        nz = -nz;
      }
      d = (hx - (l.x + r.x) / 2) * nx + (hz - (l.z + r.z) / 2) * nz;
    }
    // (al cambiar de medida —se ven o se dejan de ver las manos—, la lectura sigue donde estaba: sin saltos)
    if (Number.isNaN(this.base)) this.base = d;
    else if (hands !== this.hands) this.base = d - this.lean;
    this.hands = hands;
    const raw = d - this.base;
    this.base += raw * (1 - Math.exp(-dt / HL.adapt));
    const was = this.lean;
    this.lean += (raw - this.lean) * (1 - Math.exp(-dt / HL.tau));
    this.vel += ((this.lean - was) / dt - this.vel) * Math.min(1, dt / 0.08);
    // el impulso: un gesto brusco hacia delante, uno por gesto (hay que volver para dar otro)
    if (this.armed && this.lean > HL.kick && this.vel > HL.kickV) {
      this.kick = true;
      this.armed = false;
    } else if (this.lean < HL.kick / 2) this.armed = true;
  }
}
