/**
 * El mar de nubes del risco: bajo el horizonte, nubes blancas y mullidas con sombra gris azulada que tapan el suelo de la foto
 * de fondo (las fotos están hechas de pie en una loma: sin esto, a la derecha del sendero parecía haber una llanura a tus pies,
 * no un vacío). Cerca del horizonte se deshacen en bruma y dejan ver las montañas de la foto; los riscos lejanos salen de ellas.
 *
 * Como las nubes del cielo de Cómic (`comic-sky.scene-asset.ts`): una esfera que el sombreador lleva al infinito (sigue a la
 * cabeza y nunca se recorta) y que tapa todo lo demás de la escena. Sin contorno de tinta: va con la foto, que es realista.
 */
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from '@iwsdk/core';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = mat3(modelMatrix) * position;
  vec4 c = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(vDir, 1.0);
  gl_Position = c.xyww;
}`;

const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uHaze;
varying vec3 vDir;
// (sin seno: en las Quest, sin(números grandes) pierde precisión)
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.48; } return v / 0.9927; }
void main() {
  vec3 d = normalize(vDir); float h = d.y;
  if (h > 0.03) discard;
  // (el plano de las nubes, muy abajo: lo de debajo de ti, grande; hacia el horizonte, cada vez más pequeño y apretado)
  float k = 1.0 / max(-h + 0.035, 0.035);
  vec2 uv = d.xz * k * 0.55 + vec2(uT * 0.006, uT * 0.0025);
  float n = fbm(uv), n2 = fbm(uv + vec2(0.11, 0.07));
  // relieve: lo alto de cada nube, blanco; las hondonadas y el lado de la sombra, gris azulado
  float top = smoothstep(0.32, 0.78, n), side = clamp((n - n2) * 4.0 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.58, 0.63, 0.73), vec3(1.0, 0.99, 0.97), top * (0.55 + 0.45 * side));
  // a lo lejos, la bruma (el color de la niebla del tramo)
  float far = smoothstep(-0.2, 0.0, h);
  col = mix(col, uHaze, far * 0.7);
  // casi opacas bajo los pies; en el horizonte, bruma que deja ver las montañas de la foto
  // (la bruma, solo en la franja del horizonte: más abajo, el suelo de la foto se veía como una llanura tras las nubes)
  float a = smoothstep(0.015, -0.03, h) * mix(0.85 + 0.15 * top, 1.0, smoothstep(-0.15, -0.4, h));
  gl_FragColor = vec4(col, a);
}`;

const WHITE = new Color(0xffffff);

export class CloudSea {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;

  constructor() {
    this.mat = new ShaderMaterial({ uniforms: { uT: { value: 0 }, uHaze: { value: new Color(0xc8d6e4) } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false, side: BackSide });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), this.mat);
    this.mesh.name = 'travesia-mar-de-nubes';
    // (justo detrás de la foto de fondo y de las nubes del cielo: lo demás de la escena, delante)
    this.mesh.renderOrder = -1e8 + 1;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.noInk = true;
  }

  /** Cada fotograma: si se ve (en el risco), el reloj y el color de la bruma (el de la niebla del tramo). */
  update(on: boolean, t: number, haze: number): void {
    this.mesh.visible = on;
    if (!on) return;
    this.mat.uniforms.uT.value = t;
    // (la niebla del atardecer es naranja: tal cual, la franja del horizonte parecía tierra; aclarada, bruma)
    (this.mat.uniforms.uHaze.value as Color).setHex(haze).lerp(WHITE, 0.55);
  }
}
