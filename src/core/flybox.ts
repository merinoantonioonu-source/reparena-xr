/**
 * La caja negra del vuelo (docs/PLAN-VUELO.md, bloque 1): los últimos 40 s volando en la Travesía, 36 veces por segundo. La
 * cabeza (x, y, z y el giro de canto), las muñecas, lo que leyó el vuelo del cuerpo (escorarse, bajar, la pica, las flexiones,
 * la corriente, posarse), el planeador (el lado, la altura y lo que pedían) y el reto siguiente (clase, lo que le falta, su
 * lado y su altura), con cada acierto y fallo. Sirve para afinar los números con el vuelo de verdad del usuario: la prueba de
 * reproducción (tests/replay/fly-replay.test.ts) pasa una grabación por el planeador con otros números y dice qué habría
 * pasado. Solo mira: no cambia nada del juego.
 *
 * Graba en anillo, en una lista de números ya reservada (nada se crea mientras se juega). Se pasa a texto al guardar el
 * diagnóstico (pausa › «Guardar diagnóstico» y al salir de las gafas), con la caja negra de los ejercicios; la página la deja
 * copiar y descargar. Lógica pura (sin IWSDK): la llena la Travesía (src/modes/trek/trek-system.ts).
 */
import { Glider, flyIn, type FlyIn, type FlyModel } from '../modes/trek/plat/fly.js';
import type { Runner } from '../modes/trek/plat/runner.js';
import { ARCH_CLEAR, FLY_KINDS, PILLAR_W, RING_R, type Piece } from '../modes/trek/plat/types.js';

export const FB_KEY = 'reparenaxr-flybox';
/** Cuántos segundos, cuántas veces por segundo, cuántas filas caben y cuántas capturas se conservan. */
export const FB_SECS = 40, FB_HZ = 36, FB_CAP = FB_SECS * FB_HZ, FB_KEEP = 3;
/** Las columnas de cada fila (en este orden). */
const COLS = ['t', 'hx', 'hy', 'hz', 'roll', 'lok', 'lx', 'ly', 'lz', 'rok', 'rx', 'ry', 'rz', 'side', 'down', 'back', 'rep', 'flap', 'pair', 'upd', 'land', 'since', 'u', 'alt', 'tu', 'ta', 'fl', 'bk', 'k', 'room', 'nu', 'nh', 'ev'] as const;
const NC = COLS.length;
const C = Object.fromEntries(COLS.map((c, i) => [c, i])) as Record<(typeof COLS)[number], number>;
/** Cómo va cada columna en el texto: m (milímetros), r (milirradianes), s (milisegundos), n (tal cual). */
const UNIT: Record<string, string> = { t: 's', roll: 'r', since: 's', bk: 'r', land: 'r' };
const MM = new Set(['hx', 'hy', 'hz', 'lx', 'ly', 'lz', 'rx', 'ry', 'rz', 'side', 'down', 'back', 'u', 'alt', 'tu', 'ta', 'room', 'nu', 'nh']);

/** Los ajustes del vuelo de una captura. */
export interface FBCfg {
  model: FlyModel;
  auto: boolean;
  range: number;
  depth: number;
  lowNeed: number;
  backTo: number;
  board: boolean;
  /** Lo que sube cada aletazo (× lo de serie; las capturas viejas, sin él: 1). */
  flapK?: number;
}

class FlyBox {
  readonly v = new Float32Array(FB_CAP * NC);
  i = 0;
  n = 0;
  fresh = 0;
  cfg: FBCfg = { model: 'pos', auto: true, range: 0.12, depth: 0.13, lowNeed: 0.078, backTo: 0.18, board: false };
  private acc = 0;
  /** Lo que pasó entre dos filas (una flexión, una explosiva) y el reto que se seguía (para apuntar su acierto o fallo). */
  private rep = 0;
  private flap = 0;
  private pair = 0;
  private next: Piece | null = null;
  private ev = 0;
  private t0 = 0;

  /** Empieza de cero (al empezar una ronda volando). */
  clear(now: number): void {
    this.i = this.n = this.fresh = 0;
    this.acc = 0;
    this.rep = this.flap = this.pair = this.ev = 0;
    this.next = null;
    this.t0 = now;
  }

