/**
 * El agua de la montaña de la cuerda (las reglas del usuario: «el agua, realista, no una mancha azul: ondas que el viento eriza
 * a rachas, reflejo del cielo y destellos; en el río, corriente con espuma y estelas en las piedras»): el río y los arroyos
 * (cintas que siguen su cauce, con la corriente que baja, espuma en las orillas y más agitada donde cae una cascada) y el lago
 * (un disco quieto, con ondas, reflejo y destellos). Y la bruma al pie de cada cascada.
 *
 * Las mallas se hacen al empezar la ronda (en plena ronda no se crea nada) en las coordenadas del recorrido, colgadas del grupo
 * que baja contigo al subir; el dibujo del agua va pegado a ella (no patina al moverse el mundo). Sin contorno de tinta.
 */
import { BufferAttribute, BufferGeometry, CircleGeometry, Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { Fall, RopeCourse, WaterPt } from './rope.js';

const VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aFlow;
attribute float aFoam;
varying vec2 vUv;
varying vec2 vP;
varying float vFlow;
varying float vFoam;
varying vec3 vW;
void main() {
  vUv = aUv; vFlow = aFlow; vFoam = aFoam; vP = position.xz;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFog;
uniform float uDens;
uniform vec3 uSun;
varying vec2 vUv;
varying vec2 vP;
varying float vFlow;
varying float vFoam;
varying vec3 vW;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// la superficie: en el lago, ondas que van y vienen y rizos a rachas; en el río, la corriente (bajando por su cauce) con remolinos
float surf(vec2 p, vec2 q) {
  float gust = 0.5 + 0.5 * sin(uT * 0.4 + p.x * 0.05);
  float lake = 0.05 * sin(dot(p, vec2(0.7, 0.4)) + uT * 1.2) + 0.035 * sin(dot(p, vec2(-0.45, 0.8)) + uT * 1.5)
    + (0.02 + 0.03 * gust) * (vnoise(p * 2.2 + uT * 0.5) + 0.6 * vnoise(p * 5.1 - uT * 0.7));
  vec2 r = vec2(q.x * 2.2, q.y * 0.9 - uT * vFlow * 1.4);
  float river = 0.09 * vnoise(r) + 0.06 * vnoise(r * 2.3 + 3.1) + 0.04 * vnoise(r * 5.0 - 1.7);
  return mix(lake, river, clamp(vFlow, 0.0, 1.0));
}
void main() {
  vec2 q = vec2(vUv.x * 1.6, vUv.y);
  float e = 0.06, h0 = surf(vP, q);
  vec3 n = normalize(vec3(-(surf(vP + vec2(e, 0.0), q + vec2(e, 0.0)) - h0) / e, 1.0, -(surf(vP + vec2(0.0, e), q + vec2(0.0, e)) - h0) / e));
  vec3 V = normalize(cameraPosition - vW);
  float d = length(cameraPosition - vW);
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(25.0, 120.0, d)));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.5, R.y));
  // (hondo en medio; junto a la orilla, poco hondo y más claro: se ve el fondo)
  vec3 body = mix(uDeep, uShallow, smoothstep(0.55, 1.0, abs(vUv.x)));
  vec3 col = mix(body * (0.9 + 2.0 * max(h0, 0.0)), sky, fres);
  col += vec3(1.0, 0.96, 0.86) * pow(max(dot(R, uSun), 0.0), 200.0) * 2.0;
  // la espuma: en las orillas del río, en las crestas de la corriente y donde cae una cascada (que se deshace aguas abajo)
  float edge = smoothstep(0.62, 0.98, abs(vUv.x)) * clamp(vFlow, 0.0, 1.0);
  float crest = smoothstep(0.13, 0.19, h0) * vFlow;
  float foam = max(max(edge * (0.45 + 0.55 * vnoise(q * vec2(3.0, 1.2) - vec2(0.0, uT * vFlow * 2.0))), crest * 0.7), vFoam * (0.55 + 0.45 * vnoise(q * 3.0 + uT * 1.3)));
  col = mix(col, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 0.9));
  float f = 1.0 - exp(-pow(d * uDens, 2.0));
  gl_FragColor = vec4(mix(col, uFog, f), 1.0);
}`;

/** La bruma al pie de una cascada: una nube blanca y blanda que se mueve y respira. */
const MIST_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MIST_FS = `uniform float uT; varying vec2 vUv;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 c = vUv - vec2(0.5, 0.25);
  float r = length(c * vec2(1.0, 1.6)), n = vnoise(vUv * 5.0 + vec2(0.0, -uT * 0.6)) * 0.6 + vnoise(vUv * 11.0 + vec2(uT * 0.3, -uT)) * 0.4;
  float a = smoothstep(0.55, 0.0, r) * (0.35 + 0.65 * n) * smoothstep(0.0, 0.1, vUv.y);
  gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), a * 0.55);
}`;

export class RopeWater {
  readonly mat: ShaderMaterial;
  readonly mistMat: ShaderMaterial;
  /** Las mallas de esta ronda (el río, el lago, los arroyos y las brumas), colgadas de `parent`. */
  private meshes: Mesh[] = [];

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uSky: { value: new Color(0x7fb2e0) },
        uHorizon: { value: new Color(0xd8e8f0) },
        uDeep: { value: new Color(0x245f66) },
        uShallow: { value: new Color(0x4f9c95) },
        uFog: { value: new Color(0xcfe4ee) },
        uDens: { value: 0.006 },
        uSun: { value: new Vector3(0.3, 0.55, -0.78).normalize() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      toneMapped: false,
      side: DoubleSide,
    });
    this.mistMat = new ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
  }

  /** Las mallas de prueba (para compilar sus sombreadores en el menú: warmKeep). */
  samples(): Mesh[] {
    return [new Mesh(ribbon([{ h: 0, u: 0, y: 0 }, { h: 1, u: 0, y: 0 }], 1, 1, []), this.mat), new Mesh(new PlaneGeometry(1, 1), this.mistMat)];
  }

  /** Rehace el agua de la ronda (C) en `parent` (el grupo del recorrido). */
  build(C: RopeCourse | null, parent: { add(m: Mesh): void; remove(m: Mesh): void }): void {
    for (const m of this.meshes) {
      parent.remove(m);
      if (m.material !== this.mistMat) m.geometry.dispose();
    }
    this.meshes = [];
    if (!C) return;
    const add = (g: BufferGeometry, mat: ShaderMaterial = this.mat): Mesh => {
      const m = new Mesh(g, mat);
      m.userData.noInk = true;
      m.frustumCulled = false;
      m.receiveShadow = false;
      parent.add(m);
      this.meshes.push(m);
      return m;
    };
    if (C.river.length > 1) add(ribbon(C.river, 4.8, 1, C.falls));
    for (const S of C.streams) add(ribbon(S.pts, S.w, 0.85, C.falls));
    // el lago: un disco quieto, a su nivel (su orilla lo tapa por los bordes)
    const L = C.lake, lg = new CircleGeometry(L.r, 48).rotateX(-Math.PI / 2);
    const n = lg.attributes.position.count, uv = new Float32Array(n * 2), fl = new Float32Array(n), fo = new Float32Array(n), lp = lg.attributes.position;
    // (a lo ancho, lo lejos del centro: el borde, poco hondo)
    for (let i = 0; i < n; i++) uv[i * 2] = Math.hypot(lp.getX(i), lp.getZ(i)) / L.r;
    lg.setAttribute('aUv', new BufferAttribute(uv, 2));
    lg.setAttribute('aFlow', new BufferAttribute(fl, 1));
    lg.setAttribute('aFoam', new BufferAttribute(fo, 1));
    add(lg).position.set(L.u, L.y, -L.h);
    // la bruma al pie de cada cascada
    for (const F of C.falls) {
      const m = add(new PlaneGeometry(F.w * 2.2, Math.min(7, 2 + F.w)).translate(0, Math.min(7, 2 + F.w) * 0.25, 0), this.mistMat);
      m.position.set(F.u + Math.sin(F.face) * 0.8, F.bot, -F.h + Math.cos(F.face) * 0.8);
      m.rotation.y = F.face;
      m.renderOrder = 2;
    }
  }

  /** Cada fotograma: el reloj y el color de la niebla (la del horizonte de la foto de fondo). */
  update(t: number, fog: number, dens: number): void {
    const U = this.mat.uniforms;
    U.uT.value = t;
    (U.uFog.value as Color).setHex(fog);
    (U.uHorizon.value as Color).setHex(fog);
    U.uDens.value = dens;
    this.mistMat.uniforms.uT.value = t;
  }
}

/** Una cinta de agua por los puntos de su cauce (h, u, y; ancho `w`): a lo ancho, de −1 a 1; a lo largo, los metros desde su
 * nacimiento (el dibujo de la corriente baja de los primeros a los últimos). `flow`: lo deprisa que corre; donde cae una
 * cascada, espuma. */
function ribbon(pts: WaterPt[], w: number, flow: number, falls: Fall[]): BufferGeometry {
  const n = pts.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), fl = new Float32Array(n * 2), fo = new Float32Array(n * 2), idx: number[] = [];
  // (la corriente baja: de lo más alto a lo más bajo; el río va de abajo —el lago— arriba, así que a lo largo se cuenta al revés)
  const down = pts[n - 1].y < pts[0].y;
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dh = b.h - a.h, du = b.u - a.u;
    const L = Math.hypot(dh, du) || 1;
    dh /= L;
    du /= L;
    if (i) along += Math.hypot(p.h - pts[i - 1].h, p.u - pts[i - 1].u);
    let foam = 0;
    for (const F of falls) foam = Math.max(foam, 1 - Math.min(1, Math.hypot(F.h - p.h, F.u - p.u) / 7));
    for (let k = 0; k < 2; k++) {
      const sd = k ? 1 : -1, j = i * 2 + k;
      // (a lo ancho: perpendicular al cauce, en horizontal)
      pos[j * 3] = p.u + sd * (w / 2) * dh;
      pos[j * 3 + 1] = p.y;
      pos[j * 3 + 2] = -(p.h - sd * (w / 2) * du);
      uv[j * 2] = sd;
      uv[j * 2 + 1] = down ? along : -along;
      fl[j] = flow;
      fo[j] = foam;
    }
    if (i) {
      const a0 = (i - 1) * 2, b0 = i * 2;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aUv', new BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new BufferAttribute(fl, 1));
  g.setAttribute('aFoam', new BufferAttribute(fo, 1));
  g.setIndex(idx);
  return g;
}

