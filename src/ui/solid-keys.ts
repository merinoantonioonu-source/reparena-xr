/**
 * Pulsar los paneles con el dedo, como en RepArena (src/60_ui.js: pokeWidgets; el usuario lo pidió al probar en las gafas:
 * con lo de IWSDK «el dedo atraviesa el panel y resbala por las teclas pulsadas»). IWSDK solo trae lo básico: su punto de
 * toque (la punta del índice con las manos; la punta del mando con mandos), que pulsa al acercarse a 2 cm y cuenta la
 * pulsación si se suelta en menos de 0,8 s sobre la misma tecla (las lentas no contaban y, al resbalar, se perdían), y que
 * apoya su mano en la tecla solo mientras pulsa. Aquí, sobre ese mismo punto de toque y la tecla que IWSDK tiene debajo:
 *  - la tecla se pulsa al tocarla (sin prisa por soltar) y una sola vez: para la siguiente hay que retirar el dedo;
 *  - pegada: desde que toca, la punta que se ve se queda en el punto de la tecla que tocó hasta que el dedo sale por
 *    delante (o se va más de 7 cm de lado, `KEEP`), y no se desliza por el panel;
 *  - sólida: ni las teclas ni el resto del panel se atraviesan; la mano que se ve se queda apoyada (`HOLD`);
 * La mano que se ve se mueve con el mecanismo de IWSDK (applyVisualOffsetWorld); los guantes suman `HOLD`.
 */
import { Box3, createSystem, Matrix4, PokeInteractable, Vector3, VisibilityState } from '@iwsdk/core';
import type { Entity, InstancedMesh, Object3D } from '@iwsdk/core';
import { hands, SIDES, type Side } from '../input/hand-model.js';
import { HOLD } from '../input/hold.js';
import { haptic } from '../input/hand-system.js';

const TIPS = [4, 9, 14, 19, 24];
/** Hasta dónde detrás de la cara se apoya (más, la mano ya ha pasado al otro lado: se deja). */
const DEEP = 0.08;
/** Se pulsa al llegar a 3 mm de la cara; para volver a pulsar, el dedo tiene que salir 1,5 cm por delante. */
const TOUCH = 0.003, OUT = 0.015;
/** Pegada: hasta 7 cm de lado sigue en la tecla (RepArena: POKE_KEEP). */
const KEEP = 0.07;

interface Face {
  o: Object3D;
  box: Box3;
  t: number;
}

interface Press {
  /** Pulsando una tecla (pegada en `pin`). */
  on: boolean;
  /** Hay que retirar el dedo antes de otra pulsación. */
  need: boolean;
  pin: Vector3;
  n: Vector3;
}

type Listening = Object3D & { _listeners?: Record<string, unknown[]> };

export class SolidKeysSystem extends createSystem({ poke: { required: [PokeInteractable] } }, {}) {
  private faces = new Map<Entity, Face>();
  private v = new Vector3();
  private n = new Vector3();
  private want = new Vector3();
  private tip = new Vector3();
  private tips: Vector3[] = [];
  private inv = new Matrix4();
  private mtx = new Matrix4();
  private bb = new Box3();
  private iw = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private P: Record<Side, Press> = { left: { on: false, need: false, pin: new Vector3(), n: new Vector3() }, right: { on: false, need: false, pin: new Vector3(), n: new Vector3() } };
  private click = { type: 'click', stopPropagation: (): void => {} };

