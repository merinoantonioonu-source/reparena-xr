/**
 * Lo que la lógica pura de los bandidos y los lobos de la Travesía necesita del juego (RepArena, src/75_trek.js: los
 * globales `state`, `HL`, `head.p`, `calibRef`, `settings`, `waveIdx`, `rankIdx()`, `TREK`, `Math.random`…), dado
 * explícitamente para poder probarla contra el código de RepArena sin IWSDK. Lo que allí eran efectos (say, cheer, SND,
 * fx, hurtPlayer, score…) aquí son sucesos (`FoeEvent`) que el que llama aplica en el mismo orden.
 *
 * Coordenadas:
 *  - los bandidos y sus piedras, en las de la parada (su grupo: RepArena, o.mesh; x a un lado, y arriba, z hacia ti);
 *  - los lobos, en las del sendero: s (los metros del sendero) y u (a un lado, + a la derecha). Para pintarlos en la
 *    arena: trekBend(s, u) y, encima, la z de tu cabeza (como RepArena: `_tkq.z + HL.z`).
 */

/** Un punto en 3D (en las coordenadas que diga cada suceso). */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Un punto del sendero: s (m), u (m a un lado) y su altura. */
export interface PathPt {
  s: number;
  u: number;
  y: number;
}

/** El sendero (lo pone el módulo del sendero): su punto y su rumbo a la distancia s, y por dónde vas y a qué velocidad. */
export interface TrekPathApi {
  P(s: number): { x: number; z: number };
  th(s: number): number;
  dist: number;
  v: number;
}

/** El estado de la partida, como RepArena (`state`): 'play', 'rest' (entre oleadas), 'end', 'paused'… */
export type TrekState = string;

export interface BanditsEnv {
  state: TrekState;
  /** Tu cabeza en la arena (RepArena: HL) y su altura en el mundo (head.p.y: para el salto). */
  head: P3;
  eyeY: number;
  /** Tu cabeza en las coordenadas de la parada (RepArena: trekLoc(o, HL.x, HL.z)). */
  loc: { x: number; z: number };
  /** La altura de tus ojos de pie, al calibrar (calibRef), y la «Altura del salto» (cm, settings.jumpHeight). */
  calibRef: number;
  jumpHeight: number;
  /** La oleada (el tramo, desde 0: waveIdx) y el rango (rankIdx()). */
  wave: number;
  rank: number;
  /** Este fotograma ha habido una zancada que empuja (RepArena: TREK.lunge, de trekLungeStep). */
  lunge: boolean;
  /** El azar (RepArena: Math.random). */
  rnd(): number;
  /** Lo que dura cada animación del bandido (s), si su modelo está cargado; null: sin modelo (RepArena: sin b.mix). */
  clips: Readonly<Record<string, number>> | null;
  /** Dónde tiene la mano derecha (hand_r) en las coordenadas de la parada, si se sabe (la piedra sale de ahí). */
  hand?(b: { x: number; z: number }): P3 | null;
}

export interface WolvesEnv {
  state: TrekState;
  /** El sendero (de él se usa dist: los metros que llevas). */
  path: TrekPathApi;
  /** Parado ante un reto (RepArena: TREK.halt). */
  halted: boolean;
  /** Tu cabeza a un lado del sendero (RepArena: HL.x). */
  headU: number;
  lunge: boolean;
  wave: number;
  rank: number;
  /** «Velocidad de avance» (%, settings.trekSpeed). */
  trekSpeed: number;
  rnd(): number;
}

/** Los sonidos (RepArena: SND.*). */
export type FoeSound =
  | 'banditThrow'
  | 'banditHurt'
  | 'banditDeath'
  | 'whoosh'
  | 'shock'
  | 'metalHit'
  | 'step'
  | 'victory'
  | 'wolfHowl'
  | 'wolfGrowl'
  | 'wolfBite';

/** Los efectos (RepArena: fx.*), uno por grupo de llamadas:
 *  - shove: la onda del empujón al bandido (estela desde tu cabeza, brillo y polvo a sus pies);
 *  - bounce: el polvo de la piedra baja al botar;
 *  - sparks: las chispas del bandido que se duele;
 *  - dust: el polvo de la piedra que te da;
 *  - wolfShove: el brillo y el polvo del lobo empujado;
 *  - wolfDust: el polvo que levanta el lobo al correr (cada 0,15 s; RepArena solo lo hace con su modelo). */
export type FoeFx = 'shove' | 'bounce' | 'sparks' | 'dust' | 'wolfShove' | 'wolfDust';

/** Lo que pasa (en orden): el que llama lo aplica tal cual. `At`: P3 (en la parada) para los bandidos, PathPt para los lobos. */
export type FoeEvent<At> =
  | { k: 'say'; text: string; col: string; dur: number }
  | { k: 'cheer'; text: string; col: string; dur: number }
  | { k: 'snd'; snd: FoeSound; at: At | null; vol?: number }
  | { k: 'fx'; fx: FoeFx; at: At }
  | { k: 'score'; n: number }
  /** El marcador ha cambiado (boardDirty). */
  | { k: 'board' }
  /** Vibración en los dos mandos (hapticBoth). */
  | { k: 'haptic'; s: number; ms: number }
  /** Te quita una vida, sin su sonido (hurtPlayer({ silent: true })). */
  | { k: 'hurt' }
  /** El golpe de cómic del que cae (comicKill) y el de cuando te dan (comicHit, en tu cabeza). */
  | { k: 'kill'; at: At }
  | { k: 'hit' }
  /** Acaba la parada de los bandidos (RepArena: trekHaltEnd): el que llama hace lo común de las paradas (TREK.halt = null,
   * apartarla si no se ganó…); lo de los bandidos (los que se van, el premio) ya va en los sucesos. */
  | { k: 'end'; won: boolean }
  /** Empieza o acaba la persecución de los lobos (sus figuras y sus flechas, a poner o quitar). */
  | { k: 'chaseStart' }
  | { k: 'chaseEnd' };

export type BanditEvent = FoeEvent<P3>;
export type WolfEvent = FoeEvent<PathPt>;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const smooth = (t: number): number => t * t * (3 - 2 * t);
