/**
 * Los aparatos del modo Barras (la barra de dominadas de puerta y las paralelas del remo), como en RepArena
 * (src/35_equip.js: EQ, eqPose, eqLocal, eqWorld, eqTopY…; sin sus modelos, que pinta la escena). Son muebles fijos: se
 * guardan en el navegador con la misma clave y forma que RepArena (`reparena3-equip`), así las dos versiones los
 * comparten. Las poses van en el suelo de la sesión (local-floor; en el ordenador, en el mundo de la prueba): la barra va a
 * lo largo de su eje X local; las paralelas, a lo largo de su eje Z local.
 *
 * Para que no se muevan si cambia el origen de la sesión, RepArena los guarda de tres maneras, de más a menos precisa: el
 * ancla persistente de WebXR (`handle`), la pose respecto al suelo del guardián (`b`, bounded-floor: no se mueve entre
 * sesiones) y la pose en local-floor, que se corrige al recentrar (`refReset`). Lo de WebXR (crear y recuperar anclas) lo
 * hace la escena; aquí, solo las cuentas. Sin IWSDK: se compara en tests/compare/bars.compare.test.ts.
 */
import { Quaternion, Vector3, Matrix4 } from 'three';
import { wrapAng, yawOf } from './env.js';

export const EQUIP_KEY = 'reparena3-equip';
export type EqKind = 'door' | 'dip' | 'spot';
/** spot: el sitio de juego de la habitación colocada a mano (realidad mixta). */
export const EQ_KINDS: EqKind[] = ['door', 'dip', 'spot'];

/** Una pose en el suelo (x, z, giro). */
export interface FloorPose {
  x: number;
  z: number;
  yaw: number;
}
export interface EqPose extends FloorPose {
  /** ¿Lo ha colocado el jugador? */
  set: boolean;
  /** El ancla persistente de las Quest (su nombre) y el ancla viva de esta sesión (de la escena). */
  handle: string | null;
  anchor: unknown;
  /** La pose respecto al suelo del guardián. */
  b: FloorPose | null;
  /** ¿Ya se puso al día la pose del guardián en esta sesión? */
  synced: boolean;
  /** ¿Ya se tomó la pose del seguimiento al menos una vez (para ignorar su temblor)? */
  fix?: boolean;
}
export interface Equip {
  /** En las gafas y en la prueba en el ordenador (RepArena: EQ.xr y EQ.pv). */
  xr: Record<EqKind, EqPose>;
  pv: Record<EqKind, EqPose>;
  /** El que se está colocando. */
  edit: EqKind | null;
  /** Los que esperan un ancla nueva (la crea la escena en el próximo fotograma XR). */
  pending: EqKind[];
  /** Dónde está el origen del suelo del guardián en local-floor (de la escena, en cada fotograma); null sin él. */
  b2l: FloorPose | null;
}

type Store = (k: string, v?: unknown) => unknown;

const mkPose = (z: number): EqPose => ({ x: 0, z, yaw: 0, set: false, handle: null, anchor: null, b: null, synced: false });
const mkSet = (): Record<EqKind, EqPose> => ({ door: mkPose(-0.2), dip: mkPose(-0.45), spot: mkPose(0) });
// (como el isFinite de RepArena, que convierte: null vale 0)
const fin = (...v: unknown[]): boolean => v.every((n) => isFinite(n as number));

/** Lee los aparatos guardados (RepArena: loadEquip; descarta los que no tienen números). */
export function loadEquip(store: Store): Equip {
  const EQ: Equip = { xr: mkSet(), pv: mkSet(), edit: null, pending: [], b2l: null };
  const s = (store(EQUIP_KEY) || {}) as Record<string, Record<string, unknown> | undefined>;
  for (const k of EQ_KINDS) {
    const e = s[k];
    if (!e || !fin(e.x, e.z, e.yaw)) continue;
    const b = e.b as Record<string, unknown> | null | undefined;
    Object.assign(EQ.xr[k], { x: e.x, z: e.z, yaw: e.yaw, set: !!e.set, handle: typeof e.handle === 'string' ? e.handle : null, b: b && fin(b.x, b.z, b.yaw) ? { x: b.x, z: b.z, yaw: b.yaw } : null });
  }
  return EQ;
}
/** Guarda los de las gafas (RepArena: saveEquip; los del ordenador no se guardan). */
export function saveEquip(EQ: Equip, store: Store): void {
  const o: Record<string, unknown> = {};
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k];
    o[k] = { x: e.x, z: e.z, yaw: e.yaw, set: e.set, handle: e.handle, b: e.b };
  }
  store(EQUIP_KEY, o);
}

