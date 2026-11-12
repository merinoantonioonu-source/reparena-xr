/**
 * Pulsar los paneles con el dedo, como en RepArena (src/60_ui.js: pokeWidgets). IWSDK solo trae su punto de toque (la punta
 * del índice con las manos; la del mando con mandos), que pulsa al acercarse a 2 cm por cualquier lado (también desde
 * detrás o por debajo del panel: al mover las manos cerca del menú se pulsaban teclas solas) y solo cuenta si se suelta en
 * menos de 0,8 s sobre la misma tecla. Su pulsación con el dedo se apaga (la del rayo sigue: con la pinza del índice y el
 * pulgar) y la hace esta, sobre ese mismo punto de toque:
 *  - cada tecla, con su forma (las que escuchan la pulsación, medidas en el panel): no depende de lo que IWSDK tenga debajo;
 *  - solo pulsa el dedo que llega por delante (estaba delante de la tecla, a más de 1,5 cm, y se acerca);
 *  - pulsa al tocarla (la punta de las gafas va por dentro del dedo: a 1,5 cm de la cara, el dedo ya la toca), sin prisa por
 *    soltar, y una sola vez: para la siguiente hay que retirar el dedo 3 cm;
 *  - pegada: desde que toca, la punta que se ve se queda en el punto de la tecla que tocó hasta que el dedo sale por delante
 *    (o se va más de 7 cm de lado, `KEEP`): no se desliza por el panel;
 *  - sólida: el dedo que ha entrado por delante no atraviesa ni las teclas ni el resto del panel (la mano que se ve se queda
 *    apoyada, `HOLD`); la que llega por detrás no se mueve.
 * La mano que se ve se mueve con el mecanismo de IWSDK (applyVisualOffsetWorld); los guantes suman `HOLD`. Cada tecla atiende
 * una pulsación cada vez (`onPress`, src/ui/press.ts).
 */
import { Box3, createSystem, Matrix4, PokeInteractable, Vector3, VisibilityState } from '@iwsdk/core';
import type { Entity, InstancedMesh, Object3D } from '@iwsdk/core';
import { hands, SIDES, type Side } from '../input/hand-model.js';
import { HOLD } from '../input/hold.js';
import { haptic } from '../input/hand-system.js';

const TIPS = [4, 9, 14, 19, 24];
/** Hasta dónde detrás de la cara se apoya (más, la mano ya ha pasado al otro lado: se deja). */
const DEEP = 0.08;
/** Pulsa a 1,5 cm de la cara (la punta va por dentro del dedo); para volver a pulsar, el dedo sale 3 cm por delante. */
const TOUCH = 0.015, OUT = 0.03;
/** Lo que se perdona alrededor de cada tecla (m: la más cercana) y lo que puede irse de lado la pegada (RepArena: POKE_KEEP). */
const MARGIN = 0.015, KEEP = 0.07;

interface Key {
  o: Object3D;
  box: Box3;
}
interface Face {
  o: Object3D;
  box: Box3;
  t: number;
  keys: Key[];
  n: number;
}

interface Press {
  /** Ha entrado por delante y sigue apoyado (sólido) hasta retirarse. */
  in: boolean;
  /** Pegado a la tecla que pulsó (en `pin`). */
  on: boolean;
  /** Puede pulsar: estaba delante del panel, sobre él. */
  armed: boolean;
  face: Face | null;
  pin: Vector3;
  n: Vector3;
}

