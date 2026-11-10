/**
 * El vuelo de los voladores con modelo (abeja, murciélago, Cthulhu y el dragón), tal cual en RepArena (src/70_game.js:
 * FLYER_KIND, FLAP_HZ, Flyer, gateKeep y frontKeep): salen por el hueco de una compuerta, se acercan volando hacia ti con
 * un vuelo errático (bandazos al azar y un vaivén suave), se quedan cerca de tu cara y, cuando les toca, se echan atrás y
 * se lanzan a morderte; luego se alejan y vuelven. Un disparo los empuja hacia atrás (y, si estaban cogiendo impulso, se
 * lo quita). Sin IWSDK: se compara con el código de RepArena en tests/compare/flight.compare.test.ts.
 *
 * Tumbado (superman, plancha lateral) vienen bajos, a la altura de la cabeza; en el superman, además, esperan a la vista y
 * solo pican después de dar tiempo a una repetición entera y nunca mientras aguantas arriba (RepArena: lowFly, SUP_ATK).
 * Sin los voladores pequeños de las flexiones (llegan con la batalla diminuta).
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
   * siguiente (lo comparten todos: nunca dos seguidos). null: no es el superman. */
  sup: { hold: number; up: boolean; time: number; next: { t: number } } | null;
}

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const FRONT_MIN = 0.3;
/** Lo que se frena un empujón (RepArena: SHOVE_K). */
export const SHOVE_K = 7;

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _d = new Vector3();

/** Un volador en vuelo (RepArena: Flyer, sin su modelo: eso lo pone el sistema). */
export class Flight {
  readonly K: FlyerKind;
  readonly base: Vector3;
  readonly pos: Vector3;
  readonly last: Vector3;
  readonly dart = new Vector3();
  readonly dartT: Vector3;
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
  /** Lo que ha pasado en el último paso: empieza a lanzarse (su voz), se lanza (el silbido) y te muerde. */
  evRoar = false;
  evWhoosh = false;
  evBite = false;

  /** kind: bee, bat…; gate: la compuerta por la que sale (ya elegida); flySpeed: «Velocidad de vuelo» (km/h, con la
   * dificultad creciente); erratic: «Vuelo errático» (%). Devuelve también cuánto tiene que estar abierta la compuerta. */
  constructor(kind: string, readonly gate: FlyGate, flySpeed: number, erratic: number, hp: number, private rnd: () => number = Math.random, low = false) {
    const K = (this.K = FLYER_KIND[kind]);
    const sp = flySpeed / 3.6, r = gate.ry;
    const start = new Vector3(gate.x - 0.6 * Math.sin(r), (low ? 0.6 : 1.5) * gate.scale, gate.z - 0.6 * Math.cos(r));
    this.base = start.clone();
    this.pos = start.clone();
    this.last = start.clone();
    this.dartT = new Vector3(0, this.rand(1.8, 3.6), 0);
    this.speed = sp * K.speed * this.rand(0.85, 1.15);
    this.erratic = (K.erratic * erratic) / 100;
    this.w1 = this.rand(0.6, 1.6);
    this.w2 = this.rand(0.8, 1.8);
    this.ph1 = this.rand(0, TAU);
    this.ph2 = this.rand(0, TAU);
    this.radius = 0.24 * K.scale;
    this.hp = hp;
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
    const HL = env.head;
    const low = env.low > 0;
    if (env.active) {
      const tgt = _a.set(HL.x * 0.6, low ? env.low : Math.max(1.0, HL.y - 0.12), HL.z * 0.6);
      const S = env.sup, to = _b.subVectors(tgt, this.base), d = to.length(), reach = S ? 1.4 : 0.85;
      if (d > reach || this.retreat > 0) this.waitT = 0;
      else this.waitT += dt;
      if (this.retreat > 0) {
        this.retreat -= dt;
        this.base.addScaledVector(to.normalize(), -this.speed * 1.6 * dt);
      } else if (d > reach) this.base.addScaledVector(to.normalize(), Math.min(d, this.speed * dt));
      else if (S && !this.windT && (this.waitT < S.hold + 3 || S.up || S.time < S.next.t)) {
        /* (en el superman, esperando: a la vista, sin picar mientras aguantas arriba) */
      } else if (env.play && !this.windT) {
        this.windT = 1e-3; // (se echa atrás antes de lanzarse: te da un momento para dispararle), con su voz
        this.evRoar = true;
      }
      if (S && this.windT === 1e-3) S.next.t = S.time + S.hold + 3.5; // (y el siguiente, otra repetición después)
      if (this.windT > 0 && !env.play) this.windT = 0;
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
      if (this.t > this.nextDart && !this.windT && env.beat) {
        const A = clamp(d * 0.2, 0.4, 2.4) * this.erratic;
        this.dartT.set(this.rand(-1, 1) * A, this.rand(-0.4, 0.6) * A * (low ? 0.2 : 0.7), this.rand(-0.5, 0.5) * A * 0.4);
        this.nextDart = this.t + this.rand(0.8, 3.0) / Math.sqrt(Math.max(0.2, this.erratic));
      }
    }
    if (this.pushV.lengthSq() > 1e-6) {
      // empujado
      this.base.addScaledVector(this.pushV, dt);
      this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K));
    }
    this.dart.lerp(this.dartT, 1 - Math.exp(-dt * 2.2 * Math.max(0.3, this.erratic)));
    const dir = _b.set(-this.base.x, 0, -this.base.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const right = _c.set(dir.z, 0, -dir.x), wob = 0.25 * this.erratic;
    this.last.copy(this.pos);
    this.pos.copy(this.base).addScaledVector(right, this.dart.x + Math.sin(this.t * this.w1 + this.ph1) * wob).addScaledVector(dir, this.dart.z);
    this.pos.y += this.dart.y + Math.sin(this.t * this.w2 * 1.7 + this.ph2) * wob * 0.6;
    this.pos.y = Math.max(low ? 0.2 : 0.45, this.pos.y);
    if (low) this.pos.y = Math.min(this.pos.y, 1.0);
    if (this.windT > 0) {
      // echarse atrás y lanzarse hacia tu cara
      const to = _a.subVectors(HL, this.pos), d = to.length(), w = this.windT;
      const k = w < 0.45 ? -0.1 * smooth(w / 0.45) : -0.1 + (Math.max(0, d - 0.12) + 0.1) * smooth(Math.min(1, (w - 0.45) / 0.25));
      if (d > 1e-3) this.pos.addScaledVector(to, k / d);
    }
    this.gateKeep();
    const lim = HL.z - FRONT_MIN - 0.15; // (tampoco se van detrás de ti)
    if (this.pos.z > lim) this.pos.z = lim;
    const lat = ((this.pos.x - this.last.x) * right.x + (this.pos.z - this.last.z) * right.z) / Math.max(dt, 1e-3);
    this.bank += (clamp(-lat * 0.25, -0.7, 0.7) - this.bank) * Math.min(1, dt * 5);
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
    const k = knock * (this.K.boss ? 0.3 : 1);
    if (k && this.hp > 0) {
      this.shove((0.25 + 0.12 * (pow - 1) + (perfect ? 0.08 : 0)) * k, head, dir);
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
