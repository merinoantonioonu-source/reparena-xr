/**
 * Lanzar el rayo con la mano, como en RepArena (src/70_game.js: THROW_*, HTH, throwCharge, throwTarget,
 * throwPickTarget, throwTry y throwStep), con sus mismos números.
 *
 * Apuntando con las manos, cada repetición carga un rayo en cada mano (como mucho uno por mano: no se acumulan; se ve un
 * orbe en la muñeca cargada) y cada mano lanza el suyo con un gesto: una sacudida de la mano hacia un enemigo (puede salir
 * de donde sea, también de la cadera, y en plena sentadilla): acelera deprisa y frena de golpe. Si la sacudida no apunta a
 * ningún enemigo, o no hay sacudida, la carga se queda en la mano. En las gafas, sin manos a la vista la repetición carga
 * igual (el rayo espera a que vuelvan a verse); solo en el ordenador dispara sola. El gesto se mide respecto a la cabeza;
 * si las gafas pierden la mano en plena sacudida hacia un enemigo, el rayo sale igual.
 * Con mandos como manos: se apunta con la mano y se lanza con el gatillo (un instante después, por si llega también el
 * agarre: los dos a la vez son el puño, no un disparo).
 *
 * Lógica pura (sin IWSDK): lo de fuera (los enemigos, el rayo, la vibración, los avisos y la diana) lo da el juego en
 * ThrowEnv.
 */
import { Vector3 } from 'three';
import { gazeLock, gazeLockStep } from './gaze-lock.js';
import { hands, head, SIDES, type Side } from './hand-model.js';
import type { Target } from './target.js';

// La mano se mide respecto a la cabeza en horizontal y respecto al suelo en altura (subir y bajar en la sentadilla no la
// mueve). Una sacudida es un acelerón por encima de THROW_V; empieza donde la mano iba por última vez por debajo de
// THROW_SLOW y acaba al frenar (por debajo de THROW_STOP del pico) o al recorrer THROW_LONG. THROW_JUMP: más rápido, es un
// salto del seguimiento
export const THROW_V = 0.8, THROW_SLOW = 0.45, THROW_D = 0.1, THROW_LONG = 0.32, THROW_WIDE = 60, THROW_STOP = 0.75, THROW_JUMP = 15, THROW_REAPPEAR = 0.25;
// El blanco: el más cercano a la dirección del lanzamiento, hasta THROW_WIDE grados. Cuenta sobre todo hacia qué lado
// va la mano (en horizontal): la sacudida suele hacer un arco hacia arriba o hacia abajo, y eso no debe cambiar el blanco.
// Pero no más de THROW_TILT por encima o por debajo de él: bajar la mano de golpe hacia el suelo no es lanzar al de delante
export const THROW_TILT = 45;
const DEG = Math.PI / 180;

/** La carga de una mano: el daño, si fue perfecta y su nivel (×1 a ×4). */
export interface Charge {
  dmg: number;
  perfect: boolean;
  pow: number;
}

/** Lo que pone el juego en cada fotograma. */
export interface ThrowEnv {
  /** ¿Se lanza con las manos? (Combate, sentadillas o zancadas, puntería «Con las manos», en la partida) */
  on: boolean;
  /** En plena oleada: solo entonces avisa de que no hay carga o de que la hay sin lanzar. */
  playing: boolean;
  /** «El rayo va al que miras» (y no hacia donde lanzas). */
  byGaze: boolean;
  /** Con espada en la mano no hay diana. */
  sword: boolean;
  /** «Ayuda de puntería» (grados): el cono de la mirada. */
  assist: number;
  /** Hacia dónde mira el cuerpo (horizontal, unitario). */
  bodyFwd: Vector3;
  /** Hacia dónde mira la cabeza. */
  gaze: Vector3;
  targets: Iterable<Target>;
  /** Sale el rayo de una mano: desde o, hacia d, al blanco, con la carga c (cópialos: se reutilizan). */
  fire(side: Side, o: Vector3, d: Vector3, target: Target, c: Charge): void;
  haptic(side: Side, v: number, ms: number): void;
  say(text: string, color: string, secs: number): void;
  /** La diana: este enemigo está apuntado en este fotograma. */
  lockShow(e: Target): void;
}

