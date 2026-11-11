/**
 * El detector del modo Barras, como en RepArena (src/72_bars.js: BAR, barNear, handsLow, barMountStep, barMounted,
 * barDetect, barFall, barRep, barPower y barBlast; con los mismos números): remo invertido en las paralelas (row),
 * dominadas en la barra de puerta (pullup) y colgado (hang).
 *  - Colgarse: bajo el aparato, con las manos arriba (agarradas) y quieto 0,8 s; cuenta atrás de 3 s (si te sales, vuelve
 *    a empezar) y, quieto otro poco (0,35 s, o 2,5 s como mucho), empieza la oleada.
 *  - La repetición se mide por la altura del visor y cuenta al subir lo que pide «Recorrido» (pullRange o rowRange, cm)
 *    sobre la referencia de abajo (brazos estirados). Aguantar arriba carga ×2, ×3, ×4; al bajar, sale la onda.
 *  - Caída: la cabeza baja de tu posición colgado más de «Margen de caída» (fallMargin), las manos se ven por debajo de
 *    la barra o te alejas del aparato. En el remo, bajar con las manos en las paralelas no es soltarse (sí, la cabeza en
 *    el suelo).
 *  - Colgado: cada segundo agarrado suma puntos.
 * Sin IWSDK: los efectos salen como sucesos (BarEvent) y los objetivos que se revientan con la cabeza van aparte
 * (targets.ts: BarField, que recibe las repeticiones y las ondas). Se compara en tests/compare/bars.compare.test.ts.
 */
import { Vector3 } from 'three';
import { powLevel } from '../../exercise/vertical.js';
import { type BarEvent, type BarsEnv, fwdH, toArena, UP } from './env.js';
import { dipOne, eqAxes, eqKind, eqLocal, eqPose, eqTopY, type EqPose } from './equip.js';

/** Los colores de cada nivel de carga y el daño que añade (RepArena: POW_COL y POW_DMG). */
export const POW_COL = [0x3cf0c6, 0xffd166, 0xff8a2a, 0xff3cf0];
export const POW_DMG = [0, 1, 2, 4];
export const powHex = (p: number): string => '#' + POW_COL[p - 1].toString(16).padStart(6, '0');
export const powRgb = (p: number): [number, number, number] => {
  const c = POW_COL[p - 1];
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
};

/** Lo que reciben las repeticiones y las ondas (targets.ts: BarField). */
export interface BarHits {
  rep(o: { perfect: boolean; fast: boolean }, env: BarsEnv, out: BarEvent[]): void;
  blast(p: number, from: Vector3, env: BarsEnv, out: BarEvent[]): void;
}

/** El aparato del ejercicio de ahora. */
export const barPose = (env: BarsEnv): EqPose => eqPose(env.eq, env.preview, eqKind(env.str('exercise')));
/** El recorrido que se pide, en metros (RepArena: barReq). */
export const barReq = (env: BarsEnv): number => (env.str('exercise') === 'row' ? env.s('rowRange') : env.s('pullRange')) / 100;

const _bl = new Vector3(), _ba = new Vector3(), _bf = new Vector3();

/** ¿Está la cabeza donde tiene que estar para usar el aparato? (RepArena: barNear). */
export function barNear(env: BarsEnv): boolean {
  const l = eqLocal(barPose(env), env.head.p, _bl), y = env.head.p.y, ex = env.str('exercise');
  if (ex === 'row' && dipOne(env.str('dipBars'))) return Math.abs(l.x) < 1.0 && Math.abs(l.z) < env.s('dipLen') / 200 + 0.35 && y < env.s('dipH') / 100 + 0.05;
  if (ex === 'row') return Math.abs(l.x) < env.s('dipGap') / 200 + 0.35 && Math.abs(l.z) < env.s('dipLen') / 200 + 0.9 && y < env.s('dipH') / 100 + 0.05;
  return Math.abs(l.x) < env.s('doorW') / 200 + 0.2 && Math.abs(l.z) < 0.6 && y < env.s('doorH') / 100 - 0.12;
}

const LOW = { low: 0, ok: 0 };
/** ¿Se ven las manos claramente por debajo de la barra? Agarrado, las muñecas están a su altura (o fuera de la vista, por
 * encima de la cabeza); al soltarte bajan y entran en la vista. Cuántas se ven abajo y cuántas se ven (RepArena:
 * handsLow; el objeto se reutiliza). */
