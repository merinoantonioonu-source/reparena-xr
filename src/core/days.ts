/**
 * Los días entrenados, como en RepArena (src/00_core.js: dayKey, noonOf, progress, dayStats, runKcal…; src/60_ui.js: mmss):
 * la racha, lo de hoy, tu semana y lo de siempre, a partir del historial (el mismo que RepArena: las dos versiones lo
 * comparten). Los días van por la hora local del navegador, como en RepArena. Sin IWSDK.
 */
import { kcalOf, type RunRecord } from './run.js';

/** Una fila del historial tal como puede venir guardada: las rondas antiguas no tienen todos los campos (kcal, work…), y
 * las de Arcos y Travesía llevan además los metros (dist). */
export type HistRow = Partial<RunRecord> & { ex: string; date: number; dist?: number };

export const DAY_MS = 864e5;
/** El día (local) de un instante: «2026-11-11». */
export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** El mediodía de ese día: así, el cambio de hora no salta días al restar DAY_MS. */
export const noonOf = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};

export const WDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const fmtDur = (s: number): string => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
export const daysTxt = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`;
/** Segundos como «m:ss». */
export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Las calorías de una ronda guardada; las antiguas no las guardaban: se estiman con su tiempo total (3/4 de oleada). */
export const runKcal = (r: HistRow, kg: number): number => (r.kcal != null ? r.kcal : kcalOf(r.ex, (r.time || 0) * 0.75, (r.time || 0) * 0.25, kg));

export interface Sum { time: number; kcal: number; runs: number; days: number }
export interface Progress { streak: number; best: number; trainedToday: boolean; today: Sum; week: Sum; total: Sum }

/** La racha, la mejor racha y lo entrenado hoy, en la semana y siempre. frozen: los días que salvó un escudo (no suman,
 * pero no cortan la racha). */
export function progress(h: HistRow[], now: number, frozen: string[], kg: number): Progress {
  const days = new Set(h.map((r) => dayKey(r.date))), today = dayKey(now), fz = new Set(frozen);
  // la racha sigue viva hasta que acaba el día: si hoy aún no has entrenado, cuenta desde ayer
  let streak = 0;
  for (let d = noonOf(now) - (days.has(today) ? 0 : DAY_MS); ; d -= DAY_MS) {
    const k = dayKey(d);
    if (days.has(k)) streak++;
    else if (!fz.has(k)) break;
  }
  let best = 0, run = 0, prev: number | null = null;
  for (const k of [...new Set([...days, ...fz])].sort()) {
    const t = noonOf(new Date(k + 'T12:00:00').getTime()), n = days.has(k) ? 1 : 0;
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + n : n;
    best = Math.max(best, run);
    prev = t;
  }
  const sum = (list: HistRow[]): Sum => ({ time: list.reduce((a, r) => a + (r.time || 0), 0), kcal: list.reduce((a, r) => a + runKcal(r, kg), 0), runs: list.length, days: new Set(list.map((r) => dayKey(r.date))).size });
  const weekFrom = noonOf(now) - 6.5 * DAY_MS; // los últimos 7 días, hoy incluido
  return { streak, best, trainedToday: days.has(today), today: sum(h.filter((r) => dayKey(r.date) === today)), week: sum(h.filter((r) => r.date >= weekFrom)), total: sum(h) };
}

export interface DayVal { time: number; kcal: number; reps: number; perfect: number; ex: Record<string, number> }
export interface DayStats { today: DayVal; yest: DayVal; best: DayVal; week: { k: string; d: Date; v: DayVal }[] }

/** Lo de cada día: hoy, ayer, tu mejor día (sin contar hoy) y los últimos 7 días. */
export function dayStats(h: HistRow[], now: number, kg: number): DayStats {
  const by = new Map<string, DayVal>();
  for (const r of h) {
    const k = dayKey(r.date);
    const d = by.get(k) || { time: 0, kcal: 0, reps: 0, perfect: 0, ex: {} };
    d.time += r.time || 0;
    d.kcal += runKcal(r, kg);
    d.reps += r.reps || 0;
    d.perfect += r.perfect || 0;
    d.ex[r.ex] = (d.ex[r.ex] || 0) + (r.reps || 0);
    by.set(k, d);
  }
  const zero: DayVal = { time: 0, kcal: 0, reps: 0, perfect: 0, ex: {} }, at = (k: string) => by.get(k) || zero;
  const week: DayStats['week'] = [];
  for (let i = 6; i >= 0; i--) {
    const t = noonOf(now) - i * DAY_MS;
    week.push({ k: dayKey(t), d: new Date(t), v: at(dayKey(t)) });
  }
  let best = zero;
  for (const [k, v] of by) if (k !== dayKey(now) && v.time > best.time) best = v;
  return { today: at(dayKey(now)), yest: at(dayKey(noonOf(now) - DAY_MS)), best, week };
}
