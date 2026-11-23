/**
 * La compuerta de la arena (la de RepArena, src/30_env.js: makeGate), hecha en código para el estilo Cómic: colores
 * claros y lisos (sin texturas de relieve), que el sombreado de cómic corta en luz y sombra y entinta.
 * Origen a ras de suelo en el centro de la boca; +Z hacia el jugador. Mide unos 5,6 m de ancho (con los bloques de
 * hormigón), 4,3 de alto (con la baliza) y 2,5 de hondo (con el túnel).
 * Partes con nombre que mueve el juego (GateSystem): door-left y door-right (se deslizan 1,25 m hacia los lados),
 * beacon-spin (gira) y beacon-beam / beacon-body (se encienden con la compuerta abierta). Lo fijo va junto, una malla por
 * material («frame»).
 * Determinista: el editor y el juego evalúan este módulo por separado.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
} from '@iwsdk/core';
import { BufferAttribute, BufferGeometry } from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';

// la franja de peligro: amarilla con rayas oscuras en diagonal (como la de RepArena)
function hazardTexture(rx: number, ry: number): DataTexture {
  const S = 64, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dark = ((x + y) % 32) < 14, i = (y * S + x) * 4;
      data[i] = dark ? 42 : 246;
      data[i + 1] = dark ? 36 : 186;
      data[i + 2] = dark ? 40 : 36;
      data[i + 3] = 255;
    }
  const t = new DataTexture(data, S, S, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Lo largo del haz de la baliza (m). */
export const BEAM_LEN = 5;
// el haz de la baliza, de luz (pedido del usuario: los conos de antes se veían como conos, «irreal»): brillante en su eje y
// desvanecido hacia los bordes (se ve desde cualquier lado sin caras ni la boca del cono), que se apaga hacia la punta, con
// motas de polvo que lo cruzan. uA: lo encendido que está (lo pone GateSystem)
function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uA: { value: 0 }, uT: { value: 0 }, uColor: { value: new Color(0xff3a18) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vL;
      void main(){ vL = length(position) / ${BEAM_LEN.toFixed(1)}; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; uniform float uT; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vL;
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        float soft = pow(f, 2.2);
        float fall = pow(clamp(1.0 - vL, 0.0, 1.0), 1.5) * smoothstep(0.0, 0.06, vL);
        float dust = 0.82 + 0.18 * sin(vL * 37.0 - uT * 3.1) * sin(vL * 11.0 + uT * 1.7);
        float a = uA * soft * fall * dust;
        // (se suma a lo que hay detrás —aditivo—: el alfa a 1 y lo que se ve, en el color)
        gl_FragColor = vec4(uColor * a * 2.4 + vec3(1.0, 0.8, 0.7) * pow(f, 8.0) * fall * uA * 0.6, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  });
}

// la mancha de luz que el haz barre por el suelo, delante de la compuerta: ovalada, con el centro más vivo
function spotTexture(): DataTexture {
  const S = 64, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = (x / (S - 1)) * 2 - 1, v = (y / (S - 1)) * 2 - 1, d = Math.min(1, Math.hypot(u, v)), i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.pow(1 - d, 2.2));
    }
  const t = new DataTexture(data, S, S, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// colores de cómic: claros y vivos, sin texturas de relieve (el sombreado de cómic usa el color)
const std = (color: number): MeshStandardMaterial => new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1 });
const MAT = {
  steel: std(0x5f6f8f),
  gun: std(0x4a556b),
  chrome: std(0xdfe7f0),
  concrete: std(0xcdc5b6),
  door: std(0x8d9bb5),
  doorBand: std(0x3b4458),
  hazardH: new MeshStandardMaterial({ map: hazardTexture(8, 1), roughness: 0.7, metalness: 0 }),
  hazardV: new MeshStandardMaterial({ map: hazardTexture(1, 5), roughness: 0.7, metalness: 0 }),
  glow: new MeshBasicMaterial({ color: 0xff3a24, toneMapped: false }),
  // por dentro, negra de verdad (sin luz ni niebla que la aclare) y dos velos de oscuridad: abierta, no se ve el fondo
  void: new MeshBasicMaterial({ color: 0x000000, fog: false }),
  veil: new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: DoubleSide }),
  beaconBody: new MeshBasicMaterial({ color: 0x3a0c04, toneMapped: false }),
  beam: beamMaterial(),
  spot: new MeshBasicMaterial({ map: spotTexture(), color: 0xff3a18, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false, fog: false }),
};

