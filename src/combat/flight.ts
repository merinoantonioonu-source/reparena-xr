/**
 * El vuelo de los voladores con modelo (abeja, murciélago, Cthulhu y el dragón), tal cual en RepArena (src/70_game.js:
 * FLYER_KIND, FLAP_HZ, Flyer, gateKeep y frontKeep): salen por el hueco de una compuerta, se acercan volando hacia ti con
 * un vuelo errático (bandazos al azar y un vaivén suave), se quedan cerca de tu cara y, cuando les toca, se echan atrás y
 * se lanzan a morderte; luego se alejan y vuelven. Un disparo los empuja hacia atrás (y, si estaban cogiendo impulso, se
 * lo quita). Sin IWSDK: se compara con el código de RepArena en tests/compare/flight.compare.test.ts.
 *
 * Tumbado (superman, plancha lateral) vienen bajos, a la altura de la cabeza; en el superman, además, esperan a la vista y
 * solo pican después de dar tiempo a una repetición entera y nunca mientras aguantas arriba (RepArena: lowFly, SUP_ATK).
 * En la batalla diminuta (flexiones, plancha con un brazo) son pequeños (0,42), lentos (0,27) y salen de una trampilla
 * (RepArena: isTiny, push).
 * Boca arriba en el press de pecho (RepArena XR, pedido del usuario: tumbado no se ven las compuertas) **bajan del cielo**:
 * salen muy alto, casi encima de ti (`skySpawn`), bajan despacio, cada vez más lentos, hasta quedarse sobre tu cara, a 2-3 m
 * (`Flight.toSky`), y desde ahí, pasado un momento, se lanzan a morderte; tras morder, o empujados por un disparo, vuelven a
 * subir. Nunca bajan por el lado de los pies, donde van el marcador y los avisos (no tapan su camino).
 */
import { Vector3 } from 'three';

export interface FlyerKind {
  /** Su modelo (FOE_DEF) y su voz. */
  beast: string;
  /** Lo rápido que vuela (respecto a «Velocidad de vuelo»), lo errático que es y su tamaño. */
  speed: number;
  erratic: number;
  scale: number;
  /** El jefe de los voladores (el dragón): solo sale de jefe. */
  boss?: boolean;
}

/** Los monstruitos que vuelan (RepArena: FLYER_KIND, con sus mismos números). */
export const FLYER_KIND: Record<string, FlyerKind> = {
  bee: { beast: 'bee', speed: 1.35, erratic: 1.4, scale: 1.0 },
  bat: { beast: 'bat', speed: 1.5, erratic: 1.9, scale: 1.0 },
  cthulhu: { beast: 'cthulhu', speed: 0.85, erratic: 0.7, scale: 1.1 },
  dragon: { beast: 'dragon', speed: 0.5, erratic: 0.35, scale: 2.0, boss: true },
};
/** Aleteos por segundo de cada uno (las abejas, casi zumbando; el dragón, más pausado pero sin desmayo). */
export const FLAP_HZ: Record<string, number> = { bee: 4.5, bat: 3.4, cthulhu: 2.6, dragon: 1.8 };

/** Una compuerta, para salir por su hueco: dónde está, hacia dónde mira y su tamaño. */
export interface FlyGate {
  x: number;
  z: number;
  ry: number;
  scale: number;
}

