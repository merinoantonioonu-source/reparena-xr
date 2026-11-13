/**
 * Lo que hace una tecla de un panel al pulsarla. Le llegan dos pulsaciones: la de IWSDK (con el rayo, o con el dedo al
 * soltar rápido) y la de las teclas sólidas (con el dedo, al tocarla: src/ui/solid-keys.ts). Una tecla atiende la primera y
 * no vuelve a responder hasta pasados 0,8 s: así, con el dedo, una pulsación es una sola, la haga quien la haga, y si una
 * de las dos falla, la otra sigue funcionando.
 */
import type { Object3D } from '@iwsdk/core';
import { diagEvent } from '../core/diag.js';
import { keyName } from './key-name.js';

const GAP = 800, last = new WeakMap<object, number>();

/** Escucha la pulsación de una tecla; devuelve cómo dejar de escucharla. */
export function onPress(el: Object3D, fn: () => void): () => void {
  const h = (e?: { pointerType?: string }): void => {
    const now = performance.now(), t = last.get(el), by = e?.pointerType ? `IWSDK ${e.pointerType}` : 'dedo (teclas sólidas)';
    if (t !== undefined && now - t < GAP) {
      diagEvent(`pulsación repetida, no cuenta: ${keyName(el)} (${by})`);
      return;
    }
    diagEvent(`se pulsa ${keyName(el)} (${by})`);
    last.set(el, now);
    fn();
  };
  el.addEventListener('click', h);
  return () => el.removeEventListener('click', h);
}
