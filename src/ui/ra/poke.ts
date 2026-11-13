/**
 * Pulsar los menús con el dedo como un botón de verdad, como en RepArena (src/60_ui.js: pokeWidgets, pokePanel, POKE),
 * portado tal cual (opción B del usuario, PR 31). Medidas en metros reales, también en el menú de muñeca (que va a escala):
 *  · el dedo tiene que llegar por delante: la tecla que tiene delante (hasta POKE_HOVER) se ilumina y es la única que ese
 *    dedo puede pulsar; entrar de lado o por detrás no pulsa nada
 *  · pulsa al hundirse POKE_DEPTH yendo hacia dentro (un barrido de lado no cuenta)
 *  · imán (opción B elegida por el usuario): la iluminada sigue iluminada hasta que el dedo sale de ella más de POKE_STICK; a
 *    menos de POKE_MAG_Z por delante, la mano que se ve se acerca a ella y, al tocarla, se queda clavada donde tocó
 *  · pegada (pedido del usuario): la tecla tocada retiene el dedo que se ve hasta que lo apartas por delante; si la mano de
 *    verdad resbala de lado (hasta POKE_KEEP), el dedo que se ve sigue sobre ella y no ilumina las vecinas
 *  · sólida: la mano que se ve se queda apoyada en la tecla y en el panel (el fondo y los huecos), sin atravesarlos
 *  · tras pulsar (o al abrirse un menú), ese dedo no pulsa en el menú nuevo hasta retirarse
 *  · vale cualquiera de las dos manos (el botón MENÚ de la muñeca izquierda, solo la derecha)
 * Decide de lado la punta suavizada (la que se ve: sin el temblor del seguimiento); cuánto se hunde, la de las gafas.
 */
import { Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { HOOKS } from '../../core/state.js';
import { diagEvent } from '../../core/diag.js';
import { haptic } from '../../input/hand-system.js';
import type { Side } from '../../input/hand-model.js';
import { clamp, smooth } from '../canvas-kit.js';
import type { Slider, Widget } from './btn.js';

/** El dedo de cada mano que puede pulsar (la de verdad: sin las calculadas). p: la punta de las gafas; s: la que se ve. */
export interface Finger {
  side: Side;
  p: Vector3;
  s: Vector3;
}
export const fingers: Finger[] = [];

/** El menú que se pulsa: su grupo (la cara del panel, en z = 0), su ancho y su alto, y si se ve. */
export interface PokeMenu {
  group: Object3D;
  W: number;
  H: number;
  closed: boolean;
  wrist: boolean;
}

const POKE_HOLD_MAX = 0.12; // (más hundido que esto, la mano viene de otro sitio: atraviesa)
const POKE_HOVER = 0.06, POKE_DEPTH = 0.007, POKE_TRAVEL = 0.012, POKE_OUT = 0.008, POKE_GAP = 0.25, POKE_BACK = 0.02;
const POKE_STICK = 0.012, POKE_MAG_Z = 0.035, POKE_MAG_MAX = 0.015, POKE_SWIPE_T = 0.06, POKE_SWIPE_MIN = 0.02;
const POKE_KEEP = 0.07;

interface PokeSt {
  cand: Widget | null;
  n: number;
  push: boolean;
  done: boolean;
  hist: [number, number, number, number][];
  clock: number;
  pin: Vector3 | null;
  pinW: Vector3 | null;
  mag: Vector3;
  lz?: number;
}
interface Lock {
  key: string;
  n: Vector3;
  p: Vector3;
  pinW: Vector3 | null;
}
export const POKE = {
  st: {} as Record<string, Partial<Record<Side, PokeSt>>>,
  /** Al abrirse un menú: el dedo tiene que retirarse antes de pulsar en él. */
  need: { left: false, right: false } as Record<Side, boolean>,
  until: 0,
  busyT: -9,
  lock: { left: null, right: null } as Record<Side, Lock | null>,
  /** Lo que hay que mover la mano que se ve (por cada sitio que se pulsa: el menú y el botón de la muñeca). */
  hold: { left: {}, right: {} } as Record<Side, Record<string, { v: Vector3; t: number }>>,
  pan: { left: { front: false }, right: { front: false } } as Record<Side, { front: boolean }>,
};
function pokeSt(key: string, side: Side): PokeSt {
  const K = POKE.st[key] || (POKE.st[key] = {});
  return K[side] || (K[side] = { cand: null, n: 0, push: false, done: false, hist: [], clock: 0, pin: null, pinW: null, mag: new Vector3() });
}
const reset = (S: PokeSt): void => {
  S.cand = null;
  S.push = false;
  S.done = false;
  S.pin = null;
  S.pinW = null;
};

const _wl = new Vector3(), _pkL = new Vector3(), _pkV = new Vector3(), _pnN = new Vector3(), _pkM = new Vector3();

// el panel del menú (su cara, en z = 0 del grupo): delante y dentro, el dedo queda «armado»; si sigue y lo cruza, la mano
// que se ve se queda en la superficie hasta que salga por delante, por un lado o se hunda más de POKE_HOLD_MAX
function pokePanel(side: Side, f: Finger, shown: boolean, Hd: { v: Vector3 }, menu: PokeMenu | null): void {
  const P = POKE.pan[side], g = menu?.group;
  if (!shown || !g || !menu!.H) {
    P.front = false;
    return;
  }
  g.updateMatrixWorld();
  const e = g.matrixWorld.elements, sc = Math.hypot(e[8], e[9], e[10]) || 1, l = g.worldToLocal(_wl.copy(f.p));
  const m = 0.012 / sc, inR = Math.abs(l.x) < menu!.W / 2 + m && Math.abs(l.y) < menu!.H / 2 + m, z = l.z * sc;
  if (!inR) {
    P.front = false;
    return;
  }
  if (z > 0) {
    P.front = z < 0.25;
    return;
  }
  if (!P.front || -z >= POKE_HOLD_MAX) {
    P.front = false;
    return;
  }
  if (-z > Hd.v.length()) Hd.v.copy(_pnN.set(e[8], e[9], e[10]).normalize()).multiplyScalar(-z);
}
const pokeU = (w: Widget, l: Vector3): number => clamp((l.x + w.w / 2 - (w.pad ?? 0)) / (w.w - 2 * (w.pad ?? 0)), 0, 1);

interface Rel {
  w: Widget;
  l: Vector3;
  z: number;
  d: number;
  ex: number;
  sc: number;
}
// adónde tira el imán, en las coordenadas de la tecla: dentro de ella (a 6 mm del borde) y un poco hacia el centro
function pokeSafe(R: Rel, x: number, y: number): [number, number] {
  const w = R.w, ins = Math.min(0.006 / R.sc, w.w / 4, w.h / 4), hx = w.w / 2 - ins, hy = w.h / 2 - ins, c = 0.005 / R.sc;
  x = clamp(x, -hx, hx);
  y = clamp(y, -hy, hy);
  return [x - Math.sign(x) * Math.min(Math.abs(x) * 0.2, c), y - Math.sign(y) * Math.min(Math.abs(y) * 0.2, c)];
}
// lo que hay que mover de lado la mano que se ve (en el mundo) para llevar la punta del dedo a (px, py) de la tecla
function pokeMagTo(R: Rel, px: number, py: number, out: Vector3): Vector3 {
  const e = R.w.mesh.matrixWorld.elements, dx = px - R.l.x, dy = py - R.l.y;
  return out.set(e[0] * dx + e[4] * dy, e[1] * dx + e[5] * dy, e[2] * dx + e[6] * dy);
}
const pokeCap = (v: Vector3, m: number): Vector3 => {
  const l = v.length();
  if (l > m) v.multiplyScalar(m / l);
  return v;
};
// ¿barrido de lado? Lo que se movió la punta que se ve desde hace POKE_SWIPE_T s: de lado, más de POKE_SWIPE_MIN y más del
// doble de lo que entró en la tecla (un toque en diagonal, al bajar la mano, sí vale)
function pokeSwipe(S: PokeSt, w: Widget, fs: Vector3): boolean {
  const H = S.hist;
  let o = H[0];
  for (const h of H) {
    if (S.clock - h[0] >= POKE_SWIPE_T - 1e-6) o = h;
    else break;
  }
  if (!o) return false;
  const e = w.mesh.matrixWorld.elements;
  _pnN.set(e[8], e[9], e[10]).normalize();
  _pkV.set(fs.x - o[1], fs.y - o[2], fs.z - o[3]);
  const nz = _pkV.dot(_pnN), lat = _pkV.addScaledVector(_pnN, -nz).length();
  return lat > POKE_SWIPE_MIN && lat > 2 * Math.max(0, -nz);
}
/** El dedo con el menú (iluminando o pulsando) hace menos de 1,5 s: lo pesado que se hace de fondo en el menú espera. */
export const menuBusy = (): boolean => performance.now() / 1000 - POKE.busyT < 1.5;

/** Lo que hay que mover la mano que se ve de ese lado (lo más grande de lo que piden el menú y el botón de la muñeca). */
export function pokeHold(side: Side, out: Vector3): Vector3 {
  out.set(0, 0, 0);
  const now = performance.now() / 1000;
  for (const k in POKE.hold[side]) {
    const H = POKE.hold[side][k];
    if (now - H.t < 0.1 && H.v.lengthSq() > out.lengthSq()) out.copy(H.v);
  }
  return out;
}

/** Un fotograma de pulsar con el dedo (list: lo que se puede pulsar; ready: si ya se puede; isMenu: el menú, no el botón
 * de la muñeca; menu: el menú abierto). Devuelve si se ha pulsado algo. */
export function pokeWidgets(list: Widget[], dt: number, ready: boolean, isMenu: boolean, menu: PokeMenu | null, menuShown: boolean): boolean {
  const now = performance.now() / 1000, key = isMenu ? 'menu' : 'aux', vis = list.filter((w) => w.mesh.visible);
  const push = new Map<Widget, number>(), hov = new Set<Widget>(), drags = new Map<Widget, number>();
  let press: { w: Widget; side: Side; S: PokeSt } | null = null;
  for (const w of vis) w.cool = Math.max(0, (w.cool || 0) - dt);
  for (const side of ['left', 'right'] as const) {
    const f = fingers.find((x) => x.side === side), S = pokeSt(key, side), Hd = POKE.hold[side][key] || (POKE.hold[side][key] = { v: new Vector3(), t: 0 });
    Hd.v.set(0, 0, 0);
    Hd.t = now;
    if (!f) {
      reset(S);
      S.hist.length = 0;
      S.mag.set(0, 0, 0);
      if (POKE.lock[side]?.key === key) POKE.lock[side] = null;
      continue;
    }
    // la punta que se ve (sin el temblor del seguimiento) decide de lado; la de las gafas, sin suavizar, cuánto se hunde
    const fs = f.s;
    S.clock += dt;
    S.hist.push([S.clock, fs.x, fs.y, fs.z]);
    while (S.hist.length > 2 && S.clock - S.hist[0][0] > 0.3) S.hist.shift();
    // la mano apoyada en la tecla: ¿sigue el dedo detrás del fondo de la que hundió? (con el menú a la vista)
    const L = POKE.lock[side], shown = !isMenu || menuShown;
    if (L && L.key === key) {
      const e = _pkL.subVectors(L.p, f.p).dot(L.n);
      let lat = _pkL.addScaledVector(L.n, -e).length();
      if (L.pinW) {
        _pkL.subVectors(fs, L.pinW);
        lat = _pkL.addScaledVector(L.n, -_pkL.dot(L.n)).length();
      }
      // pegada: la punta que se ve se queda en el punto de la tecla que tocó (también si la pulsación rehízo el menú con
      // teclas nuevas en el mismo sitio), hasta que el dedo sale por delante o se va muy de lado
      if (shown && e > 0 && e < POKE_HOLD_MAX && lat < (L.pinW ? POKE_KEEP : 0.3)) {
        if (L.pinW) {
          Hd.v.subVectors(L.pinW, fs);
          S.mag.set(0, 0, 0);
        } else Hd.v.copy(L.n).multiplyScalar(e);
      } else POKE.lock[side] = null;
    }
    if (isMenu) pokePanel(side, f, shown, Hd, menu);
    // dónde está el dedo respecto a cada tecla (z: delante de su superficie en reposo, en metros; ex: cuánto se sale de ella)
    let best: Rel | null = null, cur: Rel | null = null, behind = false;
    for (const w of vis) {
      if (w.only && w.only !== side) continue;
      w.mesh.updateMatrixWorld();
      const e = w.mesh.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]) || 1;
      const z = (w.mesh.worldToLocal(_pkL.copy(f.p)).z - (w.baseZ - w.mesh.position.z)) * sc, l = w.mesh.worldToLocal(_pkL.copy(fs)).clone();
      const d = Math.max(Math.abs(l.x) / (w.w / 2), Math.abs(l.y) / (w.h / 2)), R: Rel = { w, l, z, d, ex: Math.max(Math.abs(l.x) - w.w / 2, Math.abs(l.y) - w.h / 2) * sc, sc };
      if (d < 1 && z > 0 && z < POKE_HOVER && (!best || d < best.d - 0.05 || (d < best.d + 0.05 && z < best.z))) best = R;
      if (d < 1.1 && z <= POKE_BACK && z > -0.15) behind = true;
      if (w === S.cand) cur = R;
    }
    _pkM.set(0, 0, 0);
    let pin = false;
    st: {
      if (isMenu && POKE.need[side]) {
        // menú recién abierto: hasta que el dedo se retire, no hace nada
        let near = behind;
        if (!near && menu) {
          menu.group.updateMatrixWorld();
          const l = menu.group.worldToLocal(_wl.copy(f.p));
          if (Math.abs(l.x) < menu.W / 2 + 0.4 && Math.abs(l.y) < menu.H / 2 + 0.4 && l.z < POKE_BACK && l.z > -0.2) near = true;
        }
        if (!near) POKE.need[side] = false;
        reset(S);
        break st;
      }
      if (S.push) {
        const w = S.cand!;
        if (!cur || cur.ex > POKE_KEEP) {
          reset(S); // se fue muy de lado: se suelta
          break st;
        }
        if (cur.z > POKE_OUT) {
          S.push = false; // fuera, por delante: lista para otra
          S.done = false;
          S.pin = null;
          S.pinW = null;
        } else {
          const depth = Math.max(0, -cur.z), stop = Math.min(POKE_TRAVEL, (w.maxPush !== undefined ? w.maxPush : Infinity) * cur.sc), ex = depth - stop;
          if (ex < POKE_HOLD_MAX) {
            // el fondo de la tecla: de ahí no pasa la mano que se ve
            const e = w.mesh.matrixWorld.elements, Lk = POKE.lock[side] || (POKE.lock[side] = { key, n: new Vector3(), p: new Vector3(), pinW: null });
            Lk.key = key;
            Lk.n.set(e[8], e[9], e[10]).normalize();
            Lk.p.copy(f.p).addScaledVector(Lk.n, ex);
            Lk.pinW = S.pinW || null;
            if (S.pinW) Hd.v.subVectors(S.pinW, fs); // (pegada: la punta, en el punto que tocó)
            else if (ex > 0 && ex > Hd.v.length()) Hd.v.copy(Lk.n).multiplyScalar(ex);
          }
          if (w.kind === 'slider') drags.set(w, pokeU(w, cur.l));
          else {
            push.set(w, Math.max(push.get(w) || 0, Math.min(depth, POKE_TRAVEL) / cur.sc));
            // hacia dentro y no de lado (se da por hecha solo si se dispara: si el menú aún no está listo, o acaba de
            // pulsarse otra, espera con el dedo dentro en vez de perderse)
            if (!S.done && depth >= POKE_DEPTH) {
              if (pokeSwipe(S, w, fs)) S.done = true;
              else if (!press) press = { w, side, S };
            }
            pin = !!S.pin && !S.pinW;
          }
          hov.add(w);
          break st;
        }
      }
      // la iluminada: si el dedo la toca (aunque sea en su margen), empieza a hundirla y el dedo que se ve se clava ahí
      if (cur && cur.z <= 0 && cur.ex <= POKE_STICK && !S.push) {
        S.push = true;
        S.done = false;
        hov.add(S.cand!);
        if (S.cand!.kind === 'slider') {
          drags.set(S.cand!, pokeU(S.cand!, cur.l));
          S.pin = null;
        } else {
          S.pin = cur.l.clone();
          pin = true;
          if (S.cand!.flat) {
            // (tecla plana: la punta se queda en su cara, donde tocó)
            const e = S.cand!.mesh.matrixWorld.elements;
            _pnN.set(e[8], e[9], e[10]).normalize();
            const P = new Vector3().copy(fs).add(S.mag);
            S.pinW = P.addScaledVector(_pnN, -_pkV.set(P.x - e[12], P.y - e[13], P.z - e[14]).dot(_pnN));
            pin = false;
          }
        }
        break st;
      }
      // delante: la iluminada se queda hasta que el dedo sale de ella (o se aleja); si no, la que tenga delante
      if (cur && cur.z > 0 && cur.z < POKE_HOVER + 0.02 && cur.ex <= POKE_STICK) {
        S.n++;
        hov.add(S.cand!);
      } else if (best) {
        if (best.w !== S.cand) {
          S.cand = best.w;
          S.n = 0;
        }
        S.n++;
        hov.add(best.w);
        cur = best;
      } else {
        S.cand = null;
        cur = null;
      }
      // el imán: cerca de la iluminada, la mano que se ve se acerca a ella
      if (cur && cur.z < POKE_MAG_Z && cur.w.kind !== 'slider') {
        const k = smooth(clamp((POKE_MAG_Z - cur.z) / (POKE_MAG_Z - 0.005), 0, 1)), [px, py] = pokeSafe(cur, cur.l.x, cur.l.y);
        pokeCap(pokeMagTo(cur, px, py, _pkM).multiplyScalar(k), POKE_MAG_MAX);
      }
    }
    // hundiendo la tecla, clavado donde tocó (al momento, sin temblor); si no, el imán va y viene suave
    const Lp = POKE.lock[side];
    if (S.pinW || (Lp && Lp.key === key && Lp.pinW)) S.mag.set(0, 0, 0); // (pegada: ya la lleva el candado)
    else if (pin && cur && S.pin) {
      const [px, py] = pokeSafe(cur, S.pin.x, S.pin.y);
      S.mag.copy(pokeCap(pokeMagTo(cur, px, py, _pkM), POKE_KEEP)); // (pegado a la tecla: no se desliza por el panel)
    } else S.mag.lerp(_pkM, Math.min(1, dt * 18));
    if (S.mag.lengthSq() < 1e-10) S.mag.set(0, 0, 0);
    Hd.v.add(S.mag);
    // el dedo va a por el menú o la está hundiendo: lo pesado de fondo espera (un dedo quieto cerca no lo frena para siempre)
    const zz = cur ? cur.z : 9, moving = !!S.cand && S.lz !== undefined && Math.abs(zz - S.lz) > dt * 0.04;
    S.lz = zz;
    if (isMenu && (S.push || moving)) POKE.busyT = now;
  }
  for (const w of vis) {
    if ((w.flashT ?? 0) > 0) w.flashStep?.(dt);
    const hover = hov.has(w);
    if (hover !== w.hover) {
      w.hover = hover;
      if (w.setHover) w.setHover(hover);
      else w.draw();
    }
    if (w.kind === 'slider') {
      const sl = w as unknown as Slider;
      if (drags.has(w) && ready) sl.drag(drags.get(w)!);
      else sl.commit();
    } else {
      const p = Math.min(push.get(w) || 0, w.maxPush !== undefined ? w.maxPush : Infinity), dn = p > 0;
      if (w.setTouch) {
        const t = push.has(w);
        if (t !== !!w.touching) w.setTouch(t); // (tecla plana: no se hunde; tocada, brilla)
      } else {
        w.mesh.position.z = w.baseZ - p;
        if (dn !== !!w.down) {
          w.down = dn;
          w.draw();
        }
      }
    }
  }
  if (!press || !ready || (press.w.cool ?? 0) > 0 || now < POKE.until) return false;
  press.S.done = true;
  POKE.until = now + POKE_GAP;
  press.w.cool = 0.3;
  if (isMenu) POKE.need[press.side] = true;
  SND.click();
  haptic(press.side, 0.15, 15);
  diagEvent(`${press.side === 'left' ? 'I' : 'D'} dedo pulsa «${(press.w as unknown as { label?: string }).label ?? '?'}»`);
  press.w.flash?.();
  if (press.S.pinW) {
    // (pulsada: chispas donde está el dedo, que se ven aunque el menú se rehaga)
    const e = press.w.mesh.matrixWorld.elements, c = _wl.copy(press.S.pinW).add(_pkV.set(e[8], e[9], e[10]).normalize().multiplyScalar(0.012));
    HOOKS.sparks(c, 8, 0xffe08a);
  }
  (press.w as unknown as { onPress(): void }).onPress();
  return true;
}