export interface FlyEnv {
  /** Tus ojos. */
  head: Vector3;
  /** Partida en juego (o en la pausa de entre oleadas: active). Solo en juego se lanzan a morder. */
  play: boolean;
  active: boolean;
  /** Con ritmo marcado, ¿es el pulso? (sin ritmo, siempre) */
  beat: boolean;
  /** Tumbado: la altura a la que vienen (0: de pie, a tu cara). */
  low: number;
  /** El superman: lo que aguantas arriba (s), si estás arriba ahora, el tiempo de la ronda y cuándo puede lanzarse el
   * siguiente (lo comparten todos: nunca dos seguidos); con el «aguante que protege» (`rest`), lo que llevas tumbado sin
   * subir y el descanso que se te da. null: no es el superman. */
  sup: { hold: number; up: boolean; time: number; next: { t: number }; rest?: number; restMax?: number } | null;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const FRONT_MIN = 0.3;
/** Lo que se frena un empujón (RepArena: SHOVE_K). */
export const SHOVE_K = 7;

/**
 * El vuelo suave (pedido del usuario: los voladores se paraban y, de golpe, hacían una diagonal rapidísima hacia un lado y
 * se perdían de vista). En vez de saltar cada pocos segundos a un punto al azar (RepArena: dartT), el desvío sigue un
 * objetivo que se mueve sin parar (vaivenes de frecuencias que no casan) con un muelle amortiguado, con la velocidad y la
 * aceleración limitadas; y, visto desde tu cabeza, nunca gira más deprisa que `TURN_MAX` (salvo al lanzarse a morder, al
 * huir y al recibir un golpe). Lo errático sigue mandando: lo lejos que se desvía y lo vivo que es.
 */
const TURN_MAX = 0.7; // rad/s (40°/s)
const WANDER_V = 1.6, WANDER_A = 3; // m/s y m/s², con «Vuelo errático» al 100 %
const WANDER_K = 2.2; // el muelle (1/s²): critico, sin rebotes
/** Lo más que se aparta del frente, a un lado (respecto a lo lejos que está de ti): ±35°. */
const SIDE_MAX = 0.4; // (con el vaivén y lo que se acerca, no pasa de unos 35°)

/** Bajando del cielo (el press de pecho): de dónde salen (lo alto sobre tus ojos, m, y lo que se apartan de la vertical,
 * rad: hacia lo alto de tu cabeza, hasta `tilt[1]`; hacia los pies y los lados, solo `tiltLow`, que allí van la bola, los
 * avisos y el marcador), dónde esperan (sobre tu cara, m), lo que esperan antes de lanzarse (s), lo que se frenan al llegar
 * (m: a menos de eso, cada vez más despacio), su paso (respecto al de siempre) y lo más bajo que vuelan sobre tus ojos (m). */
export const SKY = { hi: [13, 17] as [number, number], tilt: [0.08, 0.45] as [number, number], tiltLow: 0.2, hover: [2.1, 2.8] as [number, number], hoverX: 0.6, hoverZ: [-0.3, 0.35] as [number, number], wait: 1.6, brake: 5, speed: 0.75, floor: 0.55 };

/** De dónde sale uno que baja del cielo (start) y dónde se queda esperando (hover), sobre tu cabeza (head, con los pies
 * hacia −Z). */
export function skySpawn(head: Vector3, rnd: () => number, start: Vector3, hover: Vector3): void {
  const r = (a: number, b: number): number => a + rnd() * (b - a);
  const az = r(0, TAU), tilt = r(SKY.tilt[0], Math.cos(az) > 0.5 ? SKY.tilt[1] : SKY.tiltLow), h = r(SKY.hi[0], SKY.hi[1]);
  const off = h * Math.tan(tilt);
  start.set(head.x + off * Math.sin(az), head.y + h, head.z + off * Math.cos(az));
  hover.set(head.x + r(-SKY.hoverX, SKY.hoverX), head.y + r(SKY.hover[0], SKY.hover[1]), head.z + r(SKY.hoverZ[0], SKY.hoverZ[1]));
}

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3(), _e = new Vector3(), _f = new Vector3();

/** Un volador en vuelo (RepArena: Flyer, sin su modelo: eso lo pone el sistema). */
export class Flight {
  readonly K: FlyerKind;
  readonly base: Vector3;
  readonly pos: Vector3;
  readonly last: Vector3;
  readonly dart = new Vector3();
  readonly dartT: Vector3;
  /** El vuelo de RepArena tal cual (a saltos): solo para compararlo (tests/compare/flight.compare.test.ts). */
  classic = false;
  /** El vuelo suave: la velocidad del desvío y lo que se invierte tras un golpe (−1: se va hacia el otro lado). */
  private readonly dartV = new Vector3();
  private flip = 1;
  /** «Vuelo errático» (1 = 100 %). */
  private readonly errSet: number;
  nextDart = 1.2;
  speed: number;
  erratic: number;
  w1: number;
  w2: number;
  ph1: number;
  ph2: number;
  t = 0;
  retreat = 0;
  radius: number;
  bank = 0;
  windT = 0;
  /** Lo que huye de más tras parar su mordisco (lo pone la guardia: PR 9). */
  parryT = 0;
  hp: number;
  readonly pushV = new Vector3();
  /** Lo que lleva esperando cerca de ti (el superman). */
  waitT = 0;
  gateOut = false;
  /** Bajando del cielo (el press de pecho): dónde espera, respecto a tu cabeza (null: el vuelo de siempre). */
  sky: Vector3 | null = null;
  /** Lo que ha pasado en el último paso: empieza a lanzarse (su voz), se lanza (el silbido) y te muerde. */
  evRoar = false;
  evWhoosh = false;
  evBite = false;

