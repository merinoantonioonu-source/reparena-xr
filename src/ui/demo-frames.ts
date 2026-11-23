/**
 * Los dibujos de la caricatura, guardados (RepArena XR: tirones del menú principal en las gafas). La caricatura se repite
 * cada vuelta (`P` segundos; los enemigos mixtos, robots y voladores por turnos, cada dos): en vez de pintar el lienzo y
 * subirlo a la gráfica 12 veces por segundo, se pinta cada dibujo de la vuelta una sola vez (uno por fotograma, mientras se
 * ve) en su propia textura y luego solo se cambia cuál enseña el material. Con otro ejercicio u otro modo, se vuelven a pintar.
 * El colgado no se guarda (su cuenta de segundos no se repite).
 */
import { CanvasTexture, LinearFilter, SRGBColorSpace } from '@iwsdk/core';
import { mkCanvas } from './canvas-kit.js';

/** Cuántos dibujos por cada repetición entera (una o dos vueltas) y su ancho (px). */
export const DEMO_FRAMES = 40, DEMO_PX = 512;

type Paint = (c: CanvasRenderingContext2D, W: number, H: number, t: number) => void;

export class DemoFrames {
  private cv: { ctx: CanvasRenderingContext2D; tex: CanvasTexture }[] = [];
  private done: boolean[] = [];
  private key = '';
  private readonly W: number;
  private readonly H: number;

  constructor(w: number, h: number) {
    this.W = DEMO_PX;
    this.H = Math.round((DEMO_PX * h) / w);
  }

  /** ¿Se puede guardar este ejercicio? */
  can(ex: string): boolean {
    return ex !== 'hang';
  }

  /** Todo otra vez (las letras buenas ya cargadas). */
  reset(): void {
    this.key = '';
  }

  /** La textura del dibujo que toca en `t` (pintándolo si aún no está: como mucho uno por llamada). */
  frame(key: string, t: number, P: number, cycles: number, paint: Paint): CanvasTexture {
    if (!this.cv.length) {
      // (la primera vez que se ve: los lienzos y sus texturas, una sola vez)
      for (let i = 0; i < DEMO_FRAMES; i++) {
        const c = mkCanvas(this.W, this.H), tex = new CanvasTexture(c);
        tex.colorSpace = SRGBColorSpace;
        tex.generateMipmaps = false; // (sin mipmaps: la mitad de memoria)
        tex.minFilter = LinearFilter;
        tex.anisotropy = 4;
        this.cv.push({ ctx: c.getContext('2d')!, tex });
        this.done.push(false);
      }
    }
    if (key !== this.key) {
      this.key = key;
      this.done.fill(false);
    }
    const L = P * cycles, i = Math.min(DEMO_FRAMES - 1, Math.floor(((t % L) / L) * DEMO_FRAMES));
    let j = i;
    if (this.done[i]) j = this.done.indexOf(false); // (el que toca ya está: se adelanta otro)
    if (j >= 0) {
      const f = this.cv[j];
      paint(f.ctx, this.W, this.H, ((j + 0.5) / DEMO_FRAMES) * L);
      f.tex.needsUpdate = true;
      this.done[j] = true;
    }
    return this.cv[i].tex;
  }
}