function part(name: string, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, ry = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.name = name;
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = mat instanceof MeshStandardMaterial;
  return m;
}

// un pilar con su pie, su franja de peligro y su luz roja por dentro, y el tubo cromado por fuera (s: −1 izquierda, +1 derecha)
function pillar(s: number): Group {
  const g = new Group();
  g.name = s < 0 ? 'pillar-left' : 'pillar-right';
  g.add(part('pillar', bevelBox(0.55, 3.7, 0.9, 0.04), MAT.steel, s * 1.5, 1.85, 0));
  g.add(part('foot', bevelBox(0.62, 0.35, 1.0, 0.03), MAT.gun, s * 1.5, 0.175, 0));
  g.add(part('hazard-stripe', new BoxGeometry(0.08, 3.0, 0.6), MAT.hazardV, s * 1.25, 1.5, 0.12));
  g.add(part('red-light', new BoxGeometry(0.03, 2.4, 0.02), MAT.glow, s * 1.22, 1.6, 0.46));
  g.add(part('pipe', new CylinderGeometry(0.05, 0.05, 2.6, 12), MAT.chrome, s * 1.78, 1.6, 0.32));
  g.add(part('pipe-base', new CylinderGeometry(0.08, 0.08, 0.6, 12), MAT.gun, s * 1.78, 0.4, 0.32));
  g.add(part('pipe-cap', bevelBox(0.2, 0.2, 0.2, 0.02), MAT.gun, s * 1.78, 2.95, 0.32));
  return g;
}

// el túnel de dentro, negro, y sus dos velos de oscuridad
function tunnel(): Group {
  const g = new Group();
  g.name = 'tunnel';
  g.add(part('tunnel-back', new BoxGeometry(2.5, 3.1, 0.12), MAT.void, 0, 1.55, -1.5));
  for (const s of [-1, 1]) g.add(part(s < 0 ? 'tunnel-wall-left' : 'tunnel-wall-right', new BoxGeometry(0.12, 3.1, 1.5), MAT.void, s * 1.25, 1.55, -0.75));
  g.add(part('tunnel-roof', new BoxGeometry(2.5, 0.12, 1.5), MAT.void, 0, 3.05, -0.75));
  g.add(part('tunnel-floor', new BoxGeometry(2.5, 0.02, 1.5), MAT.void, 0, 0.012, -0.75));
  for (const z of [-0.45, -0.95]) {
    const v = part('tunnel-veil', new PlaneGeometry(2.4, 3.0), MAT.veil, 0, 1.5, z);
    v.renderOrder = 2;
    v.userData.iwsdkPreviewBounds = 'exclude';
    g.add(v);
  }
  return g;
}

// una puerta corredera, con una banda oscura a media altura (s: −1 la izquierda, +1 la derecha)
function door(s: number): Group {
  const g = new Group();
  g.name = s < 0 ? 'door-left' : 'door-right';
  g.position.set(s * 0.62, 1.5, 0.06); // (cerradas dejan una raja de 1 cm: solapadas, sus caras peleaban y destellaban)
  g.add(part('door-panel', bevelBox(1.23, 3.0, 0.16, 0.025), MAT.door, 0, 0, 0));
  g.add(part('door-band', new BoxGeometry(1.1, 0.22, 0.02), MAT.doorBand, 0, 0.1, 0.085));
  return g;
}

