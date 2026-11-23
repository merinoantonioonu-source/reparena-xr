/**
 * La hora y el tiempo de cada oleada en los entornos de día (pedido del usuario: «hora y tiempo que cambian por oleada»):
 * la primera de día y luego la tarde, el ocaso, la noche y el alba, por turnos; el tiempo, despejado casi siempre, a veces con
 * niebla, lluvia o (en el risco y la aldea) nieve; la oleada del jefe, con tormenta. Y cómo se ve cada cosa: los colores del
 * cielo, el sol, la luz de relleno y la niebla. Lógica pura (sin IWSDK): el entorno lo aplica (src/env/env-system.ts).
 */

export type Phase = 'dia' | 'tarde' | 'ocaso' | 'noche' | 'alba';
export type Weather = 'claro' | 'niebla' | 'lluvia' | 'nieve' | 'tormenta';

/** Las horas, en el orden en que van pasando las oleadas. */
export const PHASES: readonly Phase[] = ['dia', 'tarde', 'ocaso', 'noche', 'alba'];

/** El nombre que se enseña (en el panel de la oleada). */
export const PHASE_NAMES: Record<Phase, string> = { dia: 'De día', tarde: 'Por la tarde', ocaso: 'Al ocaso', noche: 'De noche', alba: 'Al alba' };
export const WEATHER_NAMES: Record<Weather, string> = { claro: '', niebla: 'con niebla', lluvia: 'con lluvia', nieve: 'nevando', tormenta: '¡tormenta!' };

/** Los entornos donde puede nevar. */
const SNOWY = ['cliff', 'village'];

