/**
 * Efectos: la bola roja de energía (la carga del disparo, como en RepArena), los rayos y las chispas.
 * Todo con materiales aditivos que no escriben profundidad; las chispas se apagan cerca de los ojos (en RepArena,
 * pegadas a la cara, se veían como cuadrados enormes blancos y azules).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';

/** Colores de cada nivel de carga (×1 turquesa, ×2 amarillo, ×3 naranja, ×4 magenta), los de RepArena. */
export const POW_COL = [0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0];
/** Colores del rayo (RepArena, src/52_bolt.js): normal, perfecto, carga ×2, ×3 y ×4. */
export const BOLT_COL = [0x4aa8ff, 0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0];
/** El color de un rayo: el de su carga (×2 o más) o, sin cargar, azul o turquesa si la repetición fue perfecta. */
export const boltColor = (perfect: boolean, pow: number): number => (pow > 1 ? POW_COL[Math.min(4, pow) - 1] : BOLT_COL[perfect ? 1 : 0]);

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

// el resplandor redondo de los destellos
function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

const NOISE = `
  float sh3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float sn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sh3(i), sh3(i + vec3(1,0,0)), f.x), mix(sh3(i + vec3(0,1,0)), sh3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(sh3(i + vec3(0,0,1)), sh3(i + vec3(1,0,1)), f.x), mix(sh3(i + vec3(0,1,1)), sh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float sfbm(vec3 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * sn3(p); p = p * 2.07 + 11.3; a *= 0.5; } return v; }`;

/**
 * La bola de energía: un núcleo de plasma rojo que hierve y late, una capa de rayos que crece con la carga y, encima,
 * el número de la carga (×2, ×3, ×4). Al llegar a ×4, un destello con una onda de luz. Al disparar, estalla.
 */
export class EnergyBall {
  readonly group = new Group();
  /** Dónde está (en el mundo). */
  readonly pos = new Vector3();
  private core: Mesh;
  private shell: Mesh;
  private halo: Sprite;
  private num: Sprite;
  private numCanvas: HTMLCanvasElement;
  private numTex: CanvasTexture;
  private wave: Mesh;
  private coreMat: ShaderMaterial;
  private shellMat: ShaderMaterial;
  private waveMat: ShaderMaterial;
  private t = 0;
  private k = 0; // carga que se ve (sigue a la pedida con suavidad)
  private vis = 0; // 0: no se ve; 1: entera
  private burst = 0; // estallido al disparar (cuenta atrás)
  private max = -1; // destello del ×4 (tiempo desde que empezó; -1: no hay)
  private shownPow = 0;
  private placed = false;

