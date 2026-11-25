/**
 * El lugar donde empezar a volar sobre el mapa (pedido del usuario: «navegar por el mundo sin ciudades concretas»): unas
 * coordenadas o un enlace de Google Maps pegados en la página. Lógica pura (se prueba en tests/unit/map-place.test.ts).
 */

export interface Place {
  lat: number;
  lon: number;
}

const ok = (lat: number, lon: number): Place | null => (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 89 && Math.abs(lon) <= 180 ? { lat, lon } : null);
const N = '(-?\\d{1,3}(?:\\.\\d+)?)';

/** Los grados, minutos y segundos de una coordenada («40°25'01.0"N») a grados. */
function dms(d: string, m: string, s: string, h: string): number {
  const v = +d + +m / 60 + +s.replace(',', '.') / 3600;
  return /[SWO]/i.test(h) ? -v : v;
}

/**
 * Lo que hay pegado, a coordenadas (grados), o null si no se entiende. Vale:
 * - un enlace largo de Google Maps (el punto marcado, `!3d…!4d…`; si no, el centro del mapa, `@lat,lon`; o `?q=lat,lon`);
 * - dos números con punto («40.4169, -3.7035») o con coma a la española («40,4169 -3,7035», «40,4169, -3,7035»);
 * - grados, minutos y segundos («40°25'01.0"N 3°42'12.6"W»), o grados con su letra («40.4169° N, 3.7035° O»).
 */
export function parsePlace(text: string): Place | null {
  const t = text.trim();
  if (!t) return null;
  // el punto marcado de un enlace de Google Maps (el último: el del sitio, no el del mapa)
  const pins = [...t.matchAll(new RegExp(`!3d${N}!4d${N}`, 'g'))];
  if (pins.length) return ok(+pins[pins.length - 1][1], +pins[pins.length - 1][2]);
  const at = t.match(new RegExp(`@${N},${N}`));
  if (at) return ok(+at[1], +at[2]);
  const q = t.match(new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?${N}(?:,|%2C)\\+?${N}`, 'i'));
  if (q) return ok(+q[1], +q[2]);
  if (/^https?:/i.test(t)) return null; // (un enlace sin coordenadas: no se adivina)
  // grados, minutos y segundos
  const D = t.match(/(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([NS])[\s,;]+(\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|'')?\s*([EWO])/i);
  if (D) return ok(dms(D[1], D[2], D[3], D[4]), dms(D[5], D[6], D[7], D[8]));
  // grados con su letra
  const H = t.match(/(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NS])[\s,;]+(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([EWO])/i);
  if (H) return ok(dms(H[1].replace(',', '.'), '0', '0', H[2]), dms(H[3].replace(',', '.'), '0', '0', H[4]));
  // dos números: con punto, o con coma a la española
  const P = t.match(new RegExp(`^${N}\\s*[,;\\s]\\s*${N}$`));
  if (P) return ok(+P[1], +P[2]);
  const S = t.match(/^(-?\d{1,3},\d+)\s*(?:[;\s]|,\s)\s*(-?\d{1,3},\d+)$/);
  if (S) return ok(+S[1].replace(',', '.'), +S[2].replace(',', '.'));
  return null;
}

/** ¿Es un enlace corto de Google Maps? (No lleva las coordenadas: hay que abrirlo y copiar el largo.) */
export const isShortLink = (text: string): boolean => /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text);

/** Las coordenadas, para enseñarlas («40,4169° N · 3,7035° O»). */
export function placeText(lat: number, lon: number): string {
  const f = (v: number): string => Math.abs(v).toFixed(4).replace('.', ',');
  return `${f(lat)}° ${lat >= 0 ? 'N' : 'S'} · ${f(lon)}° ${lon >= 0 ? 'E' : 'O'}`;
}
