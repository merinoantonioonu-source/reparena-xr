/**
 * Tu carrera, como en RepArena (src/73_career.js): para que apetezca volver y superarse.
 *  · cada repetición da experiencia (las perfectas, el doble; ganar la ronda, 20 más) y al subir de nivel cambia tu título
 *    y desbloqueas colores de las manos y del rayo normal (solo se ven: nunca dan más cargas ni más daño)
 *  · cada día, tres misiones (volumen, calidad y variedad), +40 XP cada una y, con las tres, el cofre del día (+100 XP, un
 *    escudo de racha y un color antes de tiempo)
 *  · los escudos de racha (como mucho tres): si un día no entrenas, se gasta uno solo y la racha sigue (ese día no suma)
 *  · una campaña por modo y ejercicio: 35 niveles en 7 regiones (una por rango; el quinto de cada una, con jefe)
 * Se guarda en la misma clave y con la misma forma que RepArena (las dos versiones comparten tu progreso). Lo que en
 * RepArena eran variables sueltas (ajustes, la hora, el azar, los avisos) aquí se recibe en CareerEnv, para probarlo. Sin IWSDK.
 */
import { EX_NAMES, EX_SHORT, MODE_NAMES, RANKS, exOk } from './catalog.js';
import { DAY_MS, dayKey, daysTxt, mmss, noonOf, progress, type HistRow, type Progress } from './days.js';
import { HIST_KEY } from './run.js';

export const CAREER_KEY = 'reparena3-career', PROG_COL = '#c8f560', SHIELD_MAX = 3, SHIELD_COL = '#7fd4ff';
export const MIS_XP = 40, CHEST_XP = 100, STAR_XP = 15, WIN_XP = 20;

/** Lo que la carrera necesita de fuera (en RepArena, globales). */
export interface CareerEnv {
  store<T = unknown>(k: string, v?: T): T | null;
  now(): number;
  /** La meta del día, en minutos (ajuste goalMin). */
  goalMin(): number;
  random(): number;
  /** Tu peso (ajuste weight), para las calorías. */
  kg(): number;
  /** ¿Se puede jugar este modo / este ejercicio en esta versión? (para las misiones de variedad) */
  playMode(m: string): boolean;
  playEx(x: string): boolean;
  trophy(title: string, sub?: string, color?: string): void;
  cheer(text: string, color: string, secs: number): void;
}

export interface MisItem { t: string; n: number; got: number; done: boolean; arg?: string; cel?: boolean }
export interface Mis { day: string; list: MisItem[]; chest: boolean }
export interface CampEntry { at: number; stars: Record<string, number> }
export interface CampRun { id: string; lv: number }
export interface CampResult { lv: number; stars: number; prev: number; newStars: number; next: number | null }
export interface Gain { xp0: number; xp: number; notes: [string, string][]; camp?: CampResult }
export interface CareerState {
  xp: number;
  seeded: boolean;
  /** Los colores que dio un cofre antes de tiempo («hands:pink»). */
  own: string[];
  equip: Record<string, string>;
  mis: Mis | null;
  camp: Record<string, CampEntry>;
  shield: number;
  /** Los días que salvó un escudo. */
  frozen: string[];
  saved: { day: string; n: number; told: boolean } | null;
  /** Lo ganado hasta que lo enseña el resumen (no se guarda). */
  gain: Gain | null;
}
/** Lo que suma a las misiones (una ronda o lo de una fila del historial). */
export interface MisAdd { reps?: number; mins?: number; perfect?: number; combo?: number; win?: boolean; taken?: number; mode?: string; ex?: string; hang?: boolean; stars?: number }
/** Lo de la ronda al acabar (RepArena: lo que saveRun pasa a careerRun). */
export interface RunInfo { reps: number; perfect: number; mins: number; combo: number; win: boolean; taken: number; falls: number; mode: string; ex: string; hang: boolean; stars?: number }
/** La ronda en marcha (en RepArena, stats, score, settings, state, SES y las distancias). run cambia en cada ronda. */
export interface LiveStats { run: number; playing: boolean; session: boolean; exercise: string; mode: string; toFail: boolean; reps: number; hold: number; time: number; perfect: number; bestCombo: number; score: number; dist: number }

