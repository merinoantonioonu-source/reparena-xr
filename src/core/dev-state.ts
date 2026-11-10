/**
 * El estado del modo desarrollador (escondido) y su tabla de dificultad: para cada modo y ejercicio y cada uno de los 7
 * rangos, los valores que marcan la dificultad, y qué ajustes ve el jugador (el ojo). Como en RepArena
 * (src/67_dev.js): se guarda en «reparena3-dev» y se enciende con «reparena3-devon» o con ?dev=1. Lo llena initSettings.
 */

/** { 'modo|ejercicio': { v: { ajuste: [7 valores o null] }, eye: [ajustes] }, foes: {...}, songs: {...} } */
export type DevTable = Record<string, { v?: Record<string, (number | string | null)[]>; eye?: string[] } & Record<string, unknown>>;

export const DEV = { on: false, t: {} as DevTable };

/** Los valores de fábrica que dejó el desarrollador para todos (en RepArena, DEV_FACTORY: hoy, vacío). */
export const DEV_FACTORY: DevTable = {};
