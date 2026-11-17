/**
 * La caja negra del ejercicio: los últimos ~25 s, fotograma a fotograma, de lo que entra en el detector de los ejercicios
 * con pesas (la cabeza y las manos tal como las da HandSystem, más lo que dicen las gafas de cada mano: postura nueva o
 * repetida, «calculada», mano o mando) y de lo que decide (su estado, la altura de la pesa, lo más bajo del recorrido, las
 * manos que valen y los sucesos: carga, arriba, repetición, a medias). Sirve para ver en casa lo que pasó en las gafas
 * cuando un disparo sale a destiempo y para reproducirlo en las pruebas (tests/replay). Solo mira: no cambia nada del juego.
 *
 * Graba en anillo, en listas de números ya reservadas (nada se crea mientras se juega). Se pasa a texto al guardar el
 * diagnóstico (pausa › «Guardar diagnóstico» y al salir de las gafas); la página lo deja copiar y descargar. Lógica pura
 * (sin IWSDK): la llena la partida (src/combat/game.ts) y la guarda src/ui/diag-system.ts.
 */
import type { Hand, Side } from '../input/hand-model.js';
import type { HandProbe } from '../input/hand-probe.js';
import type { StandCfg, StandEvent, StandingDetector } from '../exercise/standing.js';

export const BB_KEY = 'reparenaxr-blackbox';
/** Cuántos segundos se guardan, cuántos fotogramas caben (25 s a 120 imágenes por segundo) y cuántas capturas se conservan. */
export const BB_SECS = 25, BB_CAP = 3000, BB_KEEP = 3;
const NV = 10; // (valores del detector por fotograma)

// las marcas de cada mano (en hexadecimal en el texto)
export const HB = { ok: 1, hand: 2, fresh: 4, emu: 8, known: 16, hf: 32, pred: 64, body: 128, src: 256, knuckle: 512, back: 1024 } as const;
// los sucesos del detector, en números (tipo | nivel << 3 | perfecta << 6 | rápida << 7 | lado << 8)
const EV_T = ['', 'charge', 'power', 'rep', 'partial', 'top', 'say'] as const;
const evCode = (e: StandEvent): number => {
  const ty = EV_T.indexOf(e.type);
  if (e.type === 'power') return ty | (e.level << 3);
  if (e.type === 'rep') return ty | ((e.pow & 7) << 3) | (e.perfect ? 64 : 0) | (e.fast ? 128 : 0) | ((e.side === 'left' ? 1 : e.side === 'right' ? 2 : 0) << 8);
  if (e.type === 'top') return ty | ((e.side === 'left' ? 1 : e.side === 'right' ? 2 : 0) << 8);
  return ty;
};
/** El suceso en el texto: c carga, p2 carga ×2, r repetición (R perfecta; f rápida; ×n la carga; I/D el brazo), m a medias,
 * t arriba, s aviso. */
export function evToken(code: number): string {
  const ty = EV_T[code & 7], lv = (code >> 3) & 7, sd = (code >> 8) & 3, side = sd === 1 ? 'I' : sd === 2 ? 'D' : '';
  if (ty === 'charge') return 'c';
  if (ty === 'power') return 'p' + lv;
  if (ty === 'rep') return (code & 64 ? 'R' : 'r') + (code & 128 ? 'f' : '') + (lv > 1 ? '×' + lv : '') + side;
  if (ty === 'partial') return 'm';
  if (ty === 'top') return 't' + side;
  return 's';
}
/** Lo mismo desde un suceso del detector (para comparar lo grabado con lo reproducido). */
export const eventToken = (e: StandEvent): string => evToken(evCode(e));

/** Qué apunta del detector cada ejercicio (st: su estado; v: hasta 8 valores con su unidad: m metros, s segundos, v m/s, n número). */
interface DetCols {
  names: string;
  units: string;
}
const DET: Record<string, DetCols> = {
  curl2: { names: 'estado y bottom max lost hvI hvD juntas aire(filtro nuevo) separación(filtro nuevo)', units: 'mmmsvvnnm' },
  curl: { names: 'estadoID bottomI bottomD maxI maxD lostI lostD aireI(filtro nuevo) aireD(filtro nuevo)', units: 'mmmmssnn' },
  fraise: { names: 'estado bottom max lost fwd holdT pow', units: 'mmmsmsn' },
  twist: { names: 'n acc lo hi dir lostT pow', units: 'nnnnnsn' },
  vert: { names: 'estado(cabeza) ref peak pow pendiente armado vistoI vistoD', units: 'mmnnnnn' },
};
const detKind = (ex: string): string => (DET[ex] ? ex : 'vert');
const ST = (s: string): number => s.charCodeAt(0);

