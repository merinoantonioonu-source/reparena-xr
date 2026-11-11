/**
 * Los rayos: descargas eléctricas, como en RepArena (src/52_bolt.js, portado tal cual; el usuario vio que los de antes
 * aquí, una cinta quebrada que salía entera de golpe, eran «bastante menos logrados»).
 *  - Un haz concentrado, casi recto, que avanza hasta el blanco con una cabeza brillante y una estela que se apaga detrás.
 *  - Alrededor, filamentos finos y cortos que chisporrotean y cambian en cada parpadeo (nada de ramas grandes).
 *  - Al llegar, destella y se apaga en unas décimas echando chispas; los cargados dan un segundo latigazo.
 *  - Color, grosor y filamentos crecen con la intensidad del disparo (L: 0 normal, 1 perfecto, 2-4 cargas).
 * Cada rayo es una sola malla de cintas de cara a los ojos (halo ancho y tenue, y núcleo casi blanco), con la textura de un
 * degradado de lado a lado. Todo se reserva al crearlo: en cada fotograma no se crea nada.
 * Sin luz propia: en Cómic la escena no se ilumina con luces puntuales (RepArena tampoco lo hacía en Cómic).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, Vector3 } from '@iwsdk/core';

const LT_SEG = 420, LT_FLICK = 0.045, TAIL = 0.55; // TAIL: largo de la estela (fracción del recorrido)
const MAIN_N = 65, FIL_N = 9, FIL_MAX = 16; // (puntos del haz con 6 niveles de quiebros; de cada filamento; filamentos como mucho)

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

/** Lo que el rayo necesita de fuera: echar chispas y el chispazo del segundo latigazo. */
export interface BoltEnv {
  sparks(p: Vector3, n: number, hex: number, speed: number, size: number): void;
  zap(p: Vector3): void;
}

interface Path {
  pts: Vector3[];
  n: number;
  w: number;
  a: number;
  at: number;
  main: boolean;
}

