/**
 * Lo que la lógica pura del modo Toques necesita del juego (RepArena, src/74_touch.js: los globales `settings`, `dv`, `HL`,
 * `head`, `hands`, `state`, `arena`, `arMode`, `standHeadY`, `swordActive`, `swordCutTest`, `waveReps`, `Math.random`,
 * `performance.now`), dado explícitamente para poder probarla contra el código de RepArena sin IWSDK; y lo que devuelve
 * (los sucesos), que la partida convierte en sonidos, avisos, efectos y puntos, en el mismo orden que RepArena.
 *
 * La arena: tú en el origen, mirando a −Z (y arriba). Todo lo de aquí va en coordenadas de la arena.
 */
import type { Vector3 } from 'three';
import type { Hand, Side } from '../../input/hand-model.js';
import type { TouchTarget } from './targets.js';

export interface TouchEnv {
  /** Un ajuste numérico (RepArena: settings[k]; 0 si no lo es). */
  s(key: string): number;
  /** Un ajuste de texto (RepArena: settings[k]: `exercise`, `comboBase`, `sword`…). */
  str(key: string): string;
  /** Un ajuste con la dificultad creciente aplicada (RepArena: dv(k)). */
  dv(key: string): number;
  /** El azar (RepArena: Math.random): el mismo orden de llamadas que RepArena. */
  rnd(): number;
  /** El reloj de verdad en segundos (RepArena: perfNow): solo para encajar el pulso del ritmo. */
  now(): number;
  /** El estado de la partida (RepArena: state): 'play', 'rest' y 'paused' son los que mira. */
  state: string;
  /** La cabeza en la arena (RepArena: HL; se lee en cada paso, no se toca) y su velocidad en m/s (head.speed). */
  head: Vector3;
  headSpeed: number;
  /** Las manos tal como las da IWSDK (src/input/hand-model.ts), en el mundo. */
  hands: Record<Side, Hand>;
  /** Pasa un punto del mundo a la arena, en el sitio (RepArena: arena.worldToLocal). */
  toArena(v: Vector3): Vector3;
  /** Realidad mixta: los objetivos salen más cerca, a 4 m en vez de 6,5 (RepArena: arMode). */
  ar: boolean;
  /** Tu altura de pie medida (RepArena: lastStandY; se recorta a 1,2-2,05 como standHeadY). */
  standY: number;
  /** ¿Hay alguna espada en la mano? (RepArena: swordActive: el ajuste, en partida y con el mando). */
  swordActive(): boolean;
  /** ¿Corta alguna hoja este bloque? (RepArena: swordCutTest, del módulo de la espada). Devuelve la mano o null; sus
   * avisos («Corta en la dirección de la flecha»), con `hint` (así respetan la pausa entre avisos de este modo). */
  swordCut(t: TouchTarget, hint: (text: string) => void): Side | null;
  /** Los objetivos de la oleada i (RepArena: waveReps). */
  waveReps(i: number): number;
}

/** Lo que pasa en un paso, en orden; la partida lo aplica tal cual (entre paréntesis, lo que hacía RepArena). */
export type TouchEvent =
  /** Ha salido un objetivo nuevo (boardDirty: rehacer el marcador; y pintarlo). */
  | { type: 'spawn'; t: TouchTarget }
  /** Una indicación (say(text, '#ffd166', 1.1)). */
  | { type: 'hint'; text: string }
  /** Vibración del mando (haptic(side, v, ms)). */
  | { type: 'haptic'; side: Side; v: number; ms: number }
  /** Empieza a aguantar dentro de la ameba de plancha (SND.charge()). */
  | { type: 'charge'; t: TouchTarget }
  /** Ha llegado y espera, con ritmo (SND.tick()). */
  | { type: 'tick'; t: TouchTarget }
  /** Cuenta atrás de la plancha (say(`Aguanta ${left}`, '#ffd166', 0.6, true); SND.beep(beep)). */
  | { type: 'hold'; t: TouchTarget; left: number; beep: number }
  /**
   * Tocado (registerRep(perfect, false); stats.kills++; say(text, color, 0.8, false); si perfect, SND.perfect(); y luego lo
   * suyo: la ameba estalla —t.part 'head', sigue viva en 'burst'—, el bloque se parte —'cut': haptic(t.by, 0.7, 60) y
   * SND.swordSlice—, el pulsador del suelo —t.move 'floor'— o el diamante; en las manos, antes haptic(t.by, 0.5, 50) y en el
   * pulsador además haptic(t.by, 0.8, 70)). La posición, t.at (en la arena).
   */
  | { type: 'hit'; t: TouchTarget; perfect: boolean; text: string; color: string }
  /** Fallado: se aleja (t.mode 'pass'); con `hurt`, hurtPlayer({ silent: true }) y say(text, '#ff3b5c', 1.1). */
  | { type: 'miss'; t: TouchTarget; hurt: boolean; text: string }
  /** Se acabó: quitar lo que se ve (dispose). */
  | { type: 'gone'; t: TouchTarget };
