/**
 * La mirada, como en RepArena (src/70_game.js: GZL y gazeLockStep). No se fija el enemigo que cae en el centro en cada
 * instante (al bajar y subir en la sentadilla la cabeza se mueve y la mirada baila), sino al que llevas un momento
 * mirando: cada enemigo suma «atención» mientras cae cerca del centro (más cuanto más centrado) y la va perdiendo en menos
 * de medio segundo; el fijado solo cambia cuando otro le supera con claridad, y el disparo va a él aunque en ese instante
 * la mirada se haya desviado (se suelta si miras lejos de él un par de segundos).
 */
import { Vector3 } from 'three';
import type { Target } from './target.js';

export const GZL = { e: null as Target | null, att: new Map<Target, number>(), t: 0, d: new Vector3(0, 0, -1), away: 0 };
const _gv = new Vector3();
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Un paso de la mirada desde o hacia d (la cabeza y hacia dónde mira); assist: la «Ayuda de puntería», en grados. */
export function gazeLockStep(t: number, o: Vector3, d: Vector3, targets: Iterable<Target>, assist: number): Target | null {
  const dt = clamp(t - GZL.t, 0, 0.1);
  GZL.t = t;
  const cone = ((Math.max(assist, 5) * Math.PI) / 180) * 1.6;
  for (const [e, a] of GZL.att) {
    const na = a * Math.exp(-dt / 0.4);
    if (!e.alive || na < 1e-3) GZL.att.delete(e);
    else GZL.att.set(e, na);
  }
  for (const e of targets) {
    if (!e.alive) continue;
    const v = e.center(_gv).sub(o), dist = v.length();
    if (dist < 0.05) continue;
    const ang = v.angleTo(d) - Math.atan((e.radius * 1.3) / dist);
    if (ang < cone) GZL.att.set(e, (GZL.att.get(e) || 0) + dt * (1 - Math.max(0, ang) / cone));
  }
  let best: Target | null = null, ba = 0;
  for (const [e, a] of GZL.att)
    if (a > ba) {
      ba = a;
      best = e;
    }
  let cur = GZL.e && GZL.e.alive ? GZL.e : null;
  const ca = cur ? GZL.att.get(cur) || 0 : 0;
  // mirando lejos del fijado (más de 3 conos) durante 2 s, se suelta; mirar al suelo un momento al bajar no lo suelta
  if (cur) {
    const v = cur.center(_gv).sub(o);
    GZL.away = v.angleTo(d) > cone * 3 ? GZL.away + dt : 0;
    if (GZL.away > 2) cur = null;
  }
  if (!cur) GZL.e = ba > 0.06 ? best : null;
  else if (best && best !== cur && ba > ca * 1.15 + 0.03) GZL.e = best;
  else GZL.e = cur;
  GZL.d.lerp(d, Math.min(1, dt * 10)).normalize(); // el punto de la mirada, sin temblores
  return GZL.e;
}

/** El enemigo fijado con la mirada (si sigue vivo). */
export const gazeLock = (): Target | null => (GZL.e && GZL.e.alive ? GZL.e : null);

export function gazeLockReset(): void {
  GZL.e = null;
  GZL.att.clear();
  GZL.away = 0;
}