  /** kind: bee, bat…; gate: la compuerta por la que sale (ya elegida); flySpeed: «Velocidad de vuelo» (km/h, con la
   * dificultad creciente); erratic: «Vuelo errático» (%). Devuelve también cuánto tiene que estar abierta la compuerta. */
  /** En la batalla diminuta: sale de una trampilla (gate es la trampilla), pequeño y lento. */
  readonly tiny: boolean;

  constructor(kind: string, readonly gate: FlyGate, flySpeed: number, erratic: number, hp: number, private rnd: () => number = Math.random, low = false, tiny = false) {
    const K = (this.K = FLYER_KIND[kind]);
    this.tiny = tiny;
    const sp = (flySpeed / 3.6) * (tiny ? 0.27 : 1), r = gate.ry;
    const start = tiny ? new Vector3(gate.x, 0.05, gate.z) : new Vector3(gate.x - 0.6 * Math.sin(r), (low ? 0.6 : 1.5) * gate.scale, gate.z - 0.6 * Math.cos(r));
    this.base = start.clone();
    this.pos = start.clone();
    this.last = start.clone();
    this.dartT = new Vector3(0, tiny ? 0.25 : this.rand(1.8, 3.6), 0);
    this.speed = sp * K.speed * this.rand(0.85, 1.15);
    this.erratic = (K.erratic * erratic) / 100;
    this.w1 = this.rand(0.6, 1.6);
    this.w2 = this.rand(0.8, 1.8);
    this.ph1 = this.rand(0, TAU);
    this.ph2 = this.rand(0, TAU);
    this.radius = 0.24 * K.scale * (tiny ? 0.42 : 1);
    this.hp = hp;
    this.errSet = Math.max(0, erratic / 100);
  }

  /** Que baje del cielo (el press de pecho): sale de start y espera en hover (los dos, en el mundo; head: tus ojos). */
  toSky(start: Vector3, hover: Vector3, head: Vector3): this {
    this.sky = new Vector3().subVectors(hover, head);
    this.base.copy(start);
    this.pos.copy(start);
    this.last.copy(start);
    this.gateOut = true;
    return this;
  }

  /** Lo que tarda la compuerta en dejarle salir (RepArena: openT). */
  static gateTime(kind: string, flySpeed: number): number {
    return Math.min(10, 1.2 + 1.2 / Math.max(0.05, (flySpeed / 3.6) * FLYER_KIND[kind].speed));
  }

  private rand(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }

