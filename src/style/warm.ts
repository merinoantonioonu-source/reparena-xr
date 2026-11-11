/**
 * Precompilar los sombreadores antes de la ronda (RepArena: warmQueue/warmStep, src/70_game.js): sin esto, lo que se pinta
 * por primera vez (el primer enemigo de cada clase, el que se desvanece al morir, sus colores…) se compila en plena partida y
 * la imagen da un tirón en las gafas (lo vio el usuario: «al hacer la sentadilla, toda la escena se queda atascada un
 * momento»). IWSDK no trae nada para esto.
 *  - Las copias que hay que compilar se guardan en un grupo escondido de la escena (`warmKeep`): así sus programas no se
 *    borran, y se compilan con todo lo demás.
 *  - La compilación se hace dentro del pintado de un fotograma (justo antes de dibujar), con la misma imagen de destino que
 *    usan las gafas (las dos vistas a la vez): fuera del pintado, Three compilaría otra versión que en las gafas no sirve.
 *  - Se pide al empezar cada ronda (`warmSoon`), mientras la carátula del duelo lo tapa todo de negro.
 */
import { Group } from '@iwsdk/core';
import { HITCH } from '../core/hitch.js';
import type { Camera, Object3D, Scene, Texture, WebGLRenderer } from '@iwsdk/core';

const W = { want: false, hooked: false, keep: null as Group | null, tex: new Set<Texture>() };

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
    const cam = a[2];
    if (!W.want) return;
    W.want = false;
    HITCH.f.warm = 1; // (para el registro de tirones)
    try {
      renderer.compile(scene, cam as Camera);
      for (const t of W.tex) renderer.initTexture(t); // (y sus texturas, subidas ya)
      W.tex.clear();
    } catch {
      /* (si no se puede, se compila al dibujarlo) */
    }
  };
}

/** Pide compilar lo que haya en la escena en el próximo fotograma. */
export function warmSoon(): void {
  W.want = true;
}

/** Guarda una copia para compilarla (y sus texturas, para subirlas). */
export function warmKeep(o: Object3D): void {
  if (!W.keep) return;
  W.keep.add(o);
  o.traverse((c) => {
    const ms = (c as { material?: unknown }).material;
    for (const m of (Array.isArray(ms) ? ms : ms ? [ms] : []) as Record<string, unknown>[]) for (const k of ['map', 'normalMap', 'emissiveMap']) if (m[k]) W.tex.add(m[k] as Texture);
  });
}
