/**
 * Los lobos que te cortan el paso en la Travesía, tal cual en RepArena (src/75_trek.js: TREK_WOLF_*, trekWolfV, trekK,
 * trekCutPoint, trekChaseStart, trekChaseEnd y trekChaseStep), sin modelos, sonidos ni efectos: eso lo pone el que llama
 * con los sucesos (`WolfEvent`).
 *
 * Salen a lo lejos, delante y a un lado (a la vista desde el primer momento, con una flecha roja encima que se ve a
 * través de todo), y corren en diagonal hacia el sendero para cortarte el paso en un punto por delante de ti: es una
 * carrera hasta ese punto. Si llegas antes (basta con ir a su paso), cruzan el sendero por detrás de ti y te persiguen,
 * pero se van quedando atrás y abandonan; si llegan antes, se te echan encima y muerden (a menos de 0,8 m: una vida). Una
 * zancada hacia delante los hace recular. Aúllan al salir, gruñen más fuerte según se acercan y rugen al morder. Más
 * rápidos en cada tramo y con el rango, poco a poco. Parado ante un cofre o una roca, esperan. Sin enjambres: uno, o dos
 * desde el tercer tramo (el segundo, por el otro lado y algo más lejos).
 *
 * Todo en las coordenadas del sendero (s, u: ver env-foes.ts). Cada fotograma, `wolvesStep` (detrás de los retos, como
 * RepArena: trekChaseStep va después de trekHaltStep). Al entrar en el arroyo o el desfiladero, o al empezar la ronda, el
 * que llama usa `chaseEnd` / `wolvesReset`.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/trek-foes.compare.test.ts.
 */
import { clamp, type PathPt, type WolfEvent, type WolvesEnv } from './env-foes.js';

/** Dónde salen (a D m por delante y X m a un lado), lo que hay que ir más deprisa que ellos para ganar la carrera (1:
 * basta con ir a su paso), a cuánto muerden y a cuántos metros les llega la zancada. */
export const TREK_WOLF_D = 28, TREK_WOLF_X = 9, TREK_WOLF_RHO = 1, TREK_WOLF_BITE = 0.8, TREK_WOLF_SHOVE = 4;
/** Su animación de correr y la del bocado (del modelo del lobo), y el tamaño del modelo. */
export const TREK_WOLF_CLIPS = { run: 'Gallop', bite: 'Attack' } as const;
export const TREK_WOLF_SCALE = 0.42;

/** La velocidad de avance elegida (Ajustes → Modo Travesía: «Velocidad de avance», %). */
export const trekK = (trekSpeed: number): number => (trekSpeed || 100) / 100;
/** Su velocidad (m/s), a tu velocidad de avance: un 25 % menos que antes, que costaba demasiado ganarles. */
export const trekWolfV = (wave: number, rank: number, trekSpeed: number): number => Math.min(1.4, 0.75 + 0.07 * wave + 0.03 * rank) * trekK(trekSpeed);

/** El punto del sendero al que corren, a c m por delante de ti: yendo rho veces más deprisa que ellos, llegaríais a la vez
 * (c = rho·√((D − c)² + X²), por bisección). */
export function trekCutPoint(D: number, X: number, rho: number): number {
  let lo = 0, hi = D;
  for (let i = 0; i < 40; i++) { const c = (lo + hi) / 2; if (c > rho * Math.hypot(D - c, X)) hi = c; else lo = c; }
  return (lo + hi) / 2;
}

/** race: corre a su punto; chase: a por ti; off: tras morder, se aparta; back: empujado, recula; gone: se fue. */
export type WolfSt = 'race' | 'chase' | 'off' | 'back' | 'gone';

/** La flecha roja de encima (una tira plana de cara a ti que se ve a través de rocas y árboles, siempre del mismo tamaño a
 * la vista): dónde, su tamaño (escala de un plano de 1 m) y su opacidad; se apaga al acercarse, cuando ya se ve el lobo. */
export interface WolfMark extends PathPt {
  scale: number;
  opacity: number;
  visible: boolean;
}

export interface Wolf {
  side: number;
  /** Dónde está en el sendero y hacia dónde corre (giro respecto al sendero: el modelo, a bend + hd). */
  s: number;
  u: number;
  hd: number;
  /** Su punto de corte (s). */
  cs: number;
  st: WolfSt;
  offT: number;
  chaseT: number;
  backT: number;
  /** Su fase (el vaivén de la flecha y del trote). */
  ph: number;
  /** Lo que le queda al bocado (s; con su animación, y luego otra vez al galope). */
  biteT: number;
  dustT: number;
  mark: WolfMark;
}