  /** Un paso del vuelo (RepArena: Flyer.update, de pie y a tamaño normal). */
  step(dt: number, env: FlyEnv): void {
    this.evRoar = this.evWhoosh = this.evBite = false;
    this.t += dt;
    if (this.sky) {
      this.skyStep(dt, env);
      return;
    }
    const HL = env.head;
    const low = env.low > 0, push = this.tiny;
    if (env.active) {
      const tgt = _a.set(HL.x * 0.6, low ? env.low : Math.max(push ? 0.2 : 1.0, HL.y - (push ? 0.05 : 0.12)), HL.z * 0.6);
      const S = env.sup, to = _b.subVectors(tgt, this.base), d = to.length(), reach = push ? 0.32 : S ? (this.classic ? 1.4 : 2.0) : 0.85; // (el superman, en RepArena XR: a 1-1,5 m de las manos, en la mirada baja)
      if (d > reach || this.retreat > 0) this.waitT = 0;
      else this.waitT += dt;
      if (this.retreat > 0) {
        this.retreat -= dt;
        this.base.addScaledVector(to.normalize(), -this.speed * 1.6 * dt);
      } else if (d > reach) this.base.addScaledVector(to.normalize(), Math.min(this.classic ? d : d - reach + 0.005, this.speed * dt)); // (el suave se para justo al llegar: sin tirones en el borde)
      else if (S && !this.windT && (S.rest !== undefined ? S.up || S.rest < (S.restMax ?? 5) || S.time < S.next.t : this.waitT < S.hold + 3 || S.up || S.time < S.next.t)) {
        /* (en el superman, esperando: a la vista, sin picar mientras aguantas arriba; con el aguante que protege, solo
           pican si llevas tumbado más del descanso sin subir) */
      } else if (env.play && !this.windT) {
        this.windT = 1e-3; // (se echa atrás antes de lanzarse: te da un momento para dispararle), con su voz
        this.evRoar = true;
      }
      if (!this.classic && !push && d <= reach && this.retreat <= 0 && !this.windT) {
        // (el vuelo suave: ya cerca, se va poniendo despacio delante de ti, donde se le ve sin girar la cabeza)
        const k = Math.min(1, dt * 0.35);
        this.base.x += (tgt.x - this.base.x) * k;
        this.base.z += (tgt.z - reach - this.base.z) * k;
      }
      if (S && this.windT === 1e-3) S.next.t = S.time + S.hold + 3.5; // (y el siguiente, otra repetición después)
      if (this.windT > 0 && !env.play) this.windT = 0;
      if (this.windT > 0 && S && S.rest !== undefined && S.up) {
        // (con el aguante que protege, subir el tronco a tiempo lo para: rebota hacia atrás, como parado por la guardia)
        this.windT = 0;
        this.retreat = 1.2;
      }
      if (this.windT > 0) {
        // carga 0,45 s echándose atrás, se lanza 0,25 s y muerde
        const was = this.windT;
        this.windT += dt;
        if (was < 0.45 && this.windT >= 0.45) this.evWhoosh = true;
        if (this.windT >= 0.7) {
          this.evBite = true;
          this.retreat = 2.5 + this.parryT; // (parado, huye más lejos)
          this.parryT = 0;
          this.windT = 0;
        }
      }
      if (!this.classic) this.wander(dt, d, push, low, HL);
      else if (this.t > this.nextDart && !this.windT && env.beat) {
        const A = clamp(d * (push ? 0.25 : 0.2), push ? 0.06 : 0.4, push ? 0.35 : 2.4) * this.erratic;
        this.dartT.set(this.rand(-1, 1) * A, this.rand(-0.4, 0.6) * A * (low ? 0.2 : 0.7), this.rand(-0.5, 0.5) * A * 0.4);
        this.nextDart = this.t + this.rand(0.8, 3.0) / Math.sqrt(Math.max(0.2, this.erratic));
      }
    }
    if (this.pushV.lengthSq() > 1e-6) {
      // empujado
      this.base.addScaledVector(this.pushV, dt);
      this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K));
    }
    if (this.classic) this.dart.lerp(this.dartT, 1 - Math.exp(-dt * 2.2 * Math.max(0.3, this.erratic)));
    const dir = _b.set(-this.base.x, 0, -this.base.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const right = _c.set(dir.z, 0, -dir.x), wob = this.classic ? (push ? 0.04 : 0.25) * this.erratic : 0; // (el suave ya se mece con su desvío)
    this.last.copy(this.pos);
    this.pos.copy(this.base).addScaledVector(right, this.dart.x + Math.sin(this.t * this.w1 + this.ph1) * wob).addScaledVector(dir, this.dart.z);
    this.pos.y += this.dart.y + Math.sin(this.t * this.w2 * 1.7 + this.ph2) * wob * 0.6;
    this.pos.y = Math.max(push ? 0.06 : low ? 0.2 : 0.45, this.pos.y);
    if (low) this.pos.y = Math.min(this.pos.y, 1.0);
    if (this.windT > 0) {
      // echarse atrás y lanzarse hacia tu cara
      const to = _a.subVectors(HL, this.pos), d = to.length(), w = this.windT, s = push ? 0.42 : 1;
      const k = w < 0.45 ? -0.1 * s * smooth(w / 0.45) : -0.1 * s + (Math.max(0, d - 0.12 * s) + 0.1 * s) * smooth(Math.min(1, (w - 0.45) / 0.25));
      if (d > 1e-3) this.pos.addScaledVector(to, k / d);
    }
    // (el vuelo suave: visto desde ti, nunca gira más deprisa que TURN_MAX mientras va a su aire)
    if (!this.classic && !this.windT && this.retreat <= 0 && this.pushV.lengthSq() < 0.01 && this.t > dt * 1.5) this.turnCap(HL, dt);
    if (!push) this.gateKeep();
    const lim = HL.z - FRONT_MIN - (push ? 0.05 : 0.15); // (tampoco se van detrás de ti)
    if (this.pos.z > lim) this.pos.z = lim;
    const lat = ((this.pos.x - this.last.x) * right.x + (this.pos.z - this.last.z) * right.z) / Math.max(dt, 1e-3);
    this.bank += (clamp(-lat * 0.25, -0.7, 0.7) - this.bank) * Math.min(1, dt * 5);
  }

