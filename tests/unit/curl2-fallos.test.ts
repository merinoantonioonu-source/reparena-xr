// Fallos actuales del detector del «Curl con barra o kettlebell» (curl2, `barStep` en src/exercise/standing.ts).
// Cada prueba afirma el comportamiento DEFECTUOSO de hoy (D1…D6); cuando la fase 2 (camino `robust`, tras un ajuste) lo
// arregle, esa prueba cambiará de signo. Las dos de referencia («curl limpio») deben valer siempre.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, standDefaults, type StandEvent } from '../../src/exercise/standing.js';

const DT = 1 / 72, Y0 = 1.6;
type P = [number, number, number];
type Ev = StandEvent & { t: number };

/** Arnés fotograma a fotograma: las muñecas se colocan respecto a la cabeza (fija en y = 1,6). */
class Rig {
  readonly det = new StandingDetector();
  readonly hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  readonly head = { p: new Vector3(0, Y0, 0), speed: 0 };
  readonly cfg = standDefaults('curl2');
  readonly ev: Ev[] = [];
  t = 0;
  /** Por fotograma: si HF da por buena cada mano. */
  readonly hf: [boolean, boolean][] = [];
  private out: StandEvent[] = [];
  private I = { hands: this.hands, head: this.head, fwd: new Vector3(0, 0, -1), play: true };
  constructor() {
    this.det.reset(Y0);
  }
  /** Un fotograma: l / r = muñeca respecto a los ojos (null = no se ve). */
  step(l: P | null, r: P | null): void {
    for (const [s, v] of [['left', l], ['right', r]] as [Side, P | null][]) {
      const h = this.hands[s];
      h.ok = v !== null;
      if (v) h.wrist.set(v[0], Y0 + v[1], v[2]);
    }
    this.t += DT;
    this.out.length = 0;
    this.det.update(this.t, DT, this.I, this.cfg, this.out);
    this.hf.push([this.det.HF.left.ok, this.det.HF.right.ok]);
    for (const e of this.out) this.ev.push({ ...e, t: +this.t.toFixed(3) });
  }
  hold(l: P | null, r: P | null, s: number): void {
    for (let i = 0, n = Math.round(s * 72); i < n; i++) this.step(l, r);
  }
  /** Tramo suave (curva s) de unas posturas a otras; `rep` repite cada postura ese número de fotogramas (36 Hz = 2). */
  move(l0: P, r0: P, l1: P, r1: P, s: number, rep = 1): void {
    const n = Math.max(1, Math.round(s * 72));
    let l = l0, r = r0;
    for (let i = 1; i <= n; i++) {
      if ((i - 1) % rep === 0) {
        const k = i / n, e = k * k * (3 - 2 * k);
        l = mix(l0, l1, e);
        r = mix(r0, r1, e);
      }
      this.step(l, r);
    }
  }
  get types(): string[] {
    return this.ev.map((e) => e.type);
  }
  at(type: string): number | undefined {
    return this.ev.find((e) => e.type === type)?.t;
  }
  count(type: string): number {
    return this.ev.filter((e) => e.type === type).length;
  }
}
const mix = (a: P, b: P, e: number): P => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
const up = (p: P, dy: number): P => [p[0], p[1] + dy, p[2]];

// reposo con kettlebell (manos juntas) y con barra ancha
const KL: P = [-0.04, -0.78, -0.15], KR: P = [0.04, -0.78, -0.15];
const BL: P = [-0.25, -0.78, -0.15], BR: P = [0.25, -0.78, -0.15];
const SUBE = 0.34; // más que curlRange (27 cm) para llegar arriba

describe('curl2 · referencia (siempre debe valer)', () => {
  it('curl limpio con kettlebell (manos juntas): charge, top, rep', () => {
    const g = new Rig();
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, SUBE), up(KR, SUBE), 0.8);
    g.hold(up(KL, SUBE), up(KR, SUBE), 0.2);
    g.move(up(KL, SUBE), up(KR, SUBE), KL, KR, 0.8);
    g.hold(KL, KR, 0.3);
    expect(g.types).toEqual(['charge', 'top', 'rep']);
  });
  it('curl limpio con barra ancha (manos separadas): charge, top, rep', () => {
    const g = new Rig();
    g.hold(BL, BR, 0.5);
    g.move(BL, BR, up(BL, SUBE), up(BR, SUBE), 0.8);
    g.hold(up(BL, SUBE), up(BR, SUBE), 0.2);
    g.move(up(BL, SUBE), up(BR, SUBE), BL, BR, 0.8);
    g.hold(BL, BR, 0.3);
    expect(g.types).toEqual(['charge', 'top', 'rep']);
  });
});


