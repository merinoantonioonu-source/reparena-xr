/**
 * Partículas realistas (pedido del usuario: lo que lanzan los enemigos y sus ondas se veían toscos): llamas, humo, polvo,
 * nieve y gotas, cada partícula una bocanada con textura (ruido, como el humo de verdad) que gira, crece, cambia de color con
 * la edad (el fuego, de blanco a amarillo, naranja y rojo; el humo, de oscuro a gris claro) y se desvanece.
 *
 * Dos montones de partículas para todo el juego (dos llamadas de dibujo, se use lo que se use): la luz (llamas, plasma,
 * destellos: suman) y la materia (humo, polvo, nieve, gotas: tapan). Cada fotograma solo se mueven sus números; nada se
 * crea. Como las chispas (src/combat/fx.ts), pegadas a los ojos no se pintan (regla de las gafas). Las mueve `VfxSystem`.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, Group, LinearFilter, NormalBlending, Points, RGBAFormat, ShaderMaterial, UnsignedByteType } from '@iwsdk/core';
import type { Vector3 } from '@iwsdk/core';
import { warmKeep } from './warm.js';

const VERT = `attribute float size; attribute float age; attribute float rot; attribute vec3 c0; attribute vec3 c1; attribute float amax;
  varying float vAge; varying float vRot; varying vec3 vC0; varying vec3 vC1; varying float vA;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float dc = -mv.z;
    vAge = age; vRot = rot; vC0 = c0; vC1 = c1;
    // (lejos de los ojos: las grandes, antes; regla de las gafas)
    vA = amax * smoothstep(0.15 + size * 1.5, 0.45 + size * 3.0, dc);
    gl_Position = projectionMatrix * mv; gl_PointSize = size * 900.0 / max(dc, 0.05);
    if (dc < 0.12 || age < 0.0 || age >= 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
const ROT = `vec2 q = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot); q = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) + 0.5;
  vec4 t = texture2D(map, q);`;
// la luz: el centro más caliente (hacia blanco) mientras es joven; se apaga al envejecer
const FRAG_LIGHT = `uniform sampler2D map; varying float vAge; varying float vRot; varying vec3 vC0; varying vec3 vC1; varying float vA;
  void main(){ ${ROT}
    vec3 c = mix(vC0, vC1, smoothstep(0.0, 0.85, vAge));
    c = mix(c, vec3(1.0), pow(t.r, 3.0) * (1.0 - vAge) * 0.6);
    float a = t.a * smoothstep(0.0, 0.08, vAge) * pow(1.0 - vAge, 1.4) * vA;
    gl_FragColor = vec4(c * a * (0.6 + 0.8 * t.r), a); }`;
// la materia: se aclara por arriba (como iluminada desde el cielo) y se deshace al final
const FRAG_MATTER = `uniform sampler2D map; varying float vAge; varying float vRot; varying vec3 vC0; varying vec3 vC1; varying float vA;
  void main(){ ${ROT}
    vec3 c = mix(vC0, vC1, smoothstep(0.0, 1.0, vAge)) * (0.72 + 0.4 * t.r) * (0.9 + 0.2 * (1.0 - gl_PointCoord.y));
    float a = t.a * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge)) * vA;
    gl_FragColor = vec4(c, a); }`;

/** La bocanada: un borde deshilachado con ruido (fbm) y grumos dentro; en rojo, el brillo interior; en alfa, la forma. */
function puffTex(): DataTexture {
  const N = 64, d = new Uint8Array(N * N * 4);
  // ruido de valor con su semilla fija (siempre la misma textura)
  const G = 16, grid = new Float32Array(G * G);
  let seed = 1234567;
  for (let i = 0; i < grid.length; i++) grid[i] = ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const val = (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (i: number, j: number): number => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
    return g(xi, yi) * (1 - sx) * (1 - sy) + g(xi + 1, yi) * sx * (1 - sy) + g(xi, yi + 1) * (1 - sx) * sy + g(xi + 1, yi + 1) * sx * sy;
  };
  const fbm = (x: number, y: number): number => 0.5 * val(x, y) + 0.27 * val(x * 2.1, y * 2.1) + 0.15 * val(x * 4.3, y * 4.3) + 0.08 * val(x * 8.7, y * 8.7);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5, r = Math.hypot(u, v) * 2;
      const n = fbm((u + 0.5) * 5, (v + 0.5) * 5), rr = r + (n - 0.5) * 0.55;
      const a = Math.max(0, Math.min(1, (1 - rr) / 0.45)) * (0.55 + 0.45 * n);
      const glow = Math.max(0, 1 - r * 1.25) * (0.6 + 0.4 * n);
      d.set([Math.round(255 * Math.min(1, glow)), 255, 255, Math.round(255 * Math.min(1, a * a * (3 - 2 * a)))], (y * N + x) * 4);
    }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Un montón de partículas (la luz o la materia). */