  // Bajando del cielo (el press de pecho): baja hacia donde espera, cada vez más despacio, con su vaivén; espera un momento
  // (a la vista, sobre tu cara) y se lanza a morderte; tras morder, o si un disparo lo para, vuelve a subir
  private skyStep(dt: number, env: FlyEnv): void {
    const HL = env.head, tgt = _a.copy(HL).add(this.sky!);
    const to = _b.subVectors(tgt, this.base), d = to.length(), reach = 0.25;
    if (env.active) {
      if (d > reach || this.retreat > 0) this.waitT = 0;
      else this.waitT += dt;
      if (this.retreat > 0) {
        // (hacia arriba y hacia fuera, lejos de tu cara)
        this.retreat -= dt;
        const up = _c.subVectors(this.base, HL);
        up.y = Math.max(up.y, 0.5);
        this.base.addScaledVector(up.normalize(), this.speed * SKY.speed * 0.8 * dt); // (unos metros: vuelve enseguida)
      } else if (d > reach) {
        // (lejos, a su paso; al acercarse, frenando: se le ve llegar)
        const v = this.speed * SKY.speed * clamp(d / SKY.brake, 0.3, 1);
        this.base.addScaledVector(to.normalize(), Math.min(d - reach + 0.005, v * dt));
      } else if (env.play && !this.windT && this.waitT >= SKY.wait) {
        this.windT = 1e-3; // (se echa atrás antes de lanzarse, con su voz: aún da tiempo a dispararle)
        this.evRoar = true;
      }
      if (this.windT > 0 && !env.play) this.windT = 0;
      if (this.windT > 0) {
        const was = this.windT;
        this.windT += dt;
        if (was < 0.45 && this.windT >= 0.45) this.evWhoosh = true;
        if (this.windT >= 0.7) {
          this.evBite = true;
          this.retreat = 2.5 + this.parryT;
          this.parryT = 0;
          this.windT = 0;
        }
      }
      this.wander(dt, Math.max(d, 1.5), false, false, HL);
    }
    if (this.pushV.lengthSq() > 1e-6) {
      this.base.addScaledVector(this.pushV, dt);
      this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K));
    }
    // (el vaivén, en el cielo: a los lados y adelante-atrás, y algo de arriba abajo)
    this.last.copy(this.pos);
    this.pos.set(this.base.x + this.dart.x, this.base.y + this.dart.y * 0.5, this.base.z + this.dart.z + this.dart.y * 0.4);
    this.pos.y = Math.max(HL.y + SKY.floor, this.pos.y);
    if (this.windT > 0) {
      const to2 = _c.subVectors(HL, this.pos), d2 = to2.length(), w = this.windT;
      const k = w < 0.45 ? -0.1 * smooth(w / 0.45) : -0.1 + (Math.max(0, d2 - 0.12) + 0.1) * smooth(Math.min(1, (w - 0.45) / 0.25));
      if (d2 > 1e-3) this.pos.addScaledVector(to2, k / d2);
    }
    if (!this.windT && this.retreat <= 0 && this.pushV.lengthSq() < 0.01 && this.t > dt * 1.5) this.turnCap(HL, dt);
    const lat = (this.pos.x - this.last.x) / Math.max(dt, 1e-3);
    this.bank += (clamp(-lat * 0.25, -0.7, 0.7) - this.bank) * Math.min(1, dt * 5);
  }

  // El desvío del vuelo suave: un objetivo que se mueve sin parar (dos vaivenes por eje, de frecuencias que no casan) y un
  // muelle amortiguado que lo sigue con la velocidad y la aceleración limitadas. d: lo lejos que está de donde quiere ir
  private wander(dt: number, d: number, push: boolean, low: boolean, HL: Vector3): void {
    // (lo poco errático también se mueve: con menos de 22 cm de vaivén parecía quieto; con «Vuelo errático» a 0, quieto)
    const e = this.erratic, A0 = clamp(d * (push ? 0.25 : 0.2), push ? 0.06 : 0.4, push ? 0.35 : 2.4) * e, A = this.errSet > 0 ? Math.max(A0, push ? 0.06 : 0.22) : 0, T = this.t * (0.6 + 0.25 * Math.sqrt(Math.max(0.1, e)));
    const toHead = Math.hypot(this.base.x - HL.x, this.base.z - HL.z), side = Math.min(A, SIDE_MAX * Math.max(push ? 0.3 : 0.6, toHead));
    // (sobre todo, una elipse que se recorre sin parar —nunca se queda quieto— y, encima, un vaivén que la deforma)
    const ay = A * (low ? 0.15 : 0.5);
    const tg = _e.set(
      this.flip * side * (0.8 * Math.cos(T * 0.6 + this.ph1) + 0.2 * Math.sin(T * 1.37 + this.ph2)),
      A * (low ? 0.02 : 0.07) + ay * (0.8 * Math.sin(T * 0.6 + this.ph1) + 0.2 * Math.sin(T * 1.13 + this.ph2)),
      A * 0.2 * Math.sin(T * 0.43 + this.ph1 * 1.3),
    );
    // el muelle (crítico) hacia el objetivo, con la aceleración y la velocidad limitadas
    const k = WANDER_K * Math.max(0.5, Math.min(1.6, e)), c = 2 * Math.sqrt(k), s = push ? 0.3 : 1, f = Math.max(0.3, Math.min(1.5, this.errSet)) * s;
    const acc = _f.subVectors(tg, this.dart).multiplyScalar(k).addScaledVector(this.dartV, -c);
    const aMax = WANDER_A * f, vMax = WANDER_V * f;
    if (acc.length() > aMax) acc.setLength(aMax);
    this.dartV.addScaledVector(acc, dt);
    if (this.dartV.length() > vMax) this.dartV.setLength(vMax);
    this.dart.addScaledVector(this.dartV, dt);
  }

  // Visto desde tu cabeza (HL), lo que se ha movido desde el fotograma anterior no gira más de TURN_MAX por segundo
  private turnCap(HL: Vector3, dt: number): void {
    const a = _e.subVectors(this.last, HL), b = _f.subVectors(this.pos, HL), la = a.length(), lb = b.length();
    if (la < 0.05 || lb < 0.05) return;
    const cos = clamp(a.dot(b) / (la * lb), -1, 1), ang = Math.acos(cos), max = TURN_MAX * dt;
    if (ang <= max) return;
    // (de la dirección de antes hacia la de ahora, solo lo que se deja; la distancia, la de ahora)
    a.divideScalar(la).lerp(b.divideScalar(lb), max / ang).normalize();
    this.pos.copy(HL).addScaledVector(a, lb);
  }

  // Sale por el hueco de su compuerta: dentro del túnel y bajo el dintel no sube por encima del techo ni se mete en las
  // paredes; al salir, el límite se abre poco a poco (sin saltos). Ya fuera, no vuelve a meterse por delante (gateKeep)
  private gateKeep(): void {
    const g = this.gate, r = g.ry, c = Math.cos(r), s = Math.sin(r), sc = g.scale || 1, p = this.pos, rad = this.radius / sc;
    const dx = p.x - g.x, dz = p.z - g.z;
    let x = (dx * c - dz * s) / sc, z = (dx * s + dz * c) / sc, y = p.y / sc;
    if (!this.gateOut) {
      if (z > 3) this.gateOut = true;
      const open = Math.max(0, z - 0.55) * 1.5, top = 2.9 - rad * 1.25 + open, side = Math.max(0, 1.17 - rad + open);
      y = Math.min(y, top);
      x = clamp(x, -side, side);
      z = Math.max(z, -1.35 + rad);
    } else if (Math.abs(x) < 2.3 + rad && y < 4.3 && z < 0.55 + rad && z > -1.5) z = 0.55 + rad;
    else return;
    p.set(g.x + (x * c + z * s) * sc, y * sc, g.z + (-x * s + z * c) * sc);
  }

  /** Empujón: lo aleja de ti dist metros (y hacia donde iba el golpe, dir), deslizándose (RepArena: Flyer.shove). */
  shove(dist: number, head: Vector3, dir: Vector3 | null): void {
    if (!(dist > 0)) return;
    if (this.sky) {
      // (bajando del cielo, el golpe lo sube: lejos de tu cara, no hacia los lados)
      const b = _d.subVectors(this.base, head);
      b.y = Math.max(b.y, 0.3);
      this.pushV.addScaledVector(b.normalize(), dist * SHOVE_K);
      return;
    }
    const b = _d.subVectors(this.base, head), up = b.y * 0.3, vy = up / (Math.hypot(Math.hypot(b.x, b.z), up) || 1);
    shoveDir(b, dir);
    b.multiplyScalar(Math.sqrt(1 - vy * vy));
    b.y = vy;
    this.pushV.addScaledVector(b, dist * SHOVE_K);
  }

  /** Un disparo le da (RepArena: onHit y recoil): se aparta del rayo y sale despedido hacia atrás; si estaba cogiendo
   * impulso para morder, se le quita. knock: «Retroceso» (1 = 100 %). Devuelve si sigue vivo. */
  hit(dmg: number, perfect: boolean, pow: number, head: Vector3, dir: Vector3 | null, knock: number): boolean {
    this.hp -= dmg;
    this.dartT.multiplyScalar(-1);
    this.flip = -this.flip; // (el vuelo suave: se va hacia el otro lado, sin saltos)
    const k = knock * (this.K.boss ? 0.3 : 1);
    if (k && this.hp > 0) {
      this.shove((0.25 + 0.12 * (pow - 1) + (perfect ? 0.08 : 0)) * k * (this.tiny ? 0.42 : 1), head, dir);
      if (this.windT > 0 && this.windT < 0.45 && !this.K.boss) {
        this.windT = 0;
        this.retreat = Math.max(this.retreat, 0.5);
      }
    }
    return this.hp > 0;
  }
}

const _sh = new Vector3();
/** La dirección del empujón (horizontal, de largo 1): lejos de ti y, si el golpe lleva dirección, también hacia donde
 * iba (RepArena: shoveDir). Devuelve cuánto le gira el golpe el tronco. */
export function shoveDir(b: Vector3, dir: Vector3 | null): number {
  b.y = 0;
  const l = b.length() || 1;
  b.divideScalar(l);
  if (!dir) return 0;
  _sh.copy(dir);
  _sh.y = 0;
  const dl = _sh.length();
  if (dl < 0.3) return 0;
  _sh.divideScalar(dl);
  const tw = b.x * _sh.z - b.z * _sh.x;
  b.addScaledVector(_sh, 0.8);
  if (b.lengthSq() < 1e-4) b.set(_sh.x, 0, _sh.z);
  b.normalize();
  return tw;
}