/** Un número de 0 a 1 que sale siempre igual para la oleada y el entorno (sin azar del juego). */
function hash(w: number, kind: string): number {
  let h = 2166136261 ^ (w * 374761393);
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** La hora y el tiempo de la oleada `wave` (desde 1) en el entorno `kind`; `boss`, si es la del jefe; `off`, por qué hora
 * se empieza (con «Entorno distinto en cada partida», otra cada vez; 0, de día). */
export function wavePlan(wave: number, kind: string, boss: boolean, off = 0): { phase: Phase; weather: Weather } {
  const w = Math.max(1, wave), phase = PHASES[(w - 1 + off) % PHASES.length];
  if (boss) return { phase, weather: 'tormenta' };
  if (w === 1) return { phase, weather: 'claro' };
  const r = hash(w, kind);
  const weather: Weather = r < 0.55 ? 'claro' : r < 0.72 ? 'niebla' : r < 0.9 || !SNOWY.includes(kind) ? 'lluvia' : 'nieve';
  return { phase, weather };
}

/** Cómo se ve: el cielo (arriba y en el horizonte), dónde va el sol (0: en el horizonte, 1: arriba) y su color y fuerza
 * (× la de la escena), la luz de relleno (color y fuerza), la niebla (color y × su densidad), las nubes (0 a 1), las estrellas
 * (0 a 1), la lluvia y la nieve (0 a 1) y los relámpagos (0 o 1). */
export interface SkyLook {
  top: number;
  hor: number;
  sunY: number;
  sun: number;
  sunI: number;
  fill: number;
  fillI: number;
  fog: number;
  fogK: number;
  cloud: number;
  stars: number;
  rain: number;
  snow: number;
  storm: number;
}

const BASE: Record<Phase, SkyLook> = {
  dia: { top: 0x5294e0, hor: 0xc7e0ee, sunY: 0.62, sun: 0xfff2dc, sunI: 1, fill: 0xffffff, fillI: 1, fog: 0xc4dcea, fogK: 1, cloud: 0.4, stars: 0, rain: 0, snow: 0, storm: 0 },
  tarde: { top: 0x4a86d0, hor: 0xe8d8b0, sunY: 0.32, sun: 0xffe0b0, sunI: 0.95, fill: 0xfff0dc, fillI: 0.95, fog: 0xd8d6c4, fogK: 1, cloud: 0.45, stars: 0, rain: 0, snow: 0, storm: 0 },
  ocaso: { top: 0x3b4f8f, hor: 0xff9a5c, sunY: 0.05, sun: 0xff8a50, sunI: 0.62, fill: 0xd8a0b0, fillI: 0.75, fog: 0xe0a888, fogK: 1.15, cloud: 0.5, stars: 0.1, rain: 0, snow: 0, storm: 0 },
  noche: { top: 0x0b1230, hor: 0x2b3a66, sunY: 0.5, sun: 0x9fb4ff, sunI: 0.38, fill: 0x5868a8, fillI: 0.55, fog: 0x1c2440, fogK: 1.25, cloud: 0.3, stars: 1, rain: 0, snow: 0, storm: 0 },
  alba: { top: 0x6f8fc9, hor: 0xf2c7a6, sunY: 0.12, sun: 0xffc89a, sunI: 0.78, fill: 0xe8d6e6, fillI: 0.85, fog: 0xe6cdb8, fogK: 1.1, cloud: 0.4, stars: 0.05, rain: 0, snow: 0, storm: 0 },
};

/** Mezcla dos colores (k de 0 a 1). */
export function mixHex(a: number, b: number, k: number): number {
  // (redondeando hacia el destino: a pasos pequeños, el redondeo normal se quedaba parado a unos tonos de él)
  const ch = (s: number): number => {
    const x = (a >> s) & 255, y = (b >> s) & 255, v = x * (1 - k) + y * k;
    return x < y ? Math.ceil(v - 1e-9) : Math.floor(v + 1e-9);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Cómo se ve la hora `phase` con el tiempo `weather` (en `out`). */
export function skyLook(phase: Phase, weather: Weather, out: SkyLook = { ...BASE.dia }): SkyLook {
  Object.assign(out, BASE[phase]);
  const grey = phase === 'noche' ? 0x1a2030 : 0x8a95a3;
  if (weather === 'niebla') {
    out.fogK *= 2.4;
    out.cloud = Math.min(1, out.cloud + 0.25);
    out.hor = mixHex(out.hor, out.fog, 0.6);
  } else if (weather === 'lluvia' || weather === 'nieve' || weather === 'tormenta') {
    const k = weather === 'tormenta' ? 0.8 : 0.55;
    out.top = mixHex(out.top, weather === 'tormenta' ? 0x202630 : grey, k);
    out.hor = mixHex(out.hor, weather === 'tormenta' ? 0x3a4250 : mixHex(grey, 0xffffff, weather === 'nieve' ? 0.5 : 0.2), k);
    out.fog = mixHex(out.fog, weather === 'tormenta' ? 0x2e3440 : weather === 'nieve' ? 0xd8dee6 : 0x8f99a6, k);
    out.sunI *= weather === 'tormenta' ? 0.4 : 0.65;
    out.fillI *= weather === 'tormenta' ? 0.7 : 0.9;
    out.fogK *= weather === 'nieve' ? 1.9 : 1.6;
    out.cloud = 1;
    out.stars = 0;
    out.rain = weather === 'nieve' ? 0 : weather === 'tormenta' ? 1 : 0.6;
    out.snow = weather === 'nieve' ? 1 : 0;
    out.storm = weather === 'tormenta' ? 1 : 0;
  }
  return out;
}

/** Acerca `cur` a `to` (k de 0 a 1 de lo que falta; los colores, mezclados). */
export function lerpLook(cur: SkyLook, to: SkyLook, k: number): SkyLook {
  for (const key of ['top', 'hor', 'sun', 'fill', 'fog'] as const) cur[key] = mixHex(cur[key], to[key], k);
  for (const key of ['sunY', 'sunI', 'fillI', 'fogK', 'cloud', 'stars', 'rain', 'snow', 'storm'] as const) cur[key] += (to[key] - cur[key]) * k;
  return cur;
}
