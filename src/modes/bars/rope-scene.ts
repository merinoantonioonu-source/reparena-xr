/**
 * Lo que se ve de la aventura en la cuerda (src/modes/bars/rope.ts): el cañón y su cuerda, que bajan hacia tus pies a medida
 * que subes. Tumbado bajo las paralelas, la cuerda sigue la línea de lo que agarras: con **dos paralelas**, dos cables (cada
 * paralela es un trozo de su cable, que sigue delante y detrás); con **una**, cruzada sobre ti, un cable que pasa por encima
 * de su centro, a lo largo de tu cuerpo, y la barra cuelga de él por una polea. Delante (hacia lo alto de tu cabeza) la
 * cuerda sube con la cuesta; en la chimenea, en vertical, hacia el cielo.
 *
 * El mundo no se inclina (el cielo sigue arriba): subir es que el cañón entero baje y vaya hacia tus pies. Todo cuelga de un
 * grupo (`track`) que se desplaza cada fotograma; las rocas se ponen con instancias al cambiar de trozo (cada 8 m), los cables,
 * cada fotograma (sin crear nada).
 */
import { CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Euler, TorusGeometry, Vector3 } from '@iwsdk/core';
import { kitParts } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import type { Put } from '../trek/plat/pieces.js';
import { ROPE_CHUNK, ROPE_MODELS, ropeDecoPuts, type RopeCourse } from './rope.js';

/** Lo que se ve de la cuerda hacia delante y hacia atrás (m) y el largo de cada trozo de cable (m). */
const AHEAD = 110, BEHIND = 30, SEG = 2;
const SEGS = Math.ceil((AHEAD + BEHIND) / SEG) + 2;
/** Lo que se pintan del paisaje: los trozos de detrás y de delante. */
const CH_BACK = 4, CH_AHEAD = Math.ceil(AHEAD / ROPE_CHUNK) + 1;
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

  constructor(parent: Object3D, private readonly arenaOf: () => Object3D[]) {
    parent.add(this.root);
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
        im.receiveShadow = true;
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
    this.built = true;
    return true;
  }

  /** La ronda nueva: su recorrido (el paisaje se rehace). */
  setCourse(C: RopeCourse | null): void {
    this.course = C;
    this.cache.clear();
    this.chunkFrom = -999;
    this.placed = false;
  }

  /** Al colgarte: dónde está la cuerda (el centro de las paralelas, a su altura, `x`, `y`, `z`), hacia dónde sube (`fx`,
   * `fz`: hacia lo alto de tu cabeza, en horizontal) y los cables (`one`: una paralela; `gap`: la separación de las dos). */
  place(x: number, y: number, z: number, fx: number, fz: number, one: boolean, gap: number): void {
    this.frame.position.set(x, y, z);
    this.frame.rotation.set(0, Math.atan2(-fx, -fz), 0); // (su −z, hacia lo alto de tu cabeza)
    this.lanes = one ? [0] : [-gap / 2, gap / 2];
    this.laneY = one ? PULLEY_UP : 0;
    this.placed = true;
  }

  /** Cada fotograma: show, si se ve (en la ronda, ya colgado); s, por dónde vas. */
  update(show: boolean, s: number): void {
    const on = show && this.placed && !!this.course && this.build();
    this.setShown(on);
    if (!on) return;
    const C = this.course!;
    // subir: el cañón baja y va hacia tus pies (lo de s queda en tus manos)
    this.track.position.set(0, -C.y(s), C.h(s));
    const from = Math.floor(s / ROPE_CHUNK) - CH_BACK;
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
    for (let c = Math.max(0, from); c <= from + CH_BACK + CH_AHEAD; c++) {
      let L = this.cache.get(c);
      if (!L) {
        L = ropeDecoPuts(C, c, []);
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