/* ---------- Nivel y título ---------- */
/** De un nivel al siguiente: cada vez un poco más. */
export const lvlNeed = (n: number): number => 100 + 20 * (n - 1);
export const TITLES: [number, string][] = [[1, 'Novato'], [3, 'Aprendiz'], [6, 'Luchador'], [10, 'Guerrero'], [15, 'Gladiador'], [20, 'Campeón'], [30, 'Héroe'], [40, 'Titán'], [50, 'Leyenda']];
export const titleOf = (n: number): string => (TITLES.filter((t) => n >= t[0]).pop() as [number, string])[1];

// Los colores que se desbloquean: [clave, nombre, nivel, color]. El rayo normal (el perfecto y los cargados no cambian: su
// color dice lo que valen)
export type LookKey = 'hands' | 'bolt';
export type LookOpt = [string, string, number, number];
export const LOOKS: Record<LookKey, { name: string; opts: LookOpt[] }> = {
  hands: { name: 'Manos', opts: [['teal', 'Turquesa', 1, 0x3cf0c6], ['pink', 'Rosa', 4, 0xff4fa3], ['gold', 'Oro', 8, 0xffd166], ['lime', 'Ácido', 12, 0x9dff3c], ['violet', 'Violeta', 16, 0xa68bff], ['white', 'Blanco', 22, 0xffffff]] },
  bolt: { name: 'Rayo', opts: [['blue', 'Azul', 1, 0x4aa8ff], ['white', 'Plasma', 5, 0xe8f4ff], ['lime', 'Ácido', 10, 0x8dff5a], ['violet', 'Violeta', 18, 0xb070ff]] },
};
/** Los colores que se desbloquean en el nivel n («Manos: Rosa»). */
export const unlocksAt = (n: number): string[] => (n > 1 ? Object.values(LOOKS).flatMap((L) => L.opts.filter((o) => o[2] === n).map((o) => `${L.name}: ${o[1]}`)) : []);

/* ---------- Misiones del día ---------- */
// n: lo que piden (según tu nivel y tu meta del día). La de la estrella ya no sale: solo para las guardadas de antes
export const MIS: Record<string, { kind: string; n: (L: number, goalMin: number) => number; txt: (m: MisItem) => string }> = {
  reps: { kind: 'vol', n: (L) => 50 + 10 * Math.min(L, 10), txt: (m) => `Haz ${m.n} repeticiones` },
  mins: { kind: 'vol', n: (_L, g) => Math.max(5, g), txt: (m) => `Entrena ${m.n} minutos` },
  perfect: { kind: 'q', n: (L) => 20 + 4 * Math.min(L, 10), txt: (m) => `Consigue ${m.n} perfectas` },
  combo: { kind: 'q', n: (L) => (L < 5 ? 8 : L < 15 ? 12 : 16), txt: (m) => `Llega a un combo de ×${m.n}` },
  clean: { kind: 'q', n: () => 1, txt: () => 'Gana una ronda sin que te golpeen' },
  mode: { kind: 'var', n: () => 1, txt: (m) => `Juega una ronda en ${MODE_NAMES[m.arg as string] || m.arg}` },
  ex: { kind: 'var', n: () => 1, txt: (m) => `Haz una ronda de ${(EX_NAMES[m.arg as string] || (m.arg as string)).toLowerCase()}` },
  set: { kind: 'var', n: (L) => 25 + 3 * Math.min(L, 10), txt: (m) => `Haz ${m.n} repeticiones en una sola ronda` },
  star: { kind: 'var', n: () => 1, txt: () => 'Gana una estrella nueva en la campaña' },
};
/** Lo que llevas de una misión (los minutos, enteros). */
export const misGot = (m: MisItem): number => Math.min(m.n, m.t === 'mins' ? Math.floor(m.got) : m.got);
/** Las misiones en pocas palabras (la franja del menú y la columna HOY). */
export const MIS_SHORT: Record<string, (m: MisItem) => string> = {
  reps: (m) => `${m.n} repeticiones`,
  mins: (m) => `${m.n} minutos`,
  perfect: (m) => `${m.n} perfectas`,
  combo: (m) => `Combo ×${m.n}`,
  clean: () => 'Ronda sin golpes',
  mode: (m) => `Ronda de ${MODE_NAMES[m.arg as string] || m.arg}`,
  ex: (m) => `Ronda de ${String(EX_SHORT[m.arg as string] || EX_NAMES[m.arg as string] || m.arg || '').toLowerCase()}`,
  set: (m) => `${m.n} en una ronda`,
  star: () => 'Estrella nueva',
};
export const misShort = (m: MisItem): string => (MIS_SHORT[m.t] || ((x: MisItem) => MIS[x.t].txt(x)))(m);

