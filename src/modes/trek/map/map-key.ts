/**
 * La clave de Cesium ion del jugador (para volar sobre el mapa: src/modes/trek/map/). Cada jugador pone la suya en la página
 * («Volar sobre el mapa»): no va dentro del juego publicado, que es público (si no, todos gastarían su cupo). Se guarda en el
 * navegador (y viaja con la sincronización, cifrada con su código: así se pega en el móvil o el ordenador y llega a las gafas).
 */
import { store } from '../../../core/settings.js';
import { num, settings, str } from '../../../core/values.js';
import { cityOf } from './map-route.js';

export const CESIUM_KEY = 'reparenaxr-cesium';
/** Los mapas 3D de Google en Cesium ion (el recurso que trae toda cuenta: «Google Photorealistic 3D Tiles»). */
export const GOOGLE_3D_ASSET = '2275207';

export const mapKey = (): string => {
  const k = store<string>(CESIUM_KEY);
  return typeof k === 'string' ? k.trim() : '';
};
export const setMapKey = (k: string): void => {
  store(CESIUM_KEY, k.trim());
};

/** ¿Se vuela sobre el mapa? En la Travesía, en plancha y volando, con una ciudad elegida y la clave puesta. */
export const mapWanted = (): boolean =>
  settings.mode === 'trek' && settings.exercise === 'pushup' && num('trekFly') > 0 && !!cityOf(str('flyMap')) && !!mapKey();
