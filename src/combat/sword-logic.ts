/**
 * Las espadas, la lógica (de RepArena: src/76_sword.js; elegido por el usuario: «sí, como en RepArena»). Sin IWSDK: se
 * prueba en tests/unit/swords.test.ts. Lo que se ve y se oye, en src/combat/swords.ts.
 *
 * - Cada repetición carga la hoja (una carga por espada: no se acumulan).
 * - Solo corta un tajo amplio y rápido, con el brazo: la punta, a más de «Velocidad mínima del corte», y la mano que la
 *   empuña, a más de `SWORD_ARM` (un giro de muñeca con el brazo quieto no corta). Más despacio, roza: no hace daño.
 * - Sin carga, la hoja rebota en el enemigo. Al enemigo aturdido (tras un bloqueo), un contraataque: daño doble, sin gastar
 *   carga.
 * - El bloqueo: al preparar el golpe, el enemigo marca a qué altura irá (alto, medio o bajo); se para con la hoja en la
 *   marca durante los últimos `BLOCK_LATE` s antes del golpe (los medios y bajos, además, agachado).
 */
import { Vector3 } from 'three';

/** La mano que empuña también tiene que moverse (m/s) y el bloqueo cuenta lo de los últimos segundos antes del golpe. */
export const SWORD_ARM = 0.6, BLOCK_LATE = 0.35;
/** Los puntos de la hoja que se miran (de la guarda a la punta) y lo larga que es (m: la metálica y la láser). */
export const BLADE_N = 6;
export const swordLen = (laser: boolean): number => (laser ? 0.95 : 0.85);
/** Lo lejos de la guarda a la que empieza la hoja (m: la láser sale de su empuñadura). */
export const bladeBase = (laser: boolean): number => (laser ? 0.14 : 0.1);
/** Un tajo, un golpe: lo que tarda cada espada en poder volver a dar al mismo enemigo (s). */
export const HIT_COOL = 0.45;

/** Las alturas del golpe: dónde se para (m respecto a tu altura de pie), lo que hay que agacharse (× la bajada de la
 * sentadilla) y su color. */
export const BLOCK_Z = {
  high: { dy: -0.02, crouch: 0, col: 0xffd166, txt: 'Golpe ALTO' },
  mid: { dy: -0.42, crouch: 0.5, col: 0xff8a3d, txt: 'Golpe MEDIO: ¡agáchate!' },
  low: { dy: -0.7, crouch: 0.85, col: 0xff3b5c, txt: 'Golpe BAJO: ¡agáchate más!' },
} as const;
export type BlockZone = keyof typeof BLOCK_Z;
/** Al azar, como en RepArena (más golpes medios). */
export const pickZone = (r: number): BlockZone => (['high', 'mid', 'mid', 'low'] as const)[Math.min(3, Math.floor(r * 4))];

/** La carga de las espadas: una por espada, cada una con si fue perfecta y su daño (la perfecta, el doble; aguantando abajo
 * ×2-×4, más, como el rayo). */
export class SwordCharge {
  readonly perf: boolean[] = [];
  readonly dmg: number[] = [];
  /** Si la última que se gastó era perfecta. */
  lastPerfect = false;
  constructor(public cap = 1) {}
  /** Una repetición: cada espada, cargada (sin acumular). */
  charge(perfect: boolean, dmg: number = perfect ? 2 : 1): void {
    for (let i = 0; i < this.cap; i++) {
      this.perf.push(perfect);
      this.dmg.push(dmg);
    }
    while (this.perf.length > this.cap) {
      this.perf.shift();
      this.dmg.shift();
    }
  }
  get charged(): boolean {
    return this.perf.length > 0;
  }
  /** La más fuerte que lleva (0: sin carga). */
  get top(): number {
    let m = 0;
    for (const d of this.dmg) m = Math.max(m, d);
    return m;
  }
  /** Gasta una carga: su daño o 0 si no había. */
  spend(): number {
    if (!this.perf.length) return 0;
    this.lastPerfect = this.perf.shift()!;
    return this.dmg.shift()!;
  }
  reset(): void {
    this.perf.length = this.dmg.length = 0;
  }
}

