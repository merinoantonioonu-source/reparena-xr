/**
 * Lo que se ve de la aventura en la cuerda (src/modes/bars/rope.ts): la montaña de abajo arriba (el valle, el bosque, la garganta
 * y la cima, con su suelo teñido de cada zona), su agua (el río, el lago, los arroyos y las cascadas, src/modes/bars/rope-water.ts),
 * sus árboles y rocas, los cofres colgados del cable, las estaciones del valle y de la cima, y el cable, que baja y pasa por
 * encima de ti, hacia atrás, a medida que subes. Tumbado bajo las paralelas, el cable sigue la línea de lo que agarras: con **dos
 * paralelas**, dos cables (cada paralela es un trozo de su cable, que sigue delante y detrás); con **una**, cruzada sobre ti, un
 * cable que pasa por encima de su centro, a lo largo de tu cuerpo, y la barra cuelga de él por una polea. Delante (hacia tus
 * pies: tumbado, lo que se ve sin echar la cabeza atrás) el cable sube, sin pliegues, hasta la estación de la cima.
 *
 * El mundo no se inclina (el cielo sigue arriba): subir es que la montaña entera baje y venga hacia ti. Todo cuelga de un grupo
 * (`track`) que se desplaza cada fotograma: el suelo y el agua (mallas de la ronda, hechas al empezar), los árboles, las rocas,
 * los cofres y las estaciones (instancias, al cambiar de trozo) y los cables (cada fotograma, sin crear nada).
 */
import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, Euler, ShaderMaterial, TorusGeometry, Vector3 } from '@iwsdk/core';
import { kitParts } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import type { Put } from '../trek/plat/pieces.js';
import { chestAt, chestMouth, CHEST, ROPE_CHUNK, ROPE_FOG, ROPE_MODELS, ropeDecoPuts, type RopeCourse } from './rope.js';
import { ROPE_WORLDS, zoneWeight } from './rope-worlds.js';
import { CloudSea } from '../trek/cloud-sea.js';
import { RopeWater } from './rope-water.js';

/** Lo que se ve de la cuerda hacia delante y hacia atrás (m) y el largo de cada trozo de cable (m). */
const AHEAD = 120, BEHIND = 30, SEG = 2;
const SEGS = Math.ceil((AHEAD + BEHIND) / SEG) + 2;
/** Lo que se pintan del paisaje (en horizontal): los trozos de detrás y de delante. */
const CH_BACK = 4, CH_AHEAD = Math.ceil(AHEAD / ROPE_CHUNK) + 2;
/** El suelo: la rejilla fina cerca (m a los lados, y su paso a lo largo y a lo ancho: se ven el cauce del río y las paredes de la
 * garganta) y, más allá, cada vez más ancha hasta `FAR` m (más allá no se pinta: la cámara llega a 200 m; detrás, el mar de nubes). */
const GROUND_U = 64, GROUND_DH = 1.5, GROUND_DU = 2, FAR = 300;
/** Los puntos de la rejilla de `a` a `b` cada `d` m y, por fuera, cada vez más separados hasta `far` m más allá. */
function spread(a: number, b: number, d: number, far: number): number[] {
  const out: number[] = [];
  for (let x = a - d, g = d * 2; x > a - far; x -= g, g *= 1.35) out.unshift(x);
  for (let x = a; x <= b; x += d) out.push(x);
  for (let x = out[out.length - 1] + d, g = d * 2; x < b + far; x += g, g *= 1.35) out.push(x);
  return out;
}
/** El agua que cae: franjas claras que bajan deprisa por la cara de la roca, con espuma abajo y transparente por los bordes. */
const FALL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FS = `uniform float uT; varying vec2 vUv;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  // (el agua que cae: hilos que bajan deprisa, a distinta velocidad, con su transparencia; espuma blanca en el borde de arriba,
  // donde rompe, y abajo, donde choca; los bordes, deshilachados)
  vec2 p = vec2(vUv.x * 14.0, vUv.y * 3.0 + uT * 2.6);
  float n = vnoise(p) * 0.55 + vnoise(p * vec2(2.3, 1.7) + 7.1) * 0.3 + vnoise(p * vec2(5.0, 3.1) - 2.3) * 0.15;
  float edge = smoothstep(0.0, 0.14 + 0.08 * vnoise(vec2(vUv.y * 9.0 - uT, 1.0)), vUv.x) * smoothstep(1.0, 0.86 - 0.08 * vnoise(vec2(vUv.y * 9.0 - uT, 5.0)), vUv.x);
  float foam = smoothstep(0.16, 0.0, vUv.y) + smoothstep(0.93, 1.0, vUv.y) * 0.8;
  vec3 c = mix(vec3(0.42, 0.62, 0.72), vec3(0.95, 0.98, 1.0), clamp(n * 0.9 + foam, 0.0, 1.0));
  gl_FragColor = vec4(c, edge * (0.5 + 0.45 * n) + foam * 0.35);
}`;
/** Con una paralela, lo que sube el cable sobre ella (m). */
const PULLEY_UP = 0.32;

