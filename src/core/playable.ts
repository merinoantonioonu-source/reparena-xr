/**
 * Qué modos y ejercicios se pueden jugar ya en RepArena XR (los demás salen en gris en los menús y se encienden con su PR):
 * RepArena los tiene todos; aquí llegan poco a poco (Combate y Arcos hasta ahora). Sin IWSDK.
 */
import { MODE_EX } from './catalog.js';

/** Los ejercicios de Combate que ya hay (de pie y, desde el PR 11, los de suelo y sentado). */
export const COMBAT_PLAY_EX = ['squat', 'lunge', 'jsquat', 'curl', 'curl2', 'twist', 'fraise', 'thruster', 'frontsq', 'swing', 'dlrow', 'dips', 'splank', 'superman', 'pushup', 'plank1', 'inchworm'];

/** Los modos que ya se pueden jugar. Cada PR de modo (15 a 18) añade el suyo. */
export const PLAY_MODES: string[] = ['combat', 'arcs'];

/** Los ejercicios que ya se pueden jugar en cada modo (los de MODE_EX del modo que ya están). */
export const PLAY_MODE_EX: Record<string, string[]> = {
  combat: COMBAT_PLAY_EX,
  arcs: ['squat'],
};

/** ¿Se puede jugar este ejercicio en este modo? */
export const playable = (mode: string, ex: string): boolean => PLAY_MODES.includes(mode) && (PLAY_MODE_EX[mode] ?? MODE_EX[mode] ?? []).includes(ex) && (MODE_EX[mode] ?? []).includes(ex);

/** ¿Se juega este ejercicio en algún modo que ya hay? */
export const playableAnywhere = (ex: string): boolean => PLAY_MODES.some((m) => playable(m, ex));

/** El ejercicio con el que se juega el modo: el elegido si vale; si no, el primero que haya (la sentadilla casi siempre). */
export const playableEx = (mode: string, ex: string): string => (playable(mode, ex) ? ex : (PLAY_MODE_EX[mode] ?? MODE_EX[mode] ?? ['squat'])[0] ?? 'squat');
