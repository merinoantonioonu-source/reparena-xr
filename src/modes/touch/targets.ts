/**
 * Los objetivos del modo Toques, tal cual en RepArena (src/74_touch.js: TCH_MOVES, moveSpec, sampleHands, segDist,
 * touchHint y TouchTarget), solo la lógica: dónde sale cada uno, cómo llega, cuándo se toca, si es perfecto y la vuelta a
 * la postura de partida entre un toque y el siguiente. Lo que se ve (el aro de neón, el diamante, el pulsador, el bloque)
 * lo pinta la partida a partir de lo que hay aquí (`at`, `q`, `mode`, `popT`, `scale`…) y de los sucesos.
 *
 * Vienen hacia ti aros de neón (las «amebas»: mete la cabeza por el hueco) y diamantes con la mano que los toca dibujada
 * (izquierda azul, derecha naranja). Cada uno espera un momento delante de ti; si no lo tocas, pasa de largo y te golpea.
 * Entre un toque y el siguiente hay que volver a la postura de partida: la cabeza a su altura (o al centro, tras una a un
 * lado) y la mano atrás. Con espadas, los diamantes de pie son bloques que se cortan en la dirección de su flecha.
 *
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/touch.compare.test.ts.
 */
import { Quaternion, Vector3 } from 'three';
import type { Side } from '../../input/hand-model.js';
import type { TouchEnv, TouchEvent } from './env.js';

const TAU = Math.PI * 2;
const SIDES: Side[] = ['left', 'right'];
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** El azar de RepArena (rand, pick), con el del entorno. */
export const rand = (env: TouchEnv, a: number, b: number): number => a + env.rnd() * (b - a);
export const pick = <T>(env: TouchEnv, arr: readonly T[]): T => arr[Math.floor(env.rnd() * arr.length)];

/** Los colores de cada parte: la cabeza turquesa, la izquierda azul, la derecha naranja (RepArena: TCH_COL). */
export const TCH_COL = { head: 0x3cf0c6, left: 0x4aa8ff, right: 0xff9a3c } as const;
export const HAND_NAME: Record<Side, string> = { left: 'izquierda', right: 'derecha' };

// Slam (de pie): cada objetivo obliga a moverse de verdad, y alternan de lado: amebas muy abajo (sentadilla profunda), a un
// lado (zancada lateral), delante y abajo (zancada) o arriba (salto); diamantes a ras de suelo (agacharse a tocarlos) o
// por encima de la cabeza (estirarse de puntillas); floor: pulsadores en el suelo. Con su peso al elegir.
export const SLAM_HEAD: [string, number][] = [['duck', 3], ['lside', 4], ['lfwd', 2], ['jump', 2]];
export const SLAM_HAND: [string, number][] = [['floor', 3], ['low', 2], ['reach', 1]];
/** Elige con peso (RepArena: pickW). */
export function pickW(env: TouchEnv, L: [string, number][]): string {
  let r = env.rnd() * L.reduce((a, x) => a + x[1], 0);
  for (const [m, w] of L) if ((r -= w) <= 0) return m;
  return L[0][0];
}
/** Los movimientos de cada ejercicio: los de la cabeza (amebas) y los de las manos (diamantes). En flexiones, solo
 * amebas: las manos están apoyadas. */
export const TCH_MOVES: Record<string, [string[], string[]]> = {
  slam: [SLAM_HEAD.map((x) => x[0]), SLAM_HAND.map((x) => x[0])],
  squat: [['squat'], ['punch']],
  lunge: [['lunge'], ['punch']],
  jump: [['jump'], ['reach']],
  abs: [['crunch'], ['knee', 'twist']],
  pushup: [['push'], []],
};
/** Los que se tocan con la mano (side: abdominal lateral, por un costado; twist: oblicuo, con la mano contraria). */
export const HAND_MOVES = ['punch', 'reach', 'tap', 'knee', 'side', 'twist', 'low', 'floor'];
/** Con espadas, los bloques: bajo (sentadilla), adelantado (zancada), a un lado (inclinarse) o muy alto (saltar). */
export const CUT_MOVES = ['cutLow', 'cutFwd', 'cutSide', 'cutHigh'];
export const SWORD_CUTS: Record<string, string[]> = { slam: ['cutLow', 'cutSide', 'cutFwd', 'cutHigh'], squat: ['cutLow', 'cutSide'], lunge: ['cutFwd', 'cutLow', 'cutSide'], jump: ['cutHigh', 'cutSide'] };
export const CUT_POSE: Record<string, string> = { cutLow: '¡Agáchate para cortarlo!', cutFwd: '¡Da un paso adelante!', cutSide: '¡Inclínate hacia ese lado!', cutHigh: '¡Salta para cortarlo!' };
/** Radio de toque del diamante (más el grosor de los dedos). */
export const GEM_R = 0.15;
/** Puntos de cada mano que pueden tocar: puntas, nudillos y muñeca (con mando, el mando y su punta). */
export const TOUCH_J = [0, 4, 6, 9, 11, 14, 16, 19, 21, 24];

