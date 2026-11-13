/**
 * Las teclas sólidas (RepArena: gloveHold): cuánto se aparta la mano que se ve para quedarse apoyada en la tecla o en el panel
 * que toca en vez de atravesarlo, y pegada a la tecla que pulsó. Lo calcula la pulsación de los menús de RepArena
 * (src/ui/ra/poke.ts) y lo aplica su sistema (src/ui/ra/menu-system.ts); lo usan también los guantes al pintarse. Solo para
 * pintar: la pulsación es con el dedo de verdad.
 */
import { Vector3 } from 'three';
import type { Side } from './hand-model.js';

/** Lo que se aparta cada mano que se ve (en el mundo). */
export const HOLD: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };

/** ¿Se está pintando el guante de cada mano? (lo pone GloveSystem): mientras sí, la mano de IWSDK se esconde por dentro; si
 * el guante no se pinta, se sigue viendo la de IWSDK (nunca te quedas sin mano). */
export const GLOVE_ON: Record<Side, boolean> = { left: false, right: false };