/** Pose en local-floor → respecto al suelo del guardián (RepArena: eqToBounded). */
export function eqToBounded(EQ: Equip, e: EqPose): void {
  const T = EQ.b2l;
  if (!T) return;
  const dx = e.x - T.x, dz = e.z - T.z, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
  e.b = { x: dx * c - dz * s, z: dx * s + dz * c, yaw: e.yaw - T.yaw };
}
/** Y al revés (RepArena: eqFromBounded), sin el temblor (eqTrack). */
export function eqFromBounded(EQ: Equip, e: EqPose): void {
  const T = EQ.b2l as FloorPose, b = e.b as FloorPose, c = Math.cos(T.yaw), s = Math.sin(T.yaw);
  eqTrack(e, T.x + b.x * c + b.z * s, T.z - b.x * s + b.z * c, b.yaw + T.yaw);
}
/** La pose que da el seguimiento tiembla unos milímetros: aplicada tal cual, la barra y todo lo que cuelga de ella se
 * mueven y destellan. El temblor se ignora; una deriva lenta se sigue poco a poco, y un salto de verdad (se recolocó), de
 * golpe (RepArena: eqTrack). */
export function eqTrack(e: EqPose, x: number, z: number, yaw: number): void {
  const dd = Math.hypot(x - e.x, z - e.z), da = Math.abs(wrapAng(yaw - e.yaw));
  if (!e.fix || dd > 0.03 || da > 0.025) {
    e.x = x;
    e.z = z;
    e.yaw = yaw;
    e.fix = true;
  } else if (dd > 0.004 || da > 0.004) {
    e.x += (x - e.x) * 0.05;
    e.z += (z - e.z) * 0.05;
    e.yaw += wrapAng(yaw - e.yaw) * 0.05;
  }
}

/** El aparato de cada ejercicio: el remo, en las paralelas; las dominadas y el colgado, en la barra (RepArena: eqKind). */
export const eqKind = (exercise: string): 'door' | 'dip' => (exercise === 'row' ? 'dip' : 'door');
/** La pose de un aparato (RepArena: eqPose). */
export const eqPose = (EQ: Equip, preview: boolean, k: EqKind): EqPose => (preview ? EQ.pv : EQ.xr)[k];
/** Una sola paralela: te tumbas cruzado debajo de ella (RepArena: dipOne). */
export const dipOne = (dipBars: string): boolean => dipBars === '1';
/** Su nombre para los textos (RepArena: eqName). */
export function eqName(k: EqKind, one: boolean): { the: string; name: string; pl: boolean } {
  return k === 'door' ? { the: 'la barra', name: 'barra', pl: false } : one ? { the: 'la paralela', name: 'paralela', pl: false } : { the: 'las paralelas', name: 'paralelas', pl: true };
}
/** Ejes horizontales del aparato: a lo largo de la barra (X local) y perpendicular (Z local) (RepArena: eqAxes). */
export function eqAxes(e: FloorPose, ax: Vector3 | null, az?: Vector3 | null): void {
  const c = Math.cos(e.yaw), s = Math.sin(e.yaw);
  if (ax) ax.set(c, 0, -s);
  if (az) az.set(s, 0, c);
}
const _eqa = new Vector3(), _eqb = new Vector3();
/** Un punto del mundo en las coordenadas (horizontales) del aparato; la altura, tal cual (RepArena: eqLocal). */
export function eqLocal(e: FloorPose, p: Vector3, out: Vector3): Vector3 {
  eqAxes(e, _eqa, _eqb);
  const dx = p.x - e.x, dz = p.z - e.z;
  return out.set(dx * _eqa.x + dz * _eqa.z, p.y, dx * _eqb.x + dz * _eqb.z);
}
/** Y al revés (RepArena: eqWorld). */
export function eqWorld(e: FloorPose, lx: number, y: number, lz: number, out: Vector3): Vector3 {
  eqAxes(e, _eqa, _eqb);
  return out.set(e.x + _eqa.x * lx + _eqb.x * lz, y, e.z + _eqa.z * lx + _eqb.z * lz);
}
/** La altura de la barra que se agarra (RepArena: eqTopY: «Altura de la barra» o «Altura de las paralelas», en cm). */
export const eqTopY = (k: EqKind, s: (key: string) => number): number => (k === 'dip' ? s('dipH') / 100 : s('doorH') / 100);

