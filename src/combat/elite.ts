/**
 * Los enemigos de élite y el jefe errante de Combate (RepArena XR, elegidos por el usuario para que no parezcan siempre los
 * mismos). De vez en cuando, uno de los de tierra sale con un rasgo, y se le ve por el aro de color a sus pies:
 *  - **rápido** (rojo): se mueve y golpea mucho más deprisa;
 *  - **gigante** (naranja): el doble de grande, más lento y pesado, y quita una vida más;
 *  - **con escudo** (turquesa): una burbuja que para los disparos; se rompe con tres o, de golpe, con una carga ×3;
 *  - **que se divide** (verde): al caer, salen dos pequeños;
 *  - **que parpadea** (violeta): de vez en cuando desaparece un instante y reaparece a un lado.
 * Y el **jefe errante**: a veces, en una oleada normal (desde la tercera), un jefe de los de ese entorno sale a mitad de la
 * oleada, sin avisar; su vida sale de los que quedaban por salir (la oleada pide las mismas repeticiones).
 * Lógica pura, sin IWSDK (se prueba en tests/unit/elite.test.ts); lo pinta y lo hace src/combat/enemies.ts.
 */
import type { WaveSpec } from './waves.js';

export type Elite = 'fast' | 'giant' | 'shield' | 'split' | 'blink';
export const ELITES: readonly Elite[] = ['fast', 'giant', 'shield', 'split', 'blink'];
/** El color de su aro. */
export const ELITE_COL: Record<Elite, number> = { fast: 0xff3b3b, giant: 0xff9f1c, shield: 0x3cf0ff, split: 0x7dff4a, blink: 0xb46bff };
/** Los disparos que aguanta el escudo (y con una carga de al menos ×`SHIELD_POW`, se rompe de golpe). */
export const SHIELD_HITS = 3, SHIELD_POW = 3;

/** La probabilidad de que uno salga de élite en la oleada i (desde 0) con el rango (0 a 6): ninguno en la primera; luego, poco
 * a poco más (como mucho, uno de cada tres). */
export const eliteChance = (i: number, rank: number): number => (i < 1 ? 0 : Math.min(0.33, 0.06 + 0.025 * i + 0.015 * rank));

/** El jefe de esa clase (RepArena: gb), como nombre de la cola. */
export const roamKindOf = (g: string): string => (g === 'robot' ? 'titan' : g === 'imp' || g === 'puglin' || g === 'thrower' ? 'impboss' : g + 'boss');

export interface SpiceEnv {
  /** Oleada (desde 0) y rango. */
  i: number;
  rank: number;
  /** «Enemigos de élite» y «Jefe errante». */
  elites: boolean;
  roam: boolean;
  /** ¿Es la oleada del jefe? (entonces, sin errante) */
  bossWave: boolean;
  /** Los de tierra que salen (para el errante) y si uno de la cola es de tierra y no jefe. */
  ground: string[];
  isGround: (kind: string) => boolean;
  rnd: () => number;
}

/** Le pone a la cola de la oleada sus élites y, a veces, el jefe errante (cambia la lista). Devuelve si hay errante. */
export function spiceWave(list: WaveSpec[], E: SpiceEnv): boolean {
  if (E.elites) {
    const p = eliteChance(E.i, E.rank);
    let last = -2;
    for (let j = 0; j < list.length; j++) {
      const s = list[j];
      // (nunca dos seguidos: que se distingan)
      if (j - last < 2 || !E.isGround(s.kind) || E.rnd() >= p) continue;
      s.elite = ELITES[Math.floor(E.rnd() * ELITES.length)];
      last = j;
    }
  }
  if (!E.roam || E.bossWave || E.i < 2 || !E.ground.length || list.length < 4 || E.rnd() >= 0.22 + 0.02 * E.rank) return false;
  // su vida, de los que quedaban por salir al final (la oleada pide lo mismo): una cuarta parte, al menos 3
  const total = list.reduce((a, s) => a + s.hp, 0), want = Math.max(3, Math.round(total * 0.25));
  let hp = 0;
  while (hp < want && list.length > 2) hp += list.pop()!.hp;
  const g = E.ground[Math.floor(E.rnd() * E.ground.length)];
  list.splice(Math.floor(list.length / 2), 0, { kind: roamKindOf(g), hp, roam: true });
  return true;
}