/** Unos ajustes del ejercicio, desde un momento (cambian al empezar cada oleada). */
interface CfgMark {
  t: number;
  json: string;
}

class BlackBox {
  readonly t = new Float64Array(BB_CAP);
  readonly dt = new Float32Array(BB_CAP);
  readonly head = new Float32Array(BB_CAP * 4);
  /** Por mano: la muñeca (x, y, z) y el nudillo del corazón (x, y, z; en los antebrazos). */
  readonly w = new Float32Array(BB_CAP * 12);
  readonly hf = new Uint16Array(BB_CAP * 2);
  /** Marcas del fotograma: 1 jugando (en plena oleada), 2 el detector empezó de cero (a la altura `ry`), 4 se quitó la pausa
   * (con «Manos: filtro nuevo», los curls empiezan de cero: resume). */
  readonly ff = new Uint8Array(BB_CAP);
  readonly ry = new Float32Array(BB_CAP);
  readonly st = new Uint8Array(BB_CAP * 2);
  readonly d = new Float32Array(BB_CAP * NV);
  readonly ev = new Int32Array(BB_CAP * 4);
  readonly en = new Uint8Array(BB_CAP);
  /** El siguiente hueco, cuántos hay escritos y cuántos desde la última captura. */
  i = 0;
  n = 0;
  fresh = 0;
  ex = '';
  /** El detector empezó de cero (st.reset): se apunta en el fotograma siguiente. */
  private resetY = NaN;
  private resumed = false;
  private cfgs: CfgMark[] = [];
  /** La muñeca del fotograma anterior (si las gafas no dicen si la postura es nueva). */
  private prevW = new Float64Array(6);
  private prevOk = [false, false];

  /** El detector empieza de cero a la altura y (al calibrar, al empezar la ronda o al recolocarse). */
  markReset(y: number): void {
    this.resetY = y;
  }
  /** Se quitó la pausa y los curls empezaron de cero (resume): se apunta en el fotograma siguiente. */
  markResume(): void {
    this.resumed = true;
  }
  /** Los ajustes del ejercicio en ese momento (al empezar cada oleada; no en cada fotograma). */
  markCfg(t: number, c: StandCfg): void {
    const json = JSON.stringify(c);
    if (this.cfgs.length && this.cfgs[this.cfgs.length - 1].json === json) return;
    this.cfgs.push({ t, json });
    if (this.cfgs.length > 40) this.cfgs.shift();
  }

  /** Un fotograma del detector de pie: lo que entró (la cabeza, las manos y lo que dicen las gafas), lo que decidió y sus
   * sucesos. play: en plena oleada. */
  rec(t: number, dt: number, hands: Record<Side, Hand>, head: { p: { x: number; y: number; z: number }; speed: number }, play: boolean, det: StandingDetector, ex: string, events: readonly StandEvent[], probe: Record<Side, HandProbe> | null): void {
    const i = this.i;
    if (ex !== this.ex) {
      // otro ejercicio: lo de antes ya no sirve para reproducirlo
      this.n = 0;
      this.ex = ex;
    }
    this.t[i] = t;
    this.dt[i] = dt;
    const hd = i * 4;
    this.head[hd] = head.p.x;
    this.head[hd + 1] = head.p.y;
    this.head[hd + 2] = head.p.z;
    this.head[hd + 3] = head.speed;
    this.ff[i] = (play ? 1 : 0) | (Number.isNaN(this.resetY) ? 0 : 2) | (this.resumed ? 4 : 0);
    this.resumed = false;
    this.ry[i] = this.resetY;
    this.resetY = NaN;
    for (let k = 0; k < 2; k++) {
      const s: Side = k ? 'right' : 'left', h = hands[s], P = probe?.[s], o = i * 12 + k * 6;
      let f = 0;
      if (h.ok) f |= HB.ok;
      if (h.isHand) f |= HB.hand;
      if (h.est === 'pred') f |= HB.pred;
      if (h.est === 'body') f |= HB.body;
      if (h.back) f |= HB.back;
      if (det.HF[s].ok) f |= HB.hf;
      if (P?.src) f |= HB.src;
      if (P?.known) {
        f |= HB.known;
        if (P.emu) f |= HB.emu;
        if (P.fresh) f |= HB.fresh;
      } else if (h.ok) {
        // (sin lo que dicen las gafas: nueva si la muñeca se ha movido algo desde el fotograma anterior)
        const q = k * 3;
        if (!this.prevOk[k] || h.wrist.x !== this.prevW[q] || h.wrist.y !== this.prevW[q + 1] || h.wrist.z !== this.prevW[q + 2]) f |= HB.fresh;
      }
      this.prevOk[k] = h.ok;
      this.prevW[k * 3] = h.wrist.x;
      this.prevW[k * 3 + 1] = h.wrist.y;
      this.prevW[k * 3 + 2] = h.wrist.z;
      this.w[o] = h.wrist.x;
      this.w[o + 1] = h.wrist.y;
      this.w[o + 2] = h.wrist.z;
      const K = h.J[10];
      if (ex === 'twist' && h.ok && K.ok) {
        f |= HB.knuckle;
        this.w[o + 3] = K.p.x;
        this.w[o + 4] = K.p.y;
        this.w[o + 5] = K.p.z;
      }
      this.hf[i * 2 + k] = f;
    }
    this.snapDet(i, det, ex);
    let n = 0;
    for (const e of events) if (n < 4) this.ev[i * 4 + n++] = evCode(e);
    this.en[i] = n;
    this.i = (i + 1) % BB_CAP;
    if (this.n < BB_CAP) this.n++;
    this.fresh++;
  }

