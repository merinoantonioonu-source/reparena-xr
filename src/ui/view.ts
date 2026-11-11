/**
 * Dónde salen los avisos de la vista (los del centro, los breves, la caricatura y la carátula), como en RepArena
 * (src/60_ui.js: viewQ, fixvStep, hudQ, hudLocal, panelHides, hudSlot, lazyAt). Regla del usuario: siguen adónde miras al
 * girar o al subir y bajar la vista, pero **nunca se ladean con la cabeza** (el texto, siempre derecho). Tumbado o en
 * plancha (mirando al suelo o al techo) salen en el suelo bajo tu cara o en el techo, de cara a tus ojos, con lo de arriba
 * del texto hacia tu cabeza (hacia donde apuntaba lo alto de tu cabeza al tumbarte, que ya no cambia aunque la ladees).
 * Una vez empezada la partida, además, fijos: delante de donde mirabas al empezar. Sin IWSDK: se prueba con su código.
 */
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

/** La cabeza, tal como la dan las gafas (posición y giro). */
export interface HeadPose {
  p: Vector3;
  q: Quaternion;
}

/** Lo que tiene que verse siempre (los enemigos): centro y radio en el mundo. */
export interface Threat {
  p: Vector3;
  r: number;
}

export class ViewFrame {
  /** Tumbado: lo alto de tu cabeza al tumbarte, en horizontal (RepArena: LIE). */
  readonly lie = { on: false, up: new Vector3() };
  /** En partida: dónde estabas y adónde mirabas al empezar (RepArena: FIXV). */
  readonly fix = { on: false, p: new Vector3(), q: new Quaternion() };
  private readonly vq = new Quaternion();
  private readonly ve = new Euler(0, 0, 0, 'YXZ');
  private readonly f = new Vector3();
  private readonly x = new Vector3();
  private readonly y = new Vector3();
  private readonly z = new Vector3();
  private readonly m = new Matrix4();
  private readonly fx = new Vector3();

  /** El giro de los avisos que siguen a la vista: la cabeza sin ladear; tumbado (lying: un ejercicio de suelo), de cara a
   * los ojos con lo de arriba hacia la cabeza (RepArena: viewQ). */
  viewQ(head: HeadPose, lying: boolean): Quaternion {
    const f = this.f.set(0, 0, -1).applyQuaternion(head.q);
    if (lying && Math.abs(f.y) > 0.6) {
      const L = this.lie;
      if (!L.on) {
        L.on = true;
        L.up.set(0, 1, 0).applyQuaternion(head.q);
        L.up.y = 0;
        if (L.up.lengthSq() < 1e-4) L.up.set(0, 0, -1);
        L.up.normalize();
      }
      this.z.copy(f).negate();
      this.y.copy(L.up).addScaledVector(this.z, -L.up.dot(this.z)).normalize();
      this.x.crossVectors(this.y, this.z);
      return this.vq.setFromRotationMatrix(this.m.makeBasis(this.x, this.y, this.z));
    }
    if (this.lie.on && Math.abs(f.y) < 0.45) this.lie.on = false; // (de pie o sentado otra vez: la próxima vez se vuelve a tomar)
    this.ve.setFromQuaternion(head.q, 'YXZ');
    this.ve.z = 0;
    return this.vq.setFromEuler(this.ve);
  }

  /** Cada fotograma: en partida (fixed), los avisos se quedan donde mirabas al empezar (RepArena: fixvStep). */
  step(head: HeadPose, lying: boolean, fixed: boolean): void {
    if (fixed && !this.fix.on) {
      this.fix.on = true;
      this.fix.p.copy(head.p);
      this.fix.q.copy(this.viewQ(head, lying));
    } else if (!fixed) this.fix.on = false;
  }

  /** El giro de los avisos (fijo en partida). */
  hudQ(head: HeadPose, lying: boolean): Quaternion {
    return this.fix.on ? this.fix.q : this.viewQ(head, lying);
  }

  /** Adónde miran los avisos (fijo en partida). */
  hudFwd(head: HeadPose): Vector3 {
    return this.fix.on ? this.fx.set(0, 0, -1).applyQuaternion(this.fix.q) : this.fx.set(0, 0, -1).applyQuaternion(head.q);
  }

  /** Un punto delante de la vista (off, en el espacio de los avisos: x a la derecha, y arriba, z hacia atrás). */
  hudLocal(off: Vector3, out: Vector3, head: HeadPose, lying: boolean): Vector3 {
    return this.fix.on ? out.copy(off).applyQuaternion(this.fix.q).add(this.fix.p) : out.copy(off).applyQuaternion(this.viewQ(head, lying)).add(head.p);
  }
}

