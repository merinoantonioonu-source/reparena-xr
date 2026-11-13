/**
 * El sistema que ajusta las letras de los paneles que se ven (la medida, en src/ui/fit.ts): un panel por fotograma.
 */
import { createSystem } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { fitPanel } from './fit.js';

export { FIT_LOG } from './fit.js';

/** Los paneles de la escena (`public/scenes/main.iwsdk.scene.json`; todos de UIKitML). */
const PANELS = ['board', 'warn', 'charge', 'wave', 'trophy', 'center', 'toast'].map((n) => `${n}-panel`);

const shown = (o: Object3D): boolean => {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** Recorre los paneles que se ven, uno por fotograma (los grandes, como Opciones, tienen cientos de textos). */
export class FitTextSystem extends createSystem({}, {}) {
  private t = 0;
  private i = 0;

  update(delta: number): void {
    this.t -= delta;
    if (this.t > 0) return;
    const o = this.world.getSceneObject(PANELS[this.i % PANELS.length]);
    this.i++;
    if (this.i % PANELS.length === 0) this.t = 0.3; // (una vuelta entera cada ~0,6 s)
    if (o && shown(o)) fitPanel(o);
  }
}