export function handsLow(env: BarsEnv): { low: number; ok: number } {
  const y = eqTopY(eqKind(env.str('exercise')), env.s) - 0.35;
  LOW.low = 0;
  LOW.ok = 0;
  for (const h of [env.hands.left, env.hands.right])
    if (h.ok) {
      LOW.ok++;
      if (h.wrist.y < y) LOW.low++;
    }
  return LOW;
}
/** ¿Alguna mano a la vista agarrada al aparato (a su altura)? (RepArena: handsOnBar). */
export function handsOnBar(env: BarsEnv): boolean {
  const top = eqTopY(eqKind(env.str('exercise')), env.s);
  return (env.hands.left.ok && Math.abs(env.hands.left.wrist.y - top) < 0.2) || (env.hands.right.ok && Math.abs(env.hands.right.wrist.y - top) < 0.2);
}
/** ¿Las manos dicen que no estás agarrado? (RepArena: handsOff). */
export function handsOff(env: BarsEnv): boolean {
  const h = handsLow(env);
  return h.low >= 2 || (h.low === 1 && h.ok === 1);
}

export class BarDetector {
  /** Colgarse: colocarse (place), cuenta atrás (count) y quedarse quieto (settle). */
  phase: 'place' | 'count' | 'settle' = 'place';
  t = 0;
  still = 0;
  /** La referencia de abajo (brazos estirados) y la posición colgado (para la caída), alturas de la cabeza. */
  ref = 1;
  hangRef = 1;
  /** Dónde está la cabeza abajo (en la arena) y hacia dónde se desplaza al subir (en el remo, hacia los pies). */
  refXZ = new Vector3();
  drift = new Vector3();
  /** En la barra de puerta, el objetivo espera un poco por delante de la cara, hacia la barra (en la arena). */
  front = new Vector3();
  det: 'down' | 'rising' | 'top' = 'down';
  max = 0;
  t0 = 0;
  /** Colgado: los segundos agarrado en esta oleada y los que pide. */
  hold = 0;
  need = 0;
  letGo = 0;
  /** ¿Esta subida ya contó al reventar un objetivo con la cabeza? */
  contact = false;
  nextWave = 0;
  resume = false;
  /** ¿Ya se colgó en esta ronda (la arena ya está puesta)? */
  started = false;
  /** Dónde se colgó (en el mundo): alejarse 75 cm es soltarse. */
  mountXZ = new Vector3();
  /** El remolino te engulló: la oleada termina sin superarla (lo pone la partida). */
  failed = false;
  /** Carga aguantando arriba: segundos y nivel. */
  pwT = 0;
  pw = 1;
  /** Por qué fue la última caída (para el aviso del suelo). */
  lastFall = '';
  /** El reparto de los objetivos por los lados (RepArena: BAR.acc y BAR.side; targets.ts: barNextSide). */
  acc: number | undefined = undefined;
  side = 0;
  /** La cabeza en la arena (RepArena: HL), al día en cada `detect` y al colgarse. */
  readonly hl = new Vector3();

  /** Al empezar la ronda (RepArena: barReset). */
  reset(): void {
    Object.assign(this, { failed: false, phase: 'place', t: 0, still: 0, det: 'down', letGo: 0, hold: 0, need: 0, nextWave: 0, resume: false, started: false, pwT: 0, pw: 1 });
    this.drift.set(0, 0, 0);
  }

  /** A colgarse (RepArena: barToMount, sin lo que se ve): la partida pone state = 'mount' y enseña el aviso del centro. */
  toMount(next: number, resume = false): void {
    this.phase = 'place';
    this.still = 0;
    this.t = 0;
    this.resume = resume;
    if (!resume) this.nextWave = next;
  }

  /** Cada fotograma con state === 'mount' (RepArena: barMountStep). */
  mountStep(dt: number, env: BarsEnv, out: BarEvent[]): void {
    const near = barNear(env) && !handsOff(env), still = env.head.speed < 0.08; // de pie bajo la barra con las manos abajo no estás colgado
    if (this.phase === 'place') {
      this.still = near && still ? this.still + dt : Math.max(0, this.still - dt * 2);
      if (this.still >= 0.8) {
        this.phase = 'count';
        this.t = 0;
        out.push({ type: 'snd', name: 'charge', args: [] });
      }
    } else if (this.phase === 'count') {
      const before = this.t;
      this.t += dt;
      if (!near) {
        this.phase = 'place';
        this.still = 0;
      } else if (this.t >= 3) {
        this.phase = 'settle';
        this.t = 0;
        this.still = 0;
      } else if (Math.floor(before) !== Math.floor(this.t)) out.push({ type: 'snd', name: 'beep', args: [] });
    } else {
      this.t += dt;
      this.still = still ? this.still + dt : 0;
      if (this.still >= 0.35 || this.t > 2.5) this.mounted(env, out);
    }
  }