const FLOOR_EX = ['pushup', 'pike', 'plank1', 'plankrow', 'superman', 'abs', 'splank'];
/** En el suelo (plancha o boca arriba) y boca arriba (RepArena: isFloor, isSupine). */
export const isFloor = (env: TouchEnv): boolean => FLOOR_EX.includes(env.str('exercise')) || (env.str('exercise') === 'combo' && env.str('comboBase') !== 'stand');
export const isSupine = (env: TouchEnv): boolean => env.str('exercise') === 'abs' || (env.str('exercise') === 'combo' && env.str('comboBase') === 'abs');
/** Tu altura de pie, entre 1,2 y 2,05 m (RepArena: standHeadY). */
const standHeadY = (env: TouchEnv): number => clamp(env.standY || 1.6, 1.2, 2.05);

export type TouchPart = 'head' | 'hand' | 'cut';

/** Dónde aparece y llega cada movimiento (coordenadas de la arena). */
export interface MoveSpec {
  move: string;
  part: TouchPart;
  /** La mano que lo toca (el oblicuo, la contraria; con una espada, la de la espada). */
  hand: Side;
  /** Hacia dónde mira la ameba (de cara a ti). */
  n: Vector3;
  /** El radio del hueco de la ameba (m). */
  r: number;
  /** Segundos que hay que aguantar dentro (la plancha); 0 si no. */
  hold: number;
  /** Dónde espera y de dónde sale. */
  pos: Vector3;
  from: Vector3;
  /** Los bloques: el ángulo de la flecha (en su plano), su giro, su normal y la dirección del tajo. */
  ang: number;
  yaw: number;
  normal: Vector3 | null;
  cutDir: Vector3 | null;
}

/**
 * Dónde aparece cada movimiento (RepArena: moveSpec): `S`, tu altura de partida (TCH.ref); `sd0`, el lado (−1 izquierda,
 * 1 derecha; 0, al azar). Las mismas llamadas al azar, en el mismo orden.
 */
