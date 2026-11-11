/**
 * Los guantes robóticos de RepArena en las manos desnudas («Manos que se ven» → Guantes, el de serie; RepArena:
 * updateGloves, src/40_models.js). Cada fotograma se colocan con las articulaciones que dan las gafas (las de `hands`, tal
 * cual, sin suavizar: la lectura de las manos es la de IWSDK). La mano que las gafas pierden deja de verse, como la de
 * IWSDK. Las puntas de los dedos, del color que llevas (en Toques, el de los diamantes de esa mano).
 */
import { createSystem, InstancedMesh, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { BufferGeometry, Group, Material } from '@iwsdk/core';
import { LOOK } from '../combat/fx.js';
import { settings, str } from '../core/values.js';
import { TCH_COL } from '../modes/touch/targets.js';
import { createGloveParts, createGlovePalm, type GloveParts } from '../scene-assets/glove.scene-asset.js';
import { hands, SIDES, type Joint, type Side } from './hand-model.js';
import { HOLD } from './hold.js';

// las falanges (de una articulación a la siguiente), los nudillos, las puntas y los nudillos de la mano (RepArena: G_*)
const SEGS: [number, number][] = [[1, 2], [2, 3], [3, 4]];
const JOINTS = [1, 2, 3], TIPS = [4, 9, 14, 19, 24], KNUCK = [6, 11, 16, 21];
for (const b of [5, 10, 15, 20]) {
  SEGS.push([b + 1, b + 2], [b + 2, b + 3], [b + 3, b + 4]);
  JOINTS.push(b + 1, b + 2, b + 3);
}

interface Glove {
  seg: InstancedMesh;
  ridge: InstancedMesh;
  joint: InstancedMesh;
  tip: InstancedMesh;
  guard: InstancedMesh;
  palm: Group;
  tipMat: Material & { color: { setHex(h: number): void } };
  hex: number;
}

export class GloveSystem extends createSystem({}, {}) {
  private P!: GloveParts;
  private g!: Record<Side, Glove>;
  private m = new Matrix4();
  private p = new Vector3();
  private s = new Vector3();
  private off = new Vector3();
  private zero = new Matrix4().makeScale(0, 0, 0);
  private q = new Quaternion();

  init(): void {
    this.P = createGloveParts();
    this.g = { left: this.make(), right: this.make() };
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
    const G: Glove = { seg: inst(P.seg, P.gun, SEGS.length), ridge: inst(P.ridge, P.steel, SEGS.length), joint: inst(P.joint, P.dark, JOINTS.length), tip: inst(P.tip, tipMat, TIPS.length), guard: inst(P.guard, P.steel, KNUCK.length), palm, tipMat, hex: -1 };
    G.tip.userData.noInk = true; // (las puntas brillan: sin contorno)
    palm.visible = false;
    for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) this.world.createTransformEntity(m);
    this.world.createTransformEntity(palm);
    return G;
  }

  update(): void {
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive, want = inXR && str('handLook') !== 'skin';
    for (const side of SIDES) {
      const h = hands[side], G = this.g[side], show = want && h.isHand && h.ok;
      if (!show) {
        if (G.palm.visible) {
          G.palm.visible = false;
          for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) m.count = 0;
        }
        continue;
      }
      const hex = settings.mode === 'touch' ? TCH_COL[side] : LOOK.hands;
      if (hex !== G.hex) G.tipMat.color.setHex((G.hex = hex));
      const J = h.J, hold = HOLD[side]; // (apoyada en el panel que toca, sin atravesarlo: src/ui/solid-keys.ts)
      for (let i = 0; i < SEGS.length; i++) {
        const A = J[SEGS[i][0]], B = J[SEGS[i][1]];
        if (!A.ok || !B.ok) {
          G.seg.setMatrixAt(i, this.zero);
          G.ridge.setMatrixAt(i, this.zero);
          continue;
        }
        const r = Math.max(0.006, A.r), len = A.p.distanceTo(B.p);
        this.off.set(0, r * 0.15, 0).applyQuaternion(A.q);
        this.m.compose(this.p.copy(A.p).add(this.off).add(hold), A.q, this.s.set(r * 2.25, r * 1.9, len));
        G.seg.setMatrixAt(i, this.m);
        G.ridge.setMatrixAt(i, this.m);
      }
      this.balls(G.joint, J, JOINTS, 2.05, 0.006, hold);
      this.balls(G.tip, J, TIPS, 2.1, 0.005, hold);
      for (let i = 0; i < KNUCK.length; i++) {
        const A = J[KNUCK[i]];
        if (!A.ok) {
          G.guard.setMatrixAt(i, this.zero);
          continue;
        }
        const r = Math.max(0.007, A.r);
        this.off.set(0, r * 1.1, 0).applyQuaternion(A.q);
        this.m.compose(this.p.copy(A.p).add(this.off).add(hold), A.q, this.s.set(r * 2.6, r * 1.3, r * 2.3));
        G.guard.setMatrixAt(i, this.m);
      }
      for (const m of [G.seg, G.ridge, G.joint, G.tip, G.guard]) {
        m.count = m.instanceMatrix.count;
        m.instanceMatrix.needsUpdate = true;
      }
      // la palma, en la muñeca, a la medida de la mano (de la muñeca al nudillo del corazón: 9,5 cm la normal)
      const W = J[0];
      G.palm.visible = W.ok;
      if (W.ok) {
        G.palm.position.copy(W.p).add(hold);
        G.palm.quaternion.copy(this.q.copy(W.q));
        const size = J[11].ok ? W.p.distanceTo(J[11].p) / 0.095 : 1;
        G.palm.scale.setScalar(Math.max(0.75, Math.min(1.3, size)));
      }
    }
  }

  // una bola en cada articulación de la lista, de su grosor × k
  private balls(im: InstancedMesh, J: Joint[], ids: number[], k: number, min: number, hold: Vector3): void {
    for (let i = 0; i < ids.length; i++) {
      const A = J[ids[i]];
      if (!A.ok) {
        im.setMatrixAt(i, this.zero);
        continue;
      }
      const r = Math.max(min, A.r) * k;
      this.m.compose(this.p.copy(A.p).add(hold), A.q, this.s.set(r, r, r));
      im.setMatrixAt(i, this.m);
    }
  }
}