/** Lo que suma cada ronda a las misiones. */
export function misAdd(list: MisItem[], o: MisAdd): void {
  for (const m of list) {
    if (m.t === 'reps') m.got += o.reps || 0;
    else if (m.t === 'mins') m.got += o.mins || 0;
    else if (m.t === 'perfect') m.got += o.perfect || 0;
    else if (m.t === 'combo') m.got = Math.max(m.got, o.combo || 0);
    else if (m.t === 'clean') { if (o.win && !o.taken) m.got = 1; }
    else if (m.t === 'mode') { if (o.mode === m.arg) m.got = 1; }
    else if (m.t === 'ex') { if (o.ex === m.arg) m.got = 1; }
    else if (m.t === 'set') { if (!o.hang) m.got = Math.max(m.got, o.reps || 0); }
    else if (m.t === 'star') m.got += o.stars || 0;
  }
}

/** El azar de cada día (el mismo para todos: el día es la semilla). */
function seeded(str: string): () => number {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Récords, en plena ronda ---------- */
// [clave, nombre, lo de ahora, lo de una ronda guardada, el texto]
type RecDef = [string, string, (l: LiveStats) => number, (r: HistRow) => number, (v: number) => string];
export const REC_DEF: RecDef[] = [
  ['reps', 'REPETICIONES', (l) => (l.exercise === 'hang' ? 0 : l.reps), (r) => (r.ex === 'hang' ? 0 : (r.reps as number)), (v) => `${v} repeticiones`],
  ['hold', 'TIEMPO COLGADO', (l) => (l.exercise === 'hang' ? Math.floor(l.hold) : 0), (r) => (r.ex === 'hang' ? (r.reps as number) : 0), (v) => mmss(v)],
  ['time', 'TIEMPO', (l) => (l.toFail ? Math.floor(l.time) : 0), (r) => (r.fail ? (r.time as number) : 0), (v) => `${mmss(v)} aguantando`], // (al fallo: lo que aguantas)
  ['score', 'PUNTOS', (l) => l.score, (r) => r.score as number, (v) => `${v} puntos`],
  ['combo', 'COMBO', (l) => l.bestCombo, (r) => r.combo as number, (v) => `combo ×${v}`],
  ['perfect', 'PERFECTAS', (l) => l.perfect, (r) => r.perfect as number, (v) => `${v} perfectas`],
  ['dist', 'DISTANCIA', (l) => (l.mode === 'arcs' || l.mode === 'trek' ? Math.floor(l.dist || 0) : 0), (r) => r.dist as number, (v) => `${v} m`],
];

/* ---------- La campaña ---------- */
export const CAMP_REG: [string, string][] = [['Campo de entrenamiento', 'arena'], ['Bosque del eco', 'nature'], ['Isla del capitán', 'island'], ['Fortaleza de hierro', 'arena'], ['Bosque sombrío', 'nature'], ['Isla de los tiburones', 'island'], ['Ciudadela del general', 'arena']];
export const CAMP_N = CAMP_REG.length * 5, CAMP_WAVES = [3, 3, 4, 4, 5];
export const campId = (mode: string, ex: string): string => mode + ':' + ex;
/** Un nivel de la campaña: su región, su rango, su entorno, sus oleadas y si tiene jefe (el quinto). */
export const campLv = (lv: number) => {
  const r = Math.floor((lv - 1) / 5), k = (lv - 1) % 5;
  return { r, k, rank: RANKS[r][0], name: CAMP_REG[r][0], env: CAMP_REG[r][1], waves: CAMP_WAVES[k], boss: k === 4 };
};

/** Tu mejor ronda (en repeticiones) de un ejercicio en un modo. */
export function bestRunOf(h: HistRow[], ex: string, mode: string): HistRow | null {
  return h.filter((r) => r.ex === ex && r.mode === mode).reduce<HistRow | null>((b, r) => (!b || (r.reps as number) > (b.reps as number) ? r : b), null);
}

// lo guardado, tal como venga (puede ser de una versión vieja)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Saved = Record<string, any>;
const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});
/** La experiencia de una ronda guardada (la primera vez se cuenta todo tu historial: no empiezas de cero). */
const runXP = (r: HistRow) => (r.ex === 'hang' ? Math.round((r.reps || 0) / 2) : (r.reps || 0) + (r.perfect || 0)) + (r.win ? 20 : 0);

