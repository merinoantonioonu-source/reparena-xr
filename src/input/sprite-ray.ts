/**
 * Fallo de IWSDK (arreglado lo mínimo; apuntado en MIGRACION.md › Fallos de IWSDK): el rayo de apuntar de IWSDK (el de
 * pmndrs/pointer-events) busca lo que toca con un `Raycaster` sin cámara, y el `Sprite` de Three, para saber su tamaño en
 * pantalla, la necesita: avisa («Raycaster.camera needs to be set…») y luego lanza un error al leerla. Ese error, en pleno
 * fotograma, paraba el bucle de dibujo y la imagen se quedaba congelada al entrar en VR (le pasó al usuario con el navegador
 * de las Quest 157, en cuanto el rayo de la mano pasaba por el destello que señala el botón MENÚ de la muñeca).
 *
 * Ningún sprite del juego (destellos, halos, el número de la carga…) es algo que se pulse: sin cámara, el rayo no los toca.
 */
import { Sprite } from '@iwsdk/core';

let done = false;

export function spriteRayFix(): void {
  if (done) return;
  done = true;
  const raycast = Sprite.prototype.raycast;
  Sprite.prototype.raycast = function (this: Sprite, raycaster, intersects) {
    if (!raycaster.camera) return;
    raycast.call(this, raycaster, intersects);
  };
}
