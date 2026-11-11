/**
 * Los bandidos que cortan el paso en la Travesía, tal cual en RepArena (src/75_trek.js: trekBandFight, trekBandShove,
 * trekStoneThrow, trekStoneLeg, trekStoneStep, trekStoneJudge, trekStoneLow, trekBandDiff, trekBandAnim y lo de los
 * bandidos de trekHaltEnd), sin modelos, sonidos ni efectos: eso lo pone el que llama con los sucesos (`BanditEvent`).
 *
 * Opción A del usuario (sin golpes: con el retraso de las manos en las gafas no daba tiempo): te paras ante ellos y salen
 * de uno en uno; se plantan a unos 4,5 m y te lanzan piedras. La alta, a la cabeza: agáchate; la baja, que bota y rueda
 * hasta las espinillas: salta; la que va al cuerpo: apártate a un lado. Cada esquivada le duele (se encoge y se queja) y le
 * quita una bolita; con 5 (6 desde el tercer tramo), cae muerto. La que te da, una vida. Una zancada hacia él lo empuja
 * (recula y pierde una bolita). Antes de lanzar casi siempre cambia de sitio y, a veces, te provoca. Si en 90 s no acabas,
 * se van (sin premio).
 *
 * Cada fotograma, mientras la parada exista: `bandAnim` (dónde está cada uno, su animación, los caídos que se hunden y los
 * que se van) y luego, mientras sea la parada de ahora (RepArena: TREK.halt), `bandFight`. En ese orden, como RepArena
 * (trekBandAnim va en el bucle de los retos y trekBandFight, después, en trekHaltStep).
 *
 * La animación de cada bandido (`cur`: el clip, su tiempo, si está parado y su velocidad) es parte de la lógica: el
 * lanzamiento sale cuando su animación pasa el brazo por encima de la cabeza. El que pinta pone en su modelo ese clip en
 * ese tiempo. Sin modelo (env.clips = null), como RepArena sin b.mix: el lanzamiento va por reloj.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/trek-foes.compare.test.ts.
 */
import { Vector3 } from 'three';
import { clamp, smooth, type BanditEvent, type BanditsEnv, type P3 } from './env-foes.js';

/** Las animaciones del bandido (de anims.glb, las de los monstruos: el mismo esqueleto). */
export const TREK_BAND_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Dance_Loop', 'OverhandThrow', 'Hit_Chest', 'Hit_Head', 'Death01'] as const;
export type BandClip = (typeof TREK_BAND_CLIPS)[number];

export type StoneAtk = 'high' | 'low' | 'body';
/** Lo que se dice al lanzar cada piedra. */
export const TREK_STONE_TXT: Record<StoneAtk, [string, string]> = { high: ['¡PIEDRA ALTA!', '¡Agáchate!'], low: ['¡PIEDRA BAJA!', '¡Salta!'], body: ['¡AL CUERPO!', '¡Apártate!'] };
/** En OverhandThrow: el brazo atrás del todo a los 0,25 s; la piedra sale a los 0,35 s, por encima de la cabeza. */
export const TREK_THROW = { cock: 0.25, rel: 0.35 };
/** El color del aviso rojo sobre el que prepara el lanzamiento. */
export const TREK_WARN_COL = 0xff3b5c;
const G = 9.8;

export type BandSt = 'wait' | 'come' | 'guard' | 'move' | 'taunt' | 'wind' | 'whip' | 'throw' | 'hurt' | 'stun' | 'down' | 'leave' | 'gone';

/** La animación que tiene puesta (RepArena: la AnimationAction de b.cur). */
export interface BandAnim {
  clip: BandClip;
  time: number;
  paused: boolean;
  /** Su velocidad (timeScale). */
  ts: number;
  /** Una sola vez (y se queda en el último fotograma) o en bucle. */
  once: boolean;
  dur: number;
}