export class Career {
  readonly cr: CareerState;
  // el color puesto de cada cosa, ya resuelto (se mira en cada fotograma)
  private lookC: Partial<Record<LookKey, number>> = {};
  private misRun: number | null = null;
  private rec: { run: number | null; best: Record<string, number>; got: Record<string, boolean> } = { run: null, best: {}, got: {} };

  constructor(private env: CareerEnv) {
    const s = obj<unknown>(env.store(CAREER_KEY)) as Saved;
    this.cr = { xp: Math.max(0, +s.xp || 0), seeded: !!s.seeded, own: Array.isArray(s.own) ? s.own : [], equip: obj(s.equip), mis: s.mis && Array.isArray(s.mis.list) ? s.mis : null, camp: obj(s.camp), shield: Math.min(SHIELD_MAX, Math.max(0, +s.shield || 0)), frozen: Array.isArray(s.frozen) ? s.frozen.slice(-120) : [], saved: s.saved && s.saved.day ? s.saved : null, gain: null };
    if (!this.cr.seeded) {
      this.cr.xp += this.hist().reduce((a, r) => a + runXP(r), 0);
      this.cr.seeded = true;
      this.save();
    }
    this.shieldCheck();
  }

  private hist(): HistRow[] {
    return this.env.store<HistRow[]>(HIST_KEY) || [];
  }

  /** Guarda (sin lo ganado aún por enseñar) y olvida los colores resueltos. */
  save(): void {
    const { gain: _gain, ...o } = this.cr;
    this.env.store(CAREER_KEY, o);
    this.lookC = {};
  }

  /** Escudos de racha: si entre tu último día entrenado y hoy faltan días (como mucho tantos como escudos tengas), se
   * gastan solos y esos días quedan salvados; si faltan más, la racha se pierde y los escudos se guardan. */
  shieldCheck(now = this.env.now(), h = this.hist()): void {
    const C = this.cr;
    if (!C.shield) return;
    const days = new Set(h.map((r) => dayKey(r.date))), fz = new Set(C.frozen), miss: string[] = [];
    if (!days.size) return;
    for (let d = noonOf(now) - DAY_MS; !days.has(dayKey(d)) && !fz.has(dayKey(d)) && miss.length <= SHIELD_MAX; d -= DAY_MS) miss.push(dayKey(d));
    if (!miss.length || miss.length > C.shield) return;
    C.shield -= miss.length;
    C.frozen = [...C.frozen, ...miss].slice(-120);
    C.saved = { day: dayKey(now), n: miss.length, told: false };
    this.save();
  }

  /** Los escudos tal como están guardados (RepArena: streakSave). */
  streakSave(): { n: number; frozen: string[]; saved: CareerState['saved'] } {
    const c = obj<unknown>(this.env.store(CAREER_KEY)) as Saved;
    return { n: Math.max(0, +c.shield || 0), frozen: Array.isArray(c.frozen) ? c.frozen : [], saved: c.saved || null };
  }

  /** La racha y lo entrenado, con el historial guardado. */
  progress(h = this.hist(), now = this.env.now()): Progress {
    return progress(h, now, this.streakSave().frozen, this.env.kg());
  }