  constructor(halo: CanvasTexture) {
    this.coreMat = new ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 } },
      toneMapped: false,
      vertexShader: `uniform float uT; uniform float uK; varying vec3 vN; varying vec3 vP; varying vec3 vV;${NOISE}
        void main(){ vec3 p = position; float b = sn3(p * 3.2 + vec3(0.0, uT * 1.7, uT * 1.1)); p *= 1.0 + (0.025 + 0.035 * uK) * (b - 0.5) * 2.0;
          vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT; uniform float uK; varying vec3 vN; varying vec3 vP; varying vec3 vV;${NOISE}
        void main(){
          float n = sfbm(vP * 2.4 + vec3(uT * 0.8, -uT * 1.2, uT * 0.5));
          float v = 1.0 - abs(sfbm(vP * 4.2 - vec3(uT * 1.9, uT * 0.4, uT * 1.3)) * 2.0 - 1.0);
          float vein = pow(v, 7.0 - 3.0 * uK) * (0.5 + 0.7 * uK);
          vec3 c = mix(vec3(0.38, 0.0, 0.02), vec3(0.95, 0.04, 0.05), smoothstep(0.25, 0.75, n));
          c = mix(c, vec3(1.0, 0.32, 0.34), clamp(vein, 0.0, 1.0));
          float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
          c += vec3(1.0, 0.12, 0.16) * fr * (0.6 + 0.9 * uK);
          gl_FragColor = vec4(c * (0.9 + 0.45 * uK), 1.0);
        }`,
    });
    this.shellMat = new ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uA: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uT; uniform float uK; uniform float uA; varying vec3 vP; varying vec3 vN; varying vec3 vV;${NOISE}
        float ridge(vec3 p){ return 1.0 - abs(sn3(p) * 2.0 - 1.0); }
        void main(){
          float j = floor(uT * 17.0); vec3 o = vec3(j * 1.37, j * 2.11, j * 0.73);
          vec3 d = normalize(vP) * 2.2;
          float r = clamp(ridge(d * 1.6 + o) * 0.65 + ridge(d * 3.4 + o * 1.7) * 0.35, 0.0, 1.0);
          float line = pow(r, 30.0 - 8.0 * uK), glow = pow(r, 7.0) * 0.35;
          float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float a = (line + glow) * (0.4 + 0.9 * fr) * uA;
          vec3 c = vec3(1.0, 0.1, 0.25) * glow + vec3(1.0, 0.8, 0.9) * line;
          gl_FragColor = vec4(c * (0.4 + 0.9 * fr) * uA, a);
        }`,
    });
    this.waveMat = new ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); vec3 c = mix(vec3(1.0, 0.15, 0.3), vec3(1.0, 0.85, 0.9), fr * fr); gl_FragColor = vec4(c * fr * uA, fr * uA); }',
    });
    this.core = new Mesh(new SphereGeometry(1, 40, 28), this.coreMat);
    this.shell = new Mesh(new SphereGeometry(1, 48, 32), this.shellMat);
    this.wave = new Mesh(new SphereGeometry(1, 32, 20), this.waveMat);
    this.halo = new Sprite(new SpriteMaterial({ map: halo, color: 0xff2040, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    this.numCanvas = document.createElement('canvas');
    this.numCanvas.width = 256;
    this.numCanvas.height = 128;
    this.numTex = new CanvasTexture(this.numCanvas);
    this.num = new Sprite(new SpriteMaterial({ map: this.numTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.num.visible = false;
    this.wave.visible = false;
    for (const m of [this.halo, this.core, this.shell, this.wave, this.num] as Object3D[]) {
      m.renderOrder = 7;
      this.group.add(m);
    }
    this.num.renderOrder = 8;
    this.group.visible = false;
  }

  /** ¿Se ve? (los zombis solo la rodean cuando se ve) */
  get visible(): boolean {
    return this.group.visible && this.vis > 0.05;
  }

  // el número de la carga, pintado solo cuando cambia
  private drawNum(pow: number): void {
    if (pow === this.shownPow) return;
    this.shownPow = pow;
    this.num.visible = pow >= 2;
    if (pow < 2) return;
    const c = this.numCanvas.getContext('2d')!;
    c.clearRect(0, 0, 256, 128);
    c.font = '96px Bungee, "Arial Black", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(16,6,12,0.9)';
    c.strokeText('×' + pow, 128, 68);
    c.fillStyle = '#' + POW_COL[pow - 1].toString(16).padStart(6, '0');
    c.fillText('×' + pow, 128, 68);
    this.numTex.needsUpdate = true;
  }

  /** Destello del ×4. */
  flashMax(): void {
    this.max = 0;
    this.wave.visible = true;
  }

  /** Al disparar: estalla. Devuelve si se veía. */
  fire(): boolean {
    if (!this.visible) return false;
    this.burst = 0.18;
    return true;
  }

  /**
   * Cada fotograma. target: dónde debe estar; pow: la carga (0: no hay carga; 1 a 4).
   */
  update(dt: number, target: Vector3, pow: number): void {
    this.t += dt;
    const want = pow > 0;
    const lvl = [0, 0.18, 0.46, 0.72, 1][Math.min(4, Math.max(0, pow))];
    if (want && this.burst <= 0) {
      this.k += (lvl - this.k) * Math.min(1, dt * 8);
      this.vis = Math.min(1, this.vis + dt * 6);
    }
    if (this.burst > 0) {
      this.burst -= dt;
      this.vis = Math.max(0, this.burst / 0.18);
      if (this.burst <= 0) this.vis = 0;
    } else if (!want) this.vis = Math.max(0, this.vis - dt * 5);
    // el destello del ×4
    if (this.max >= 0) {
      this.max += dt;
      const kk = this.max / 0.55;
      if (kk >= 1) {
        this.max = -1;
        this.wave.visible = false;
      } else {
        this.wave.scale.setScalar(0.08 + 1.1 * (kk * kk * (3 - 2 * kk)));
        this.waveMat.uniforms.uA.value = 1.6 * (1 - kk) * (1 - kk);
      }
    }
    if (this.vis <= 0 && this.max < 0) {
      this.group.visible = false;
      this.placed = false;
      this.drawNum(0);
      return;
    }
    this.group.visible = true;
    if (!this.placed) {
      this.pos.copy(target);
      this.placed = true;
    } else this.pos.lerp(target, Math.min(1, dt * 8));
    this.group.position.copy(this.pos);
    const K = this.k, v = this.vis;
    const beat = 1 + 0.06 * Math.sin(this.t * (8 + 10 * K));
    const boom = this.burst > 0 ? 1 + (0.18 - this.burst) * 9 : 1;
    const rc = (0.05 + 0.055 * K) * beat * v * boom;
    this.core.scale.setScalar(rc);
    this.shell.scale.setScalar(rc * (1.25 + 0.75 * K));
    this.halo.scale.set(rc * (5 + 4 * K), rc * (5 + 4 * K), 1);
    (this.halo.material as SpriteMaterial).opacity = (0.35 + 0.45 * K) * v;
    this.coreMat.uniforms.uT.value = this.t;
    this.coreMat.uniforms.uK.value = K;
    this.shellMat.uniforms.uT.value = this.t;
    this.shellMat.uniforms.uK.value = K;
    this.shellMat.uniforms.uA.value = (0.6 + 1.2 * K) * v;
    this.drawNum(want ? pow : 0);
    if (this.num.visible) {
      this.num.position.set(0, rc * 1.3 + 0.05, 0);
      this.num.scale.set(0.16, 0.08, 1);
      (this.num.material as SpriteMaterial).opacity = v;
    }
  }
}

const MAX_SEG = 24;

/** Un rayo: una cinta quebrada que mira siempre a la cámara, con su resplandor; se rehace a saltos y se apaga. */
class Bolt {
  readonly mesh: Mesh;
  readonly glow: Mesh;
  private pos: Float32Array;
  private gpos: Float32Array;
  private pts: Vector3[] = [];
  readonly a = new Vector3();
  readonly b = new Vector3();
  life = 0;
  private dur = 0.3;
  private width = 0.02;
  private regen = 0;

  constructor() {
    const mk = (color: number, opacity: number): Mesh => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array((MAX_SEG + 1) * 2 * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < MAX_SEG; i++) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      g.setIndex(idx);
      const m = new Mesh(g, new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 9;
      return m;
    };
    this.mesh = mk(0xffffff, 1);
    this.glow = mk(0xff3060, 0.6);
    this.pos = (this.mesh.geometry.attributes.position as BufferAttribute).array as Float32Array;
    this.gpos = (this.glow.geometry.attributes.position as BufferAttribute).array as Float32Array;
    for (let i = 0; i <= MAX_SEG; i++) this.pts.push(new Vector3());
  }

  start(a: Vector3, b: Vector3, color: number, power: number): void {
    this.a.copy(a);
    this.b.copy(b);
    this.life = this.dur = 0.22 + 0.06 * power;
    this.width = 0.012 + 0.006 * power;
    (this.glow.material as MeshBasicMaterial).color.setHex(color);
    this.mesh.visible = this.glow.visible = true;
    this.regen = 0;
  }

  private static _d = new Vector3();
  private static _u = new Vector3();
  private static _w = new Vector3();
  private static _side = new Vector3();

  // los puntos del rayo: del origen al blanco con quiebros que se rehacen
  private jag(): void {
    const n = MAX_SEG, d = Bolt._d.subVectors(this.b, this.a), len = d.length();
    d.normalize();
    const u = Bolt._u.set(0, 1, 0);
    if (Math.abs(d.y) > 0.9) u.set(1, 0, 0);
    u.cross(d).normalize();
    const w = Bolt._w.crossVectors(d, u);
    for (let i = 0; i <= n; i++) {
      const t = i / n, env = Math.sin(Math.PI * t); // (los extremos, fijos)
      const amp = len * 0.035 * env;
      this.pts[i].copy(this.a).addScaledVector(Bolt._d.subVectors(this.b, this.a), t).addScaledVector(u, rand(-1, 1) * amp).addScaledVector(w, rand(-1, 1) * amp);
    }
  }

  update(dt: number, eye: Vector3): void {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.mesh.visible = this.glow.visible = false;
      return;
    }
    this.regen -= dt;
    if (this.regen <= 0) {
      this.regen = 0.045;
      this.jag();
    }
    const k = this.life / this.dur;
    (this.mesh.material as MeshBasicMaterial).opacity = Math.min(1, k * 1.6);
    (this.glow.material as MeshBasicMaterial).opacity = 0.6 * k;
    // la cinta, de cara a los ojos
    for (let i = 0; i <= MAX_SEG; i++) {
      const p = this.pts[i], q = this.pts[Math.min(MAX_SEG, i + 1)], r = this.pts[Math.max(0, i - 1)];
      const dir = Bolt._d.subVectors(q, r);
      const view = Bolt._u.subVectors(eye, p);
      const side = Bolt._side.crossVectors(dir, view).normalize();
      const w1 = this.width * (0.5 + 0.5 * k), w2 = w1 * 5;
      const o = i * 6;
      this.pos[o] = p.x + side.x * w1; this.pos[o + 1] = p.y + side.y * w1; this.pos[o + 2] = p.z + side.z * w1;
      this.pos[o + 3] = p.x - side.x * w1; this.pos[o + 4] = p.y - side.y * w1; this.pos[o + 5] = p.z - side.z * w1;
      this.gpos[o] = p.x + side.x * w2; this.gpos[o + 1] = p.y + side.y * w2; this.gpos[o + 2] = p.z + side.z * w2;
      this.gpos[o + 3] = p.x - side.x * w2; this.gpos[o + 4] = p.y - side.y * w2; this.gpos[o + 5] = p.z - side.z * w2;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.position.needsUpdate = true;
  }
}

/** Los rayos (unos pocos a la vez, reutilizados). */
export class Bolts {
  readonly group = new Group();
  private list: Bolt[] = [];
  private next = 0;

  constructor(n = 6) {
    for (let i = 0; i < n; i++) {
      const b = new Bolt();
      this.list.push(b);
      this.group.add(b.glow, b.mesh);
    }
  }

  fire(a: Vector3, b: Vector3, power: number, color = POW_COL[Math.max(0, Math.min(3, power - 1))]): void {
    const bolt = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    bolt.start(a, b, color, power);
  }

  update(dt: number, eye: Vector3): void {
    for (const b of this.list) b.update(dt, eye);
  }
}

const MAX_SPARKS = 600;

/**
 * Chispas: puntos de luz con gravedad que se apagan. Pegadas a los ojos no se pintan (y entre 15 y 45 cm se
 * desvanecen), para que no tapen la vista.
 */
export class Sparks {
  readonly points: Points;
  private pos = new Float32Array(MAX_SPARKS * 3);
  private col = new Float32Array(MAX_SPARKS * 3);
  private size = new Float32Array(MAX_SPARKS);
  private alpha = new Float32Array(MAX_SPARKS);
  private vel = new Float32Array(MAX_SPARKS * 3);
  private life = new Float32Array(MAX_SPARKS);
  private max = new Float32Array(MAX_SPARKS);
  private grav = new Float32Array(MAX_SPARKS);
  private next = 0;
  private tmpC = new Color();

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('color', new BufferAttribute(this.col, 3));
    g.setAttribute('size', new BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float dc = -mv.z;
          vC = color; vA = alpha * smoothstep(0.15, 0.45, dc);
          gl_Position = projectionMatrix * mv; gl_PointSize = size * 900.0 / max(dc, 0.05);
          if (dc < 0.12 || alpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = (1.0 - r * 2.0); a *= a; gl_FragColor = vec4(vC * a * vA, a * vA); }`,
    });
    this.points = new Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
  }

  /** n chispas desde p, de color hex, a una velocidad de hasta speed m/s. */
  burst(p: Vector3, n: number, hex: number, speed: number, size = 0.025, gravity = 4): void {
    this.tmpC.setHex(hex);
    for (let i = 0; i < n; i++) {
      const j = this.next;
      this.next = (this.next + 1) % MAX_SPARKS;
      this.pos[j * 3] = p.x; this.pos[j * 3 + 1] = p.y; this.pos[j * 3 + 2] = p.z;
      // dirección al azar en la esfera
      const z = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - z * z), s = speed * rand(0.3, 1);
      this.vel[j * 3] = r * Math.cos(a) * s; this.vel[j * 3 + 1] = z * s + speed * 0.3; this.vel[j * 3 + 2] = r * Math.sin(a) * s;
      const w = rand(0.75, 1.15);
      this.col[j * 3] = Math.min(1, this.tmpC.r * w + 0.15); this.col[j * 3 + 1] = Math.min(1, this.tmpC.g * w + 0.15); this.col[j * 3 + 2] = Math.min(1, this.tmpC.b * w + 0.15);
      this.size[j] = size * rand(0.6, 1.3);
      this.life[j] = this.max[j] = rand(0.35, 0.8);
      this.grav[j] = gravity;
      this.alpha[j] = 1;
    }
  }

  update(dt: number): void {
    for (let j = 0; j < MAX_SPARKS; j++) {
      if (this.life[j] <= 0) {
        if (this.alpha[j] !== 0) this.alpha[j] = 0;
        continue;
      }
      this.life[j] -= dt;
      this.vel[j * 3 + 1] -= this.grav[j] * dt;
      const drag = 1 - Math.min(1, dt * 1.5);
      this.vel[j * 3] *= drag; this.vel[j * 3 + 1] *= drag; this.vel[j * 3 + 2] *= drag;
      this.pos[j * 3] += this.vel[j * 3] * dt; this.pos[j * 3 + 1] += this.vel[j * 3 + 1] * dt; this.pos[j * 3 + 2] += this.vel[j * 3 + 2] * dt;
      if (this.pos[j * 3 + 1] < 0.01) { this.pos[j * 3 + 1] = 0.01; this.vel[j * 3 + 1] *= -0.4; }
      this.alpha[j] = Math.max(0, this.life[j] / this.max[j]);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

/** Un destello redondo que se abre y se apaga (los impactos). */
export class Flashes {
  readonly group = new Group();
  private list: { s: Sprite; life: number; dur: number; size: number }[] = [];
  private next = 0;

  constructor(halo: CanvasTexture, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(new SpriteMaterial({ map: halo, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
      s.visible = false;
      s.renderOrder = 9;
      this.group.add(s);
      this.list.push({ s, life: 0, dur: 0.2, size: 0.5 });
    }
  }

  at(p: Vector3, hex: number, size: number, dur = 0.22): void {
    const f = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    f.s.position.copy(p);
    (f.s.material as SpriteMaterial).color.setHex(hex);
    f.life = f.dur = dur;
    f.size = size;
    f.s.visible = true;
  }

  update(dt: number): void {
    for (const f of this.list) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.s.visible = false;
        continue;
      }
      const k = f.life / f.dur, sc = f.size * (1.4 - 0.6 * k);
      f.s.scale.set(sc, sc, 1);
      (f.s.material as SpriteMaterial).opacity = k;
    }
  }
}

/** La carga en cada mano (RepArena: el orbe de la muñeca cargada), del color de la carga; late deprisa. */
export class HandOrbs {
  readonly group = new Group();
  readonly left: Sprite;
  readonly right: Sprite;

  constructor(halo: CanvasTexture) {
    const mk = (): Sprite => {
      const s = new Sprite(new SpriteMaterial({ map: halo, color: BOLT_COL[0], transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
      s.visible = false;
      s.renderOrder = 8;
      this.group.add(s);
      return s;
    };
    this.left = mk();
    this.right = mk();
  }

  /** Enséñala en p (o quítala si p es null), con su carga y el reloj t. */
  set(side: 'left' | 'right', p: Vector3 | null, perfect: boolean, pow: number, t: number): void {
    const o = this[side];
    o.visible = !!p;
    if (!p) return;
    const sc = 0.075 * (1 + 0.2 * (pow - 1)) * (1 + 0.15 * Math.sin(t * 18));
    o.position.copy(p);
    o.scale.set(sc, sc, 1);
    (o.material as SpriteMaterial).color.setHex(boltColor(perfect, pow)); // (la carga de la sentadilla aguantada, por su color)
  }
}

/** Todos los efectos juntos (un solo grupo en la escena). */
export class Effects {
  readonly halo = haloTexture();
  readonly ball = new EnergyBall(this.halo);
  readonly bolts = new Bolts();
  readonly sparks = new Sparks();
  readonly flashes = new Flashes(this.halo);
  readonly orbs = new HandOrbs(this.halo);
  readonly group = new Group();

  constructor() {
    this.group.add(this.ball.group, this.bolts.group, this.sparks.points, this.flashes.group, this.orbs.group);
  }
}
