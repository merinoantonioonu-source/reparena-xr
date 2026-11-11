/**
 * Las oleadas de los Arcos, tal cual en RepArena (src/71_arcs.js: arxNewKind, arxPatterns, ARX_JUMP_GAP, arxHurdles,
 * arxBurpee, arxPlankRoom y arxBeatGap; src/70_game.js: la parte de los Arcos de buildWave, arcGap, BURPEE_UP y la de
 * spawnFromQueue): qué llega en cada oleada (en coreografías o al azar según los porcentajes de Ajustes → Arcos), cuánto
 * hueco hay hasta el siguiente y qué arcos salen de cada uno. Con el mismo azar, en el mismo orden que RepArena (se
 * compara con su código en tests/compare/arcs-core.compare.test.ts).
 */
import { ArcCore, arxSpeed, randIn, type ArxFever } from './arc.js';
import type { ArcsEnv } from './env.js';

/** Lo que llega en la cola de una oleada (RepArena: los objetos de spawnQueue de los Arcos, con sus mismos campos). */
export interface ArcSpec {
  /** 'single', 'double', 'jump', 'plank', 'mace', 'laser', 'walls', 'wheel' o 'combo'. */
  kind: string;
  drop: number;
  tilt: number;
  hp: number;
  /** El hueco hasta el siguiente, en veces el intervalo medio (lo marca la coreografía). */
  gap?: number;
  /** De semipuente (mano al suelo). */
  low?: boolean;
  /** El arco de plancha de un burpee (detrás, la valla). */
  burpee?: boolean;
  /** Aviso grande al salir: título y texto (la ráfaga de vallas). */
  note?: [string, string];
  /** La combinación: con qué obstáculo llega a la vez el arco ('laser' o 'walls'). */
  with?: string;
}

/** Los obstáculos nuevos (RepArena: ARX_NEW). */
export const ARX_NEW = ['laser', 'walls', 'wheel'];

/** Los obstáculos nuevos, por turnos (empezando por uno al azar): así salen los tres. (RepArena: arxNewN y arxNewKind) */
export class ArcNewKind {
  n: number;
  constructor(rnd: () => number) {
    this.n = Math.floor(rnd() * 3);
  }
  next(): string {
    return ARX_NEW[this.n++ % 3];
  }
}

/** Entre dos vallas seguidas, al menos 1,1 s (antes, con ritmo rápido, llegaban a medio segundo: había que volar). */
export const ARX_JUMP_GAP = 1.1;
/** Burpee: lo que tarda en llegar la valla tras pasar el arco de plancha (con 1,6 s no daba tiempo a levantarse). */
export const BURPEE_UP = 3.0;

/** Ráfaga de vallas: 3 o 4 seguidas (con ritmo, a uno o dos pulsos una de otra), con su aviso. */
export function arxHurdles(env: ArcsEnv): ArcSpec[] {
  const n = env.rnd() < 0.5 ? 3 : 4, l: ArcSpec[] = [];
  for (let k = 0; k < n; k++) l.push({ kind: 'jump', drop: 0, tilt: 0, hp: 1, gap: k < n - 1 ? 0.4 : 1.4 });
  l[0].note = ['¡RÁFAGA DE VALLAS!', `${n} saltos seguidos`];
  return l;
}

/** Burpee: el arco de plancha y, tras él, una valla (llega BURPEE_UP s después: tiempo para levantarte y saltar). */
export const arxBurpee = (): ArcSpec[] => [{ kind: 'plank', drop: 0, tilt: 0, hp: 1, gap: 0.1, burpee: true }, { kind: 'jump', drop: 0, tilt: 0, hp: 1, gap: 1.6 }];

/** Antes de un arco de plancha o de semipuente, tiempo para bajar al suelo (el anterior deja un hueco largo). */
export function arxPlankRoom(list: ArcSpec[]): ArcSpec[] {
  list.forEach((o, i) => {
    if ((o.kind === 'plank' || o.low) && i > 0) list[i - 1].gap = Math.max(list[i - 1].gap || 1, o.low ? 1.5 : 1.8);
  });
  return list;
}