class Pool {
  readonly pts: Points;
  private readonly n: number;
  private next = 0;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly age: Float32Array;
  private readonly rot: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly amax: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly t: Float32Array;
  private readonly s0: Float32Array;
  private readonly grow: Float32Array;
  private readonly drag: Float32Array;
  private readonly grav: Float32Array;
  private readonly spin: Float32Array;
  private alive = 0;

  constructor(n: number, frag: string, add: boolean, map: DataTexture) {
    this.n = n;
    const f = (k: number): Float32Array => new Float32Array(n * k);
    this.pos = f(3);
    this.size = f(1);
    this.age = f(1).fill(-1);
    this.rot = f(1);
    this.c0 = f(3);
    this.c1 = f(3);
    this.amax = f(1);
    this.vel = f(3);
    this.life = f(1);
    this.t = f(1);
    this.s0 = f(1);
    this.grow = f(1);
    this.drag = f(1);
    this.grav = f(1);
    this.spin = f(1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('size', new BufferAttribute(this.size, 1));
    g.setAttribute('age', new BufferAttribute(this.age, 1));
    g.setAttribute('rot', new BufferAttribute(this.rot, 1));
    g.setAttribute('c0', new BufferAttribute(this.c0, 3));
    g.setAttribute('c1', new BufferAttribute(this.c1, 3));
    g.setAttribute('amax', new BufferAttribute(this.amax, 1));
    const m = new ShaderMaterial({ uniforms: { map: { value: map } }, transparent: true, depthWrite: false, blending: add ? AdditiveBlending : NormalBlending, toneMapped: false, vertexShader: VERT, fragmentShader: frag });
    this.pts = new Points(g, m);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = add ? 10 : 9;
    this.pts.userData.noInk = true;
    warmKeep(new Points(g, m));
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, c0: Color, c1: Color, a: number, drag: number, grav: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.s0[i] = this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = Math.max(0.05, life);
    this.t[i] = 0;
    this.age[i] = 0;
    this.rot[i] = Math.random() * 6.283;
    this.spin[i] = (Math.random() - 0.5) * 3;
    this.c0[i * 3] = c0.r;
    this.c0[i * 3 + 1] = c0.g;
    this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r;
    this.c1[i * 3 + 1] = c1.g;
    this.c1[i * 3 + 2] = c1.b;
    this.amax[i] = a;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.alive = 2; // (hay algo que mover: se suben los números este fotograma y el siguiente)
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] < 0) continue;
      this.t[i] += dt;
      const k = this.t[i] / this.life[i];
      if (k >= 1) {
        this.age[i] = -1;
        continue;
      }
      any = true;
      this.age[i] = k;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] * (1 + (this.grow[i] - 1) * Math.sqrt(k));
      this.rot[i] += this.spin[i] * dt;
    }
    const g = this.pts.geometry.attributes;
    g.position.needsUpdate = g.size.needsUpdate = g.age.needsUpdate = g.rot.needsUpdate = g.c0.needsUpdate = g.c1.needsUpdate = g.amax.needsUpdate = true;
    if (!any) this.alive--;
  }
}

/** Colores con nombre (hechos una vez). */
const C = (hex: number): Color => new Color(hex);
const r = (a: number, b: number): number => a + (b - a) * Math.random();

/** Las paletas de cada cosa: de joven a vieja. */
export const PAL = {
  fire: [C(0xfff2c8), C(0xff3a08)],
  greenFire: [C(0xf0ffc8), C(0x18a020)],
  plasma: [C(0xe49aff), C(0x5a12ff)],
  frost: [C(0xffffff), C(0x9fd8ff)],
  slimeGlow: [C(0xe8ff9a), C(0x4cc81a)],
  smoke: [C(0x4a423c), C(0xa49c94)],
  greenSmoke: [C(0x1e2a1c), C(0x6a7a62)],
  dust: [C(0xa8916c), C(0xcab89a)],
  snow: [C(0xf6fbff), C(0xd4e6f4)],
  slime: [C(0x8ae03a), C(0x4a9a18)],
  debris: [C(0x4a3c30), C(0x3a2e24)],
} as const;
type Pal = readonly [Color, Color];

export class Vfx {
  readonly group = new Group();
  readonly light: Pool;
  readonly matter: Pool;

  constructor() {
    const map = puffTex();
    this.light = new Pool(420, FRAG_LIGHT, true, map);
    this.matter = new Pool(420, FRAG_MATTER, false, map);
    this.group.add(this.matter.pts, this.light.pts);
  }

  update(dt: number): void {
    this.light.update(dt);
    this.matter.update(dt);
  }

