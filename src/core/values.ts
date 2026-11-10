/**
 * Los valores de los ajustes de ahora (el objeto `settings` de RepArena). Sin nada más, para que el esquema, las reglas y
 * el guardado lo compartan sin depender unos de otros. Lo llenan los valores de serie del esquema y lo guardado
 * (src/core/settings.ts → initSettings).
 */

/** Un ajuste es un número (también los sí/no: 0 o 1) o un texto (las opciones; las listas, separadas por comas). */
export type SettingValue = number | string;

export interface Settings {
  mode: string;
  exercise: string;
  [key: string]: SettingValue;
}

export const settings: Settings = { mode: 'combat', exercise: 'squat' };

/** Un ajuste numérico (los sí/no, 0 o 1). */
export const num = (key: string): number => +settings[key] || 0;

/** Un ajuste de texto (las opciones). */
export const str = (key: string): string => String(settings[key] ?? '');

/** ¿Está activado? (sí/no, o un número mayor que 0) */
export const on = (key: string): boolean => !!settings[key] && settings[key] !== '0';