export interface Bandit {
  /** Dónde está (en la parada) y lo hundido que va (los caídos). */
  x: number;
  z: number;
  y: number;
  st: BandSt;
  /** El reloj de su estado. */
  t: number;
  /** Las piedras que hay que esquivarle (las bolitas de encima) y las que tenía. */
  hp: number;
  maxHp: number;
  /** Su ropa (0 o 1) y su fase (para el vaivén). */
  skin: number;
  ph: number;
  alive: boolean;
  /** Hacia dónde mira (rotation.y del modelo, que mira hacia −z). */
  ry: number;
  gap: number;
  moved: boolean;
  willMove: boolean | undefined;
  mx: number;
  mz: number;
  mv: number;
  vx: number;
  vz: number;
  /** Las tres piedras de cada tanda (no se repite siempre la misma) y la que lanza. */
  bag: StoneAtk[] | null;
  atk: StoneAtk | undefined;
  hurtT: number;
  cur: BandAnim | null;
}

interface Leg {
  a: Vector3 | null;
  b: Vector3;
  k: number;
}

export interface Stone {
  by: Bandit;
  /** Dónde va (en la parada), su giro y su tamaño (la que te da se apaga encogiéndose). */
  pos: Vector3;
  rx: number;
  rz: number;
  scale: number;
  from: Vector3;
  to: Vector3;
  atk: StoneAtk;
  dur: number;
  t: number;
  /** Tu cabeza a un lado al lanzarla (para «apártate») y lo más alto que has saltado al final. */
  x0: number;
  up: number;
  done: boolean;
  ok: boolean;
  after: number;
  legs: Leg[];
  leg: number;
  v: Vector3;
  vEnd: Vector3;
  t0: number;
  p0: Vector3;
  T: number;
  gone: boolean;
}

export interface BanditStop {
  bandits: Bandit[];
  stones: Stone[];
  /** Lo que lleva la parada (RepArena: o.haltT, que en los bandidos corre al doble). */
  haltT: number;
  /** El aviso rojo sobre el que prepara la piedra: dónde y su opacidad. */
  warn: { x: number; y: number; z: number; opacity: number };
  dodges: number;
  shoves: number;
  hits: number;
  /** Acabada (RepArena: o.done tras trekHaltEnd). */
  done: boolean;
}

/** Menos tiempo de vuelo en cada tramo y con el rango, poco a poco (de 1 s a 0,75 s: con 1,4 s se veían flotar); el brazo
 * atrás (el aviso), de 0,8 s a 0,55 s (con 0,9 s fijos, el lanzamiento se hacía lento y aburrido). */
export const trekBandDiff = (wave: number, rank: number): { fly: number; wu: number } => ({ fly: Math.max(0.75, 1 - 0.035 * wave - 0.02 * rank), wu: Math.max(0.55, 0.8 - 0.04 * wave - 0.02 * rank) });

/** Los bandidos de una parada, uno detrás de otro (RepArena: trekSpawn, kind 'bandit'): 1, 2 desde el tercer tramo, 3
 * desde el quinto; 5 piedras que esquivar a cada uno (6 desde el tercer tramo). Con modelo, empiezan bailando. */
export function makeBanditStop(wave: number, rnd: () => number, clips: BanditsEnv['clips']): BanditStop {
  const n = wave >= 4 ? 3 : wave >= 2 ? 2 : 1, bandits: Bandit[] = [];
  for (let i = 0; i < n; i++) {
    const hp = wave >= 2 ? 6 : 5;
    const b: Bandit = { x: (i % 2 ? 1 : -1) * (i ? 0.9 : 0.15), z: -2.5 - i * 1.6, y: 0, st: 'wait', t: 0, hp, maxHp: hp, skin: i % 2, ph: rnd() * 3, alive: true, ry: Math.PI, gap: 0, moved: false, willMove: undefined, mx: 0, mz: 0, mv: 0, vx: 0, vz: 0, bag: null, atk: undefined, hurtT: 0, cur: null };
    bandits.push(b);
    if (clips) bandPlay(b, 'Dance_Loop', false, clips);
  }
  return { bandits, stones: [], haltT: 0, warn: { x: 0, y: 1.45, z: 0, opacity: 0 }, dodges: 0, shoves: 0, hits: 0, done: false };
}

