/**
 * «Mandos como manos» con la mano de IWSDK que agarra el mando (AnimatedControllerHand: el índice se dobla con el gatillo
 * y los demás dedos con el agarre). En esta versión de IWSDK (1.1.0-rc.2) no funciona tal cual, por tres fallos suyos:
 *  - IWSDK le pasa los datos en otro orden del que espera (ella espera primero el modelo): cogía la escena entera;
 *  - le carga el modelo del mando (el de su perfil) en vez del de la mano;
 *  - y, si le diera el de la mano, lo compartiría con la mano desnuda (AnimatedHand), que lo cambia a su manera.
 * Aquí: la misma clase de IWSDK, con su propia copia del modelo de la mano de ese lado (cargado antes de cambiar al
 * mando con mano). Si una versión nueva de IWSDK lo arregla, se quita este archivo y se usa AnimatedControllerHand tal cual.
 */
import { AnimatedControllerHand, AssetManager } from '@iwsdk/core';
import type { Group, Object3D, PerspectiveCamera, Scene, SkinnedMesh } from '@iwsdk/core';
import { str } from '../core/values.js';
import { handModelUrl } from './input-models.js';
import { opaqueHand } from './skin-hand.js';

type Layout = ConstructorParameters<typeof AnimatedControllerHand>[3];
type Side = 'left' | 'right';

// una copia propia del modelo de la mano (cargado aparte del de la mano desnuda; AssetManager.getGLTF da una copia nueva
// cada vez)
const handScene = (side: Side): Group => AssetManager.getGLTF(handModelUrl(side))!.scene as Group;

/** Carga los modelos de las dos manos (para la mano que agarra el mando). */
export async function loadControllerHands(): Promise<boolean> {
  try {
    await Promise.all([AssetManager.loadGLTF(handModelUrl('left')), AssetManager.loadGLTF(handModelUrl('right'))]);
    return true;
  } catch {
    return false;
  }
}

class ControllerHand extends AnimatedControllerHand {
  // (opaca, como la mano lisa: la de IWSDK es un fantasma transparente)
  private skin: Object3D[] = [];
  init(): void {
    super.init();
    opaqueHand(this.model);
    this.model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) this.skin.push(o);
    });
  }

  // (los dedos van hacia su postura con lerp(…, delta × 20): con delta de más de 0,1 s se pasaba y se disparaba)
  update(delta: number): void {
    super.update(Math.min(delta, 0.05));
    // con los guantes, su piel no se ve: los guantes se ponen en sus huesos (src/input/glove-system.ts)
    const v = str('handLook') === 'skin';
    for (const o of this.skin) if (o.visible !== v) o.visible = v;
  }
}
export class ControllerHandLeft extends ControllerHand {
  constructor(scene: Scene, camera: PerspectiveCamera, _model: Group, layout: Layout) {
    super(handScene('left'), scene, camera, layout);
  }
}
export class ControllerHandRight extends ControllerHand {
  constructor(scene: Scene, camera: PerspectiveCamera, _model: Group, layout: Layout) {
    super(handScene('right'), scene, camera, layout);
  }
}