/** Colocado o movido (RepArena: equipChanged): se marca como colocado y, en las gafas, se guarda (también respecto al
 * guardián). */
export function equipChanged(EQ: Equip, preview: boolean, k: EqKind, store: Store): void {
  const e = eqPose(EQ, preview, k);
  e.set = true;
  if (!preview) {
    eqToBounded(EQ, e);
    e.synced = true;
    saveEquip(EQ, store);
  }
}
/** Al terminar de colocarlo: ancla nueva en el próximo fotograma XR (RepArena: equipCommit). */
export function equipCommit(EQ: Equip, preview: boolean, k: EqKind): void {
  if (!preview && !EQ.pending.includes(k)) EQ.pending.push(k);
}

/** Al empezar la sesión XR (RepArena: anchorsInit, sin pedir nada a WebXR): sin anclas vivas ni guardián todavía. */
export function equipSessionStart(EQ: Equip): void {
  EQ.b2l = null;
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k];
    e.anchor = null;
    e.synced = false;
    e.fix = false;
  }
}
/** El ancla no se pudo recuperar (tras los reintentos): si queda la pose del guardián, se olvida (RepArena: restoreAnchor). */
export function anchorLost(EQ: Equip, e: EqPose, store: Store): void {
  if (e.b) {
    e.handle = null;
    saveEquip(EQ, store);
  }
}

const _rq = new Quaternion(), _rm = new Matrix4(), _rv3 = new Vector3(), _one = new Vector3(1, 1, 1);
/** Recentrar mueve el origen de local-floor: lo que no tiene ancla ni guardián se lleva al mismo sitio de la habitación
 * (RepArena: onRefReset; `T`, el transform del suceso 'reset'; `bounded`: si hay suelo del guardián). */
export function equipRefReset(EQ: Equip, T: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }, bounded: boolean, store: Store): void {
  _rm.compose(_rv3.set(T.position.x, T.position.y, T.position.z), _rq.set(T.orientation.x, T.orientation.y, T.orientation.z, T.orientation.w), _one).invert();
  const dyaw = -yawOf(_rq);
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k];
    if (e.anchor || (e.b && bounded)) continue;
    _rv3.set(e.x, 0, e.z).applyMatrix4(_rm);
    e.x = _rv3.x;
    e.z = _rv3.z;
    e.yaw += dyaw;
  }
  saveEquip(EQ, store);
}

/** En cada fotograma XR, cada aparato colocado sigue su ancla (`anchors[k]`: la pose que da, o null) o, sin ella, el
 * suelo del guardián (RepArena: el final de anchorsFrame). Antes, la escena pone `EQ.b2l` al día. */
export function equipFrame(EQ: Equip, anchors: Partial<Record<EqKind, FloorPose | null>>, store: Store): void {
  for (const k of EQ_KINDS) {
    const e = EQ.xr[k];
    if (!e.set || EQ.edit === k) continue;
    const pose = e.anchor ? anchors[k] : null;
    if (pose) {
      eqTrack(e, pose.x, pose.z, pose.yaw);
      if (!e.synced && EQ.b2l) {
        e.synced = true;
        eqToBounded(EQ, e);
        saveEquip(EQ, store);
      } // el ancla manda: el guardián se pone al día
    } else if (e.b && EQ.b2l) eqFromBounded(EQ, e);
    else if (!e.b && EQ.b2l && e.handle === null && e.synced === false) {
      e.synced = true;
      eqToBounded(EQ, e);
      saveEquip(EQ, store);
    } // poses antiguas: desde ahora, también respecto al guardián
  }
}
/** El ancla nueva ya está (RepArena: la promesa de createAnchor): se apunta; su nombre persistente llega después
 * (`anchorHandle`). Devuelve el nombre viejo, para borrarlo de las gafas. */
export function anchorCreated(e: EqPose, anchor: unknown): string | null {
  const old = e.handle;
  e.anchor = anchor;
  e.handle = null;
  return old;
}
export function anchorHandle(EQ: Equip, e: EqPose, handle: string, store: Store): void {
  e.handle = handle;
  saveEquip(EQ, store);
}