/** Qué hace un tajo que llega a un enemigo: rozar (lento o de muñeca), rebotar (sin carga), golpear o contraatacar. */
export type Cut = 'graze' | 'bounce' | 'hit' | 'counter';
export function cutOf(tipSpeed: number, armSpeed: number, minSpeed: number, charged: boolean, dazed: boolean): Cut {
  if (tipSpeed < minSpeed || armSpeed < SWORD_ARM) return 'graze';
  if (dazed) return 'counter';
  return charged ? 'hit' : 'bounce';
}

/** ¿Para el golpe? La hoja estuvo en la marca con la postura pedida dentro de los últimos `BLOCK_LATE` s antes del golpe. */
export const blockHolds = (strikeT: number, coverT: number): boolean => strikeT - coverT <= BLOCK_LATE;

const _d1 = new Vector3(), _d2 = new Vector3(), _r0 = new Vector3(), _p = new Vector3(), _q = new Vector3();
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** La distancia entre los segmentos a-b y c-d (y, en `out` y `outQ`, sus puntos más cercanos). */
export function segSeg(a: Vector3, b: Vector3, c: Vector3, d: Vector3, out?: Vector3, outQ?: Vector3): number {
  _d1.subVectors(b, a);
  _d2.subVectors(d, c);
  _r0.subVectors(a, c);
  const A = _d1.dot(_d1), E = _d2.dot(_d2), F = _d2.dot(_r0);
  let s = 0, u = 0;
  if (A < 1e-9 && E < 1e-9) {
    out?.copy(a);
    outQ?.copy(c);
    return _r0.length();
  }
  if (A < 1e-9) u = clamp01(F / E);
  else {
    const C = _d1.dot(_r0);
    if (E < 1e-9) s = clamp01(-C / A);
    else {
      const B = _d1.dot(_d2), den = A * E - B * B;
      s = den > 1e-9 ? clamp01((B * F - C * E) / den) : 0;
      u = (B * s + F) / E;
      if (u < 0) {
        u = 0;
        s = clamp01(-C / A);
      } else if (u > 1) {
        u = 1;
        s = clamp01((B - C) / A);
      }
    }
  }
  const p = _p.copy(a).addScaledVector(_d1, s), q = _q.copy(c).addScaledVector(_d2, u);
  out?.copy(p);
  outQ?.copy(q);
  return p.distanceTo(q);
}

/**
 * Las dos hojas, sólidas (pedido del usuario: «cuando choco una espada con otra, no debería poder atravesarlas»): cada una
 * es una barra de `BLADE_R` de grosor (las dos juntas) y se recuerda de qué lado de la otra estaba (`n`). Si en este
 * fotograma se tocan o ya se han cruzado (las manos siguen de verdad), `pen` es lo que hay que apartarlas por ese lado: lo
 * hace src/combat/swords.ts girando cada hoja sobre su mano. Si haría falta girarlas más de `PUSH_MAX`, se dejan pasar (las
 * manos ya están muy cruzadas: forzarlas parecería que la espada se dobla).
 */
export const BLADE_R = 0.04, PUSH_MAX = 0.6;
export class BladeContact {
  /** De la hoja B hacia la A, la última vez que no se tocaban. */
  readonly n = new Vector3();
  has = false;
  pen = 0;
  /** Los puntos más cercanos de cada hoja. */
  readonly pa = new Vector3();
  readonly pb = new Vector3();
  private readonly sep = new Vector3();

