// El reproductor de la caja negra (src/core/blackbox.ts): convierte una captura de las gafas en la traza que vio el
// detector y la pasa otra vez por StandingDetector, fotograma a fotograma, con los mismos ajustes. Devuelve los sucesos con
// su momento y, para comparar, los que se grabaron. Con `cfg` se puede cambiar lo que pide el ejercicio (el camino nuevo de
// la fase 2 irá por ahí: así se ve con la misma captura qué hace el detector de ahora y qué haría el nuevo).
import { Vector3 } from 'three';
import { bbParse, eventToken, HB, type BBFrame, type BBParsed } from '../../src/core/blackbox.js';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, standDefaults, type StandCfg, type StandEvent } from '../../src/exercise/standing.js';

export interface ReplayEvent {
  /** El fotograma (en la captura) y su momento (s). */
  i: number;
  t: number;
  tok: string;
}
export interface ReplayResult {
  ex: string;
  /** Desde qué fotograma se reproduce (el primero sirve para colocar el detector como estaba). */
  from: number;
  frames: BBFrame[];
  recorded: ReplayEvent[];
  replayed: ReplayEvent[];
  /** El detector al acabar (para mirar su estado). */
  det: StandingDetector;
}

const SIDES: Side[] = ['left', 'right'];
const ARM: Record<string, 'down' | 'rising' | 'hold' | 'top'> = { d: 'down', r: 'rising', h: 'hold', t: 'top' };
const FR: Record<string, 'down' | 'rising' | 'top'> = { d: 'down', r: 'rising', t: 'top' };

function setHand(h: Hand, f: BBFrame['hands'][Side]): void {
  h.ok = f.ok;
  h.isHand = f.isHand;
  h.est = f.flags & HB.pred ? 'pred' : f.flags & HB.body ? 'body' : null;
  h.back = !!(f.flags & HB.back);
  if (f.ok) h.wrist.set(f.x, f.y, f.z);
  h.J[10].ok = !!f.k;
  if (f.k) h.J[10].p.set(f.k[0], f.k[1], f.k[2]);
}

// Coloca el detector como estaba al acabar el fotograma f (lo que se grabó de él): para empezar a mitad de partida.
function seed(det: StandingDetector, ex: string, f: BBFrame): void {
  det.reset(f.head.y);
  const v = f.det;
  for (const s of SIDES) {
    const h = f.hands[s], F = det.HF[s];
    F.has = h.ok;
    if (h.ok) F.p.set(h.x, h.y, h.z);
    F.ok = !!(h.flags & HB.hf);
    F.n = F.ok ? 2 : 0; // (cuántos seguidos llevaba no se graba: con 2 ya vale)
  }
  if (ex === 'curl2') {
    const B = det.bar;
    Object.assign(B, { state: ARM[f.st[0]] ?? 'down', bottom: v[1], max: v[2], lost: v[3], t0: f.t });
    B.hv.left = v[4];
    B.hv.right = v[5];
    B.hy.left = f.hands.left.ok ? f.hands.left.y : NaN;
    B.hy.right = f.hands.right.ok ? f.hands.right.y : NaN;
    if (B.state === 'hold') {
      B.ev = { perfect: false, fast: false };
      det.charged = true;
    }
  } else if (ex === 'curl') {
    SIDES.forEach((s, k) => {
      const A = det.curl[s];
      Object.assign(A, { state: ARM[f.st[k]] ?? 'down', bottom: v[k], max: v[2 + k], lost: v[4 + k], t0: f.t });
      if (A.state === 'hold') A.ev = { perfect: false, fast: false };
    });
  } else if (ex === 'fraise') {
    Object.assign(det.fr, { state: FR[f.st[0]] ?? 'down', bottom: v[0], max: v[1], lost: v[2], fwd: v[3], holdT: v[4], pow: v[5] || 1, t0: f.t });
  } else if (ex === 'twist') {
    Object.assign(det.tw, { n: v[0], acc: v[1], lo: v[2], hi: v[3], dir: v[4], lostT: v[5], pow: v[6] || 1 });
  } else {
    det.sq.reset(v[0]);
    det.sq.state = f.st[0] === 'd' ? 'down' : 'up';
    det.th.ref = v[0];
  }
}

