/**
 * Qué sale en la carátula del duelo, al empezar cada ronda (RepArena, src/64_intro.js: introBoss, introRecord, introScene,
 * introName, introSub e INTRO_DRAW): el ejercicio, tú (tu récord) y el jefe que saldría en la ronda (como lo elige
 * buildWave), con la silueta con que se dibuja y sus barras. Solo datos: lo pinta src/ui/duel-art.ts.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/duel.compare.test.ts.
 */
import { BODY_ZONES, EX_NAMES, FOE_FLY, FOE_GATE, FOE_HATCH, MODE_NAMES } from '../core/catalog.js';

/** Las posturas en que te dibuja la carátula (de perfil, mirando al jefe). */
export type DuelPose = 'squat' | 'deep' | 'lunge' | 'plank' | 'hang' | 'reach';
/** Las siluetas de los jefes. */
export type DuelDraw = 'yeti' | 'zombie' | 'demon' | 'cyclops' | 'robot' | 'spider' | 'crab' | 'skull' | 'dragon' | 'mace' | 'tentacle';
/** Lo que pasa entre los dos: el rayo, los arcos, la pompa, el diamante o los aros (o nada, con la maza). */
export type DuelWhat = 'bolt' | 'arcs' | 'bubble' | 'diamond' | 'rings' | '';

/** Una barra de la placa: su nombre, lo llena que va (0-1) y lo que pone a la derecha. */
export type DuelBar = [string, number, string];

/** El jefe de la ronda: su silueta (null: sin jefe, como los arcos o las amebas), su nombre, lo que hay que hacer y sus barras. */
export interface DuelBoss {
  draw: DuelDraw | null;
  name: string;
  note: string;
  bars: DuelBar[];
}

/** La escena de la ilustración (lo que lee duelPaint) y el jefe con sus barras. */
export interface DuelScene {
  pose: DuelPose;
  boss: DuelDraw | null;
  what: DuelWhat;
  B: DuelBoss;
}

/** Lo que miran de los ajustes y de la partida (en RepArena, sus globales). */
export interface DuelEnv {
  mode: string;
  exercise: string;
  /** Oleadas de la ronda (0: al fallo), las repeticiones de cada una (waveReps) y los segundos colgado (hangSecs). */
  nWaves: number;
  waveReps: (i: number) => number;
  hangSecs: (i: number) => number;
  /** Si cada repetición da dos disparos (twoShots). */
  twoShots: boolean;
  /** Por tierra, voladores o mezcla (foes()). */
  foes: string;
  /** La batalla diminuta (isTiny), los elegidos de tierra (groundList) y los voladores (flyList). */
  tiny: boolean;
  ground: string[];
  fly: string[];
  /** La tabla del desarrollador (devFoe) y la dureza de cada uno (foeTier). */
  devFoe: (key: string) => { hp: number; str: number; tier: number };
  foeTier: (k: string) => number;
  /** Un ajuste con la dificultad creciente (dv: arcSpeed, arcRate, barArrive). */
  dv: (key: string) => number;
  /** La maza de Arcos (settings.arcMace) y lo que tardan en llegar las amebas (settings.tchArrive). */
  arcMace: number;
  tchArrive: number;
  /** «Al fallo». */
  toFail: boolean;
  /** Barras, en el suelo (isFloor) o tumbado boca arriba (isSupine). */
  bars: boolean;
  floor: boolean;
  supine: boolean;
}

