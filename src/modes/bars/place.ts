/**
 * Colocar los aparatos con las manos, como en RepArena (src/72_bars.js: PLACE, gripPoint, startPlace, cancelPlace,
 * updatePlace, placeConfirm, placeFromHands, placeInFront, nudgeEquip y placeDone; con los mismos números): vas al aparato
 * de verdad y lo agarras con las dos manos por encima de la cabeza; si se quedan quietas PLACE_HOLD segundos (cortes del
 * seguimiento de hasta medio segundo se perdonan; moverlas más de 5 cm vuelve a empezar), la media de esas posiciones es
 * el aparato: dónde está, hacia dónde va y su altura (y, con dos paralelas, lo que las separa). Cuando estés de pie otra
 * vez, salen los ajustes finos (`adjust`). Sin lo que se ve: la línea entre las manos sale en `line`. Sin IWSDK: se
 * compara en tests/compare/bars.compare.test.ts.
 */
import { Vector3 } from 'three';
import type { Side } from '../../input/hand-model.js';
import { type BarEvent, type PlaceEnv, fwdH, yawOf } from './env.js';
import { dipOne, eqKind, eqName, eqPose, equipChanged, equipCommit, type EqKind } from './equip.js';

export const PLACE_HOLD = 5;

/** Lo que pasa al colocar: sonidos y, ya colocado y de pie, que salgan los ajustes finos (RepArena: adjustMenu). */
export type PlaceEvent = Extract<BarEvent, { type: 'snd' }> | { type: 'adjust' };

/** Punto de agarre: entre la base del dedo corazón y su nudillo (o el mando) (RepArena: gripPoint). */
export function gripPoint(env: PlaceEnv, side: Side, out: Vector3): Vector3 | null {
  const h = env.hands[side];
  if (!h.ok) return null;
  if (h.isHand) {
    const a = h.J[10], b = h.J[11];
    return a.ok && b.ok ? out.lerpVectors(a.p, b.p, 0.75) : null;
  }
  return out.copy(h.wrist);
}

const _pl1 = new Vector3(), _pl2 = new Vector3(), _pl3 = new Vector3(), _pl4 = new Vector3(), _pf = new Vector3();

export class Placer {
  on = false;
  t = 0;
  kind: 'door' | 'dip' = 'door';
  /** Lo que dice el aviso: se ven las dos manos, están por encima de la cabeza y están bien (separadas y a la par). */
  seen = false;
  up = false;
  ok = false;
  lostT = 0;
  n = 0;
  readonly sumL = new Vector3();
  readonly sumR = new Vector3();
  /** Colocado: esperando a que te pongas de pie para los ajustes finos. */
  wait = false;
  waitT = 0;
  /** Lo que se colocó (para los ajustes finos). */
  note = '';
  /** La línea luminosa entre las manos (lo que se está midiendo): su centro, su dirección (de la izquierda a la
   * derecha), su largo y si está bien (turquesa) o no (naranja). */
  readonly line = { visible: false, mid: new Vector3(), dir: new Vector3(0, 1, 0), len: 1, ok: false };

  private resetCount(): void {
    this.t = 0;
    this.n = 0;
    this.sumL.set(0, 0, 0);
    this.sumR.set(0, 0, 0);
  }

  /** Empieza a colocar el aparato del ejercicio (RepArena: startPlace; la partida esconde el menú y enseña el aviso). */
  start(env: PlaceEnv, out: PlaceEvent[], note = ''): void {
    const k = eqKind(env.str('exercise'));
    if (env.eq.edit !== k) {
      env.eq.edit = k;
      eqPose(env.eq, env.preview, k).anchor = null;
    } // al terminar se crea un ancla nueva
    Object.assign(this, { on: true, kind: k, lostT: 0, wait: false, seen: false, up: false, ok: false, note });
    this.resetCount();
    out.push({ type: 'snd', name: 'click', args: [] });
  }
  /** Lo deja (RepArena: cancelPlace): true si estaba colocando (la partida esconde el aviso y vuelve atrás). */
  cancel(env: PlaceEnv, out: PlaceEvent[]): boolean {
    if (!this.on && !this.wait) return false;
    this.on = this.wait = false;
    this.line.visible = false;
    out.push({ type: 'snd', name: 'click', args: [] });
    this.done(env);
    return true;
  }

  /** Cada fotograma (RepArena: updatePlace). */
  step(dt: number, env: PlaceEnv, out: PlaceEvent[]): void {
    if (this.wait) {
      // ya está colocado: los ajustes salen cuando estés de pie
      this.waitT += dt;
      if (this.waitT > 1.2 && env.head.p.y > 1.1 && env.head.speed < 0.6) {
        this.wait = false;
        out.push({ type: 'adjust' });
      }
      return;
    }
    if (!this.on) {
      this.line.visible = false;
      return;
    }
    const L = gripPoint(env, 'left', _pl1), R = gripPoint(env, 'right', _pl2), hy = env.head.p.y;
    this.seen = !!(L && R);
    this.up = !!(L && R) && L.y > hy + 0.12 && R.y > hy + 0.12;
    const d = L && R ? Math.hypot(R.x - L.x, R.z - L.z) : 0;
    this.ok = this.up && d > 0.22 && d < (this.kind === 'door' ? 1.5 : 1.1) && Math.abs((R as Vector3).y - (L as Vector3).y) < 0.15;
    const mid = _pl3;
    if (L && R) {
      mid.addVectors(L, R).multiplyScalar(0.5);
      const dir = _pl4.subVectors(R, L), len = Math.max(0.01, dir.length());
      this.line.visible = true;
      this.line.mid.copy(mid);
      this.line.dir.copy(dir).divideScalar(len);
      this.line.len = len;
      this.line.ok = this.ok;
    } else this.line.visible = false;
    if (this.ok && L && R) {
      this.lostT = 0;
      // si las manos se mueven más de 5 cm de su posición media, la cuenta empieza de nuevo
      if (this.n && _pl4.addVectors(this.sumL, this.sumR).multiplyScalar(0.5 / this.n).distanceTo(mid) > 0.05) this.resetCount();
      this.sumL.add(L);
      this.sumR.add(R);
      this.n++;
      const before = this.t;
      this.t += dt;
      if (Math.floor(before) !== Math.floor(this.t)) out.push({ type: 'snd', name: 'beep', args: [1 + Math.floor(this.t) * 0.12] });
      if (this.t >= PLACE_HOLD) this.confirm(env, out);
    } else {
      this.lostT += dt;
      if (this.lostT > 0.5) this.resetCount();
    } // se perdonan cortes breves del seguimiento
  }

