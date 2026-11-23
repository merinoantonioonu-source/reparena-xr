/**
 * El viaje por portales de Combate (RepArena XR, pedido del usuario: «que nunca tenga la sensación de pasar siempre por el
 * mismo entorno y los mismos enemigos»): cada «Oleadas por entorno» oleadas, un portal de luz te lleva a otro entorno, en un
 * orden distinto en cada partida; y cada entorno trae su fauna («Enemigos de cada entorno»): los piratas en la isla, los
 * yetis en el risco, los zombis en la aldea… Lógica pura, sin IWSDK (se prueba en tests/unit/journey.test.ts); el portal lo
 * pinta src/combat/travel-system.ts y el entorno lo pone EnvSystem.
 */

/** Un sitio donde se juega: la fortaleza (la escena de IWSDK) o uno de los entornos de día. */
export type Place = 'arena' | 'nature' | 'island' | 'cliff' | 'sky' | 'village';
export const PLACES: readonly Place[] = ['arena', 'nature', 'village', 'cliff', 'sky', 'island'];

/** Su nombre (en el panel entre oleadas al cruzar el portal). */
export const PLACE_NAME: Record<Place, string> = { arena: 'La fortaleza', nature: 'El bosque', island: 'La isla pirata', cliff: 'El risco', sky: 'Las islas del cielo', village: 'La aldea' };

/** La fauna de cada sitio: los de tierra y los voladores (el dragón solo sale de jefe). De los que ya hay. */
export const FAUNA: Record<Place, { ground: string[]; fly: string[] }> = {
  arena: { ground: ['robot', 'imp', 'puglin', 'thrower'], fly: ['bee', 'bat'] },
  nature: { ground: ['zgreen', 'puglin', 'raptor', 'greendemon'], fly: ['bee'] },
  island: { ground: ['skeleton', 'sharky', 'mako', 'captain'], fly: ['bat', 'cthulhu'] },
  cliff: { ground: ['skull', 'demon', 'yeti', 'cyclops'], fly: ['bat', 'dragon'] },
  sky: { ground: ['alien', 'greendemon', 'alientall', 'demon'], fly: ['bee', 'cthulhu', 'dragon'] },
  village: { ground: ['zombie', 'zgreen', 'skull', 'zchubby', 'thrower'], fly: ['bat'] },
};

/** El azar de cada partida (el mismo con la misma semilla). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** El orden de la partida: empieza en `start` y luego los demás, barajados con la semilla (cada partida, otro orden; sin
 * semilla, el de siempre). Pasado el último, vuelta a empezar. */
export function journeyRoute(start: Place, seed: number): Place[] {
  const rest = PLACES.filter((p) => p !== start);
  if (seed) {
    const R = rng(seed);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
  }
  return [start, ...rest];
}

/** El tramo del viaje de la oleada i (desde 0) con `per` oleadas por entorno. */
export const legOf = (i: number, per: number): number => Math.floor(Math.max(0, i) / Math.max(1, per));

/** Dónde se juega la oleada i. */
export const placeAt = (route: readonly Place[], i: number, per: number): Place => route[legOf(i, per) % route.length] ?? 'arena';

/** ¿Al empezar la oleada i se cruza un portal? (la primera, nunca) */
export const travelsAt = (route: readonly Place[], i: number, per: number): boolean => route.length > 1 && i > 0 && legOf(i, per) !== legOf(i - 1, per);

/** Los de ese sitio que ya se pueden sacar (`ready`); el dragón va en los voladores (la partida lo deja solo de jefe). */
export function faunaOf(place: Place, ready: (k: string) => boolean): { ground: string[]; fly: string[] } {
  const F = FAUNA[place];
  return { ground: F.ground.filter(ready), fly: F.fly.filter(ready) };
}