interface Batch {
  ims: InstancedMesh[];
  n: number;
  cap: number;
}

export class RopeScene {
  readonly root = new Group();
  private readonly frame = new Group();
  private readonly track = new Group();
  private batches = new Map<string, Batch>();
  private built = false;
  private cable: InstancedMesh | null = null;
  private pulley: Group | null = null;
  private ground: Mesh | null = null;
  /** El agua de la ronda (el río, el lago, los arroyos y la bruma de las cascadas) y las cascadas. */
  private readonly water = new RopeWater();
  private falls: Mesh[] = [];
  private fallMat: ShaderMaterial | null = null;
  /** El mar de nubes del valle (el del risco de la Travesía): bajo el horizonte tapa el suelo de la foto de fondo, que está
   * hecha de pie en un prado (sin él, mirando al valle se veía la hierba de la foto, enorme); encima, las montañas de la foto. */
  private readonly sea = new CloudSea([0.012, -0.004]);
  private clock = 0;
  private groundMat: MeshStandardMaterial | null = null;
  private course: RopeCourse | null = null;
  private chunkFrom = -999;
  private readonly cache = new Map<number, Put[]>();
  /** Los cables: a qué lado van (m) y a qué altura sobre las paralelas. */
  private lanes: number[] = [0];
  private laneY = 0;
  /** Lo que está escondido de la arena (compuertas, suelo, valle y nubes) mientras se ve la montaña. */
  private hidden: Object3D[] = [];
  private shown = false;
  /** ¿Está colocada la cuerda (ya te colgaste en esta ronda)? */
  placed = false;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly sc = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(parent: Object3D, private readonly arenaOf: () => Object3D[], private readonly fogHex: () => number = () => 0xc8d6e4) {
    parent.add(this.root);
    this.root.add(this.sea.mesh);
    warmKeep(new Mesh(this.sea.mesh.geometry, this.sea.mesh.material));
    for (const m of this.water.samples()) warmKeep(m);
    this.root.add(this.frame);
    this.frame.add(this.track);
    this.root.visible = false;
  }

