/**
 * Los sucesos de las oleadas de Combate (RepArena XR, elegidos por el usuario para que las oleadas no se parezcan): de vez en
 * cuando, una oleada trae uno, y el panel de la oleada lo dice:
 *  - **eclipse**: todo se oscurece (el cielo, la luz y la niebla); se ve a los enemigos por sus cuentas de vida y sus aros;
 *  - **lluvia de meteoritos**: caen rocas en llamas desde lo alto hacia donde estás; apártate (o párala con la mano);
 *  - **niebla cerrada**: los enemigos aparecen de golpe entre la niebla;
 *  - **lluvia de oro**: al principio de la oleada, orbes de oro flotan a tu alcance; cógelos con la mano (o la cabeza).
 * Nunca en la primera oleada ni en la del jefe, ni dos oleadas seguidas. Lógica pura, sin IWSDK (tests/unit/wave-events.test.ts);
 * lo hacen src/combat/wave-event-system.ts (meteoritos y orbes) y EnvSystem (el eclipse y la niebla).
 */
export type WaveEvent = 'eclipse' | 'meteors' | 'fog' | 'gold';
export const WAVE_EVENTS: readonly WaveEvent[] = ['eclipse', 'meteors', 'fog', 'gold'];
/** Lo que dice el panel de la oleada. */
export const WAVE_EVENT_NAME: Record<WaveEvent, string> = { eclipse: '¡Eclipse!', meteors: '¡Lluvia de meteoritos!', fog: '¡Niebla cerrada!', gold: '¡Lluvia de oro! Cógelos' };
/** La probabilidad de que una oleada (que puede) traiga uno. */
export const EVENT_P = 0.35;

/** El suceso de la oleada i (desde 0), o '' si ninguno. `prev`: el de la anterior; `can`: los que valen para el ejercicio. */
export function pickWaveEvent(i: number, prev: WaveEvent | '', bossWave: boolean, can: readonly WaveEvent[], rnd: () => number): WaveEvent | '' {
  if (i < 1 || bossWave || prev || !can.length || rnd() >= EVENT_P) return '';
  return can[Math.floor(rnd() * can.length)];
}
