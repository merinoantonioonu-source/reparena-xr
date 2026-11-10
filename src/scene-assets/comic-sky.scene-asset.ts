/**
 * Las nubes de dibujo del estilo Cómic (RepArena, src/38_comic.js): blancas, con la panza lavanda y el borde entintado
 * (de grosor fijo en pantalla), que derivan muy despacio. El cielo de detrás (el degradado de melocotón a azul) es el de
 * IWSDK (DomeGradient, en la escena); esto es una capa transparente delante de él, pegada al infinito como su cúpula:
 * sigue a la cabeza y nunca se recorta. La tapan todas las cosas de la escena (y las montañas del fondo).
 * El juego mueve las nubes con el reloj: uniforme uT del material de «comic-clouds» (ComicSystem).
 */
import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from '@iwsdk/core';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  // (como la cúpula de IWSDK: solo la dirección, en la profundidad del infinito)
  vDir = mat3(modelMatrix) * position;
  vec4 c = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(vDir, 1.0);
  gl_Position = c.xyww;
}`;

const FRAG = /* glsl */ `
uniform float uT;
varying vec3 vDir;
// (sin seno: en las Quest, sin(números grandes) pierde precisión y el ruido salía en bloques rectos)
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.6; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.42; } return v / 0.9564; }
// bultos redondos junto al borde de cada nube: las ondas de una nube de dibujo (hacia el horizonte, sin bultos)
float bumps(vec2 p){ vec2 i = floor(p), f = fract(p); float m = 1.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 q = o + vec2(hash(i + o), hash(i + o + 17.3)) * 0.8 + 0.1; m = min(m, length(q - f)); } return 1.0 - m; }
float cloudF(vec2 p, float h){ float f = fbm(p); return f * 0.88 + bumps(p * 5.0) * 0.14 * smoothstep(0.42, 0.58, f) * smoothstep(0.06, 0.3, h); }
void main() {
  vec3 d = normalize(vDir); float h = d.y;
  // en una cúpula que apenas se estira hacia el horizonte; allí no se cortan: encogen (el umbral sube)
  vec2 uv = d.xz / (max(h, 0.0) + 0.5) * 2.0 + vec2(uT * 0.008, uT * 0.003);
  float n = cloudF(uv, h), thr = 0.63 + 0.22 * (1.0 - smoothstep(0.05, 0.3, h));
  float fw = max(fwidth(n), 1e-4), cl = smoothstep(thr - fw, thr, n), ink = smoothstep(thr - fw * 3.5, thr - fw * 2.5, n) - cl;
  // por dentro: blanca arriba y con la panza lavanda (la sombra, por el lado de abajo de cada nube)
  vec2 u2 = uv - d.xz * 0.12; float top = smoothstep(thr, thr + 0.09, cloudF(u2, h));
  vec3 cloud = mix(vec3(0.82, 0.78, 0.97), vec3(1.0), top);
  vec3 col = mix(cloud, vec3(0.2, 0.13, 0.25), ink * 0.85 / max(cl + ink * 0.85, 1e-4));
  float a = clamp(cl + ink * 0.85, 0.0, 1.0) * smoothstep(-0.01, 0.06, h); // (por debajo del horizonte, nada)
  gl_FragColor = vec4(col, a);
}`;

/** La capa de nubes (una esfera de radio 1: el sombreador la lleva al infinito). */
export function createComicClouds(): Mesh {
  const mat = new ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false });
  mat.side = BackSide; // (se ve desde dentro)
  const m = new Mesh(new SphereGeometry(1, 48, 24), mat);
  m.name = 'comic-clouds';
  m.renderOrder = -1e8; // (justo después de la cúpula del cielo de IWSDK, antes que cualquier otra cosa transparente)
  m.frustumCulled = false;
  m.userData.iwsdkPreviewBounds = 'exclude';
  return m;
}
