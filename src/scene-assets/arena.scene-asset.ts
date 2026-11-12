/**
 * La arena, hecha en código (sin descargas): el suelo de arena con grietas a tinta del estilo Cómic, el aro donde te
 * pones. Todo determinista (sin azar ni reloj): el editor y el juego evalúan este módulo por
 * separado y tienen que sacar lo mismo.
 */
import {
  CircleGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
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

/** El azar con semilla de RepArena (src/20_render.js: rng): con la misma semilla, lo mismo que allí. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// El suelo de cómic (RepArena, src/38_comic.js): color arena, con manchas algo más claras y grietas a tinta que se
// ramifican. Se repite sin costuras (las grietas que salen por un borde entran por el contrario)
function sandTexture(): DataTexture {
  const S = 1024, data = new Uint8Array(S * S * 4), R = mulberry(11);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = 0xec;
    data[i * 4 + 1] = 0xc9;
    data[i * 4 + 2] = 0xa4;
    data[i * 4 + 3] = 255;
  }
  const blend = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
    const i = ((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4;
    data[i] += (r - data[i]) * a;
    data[i + 1] += (g - data[i + 1]) * a;
    data[i + 2] += (b - data[i + 2]) * a;
  };
  // manchas claras: elipses suaves
  for (let k = 0; k < 26; k++) {
    const cx = R() * S, cy = R() * S, rx = 30 + R() * 90, ry = 20 + R() * 60, rot = R() * 3, al = 0.25 + R() * 0.25, c = Math.cos(rot), sn = Math.sin(rot), m = Math.max(rx, ry);
    for (let y = -m; y <= m; y++)
      for (let x = -m; x <= m; x++) {
        const u = (x * c + y * sn) / rx, v = (-x * sn + y * c) / ry, d = u * u + v * v;
        if (d < 1) blend(Math.round(cx + x), Math.round(cy + y), 255, 240, 220, al * (1 - d * d));
      }
  }
  // grietas: trazos que tuercen y se ramifican, más finos en cada rama
  const dot = (px: number, py: number, w: number): void => {
    const r = w / 2, rr = Math.ceil(r + 1);
    for (let y = -rr; y <= rr; y++)
      for (let x = -rr; x <= rr; x++) {
        const d = Math.hypot(x, y);
        if (d < r + 0.5) blend(Math.round(px + x), Math.round(py + y), 0x3a, 0x24, 0x30, Math.min(1, r + 0.5 - d));
      }
  };
  const crack = (px: number, py: number, a: number, len: number, w: number): void => {
    for (let k = 0; k < len; k++) {
      a += (R() - 0.5) * 0.9;
      const nx = px + Math.cos(a) * 14, ny = py + Math.sin(a) * 14;
      for (let t = 0; t <= 14; t++) dot(px + (nx - px) * (t / 14), py + (ny - py) * (t / 14), w);
      px = nx;
      py = ny;
      if (R() < 0.12 && w > 1.2) crack(px, py, a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6), (len * 0.5) | 0, w * 0.6);
    }
  };
  for (let k = 0; k < 14; k++) crack(R() * S, R() * S, R() * Math.PI * 2, 8 + ((R() * 10) | 0), 2.6 + R() * 1.6);
  const tex = new DataTexture(data, S, S, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8; // (de lejos, las grietas no se emborronan)
  tex.needsUpdate = true;
  return tex;
}

// sin luz propia, como en RepArena: un dibujo (con el sombreado de cómic, el suelo plano sacaba un brillo redondo)
const floorMaterial = new MeshBasicMaterial({ map: sandTexture(), toneMapped: false });

/** El suelo: un disco de arena de 70 m de radio (lo lejano se funde con el cielo con DomeFade y la neblina, en la
 * escena). Origen a ras de suelo. */
export function createArenaFloor(radius = 70): Group {
  const g = new Group();
  const plane = new Mesh(new CircleGeometry(radius, 96), floorMaterial);
  plane.rotation.x = -Math.PI / 2;
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