  /** ¿Se tocan? (y cuánto hay que apartarlas, en `pen`) */
  step(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3): boolean {
    const d = segSeg(a0, a1, b0, b1, this.pa, this.pb);
    this.sep.subVectors(this.pa, this.pb);
    this.pen = 0;
    if (!this.has) {
      if (d > 1e-4) {
        this.n.copy(this.sep).divideScalar(d);
        this.has = true;
      }
      return false;
    }
    const s = this.sep.dot(this.n);
    if (s >= BLADE_R) {
      if (d > 1e-4) this.n.copy(this.sep).divideScalar(d);
      return false;
    }
    this.pen = BLADE_R - s;
    return true;
  }
  /** Se han dejado pasar (o una espada no está): se vuelve a mirar de qué lado está cada una. */
  release(): void {
    this.has = false;
    this.pen = 0;
  }
}

/** El giro que aparta una hoja `push` m en la dirección `n`, para un punto a `lever` m de la mano (rad). */
export const pushAngle = (push: number, lever: number): number => Math.atan2(push, Math.max(0.15, lever));

/**
 * El lanzamiento con la espada (pedido del usuario: «al cargar, lanzar rayos con las espadas haciendo un gesto de lanzamiento,
 * para no esperar a que lleguen los enemigos»): una estocada o un lanzamiento hacia delante, rápido (la mano, a más de
 * `on` m/s y casi toda hacia delante, la de tu cuerpo) y de al menos `len` m; al frenar (la mitad de lo más rápido que iba)
 * sale el rayo en la dirección del gesto. Un tajo a un lado no lo es. Lo que decide si hay a quién (y que esté fuera del
 * alcance de la hoja: de cerca, se corta), en src/combat/swords.ts.
 */
export const SWORD_THROW = { on: 1.5, fwd: 0.6, len: 0.2, cool: 0.5, maxT: 0.45, settle: 0.06 } as const;
export class SwordThrow {
  private readonly prev = new Vector3();
  private readonly v = new Vector3();
  private readonly from = new Vector3();
  private have = false;
  private going = false;
  private peak = 0;
  private t = 0;
  private slow = 0;
  private cool = 0;
  reset(): void {
    this.have = this.going = false;
    this.cool = 0;
  }
  /** Un fotograma: la mano y hacia dónde mira tu cuerpo (horizontal). ¿Ha lanzado? (la dirección, en `out`) */
  step(dt: number, hand: Vector3, fwd: Vector3, out: Vector3): boolean {
    if (dt <= 0) return false;
    this.cool = Math.max(0, this.cool - dt);
    if (!this.have) {
      this.prev.copy(hand);
      this.have = true;
      return false;
    }
    const vx = (hand.x - this.prev.x) / dt, vy = (hand.y - this.prev.y) / dt, vz = (hand.z - this.prev.z) / dt;
    this.prev.copy(hand);
    this.v.set(this.v.x * 0.4 + vx * 0.6, this.v.y * 0.4 + vy * 0.6, this.v.z * 0.4 + vz * 0.6);
    const sp = this.v.length(), fw = this.v.x * fwd.x + this.v.z * fwd.z;
    if (!this.going) {
      if (this.cool <= 0 && sp > SWORD_THROW.on && fw > SWORD_THROW.fwd * sp) {
        this.going = true;
        this.peak = sp;
        this.t = this.slow = 0;
        this.from.copy(hand).addScaledVector(this.v, -dt);
      }
      return false;
    }
    this.t += dt;
    this.peak = Math.max(this.peak, sp);
    // (frenado un instante, no un fotograma suelto: las gafas dan a veces una postura repetida y la velocidad cae a cero)
    if (sp > this.peak * 0.5) this.slow = 0;
    else this.slow += dt;
    if (this.slow < SWORD_THROW.settle && this.t < SWORD_THROW.maxT) return false;
    this.going = false;
    out.subVectors(hand, this.from);
    if (out.length() < SWORD_THROW.len || out.x * fwd.x + out.z * fwd.z < SWORD_THROW.fwd * out.length()) return false;
    out.normalize();
    this.cool = SWORD_THROW.cool;
    return true;
  }
}