export interface Chase {
  v: number;
  wolves: Wolf[];
  t: number;
  growl: number;
  /** El más cercano (lo que dice el marcador). */
  gap: number;
  bit: boolean;
  shoves: number;
}

export interface WolvesState {
  chase: Chase | null;
  /** A cuántos metros del sendero salen los siguientes (RepArena: TREK.nextChase). */
  nextChase: number;
}

/** Al empezar: los primeros, a los 30 m. */
export const makeWolves = (): WolvesState => ({ chase: null, nextChase: 30 });

/** Al empezar una ronda (RepArena: trekReset): fuera los que haya y otra vez a los 30 m. */
export function wolvesReset(W: WolvesState, env: WolvesEnv, ev: WolfEvent[]): void {
  chaseEnd(W, env, ev);
  W.nextChase = 30;
}

/** Salen (RepArena: trekChaseStart). */
export function chaseStart(W: WolvesState, env: WolvesEnv, ev: WolfEvent[]): void {
  const n = env.wave >= 2 ? 2 : 1, side0 = env.rnd() < 0.5 ? -1 : 1, dist = env.path.dist;
  const C: Chase = { v: trekWolfV(env.wave, env.rank, env.trekSpeed), wolves: [], t: 0, growl: 0, gap: 99, bit: false, shoves: 0 };
  for (let i = 0; i < n; i++) { // (el segundo, por el otro lado y algo más lejos: hay que aguantar el ritmo)
    const D = TREK_WOLF_D + i * 5, X = TREK_WOLF_X + i, side = i ? -side0 : side0;
    C.wolves.push({ side, s: dist + D, u: side * X, cs: dist + trekCutPoint(D, X, TREK_WOLF_RHO), st: 'race', hd: 0, offT: 0, chaseT: 0, backT: 0, ph: env.rnd() * 3, biteT: 0, dustT: 0, mark: { s: 0, u: 0, y: 0, scale: 1, opacity: 0, visible: true } });
  }
  W.chase = C;
  const w = C.wolves[0];
  ev.push({ k: 'chaseStart' }, { k: 'say', text: '¡LOBOS! Acelera y pasa antes que ellos', col: '#ff8a3d', dur: 2.2 }, { k: 'snd', snd: 'wolfHowl', at: { s: w.s, u: w.u, y: 0.8 } }); // (el aullido: se oye de lejos)
}

/** Se acaba (RepArena: trekChaseEnd): los siguientes, de 45 a 70 m más allá. */
export function chaseEnd(W: WolvesState, env: WolvesEnv, ev: WolfEvent[], msg?: string, col?: string): void {
  if (!W.chase) return;
  W.chase = null;
  W.nextChase = env.path.dist + (45 + env.rnd() * (70 - 45));
  ev.push({ k: 'chaseEnd' });
  if (msg) ev.push({ k: 'cheer', text: msg, col: col as string, dur: 1.6 });
  ev.push({ k: 'board' });
}

/** La velocidad de su galope (timeScale): parado ante un reto, despacio. */
export const wolfAnimRate = (C: Chase, halted: boolean): number => (halted ? 0.3 : 0.7 + C.v * 0.5);

