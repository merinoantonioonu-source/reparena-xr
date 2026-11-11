/**
 * El modo desarrollador y su tabla de dificultad, como en RepArena (src/67_dev.js): lo que faltaba por portar. Lo de cada
 * casilla (devCell, devVal, devSet, devCtl, devRows), el ojo de serie (devEyeDef, devEye), el menú completo y la carga de
 * «reparena3-dev» y «reparena3-devon» ya estaban en settings.ts (los usa el rango); la resistencia, fuerza y dureza de cada
 * enemigo, en combat/foes.ts (devFoe). Aquí, lo que se hace desde la tabla: encender y apagar el modo (cinco toques),
 * marcar el ojo, copiar a otro ejercicio, volver a los de fábrica, exportar e importar, cambiar a un enemigo, las
 * canciones de cada ejercicio (lo guardado: «reparena3-exsongs») y las filas de la tabla ya listas para pintarlas.
 *
 * Mismas claves y misma forma que RepArena (las dos versiones comparten los datos). Lógica pura (sin IWSDK): se prueba en
 * tests/unit/dev.test.ts y se compara con RepArena en tests/compare/dev.compare.test.ts.
 */
import { DEV_FOE_HP, FOE_TIER, devFoe } from '../combat/foes.js';
import { EX_NAMES, FOE_FLY, FOE_GATE, FOE_HATCH, MODE_EX, MODE_NAMES, RANKS, RANK_VALS, exOk } from './catalog.js';
import { DEV, DEV_FACTORY, type DevTable } from './dev-state.js';
import { FIELD, SCHEMA, type FieldDef } from './schema.js';
import { DEV_ON_KEY, applyRank, clampSetting, comboId, devCell, devCtl, devEye, devRowOk, devSave, devVal, rankIdx, setSetting, store } from './settings.js';
import { settings, type SettingValue } from './values.js';

// lo que ya estaba portado, para tenerlo todo a mano desde aquí
export { DEV, DEV_FACTORY, DEV_FOE_HP, FOE_TIER, devFoe };
export { devCell, devCtl, devEye, devEyeDef, devRowOk, devRows, devSave, devSet, devVal, fieldFits, isBasic, menuFull, DEV_KEY, DEV_ON_KEY } from './settings.js';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

// ---------------------------------------------------------------- encender y apagar

/** Lo que hace el juego al encender o apagar el modo: el aviso (RepArena: say) y rehacer la página y los menús. */
export const DEV_HOOKS: { say: ((text: string, col: string, dur: number) => void) | null; changed: (() => void) | null } = { say: null, changed: null };
let taps: number[] = [];

