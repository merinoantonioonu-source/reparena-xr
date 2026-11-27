/**
 * La clave de Cesium ion del jugador (para volar sobre el mapa: src/modes/trek/map/). Cada jugador pone la suya en la página
 * («Volar sobre el mapa»): no va dentro del juego publicado, que es público (si no, todos gastarían su cupo). Se guarda en el
 * navegador (y viaja con la sincronización, cifrada con su código: así se pega en el móvil o el ordenador y llega a las gafas).
 */
import { store } from '../../../core/settings.js';
import { num, settings, str } from '../../../core/values.js';
import { cityOf, type City } from './map-route.js';

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

/** El lugar del jugador (pedido del usuario: «navegar por el mundo sin ciudades concretas»): unas coordenadas puestas en la
 * página (map-place.ts); viaja con la sincronización, como la clave. Y donde dejó su último vuelo (en este aparato). */
export const MAP_PLACE_KEY = 'reparenaxr-mapplace', MAP_LAST_KEY = 'reparenaxr-maplast';
export interface MapSpot {
  lat: number;
  lon: number;
  /** A qué altura sobre el suelo ibas (m) y hacia dónde (rad): solo en «donde lo dejaste». */
  agl?: number;
  heading?: number;
}
const spot = (k: string): MapSpot | null => {
  const v = store<MapSpot>(k);
  return v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 89 && Math.abs(v.lon) <= 180 ? v : null;
};
export const mapPlace = (): MapSpot | null => spot(MAP_PLACE_KEY);
export const setMapPlace = (p: MapSpot | null): void => {
  store(MAP_PLACE_KEY, p);
};
export const mapLast = (): MapSpot | null => spot(MAP_LAST_KEY);
export const setMapLast = (p: MapSpot): void => {
  store(MAP_LAST_KEY, p);
};

/**
 * De dónde se sale: la ciudad elegida en «Volando: sobre el mapa» (con su ruta de aros), «Tu lugar» (las coordenadas de la
 * página) o «Donde lo dejaste» (tu último vuelo; si aún no hay, tu lugar); los dos últimos, sin aros: vuelo libre. null: no
 * hay de dónde salir (sin elegir, o «Tu lugar» sin poner).
 */
export function mapStart(id: string = str('flyMap')): { city: City; agl?: number; heading?: number } | null {
  const c = cityOf(id);
  if (c) return { city: c };
  const free = (name: string, s: MapSpot): { city: City; agl?: number; heading?: number } => ({ city: { id, name, lat: s.lat, lon: s.lon, h: 0, route: [] }, agl: s.agl, heading: s.heading });
  if (id === 'last') {
    const L = mapLast(), P = mapPlace();
    return L ? free('Donde lo dejaste', L) : P ? free('Tu lugar', P) : null;
  }
  if (id === 'place') {
    const P = mapPlace();
    return P ? free('Tu lugar', P) : null;
  }
  return null;
}

/** ¿Se vuela sobre el mapa? En la Travesía, en plancha y volando, con de dónde salir y la clave puesta. */
export const mapWanted = (): boolean => settings.mode === 'trek' && settings.exercise === 'pushup' && num('trekFly') > 0 && !!mapStart() && !!mapKey();

/** ¿Se vuela en parapente? En Barras, con el remo invertido y «Remo invertido: parapente»: sobre el mapa, con de dónde salir y
 * la clave puesta (si no, el remo de siempre); o el combate en las islas del cielo («sky», sin mapa ni clave). */
export const paraWanted = (): boolean =>
  settings.mode === 'bars' && settings.exercise === 'row' && !!str('barPara') && (str('barPara') === 'sky' || (!!mapStart(str('barPara')) && !!mapKey()));
/** ¿Es el combate en las islas del cielo? */
export const paraSky = (): boolean => paraWanted() && str('barPara') === 'sky';

/** Lo que le ha pasado al mapa las últimas veces (en este aparato; no viaja con la sincronización): la página lo enseña en
 * «Volar sobre el mapa», para saber por qué no carga sin depender del diagnóstico (que solo guarda los últimos 30 s). */
export const MAP_LOG_KEY = 'reparenaxr-maplog';
export interface MapLogLine {
  t: number;
  text: string;
}
export const mapLogRead = (): MapLogLine[] => {
  const v = store<MapLogLine[]>(MAP_LOG_KEY);
  return Array.isArray(v) ? v : [];
};
export const mapLog = (text: string): void => {
  try {
    const L = mapLogRead();
    L.push({ t: Date.now(), text });
    globalThis.localStorage?.setItem(MAP_LOG_KEY, JSON.stringify(L.slice(-24)));
  } catch {
    /* (sin guardado: no pasa nada) */
  }
};
