/**
 * Cómo es por fuera lo que lanzan los enemigos (pedido del usuario: «una bola sin relieve; hazlo mucho más realista y
 * complejo, con relieve, claroscuros y movimiento realista en el aire»). Cada clase, su forma con bultos de verdad y su
 * sombreador, con la luz del sol de arriba (claro de un lado, oscuro del otro) y su textura que se mueve:
 *
 * - **roca fundida** (las bolas de fuego del demonio y del Demonio verde, y la piedra del lanzador): costra oscura y rugosa,
 *   iluminada por un lado, con grietas al rojo que laten y fluyen, y un halo de calor en el borde;
 * - **plasma** (el Alien alto): una esfera de energía con remolinos que giran, el núcleo blanco y el borde encendido;
 * - **nieve** (el Yeti): una bola apretada a mano, con grumos, sombras en los huecos y destellos de escarcha;
 * - **baba** (el cangrejo): una gota que tiembla, verde oscura por dentro y clara en el borde, con su brillo húmedo.
 *
 * Las formas y los materiales se hacen una vez (al pedirlos) y se comparten; cada fotograma solo cambia el tiempo.
 */
import { AdditiveBlending, BufferAttribute, Color, DoubleSide, IcosahedronGeometry, Mesh, ShaderMaterial, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { BufferGeometry } from '@iwsdk/core';
import { warmKeep } from './warm.js';

/** Ruido 3D (simplex de Ashima/McEwan, de dominio público) y su suma en octavas. */
const NOISE = `
vec3 m289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 m289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 perm(vec4 x){return m289(((x*34.0)+1.0)*x);} vec4 tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){ const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy); vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=m289(i); vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
float fbm(vec3 p){ return 0.55*snoise(p)+0.28*snoise(p*2.03+3.1)+0.17*snoise(p*4.07+7.7); }
`;

/** Lo común del vértice: la normal, la vista y el sol (de arriba, algo de lado) en el espacio de la cámara; `vP`, el punto en
 * la forma (para que la textura vaya con ella al girar). `WOBBLE`: lo que tiembla (la baba). */
const vert = (wobble: string): string => `${NOISE}
uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP;
void main(){ vec3 p = position; ${wobble}
  vP = position; vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vL = normalize((viewMatrix * vec4(0.45, 1.0, 0.35, 0.0)).xyz);
  gl_Position = projectionMatrix * mv; }`;

// la roca fundida: costra rugosa iluminada por el sol; grietas al rojo que fluyen y laten; halo de calor en el borde
const FRAG_MOLTEN = `${NOISE}
uniform float uTime; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCrust; uniform float uCracks;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP;
void main(){ vec3 N = normalize(vN);
  float rough = fbm(vP * 7.0);
  // (la rugosidad tuerce un poco la normal: los bultos pequeños dan su claroscuro)
  N = normalize(N + 0.35 * vec3(snoise(vP * 9.0), snoise(vP * 9.0 + 5.0), snoise(vP * 9.0 + 9.0)));
  float lam = max(dot(N, vL), 0.0), ndv = max(dot(N, vV), 0.0);
  vec3 crust = uCrust * (0.18 + 0.95 * lam) * (0.75 + 0.35 * rough);
  float flow = fbm(vP * 2.6 + vec3(0.0, -uTime * 0.9, uTime * 0.35));
  float crack = smoothstep(uCracks, uCracks + 0.18, flow);
  float pulse = 0.85 + 0.15 * sin(uTime * 11.0 + flow * 6.0);
  vec3 glow = mix(uMid, uHot, smoothstep(uCracks + 0.1, uCracks + 0.45, flow)) * (1.6 * pulse);
  vec3 c = mix(crust, glow, crack);
  c += uMid * pow(1.0 - ndv, 2.5) * 1.1; // (el calor del borde)
  gl_FragColor = vec4(c, 1.0); }`;

// el plasma: remolinos que giran, el núcleo blanco (de frente) y el borde encendido
const FRAG_PLASMA = `${NOISE}
uniform float uTime; uniform vec3 uDeep; uniform vec3 uHot;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP;
void main(){ vec3 N = normalize(vN); float ndv = max(dot(N, vV), 0.0);
  float a = uTime * 1.7; vec3 q = vec3(vP.x * cos(a) - vP.z * sin(a), vP.y, vP.x * sin(a) + vP.z * cos(a));
  float sw = fbm(q * 2.2 + vec3(0.0, uTime * 0.8, 0.0));
  float bands = 0.5 + 0.5 * sin(sw * 9.0 + uTime * 5.0);
  vec3 body = mix(uDeep * 0.35, uDeep * 1.4, bands);
  vec3 c = body + uHot * pow(ndv, 5.0) * 1.4 + mix(uDeep, uHot, 0.5) * pow(1.0 - ndv, 2.0) * 1.6;
  c += uHot * smoothstep(0.55, 0.9, sw) * 0.8; // (los chispazos de dentro)
  gl_FragColor = vec4(c, 1.0); }`;

// la nieve: grumos (la normal torcida por el ruido), sombra en los huecos, luz del cielo azulada y destellos de escarcha
const FRAG_SNOW = `${NOISE}
uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP;
void main(){ vec3 N = normalize(vN);
  N = normalize(N + 0.22 * vec3(snoise(vP * 6.0), snoise(vP * 6.0 + 4.0), snoise(vP * 6.0 + 8.0)));
  float lam = max(dot(N, vL), 0.0), sky = 0.5 + 0.5 * N.y, ndv = max(dot(N, vV), 0.0);
  float cav = smoothstep(-0.6, 0.5, fbm(vP * 4.0));
  // (la nieve es blanca: hasta en la sombra la luz del cielo la aclara; los huecos, algo azulados)
  vec3 c = vec3(1.0, 0.99, 0.97) * (0.42 + 0.58 * lam) * (0.82 + 0.18 * cav) + vec3(0.30, 0.40, 0.55) * sky * 0.35;
  float g = snoise(vP * 38.0 + vV * 3.0);
  c += vec3(1.0) * smoothstep(0.82, 0.95, g) * (0.4 + 0.6 * lam); // (la escarcha, que brilla según la miras)
  c += vec3(0.6, 0.8, 1.0) * pow(1.0 - ndv, 3.0) * 0.25;
  gl_FragColor = vec4(c, 1.0); }`;

// la baba: oscura por dentro y clara en el borde (la luz la atraviesa), un brillo húmedo y burbujas
const FRAG_SLIME = `${NOISE}
uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vP;
void main(){ vec3 N = normalize(vN); float ndv = max(dot(N, vV), 0.0), lam = max(dot(N, vL), 0.0);
  vec3 H = normalize(vL + vV); float spec = pow(max(dot(N, H), 0.0), 70.0);
  vec3 deep = vec3(0.08, 0.28, 0.03), lite = vec3(0.62, 0.95, 0.22);
  vec3 c = mix(deep, lite, pow(1.0 - ndv, 1.4)) * (0.45 + 0.75 * lam);
  float bub = smoothstep(0.62, 0.75, snoise(vP * 5.0 + vec3(0.0, uTime * 0.6, 0.0)));
  c = mix(c, deep * 0.5, bub * 0.6);
  c += vec3(1.0, 1.0, 0.9) * spec * 1.3 + vec3(0.7, 1.0, 0.3) * pow(1.0 - ndv, 4.0) * 0.5;
  gl_FragColor = vec4(c, 0.93); }`;

/** Una bola con bultos de verdad (icosaedro deformado con ruido, sus normales rehechas): para la nieve y la roca. */
function lumpy(detail: number, amp: number, seed: number, smooth = true): BufferGeometry {
  const g = new IcosahedronGeometry(1, detail), P = g.attributes.position as BufferAttribute, v = new Vector3();
  // (ruido de valor sencillo en 3D, con su semilla: siempre la misma forma)
  const h = (x: number, y: number, z: number): number => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    let o = 0;
    for (let k = 0; k < 8; k++) {
      const a = k & 1, b = (k >> 1) & 1, c = (k >> 2) & 1;
      o += h(xi + a, yi + b, zi + c) * (a ? sx : 1 - sx) * (b ? sy : 1 - sy) * (c ? sz : 1 - sz);
    }
    return o;
  };
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    const n = 0.6 * vn(v.x * 1.8 + 5, v.y * 1.8 + 5, v.z * 1.8 + 5) + 0.4 * vn(v.x * 4 + 9, v.y * 4 + 9, v.z * 4 + 9);
    v.multiplyScalar(1 + amp * (n - 0.5) * 2);
    P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  if (smooth) {
    // (normales suaves: el icosaedro trae cada cara con sus vértices; los del mismo punto, con la media de sus caras)
    const N = g.attributes.normal as BufferAttribute, acc = new Map<string, Vector3>(), key = (i: number): string => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    for (let i = 0; i < P.count; i++) {
      const k = key(i), a = acc.get(k) ?? acc.set(k, new Vector3()).get(k)!;
      a.x += N.getX(i);
      a.y += N.getY(i);
      a.z += N.getZ(i);
    }
    for (let i = 0; i < P.count; i++) {
      const a = acc.get(key(i))!;
      v.copy(a).normalize();
      N.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}

export type BallKind = 'fire' | 'greenFire' | 'meteor' | 'plasma' | 'snow' | 'slime';

interface Looks {
  geo: Record<BallKind, BufferGeometry>;
  mat: Record<BallKind, ShaderMaterial>;
  ring: BufferGeometry;
  ringMat: ShaderMaterial;
  time: { value: number };
}
let L: Looks | null = null;

/** Las formas y los materiales (hechos al pedirlos la primera vez; precompilados en el menú). */
export function looks(): Looks {
  if (L) return L;
  const time = { value: 0 };
  const molten = (hot: number, mid: number, crust: number, cracks: number): ShaderMaterial =>
    new ShaderMaterial({ uniforms: { uTime: time, uHot: { value: new Color(hot) }, uMid: { value: new Color(mid) }, uCrust: { value: new Color(crust) }, uCracks: { value: cracks } }, vertexShader: vert(''), fragmentShader: FRAG_MOLTEN });
  const plain = (frag: string, wobble = '', extra: Record<string, { value: unknown }> = {}, transparent = false): ShaderMaterial =>
    new ShaderMaterial({ uniforms: { uTime: time, ...extra }, vertexShader: vert(wobble), fragmentShader: frag, transparent });
  const rock = lumpy(3, 0.16, 1.7, false), ball = lumpy(4, 0.07, 4.2), smooth = new IcosahedronGeometry(1, 4);
  L = {
    geo: { fire: ball, greenFire: ball, meteor: rock, plasma: smooth, snow: lumpy(4, 0.1, 8.9), slime: new IcosahedronGeometry(1, 3) },
    mat: {
      fire: molten(0xfff2a0, 0xff5a10, 0x2a1a14, -0.05),
      greenFire: molten(0xf4ffb0, 0x3ae01a, 0x1a2414, -0.05),
      meteor: molten(0xffe08a, 0xff4a0a, 0x4a3c32, 0.28),
      plasma: plain(FRAG_PLASMA, '', { uDeep: { value: new Color(0x6a1ae0) }, uHot: { value: new Color(0xffe6ff) } }),
      snow: plain(FRAG_SNOW),
      // (la baba tiembla: el ruido mueve la superficie con el tiempo)
      slime: plain(FRAG_SLIME, 'p *= 1.0 + 0.13 * snoise(normalize(p) * 1.6 + vec3(uTime * 2.2, uTime * 1.7, 0.0));', {}, true),
    },
    ring: new TorusGeometry(1.55, 0.035, 6, 48),
    ringMat: new ShaderMaterial({
      uniforms: { uTime: time },
      vertexShader: 'uniform float uTime; varying float vA; void main(){ vA = 0.5 + 0.5 * sin(atan(position.y, position.x) * 3.0 - uTime * 9.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.75, 0.45, 1.0) * (0.4 + 0.9 * vA), 1.0); }',
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
    time,
  };
  for (const k of Object.keys(L.mat) as BallKind[]) warmKeep(new Mesh(L.geo[k], L.mat[k]));
  warmKeep(new Mesh(L.ring, L.ringMat));
  return L;
}

/** El tiempo de las texturas que se mueven (una vez por fotograma basta; llamarlo más no hace nada distinto). */
export function looksTick(): void {
  if (L) L.time.value = performance.now() / 1000;
}
