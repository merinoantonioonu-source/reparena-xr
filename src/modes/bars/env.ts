/**
 * Lo que la lógica pura del modo Barras necesita del juego (RepArena: los globales `settings`, `dv`, `head`, `hands`,
 * `state`, `arena`, `EQ`, `preview`, `Math.random`…), dado explícitamente para poder probarla contra el código de RepArena
 * sin IWSDK. Lo que en RepArena eran efectos (sonidos, avisos, puntos, golpes al jugador) sale como sucesos (`BarEvent`)
 * que la partida aplica en el mismo orden en que llegan.
 *
 * La arena (RepArena: `arena`, un grupo con su sitio y su giro en el mundo) es donde viven los objetivos: sus
 * coordenadas se pasan al mundo girando `ry` alrededor de la vertical y sumando (x, 0, z), como un Object3D de Three.
 */
import { Vector3, type Quaternion } from 'three';
import type { Hand, Side } from '../../input/hand-model.js';
import type { Equip } from './equip.js';

/** La arena: su sitio en el suelo y su giro (RepArena: arena.position y arena.rotation.y). */
export interface ArenaPose {
  x: number;
  z: number;
  ry: number;
}

/** Una compuerta de la que salen las avispas que no llegan por un lado (RepArena: liveGates(): x, z, giro y tamaño). */
export interface BarGate {
  x: number;
  z: number;
  ry: number;
  scale: number;
}

export interface BarsEnv {
  /** Un ajuste numérico (RepArena: settings[k]: doorH, pullRange, fallMargin, barWait…). */
  s(key: string): number;
  /** Un ajuste de texto (RepArena: settings[k]: exercise, dipBars, barTarget). */
  str(key: string): string;
  /** Un ajuste con la dificultad creciente (RepArena: dv(k): barArrive). */
  dv(key: string): number;
  /** El azar (RepArena: Math.random). */
  rnd(): number;
  /** La cabeza en el mundo (RepArena: head: p, q y speed, la velocidad suavizada en m/s). */
  head: { p: Vector3; q: Quaternion; speed: number };
  /** Las manos (src/input/hand-model.ts). */
  hands: Record<Side, Hand>;
  /** El estado de la partida (RepArena: state: 'mount', 'play', 'rest', 'end'…). */
  state: string;
  /** La arena (la mueve `arenaFromHead`). */
  arena: ArenaPose;
  /** Los aparatos colocados y si es la prueba en el ordenador (RepArena: EQ y preview: eqPose elige EQ.pv o EQ.xr). */
  eq: Equip;
  preview: boolean;
  /** Las compuertas abiertas (RepArena: liveGates()). */
  gates: BarGate[];
  /** Coloca la arena delante de la cabeza (RepArena: arenaFromHead) y deja `arena` al día: se llama al colgarse la
   * primera vez en la ronda. */
  arenaFromHead(): void;
  /** Las repeticiones o segundos de la oleada i en una sesión (RepArena: sesWave(i)); 0 fuera de ellas. */
  sesWave(i: number): number;
  /** Cuántas oleadas tiene la ronda (RepArena: nWaves()); 0, sin fin. */
  nWaves(): number;
}

/** Lo que además necesita colocar los aparatos: cambiar ajustes y guardar (RepArena: setSetting y store). */
export interface PlaceEnv extends Pick<BarsEnv, 's' | 'str' | 'head' | 'hands' | 'eq' | 'preview'> {
  setSetting(key: string, v: number | string): void;
  store(k: string, v?: unknown): unknown;
}

export const UP = new Vector3(0, 1, 0);
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const wrapAng = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const rand = (env: BarsEnv, a: number, b: number): number => a + env.rnd() * (b - a);

