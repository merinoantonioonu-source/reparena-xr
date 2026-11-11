/**
 * Las oleadas del modo Toques y su paso, tal cual en RepArena (src/74_touch.js: comboMoves, buildTouchWave, snapBeat,
 * tchGapFor, touchStartWave, touchRearm, touchStep, touchLeft, tchGates, touchClear y touchAssist): qué objetivos trae cada
 * oleada, cuándo llega cada uno y el paso de cada fotograma. Con un ritmo (BPM) llegan justo en el pulso (la música llega
 * en un PR posterior: sin «bpm», el pulso es 0 y llegan a su separación).
 *
 * Cada fotograma, la partida llama a touchStep(tch, cola, dt, t) con el entorno al día (tch.env: state, head, headSpeed,
 * hands) y aplica los sucesos que devuelve, en su orden (ver TouchEvent en env.ts). Sin IWSDK: se compara con RepArena
 * en tests/compare/touch.compare.test.ts.
 */
import type { TouchEnv, TouchEvent } from './env.js';
import { CUT_MOVES, SLAM_HAND, SLAM_HEAD, SWORD_CUTS, TCH_MOVES, TouchTarget, pick, pickW, sampleHands, tchPeriod, type TouchPart, type TouchState } from './targets.js';

/** Un objetivo de la cola de la oleada: su movimiento y, en el Slam, su lado (−1 o 1). */
export interface TouchSpec {
  move: string;
  hp: number;
  side?: number;
}

/** Los movimientos elegidos del combinado, según su postura (RepArena: comboMoves). */
export function comboMoves(env: TouchEnv): string[] {
  const key = ({ stand: 'comboStand', floor: 'comboFloor', abs: 'comboAbs' } as Record<string, string>)[env.str('comboBase')];
  return (key ? env.str(key) : '').split(',').filter(Boolean);
}

/** ¿Espadas en Toques? (RepArena: swordSet, en Toques: el ajuste y un ejercicio de pie). */
export const swordSet = (env: TouchEnv): boolean => env.str('sword') !== 'off' && (['squat', 'lunge', 'jump', 'slam'].includes(env.str('exercise')) || (env.str('exercise') === 'combo' && env.str('comboBase') === 'stand'));

/** Los objetivos de la oleada i (RepArena: buildTouchWave), con las mismas llamadas al azar. */
export function buildTouchWave(tch: TouchState, i: number): TouchSpec[] {
  const env = tch.env, n = env.waveReps(i), list: TouchSpec[] = [], ex = env.str('exercise');
  if (ex === 'combo') {
    const mv = comboMoves(env);
    for (let k = 0; k < n; k++) {
      let m = env.str('comboOrder') === 'seq' ? mv[tch.seq++ % mv.length] : pick(env, mv);
      if (swordSet(env) && (m === 'punch' || m === 'reach')) m = pick(env, CUT_MOVES);
      list.push({ move: m, hp: 1 });
    }
  } else if (ex === 'slam') {
    // alternando de lado, sin repetir mucho el mismo movimiento
    let side = env.rnd() < 0.5 ? -1 : 1, prev = '';
    for (let k = 0; k < n; k++) {
      const hands = env.rnd() * 100 < env.s('tchHands'), pool = hands ? (swordSet(env) ? SWORD_CUTS.slam.map((m): [string, number] => [m, 1]) : SLAM_HAND) : SLAM_HEAD;
      let m = pickW(env, pool);
      if (m === prev) m = pickW(env, pool);
      prev = m;
      side = -side;
      list.push({ move: m, hp: 1, side });
    }
  } else {
    let [head, hand] = TCH_MOVES[ex] || TCH_MOVES.squat;
    if (ex === 'abs') {
      // los elegidos (Movimientos): si solo hay de un tipo, todos de ese tipo
      const sel = env.str('absMoves').split(',');
      head = head.filter((m) => sel.includes(m));
      hand = ['knee', 'side', 'twist'].filter((m) => sel.includes(m));
      if (!head.length) head = hand;
      if (!hand.length) hand = head;
    }
    const hm = swordSet(env) && SWORD_CUTS[ex] ? SWORD_CUTS[ex] : hand;
    for (let k = 0; k < n; k++) list.push({ move: hm.length && env.rnd() * 100 < env.s('tchHands') ? pick(env, hm) : pick(env, head), hp: 1 });
  }
  return list;
}

/** Con ritmo, el instante (en el reloj del modo) del primer pulso a partir de c; sin ritmo, c (RepArena: snapBeat). */
export function snapBeat(tch: TouchState, c: number): number {
  const P = tchPeriod(tch.env);
  if (!P) return c;
  const off = tch.env.now() - tch.clock, at = c + off, k = Math.ceil((at - tch.beat0) / P - 1e-6);
  return tch.beat0 + k * P - off;
}

