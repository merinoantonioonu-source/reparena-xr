/**
 * Pone en la escena las partículas de todo el juego (`vfx()`, src/style/vfx.ts) y las mueve en cada fotograma; en pausa,
 * quietas.
 */
import { createSystem } from '@iwsdk/core';
import { GAME } from '../core/state.js';
import { vfx } from './vfx.js';

export class VfxSystem extends createSystem({}) {
  init(): void {
    this.world.createTransformEntity(vfx().group);
  }

  update(dt: number): void {
    if (!GAME.paused) vfx().update(Math.min(dt, 0.1));
  }
}
