/**
 * Las manos y los mandos en cada fotograma (corre justo detrás del sistema de entrada de IWSDK), leídos como en RepArena
 * (src/80_main.js: readXR; opción B del usuario, PR 30: con lo de serie de IWSDK las manos iban peor).
 *  - Se pasa a `hands` y `head` (src/input/hand-model.ts) lo que necesita el juego: las 25 articulaciones de cada mano tal
 *    como las dan las gafas (J.p, J.q), el pellizco (las puntas del pulgar y el índice a menos de 2 cm, como en RepArena), el
 *    gatillo, el agarre y el rayo de cada mando.
 *  - Lo de RepArena (src/input/hand-filter.ts): la mano que se pinta, suavizada y sin saltos imposibles (J.s, J.sq, tipS); y
 *    la mano perdida, que sigue su gesto un instante o la coloca el cuerpo (h.est: no se pinta ni pulsa menús). El cuerpo se
 *    pide al entrar en las gafas (`body-tracking`, con «Manos con el cuerpo»; IWSDK no tiene opción para pedirlo).
 *  - «Mandos como manos» (de serie): en vez del mando se ve la mano que lo agarra (la de IWSDK, controller-hand.ts: el
 *    índice se dobla con el gatillo y los demás dedos con el agarre); el mando funciona como una mano (h.virt): se apunta con
 *    él y se lanza con el gatillo.
 */
import { AnimatedController, createSystem, InputComponent, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { VisualConstructor, VisualImplementation } from '@iwsdk/core';
import { on } from '../core/values.js';
import { GAME } from '../core/state.js';
import { holdsWeights, oneArm } from '../core/rules.js';
import { handRescue, handSmooth, mkRescue, mkSmooth } from './hand-filter.js';
import { ControllerHandLeft, ControllerHandRight, loadControllerHands } from './controller-hand.js';
import { HJ, hands, head, SIDES, type Hand, type Side } from './hand-model.js';
import { SkinHand } from './skin-hand.js';

const _m = new Matrix4(), _s = new Vector3();
const jointCache = new WeakMap<XRHand, XRJointSpace[]>();
const poseBuf = new Float32Array(25 * 16);
const radBuf = new Float32Array(25);

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

/** Si el navegador da el cuerpo (RepArena: BODY): now, en este fotograma; seen, fotogramas con él; used, segundos con alguna
 * mano colocada por él; asked, si se pidió al entrar. Al calibrar se lee «manos y cuerpo detectados» y, al salir, la página
 * lo cuenta (#xrStatus). */
export const BODY = { asked: false, seen: 0, used: 0, now: false };

/** Pide el seguimiento del cuerpo al entrar en las gafas, con «Manos con el cuerpo» (RepArena lo pedía en requestSession;
 * IWSDK no tiene opción para él): se añade a lo que pida IWSDK. */
export function askBodyTracking(): void {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr || (xr as XRSystem & { _rxBody?: boolean })._rxBody) return;
  (xr as XRSystem & { _rxBody?: boolean })._rxBody = true;
  const orig = xr.requestSession.bind(xr);
  xr.requestSession = (mode: XRSessionMode, init?: XRSessionInit): Promise<XRSession> => {
    if (on('bodyHands')) init = { ...init, optionalFeatures: [...(init?.optionalFeatures ?? []), 'body-tracking'] };
    return orig(mode, init);
  };
}

/** Lo que el cuerpo dice de la muñeca de ese lado (RepArena: bodyWrist), en el mundo de la partida. */
type XRBody = { get?(n: string): XRSpace | undefined } & Record<string, XRSpace | undefined>;

export class HandSystem extends createSystem({}, {}) {
  /** Los filtros de RepArena para cada mano (suavizado y mano perdida). */
  private F = { left: mkSmooth(), right: mkSmooth() };
  private R = { left: mkRescue(), right: mkRescue() };
  private frame: XRFrame | null = null;
  private ref: XRReferenceSpace | null = null;
  private readonly env = {
    allowed: false,
    body: (side: Side, outP: Vector3, outQ: Quaternion): boolean => {
      if (!on('bodyHands') || !this.frame || !this.ref) return false;
      const b = (this.frame as XRFrame & { body?: XRBody }).body, n = side + '-hand-wrist';
      const sp = b ? (b[n] ?? (typeof b.get === 'function' ? b.get(n) : undefined)) : undefined;
      if (!sp) return false;
      try {
        return this.pose(this.frame, sp, this.ref, outP, outQ);
      } catch {
        return false;
      }
    },
  };
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

