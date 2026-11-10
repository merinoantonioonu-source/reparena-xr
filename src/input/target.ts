/**
 * A quién se puede apuntar: lo mínimo que necesitan la sacudida, la mirada y el puñetazo de cada enemigo (como los
 * enemigos de RepArena: si sigue vivo, su radio y su centro).
 */
import type { Vector3 } from 'three';

export interface Target {
  readonly alive: boolean;
  readonly radius: number;
  /** Su centro (en el mundo), en out. */
  center(out: Vector3): Vector3;
}