/** Las bajadas mínima y máxima (m) de la oleada, con la dificultad creciente. */
function drops(env: ArcsEnv): [number, number] {
  return [Math.min(env.dv('arcMin'), env.dv('arcMax')) / 100, Math.max(env.dv('arcMin'), env.dv('arcMax')) / 100];
}

/**
 * Coreografías: cada pieza es una lista de obstáculos con su hueco hasta el siguiente (en veces el intervalo medio); se
 * eligen según los porcentajes de Ajustes → Arcos y se encadenan hasta completar la oleada. (RepArena: arxPatterns)
 */
export function arxPatterns(total: number, env: ArcsEnv, newKind: ArcNewKind): ArcSpec[] {
  const s = (k: string): number => env.s(k), rand = (a: number, b: number): number => randIn(env, a, b);
  const [lo, hi] = drops(env), mid = (lo + hi) / 2;
  const tiltA = (): number => rand(0.6, 1) * s('arcTiltMax') * Math.PI / 180;
  const S = (drop: number, gap: number, extra: Partial<ArcSpec> = {}): ArcSpec => ({ kind: 'single', drop, tilt: 0, hp: 1, gap, ...extra });
  const pieces: [number, () => ArcSpec[]][] = ([
    [1, () => [S(lo, 0.8), S(mid, 0.8), S(hi, 1.3)]], // escalera: cada vez más abajo
    [1, () => [S(hi, 0.8), S(mid, 0.8), S(lo, 1.3)]], // y al revés
    [0.8, () => {
      const d = rand(lo, hi);
      return [S(d, 0.55), S(d, 0.55), S(d, 1.4)];
    }], // ráfaga: tres seguidos
    [0.6, () => [S(rand(lo, hi), 1.5)]], // un respiro
    [s('arcTilt') / 25, () => {
      const g = env.rnd() < 0.5 ? 1 : -1;
      return [S(rand(lo, hi), 0.9, { tilt: g * tiltA() }), S(rand(lo, hi), 0.9, { tilt: -g * tiltA() }), S(rand(lo, hi), 1.3, { tilt: g * tiltA() })];
    }], // zigzag
    [s('arcJump') / 25, () => [{ kind: 'jump', drop: 0, tilt: 0, hp: 1, gap: 0.7 }, S(hi, 1.3)]], // valla y, enseguida, un arco bajo
    [s('arcDouble') / 20, () => [S(rand(lo, hi), 1.4, { kind: 'double' })]],
    [s('arcNew') / 20, () => [{ kind: newKind.next(), drop: rand(lo, hi), tilt: 0, hp: 1, gap: 1.3 }]],
    [s('arcMace') / 25, () => [{ kind: 'mace', drop: 0, tilt: 0, hp: 1, gap: 1.4 }]], // la maza
    [s('arcPlank') / 25, () => [{ kind: 'plank', drop: 0, tilt: 0, hp: 1, gap: 2.4 }]], // al suelo, en plancha (y tiempo para levantarte)
    [(s('arcHurdles') || 0) / 20, () => arxHurdles(env)], // ráfaga de vallas: tres o cuatro saltos seguidos
    [(s('arcBurpee') || 0) / 20, () => arxBurpee()], // burpee: al suelo en plancha y, enseguida, a saltar la valla
    // de semipuente: la mano al suelo, del lado de «Inclinados: hacia la derecha»
    [s('arcLow') / 25, () => [{ kind: 'single', drop: 0, tilt: env.rnd() * 100 < s('arcRight') ? 1 : -1, hp: 1, gap: 1.8, low: true }]],
    // túnel: cuatro arcos bajos muy seguidos (a un pulso con música): hay que quedarse abajo y aguantar
    [(s('arcTunnel') || 0) / 20, () => {
      const d = rand(mid, hi);
      return [S(d, 0.12), S(d, 0.12), S(d, 0.12), S(d, 1.6)];
    }],
    // combinaciones: dos a la vez (un láser o unas paredes con un arco) o tres muy seguidos
    [(s('arcCombo') || 0) / 20, () => [{ kind: 'combo', with: env.rnd() < 0.5 ? 'laser' : 'walls', drop: rand(lo, mid), tilt: 0, hp: 1, gap: 1.4 }]],
    [(s('arcCombo') || 0) / 25, () => {
      const g = env.rnd() < 0.5 ? 1 : -1;
      return [S(rand(lo, hi), 0.3), S(rand(lo, hi), 0.3, { tilt: g * tiltA() }), S(hi, 1.4)];
    }],
  ] as [number, () => ArcSpec[]][]).filter((p) => p[0] > 0);
  const sum = pieces.reduce((a, p) => a + p[0], 0), list: ArcSpec[] = [];
  while (list.length < total) {
    let r = env.rnd() * sum, P = pieces[0];
    for (const p of pieces) if ((r -= p[0]) <= 0) {
      P = p;
      break;
    }
    list.push(...P[1]());
  }
  const out = arxPlankRoom(list.slice(0, total));
  // con los obstáculos nuevos activados, en cada oleada larga salen al menos los tres (en vez de arcos sueltos)
  if (s('arcNew') > 0 && total >= 9) for (let need = 3 - out.filter((o) => ARX_NEW.includes(o.kind)).length, i = 0; need > 0 && i < 40; i++) {
    const k = Math.floor(env.rnd() * out.length);
    if (out[k].kind === 'single' && !out[k].tilt) {
      out[k] = { kind: newKind.next(), drop: out[k].drop, tilt: 0, hp: 1, gap: 1.3 };
      need--;
    }
  }
  return out;
}

