/**
 * El estilo Cómic en el juego (src/style/comic.ts): prepara cada cosa que aparece en la escena (su sombreador de cómic y
 * su contorno de tinta), mueve las nubes y lo quita o lo pone al cambiar «Estilo visual» (Cómic, el de serie, o Realista).
 * El cielo, la neblina y el tono de la imagen son los de IWSDK (en la escena); en Realista, el tono de cine (ACES).
 */
import { ACESFilmicToneMapping, createSystem, NoToneMapping, Transform, UIKit } from '@iwsdk/core';
import type { Object3D, ShaderMaterial } from '@iwsdk/core';
import { onSettingsChange } from '../core/settings.js';
import { str } from '../core/values.js';
import { COMIC, comicApply, comicScan, type SkipTest } from './comic.js';

// los paneles de UIKit tienen sus propios materiales: el cómic no los toca
const skipUI: SkipTest = (o: Object3D) => o instanceof UIKit.Component;
const lookComic = (): boolean => str('look') !== 'real';

export class ComicSystem extends createSystem({ placed: { required: [Transform] } }, {}) {
  private clouds: ShaderMaterial | null = null;
  private sweepT = 0;

  init(): void {
    COMIC.on = lookComic();
    this.applyTone();
    // lo que aparece (enemigos, efectos…), preparado al momento, antes de que se compile
    this.cleanupFuncs.push(
      this.queries.placed.subscribe('qualify', (e) => {
        if (e.object3D) comicScan(e.object3D, skipUI);
      }),
    );
    this.cleanupFuncs.push(
      onSettingsChange((k) => {
        if (k !== 'look' && k !== '*') return;
        comicApply(lookComic(), this.scene, skipUI);
        this.applyTone();
      }),
    );
  }

  // sin el «tono de cine» (comprime los colores): los del dibujo, tal cual
  private applyTone(): void {
    this.world.renderer.toneMapping = COMIC.on ? NoToneMapping : ACESFilmicToneMapping;
  }

  update(_delta: number, time: number): void {
    // de vez en cuando, por si algo cambió de material sin aparecer como entidad (y para encontrar las nubes)
    this.sweepT -= _delta;
    if (this.sweepT <= 0) {
      this.sweepT = 1.5;
      comicScan(this.scene, skipUI);
      if (!this.clouds) {
        const c = this.scene.getObjectByName('comic-clouds') as { material?: ShaderMaterial } | undefined;
        if (c?.material?.uniforms?.uT) this.clouds = c.material;
      }
    }
    if (this.clouds) this.clouds.uniforms.uT.value = time;
  }
}