/** Una ronda del historial (reparena3-history): lo que mira el récord. */
export interface DuelHist {
  ex?: string;
  mode?: string;
  fail?: number;
  reps?: number;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Con qué silueta se dibuja cada jefe (RepArena: INTRO_DRAW). */
export const DUEL_DRAW: Record<string, DuelDraw> = {
  robot: 'robot', titan: 'robot', imp: 'demon', puglin: 'demon', thrower: 'demon', demon: 'demon', greendemon: 'demon', zombie: 'zombie', zgreen: 'zombie', zchubby: 'zombie', skeleton: 'zombie', captain: 'zombie',
  cyclops: 'cyclops', alien: 'cyclops', alientall: 'cyclops', yeti: 'yeti', raptor: 'yeti', sharky: 'yeti', mako: 'yeti', spider: 'spider', crab: 'crab', skull: 'skull', mushroom: 'skull', dragon: 'dragon', carrier: 'dragon',
};

const ALL_FOES = FOE_GATE.concat(FOE_HATCH, FOE_FLY);
const foeName = (k: string): string => (ALL_FOES.find((o) => o[0] === k) || [k, k])[1];

/** El jefe que saldría en la ronda (como lo elige buildWave) y sus barras (RepArena: introBoss). */
export function duelBoss(e: DuelEnv): DuelBoss {
  const N = e.nWaves, bi = N ? N - 1 : 4;
  const note = N ? (N > 1 ? `Jefe de la oleada ${bi + 1}` : 'Jefe de la ronda') : 'Jefe cada 5 oleadas';
  if (e.mode === 'arcs') {
    const sp = e.dv('arcSpeed'), rt = e.dv('arcRate'), bars: DuelBar[] = [['Velocidad', sp / 12, `${sp} km/h`], ['Ritmo', rt / 40, `${rt}/min`], ['Golpe', 0.34, '1 vida']];
    return e.arcMace > 0 ? { draw: 'mace', name: 'La maza', note: 'Pasa por debajo', bars } : { draw: null, name: 'Los arcos', note: 'Agáchate a tiempo', bars };
  }
  if (e.mode === 'touch') return { draw: null, name: 'Las amebas', note: 'Tócalas a tiempo', bars: [['Llegada', 1 - e.tchArrive / 8, `${e.tchArrive} s`], ['Objetivos', 0.5, `${e.waveReps(0)}`], ['Golpe', 0.34, '1 vida']] };
  if (e.bars) {
    if (e.exercise === 'hang') return { draw: 'tentacle', name: 'El remolino', note: 'Aguanta colgado', bars: [['Colgado', clamp(e.hangSecs(0) / 60, 0.1, 1), `${e.hangSecs(0)} s`], ['Golpe', 0.34, '1 vida']] };
    const r0 = e.waveReps(0), ba = e.dv('barArrive');
    return { draw: 'tentacle', name: 'El tentáculo', note: 'Sube y revienta las pompas', bars: [['Objetivos', clamp(r0 / 20, 0.1, 1), `${r0}`], ['Llegada', clamp(1 - ba / 8, 0.1, 1), `${ba} s`], ['Golpe', 0.34, '1 vida']] };
  }
  const F = e.foes, tiny = e.tiny, G0 = e.ground.length ? e.ground : [tiny ? 'spider' : 'robot'], ground = F === 'robots' || (F === 'mix' && Math.floor(bi / 5) % 2 === 0);
  let k: string, pre: string;
  if (!ground) {
    k = e.fly.includes('dragon') ? 'dragon' : 'carrier';
    pre = 'f:';
  } else {
    k = !tiny && G0.includes('captain') ? 'captain' : G0.length === 1 ? G0[0] : G0.includes(tiny ? 'spider' : 'robot') ? (tiny ? 'spider' : 'robot') : G0[0];
    pre = tiny ? 'h:' : 'g:';
  }
  // (la resistencia del jefe, como en buildWave: el 30 % de los disparos de su oleada, 4 como poco)
  const name = k === 'carrier' ? 'La nodriza' : k === 'robot' ? 'El titán' : k === 'spider' ? 'Araña gigante' : foeName(k);
  const D = e.devFoe(pre + (k === 'carrier' ? 'drone' : k)), tier = e.foeTier(k === 'carrier' ? 'drone' : k);
  const hp = Math.max(4, Math.round(e.waveReps(bi) * (e.twoShots ? 2 : 1) * 0.3));
  return { draw: DUEL_DRAW[k] || 'yeti', name, note, bars: [['Resistencia', clamp(hp / 24, 0.1, 1), `${hp}`], ['Fuerza', clamp(D.str / 3, 0.1, 1), `${D.str} ${D.str === 1 ? 'vida' : 'vidas'}`], ['Dureza', clamp(tier / 4, 0.1, 1), `${tier}/4`]] };
}

/** Tu récord con este ejercicio (el mismo que el resumen); al fallo, la oleada más lejana (RepArena: introRecord). */
export function duelRecord(e: Pick<DuelEnv, 'exercise' | 'mode' | 'toFail'>, hist: DuelHist[] | null | undefined): string {
  const h = (hist || []).filter((r) => r.ex === e.exercise), hang = e.exercise === 'hang';
  if (e.toFail) {
    const f = h.filter((r) => r.mode === e.mode && r.fail).reduce((a, r) => Math.max(a, r.fail as number), 0);
    return f ? `Récord al fallo: oleada ${f}` : 'Aún sin récord al fallo';
  }
  const b = h.reduce((a, r) => Math.max(a, r.reps || 0), 0);
  return b ? `Récord: ${b} ${hang ? 's colgado' : 'reps'}` : 'Aún sin récord';
}

/** La escena de la ilustración: tu postura, la silueta del jefe y lo que pasa entre los dos (RepArena: introScene). */
export function duelScene(e: DuelEnv): DuelScene {
  const ex = e.exercise, m = e.mode;
  const pose: DuelPose = e.bars ? 'hang' : m === 'arcs' ? 'deep' : m === 'touch' ? 'reach' : e.floor || e.tiny || e.supine ? 'plank' : ex === 'lunge' ? 'lunge' : 'squat';
  const B = duelBoss(e), what = m === 'arcs' ? (B.draw ? 'mace' : 'arcs') : m === 'touch' ? 'diamond' : e.bars ? 'bubble' : 'bolt';
  return { pose, boss: B.draw, what: what === 'mace' ? '' : what, B }; // (con la maza no hay rayo: es ella contra ti)
}

/** El nombre del ejercicio, en grande (RepArena: introName). */
export const duelName = (e: Pick<DuelEnv, 'exercise'>): string => (EX_NAMES[e.exercise] || '').toUpperCase();

/** Encima: el modo y la zona del cuerpo (RepArena: introSub). */
export function duelSub(e: Pick<DuelEnv, 'exercise' | 'mode'>): string {
  const z = (BODY_ZONES.find((z) => z[1].includes(e.exercise)) || [''])[0];
  return (MODE_NAMES[e.mode] + (z ? ' · ' + z : '')).toUpperCase();
}