/** La cola de una oleada de los Arcos con `total` obstáculos (RepArena: la parte de los Arcos de buildWave, con total =
 * waveReps(i)): en coreografías o, si no, cada uno al azar según los porcentajes. */
export function buildArcsWave(total: number, env: ArcsEnv, newKind: ArcNewKind): ArcSpec[] {
  if (env.s('arcPatterns')) return arxPatterns(total, env, newKind);
  const s = (k: string): number => env.s(k), rnd = (): number => env.rnd(), rand = (a: number, b: number): number => randIn(env, a, b);
  const [lo, hi] = drops(env), list: ArcSpec[] = [];
  for (let n = 0; n < total; n++) {
    if (rnd() * 100 < (s('arcCombo') || 0)) { // dos a la vez
      list.push({ kind: 'combo', with: rnd() < 0.5 ? 'laser' : 'walls', drop: rand(lo, (lo + hi) / 2), tilt: 0, hp: 1 });
      continue;
    }
    if (rnd() * 100 < s('arcNew')) { // láser, paredes o rueda (por turnos)
      list.push({ kind: newKind.next(), drop: rand(lo, hi), tilt: 0, hp: 1 });
      continue;
    }
    if (rnd() * 100 < s('arcJump')) { // valla baja
      list.push({ kind: 'jump', drop: 0, tilt: 0, hp: 1 });
      continue;
    }
    if (rnd() * 100 < s('arcMace')) { // la maza
      list.push({ kind: 'mace', drop: 0, tilt: 0, hp: 1 });
      continue;
    }
    if (rnd() * 100 < s('arcPlank')) { // al suelo, en plancha
      list.push({ kind: 'plank', drop: 0, tilt: 0, hp: 1, gap: 2.4 });
      continue;
    }
    if (rnd() * 100 < (s('arcBurpee') || 0) / 3) { // burpee: plancha y valla (cuentan dos)
      list.push(...arxBurpee());
      n++;
      continue;
    }
    if (rnd() * 100 < (s('arcHurdles') || 0) / 3) { // ráfaga de vallas
      const h = arxHurdles(env);
      list.push(...h);
      n += h.length - 1;
      continue;
    }
    if (rnd() * 100 < s('arcLow')) { // de semipuente: el lado lo reparte arcRight, como en los inclinados
      list.push({ kind: 'single', drop: 0, tilt: 1, hp: 1, low: true });
      continue;
    }
    const tilt = rnd() * 100 < s('arcTilt') ? 1 : 0;
    list.push({ kind: rnd() * 100 < s('arcDouble') ? 'double' : 'single', drop: rand(lo, hi), tilt, hp: 1 });
  }
  // los inclinados, repartidos entre los dos lados en la proporción pedida (exacta, no al azar: si no, en una oleada
  // corta un lado puede salir muchas más veces), y en orden barajado
  const tl = list.filter((o) => o.tilt), nR = Math.round(tl.length * s('arcRight') / 100), sides = tl.map((_, k) => (k < nR ? 1 : -1));
  for (let k = sides.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [sides[k], sides[j]] = [sides[j], sides[k]];
  }
  tl.forEach((o, k) => {
    o.tilt = sides[k] * rand(0.6, 1) * s('arcTiltMax') * Math.PI / 180;
  });
  return arxPlankRoom(list);
}