// la baliza: un cuerpo y dos haces rojos que giran (se encienden con la compuerta abierta)
function beacon(): Group {
  const g = new Group();
  g.name = 'beacon';
  g.position.set(0, 4.2, 0.1);
  g.add(part('beacon-body', new CylinderGeometry(0.13, 0.15, 0.22, 14), MAT.beaconBody, 0, 0, 0));
  const spin = new Group();
  spin.name = 'beacon-spin';
  // (un cono abierto que se ensancha desde la lámpara, algo inclinado hacia abajo; lo que se ve es su luz, no su forma)
  const cone = new ConeGeometry(0.75, BEAM_LEN, 20, 1, true);
  cone.translate(0, -BEAM_LEN / 2, 0);
  cone.rotateZ(Math.PI / 2 - 0.18);
  for (const ry of [0, Math.PI]) {
    const b = part('beacon-beam', cone, MAT.beam, 0, 0, 0, ry);
    b.userData.iwsdkPreviewBounds = 'exclude';
    b.userData.noInk = true;
    b.renderOrder = 3;
    spin.add(b);
  }
  g.add(spin);
  return g;
}

/** Lo lejos de la compuerta que barre el suelo la luz de la baliza (m). */
export const SPOT_D = 3.2;
// las dos manchas de luz del suelo (una por haz), que giran con ellos (GateSystem las enciende cuando el haz mira hacia ti)
function beaconFloor(): Group {
  const g = new Group();
  g.name = 'beacon-floor';
  g.position.set(0, 0.03, 0.1);
  const plane = new PlaneGeometry(2.8, 1.5);
  plane.rotateX(-Math.PI / 2);
  for (const ry of [0, Math.PI]) {
    const h = new Group();
    h.rotation.y = ry;
    const m = part('beacon-spot', plane, MAT.spot, SPOT_D, 0, 0);
    m.userData.iwsdkPreviewBounds = 'exclude';
    m.userData.noInk = true;
    h.add(m);
    g.add(h);
  }
  return g;
}

/** La compuerta entera (ver arriba). */
export function createGate(): Group {
  const root = new Group();
  root.name = 'gate';
  const frame = new Group();
  frame.name = 'frame';
  frame.add(pillar(-1), pillar(1));
  frame.add(part('lintel', bevelBox(3.5, 0.55, 0.95, 0.04), MAT.hazardH, 0, 3.42, 0));
  frame.add(part('lintel-cap', bevelBox(3.8, 0.16, 1.05, 0.03), MAT.steel, 0, 3.76, 0));
  frame.add(part('lintel-box', bevelBox(1.0, 0.25, 0.3, 0.03), MAT.gun, 0, 3.965, 0.1));
  const sides = new Group();
  sides.name = 'side-blocks';
  for (const s of [-1, 1]) sides.add(part(s < 0 ? 'block-left' : 'block-right', bevelBox(1.2, 1.2, 2.2, 0.06), MAT.concrete, s * 2.2, 0.6, -0.3, s * 0.15));
  const ramp = part('ramp', new PlaneGeometry(2.6, 0.35), MAT.hazardH, 0, 0.006, 0.75);
  ramp.rotation.x = -Math.PI / 2;
  const fixed = new Group();
  fixed.add(frame, sides, tunnel(), ramp);
  root.add(mergeByMaterial(fixed), door(-1), door(1), beacon(), beaconFloor());
  return root;
}

// Las piezas fijas, juntas en una malla por material (como el Kit de RepArena): la gráfica pinta 9 mallas por compuerta
// en vez de 30 (y sus contornos, igual). Las puertas y la baliza van aparte: se mueven
function mergeByMaterial(fixed: Group): Group {
  fixed.updateMatrixWorld(true);
  const by = new Map<Material, { mesh: Mesh; geos: BufferGeometry[] }>();
  fixed.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as Material, g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const e = by.get(mat) ?? { mesh: m, geos: [] };
    e.geos.push(g);
    by.set(mat, e);
  });
  const out = new Group();
  out.name = 'frame';
  for (const [mat, { mesh, geos }] of by) {
    const merged = new Mesh(concat(geos), mat);
    merged.name = 'frame-' + mesh.name;
    merged.castShadow = merged.receiveShadow = mesh.castShadow;
    merged.renderOrder = mesh.renderOrder;
    merged.userData = { ...mesh.userData };
    out.add(merged);
  }
  return out;
}

// une geometrías sin índice con posición, normal y coordenadas de textura (las que no tengan, a cero)
function concat(geos: BufferGeometry[]): BufferGeometry {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += c;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