export function moveSpec(env: TouchEnv, S: number, move: string, sd0 = 0): MoveSpec {
  const r = env.s('tchRing') / 100, D = env.ar ? 4 : 6.5, side = sd0 || (env.rnd() < 0.5 ? -1 : 1);
  const sd = env.dv('squatDepth') / 100, pd = env.dv('pushDepth') / 100, jh = env.s('jumpHeight') / 100;
  const o: MoveSpec = { move, part: CUT_MOVES.includes(move) ? 'cut' : HAND_MOVES.includes(move) ? 'hand' : 'head', hand: side < 0 ? 'left' : 'right', n: new Vector3(0, 0, 1), r, hold: 0, pos: new Vector3(), from: new Vector3(), ang: 0, yaw: 0, normal: null, cutDir: null };
  const rin = r * 0.75; // la cabeza está dentro si su centro cae a menos de esto del centro de la ameba
  const R3 = (a: number, b: number) => rand(env, a, b);
  if (move === 'lunge') {
    const ld = env.dv('lungeDepth') / 100, lo = rin + 0.05; // un paso por delante
    o.pos.set(R3(-0.06, 0.06), S - R3(Math.max(lo, ld * 0.55), Math.max(lo + 0.03, ld)), -0.3);
  } else if (move === 'squat') {
    const lo = rin + 0.05;
    o.pos.set(R3(-0.08, 0.08), S - R3(Math.max(lo, sd * 0.55), Math.max(lo + 0.03, sd)), -0.05);
  } else if (move === 'jump') o.pos.set(R3(-0.06, 0.06), S + jh + rin, -0.08);
  // las del Slam: muy abajo (más que una sentadilla, slamDeep cm más), a un lado (hay que dar el paso), delante y abajo, a ras
  // de suelo o, en el suelo, un pulsador que hay que golpear con la mano; nunca por debajo de media altura
  else if (move === 'duck') {
    const lo = rin + 0.05, dd = sd + env.s('slamDeep') / 100;
    o.pos.set(side * R3(0, 0.12), Math.max(S * 0.5, S - R3(Math.max(lo, dd), Math.max(lo + 0.04, dd + 0.1))), -0.05);
  } else if (move === 'lside') {
    const dd = (env.s('slamDeep') / 100) * 0.6;
    o.pos.set(side * R3(0.42, 0.62), S - R3(0.12, 0.24) - dd, -0.06);
  } else if (move === 'lfwd') {
    const ld = env.dv('lungeDepth') / 100 + (env.s('slamDeep') / 100) * 0.6;
    o.pos.set(side * R3(0, 0.1), Math.max(S * 0.5, S - R3(Math.max(rin + 0.05, ld * 0.8), Math.max(rin + 0.08, ld * 1.1))), -0.48);
  } else if (move === 'low') o.pos.set(side * R3(0.16, 0.34), clamp(S * 0.24, 0.3, 0.5) + R3(-0.03, 0.03), -0.42);
  else if (move === 'floor') o.pos.set(side * R3(0.18, 0.34), 0.03, -R3(0.3, 0.42));
  else if (move === 'punch') o.pos.set(side * R3(0.15, 0.3), S - 0.3 + R3(-0.05, 0.05), -0.45);
  else if (move === 'reach') o.pos.set(side * R3(0.2, 0.35), S + 0.5 + jh, -0.2);
  else if (move === 'push' || move === 'plank') {
    o.r = clamp(r * 0.65, 0.07, 0.13);
    const ri = o.r * 0.75;
    // en la flexión, a veces algo desplazada hacia un hombro: obliga a cargar el peso en ese brazo
    const px = move === 'push' && env.rnd() < 0.6 ? side * R3(0.07, 0.14) : 0;
    // altura sobre el suelo: entre la mínima y la máxima de los ajustes (0: según la bajada en la flexión), y siempre algo
    // por debajo de tu cabeza en plancha, para que haya que bajar
    let lo = S - Math.max(ri + 0.05, pd), hi = S - Math.max(ri + 0.03, pd * 0.6);
    if (env.s('tchPushLo')) lo = env.s('tchPushLo') / 100;
    if (env.s('tchPushHi')) hi = env.s('tchPushHi') / 100;
    const top = S - ri - 0.03;
    hi = Math.min(Math.max(lo, hi), top);
    lo = Math.min(lo, hi);
    if (move === 'push') o.pos.set(px, R3(lo, hi), -0.06);
    else o.pos.set(0, S, -0.06);
    if (move === 'plank') {
      o.r *= 1.15;
      o.hold = env.s('plankHold');
    }
  } else if (move === 'tap') o.pos.set(side * R3(0.25, 0.35), Math.max(0.12, S - 0.15), -0.2);
  else if (move === 'cutLow') o.pos.set(side * R3(0.1, 0.3), S - sd - 0.3, -0.55);
  else if (move === 'cutFwd') o.pos.set(side * R3(0, 0.2), S - 0.4, -1.05);
  else if (move === 'cutSide') o.pos.set(side * 0.8, S - 0.35, -0.35);
  else if (move === 'cutHigh') o.pos.set(side * R3(0, 0.2), S + 0.45 + jh, -0.55);
  else {
    // boca arriba: la cabeza gira alrededor de la cadera (a R por debajo, hacia los pies)
    const R = clamp(standHeadY(env) * 0.34, 0.45, 0.65), hip = new Vector3(0, S, -R);
    if (move === 'knee') o.pos.set(side * R3(0.04, 0.15), S + 0.3 + R3(0, 0.1), -R - 0.3); // manos a las rodillas: subir el tronco hasta tocarlo
    // oblicuo: a un lado, junto a la rodilla de ese lado, y se toca con la mano CONTRARIA cruzando por delante del cuerpo
    // (gira el tronco). «Giro del tronco», cuánto se aparta
    else if (move === 'twist') {
      o.pos.set(side * (0.22 + 0.4 * Math.sin((env.s('abTwist') * Math.PI) / 180)), S + 0.22 + R3(0, 0.08), -R - R3(0.15, 0.3));
      o.hand = side < 0 ? 'right' : 'left';
    }
    // abdominal lateral: junto a la cadera, a ras de suelo y bien abierto hacia un lado; se llega inclinando el tronco
    else if (move === 'side') o.pos.set(side * R3(0.36, 0.46), clamp(S - 0.02, 0.08, 0.25) + R3(0, 0.06), -R - R3(0.1, 0.3));
    else {
      // el abdominal: en el arco del tronco, entre «Tronco elevado» mínimo y máximo
      const th = (R3(env.s('abMin'), Math.max(env.s('abMin'), env.s('abMax'))) * Math.PI) / 180, ph = 0;
      o.pos.copy(hip).add(new Vector3(R * Math.sin(th) * Math.sin(ph), R * Math.sin(th) * Math.cos(ph), R * Math.cos(th)));
      o.n.set(Math.cos(th) * Math.sin(ph), Math.cos(th) * Math.cos(ph), -Math.sin(th)).normalize().negate(); // de cara a ti
    }
  }
  if (o.part === 'cut') {
    // la flecha: hacia dónde hay que cortar (en el plano del bloque, que te mira)
    const dirs = ({ cutLow: [-90, -90, 0, 180, -45, -135], cutFwd: [-90, 0, 180], cutSide: [-90, 90, side > 0 ? 0 : 180], cutHigh: [-90, 90, -45, -135] } as Record<string, number[]>)[move];
    o.ang = (pick(env, dirs) * Math.PI) / 180;
    o.yaw = Math.atan2(-o.pos.x, -o.pos.z);
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    o.normal = new Vector3(s, 0, c);
    o.cutDir = new Vector3(c * Math.cos(o.ang), Math.sin(o.ang), -s * Math.cos(o.ang));
    if (env.str('sword') !== 'two') o.hand = env.str('swordHand') as Side;
  }
  const far = isFloor(env) ? 3.5 : D;
  if (move === 'side') o.from.set(side * 2.4, o.pos.y + 0.25, o.pos.z - 0.5); // por el costado
  else if (isSupine(env)) o.from.set(o.pos.x * 1.5, o.pos.y + 0.6, -3.5);
  else o.from.set(o.pos.x * 1.6, isFloor(env) ? Math.max(0.12, o.pos.y) : o.pos.y, -far);
  return o;
}

