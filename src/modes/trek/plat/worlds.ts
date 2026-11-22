/**
 * Los mundos de la Travesía de plataformas (pedido del usuario: «pasar de pantalla»): cada «Tramos por mundo» tramos
 * (`trekWorld`, ajuste del usuario) el mundo cambia, con su suelo, su paisaje, sus retos propios y su jefe al final. Siempre
 * se empieza en el primero; pasado el último, se vuelve a empezar. Se pasa de uno a otro cruzando un portal de luz que
 * aparece tras el cofre del último tramo del mundo (elegido por el usuario).
 *
 * - **El bosque** (el de siempre): la pasarela de tablas, con sus cuatro paisajes; jefe, el Demonio verde.
 * - **El risco**: un sendero de roca pegado a un acantilado, con el vacío al otro lado; retos propios: la **cornisa** (el
 *   camino se estrecha: pegarse a la pared), las **rachas de viento** (aguantar inclinado contra el viento) y los
 *   **desprendimientos** (rocas que caen de lo alto a un lado del camino: apartarse al otro); jefe, el Yeti.
 * - **Las islas en el cielo**: islotes de roca flotando sobre un mar de nubes, al atardecer; casi todo son saltos, supersaltos
 *   y planeos. Retos propios: el **islote que sube y baja** (saltar cuando está a ras) y el **islote que se hunde** (cruzarlo
 *   sin pararse); el demonio es aquí un dragón que vuela a un lado. Sin túneles, cangrejos, cíclopes ni bifurcaciones (no hay
 *   suelo a los lados); jefe, el Alien alto.
 * - **La costa pirata**: un muelle de tablas sobre el mar, roto a trozos, con islotes de palmeras, huesos y barriles y un barco
 *   pirata al fondo. Retos propios: los **cañonazos** desde el barco (la bala alta, agacharse; la baja, rodando, saltar); los
 *   enemigos son piratas (el tiburón pirata llega corriendo y tira un tajo alto, y el esqueleto pirata, a un lado) y la
 *   calavera y el cangrejo; sin setas, demonios, cíclopes, túneles ni bifurcaciones. Jefe, el Capitán.
 *
 * Lógica pura, sin IWSDK.
 */
import { TREK_BIOMES, type TrekBiome } from '../path.js';
import type { PieceKind } from './types.js';

export type WorldKey = 'forest' | 'cliff' | 'sky' | 'coast';
/** Cómo es el suelo: la pasarela de tablas, el sendero de roca del risco, los islotes flotantes o el muelle sobre el mar. */
export type FloorStyle = 'dock' | 'cliff' | 'sky' | 'coast';

export interface World {
  key: WorldKey;
  /** Su nombre (el de la carátula: «MUNDO 2 · El risco»). */
  name: string;
  floor: FloorStyle;
  /** Su jefe (índice de `BOSSES`, types.ts). */
  boss: number;
  /** Sus paisajes, uno por tramo, por turnos (el fondo realista, la niebla y la luz). */
  biomes: TrekBiome[];
  /** El paisaje de los lados (de `DECO_BIOMES`, pieces.ts) de cada uno; en el risco no hay: lo pinta el suyo. */
  deco: number[];
  /** Sus retos propios (salen desde su primer tramo) y los que no salen en él. */
  extra: PieceKind[];
  without: PieceKind[];
}

/** Los paisajes del risco: la montaña y la cumbre (fondos realistas de Poly Haven ya en el juego). */
const CLIFF_BIOMES: TrekBiome[] = [
  { name: 'Paso de montaña', pano: 'montana', fog: 0xc8d6e4, dens: 0.008, hemi: 0xdce8ff, hemiI: 1.0, key: 0xfff4e4, keyI: 1.6, dusk: 0, trees: ['Pine_2', 'Pine_4', 'Pine_5'], nTree: 3, bush: 2, rock: 6, flower: 2, water: false },
  { name: 'Cumbre', pano: 'cumbre', fog: 0xd6e0ec, dens: 0.007, hemi: 0xe6eeff, hemiI: 1.05, key: 0xfff8ee, keyI: 1.7, dusk: 0, trees: ['Pine_4', 'DeadTree_1'], nTree: 2, bush: 1, rock: 7, flower: 0, water: false },
];

