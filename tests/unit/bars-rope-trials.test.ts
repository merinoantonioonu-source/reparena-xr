// Los retos y los premios de la cuerda del remo invertido (PR 2): piden otro movimiento que el remo (quedarse abajo ante el
// enjambre, aguantar arriba en la ráfaga, apartar la cabeza de la piedra, un remo explosivo en el cable roto) y las frutas se
// cogen subiendo el pecho al pasar. Fallar un reto frena; perder una fruta, nada.
import { describe, expect, it } from 'vitest';
import { ROPE, RopeCourse, RopeRun } from '../../src/modes/bars/rope';
import { batSide, buildTrials, RopeTrials, TRIAL, trialZone, ZONE_TRIALS, type ShotKind, type Trial, type TrialEnv, type TrialKind } from '../../src/modes/bars/rope-trials';

const DT = 1 / 72;
/** Los premios: la fruta y la gema (no frenan). */
const prize = (T: Trial): boolean => T.kind === 'fruit' || T.kind === 'reach';
const C = new RopeCourse([10, 12, 14, 16, 18].map((r) => r * ROPE.perRep), 11);
const env = (o: Partial<TrialEnv> = {}): TrialEnv => ({ s: 0, up: 0, req: 0.3, top: false, side: 0, fast: false, free: [false, false], rep: false, descent: 0, wrist: [null, null], playing: true, ...o });
const one = (kind: TrialKind, s = 10, o: Partial<Trial> = {}): RopeTrials => new RopeTrials([{ kind, s, id: 0, wave: 0, st: 'wait', t: 0, good: 0, ok: null, side: 1, n: 3, k: 0, shot: 'face', ...o } as Trial]);

/** Lleva el reto hasta que se juzga, con la cabeza como diga `pose(t)`; devuelve si salió bien. */
function run(T: RopeTrials, pose: (t: number) => Partial<TrialEnv>, s0 = 8, v = 0.6): boolean | null {
  let s = s0;
  for (let t = 0; t < 12; t += DT) {
    s += v * DT;
    T.step(DT, env({ s, ...pose(t) }));
    T.tick(DT);
  }
  return T.list[0].ok;
}