  init(): void {
    this.cleanupFuncs.push(
      this.queries.poke.subscribe('qualify', (e) => {
        if (e.object3D) this.faces.set(e, { o: e.object3D, box: new Box3(), t: 0 });
      }),
      this.queries.poke.subscribe('disqualify', (e) => {
        this.faces.delete(e);
      }),
    );
    // (los que ya se pulsaban antes de arrancar este sistema, como el menú principal: sin esto, para él no eran sólidos)
    for (const e of this.queries.poke.entities) if (e.object3D) this.faces.set(e, { o: e.object3D, box: new Box3(), t: 0 });
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

  /** ¿Dónde está p respecto al panel? Devuelve cuánto está por delante de su cara (m; negativo: detrás) o null si no está
   * sobre él; en `this.n`, hacia dónde mira la cara, y en `this.a`, el punto de la cara bajo p. */
  private over(F: Face, p: Vector3): number | null {
    if (F.box.isEmpty()) return null;
    const L = F.o.worldToLocal(this.v.copy(p));
    if (L.x < F.box.min.x || L.x > F.box.max.x || L.y < F.box.min.y || L.y > F.box.max.y) return null;
    const sc = F.o.getWorldScale(this.b).x || 1, front = (L.z - F.box.max.z) * sc;
    this.n.set(0, 0, 1).transformDirection(F.o.matrixWorld);
    this.a.copy(p).addScaledVector(this.n, -front);
    return front;
  }

  // la tecla que IWSDK tiene bajo el punto de toque (la primera con quien escucha la pulsación, dentro de ese panel)
  private keyUnder(side: Side, F: Face): Listening | null {
    const it = this.input.xr.multiPointers[side].getPointer('touch').getIntersection();
    for (let o = (it?.object ?? null) as Listening | null; o && o !== F.o.parent; o = o.parent as Listening | null) {
      const l = o._listeners?.click;
      if (l && l.length) return o;
    }
    return null;
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05), inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive, xi = this.input.xr;
    for (const F of this.faces.values()) {
      F.t -= dt;
      if (F.t <= 0 && F.o.visible) {
        F.t = 0.5;
        this.measure(F);
      }
    }
    for (const s of SIDES) {
      const h = hands[s], S = this.P[s], tp = xi.multiPointers[s].getPointer('touch');
      // (la pulsación de IWSDK con el dedo, fuera: la hace esta; la del rayo sigue siendo la suya)
      (tp.options as { clickThresholdMs?: number }).clickThresholdMs = -1;
      this.want.set(0, 0, 0);
      const real = inXR && h.ok;
      // el punto de toque de IWSDK (la punta del índice; con mandos, la del mando)
      if (real) xi.xrOrigin.indexTipSpaces[s].getWorldPosition(this.tip);
      let F0: Face | null = null, f0 = Infinity;
      if (real)
        for (const F of this.faces.values()) {
          if (!F.o.visible) continue;
          const f = this.over(F, this.tip);
          if (f !== null && f > -DEEP && f < f0) {
            f0 = f;
            F0 = F;
          }
        }
      if (S.on) {
        // pegada: la punta que se ve, en el punto que tocó, hasta que el dedo sale por delante o se va muy de lado
        const front = F0 ? f0 : Infinity, lat = this.b.copy(this.tip).sub(S.pin).addScaledVector(S.n, -this.b.dot(S.n)).length();
        if (!real || front > OUT || lat > KEEP || front < -DEEP) S.on = false;
        else this.want.copy(S.pin).sub(this.tip);
      }
      if (!S.on && real) {
        if (S.need && (!F0 || f0 > OUT)) S.need = false;
        if (F0 && !S.need && f0 <= TOUCH) {
          const key = this.keyUnder(s, F0);
          if (key) {
            // pulsada: una vez, al tocarla; se queda pegada donde tocó
            this.over(F0, this.tip);
            S.on = S.need = true;
            S.pin.copy(this.a);
            S.n.copy(this.n);
            this.want.copy(S.pin).sub(this.tip);
            haptic(s, 0.35, 25);
            key.dispatchEvent(this.click as never);
          }
        }
        // sólida: lo más hundido de las puntas que se ven
        if (!S.on) {
          let n = 0;
          if (h.isHand) {
            for (const j of TIPS) if (h.J[j].ok) this.tips[n++].copy(h.J[j].p);
          } else this.tips[n++].copy(this.tip);
          let best = 0;
          for (const F of this.faces.values()) {
            if (!F.o.visible) continue;
            for (let i = 0; i < n; i++) {
              const f = this.over(F, this.tips[i]);
              if (f === null || f >= 0 || f < -DEEP || -f <= best) continue;
              best = -f;
              this.want.copy(this.n).multiplyScalar(best);
            }
          }
        }
      }
      // al momento lo más hundido o la punta pegada; al soltar, vuelve en unas centésimas
      const H = HOLD[s];
      if (S.on || this.want.lengthSq() >= H.lengthSq()) H.copy(this.want);
      else H.lerp(this.want, Math.min(1, dt * 25));
      if (H.lengthSq() < 1e-8) H.set(0, 0, 0);
      if (!real || H.lengthSq() === 0) continue;
      // y se mueve la mano de IWSDK (lo que falte sobre lo que ya la movió IWSDK al pulsar)
      // (IWSDK solo mueve su mano desnuda al pulsar; la que agarra el mando, no)
      const iw = h.isHand ? xi.multiPointers[s].getTouchSurfaceVisualOffset(this.iw) : null;
      this.a.copy(H);
      if (iw) this.a.sub(iw);
      if (h.isHand) {
        const ad = xi.visualAdapters.hand[s];
        if (ad.isPrimary) ad.applyVisualOffsetWorld(this.a);
      } else {
        const m = xi.visualAdapters.controller[s].visual?.model, par = m?.parent;
        if (m && par) {
          par.getWorldPosition(this.b);
          this.v.copy(this.b).add(this.a);
          par.worldToLocal(this.b);
          par.worldToLocal(this.v);
          m.position.add(this.v.sub(this.b));
        }
      }
    }
  }
}
