/**
 * Lo de hoy para el marcador y la meta diaria, como en RepArena (src/70_game.js: boardDayRefresh y boardDay): lo ya
 * guardado hoy (tiempo, calorías y repeticiones de este ejercicio), tu mejor día con este ejercicio (sin contar hoy) y la
 * racha; la ronda en curso se suma en vivo mientras no esté guardada. Sin IWSDK.
 */
import { dayKey, progress, runKcal, type HistRow } from './days.js';

export interface DayBoard {
  time: number;
  kcal: number;
  ex: number;
  best: number;
  streak: number;
}

/** Lo ya guardado hoy (RepArena: boardDayRefresh). frozen: los días que salvó un escudo. */
export function dayBoard(h: HistRow[], now: number, ex: string, frozen: string[], kg: number): DayBoard {
  const today = dayKey(now), by = new Map<string, number>(), D: DayBoard = { time: 0, kcal: 0, ex: 0, best: 0, streak: 0 };
  for (const r of h) {
    const k = dayKey(r.date);
    if (k === today) {
      D.time += r.time || 0;
      D.kcal += runKcal(r, kg);
      if (r.ex === ex) D.ex += r.reps || 0;
    } else if (r.ex === ex) by.set(k, (by.get(k) || 0) + (r.reps || 0));
  }
  D.best = Math.max(0, ...by.values());
  D.streak = progress(h, now, frozen, kg).streak;
  return D;
}

/** Lo de hoy con la ronda en curso sumada (RepArena: boardDay). live: la ronda sin guardar (tiempo, calorías, repeticiones). */
export function dayLive(D: DayBoard, live: { time: number; kcal: number; n: number } | null): { time: number; kcal: number; n: number; best: number; streak: number } {
  const L = !!live;
  return { time: D.time + (L ? live.time : 0), kcal: D.kcal + (L ? live.kcal : 0), n: D.ex + (L ? Math.floor(live.n) : 0), best: D.best, streak: Math.max(D.streak, L && live.time > 0 && !D.time ? D.streak + 1 : 0) };
}