/** Reproduce una captura (su texto o ya leída). cfg: cambia lo que pide el ejercicio. */
export function replay(capture: string | BBParsed, opts: { cfg?: (c: StandCfg) => StandCfg } = {}): ReplayResult {
  const cap = typeof capture === 'string' ? bbParse(capture) : capture, ex = cap.ex, F = cap.frames;
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new Vector3(), speed: 0 };
  const I = { hands, head, fwd: new Vector3(0, 0, -1), play: true };
  const det = new StandingDetector(), out: StandEvent[] = [];
  const recorded: ReplayEvent[] = [], replayed: ReplayEvent[] = [];
  F.forEach((f, i) => f.events.forEach((tok) => recorded.push({ i, t: f.t, tok })));
  // si la captura no empieza con el detector de cero, se coloca como estaba en el primer fotograma y se sigue desde el segundo
  const from = F.length && F[0].reset === null ? 1 : 0;
  if (from) seed(det, ex, F[0]);
  const cfgAt = (t: number): StandCfg => {
    let c: StandCfg = standDefaults(ex);
    for (const m of cap.cfgs) if (m.t <= t + 1e-6) c = m.cfg;
    return opts.cfg ? opts.cfg(c) : c;
  };
  for (let i = from; i < F.length; i++) {
    const f = F[i];
    if (f.reset !== null) det.reset(f.reset);
    head.p.set(f.head.x, f.head.y, f.head.z);
    head.speed = f.head.speed;
    setHand(hands.left, f.hands.left);
    setHand(hands.right, f.hands.right);
    I.play = f.play;
    out.length = 0;
    det.update(f.t, f.dt, I, cfgAt(f.t), out);
    for (const e of out) replayed.push({ i, t: f.t, tok: eventToken(e) });
  }
  return { ex, from, frames: F, recorded: recorded.filter((e) => e.i >= from), replayed, det };
}

/** ¿Coinciden lo grabado y lo reproducido? Cada suceso, el mismo y como mucho a `tol` fotogramas. Devuelve lo que no casa. */
export function mismatches(r: ReplayResult, tol = 2): { recorded: ReplayEvent[]; replayed: ReplayEvent[] } {
  const a = [...r.recorded], b = [...r.replayed], used = new Set<number>(), miss: ReplayEvent[] = [];
  for (const e of a) {
    const k = b.findIndex((x, j) => !used.has(j) && x.tok === e.tok && Math.abs(x.i - e.i) <= tol);
    if (k < 0) miss.push(e);
    else used.add(k);
  }
  return { recorded: miss, replayed: b.filter((_, j) => !used.has(j)) };
}

/** La tabla de una reproducción, para leerla: cada suceso con su momento, grabado y reproducido. */
export function table(r: ReplayResult): string {
  const t0 = r.frames[0]?.t ?? 0, rows = new Map<number, { rec: string[]; rep: string[] }>();
  const at = (i: number) => rows.get(i) ?? (rows.set(i, { rec: [], rep: [] }), rows.get(i)!);
  for (const e of r.recorded) at(e.i).rec.push(e.tok);
  for (const e of r.replayed) at(e.i).rep.push(e.tok);
  const lines = [`${r.ex}: ${r.frames.length} fotogramas, ${(r.frames.at(-1)!.t - t0).toFixed(2)} s`, 't (s)    fotograma  grabado      reproducido  estado y bottom'];
  for (const [i, v] of [...rows].sort((x, y) => x[0] - y[0])) {
    const f = r.frames[i], d = f.det;
    lines.push(`${(f.t - t0).toFixed(3).padStart(7)}  ${String(i).padStart(9)}  ${v.rec.join(',').padEnd(11)}  ${v.rep.join(',').padEnd(11)}  ${f.st} ${r.ex === 'curl2' ? `y=${(d[0] * 100).toFixed(1)} bottom=${(d[1] * 100).toFixed(1)} cm` : ''}`);
  }
  return lines.join('\n');
}

/** Varias capturas en un mismo archivo (la descarga de la página las separa con «==========»). */
export const splitCaptures = (text: string): string[] => text.split(/\n=+\n/).filter((s) => s.includes('· caja negra ·'));