  /** Un fotograma volando (tras `Runner.step`): apunta una fila 36 veces por segundo. */
  rec(now: number, dt: number, R: Runner, head: { x: number; y: number; z: number; roll?: number }, hands: { l: { ok: boolean; x: number; y: number; z: number }; r: { ok: boolean; x: number; y: number; z: number } }, board: boolean): void {
    const I = R.flyIn, G = R.glider;
    this.rep = Math.max(this.rep, I.rep);
    if (I.flap) this.flap = 1;
    if (I.pair) this.pair = 1;
    // el acierto o el fallo del reto que se seguía
    const nx = this.next;
    if (nx && nx.judged && !this.ev) this.ev = (FLY_KINDS.indexOf(nx.k) + 1) * (nx.ok ? 1 : -1);
    const p = R.flyNext();
    if (p !== nx && (!nx || nx.judged)) this.next = p;
    this.acc += dt;
    if (this.acc < 1 / FB_HZ) return;
    this.acc = Math.min(this.acc - 1 / FB_HZ, 1 / FB_HZ);
    const c = this.cfg;
    c.model = I.model;
    c.auto = I.auto;
    c.range = I.range;
    c.depth = I.depth;
    c.lowNeed = I.lowNeed;
    c.backTo = I.backTo;
    c.flapK = I.flapK;
    c.board = board;
    const o = this.i * NC, v = this.v, q = this.next;
    v[o + C.t] = now - this.t0;
    v[o + C.hx] = head.x;
    v[o + C.hy] = head.y;
    v[o + C.hz] = head.z;
    v[o + C.roll] = head.roll ?? 0;
    v[o + C.lok] = hands.l.ok ? 1 : 0;
    v[o + C.lx] = hands.l.x;
    v[o + C.ly] = hands.l.y;
    v[o + C.lz] = hands.l.z;
    v[o + C.rok] = hands.r.ok ? 1 : 0;
    v[o + C.rx] = hands.r.x;
    v[o + C.ry] = hands.r.y;
    v[o + C.rz] = hands.r.z;
    v[o + C.side] = I.side;
    v[o + C.down] = I.down;
    v[o + C.back] = I.back;
    v[o + C.rep] = this.rep;
    v[o + C.flap] = this.flap;
    v[o + C.pair] = this.pair;
    v[o + C.upd] = I.updraft ? 1 : 0;
    v[o + C.land] = I.land;
    v[o + C.since] = I.sinceRep;
    v[o + C.u] = G.u;
    v[o + C.alt] = G.alt;
    v[o + C.tu] = G.tgtU;
    v[o + C.ta] = G.tgtAlt;
    v[o + C.fl] = (G.diving ? 1 : 0) | (G.pike ? 2 : 0) | (G.rising ? 4 : 0);
    v[o + C.bk] = G.brakeK;
    v[o + C.k] = q ? FLY_KINDS.indexOf(q.k) : -1;
    v[o + C.room] = q ? q.at - R.dist + head.z : 0;
    v[o + C.nu] = q ? q.u : 0;
    v[o + C.nh] = q ? q.h : 0;
    v[o + C.ev] = this.ev;
    this.rep = this.flap = this.pair = this.ev = 0;
    this.i = (this.i + 1) % FB_CAP;
    if (this.n < FB_CAP) this.n++;
    this.fresh++;
  }

  /** La captura en texto (la de `fbParse`). */
  text(reason: string, header: string): string {
    const out = [`RepArena XR · caja negra del vuelo · ${reason}`, header, ...FB_LEGEND, `ajustes ${JSON.stringify(this.cfg)}`];
    const start = (this.i - this.n + FB_CAP) % FB_CAP;
    for (let j = 0; j < this.n; j++) {
      const o = ((start + j) % FB_CAP) * NC, row: string[] = ['V'];
      for (let k = 0; k < NC; k++) row.push(enc(COLS[k], this.v[o + k]));
      out.push(row.join(' '));
    }
    return out.join('\n');
  }
}

const enc = (col: string, x: number): string => {
  if (!Number.isFinite(x)) return '_';
  if (MM.has(col)) return String(Math.round(x * 1000));
  const u = UNIT[col];
  if (u === 's' || u === 'r') return String(Math.round(x * 1000));
  return String(Math.round(x));
};
const dec = (col: string, s: string): number => {
  if (s === '_') return NaN;
  const x = Number(s);
  return MM.has(col) || UNIT[col] ? x / 1000 : x;
};