/** Le pone una animación (RepArena: trekBandPlay): devuelve lo que dura, o 0 sin modelo o sin ese clip. La que ya tiene
 * en bucle no se reinicia. */
export function bandPlay(b: Bandit, n: BandClip, once: boolean, clips: BanditsEnv['clips']): number {
  if (!clips || !clips[n]) return 0;
  const dur = clips[n];
  if (b.cur && b.cur.clip === n && !once) return dur;
  if (!b.cur) b.cur = { clip: n, time: 0, paused: false, ts: 1, once, dur };
  const a = b.cur;
  a.clip = n; a.time = 0; a.paused = false; a.ts = 1; a.once = once; a.dur = dur;
  return dur;
}

// el reloj de la animación (como AnimationMixer.update: la de una vez se queda en su último fotograma)
function animTick(a: BandAnim, dt: number): void {
  if (a.paused) return;
  let time = a.time + dt * a.ts;
  if (a.once) {
    if (time >= a.dur) { time = a.dur; a.paused = true; } else if (time < 0) { time = 0; a.paused = true; }
  } else if (a.dur > 0 && (time >= a.dur || time < 0)) time -= a.dur * Math.floor(time / a.dur);
  a.time = time;
}

const bp3 = (b: Bandit, y: number): P3 => ({ x: b.x, y, z: b.z });

/** ¿Hay una piedra baja en el aire? (en «Probar en el ordenador», soltar Espacio entonces es saltar) */
export function stoneLow(o: BanditStop | null): boolean {
  if (!o) return false;
  for (const q of o.stones) if (!q.done && q.atk === 'low') return true;
  return false;
}

/** Acaba la parada (lo de los bandidos de RepArena trekHaltEnd): los que quedan se van; si se ganó, el premio. */
export function bandEnd(o: BanditStop, won: boolean, env: BanditsEnv, ev: BanditEvent[]): void {
  o.done = true;
  ev.push({ k: 'end', won });
  o.warn.opacity = 0;
  for (const b of o.bandits) if (b.st !== 'down' && b.st !== 'gone') { b.st = 'leave'; b.t = 0; bandPlay(b, 'Walk_Loop', false, env.clips); }
  if (!won) return;
  ev.push({ k: 'score', n: 300 * o.bandits.length }, { k: 'cheer', text: '¡Camino libre!', col: '#3cf0c6', dur: 1.6 }, { k: 'snd', snd: 'victory', at: null }, { k: 'board' });
}

const SHOVE_ST: readonly BandSt[] = ['come', 'guard', 'move', 'taunt', 'wind', 'whip', 'throw'];

