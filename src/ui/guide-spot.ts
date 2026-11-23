/**
 * Dónde va el panel de indicaciones (RepArena XR; pedido del usuario: las indicaciones de lo que hay que hacer, en un panel
 * grande y fijo, no en mensajes que no da tiempo a leer). Va donde cae la mirada natural de cada postura (docs/PLAN-
 * ERGONOMIA-Y-CUESTAS.md, apartado 4.1):
 *  - de pie, con compuertas (Combate, Toques, Arcos): encima de la compuerta del centro, grande e inclinado hacia ti, por
 *    encima de su baliza (no tapa lo que sale de ella). Con el marcador puesto en «Compuertas» ese sitio es suyo: las
 *    indicaciones van a su hueco de mensajes (null);
 *  - en la Travesía, de pie o en zancada: un letrero sobre el sendero, alto y lejos, por encima de lo que viene (y del jefe);
 *  - tumbado, en plancha o boca arriba: null (el aviso breve de la vista, que ya sale en el suelo bajo la cara o en el techo);
 *  - con la vista en las manos o en el suelo (los curls, la elevación frontal, los antebrazos, el swing y el peso muerto):
 *    null, el aviso breve, justo bajo la mirada (en el panel alto había que apartar la vista de la pesa; docs/ERGONOMIA.md);
 *  - sentado (los fondos en silla): encima de la compuerta, pero más bajo (a unos 14° sobre los ojos sentados, tapando solo
 *    el dintel y la baliza, no la boca).
 * Lógica pura (sin IWSDK).
 */

export interface GuideSpot {
  x: number;
  y: number;
  z: number;
  /** Su inclinación hacia ti (rad). */
  rx: number;
  /** Su ancho (m). */
  w: number;
}

/** El tamaño del panel (m): ancho y alto. */
export const GUIDE_W = 6, GUIDE_H = 1.4;
/** La compuerta del centro: a cuánto está (m), lo alto de su baliza y tus ojos. */
const GATE_D = 11, BEACON_TOP = 4.45, EYE = 1.6;
/** Sentado: tus ojos y lo alto de la boca de la compuerta (m; el panel, por encima). */
const SEAT_EYE = 1.1, GATE_MOUTH = 3.15;
/** Los ejercicios con la vista en la pesa o en el suelo: sus indicaciones, al aviso breve. */
export const GUIDE_TOAST_EX = ['curl', 'curl2', 'fraise', 'twist', 'swing', 'dlrow'];
/** Los que se hacen sentados. */
const SEATED_EX = ['dips'];
/** En la Travesía: a cuánto va el letrero y su altura (m), y su ancho. */
const TREK_D = 8.5, TREK_Y = 3.6, TREK_W = 3.4;

/** Dónde va con el modo `mode`, tumbado o no (`lying`), con el marcador en `board` y la compuerta del centro a `gateZ`. */
export function guideSpot(mode: string, lying: boolean, board: string, gateZ = -GATE_D, out: GuideSpot, ex = ''): GuideSpot | null {
  if (lying) return null;
  if (mode !== 'trek' && GUIDE_TOAST_EX.includes(ex)) return null;
  if (mode === 'trek') {
    out.x = 0;
    out.y = TREK_Y;
    out.z = -TREK_D;
    out.rx = Math.atan((TREK_Y - EYE) / TREK_D) * 0.8;
    out.w = TREK_W;
    return out;
  }
  if (mode !== 'combat' && mode !== 'touch' && mode !== 'arcs') return null;
  if (board === 'gate') return null;
  const seat = SEATED_EX.includes(ex), d = Math.abs(gateZ) + 0.2, y = seat ? GATE_MOUTH + GUIDE_H / 2 + 0.15 : BEACON_TOP + GUIDE_H / 2 + 0.15;
  out.x = 0;
  out.y = y;
  out.z = -d;
  out.rx = Math.atan((y - (seat ? SEAT_EYE : EYE)) / d) * 0.8;
  out.w = GUIDE_W;
  return out;
}