/** Lo que lleva cada mano para volver a la postura de partida (RepArena: mkArm). */
export interface Arm {
  armed: boolean;
  /** El movimiento con que tocó y dónde estaba la muñeca (y a qué distancia de la cabeza). */
  move: string;
  hitP: Vector3;
  hitD: number;
  lostT: number;
  /** Los puntos que tocan, en la arena: los del fotograma anterior y los de este (n). */
  prev: Vector3[];
  cur: Vector3[];
  n: number;
  had: boolean;
}
const mkArm = (): Arm => ({ armed: true, move: '', hitP: new Vector3(), hitD: 0, lostT: 0, prev: [], cur: [], n: 0, had: false });

/** El estado del modo (RepArena: TCH y touches). La partida pone `ref` al calibrar (tu altura de partida). */
export interface TouchState {
  env: TouchEnv;
  /** La altura de partida de la cabeza (se ajusta despacio a tu postura real). */
  ref: number;
  /** El reloj del modo (se para en la pausa) y cuándo llega el siguiente objetivo. */
  clock: number;
  nextArrive: number;
  /** El combinado en orden: por cuál va. */
  seq: number;
  /** El pulso del ritmo: cuándo cayó uno (en env.now()). */
  beat0: number;
  /** La cabeza: si ha vuelto, a qué altura tocó, cuánto se movía la ameba y su lado. */
  headArm: { armed: boolean; hitY: number; d: number; dx: number };
  arm: Record<Side, Arm>;
  /** Pausa entre indicaciones. */
  hintT: number;
  /** La cabeza del fotograma anterior (para la que cruza el hueco entre dos fotogramas). */
  prevHL: Vector3;
  hadHL: boolean;
  /** Tiempo quieto (para ajustar la altura de partida). */
  stillT: number;
  /** Los objetivos vivos. */
  touches: TouchTarget[];
  /** Los sucesos del último paso. */
  ev: TouchEvent[];
  /** ¿Abiertas las compuertas de delante? (mientras dura la oleada; ver frontGates en wave.ts). */
  gatesOpen: boolean;
}