/** El combate, cada fotograma mientras sea la parada de ahora (RepArena: trekBandFight). */
export function bandFight(o: BanditStop, dt: number, t: number, env: BanditsEnv, ev: BanditEvent[]): void {
  if (o.done) return;
  if (env.state !== 'play') { if (env.state === 'rest' || env.state === 'end') bandEnd(o, false, env, ev); return; }
  // (dos veces, como RepArena: trekHaltStep lo suma y trekBandFight otra vez; así los «90 s» son 45 de verdad. El que
  // llama no lo suma para los bandidos)
  o.haltT += dt;
  o.haltT += dt;
  stoneStep(o, dt, env, ev);
  let B: Bandit | null = null;
  for (const b of o.bandits) if (b.alive && b.st !== 'gone' && b.st !== 'leave') { B = b; break; }
  if (!B) { // (sigues cuando el último caído ya no está en el sendero)
    if (!o.stones.length && !o.bandits.some((b) => b.st === 'down')) bandEnd(o, true, env, ev);
    return;
  }
  if (o.haltT > 90) { ev.push({ k: 'say', text: 'Los bandidos se van', col: '#a49fc8', dur: 1.6 }); bandEnd(o, false, env, ev); return; }
  const L = env.loc, fz = L.z - 4.5, D = trekBandDiff(env.wave, env.rank), rnd = env.rnd, rand = (a: number, b: number): number => a + rnd() * (b - a);
  B.t += dt;
  if (B.st === 'wait') { B.st = 'come'; B.t = 0; bandPlay(B, 'Walk_Loop', false, env.clips); }
  if (env.lunge && SHOVE_ST.includes(B.st)) { bandShove(o, B, env, ev); return; } // (la zancada lo empuja)
  if (B.st === 'come') { // (arranca sin tirón)
    const tx = L.x * 0.3, dx = tx - B.x, dz = fz - B.z, d = Math.hypot(dx, dz), v = Math.min(d, dt * 1.6 * Math.min(1, B.t * 2));
    if (d > 0.02) { B.x += (dx / d) * v; B.z += (dz / d) * v; }
    if (d < 0.05) { B.st = 'guard'; B.t = 0; B.gap = rand(0.2, 0.5); bandPlay(B, 'Idle_Loop', false, env.clips); }
  } else if (B.st === 'stun') { // (empujado: recula tambaleándose y vuelve)
    B.x += B.vx * dt; B.z += B.vz * dt; B.vx *= Math.max(0, 1 - dt * 5); B.vz *= Math.max(0, 1 - dt * 5);
    if (B.t > 1.0) { B.st = 'come'; B.t = 0; bandPlay(B, 'Walk_Loop', false, env.clips); }
  } else if (B.st === 'guard' && B.t > B.gap && !B.moved && (B.willMove === undefined ? (B.willMove = rnd() < 0.75) : B.willMove)) {
    // antes de lanzar, casi siempre cambia de sitio: de lado, a veces corriendo
    const sg = rnd() < 0.5 ? -1 : 1, nx = clamp(B.x + sg * rand(0.7, 1.6), -1.5, 1.5);
    B.mx = Math.abs(nx - B.x) < 0.5 ? -Math.sign(B.x || 1) * rand(0.6, 1.3) : nx; B.mz = fz + rand(-0.8, 0.5); B.mv = rand(1.6, 2.8);
    B.st = 'move'; B.t = 0; B.moved = true; bandPlay(B, 'Walk_Loop', false, env.clips); if (B.cur) B.cur.ts = B.mv / 1.4;
  } else if (B.st === 'move') {
    const dx = B.mx - B.x, dz = B.mz - B.z, d = Math.hypot(dx, dz), v = Math.min(d, dt * B.mv);
    if (d > 0.03) { B.x += (dx / d) * v; B.z += (dz / d) * v; }
    if (d < 0.05 || B.t > 2.2) {
      if (rnd() < 0.3) { B.st = 'taunt'; B.t = 0; bandPlay(B, 'Dance_Loop', false, env.clips); } else { B.st = 'guard'; B.t = 0; B.gap = rand(0.1, 0.3); bandPlay(B, 'Idle_Loop', false, env.clips); }
    }
  } else if (B.st === 'taunt' && B.t > 0.8) { B.st = 'guard'; B.t = 0; B.gap = 0.1; bandPlay(B, 'Idle_Loop', false, env.clips); } // (te provoca un momento y lanza)
  else if (B.st === 'guard' && B.t > B.gap) { // prepara el lanzamiento: alta, baja o al cuerpo (de tres en tres, las tres)
    B.moved = false; B.willMove = undefined;
    if (!B.bag || !B.bag.length) { const bag: StoneAtk[] = ['high', 'low', 'body']; B.bag = bag.sort(() => rnd() - 0.5); if (B.bag[0] === B.atk) B.bag.push(B.bag.shift() as StoneAtk); }
    B.st = 'wind'; B.t = 0; B.atk = B.bag.shift() as StoneAtk; const [a, b] = TREK_STONE_TXT[B.atk];
    ev.push({ k: 'say', text: `${a} ${b}`, col: '#ff3b5c', dur: D.wu + D.fly + 0.4 }, { k: 'snd', snd: 'banditThrow', at: bp3(B, 1.6) }); // (su esfuerzo, con voz de persona)
    bandPlay(B, 'OverhandThrow', true, env.clips); if (B.cur) { B.cur.paused = true; B.cur.time = 0; }
  } else if (B.st === 'wind') { // echa el brazo atrás despacio y lo aguanta un instante (el aviso)…
    if (B.cur && B.cur.paused) B.cur.time = TREK_THROW.cock * smooth(clamp(B.t / (D.wu * 0.75), 0, 1));
    if (B.t >= D.wu) { if (B.cur) { B.cur.paused = false; B.cur.time = TREK_THROW.cock; B.cur.ts = 1; } B.st = 'whip'; B.t = 0; }
  } else if (B.st === 'whip' && (B.cur ? B.cur.time >= TREK_THROW.rel : B.t >= TREK_THROW.rel - TREK_THROW.cock)) { stoneThrow(o, B, env, D.fly, ev); B.st = 'throw'; B.t = 0; } // (…y lo descarga)
  else if (B.st === 'throw' && !o.stones.some((q) => q.by === B && !q.done) && B.t > 0.4) { B.st = 'guard'; B.t = 0; B.gap = rand(0.2, 0.5); bandPlay(B, 'Idle_Loop', false, env.clips); }
  else if (B.st === 'hurt' && B.t > (B.hurtT || 0.45) + 0.15) { B.st = 'guard'; B.t = 0; B.gap = rand(0.5, 0.9); bandPlay(B, 'Idle_Loop', false, env.clips); } // (se rehace y vuelve a la carga)
  // el aviso rojo sobre él mientras prepara el lanzamiento
  o.warn.x = B.x; o.warn.y = 1.45; o.warn.z = B.z; o.warn.opacity = B.st === 'wind' ? 0.35 + 0.35 * Math.sin(t * 18) : 0;
}