// lo que la mano ha hecho en el último medio segundo (dónde, a qué velocidad y cuándo), sin crear objetos
const HIST_N = 160;
class Hist {
  private p = Array.from({ length: HIST_N }, () => new Vector3());
  private sp = new Float64Array(HIST_N);
  private t = new Float64Array(HIST_N);
  private a = 0;
  length = 0;
  private idx(i: number): number {
    return (this.a + i) % HIST_N;
  }
  push(p: Vector3, sp: number, t: number): void {
    if (this.length === HIST_N) {
      this.a = (this.a + 1) % HIST_N;
      this.length--;
    }
    const k = this.idx(this.length);
    this.p[k].copy(p);
    this.sp[k] = sp;
    this.t[k] = t;
    this.length++;
  }
  shift(): void {
    if (!this.length) return;
    this.a = (this.a + 1) % HIST_N;
    this.length--;
  }
  clear(): void {
    this.length = 0;
  }
  /** Se queda solo con la última. */
  keepLast(): void {
    if (this.length > 1) {
      this.a = this.idx(this.length - 1);
      this.length = 1;
    }
  }
  P(i: number): Vector3 {
    return this.p[this.idx(i)];
  }
  SP(i: number): number {
    return this.sp[this.idx(i)];
  }
  T(i: number): number {
    return this.t[this.idx(i)];
  }
}

interface ThrowHand {
  c: Charge | null;
  cBuf: Charge;
  burst: boolean;
  have: boolean;
  lost: number;
  peak: number;
  cool: number;
  hist: Hist;
  prev: Vector3;
  v: Vector3;
  from: Vector3;
  last: Vector3;
  lastR: Vector3;
  gone: Vector3;
  trigT: number;
  trigPrev: boolean;
}
const mkThrow = (): ThrowHand => ({ c: null, cBuf: { dmg: 0, perfect: false, pow: 1 }, burst: false, have: false, lost: 0, peak: 0, cool: 0, hist: new Hist(), prev: new Vector3(), v: new Vector3(), from: new Vector3(), last: new Vector3(), lastR: new Vector3(), gone: new Vector3(), trigT: 0, trigPrev: false });

/** Cada mano: su carga y cómo va su gesto. */
export const HTH = { left: mkThrow(), right: mkThrow(), idle: 0, taught: false };

const _thr = new Vector3(), _thv = new Vector3(), _thf = new Vector3(), _thd = new Vector3(), _ttd = new Vector3(), _ttv = new Vector3(), _ttc = new Vector3(), _fo = new Vector3(), _fd = new Vector3();

const padVirt = (): boolean => hands.left.virt || hands.right.virt;
/** Cuántas manos tienen carga. */
export const throwCount = (): number => (HTH.left.c ? 1 : 0) + (HTH.right.c ? 1 : 0);

export function throwReset(): void {
  for (const s of SIDES) {
    const T = HTH[s];
    Object.assign(T, { c: null, burst: false, have: false, lost: 0, peak: 0, cool: 0 });
    T.hist.clear();
    T.gone.set(0, 0, 0);
  }
  HTH.idle = 0;
  HTH.taught = false;
}

/**
 * La repetición carga las dos manos (en las gafas, aunque no se vea ninguna). Devuelve false si no toca (sin lanzar con
 * las manos, o en el ordenador sin manos: entonces el juego dispara solo).
 */
export function throwCharge(dmg: number, perfect: boolean, pow: number, aim: boolean, xr: boolean, say: ThrowEnv['say']): boolean {
  if (!aim || (!xr && !(hands.left.ok || hands.right.ok))) return false;
  for (const s of SIDES) {
    const T = HTH[s], c = T.cBuf;
    if (T.c) {
      c.dmg = Math.max(dmg, c.dmg);
      c.perfect = perfect || c.perfect;
      c.pow = Math.max(pow, c.pow);
    } else {
      c.dmg = Math.max(dmg, 0);
      c.perfect = perfect;
      c.pow = Math.max(pow, 1);
    }
    T.c = c;
  }
  if (!HTH.taught) {
    HTH.taught = true;
    say(padVirt() ? 'Apunta con la mano y aprieta el gatillo' : 'Mano atrás y lánzala hacia el enemigo', '#3cf0c6', 2.2);
  }
  HTH.idle = 0;
  return true;
}

/** El enemigo más cercano a la dirección d desde o (hasta THROW_WIDE grados y THROW_TILT por encima o por debajo). */
export function throwTarget(o: Vector3, d: Vector3, targets: Iterable<Target>): Target | null {
  let best: Target | null = null, bs = THROW_WIDE * DEG;
  _ttd.set(d.x, d.y * 0.4, d.z);
  const ed = Math.atan2(d.y, Math.hypot(d.x, d.z));
  for (const e of targets) {
    if (!e.alive) continue;
    const v = e.center(_ttc).sub(o), dist = v.length();
    if (dist < 0.05) continue;
    const r = Math.atan((e.radius * 1.3) / dist), a = _ttv.set(v.x, v.y * 0.4, v.z).angleTo(_ttd) - r;
    if (Math.abs(Math.atan2(v.y, Math.hypot(v.x, v.z)) - ed) - r > THROW_TILT * DEG) continue;
    if (a < bs) {
      bs = a;
      best = e;
    }
  }
  return best;
}