  // lo que va decidiendo el detector (DET)
  private snapDet(i: number, det: StandingDetector, ex: string): void {
    const d = this.d, o = i * NV, s = i * 2;
    d.fill(0, o, o + NV);
    this.st[s] = this.st[s + 1] = 0;
    if (ex === 'curl2') {
      const B = det.bar;
      this.st[s] = ST(B.state);
      d[o] = B.y;
      d[o + 1] = B.bottom;
      d[o + 2] = B.max;
      d[o + 3] = B.lost;
      d[o + 4] = B.hv.left;
      d[o + 5] = B.hv.right;
      d[o + 6] = B.clasp ? 1 : 0;
      d[o + 7] = det.rb.air ? 1 : 0;
      d[o + 8] = det.rb.sep;
    } else if (ex === 'curl') {
      const L = det.curl.left, R = det.curl.right;
      this.st[s] = ST(L.state);
      this.st[s + 1] = ST(R.state);
      d[o] = L.bottom;
      d[o + 1] = R.bottom;
      d[o + 2] = L.max;
      d[o + 3] = R.max;
      d[o + 4] = L.lost;
      d[o + 5] = R.lost;
      d[o + 6] = L.air ? 1 : 0;
      d[o + 7] = R.air ? 1 : 0;
    } else if (ex === 'fraise') {
      const F = det.fr;
      this.st[s] = ST(F.state);
      d[o] = F.bottom;
      d[o + 1] = F.max;
      d[o + 2] = F.lost;
      d[o + 3] = F.fwd;
      d[o + 4] = F.holdT;
      d[o + 5] = F.pow;
    } else if (ex === 'twist') {
      const T = det.tw;
      this.st[s] = ST('-');
      d[o] = T.n;
      d[o + 1] = T.acc;
      d[o + 2] = T.lo;
      d[o + 3] = T.hi;
      d[o + 4] = T.dir;
      d[o + 5] = T.lostT;
      d[o + 6] = T.pow;
    } else {
      const V = det.sq, T = det.th;
      this.st[s] = ST(V.state);
      d[o] = V.ref;
      d[o + 1] = V.peak;
      d[o + 2] = V.pow;
      d[o + 3] = T.pending ? 1 : 0;
      d[o + 4] = T.armed ? 1 : 0;
      d[o + 5] = T.seen.left ? 1 : 0;
      d[o + 6] = T.seen.right ? 1 : 0;
    }
  }

  /** Vacía la caja (para las pruebas). */
  clear(): void {
    this.i = this.n = this.fresh = 0;
    this.ex = '';
    this.resetY = NaN;
    this.resumed = false;
    this.cfgs.length = 0;
    this.prevOk[0] = this.prevOk[1] = false;
  }

