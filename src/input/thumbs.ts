/**
 * El pulgar arriba (para saltarse la carátula del duelo) y los botones del mando recién pulsados, como en RepArena
 * (src/64_intro.js: thumbsUp, padMask). Sin IWSDK.
 */
import { Vector3 } from 'three';
import type { Hand } from './hand-model.js';

const up = new Vector3();
/** El pulgar estirado hacia arriba y los otros cuatro dedos doblados (la punta, no más lejos de la muñeca que el nudillo). */
export function thumbsUp(h: Hand | null | undefined): boolean {
  if (!h || !h.isHand || !h.ok) return false;
  const J = h.J;
  for (const i of [0, 2, 4, 6, 9, 11, 14, 16, 19, 21, 24]) if (!J[i].ok) return false;
  up.subVectors(J[4].p, J[2].p);
  if (up.length() < 0.03 || up.normalize().y < 0.6 || J[4].p.y < J[6].p.y + 0.02) return false;
  let curled = 0;
  for (const [k, t] of [[6, 9], [11, 14], [16, 19], [21, 24]]) if (J[t].p.distanceTo(J[0].p) < J[k].p.distanceTo(J[0].p) * 1.1) curled++;
  return curled >= 3;
}

/** Los botones del mando que están pulsados, uno por bit (con la mano desnuda, ninguno). */
export function padMask(h: Hand | null | undefined): number {
  let m = 0;
  const b = (h && !h.isHand && h.pad && h.pad.buttons) || [];
  for (let i = 0; i < b.length && i < 30; i++) if (b[i] && b[i].pressed) m |= 1 << i;
  return m;
}
