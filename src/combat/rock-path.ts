/**
 * Las piedras del lanzador, sin IWSDK (RepArena, src/70_game.js: throwRock, rockAt, rockParry y updateRocks): cada una
 * vuela en parábola hasta donde estaba tu cabeza al soltarla. Apártate (¡Esquivada!) o párala con una mano (¡Parada!); si
 * te da, te golpea. Se prueba en tests/unit/rocks.test.ts.
 */
import type { Vector3 } from 'three';
import type { Hand, Side } from '../input/hand-model.js';

/** A menos de esto de la cabeza al llegar, da (m); a menos de esto de una mano o un dedo, se para (m). */
export const ROCK_HIT = 0.28, ROCK_PARRY = 0.17;

/** Lo que tarda en llegar (s) y lo alta que sube (m): cuanto más lejos, más; cuanto más difícil (k, throwK), más deprisa. */
export function rockFlight(dist: number, k: number): { T: number; h: number } {
  const T = Math.min(1.4, Math.max(0.85, dist / 4.5)) / k;
  return { T, h: 0.6 * T * T };
}

/** Dónde está al cabo de t segundos (out). */
export function rockAt(from: Vector3, to: Vector3, T: number, h: number, t: number, out: Vector3): Vector3 {
  const k = Math.min(1, Math.max(0, t / T));
  out.lerpVectors(from, to, k);
  out.y += Math.sin(Math.PI * k) * h;
  return out;
}

const TIPS = [4, 9, 14, 19, 24];
/** ¿La toca una mano (la muñeca, la punta del índice o la de cualquier dedo)? Devuelve qué mano (o null). Sin espadas
 * todavía (PR 9). */
export function rockParry(w: Vector3, hands: Record<Side, Hand>): Side | null {
  for (const s of ['left', 'right'] as Side[]) {
    const h = hands[s];
    if (!h.ok) continue;
    if (h.wrist.distanceTo(w) < ROCK_PARRY || (h.tipOk && h.tip.distanceTo(w) < ROCK_PARRY)) return s;
    if (h.isHand) for (const j of TIPS) if (h.J[j].ok && h.J[j].p.distanceTo(w) < ROCK_PARRY) return s;
  }
  return null;
}