  /* ---------- Nivel y colores ---------- */
  lvlNeed(n: number): number {
    return lvlNeed(n);
  }
  lvlOf(xp = this.cr.xp): { n: number; into: number; need: number } {
    let n = 1, r = xp;
    while (r >= lvlNeed(n) && n < 99) { r -= lvlNeed(n); n++; }
    return { n, into: r, need: lvlNeed(n) };
  }
  titleOf(n: number): string {
    return titleOf(n);
  }
  get TITLES(): [number, string][] {
    return TITLES;
  }
  lookOwn(k: LookKey, v: string): boolean {
    const o = LOOKS[k].opts.find((x) => x[0] === v);
    return !!o && (this.lvlOf().n >= o[2] || this.cr.own.includes(k + ':' + v));
  }
  lookOpt(k: LookKey): LookOpt {
    const v = this.cr.equip[k], o = LOOKS[k].opts;
    return (this.lookOwn(k, v) && o.find((x) => x[0] === v)) || o[0];
  }
  lookHex(k: LookKey): number {
    const c = this.lookC[k];
    return c !== undefined ? c : (this.lookC[k] = this.lookOpt(k)[3]);
  }
  lookSet(k: LookKey, v: string): void {
    if (!this.lookOwn(k, v)) return;
    this.cr.equip[k] = v;
    this.save();
  }
  unlocksAt(n: number): string[] {
    return unlocksAt(n);
  }
  lockedLooks(): { id: string; label: string }[] {
    return (Object.entries(LOOKS) as [LookKey, (typeof LOOKS)[LookKey]][]).flatMap(([k, L]) => L.opts.filter((o) => !this.lookOwn(k, o[0])).map((o) => ({ id: k + ':' + o[0], label: `${L.name}: ${o[1]}` })));
  }
  /** El siguiente color que se desbloquea (para el menú). */
  nextUnlock(): { n: number; label: string } | null {
    const n = this.lvlOf().n;
    let best: { n: number; label: string } | null = null;
    for (const L of Object.values(LOOKS)) for (const o of L.opts) if (o[2] > n && (!best || o[2] < best.n)) best = { n: o[2], label: `${L.name}: ${o[1]}` };
    return best;
  }

  /* ---------- Misiones del día ---------- */
  /** Las misiones de hoy: se eligen con el día como semilla, y lo que ya hiciste hoy antes de que salieran cuenta. */
  misToday(now = this.env.now()): Mis {
    const C = this.cr, day = dayKey(now);
    if (C.mis && C.mis.day === day) {
      for (const m of C.mis.list) if (m.t === 'star' && !m.done) Object.assign(m, { t: 'set', n: MIS.set.n(this.lvlOf().n, this.env.goalMin()), got: 0 }); // (la de la estrella de hoy, ya cambiada)
      return C.mis;
    }
    this.shieldCheck(now); // (un día nuevo: ¿hace falta un escudo?)
    const R = seeded('reparena' + day), pickR = <T>(a: T[]): T => a[Math.floor(R() * a.length) % a.length], L = this.lvlOf().n, h = this.hist();
    const env = this.env;
    // variedad: el modo que menos has jugado esta semana (de los que se pueden jugar aquí), o un ejercicio que ya conoces y
    // llevas días sin hacer
    const week = h.filter((r) => r.date > now - 7 * DAY_MS);
    let modes = ['combat', 'arcs', 'touch', ...(h.some((r) => r.mode === 'bars') ? ['bars'] : [])].filter((m) => env.playMode(m)).sort((a, b) => week.filter((r) => r.mode === a).length - week.filter((r) => r.mode === b).length);
    if (!modes.length) modes = ['combat'];
    const recent = new Set(h.filter((r) => r.date > now - 3 * DAY_MS).map((r) => r.ex));
    const exs = [...new Set(h.map((r) => r.ex))].filter((x) => EX_NAMES[x] && !recent.has(x) && env.playEx(x) && Object.keys(MODE_NAMES).some((m) => env.playMode(m) && exOk(m, x)));
    let t3 = pickR(['mode', 'ex', 'set', 'set']);
    if (t3 === 'ex' && !exs.length) t3 = 'set'; // (de entrenar: un modo, un ejercicio o muchas repeticiones seguidas en una ronda)
    const g = this.env.goalMin();
    const list: MisItem[] = [pickR(['reps', 'reps', 'mins']), pickR(['perfect', 'combo', 'clean']), t3].map((t) => ({ t, n: MIS[t].n(L, g), got: 0, done: false, ...(t === 'mode' ? { arg: pickR(modes.slice(0, 2)) } : t === 'ex' ? { arg: pickR(exs) } : {}) }));
    for (const r of h.filter((r) => dayKey(r.date) === day)) misAdd(list, { reps: r.ex === 'hang' ? 0 : r.reps, perfect: r.perfect, mins: (r.time || 0) / 60, mode: r.mode, ex: r.ex, win: r.win, taken: 1 });
    let xp = 0;
    list.forEach((m) => { if (m.got >= m.n) { m.done = true; xp += MIS_XP; } }); // (lo cumplido antes de salir, también)
    C.xp += xp;
    C.mis = { day, list, chest: false };
    this.save();
    return C.mis;
  }
  misLeft(): number {
    return this.misToday().list.filter((m) => !m.done).length;
  }
  misAdd(list: MisItem[], o: MisAdd): void {
    misAdd(list, o);
  }
  misGot(m: MisItem): number {
    return misGot(m);
  }
  misShort(m: MisItem): string {
    return misShort(m);
  }
  // Cada misión cumplida se celebra en grande. cel: ya celebrada en esta ronda (al acabar no se repite)
  private misCheer(m: MisItem, M: Mis): void {
    const k = M.list.filter((x) => x.done || x.cel).length;
    this.env.trophy(k >= 3 ? '¡TRES DE TRES!' : `¡MISIÓN ${k} DE 3!`, k >= 3 && !M.chest ? `${MIS[m.t].txt(m)} · el cofre, al acabar` : MIS[m.t].txt(m), '#3cf0c6');
  }
  /** En plena ronda: las de cantidad y calidad (repeticiones, minutos, perfectas, combo, serie) se celebran en cuanto llegas. */
  misLive(l: LiveStats): void {
    if (!l.playing) return;
    const M = this.misToday();
    if (this.misRun !== l.run) { this.misRun = l.run; M.list.forEach((m) => { if (!m.done) m.cel = false; }); } // (una ronda nueva: lo de la anterior sin acabar, no cuenta)
    const hang = l.exercise === 'hang', live: Record<string, number> = { reps: hang ? 0 : l.reps, mins: l.time / 60, perfect: l.perfect, combo: l.bestCombo, set: hang ? 0 : l.reps };
    M.list.forEach((m) => {
      if (m.done || m.cel || !(m.t in live)) return;
      if ((m.t === 'combo' || m.t === 'set' ? Math.max(m.got, live[m.t]) : m.got + live[m.t]) >= m.n) { m.cel = true; this.misCheer(m, M); }
    });
  }