export function mkTouch(env: TouchEnv): TouchState {
  return { env, ref: 1.6, clock: 0, nextArrive: 0, seq: 0, beat0: 0, headArm: { armed: true, hitY: 0, d: 0, dx: 0 }, arm: { left: mkArm(), right: mkArm() }, hintT: 0, prevHL: new Vector3(), hadHL: false, stillT: 0, touches: [], ev: [], gatesOpen: false };
}

/** El pulso del ritmo (s); 0 sin ritmo (RepArena: tchPeriod). */
export const tchPeriod = (env: TouchEnv): number => (env.s('bpm') > 0 ? 60 / env.s('bpm') : 0);

/** Una indicación, como mucho cada 1,6 s (RepArena: touchHint). */
export function touchHint(tch: TouchState, text: string): void {
  if (tch.hintT > 0) return;
  tch.hintT = 1.6;
  tch.ev.push({ type: 'hint', text });
}

/**
 * Las manos de este fotograma y la vuelta a la postura de partida (RepArena: sampleHands). Los puntos que pueden tocar se
 * guardan con los del fotograma anterior para comprobar todo el recorrido: un puñetazo rápido no atraviesa el diamante
 * sin tocarlo.
 */
export function sampleHands(tch: TouchState, dt: number): void {
  const env = tch.env, HL = env.head;
  for (const s of SIDES) {
    const h = env.hands[s], A = tch.arm[s];
    [A.prev, A.cur] = [A.cur, A.prev];
    const had = A.had;
    A.had = false;
    if (!h.ok) {
      // fuera de la vista: ha vuelto
      A.n = 0;
      A.lostT += dt;
      if (A.lostT > 0.3) A.armed = true;
      continue;
    }
    A.lostT = 0;
    let n = 0;
    const put = (p: Vector3) => {
      const v = A.cur[n] || (A.cur[n] = new Vector3());
      env.toArena(v.copy(p));
      n++;
    };
    if (h.isHand) {
      for (const j of TOUCH_J) if (h.J[j].ok) put(h.J[j].p);
      if (!n) put(h.wrist);
    } else {
      put(h.wrist);
      if (h.tipOk) put(h.tip);
    }
    if (!had || A.n !== n) for (let i = 0; i < n; i++) (A.prev[i] || (A.prev[i] = new Vector3())).copy(A.cur[i]);
    A.n = n;
    A.had = true;
    if (!A.armed) {
      // la muñeca vuelve hacia el cuerpo o baja desde donde tocó (con márgenes holgados: basta con retirar la mano)
      const w = A.cur[0], P = A.hitP, closer = A.hitD - Math.hypot(w.x - HL.x, w.y - HL.y, w.z - HL.z) > 0.1, m = A.move;
      const back =
        m === 'punch' ? closer || w.z - P.z > 0.1 || w.y < P.y - 0.2
        : m === 'reach' ? closer || w.y < HL.y || w.y < P.y - 0.3
        : m === 'tap' ? w.y < 0.2 || w.y < P.y - 0.1
        : m === 'knee' ? closer || w.y < P.y - 0.12 || w.y < tch.ref + 0.12
        : m === 'side' ? closer || Math.abs(w.x) < Math.abs(P.x) - 0.12
        : m === 'twist' ? closer || w.x * Math.sign(P.x) < Math.abs(P.x) - 0.2 || w.y < P.y - 0.12
        : m === 'low' || m === 'floor' ? closer || w.y > P.y + 0.25
        : true;
      if (back) A.armed = true;
    }
  }
  const H = tch.headArm;
  if (!H.armed) {
    // la cabeza vuelve cerca de su altura de partida (o deshace buena parte del movimiento)
    const d = Math.abs(H.d), thr = clamp(d * 0.4, 0.05, 0.12);
    if (Math.abs(H.dx || 0) > 0.25) {
      // tras una a un lado: volver al centro (y erguirse)
      if (Math.abs(HL.x) < Math.max(0.15, Math.abs(H.dx) * 0.4) && Math.abs(HL.y - tch.ref) < 0.18) H.armed = true;
    } else if (Math.abs(HL.y - tch.ref) < thr || (HL.y - H.hitY) * -Math.sign(H.d || -1) > d * 0.6) H.armed = true;
  }
  // la altura de partida se ajusta despacio a tu postura real cuando estás quieto en ella (cansado, de pie se baja un poco)
  tch.stillT = env.headSpeed < 0.05 ? (tch.stillT || 0) + dt : 0;
  if (H.armed && tch.stillT > 0.8 && Math.abs(HL.y - tch.ref) < 0.12 && !tch.touches.some((x) => x.mode === 'hold')) tch.ref += (HL.y - tch.ref) * Math.min(1, dt * 0.4);
}