// Con «al que miras», el gesto dispara y la mirada elige: el enemigo que llevas un momento mirando, si la sacudida va más o
// menos hacia él (hasta THROW_WIDE grados, como cualquier blanco); si no miras a ninguno, el de la dirección de la mano
function throwPickTarget(o: Vector3, d: Vector3, env: ThrowEnv): Target | null {
  const byHand = throwTarget(o, d, env.targets);
  if (!byHand || !env.byGaze) return byHand;
  const g = gazeLock();
  if (!g) return byHand;
  const v = g.center(_ttc).sub(o);
  _ttv.set(v.x, v.y * 0.4, v.z);
  _ttd.set(d.x, d.y * 0.4, d.z);
  return _ttv.angleTo(_ttd) - Math.atan((g.radius * 1.3) / Math.max(0.05, v.length())) < THROW_WIDE * DEG ? g : byHand;
}

function throwFire(s: Side, o: Vector3, d: Vector3, tg: Target, env: ThrowEnv): void {
  const T = HTH[s], c = T.c;
  if (!c) return;
  T.c = null;
  env.fire(s, _fo.copy(o), _fd.copy(d), tg, c);
  env.haptic(s, 0.7, 45);
  HTH.idle = 0;
}

// Lanza desde o en la dirección del recorrido d de la mano, si recorrió lo bastante y hay un enemigo hacia allí. Llevar
// la mano atrás para coger impulso no es un lanzamiento: la mano tiene que alejarse de ti (o ir hacia delante), nunca
// hacia atrás. Si no sale el rayo, el siguiente acelerón (el lanzamiento de verdad) se mide enseguida
function throwTry(s: Side, o: Vector3, d: Vector3, env: ThrowEnv): void {
  const T = HTH[s], H = T.hist, len = d.length(), fw = d.x * _thf.x + d.z * _thf.z;
  const away = Math.hypot(T.lastR.x, T.lastR.z) - Math.hypot(T.from.x, T.from.z);
  // la dirección: la del recorrido entero, pero sobre todo la del último tramo (al soltar), que es la que lleva el rayo
  if (H.length) {
    const i1 = H.length - 1, t1 = H.T(i1);
    let i0 = -1;
    for (let i = i1; i >= 0; i--)
      if (t1 - H.T(i) >= 0.09) {
        i0 = i;
        break;
      }
    if (i0 >= 0 && _thv.subVectors(H.P(i1), H.P(i0)).length() > 0.04) d.normalize().multiplyScalar(0.4).addScaledVector(_thv.normalize(), 0.6);
  }
  const ok = len > THROW_D && fw > -0.05 * len && (away > 0.03 || fw > 0.5 * len), tg = ok ? throwPickTarget(o, d.normalize(), env) : null;
  T.burst = false;
  T.peak = 0;
  if (tg) {
    T.cool = 0.2;
    throwFire(s, o, d, tg, env);
  }
  H.keepLast(); // el siguiente acelerón se mide desde aquí, no desde antes de coger impulso
}