/** Cada fotograma (RepArena: trekChaseStep). */
export function wolvesStep(W: WolvesState, dt: number, t: number, env: WolvesEnv, ev: WolfEvent[]): void {
  if (env.state === 'play' && !W.chase && !env.halted && env.path.dist >= W.nextChase) chaseStart(W, env, ev);
  const C = W.chase;
  if (!C) return;
  if (env.state === 'rest' || env.state === 'end') { chaseEnd(W, env, ev); return; }
  const run = env.state === 'play' && !env.halted, su = env.path.dist, uu = env.headU;
  if (run) C.t += dt;
  let near = 99;
  for (const w of C.wolves) {
    if (w.st === 'gone') { w.mark.visible = false; continue; }
    if (run) {
      // la carrera: a su punto del sendero; luego, a por ti (detrás de ti, si llegaste antes); tras morder, se aparta
      let ts = w.cs, tu = 0, v = C.v;
      if (w.st === 'chase') { ts = su; tu = uu; if (w.s < su) v *= 0.85; } // (por detrás de ti, cansados: si sigues, no te alcanzan)
      else if (w.st === 'off') { ts = w.s - 6; tu = w.side * 14; v *= 0.8; w.offT += dt; }
      else if (w.st === 'back') { // (empujado: recula y vuelve a la carga)
        const as = w.s - su, au = w.u - uu, ar = Math.hypot(as, au) || 1;
        ts = w.s + (as / ar) * 3; tu = w.u + (au / ar) * 3; v *= 1.5; w.backT += dt;
        if (w.backT > 1.3) { w.st = 'chase'; w.chaseT = 0; }
      }
      const ds = ts - w.s, du = tu - w.u, r = Math.hypot(ds, du);
      if (r > 1e-3) { const k = Math.min(r, v * dt) / r; w.s += ds * k; w.u += du * k; w.hd = Math.atan2(du, -ds); }
      if (w.st === 'race' && r < 0.25) { w.st = 'chase'; w.chaseT = 0; } else if (w.st === 'chase') w.chaseT += dt;
    }
    const ds = w.s - su, d = Math.hypot(ds, w.u - uu);
    if (env.lunge && run && (w.st === 'race' || w.st === 'chase') && d < TREK_WOLF_SHOVE) { // una zancada hacia él: recula con un gañido
      w.st = 'back'; w.backT = 0; C.shoves++;
      const wp: PathPt = { s: w.s, u: w.u, y: 0.6 };
      ev.push({ k: 'score', n: 80 }, { k: 'board' }, { k: 'fx', fx: 'wolfShove', at: wp }, { k: 'snd', snd: 'shock', at: wp }, { k: 'snd', snd: 'wolfGrowl', at: wp, vol: 1 }, { k: 'say', text: '¡Atrás, lobo!', col: '#ffd166', dur: 0.9 }, { k: 'haptic', s: 0.6, ms: 80 });
    } else if (w.st === 'back' && ds < -15) w.st = 'gone';
    if (w.st === 'race' || w.st === 'chase') {
      near = Math.min(near, d);
      if (run && d < TREK_WOLF_BITE) {
        w.st = 'off'; C.bit = true; w.biteT = 0.6;
        ev.push({ k: 'snd', snd: 'wolfBite', at: { s: w.s, u: w.u, y: 0.7 } }, { k: 'hurt' }, { k: 'say', text: '¡Te ha mordido un lobo! Acelera', col: '#ff3b5c', dur: 1.8 }, { k: 'haptic', s: 0.9, ms: 160 }, { k: 'board' });
      } else if (w.st === 'race' ? ds < -45 : ds < -12 && w.chaseT > 1.5) w.st = 'gone'; // (se ha quedado atrás; en la carrera, sigue hasta cruzar el sendero por detrás de ti)
    } else if (w.st === 'off' && (w.offT > 4 || ds < -15)) w.st = 'gone';
    // la flecha: unos 2,3° a la vista, cerca o lejos
    const mk = w.mark, k = clamp(d * 0.04, 0.3, 1.5) * (1 + 0.08 * Math.sin(t * 7 + w.ph));
    mk.s = w.s; mk.u = w.u; mk.y = 0.95 + k * 0.6; mk.scale = k;
    mk.opacity = w.st === 'race' || w.st === 'chase' ? clamp((d - 4) / 5, 0, 1) * 0.95 : 0; mk.visible = mk.opacity > 0.01;
    // el polvo que levantan (se los ve venir de lejos) y el bocado (luego, otra vez al galope)
    if (run && w.st !== 'off' && (w.dustT -= dt) <= 0) { w.dustT = 0.15; ev.push({ k: 'fx', fx: 'wolfDust', at: { s: w.s, u: w.u, y: 0.1 } }); }
    if (w.biteT > 0) w.biteT = Math.max(0, w.biteT - dt);
  }
  C.gap = near;
  // al acercarse, gruñen: más a menudo y más fuerte cuanto más cerca (el más cercano)
  if (near < 12 && (C.growl -= dt) <= 0) {
    const k = clamp(1 - near / 12, 0, 1);
    C.growl = 2.2 - 1.2 * k;
    let n: Wolf | null = null, nd = 99;
    for (const x of C.wolves) if (x.st === 'race' || x.st === 'chase') { const d = Math.hypot(x.s - su, x.u - uu); if (d < nd) { nd = d; n = x; } }
    if (n) ev.push({ k: 'snd', snd: 'wolfGrowl', at: { s: n.s, u: n.u, y: 0.6 }, vol: k });
    if (near < 4) ev.push({ k: 'haptic', s: 0.25, ms: 40 });
  }
  if (C.wolves.every((w) => w.st === 'gone')) {
    if (!C.bit) ev.push({ k: 'score', n: 250 });
    chaseEnd(W, env, ev, C.bit ? 'Los lobos se quedan atrás' : '¡Has dejado atrás a los lobos!', '#3cf0c6');
  } else if (C.t > 50) chaseEnd(W, env, ev, 'Los lobos se cansan', '#a49fc8');
}
