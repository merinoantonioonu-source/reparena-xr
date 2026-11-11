/**
 * Lo que la lógica pura de los Arcos necesita del juego (RepArena: los globales `settings`, `dv`, `HL`, `calibRef`,
 * `arenaDepth`, `JUMP`, `Math.random`…), dado explícitamente para poder probarla contra el código de RepArena sin IWSDK.
 * La arena es el mundo: x a un lado, y arriba, z hacia ti (los obstáculos salen en −z y avanzan hacia +z hasta pasar por
 * donde está tu cabeza).
 */
export interface ArcsEnv {
  /** Un ajuste numérico (RepArena: settings[k]). */
  s(key: string): number;
  /** Un ajuste con la dificultad creciente aplicada (RepArena: dv(k)). */
  dv(key: string): number;
  /** El azar (RepArena: Math.random). */
  rnd(): number;
  /** Dónde tienes la cabeza ahora (RepArena: HL: en la arena) y su altura de pie al calibrar (calibRef). */
  head: { x: number; y: number; z: number };
  calibRef: number;
  /** El fondo de la arena: de dónde salen los obstáculos (RepArena: arenaDepth()). */
  arenaDepth: number;
  /** Lo que lleva el último salto: segundos desde que empezó (RepArena: JUMP.fastT; −1 si no hay). */
  jumpFastT: number;
  /** El pulso (s) del ritmo si hay y «Arcos al compás» está activo; 0 si no (la música llega con el PR 22). */
  beatP: number;
  /** El reloj de la partida en segundos (RepArena: beatNow/stats.time donde haga falta). */
  time: number;
}

/** La altura de la coronilla sobre los ojos (RepArena: HEAD_TOP). */
export const HEAD_TOP = 0.1;