const _tu = new Vector3(), _ta = new Vector3(), _tv = new Vector3(), _tw = new Vector3(), _tb = new Vector3(), _tq = new Quaternion(), _tz = new Vector3(0, 0, 1);
/** Distancia mínima al origen del segmento a→b (RepArena: segDist). */
export function segDist(a: Vector3, b: Vector3): number {
  _tu.subVectors(b, a);
  const L2 = _tu.lengthSq(), k = L2 > 1e-9 ? clamp(-a.dot(_tu) / L2, 0, 1) : 0;
  return _ta.copy(a).addScaledVector(_tu, k).length();
}

export type TouchMode = 'approach' | 'wait' | 'hold' | 'burst' | 'pass';

/** Un objetivo (RepArena: TouchTarget, sin lo que se ve). */
export class TouchTarget implements MoveSpec {
  move!: string;
  part!: TouchPart;
  hand!: Side;
  n!: Vector3;
  r!: number;
  hold!: number;
  pos!: Vector3;
  from!: Vector3;
  ang!: number;
  yaw!: number;
  normal!: Vector3 | null;
  cutDir!: Vector3 | null;
  /** Vivo (si no, la partida quita lo que se ve) y juzgado (tocado o fallado). */
  alive = true;
  judged = false;
  mode: TouchMode = 'approach';
  spawnT: number;
  /** Cuándo llega y cuánto espera quieto delante de ti. */
  arriveAt: number;
  win: number;
  /** La plancha: lo aguantado y lo que lleva fuera. */
  held = 0;
  outT = 0;
  /** Lo que lleva estallando o pasando de largo. */
  popT = 0;
  /** Su fase (el serpenteo de la ameba). */
  ph: number;
  /** Dónde está (RepArena: root.position, en la arena), dónde estaba el fotograma anterior y su giro (las amebas). */
  at: Vector3;
  prevPos: Vector3;
  q = new Quaternion();
  q0 = new Quaternion();
  /** La cabeza respecto al hueco (0 en el centro, 1 en el borde), de la última comprobación. */
  rad = 0;
  /** La mano (o la espada) que lo ha tocado. */
  by: Side | null = null;
  /** Fallado: hacia dónde se va y su tamaño (se encoge). */
  dir = new Vector3();
  scale = 1;

  constructor(readonly tch: TouchState, move: string, arriveAt: number, side = 0) {
    const env = tch.env;
    if (CUT_MOVES.includes(move) && !env.swordActive()) move = env.str('exercise') === 'slam' ? 'low' : 'punch'; // sin mandos no hay espada: diamante
    Object.assign(this, moveSpec(env, tch.ref, move, side));
    this.spawnT = tch.clock;
    this.arriveAt = arriveAt;
    this.win = env.s('tchWindow');
    this.ph = rand(env, 0, TAU);
    this.prevPos = this.from.clone();
    this.at = this.from.clone();
    if (this.part === 'head') {
      this.q.setFromUnitVectors(_tz, this.n);
      this.q0.copy(this.q);
    }
  }

