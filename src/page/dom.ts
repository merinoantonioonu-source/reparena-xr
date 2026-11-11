/**
 * Lo común de la página web (RepArena: src/00_core.js `$`, src/68_prefs.js `uiPrefs`, `uiSave` y `escHTML`): buscar en la
 * página, escapar texto para ponerlo en HTML y acordarse de lo último que viste (la clave `reparena3-ui`, la misma que
 * RepArena). La página es del navegador (no entra en la escena de IWSDK), pero lo que no toca el DOM se prueba aparte.
 */
import { store } from '../core/settings.js';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string): T[] => [...document.querySelectorAll<T>(sel)];

export const escHTML = (t: unknown): string => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Lo que la página se acuerda de ti (último apartado visto, pestaña de Progreso…). */
export const UI_KEY = 'reparena3-ui';
export const uiPrefs = (): Record<string, unknown> => store<Record<string, unknown>>(UI_KEY) ?? {};
export function uiSave(k: string, v: unknown): void {
  store(UI_KEY, Object.assign(uiPrefs(), { [k]: v }));
}
