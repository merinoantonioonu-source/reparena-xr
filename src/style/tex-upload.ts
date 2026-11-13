/**
 * Los dibujos que cambian (lienzos e imágenes) se suben a la tarjeta gráfica antes de pintar cada fotograma, no en medio.
 *
 * En las gafas, el Three de IWSDK (super-three, con las dos vistas a la vez) no sube los dibujos mientras pinta: los aparca y
 * los sube justo después, con la imagen de las gafas aún abierta (`src/runtime/deferred-texture-uploads.js` de IWSDK). Lo
 * vio el usuario: al mover un deslizador del menú (que se repintaba en cada paso, y también al pasar el rayo por encima),
 * el menú desaparecía a trozos y se veía el fondo a través, y la imagen iba a saltos (fotogramas de 33-42 ms en el
 * diagnóstico, en vez de 11). Aquí, cada dibujo marcado para subir (`needsUpdate`) se apunta y se sube al empezar el
 * pintado del fotograma siguiente (`scene.onBeforeRender`, antes de borrar la imagen y de las sombras): así la cola de IWSDK
 * llega vacía y nada se sube con la imagen abierta.
 *  - Solo lienzos e imágenes: las texturas de datos (los huesos de los personajes, que Three marca en cada fotograma
 *    mientras pinta) siguen como siempre.
 *  - Lo que se tira antes de subirse (`dispose`) se olvida: subirlo lo volvería a crear en la tarjeta gráfica.
 */
import { Texture } from '@iwsdk/core';
import type { Scene, WebGLRenderer } from '@iwsdk/core';

const PEND = new Set<Texture>();
const T = { hooked: false, n: 0 };

/** Cuántos dibujos se han subido antes de pintar (para el diagnóstico: lo que se sube en cada muestra). */
export const texUploads = (): number => T.n;

const gone = (e: { target: Texture }): void => {
  PEND.delete(e.target);
};

// un lienzo, una imagen ya cargada o un mapa de bits (las de datos, no)
function isPicture(img: unknown): boolean {
  if (!img || typeof img !== 'object') return false;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return img.complete && img.naturalWidth > 0;
  return (
    (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
    (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) ||
    (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)
  );
}

/** Engancha la subida al pintado de la escena (una vez, al arrancar). */
export function texUploadHook(renderer: WebGLRenderer, scene: Scene): void {
  if (T.hooked) return;
  const d = Object.getOwnPropertyDescriptor(Texture.prototype, 'needsUpdate');
  if (!d?.set) return; // (si Three cambia, se queda como estaba: se sube al pintarlo)
  T.hooked = true;
  const set = d.set;
  Object.defineProperty(Texture.prototype, 'needsUpdate', {
    ...d,
    set(this: Texture, v: boolean) {
      set.call(this, v);
      if (v !== true || (this as { isRenderTargetTexture?: boolean }).isRenderTargetTexture || (this as { isVideoTexture?: boolean }).isVideoTexture) return;
      PEND.add(this);
      this.addEventListener('dispose', gone); // (la misma función: no se apunta dos veces)
    },
  });
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...a: Parameters<Scene['onBeforeRender']>) {
    if (PEND.size) {
      for (const t of PEND) {
        // (ya subido, por ejemplo marcado mientras se pintaba y subido al acabar: nada que hacer)
        if (!isPicture(t.image) || (renderer.properties.get(t) as { __version?: number }).__version === t.version) continue;
        try {
          renderer.initTexture(t);
          T.n++;
        } catch {
          /* (si no se puede, se sube al pintarlo, como antes) */
        }
      }
      PEND.clear();
    }
    prev.apply(this, a);
  };
}
