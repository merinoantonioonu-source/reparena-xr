/**
 * La pared de energía de los arcos inclinados, **campo de fuerza** (elegido por el usuario entre cuatro modelos; el rojo liso
 * casi opaco de antes era «horrible»): una lámina translúcida con panal de hexágonos y una onda que la recorre, que deja muy
 * claro por dónde no se pasa (el hueco bueno lleva su canto verde). Va bajo el lado bajo de la barra y, por encima de ella,
 * en todo el arco (pedido del usuario: arriba parecía hueco). El dibujo, en metros (su `position`). Hecho una vez y
 * compartido: cada fotograma solo cambia su reloj.
 */
import { DoubleSide, NormalBlending, ShaderMaterial } from '@iwsdk/core';

const VERT = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `uniform float uT; uniform float uA; varying vec2 vP;
  void main(){
    vec2 p = vP / 0.08, r = vec2(1.0, 1.732), h = r * 0.5, a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b;
    float e = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y)), line = smoothstep(0.40, 0.49, e);
    float wave = 0.5 + 0.5 * sin(vP.y * 7.0 - uT * 3.2 + vP.x * 2.0);
    float a2 = (0.24 + line * (0.45 + 0.45 * wave)) * uA;
    gl_FragColor = vec4(mix(vec3(1.0, 0.18, 0.3), vec3(1.0, 0.75, 0.85), line * wave), a2);
  }`;

let mat: ShaderMaterial | null = null, hot: ShaderMaterial | null = null;
/** El material del campo de fuerza (`danger`: el que parpadea, cuando te estás metiendo en él). */
export function fieldMaterial(danger = false): ShaderMaterial {
  const mk = (): ShaderMaterial => new ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide, toneMapped: false });
  if (danger) return (hot ??= mk());
  return (mat ??= mk());
}
/** Cada fotograma: su reloj (y el que parpadea, parpadeando). */
export function fieldTick(t: number): void {
  if (mat) mat.uniforms.uT.value = t;
  if (hot) {
    hot.uniforms.uT.value = t;
    hot.uniforms.uA.value = 1.15 + 0.35 * Math.sin(t * 30);
  }
}
