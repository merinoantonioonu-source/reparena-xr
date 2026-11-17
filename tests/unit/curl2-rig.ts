// El arnés de las pruebas del curl con barra o kettlebell (curl2): fotograma a fotograma, las muñecas respecto a la cabeza.
import { Vector3 } from 'three';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, standDefaults, type StandEvent } from '../../src/exercise/standing.js';

export const Y0 = 1.6;
export type P = [number, number, number];
export type Ev = StandEvent & { t: number };

/** Arnés fotograma a fotograma: las muñecas se colocan respecto a la cabeza (fija en y = 1,6). */
export class Rig {
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
  /** fps: las imágenes por segundo (72 o 90 en las gafas); robust: con «Manos: filtro nuevo». */
  constructor(
    readonly fps = 72,
    robust = false,
  ) {
    this.cfg.robust = robust;
    this.det.reset(Y0);
  }
  /** Un fotograma: l / r = muñeca respecto a los ojos (null = no se ve). */
  step(l: P | null, r: P | null): void {
    for (const [s, v] of [['left', l], ['right', r]] as [Side, P | null][]) {
      const h = this.hands[s];
      h.ok = v !== null;
      if (v) h.wrist.set(v[0], Y0 + v[1], v[2]);
    }
    this.t += 1 / this.fps;
    this.out.length = 0;
    this.det.update(this.t, 1 / this.fps, this.I, this.cfg, this.out);
    this.hf.push([this.det.HF.left.ok, this.det.HF.right.ok]);
    for (const e of this.out) this.ev.push({ ...e, t: +this.t.toFixed(3) });
  }
  hold(l: P | null, r: P | null, s: number): void {
    for (let i = 0, n = Math.round(s * this.fps); i < n; i++) this.step(l, r);
  }
  /** Tramo suave (curva s) de unas posturas a otras; `rep` repite cada postura ese número de fotogramas (36 Hz = 2). */
  move(l0: P, r0: P, l1: P, r1: P, s: number, rep = 1): void {
    const n = Math.max(1, Math.round(s * this.fps));
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
export const mix = (a: P, b: P, e: number): P => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
export const up = (p: P, dy: number): P => [p[0], p[1] + dy, p[2]];

// reposo con kettlebell (manos juntas) y con barra ancha
export const KL: P = [-0.04, -0.78, -0.15], KR: P = [0.04, -0.78, -0.15];
export const BL: P = [-0.25, -0.78, -0.15], BR: P = [0.25, -0.78, -0.15];
export const SUBE = 0.34; // más que curlRange (27 cm) para llegar arriba

