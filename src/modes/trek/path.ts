/**
 * La Travesía, tal cual en RepArena (src/75_trek.js, su lógica: TREK, TREK_BIOMES, trekTh, trekP, trekFrame, trekBend,
 * trekKinds, trekChainMove, trekWave, trekSpawn y lo que trekObsMesh decidía al azar, trekRep, trekTurbo, trekReset y la
 * parte de trekStep que no es pintar): recorres un sendero del bosque a fuerza de repeticiones. Cada una te da impulso,
 * según su ritmo (el tiempo desde la anterior) y, con las piernas, lo hondo que bajaste; esa velocidad dura un poco más
 * de lo que tardaste en hacerla y, sin la siguiente, frenas. Seis seguidas a buen ritmo encienden el turbo. Por el camino,
 * retos de otro movimiento (troncos, ramas bajas, cofres con cadenas, el derrumbe, el arroyo, el desfiladero y los
 * bandidos), uno de cada tipo por turnos, que salen a lo lejos, entre la niebla. Las paradas, en halts.ts.
 *
 * Lógica pura, sin IWSDK: lo que pide del juego, en `TrekEnv`; lo que se ve y se oye, en los sucesos de `Trek.ev`, que la
 * partida aplica en orden y vacía. Se compara con el código de RepArena en tests/compare/trek-path.compare.test.ts.
 */
import { HEAD_TOP, TAU, type TrekEnv, type TrekEv, type TrekHooks, type TrekKind, type TrekMove, type TrekObs, type TrekPiece, type TrekPos } from './env.js';
import { rockPick, trekChestVanish, trekHaltSay, trekHaltStep, trekHopStep, trekJudge, trekLungeStep, type LungeState, type MoveState } from './halts.js';

/** La velocidad más alta (m/s, antes de «Velocidad de avance»), los trozos de paisaje (24 m, 5) y el largo del sendero. */
export const TREK_VMAX = 2, TREK_CH = 24, TREK_N = 5, TREK_PATH = 96;
/** Las filas de la cinta del sendero: una por metro, de 20 m detrás a 100 delante. */
export const TREK_RIB = 121;
/** Hasta dónde se ve (donde acaba el paisaje, entre la niebla): los retos salen allí, no de golpe cerca. */
export const TREK_SEE = 88;
/** El turbo: cuántas seguidas a buen ritmo lo encienden y cuánto más deprisa vas. */
export const TREK_TURBO_N = 6, TREK_TURBO_V = 1.2;

/** Un tramo: su nombre, su foto de fondo, su niebla y su luz (colores tal cual), y lo que crece en él. */
export interface TrekBiome {
  name: string;
  pano: string;
  fog: number;
  dens: number;
  hemi: number;
  hemiI: number;
  key: number;
  keyI: number;
  dusk: number;
  trees: string[];
  nTree: number;
  bush: number;
  rock: number;
  flower: number;
  water: boolean;
  village?: boolean;
}

