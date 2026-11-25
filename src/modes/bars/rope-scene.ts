/**
 * Lo que se ve de la aventura en la cuerda (src/modes/bars/rope.ts): la ladera del valle con sus pinos, las torres de madera
 * y la cuerda, que bajan y pasan por encima de ti, hacia atrás, a medida que subes. Tumbado bajo las paralelas, la cuerda sigue la línea de lo que agarras: con **dos paralelas**, dos cables (cada
 * paralela es un trozo de su cable, que sigue delante y detrás); con **una**, cruzada sobre ti, un cable que pasa por encima
 * de su centro, a lo largo de tu cuerpo, y la barra cuelga de él por una polea. Delante (hacia tus pies: tumbado, lo que
 * se ve sin echar la cabeza atrás) la cuerda sube recta con la cuesta del tramo; al final, en vertical junto a la torre, hacia su plataforma.
 *
 * El mundo no se inclina (el cielo sigue arriba): subir es que el valle entero baje y venga hacia ti. Todo cuelga de un
 * grupo (`track`) que se desplaza cada fotograma: el suelo (una malla de la ladera, hecha una vez por ronda), los pinos, las
 * piedras y las torres (instancias, al cambiar de trozo) y los cables (cada fotograma, sin crear nada).
 */
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, Euler, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { kitParts } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import type { Put } from '../trek/plat/pieces.js';
import { chestMouth, FALL, ROPE_CHUNK, ROPE_MODELS, ropeDecoPuts, type RopeCourse } from './rope.js';
import { ROPE_WORLDS, type RopeWorldKey } from './rope-worlds.js';
import { Sea } from '../trek/sea.js';
import { CloudSea } from '../trek/cloud-sea.js';

/** Lo que se ve de la cuerda hacia delante y hacia atrás (m) y el largo de cada trozo de cable (m). */
const AHEAD = 110, BEHIND = 30, SEG = 2;
const SEGS = Math.ceil((AHEAD + BEHIND) / SEG) + 2;
/** Lo que se pintan del paisaje (en horizontal): los trozos de detrás y de delante. */
const CH_BACK = 4, CH_AHEAD = Math.ceil(AHEAD / ROPE_CHUNK) + 2;
/** El suelo: la rejilla fina cerca (m a los lados, y su paso a lo largo y a lo ancho) y, más allá, cada vez más ancha hasta
 * `FAR` m (más allá no se pinta: la cámara llega a 200 m; detrás, el mar de nubes). */
