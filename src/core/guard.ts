/**
 * Que un error no congele el juego. El bucle de dibujo de Three (el que usa IWSDK) pide el fotograma siguiente después de
 * pintar el actual: si algo lanza un error en medio (un sistema o el pintado), no lo pide nunca más y la imagen se queda
 * parada para siempre en las gafas (le pasó al usuario al entrar en VR tras actualizarse el navegador de las Quest, y el
 * diagnóstico no decía nada: solo apuntaba lo que se escribe en la consola).
 *
 * Aquí cada sistema y el pintado van protegidos: un error se apunta en el diagnóstico (qué sistema, el mensaje y dónde, las
 * primeras veces) y en la consola, y el juego sigue con el fotograma siguiente. También se apuntan los errores sueltos del
 * navegador (fuera del bucle). Solo cuesta algo cuando hay un error.
 */
import { diagEvent } from './diag.js';

/** Las veces que se apunta el error de cada sitio (luego, solo se cuentan) y las que lleva cada uno. */
const SHOW = 3;
const seen = new Map<string, number>();

/** Apunta un error de `where` (las primeras veces, con su mensaje y dónde pasó). */
export function guardReport(where: string, e: unknown): void {
  const n = (seen.get(where) ?? 0) + 1;
  seen.set(where, n);
  if (n > SHOW) {
    if (n % 300 === 0) diagEvent(`ERROR en ${where}: ${n} veces`);
    return;
  }
  const err = e as { message?: string; stack?: string };
  const at = (err?.stack ?? '').split('\n').slice(1, 4).map((l) => l.trim()).join(' | ');
  const text = `ERROR en ${where}: ${err?.message ?? String(e)}${at ? ` · ${at}` : ''}`;
  diagEvent(text);
  console.error(text);
}

interface Guarded {
  update(delta: number, time: number): void;
  constructor: { name: string };
}

/**
 * Protege los sistemas que ya están en el mundo (los de IWSDK y los del juego) y el pintado de su `renderer`. Se llama una
 * vez, después de registrarlos todos; `named`, los del juego por su nombre (al publicar, el código se comprime y los nombres
 * de las clases se pierden: sin esto, el diagnóstico diría «ERROR en e»).
 */
export function guardWorld(world: { getSystems(): unknown[]; renderer: { render(scene: unknown, camera: unknown): void } }, named: Record<string, unknown>): void {
  const names = new Map<unknown, string>();
  for (const [k, v] of Object.entries(named)) names.set(v, k);
  let i = 0;
  for (const s of world.getSystems() as Guarded[]) {
    i++;
    const up = s.update.bind(s), name = names.get(s.constructor) ?? `el sistema n.º ${i} de IWSDK (${s.constructor.name || '?'})`;
    s.update = (delta: number, time: number): void => {
      try {
        up(delta, time);
      } catch (e) {
        guardReport(name, e);
      }
    };
  }
  const r = world.renderer, render = r.render.bind(r);
  r.render = (scene: unknown, camera: unknown): void => {
    try {
      render(scene, camera);
    } catch (e) {
      guardReport('el pintado', e);
    }
  };
  // (los errores sueltos del navegador, fuera del bucle: también al diagnóstico)
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => guardReport('el navegador', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => guardReport('una promesa', ev.reason));
}
