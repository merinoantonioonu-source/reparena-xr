/**
 * El negro del final de la ronda: solo quedan a la vista el resumen (el menú), tus manos y los avisos.
 *
 * Antes era una esfera negra alrededor de la cabeza con el radio justo para que el resumen quedara dentro: lo de más lejos
 * no se veía. Pero lo cercano siempre quedaba dentro (al agacharte, el suelo y el aro turquesa; lo grabó el usuario) y, al
 * apartarte del resumen, el resumen quedaba fuera y desaparecía. Ahora es por lo que se pinta, no por la distancia: justo
 * antes de pintar cada fotograma se esconde todo lo del nivel que no lleve la marca `keepInBlack`, y justo después se
 * vuelve a poner como estaba (los sistemas no notan nada: su visibilidad no se toca fuera del pintado). La esfera negra
 * sigue, grande, de fondo (tapa el cielo).
 */
import type { Object3D, Scene } from '@iwsdk/core';

/** Lo que se ve en el negro del final (el menú, los guantes, los avisos…). */
export function keepInBlack(o: Object3D): void {
  o.userData.keepInBlack = true;
}

/**
 * Engancha el negro al pintado de `scene`: mientras `on()` diga que sí, de `root()` (la raíz del nivel) solo se pintan sus
 * hijos marcados. Una vez, al empezar.
 */
export function blackOutHook(scene: Scene, root: () => Object3D | null, on: () => boolean): void {
  const hid: Object3D[] = [];
  const before = scene.onBeforeRender, after = scene.onAfterRender;
  scene.onBeforeRender = function (...a: Parameters<Scene['onBeforeRender']>) {
    before.apply(this, a);
    hid.length = 0;
    if (!on()) return;
    const r = root();
    if (!r) return;
    for (const c of r.children) {
      if (!c.visible || c.userData.keepInBlack) continue;
      c.visible = false;
      hid.push(c);
    }
  };
  scene.onAfterRender = function (...a: Parameters<Scene['onAfterRender']>) {
    for (const c of hid) c.visible = true;
    hid.length = 0;
    after.apply(this, a);
  };
}
