/**
 * Los menús, sin IWSDK: qué se enseña de cada ajuste del esquema (su nombre, su valor, sus opciones) y qué pasa al tocar
 * − / + o una opción, las pestañas de Ajustes, la ficha de la ronda y los ajustes «del ojo» del menú principal. Como en
 * RepArena (src/70_game.js: lobbyMenu, lobbyDiffRows, summaryText, settingsRows; src/60_ui.js: los campos), sin dibujar:
 * la página los usa para sus campos (los menús de las gafas son los de RepArena: src/ui/ra/). Se prueba en tests/unit/fields.test.ts.
 */
import { FIELD, SCHEMA, type FieldDef } from '../core/schema.js';
import { devEye, fieldShown, fieldVisible, fmtVal, hangSecs, menuFull, nLives, nWaves, rankName, setSetting, speedKey, waveReps } from '../core/settings.js';
import { EX_NAMES, EX_SHORT, GROUP_NAMES, GROUP_TAB, OWN_MENU } from '../core/catalog.js';
import { isBars } from '../core/rules.js';
import { num, settings, str } from '../core/values.js';
import { STAND_EX } from '../exercise/standing.js';
import { playableEx } from '../core/playable.js';

/** El ejercicio que se juega: el elegido, si es de pie y en Combate (lo único que hay por ahora); si no, la sentadilla. */
/** Los ejercicios que ya se pueden jugar aquí: los de pie y, desde el PR 11, los fondos, la plancha lateral, el superman,
 * las flexiones, la plancha con un brazo y el inchworm. */
export const PLAY_EX = [...STAND_EX, 'dips', 'splank', 'superman', 'pushup', 'plank1', 'inchworm'];
export const curEx = (): string => playableEx(settings.mode, settings.exercise);

/** Opciones que caben en una fila de teclas; con más, se pasa de una a otra con − y +. */
export const MAX_OPTS = 8;

/** Ajustes del esquema que no salen en estos menús: la «Calidad de imagen» de RepArena (aquí manda la nitidez propia del
 * juego nuevo: decisión del usuario en el PR 7). */
export const NOT_HERE = new Set(['quality']);

/** Lo que se enseña de un ajuste: con − y + (números, y opciones que no caben) o con sus opciones en teclas. */
export interface FieldView {
  key: string;
  label: string;
  hint: string;
  kind: 'step' | 'opts';
  value: string;
  canDown: boolean;
  canUp: boolean;
  opts: { v: string; label: string; on: boolean }[];
}

const TOGGLE: [string, string][] = [
  ['0', 'No'],
  ['1', 'Sí'],
];

const list = (k: string): string[] => str(k).split(',').filter(Boolean);

/** Cómo se enseña un ajuste (null: no se puede tocar aquí, como las listas de muchos enemigos, que van en sus fichas). */
export function fieldView(f: FieldDef): FieldView | null {
  const base = { key: f.key, label: f.short || f.label, hint: f.hint ?? '' };
  if (f.type === 'num') {
    const v = num(f.key);
    return { ...base, kind: 'step', value: fmtVal(f), canDown: v > (f.min ?? -Infinity), canUp: v < (f.max ?? Infinity), opts: [] };
  }
  if (f.type === 'toggle') return { ...base, kind: 'opts', value: fmtVal(f), canDown: false, canUp: false, opts: TOGGLE.map(([v, l]) => ({ v, label: l, on: String(num(f.key) ? 1 : 0) === v })) };
  const opts = f.opts ?? [];
  if (f.type === 'multi') {
    if (opts.length > MAX_OPTS) return null;
    const on = list(f.key);
    return { ...base, kind: 'opts', value: '', canDown: false, canUp: false, opts: opts.map(([v, l]) => ({ v, label: l, on: on.includes(v) })) };
  }
  if (opts.length > MAX_OPTS) return { ...base, kind: 'step', value: fmtVal(f), canDown: true, canUp: true, opts: [] };
  return { ...base, kind: 'opts', value: fmtVal(f), canDown: false, canUp: false, opts: opts.map(([v, l]) => ({ v, label: l, on: str(f.key) === v })) };
}

/** − (dir −1) o + (dir 1): un paso del número; en las opciones que no caben, la anterior o la siguiente (dando la vuelta). */
export function fieldStep(f: FieldDef, dir: number): void {
  if (f.type === 'num') {
    setSetting(f.key, num(f.key) + (f.step ?? 1) * dir); // (setSetting lo ajusta a sus límites y a su paso)
    return;
  }
  if (f.type !== 'choice') return;
  const opts = f.opts ?? [], i = opts.findIndex((o) => o[0] === str(f.key));
  setSetting(f.key, opts[(Math.max(0, i) + dir + opts.length) % opts.length][0]);
}

/** Tocar una opción: sí/no, la elegida o, en las listas, poner o quitar esa (sin dejar vacía la que no puede estarlo). */
export function fieldPick(f: FieldDef, v: string): void {
  if (f.type === 'toggle') setSetting(f.key, +v);
  else if (f.type === 'choice') setSetting(f.key, v);
  else if (f.type === 'multi') {
    const on = list(f.key), next = on.includes(v) ? on.filter((x) => x !== v) : (f.opts ?? []).map((o) => o[0]).filter((x) => x === v || on.includes(x));
    if (next.length || f.empty) setSetting(f.key, next.join(','));
  }
}

/** ¿Se enseña en estos menús? (lo del jugador, o todo con el menú completo del desarrollador) */
export const fieldHere = (f: FieldDef | undefined): f is FieldDef => !!f && !NOT_HERE.has(f.key) && fieldShown(f) && fieldView(f) !== null;

/** Las pestañas de Ajustes: los grupos con algo que tocar (sonido y entorno tienen su pestaña en Opciones). */
export function settingsGroups(): string[] {
  return Object.keys(GROUP_NAMES).filter((g) => !OWN_MENU.includes(g) && SCHEMA.some((f) => f.g === g && fieldHere(f)));
}
export const groupName = (g: string): string => GROUP_TAB[g] || GROUP_NAMES[g];
export const groupFields = (g: string): FieldDef[] => SCHEMA.filter((f) => f.g === g && fieldHere(f));

/** Cómo es la ronda, en pocas palabras (RepArena: summaryText). */
export function summaryText(): string {
  const n = nWaves() ? `${nWaves()} oleadas` : num('toFail') ? 'al fallo' : 'oleadas sin fin';
  const first = settings.exercise === 'hang' ? `${hangSecs(0)} s colgado la primera (+${num('hangInc')})` : `${waveReps(0)} reps la primera (+${num('repsInc')})`;
  return `${n} · ${first} · vidas ${nLives() || 'sin límite'} · descanso ${num('rest')} s`;
}

/** La ficha de la ronda, bajo los galones: el rango, el ejercicio y cómo es la ronda. */
export const roundInfo = (): string => `${rankName()} en ${EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise]} · ${summaryText()}`;

/** Lo del ojo (lo que el desarrollador deja ver al jugador en la dificultad, RepArena: lobbyDiffRows); con el menú
 * completo, la rapidez y las repeticiones. Sin «Al fallo», que tiene su tecla. */
export function eyeFields(): FieldDef[] {
  const keys = menuFull() ? [speedKey() ?? '', settings.mode === 'arcs' ? 'arcMax' : isBars() && settings.exercise === 'hang' ? 'hangInc' : 'repsWave'] : devEye();
  return keys.map((k) => FIELD[k]).filter((f): f is FieldDef => !!f && fieldVisible(f) && f.key !== 'toFail' && fieldView(f) !== null);
}