/** El empujón (RepArena: trekBandShove): una zancada hacia él le llega como una onda: recula tambaleándose, pierde una
 * bolita (la última, cae) y, si estaba preparando la piedra, no la llega a lanzar. */
function bandShove(o: BanditStop, B: Bandit, env: BanditsEnv, ev: BanditEvent[]): void {
  const L = env.loc, bp = bp3(B, 1.2);
  B.hp--; o.shoves++;
  ev.push({ k: 'score', n: 120 }, { k: 'board' }, { k: 'haptic', s: 0.7, ms: 90 }, { k: 'fx', fx: 'shove', at: bp }, { k: 'snd', snd: 'shock', at: bp });
  if (B.hp <= 0) {
    B.alive = false; B.st = 'down'; B.t = 0; bandPlay(B, 'Death01', true, env.clips);
    ev.push({ k: 'snd', snd: 'banditDeath', at: bp }, { k: 'kill', at: bp }, { k: 'cheer', text: '¡Bandido derrotado!', col: '#3cf0c6', dur: 1.2 }, { k: 'say', text: '¡Derribado de un empujón!', col: '#3cf0c6', dur: 1.2 }, { k: 'score', n: 200 });
    return;
  }
  const dx = B.x - L.x * 0.3, dz = B.z - L.z, d = Math.hypot(dx, dz) || 1;
  B.vx = (dx / d) * 3.2; B.vz = (dz / d) * 3.2; B.st = 'stun'; B.t = 0; B.moved = false;
  bandPlay(B, 'Hit_Chest', true, env.clips);
  ev.push({ k: 'snd', snd: 'banditHurt', at: bp }, { k: 'say', text: `¡Empujón! Le ${B.hp === 1 ? 'queda 1' : `quedan ${B.hp}`}`, col: '#ffd166', dur: 0.9 });
}

/** La piedra (RepArena: trekStoneThrow): sale de su mano derecha y vuela en parábola a donde estás: a la cabeza, al pecho
 * o, la baja, botando en el suelo a medio camino y rodando hasta las espinillas. */
