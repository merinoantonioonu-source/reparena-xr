/**
 * Los obstáculos nuevos de los Arcos y el orbe (RepArena, src/71_arcs.js: ArcObs, MACE, ArcOrb): el láser (un rayo rojo de
 * pie con sus dos remates), las paredes que se cierran (rojas, con el canto verde: por ahí está el hueco), la maza (una viga
 * con dos postes, una cadena de eslabones y una bola de acero con doce pinchos) y el orbe dorado. Sin azar ni reloj: el juego
 * los mueve. Los materiales son de cada uno (la luz cambia con el peligro).
 */
import { AdditiveBlending, BoxGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, IcosahedronGeometry, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PlaneGeometry, RedFormat, TorusGeometry, UnsignedByteType } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';

const steel = new MeshStandardMaterial({ color: 0x6d7280, roughness: 0.45, metalness: 0.6 });
const dark = new MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
const edgeMat = new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });

function beamTex(): DataTexture {
  const n = 64, d = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.max(0, 1 - Math.abs((i + 0.5) / n - 0.5) * 2);
    d[i] = Math.round(255 * (0.35 * k + 0.65 * Math.pow(k, 4)));
  }
  const t = new DataTexture(d, 1, n, RedFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const noInk = <T extends Mesh>(m: T): T => {
  m.userData.noInk = true;
  return m;
};

/** El láser: un rayo de pie de 2,5 m (su grupo se mueve en x). */
export interface LaserParts {
  grp: Group;
  beam: Group;
  mat: MeshBasicMaterial;
  own: Material[];
}
export function createLaser(): LaserParts {
  const grp = new Group(), beam = new Group();
  grp.name = 'laser';
  const mat = new MeshBasicMaterial({ map: beamTex(), color: 0xff2a14, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
  const core = noInk(new Mesh(new CylinderGeometry(0.012, 0.012, 2.5, 6), new MeshBasicMaterial({ color: 0xffd0d0, toneMapped: false })));
  core.position.y = 1.25;
  beam.add(core);
  for (let i = 0; i < 2; i++) {
    const p = noInk(new Mesh(new PlaneGeometry(0.22, 2.5), mat));
    p.position.y = 1.25;
    p.rotation.y = (i * Math.PI) / 2;
    beam.add(p);
  }
  for (const y of [0.03, 2.5]) {
    const e = new Mesh(new BoxGeometry(0.12, 0.06, 0.12), steel);
    e.position.y = y;
    beam.add(e);
  }
  grp.add(beam);
  return { grp, beam, mat, own: [mat] };
}

/** Las dos paredes (cada una en su grupo: se mueve en x e se inclina con `ang`). */
export interface WallsParts {
  grp: Group;
  walls: [Group, Group];
  mats: [MeshBasicMaterial, MeshBasicMaterial];
  own: Material[];
}
export function createWalls(): WallsParts {
  const grp = new Group();
  grp.name = 'walls';
  const mk = (s: number): { g: Group; m: MeshBasicMaterial } => {
    const g = new Group(), m = new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: DoubleSide });
    const pl = noInk(new Mesh(new PlaneGeometry(1.4, 2.3), m));
    pl.position.set(s * 0.7, 1.15, 0);
    const edge = noInk(new Mesh(new BoxGeometry(0.07, 2.3, 0.07), edgeMat));
    edge.position.set(0, 1.15, 0);
    g.add(pl, edge);
    grp.add(g);
    return { g, m };
  };
  const a = mk(-1), b = mk(1);
  return { grp, walls: [a.g, b.g], mats: [a.m, b.m], own: [a.m, b.m] };
}

/** La maza: la viga con sus postes y, colgando de `arm`, la cadena y la bola (`ball`) con su halo (`glow`). */
export interface MaceParts {
  grp: Group;
  arm: Group;
  ball: Group;
  glow: Mesh;
  glowMat: MeshBasicMaterial;
  own: Material[];
}
export function createMace(piv: number, L: number): MaceParts {
  const grp = new Group(), arm = new Group(), ball = new Group();
  grp.name = 'mace';
  const beam = new Mesh(new BoxGeometry(2.4, 0.12, 0.14), dark);
  beam.position.y = piv + 0.06;
  grp.add(beam);
  for (const s of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.05, 0.06, piv + 0.12, 10), dark);
    post.position.set(s * 1.2, (piv + 0.12) / 2, 0);
    grp.add(post);
  }
  arm.position.y = piv;
  grp.add(arm);
  const link = new TorusGeometry(0.035, 0.012, 6, 10);
  for (let i = 0; i < 9; i++) {
    const l = new Mesh(link, steel);
    l.position.y = -(i + 0.5) * (L - 0.15) / 9;
    l.rotation.y = i % 2 ? Math.PI / 2 : 0;
    arm.add(l);
  }
  ball.position.y = -L;
  arm.add(ball);
  ball.add(new Mesh(new IcosahedronGeometry(0.16, 1), new MeshStandardMaterial({ color: 0x23202c, metalness: 0.8, roughness: 0.35, flatShading: true })));
  const spikeMat = new MeshStandardMaterial({ color: 0xb8bcc6, metalness: 0.85, roughness: 0.3 });
  for (let i = 0; i < 12; i++) {
    // doce pinchos repartidos por la esfera (la espiral de Fibonacci: sin azar)
    const k = (i + 0.5) / 12, th = Math.acos(1 - 2 * k), ph = i * 2.399963, sp = new Mesh(new CylinderGeometry(0.0, 0.03, 0.14, 6), spikeMat);
    sp.position.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)).multiplyScalar(0.2);
    sp.lookAt(sp.position.clone().multiplyScalar(2));
    sp.rotateX(Math.PI / 2);
    ball.add(sp);
  }
  const glowMat = new MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
  const glow = noInk(new Mesh(new PlaneGeometry(0.75, 0.75), glowMat));
  ball.add(glow);
  return { grp, arm, ball, glow, glowMat, own: [glowMat] };
}

/** El orbe: un octaedro dorado con un núcleo claro y dos aros que giran. */
export interface OrbParts {
  grp: Group;
  rings: [Mesh, Mesh];
  ringMat: MeshBasicMaterial;
  ring2Mat: MeshBasicMaterial;
  bodyMat: MeshStandardMaterial;
  own: Material[];
}
export function createOrb(): OrbParts {
  const grp = new Group();
  grp.name = 'orb';
  const bodyMat = new MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb02a, emissiveIntensity: 0.4, metalness: 0.75, roughness: 0.12, flatShading: true, toneMapped: false });
  const core = noInk(new Mesh(new IcosahedronGeometry(0.035, 0), new MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false })));
  const ringMat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring2Mat = new MeshBasicMaterial({ color: 0x7ff7e0, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const r1 = noInk(new Mesh(new TorusGeometry(0.135, 0.007, 6, 36), ringMat)), r2 = noInk(new Mesh(new TorusGeometry(0.135, 0.007, 6, 36), ring2Mat));
  grp.add(new Mesh(new OctahedronGeometry(0.085, 1), bodyMat), core, r1, r2);
  return { grp, rings: [r1, r2], ringMat, ring2Mat, bodyMat, own: [bodyMat, ringMat, ring2Mat] };
}
