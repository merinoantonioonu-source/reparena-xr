/**
 * Con la página a la vista (fuera de las gafas y sin «Probar en el ordenador»), el juego descansa (RepArena: su bucle no hacía
 * nada fuera de la VR y del modo de prueba). Antes seguía pintando la escena escondida y pensando a toda velocidad: en el
 * navegador de las gafas, fuera del juego, la imagen de las Quest se congelaba a ratos. Ahora, con la página a la vista, el
 * juego da un paso (piensa y pinta) cada medio segundo: lo justo para que termine de cargar y precompilar, sin cargar las gafas.
 * Lógica pura (sin IWSDK).
 */

/** Cada cuánto da un paso el juego con la página a la vista (s). */
export const IDLE_STEP = 0.5;

export interface IdleState {
  /** Cuándo dio el último paso (s). */
  last: number;
  /** ¿Da un paso en este fotograma? (lo decide `idleStep` antes de pensar; lo lee el pintado del mismo fotograma) */
  run: boolean;
}

/** ¿Piensa y pinta el juego en este fotograma? idle: la página está a la vista; now: el reloj (s). */
export function idleStep(S: IdleState, idle: boolean, now: number): boolean {
  if (!idle || now - S.last >= IDLE_STEP) {
    S.last = now;
    S.run = true;
  } else S.run = false;
  return S.run;
}
