/**
 * Precompilar los sombreadores antes de la ronda (RepArena: warmQueue/warmStep, src/70_game.js): sin esto, lo que se pinta
 * por primera vez (el primer enemigo de cada clase, el que se desvanece al morir, sus colores…) se compila en plena partida y
 * la imagen da un tirón en las gafas (lo vio el usuario: «al hacer la sentadilla, toda la escena se queda atascada un
 * momento»). IWSDK no trae nada para esto.
 *  - Las copias que hay que compilar se guardan en un grupo escondido de la escena (`warmKeep`): así sus programas no se
 *    borran, y se compilan con todo lo demás.
 *  - La compilación se hace dentro del pintado de un fotograma (justo antes de dibujar), con la misma imagen de destino que
 *    usan las gafas (las dos vistas a la vez): fuera del pintado, Three compilaría otra versión que en las gafas no sirve.
 *  - Las copias (los enemigos, sus colores y el desvanecido) se preparan y se compilan de una en una mientras estás en el menú
 *    (RepArena: warmQueue y warmStep): al pulsar EMPEZAR ya no hay que hacerlo todo de golpe (la imagen se quedaba congelada
 *    y seguía a la cabeza). Lo que falte se compila al empezar la ronda (`warmSoon`), cuando la carátula del duelo ya lo
 *    tapa todo de negro.
 */
import { Group } from '@iwsdk/core';
import { HITCH } from '../core/hitch.js';
import type { Camera, Object3D, Scene, Texture, WebGLRenderer } from '@iwsdk/core';

const W = { want: false, wait: 0, hooked: false, keep: null as Group | null, queue: [] as Object3D[], tex: [] as Texture[] };

/** Las texturas de o, para subirlas al compilarlo. */
function texOf(o: Object3D, out: Texture[]): void {
  o.traverse((c) => {
    const ms = (c as { material?: unknown }).material;
    for (const m of (Array.isArray(ms) ? ms : ms ? [ms] : []) as Record<string, unknown>[]) for (const k of ['map', 'normalMap', 'emissiveMap']) if (m[k]) out.push(m[k] as Texture);
  });
}

/** Engancha la compilación al pintado de la escena (una vez, al arrancar). */
export function warmHook(renderer: WebGLRenderer, scene: Scene): void {
  if (W.hooked) return;
  W.hooked = true;
  W.keep = new Group();
  W.keep.name = 'precompilar';
  W.keep.visible = false; // (no se pinta: Three compila también lo escondido)
  scene.add(W.keep);
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...a: Parameters<Scene['onBeforeRender']>) {
    prev.apply(this, a);
    const cam = a[2] as Camera;
    try {
      if (W.want && W.wait-- <= 0) {
        // lo de la ronda que aún no se ha visto, de una vez (con la carátula del duelo ya en negro)
        W.want = false;
        W.queue.length = 0;
        HITCH.f.warm = 1; // (para el registro de tirones)
        renderer.compile(scene, cam);
      } else if (W.queue.length) {
        // en el menú, una copia por fotograma (RepArena: warmStep): así no se para la imagen de golpe
        const o = W.queue.shift()!;
        HITCH.f.warm = 1;
        renderer.compile(o, cam, scene);
        W.tex.length = 0;
        texOf(o, W.tex);
        for (const t of W.tex) renderer.initTexture(t); // (y sus texturas, subidas ya)
      }
    } catch {
      /* (si no se puede, se compila al dibujarlo) */
    }
  };
}

/** Pide compilar lo que haya en la escena dentro de unos fotogramas (frames: lo que tarda en verse la carátula en negro). */
export function warmSoon(frames = 0): void {
  W.want = true;
  W.wait = frames;
}

/** ¿Quedan copias por compilar? (se preparan de una en una) */
export function warmBusy(): boolean {
  return W.queue.length > 0;
}

/** Guarda una copia para compilarla (y subir sus texturas) en uno de los próximos fotogramas. */
export function warmKeep(o: Object3D): void {
  if (!W.keep) return;
  W.keep.add(o);
  W.queue.push(o);
}
