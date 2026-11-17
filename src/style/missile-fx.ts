/**
 * Lo que lanzan los enemigos, con aspecto de videojuego (pedido del usuario: «más impresionante, más tipo videojuego»; en
 * estilo Cómic): un núcleo que brilla con su halo que parpadea, una estela de luz que se va apagando y encogiendo detrás,
 * humo que se queda flotando y, al dar, un fogonazo con una onda de chispas que se abre. Mientras el enemigo lo prepara
 * (en la mano), crece con luz que gira hacia él.
 *
 * Cada proyectil es un `Missile` hecho al empezar y reutilizado (sin crear nada en cada fotograma): dos nubes de puntos
 * (la luz, que suma; el humo, que tapa) y, si lleva, una bola sólida. Los puntos son como las chispas (src/combat/fx.ts):
 * de tamaño en metros y, pegados a los ojos, no se pintan (entre 15 y 45 cm se desvanecen; regla de las gafas).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, NormalBlending, Points, ShaderMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { warmKeep } from './warm.js';

/** Cómo es: el color del núcleo, del halo y de la estela (`glow` null: sin luz, solo humo: la piedra del lanzador), el del humo
 * (null, sin humo), lo grande que es (m, el radio del núcleo) y si lleva bola sólida (`solid`: su material; si no, de luz). */
export interface MissileLook {
  core: number;
  glow: number | null;
  trail: number;
  smoke: number | null;
  size: number;
  solid?: Material | null;
  /** Sin bola (la piedra del lanzador ya es la suya): solo su halo, su estela y su humo. */
  ball?: boolean;
}

/** Los puntos de la luz: el halo (0), el fogonazo (1), la estela (TRAIL) y la onda de chispas (BURST). El humo, SMOKE. */
const TRAIL = 22, BURST = 30, SMOKE = 26, LIGHT_N = 2 + TRAIL + BURST;
/** Cada cuánto suelta humo (s), lo que dura (s) y lo que dura el fogonazo y la onda (s). */
const SMOKE_DT = 0.045, SMOKE_LIFE = 0.7, BLAST_T = 0.45;

