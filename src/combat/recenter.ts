/**
 * Recolocarte en la arena (sin IWSDK): RepArena movía la arena hasta tu cabeza (arenaGlideToHead, arenaFromHead); aquí se
 * mueve tu espacio (el del jugador de IWSDK), que visto desde ti es lo mismo. Se prueba en tests/unit/recenter.test.ts.
 */
import type { Vector3 } from 'three';

/** Cómo queda tu espacio para que tu cabeza quede en el centro de la arena (0, 0) y «delante» mire a las compuertas (−Z):
 * ry0, su giro de ahora; a, hacia dónde queda «delante» en el mundo (hacia donde miras o, en el suelo, hacia donde apunta
 * tu cuerpo); hx, hz, tu cabeza en tu espacio. Devuelve su giro (ry1) y su sitio (x1, z1). */
export function recenterPose(ry0: number, a: number, hx: number, hz: number, out: { ry1: number; x1: number; z1: number }): { ry1: number; x1: number; z1: number } {
  const ry1 = ry0 - a, c = Math.cos(ry1), s = Math.sin(ry1); // (girado lo que te apartas de mirar a las compuertas)
  out.ry1 = ry1;
  out.x1 = -(hx * c + hz * s);
  out.z1 = -(-hx * s + hz * c);
  return out;
}

/** El centro de la arena diminuta (las trampillas) al calibrar en el suelo: recolocado (turned), tu cabeza queda en (0, 0) y
 * delante es −Z; en el inchworm, donde quedará la cabeza en la plancha, a tu alcance (reach) por delante. Si no se ha podido
 * recolocar (en Barras), donde estás y hacia donde miras (fwd), como antes. */
export function floorOrigin(turned: boolean, inch: boolean, reach: number, headP: Vector3, fwd: Vector3, out: Vector3): Vector3 {
  if (turned) return out.set(0, 0, inch ? -(reach + 0.12) : 0);
  out.copy(headP);
  if (inch) out.addScaledVector(fwd, reach + 0.12);
  return out;
}
