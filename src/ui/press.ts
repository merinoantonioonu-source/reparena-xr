/**
 * Lo que hace una tecla de un panel al pulsarla. Le llegan dos pulsaciones: la de IWSDK (con el rayo, o con el dedo al
 * soltar rápido) y la de las teclas sólidas (con el dedo, al tocarla: src/ui/solid-keys.ts). Una tecla atiende la primera y
 * no vuelve a responder hasta pasados 0,8 s: así, con el dedo, una pulsación es una sola, la haga quien la haga, y si una
 * de las dos falla, la otra sigue funcionando.
 */
import type { Object3D } from '@iwsdk/core';

const GAP = 800, last = new WeakMap<object, number>();

/** Escucha la pulsación de una tecla; devuelve cómo dejar de escucharla. */
export function onPress(el: Object3D, fn: () => void): () => void {
  const h = (): void => {
    const now = performance.now(), t = last.get(el);
    if (t !== undefined && now - t < GAP) return;
    last.set(el, now);
    fn();
  };
  el.addEventListener('click', h);
  return () => el.removeEventListener('click', h);
}
