/**
 * Los cuatro modelos propuestos para la pared del lado bajo de los arcos inclinados (pedido del usuario: el rojo liso casi
 * opaco era «horrible»; que quede muy claro por dónde se mete el tronco y que la parte tapada sea menos tosca). Se enseñan en
 * capturas para que el usuario elija; mientras tanto, la de siempre (`solid`). Cada uno, un sombreador sobre el mismo
 * cuadrilátero (de la barra al suelo), con el dibujo en metros (su `position`):
 *  - `bars`: reja de láseres (barrotes finos de luz cada 12 cm, con su emisor abajo y un temblor leve);
 *  - `field`: campo de fuerza (lámina translúcida con panal de hexágonos y una onda que la recorre);
 *  - `plasma`: cortina de plasma (energía roja y naranja que cae como una cascada);
 *  - `shutter`: compuerta blindada (persiana de acero con franjas de peligro abajo y pilotos rojos arriba).
 * Hechos una vez (al empezar) y compartidos: cada fotograma solo cambia su reloj.
 */
import { AdditiveBlending, DoubleSide, NormalBlending, ShaderMaterial } from '@iwsdk/core';

export type WallLook = 'solid' | 'bars' | 'field' | 'plasma' | 'shutter';
export const WALL_LOOKS: WallLook[] = ['bars', 'field', 'plasma', 'shutter'];
/** El modelo que se ve (de serie, el de siempre: solo cambia cuando el usuario elija). */
export const WALL = { look: 'solid' as WallLook };

const VERT = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const NOISE = `float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }`;

const FRAG: Record<Exclude<WallLook, 'solid'>, string> = {
  bars: `uniform float uT; varying vec2 vP;
    void main(){
      float k = floor(vP.x / 0.12), d = abs(fract(vP.x / 0.12) - 0.5) * 0.12;
      float core = smoothstep(0.006, 0.0, d), glow = exp(-d * d / 0.0004) * 0.55;
      float flick = 0.8 + 0.2 * sin(uT * 37.0 + k * 3.1) * sin(uT * 11.0 + k);
      float emit = smoothstep(0.12, 0.04, vP.y);
      vec3 col = vec3(1.0, 0.12, 0.08) * (core * 2.2 + glow) * flick + vec3(1.0, 0.55, 0.3) * emit * 0.9;
      float a = clamp(core + glow * 0.7 + emit * 0.7, 0.0, 1.0);
      if (a < 0.02) discard;
      gl_FragColor = vec4(col, 1.0);
    }`,
  field: `uniform float uT; varying vec2 vP;
    void main(){
      vec2 p = vP / 0.08, r = vec2(1.0, 1.732), h = r * 0.5, a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b;
      float e = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)), line = smoothstep(0.40, 0.49, e);
      float wave = 0.5 + 0.5 * sin(vP.y * 7.0 - uT * 3.2 + vP.x * 2.0);
      float a2 = 0.24 + line * (0.45 + 0.45 * wave) + 0.25 * smoothstep(0.35, 0.0, vP.y) * wave;
      gl_FragColor = vec4(mix(vec3(1.0, 0.18, 0.3), vec3(1.0, 0.75, 0.85), line * wave), a2);
    }`,
  plasma: `uniform float uT; varying vec2 vP; ${NOISE}
    void main(){
      float n = fbm(vec2(vP.x * 3.0, vP.y * 2.0 + uT * 1.6)), m = fbm(vec2(vP.x * 7.0 + 3.0, vP.y * 5.0 + uT * 3.1));
      float v = smoothstep(0.3, 0.95, n * 0.75 + m * 0.45);
      vec3 col = mix(vec3(0.55, 0.02, 0.0), vec3(1.0, 0.62, 0.12), v);
      gl_FragColor = vec4(col * (0.8 + 0.5 * v), 0.55 + 0.4 * v);
    }`,
  shutter: `uniform float uT; varying vec2 vP;
    void main(){
      float s = fract(vP.y / 0.085), shade = 0.55 + 0.35 * smoothstep(0.0, 0.25, s) - 0.3 * smoothstep(0.78, 1.0, s);
      vec3 col = vec3(0.56, 0.6, 0.66) * shade;
      if (vP.y < 0.24) col = mix(vec3(0.96, 0.76, 0.1), vec3(0.08), step(0.5, fract((vP.x + vP.y) / 0.14)));
      // (pilotos rojos que parpadean, en fila, justo encima de las franjas)
      vec2 c = vec2(fract(vP.x / 0.3) - 0.5, (vP.y - 0.31) / 0.3);
      float on = step(0.5, fract(uT * 1.3 + floor(vP.x / 0.3) * 0.5)), lamp = smoothstep(0.12, 0.07, length(c));
      col = mix(col, vec3(1.0, 0.1, 0.05) * (0.6 + 0.8 * on), lamp);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const CACHE = new Map<WallLook, ShaderMaterial>();
/** El material del modelo `look` (uno para todas las paredes; `uT`, su reloj). */
export function wallMaterial(look: Exclude<WallLook, 'solid'>): ShaderMaterial {
  let m = CACHE.get(look);
  if (!m) {
    const add = look === 'bars';
    m = new ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG[look], transparent: look !== 'shutter', depthWrite: look === 'shutter', blending: add ? AdditiveBlending : NormalBlending, side: DoubleSide, toneMapped: false });
    CACHE.set(look, m);
  }
  return m;
}
/** Cada fotograma: el reloj de los modelos. */
export function wallTick(t: number): void {
  for (const m of CACHE.values()) m.uniforms.uT.value = t;
}
