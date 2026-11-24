/**
 * Cómo se ven las cuchillas de Arcos (src/modes/arcs/blades.ts): hojas de los kits que ya hay, elegidas por el usuario (no hay
 * hachas): el sable del Capitán (la hélice), la espada del tiburón (la rueda) y el ancla de la isla pirata (la rasante), del
 * Pirate Kit de Quaternius. Se sacan de sus modelos una vez (su malla y su material, compartidos: nada se crea en plena
 * ronda), se centran y se ponen a 85 cm (con 1,4 m se veían descomunales), con la hoja a lo largo de su eje X; y,
 * girando, un disco de luz tenue marca el barrido de la hoja (se lee de un vistazo por dónde corta).
 */
import { AdditiveBlending, AssetManager, Box3, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type Object3D } from '@iwsdk/core';
import { warmKeep } from '../../style/warm.js';
import { BLADE_R, type BladeKind } from './blades.js';

/** De dónde sale cada hoja: el recurso del catálogo y el nodo de su modelo. */
const SRC: Record<BladeKind, [string, string]> = {
  spin: ['foe-captain', 'Weapon_Cutlass'],
  wheel: ['foe-sharky', 'Weapon_Sword_2'],
  sweep: ['island-kit', 'Anchor'],
};

const protos = new Map<BladeKind, Object3D>();
let discGeo: RingGeometry | null = null;
const discMat = new MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.24, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });

/** La hoja de su clase, ya centrada, con su eje largo en X y de 2·BLADE_R de largo (null si su modelo aún no ha cargado). */
function proto(kind: BladeKind): Object3D | null {
  const have = protos.get(kind);
  if (have) return have;
  const [asset, node] = SRC[kind], src = AssetManager.getGLTF(asset)?.scene?.getObjectByName(node);
  if (!src) return null;
  const blade = src.clone(true);
  blade.position.set(0, 0, 0);
  blade.rotation.set(0, 0, 0);
  blade.scale.set(1, 1, 1);
  blade.updateMatrixWorld(true);
  const box = new Box3().setFromObject(blade), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
  // (el eje más largo, a X; luego, centrada y a su tamaño)
  const rot = new Group();
  rot.add(blade);
  if (size.y >= size.x && size.y >= size.z) rot.rotation.z = Math.PI / 2;
  else if (size.z >= size.x && size.z >= size.y) rot.rotation.y = Math.PI / 2;
  blade.position.set(-c.x, -c.y, -c.z);
  // (a lo largo, 2·BLADE_R; a lo ancho y de grueso, algo más: las hojas del kit son finas y de lejos apenas se veían; con
  // ×1,7 y 1,4 m de largo, el usuario las veía descomunales)
  const k = (2 * BLADE_R) / Math.max(1e-3, size.x, size.y, size.z), wrap = new Group();
  rot.scale.setScalar(k);
  wrap.scale.set(1, 1.3, 1.3);
  wrap.add(rot);
  wrap.traverse((o) => {
    o.castShadow = false;
  });
  protos.set(kind, wrap);
  warmKeep(wrap.clone(true));
  return wrap;
}

/** ¿Han cargado ya las tres hojas? (mientras no, en su lugar sale la maza) */
export function bladesReady(): boolean {
  return proto('spin') !== null && proto('wheel') !== null && proto('sweep') !== null;
}

export interface BladeLook {
  /** Va donde va la cuchilla; `spin` gira con su hoja (en su plano de giro) y `disc` es el barrido. */
  grp: Group;
  spin: Group;
  disc: Mesh;
}

/** Una cuchilla para la escena (la hoja, copia de su modelo: su malla y su material, compartidos). */
export function createBladeLook(kind: BladeKind): BladeLook | null {
  const p = proto(kind);
  if (!p) return null;
  const grp = new Group(), plane = new Group(), spin = new Group();
  grp.name = 'blade';
  spin.add(p.clone(true));
  discGeo ??= new RingGeometry(0.12, BLADE_R, 40, 1);
  const disc = new Mesh(discGeo, discMat);
  disc.userData.noInk = true;
  disc.rotation.x = -Math.PI / 2; // (el disco, en el plano de giro: horizontal)
  plane.add(spin, disc);
  // la rueda gira de canto (su plano, el de la pista: de pie y de frente a ti)
  if (kind === 'wheel') plane.rotation.z = Math.PI / 2;
  grp.add(plane);
  return { grp, spin, disc };
}