  /** Las instancias de cada modelo, en cuanto los kits estén cargados (y su sombreador, precompilado en el menú). */
  private build(): boolean {
    if (this.built) return true;
    const isl = kitParts('island'), nat = kitParts('nature');
    if (!isl || !nat) return false;
    for (const M of ROPE_MODELS) {
      const parts = (M.kit === 'island' ? isl : nat)[M.n];
      if (!parts) continue;
      const ims = parts.map((p) => {
        const im = new InstancedMesh(p.geo, p.mat, M.cap);
        im.count = 0;
        im.frustumCulled = false;
        im.receiveShadow = false;
        this.track.add(im);
        warmKeep(new InstancedMesh(p.geo, p.mat, 1));
        return im;
      });
      this.batches.set(`${M.kit}:${M.n}`, { ims, n: 0, cap: M.cap });
    }
    // el cable: trozos de un cilindro fino de acero trenzado (dos por trozo con dos paralelas), y los brazos de los cofres
    const mat = new MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.85, metalness: 0.2 });
    this.cable = new InstancedMesh(new CylinderGeometry(0.014, 0.014, 1, 6, 1), mat, SEGS * 2 + 16);
    this.cable.count = 0;
    this.cable.frustumCulled = false;
    this.frame.add(this.cable);
    warmKeep(new InstancedMesh(this.cable.geometry, mat, 1));
    // la polea de la paralela única: la rueda en el cable y el colgador que baja hasta la barra
    const steel = new MeshStandardMaterial({ color: 0x9aa0ae, roughness: 0.35, metalness: 0.85 });
    const p = new Group(), wheel = new Mesh(new TorusGeometry(0.05, 0.016, 8, 16), steel), hang = new Mesh(new CylinderGeometry(0.01, 0.01, PULLEY_UP, 6), steel);
    wheel.rotation.y = Math.PI / 2;
    hang.position.y = -PULLEY_UP / 2;
    p.add(wheel, hang);
    p.visible = false;
    this.frame.add(p);
    this.pulley = p;
    this.fallMat = new ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
    warmKeep(new Mesh(new PlaneGeometry(1, 1), this.fallMat));
    this.built = true;
    if (this.course) this.buildWater(this.course);
    return true;
  }

  /** La ronda nueva: su recorrido (el paisaje, el suelo y el agua se rehacen). */
  setCourse(C: RopeCourse | null): void {
    if (C === this.course) return;
    this.course = C;
    this.opened.clear();
    this.cache.clear();
    this.chunkFrom = -999;
    this.placed = false;
    if (C) this.buildGround(C);
    if (this.built) this.buildWater(C);
  }

  // el agua y las cascadas de la ronda (cada una, de arriba abajo por la cara de su pared, de cara a la cuerda)
  private buildWater(C: RopeCourse | null): void {
    this.water.build(C, this.track);
    for (const m of this.falls) {
      this.track.remove(m);
      m.geometry.dispose();
    }
    this.falls = [];
    if (!C) return;
    for (const F of C.falls) {
      const m = new Mesh(new PlaneGeometry(F.w, F.top - F.bot).translate(0, (F.top - F.bot) / 2, 0), this.fallMat!);
      m.position.set(F.u, F.bot, -F.h);
      m.rotation.y = F.face;
      m.userData.noInk = true;
      m.frustumCulled = false;
      this.track.add(m);
      this.falls.push(m);
    }
  }

  // el suelo de la montaña (una malla, hecha al empezar: en plena ronda no se crea nada): fina cerca de la cuerda (se ven el
  // cauce del río y las paredes de la garganta) y cada vez más ancha hasta perderse en la bruma (de la foto de fondo solo se ve
  // lo de encima del horizonte). Teñida de cada zona (la hierba del valle, el pinar, la roca), con la roca a la vista donde es
  // empinado y la tierra húmeda en las orillas
  private buildGround(C: RopeCourse): void {
    if (this.ground) {
      this.track.remove(this.ground);
      this.ground.geometry.dispose();
    }
    this.groundMat ??= new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
    const hEnd = C.h(C.len), hs = spread(-60, hEnd + 40, GROUND_DH, FAR), us = spread(-GROUND_U, GROUND_U, GROUND_DU, FAR);
    const nh = hs.length, nu = us.length, pos = new Float32Array(nh * nu * 3), col = new Float32Array(nh * nu * 3), idx: number[] = [];
    for (let i = 0; i < nh; i++)
      for (let j = 0; j < nu; j++) {
        const k = (i * nu + j) * 3;
        pos[k] = us[j];
        pos[k + 1] = C.ground(hs[i], us[j]);
        pos[k + 2] = -hs[i];
      }
    for (let i = 0; i < nh - 1; i++)
      for (let j = 0; j < nu - 1; j++) {
        const a = i * nu + j, b = a + 1, c = a + nu, d = c + 1;
        idx.push(a, b, c, b, d, c); // (de cara arriba: se ve desde la cuerda)
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal.array as Float32Array, zc = ROPE_WORLDS.map((W) => new Color(W.ground)), rock = new Color(0x6f685f), rockDk = new Color(0x55504a), wet = new Color(0x5f6143), tmp = new Color(), rk = new Color();
    for (let i = 0; i < nh; i++) {
      const f = C.fracAt(hs[i]);
      for (let j = 0; j < nu; j++) {
        const k = (i * nu + j) * 3;
        tmp.setRGB(0, 0, 0);
        for (let z = 0; z < zc.length; z++) {
          const w = zoneWeight(z, f);
          tmp.r += zc[z].r * w;
          tmp.g += zc[z].g * w;
          tmp.b += zc[z].b * w;
        }
        // (la roca donde es empinado; las orillas, tierra húmeda; un poco de variación, para que no sea una manta lisa)
        // (la roca, en estratos: franjas claras y oscuras a lo alto)
        rk.copy(rock).lerp(rockDk, 0.5 + 0.5 * Math.sin(pos[k + 1] * 1.7 + Math.sin(hs[i] * 0.3) * 0.8));
        const nearWater = Math.abs(us[j]) < 70 && C.wet(hs[i], us[j], 1.5);
        if (!nearWater) tmp.lerp(rk, smooth01(0.72, 0.5, nrm[k + 1]));
        // (en la cima, la roca asoma a manchas entre la hierba rala)
        const ws = zoneWeight(3, f), patch = Math.sin(hs[i] * 0.23 + us[j] * 0.11) * Math.sin(us[j] * 0.19 - hs[i] * 0.07);
        if (ws > 0) tmp.lerp(rk, ws * smooth01(0.1, 0.5, patch) * 0.8);
        if (nearWater) tmp.lerp(wet, 0.5);
        const n = 0.93 + 0.07 * Math.sin(hs[i] * 0.37 + us[j] * 0.21) * Math.sin(us[j] * 0.13 - hs[i] * 0.11);
        col[k] = tmp.r * n;
        col[k + 1] = tmp.g * n;
        col[k + 2] = tmp.b * n;
      }
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    this.ground = new Mesh(g, this.groundMat);
    this.ground.receiveShadow = false; // (una ladera tan grande recibiendo sombras pesa mucho; desde la cuerda, no se ven)
    this.ground.frustumCulled = false;
    this.ground.userData.noInk = true; // (el borde de tinta en una ladera entera, a rayas)
    this.track.add(this.ground);
  }

  /** Dónde está tu cabeza. */
  readonly eye = new Vector3();

  /** Los cofres ya abiertos (por su tramo): se pintan llenos de oro. */
  private readonly opened = new Set<number>();
  /** Abre el cofre del tramo i (al llegar a él) y deja en `out` dónde está su boca, en el mundo. */
  openChest(i: number, out: Vector3): Vector3 | null {
    const C = this.course;
    if (!C || i < 0 || i >= C.ends.length) return null;
    this.opened.add(i);
    this.cache.clear(); // (se rehace el paisaje: el cofre, abierto)
    this.chunkFrom = -999;
    const [u, y, h] = chestMouth(C, i);
    this.track.updateMatrixWorld(true);
    return this.track.localToWorld(out.set(u, y, -h));
  }
  /** El grupo del recorrido (lo que baja contigo al subir) y el de la cuerda (en tus paralelas, girado hacia donde subes). */
  get trackGroup(): Group {
    return this.track;
  }
  get frameGroup(): Group {
    return this.frame;
  }
  /** Los cables: a qué lado van (m) y lo que suben sobre las paralelas (m). */
  get laneList(): number[] {
    return this.lanes;
  }
  get laneHeight(): number {
    return this.laneY;
  }

  /** Hacia dónde mira la escena (rad: hacia donde subes, tus pies; la foto de fondo se gira igual). */
  get yaw(): number {
    return this.frame.rotation.y;
  }

  /** Al colgarte: dónde está la cuerda (el centro de las paralelas, a su altura, `x`, `y`, `z`), hacia dónde sube (`fx`,
   * `fz`: hacia tus pies, en horizontal: lo que se ve tumbado) y los cables (`one`: una paralela; `gap`: la separación de las dos). */
  place(x: number, y: number, z: number, fx: number, fz: number, one: boolean, gap: number): void {
    this.frame.position.set(x, y, z);
    this.frame.rotation.set(0, Math.atan2(-fx, -fz), 0); // (su −z, hacia donde subes)
    this.lanes = one ? [0] : [-gap / 2, gap / 2];
    this.laneY = one ? PULLEY_UP : 0;
    this.placed = true;
  }

  /** Cada fotograma: show, si se ve (en la ronda, ya colgado); s, por dónde vas. */
  update(show: boolean, s: number): void {
    const on = show && this.placed && !!this.course && this.build();
    this.setShown(on);
    this.clock += 1 / 72;
    this.sea.update(on, this.clock, this.fogHex());
    if (!on) return;
    const C = this.course!;
    // subir: la montaña baja y viene hacia ti (lo de s queda en tus manos)
    this.track.position.set(0, -C.y(s), C.h(s));
    this.water.update(this.clock, this.fogHex(), ROPE_FOG);
    if (this.fallMat) this.fallMat.uniforms.uT.value = this.clock;
    const from = Math.floor(C.h(s) / ROPE_CHUNK) - CH_BACK;
    if (from !== this.chunkFrom) this.paintDeco(C, from);
    this.paintCable(C, s);
    if (this.pulley) {
      this.pulley.visible = this.lanes.length === 1;
      this.pulley.position.set(0, this.laneY, 0);
    }
  }

  // lo de los trozos a la vista (cada trozo se calcula una vez y se guarda mientras se ve)
  private paintDeco(C: RopeCourse, from: number): void {
    this.chunkFrom = from;
    for (const k of [...this.cache.keys()]) if (k < from || k > from + CH_BACK + CH_AHEAD) this.cache.delete(k);
    for (const b of this.batches.values()) b.n = 0;
    for (let c = from; c <= from + CH_BACK + CH_AHEAD; c++) {
      let L = this.cache.get(c);
      if (!L) {
        L = ropeDecoPuts(C, c, [], this.opened);
        this.cache.set(c, L);
      }
      for (const P of L) this.put(P);
    }
    for (const b of this.batches.values())
      for (const im of b.ims) {
        im.count = b.n;
        im.instanceMatrix.needsUpdate = true;
      }
  }

  private put(P: Put): void {
    const b = this.batches.get(`${P.kit}:${P.n}`);
    if (!b || b.n >= b.cap) return;
    this.e.set(P.rx, P.ry, P.rz);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(P.u, P.y, -P.ds), this.q, this.sc.set(P.sx, P.sy, P.sz));
    for (const im of b.ims) im.setMatrixAt(b.n, this.m4);
    b.n++;
  }

  // los cables: de las paralelas hacia delante (subiendo, hasta la estación de la cima) y hacia atrás (hasta la del valle), a
  // trozos de SEG metros; y el brazo de cada cofre a la vista, del cable al cofre
  private paintCable(C: RopeCourse, s: number): void {
    const im = this.cable!, h0 = C.h(s), y0 = C.y(s), a0 = Math.max(-8 - s, -BEHIND), a1 = Math.min(C.len - s, AHEAD);
    let n = 0;
    for (const lane of this.lanes) {
      for (let k = a0; k < a1 - 1e-3; k += SEG) {
        const sa = s + k, sb = s + Math.min(a1, k + SEG);
        // (un punto de la cuerda, respecto a tus manos: −z hacia delante)
        this.a.set(lane, this.laneY + C.y(sa) - y0, -(C.h(sa) - h0));
        this.b.set(lane, this.laneY + C.y(sb) - y0, -(C.h(sb) - h0));
        this.seg(n++, this.a, this.b);
      }
    }
    const lane = this.lanes[this.lanes.length - 1];
    for (let i = 0; i < C.ends.length - 1 && n < im.instanceMatrix.count; i++) {
      const e = C.ends[i];
      if (e < s - BEHIND || e > s + AHEAD) continue;
      const [u, y, h] = chestAt(C, i), top = y + CHEST.size * 0.75;
      // (del cable, un brazo hacia fuera y la cuerda que baja al cofre)
      this.a.set(lane, this.laneY + C.y(e) - y0, -(h - h0));
      this.b.set(u, this.laneY + C.y(e) - y0 + 0.05, -(h - h0));
      this.seg(n++, this.a, this.b);
      this.a.set(u, top - y0, -(h - h0));
      this.seg(n++, this.b, this.a);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }

  private seg(i: number, a: Vector3, b: Vector3): void {
    const d = this.sc.subVectors(b, a), len = d.length();
    this.q.setFromUnitVectors(this.up, d.divideScalar(len || 1));
    this.v.addVectors(a, b).multiplyScalar(0.5);
    this.m4.compose(this.v, this.q, this.sc.set(1, len, 1));
    this.cable!.setMatrixAt(i, this.m4);
  }

  // se ve o no: con la montaña, fuera la arena (y al quitarla, vuelve)
  private setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.visible = on;
    if (on) {
      this.hidden = this.arenaOf().filter((o) => o.visible);
      for (const o of this.hidden) o.visible = false;
    } else {
      for (const o of this.hidden) o.visible = true;
      this.hidden = [];
    }
  }

  /** ¿Se ve la montaña? (el entorno de serie, entonces, se aparta) */
  get visible(): boolean {
    return this.shown;
  }
}

const smooth01 = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