/** Los tramos, por turnos (RepArena tiene cuatro: bosque, aldea, pradera del lago y pinar al atardecer). */
export const TREK_BIOMES: TrekBiome[] = [
  { name: 'Bosque', pano: 'bosque', fog: 0xc4dcea, dens: 0.014, hemi: 0xd6ecff, hemiI: 0.95, key: 0xfff0d2, keyI: 1.5, dusk: 0,
    trees: ['CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'CommonTree_4', 'Pine_2'], nTree: 9, bush: 5, rock: 3, flower: 10, water: false },
  { name: 'Aldea', pano: 'aldea', fog: 0xd6e6ee, dens: 0.011, hemi: 0xe8f0ff, hemiI: 1.0, key: 0xfff2dc, keyI: 1.55, dusk: 0,
    trees: ['CommonTree_4', 'CommonTree_3', 'Bush_Common_Flowers'], nTree: 3, bush: 4, rock: 1, flower: 18, water: false, village: true },
  { name: 'Pradera del lago', pano: 'lago', fog: 0xd2e8f2, dens: 0.009, hemi: 0xe2f2ff, hemiI: 1.0, key: 0xfff6e0, keyI: 1.6, dusk: 0,
    trees: ['CommonTree_4', 'Bush_Common_Flowers', 'CommonTree_3'], nTree: 4, bush: 6, rock: 4, flower: 20, water: true },
  { name: 'Pinar al atardecer', pano: 'atardecer', fog: 0xe3a27c, dens: 0.016, hemi: 0xffc9a0, hemiI: 0.8, key: 0xffa860, keyI: 1.25, dusk: 1,
    trees: ['Pine_2', 'Pine_4', 'Pine_5', 'Pine_4', 'DeadTree_1'], nTree: 10, bush: 3, rock: 5, flower: 5, water: false },
];

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const rand = (env: TrekEnv, a: number, b: number): number => a + env.rnd() * (b - a);

/** El azar con semilla de RepArena (src/20_render.js: rng): el de las piedras del arroyo, sus orillas y los pilares. */
export function trekRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** El rumbo del sendero a la distancia s: cambia despacio (como mucho unos 27°); sin «Sendero con curvas», recto. */
export const trekTh = (s: number, curves: boolean): number => (curves ? 0.35 * Math.sin((s * TAU) / 120) + 0.12 * Math.sin((s * TAU) / 70 + 1.3) : 0);

/** Las orillas del arroyo, que serpentean (en el sendero, el ancho justo de las piedras): la de este lado y la de enfrente. */
export const streamNear = (x: number): number => 1.2 * Math.sin(0.2 * x) + 0.5 * Math.sin(0.55 * x);
export const streamFar = (len: number, x: number): number => -len - 1.3 * Math.sin(0.17 * x) + 0.5 * Math.sin(0.5 * x);

/** Los retos de cada ejercicio: nunca el mismo movimiento que te hace avanzar (la roca se embiste con zancadas: no con
 * ellas; el arroyo y el desfiladero se cruzan saltando: no con la sentadilla con salto; los bandidos, con todos). */
export const trekLegs = (ex: string): boolean => ['squat', 'lunge', 'frontsq'].includes(ex);
export const trekKinds = (ex: string): TrekKind[] =>
  ex === 'lunge' ? ['log', 'chest', 'stream', 'bandit', 'chasm'] : trekLegs(ex) ? ['log', 'chest', 'stream', 'bandit', 'rock', 'chasm'] : ex === 'jsquat' ? ['chest', 'rock', 'bandit'] : ['branch', 'chest', 'stream', 'bandit', 'rock', 'chasm'];
/** Lo que rompe las cadenas del cofre: saltos (si avanzas con las piernas), zancadas (con la sentadilla con salto) o
 * sentadillas (con curl). */
export const trekChainMove = (ex: string): TrekMove => (trekLegs(ex) ? 'jump' : ex === 'jsquat' ? 'lunge' : 'squat');
/** La velocidad de avance elegida (Ajustes → Modo Travesía). */
export const trekK = (env: TrekEnv): number => (env.s('trekSpeed') || 100) / 100;

/** El tramo no acaba a mitad de una parada (RepArena: el anyLeft de la Travesía en 70_game.js). */
export const trekLeft = (tk: Trek, waveDone: number, waveTarget: number): boolean => waveDone < waveTarget || !!tk.halt;

/** La línea del marcador (RepArena: 60_ui.js): metros, km/h, el turbo y lo que falta del tramo (o los lobos, a cuánto). */
export function trekBoardLine(tk: Trek, wave: number, waveTarget: number, waveDone: number, wolvesGap: number | null): string {
  return `${Math.round(tk.dist)} m · ${(tk.v * 3.6).toFixed(1).replace('.', ',')} km/h${tk.turbo ? ' · TURBO ×2' : ''} · ${wolvesGap !== null ? `¡LOBOS a ${Math.max(0, Math.round(wolvesGap))} m!` : tk.halt ? `tramo ${wave + 1}: parada` : `tramo ${wave + 1}: faltan ${Math.max(0, waveTarget - waveDone)}`}`;
}

/** Un hueco del paisaje: el tramo que lleva su trozo y dónde está (z, de 12–36 m por detrás a casi todo por delante). */
export interface TrekSlot {
  b: number;
  z: number;
}

export class Trek {
  /** Lo que ha pasado desde que la partida los aplicó (y vació: `tk.ev.length = 0`). */
  ev: TrekEv[] = [];
  /** Lo recorrido, la velocidad (m/s) y el tramo. */
  dist = 0;
  v = 0;
  biome = 0;
  /** Lo que pide la última repetición, cuánto dura su empuje y el paso a la piedra o el pilar siguiente. */
  want = 0;
  push = 0;
  glide = 0;
  lastRep = 0;
  /** Lo más bajo de la cabeza desde la repetición anterior, y el ritmo (kc) y lo hondo (ki) de la última. */
  minY = 9;
  kc = 1;
  ki = 1;
  /** El turbo, la racha que lo enciende y lo que llevas sin repeticiones. */
  turbo = false;
  tg = 0;
  idle = 0;
  /** Los retos, el sitio del siguiente, por cuál va el turno (no vuelve a 0 al empezar la ronda, como en RepArena) y la
   * parada de ahora. */
  obs: TrekObs[] = [];
  next = 0;
  nObs = 0;
  halt: TrekObs | null = null;
  /** Llaves (con tres, el tesoro), cofres abiertos, retos superados y choques. */
  keys = 0;
  got = 0;
  ducked = 0;
  hits = 0;
  /** Dónde salen los próximos lobos (los lleva el módulo de los lobos; aquí, solo su vuelta a 30 al empezar). */
  nextChase = 30;
  /** El salto de piedra en piedra (lo que baja el mundo: hopY) y la zancada que empuja en este fotograma. */
  hop: { t: number; dur: number } | null = null;
  hopY = 0;
  lunge = false;
  /** Los huecos del paisaje (layout). */
  slots: TrekSlot[] = [];
  /** El movimiento de las paradas y la zancada (RepArena: TMV, TLG; no vuelven a empezar con la ronda). */
  tmv: MoveState = { st: 'up', z0: 0, x0: 0, go: false };
  tlg: LungeState = { st: 'up', z0: 0, cd: 0 };
  /** La tabla del sendero (RepArena: TREK_CV, que crece según hace falta) y el sitio de ahora (TF). */
  cv = { ds: 0.5, s0: -60, x: [0], z: [0], on: null as boolean | null };
  tf = { x: 0, z: 0, c: 1, s: 0, th: 0 };
  private _p = { x: 0, z: 0 };
  private _q = { x: 0, z: 0 };

  constructor(public env: TrekEnv, public hooks: TrekHooks = {}) {}

  /* ---------- Los sucesos ---------- */
  say(text: string, col: string, dur: number): void {
    this.ev.push({ t: 'say', text, col, dur });
  }
  cheer(text: string, col: string, dur: number): void {
    this.ev.push({ t: 'cheer', text, col, dur });
  }
  snd(name: 'perfect' | 'combo' | 'whoosh' | 'metalHit' | 'step' | 'explosion' | 'victory', at: TrekPos | null, arg?: string | boolean): void {
    this.ev.push(arg === undefined ? { t: 'snd', name, at } : { t: 'snd', name, at, arg });
  }
  fx(name: 'sparks' | 'smoke' | 'dust' | 'glow', at: TrekPos, ...args: (number | number[])[]): void {
    this.ev.push({ t: 'fx', name, at, args });
  }
  haptic(k: number, ms: number): void {
    this.ev.push({ t: 'haptic', k, ms });
  }
  score(n: number): void {
    this.ev.push({ t: 'score', n });
  }

  /* ---------- El sendero ---------- */
  private curves(): boolean {
    return !!this.env.s('trekCurves') && this.env.trek;
  }
  /** El rumbo a la distancia s. */
  th(s: number): number {
    return trekTh(s, this.curves());
  }
  /** El punto del sendero a la distancia s (como si se fuera recto hacia −z al empezar). */
  p(s: number, out: { x: number; z: number }): { x: number; z: number } {
    const C = this.cv, cv = this.curves();
    if (C.on !== cv) {
      C.on = cv;
      C.x = [0];
      C.z = [0];
    } // (en Arcos, recto)
    const f = Math.max(0, (s - C.s0) / C.ds), i = Math.floor(f);
    while (C.x.length < i + 2) {
      const k = C.x.length - 1, th = this.th(C.s0 + (k + 0.5) * C.ds);
      C.x.push(C.x[k] + Math.sin(th) * C.ds);
      C.z.push(C.z[k] - Math.cos(th) * C.ds);
    }
    const t = f - i;
    out.x = C.x[i] + (C.x[i + 1] - C.x[i]) * t;
    out.z = C.z[i] + (C.z[i + 1] - C.z[i]) * t;
    return out;
  }
  /** Dónde estás ahora en el sendero y su rumbo: el mundo gira para que lo tengas siempre delante. */
  frame(): void {
    const F = this.tf;
    this.p(this.dist, this._p);
    F.x = this._p.x;
    F.z = this._p.z;
    F.th = this.th(this.dist);
    F.c = Math.cos(F.th);
    F.s = Math.sin(F.th);
  }
  /** (s, u: a lo largo del sendero y a su derecha) → la arena (out.x, out.z); devuelve cuánto hay que girar lo de allí. */
  bend(s: number, u: number, out: { x: number; z: number }): number {
    const F = this.tf, q = this.p(s, this._q), th = this.th(s), vx = q.x + u * Math.cos(th) - F.x, vz = q.z + u * Math.sin(th) - F.z;
    out.x = vx * F.c + vz * F.s;
    out.z = -vx * F.s + vz * F.c;
    return F.th - th;
  }
  /** Los huecos del paisaje (lo que no es pintar de trekLayout): cada uno lleva el trozo del tramo en el que entra al pasar
   * al frente (así el paisaje nuevo llega de lejos). */
  layout(): TrekSlot[] {
    const span = TREK_CH * TREK_N, off = ((this.dist % span) + span) % span;
    for (let i = 0; i < TREK_N; i++) {
      let z = -i * TREK_CH + off;
      if (z > TREK_CH * 1.5) z -= span;
      const S = this.slots[i] || (this.slots[i] = { b: -1, z: 99 });
      if (S.b < 0 || z < S.z - TREK_CH * 0.5) S.b = this.biome; // (acaba de pasar al frente: con el paisaje de ahora)
      S.z = z;
    }
    return this.slots;
  }

  /* ---------- Ronda, tramo y retos ---------- */
  /** Al empezar una ronda: desde el principio del sendero, en el bosque (los retos que había se quitan). */
  reset(): void {
    for (const o of this.obs) this.ev.push({ t: 'drop', o });
    if (this.hooks.chaseEnd) this.hooks.chaseEnd();
    Object.assign(this, { glide: 0, halt: null, keys: 0, nextChase: 30, v: 0, want: 0, push: 0, lastRep: 0, minY: 9, kc: 1, ki: 1, turbo: false, tg: 0, idle: 0, dist: 0, biome: 0, obs: [], next: 0, got: 0, ducked: 0, hits: 0 });
    this.slots = [];
    this.hop = null;
    this.hopY = 0;
  }
  /** El tramo i: su paisaje y, al empezar la ronda, el camino ya con sus retos hasta donde alcanza la vista (los que ya
   * están por delante se quedan: el tramo nuevo sigue tras ellos). Las repeticiones que pide, las pone la partida. */
  wave(i: number): void {
    this.biome = i % TREK_BIOMES.length;
    this.next = Math.max(this.next || 0, this.dist + 12);
    if (!i) for (let n = 0; n < 12 && this.next - this.dist < TREK_SEE; n++) this.spawn();
  }
  /** Un reto más, a lo lejos: uno de cada tipo por turnos. */
  spawn(): void {
    const env = this.env, K = trekKinds(env.ex);
    let kind = K[(this.nObs = this.nObs + 1) % K.length];
    const top = env.calibRef + HEAD_TOP;
    if (kind === 'chasm' && this.obs.some((q) => q.kind === 'chasm')) kind = K[(this.nObs = this.nObs + 1) % K.length]; // (un desfiladero a la vez: el hueco en el suelo es uno)
    const o: TrekObs = { kind, at: this.next, judged: false, side: env.rnd() < 0.5 ? -1 : 1, y: top - rand(env, 0.22, 0.34), maxUp: -1 };
    if (o.kind === 'bandit' && !env.bandReady) o.kind = trekKinds(env.ex).includes('log') ? 'log' : 'rock'; // (los bandidos, en cuanto estén cargados)
    if (o.kind === 'bandit') Object.assign(o, { fixed: true, stop: 3.2 });
    if (kind === 'chest' && !env.chestReady) {
      o.kind = 'log';
      if (!trekKinds(env.ex).includes('log')) o.kind = 'rock';
    } // (el cofre, cuando esté cargado)
    const N = Math.min(8, 4 + env.wave);
    if (o.kind === 'chest') Object.assign(o, { move: trekChainMove(env.ex), need: N });
    if (o.kind === 'rock') Object.assign(o, { move: 'lunge', need: Math.min(7, 3 + Math.ceil(env.wave / 2)) });
    // el arroyo y el desfiladero se quedan quietos bajo la plataforma (no siguen a la cabeza) y te paras al borde, a 0,9 m;
    // cada movimiento te lleva un paso (step) adelante; exit es dónde acabas, ya en la otra orilla
    if (o.kind === 'stream') {
      const n = Math.min(8, 4 + env.wave);
      Object.assign(o, { move: 'jump', need: n, step: 1.1, sides: Array.from({ length: n }, (_, k) => (k % 2 ? 1 : -1)), len: n * 1.1 - 0.9 + 0.6, exit: o.at - 0.9 + (n + 1) * 1.1 });
    }
    if (o.kind === 'chasm') {
      const n = Math.min(7, 4 + Math.floor(env.wave / 2));
      Object.assign(o, { move: 'jump', need: n, step: 1.6, len: (n - 1) * 1.6 + 1.1 - 0.9, exit: o.at - 0.9 + n * 1.6 }); // (n saltos: n − 1 pilares y la otra orilla)
    }
    if (o.len) Object.assign(o, { fixed: true, stop: 0.9, seed: Math.floor(env.rnd() * 1e4) });
    this.obsData(o);
    this.obs.push(o);
    this.ev.push({ t: 'spawn', o });
    this.next += rand(env, 10, 16) + (o.len || 0);
  }
  /** Lo que RepArena decidía al azar al hacer la malla de cada reto (trekObsMesh), como datos y en el mismo orden: las
   * rocas, las piedras del arroyo y sus orillas, el borde y los pilares del desfiladero, los bandidos y la roca del derrumbe
   * (con su radio, del modelo, y dónde te paras: a 1,25 m de su cara, para que la cabeza no llegue a ella al embestir). */
  private obsData(o: TrekObs): void {
    const env = this.env;
    if (o.kind === 'branch') o.rocks = [rockPick(env, -1.85, 0.75), rockPick(env, 1.85, 0.75)];
    else if (o.kind === 'log') o.rocks = [rockPick(env, -1.9, 0.45), rockPick(env, 1.9, 0.45)];
    else if (o.kind === 'chest') o.links = 52;
    else if (o.kind === 'stream') {
      const R = trekRng(o.seed || 0), L: TrekPiece[] = [], len = o.len || 0, sides = o.sides || [];
      o.stones = [];
      for (let k = 1; k <= (o.need || 0); k++) {
        const n = `Rock_Medium_${1 + (k % 3)}`, b = env.rockBox(n), sx = rand(env, 0.7, 0.85) / b.w, sy = 0.3 / b.h, x = sides[k - 1] * 0.42, z = (o.stop || 0) - k * (o.step || 0);
        L.push({ n, x, y: 0.13 - (b.y0 + b.h) * sy, z, ry: R() * TAU, sx, sy, sz: sx });
        o.stones.push({ x, y: 0.16, z });
      }
      this.banks(L, R, len);
      o.pieces = L;
    } else if (o.kind === 'chasm') {
      const R = trekRng(o.seed || 0), L: TrekPiece[] = [], len = o.len || 0;
      this.rims(L, R, 0);
      this.rims(L, R, -len);
      o.pieces = L;
      o.pillars = [];
      o.stones = [];
      o.sunk = [];
      for (let k = 1; k < (o.need || 0); k++) {
        const x = (R() - 0.5) * 0.3, z = (o.stop || 0) - k * (o.step || 0), ry = R() * TAU;
        o.pillars.push({ x, z, ry });
        o.stones.push({ x, y: 0.3, z });
        o.sunk.push(false);
      }
      o.stones.push({ x: 0, y: 0.3, z: -len - 0.4 });
    } else if (o.kind === 'bandit') {
      // los bandidos, plantados en el sendero, uno detrás de otro (su pelea, en el módulo de los bandidos)
      const w = env.wave, n = w >= 4 ? 3 : w >= 2 ? 2 : 1;
      o.bandits = [];
      for (let i = 0; i < n; i++) {
        const hp = w >= 2 ? 6 : 5; // (las piedras que hay que esquivarle)
        o.bandits.push({ x: (i % 2 ? 1 : -1) * (i ? 0.9 : 0.15), z: -2.5 - i * 1.6, st: 'wait', t: 0, hp, maxHp: hp, skin: i % 2, ph: env.rnd() * 3, alive: true, band: true, ry: Math.PI });
      }
    } else {
      // el derrumbe: una roca grande atravesada en el sendero
      const r = rockPick(env, 0, 1.5);
      o.rocks = [r];
      o.rr = env.rockBox(r.n).w * 1.5 * 0.6;
      o.stop = o.rr + 1.25;
    }
  }
  /** Las orillas del arroyo: piedras y juncos a los dos lados del sendero (RepArena: trekBanks). */
  private banks(L: TrekPiece[], R: () => number, len: number): void {
    for (const [far, out] of [[false, 0.5], [true, -0.5]] as [boolean, number][]) for (const sd of [-1, 1]) for (let x = 1.2 + R() * 0.4; x < 12; x += 0.9 + R() * 1.2) {
      const e = (v: number): number => (far ? streamFar(len, v) : streamNear(v));
      const X = sd * x, z = e(X), n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, b = this.env.rockBox(n), s = (0.35 + R() * 0.4) / b.w;
      const zz = z + (R() - 0.5) * 0.5;
      L.push({ n, x: X, y: -b.y0 * s - 0.05, z: zz, ry: R() * TAU, sx: s, sy: s, sz: s });
      if (R() < 0.7) {
        const g = R() < 0.6 ? 'Grass_Wispy_Tall' : 'Grass_Common_Tall', gx = X + sd * 0.4, gz = e(gx) + out + (R() - 0.5) * 0.4, ry = R() * TAU, gs = 0.3 + R() * 0.2;
        L.push({ n: g, x: gx, y: 0, z: gz, ry, sx: gs, sy: gs, sz: gs });
      }
    }
  }
  /** El borde del desfiladero: rocas que asoman sobre el vacío, dejando libre el paso del sendero (RepArena: trekRims). */
  private rims(L: TrekPiece[], R: () => number, z: number): void {
    for (const sd of [-1, 1]) for (let x = 1.1 + R() * 0.3; x < 11; x += 0.8 + R()) {
      const n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, b = this.env.rockBox(n), s = (0.6 + R() * 0.7) / b.w, sy = (0.35 + R() * 0.5) / b.h;
      const zz = z + (R() - 0.5) * 0.4;
      L.push({ n, x: sd * x, y: -0.1 - b.y0 * sy, z: zz, ry: R() * TAU, sx: s, sy, sz: s });
    }
  }

  /* ---------- Cada repetición te empuja ---------- */
  /** Una repetición del ejercicio (en partida; la partida cuenta las del tramo solo si no hay parada: trekLeft). */
  rep(perfect: boolean): void {
    const env = this.env;
    if (this.halt) {
      trekHaltSay(this, this.halt);
      return;
    } // (parado: lo que toca es el otro movimiento)
    const now = env.now, gap = this.lastRep ? now - this.lastRep : 2.4;
    this.lastRep = now;
    const kc = clamp(2.4 / Math.max(0.5, gap), 0.6, 1.5);
    const req = (env.ex === 'lunge' ? env.dv('lungeDepth') : env.dv('squatDepth')) / 100, depth = env.calibRef - this.minY;
    const ki = trekLegs(env.ex) || env.ex === 'jsquat' ? clamp(depth / Math.max(0.05, req), 0.6, 1.6) : 1;
    this.minY = 9;
    this.kc = kc;
    this.ki = ki;
    // el turbo: TREK_TURBO_N seguidas a buen ritmo (y bien hondas) lo encienden; una floja lo apaga
    if (kc * ki >= 1.05) {
      this.tg++;
      if (!this.turbo && this.tg >= TREK_TURBO_N) this.turboSet(true);
      else if (!this.turbo && this.tg >= 2) this.haptic(0.15 + 0.08 * this.tg, 40);
    } else {
      this.tg = 0;
      if (this.turbo) this.turboSet(false, 'Fin del turbo: más ritmo');
    }
    this.idle = 0;
    this.want = clamp(1.1 * kc * ki * (perfect ? 1.1 : 1), 0.5, TREK_VMAX) * trekK(env) * (this.turbo ? TREK_TURBO_V : 1);
    this.push = clamp(gap * 1.3, 1.6, 3); // (más deprisa que antes: es una prueba física, no un paseo)
    if (kc * ki > 1.45) this.cheer('¡A TOPE!', '#8fdc5a', 0.9);
    else if (perfect) this.cheer('¡PERFECTA!', '#3cf0c6', 1.0);
    else if (ki < 0.75) this.say('Baja más: irás más deprisa', '#ffd166', 1.0);
    else this.cheer('¡Bien!', '#ffffff', 0.7);
    if (perfect) this.snd('perfect', null);
  }
  /** El turbo: un 20 % más deprisa, los puntos de cada repetición al doble (los pone la partida) y estelas de viento. Lo
   * apagan una repetición floja, 3 s sin ninguna o chocar con un tronco o una rama; en las paradas espera. */
  turboSet(on: boolean, why?: string): void {
    if (this.turbo === on) return;
    this.turbo = on;
    this.ev.push({ t: 'turbo', on });
    if (on) {
      this.cheer('¡TURBO! Puntos ×2', '#c8ff3a', 1.8);
      this.snd('combo', null);
      this.haptic(0.8, 200);
    } else {
      this.tg = 0;
      if (why && this.env.state === 'play') this.cheer(why, '#a49fc8', 1.2);
    }
  }

  /* ---------- Cada fotograma ---------- */
  /** El avance, los retos (salen, se juzgan, te paran) y la parada de ahora. t: el reloj de la partida (s). */
  step(dt: number, t: number): void {
    const env = this.env, st = env.state, H = env.head, hk = this.hooks;
    if (!env.trek) return;
    const chasing = !!(hk.chasing && hk.chasing());
    // la zancada que empuja: solo ante los bandidos o con lobos cerca (la roca tiene su propia cuenta)
    if (st === 'play' && ((this.halt && this.halt.kind === 'bandit') || (chasing && !this.halt))) this.lunge = trekLungeStep(this, dt);
    else {
      this.tlg.st = 'up';
      this.lunge = false;
    }
    this.push -= dt;
    this.minY = Math.min(this.minY, H.y); // (lo más bajo de la cabeza desde la repetición anterior)
    if (st === 'play' && this.push > 0) this.v += Math.sign(this.want - this.v) * Math.min(Math.abs(this.want - this.v), dt * 0.7); // (acelera y frena suave: sin tirones)
    else if (st !== 'paused') this.v = Math.max(0, this.v - dt * (st === 'play' ? 0.45 : 0.9)); // (sin repeticiones, se para; fuera del tramo, antes)
    if (this.halt) {
      this.v = 0;
      this.push = 0;
    } // (parado ante el reto)
    if (st === 'play' && !this.halt && (this.idle += dt) > 3) this.turboSet(false, 'Fin del turbo: no pares'); // (3 s sin repeticiones)
    if (st !== 'play' && st !== 'paused') this.turboSet(false);
    let step = st === 'paused' ? 0 : this.v * dt;
    if (this.glide > 0 && st !== 'paused') {
      const g = Math.min(this.glide, dt * 1.8);
      this.glide -= g;
      step += g;
    } // (el paso a la piedra o el pilar siguiente)
    this.dist += step;
    this.frame();
    trekHopStep(this, dt);
    // los retos: salen a lo lejos, entre la niebla, y se juzgan al pasar por ti
    if (st === 'play' && this.next && this.next - this.dist < TREK_SEE) this.spawn();
    const q = this._q;
    for (const o of this.obs) {
      const z = (o.zl = (o.fixed ? 0 : H.z) - (o.at - this.dist)); // (su distancia, como si el sendero fuera recto: lo que cuenta para saltar o agacharse)
      o.ry = this.bend(o.at, o.dx || 0, q);
      o.px = q.x;
      o.pz = q.z + (o.fixed ? 0 : H.z);
      if (o.asideTo !== undefined) o.dx = (o.dx || 0) + (o.asideTo - (o.dx || 0)) * Math.min(1, dt * 2.5); // (la que no superaste, apartándose)
      if (o.bandits && hk.bandAnim) hk.bandAnim(o, dt, t);
      if (o.judged || st !== 'play') continue;
      trekJudge(this, o, z, step);
    }
    trekHaltStep(this, dt, t);
    if (hk.chaseStep) hk.chaseStep(dt, t);
    trekChestVanish(this, dt);
    // los que quedan atrás, fuera (sin crear otra lista)
    let k = 0;
    for (const o of this.obs) {
      if ((o.zl === undefined ? -99 : o.zl) - (o.len || 0) < H.z + 6) this.obs[k++] = o;
      else this.ev.push({ t: 'drop', o });
    }
    this.obs.length = k;
  }
}
