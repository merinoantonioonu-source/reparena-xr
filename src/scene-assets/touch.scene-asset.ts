/**
 * Los objetivos del modo Toques (RepArena, src/74_touch.js: TouchTarget): el aro de neón de la cabeza (un tubo de luz con el
 * centro casi blanco, un brillo suave alrededor y ocho flechas que giran apuntando al hueco), el diamante de las manos y el
 * pulsador del suelo (una base oscura con su tapa luminosa y un aro que late). Sin azar ni reloj: el juego los mueve. Los
 * materiales y las geometrías son de cada uno (el juego los suelta al acabar). La silueta de la mano (el icono) la pone el
 * juego, que dibuja el lienzo.
 */
import { AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DataTexture, DoubleSide, Float32BufferAttribute, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PlaneGeometry, RGBAFormat, RingGeometry, Sprite, SpriteMaterial, TorusGeometry, UnsignedByteType } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';

/** Un halo: un círculo suave (blanco, con su borde difuminado). */
function haloTex(): DataTexture {
  const n = 64, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = r < 0.45 ? 0 : r < 0.62 ? ((r - 0.45) / 0.17) * 0.55 : r < 1 ? 0.55 * Math.pow(1 - (r - 0.62) / 0.38, 2) : 0;
      d.set([255, 255, 255, Math.round(255 * a)], (y * n + x) * 4);
    }
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** Un resplandor sin hueco (para detrás del diamante). */
function glowTex(): DataTexture {
  const n = 32, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.min(1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2);
    d.set([255, 255, 255, Math.round(255 * Math.pow(1 - r, 2))], (y * n + x) * 4);
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const noInk = <T extends Mesh | Sprite>(m: T): T => {
  m.userData.noInk = true;
  return m;
};

/** Una flecha de dos triángulos, la punta hacia el centro. */
function chevGeo(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, -0.1, 0, -0.09, 0.06, 0, 0, 0.015, 0, 0, -0.1, 0, 0, 0.015, 0, 0.09, 0.06, 0], 3));
  return g;
}

/** El aro de neón de la cabeza: radio del tubo 0,88 (el juego lo escala a su hueco). */
export interface TouchRingParts {
  grp: Group;
  /** El tubo y su brillo (hijo suyo: se escalan juntos). */
  ring: Mesh;
  ringMat: MeshBasicMaterial;
  glowMat: MeshBasicMaterial;
  /** Las ocho flechas, que giran en z. */
  chev: Group;
  chevMat: MeshBasicMaterial;
  halo: Mesh;
  haloMat: MeshBasicMaterial;
  own: Material[];
}
export function createTouchRing(color = 0x3cf0c6): TouchRingParts {
  const grp = new Group(), col = new Color(color);
  grp.name = 'touch-ring';
  const ringMat = new MeshBasicMaterial({ color: col.clone().lerp(new Color(0xffffff), 0.5), transparent: true, toneMapped: false });
  const ring = noInk(new Mesh(new TorusGeometry(0.88, 0.075, 12, 96), ringMat));
  const glowMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
  ring.add(noInk(new Mesh(new TorusGeometry(0.88, 0.2, 10, 72), glowMat)));
  grp.add(ring);
  const chevMat = new MeshBasicMaterial({ color: col.clone().multiplyScalar(0.7), transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }), chev = new Group(), cg = chevGeo();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, m = noInk(new Mesh(cg, chevMat));
    m.position.set(Math.cos(a) * 1.22, Math.sin(a) * 1.22, 0);
    m.rotation.z = a - Math.PI / 2;
    chev.add(m);
  }
  grp.add(chev);
  const tex = haloTex(), haloMat = new MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, side: DoubleSide });
  const halo = noInk(new Mesh(new PlaneGeometry(1, 1), haloMat));
  grp.add(halo);
  return { grp, ring, ringMat, glowMat, chev, chevMat, halo, haloMat, own: [ringMat, glowMat, chevMat, haloMat, tex] as unknown as Material[] };
}

/** El diamante de las manos (una octaedro que gira, con un resplandor y, encima, el icono de la mano). */
export interface TouchGemParts {
  grp: Group;
  gem: Mesh;
  mat: MeshStandardMaterial;
  glow: Sprite;
  glowMat: SpriteMaterial;
  icon: Sprite;
  iconMat: SpriteMaterial;
  own: Material[];
}
export function createTouchGem(color = 0x4aa8ff): TouchGemParts {
  const grp = new Group();
  grp.name = 'touch-gem';
  const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.4, flatShading: true });
  mat.userData.comicSoft = true;
  const gem = noInk(new Mesh(new OctahedronGeometry(1, 0), mat));
  gem.scale.set(0.085, 0.125, 0.085);
  grp.add(gem);
  const gt = glowTex(), glowMat = new SpriteMaterial({ map: gt, color, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), glow = noInk(new Sprite(glowMat));
  glow.scale.setScalar(0.45);
  grp.add(glow);
  const iconMat = new SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }), icon = noInk(new Sprite(iconMat));
  icon.scale.set(0.13, 0.13, 1);
  icon.position.y = 0.22;
  grp.add(icon);
  return { grp, gem, mat, glow, glowMat, icon, iconMat, own: [mat, glowMat, iconMat, gt] as unknown as Material[] };
}

/** El pulsador del suelo (Slam): base oscura, tapa luminosa, halo y onda. */
export interface TouchPadParts {
  grp: Group;
  pad: Mesh;
  mat: MeshStandardMaterial;
  halo: Mesh;
  haloMat: MeshBasicMaterial;
  ripple: Mesh;
  rippleMat: MeshBasicMaterial;
  icon: Sprite;
  iconMat: SpriteMaterial;
  own: Material[];
}
export function createTouchPad(color = 0x4aa8ff): TouchPadParts {
  const grp = new Group();
  grp.name = 'touch-pad';
  const baseMat = new MeshStandardMaterial({ color: 0x24212e, metalness: 0.75, roughness: 0.35 }), bg = new CylinderGeometry(0.16, 0.18, 0.035, 32);
  bg.translate(0, 0.015, 0);
  const base = new Mesh(bg, baseMat);
  grp.add(base);
  const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.2, transparent: true });
  mat.userData.comicSoft = true;
  const pad = noInk(new Mesh(new CylinderGeometry(0.12, 0.128, 0.024, 32), mat));
  pad.position.y = 0.033;
  grp.add(pad);
  const tex = haloTex(), haloMat = new MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const halo = noInk(new Mesh(new PlaneGeometry(1, 1), haloMat));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.006;
  halo.scale.setScalar(0.62);
  grp.add(halo);
  const rippleMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
  const ripple = noInk(new Mesh(new RingGeometry(0.17, 0.2, 40), rippleMat));
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.008;
  grp.add(ripple);
  const iconMat = new SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }), icon = noInk(new Sprite(iconMat));
  icon.scale.set(0.13, 0.13, 1);
  icon.position.y = 0.2;
  grp.add(icon);
  return { grp, pad, mat, halo, haloMat, ripple, rippleMat, icon, iconMat, own: [baseMat, mat, haloMat, rippleMat, iconMat, tex] as unknown as Material[] };
}
