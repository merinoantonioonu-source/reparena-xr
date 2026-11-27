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

/** La carga de las espadas: una por espada, cada una con si fue perfecta (la perfecta quita el doble). */
export class SwordCharge {
  readonly perf: boolean[] = [];
  constructor(public cap = 1) {}
  /** Una repetición: cada espada, cargada (sin acumular). */
  charge(perfect: boolean): void {
    for (let i = 0; i < this.cap; i++) this.perf.push(perfect);
    while (this.perf.length > this.cap) this.perf.shift();
  }
  get charged(): boolean {
    return this.perf.length > 0;
  }
  /** Gasta una carga: el daño (1; la perfecta, 2) o 0 si no había. */
  spend(): number {
    if (!this.perf.length) return 0;
    return this.perf.shift() ? 2 : 1;
  }
  reset(): void {
    this.perf.length = 0;
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
/** La distancia entre los segmentos a-b y c-d (y, en `out`, el punto más cercano del primero). */
export function segSeg(a: Vector3, b: Vector3, c: Vector3, d: Vector3, out?: Vector3): number {
  _d1.subVectors(b, a);
  _d2.subVectors(d, c);
  _r0.subVectors(a, c);
  const A = _d1.dot(_d1), E = _d2.dot(_d2), F = _d2.dot(_r0);
  let s = 0, u = 0;
  if (A < 1e-9 && E < 1e-9) {
    out?.copy(a);
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
  return p.distanceTo(q);
}
