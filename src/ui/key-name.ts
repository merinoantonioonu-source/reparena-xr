/**
 * El nombre de una tecla de un panel para el diagnóstico (src/core/diag.ts): su id y, si lo tiene, su texto. De un objeto
 * cualquiera (lo que toca el rayo), sube hasta la tecla que escucha la pulsación; si no hay, el panel; si tampoco, «-».
 */
import type { Object3D } from '@iwsdk/core';

type El = Object3D & { _listeners?: Record<string, unknown>; properties?: { peek(): Record<string, unknown> } };

const idOf = (o: El): string => String(o.properties?.peek().id ?? o.name ?? '');

/** El texto que se ve dentro de una tecla (el primero que encuentra), corto. */
function textIn(o: Object3D): string {
  let t = '';
  o.traverse((c) => {
    if (t) return;
    const p = (c as El).properties?.peek();
    if (p && typeof p.text === 'string' && p.text.trim()) t = p.text.trim();
  });
  return t.length > 18 ? t.slice(0, 17) + '…' : t;
}

/** El nombre de la tecla (id «texto»). */
export function keyName(o: Object3D): string {
  const id = idOf(o as El), t = textIn(o);
  return t ? `${id || '?'}«${t}»` : id || '?';
}

/** La tecla a la que pertenece o (subiendo como mucho 8 pasos) o, si no está en una, el panel; null si no es de un panel.
 * Sin crear nada: se llama en cada fotograma, y el nombre (`nameOf`) solo cuando cambia. */
export function keyOf(o: Object3D | null | undefined): Object3D | null {
  let panel: Object3D | null = null;
  for (let p = o as El | null, k = 0; p && k < 14; p = p.parent as El | null, k++) {
    if (k < 8 && p._listeners?.click) return p;
    if (!panel && typeof (p as { getElementById?: unknown }).getElementById === 'function') panel = p; // (un panel de UIKitML)
  }
  return panel;
}

/** El nombre de lo que devuelve keyOf: la tecla (id «texto»), [el panel] o «-». */
export function nameOf(k: Object3D | null): string {
  if (!k) return '-';
  if ((k as El)._listeners?.click) return keyName(k);
  for (let p: Object3D | null = k; p; p = p.parent) if (p.name) return `[${p.name}]`; // (el panel, por el nombre de su nodo)
  return '[panel]';
}