  /** Llamas (o plasma) en `p`: `n` lenguas de `size` m que suben un poco y se deshacen en `life` s; `spread`, lo que se abren. */
  flames(p: Vector3, n: number, size: number, life: number, pal: Pal, spread = 0.4, up = 0.5, a = 0.9): void {
    for (let i = 0; i < n; i++) this.light.emit(p.x + r(-0.3, 0.3) * size, p.y + r(-0.3, 0.3) * size, p.z + r(-0.3, 0.3) * size, r(-spread, spread), r(-spread, spread) + up, r(-spread, spread), size * r(0.7, 1.2), 1.7, life * r(0.7, 1.2), pal[0], pal[1], a, 2, -0.4);
  }

  /** Humo, polvo o nieve en polvo en `p`: bocanadas de `size` m que crecen `grow` veces, suben `up` m/s y duran `life` s. */
  puffs(p: Vector3, n: number, size: number, life: number, pal: Pal, spread = 0.3, up = 0.4, grow = 3, a = 0.55): void {
    for (let i = 0; i < n; i++) this.matter.emit(p.x + r(-0.4, 0.4) * size, p.y + r(-0.3, 0.3) * size, p.z + r(-0.4, 0.4) * size, r(-spread, spread), r(0, spread) + up, r(-spread, spread), size * r(0.7, 1.2), grow, life * r(0.75, 1.25), pal[0], pal[1], a, 1.5, -0.05);
  }

  /** Cosas que caen (gotas, piedrecitas, copos): salen disparadas a `speed` m/s y caen con la gravedad. */
  bits(p: Vector3, n: number, size: number, speed: number, life: number, pal: Pal, a = 1, upK = 0.8): void {
    for (let i = 0; i < n; i++) {
      const z = r(-1, 1), an = r(0, 6.283), q = Math.sqrt(1 - z * z), s = speed * r(0.4, 1);
      this.matter.emit(p.x, p.y, p.z, q * Math.cos(an) * s, Math.abs(z) * s * upK + speed * 0.35, q * Math.sin(an) * s, size * r(0.6, 1.3), 0.9, life * r(0.7, 1.2), pal[0], pal[1], a, 0.6, 9.8);
    }
  }

  /** Una explosión de fuego: bola de llamas que se abre, humo que sube y crece después y pavesas. `k`, el tamaño. */
  explode(p: Vector3, k: number, fire: Pal = PAL.fire, smoke: Pal = PAL.smoke): void {
    for (let i = 0; i < 22; i++) {
      const z = r(-1, 1), an = r(0, 6.283), q = Math.sqrt(1 - z * z), s = r(1.2, 3) * k;
      this.light.emit(p.x, p.y, p.z, q * Math.cos(an) * s, z * s + 0.6, q * Math.sin(an) * s, 0.22 * k * r(0.7, 1.3), 2.6, r(0.35, 0.7), fire[0], fire[1], 0.95, 4, -0.6);
    }
    for (let i = 0; i < 14; i++) {
      const an = r(0, 6.283), s = r(0.4, 1.4) * k;
      this.matter.emit(p.x + r(-0.1, 0.1), p.y + r(-0.1, 0.1), p.z + r(-0.1, 0.1), Math.cos(an) * s, r(0.4, 1.1), Math.sin(an) * s, 0.25 * k, 3.4, r(1.2, 1.9), smoke[0], smoke[1], 0.6, 1.4, -0.15);
    }
    for (let i = 0; i < 12; i++) {
      const z = r(-1, 1), an = r(0, 6.283), q = Math.sqrt(1 - z * z), s = r(2.5, 5) * k;
      this.light.emit(p.x, p.y, p.z, q * Math.cos(an) * s, z * s + 1.5, q * Math.sin(an) * s, 0.035, 0.6, r(0.5, 0.9), fire[0], fire[1], 1, 0.8, 6);
    }
  }

  /** Una onda de polvo a ras de suelo: un anillo que se abre desde `p` (el golpe contra el suelo, el impacto de algo pesado). */
  shockRing(p: Vector3, k: number, pal: Pal = PAL.dust, n = 30): void {
    for (let i = 0; i < n; i++) {
      const an = (i / n) * 6.283 + r(-0.1, 0.1), s = r(3.2, 4.4) * k;
      this.matter.emit(p.x + Math.cos(an) * 0.15, Math.max(0.05, p.y), p.z + Math.sin(an) * 0.15, Math.cos(an) * s, r(0.2, 0.7), Math.sin(an) * s, 0.22 * k, 3.2, r(0.8, 1.2), pal[0], pal[1], 0.7, 2.8, -0.1);
    }
  }
}

/** Las partículas de todo el juego (las mueve y las pone en la escena `VfxSystem`; se hacen al pedirlas la primera vez, ya
 * con la escena lista para precompilarlas). */
let inst: Vfx | null = null;
export const vfx = (): Vfx => (inst ??= new Vfx());