function stoneThrow(o: BanditStop, B: Bandit, env: BanditsEnv, fly: number, ev: BanditEvent[]): void {
  const L = env.loc, from = new Vector3(B.x - 0.25, 1.75, B.z + 0.3), h = env.clips && env.hand ? env.hand(B) : null;
  if (h) { from.set(h.x, h.y, h.z); from.y = Math.max(0.6, from.y); }
  const atk = B.atk as StoneAtk, y = atk === 'high' ? env.calibRef - 0.02 : atk === 'low' ? 0.2 : env.calibRef - 0.5, to = new Vector3(L.x, y, L.z);
  // la baja: primero hasta el suelo, a medio camino (bota); luego, a ras, hasta ti
  const legs: Leg[] = atk === 'low' ? [{ a: from, b: new Vector3((from.x + to.x) / 2, 0.1, (from.z + to.z) / 2), k: 0.5 }, { a: null, b: to, k: 0.5 }] : [{ a: from, b: to, k: 1 }];
  o.stones.push({ by: B, pos: from.clone(), rx: 0, rz: 0, scale: 1, from, to, atk, dur: fly, t: 0, x0: env.head.x, up: 0, done: false, ok: false, after: 0, legs, leg: -1, v: new Vector3(), vEnd: new Vector3(), t0: 0, p0: new Vector3(), T: 0, gone: false });
  ev.push({ k: 'snd', snd: 'whoosh', at: { x: from.x, y: from.y, z: from.z } });
}

/** En cada tramo del vuelo, la velocidad de salida que lo lleva de un punto a otro en su tiempo, con la gravedad
 * (p = p0 + v·t − ½·g·t²) (RepArena: trekStoneLeg). */
function stoneLeg(q: Stone, i: number): void {
  const { a, b, k } = q.legs[i], T = q.dur * k, p0 = a || q.pos;
  q.leg = i; q.t0 = q.t; q.p0.copy(p0); q.T = T; q.v.subVectors(b, q.p0).divideScalar(T); q.v.y += 0.5 * G * T;
}

/** El vuelo de las piedras (RepArena: trekStoneStep). */
function stoneStep(o: BanditStop, dt: number, env: BanditsEnv, ev: BanditEvent[]): void {
  for (const q of o.stones) {
    q.t += dt; const k = q.t / q.dur;
    if (!q.done) {
      if (q.leg < 0) stoneLeg(q, 0);
      let u = q.t - q.t0;
      if (u >= q.T && q.leg < q.legs.length - 1) { // (bota)
        q.pos.copy(q.legs[q.leg].b); stoneLeg(q, q.leg + 1); u = q.t - q.t0;
        ev.push({ k: 'fx', fx: 'bounce', at: { x: q.pos.x, y: q.pos.y, z: q.pos.z } }, { k: 'snd', snd: 'step', at: { x: q.pos.x, y: q.pos.y, z: q.pos.z } });
      }
      u = Math.min(u, q.T); q.pos.copy(q.p0).addScaledVector(q.v, u); q.pos.y -= 0.5 * G * u * u; q.rx += dt * 14; q.rz += dt * 8;
      if (k > 1 - 0.45 / q.dur) q.up = Math.max(q.up, env.eyeY - env.calibRef); // (el salto, en el último medio segundo)
      if (k >= 1) { q.done = true; q.vEnd.set(q.v.x, q.v.y - G * q.T, q.v.z); stoneJudge(o, q, env, ev); }
    } else { // esquivada: sigue de largo (y cae); si te dio, cae a tus pies y se apaga
      q.after += dt;
      if (q.ok) {
        q.vEnd.y -= G * dt; q.pos.addScaledVector(q.vEnd, dt);
        if (q.pos.y < 0.08) { q.pos.y = 0.08; q.vEnd.y *= -0.3; q.vEnd.x *= 0.6; q.vEnd.z *= 0.6; }
      } else q.scale *= Math.max(0, 1 - dt * 4);
      if (q.after > 0.9) q.gone = true;
    }
  }
  if (o.stones.some((q) => q.gone)) o.stones = o.stones.filter((q) => !q.gone);
}