/** Curl normal (kettlebell) desde un Rig ya en reposo; devuelve el instante en que empieza la subida. */
const curlKettle = (g: Rig): number => {
  const t0 = g.t;
  g.move(KL, KR, up(KL, SUBE), up(KR, SUBE), 0.8);
  g.hold(up(KL, SUBE), up(KR, SUBE), 0.2);
  g.move(up(KL, SUBE), up(KR, SUBE), KL, KR, 0.8);
  g.hold(KL, KR, 0.3);
  return t0;
};
/** Reposo + un solo fotograma 30 cm más bajo (fallo del seguimiento) + reposo `s` segundos. */
const conDatoBajo = (g: Rig, s: number): void => {
  g.hold(KL, KR, 0.5);
  g.step(up(KL, -0.3), up(KR, -0.3));
  g.hold(KL, KR, s);
};

describe('curl2 · fallos de hoy (cada prueba afirma el defecto; en la fase 2 cambiará de signo)', () => {
  it('D1 · un solo fotograma bajo hunde `bottom` unos 15 cm y tarda más de 10 s en recuperarse; pasa a «rising» quieto', () => {
    const g = new Rig();
    g.hold(KL, KR, 0.5);
    expect(g.det.bar.bottom).toBeCloseTo(-0.78, 2);
    g.step(up(KL, -0.3), up(KR, -0.3));
    expect(g.det.bar.bottom).toBeCloseTo(-0.93, 2); // medido: -0,93 (reposo -0,78)
    g.step(KL, KR);
    expect(g.det.bar.state).toBe('rising'); // quieto en reposo y ya «subiendo»
    g.hold(KL, KR, 10);
    expect(g.det.bar.bottom).toBeLessThan(-0.83); // medido: -0,843 a los 10 s (aún 6 cm por debajo del reposo)
    expect(g.ev).toEqual([]);
  });

  it('D1 · tras el dato bajo, perder las dos manos 0,4 s estando quieto dispara charge + rep fantasma (regla «perdidas subiendo»)', () => {
    const g = new Rig();
    conDatoBajo(g, 0.5);
    g.hold(null, null, 0.4);
    g.hold(KL, KR, 0.5);
    expect(g.types).toEqual(['charge', 'rep']); // medido: ambos en t = 1,264 s
    expect(g.at('charge')).toBe(g.at('rep'));
    // (sin el dato bajo, el mismo hueco no cuenta nada)
    const h = new Rig();
    h.hold(KL, KR, 1);
    h.hold(null, null, 0.4);
    h.hold(KL, KR, 0.5);
    expect(h.types).toEqual([]);
  });

  it('D1 · con `bottom` hundido un curl normal carga antes de tiempo (0,24 s antes) y dispara más tarde (0,2 s)', () => {
    const limpio = new Rig();
    limpio.hold(KL, KR, 0.5);
    const a0 = curlKettle(limpio);
    const hundido = new Rig();
    conDatoBajo(hundido, 0.5);
    const b0 = curlKettle(hundido);
    const cargaL = limpio.at('charge')! - a0, cargaH = hundido.at('charge')! - b0;
    const repL = limpio.at('rep')! - a0, repH = hundido.at('rep')! - b0;
    expect(limpio.types).toEqual(['charge', 'top', 'rep']);
    expect(hundido.types).toEqual(['charge', 'top', 'rep']);
    expect(cargaH).toBeLessThan(cargaL - 0.2); // medido: 0,35 s frente a 0,58 s desde que empieza la subida
    expect(repH).toBeGreaterThan(repL + 0.15); // medido: 1,51 s frente a 1,32 s
  });

  it('D2 · desde reposo limpio: subir 15 cm, perder las dos manos 0,5 s y reaparecer abajo (sin curl) da charge + rep', () => {
    const g = new Rig();
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.15), up(KR, 0.15), 0.4);
    g.hold(null, null, 0.5);
    g.hold(KL, KR, 0.3);
    expect(g.types).toEqual(['charge', 'rep']); // a los 0,25 s de perderlas; nunca se llegó al hombro
    expect(g.at('rep')! - g.at('charge')!).toBe(0);
  });

  it('D3 · clasp sin HF: dos manos juntas que aparecen 3 fotogramas 30 cm más arriba dan charge + top + rep', () => {
    const g = new Rig();
    g.hold(KL, KR, 0.5);
    g.hold(up(KL, 0.3), up(KR, 0.3), 3 / 72);
    g.hold(KL, KR, 0.5);
    expect(g.types).toEqual(['charge', 'top', 'rep']); // medido: charge/top a 0,528 s, rep a 0,556 s
    expect(g.at('rep')! - g.at('charge')!).toBeLessThan(0.05);
  });

  it('D4 · barra ancha: una mano mal colocada 30 cm arriba (0,5 s) manda sobre la quieta y da charge + rep fantasma', () => {
    const g = new Rig();
    g.hold(BL, BR, 0.5);
    g.hold(up(BL, 0.3), BR, 0.5); // la izquierda salta y se queda; la derecha, en reposo
    expect(g.at('charge')).toBeDefined(); // medido: a 0,556 s (3 fotogramas del salto)
    g.hold(BL, BR, 0.3);
    expect(g.types).toEqual(['charge', 'top', 'rep']); // el rep sale al «bajar» la mano buena (1,01 s)
    expect(g.det.bar.hv.left).toBeGreaterThan(g.det.bar.hv.right);
  });

  it('D4 · `hv` no decae mientras la mano está perdida (h.ok = false)', () => {
    const g = new Rig();
    g.hold(BL, BR, 0.5);
    g.step(up(BL, 0.3), BR); // un salto de un fotograma
    const v = g.det.bar.hv.left;
    expect(v).toBeGreaterThan(1); // medido: 1,8
    g.hold(null, BR, 20 / 72);
    expect(g.det.bar.hv.left).toBe(v); // se queda congelado
    g.hold(null, BR, 2); // y también mucho rato
    expect(g.det.bar.hv.left).toBe(v);
  });

  it('D4 · empate de `hv` con las manos separadas más de 15 cm en altura: gana siempre la izquierda', () => {
    // las dos quietas: hv = 0 en las dos; derecha 20 cm arriba -> vale la izquierda (abajo): no pasa nada
    const a = new Rig();
    a.hold(BL, up(BR, 0.2), 1);
    expect(a.det.bar.hv).toEqual({ left: 0, right: 0 });
    expect(a.det.bar.state).toBe('down');
    // espejo: izquierda 20 cm arriba -> vale la izquierda (arriba): sube sola
    const b = new Rig();
    b.hold(up(BL, 0.2), BR, 1);
    expect(b.det.bar.state).toBe('rising');
  });

  it('D5 · con la derecha congelada a medio camino (clasp), la media se queda a la mitad: sale `partial`, no `rep`', () => {
    // medido aparte: si la derecha se congela desde el reposo, al subir la izquierda 25 cm se rompe el clasp (>25 cm) y
    // vale la mano que se mueve (HF), así que el rep sale bien; el fallo solo aparece si el clasp se mantiene.
    const g = new Rig();
    const mid = up(KR, 0.15);
    g.hold(KL, KR, 0.5);
    for (let i = 1; i <= 58; i++) { // 0,8 s: la izquierda sube 34 cm; la derecha sube 15 cm y se congela ahí
      const k = i / 58, e = k * k * (3 - 2 * k);
      g.step(mix(KL, up(KL, SUBE), e), mix(KR, up(KR, Math.min(0.15, SUBE * e)), 1));
    }
    expect(g.hands.right.wrist.y - Y0).toBeCloseTo(mid[1], 6);
    g.hold(up(KL, SUBE), mid, 0.2);
    g.move(up(KL, SUBE), mid, KL, KR, 0.8);
    g.hold(KL, KR, 0.3);
    expect(g.types).toEqual(['partial']); // no charge, no rep
    expect(g.ev[0]).toMatchObject({ type: 'partial', msg: 'Sube hasta el hombro' });
  });

  it('D6 · posturas a 36 Hz con imagen a 72: HF rechaza las manos en plena subida y el rep entra por «reaparecen arriba»', () => {
    const curl = (rep: number): Rig => {
      const g = new Rig();
      g.hold(BL, BR, 0.5);
      g.move(BL, BR, up(BL, SUBE), up(BR, SUBE), 0.25, rep); // 0,32 m en 0,25 s
      g.hold(up(BL, SUBE), up(BR, SUBE), 0.2);
      g.move(up(BL, SUBE), up(BR, SUBE), BL, BR, 0.8, rep);
      g.hold(BL, BR, 0.3);
      return g;
    };
    const a72 = curl(1), a36 = curl(2);
    const sube = (g: Rig): [boolean, boolean][] => g.hf.slice(36, 36 + 18); // los 18 fotogramas de la subida
    expect(sube(a72).every(([l, r]) => l && r)).toBe(true); // a 72 Hz HF las da por buenas todo el rato
    expect(sube(a36).some(([l, r]) => !l && !r)).toBe(true); // a 36 Hz, en mitad de la subida no vale ninguna
    expect(a72.types).toEqual(['charge', 'top', 'rep']);
    expect(a36.types).toEqual(['charge', 'top', 'rep']);
    // a 72 Hz el rep se mide en la subida (fast: true); a 36 Hz entra por «reaparecen arriba», que nunca da fast ni perfect
    expect(a72.ev.find((e) => e.type === 'rep')).toMatchObject({ fast: true, perfect: false });
    expect(a36.ev.find((e) => e.type === 'rep')).toMatchObject({ fast: false, perfect: false });
    expect(a36.at('charge')!).toBeGreaterThan(a72.at('charge')!); // medido: 0,708 s frente a 0,681 s
  });
});