  update(delta: number, time: number): void {
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
      h.ok = h.tipOk = h.tipSm = h.pinch = h.rayOk = h.trig = h.grip = h.btnMenu = h.virt = false;
      for (const J of h.J) J.ok = false;
    }
    const xrm = this.world.renderer.xr;
    const frame = inXR ? xrm.getFrame() : null, ref = inXR ? xrm.getReferenceSpace() : null;
    if (frame && ref) {
      this.player.getWorldQuaternion(this.pq);
      for (const s of SIDES) this.readSide(s, frame, ref, time);
    }
    // la mano perdida (RepArena: handRescue): en la partida y fuera de los ejercicios que se hacen con las manos
    this.frame = frame;
    this.ref = ref;
    this.env.allowed = !!frame && GAME.phase === 'playing' && !holdsWeights() && !oneArm(); // (RepArena: handEx)
    const res = handRescue(hands, this.F, this.R, time, this.env);
    this.frame = null;
    BODY.now = res.body;
    if (res.body) BODY.seen++;
    BODY.used += res.usedT;
    this.bodySession(inXR);
    for (const s of SIDES) hands[s].lostT = hands[s].ok ? 0 : hands[s].lostT + dt;
    this.padVisuals();
  }

  // al entrar y salir de las gafas (RepArena: bodySessionStart y bodySessionEnd)
  private wasXR = false;
  private bodySession(inXR: boolean): void {
    if (inXR && !this.wasXR) {
      Object.assign(BODY, { asked: on('bodyHands'), seen: 0, used: 0, now: false });
      this.F = { left: mkSmooth(), right: mkSmooth() };
      this.R = { left: mkRescue(), right: mkRescue() };
    } else if (!inXR && this.wasXR) {
      for (const s of SIDES) {
        hands[s].est = null;
        hands[s].back = false;
      }
      BODY.now = false;
      const st = document.getElementById('xrStatus');
      if (BODY.asked && st)
        st.textContent = BODY.seen ? `Última sesión: el navegador dio el seguimiento del cuerpo; las manos perdidas se colocaron con él ${BODY.used ? 'durante ' + Math.max(1, Math.round(BODY.used)) + ' s' : '(no hizo falta)'}.` : 'Última sesión: el navegador no dio el seguimiento del cuerpo (las manos perdidas solo siguieron su gesto un instante).';
    }
    this.wasXR = inXR;
  }

  private readSide(s: Side, frame: XRFrame, ref: XRReferenceSpace, t: number): void {
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
      this.readHand(h, src.hand, frame, ref, t);
      const T = h.J[9], Th = h.J[4];
      h.pinch = h.trig = T.ok && Th.ok && T.p.distanceTo(Th.p) < 0.02; // (con las manos, pellizcar es el gatillo; como RepArena)
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
  private readHand(h: Hand, hand: XRHand, frame: XRFrame, ref: XRReferenceSpace, t: number): void {
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
      // (el grosor de cada articulación, para los guantes)
      try {
        if ((frame as XRFrame & { fillJointRadii?: (s: XRJointSpace[], out: Float32Array) => boolean }).fillJointRadii?.(spaces, radBuf)) for (let i = 0; i < 25; i++) if (radBuf[i] > 0) h.J[i].r = radBuf[i];
      } catch {
        /* (sin grosor: el de antes) */
      }
    } else
      for (let i = 0; i < 25; i++) {
        const jp = frame.getJointPose?.(spaces[i], ref), J = h.J[i];
        if (!jp) continue;
        const o = jp.transform.position, r = jp.transform.orientation;
        J.p.set(o.x, o.y, o.z).applyMatrix4(this.player.matrixWorld);
        J.q.set(r.x, r.y, r.z, r.w).premultiply(this.pq);
        J.ok = true;
        if (jp.radius) J.r = jp.radius;
      }
    if (h.J[0].ok) handSmooth(h, this.F[h === hands.left ? 'left' : 'right'], t); // (perdida, el filtro se queda como estaba)
    const W = h.J[0], T = h.J[9];
    if (W.ok) {
      h.ok = true;
      h.wrist.copy(W.p);
      h.wristQ.copy(W.q);
    }
    if (T.ok) {
      h.tipOk = true;
      h.tip.copy(T.p);
      h.tipS.copy(T.s); // (la punta que se ve, suavizada)
      h.tipSm = true;
    }
  }

  init(): void {
    askBodyTracking();
    void loadControllerHands().then((ok) => (this.padHandsReady = ok));
    // la mano desnuda de IWSDK, opaca (o escondida con los guantes: src/input/skin-hand.ts)
    for (const s of SIDES) this.input.xr.visualAdapters.hand[s].updateVisualImplementation(SkinHand as unknown as VisualConstructor<VisualImplementation>);
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
