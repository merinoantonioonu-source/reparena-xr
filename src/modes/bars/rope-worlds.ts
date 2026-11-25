/**
 * Los mundos de la cuerda del remo invertido (PR 3 de docs/PLAN-BARRAS-CUERDA.md; los de los bocetos del usuario: la A para
 * empezar y la B, la C y la D como «los mundos siguientes»): cada uno, su paisaje, su foto de fondo y sus torres.
 *  - **Los Alpes** (A): torres de madera por la ladera de un valle con pinos.
 *  - **La garganta** (B): pilares de roca entre dos paredes con cascadas, sobre el río.
 *  - **La selva** (C): árboles gigantes con plataformas en lo alto, entre árboles y matorral.
 *  - **La costa** (D): del barco pirata al acantilado, con palmeras y el mar debajo.
 * Se pasa de uno al siguiente al llegar a la plataforma de su último tramo (con un destello, como el portal de la Travesía).
 * Lógica pura, sin IWSDK.
 */

export type RopeWorldKey = 'alps' | 'gorge' | 'jungle' | 'coast';

export interface RopeWorld {
  key: RopeWorldKey;
  name: string;
  /** Sus fotos de fondo (de `public/fondos`), de abajo arriba: según lo que llevas subido en el mundo. */
  panos: string[];
  /** El color del suelo (la ladera). */
  ground: number;
  /** Cómo son sus torres. */
  tower: 'wood' | 'rock' | 'tree';
}

export const ROPE_WORLDS: RopeWorld[] = [
  { key: 'alps', name: 'Los Alpes', panos: ['aldea', 'montana'], ground: 0x86b25e, tower: 'wood' },
  { key: 'gorge', name: 'La garganta', panos: ['bosque'], ground: 0x9c8a6e, tower: 'rock' },
  { key: 'jungle', name: 'La selva', panos: ['lago'], ground: 0x4f8a3c, tower: 'tree' },
  { key: 'coast', name: 'La costa', panos: ['cumbre', 'ocaso'], ground: 0xc9b483, tower: 'wood' },
];

/** Cuántos tramos dura cada mundo en una ronda de n: con 4 o menos, uno cada uno (se ven varios aunque la ronda sea corta,
 * como en la Travesía); con más, a partes iguales. */
export const worldLen = (n: number): number => Math.max(1, Math.ceil(n / ROPE_WORLDS.length));

/** El mundo del tramo i (de n): su número (vuelve a empezar pasado el último). */
export const worldNo = (i: number, n: number): number => Math.floor(Math.max(0, i) / worldLen(n)) % ROPE_WORLDS.length;
export const worldOf = (i: number, n: number): RopeWorld => ROPE_WORLDS[worldNo(i, n)];

/** ¿Es el tramo i el primero de un mundo nuevo (al llegar a él, se cambia)? */
export const worldStarts = (i: number, n: number): boolean => i > 0 && worldNo(i, n) !== worldNo(i - 1, n);

/** La foto del tramo i (de n): la de su mundo, según lo que llevas subido en él (abajo, la primera; arriba, la última). En
 * la costa, el último tramo de la ronda, al ocaso. */
export function worldPano(i: number, n: number): string {
  const W = worldOf(i, n), L = worldLen(n), k = i % L;
  if (W.key === 'coast' && i === n - 1 && L > 1) return W.panos[W.panos.length - 1];
  return W.panos[Math.min(W.panos.length - 1, L > 1 ? Math.floor((k / L) * W.panos.length) : 0)];
}