/** La separación hasta el siguiente (la plancha, más su aguante); con ritmo, en pulsos enteros (RepArena: tchGapFor). */
export function tchGapFor(env: TouchEnv, move: string): number {
  const P = tchPeriod(env), base = env.dv('tchGap') + (move === 'plank' ? env.s('plankHold') : 0);
  return P ? Math.max(1, Math.round(base / P)) * P : base;
}

/** Al empezar cada oleada (RepArena: touchStartWave): el primero llega pasado «Tiempo que tardan en llegar» y algo. */
export function touchStartWave(tch: TouchState): void {
  tch.nextArrive = snapBeat(tch, tch.clock + tch.env.dv('tchArrive') + 0.6);
  touchRearm(tch);
}

/** Todo vuelve a la postura de partida (RepArena: touchRearm). */
export function touchRearm(tch: TouchState): void {
  tch.headArm.armed = true;
  tch.hadHL = false;
  for (const s of ['left', 'right'] as const) Object.assign(tch.arm[s], { armed: true, had: false, n: 0 });
}

/** ¿Queda alguno por tocar? (RepArena: touchLeft). */
export const touchLeft = (tch: TouchState): boolean => tch.touches.some((x) => x.alive && !x.judged);

/**
 * Un fotograma (RepArena: touchStep): saca el siguiente de la cola (`queue`, la de la oleada: se le quita) cuando le toca,
 * mira las manos y mueve y juzga los objetivos. Devuelve los sucesos (el mismo arreglo cada vez: aplícalos antes del
 * paso siguiente). `t`, el reloj de la partida (para el serpenteo de las amebas). Deja en tch.gatesOpen si las
 * compuertas de delante tienen que estar abiertas (la partida les pone openT = max(openT, 0,6)).
 */
export function touchStep(tch: TouchState, queue: TouchSpec[], dt: number, t: number): TouchEvent[] {
  const env = tch.env, st = env.state;
  tch.ev.length = 0;
  tch.gatesOpen = false;
  if (st !== 'paused') tch.clock += dt;
  if (st === 'play' && queue.length && tch.clock >= tch.nextArrive - env.dv('tchArrive')) {
    const spec = queue.shift() as TouchSpec, x = new TouchTarget(tch, spec.move, Math.max(tch.nextArrive, tch.clock + 0.3), spec.side);
    tch.touches.push(x);
    tch.nextArrive = Math.max(tch.nextArrive, tch.clock) + tchGapFor(env, spec.move);
    tch.ev.push({ type: 'spawn', t: x });
  }
  if (st === 'paused') return tch.ev;
  // la compuerta de delante (por donde llegan), abierta mientras dura la oleada; al acabar se cierra y vuelve a abrirse
  // con la siguiente
  tch.gatesOpen = st === 'play' && (queue.length > 0 || touchLeft(tch));
  tch.hintT -= dt;
  sampleHands(tch, dt);
  for (const x of tch.touches) if (x.alive) x.update(dt, t);
  if (tch.touches.some((x) => !x.alive)) tch.touches = tch.touches.filter((x) => x.alive);
  tch.prevHL.copy(env.head);
  tch.hadHL = true;
  return tch.ev;
}

/** Las compuertas que quedan delante (a menos de 30° del frente); si no hay ninguna, la más centrada (RepArena: tchGates;
 * la partida pasa solo las que se ven). */
export function frontGates<G extends { x: number; z: number }>(live: G[]): G[] {
  const ang = (g: G) => Math.abs(Math.atan2(g.x, -g.z));
  const front = live.filter((g) => ang(g) < 0.52);
  if (front.length || !live.length) return front;
  return [live.reduce((a, b) => (ang(b) < ang(a) ? b : a))];
}

/** Quita todos (RepArena: touchClear): devuelve los que había, para que la partida quite lo que se ve. */
export function touchClear(tch: TouchState): TouchTarget[] {
  const old = tch.touches.filter((x) => x.alive);
  for (const x of old) x.alive = false;
  tch.touches = [];
  touchRearm(tch);
  return old;
}

/** En el ordenador: el siguiente objetivo al que llevar la cabeza (Espacio) o la mano (G). Si esa parte aún no ha vuelto
 * a su postura tras el toque anterior, ninguno: así vuelve primero a casa (RepArena: touchAssist). */
export function touchAssist(tch: TouchState, part: TouchPart): TouchTarget | null {
  let best: TouchTarget | null = null;
  for (const x of tch.touches) if (x.alive && !x.judged && x.part === part && (x.mode !== 'approach' || tch.clock > x.arriveAt - 0.6) && (!best || x.arriveAt < best.arriveAt)) best = x;
  if (!best || (part === 'head' ? !tch.headArm.armed && !best.hold : !tch.arm[best.hand].armed)) return null;
  return best;
}
