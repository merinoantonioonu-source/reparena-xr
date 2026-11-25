// Los retos y los premios de la cuerda del remo invertido (PR 2): piden otro movimiento que el remo (quedarse abajo ante el
// enjambre, aguantar arriba en la ráfaga, apartar la cabeza de la piedra, un remo explosivo en el cable roto) y las frutas se
// cogen subiendo el pecho al pasar. Fallar un reto frena; perder una fruta, nada.
import { describe, expect, it } from 'vitest';
import { ROPE, RopeCourse, RopeRun } from '../../src/modes/bars/rope';
import { buildTrials, RopeTrials, TRIAL, type Trial, type TrialEnv, type TrialKind } from '../../src/modes/bars/rope-trials';

const DT = 1 / 72;
const C = new RopeCourse([10, 12, 14, 16, 18].map((r) => r * ROPE.perRep), 11);
const env = (o: Partial<TrialEnv> = {}): TrialEnv => ({ s: 0, up: 0, req: 0.3, top: false, side: 0, fast: false, playing: true, ...o });
const one = (kind: TrialKind, s = 10): RopeTrials => new RopeTrials([{ kind, s, id: 0, wave: 0, st: 'wait', t: 0, good: 0, ok: null } as Trial]);

/** Lleva el reto hasta que se juzga, con la cabeza como diga `pose(t)`; devuelve si salió bien. */
function run(T: RopeTrials, pose: (t: number) => Partial<TrialEnv>, s0 = 8, v = 0.6): boolean | null {
  let s = s0;
  for (let t = 0; t < 8; t += DT) {
    s += v * DT;
    T.step(DT, env({ s, ...pose(t) }));
    T.tick(DT);
  }
  return T.list[0].ok;
}

describe('dónde salen', () => {
  const L = buildTrials(C);
  it('a lo largo de cada tramo (nunca encima de su cofre), separados, premio y reto por turnos', () => {
    expect(L.length).toBeGreaterThan(10);
    for (let i = 0; i < L.length; i++) {
      const T = L[i], w = C.wave(T.s);
      expect(T.wave).toBe(w);
      expect(T.s).toBeLessThan(C.ends[w] - 2);
      if (i && L[i - 1].wave === T.wave) {
        expect(T.s - L[i - 1].s).toBeGreaterThanOrEqual(TRIAL.gap[0] - 1e-6);
        expect(T.kind === 'fruit').not.toBe(L[i - 1].kind === 'fruit');
      }
    }
  });
  it('el primer tramo, solo frutas y enjambres; el cable roto, desde el tercero', () => {
    for (const T of L) {
      if (T.wave === 0) expect(['fruit', 'swarm']).toContain(T.kind);
      if (T.kind === 'frayed') expect(T.wave).toBeGreaterThanOrEqual(2);
    }
    expect(L.some((T) => T.kind === 'gust')).toBe(true);
    expect(L.some((T) => T.kind === 'rock')).toBe(true);
  });
});

describe('cada reto, con su movimiento', () => {
  it('el enjambre: quedándote abajo, esquivado; si subes cuando llega, te pican', () => {
    expect(run(one('swarm'), () => ({ up: 0.02 }))).toBe(true);
    const come = TRIAL.come.swarm;
    let tStart = -1;
    const T = one('swarm');
    expect(
      run(T, (t) => {
        if (tStart < 0 && T.list[0].st !== 'wait') tStart = t;
        return { up: tStart >= 0 && t - tStart > come + 0.2 ? 0.3 : 0 };
      }),
    ).toBe(false);
  });
  it('la ráfaga: aguantando arriba, bien; abajo, no', () => {
    expect(run(one('gust'), () => ({ up: 0.3, top: true }))).toBe(true);
    expect(run(one('gust'), () => ({ up: 0 }))).toBe(false);
  });
  it('la piedra: apartando la cabeza a un lado, bien; quieto, te da', () => {
    expect(run(one('rock'), () => ({ side: 0.1 }))).toBe(true);
    expect(run(one('rock'), () => ({ side: -0.12 }))).toBe(true);
    expect(run(one('rock'), () => ({ side: 0.02 }))).toBe(false);
  });
  it('el cable roto: con un remo explosivo al llegar, saltado; sin él, falla', () => {
    expect(run(one('frayed'), (t) => ({ fast: Math.abs(t - 2.6) < DT }))).toBe(true);
    expect(run(one('frayed'), () => ({}))).toBe(false);
  });
  it('la fruta: subiendo el pecho al pasar, cogida; sin subir, se pierde (sin fallo)', () => {
    const T = one('fruit');
    run(T, () => ({ top: true }));
    expect(T.list[0].ok).toBe(true);
    const U = one('fruit'), ev: string[] = [];
    let s = 8;
    for (let t = 0; t < 8; t += DT) {
      s += 0.6 * DT;
      U.step(DT, env({ s }));
      for (const e of U.ev) ev.push(e.t);
      U.ev.length = 0;
    }
    expect(U.list[0].ok).toBe(false);
    expect(ev).not.toContain('fail');
  });
  it('sin jugar (colgándote, en el descanso o en la pausa), nada empieza', () => {
    const T = one('swarm');
    T.step(DT, env({ s: 20, playing: false }));
    expect(T.list[0].st).toBe('wait');
  });
});

describe('al fallar, frenas', () => {
  it('a la mitad', () => {
    const R = new RopeRun(C);
    R.startWave(0);
    R.rep(0.5, false);
    for (let k = 0; k < 2 / DT; k++) R.step(DT, true);
    const v = R.v;
    R.stumble();
    expect(R.v).toBeCloseTo(v / 2, 5);
  });
});
