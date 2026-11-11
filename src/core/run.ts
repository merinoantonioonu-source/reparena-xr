/**
 * Al acabar la ronda, como en RepArena (src/70_game.js: saveRun y endRun; src/00_core.js: kcalOf): lo que se guarda en el
 * historial (la misma clave y el mismo formato que RepArena: las dos versiones comparten tu progreso) y el resumen (opción A,
 * elegida por el usuario): dónde acabó y el ejercicio, el número grande, la medalla y las perfectas, tres casillas (puntos,
 * tiempo y kcal), un solo logro (el más importante) y dos botones. Sin IWSDK.
 */

/** El historial de rondas (RepArena: HIST_KEY; se guardan las 400 últimas). */
export const HIST_KEY = 'reparena3-history';

/** El esfuerzo de cada ejercicio (MET) y el de descansar (RepArena: EX_MET, REST_MET). */
export const EX_MET: Record<string, number> = { slam: 7.5, squat: 5.5, lunge: 5, jsquat: 8, pushup: 6, pike: 6, inchworm: 6.5, dips: 5, curl: 3.5, curl2: 3.5, press: 4, press2: 4, fraise: 3.5, thruster: 7, frontsq: 6, swing: 9.8, chop: 5, dlrow: 6, plank1: 4, plankrow: 5, splank: 3, superman: 3.5, row: 6, pullup: 8, hang: 3.5, jump: 8, abs: 3.8, combo: 6 };
const REST_MET = 2;

/** Las calorías de una ronda (estimadas): el esfuerzo del ejercicio en el tiempo de oleada y el de descansar en el resto,
 * con tu peso (RepArena: kcalOf). work y rest, en segundos. */
export const kcalOf = (ex: string, work: number, rest: number, kg: number): number => (((EX_MET[ex] || 5) * work + REST_MET * Math.max(0, rest)) * 3.5 * kg) / 200 / 60;

/** Una ronda del historial (el formato de RepArena). */
export interface RunRecord {
  ex: string;
  mode: string;
  reps: number;
  perfect: number;
  kills: number;
  win: boolean;
  fail?: number;
  time: number;
  work: number;
  kcal: number;
  score: number;
  combo: number;
  date: number;
}

export interface RunStats {
  ex: string;
  mode: string;
  reps: number;
  perfect: number;
  kills: number;
  win: boolean;
  /** Al fallo: la oleada a la que llegaste (si no, null). */
  failWave: number | null;
  /** Segundos de la ronda y de oleada (sin los descansos). */
  time: number;
  work: number;
  score: number;
  bestCombo: number;
  kg: number;
}

/** Lo que se guarda (RepArena: saveRun). Nada si no hiciste ninguna repetición. */
export function runRecord(s: RunStats, now = Date.now()): RunRecord | null {
  if (!s.reps) return null;
  return { ex: s.ex, mode: s.mode, reps: s.reps, perfect: s.perfect, kills: s.kills, win: s.win, ...(s.failWave !== null ? { fail: s.failWave } : {}), time: Math.round(s.time), work: Math.round(s.work), kcal: Math.round(kcalOf(s.ex, s.work, s.time - s.work, s.kg) * 10) / 10, score: s.score, combo: s.bestCombo, date: now };
}

export interface Summary {
  /** El título grande (¡VICTORIA!, DERROTA o RESUMEN), dónde acabó y el ejercicio. */
  title: string;
  where: string;
  sub: string;
  /** El número grande y su unidad, las perfectas (%), las estrellas (0-3) y la medalla. */
  got: number;
  unit: string;
  pct: number;
  stars: number;
  medal: string | null;
  /** Las tres casillas y el logro más importante (o null). */
  tiles: [string, string][];
  chip: [string, string] | null;
}

/** Los logros del resumen en su orden (RepArena: sumChips): el cofre y el nivel nuevo primero; luego el primer logro de la
 * ronda (récord…); luego el resto de lo ganado (misiones, campaña, escudos…, sin los «Desbloqueado»); y, al final, los demás
 * de la ronda. Solo se enseña el primero. */
export function sumChips(chips: [string, string][], notes: [string, string][] | null): [string, string][] {
  if (!notes) return chips;
  const ch = notes.find(([t]) => /^¡Cofre/.test(t)), lv = notes.find(([t]) => /^¡Nivel/.test(t)), top = [ch, lv].filter((n): n is [string, string] => !!n);
  return [...top, ...chips.slice(0, 1), ...notes.filter((n) => !top.includes(n) && !/^Desbloqueado/.test(n[0])), ...chips.slice(1)];
}

/** El resumen (RepArena: endRun, opción A). hist: el historial de antes de esta ronda. manual: la terminaste tú. */
export interface CareerBits {
  /** La racha de días si ha subido hoy (y con más de un día), con tu mejor racha; si no, null. */
  streakUp: { n: number; best: number } | null;
  /** Lo ganado en la ronda (la carrera: misiones, cofre, nivel, escudos…); si no hay, null. */
  notes: [string, string][] | null;
}

export function summaryOf(s: RunStats, manual: boolean, waveNow: number, nWaves: number, exName: string, hist: { ex?: string; mode?: string; reps?: number; fail?: number }[], career: CareerBits | null = null): Summary {
  const prevBest = hist.filter((r) => r.ex === s.ex).reduce((a, r) => Math.max(a, r.reps || 0), 0);
  const failBest = hist.filter((r) => r.ex === s.ex && r.mode === s.mode && r.fail).reduce((a, r) => Math.max(a, r.fail || 0), 0);
  const got = s.reps, pr = s.reps ? s.perfect / s.reps : 0, mm = Math.floor(s.time / 60), ss = String(Math.round(s.time % 60)).padStart(2, '0');
  const stars = got ? 1 + (pr >= 0.5 ? 1 : 0) + (s.win && pr >= 0.75 ? 1 : 0) : 0;
  const sub = s.failWave !== null && got ? `Al fallo: oleada ${waveNow}${failBest ? ` · tu récord, ${failBest}` : ''}` : !s.win && !manual ? `Oleada ${waveNow}${nWaves ? ` de ${nWaves}` : ''}` : s.win ? 'Zona despejada' : 'Ronda terminada';
  // los logros, del más importante al menos: se enseña el primero
  const chips: [string, string][] = [];
  if (got > prevBest && prevBest > 0) chips.push(['¡Nuevo récord!', '#ffd166']);
  if (s.failWave !== null && got && waveNow > failBest && failBest) chips.push([`¡Récord al fallo: oleada ${waveNow}!`, '#ffd166']);
  if (career?.streakUp) chips.push([`${career.streakUp.n} días seguidos${career.streakUp.n >= career.streakUp.best ? ' · tu mejor racha' : ''}`, '#3cf0c6']);
  const all = sumChips(chips, career?.notes ?? null);
  return {
    title: s.win ? '¡VICTORIA!' : manual ? 'RESUMEN' : 'DERROTA',
    where: exName,
    sub,
    got,
    unit: 'repeticiones',
    pct: Math.round(pr * 100),
    stars,
    medal: ['', 'bronce', 'plata', 'oro'][stars] || null,
    tiles: [[String(s.score), 'puntos'], [`${mm}:${ss}`, 'tiempo'], [`${Math.round(kcalOf(s.ex, s.work, s.time - s.work, s.kg))}`, 'kcal (aprox.)']],
    chip: all[0] ?? null,
  };
}