  /** Aguantó lo bastante: la media es el aparato (RepArena: placeConfirm). */
  private confirm(env: PlaceEnv, out: PlaceEvent[]): void {
    const L = this.sumL.divideScalar(this.n), R = this.sumR.divideScalar(this.n);
    this.fromHands(env, this.kind, L, R);
    this.on = false;
    this.wait = true;
    this.waitT = 0;
    this.line.visible = false;
    out.push({ type: 'snd', name: 'charge', args: [] }, { type: 'snd', name: 'perfect', args: [] });
  }

  /** El aparato, de donde están las manos (RepArena: placeFromHands): en la barra de puerta y la paralela única, las manos
   * van a lo largo de la barra; con dos paralelas, una en cada barra. */
  fromHands(env: PlaceEnv, k: 'door' | 'dip', L: Vector3, R: Vector3): void {
    const e = eqPose(env.eq, env.preview, k), dx = R.x - L.x, dz = R.z - L.z, mid = _pl3.addVectors(L, R).multiplyScalar(0.5);
    const one = k === 'dip' && dipOne(env.str('dipBars'));
    e.x = mid.x;
    e.z = mid.z;
    e.yaw = one ? Math.atan2(dx, dz) : Math.atan2(-dz, dx);
    if (k === 'door') env.setSetting('doorH', Math.round((mid.y + 0.015) * 100));
    else {
      env.setSetting('dipH', Math.round((mid.y + 0.015) * 100));
      if (!one) env.setSetting('dipGap', Math.round(Math.hypot(dx, dz) * 100));
    }
    equipChanged(env.eq, env.preview, k, env.store);
    this.note = k === 'door' ? `Barra colocada a ${env.s('doorH')} cm de altura` : one ? `Paralela colocada a ${env.s('dipH')} cm de altura` : `Paralelas colocadas: ${env.s('dipH')} cm de alto, ${env.s('dipGap')} cm entre ellas`;
  }
  /** «Delante de mí» (RepArena: placeInFront): la barra a 25 cm, las paralelas a 55, de cara a donde miras. */
  inFront(env: PlaceEnv, k: 'door' | 'dip'): void {
    const e = eqPose(env.eq, env.preview, k), f = fwdH(env.head.q, _pf), d = k === 'door' ? 0.25 : 0.55;
    e.x = env.head.p.x + f.x * d;
    e.z = env.head.p.z + f.z * d;
    e.yaw = yawOf(env.head.q);
    equipChanged(env.eq, env.preview, k, env.store);
  }
  /** Los ajustes finos: mover a un lado (side) o hacia delante (ahead), en metros respecto a donde miras, y girar (rot,
   * radianes) (RepArena: nudgeEquip). */
  nudge(env: PlaceEnv, k: 'door' | 'dip', side: number, ahead: number, rot: number): void {
    const e = eqPose(env.eq, env.preview, k), f = fwdH(env.head.q, _pf);
    e.x += -f.z * side + f.x * ahead;
    e.z += f.x * side + f.z * ahead;
    e.yaw += rot;
    equipChanged(env.eq, env.preview, k, env.store);
    this.note = '';
  }
  /** «Listo» (RepArena: placeDone): se guarda y, en las gafas, se pide un ancla nueva. */
  done(env: PlaceEnv): void {
    const k = env.eq.edit;
    this.on = this.wait = false;
    this.note = '';
    this.line.visible = false;
    if (!k) return;
    env.eq.edit = null;
    if (eqPose(env.eq, env.preview, k).set) {
      equipChanged(env.eq, env.preview, k, env.store);
      equipCommit(env.eq, env.preview, k);
    }
  }
  /** El texto de arriba de los ajustes finos y su color (RepArena: adjustMenu). Al abrirlos, el aparato pasa a editarse
   * (`eq.edit`), como en RepArena. */
  adjustNote(env: PlaceEnv): { text: string; color: string } {
    const k: EqKind = eqKind(env.str('exercise')), e = eqPose(env.eq, env.preview, k);
    if (env.eq.edit !== k) {
      env.eq.edit = k;
      e.anchor = null;
    }
    const nm = eqName(k, dipOne(env.str('dipBars'))), what = `${nm.the} ${nm.pl ? 'virtuales coincidan' : 'virtual coincida'}`;
    const text = this.note ? `${this.note}. Ajusta hasta que ${what} con la real.` : e.set ? `Ajusta hasta que ${what} con la real` : `Aún no ${nm.pl ? 'están colocadas' : 'está colocada'}: pulsa Colocar con las manos`;
    return { text, color: this.note ? '#3cf0c6' : e.set ? '#d8d3f5' : '#ffd166' };
  }
}
