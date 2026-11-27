/** Los avisos de la vista nunca se meten en el suelo (pedido del usuario: preparándose en plancha o tumbado, la caricatura y
 * los avisos «se entierran en el suelo y desaparecen»): se acercan hasta él y se encogen en proporción (se ven igual de
 * grandes), de cara a los ojos. */
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { VIEW_FLOOR, ViewFrame, type HeadPose } from '../../src/ui/view.js';

// la cabeza en (0, y, 0) mirando hacia abajo `pitch` rad (0, al frente; π/2, derecho al suelo), con lo alto hacia −z
const pose = (y: number, pitch: number): HeadPose => ({ p: new Vector3(0, y, 0), q: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch) });
const OFF = new Vector3(0, 0, -1.1);

describe('los avisos de la vista y el suelo', () => {
  it('de pie, mirando al frente, donde siempre (sin encoger)', () => {
    const V = new ViewFrame(), h = pose(1.6, 0), out = V.hudLocal(OFF, new Vector3(), h, false);
    expect(out.distanceTo(new Vector3(0, 1.6, -1.1))).toBeLessThan(1e-6);
    expect(V.near).toBe(1);
  });

  it('en plancha, mirando derecho al suelo: por encima de él, a una distancia que se lee y encogido en proporción', () => {
    for (const lying of [false, true]) {
      const V = new ViewFrame(), h = pose(0.45, Math.PI / 2 - 0.01), out = V.hudLocal(OFF, new Vector3(), h, lying);
      expect(out.y).toBeGreaterThanOrEqual(VIEW_FLOOR.y - 1e-6);
      expect(out.distanceTo(h.p)).toBeGreaterThan(VIEW_FLOOR.min - 0.01);
      expect(V.near).toBeCloseTo(out.distanceTo(h.p) / 1.1, 3);
      // (de cara a los ojos)
      const q = V.hudQAt(h, lying, out, V.near), z = new Vector3(0, 0, 1).applyQuaternion(q), toEye = h.p.clone().sub(out).normalize();
      expect(z.dot(toEye)).toBeGreaterThan(0.999);
    }
  });

  it('mirando abajo en diagonal: hasta el suelo por la mirada (más cerca, sin cambiar de dirección)', () => {
    const V = new ViewFrame(), h = pose(1.0, 0.9), want = OFF.clone().applyQuaternion(h.q).add(h.p), out = V.hudLocal(OFF, new Vector3(), h, false);
    expect(want.y).toBeLessThan(VIEW_FLOOR.y);
    expect(out.y).toBeCloseTo(VIEW_FLOOR.y, 5);
    const a = want.sub(h.p).normalize(), b = out.clone().sub(h.p).normalize();
    expect(a.dot(b)).toBeGreaterThan(0.9999);
    expect(V.near).toBeLessThan(1);
  });
});