// ¿Tapa este panel (w × h en su plano) alguno de los n que vienen? Uno sin prueba de profundidad (los avisos de la vista) se
// dibuja encima de todo lo que cae dentro de su silueta (RepArena: panelHides)
const ocH = new Vector3(), ocT = new Vector3();
export function panelHides(obj: Object3D, w: number, h: number, always: boolean, head: Vector3, threats: Threat[], n: number): boolean {
  obj.updateMatrixWorld();
  const e = obj.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]) || 1;
  obj.worldToLocal(ocH.copy(head));
  if (ocH.z <= 0.01) return false; // (por detrás no se ve)
  for (let i = 0; i < n; i++) {
    obj.worldToLocal(ocT.copy(threats[i].p));
    if (ocT.z >= ocH.z) continue;
    const s = ocH.z / (ocH.z - ocT.z);
    if (!always && s > 1) continue;
    const m = (threats[i].r / sc) * s, px = ocH.x + (ocT.x - ocH.x) * s, py = ocH.y + (ocT.y - ocH.y) * s;
    if (Math.abs(px) < w / 2 + m && Math.abs(py) < h / 2 + m) return true;
  }
  return false;
}

/** Un aviso con sus huecos (RepArena: HUD.center, HUD.toast): si en el suyo tapa algo, se va a otro; si no hay ninguno
 * libre, se aclara (fade). */
export interface HudSpot {
  slots: [number, number][];
  z: number;
  w: number;
  h: number;
  slot: number;
  off: Vector3;
  fade: number;
}
export const hudSpot = (slots: [number, number][], z: number, w: number, h: number): HudSpot => ({ slots, z, w, h, slot: 0, off: new Vector3(slots[0][0], slots[0][1], z), fade: 1 });

const hl = new Vector3(), dummy = new Object3D();
/** Dónde va el aviso (RepArena: hudSlot): el hueco libre, deslizándose hacia él. */
export function hudSlot(V: ViewFrame, P: HudSpot, slots: [number, number][], head: HeadPose, lying: boolean, threats: Threat[], n: number, dt: number, out: Vector3): Vector3 {
  const free = (i: number): boolean => {
    V.hudLocal(hl.set(slots[i][0], slots[i][1], P.z), dummy.position, head, lying);
    dummy.quaternion.copy(V.hudQ(head, lying));
    return !n || !panelHides(dummy, P.w, P.h, true, head.p, threats, n);
  };
  let pick = slots[P.slot] && free(P.slot) ? P.slot : -1;
  for (let i = 0; pick < 0 && i < slots.length; i++) if (free(i)) pick = i;
  if (pick >= 0) P.slot = pick;
  else P.slot = Math.min(P.slot, slots.length - 1);
  P.off.lerp(hl.set(slots[P.slot][0], slots[P.slot][1], P.z), 1 - Math.exp(-dt * 10));
  P.fade += ((pick >= 0 ? 1 : 0.15) - P.fade) * Math.min(1, dt * 8);
  return V.hudLocal(P.off, out, head, lying);
}

// Los avisos no siguen la mirada (así no hay quien los lea): salen delante y se quedan quietos en el mundo; solo se recolocan,
// deslizándose, si dejan de verse un rato (miras más de 50° a otro lado o te mueves 60 cm) (RepArena: lazyAt)
export const LAZY = { ang: (50 * Math.PI) / 180, t: 0.8, move: 0.6 };
export interface Lazy {
  init: boolean;
  at: Vector3;
  q: Quaternion;
  home: Vector3;
  away: number;
  go: boolean;
  vis: number;
}
export const mkLazy = (): Lazy => ({ init: false, at: new Vector3(), q: new Quaternion(), home: new Vector3(), away: 0, go: false, vis: 1 });
const lz = new Vector3(), lf = new Vector3();
export function lazyAt(V: ViewFrame, L: Lazy, want: Vector3, wantQ: Quaternion, head: HeadPose, dt: number, ang = LAZY.ang): Lazy {
  if (!L.init) {
    L.init = true;
    L.away = 0;
    L.go = false;
    L.vis = 1;
    L.at.copy(want);
    L.q.copy(wantQ);
    L.home.copy(head.p);
    return L;
  }
  if (V.fix.on) {
    const k = 1 - Math.exp(-dt * 7);
    L.at.lerp(want, k);
    L.q.slerp(wantQ, k);
    L.go = false;
    return L;
  }
  const off = head.p.distanceTo(L.home) > LAZY.move || lz.subVectors(L.at, head.p).angleTo(lf.set(0, 0, -1).applyQuaternion(head.q)) > ang;
  L.away = off ? L.away + dt : 0;
  if (L.away > LAZY.t) L.go = true;
  if (L.go) {
    const k = 1 - Math.exp(-dt * 7);
    L.at.lerp(want, k);
    L.q.slerp(wantQ, k);
    if (L.at.distanceTo(want) < 0.03) {
      L.go = false;
      L.away = 0;
      L.home.copy(head.p);
    }
  }
  return L;
}

/** Si el aviso tapa algo que viene, se recoloca y, mientras, se aclara (RepArena: lazyClear). Devuelve su opacidad. */
export function lazyClear(L: Lazy, obj: Object3D, w: number, h: number, head: Vector3, threats: Threat[], n: number, dt: number): number {
  const hides = n > 0 && panelHides(obj, w, h, true, head, threats, n);
  if (hides) L.go = true;
  L.vis += ((hides ? 0.15 : 1) - L.vis) * Math.min(1, dt * 12);
  return L.vis;
}