  /**
   * ¿Está tocando? Cabeza: su centro dentro del hueco de la ameba (también si la cruza entre dos fotogramas); mano: la que
   * pide el diamante, con cualquier dedo, nudillo o la muñeca, en todo su recorrido desde el fotograma anterior.
   */
  touching(): boolean {
    const tch = this.tch, env = tch.env, HL = env.head;
    if (this.part === 'cut') {
      // la espada lo atraviesa deprisa y en la dirección de la flecha, en la postura que pide
      const side = env.swordCut(this, (text) => touchHint(tch, text));
      if (!side) return false;
      const S = tch.ref, sd = env.dv('squatDepth') / 100, jh = env.s('jumpHeight') / 100;
      const ok = this.move === 'cutLow' ? HL.y < S - sd * 0.6 : this.move === 'cutFwd' ? HL.z < -0.12 : this.move === 'cutSide' ? HL.x * Math.sign(this.pos.x) > 0.1 : this.move === 'cutHigh' ? HL.y > S + jh * 0.5 : false;
      if (!ok) {
        touchHint(tch, CUT_POSE[this.move]);
        tch.ev.push({ type: 'haptic', side, v: 0.2, ms: 20 });
        return false;
      }
      this.by = side;
      return true;
    }
    if (this.part === 'head') {
      _tw.set(0, 0, 1).applyQuaternion(this.q);
      const lim = this.r; // todo el hueco que se ve
      _tv.subVectors(HL, this.at);
      const dp = _tv.dot(_tw);
      _tv.addScaledVector(_tw, -dp);
      this.rad = _tv.length() / lim;
      if (Math.abs(dp) < 0.2 && this.rad < 1) return true;
      if (!tch.hadHL) return false;
      _tb.subVectors(tch.prevHL, this.prevPos);
      const dq = _tb.dot(_tw);
      if (dp * dq >= 0) return false; // no ha cruzado el plano
      _tb.lerp(_ta.subVectors(HL, this.at), dq / (dq - dp));
      _tb.addScaledVector(_tw, -_tb.dot(_tw));
      this.rad = _tb.length() / lim;
      return this.rad < 1;
    }
    for (const s of SIDES) {
      const A = tch.arm[s];
      for (let i = 0; i < A.n; i++) {
        if (segDist(_tv.subVectors(A.prev[i], this.prevPos), _tw.subVectors(A.cur[i], this.at)) >= GEM_R) continue;
        if (s !== this.hand) {
          touchHint(tch, this.move === 'twist' ? `¡Oblicuo: cruza con la mano ${HAND_NAME[this.hand]}!` : `¡Con la mano ${HAND_NAME[this.hand]}!`);
          break;
        }
        if (!A.armed) {
          touchHint(tch, 'Vuelve a la posición de partida');
          return false;
        }
        this.by = s;
        return true;
      }
    }
    return false;
  }

  /** Tocar solo vale si la parte que toca ha vuelto a su postura tras el toque anterior (las manos ya lo miran al tocar;
   * los bloques, como RepArena, miran la cabeza). */
  ready(): boolean {
    if (this.part === 'hand') return true;
    if (this.tch.headArm.armed || this.hold) return true;
    touchHint(this.tch, 'Vuelve a la posición de partida');
    return false;
  }

  /** La ameba no viene quieta: serpentea de lado a lado y sube y baja mientras se acerca (cada vez menos, para poder
   * acertarla al llegar: k, lo recorrido), se bambolea inclinándose y, esperando, sigue flotando un poco. */
  sway(k: number, t: number): void {
    if (this.part !== 'head') return;
    const a = 0.34 * (1 - smooth(k)) * (isFloor(this.tch.env) ? 0.6 : 1) + Math.min(0.025, this.r * 0.2), tt = t * 1.15 + this.ph; // (cerca del suelo el hueco es pequeño: menos)
    _tv.set(Math.sin(tt * 2.1) * a, Math.sin(tt * 2.9 + 1.3) * a * 0.55, 0).applyQuaternion(this.q0);
    this.at.add(_tv);
    this.at.y = Math.max(0.08, this.at.y);
    _tq.setFromAxisAngle(_tu.set(Math.sin(tt * 1.3), Math.cos(tt * 1.7), 0).normalize(), 0.05 + 0.25 * (1 - k));
    this.q.copy(this.q0).multiply(_tq);
  }

