/**
 * El puñetazo, como en RepArena (src/77_guard.js: punchStep): en Combate, de pie o sentado (en el suelo, las manos están
 * apoyadas) y sin espadas, la mano que va deprisa hacia un enemigo (más de PUNCH_V respecto a la cabeza: al agacharte baja
 * todo el cuerpo y eso no cuenta) y llega a su cuerpo lo echa hacia atrás y lo deja un momento aturdido (y, si estaba
 * atacando, le corta el golpe). No hace daño: las oleadas piden las mismas repeticiones. Cada mano, un golpe cada
 * PUNCH_CD; cada enemigo, uno cada PUNCH_E.
 * Lógica pura: aquí solo se ve quién recibe el golpe; lo que pasa (el empujón, las chispas, el sonido) lo hace el juego.
 */
import { Vector3 } from 'three';
import { hands, head, SIDES, type Side } from './hand-model.js';
import type { Target } from './target.js';

export const PUNCH_V = 1.8, PUNCH_CD = 0.45, PUNCH_E = 0.6, PUNCH_R = 0.3;

/** Un enemigo que se puede golpear: si está saliendo (no se le puede dar) y si es volador (se le da con más margen). */
export interface PunchTarget extends Target {
  readonly emerging?: boolean;
  readonly flyer?: boolean;
}

const mkP = () => ({ last: new Vector3(), hl: new Vector3(), ok: false, cd: 0 });
export const PUNCH = { left: mkP(), right: mkP(), n: 0, t: 0, next: new Map<Target, number>() };

const _puV = new Vector3(), _puH = new Vector3(), _puC = new Vector3(), _puD = new Vector3();

/**
 * Cada fotograma (on: si vale el puñetazo ahora: en la partida, «Apartar a golpes», de pie y sin espadas). hit: lo llama
 * con la mano, el enemigo, la velocidad de la mano (m/s, hacia donde iba el puño) y su rapidez.
 */
export function punchStep(dt: number, on: boolean, targets: Iterable<PunchTarget>, hit: (side: Side, e: PunchTarget, v: Vector3, speed: number) => void): void {
  if (!on || !(dt > 0)) {
    PUNCH.left.ok = PUNCH.right.ok = false;
    return;
  }
  PUNCH.t += dt;
  for (const s of SIDES) {
    const h = hands[s], P = PUNCH[s];
    P.cd -= dt;
    if (!h.ok || h.back) {
      // (al volver tras una mano calculada, el salto no es un puñetazo: RepArena)
      P.ok = false;
      if (!h.ok) continue;
    }
    if (!P.ok) {
      P.last.copy(h.wrist);
      P.hl.copy(head.p);
      P.ok = true;
      continue;
    }
    _puV.subVectors(h.wrist, P.last).sub(_puH.subVectors(head.p, P.hl)).divideScalar(dt);
    P.last.copy(h.wrist);
    P.hl.copy(head.p);
    const sp = _puV.length();
    if (sp < PUNCH_V || P.cd > 0) continue;
    for (const e of targets) {
      const nt = PUNCH.next.get(e);
      if (!e.alive || e.emerging || (nt && PUNCH.t < nt)) continue;
      e.center(_puC);
      const r = (e.radius || 0.35) * (e.flyer ? 1.3 : 1) + PUNCH_R, d = _puD.subVectors(_puC, h.wrist), dl = d.length();
      if (dl > r || (dl > 0.05 && d.dot(_puV) / (dl * sp) < 0.3)) continue; // (la mano llega a su cuerpo, y va hacia él)
      P.cd = PUNCH_CD;
      PUNCH.next.set(e, PUNCH.t + PUNCH_E);
      PUNCH.n++;
      hit(s, e, _puV, sp);
      break;
    }
  }
  // (los que ya no están, fuera de la lista)
  for (const e of PUNCH.next.keys()) if (!e.alive) PUNCH.next.delete(e);
}

export function punchReset(): void {
  PUNCH.left.ok = PUNCH.right.ok = false;
  PUNCH.n = 0;
  PUNCH.next.clear();
}