describe('dónde salen', () => {
  const L = buildTrials(C);
  it('a lo largo de cada tramo (nunca encima de su cofre), separados, un premio y dos retos por turnos', () => {
    expect(L.length).toBeGreaterThan(10);
    for (let i = 0; i < L.length; i++) {
      const T = L[i], w = C.wave(T.s);
      expect(T.wave).toBe(w);
      expect(T.s).toBeLessThan(C.ends[w] - 2);
      if (i && L[i - 1].wave === T.wave) {
        expect(T.s - L[i - 1].s).toBeGreaterThanOrEqual(TRIAL.gap[0] - 1e-6);
        if (prize(T)) expect(prize(L[i - 1])).toBe(false); // (nunca dos premios seguidos en un tramo)
      }
    }
  });
  it('cada zona, sus retos (la subida va a más), y en la ronda salen todos', () => {
    for (const T of L) if (!prize(T)) expect(ZONE_TRIALS[trialZone(C, T.s)]).toContain(T.kind);
    expect(new Set(L.map((T) => T.kind)).size).toBeGreaterThan(6);
    // (en una ronda larga salen todos)
    const LL = buildTrials(new RopeCourse(Array(10).fill(15 * ROPE.perRep), 3));
    for (const k of ['swarm', 'gust', 'rock', 'frayed', 'bats', 'crab', 'shooter', 'bee', 'onehand', 'reach', 'midhold', 'slow', 'fruit'] as TrialKind[]) expect(LL.some((T) => T.kind === k), k).toBe(true);
    // (en una ronda corta, también: las zonas son de la ronda)
    const SC = new RopeCourse([30 * ROPE.perRep], 5), S = buildTrials(SC);
    expect(new Set(S.filter((T) => !prize(T)).map((T) => trialZone(SC, T.s))).size).toBeGreaterThan(2);
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
  it('los murciélagos: en cada pasada, la cabeza al lado contrario del suyo; si una no, te dan', () => {
    // (la cabeza va al otro lado de la pasada que toca en cada momento)
    const T = one('bats', 10, { n: 3, side: 1 }), tr = T.list[0];
    expect(run(T, () => ({ side: -batSide(tr, Math.min(tr.n - 1, tr.k)) * 0.12 }))).toBe(true);
    expect(run(one('bats', 10, { n: 3, side: 1 }), () => ({ side: -0.12 }))).toBe(false); // (siempre al mismo lado: la segunda, no)
    expect(run(one('bats', 10, { n: 2, side: -1 }), () => ({ side: 0 }))).toBe(false);
  });
  it('el cangrejo: soltando la mano de su lado cuando llega, se va; si no, pellizca', () => {
    const at = (T: RopeTrials, t0: number) => (t: number) => ({ free: [false, T.list[0].st !== 'wait' && t - t0 > 0] as [boolean, boolean] });
    const A = one('crab', 10, { side: 1 });
    let t0 = -1;
    expect(
      run(A, (t) => {
        if (t0 < 0 && A.list[0].st !== 'wait') t0 = t + TRIAL.come.crab - 0.1;
        return at(A, t0)(t);
      }),
    ).toBe(true);
    expect(run(one('crab', 10, { side: 1 }), () => ({ free: [true, false] }))).toBe(false); // (la otra mano, no)
    expect(run(one('crab', 10, { side: -1 }), () => ({}))).toBe(false);
  });
  it('el tirador: a la cara, aparta la cabeza; rasante, quédate abajo; baja, sube del todo', () => {
    const shot = (s: ShotKind) => one('shooter', 10, { shot: s });
    expect(run(shot('face'), () => ({ side: 0.1 }))).toBe(true);
    expect(run(shot('face'), () => ({}))).toBe(false);
    expect(run(shot('high'), () => ({ up: 0.02 }))).toBe(true);
    expect(run(shot('high'), () => ({ up: 0.3, top: true }))).toBe(false);
    expect(run(shot('low'), () => ({ up: 0.3, top: true }))).toBe(true);
    expect(run(shot('low'), () => ({ up: 0 }))).toBe(false);
  });
  it('la abeja: un remo explosivo cuando se te planta delante la aparta; si no, pica', () => {
    const T = one('bee');
    let t0 = -1;
    expect(
      run(T, (t) => {
        if (t0 < 0 && T.list[0].st !== 'wait') t0 = t;
        return { fast: t0 >= 0 && Math.abs(t - t0 - TRIAL.come.bee - 0.8) < DT };
      }),
    ).toBe(true);
    expect(run(one('bee'), () => ({}))).toBe(false);
  });
  it('el remo a una mano: soltando la que arde y remando con la otra, superado; si la agarras, te quemas', () => {
    // (un remo cada 2 s con la mano derecha suelta)
    expect(run(one('onehand', 10, { side: 1, n: 3 }), (t) => ({ free: [false, true], rep: Math.abs((t % 2) - 1) < DT / 2 }), 8, 0)).toBe(true);
    expect(run(one('onehand', 10, { side: 1, n: 3 }), (t) => ({ free: [true, false], rep: Math.abs((t % 2) - 1) < DT / 2 }), 8, 0)).toBe(false);
    // (mientras dura, no empieza el siguiente)
    const T = new RopeTrials([
      { kind: 'onehand', s: 10, id: 0, wave: 0, st: 'wait', t: 0, good: 0, ok: null, side: -1, n: 3, k: 0, shot: 'face' },
      { kind: 'swarm', s: 11, id: 1, wave: 0, st: 'wait', t: 0, good: 0, ok: null, side: 1, n: 2, k: 0, shot: 'face' },
    ] as Trial[]);
    for (let t = 0; t < 3; t += DT) T.step(DT, env({ s: 12, free: [true, false] }));
    expect(T.list[1].st).toBe('wait');
  });
  it('coger con una mano: la mano de su lado llega a la gema al pasar; si no, se pierde sin fallo', () => {
    const at = (x: number) => ({ wrist: [null, { x, y: 0, z: 0 }] as [null, { x: number; y: number; z: number }] });
    expect(run(one('reach', 10, { side: 1 }), () => at(TRIAL.reachU))).toBe(true);
    expect(run(one('reach', 10, { side: 1 }), () => at(0.25))).toBe(false);
    const U = one('reach', 10, { side: -1 }), ev: string[] = [];
    let s = 8;
    for (let t = 0; t < 8; t += DT) {
      s += 0.6 * DT;
      U.step(DT, env({ s }));
      for (const e of U.ev) ev.push(e.t);
      U.ev.length = 0;
    }
    expect(ev).not.toContain('fail');
  });
  it('aguantar a media altura: con la cabeza entre la mitad baja y la alta, bien; arriba o abajo, no', () => {
    expect(run(one('midhold'), () => ({ up: 0.16 }))).toBe(true);
    expect(run(one('midhold'), () => ({ up: 0.3, top: true }))).toBe(false);
    expect(run(one('midhold'), () => ({ up: 0.02 }))).toBe(false);
  });
  it('los remos lentos: bajando despacio los que pide, bien; una bajada de golpe sacude el cable', () => {
    expect(run(one('slow', 10, { n: 3 }), (t) => ({ descent: Math.abs((t % 2) - 1.5) < DT / 2 ? 2.8 : 0 }), 8, 0)).toBe(true);
    expect(run(one('slow', 10, { n: 3 }), (t) => ({ descent: Math.abs((t % 2) - 1.5) < DT / 2 ? 0.9 : 0 }), 8, 0)).toBe(false);
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