  /** En plena ronda: en cuanto superas una marca de este modo y ejercicio (al fallo, aparte), su aviso grande (una vez por
   * ronda cada una; solo si ya tenías marca; en las sesiones, no). */
  recLive(l: LiveStats): void {
    if (!l.playing || l.session) return;
    const REC = this.rec;
    if (REC.run !== l.run) {
      REC.run = l.run; REC.got = {}; REC.best = {};
      const H = this.hist().filter((r) => r.ex === l.exercise && r.mode === l.mode && !!r.fail === !!l.toFail);
      for (const [k, , , old] of REC_DEF) REC.best[k] = H.reduce((a, r) => Math.max(a, +old(r) || 0), 0);
    }
    for (const [k, name, now, , txt] of REC_DEF) {
      const v = now(l), b = REC.best[k];
      if (!REC.got[k] && b > 0 && v > b) {
        REC.got[k] = true;
        this.env.trophy(`¡RÉCORD DE ${name}!`, `${txt(v)}${l.toFail ? ' al fallo' : ''} · antes, ${txt(b)}`);
        this.env.cheer('¡NUEVO RÉCORD!', '#ffd166', 1.6);
      }
    }
  }

  /* ---------- Al acabar cada ronda ---------- */
  /** Lo ganado en la ronda se va juntando en cr.gain hasta que lo enseña el resumen. camp: el nivel de la campaña que se
   * jugaba (o null). */
  run(o: RunInfo, camp: CampRun | null): void {
    const C = this.cr, env = this.env, G = C.gain || (C.gain = { xp0: C.xp, xp: 0, notes: [] });
    let xp = (o.hang ? Math.round(o.reps / 2) : o.reps + o.perfect) + (o.win ? WIN_XP : 0);
    if (camp) {
      const c = this.campResult(camp, o);
      G.camp = c; xp += STAR_XP * c.newStars; o.stars = c.newStars;
      if (c.newStars) G.notes.push([`Campaña: ${c.newStars === 1 ? 'una estrella nueva' : `${c.newStars} estrellas nuevas`}`, '#ffd166']);
    }
    const M = this.misToday(), was = M.list.map((m) => m.done);
    misAdd(M.list, o);
    M.list.forEach((m, i) => {
      if (!was[i] && m.got >= m.n) {
        m.done = true; xp += MIS_XP;
        G.notes.push([`Misión cumplida: ${MIS[m.t].txt(m)}`, '#3cf0c6']);
        if (!m.cel) this.misCheer(m, M);
        m.cel = false;
      }
    });
    if (!M.chest && M.list.every((m) => m.done)) {
      // el cofre: experiencia, un escudo de racha (si no tienes ya los tres) y un color antes de tiempo (si queda alguno)
      M.chest = true; xp += CHEST_XP;
      const lk = this.lockedLooks(), p = lk.length ? lk[Math.floor(env.random() * lk.length)] : null;
      if (p) C.own.push(p.id);
      const sh = C.shield < SHIELD_MAX;
      if (sh) C.shield++;
      env.trophy('¡COFRE DEL DÍA!', `Las tres misiones de hoy · +${CHEST_XP} XP${p ? ` · ${p.label}` : ''}`);
      if (sh) env.trophy('¡ESCUDO DE RACHA!', `Tienes ${C.shield} de ${SHIELD_MAX}: si un día no entrenas, tu racha sigue`, SHIELD_COL); // (el premio que más cuenta: su propio aviso)
      G.notes.push([`¡Cofre del día! +${CHEST_XP} XP${sh ? ` · escudo de racha (${C.shield}/${SHIELD_MAX})` : ''}${p ? ` · ${p.label}` : ''}`, '#ffd166']);
    }
    if (C.saved && !C.saved.told) { C.saved.told = true; G.notes.push([`Un escudo salvó tu racha: ${daysTxt(this.progress().streak)}`, SHIELD_COL]); }
    const l0 = this.lvlOf().n;
    C.xp += xp; G.xp += xp;
    const l1 = this.lvlOf().n;
    if (l1 > l0) env.trophy(`¡NIVEL ${l1}!`, titleOf(l1) !== titleOf(l0) ? `Ahora eres ${titleOf(l1)}` : `${C.xp} XP`);
    for (let n = l0 + 1; n <= l1; n++) {
      G.notes.push([`¡Nivel ${n}!${titleOf(n) !== titleOf(n - 1) ? ` Ahora eres ${titleOf(n)}` : ''}`, '#ffd166']);
      unlocksAt(n).forEach((u) => G.notes.push([`Desbloqueado: ${u}`, '#ff4fa3']));
    }
    this.save();
  }
  /** Lo ganado desde la última vez (para el resumen), y se vacía. */
  take(): Gain | null {
    const G = this.cr.gain;
    this.cr.gain = null;
    return G;
  }