  /** Lo grabado de los últimos BB_SECS segundos, en texto (para guardarlo y para leerlo). */
  text(reason: string, header: string): string {
    const out: string[] = [`RepArena XR · caja negra · ${reason}`, header, `ejercicio: ${this.ex || '?'}`, ...BB_LEGEND.map((l) => '# ' + l), `# detector (${this.ex}): ${DET[detKind(this.ex)].names}`];
    if (!this.n) return out.concat('(vacía: no se ha jugado a un ejercicio con pesas)').join('\n');
    const last = (this.i - 1 + BB_CAP) % BB_CAP, since = this.t[last] - BB_SECS;
    let first = (this.i - this.n + BB_CAP) % BB_CAP;
    for (let k = 0; k < this.n && this.t[first] < since; k++) first = (first + 1) % BB_CAP;
    // los ajustes que valían al empezar y los que cambiaron después
    const t0 = this.t[first];
    let c0 = -1;
    for (let k = 0; k < this.cfgs.length; k++) if (this.cfgs[k].t <= t0) c0 = k;
    for (let k = Math.max(0, c0); k < this.cfgs.length; k++) out.push(`ajustes ${us(Math.max(this.cfgs[k].t, t0))} ${this.cfgs[k].json}`);
    out.push('datos');
    const u = DET[detKind(this.ex)].units;
    for (let j = first; ; j = (j + 1) % BB_CAP) {
      const hd = j * 4, sides: string[] = [];
      for (let k = 0; k < 2; k++) {
        const f = this.hf[j * 2 + k], o = j * 12 + k * 6;
        let s = (k ? 'D ' : 'I ') + f.toString(16);
        if (f & HB.ok) s += ` ${mm(this.w[o])} ${mm(this.w[o + 1])} ${mm(this.w[o + 2])}`;
        if (f & HB.knuckle) s += ` ${mm(this.w[o + 3])} ${mm(this.w[o + 4])} ${mm(this.w[o + 5])}`;
        sides.push(s);
      }
      const s2 = this.st[j * 2 + 1];
      let det = String.fromCharCode(this.st[j * 2] || 45) + (s2 ? String.fromCharCode(s2) : '');
      for (let k = 0; k < u.length; k++) det += ' ' + unit(this.d[j * NV + k], u[k]);
      const evs: string[] = [];
      for (let k = 0; k < this.en[j]; k++) evs.push(evToken(this.ev[j * 4 + k]));
      let row = `F ${us(this.t[j])} ${us(this.dt[j])} ${this.ff[j] & 1 ? 'j' : '-'} | ${mm(this.head[hd])} ${mm(this.head[hd + 1])} ${mm(this.head[hd + 2])} ${Math.round(this.head[hd + 3] * 1000)} | ${sides[0]} | ${sides[1]} | ${det} | ${evs.length ? evs.join(',') : '-'}`;
      if (this.ff[j] & 2) row += ` | reset ${mm(this.ry[j])}`;
      if (this.ff[j] & 4) row += ' | sigue';
      out.push(row);
      if (j === last) break;
    }
    return out.join('\n');
  }
}

// las unidades del texto: posiciones en décimas de milímetro, tiempos en microsegundos, velocidades en mm/s
const mm = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 10000)) : '_');
const us = (v: number): string => String(Math.round(v * 1e6));
const unit = (v: number, u: string): string => (!Number.isFinite(v) ? '_' : u === 'm' ? mm(v) : u === 's' ? String(Math.round(v * 1000)) : u === 'v' ? String(Math.round(v * 1000)) : String(Math.round(v * 1000) / 1000));

/** Cómo leer la caja negra (va arriba en cada captura). */
export const BB_LEGEND = [
  'Cada fila (F), un fotograma: t dt (µs) j=en plena oleada | cabeza x y z (décimas de mm) velocidad (mm/s)',
  '  | I (mano izquierda) y D (derecha): marcas en hexadecimal y, si se ve, la muñeca x y z (décimas de mm, del mundo)',
  '    marcas: 1 se ve · 2 mano (si no, mando) · 4 postura nueva (si no, repetida) · 8 calculada por el navegador (emulatedPosition)',
  '    · 10 las gafas dieron postura · 20 vale para la pesa (HF) · 40/80 inventada por el juego (gesto/cuerpo) · 100 hay fuente · 200 nudillo · 400 reaparece',
  '  | detector: su estado (d abajo, r subiendo, h arriba aguantando, t arriba; u/d de la cabeza) y sus valores (m en décimas de mm, s en ms, v en mm/s)',
  '  | sucesos: c carga, p2 carga ×2, r repetición (R perfecta, f rápida, ×n carga, I/D brazo), m a medias, t arriba, s aviso',
  '  | reset y: el detector empezó de cero con la cabeza a esa altura · sigue: se quitó la pausa (con el filtro nuevo, los curls empiezan de cero)',
];

