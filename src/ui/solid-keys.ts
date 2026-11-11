/**
 * Las teclas sólidas (src/input/hold.ts): si una punta de los dedos de la mano que se ve pasa por detrás de la cara de un
 * panel que se pulsa con el dedo (los que llevan PokeInteractable mientras se ven: menús, resumen, pausa, muñeca…), la
 * mano entera se aparta hacia delante lo justo para quedarse apoyada en él (RepArena: teclas sólidas). Al retirarla, vuelve
 * con la de verdad en unas centésimas, sin saltos. La pulsación no cambia: es la de IWSDK, con el dedo de verdad.
 */
import { Box3, createSystem, Matrix4, PokeInteractable, Vector3, VisibilityState } from '@iwsdk/core';
import type { Entity, InstancedMesh, Object3D } from '@iwsdk/core';
import { hands, SIDES } from '../input/hand-model.js';
import { HOLD } from '../input/hold.js';

const TIPS = [4, 9, 14, 19, 24];
/** Hasta dónde detrás de la cara se aparta (más, la mano ya ha pasado al otro lado: se deja). */
const DEEP = 0.08;

interface Face {
  o: Object3D;
  box: Box3;
  t: number;
}

export class SolidKeysSystem extends createSystem({ poke: { required: [PokeInteractable] } }, {}) {
  private faces = new Map<Entity, Face>();
  private v = new Vector3();
  private n = new Vector3();
  private want = new Vector3();
  private tips: Vector3[] = [];
  private inv = new Matrix4();
  private mtx = new Matrix4();
  private bb = new Box3();
  private iw = new Vector3();
  private a = new Vector3();
  private b = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.poke.subscribe('qualify', (e) => {
        if (e.object3D) this.faces.set(e, { o: e.object3D, box: new Box3(), t: 0 });
      }),
      this.queries.poke.subscribe('disqualify', (e) => {
        this.faces.delete(e);
      }),
    );
    for (let i = 0; i < 5; i++) this.tips.push(new Vector3());
  }

  // la caja del panel en su propio marco, con lo que se ve (cambia al esconder o enseñar filas: se rehace cada medio segundo)
  private measure(F: Face): void {
    const o = F.o;
    o.updateWorldMatrix(true, true);
    this.inv.copy(o.matrixWorld).invert();
    F.box.makeEmpty();
    o.traverseVisible((c) => {
      const m = c as InstancedMesh, g = m.geometry;
      if (!m.isMesh || !g) return;
      // (UIKit pinta los fondos y las letras con copias de una pieza: la caja de todas)
      if (m.isInstancedMesh) {
        if (m.count === 0) return;
        m.computeBoundingBox();
      } else if (!g.boundingBox) g.computeBoundingBox();
      const b = m.isInstancedMesh ? m.boundingBox : g.boundingBox;
      if (!b || b.isEmpty()) return;
      this.mtx.multiplyMatrices(this.inv, c.matrixWorld);
      F.box.union(this.bb.copy(b).applyMatrix4(this.mtx));
    });
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05), inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    for (const s of SIDES) {
      const h = hands[s];
      this.want.set(0, 0, 0);
      let best = 0;
      if (inXR && h.ok && this.faces.size) {
        // las puntas de la mano (con mandos como manos, la punta del índice que calcula el juego)
        let n = 0;
        if (h.isHand) {
          for (const j of TIPS) if (h.J[j].ok) this.tips[n++].copy(h.J[j].p);
        } else if (h.virt && h.tipOk) this.tips[n++].copy(h.tip);
        for (const F of this.faces.values()) {
          if (!F.o.visible) continue;
          F.t -= dt;
          if (F.t <= 0) {
            F.t = 0.5;
            this.measure(F);
          }
          if (F.box.isEmpty()) continue;
          const sc = F.o.getWorldScale(this.n).x || 1;
          for (let i = 0; i < n; i++) {
            const L = F.o.worldToLocal(this.v.copy(this.tips[i]));
            const face = F.box.max.z, pen = (face - L.z) * sc;
            if (pen <= 0 || pen > DEEP || L.x < F.box.min.x || L.x > F.box.max.x || L.y < F.box.min.y || L.y > F.box.max.y) continue;
            if (pen > best) {
              best = pen;
              this.want.set(0, 0, 1).transformDirection(F.o.matrixWorld).multiplyScalar(pen);
            }
          }
        }
      }
      const H = HOLD[s], xi = this.input.xr;
      // pulsando una tecla, IWSDK ya aparta su mano (lo justo para que la punta quede en la cara de la tecla): esa manda
      const iw = inXR && h.ok ? xi.multiPointers[s].getTouchSurfaceVisualOffset(this.iw) : null;
      if (iw) {
        H.copy(iw);
        continue;
      }
      // en lo demás, lo más hundido, al momento; al soltar, vuelve en unas centésimas
      if (this.want.lengthSq() >= H.lengthSq()) H.copy(this.want);
      else H.lerp(this.want, Math.min(1, dt * 25));
      if (H.lengthSq() < 1e-8) {
        H.set(0, 0, 0);
        continue;
      }
      if (!h.ok) continue; // (sin la mano este fotograma, IWSDK no ha vuelto a poner su modelo en su sitio: no se suma)
      // y se mueve la mano de IWSDK (la desnuda, con su forma de hacerlo; la que agarra el mando, igual a mano)
      if (h.isHand) {
        const ad = xi.visualAdapters.hand[s];
        if (ad.isPrimary) ad.applyVisualOffsetWorld(H);
      } else {
        const m = xi.visualAdapters.controller[s].visual?.model, par = m?.parent;
        if (m && par) {
          par.getWorldPosition(this.a);
          this.b.copy(this.a).add(H);
          par.worldToLocal(this.a);
          par.worldToLocal(this.b);
          m.position.add(this.b.sub(this.a));
        }
      }
    }
  }
}
