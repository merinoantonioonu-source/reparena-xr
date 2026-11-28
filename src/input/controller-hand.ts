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
import { Matrix4, Quaternion, Vector3 } from '@iwsdk/core';
import type { Group, Object3D, PerspectiveCamera, Scene, SkinnedMesh } from '@iwsdk/core';
import { handModelUrl } from './input-models.js';
import { opaqueHand, skinShown, WEAPON_GRIP } from './skin-hand.js';

type Layout = ConstructorParameters<typeof AnimatedControllerHand>[3];
type Side = 'left' | 'right';

// el mando con todo apretado (gatillo, agarre y el pulgar): la postura de la mano de IWSDK con los dedos cerrados
const FIST = { buttons: [{ value: 1 }, { value: 1 }, { value: 0 }, { value: 1 }] } as unknown as Gamepad;

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

// las manos de los mandos que hay ahora (para poner la espada en el hueco de su puño)
const LIVE: Record<Side, ControllerHand | null> = { left: null, right: null };
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
const PARTS = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] as const;
const _inv = new Matrix4(), _p = new Vector3(), _a = new Vector3(), _b = new Vector3(), _x = new Vector3(), _w = new Vector3(), _m = new Matrix4();

/**
 * El hueco del puño cerrado de la mano del mando de ese lado, respecto al mando (la postura que da la gafa, la de la muñeca
 * en el juego): su centro en `outP` y, en `outQ`, el giro que pone la hoja (−Z) saliendo por encima del índice y el filo (X)
 * hacia los nudillos. Pedido del usuario: la mano que lleva la espada la empuña, con la empuñadura dentro del puño (con la
 * postura del mando sin más, quedaba a un lado de los dedos). Falso si esa mano no está.
 */
export function fistFrame(side: Side, outP: Vector3, outQ: Quaternion): boolean {
  const H = LIVE[side];
  if (!H || !H.on()) return false;
  const bone = (n: string): Object3D | undefined => H.joints[n];
  const ring = (f: string, out: Vector3): Vector3 => {
    out.set(0, 0, 0);
    for (const q of PARTS) out.add(bone(`${f}-finger-${q}`)!.getWorldPosition(_p));
    return out.multiplyScalar(1 / PARTS.length).applyMatrix4(_inv);
  };
  const root = H.model;
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();
  outP.set(0, 0, 0);
  for (const f of FINGERS) outP.add(ring(f, _a));
  outP.multiplyScalar(1 / FINGERS.length);
  // (la hoja, del meñique hacia el índice; el filo, hacia los nudillos)
  const z = ring('pinky', _a).sub(ring('index', _b)).normalize();
  bone('middle-finger-phalanx-proximal')!.getWorldPosition(_x).applyMatrix4(_inv);
  bone('wrist')!.getWorldPosition(_w).applyMatrix4(_inv);
  _x.sub(_w);
  _x.addScaledVector(z, -_x.dot(z)).normalize();
  const y = _w.crossVectors(z, _x);
  outQ.setFromRotationMatrix(_m.makeBasis(_x, y, z));
  return true;
}

class ControllerHand extends AnimatedControllerHand {
  // (opaca, como la mano lisa: la de IWSDK es un fantasma transparente)
  private skin: Object3D[] = [];
  private side: Side = 'left';
  readonly joints: Record<string, Object3D> = {};
  connect(src: XRInputSource, enabled: boolean): void {
    super.connect(src, enabled);
    this.side = src.handedness === 'right' ? 'right' : 'left';
    LIVE[this.side] = this;
  }
  disconnect(): void {
    super.disconnect();
    if (LIVE[this.side] === this) LIVE[this.side] = null;
  }
  /** ¿A la vista (conectada y activa)? */
  on(): boolean {
    return this.enabled && !!this.gamepad && this.model.visible;
  }
  init(): void {
    super.init();
    opaqueHand(this.model);
    this.model.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) this.skin.push(o);
      if (o.name) this.joints[o.name] = o;
    });
  }

  // (los dedos van hacia su postura con lerp(…, delta × 20): con delta de más de 0,1 s se pasaba y se disparaba)
  // con una espada en la mano (WEAPON_GRIP), el puño cerrado en la empuñadura, aprietes o no los botones
  update(delta: number): void {
    const pad = this.gamepad;
    if (WEAPON_GRIP[this.side] && pad) this.gamepad = FIST;
    super.update(Math.min(delta, 0.05));
    this.gamepad = pad;
    // con los guantes, su piel no se ve: los guantes se ponen en sus huesos (src/input/glove-system.ts)
    skinShown(this.skin, this.side);
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