  /** Colgado: la referencia es donde está la cabeza ahora (RepArena: barMounted). */
  mounted(env: BarsEnv, out: BarEvent[]): void {
    if (!this.started) env.arenaFromHead();
    const hp = env.head.p, HL = toArena(env.arena, hp, this.hl);
    this.ref = this.hangRef = hp.y;
    this.refXZ.set(HL.x, 0, HL.z);
    this.mountXZ.set(hp.x, 0, hp.z);
    this.det = 'down';
    // en la barra de puerta el objetivo espera un poco por delante de la cara, hacia la barra, para que se vea al mirarla
    this.front.set(0, 0, 0);
    const ex = env.str('exercise');
    if (eqKind(ex) === 'door') {
      const e = barPose(env), lz = eqLocal(e, hp, _bl).z;
      eqAxes(e, null, _ba);
      const s = Math.abs(lz) > 0.04 ? -Math.sign(lz) : Math.sign(_ba.dot(fwdH(env.head.q, _bf)) || 1);
      this.front.copy(_ba).multiplyScalar(s).applyAxisAngle(UP, -env.arena.ry).multiplyScalar(Math.min(0.22, Math.max(0.12, Math.abs(lz))));
    }
    out.push({ type: 'snd', name: 'charge', args: [] });
    out.push({ type: 'mounted', resume: this.resume, wave: this.nextWave, row: ex === 'row' });
    if (this.resume) this.resume = false;
    this.started = true;
  }

  /** Al empezar una oleada (RepArena: lo de las barras en startWave): `need`, los segundos de colgado que pide. */
  startWave(need: number): void {
    this.hold = 0;
    this.need = need;
  }

  /** Cada fotograma (RepArena: barDetect; solo hace algo con state === 'play'). Las repeticiones y las ondas van también a
   * `hits` (los objetivos), en su orden. */
  detect(t: number, dt: number, env: BarsEnv, out: BarEvent[], hits?: BarHits): void {
    if (env.state !== 'play') return;
    const hp = env.head.p, HL = toArena(env.arena, hp, this.hl), y = hp.y, margin = env.s('fallMargin') / 100, ex = env.str('exercise');
    // la posición colgado solo se reajusta quieto abajo: bajar despacio también cuenta como caída
    if (this.det === 'down' && env.head.speed < 0.05) this.hangRef += (this.ref - this.hangRef) * Math.min(1, dt * 0.3);
    // soltarse: las manos a la vista por debajo de la barra (al caer de pie la cabeza no siempre baja)
    const off = handsLow(env);
    this.letGo = off.low >= 2 || (off.low === 1 && off.ok === 1) ? this.letGo + dt : 0;
    // En el remo, tumbado boca arriba, la altura de la cabeza cambia con solo relajar el cuello o estirar del todo los
    // brazos: si las manos siguen a la vista en las paralelas, bajar no es soltarse (se toma esa altura como nueva
    // posición de abajo). Sí lo es tener la cabeza en el suelo.
    let low = y < this.hangRef - margin;
    if (low && ex === 'row' && handsOnBar(env) && y > 0.22) {
      low = false;
      this.hangRef = this.ref = Math.min(this.ref, y);
    }
    if (ex === 'row' && y < 0.18) low = true;
    if (low || this.letGo > (off.low >= 2 ? 0.25 : 0.6) || Math.hypot(hp.x - this.mountXZ.x, hp.z - this.mountXZ.z) > 0.75) {
      this.lastFall = low ? (ex === 'row' ? 'la cabeza llegó al suelo' : `la cabeza bajó más de ${env.s('fallMargin')} cm`) : this.letGo ? 'tus manos se vieron por debajo de la barra' : 'te alejaste del aparato';
      this.letGo = 0;
      this.fall(env, out);
      return;
    }
    if (ex === 'hang') {
      const before = this.hold;
      this.hold += dt;
      if (Math.floor(this.hold) > Math.floor(before)) {
        const s = Math.floor(this.hold), left = Math.ceil(this.need - this.hold);
        out.push({ type: 'hangSec', s, left });
        if (left > 0 && left <= 3) out.push({ type: 'snd', name: 'beep', args: [1 + (3 - left) * 0.25] });
        else if (left > 0 && s % 10 === 0) {
          out.push({ type: 'cheer', text: `¡${s} s!`, col: '#3cf0c6', dur: 1.0 });
          out.push({ type: 'snd', name: 'combo', args: [] });
        }
      }
      return;
    }
    const req = barReq(env), pt = env.s('perfectTime');
    // referencia abajo (brazos estirados): baja enseguida y sube muy despacio
    if (y < this.ref) this.ref += (y - this.ref) * Math.min(1, dt * 6);
    else if (this.det !== 'top') this.ref += (y - this.ref) * Math.min(1, dt * 0.05);
    if (this.det === 'down') {
      if (y < this.ref + 0.04) this.refXZ.lerp(_bl.set(HL.x, 0, HL.z), Math.min(1, dt * 3));
      if (y > this.ref + Math.min(0.1, req * 0.4)) {
        this.det = 'rising';
        this.max = y;
        this.t0 = t;
      }
    } else if (this.det === 'rising') {
      this.max = Math.max(this.max, y);
      if (y - this.ref >= req) {
        const dur = t - this.t0;
        this.det = 'top';
        // aprende hacia dónde se desplaza la cabeza al subir (en el remo, hacia los pies)
        this.drift.lerp(_bl.set(HL.x - this.refXZ.x, 0, HL.z - this.refXZ.z), this.drift.lengthSq() ? 0.5 : 1);
        this.rep({ perfect: dur >= pt * 0.5 && dur < 6, fast: pt > 0 && dur < pt * 0.25 }, env, out, hits);
        this.pwT = 0;
        this.pw = 1;
      } else if (y < this.ref + 0.05) {
        if (this.max - this.ref > req * 0.55) out.push({ type: 'partial', text: '¡Más arriba!' });
        this.det = 'down';
      }
    } else {
      // arriba (la barbilla por encima de la barra; en el remo, el pecho en la barra): aguantar carga ×2, ×3, ×4; al
      // empezar a bajar, sale la onda con esa carga
      if (y - this.ref >= req - 0.03) {
        this.pwT += dt;
        const p = powLevel(this.pwT, env.s('powHold'), env.s('powHoldInc'));
        if (p > this.pw) {
          this.pw = p;
          this.power(p, env, out);
        }
      } else if (this.pw > 1 && y - this.ref < req - 0.07) this.blast(env, out, hits);
      if (y < Math.max(this.ref + 0.06, this.max - req * 0.7)) {
        if (this.pw > 1) this.blast(env, out, hits);
        this.det = 'down';
      } // rearma al bajar casi todo el recorrido
    }
    if (this.det === 'down') this.contact = false;
  }

