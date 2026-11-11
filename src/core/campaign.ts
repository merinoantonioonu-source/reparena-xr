/**
 * Jugar un nivel de la campaña (RepArena, src/73_career.js: campStart y campEnd): mientras se juega, los ajustes del nivel
 * (el rango de su región, sus oleadas, sin «Al fallo») van por encima de los tuyos (`OVERLAY.orig` guarda los tuyos: no se
 * guardan los del nivel) y, al acabar, se devuelven. Los datos de la campaña (niveles, estrellas, lo que se guarda) son de
 * `Career` (src/core/career.ts). El entorno de cada región (arena, bosque, isla) se apunta aquí y se pone con el PR 20.
 * Sin IWSDK.
 */
import { campId, campLv, type CampRun } from './career.js';
import { OVERLAY, rankVals } from './settings.js';
import { settings, type SettingValue } from './values.js';

/** La campaña en juego (null: ninguna) y el entorno de su región. */
export const CAMP: { run: CampRun | null; env: string | null } = { run: null, env: null };

/** Pone los ajustes del nivel `lv` por encima de los tuyos (la ronda la empieza quien llama). */
export function campBegin(lv: number): void {
  campEnd();
  const L = campLv(lv), patch: Record<string, SettingValue> = { ...rankVals(L.rank), rank: L.rank, waves: L.waves, toFail: 0 }, orig: Record<string, SettingValue> = {};
  for (const k in patch) orig[k] = settings[k];
  OVERLAY.orig = orig;
  Object.assign(settings, patch);
  CAMP.run = { id: campId(settings.mode, settings.exercise), lv };
  CAMP.env = L.env;
}

/** Devuelve tus ajustes (el entorno de la región sigue hasta volver al menú: `campLeave`). */
export function campEnd(): void {
  if (CAMP.run && OVERLAY.orig) {
    Object.assign(settings, OVERLAY.orig);
    OVERLAY.orig = null;
  }
  CAMP.run = null;
}

/** Al volver al menú principal o salir: también el entorno de la región. */
export function campLeave(): void {
  campEnd();
  CAMP.env = null;
}
