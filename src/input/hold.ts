/**
 * Las teclas sólidas (pedido otra vez por el usuario al probar en las gafas: «el dedo sigue hundiéndose en el teclado»):
 * cuánto se aparta la mano que se ve para quedarse apoyada en el panel que toca en vez de atravesarlo. Mientras pulsa una
 * tecla, lo decide IWSDK (su «touch surface visual offset»); en el resto del panel, SolidKeysSystem (src/ui/solid-keys.ts),
 * con el mismo mecanismo de IWSDK para moverla (applyVisualOffsetWorld). Lo usan también los guantes al pintarse. Solo
 * para pintar: la pulsación es la de IWSDK, con el dedo de verdad.
 */
import { Vector3 } from 'three';
import type { Side } from './hand-model.js';

/** Lo que se aparta cada mano que se ve (en el mundo). */
export const HOLD: Record<Side, Vector3> = { left: new Vector3(), right: new Vector3() };
