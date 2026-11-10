/**
 * Las manos y los mandos en cada fotograma, con lo que da IWSDK (corre justo detrás de su sistema de entrada).
 *  - La cabeza, las manos y los mandos los lee y los pinta IWSDK, de serie (sin el suavizado, las manos inventadas ni el
 *    seguimiento del cuerpo de RepArena: la migración es para ver si así ya van bien; docs/REGLAS.md).
 *  - Aquí se pasa a `hands` y `head` (src/input/hand-model.ts) lo que necesita el juego: la muñeca y las articulaciones de
 *    cada mano tal como las dan las gafas, el pellizco (el «select» de IWSDK), el gatillo, el agarre y el rayo de cada mando.
 *  - «Mandos como manos» (de serie): en vez del mando se ve la mano que lo agarra (la de IWSDK, controller-hand.ts: el
 *    índice se dobla con el gatillo y los demás dedos con el agarre); el mando funciona como una mano (h.virt): se apunta con
 *    él y se lanza con el gatillo.
 */
import { AnimatedController, createSystem, InputComponent, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { VisualConstructor, VisualImplementation } from '@iwsdk/core';
import { on } from '../core/values.js';
import { ControllerHandLeft, ControllerHandRight, loadControllerHands } from './controller-hand.js';
import { HJ, hands, head, SIDES, type Hand, type Side } from './hand-model.js';

const _m = new Matrix4(), _s = new Vector3();
const jointCache = new WeakMap<XRHand, XRJointSpace[]>();
const poseBuf = new Float32Array(25 * 16);

/** Vibración del mando de ese lado (con las manos desnudas, nada). Como en RepArena (src/76_sword.js: haptic). */
export function haptic(side: Side, v: number, ms: number): void {
  const h = hands[side];
  if (!h || h.isHand || !h.pad) return;
  const p = h.pad as Gamepad & { hapticActuators?: { pulse?: (v: number, ms: number) => void }[] };
  const a = p.hapticActuators?.[0], k = Math.max(0, Math.min(1, v));
  try {
    if (a?.pulse) a.pulse(k, ms);
    else void p.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: k, weakMagnitude: k });
  } catch {
    /* (sin vibración) */
  }
}

export class HandSystem extends createSystem({}, {}) {
  private padVisual: 'hand' | 'pad' | null = null;
  /** ¿Están cargados los modelos de la mano que agarra el mando? (null: cargando) */
  private padHandsReady: boolean | null = null;
  /** El giro del jugador en el mundo (las poses de WebXR van respecto a él). */
  private pq = new Quaternion();

  /** Lo que se lee de un espacio de WebXR (en el de la partida), en p y q. */
  private pose(frame: XRFrame, space: XRSpace | undefined, ref: XRReferenceSpace, p: Vector3, q: Quaternion): boolean {
    if (!space) return false;
    const pose = frame.getPose(space, ref);
    if (!pose) return false;
    const o = pose.transform.position, r = pose.transform.orientation;
    p.set(o.x, o.y, o.z).applyMatrix4(this.player.matrixWorld);
    q.set(r.x, r.y, r.z, r.w).premultiply(this.pq);
    return true;
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    // la cabeza (en el ordenador, la cámara)
    const cam = inXR ? this.player.head : this.world.camera;
    cam.getWorldPosition(head.p);
    cam.getWorldQuaternion(head.q);
    head.speed = head.speed * 0.85 + (dt > 0 ? head.p.distanceTo(head.prev) / dt : 0) * 0.15;
    head.prev.copy(head.p);
    for (const s of SIDES) {
      const h = hands[s];
      h.ok = h.tipOk = h.pinch = h.rayOk = h.trig = h.grip = h.btnMenu = h.virt = false;
      for (const J of h.J) J.ok = false;
    }
    const xrm = this.world.renderer.xr;
    const frame = inXR ? xrm.getFrame() : null, ref = inXR ? xrm.getReferenceSpace() : null;
    if (frame && ref) {
      this.player.getWorldQuaternion(this.pq);
      for (const s of SIDES) this.readSide(s, frame, ref);
    }
    for (const s of SIDES) hands[s].lostT = hands[s].ok ? 0 : hands[s].lostT + dt;
    this.padVisuals();
  }

