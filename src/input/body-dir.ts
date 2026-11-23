/**
 * Hacia dónde mira el cuerpo, en horizontal, a partir del giro de la cabeza (la bola de energía va hacia ahí, a un metro).
 *
 * De pie es la mirada puesta en horizontal. Pero cuanto más mira la cabeza hacia abajo, menos dice la mirada: tumbado boca
 * abajo (el superman) o en plancha la mirada es casi vertical, su parte horizontal es ruido y apuntaba a cualquier lado (a
 * veces hacia los pies: la bola salía detrás de ti y no se veía; lo vio el usuario). Ahí manda la coronilla (el «arriba» de
 * la cabeza), que boca abajo apunta hacia delante del cuerpo, hacia las manos. Es lo mismo que ya hace el superman para
 * saber si los brazos están estirados (floor.ts: armsBack). Mirando al frente o hacia arriba, solo la mirada: igual que
 * antes. Lógica pura (sin IWSDK).
 */
import { Vector3, type Quaternion } from 'three';

const _f = new Vector3(), _u = new Vector3();

/** La dirección horizontal (y = 0, de largo 1) a la que mira el cuerpo con la cabeza girada `q`. */
export function bodyDir(q: Quaternion, out: Vector3): Vector3 {
  const f = _f.set(0, 0, -1).applyQuaternion(q), u = _u.set(0, 1, 0).applyQuaternion(q);
  // (la coronilla cuenta más cuanto más mira hacia abajo: nada mirando al frente, del todo mirando al suelo)
  const k = Math.min(1, Math.max(0, -f.y) * 1.25);
  out.set(f.x + u.x * k, 0, f.z + u.z * k);
  if (out.lengthSq() < 1e-8) out.set(0, 0, -1);
  return out.normalize();
}
