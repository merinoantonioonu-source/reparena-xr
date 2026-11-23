/**
 * Los obstáculos nuevos de los Arcos y el orbe (RepArena, src/71_arcs.js: ArcObs, MACE, ArcOrb): el láser (un rayo rojo de
 * pie con sus dos remates), las paredes que se cierran (rojas, con el canto verde: por ahí está el hueco), la maza (una viga
 * con dos postes, una cadena de eslabones y una bola de acero con doce pinchos) y el orbe dorado. Sin azar ni reloj: el juego
 * los mueve. Los materiales son de cada uno (la luz cambia con el peligro).
 */
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, IcosahedronGeometry, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, RGBAFormat, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, UnsignedByteType } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';

const steel = new MeshStandardMaterial({ color: 0x6d7280, roughness: 0.45, metalness: 0.6 });
const dark = new MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
const edgeMat = new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });

// el resplandor del láser (RepArena: TX.beam): blanco, brillante en el centro y transparente hacia los extremos, para
// teñirlo del color del material (rojo anaranjado)
function beamTex(): DataTexture {
  const n = 64, d = new Uint8Array(n * 4), stops: [number, number][] = [[0, 0], [0.42, 0.35], [0.5, 1], [0.58, 0.35], [1, 0]];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    let a = 0;
    for (let k = 0; k < stops.length - 1; k++) if (t >= stops[k][0] && t <= stops[k + 1][0]) a = stops[k][1] + ((stops[k + 1][1] - stops[k][1]) * (t - stops[k][0])) / (stops[k + 1][0] - stops[k][0]);
    d.set([255, 255, 255, Math.round(255 * a)], i * 4);
  }
  const t = new DataTexture(d, 1, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// las franjas de peligro de las paredes (RepArena: WALL_TEX): rojo casi opaco con rayas oscuras en diagonal
function wallTex(): DataTexture {
  const n = 128, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dark = (((x - (n - 1 - y)) % 64) + 64) % 64 < 32;
      d.set(dark ? [25, 4, 10, 217] : [200, 20, 44, 209], (y * n + x) * 4);
    }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1.4 / 0.45, 2.3 / 0.45);
  t.magFilter = t.minFilter = LinearFilter;
  t.colorSpace = SRGBColorSpace;
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
    const g = new Group(), m = new MeshBasicMaterial({ map: wallTex(), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: DoubleSide });
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
  glow: Sprite;
  glowMat: SpriteMaterial;
  own: Material[];
}
/** Un resplandor redondo que se difumina hacia fuera (RepArena: glowSprite): sin bordes, para que no se vea un plano. */
let GLOW_TEX: DataTexture | null = null;
function roundGlowTex(): DataTexture {
  if (GLOW_TEX) return GLOW_TEX;
  const n = 64, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.min(1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2);
    d.set([255, 255, 255, Math.round(255 * Math.pow(1 - r, 2))], (y * n + x) * 4);
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return (GLOW_TEX = t);
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
  // el resplandor rojo de la bola (con el peligro, más fuerte): redondo y difuminado, siempre de cara a ti (antes, un cuadrado
  // de color liso, que en las gafas se veía como un plano alrededor de la bola)
  const glowMat = new SpriteMaterial({ map: roundGlowTex(), color: 0xff2a14, transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const glow = new Sprite(glowMat);
  glow.userData.noInk = true;
  glow.scale.setScalar(0.75);
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
  /** La gema (gira sobre sí misma) y su halo de luz detrás. */
  gem: Mesh;
  halo: Sprite;
  haloMat: SpriteMaterial;
  own: Material[];
}

/** El halo de los orbes: un resplandor suave dibujado una vez (compartido por todos). */
let ORB_HALO: DataTexture | null = null;
function orbHaloTex(): DataTexture {
  if (ORB_HALO) return ORB_HALO;
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5, r = Math.sqrt(x * x + y * y) * 2;
      // (un núcleo brillante y una corona que se desvanece, con cuatro rayos finos: un destello de joya)
      const ray = Math.max(0, 1 - Math.min(Math.abs(x), Math.abs(y)) * 40) * Math.max(0, 1 - r);
      const a = Math.min(1, Math.pow(Math.max(0, 1 - r), 2.2) + 0.6 * ray);
      d.set([255, 255, 255, Math.round(255 * a)], (j * N + i) * 4);
    }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return (ORB_HALO = t);
}

/** La talla de la gema: cada cara con su tono (claras, medias y oscuras, siempre igual): así se ven las facetas aunque la luz
 * de cómic las aplane. Hecha una vez y compartida. */
let GEM_GEO: BufferGeometry | null = null;
function gemGeo(): BufferGeometry {
  if (GEM_GEO) return GEM_GEO;
  const g = new IcosahedronGeometry(0.095, 1).toNonIndexed(), n = g.attributes.position.count, c = new Float32Array(n * 3);
  const tones = [1, 0.78, 0.92, 0.62, 1, 0.85];
  for (let f = 0; f < n / 3; f++) {
    const k = tones[(f * 7) % tones.length];
    for (let v = 0; v < 3; v++) c.set([k, k * 0.97, k * 0.9], (f * 3 + v) * 3);
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return (GEM_GEO = g);
}

/**
 * El orbe (pedido del usuario: «más atractivos, más relieve, más sombreado»): una gema dorada tallada (80 caras, con poca luz
 * propia para que el sombreado de cómic le dé relieve y claroscuro) que gira sobre sí misma, con un núcleo de luz, un halo
 * con destello detrás y sus dos aros.
 */
export function createOrb(): OrbParts {
  const grp = new Group();
  grp.name = 'orb';
  const bodyMat = new MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xffb02a, emissiveIntensity: 0.16, metalness: 0.45, roughness: 0.22, flatShading: true, vertexColors: true });
  const gem = new Mesh(gemGeo(), bodyMat);
  // (las caras de la talla, más marcadas: estirada un poco en vertical, como una gema)
  gem.scale.set(1, 1.18, 1);
  const core = noInk(new Mesh(new IcosahedronGeometry(0.04, 1), new MeshBasicMaterial({ color: 0xfffbe6, toneMapped: false })));
  core.position.z = 0.0;
  const ringMat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring2Mat = new MeshBasicMaterial({ color: 0x7ff7e0, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const r1 = noInk(new Mesh(new TorusGeometry(0.15, 0.008, 6, 36), ringMat)), r2 = noInk(new Mesh(new TorusGeometry(0.15, 0.008, 6, 36), ring2Mat));
  const haloMat = new SpriteMaterial({ map: orbHaloTex(), color: 0xffc04a, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new Sprite(haloMat);
  halo.scale.setScalar(0.42);
  halo.renderOrder = -1;
  halo.userData.noInk = true;
  grp.add(halo, gem, core, r1, r2);
  return { grp, rings: [r1, r2], ringMat, ring2Mat, bodyMat, gem, halo, haloMat, own: [bodyMat, ringMat, ring2Mat, haloMat, core.material as Material] };
}
