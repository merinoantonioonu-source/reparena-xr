/**
 * Lo que llevan los Arcos a lo largo de la ronda, como en RepArena (src/71_arcs.js: ARX y sus funciones), sin nada que se
 * vea ni se oiga: la racha y la fiebre (10 seguidos sin fallo: más deprisa y puntos ×2 hasta que te dan), los metros
 * recorridos, cuándo sale un orbe, la línea de tus puntos cada 2 s (el fantasma de tu mejor ronda) y la medalla al acabar.
 * Lo que RepArena hacía a la vez (cheer, SND, arxFeverLook, arxFeverStart, store) se devuelve como sucesos o datos: la
 * partida los pinta, los suena y los guarda. Sin IWSDK: se compara con RepArena en tests/compare/arcs-extras.compare.test.ts.
 */
import type { ArcsEnv } from './env.js';

/** Donde RepArena guarda el fantasma (la misma clave y la misma forma: las dos versiones lo comparten). */
export const ARX_GHOST = 'reparena3-arcghost';

/** Tu mejor ronda: los puntos, los metros y los puntos cada 2 s (RepArena: { score, dist, tl }). */
export interface ArxGhost {
  score: number;
  dist: number;
  tl: number[];
}

/** Un aviso al marcador (RepArena: cheer(texto, color, segundos)). */
export type ArxCheer = [string, string, number];

/** Lo que pasa al sumar o romper la racha, para que la partida lo haga (RepArena lo hacía allí mismo). */
export interface ArxEvent {
  cheer?: ArxCheer;
  /** El sonido (RepArena: SND.combo al entrar en fiebre; SND.horn al subir la música). */
  sound?: 'combo' | 'horn';
  /** Encender o apagar el aspecto de la fiebre (RepArena: arxFeverLook). */
  feverLook?: boolean;
  /** El relámpago enorme y el trueno del principio de la fiebre (RepArena: arxFeverStart). */
  feverStart?: boolean;
}

/** El estado de los Arcos en la ronda (RepArena: ARX; los orbes los lleva la partida: ArcOrbCore, obstacles.ts). */
export class ArxState {
  streak = 0;
  fever = false;
  /** Cuántas fiebres van en la ronda (cada una, más deprisa). */
  feverN = 0;
  /** Los metros recorridos. */
  dist = 0;
  /** Lo que falta para que salga el orbe (−1: ninguno pendiente; 1e-4: ya toca, esperando al pulso). */
  orbT = -1;
  /** Los orbes cogidos (y, de ellos, en el pulso). */
  got = 0;
  gotBeat = 0;
  /** La frase de la canción ('hot', 'calm' o '' sin música). */
  phrase = '';
  /** Tus puntos cada 2 s y el reloj de esa cuenta. */
  tl: number[] = [];
  tlT = 0;
  /** El fantasma (tu mejor ronda guardada) o null. */
  best: ArxGhost | null = null;
  /** El hueco hasta el siguiente (en veces el intervalo medio) y lo mínimo que hay que esperar (plancha, semipuente). */
  nextGap = 0;
  minNext = 0;
  /** El último pulso de llegada visto, del siguiente obstáculo y del orbe (−1: ninguno). */
  bk = -1;
  obk = -1;
}

/** Al empezar la ronda (RepArena: arxReset): todo a cero y el fantasma, el que hay guardado. El aspecto de la fiebre, apagado. */
export function arxReset(st: ArxState, best: ArxGhost | null): ArxEvent {
  Object.assign(st, { streak: 0, fever: false, feverN: 0, dist: 0, orbT: -1, got: 0, gotBeat: 0, phrase: '', tl: [], tlT: 0, nextGap: 0, best });
  return { feverLook: false };
}

/** Lo que la fiebre acelera lo que llega: la primera, un 20 %; cada una de las siguientes, «Fiebre +» más (hasta el doble). */
export function arxMul(st: ArxState, env: ArcsEnv): number {
  const up = env.s('arcFeverUp');
  return st.fever ? Math.min(2, 1.2 + (up >= 0 ? up : 10) / 100 * (st.feverN - 1)) : 1;
}

/** Los puntos valen el doble en la fiebre. */
export const arxPtsK = (st: ArxState): number => (st.fever ? 2 : 1);

