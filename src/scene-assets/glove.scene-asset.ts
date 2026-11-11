/**
 * Los guantes robóticos de RepArena (src/40_models.js: makeGlove), para las manos desnudas: un tramo de metal por falange
 * (con su lomo), una bola oscura en cada nudillo, las puntas de los dedos luminosas, un protector en cada nudillo de la
 * mano y la palma con su muñequera y su aro de luz. Todo en piezas de una unidad que el sistema de los guantes coloca en
 * cada fotograma con las articulaciones de la mano (src/input/glove-system.ts). Sin reloj ni azar.
 */
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import type { BufferGeometry, Material } from '@iwsdk/core';

/** Los colores de RepArena (src/20_render.js: C). */
const GUN = new Color(0.4, 0.42, 0.46), STEEL = new Color(0.75, 0.76, 0.8), DARK = new Color(0.3, 0.3, 0.33), BLACK = new Color(0.07, 0.07, 0.08);

export interface GloveParts {
  /** Las piezas de los dedos (una de cada, de una unidad): el tramo, su lomo, el nudillo, la punta y el protector. */
  seg: BufferGeometry;
  ridge: BufferGeometry;
  joint: BufferGeometry;
  tip: BufferGeometry;
  guard: BufferGeometry;
  steel: MeshStandardMaterial;
  gun: MeshStandardMaterial;
  dark: MeshStandardMaterial;
  /** Las puntas, el centro de la palma y el aro: luminosas, del color que llevas. */
  tipMat: MeshBasicMaterial;
  own: Material[];
}

const mat = (c: Color, metal = 0.55): MeshStandardMaterial => new MeshStandardMaterial({ color: c, roughness: 0.45, metalness: metal });

export function createGloveParts(): GloveParts {
  // el tramo sale de su articulación hacia la siguiente (−Z, como las articulaciones de WebXR), más fino hacia la punta
  const seg = new CylinderGeometry(0.42, 0.5, 1, 6);
  seg.rotateX(-Math.PI / 2);
  seg.translate(0, 0, -0.5);
  const ridge = new BoxGeometry(0.42, 0.22, 0.86);
  ridge.translate(0, 0.42, -0.5);
  const steel = mat(STEEL), gun = mat(GUN), dark = new MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.75, metalness: 0.2 });
  const tipMat = new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
  return { seg, ridge, joint: new SphereGeometry(0.5, 10, 8), tip: new SphereGeometry(0.5, 10, 8), guard: new BoxGeometry(1, 0.45, 1), steel, gun, dark, tipMat, own: [steel, gun, dark, tipMat] };
}

/** La palma (en el marco de la muñeca: los dedos hacia −Z y el dorso hacia +Y), con su muñequera y su aro de luz. */
export function createGlovePalm(P: GloveParts): Group {
  const g = new Group();
  g.name = 'guante-palma';
  const black = mat(BLACK, 0.3), darkM = mat(DARK, 0.4);
  P.own.push(black, darkM);
  const add = (geo: BufferGeometry, m: Material, x: number, y: number, z: number, rx = 0): void => {
    const o = new Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.x = rx;
    o.castShadow = true;
    g.add(o);
  };
  add(new BoxGeometry(0.078, 0.014, 0.078), P.gun, 0, 0.013, -0.046); // el dorso
  for (let i = 0; i < 3; i++) add(new BoxGeometry(0.07 - i * 0.008, 0.008, 0.03), P.steel, 0, 0.022 + i * 0.002, -0.07 + i * 0.022, 0.08); // sus placas
  add(new BoxGeometry(0.072, 0.012, 0.074), black, 0, -0.009, -0.046); // la palma
  for (const s of [-1, 1]) add(new BoxGeometry(0.01, 0.024, 0.07), darkM, s * 0.041, 0.004, -0.045); // los cantos
  add(new CylinderGeometry(0.036, 0.033, 0.075, 12), darkM, 0, 0, 0.032, Math.PI / 2); // la muñequera
  add(new CylinderGeometry(0.038, 0.038, 0.012, 12), P.steel, 0, 0, 0.005, Math.PI / 2); // su borde
  add(new CylinderGeometry(0.012, 0.012, 0.005, 6), P.tipMat, 0, 0.0215, -0.042); // el centro luminoso del dorso
  const ring = new Mesh(new TorusGeometry(0.037, 0.003, 4, 20), P.tipMat); // el aro de luz de la muñeca
  ring.position.z = 0.012;
  ring.userData.noInk = true;
  g.add(ring);
  return g;
}