const GROUND_U = 120, GROUND_DH = 3, GROUND_DU = 6, FAR = 300;
/** Los puntos de la rejilla de `a` a `b` cada `d` m y, por fuera, cada vez más separados hasta `far` m más allá. */
function spread(a: number, b: number, d: number, far: number): number[] {
  const out: number[] = [];
  for (let x = a - d, g = d * 2; x > a - far; x -= g, g *= 1.35) out.unshift(x);
  for (let x = a; x <= b; x += d) out.push(x);
  for (let x = out[out.length - 1] + d, g = d * 2; x < b + far; x += g, g *= 1.35) out.push(x);
  return out;
}
/** Las cascadas de la garganta que puede haber a la vista a la vez. */
const FALLS = 12;
/** El agua que cae: franjas claras que bajan deprisa por la cara de la roca, con espuma abajo y transparente por los bordes. */
const FALL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FS = `uniform float uT; varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
void main() {
  float col = floor(vUv.x * 18.0), sp = 0.6 + h(col) * 0.6, y = vUv.y * 6.0 + uT * 3.0 * sp + h(col + 3.0) * 7.0;
  float streak = smoothstep(0.55, 1.0, fract(y)) * 0.6 + 0.4;
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x), foam = smoothstep(0.12, 0.0, vUv.y);
  vec3 c = mix(vec3(0.62, 0.8, 0.9), vec3(1.0), streak * 0.6 + foam);
  gl_FragColor = vec4(c, edge * (0.55 + 0.35 * streak) + foam * 0.3);
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
  /** El mundo de ahora (rope-worlds.ts), el nivel del mar (la costa) y dónde está fondeado su barco (h). */
  private world: RopeWorldKey = 'alps';
  private seaY = -1e9;
  private shipH = NaN;
  private readonly ocean = new Sea();
  private falls: Mesh[] = [];
  private fallMat: ShaderMaterial | null = null;
  /** El destello blanco al cambiar de mundo (como el portal de la Travesía). */
  private flash: Mesh | null = null;
  private flashT = 0;
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
  /** Lo que está escondido de la arena (compuertas, suelo, valle y nubes) mientras se ve el cañón. */
  private hidden: Object3D[] = [];
  private shown = false;
  /** ¿Está colocado el cañón (ya te colgaste en esta ronda)? */
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
    this.frame.add(this.ocean.mesh);
    this.root.add(this.sea.mesh);
    warmKeep(new Mesh(this.sea.mesh.geometry, this.sea.mesh.material));
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
    // el cable: trozos de un cilindro fino de acero trenzado (dos por trozo con dos paralelas)
    const mat = new MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.85, metalness: 0.2 });
    this.cable = new InstancedMesh(new CylinderGeometry(0.014, 0.014, 1, 6, 1), mat, SEGS * 2);
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
    // las cascadas (planos con el agua que cae; se colocan al pintar el paisaje)
    this.fallMat = new ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false });
    for (let i = 0; i < FALLS; i++) {
      const m = new Mesh(new PlaneGeometry(1, 1).translate(0, 0.5, 0), this.fallMat);
      m.visible = false;
      m.userData.noInk = true;
      this.track.add(m);
      this.falls.push(m);
    }
    warmKeep(new Mesh(this.falls[0].geometry, this.fallMat));
    // el destello: una esfera blanca alrededor de la cabeza, que se desvanece
    this.flash = new Mesh(new SphereGeometry(1.5, 16, 8), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: BackSide, depthTest: false, depthWrite: false, toneMapped: false, fog: false, blending: AdditiveBlending }));
    this.flash.renderOrder = 1e6;
    this.flash.visible = false;
    this.flash.userData.noInk = true;
    this.root.add(this.flash);
    this.built = true;
    return true;
  }

  /** La ronda nueva: su recorrido (el paisaje se rehace). */
  setCourse(C: RopeCourse | null): void {
    if (C === this.course) return;
    this.course = C;
    this.opened.clear();
    this.world = 'alps';
    this.seaY = -1e9;
    this.shipH = NaN;
    this.flashT = 0;
    this.groundMat?.color.setHex(ROPE_WORLDS[0].ground);
    this.cache.clear();
    this.chunkFrom = -999;
    this.placed = false;
    if (C) this.buildGround(C);
  }

  // la ladera de toda la ronda (una malla, hecha al empezar: en plena ronda no se crea nada), de color de hierba de montaña;
  // llega muy lejos (hasta perderse en la bruma), para que de la foto de fondo solo se vea lo de encima del horizonte
  private buildGround(C: RopeCourse): void {
    if (this.ground) {
      this.track.remove(this.ground);
      this.ground.geometry.dispose();
    }
    this.groundMat ??= new MeshStandardMaterial({ color: 0x86b25e, roughness: 1, metalness: 0 });
    const hEnd = C.h(C.len), hs = spread(-60, hEnd + 20, GROUND_DH, FAR), us = spread(-GROUND_U, GROUND_U, GROUND_DU, FAR);
    const nh = hs.length, nu = us.length, pos = new Float32Array(nh * nu * 3), idx: number[] = [];
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
    this.ground = new Mesh(g, this.groundMat);
    this.ground.receiveShadow = false; // (una ladera tan grande recibiendo sombras pesa mucho; desde la cuerda, no se ven)
    this.ground.frustumCulled = false;
    this.ground.userData.noInk = true; // (el borde de tinta en una ladera entera, a rayas)
    this.track.add(this.ground);
  }

  /** Pasa al mundo `key` (al llegar a la plataforma del último tramo del anterior): su paisaje, su suelo y su mar, de golpe tras
   * un destello blanco. `seaY`, el nivel del mar (la costa); `shipH`, dónde fondea su barco (h; NaN, sin barco). */
  setWorld(key: RopeWorldKey, seaY = -1e9, shipH = NaN, flash = true): void {
    this.world = key;
    this.seaY = seaY;
    this.shipH = shipH;
    this.cache.clear();
    this.chunkFrom = -999;
    this.groundMat?.color.setHex(ROPE_WORLDS.find((w) => w.key === key)?.ground ?? 0x86b25e);
    if (flash) this.flashT = 1;
  }
  /** Dónde está tu cabeza (para el destello). */
  readonly eye = new Vector3();

  /** Los cofres ya abiertos (por su torre): se pintan llenos de oro. */
  private readonly opened = new Set<number>();
  /** Abre el cofre de la torre i (al llegar a su plataforma) y deja en `out` dónde está su boca, en el mundo. */
  openChest(i: number, out: Vector3): Vector3 | null {
    const C = this.course, T = C?.towers[i];
    if (!C || !T) return null;
    this.opened.add(i);
    this.cache.clear(); // (se rehace el paisaje: el cofre, abierto)
    this.chunkFrom = -999;
    const [u, y, h] = chestMouth(T);
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
    if (this.flash) {
      this.flashT = Math.max(0, this.flashT - 1 / 72 / 0.9);
      this.flash.visible = this.flashT > 0;
      this.flash.position.copy(this.eye);
      (this.flash.material as MeshBasicMaterial).opacity = this.flashT;
    }
    if (!on) return;
    const C = this.course!;
    // subir: el valle baja y viene hacia ti (lo de s queda en tus manos)
    this.track.position.set(0, -C.y(s), C.h(s));
    // el mar de la costa: a su nivel, con sus olas quietas en el recorrido (bajan contigo al subir)
    const coast = this.world === 'coast';
    this.ocean.update(coast, this.clock, 0, -C.h(s), 0, 0, this.fogHex(), 0.006, 0);
    if (coast) this.ocean.mesh.position.y = this.seaY - C.y(s);
    if (this.fallMat) this.fallMat.uniforms.uT.value = this.clock;
    const from = Math.floor(C.h(s) / ROPE_CHUNK) - CH_BACK;
    if (from !== this.chunkFrom) this.paintDeco(C, from);
    this.paintCable(C, s);
    if (this.pulley) {
      this.pulley.visible = this.lanes.length === 1;
      this.pulley.position.set(0, this.laneY, 0);
    }
  }

  // las rocas de los trozos a la vista (cada trozo se calcula una vez y se guarda mientras se ve)
  private paintDeco(C: RopeCourse, from: number): void {
    this.chunkFrom = from;
    for (const k of [...this.cache.keys()]) if (k < from || k > from + CH_BACK + CH_AHEAD) this.cache.delete(k);
    for (const b of this.batches.values()) b.n = 0;
    for (let c = from; c <= from + CH_BACK + CH_AHEAD; c++) {
      let L = this.cache.get(c);
      if (!L) {
        L = ropeDecoPuts(C, c, [], this.opened, this.world, this.seaY, this.shipH);
        this.cache.set(c, L);
      }
      for (const P of L) this.put(P);
    }
    // las cascadas: en la cara de su pared, de cara a la cuerda
    let f = 0;
    for (let c = from; c <= from + CH_BACK + CH_AHEAD; c++)
      for (const P of this.cache.get(c) ?? [])
        if (P.n === FALL && f < this.falls.length) {
          const m = this.falls[f++];
          m.position.set(P.u, P.y, -P.ds);
          m.rotation.set(0, P.u < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
          m.scale.set(P.sx, P.sy, 1);
          m.visible = true;
        }
    for (; f < this.falls.length; f++) this.falls[f].visible = false;
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

  // los cables: de las paralelas hacia delante (subiendo con la cuesta) y hacia atrás, a trozos de SEG metros
  private paintCable(C: RopeCourse, s: number): void {
    const im = this.cable!, h0 = C.h(s), y0 = C.y(s);
    let n = 0;
    for (const lane of this.lanes) {
      for (let k = -Math.ceil(BEHIND / SEG); k < Math.ceil(AHEAD / SEG); k++) {
        const sa = s + k * SEG, sb = sa + SEG;
        // (un punto de la cuerda, respecto a tus manos: −z hacia delante)
        this.a.set(lane, this.laneY + C.y(sa) - y0, -(C.h(sa) - h0));
        this.b.set(lane, this.laneY + C.y(sb) - y0, -(C.h(sb) - h0));
        this.seg(n++, this.a, this.b);
      }
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

  // se ve o no: con el cañón, fuera la arena (y al quitarlo, vuelve)
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

  /** ¿Se ve el cañón? (el entorno de serie, entonces, se aparta) */
  get visible(): boolean {
    return this.shown;
  }
}