/** Bien pasado, sin que te dé (RepArena: arxClean): suma a la racha; con 10 seguidos, la fiebre (si está activada). */
export function arxClean(st: ArxState, env: ArcsEnv): ArxEvent | null {
  st.streak++;
  if (env.s('arcFever') && !st.fever && st.streak >= 10) {
    st.fever = true;
    st.feverN++;
    const text = st.feverN > 1 ? `¡FIEBRE ${st.feverN}! Más deprisa · ×2` : '¡MODO FIEBRE! Puntos ×2';
    return { feverLook: true, feverStart: true, cheer: [text, '#ff4fa3', 1.8], sound: 'combo' };
  }
  return null;
}

/** Te ha dado (RepArena: arxHit): se acaba la racha y, si la había, la fiebre. */
export function arxHit(st: ArxState): ArxEvent {
  const ev: ArxEvent = { feverLook: false };
  if (st.fever) ev.cheer = ['Fin de la fiebre', '#a49fc8', 1.2];
  st.streak = 0;
  st.fever = false;
  return ev;
}

/* ---------- Al compás de la música (sin música, beatP = 0: nada de esto cambia el juego) ---------- */

/** Cuándo llega a ti lo que sale ahora, en pulsos: dice si acaba de pasar el pulso de llegada (RepArena: arxBeatTick y
 * arxOrbBeat; la velocidad, la de lo que va a salir: la partida pone la del arco de plancha si es él). */
function beatCross(st: ArxState, env: ArcsEnv, key: 'bk' | 'obk', speed: number, beatNow: number): boolean {
  const P = env.beatP;
  if (!P) {
    st[key] = -1;
    return true;
  }
  const k = Math.floor(beatNow + (env.head.z + env.arenaDepth - 0.9) / Math.max(0.3, speed) / P), hit = st[key] >= 0 && k !== st[key];
  st[key] = k;
  return hit;
}
/** Si el siguiente obstáculo puede salir ya para llegar a ti en un pulso (RepArena: arxBeatTick). */
export const arxBeatTick = (st: ArxState, env: ArcsEnv, speed: number, beatNow: number): boolean => beatCross(st, env, 'bk', speed, beatNow);
/** Lo mismo para el orbe (RepArena: arxOrbBeat). */
export const arxOrbBeat = (st: ArxState, env: ArcsEnv, speed: number, beatNow: number): boolean => beatCross(st, env, 'obk', speed, beatNow);

/** La frase de la canción: cada 32 pulsos, una intensa y otra de respiro (RepArena: arxPhrase; sin música, ''). */
export const arxPhrase = (env: ArcsEnv, beatNow: number): string => (env.s('arcPhrases') && env.beatP ? (Math.floor(beatNow / 32) % 2 ? 'hot' : 'calm') : '');

/** Al empezar la frase intensa, se anuncia (RepArena: arxPhraseStep). */
export function arxPhraseStep(st: ArxState, env: ArcsEnv, beatNow: number, play: boolean): ArxEvent | null {
  const ph = arxPhrase(env, beatNow);
  if (ph === st.phrase) return null;
  st.phrase = ph;
  return ph === 'hot' && play ? { cheer: ['¡SUBE LA MÚSICA!', '#ff4fa3', 1.4], sound: 'horn' } : null;
}

/** El hueco hasta el siguiente, en pulsos (en compases de dos si es largo), medio pulso antes (RepArena: arxBeatGap). */
export function arxBeatGap(env: ArcsEnv, sec: number, beatNow: number): number {
  const P = env.beatP;
  if (!P) return sec;
  const ph = arxPhrase(env, beatNow);
  sec *= ph === 'hot' ? 0.65 : ph === 'calm' ? 1.25 : 1;
  let n = Math.max(1, Math.round(sec / P));
  if (n >= 4) n = Math.round(n / 2) * 2;
  return (n - 0.5) * P;
}

/** El brillo del pulso (0,7 lejos de él, 1,3 en él; sin música, 1) (RepArena: arxBeatGlow). */
export function arxBeatGlow(env: ArcsEnv, beatNow: number): number {
  if (!env.beatP) return 1;
  const f = ((beatNow % 1) + 1) % 1;
  return 0.7 + 0.6 * Math.pow(1 - f, 3);
}

/* ---------- Cada fotograma ---------- */

