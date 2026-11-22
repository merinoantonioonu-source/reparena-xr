/**
 * El mar de la costa pirata (las reglas del usuario: el agua, realista, no una mancha azul): olas que corren, ondas finas que
 * el viento eriza a rachas, reflejo del cielo (más en lo lejano y rasante), el azul verdoso de lo hondo y destellos del sol.
 *
 * Un plano grande bajo el muelle, quieto bajo tus pies como el césped del bosque: lo que se mueve es su dibujo, que corre y
 * gira con el mundo (`uOff` y el giro del plano: los del sendero), para que no patine bajo lo apoyado. A lo lejos, la niebla del tramo.
 * Sin contorno de tinta. Todo hecho al empezar: cada fotograma solo cambian sus uniformes.
 */
import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from '@iwsdk/core';
import { SEA_Y } from './plat/pieces.js';

/** Lo grande que es (m); a qué altura queda bajo las tablas, `SEA_Y` (pieces.ts: lo usan también el muelle y los islotes). */
export const SEA_SIZE = 420;

const VERT = /* glsl */ `
varying vec2 vP;
varying vec3 vW;
uniform vec2 uOff;
void main() {
  // (el dibujo, en el sitio del sendero: como el del césped, corrido con el mundo; el giro lo lleva el plano)
  vP = vec2(position.x, -position.z) + uOff;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uDeep;
uniform vec3 uFog;
uniform float uDens;
uniform vec3 uSun;
varying vec2 vP;
varying vec3 vW;
// (sin seno de números grandes: en las Quest pierde precisión; el dibujo se repite cada 64 m)
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// la altura del agua en p: tres trenes de olas que corren en distintas direcciones y, encima, rizos finos que van y vienen a rachas
float waves(vec2 p) {
  float h = 0.0;
  h += 0.10 * sin(dot(p, vec2(0.36, 0.22)) + uT * 1.10);
  h += 0.07 * sin(dot(p, vec2(-0.21, 0.41)) + uT * 1.35);
  h += 0.05 * sin(dot(p, vec2(0.55, -0.31)) + uT * 1.70);
  float gust = 0.5 + 0.5 * sin(uT * 0.35 + p.x * 0.02);
  h += (0.025 + 0.03 * gust) * (vnoise(p * 1.6 + vec2(uT * 0.6, uT * 0.4)) + 0.6 * vnoise(p * 3.7 - vec2(uT * 0.9, -uT * 0.5)));
  return h;
}
void main() {
  vec2 p = mod(vP, 64.0 * 6.2831853);
  float e = 0.08, h0 = waves(p);
  vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0)) - h0) / e, 1.0, -(waves(p + vec2(0.0, e)) - h0) / e));
  vec3 V = normalize(cameraPosition - vW);
  float d = length(cameraPosition - vW);
  // (lo lejano, más liso: si no, las olas pequeñas parpadean)
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 140.0, d)));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.5, R.y));
  // lo hondo, azul verdoso, más claro en la cresta de las olas
  vec3 water = uDeep * (0.8 + 2.2 * max(h0, 0.0));
  vec3 col = mix(water, sky, fres);
  // los destellos del sol (y algo de espuma en las crestas más altas)
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(R, uSun), 0.0), 220.0) * 2.2;
  col += vec3(0.85) * smoothstep(0.17, 0.24, h0) * 0.35;
  // la niebla del tramo
  float f = 1.0 - exp(-pow(d * uDens, 2.0));
  gl_FragColor = vec4(mix(col, uFog, f), 1.0);
}`;

export class Sea {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uOff: { value: [0, 0] },
        uSky: { value: new Color(0x7fb2e0) },
        uHorizon: { value: new Color(0xd8e8f0) },
        uDeep: { value: new Color(0x0d4a5a) },
        uFog: { value: new Color(0xcfe4ee) },
        uDens: { value: 0.008 },
        uSun: { value: new Vector3(0.3, 0.45, -0.84).normalize() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      toneMapped: false,
    });
    const g = new PlaneGeometry(SEA_SIZE, SEA_SIZE, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(g, this.mat);
    this.mesh.position.y = SEA_Y;
    this.mesh.name = 'travesia-mar';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.noInk = true;
  }

  /**
   * Cada fotograma: si se ve (en la costa), el reloj, dónde está el sendero (x, z y giro del mundo, como el césped; `du`, lo
   * que se desplaza en una bifurcación) y el color de la niebla y su densidad. En el atardecer (`dusk`), el cielo reflejado es
   * naranja.
   */
  update(on: boolean, t: number, x: number, z: number, th: number, du: number, fog: number, dens: number, dusk: number): void {
    this.mesh.visible = on;
    if (!on) return;
    const U = this.mat.uniforms;
    U.uT.value = t;
    (U.uOff.value as number[])[0] = x;
    (U.uOff.value as number[])[1] = -z;
    this.mesh.rotation.y = th;
    this.mesh.position.x = du;
    (U.uFog.value as Color).setHex(fog);
    U.uDens.value = dens;
    (U.uHorizon.value as Color).setHex(fog);
    (U.uSky.value as Color).setHex(dusk ? 0xc98a7a : 0x7fb2e0);
  }
}
