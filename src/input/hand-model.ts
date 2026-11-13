/**
 * Lo que el juego sabe de cada mano en cada fotograma, como `hands` de RepArena: si se ve, si es la mano desnuda o un
 * mando, dónde está la muñeca, sus articulaciones, el pellizco, el gatillo y el agarre, y el rayo de apuntar. Lo llena el
 * sistema de las manos (hand-system.ts) con lo que da IWSDK, tal cual (IWSDK pinta las manos y los mandos a su manera: sin
 * el suavizado ni las manos inventadas de RepArena; ver docs/REGLAS.md).
 *
 * Sin IWSDK: las clases de cálculo (Vector3, Quaternion) vienen de 'three', para poder probar en el ordenador lo que usa
 * este modelo (es el mismo paquete que reexporta @iwsdk/core, y estas clases no guardan nada compartido).
 */
import { Quaternion, Vector3 } from 'three';

/** Las 25 articulaciones de la mano en WebXR, en su orden (0: muñeca; 4: punta del pulgar; 9: punta del índice). */
export const HJ: string[] = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
for (const f of ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']) HJ.push(f + '-metacarpal', f + '-phalanx-proximal', f + '-phalanx-intermediate', f + '-phalanx-distal', f + '-tip');

export interface Joint {
  p: Vector3;
  q: Quaternion;
  ok: boolean;
  /** Su grosor (el radio que dan las gafas; para pintar los guantes). */
  r: number;
  /** La posición y el giro suavizados, para pintarla (RepArena: J.s, J.sq; src/input/hand-filter.ts). El juego usa p y q. */
  s: Vector3;
  sq: Quaternion;
}

export interface Hand {
  /** ¿Se sabe dónde está la mano (o el mando) en este fotograma? */
  ok: boolean;
  /** Mano desnuda (seguimiento de manos) o mando. */
  isHand: boolean;
  /** Las articulaciones (solo con las manos desnudas). */
  J: Joint[];
  /** La muñeca (con mandos, el agarre del mando). */
  wrist: Vector3;
  wristQ: Quaternion;
  /** La punta del índice (con mandos, un poco por delante del mando). */
  tip: Vector3;
  tipOk: boolean;
  /** La punta del índice que se ve (suavizada; RepArena: tipS, tipSm). */
  tipS: Vector3;
  tipSm: boolean;
  /** La mano que calcula el juego al perderla (RepArena: h.est): 'pred', sigue su gesto; 'body', la coloca el cuerpo. No se
   * pinta ni pulsa menús. back: el fotograma en que las cámaras la vuelven a ver tras una colocada por el cuerpo. */
  est: 'pred' | 'body' | null;
  back: boolean;
  /** Pellizco (el de IWSDK: el «select» de la mano); con las manos, pellizcar es el gatillo. */
  pinch: boolean;
  trig: boolean;
  /** Mandos: el agarre y el botón de menú (X/Y o A/B). */
  grip: boolean;
  btnMenu: boolean;
  /** El rayo de apuntar (de dónde sale, su giro y su dirección). */
  rayOk: boolean;
  rayO: Vector3;
  rayQ: Quaternion;
  rayD: Vector3;
  /** Mando que se ve (y funciona) como una mano: «Mandos como manos». */
  virt: boolean;
  /** El mando (botones y vibración), si es un mando. */
  pad: Gamepad | null;
  /** Segundos sin verse (0 si se ve). */
  lostT: number;
}

const mkJoint = (): Joint => ({ p: new Vector3(), q: new Quaternion(), ok: false, r: 0.009, s: new Vector3(), sq: new Quaternion() });

export function mkHand(): Hand {
  return {
    ok: false,
    isHand: false,
    J: Array.from({ length: 25 }, mkJoint),
    wrist: new Vector3(),
    wristQ: new Quaternion(),
    tip: new Vector3(),
    tipOk: false,
    tipS: new Vector3(),
    tipSm: false,
    est: null,
    back: false,
    pinch: false,
    trig: false,
    grip: false,
    btnMenu: false,
    rayOk: false,
    rayO: new Vector3(),
    rayQ: new Quaternion(),
    rayD: new Vector3(0, 0, -1),
    virt: false,
    pad: null,
    lostT: 0,
  };
}

export type Side = 'left' | 'right';
export const SIDES: Side[] = ['left', 'right'];

/** Las dos manos (las llena el sistema de las manos en cada fotograma). */
export const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };

/** La cabeza: dónde está, su giro, dónde estaba el fotograma anterior y lo deprisa que se mueve (m/s, suavizada). */
export const head = { p: new Vector3(0, 1.6, 0), q: new Quaternion(), prev: new Vector3(0, 1.6, 0), speed: 0 };

/** Hacia dónde mira la cabeza (−Z de su giro). */
export const headFwd = (out: Vector3): Vector3 => out.set(0, 0, -1).applyQuaternion(head.q);

const FIST_TIPS = [9, 14, 19, 24];

/** El puño cerrado (RepArena, src/77_guard.js: gFist): con mandos como manos, gatillo y agarre a la vez; con las manos,
 * las puntas de los dedos (índice, corazón, anular y meñique) a menos de 10 cm de la muñeca. */
export function isFist(h: Hand): boolean {
  if (h.virt) return h.trig && h.grip;
  if (!h.isHand) return false;
  let n = 0, s = 0;
  for (const j of FIST_TIPS) {
    const J = h.J[j];
    if (J.ok) {
      s += J.p.distanceTo(h.wrist);
      n++;
    }
  }
  return n >= 3 && s / n < 0.1;
}