/** ¿La has esquivado? (RepArena: trekStoneJudge) Alta: agachado (la cabeza 20 cm por debajo de tu altura de pie); baja: has
 * saltado al pasar (la cabeza, «Altura del salto» por encima); al cuerpo: apartado 20 cm a un lado. */
function stoneJudge(o: BanditStop, q: Stone, env: BanditsEnv, ev: BanditEvent[]): void {
  const B = q.by, HL = env.head;
  const ok = q.atk === 'high' ? env.calibRef - HL.y > 0.2 : q.atk === 'low' ? q.up > env.jumpHeight / 100 : Math.abs(HL.x - q.x0) > 0.2;
  q.ok = ok;
  const p: P3 = { x: q.to.x, y: q.to.y, z: q.to.z }, bp = bp3(B, 1.6);
  if (ok) {
    B.hp--; o.dodges++;
    ev.push({ k: 'score', n: 100 }, { k: 'board' }, { k: 'haptic', s: 0.3, ms: 40 }, { k: 'snd', snd: 'whoosh', at: p });
    if (B.hp <= 0) { // sin aguante: cae muerto (se desploma, se queda tendido y luego se hunde en la hierba)
      B.alive = false; B.st = 'down'; B.t = 0; bandPlay(B, 'Death01', true, env.clips);
      ev.push({ k: 'snd', snd: 'banditDeath', at: bp }, { k: 'kill', at: bp }, { k: 'cheer', text: '¡Bandido derrotado!', col: '#3cf0c6', dur: 1.2 }, { k: 'say', text: '¡Derribado!', col: '#3cf0c6', dur: 1.2 }, { k: 'score', n: 200 });
    } else { // le duele: se encoge (al pecho o a la cabeza) y se queja
      B.st = 'hurt'; B.t = 0; B.hurtT = bandPlay(B, env.rnd() < 0.5 ? 'Hit_Chest' : 'Hit_Head', true, env.clips) || 0.4;
      ev.push({ k: 'snd', snd: 'banditHurt', at: bp }, { k: 'fx', fx: 'sparks', at: bp }, { k: 'say', text: `¡Esquivada! Le ${B.hp === 1 ? 'queda 1' : `quedan ${B.hp}`}`, col: '#ffd166', dur: 0.9 });
    }
  } else {
    o.hits++;
    ev.push({ k: 'hurt' }, { k: 'hit' }, { k: 'fx', fx: 'dust', at: p }, { k: 'snd', snd: 'metalHit', at: p }, { k: 'say', text: q.atk === 'high' ? '¡Te ha dado! Agáchate antes' : q.atk === 'low' ? '¡Te ha dado! Salta antes' : '¡Te ha dado! Apártate a un lado', col: '#ff3b5c', dur: 1.6 });
  }
}

/** Cada fotograma, mientras exista la parada (RepArena: trekBandAnim): los derribados se hunden y desaparecen, los que se
 * van se apartan del camino y todos, de cara a ti (sin saltos), con su animación al paso. */
export function bandAnim(o: BanditStop, dt: number, env: BanditsEnv): void {
  const L = env.loc;
  for (const b of o.bandits) {
    if (b.st === 'down' && (b.t += dt) > 2.6) { b.y -= dt * 0.8; if (b.y < -0.6) b.st = 'gone'; } // (cae, se queda tendido y luego se hunde)
    if (b.st === 'leave') { b.t += dt; b.x += (b.x < 0 ? -1 : 1) * dt * 1.2; if (b.t > 4) b.st = 'gone'; }
    if (!env.clips) continue; // (sin modelo, RepArena no lo gira ni lo anima)
    const want = b.st === 'leave' ? (b.x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(L.x - b.x, L.z - b.z) + Math.PI; // (el modelo mira hacia −z)
    if (b.st !== 'down') { let d = want - b.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); b.ry += d * Math.min(1, dt * 6); }
    if (b.cur) animTick(b.cur, dt * (b.st === 'stun' ? 0.6 : 1));
  }
}