type Listening = Object3D & { _listeners?: Record<string, unknown[]>; isVisible?: { peek(): boolean } };
const mkPress = (): Press => ({ in: false, on: false, armed: false, face: null, pin: new Vector3(), n: new Vector3() });

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
  private L = new Vector3();
  private P: Record<Side, Press> = { left: mkPress(), right: mkPress() };
  private click = { type: 'click', stopPropagation: (): void => {} };

  private add(e: Entity): void {
    if (e.object3D) this.faces.set(e, { o: e.object3D, box: new Box3(), t: 0, keys: [], n: 0 });
  }

  init(): void {
    this.cleanupFuncs.push(
      this.queries.poke.subscribe('qualify', (e) => this.add(e)),
      this.queries.poke.subscribe('disqualify', (e) => {
        this.faces.delete(e);
      }),
    );
    // (los que ya se pulsaban antes de arrancar este sistema, como el menú principal)
    for (const e of this.queries.poke.entities) this.add(e);
    for (let i = 0; i < 5; i++) this.tips.push(new Vector3());
  }

  // la caja de un objeto en el marco del panel
  private boxOf(o: Object3D, out: Box3): boolean {
    const m = o as InstancedMesh, g = m.geometry;
    if (!m.isMesh || !g) return false;
    // (UIKit pinta los fondos y las letras con copias de una pieza: la caja de todas)
    if (m.isInstancedMesh) {
      if (m.count === 0) return false;
      m.computeBoundingBox();
    } else if (!g.boundingBox) g.computeBoundingBox();
    const b = m.isInstancedMesh ? m.boundingBox : g.boundingBox;
    if (!b || b.isEmpty()) return false;
    this.mtx.multiplyMatrices(this.inv, o.matrixWorld);
    out.copy(b).applyMatrix4(this.mtx);
    return true;
  }

  // el panel y sus teclas (las que escuchan la pulsación), en su propio marco y con lo que se ve; cambian al esconder o
  // enseñar filas: se rehacen cada medio segundo
  private measure(F: Face): void {
    const o = F.o;
    o.updateWorldMatrix(true, true);
    this.inv.copy(o.matrixWorld).invert();
    F.box.makeEmpty();
    F.n = 0;
    o.traverseVisible((c) => {
      if (this.boxOf(c, this.bb)) F.box.union(this.bb);
    });
    // las teclas: UIKit las pinta con copias (sus elementos están «invisibles» para Three): se mira si UIKit las enseña
    o.traverse((c) => {
      const l = (c as Listening)._listeners?.click;
      if (!l || !l.length || (c as Listening).isVisible?.peek() === false) return;
      const K = F.keys[F.n] ?? (F.keys[F.n] = { o: c, box: new Box3() });
      K.o = c;
      if (this.boxOf(c, K.box)) F.n++;
    });
  }

  /** ¿Dónde está p respecto al panel? Devuelve cuánto está por delante de su cara (m; negativo: detrás) o null si no está
   * sobre él; en `this.L`, p en el marco del panel; en `this.n`, hacia dónde mira la cara, y en `this.a`, el punto de la
   * cara bajo p. */
  private over(F: Face, p: Vector3): number | null {
    if (F.box.isEmpty()) return null;
    const L = F.o.worldToLocal(this.L.copy(p));
    if (L.x < F.box.min.x || L.x > F.box.max.x || L.y < F.box.min.y || L.y > F.box.max.y) return null;
    const sc = F.o.getWorldScale(this.b).x || 1, front = (L.z - F.box.max.z) * sc;
    this.n.set(0, 0, 1).transformDirection(F.o.matrixWorld);
    this.a.copy(p).addScaledVector(this.n, -front);
    return front;
  }

  // la tecla bajo el punto (en el marco del panel, en `this.L`): la que lo tiene dentro o, si no, la más cercana a menos de
  // MARGIN (la punta que dan las gafas no cae justo donde se ve el dedo); si una está dentro de otra, la más pequeña
  private keyAt(F: Face): Object3D | null {
    const L = this.L, m = MARGIN / (F.o.getWorldScale(this.b).x || 1);
    let best: Object3D | null = null, bd = Infinity, ba = Infinity;
    for (let i = 0; i < F.n; i++) {
      const k = F.keys[i].box, area = (k.max.x - k.min.x) * (k.max.y - k.min.y);
      const d = Math.hypot(Math.max(k.min.x - L.x, 0, L.x - k.max.x), Math.max(k.min.y - L.y, 0, L.y - k.max.y));
      if (d > m) continue;
      if (d < bd - 1e-6 || (d <= bd + 1e-6 && area < ba)) {
        bd = d;
        ba = area;
        best = F.keys[i].o;
      }
    }
    return best;
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
      const h = hands[s], S = this.P[s];
      // (la pulsación de IWSDK con el dedo, fuera: pulsaba también desde detrás; la del rayo, con la pinza, sigue)
      (xi.multiPointers[s].getPointer('touch').options as { clickThresholdMs?: number }).clickThresholdMs = -1;
      this.want.set(0, 0, 0);
      const real = inXR && h.ok;
      if (real) xi.xrOrigin.indexTipSpaces[s].getWorldPosition(this.tip);
      // el panel bajo el punto de toque (el más cercano por delante)
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
      if (!F0) {
        // fuera de todo panel: suelto (y para pulsar habrá que llegar por delante)
        S.in = S.on = S.armed = false;
      } else {
        this.over(F0, this.tip);
        const wasIn = S.in && S.face === F0;
        if (f0 > OUT) S.in = S.on = false; // (retirado: libre)
        if (f0 > TOUCH) S.armed = true; // (delante: listo para pulsar)
        if (S.on) {
          // pegada: la punta que se ve, en el punto que tocó, hasta que sale por delante o se va muy de lado
          const lat = this.v.copy(this.tip).sub(S.pin).addScaledVector(S.n, -this.v.dot(S.n)).length();
          if (lat > KEEP) S.on = false;
          else this.want.copy(S.pin).sub(this.tip);
        } else if (f0 <= TOUCH && S.armed) {
          // ha llegado por delante: entra (sólido) y, si hay una tecla debajo, la pulsa una vez
          S.armed = false;
          S.in = true;
          S.face = F0;
          const key = this.keyAt(F0);
          if (key) {
            S.on = true;
            S.pin.copy(this.a).addScaledVector(this.n, TOUCH); // (la punta, donde el dedo toca la tecla)
            S.n.copy(this.n);
            this.want.copy(S.pin).sub(this.tip);
            haptic(s, 0.35, 25);
            key.dispatchEvent(this.click as never);
          }
        } else if (wasIn || S.in) {
          // sólido: lo más hundido de las puntas que se ven (solo de la mano que entró por delante)
          let n = 0;
          if (h.isHand) {
            for (const j of TIPS) if (h.J[j].ok) this.tips[n++].copy(h.J[j].p);
          } else this.tips[n++].copy(this.tip);
          let best = 0;
          for (let i = 0; i < n; i++) {
            const f = this.over(F0, this.tips[i]);
            if (f === null || f >= TOUCH || f < -DEEP || TOUCH - f <= best) continue;
            best = TOUCH - f;
            this.want.copy(this.n).multiplyScalar(best);
          }
        }
      }
      // al momento lo más hundido o la punta pegada; al soltar, vuelve en unas centésimas
      const H = HOLD[s];
      if (S.on || this.want.lengthSq() >= H.lengthSq()) H.copy(this.want);
      else H.lerp(this.want, Math.min(1, dt * 25));
      if (H.lengthSq() < 1e-8) H.set(0, 0, 0);
      if (!real || H.lengthSq() === 0) continue;
      // y se mueve la mano de IWSDK (lo que falte sobre lo que ya la movió IWSDK; la que agarra el mando, IWSDK no la mueve)
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