/** Hueco hasta el siguiente arco (en múltiplos del intervalo medio): regular, o irregular sin patrón que se pueda aprender
 * (a veces dos casi seguidos, a veces un respiro largo; la media sigue siendo 1). `regular`: «Aparición» en Regular. */
export function arcGap(env: ArcsEnv, regular: boolean): number {
  if (regular) return 1;
  const r = env.rnd();
  return r < 0.22 ? randIn(env, 0.4, 0.6) : r < 0.78 ? randIn(env, 0.75, 1.25) : randIn(env, 1.35, 1.85);
}

/** Con ritmo («Arcos al compás»: env.beatP), el hueco en pulsos (en compases de dos si es largo), medio pulso antes para
 * esperar al de llegada; en las frases de la canción ('hot' o 'calm'), más seguidos o más espaciados. (RepArena:
 * arxBeatGap; la frase, de arxPhrase: '' sin música.) */
export function arxBeatGap(sec: number, env: ArcsEnv, phrase: string): number {
  const P = env.beatP;
  if (!P) return sec;
  sec *= phrase === 'hot' ? 0.65 : phrase === 'calm' ? 1.25 : 1;
  let n = Math.max(1, Math.round(sec / P));
  if (n >= 4) n = Math.round(n / 2) * 2;
  return (n - 0.5) * P;
}

/** Lo que sale de un obstáculo de la cola (RepArena: lo que hacía la parte de los Arcos de spawnFromQueue). */
export interface ArcSpawnPlan {
  /** Los arcos que salen (RepArena: arcs.push(new Arc(…))), ya creados. */
  arcs: ArcCore[];
  /** El obstáculo nuevo que sale con ellos ('laser', 'walls' o 'mace'; RepArena: new ArcObs(kind)), si hay. En la
   * combinación sale antes que el arco: para el mismo azar que RepArena, créalo en `onObs` (ver arcSpawnPlan). */
  obs: string | null;
  /** El aviso grande (bigNotice): título, texto y color; y si suena la bocina (SND.horn). */
  notice: [string, string, string] | null;
  horn: boolean;
  /** Lo que como poco hay que esperar al siguiente (s; ARX.minNext) y el hueco que marca la coreografía (ARX.nextGap). */
  minNext: number;
  nextGap: number;
  /** Cuándo sale un orbe a medio camino (s; ARX.orbT), o null si no toca (no se cambia). */
  orbT: number | null;
}

/**
 * Saca un obstáculo de la cola (RepArena: spawnFromQueue en los Arcos), con el azar en el mismo orden. `spawnInterval`: el
 * intervalo medio entre obstáculos (s). `onObs`, si se da, se llama con el obstáculo nuevo justo cuando RepArena lo creaba
 * (antes del arco de la combinación y del orbe): así lo que gaste del azar sale en el mismo orden.
 */
