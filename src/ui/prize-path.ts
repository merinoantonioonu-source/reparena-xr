/**
 * El vuelo de los premios que salen de un cofre al abrirlo (pedido del usuario: que se vea qué contiene): cada premio sale de
 * dentro, sube flotando en vertical y, arriba, se esfuma (recibido). Salen uno tras otro (`PRIZE_GAP` s entre uno y el
 * siguiente). Lógica pura (sin IWSDK): dónde va cada uno a los `t` s de abrirse el cofre.
 */

/** Lo que tarda en salir (crece desde dentro), en subir, lo que se queda arriba y lo que tarda en esfumarse (s). */
export const PRIZE_POP = 0.3, PRIZE_RISE = 2.4, PRIZE_HOLD = 0.4, PRIZE_FADE = 0.45;
/** Lo que sube (m, desde la boca del cofre) y lo que pasa entre uno y el siguiente (s). */
export const PRIZE_UP = 1.3, PRIZE_GAP = 0.5;
/** Lo que dura cada uno, entero (s). */
export const PRIZE_LIFE = PRIZE_POP + PRIZE_RISE + PRIZE_HOLD + PRIZE_FADE;

export interface PrizePose {
  /** Lo que ha subido (m), su escala y su opacidad (0 a 1). */
  y: number;
  s: number;
  a: number;
  /** Se ve (ya ha salido y aún no se ha esfumado). */
  live: boolean;
  /** Ya está arriba, esfumándose (el fotograma en que empieza, las chispas). */
  fading: boolean;
}

const easeOut = (k: number): number => 1 - (1 - k) ** 3;
/** (flotando: arranca y llega suave, sin tirón) */
const float = (k: number): number => 0.5 - 0.5 * Math.cos(Math.PI * k);

/** El premio `i` (desde 0) a los `t` s de abrirse el cofre. */
export function prizeAt(t: number, i: number, out: PrizePose): PrizePose {
  const u = t - i * PRIZE_GAP;
  out.live = u >= 0 && u < PRIZE_LIFE;
  out.fading = false;
  if (u < 0) {
    out.y = 0;
    out.s = 0;
    out.a = 0;
  } else if (u < PRIZE_POP) {
    const k = u / PRIZE_POP;
    out.y = 0.12 * k;
    out.s = easeOut(k);
    out.a = 1;
  } else if (u < PRIZE_POP + PRIZE_RISE) {
    out.y = 0.12 + (PRIZE_UP - 0.12) * float((u - PRIZE_POP) / PRIZE_RISE);
    out.s = 1;
    out.a = 1;
  } else if (u < PRIZE_POP + PRIZE_RISE + PRIZE_HOLD) {
    out.y = PRIZE_UP;
    out.s = 1 + 0.06 * Math.sin(((u - PRIZE_POP - PRIZE_RISE) / PRIZE_HOLD) * Math.PI); // (un latido: recibido)
    out.a = 1;
  } else {
    const k = Math.min(1, (u - PRIZE_POP - PRIZE_RISE - PRIZE_HOLD) / PRIZE_FADE);
    out.y = PRIZE_UP + 0.1 * k;
    out.s = 1 + 0.5 * k;
    out.a = 1 - k;
    out.fading = true;
  }
  return out;
}