/** Lo que la partida da a arxStep. */
export interface ArxFrame {
  /** En partida (RepArena: state === 'play'). */
  play: boolean;
  /** El panel grande entre oleadas está delante (RepArena: WIN.t >= 0): mientras, no sale nada. */
  winOpen: boolean;
  /** La velocidad de ahora (m/s; RepArena: arxSpeed()). */
  speed: number;
  /** Los puntos de ahora. */
  score: number;
  /** Los pulsos desde la referencia (RepArena: beatNow(); sin música, 0). */
  beatNow: number;
}

/** Lo que pasa en el fotograma (reutilizado: no se crea nada en cada uno). */
export interface ArxStepOut {
  /** Toca crear un orbe (RepArena: ARX.orbs.push(new ArcOrb())). */
  spawnOrb: boolean;
  /** El marcador tiene que repintarse (cada 8 s de línea). */
  boardDirty: boolean;
  /** El anuncio de la frase intensa, si toca. */
  event: ArxEvent | null;
}

const STEP_OUT: ArxStepOut = { spawnOrb: false, boardDirty: false, event: null };

/** Los Arcos en cada fotograma (RepArena: arxStep, sin la decoración ni el vuelo de los orbes, que mueve la partida):
 * la frase, cuándo sale el orbe (a medio camino entre dos arcos; con música, para que llegue a ti en un pulso), los metros
 * y la línea de los puntos. Solo en Arcos (la partida lo comprueba). */
export function arxStep(st: ArxState, env: ArcsEnv, dt: number, f: ArxFrame): ArxStepOut {
  const o = STEP_OUT;
  o.spawnOrb = false;
  o.boardDirty = false;
  o.event = arxPhraseStep(st, env, f.beatNow, f.play);
  const ok = arxOrbBeat(st, env, f.speed, f.beatNow);
  if (st.orbT > 0 && f.play && !f.winOpen) {
    st.orbT -= dt;
    if (st.orbT <= 0) st.orbT = 1e-4; // (ya toca: espera al pulso)
  }
  if (st.orbT > 0 && st.orbT <= 1e-4 && f.play && ok) {
    st.orbT = -1;
    o.spawnOrb = true;
  }
  if (!f.play) return o;
  st.dist += f.speed * dt;
  st.tlT += dt;
  if (st.tlT >= 2) {
    st.tlT -= 2;
    st.tl.push(f.score);
    if ((st.tl.length & 3) === 0) o.boardDirty = true;
  }
  return o;
}

/** El fantasma: tus puntos de ahora menos los de entonces en tu mejor ronda (RepArena: arxGhostDiff; null si no hay). */
export function arxGhostDiff(st: ArxState, score: number): number | null {
  const B = st.best;
  if (!B || !B.tl || !B.tl.length) return null;
  const i = Math.min(B.tl.length - 1, st.tl.length), g = i < 0 ? 0 : B.tl[i] || 0;
  return score - g;
}

/** Lo que sale al acabar la ronda (RepArena: lo que devuelve arxEnd, más el fantasma que hay que guardar). */
export interface ArxEnd {
  /** La medalla y su color, o null. */
  medal: [string, string] | null;
  dist: number;
  orbs: number;
  /** Récord de puntos (solo si ya había un fantasma) y más lejos que entonces. */
  rec: boolean;
  farther: boolean;
  /** El fantasma nuevo, para guardar en ARX_GHOST (RepArena: store), o null si no hay que guardarlo. */
  ghost: ArxGhost | null;
}

/** Al acabar (RepArena: arxEnd): la medalla por los que pasaste sin que te dieran (95 % oro, 80 % plata, 60 % bronce) y,
 * si fue tu mejor ronda, el fantasma nuevo. `reps` y `taken`: los pasados y los golpes (RepArena: stats.reps, stats.taken). */
export function arxEnd(st: ArxState, score: number, reps: number, taken: number): ArxEnd {
  const n = reps + taken, k = n ? reps / n : 0;
  const medal: [string, string] | null = !n ? null : k >= 0.95 ? ['oro', '#ffd166'] : k >= 0.8 ? ['plata', '#d8dce6'] : k >= 0.6 ? ['bronce', '#e0975a'] : null;
  const prev = st.best, rec = !prev || score > (prev.score || 0), farther = !prev || st.dist > (prev.dist || 0);
  const ghost = rec && reps ? { score, dist: Math.round(st.dist), tl: st.tl.concat(score).slice(0, 600) } : null;
  return { medal, dist: Math.round(st.dist), orbs: st.got, rec: rec && !!prev && reps > 0, farther: farther && !!prev && st.dist > 0, ghost };
}
