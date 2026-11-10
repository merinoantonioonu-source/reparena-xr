/**
 * La arena del prototipo, hecha en código (sin descargas): el suelo de losas, el aro donde te pones, las cajas y las
 * rocas que hacen de obstáculo. Todo determinista (sin azar ni reloj): el editor y el juego evalúan este módulo por
 * separado y tienen que sacar lo mismo.
 */
import {
  BoxGeometry,
  CircleGeometry,
  DataTexture,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  RingGeometry,
  SRGBColorSpace,
  UnsignedByteType,
} from '@iwsdk/core';

// ruido determinista (sin Math.random: el módulo se evalúa dos veces y tiene que dar lo mismo)
const hash = (x: number, y: number, s: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

function makeTexture(size: number, paint: (x: number, y: number) => [number, number, number], repeat: number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8; // (de lejos, las losas no se emborronan)
  tex.needsUpdate = true;
  return tex;
}

// Losas de piedra arenisca de 1 m con su junta, cada una de un tono algo distinto y con poro: se ve nítido de cerca y
// sirve para juzgar la resolución de las gafas
function floorTexture(): DataTexture {
  const S = 512, tiles = 4, T = S / tiles;
  return makeTexture(S, (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), lx = x % T, ly = y % T;
    const edge = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    const tone = 0.9 + 0.2 * hash(tx, ty, 1);
    const grain = 0.94 + 0.12 * hash(x, y, 2);
    let r = 186 * tone * grain, g = 166 * tone * grain, b = 136 * tone * grain;
    if (edge < 3) { r = 104; g = 92; b = 78; } // la junta
    else if (edge < 6) { r *= 0.86; g *= 0.86; b *= 0.86; } // el canto de la losa, algo hundido
    return [r, g, b];
  }, 15);
}

const floorMaterial = new MeshStandardMaterial({ map: floorTexture(), roughness: 0.93, metalness: 0 });

/** El suelo: 60 × 60 m (lo lejano se funde con el cielo con DomeFade, en la escena). Origen a ras de suelo. */
export function createArenaFloor(size = 60): Group {
  const g = new Group();
  const plane = new Mesh(new PlaneGeometry(size, size), floorMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.name = 'arena-floor-plane';
  g.add(plane);
  return g;
}

/** El aro turquesa donde se pone el jugador (a ras de suelo) y un disco tenue dentro. */
export function createPlayerPad(): Group {
  const g = new Group();
  const ring = new Mesh(new RingGeometry(0.44, 0.5, 72), new MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const disc = new Mesh(new CircleGeometry(0.44, 72), new MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.12, side: DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  g.add(ring, disc);
  return g;
}

// La caja de madera: tablas con su marco oscuro
function crateTexture(): DataTexture {
  const S = 128;
  return makeTexture(S, (x, y) => {
    const frame = x < 12 || y < 12 || x > S - 13 || y > S - 13;
    const plank = Math.floor(y / 26.0);
    const seam = !frame && y % 26 < 2;
    const tone = 0.85 + 0.25 * hash(plank, 0, 3);
    const grain = 0.9 + 0.1 * Math.sin(x * 0.35 + hash(plank, 1, 4) * 6.0) + 0.06 * hash(x, y, 5);
    if (frame) return [96 * grain, 62 * grain, 36 * grain];
    if (seam) return [70, 44, 26];
    return [176 * tone * grain, 122 * tone * grain, 70 * tone * grain];
  }, 1);
}

const crateMaterial = new MeshStandardMaterial({ map: crateTexture(), roughness: 0.82, metalness: 0 });

/** Caja de 0,8 m centrada en su origen (el colisionador de física va centrado: la escena la pone a 0,4 m). */
export function createCrate(size = 0.8): Mesh {
  const m = new Mesh(new BoxGeometry(size, size, size), crateMaterial);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// La roca: un icosaedro abollado (el bollo sale de la posición, no del índice: los vértices repetidos se mueven igual y
// no se abren grietas), de caras planas
function rockGeometry(radius: number): IcosahedronGeometry {
  const geo = new IcosahedronGeometry(radius, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + 0.34 * hash(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

const rockMaterial = new MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.95, metalness: 0, flatShading: true });

/** Roca de unos 1,1 m, centrada en su origen (colisionador: una esfera de 0,5 m). */
export function createRock(radius = 0.6): Mesh {
  const m = new Mesh(rockGeometry(radius), rockMaterial);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
