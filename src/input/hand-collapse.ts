/**
 * La mano «aplastada» (visto con el navegador de las Quest 157, el 22/11/2026): al perder de vista una mano, las gafas a veces
 * no la dan por perdida y siguen mandándola con sus 25 articulaciones en el mismo punto, delante de la cara. El juego la pintaba
 * (un guante aplastado, «un muñón», con el destello rosa del botón MENÚ de la muñeca latiendo encima) y, como el pulgar y el
 * índice estaban juntos, contaba como un pellizco continuo. Una mano de verdad tiene las puntas de los dedos lejos de la
 * muñeca (cerrada en puño, aún a más de 6 cm): con la muñeca y las puntas del índice y del meñique a menos de `COLLAPSED` m,
 * no es una mano y se toma por perdida.
 *
 * Lógica pura (sin IWSDK): la usa `HandSystem` (src/input/hand-system.ts) al leer las articulaciones.
 */

/** Las manos que llegan aplastadas en este fotograma (las pone `HandSystem`; la mano de IWSDK, `SkinHand`, no se pinta). */
export const COLLAPSE = { left: false, right: false };

/** Lo que tienen que estar separadas como poco la muñeca y las puntas de los dedos para ser una mano (m). */
export const COLLAPSED = 0.02;

/** Las articulaciones que se miran (en el orden de WebXR): la muñeca, la punta del índice y la del meñique. */
const WRIST = 0, INDEX_TIP = 9, PINKY_TIP = 24;

interface JointLike {
  ok: boolean;
  p: { distanceToSquared(o: unknown): number };
}

/** ¿Llega aplastada? (la muñeca y las puntas del índice y del meñique, todas en el mismo punto) */
export function handCollapsed(J: readonly JointLike[]): boolean {
  const w = J[WRIST], i = J[INDEX_TIP], k = J[PINKY_TIP];
  if (!w?.ok || !i?.ok || !k?.ok) return false;
  const c2 = COLLAPSED * COLLAPSED;
  return w.p.distanceToSquared(i.p) < c2 && w.p.distanceToSquared(k.p) < c2;
}