/** Del mundo a la arena (RepArena: arena.worldToLocal). */
export function toArena(a: ArenaPose, p: Vector3, out: Vector3): Vector3 {
  const dx = p.x - a.x, dz = p.z - a.z, c = Math.cos(a.ry), s = Math.sin(a.ry);
  return out.set(dx * c - dz * s, p.y, dx * s + dz * c);
}
/** De la arena al mundo (RepArena: arena.localToWorld). */
export function toWorld(a: ArenaPose, p: Vector3, out: Vector3): Vector3 {
  const c = Math.cos(a.ry), s = Math.sin(a.ry), x = p.x, z = p.z;
  return out.set(a.x + x * c + z * s, p.y, a.z - x * s + z * c);
}

/** Hacia dónde miras, en horizontal (RepArena: fwdH). */
export function fwdH(q: Quaternion, out: Vector3): Vector3 {
  out.set(0, 0, -1).applyQuaternion(q);
  out.y = 0;
  if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
  return out.normalize();
}
const _yf = new Vector3();
/** El giro horizontal de la mirada (RepArena: yawOf). */
export function yawOf(q: Quaternion): number {
  _yf.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-_yf.x, -_yf.z);
}

/** Lo que hay que hacer en el juego, en orden (RepArena: llamadas a SND, fx, cheer, say, registerRep, hurtPlayer…). */
export type BarEvent =
  /** Un sonido de SND con sus argumentos (charge, beep, combo, perfect, power, pop, metalHit, explosion, squish, hiss,
   * whoosh, miss, partial). */
  | { type: 'snd'; name: string; args: unknown[] }
  /** Un efecto de fx en el mundo con el resto de sus argumentos (glow, trail, droplets, sparks, ichor, explosion). */
  | { type: 'fx'; name: string; at: Vector3; args: unknown[] }
  /** Celebración en el marcador (RepArena: cheer). */
  | { type: 'cheer'; text: string; col: string; dur: number }
  /** Aviso breve (RepArena: say(text, col, dur, toast)). */
  | { type: 'say'; text: string; col: string; dur: number; toast: boolean }
  /** Una repetición: registerRep(perfect, false) y después, si el combo no es múltiplo de 10, el aviso: al reventarlo
   * con la cabeza (`contact`), «¡Bien!» (say blanco 0,7 s sin toast); al subir, «¡PERFECTA!» (cheer #3cf0c6 1 s),
   * «Más controlado» (say blanco 1 s) si fue deprisa o «¡Bien!». (El SND.perfect llega aparte, detrás.) */
  | { type: 'rep'; perfect: boolean; fast: boolean; contact: boolean }
  /** Colgado: un segundo más (score += 10; combo++; bestCombo). */
  | { type: 'hangSec'; s: number; left: number }
  /** Subida a medias (RepArena: onPartial). */
  | { type: 'partial'; text: string }
  /** Te soltaste (RepArena: barFall, desde stats.falls++): con el remolino, vortexEngulf y nada más; si no, en la
   * barra de puerta poolGrab(at) y en las paralelas SND.partial + fx.glow(at, [1, 0.5, 0.3], 0.5, 0.2);
   * hurtPlayer({ silent: true }); si la ronda no ha acabado, cheer(text, col, 1.8), warnFloor(`${text} (${reason})`,
   * '#ff8a3d') y volver a colgarse: BarDetector.toMount(0, true) con state = 'mount'. */
  | { type: 'fall'; reason: string; door: boolean; at: Vector3; text: string; col: string }
  /** Colgado (RepArena: barMounted, tras su SND.charge): se esconde el aviso del centro; en el remo, el marcador sobre
   * la cara (placeRowBoard(true)); si `resume`, state = 'play' y cheer('¡Sigue!', '#3cf0c6', 1.2); si no, startWave(wave). */
  | { type: 'mounted'; resume: boolean; wave: number; row: boolean }
  /** Un objetivo pica o choca contra ti (RepArena: hurtPlayer(target)). */
  | { type: 'hurt'; target: unknown }
  /** Un objetivo reventado (RepArena: onKilled(target)). */
  | { type: 'killed'; target: unknown }
  /** Se escapó uno: el combo a 0 (RepArena: timeout). */
  | { type: 'comboReset' }
  /** Se abre una compuerta para que salga una avispa (RepArena: g.openT = …). */
  | { type: 'gate'; index: number; openT: number };