/** La caja negra de la partida (una sola). */
export const BB = new BlackBox();

export interface BBCapture {
  at: number;
  reason: string;
  ex: string;
  text: string;
}

/** Guarda la caja negra de ahora (si hay algo nuevo) con las anteriores; devuelve la lista. */
export function bbSave(reason: string, header: string, now: number, load: () => BBCapture[] | null, save: (v: BBCapture[]) => void): BBCapture[] {
  const prev = load() ?? [];
  if (!BB.fresh || !BB.n) return prev;
  BB.fresh = 0;
  const list = [...prev, { at: now, reason, ex: BB.ex, text: BB.text(reason, header) }].slice(-BB_KEEP);
  save(list);
  return list;
}

// ---------------------------------------------------------------- leerla (para reproducirla en las pruebas)

export interface BBHand {
  flags: number;
  ok: boolean;
  isHand: boolean;
  x: number;
  y: number;
  z: number;
  k: [number, number, number] | null;
}
export interface BBFrame {
  t: number;
  dt: number;
  play: boolean;
  head: { x: number; y: number; z: number; speed: number };
  hands: Record<Side, BBHand>;
  /** El estado del detector y sus valores, tal como se grabaron (en metros, segundos y m/s). */
  st: string;
  det: number[];
  events: string[];
  reset: number | null;
  /** Se quitó la pausa justo antes (con «Manos: filtro nuevo», el curl con barra empezó de cero). */
  resume: boolean;
}
export interface BBParsed {
  reason: string;
  ex: string;
  cfgs: { t: number; cfg: StandCfg }[];
  frames: BBFrame[];
}

const num = (s: string): number => (s === '_' ? NaN : Number(s));

/** Lee el texto de una captura (el de `BlackBox.text`). */
export function bbParse(text: string): BBParsed {
  const lines = text.split(/\r?\n/), res: BBParsed = { reason: '', ex: '', cfgs: [], frames: [] };
  res.reason = (lines[0] ?? '').split('· caja negra · ')[1] ?? '';
  let u = '';
  for (const line of lines) {
    if (line.startsWith('ejercicio: ')) {
      res.ex = line.slice(11).trim();
      u = DET[detKind(res.ex)].units;
    } else if (line.startsWith('ajustes ')) {
      const sp = line.indexOf(' ', 8);
      res.cfgs.push({ t: Number(line.slice(8, sp)) / 1e6, cfg: JSON.parse(line.slice(sp + 1)) as StandCfg });
    } else if (line.startsWith('F ')) {
      const g = line.split(' | '), a = g[0].split(' '), h = g[1].split(' ').map(Number), dv = g[4].split(' ');
      const hand = (s: string): BBHand => {
        const p = s.split(' '), flags = parseInt(p[1], 16), ok = !!(flags & HB.ok);
        return { flags, ok, isHand: !!(flags & HB.hand), x: ok ? num(p[2]) / 1e4 : 0, y: ok ? num(p[3]) / 1e4 : 0, z: ok ? num(p[4]) / 1e4 : 0, k: flags & HB.knuckle ? [num(p[5]) / 1e4, num(p[6]) / 1e4, num(p[7]) / 1e4] : null };
      };
      const det = dv.slice(1).map((v, k) => {
        const x = num(v), un = u[k];
        return un === 'm' ? x / 1e4 : un === 's' || un === 'v' ? x / 1000 : x;
      });
      res.frames.push({
        t: Number(a[1]) / 1e6,
        dt: Number(a[2]) / 1e6,
        play: a[3] === 'j',
        head: { x: h[0] / 1e4, y: h[1] / 1e4, z: h[2] / 1e4, speed: h[3] / 1000 },
        hands: { left: hand(g[2]), right: hand(g[3]) },
        st: dv[0],
        det,
        events: g[5] === '-' ? [] : g[5].split(','),
        reset: g.find((x) => x.startsWith('reset ')) ? num(g.find((x) => x.startsWith('reset '))!.slice(6)) / 1e4 : null,
        resume: g.includes('sigue'),
      });
    }
  }
  return res;
}