/** Los paisajes de las islas: el atardecer y el ocaso (fondos realistas ya en el juego). */
const SKY_BIOMES: TrekBiome[] = [
  { name: 'Islas al atardecer', pano: 'atardecer', fog: 0xe9b48e, dens: 0.006, hemi: 0xffd2ae, hemiI: 0.9, key: 0xffb070, keyI: 1.35, dusk: 1, trees: ['Pine_2', 'CommonTree_4'], nTree: 2, bush: 2, rock: 2, flower: 3, water: false },
  { name: 'Islas al ocaso', pano: 'ocaso', fog: 0xd59a9a, dens: 0.006, hemi: 0xf0c0c8, hemiI: 0.85, key: 0xff9a70, keyI: 1.25, dusk: 1, trees: ['CommonTree_3', 'Pine_4'], nTree: 2, bush: 2, rock: 2, flower: 3, water: false },
];

/** Los paisajes de la costa: el lago (el mar) y, al atardecer, el mismo con otra luz. */
const COAST_BIOMES: TrekBiome[] = [
  { name: 'Costa pirata', pano: 'lago', fog: 0xcfe4ee, dens: 0.008, hemi: 0xe2f2ff, hemiI: 1.0, key: 0xfff4e0, keyI: 1.6, dusk: 0, trees: ['CommonTree_4'], nTree: 1, bush: 1, rock: 2, flower: 0, water: true },
  { name: 'Costa al atardecer', pano: 'atardecer', fog: 0xe6b08a, dens: 0.008, hemi: 0xffd2ae, hemiI: 0.9, key: 0xffb070, keyI: 1.35, dusk: 1, trees: ['CommonTree_4'], nTree: 1, bush: 1, rock: 2, flower: 0, water: true },
];

export const WORLDS: World[] = [
  { key: 'forest', name: 'El bosque', floor: 'dock', boss: 1, biomes: TREK_BIOMES, deco: [0, 1, 2, 3], extra: [], without: [] },
  // (en el risco no hay bifurcación: la pasarela se abriría sobre el vacío)
  { key: 'cliff', name: 'El risco', floor: 'cliff', boss: 0, biomes: CLIFF_BIOMES, deco: [3, 3], extra: ['ledge', 'gust', 'rockfall'], without: ['fork'] },
  // (los saltos, el doble de veces; sin nada que pida suelo a los lados ni túneles)
  { key: 'sky', name: 'Las islas en el cielo', floor: 'sky', boss: 2, biomes: SKY_BIOMES, deco: [3, 3], extra: ['bob', 'sink', 'gap', 'glide', 'step', 'bob'], without: ['fork', 'crawl', 'burpee', 'side', 'quake'] },
  // (los cañonazos, el doble de veces; los enemigos, piratas: sin setas, demonios ni cíclopes)
  { key: 'coast', name: 'La costa pirata', floor: 'coast', boss: 3, biomes: COAST_BIOMES, deco: [3, 3], extra: ['cannon', 'cannon'], without: ['fork', 'crawl', 'burpee', 'quake', 'foe', 'fire'] },
];

/** Los tramos de cada mundo si no se dice (las pruebas; en el juego, siempre el ajuste «Tramos por mundo», de serie 3). */
export const WORLD_LEN = 4;
const len = (n: number | undefined): number => Math.max(1, Math.round(n || WORLD_LEN));

/** El mundo del tramo `t` (desde 0): su número desde 0 (sin dar la vuelta) y cuál es (dando la vuelta al acabar). */
export const worldNo = (t: number, n?: number): number => Math.floor(Math.max(0, t) / len(n));
export const worldOf = (t: number, n?: number): World => WORLDS[worldNo(t, n) % WORLDS.length];
/** ¿Es el último tramo de su mundo? (Su jefe sale antes del cofre y, tras él, el portal al siguiente.) */
export const worldEnd = (t: number, n?: number): boolean => (Math.max(0, t) + 1) % len(n) === 0;
/** ¿Es el primero de su mundo? */
export const worldStart = (t: number, n?: number): boolean => Math.max(0, t) % len(n) === 0;
/** El paisaje del tramo `t`: el de su mundo que le toca por turno. */
export function tramoBiome(t: number, n?: number): TrekBiome {
  const W = worldOf(t, n), k = Math.max(0, t) % len(n);
  return W.biomes[k % W.biomes.length];
}
/** El paisaje de los lados del tramo `t` (índice de `DECO_BIOMES`). */
export function tramoDeco(t: number, n?: number): number {
  const W = worldOf(t, n), k = Math.max(0, t) % len(n);
  return W.deco[k % W.deco.length];
}

/** Dónde está el portal tras el cofre del último tramo de un mundo (m pasado el cofre): lejos de él, antes de la carrera. */
export const PORTAL_AT = 6;