/** Cómo leer la caja negra del vuelo (va arriba en cada captura). */
export const FB_LEGEND = [
  `Cada fila (V), 1/${FB_HZ} s: ${COLS.join(' ')}`,
  '  t (ms desde el principio) · cabeza x y z (mm) y giro de canto (mrad) · muñecas izquierda y derecha: se ve (1/0) y x y z (mm)',
  '  · lo leído: side (escora, mm, + derecha), down (bajar el pecho, mm), back (pica, mm), rep (flexión: 1, 2 perfecta), flap y pair (explosiva, dos)',
  '    upd (en una corriente), land (posarse, ‰), since (ms sin flexiones que empujen)',
  '  · el planeador: u (lado, mm), alt (altura, mm), tu y ta (lo que pedían), fl (1 picado, 2 pica, 4 despegando), bk (lo que frena, ‰)',
  `  · el reto siguiente: k (${FLY_KINDS.map((k, i) => `${i} ${k}`).join(', ')}; −1 ninguno), room (lo que le falta, mm), nu y nh (su lado y su altura, mm)`,
  '  · ev: se pasó (k+1) o se falló (−(k+1)) el reto anterior',
];

/** La caja negra del vuelo (una sola). */
export const FB = new FlyBox();

export interface FBCapture {
  at: number;
  reason: string;
  text: string;
}

/** Guarda la caja negra del vuelo de ahora (si hay algo nuevo) con las anteriores; devuelve la lista. */
export function fbSave(reason: string, header: string, now: number, load: () => FBCapture[] | null, save: (v: FBCapture[]) => void): FBCapture[] {
  const prev = load() ?? [];
  if (!FB.fresh || !FB.n) return prev;
  FB.fresh = 0;
  const list = [...prev, { at: now, reason, text: FB.text(reason, header) }].slice(-FB_KEEP);
  save(list);
  return list;
}

// ---------------------------------------------------------------- leerla y reproducirla

export type FBRow = Record<(typeof COLS)[number], number>;
export interface FBParsed {
  cfg: FBCfg;
  rows: FBRow[];
}

/** Lee el texto de una captura (el de `FlyBox.text`). */
export function fbParse(text: string): FBParsed {
  const res: FBParsed = { cfg: { ...FB.cfg }, rows: [] };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('ajustes ')) res.cfg = JSON.parse(line.slice(8)) as FBCfg;
    else if (line.startsWith('V ')) {
      const a = line.split(' ').slice(1), r = {} as FBRow;
      COLS.forEach((c, k) => (r[c] = dec(c, a[k])));
      res.rows.push(r);
    }
  }
  return res;
}

/** Lo que habría pasado con otros números: cada reto de lado y altura (aro, columna, puente) al llegar a ti. */
export interface FBReplay {
  alt: number[];
  u: number[];
  judged: { k: string; ok: boolean; rec: boolean }[];
}

/** Pasa una grabación por el planeador (`over`: lo que se cambia de lo leído o de los ajustes). Los retos se juzgan como en el
 * juego (el aro, por dentro; la columna, a un lado; el puente, por debajo) en la fila en que se juzgaron en la partida; `rec`,
 * lo que pasó entonces. */
export function flyReplay(P: FBParsed, over: Partial<FlyIn> = {}): FBReplay {
  const G = new Glider(), I = flyIn(), out: FBReplay = { alt: [], u: [], judged: [] };
  const R = P.rows;
  if (!R.length) return out;
  G.reset(R[0].alt);
  G.u = R[0].u;
  G.rising = !!(R[0].fl & 4);
  for (let j = 0; j < R.length; j++) {
    const r = R[j], dt = j ? Math.max(1e-3, r.t - R[j - 1].t) : 1 / FB_HZ;
    Object.assign(I, { side: r.side, down: r.down, back: r.back, depth: P.cfg.depth, lowNeed: P.cfg.lowNeed, range: P.cfg.range, backTo: P.cfg.backTo, flapK: P.cfg.flapK ?? 1, rep: r.rep, flap: !!r.flap, pair: !!r.pair, auto: P.cfg.auto, sinceRep: r.since, updraft: !!r.upd, land: r.land, model: P.cfg.model }, over);
    G.step(dt, I);
    out.alt.push(G.alt);
    out.u.push(G.u);
    // el reto, al juzgarse en la partida (la fila que apunta su acierto o fallo; su lado y su altura, los de la fila anterior)
    if (r.ev && j) {
      const ki = Math.abs(r.ev) - 1, k = FLY_KINDS[ki] ?? '', q = R[j - 1];
      if ((k === 'ring' || k === 'pillar' || k === 'arch') && q.k === ki) {
        const ok = k === 'ring' ? Math.abs(G.u - q.nu) < RING_R && Math.abs(G.alt - q.nh) < RING_R : k === 'pillar' ? Math.abs(G.u - q.nu) >= PILLAR_W / 2 + 0.3 : G.alt < q.nh - ARCH_CLEAR;
        out.judged.push({ k, ok, rec: r.ev > 0 });
      }
    }
  }
  return out;
}
