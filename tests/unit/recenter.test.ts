// Recolocarte en la arena (src/combat/recenter.ts): se mueve tu espacio (el del jugador) para que tu cabeza quede en el
// centro (0, 0) y «delante» mire a las compuertas (−Z). En el suelo, «delante» es hacia donde apunta el cuerpo (bodyYaw): si
// te tumbas hacia otro lado, las trampillas siguen quedando ante tus manos, una a cada lado (antes, a tu izquierda).
import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { floorOrigin, recenterPose } from '../../src/combat/recenter.js';

const yawOf = (d: Vector3): number => Math.atan2(-d.x, -d.z);

describe('recolocarte', () => {
  for (const [ry0, px, pz, hx, hz, look] of [
    [0, 0, 0, 0.4, -0.3, Math.PI / 2], // (girado 90° a la izquierda)
    [0.7, 1.2, -0.5, -0.6, 0.9, -Math.PI / 2], // (tu espacio ya movido y girado; mirando a la derecha)
    [-2.1, -3, 2, 0.1, 0.1, Math.PI], // (de espaldas a las compuertas)
  ] as const)
    it(`tu cabeza al centro y «delante», hacia −Z (giro ${ry0}, mirando a ${look.toFixed(2)})`, () => {
      const P = new Object3D(), cam = new Object3D();
      P.add(cam);
      P.position.set(px, 0, pz);
      P.rotation.y = ry0;
      cam.position.set(hx, 0.5, hz);
      cam.rotation.y = look - ry0; // (en el mundo, «delante» queda hacia look)
      P.updateMatrixWorld(true);
      const f = new Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new Object3D().quaternion));
      expect(yawOf(f)).toBeCloseTo(Math.atan2(Math.sin(look), Math.cos(look)), 5);
      const R = recenterPose(P.rotation.y, yawOf(f), cam.position.x, cam.position.z, { ry1: 0, x1: 0, z1: 0 });
      P.rotation.y = R.ry1;
      P.position.set(R.x1, 0, R.z1);
      P.updateMatrixWorld(true);
      const w = cam.getWorldPosition(new Vector3());
      expect(w.x).toBeCloseTo(0, 5);
      expect(w.z).toBeCloseTo(0, 5);
      const f2 = new Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new Object3D().quaternion));
      expect(f2.x).toBeCloseTo(0, 5);
      expect(f2.z).toBeCloseTo(-1, 5);
    });
});

describe('el centro de la arena diminuta al calibrar en el suelo', () => {
  const head = new Vector3(2, 0.5, -1), fwd = new Vector3(1, 0, 0);
  it('recolocado: bajo tu cabeza (0, 0); en el inchworm, a tu alcance por delante (−Z)', () => {
    expect(floorOrigin(true, false, 0.9, head, fwd, new Vector3()).toArray()).toEqual([0, 0, 0]);
    const o = floorOrigin(true, true, 0.9, head, fwd, new Vector3());
    expect(o.x).toBe(0);
    expect(o.z).toBeCloseTo(-1.02, 6);
  });
  it('sin recolocar (Barras), donde estás y hacia donde miras, como antes', () => {
    expect(floorOrigin(false, false, 0.9, head, fwd, new Vector3()).toArray()).toEqual([2, 0.5, -1]);
    expect(floorOrigin(false, true, 0.9, head, fwd, new Vector3()).toArray()).toEqual([2 + 1.02, 0.5, -1]);
  });
});