// el degradado de lado a lado de la cinta (transparente en los bordes, blanco en el centro)
function boltTex(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const x = c.getContext('2d') as CanvasRenderingContext2D, g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 8);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const _d = new Vector3(), _u = new Vector3(), _v = new Vector3(), _m = new Vector3(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _h0 = new Vector3(), _h1 = new Vector3();
const _s0 = new Vector3(), _s1 = new Vector3(), _mid = new Vector3();

// un marco de lado (u, v) para la dirección d
function frame(d: Vector3): void {
  _u.set(0, 1, 0);
  if (Math.abs(d.y) > 0.9) _u.set(1, 0, 0);
  _u.cross(d).normalize();
  _v.crossVectors(d, _u);
}

// Línea quebrada de a a b en buf[off…] (2^levels + 1 puntos): cada tramo se parte por la mitad y el punto medio se desplaza
// hacia un lado (RepArena: jag, aquí sin crear puntos nuevos)
function jag(buf: Vector3[], off: number, a: Vector3, b: Vector3, levels: number, rough: number): number {
  const n = 1 << levels;
  buf[off].copy(a);
  buf[off + n].copy(b);
  for (let step = n; step > 1; step >>= 1) {
    for (let i = 0; i < n; i += step) {
      const p = buf[off + i], q = buf[off + i + step], len = p.distanceTo(q);
      _d.subVectors(q, p).normalize();
      frame(_d);
      buf[off + i + step / 2].copy(p).lerp(q, 0.5).addScaledVector(_u, rand(-1, 1) * len * rough).addScaledVector(_v, rand(-1, 1) * len * rough);
    }
  }
  return n + 1;
}

/** Un rayo (RepArena: Lightning). */
export class Lightning {
  readonly mesh: Mesh;
  private g: BufferGeometry;
  private P: Float32Array;
  private C: Float32Array;
  private paths: Path[] = [];
  private nPaths = 0;
  readonly from = new Vector3();
  readonly to = new Vector3();
  busy = false;
  /** Lo recorrido (0 a 1): lo pone quien lo lanza; al llegar, `arrive`. */
  k = 0;
  L = 0;
  scale = 1;
  age = 0;
  bright = 0;
  private fade = -1;
  private flickT = 0;
  private FADE = 0.3;
  private restrike = -1;
  readonly col = new Color();
  private hex = 0;

  constructor(
    mat: MeshBasicMaterial,
    private env: BoltEnv,
  ) {
    const g = new BufferGeometry(), n = LT_SEG * 6;
    this.P = new Float32Array(n * 3);
    this.C = new Float32Array(n * 3);
    const U = new Float32Array(n * 2), quad = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    for (let i = 0; i < LT_SEG; i++) U.set(quad, i * 12);
    g.setAttribute('position', new BufferAttribute(this.P, 3));
    g.setAttribute('color', new BufferAttribute(this.C, 3));
    g.setAttribute('uv', new BufferAttribute(U, 2));
    g.setDrawRange(0, 0);
    this.g = g;
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noInk = true;
    this.paths.push({ pts: Array.from({ length: MAIN_N }, () => new Vector3()), n: 0, w: 1, a: 1, at: 0, main: true });
    for (let i = 0; i < FIL_MAX; i++) this.paths.push({ pts: Array.from({ length: FIL_N }, () => new Vector3()), n: 0, w: 0.22, a: 1, at: 0, main: false });
  }

  start(from: Vector3, to: Vector3, L: number, hex: number, scale: number): void {
    this.busy = true;
    this.L = L;
    this.scale = scale;
    this.k = 0;
    this.age = 0;
    this.fade = -1;
    this.flickT = 0;
    this.bright = 0.8;
    this.hex = hex;
    this.col.setHex(hex);
    this.from.copy(from);
    this.to.copy(to);
    this.FADE = 0.26 + 0.05 * L;
    this.restrike = L >= 2 ? rand(0.08, 0.14) : -1;
    this.gen();
    this.mesh.visible = true;
  }

  // el haz principal (apenas quebrado) y los filamentos pegados a él que siguen su dirección; se rehace en cada parpadeo
  private gen(): void {
    const len = this.from.distanceTo(this.to), lv = len > 3 ? 6 : len > 0.8 ? 5 : 4, M = this.paths[0];
    M.n = jag(M.pts, 0, this.from, this.to, lv, 0.018);
    const nf = Math.min(FIL_MAX, Math.round((5 + this.L * 2 + rand(0, 2)) * Math.min(1, 0.35 + len / 2.5)));
    const off = Math.min(0.055, 0.012 + len * 0.012) * (1 + this.L * 0.2) * this.scale;
    for (let i = 1; i <= nf; i++) {
      const F = this.paths[i];
      const t0 = rand(0.04, 0.88), t1 = Math.min(1, t0 + Math.min(rand(0.06, 0.18), 0.45 / Math.max(len, 0.1)));
      this.pointAt(t0, _s0);
      this.pointAt(t1, _s1);
      _d.subVectors(_s1, _s0).normalize();
      frame(_d);
      const ang = rand(0, Math.PI * 2), r0 = off * rand(0.2, 1), r1 = off * rand(0, 0.6); // sale de cerca del haz, se separa un poco y vuelve
      _s0.addScaledVector(_u, Math.cos(ang) * r0 * 0.3).addScaledVector(_v, Math.sin(ang) * r0 * 0.3);
      _s1.addScaledVector(_u, Math.cos(ang + 1) * r1).addScaledVector(_v, Math.sin(ang + 1) * r1);
      _mid.copy(_s0).lerp(_s1, 0.5).addScaledVector(_u, Math.cos(ang) * r0).addScaledVector(_v, Math.sin(ang) * r0);
      jag(F.pts, 0, _s0, _mid, 2, 0.14);
      _a.copy(F.pts[4]); // (el medio, que el segundo tramo pisa al empezar)
      jag(F.pts, 4, _a, _s1, 2, 0.14);
      F.n = FIL_N;
      F.a = rand(0.5, 0.9);
      F.at = t1;
    }
    this.nPaths = nf + 1;
  }

  /** El punto del haz principal a una fracción t del recorrido. */
  pointAt(t: number, out: Vector3): Vector3 {
    const M = this.paths[0], f = clamp(t, 0, 1) * (M.n - 1), i = Math.min(M.n - 2, Math.floor(f));
    return out.copy(M.pts[i]).lerp(M.pts[i + 1], f - i);
  }

  /** Ha llegado: destella y se apaga. */
  arrive(): void {
    this.k = 1;
    this.fade = 0;
    this.flickT = 0;
  }

  get fading(): boolean {
    return this.fade >= 0;
  }

  update(dt: number, eye: Vector3): void {
    if (!this.busy) return;
    this.age += dt;
    if (this.fade >= 0) {
      this.fade += dt;
      if (this.fade >= this.FADE) {
        this.end();
        return;
      }
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = LT_FLICK;
        this.gen();
        if (Math.random() < 0.5) this.env.sparks(this.pointAt(Math.random(), _c), 1 + (this.L >> 1), this.hex, 1.2, 0.02 * this.scale);
      }
      if (this.restrike > 0 && this.fade > this.restrike) {
        // el segundo latigazo
        this.restrike = -1;
        this.fade = Math.min(this.fade, 0.04);
        this.env.zap(this.to);
      }
      const f = this.fade / this.FADE;
      this.bright = Math.pow(1 - f, 1.4) * rand(0.55, 1) * (this.fade < 0.05 ? 1.6 : 1);
    } else {
      this.bright = rand(0.6, 0.9);
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = LT_FLICK;
        this.gen();
      }
    }
    this.build(eye);
  }

  private n = 0;
  // un tramo de cinta de a a c, de ancho w, de cara a los ojos
  private seg(a: Vector3, c: Vector3, w: number, r: number, g: number, bl: number, eye: Vector3): void {
    if (this.n >= LT_SEG) return;
    _d.subVectors(c, a);
    _m.addVectors(a, c).multiplyScalar(0.5);
    _b.subVectors(eye, _m);
    _u.crossVectors(_d, _b);
    if (_u.lengthSq() < 1e-10) return;
    _u.normalize().multiplyScalar(w / 2);
    const P = this.P, C = this.C, o = this.n * 18;
    P[o] = a.x - _u.x; P[o + 1] = a.y - _u.y; P[o + 2] = a.z - _u.z;
    P[o + 3] = a.x + _u.x; P[o + 4] = a.y + _u.y; P[o + 5] = a.z + _u.z;
    P[o + 6] = c.x + _u.x; P[o + 7] = c.y + _u.y; P[o + 8] = c.z + _u.z;
    P[o + 9] = a.x - _u.x; P[o + 10] = a.y - _u.y; P[o + 11] = a.z - _u.z;
    P[o + 12] = c.x + _u.x; P[o + 13] = c.y + _u.y; P[o + 14] = c.z + _u.z;
    P[o + 15] = c.x - _u.x; P[o + 16] = c.y - _u.y; P[o + 17] = c.z - _u.z;
    for (let i = 0; i < 6; i++) {
      C[o + i * 3] = r;
      C[o + i * 3 + 1] = g;
      C[o + i * 3 + 2] = bl;
    }
    this.n++;
  }

  // mientras viaja, la estela se apaga detrás de la cabeza (y el haz se estrecha); los filamentos, igual según dónde están
  private put(a0: Vector3, c0: Vector3, t: number, p: Path, pass: number, wCore: number, wGlow: number, eye: Vector3): void {
    const k = this.k, f = k >= 1 ? 1 : clamp(1 - (k - t) / TAIL, 0.18, 1), a = p.a * this.bright * f, w = (pass ? wCore : wGlow) * p.w * (0.55 + 0.45 * f), col = this.col;
    if (pass) this.seg(a0, c0, w, (0.55 + col.r * 0.45) * a, (0.55 + col.g * 0.45) * a, (0.55 + col.b * 0.45) * a, eye);
    else this.seg(a0, c0, w, col.r * a * 0.6, col.g * a * 0.6, col.b * a * 0.6, eye);
  }

  private build(eye: Vector3): void {
    const k = this.k, s = this.scale, L = this.L, wCore = (0.011 + 0.004 * L) * s, wGlow = wCore * (5 + L * 0.8), col = this.col, b = this.bright;
    this.n = 0;
    for (let pass = 0; pass < 2; pass++) {
      // (primero el halo ancho y tenue; encima, el núcleo casi blanco)
      for (let j = 0; j < this.nPaths; j++) {
        const p = this.paths[j];
        if (p.at > k) continue;
        const pts = p.pts, last = p.n - 1;
        for (let i = 0; i < last; i++) {
          if (p.main) {
            const t0 = i / last, t1 = (i + 1) / last;
            if (t0 >= k) break;
            if (t1 > k) {
              _c.copy(pts[i]).lerp(pts[i + 1], (k - t0) / (t1 - t0));
              this.put(pts[i], _c, k, p, pass, wCore, wGlow, eye);
              break;
            }
            this.put(pts[i], pts[i + 1], t1, p, pass, wCore, wGlow, eye);
          } else this.put(pts[i], pts[i + 1], p.at, p, pass, wCore, wGlow, eye);
        }
      }
    }
    // la cabeza: un tramo corto, ancho y casi blanco en la punta mientras viaja
    if (k < 1) {
      this.pointAt(Math.max(0, k - 0.025), _h0);
      this.pointAt(k, _h1);
      const hb = Math.min(1, b * 1.2);
      this.seg(_h0, _h1, wGlow * 1.3, col.r * hb * 0.6, col.g * hb * 0.6, col.b * hb * 0.6, eye);
      this.seg(_h0, _h1, wCore * 3, hb, hb, hb, eye);
    }
    this.g.setDrawRange(0, this.n * 6);
    (this.g.attributes.position as BufferAttribute).needsUpdate = true;
    (this.g.attributes.color as BufferAttribute).needsUpdate = true;
  }

  end(): void {
    this.busy = false;
    this.mesh.visible = false;
    this.g.setDrawRange(0, 0);
  }
}

/** Los rayos (RepArena: BOLTS, como mucho 12 a la vez; si hacen falta más, se reutiliza el más viejo). */
export class Bolts {
  readonly group = new Group();
  private list: Lightning[] = [];

  constructor(env: BoltEnv, n = 12) {
    const mat = new MeshBasicMaterial({ map: boltTex(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
    for (let i = 0; i < n; i++) {
      const b = new Lightning(mat, env);
      this.list.push(b);
      this.group.add(b.mesh);
    }
    this.group.name = 'rayos';
  }

  /** Lanza uno de from a to (L: su intensidad; hex: su color; scale: más fino en la batalla diminuta). */
  start(from: Vector3, to: Vector3, L: number, hex: number, scale = 1): Lightning {
    let b = this.list.find((x) => !x.busy);
    if (!b) b = this.list.reduce((o, x) => (x.age > o.age ? x : o));
    b.start(from, to, L, hex, scale);
    return b;
  }

  update(dt: number, eye: Vector3): void {
    for (const b of this.list) b.update(dt, eye);
  }

  clear(): void {
    for (const b of this.list) b.end();
  }
}
