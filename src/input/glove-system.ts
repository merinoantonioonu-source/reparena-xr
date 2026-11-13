/**
 * Los guantes robóticos de RepArena en las manos desnudas y, con mandos como manos, en la mano que agarra el mando
 * («Manos que se ven» → Guantes, el de serie; RepArena:
 * updateGloves, src/40_models.js). Cada fotograma se colocan con las articulaciones que dan las gafas (las de `hands`, tal
 * cual, sin suavizar: la lectura de las manos es la de IWSDK). La mano que las gafas pierden deja de verse, como la de
 * IWSDK. Las puntas de los dedos, del color que llevas (en Toques, el de los diamantes de esa mano).
 */
import { createSystem, InstancedMesh, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { BufferGeometry, Group, Material, Object3D } from '@iwsdk/core';
import { LOOK } from '../combat/fx.js';
import { settings, str } from '../core/values.js';
import { TCH_COL } from '../modes/touch/targets.js';
import { createGloveParts, createGlovePalm, type GloveParts } from '../scene-assets/glove.scene-asset.js';
import { HJ, hands, SIDES, type Joint, type Side } from './hand-model.js';
import { GLOVE_ON, HOLD } from './hold.js';

// las falanges (de una articulación a la siguiente), los nudillos, las puntas y los nudillos de la mano (RepArena: G_*)
const SEGS: [number, number][] = [[1, 2], [2, 3], [3, 4]];
const JOINTS = [1, 2, 3], TIPS = [4, 9, 14, 19, 24], KNUCK = [6, 11, 16, 21];
for (const b of [5, 10, 15, 20]) {
  SEGS.push([b + 1, b + 2], [b + 2, b + 3], [b + 3, b + 4]);
  JOINTS.push(b + 1, b + 2, b + 3);
}
// el grosor de cada articulación de la mano que agarra el mando (su modelo no lo trae: los de una mano normal)
const RADII = [0.021, 0.019, 0.015, 0.013, 0.011];
for (const k of [1, 1, 0.95, 0.85]) RADII.push(0.02 * k, 0.011 * k, 0.0095 * k, 0.0085 * k, 0.0075 * k);

interface Glove {
  seg: InstancedMesh;
  ridge: InstancedMesh;
  joint: InstancedMesh;
  tip: InstancedMesh;
  guard: InstancedMesh;
  palm: Group;
  tipMat: Material & { color: { setHex(h: number): void } };
  hex: number;
  /** Lo que lleva sin verse la mano de verdad (RepArena: g.lost): hasta 0,3 s se sigue pintando donde se la vio. */
  lost: number;
}

export class GloveSystem extends createSystem({}, {}) {
  private P!: GloveParts;
  private g!: Record<Side, Glove>;
  private m = new Matrix4();
  private p = new Vector3();
  private s = new Vector3();
  private off = new Vector3();
  private zero = new Matrix4().makeScale(0, 0, 0);
  private zeroV = new Vector3();
  private q = new Quaternion();
  /** Las articulaciones de la mano que agarra el mando (de los huesos de su modelo), por lado. */
  private pad: Record<Side, Joint[]> = { left: [], right: [] };
  private bones = new WeakMap<object, (Object3D | undefined)[]>();

  init(): void {
    this.P = createGloveParts();
    this.g = { left: this.make(), right: this.make() };
    for (const sd of SIDES) this.pad[sd] = HJ.map((_, i) => ({ p: new Vector3(), q: new Quaternion(), ok: false, r: RADII[i], s: new Vector3(), sq: new Quaternion() }));
  }

  // con mandos como manos: las articulaciones, de los huesos de la mano de IWSDK que agarra el mando (el índice se dobla
  // con el gatillo y los demás dedos con el agarre); sin ella (el mando), nada
  private padJoints(side: Side): Joint[] | null {
    const m = this.input.xr.visualAdapters.controller[side].visual?.model;
    if (!m) return null;
    let b = this.bones.get(m);
    if (!b) {
      b = HJ.map((n) => m.getObjectByName(n) ?? undefined);
      this.bones.set(m, b);
    }
    if (!b[0]) return null;
    const J = this.pad[side];
    for (let i = 0; i < 25; i++) {
      const bone = b[i];
      J[i].ok = !!bone;
      if (bone) {
        bone.getWorldPosition(J[i].p);
        bone.getWorldQuaternion(J[i].q);
      }
    }
    return J;
  }

  private make(): Glove {
    const P = this.P;
    // (cada mano, su propio color de las puntas: en Toques, una azul y otra naranja)
    const tipMat = P.tipMat.clone();
    const palm = createGlovePalm({ ...P, tipMat });
    const inst = (geo: BufferGeometry, mat: Material, n: number): InstancedMesh => {
      const m = new InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      return m;
    };
    const G: Glove = { seg: inst(P.seg, P.gun, SEGS.length), ridge: inst(P.ridge, P.steel, SEGS.length), joint: inst(P.joint, P.dark, JOINTS.length), tip: inst(P.tip, tipMat, TIPS.length), guard: inst(P.guard, P.steel, KNUCK.length), palm, tipMat, hex: -1, lost: 0 };
    G.tip.userData.noInk = true; // (las puntas brillan: sin contorno)
    palm.visible = false;
    for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) this.world.createTransformEntity(m);
    this.world.createTransformEntity(palm);
    return G;
  }

  update(delta: number): void {
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive, want = inXR && str('handLook') !== 'skin';
    for (const side of SIDES) {
      // como RepArena (updateGloves): si las gafas pierden la mano un instante, se sigue viendo donde estaba (0,3 s) en vez de
      // parpadear; la que calcula el juego al perderla (h.est) no se pinta (salía volando o delante de la cara). Con las
      // manos, la posición y el giro suavizados (J.s, J.sq: sin temblor)
      const h = hands[side], G = this.g[side], pj = want && h.virt && h.ok ? this.padJoints(side) : null, real = h.ok && !h.est;
      G.lost = real ? 0 : G.lost + delta;
      const held = h.isHand && !real && G.lost < 0.3, show = want && ((h.isHand && (real || held)) || !!pj);
      GLOVE_ON[side] = show;
      if (!show) {
        if (G.palm.visible) {
          G.palm.visible = false;
          for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) m.count = 0;
        }
        continue;
      }
      const hex = settings.mode === 'touch' ? TCH_COL[side] : LOOK.hands;
      if (hex !== G.hex) G.tipMat.color.setHex((G.hex = hex));
      // (apoyada en el panel que toca, sin atravesarlo: src/ui/solid-keys.ts; la del mando ya lleva el apartado en su modelo)
      const J = pj ?? h.J, hold = pj ? this.zeroV : HOLD[side], sm = !pj; // (sm: con la mano suavizada)
      this.held = held;
      for (let i = 0; i < SEGS.length; i++) {
        const A = J[SEGS[i][0]], B = J[SEGS[i][1]];
        if (!held && (!A.ok || !B.ok)) {
          G.seg.setMatrixAt(i, this.zero);
          G.ridge.setMatrixAt(i, this.zero);
          continue;
        }
        const r = Math.max(0.006, A.r), len = (sm ? A.s : A.p).distanceTo(sm ? B.s : B.p), q = sm ? A.sq : A.q;
        this.off.set(0, r * 0.15, 0).applyQuaternion(q);
        this.m.compose(this.p.copy(sm ? A.s : A.p).add(this.off).add(hold), q, this.s.set(r * 2.25, r * 1.9, len));
        G.seg.setMatrixAt(i, this.m);
        G.ridge.setMatrixAt(i, this.m);
      }
      this.balls(G.joint, J, JOINTS, 2.05, 0.006, hold, sm);
      this.balls(G.tip, J, TIPS, 2.1, 0.005, hold, sm);
      for (let i = 0; i < KNUCK.length; i++) {
        const A = J[KNUCK[i]];
        if (!held && !A.ok) {
          G.guard.setMatrixAt(i, this.zero);
          continue;
        }
        const r = Math.max(0.007, A.r), q = sm ? A.sq : A.q;
        this.off.set(0, r * 1.1, 0).applyQuaternion(q);
        this.m.compose(this.p.copy(sm ? A.s : A.p).add(this.off).add(hold), q, this.s.set(r * 2.6, r * 1.3, r * 2.3));
        G.guard.setMatrixAt(i, this.m);
      }
      for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) {
        m.count = m.instanceMatrix.count;
        m.instanceMatrix.needsUpdate = true;
      }
      // la palma, en la muñeca, a la medida de la mano (de la muñeca al nudillo del corazón: 9,5 cm la normal)
      const W = J[0];
      G.palm.visible = W.ok || held;
      if (G.palm.visible) {
        G.palm.position.copy(sm ? W.s : W.p).add(hold);
        G.palm.quaternion.copy(this.q.copy(sm ? W.sq : W.q));
        const size = J[11].ok || held ? (sm ? W.s.distanceTo(J[11].s) : W.p.distanceTo(J[11].p)) / 0.095 : 1;
        G.palm.scale.setScalar(Math.max(0.75, Math.min(1.3, size)));
      }
    }
  }

  // una bola en cada articulación de la lista, de su grosor × k
  /** La mano que se sigue pintando donde se la vio (en este lado, ahora). */
  private held = false;

  private balls(im: InstancedMesh, J: Joint[], ids: number[], k: number, min: number, hold: Vector3, sm: boolean): void {
    for (let i = 0; i < ids.length; i++) {
      const A = J[ids[i]];
      if (!this.held && !A.ok) {
        im.setMatrixAt(i, this.zero);
        continue;
      }
      const r = Math.max(min, A.r) * k;
      this.m.compose(this.p.copy(sm ? A.s : A.p).add(hold), sm ? A.sq : A.q, this.s.set(r, r, r));
      im.setMatrixAt(i, this.m);
    }
  }
}