/** Cada fotograma (t: el reloj, en segundos). */
export function throwStep(dt: number, t: number, env: ThrowEnv): void {
  const on = env.on;
  _thf.copy(env.bodyFwd); // hacia dónde mira el cuerpo
  for (const s of SIDES) {
    const T = HTH[s], h = hands[s];
    if (!on) {
      T.have = false;
      T.burst = false;
      continue;
    }
    // mandos como manos: se apunta con la mano y se lanza con el gatillo (un instante después, por si llega también el
    // agarre: los dos a la vez son el puño, no un disparo). Sin sacudida
    if (h.virt) {
      if (h.trig && !T.trigPrev) T.trigT = 0.09;
      T.trigPrev = h.trig;
      T.have = false;
      T.burst = false;
      const tg = T.c && h.rayOk ? throwTarget(h.rayO, h.rayD, env.targets) : null;
      if (tg) env.lockShow(tg); // (a quién va: su diana)
      if (T.trigT > 0) {
        if (h.grip) T.trigT = 0;
        else if ((T.trigT -= dt) <= 0) {
          T.trigT = 0;
          if (!T.c) {
            if (env.playing) {
              env.say('Sin carga: ¡haz una sentadilla!', '#ff8a3d', 1.1);
              env.haptic(s, 0.2, 30);
            }
          } else if (tg) throwFire(s, h.rayO, h.rayD, tg, env);
          else env.haptic(s, 0.15, 25);
        }
      }
      continue;
    }
    if (!h.ok) {
      // perdida en plena sacudida: sale el rayo en la dirección que llevaba la mano, si va hacia un enemigo
      if (!T.lost && T.have) T.gone.copy(T.lastR); // (dónde estaba al perderla)
      T.lost += dt;
      if (T.have && T.burst && T.lost < 0.25) throwTry(s, T.last, _thd.subVectors(T.lastR, T.from), env);
      if (T.lost > 0.3) {
        T.have = false;
        T.burst = false;
        T.hist.clear();
      }
      continue;
    }
    const lostFor = T.lost;
    T.lost = 0;
    T.cool = Math.max(0, T.cool - dt);
    if (h.back) {
      // vuelve a verse tras una mano colocada por el cuerpo: la sacudida que llevaba sale con lo recorrido; el salto hasta la
      // de verdad no es otra (RepArena)
      if (T.have && T.burst) throwTry(s, T.last, _thd.subVectors(T.lastR, T.from), env);
      T.have = false;
      T.burst = false;
      T.hist.clear();
      T.gone.set(0, 0, 0);
    }
    _thr.set(h.wrist.x - head.p.x, h.wrist.y, h.wrist.z - head.p.z);
    T.last.copy(h.wrist);
    T.lastR.copy(_thr);
    // vuelve a verse ya lanzada: las gafas tardan en recuperar la mano (sobre todo si estaba abajo, junto a la cadera) y la
    // sacudida puede empezar sin verla. Si en ese rato ha recorrido bastante y deprisa, cuenta como sacudida desde donde se
    // perdió (con las mismas condiciones: hacia delante o hacia fuera y hacia un enemigo)
    if (lostFor > 0.08 && lostFor < 0.8 && T.c && !T.cool && T.gone.lengthSq() > 0) {
      const dd = _thd.subVectors(_thr, T.gone), len = dd.length();
      if (len > THROW_REAPPEAR && len / lostFor > 1.2) {
        T.from.copy(T.gone);
        T.hist.clear();
        throwTry(s, h.wrist, dd, env);
        T.gone.set(0, 0, 0);
        T.have = true;
        T.prev.copy(_thr);
        T.v.set(0, 0, 0);
        continue;
      }
    }
    T.gone.set(0, 0, 0);
    if (!T.have) {
      T.prev.copy(_thr);
      T.v.set(0, 0, 0);
      T.have = true;
      T.hist.clear();
      continue;
    }
    _thv.subVectors(_thr, T.prev).divideScalar(Math.max(dt, 1e-3));
    T.prev.copy(_thr);
    if (_thv.length() > THROW_JUMP) continue; // salto del seguimiento: se ignora ese fotograma, sin estropear el gesto
    T.v.lerp(_thv, 0.6);
    const sp = T.v.length(), H = T.hist;
    H.push(_thr, sp, t);
    while (H.length && t - H.T(0) > 0.5) H.shift();
    if (!T.burst) {
      if (sp > THROW_V && !T.cool) {
        // empieza un acelerón: se mide desde la última vez que la mano iba despacio (si nunca fue despacio, desde donde
        // fue más despacio: el giro tras coger impulso)
        T.burst = true;
        T.peak = sp;
        let st = -1, mn = 0;
        for (let i = H.length - 1; i >= 0; i--) {
          if (H.SP(i) < THROW_SLOW) {
            st = i;
            break;
          }
          if (H.SP(i) < H.SP(mn)) mn = i;
        }
        T.from.copy(H.P(st >= 0 ? st : mn));
      }
      continue;
    }
    T.peak = Math.max(T.peak, sp);
    // frenó de golpe, o ya recorrió bastante: si la sacudida va hacia un enemigo, sale el rayo; si no, la carga se queda
    if (sp < T.peak * THROW_STOP || _thd.subVectors(_thr, T.from).length() > THROW_LONG) throwTry(s, h.wrist, _thd.subVectors(_thr, T.from), env);
  }
  // al que miras: se sigue a quién miras y su diana lo marca (con espada no hay diana; con mandos como manos, la marca es
  // la de la mano que apunta)
  if (on && env.byGaze && !padVirt() && !env.sword) {
    const e = gazeLockStep(t, head.p, env.gaze, env.targets, env.assist);
    if (e) env.lockShow(e);
  }
  // cargado y sin lanzar: cada pocos segundos, recuérdalo
  if (on && throwCount() && env.playing) {
    HTH.idle += dt;
    if (HTH.idle > 4) {
      HTH.idle = 0;
      env.say(padVirt() ? '¡Lanza el rayo! Apunta y gatillo' : '¡Lanza el rayo! Mano atrás y adelante', '#ffd166', 1.4);
    }
  } else HTH.idle = 0;
}