export function arcSpawnPlan(spec: ArcSpec, env: ArcsEnv, arx: ArxFever, spawnInterval: number, onObs?: (kind: string) => void): ArcSpawnPlan {
  const plan: ArcSpawnPlan = { arcs: [], obs: null, notice: null, horn: false, minNext: 0, nextGap: 0, orbT: null };
  const obs = (k: string): void => {
    plan.obs = k;
    if (onObs) onObs(k);
  };
  // los que vienen detrás esperan a que pase el lento (plancha o semipuente) y luego `extra` s para levantarte
  const wait = (a: ArcCore, extra: number): number => {
    const L = env.head.z - a.z;
    return Math.max(0, L / a.speed - L / arxSpeed(env, arx)) + extra;
  };
  if (spec.kind === 'combo') { // a la vez: apártate (o métete en el hueco) y agáchate
    obs(spec.with as string);
    plan.arcs.push(new ArcCore({ drop: spec.drop, offset: 0, second: true, tilt: 0 }, env, arx));
  } else if (spec.kind === 'laser' || spec.kind === 'walls' || spec.kind === 'mace') obs(spec.kind);
  else if (spec.kind === 'plank') { // (más despacio, con 2,5 s para levantarte; y sin orbe)
    const a = new ArcCore({ drop: 0, plank: true }, env, arx);
    plan.arcs.push(a);
    plan.minNext = wait(a, spec.burpee ? BURPEE_UP : 2.5); // (en el burpee, la valla llega tras BURPEE_UP s: levantarte y saltar)
    plan.notice = spec.burpee ? ['¡BURPEE!', 'Al suelo en plancha… ¡y arriba a saltar la valla!', '#ffd166'] : ['¡ARCO DE PLANCHA!', 'Manos al suelo y pies atrás', '#ffd166'];
    plan.horn = true;
    plan.nextGap = spec.gap || 0;
    return plan;
  } else if (spec.kind === 'wheel') {
    const tilt = (env.rnd() < 0.5 ? -1 : 1) * randIn(env, 0.6, 1) * Math.max(15, env.s('arcTiltMax')) * Math.PI / 180;
    const spin = (env.rnd() < 0.5 ? -1 : 1) * randIn(env, 2.2, 3.4);
    plan.arcs.push(new ArcCore({ drop: spec.drop, tilt, spin }, env, arx));
  } else if (spec.low) { // de semipuente: más despacio y con su aviso (y 1,5 s para levantarte)
    const a = new ArcCore({ drop: spec.drop, tilt: spec.tilt || 1, low: true }, env, arx);
    plan.arcs.push(a);
    plan.minNext = wait(a, 1.5);
    plan.notice = ['¡MANO AL SUELO!', `Apártate a la ${a.tilt > 0 ? 'derecha' : 'izquierda'} y apóyate en una mano`, '#ffd166'];
    plan.horn = true;
    plan.nextGap = spec.gap || 0;
    return plan;
  } else {
    plan.arcs.push(new ArcCore({ drop: spec.drop, tilt: spec.tilt || 0, jump: spec.kind === 'jump' }, env, arx));
    if (spec.kind === 'double') plan.arcs.push(new ArcCore({ drop: spec.drop, offset: 1.0, second: true, tilt: spec.tilt || 0 }, env, arx));
    if (spec.note) {
      plan.notice = [spec.note[0], spec.note[1], '#3cf0c6'];
      plan.horn = true;
    }
  }
  plan.nextGap = spec.gap || 0; // la coreografía marca el hueco hasta el siguiente
  if (env.rnd() * 100 < env.s('arcOrbs')) plan.orbT = spawnInterval * (spec.gap || 1) * 0.5; // un orbe a medio camino
  return plan;
}
