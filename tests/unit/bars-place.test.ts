// La barra y la paralela se colocan a lo largo de la línea entre tus manos (src/modes/bars/place.ts y
// src/scene-assets/bars.scene-asset.ts). La paralela única se pintaba a lo largo de X y se giraba como si fuera a lo largo
// de Z: quedaba atravesada, perpendicular a tus manos.
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createDipBars, createDoorBar } from '../../src/scene-assets/bars.scene-asset.js';

// hacia dónde apunta la barra (su cilindro va a lo largo de su Y), una vez girada como la gira place.ts (barra, atan2(-dz, dx);
// paralela única, atan2(dx, dz)), comparado con la línea entre las manos: 1, a lo largo; 0, atravesada
function along(grp: ReturnType<typeof createDoorBar>['grp'], yaw: number, hands: Vector3): number {
  grp.rotation.y = yaw;
  grp.updateMatrixWorld(true);
  const q = grp.children[0].getWorldQuaternion(new Quaternion());
  return Math.abs(new Vector3(0, 1, 0).applyQuaternion(q).dot(hands.clone().normalize()));
}

describe('colocar los aparatos con las manos', () => {
  for (const [dx, dz] of [[0.8, 0], [0, 0.6], [0.5, 0.5], [-0.3, 0.7]]) {
    const hands = new Vector3(dx, 0, dz);
    it(`la barra va de una mano a la otra (manos ${dx}, ${dz})`, () => {
      expect(along(createDoorBar(0.9, 2.2).grp, Math.atan2(-dz, dx), hands)).toBeCloseTo(1, 5);
    });
    it(`la paralela única, también (manos ${dx}, ${dz})`, () => {
      expect(along(createDipBars(0.58, 0.7, 0.95, true).grp, Math.atan2(dx, dz), hands)).toBeCloseTo(1, 5);
    });
  }
});