  private readSide(s: Side, frame: XRFrame, ref: XRReferenceSpace): void {
    const src = this.input.xr.getPrimaryInputSource(s);
    if (!src) return;
    const h = hands[s];
    if (this.pose(frame, src.targetRaySpace, ref, h.rayO, h.rayQ)) {
      h.rayOk = true;
      h.rayD.set(0, 0, -1).applyQuaternion(h.rayQ);
    }
    if (src.hand) {
      h.isHand = true;
      h.pad = null;
      this.readHand(h, src.hand, frame, ref);
      h.pinch = h.trig = h.ok && this.input.xr.getSelectState(s).active; // (con las manos, pellizcar es el gatillo)
      return;
    }
    h.isHand = false;
    h.pad = src.gamepad ?? null;
    const gp = this.input.xr.gamepads[s];
    h.trig = !!gp?.getButtonPressed(InputComponent.Trigger);
    h.grip = !!gp?.getButtonPressed(InputComponent.Squeeze);
    h.btnMenu = !!gp && (gp.getButtonPressed(InputComponent.X_Button) || gp.getButtonPressed(InputComponent.Y_Button) || gp.getButtonPressed(InputComponent.A_Button) || gp.getButtonPressed(InputComponent.B_Button));
    if (this.pose(frame, src.gripSpace ?? src.targetRaySpace, ref, h.wrist, h.wristQ)) {
      h.ok = true;
      h.tip.copy(h.wrist).add(_s.set(0, -0.01, -0.075).applyQuaternion(h.wristQ)); // (la punta, un poco por delante del mando)
      h.tipOk = true;
      h.virt = on('padHands');
    }
  }

  // las 25 articulaciones, tal como las dan las gafas (sin suavizar); sin muñeca, la mano no se ve
  private readHand(h: Hand, hand: XRHand, frame: XRFrame, ref: XRReferenceSpace): void {
    let spaces = jointCache.get(hand);
    if (!spaces) {
      spaces = HJ.map((n) => hand.get(n as XRHandJoint)).filter((x): x is XRJointSpace => !!x);
      jointCache.set(hand, spaces);
    }
    if (spaces.length !== 25) return;
    let filled = false;
    try {
      filled = !!(frame as XRFrame & { fillPoses?: (s: XRSpace[], base: XRSpace, out: Float32Array) => boolean }).fillPoses?.(spaces, ref, poseBuf);
    } catch {
      filled = false;
    }
    if (filled) {
      const W = this.player.matrixWorld;
      for (let i = 0; i < 25; i++) {
        const J = h.J[i];
        _m.fromArray(poseBuf, i * 16).decompose(J.p, J.q, _s);
        J.p.applyMatrix4(W);
        J.q.premultiply(this.pq);
        J.ok = true;
      }
    } else
      for (let i = 0; i < 25; i++) {
        const jp = frame.getJointPose?.(spaces[i], ref), J = h.J[i];
        if (!jp) continue;
        const o = jp.transform.position, r = jp.transform.orientation;
        J.p.set(o.x, o.y, o.z).applyMatrix4(this.player.matrixWorld);
        J.q.set(r.x, r.y, r.z, r.w).premultiply(this.pq);
        J.ok = true;
      }
    const W = h.J[0], T = h.J[9];
    if (W.ok) {
      h.ok = true;
      h.wrist.copy(W.p);
      h.wristQ.copy(W.q);
    }
    if (T.ok) {
      h.tipOk = true;
      h.tip.copy(T.p);
    }
  }

  init(): void {
    void loadControllerHands().then((ok) => (this.padHandsReady = ok));
  }

  // «Mandos como manos»: la mano que agarra el mando (de IWSDK) o el mando (cuando están sus modelos)
  private padVisuals(): void {
    if (this.padHandsReady === null) return;
    const want = on('padHands') && this.padHandsReady ? 'hand' : 'pad';
    if (want === this.padVisual) return;
    this.padVisual = want;
    for (const s of SIDES) {
      const cls = (want === 'pad' ? AnimatedController : s === 'left' ? ControllerHandLeft : ControllerHandRight) as unknown as VisualConstructor<VisualImplementation>;
      this.input.xr.visualAdapters.controller[s].updateVisualImplementation(cls);
    }
  }
}
