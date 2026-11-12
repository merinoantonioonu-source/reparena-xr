/**
 * La mano de IWSDK, opaca («Manos que se ven» → Mano lisa, y siempre la que agarra el mando). IWSDK la pinta como un
 * fantasma: por dentro transparente (stencilMaterial) y con un borde blanco (outlineMaterial); en las gafas se veía a
 * través de ella y el usuario la quería sólida. Aquí, la misma mano y el mismo esqueleto de IWSDK, con un material liso de
 * colores claros (el cómic le pone su sombreado y su contorno de tinta) y sin el borde blanco.
 * Con «Guantes» (el de serie), la mano desnuda de IWSDK no se ve: se ven los guantes (src/input/glove-system.ts).
 */
import { AnimatedHand, MeshStandardMaterial, outlineMaterial } from '@iwsdk/core';
import type { Object3D, SkinnedMesh } from '@iwsdk/core';
import { str } from '../core/values.js';
import { GLOVE_ON } from './hold.js';

/** El material de la mano lisa (uno para todas). */
export const skinMat = new MeshStandardMaterial({ color: 0xd6dbe6, roughness: 0.6, metalness: 0.05 });

/** Cambia el fantasma de IWSDK por la mano opaca (una vez, al crearla). */
export function opaqueHand(model: Object3D): void {
  const ghost: SkinnedMesh[] = [];
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (m.material === outlineMaterial) ghost.push(m);
    else {
      m.material = skinMat;
      m.castShadow = true;
    }
  });
  for (const m of ghost) m.removeFromParent(); // (el borde blanco: después de recorrer)
}

/** La mano desnuda de IWSDK, opaca; con «Guantes», escondida mientras se pinta el guante de esa mano. (IWSDK vuelve a
 * enseñar su modelo en cada fotograma: se esconde lo de dentro, la piel; en las gafas, si no, tapaba los guantes). */
export class SkinHand extends AnimatedHand {
  private side: 'left' | 'right' = 'left';
  private skin: Object3D[] = [];

  init(): void {
    super.init();
    opaqueHand(this.model);
    this.model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) this.skin.push(o);
    });
  }

  connect(src: XRInputSource, enabled: boolean): void {
    super.connect(src, enabled);
    this.side = src.handedness === 'right' ? 'right' : 'left';
  }

  update(): void {
    super.update();
    skinShown(this.skin, this.side);
  }
}

/** La piel de una mano de IWSDK, a la vista solo si no se está pintando el guante de ese lado. */
export function skinShown(skin: Object3D[], side: 'left' | 'right'): void {
  const v = !(str('handLook') !== 'skin' && GLOVE_ON[side]);
  for (const o of skin) if (o.visible !== v) o.visible = v;
}