  /** Te soltaste (RepArena: barFall, lo que no es de la partida: ver el suceso 'fall'). */
  private fall(env: BarsEnv, out: BarEvent[]): void {
    this.pw = 1;
    this.pwT = 0;
    const door = eqKind(env.str('exercise')) === 'door';
    out.push({ type: 'fall', reason: this.lastFall, door, at: new Vector3(env.head.p.x, 0.03, env.head.p.z), text: door ? '¡AL CHARCO!' : '¡TE SOLTASTE!', col: door ? '#3cff8a' : '#ff8a3d' });
  }

  /** Una subida entera (RepArena: barRep): cuenta si no contó ya al reventar uno con la cabeza. */
  private rep(o: { perfect: boolean; fast: boolean }, env: BarsEnv, out: BarEvent[], hits?: BarHits): void {
    if (env.state !== 'play' || env.str('exercise') === 'hang' || this.contact) return; // ya contó al reventarlo con la cabeza
    out.push({ type: 'rep', perfect: o.perfect, fast: o.fast, contact: false });
    if (o.perfect) out.push({ type: 'snd', name: 'perfect', args: [] });
    hits?.rep(o, env, out);
  }

  /** Un nivel más de carga aguantando arriba (RepArena: barPower). */
  private power(p: number, env: BarsEnv, out: BarEvent[]): void {
    out.push({ type: 'snd', name: 'power', args: [p] });
    out.push({ type: 'cheer', text: `CARGA ×${p}`, col: powHex(p), dur: 0.9 });
    out.push({ type: 'fx', name: 'glow', at: env.head.p.clone().add(_ba.set(0, 0.1, 0)), args: [powRgb(p), 0.25 + p * 0.06, 0.15] });
  }

  /** Al bajar con carga, una onda desde la cabeza (RepArena: barBlast; a quién golpea, `hits.blast`). */
  private blast(env: BarsEnv, out: BarEvent[], hits?: BarHits): void {
    const p = this.pw;
    this.pw = 1;
    this.pwT = 0;
    if (env.state !== 'play' || p < 2) return;
    const h = env.head.p.clone().add(_ba.set(0, 0.08, 0)), rgb = powRgb(p);
    out.push({ type: 'fx', name: 'glow', at: h, args: [rgb, 0.4 + p * 0.1, 0.2] });
    out.push({ type: 'snd', name: 'power', args: [p, h] });
    out.push({ type: 'cheer', text: p >= 4 ? '¡ONDA ×4!' : `¡ONDA ×${p}!`, col: powHex(p), dur: 1.1 });
    hits?.blast(p, h, env, out);
  }
}