  /* ---------- La campaña ---------- */
  campId(mode: string, ex: string): string {
    return campId(mode, ex);
  }
  campOf(id: string): CampEntry {
    return this.cr.camp[id] || { at: 1, stars: {} };
  }
  campLv(lv: number): ReturnType<typeof campLv> {
    return campLv(lv);
  }
  campStars(id: string): number {
    return Object.values(this.campOf(id).stars).reduce((a, b) => a + b, 0);
  }
  /** Las estrellas: ganar, una; con la mitad de perfectas, dos; con tres cuartos y sin que te golpeen, tres (colgado: sin
   * caídas). Ganar abre el nivel siguiente. */
  campResult(R: CampRun, o: Pick<RunInfo, 'reps' | 'perfect' | 'win' | 'hang' | 'falls' | 'taken'>): CampResult {
    const C = this.cr.camp[R.id] || (this.cr.camp[R.id] = { at: 1, stars: {} }), pr = o.reps ? o.perfect / o.reps : 0;
    const stars = !o.win ? 0 : o.hang ? 1 + (o.falls ? 0 : 1) + (o.taken ? 0 : 1) : 1 + (pr >= 0.5 ? 1 : 0) + (pr >= 0.75 && !o.taken ? 1 : 0), prev = C.stars[R.lv] || 0;
    if (stars > prev) C.stars[R.lv] = stars;
    if (o.win && R.lv >= C.at && R.lv < CAMP_N) C.at = R.lv + 1;
    return { lv: R.lv, stars, prev, newStars: Math.max(0, stars - prev), next: o.win && R.lv < CAMP_N ? R.lv + 1 : null };
  }
  bestRunOf(h: HistRow[], ex: string, mode: string): HistRow | null {
    return bestRunOf(h, ex, mode);
  }
}