  /** Un paso (RepArena: update, sin lo que se ve): `t`, el reloj de la partida (para el serpenteo). */
  update(dt: number, t: number): void {
    const tch = this.tch, c = tch.clock, play = tch.env.state === 'play' || tch.env.state === 'rest';
    if (this.mode === 'approach') {
      const k = clamp((c - this.spawnT) / Math.max(0.1, this.arriveAt - this.spawnT), 0, 1), e = 1 - Math.pow(1 - k, 3);
      this.at.lerpVectors(this.from, this.pos, e);
      this.sway(k, t);
      // también vale tocarlo mientras viaja, si atinas
      if (play && this.touching() && this.ready()) this.grab();
      else if (k >= 1) {
        this.mode = 'wait';
        if (tchPeriod(tch.env)) tch.ev.push({ type: 'tick', t: this });
      }
    } else if (this.mode === 'wait') {
      this.at.copy(this.pos);
      this.sway(1, t);
      if (play && this.touching() && this.ready()) this.grab();
      else if (c > this.arriveAt + this.win) this.miss();
    } else if (this.mode === 'hold') {
      // plancha: aguanta la cabeza dentro (quieta, en su sitio)
      this.at.copy(this.pos);
      if (this.touching()) {
        this.outT = 0;
        this.held += dt;
      } else this.outT += dt;
      if (this.held >= this.hold) this.hit();
      else if (this.outT > 0.6) this.miss();
      else if (Math.floor(this.held) !== Math.floor(this.held - dt)) {
        const left = Math.ceil(this.hold - this.held);
        tch.ev.push({ type: 'hold', t: this, left, beep: 1 + (this.hold - left) * 0.1 });
      }
    } else if (this.mode === 'burst') {
      // la ameba estalla (0,22 s)
      this.popT += dt;
      if (Math.min(1, this.popT / 0.22) >= 1) {
        this.dispose();
        return;
      }
    } else if (this.mode === 'pass') {
      // fallado: se aleja un poco hacia ti, se encoge y se apaga (no te atraviesa la cara)
      this.popT += dt;
      this.at.addScaledVector(this.dir, dt * 0.8);
      this.at.y -= dt * 0.3;
      const f = 1 - this.popT / 0.5;
      this.scale = Math.max(0.05, 0.3 + 0.7 * f);
      if (f <= 0) {
        this.dispose();
        return;
      }
    }
    if (this.part === 'head' && this.mode !== 'approach' && this.mode !== 'wait') this.q.copy(this.q0);
    this.prevPos.copy(this.at);
  }

  /** Tocado: la plancha empieza a aguantar; lo demás, acertado. */
  private grab(): void {
    if (this.hold) {
      this.mode = 'hold';
      this.tch.ev.push({ type: 'charge', t: this });
    } else this.hit();
  }

  hit(): void {
    if (this.judged) return;
    this.judged = true;
    const tch = this.tch, env = tch.env, P = tchPeriod(env), dt_ = Math.abs(tch.clock - this.arriveAt);
    const perfect = this.hold ? this.outT === 0 : P ? dt_ < 0.15 : this.part === 'head' ? this.rad < 0.4 : dt_ < 0.3;
    tch.ev.push({ type: 'hit', t: this, perfect, text: perfect ? '¡PERFECTO!' : this.hold ? '¡Aguantado!' : '¡Bien!', color: perfect ? '#3cf0c6' : '#ffffff' });
    if (this.part === 'head') {
      // hay que volver a la postura de partida antes de la siguiente ameba
      Object.assign(tch.headArm, { armed: false, hitY: env.head.y, d: this.pos.y - tch.ref, dx: this.pos.x });
      this.mode = 'burst';
      this.popT = 0;
      return;
    }
    if (this.part === 'cut') {
      this.dispose();
      return;
    }
    const A = tch.arm[this.by || this.hand];
    A.armed = false;
    A.move = this.move;
    A.hitP.copy(A.cur[0] || this.pos);
    A.hitD = A.hitP.distanceTo(env.head);
    this.dispose();
  }

  miss(): void {
    if (this.judged) return;
    this.judged = true;
    this.mode = 'pass';
    this.popT = 0;
    this.dir.copy(this.pos).sub(this.from).normalize();
    const st = this.tch.env.state;
    const text = this.hold ? '¡Has salido de la ameba!' : this.part === 'head' ? '¡Mete la cabeza en la ameba!' : this.part === 'cut' ? '¡Corta el bloque con la espada!' : `¡Toca el diamante con la ${HAND_NAME[this.hand]}!`;
    this.tch.ev.push({ type: 'miss', t: this, hurt: st === 'play' || st === 'rest', text });
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.tch.ev.push({ type: 'gone', t: this });
  }
}
