/**
 * Los componentes del juego (sin sistemas ni DOM: el editor importa este módulo para su inspector).
 */
import { createComponent, Types } from '@iwsdk/core';

/** Estados de un zombi. */
export const FoeState = {
  Walk: 'walk', // va hacia el jugador, rodeando la bola, las cajas, las rocas y a los demás
  Attack: 'attack', // ha llegado: golpea
  Stagger: 'stagger', // le han dado: retrocede empujado por la física y no se dirige
  Dead: 'dead', // muerto: cuerpo suelto de física; se hunde en el suelo y desaparece
} as const;

/** Un zombi. Su cuerpo de física es una cápsula; el modelo animado va dentro, de pie. */
export const Foe = createComponent('Foe', {
  hp: { type: Types.Float32, default: 3, min: 0, step: 1, help: 'Vida que le queda (cada disparo quita su carga: ×1 a ×4)' },
  speed: { type: Types.Float32, default: 1.1, min: 0, step: 0.1, help: 'Velocidad al andar, en m/s' },
  state: { type: Types.Enum, enum: FoeState, default: FoeState.Walk },
  timer: { type: Types.Float32, default: 0 },
  side: { type: Types.Float32, default: 1, help: 'Lado por el que rodea los obstáculos (+1 o -1)' },
  radius: { type: Types.Float32, default: 0.3, help: 'Radio de su cápsula' },
});

/** Un obstáculo fijo que los zombis rodean (además de chocar con él por la física). */
export const Obstacle = createComponent('Obstacle', {
  radius: { type: Types.Float32, default: 0.6, min: 0.1, step: 0.05, help: 'Radio del círculo que rodean, en metros' },
});