const VERT = `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float dc = -mv.z;
    vC = color; vA = alpha * smoothstep(0.15, 0.45, dc);
    gl_Position = projectionMatrix * mv; gl_PointSize = size * 900.0 / max(dc, 0.05);
    if (dc < 0.12 || alpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;
// la luz: un brillo redondo, intenso en el centro
const FRAG_LIGHT = `varying vec3 vC; varying float vA;
  void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
    float a = pow(1.0 - r, 1.6); float c = smoothstep(0.55, 0.0, r); gl_FragColor = vec4((vC + c * 0.6) * a * vA, a * vA); }`;
// el humo: una bocanada blanda con algo de grumo (sin textura: una onda en el ángulo)
const FRAG_SMOKE = `varying vec3 vC; varying float vA;
  void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
    float an = atan(d.y, d.x); float g = 0.82 + 0.18 * sin(an * 5.0 + vC.r * 40.0);
    float a = smoothstep(1.0, 0.25, r / g) * 0.38 * vA; gl_FragColor = vec4(vC * (0.75 + 0.25 * (1.0 - r)), a); }`;

function cloud(n: number, frag: string, add: boolean): { pts: Points; pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array } {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('size', new BufferAttribute(size, 1));
  g.setAttribute('alpha', new BufferAttribute(alpha, 1));
  const m = new ShaderMaterial({ transparent: true, depthWrite: false, blending: add ? AdditiveBlending : NormalBlending, toneMapped: false, vertexShader: VERT, fragmentShader: frag });
  const pts = new Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = add ? 10 : 9;
  pts.userData.noInk = true;
  return { pts, pos, col, size, alpha };
}

let warmed = false;
const SPHERE = new SphereGeometry(1, 16, 12);

export class Missile {
  readonly group = new Group();
  private readonly L = cloud(LIGHT_N, FRAG_LIGHT, true);
  private readonly S = cloud(SMOKE, FRAG_SMOKE, false);
  private readonly ball: Mesh;
  private readonly lightBall: MeshBasicMaterial;
  private look!: MissileLook;
  private readonly cCore = new Color();
  private readonly cGlow = new Color();
  private readonly cTrail = new Color();
  private readonly cSmoke = new Color();
  /** Por dónde ha pasado (la estela: la más reciente, la primera) y cuántas lleva. */
  private readonly hist: Vector3[] = [];
  private histN = 0;
  private readonly p = new Vector3();
  private readonly vel = new Vector3();
  private readonly tmp = new Vector3();
  /** El humo: su velocidad y lo que le queda (s). */
  private readonly sVel = new Float32Array(SMOKE * 3);
  private readonly sLife = new Float32Array(SMOKE);
  private sNext = 0;
  private sT = 0;
  /** La onda de chispas: velocidades, y lo que le queda al fogonazo (s). */
  private readonly bVel = new Float32Array(BURST * 3);
  private blastT = 0;
  private blastK = 1;
  /** En qué está: quieto (sin verse), preparándose en la mano, volando, siguiendo de largo tras esquivarlo o apagándose. */
  private mode: 'off' | 'charge' | 'fly' | 'coast' = 'off';
  private idle = false;
  private coastT = 0;
  private t = 0;
  /** Lo que crece al prepararlo (de 0 a 1). */
  private k = 1;

  constructor(look: MissileLook) {
    for (let i = 0; i < TRAIL; i++) this.hist.push(new Vector3());
    this.lightBall = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.ball = new Mesh(SPHERE, look.solid ?? this.lightBall);
    this.ball.userData.noInk = true;
    this.ball.visible = false;
    this.group.add(this.L.pts, this.S.pts, this.ball);
    this.setLook(look);
    if (!warmed) {
      // (sus programas, compilados en el menú: sin tirón al lanzar el primero)
      warmed = true;
      warmKeep(new Points(this.L.pts.geometry, this.L.pts.material));
      warmKeep(new Points(this.S.pts.geometry, this.S.pts.material));
      warmKeep(new Mesh(SPHERE, this.lightBall));
    }
  }

  /** Cambia cómo es (el jefe de cada mundo lanza lo suyo): solo colores y tamaño, nada nuevo. */
  setLook(look: MissileLook): void {
    this.look = look;
    this.cCore.setHex(look.core);
    this.cGlow.setHex(look.glow ?? look.core);
    this.cTrail.setHex(look.trail);
    this.cSmoke.setHex(look.smoke ?? 0x808080);
    this.lightBall.color.setHex(look.core);
    this.ball.material = look.solid ?? this.lightBall;
  }

  /** ¿Se ve aún algo (volando, o el humo o el fogonazo apagándose)? */
  get busy(): boolean {
    return this.mode !== 'off' || this.blastT > 0 || this.sLife.some((l) => l > 0);
  }

  /** En la mano del que lo lanza, creciendo (`k` de 0 a 1): la luz gira a su alrededor y se le acerca. */
  charge(at: Vector3, k: number): void {
    if (this.mode !== 'charge') {
      this.mode = 'charge';
      this.histN = 0;
    }
    this.k = Math.max(0.05, Math.min(1, k));
    this.p.copy(at);
  }

  /** Volando: va por `at` (lo pone quien lo lanza, fotograma a fotograma); `eye`, tus ojos (pegada a ellos, la bola no se pinta). */
  fly(at: Vector3, dt: number, eye: Vector3): void {
    if (this.mode !== 'fly') {
      this.mode = 'fly';
      this.histN = 0;
      this.vel.set(0, 0, 0);
    } else if (dt > 0) this.vel.subVectors(at, this.p).divideScalar(dt);
    this.k = 1;
    this.p.copy(at);
    this.ball.userData.near = at.distanceTo(eye) < 0.5;
  }

  /** Esquivado: sigue de largo `dur` s con la velocidad que llevaba y se apaga. */
  coast(dur = 0.35): void {
    if (this.mode !== 'fly') return this.stop();
    this.mode = 'coast';
    this.coastT = dur;
  }

  /** Te da (o da en el suelo): fogonazo y onda de chispas en `at`; `big`, más grande (la bola de fuego, la de un jefe). */
  hit(at: Vector3, big = false): void {
    this.mode = 'off';
    this.p.copy(at);
    this.blastT = BLAST_T;
    this.blastK = big ? 1.6 : 1;
    const L = this.L;
    L.pos[3] = at.x;
    L.pos[4] = at.y;
    L.pos[5] = at.z;
    for (let i = 0; i < BURST; i++) {
      const j = 2 + TRAIL + i, z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z), s = (2.2 + Math.random() * 1.6) * this.blastK;
      this.bVel[i * 3] = r * Math.cos(a) * s;
      this.bVel[i * 3 + 1] = z * s * 0.7 + 0.6;
      this.bVel[i * 3 + 2] = r * Math.sin(a) * s;
      L.pos[j * 3] = at.x;
      L.pos[j * 3 + 1] = at.y;
      L.pos[j * 3 + 2] = at.z;
    }
    // y una bocanada de humo
    if (this.look.smoke !== null) for (let i = 0; i < 4; i++) this.puff(at, 0.7, 1.1);
  }

  /** Se apaga sin más (fuera de la ronda). */
  stop(): void {
    this.mode = 'off';
    this.histN = 0;
  }

  /** Cada fotograma: la estela, el humo, el fogonazo y la onda (quieto y apagado, nada). */
  update(dt: number): void {
    if (!this.busy) {
      if (this.idle) return;
      this.idle = true; // (un fotograma más, para dejar todo apagado)
    } else this.idle = false;
    const L = this.L, look = this.look, sz = look.size;
    this.t += dt;
    if (this.mode === 'coast') {
      this.p.addScaledVector(this.vel, dt);
      this.coastT -= dt;
      if (this.coastT <= 0) this.mode = 'off';
    }
    const on = this.mode !== 'off';
    // la estela: lo más reciente delante
    if (on && this.mode !== 'charge') {
      const last = this.hist[TRAIL - 1];
      for (let i = TRAIL - 1; i > 0; i--) this.hist[i] = this.hist[i - 1];
      this.hist[0] = last.copy(this.p);
      this.histN = Math.min(TRAIL, this.histN + 1);
    }
    // el halo, el núcleo y la bola
    const fl = 0.85 + 0.15 * Math.sin(this.t * 37) + 0.08 * Math.sin(this.t * 61);
    this.ball.visible = on && look.ball !== false && !this.ball.userData.near;
    if (on) {
      this.ball.position.copy(this.p);
      this.ball.scale.setScalar(sz * this.k * (look.solid ? 1 : 0.8 + 0.15 * fl));
      this.ball.rotation.x += dt * 7;
      this.ball.rotation.z += dt * 4;
    }
    L.pos[0] = this.p.x;
    L.pos[1] = this.p.y;
    L.pos[2] = this.p.z;
    L.size[0] = sz * 4.5 * this.k * fl;
    L.alpha[0] = on && look.glow !== null ? 0.75 : 0;
    L.col[0] = this.cGlow.r;
    L.col[1] = this.cGlow.g;
    L.col[2] = this.cGlow.b;
    // la estela (o, preparándolo, la luz que gira y se le acerca)
    for (let i = 0; i < TRAIL; i++) {
      const j = 2 + i, u = i / TRAIL;
      if (this.mode === 'charge') {
        const a = this.t * 9 + i * 2.4, r = sz * (1.2 + 5 * ((u + this.t * 1.7) % 1)) * (1.4 - this.k * 0.4);
        L.pos[j * 3] = this.p.x + Math.cos(a) * r;
        L.pos[j * 3 + 1] = this.p.y + Math.sin(a * 1.3) * r * 0.6;
        L.pos[j * 3 + 2] = this.p.z + Math.sin(a) * r;
        L.size[j] = sz * 1.2;
        L.alpha[j] = look.glow !== null ? 0.8 * (1 - ((u + this.t * 1.7) % 1)) : 0;
      } else if (on && i < this.histN) {
        const h = this.hist[i], jit = sz * 0.5 * u;
        L.pos[j * 3] = h.x + (Math.random() - 0.5) * jit;
        L.pos[j * 3 + 1] = h.y + (Math.random() - 0.5) * jit;
        L.pos[j * 3 + 2] = h.z + (Math.random() - 0.5) * jit;
        L.size[j] = sz * (look.glow !== null ? 3.4 : 1.6) * (1 - u * 0.85);
        L.alpha[j] = (look.glow !== null ? 0.85 : 0.35) * (1 - u);
      } else L.alpha[j] = 0;
      const w = Math.min(1, u * 1.8);
      L.col[j * 3] = this.cCore.r + (this.cTrail.r - this.cCore.r) * w;
      L.col[j * 3 + 1] = this.cCore.g + (this.cTrail.g - this.cCore.g) * w;
      L.col[j * 3 + 2] = this.cCore.b + (this.cTrail.b - this.cCore.b) * w;
    }
    // el fogonazo y la onda de chispas
    if (this.blastT > 0) this.blastT = Math.max(0, this.blastT - dt);
    const bk = this.blastT / BLAST_T;
    L.size[1] = sz * 9 * this.blastK * (1.3 - bk);
    L.alpha[1] = bk > 0 ? bk : 0;
    L.col[3] = this.cGlow.r;
    L.col[4] = this.cGlow.g;
    L.col[5] = this.cGlow.b;
    for (let i = 0; i < BURST; i++) {
      const j = 2 + TRAIL + i;
      if (bk <= 0) {
        L.alpha[j] = 0;
        continue;
      }
      this.bVel[i * 3 + 1] -= 3 * dt;
      L.pos[j * 3] += this.bVel[i * 3] * dt;
      L.pos[j * 3 + 1] += this.bVel[i * 3 + 1] * dt;
      L.pos[j * 3 + 2] += this.bVel[i * 3 + 2] * dt;
      L.size[j] = sz * 1.3 * (0.5 + bk);
      L.alpha[j] = bk;
      const c = i % 3 ? this.cTrail : this.cCore;
      L.col[j * 3] = c.r;
      L.col[j * 3 + 1] = c.g;
      L.col[j * 3 + 2] = c.b;
    }
    // el humo: suelta bocanadas mientras vuela; suben, crecen y se apagan
    if (look.smoke !== null && on && this.mode !== 'charge') {
      this.sT -= dt;
      while (this.sT <= 0) {
        this.sT += SMOKE_DT;
        this.puff(this.p, 0.25, 1);
      }
    }
    const S = this.S;
    for (let i = 0; i < SMOKE; i++) {
      if (this.sLife[i] <= 0) {
        S.alpha[i] = 0;
        continue;
      }
      this.sLife[i] -= dt;
      const k = Math.max(0, this.sLife[i] / SMOKE_LIFE);
      S.pos[i * 3] += this.sVel[i * 3] * dt;
      S.pos[i * 3 + 1] += this.sVel[i * 3 + 1] * dt;
      S.pos[i * 3 + 2] += this.sVel[i * 3 + 2] * dt;
      S.size[i] = sz * (1.5 + 2.5 * (1 - k));
      S.alpha[i] = k;
    }
    for (const C of [L, S]) {
      const g = C.pts.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    }
  }

  /** Una bocanada de humo en `at` (`spread`, lo que se abre; `k`, lo grande). */
  private puff(at: Vector3, spread: number, k: number): void {
    const i = this.sNext, S = this.S;
    this.sNext = (this.sNext + 1) % SMOKE;
    this.tmp.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(spread);
    S.pos[i * 3] = at.x;
    S.pos[i * 3 + 1] = at.y;
    S.pos[i * 3 + 2] = at.z;
    this.sVel[i * 3] = this.tmp.x;
    this.sVel[i * 3 + 1] = this.tmp.y + 0.35;
    this.sVel[i * 3 + 2] = this.tmp.z;
    this.sLife[i] = SMOKE_LIFE * k * (0.7 + Math.random() * 0.4);
    // (un poco de variación en el gris: el grumo del humo usa el rojo como semilla)
    const v = 0.85 + Math.random() * 0.3;
    S.col[i * 3] = Math.min(1, this.cSmoke.r * v);
    S.col[i * 3 + 1] = Math.min(1, this.cSmoke.g * v);
    S.col[i * 3 + 2] = Math.min(1, this.cSmoke.b * v);
  }
}

/** Los de cada enemigo: el escupitajo del cangrejo, la bola de fuego del demonio, la piedra en llamas del lanzador (Combate). */
export const LOOK_ROCK: MissileLook = { core: 0xffd08a, glow: 0xff7a1a, trail: 0xff4a10, smoke: 0x5a4e46, size: 0.05, ball: false };
export const LOOK_SPIT: MissileLook = { core: 0xe4ff8a, glow: 0x8dff2a, trail: 0x4cc81a, smoke: null, size: 0.055 };
export const LOOK_FIRE: MissileLook = { core: 0xfff3b0, glow: 0xff7a1a, trail: 0xff3a0a, smoke: 0x6a5a50, size: 0.11 };
/** Los jefes: el Yeti, una bola de nieve con escarcha; el Demonio verde, fuego verde; el Alien alto, plasma violeta. */
export const LOOK_BOSS: MissileLook[] = [
  { core: 0xf4fbff, glow: 0x4ab8ff, trail: 0x9fe0ff, smoke: 0xdcecf8, size: 0.13 },
  { core: 0xf0ffb0, glow: 0x3aff2a, trail: 0x1fc82a, smoke: 0x40503a, size: 0.13 },
  { core: 0xffe0ff, glow: 0xc04aff, trail: 0x7a2aff, smoke: null, size: 0.14 },
];
