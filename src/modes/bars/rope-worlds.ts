/**
 * Las zonas de la montaña de la cuerda del remo invertido (elegido por el usuario: «A», un solo cable del valle a la cima, y
 * los mundos como **una montaña, de abajo arriba**): según lo que llevas subido de la ronda, debajo pasan el valle, el bosque,
 * la garganta y la cima, como en una montaña de verdad. Se ven llegar (el paisaje de delante ya es el de la zona siguiente) y
 * cambian poco a poco, sin portales ni destellos.
 *  - **El valle**: prados con flores, el lago donde acaba el río y bosquecillos en los bordes.
 *  - **El bosque**: pinares cerrados con claros, helechos y rocas; el río baja por un lado.
 *  - **La garganta**: el río encajonado entre dos paredes de roca, con las cascadas que le dan agua.
 *  - **La cima**: roca desnuda y hierba rala; abajo, el mar de nubes; arriba, la estación.
 * Lógica pura, sin IWSDK.
 */

export type RopeWorldKey = 'valley' | 'forest' | 'gorge' | 'summit';

export interface RopeWorld {
  key: RopeWorldKey;
  name: string;
  /** Su foto de fondo (de `public/fondos`): lo lejano, según la altura. */
  pano: string;
  /** El color de su hierba (el suelo se tiñe poco a poco de una zona a la otra; donde es empinado, roca). */
  ground: number;
}

export const ROPE_WORLDS: RopeWorld[] = [
  { key: 'valley', name: 'El valle', pano: 'aldea', ground: 0x7aa653 },
  { key: 'forest', name: 'El bosque', pano: 'montana', ground: 0x55803f },
  { key: 'gorge', name: 'La garganta', pano: 'montana', ground: 0x6b8a4e },
  { key: 'summit', name: 'La cima', pano: 'cumbre', ground: 0x8a9270 },
];

/** La zona de un punto de la subida (`f`: lo subido de la ronda, de 0 a 1): un cuarto cada una. */
export const zoneNo = (f: number): number => Math.max(0, Math.min(ROPE_WORLDS.length - 1, Math.floor(f * ROPE_WORLDS.length)));
export const zoneOf = (f: number): RopeWorld => ROPE_WORLDS[zoneNo(f)];
/** Lo que pesa cada zona en `f` (0-1), para teñir y mezclar el paisaje en el paso de una a otra (`w` de ancho, en f). */
export function zoneWeight(k: number, f: number, w = 0.035): number {
  const n = ROPE_WORLDS.length, a = k / n, b = (k + 1) / n;
  const up = k === 0 ? 1 : smooth(a - w, a + w, f), down = k === n - 1 ? 1 : 1 - smooth(b - w, b + w, f);
  return Math.max(0, Math.min(up, down));
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** La foto del tramo i (de n): la de la zona de su mitad. Cambia solo entre tramos (en el descanso: la foto no se funde). */
export const worldPano = (i: number, n: number): string => zoneOf((Math.max(0, i) + 0.5) / Math.max(1, n)).pano;
