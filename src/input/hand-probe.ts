/**
 * Lo que dicen las gafas de cada mano, tal cual, para la caja negra (src/core/blackbox.ts): si hay fuente de entrada, si
 * la postura de la muñeca es nueva o repetida (las gafas repiten la última que vieron cuando pierden una mano), si es
 * «calculada» (`emulatedPosition` de WebXR) y si la fuente es la mano o el mando. No cambia nada de lo que lee el juego
 * (HandSystem): solo mira. Se llama únicamente mientras graba la caja negra (ejercicios con pesas, en partida).
 */
import type { Side } from './hand-model.js';

export interface HandProbe {
  /** ¿Hay fuente de entrada de ese lado? */
  src: boolean;
  /** ¿Se ha podido leer la postura de la muñeca (o del agarre del mando)? */
  known: boolean;
  /** `emulatedPosition` de esa postura (la posición la calcula el navegador, no la ven las cámaras). */
  emu: boolean;
  /** ¿La postura es distinta de la del fotograma anterior? (si no, las gafas han repetido la misma) */
  fresh: boolean;
  /** La postura anterior, tal cual (en el espacio de WebXR), para comparar. */
  raw: Float64Array;
  has: boolean;
}

const mkProbe = (): HandProbe => ({ src: false, known: false, emu: false, fresh: false, raw: new Float64Array(3), has: false });
export const PROBE: Record<Side, HandProbe> = { left: mkProbe(), right: mkProbe() };

type Src = { hand?: { get(n: string): XRSpace | undefined } | null; gripSpace?: XRSpace; targetRaySpace: XRSpace };
type Frame = { getPose(s: XRSpace, r: XRSpace): XRPose | undefined | null; getJointPose?(s: XRSpace, r: XRSpace): XRPose | undefined | null };

/** Mira la mano (o el mando) de un lado en este fotograma. src: su fuente de entrada (o nada). */
export function probeSide(P: HandProbe, frame: Frame | null, ref: XRSpace | null, src: Src | null | undefined): void {
  P.src = !!src;
  P.known = P.emu = P.fresh = false;
  if (!frame || !ref || !src) {
    P.has = false;
    return;
  }
  let pose: XRPose | undefined | null = null;
  try {
    if (src.hand) {
      const w = src.hand.get('wrist');
      pose = w && frame.getJointPose ? frame.getJointPose(w, ref) : null;
    } else pose = frame.getPose(src.gripSpace ?? src.targetRaySpace, ref);
  } catch {
    pose = null;
  }
  if (!pose) {
    P.has = false;
    return;
  }
  const o = pose.transform.position, r = P.raw;
  P.known = true;
  P.emu = !!pose.emulatedPosition;
  P.fresh = !P.has || o.x !== r[0] || o.y !== r[1] || o.z !== r[2];
  r[0] = o.x;
  r[1] = o.y;
  r[2] = o.z;
  P.has = true;
}
