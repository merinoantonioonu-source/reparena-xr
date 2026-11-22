// Que un error no congele el juego (src/core/guard.ts) y que el rayo de IWSDK no rompa con los sprites
// (src/input/sprite-ray.ts): el usuario se quedaba con la imagen congelada al entrar en VR.
import { describe, expect, it, vi } from 'vitest';
import { Raycaster, Sprite, Vector3, type Intersection } from 'three';
import { DIAG } from '../../src/core/diag.js';
import { guardWorld } from '../../src/core/guard.js';

vi.mock('@iwsdk/core', async () => await import('three'));
const { spriteRayFix } = await import('../../src/input/sprite-ray.js');

describe('que un error no congele el juego', () => {
  it('un sistema que lanza un error no para a los demás ni el pintado, y queda apuntado con su nombre', () => {
    class Roto {
      update(): void {
        throw new Error('se rompió');
      }
    }
    class Sano {
      n = 0;
      update(): void {
        this.n++;
      }
    }
    const roto = new Roto(), sano = new Sano();
    let pintado = 0;
    const world = { getSystems: () => [roto, sano], renderer: { render: () => void pintado++ } };
    guardWorld(world, { Roto, Sano });
    for (let i = 0; i < 3; i++) {
      for (const s of world.getSystems()) (s as { update(d: number, t: number): void }).update(0.016, i);
      world.renderer.render(null, null);
    }
    expect(sano.n).toBe(3);
    expect(pintado).toBe(3);
    expect(DIAG.events.some((e) => e && e.includes('ERROR en Roto: se rompió'))).toBe(true);
  });

  it('el rayo sin cámara (el de IWSDK) no rompe al pasar por un sprite', () => {
    const s = new Sprite();
    s.updateMatrixWorld();
    const rc = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const out: Intersection[] = [];
    expect(() => s.raycast(rc, out)).toThrow(); // (tal cual, Three lanza el error que congelaba la imagen)
    spriteRayFix();
    expect(() => s.raycast(rc, out)).not.toThrow();
    expect(out).toHaveLength(0);
  });
});