/** Enciende o apaga el modo desarrollador (lo guarda en «reparena3-devon»); al apagarlo, el menú vuelve a sencillo. */
export function devToggle(v = !DEV.on): void {
  DEV.on = !!v;
  store(DEV_ON_KEY, DEV.on);
  if (!DEV.on && settings.menuLevel === 'full') setSetting('menuLevel', 'simple');
  DEV_HOOKS.say?.(DEV.on ? 'Modo desarrollador: activado' : 'Modo desarrollador: desactivado', '#ffd166', 2);
  DEV_HOOKS.changed?.();
}
/** Un toque en el título de la página o en «Acerca de»: cinco en menos de 3 s lo encienden o apagan (true si cambió). */
export function devTap(now = performance.now()): boolean {
  taps = taps.filter((t) => now - t < 3000).concat(now);
  if (taps.length >= 5) {
    taps = [];
    devToggle();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- el ojo, copiar y de fábrica

const entry = (id: string): DevTable[string] => (DEV.t[id] = DEV.t[id] || {});

/** Marca o desmarca con el ojo un ajuste: lo que ve el jugador en su menú (la primera vez, parte de lo de serie). */
export function devEyeToggle(key: string, id = comboId()): void {
  const cur = devEye(id).slice(), j = cur.indexOf(key);
  if (j >= 0) cur.splice(j, 1);
  else cur.push(key);
  entry(id).eye = cur;
  devSave();
}
/** Copia la tabla (valores y ojo) de este ejercicio a otro (en la página, del mismo modo). */
export function devCopy(toId: string, id = comboId()): void {
  const e = DEV.t[id] || {};
  DEV.t[toId] = clone({ v: e.v || (DEV_FACTORY[id] || {}).v || {}, eye: devEye(id) });
  devSave();
}
/** Quita lo tuyo de esta tabla: vuelve a los valores de fábrica (y el rango de ahora se pone ya). */
export function devFactory(id = comboId()): void {
  delete DEV.t[id];
  devSave();
  applyRank();
}
/** Quita lo tuyo de una fila (la ✕ de la tabla). */
export function devRowClear(key: string, id = comboId()): void {
  const e = DEV.t[id];
  if (e && e.v) {
    delete e.v[key];
    devSave();
  }
}
/** ¿Manda el rango en esta fila? (las de siempre, RANK_VALS, y las tocadas en este modo y ejercicio) */
export const devRowOn = (key: string, id = comboId()): boolean => !!RANK_VALS[key] || devCtl(id).includes(key);

// ---------------------------------------------------------------- las filas de la tabla, listas para pintar

/** Las filas que valen para un modo y un ejercicio (las mismas que devRows con lo elegido): el filtro por modo. */
export const devRowsFor = (mode: string, ex: string): string[] =>
  SCHEMA.filter((f) => devRowOk(f) && (!f.modes || f.modes.includes(mode)) && (!f.ex || f.ex.includes(ex)) && !(f.noEx && f.noEx.includes(ex))).map((f) => f.key);
/** Los ejercicios del mismo modo a los que se puede copiar la tabla. */
export const devSameEx = (mode = String(settings.mode), ex = String(settings.exercise)): string[] => Object.keys(EX_NAMES).filter((x) => x !== ex && exOk(mode, x));

/** Cómo se enseña un valor en la tabla (RepArena: devFmt). */
export const devFmt = (f: FieldDef, v: SettingValue): string =>
  f.type === 'toggle' ? (v ? 'Sí' : 'No') : f.type === 'choice' ? ((f.opts ?? []).find((o) => String(o[0]) === String(v)) ?? [v, v])[1] + '' : f.zero && v === 0 ? f.zero : String(v);

export type DevCellView = { v: SettingValue; text: string; own: boolean; now: boolean };
export type DevRowView = { key: string; label: string; unit: string; hint: string; cells: DevCellView[]; eye: boolean; ctl: boolean; clear: boolean };
/** La tabla de un modo y ejercicio: cada fila con sus 7 casillas (lo puesto por ti, en dorado: own; el rango de ahora:
 * now), el ojo y si se puede quitar lo tuyo (RepArena: devTableHTML, sin el HTML). */
export function devTable(id = comboId()): DevRowView[] {
  const [mode, ex] = id.split('|'), eye = new Set(devEye(id)), ri = rankIdx();
  return devRowsFor(mode, ex).map((k) => {
    const f = FIELD[k], ctl = devRowOn(k, id);
    const cells = RANKS.map((_, i) => {
      const v = devVal(k, i, id);
      return { v, text: devFmt(f, v), own: devCell(k, i, id) !== null, now: i === ri };
    });
    return { key: k, label: f.label, unit: f.unit ?? '', hint: f.hint ?? '', cells, eye: eye.has(k), ctl, clear: ctl && !RANK_VALS[k] };
  });
}

// ---------------------------------------------------------------- cada enemigo: resistencia, fuerza y dureza

type FoeRow = { hp?: number; str?: number; tier?: number };
const foesOwn = (): Record<string, FoeRow> | undefined => DEV.t.foes as Record<string, FoeRow> | undefined;

/** La lista de la tabla: [clave, nombre, el enemigo de su dureza o null]. Sale de los de cada grupo: uno nuevo entra solo
 * (los pesados, que no se eligen, van detrás de su hermano; el dragón es jefe y no entra). */
export function devFoes(): [string, string, string | null][] {
  const L: [string, string, string | null][] = [];
  for (const [k, n] of FOE_GATE) {
    L.push(['g:' + k, k === 'robot' ? 'Robot explorador' : n, k]);
    if (k === 'robot') L.push(['g:robot_h', 'Robot pesado', null]);
  }
  for (const [k, n] of FOE_HATCH) {
    L.push(['h:' + k, n + ' (trampilla)', k]);
    if (k === 'spider') L.push(['h:spider_h', 'Araña pesada (trampilla)', null]);
  }
  for (const [k, n] of FOE_FLY) {
    if (k === 'dragon') continue;
    L.push(['f:' + k, n, k]);
    if (k === 'drone') L.push(['f:bomber', 'Bombardero', null]);
  }
  return L;
}
/** Lo de un enemigo dentro de sus límites (resistencia 1–12, fuerza 1–5, dureza 1–4); lo vacío, fuera. */
export const devFoeClean = (o: Record<string, unknown>): FoeRow => ({
  ...(o.hp ? { hp: clamp(Math.round(+(o.hp as number)) || 1, 1, 12) } : {}),
  ...(o.str ? { str: clamp(Math.round(+(o.str as number)) || 1, 1, 5) } : {}),
  ...(o.tier ? { tier: clamp(Math.round(+(o.tier as number)) || 2, 1, 4) } : {}),
});
/** Cambia la resistencia ('hp'), la fuerza ('str') o la dureza ('tier') de un enemigo ('' la deja de serie). */
export function devFoeSet(key: string, f: 'hp' | 'str' | 'tier', v: number | string): void {
  const F = (DEV.t.foes = (DEV.t.foes as Record<string, FoeRow>) || {}) as Record<string, FoeRow>;
  F[key] = devFoeClean({ ...(F[key] || {}), [f]: v === '' ? undefined : +v });
  if (!Object.keys(F[key]).length) delete F[key];
  devSave();
}
/** La dureza de la escalera: la del desarrollador o la de serie (FOE_TIER). */
export const foeTier = (k: string): number => devFoe('g:' + k).tier || devFoe('h:' + k).tier || devFoe('f:' + k).tier || FOE_TIER[k] || 2;
/** La fila de un enemigo en la tabla: sus valores y cuáles son tuyos. */
export function devFoeRow(key: string, base: string | null): { hp: number; str: number; tier: number | null; own: FoeRow } {
  const v = devFoe(key);
  return { hp: v.hp, str: v.str, tier: base ? v.tier || FOE_TIER[base] || 2 : null, own: (foesOwn() || {})[key] || {} };
}

// ---------------------------------------------------------------- canciones de cada ejercicio (del jugador)

// Lo guardado y su limpieza; elegirlas y hacerlas sonar es de Spotify (src/services/spotify.ts)
export const EXS_KEY = 'reparena3-exsongs', EXS_MAX = 50;
export type ExSong = { uri: string; name: string; by: string };
export const EXS: { t: Record<string, ExSong[]> } = { t: {} };
/** Carga las canciones guardadas (una vez al arrancar, detrás de initSettings). */
export function devInit(): void {
  const t = store<Record<string, ExSong[]>>(EXS_KEY);
  EXS.t = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
  taps = [];
}
export const exSongsClean = (l: unknown): ExSong[] =>
  Array.isArray(l)
    ? l
        .filter((t) => t && typeof t.uri === 'string' && t.uri.startsWith('spotify:track:'))
        .slice(0, EXS_MAX)
        .map((t) => ({ uri: t.uri, name: String(t.name || '').slice(0, 120), by: String(t.by || '').slice(0, 120) }))
    : [];
/** Las de un ejercicio: las tuyas o, si no hay, las que dejó el desarrollador de serie. */
export const exSongs = (x = String(settings.exercise)): ExSong[] => exSongsClean(EXS.t[x] || ((DEV_FACTORY.songs || {}) as Record<string, unknown>)[x] || []);
export function exSongsSet(list: unknown, x = String(settings.exercise)): void {
  const l = exSongsClean(list);
  if (l.length) EXS.t[x] = l;
  else delete EXS.t[x];
  store(EXS_KEY, EXS.t);
}

// ---------------------------------------------------------------- exportar e importar

/** La tabla entera (lo de fábrica más lo tuyo, y las canciones), lista para pegarla en DEV_FACTORY o en otro aparato. */
export function devExport(): string {
  const out = clone(DEV_FACTORY) as Record<string, Record<string, unknown>>;
  if (DEV.t.foes) out.foes = { ...((DEV_FACTORY.foes as object) || {}), ...(DEV.t.foes as object) };
  for (const id in DEV.t) {
    if (id === 'foes') continue;
    const e = DEV.t[id], o = (out[id] = out[id] || {});
    if (e.v) o.v = { ...((o.v as object) || {}), ...e.v };
    if (e.eye) o.eye = e.eye.slice();
  }
  const songs = { ...((DEV_FACTORY.songs as object) || {}), ...EXS.t };
  if (Object.keys(songs).length) out.songs = songs;
  return JSON.stringify(out);
}
/** Carga una tabla exportada (sustituye la tuya); devuelve el aviso para el jugador. Lo que no vale se descarta. */
export function devImport(text: string): string {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return 'Eso no es una tabla (JSON) válida';
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'Eso no es una tabla válida';
  const src = o as Record<string, Record<string, unknown>>, t: DevTable = {};
  let n = 0;
  for (const id in src) {
    if (id === 'foes') {
      if (src.foes && typeof src.foes === 'object') {
        const F: Record<string, FoeRow> = {};
        for (const k in src.foes) if (devFoes().some((x) => x[0] === k) && src.foes[k]) F[k] = devFoeClean(src.foes[k] as Record<string, unknown>);
        t.foes = F;
      }
      continue;
    }
    if (id === 'songs') {
      if (src.songs && typeof src.songs === 'object') for (const x in src.songs) if (EX_NAMES[x]) exSongsSet(src.songs[x], x);
      continue;
    }
    const [m, x] = id.split('|');
    if (!MODE_NAMES[m] || !EX_NAMES[x] || !src[id] || typeof src[id] !== 'object') continue;
    const e: DevTable[string] = {}, v = (src[id].v || {}) as Record<string, unknown>;
    for (const k in v) {
      const a = v[k];
      if (FIELD[k] && devRowOk(FIELD[k]) && Array.isArray(a)) {
        (e.v = e.v || {})[k] = RANKS.map((_, i) => (a[i] === null || a[i] === undefined ? null : clampSetting(FIELD[k], a[i])));
        n++;
      }
    }
    if (Array.isArray(src[id].eye)) e.eye = (src[id].eye as string[]).filter((k) => FIELD[k]);
    t[id] = e;
  }
  DEV.t = t;
  devSave();
  applyRank();
  return `Tabla cargada (${n} filas)`;
}

/** Los modos con sus ejercicios (para elegir qué tabla ver). */
export const devCombos = (): string[] => Object.keys(MODE_EX).flatMap((m) => MODE_EX[m].map((x) => m + '|' + x));
