/**
 * Los modelos de las manos y de los mandos, desde el propio juego (public/input-profiles) en vez de descargarlos de
 * internet cada vez: IWSDK los pide a cdn.jsdelivr.net a través de AssetManager.loadGLTF; aquí se cambia esa dirección
 * por la local para los que están copiados (manos, mandos de las Quest 3 y de las Quest 2). Los demás, de internet.
 */
import { AssetManager } from '@iwsdk/core';

const CDN = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/';
const LOCAL = new Set(['generic-hand', 'meta-quest-touch-plus', 'oculus-touch-v3']);

/** El modelo de la mano de ese lado para la mano que agarra el mando (src/input/controller-hand.ts): el mismo archivo que
 * la mano desnuda, con otra dirección para que IWSDK no los comparta (la mano desnuda cambia el suyo al crearse). */
export const handModelUrl = (side: 'left' | 'right'): string => `${import.meta.env.BASE_URL}input-profiles/generic-hand/${side}.glb?mando`;

/** Hay que llamarlo antes de crear el mundo. */
export function useLocalInputModels(): void {
  const original = AssetManager.loadGLTF.bind(AssetManager);
  AssetManager.loadGLTF = (urlOrKey: string, key?: string) => {
    if (urlOrKey.startsWith(CDN)) {
      const rest = urlOrKey.slice(CDN.length);
      if (LOCAL.has(rest.split('/')[0])) urlOrKey = `${import.meta.env.BASE_URL}input-profiles/${rest}`;
    }
    return original(urlOrKey, key);
  };
}
