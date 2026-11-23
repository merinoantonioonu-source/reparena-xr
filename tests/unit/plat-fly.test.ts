// El vuelo de la Travesía (src/modes/trek/plat/fly.ts y su juicio en el corredor): el planeador responde al cuerpo
// (escorarse, picar, aletear, frenar en pica, la tabla) y los retos del aire se pasan como se espera.
import { describe, expect, it } from 'vitest';
import { boardTilt, FLY, Glider, type FlyIn } from '../../src/modes/trek/plat/fly.js';
import { FLY_KINDS, type PieceKind } from '../../src/modes/trek/plat/types.js';
import { course, DT, piece as mk, Sim } from './plat-sim.js';

const IN = (o: Partial<FlyIn> = {}): FlyIn => ({ dx: 0, low: false, flap: false, pair: false, pike: false, tilt: 0, tiltDive: false, auto: true, sinceRep: 0, updraft: false, land: 0, ...o });
const run = (g: Glider, secs: number, I: FlyIn): void => {
  for (let t = 0; t < secs; t += DT) g.step(DT, I);
};

describe('el planeador', () => {
  it('escorarse lleva el vuelo a ese lado (más cuanto más), sin pasar del borde', () => {
    const a = new Glider(), b = new Glider();
    run(a, 0.5, IN({ dx: 0.12 }));
    run(b, 0.5, IN({ dx: 0.05 }));
    expect(a.u).toBeGreaterThan(b.u);
    expect(b.u).toBeGreaterThan(0);
    run(a, 5, IN({ dx: 0.2 }));
    expect(a.u).toBeCloseTo(FLY.uMax, 6);
    run(a, 4, IN({ dx: -0.2 }));
    expect(a.u).toBeLessThan(0);
  });
  it('abajo en la flexión, picado: baja deprisa hasta lo mínimo (nunca se cae); una explosiva sube, dos más', () => {
    const g = new Glider();
    run(g, 1, IN({ low: true }));
    expect(g.diving).toBe(true);
    expect(g.alt).toBeLessThan(FLY.alt0 - 1.5);
    run(g, 5, IN({ low: true }));
    expect(g.alt).toBeGreaterThanOrEqual(FLY.altMin - 0.3);
    const one = new Glider(), two = new Glider();
    one.step(DT, IN({ flap: true }));
    two.step(DT, IN({ flap: true, pair: true }));
    run(one, 0.6, IN());
    run(two, 0.6, IN());
    expect(one.alt).toBeGreaterThan(FLY.alt0 + 0.4);
    expect(two.alt).toBeGreaterThan(one.alt);
  });
  it('en la dura, sin aletear un rato se va perdiendo altura; en la suave, no', () => {
    const hard = new Glider(), soft = new Glider();
    run(hard, 3, IN({ auto: false, sinceRep: 5 }));
    run(soft, 3, IN({ auto: true, sinceRep: 5 }));
    expect(hard.alt).toBeLessThan(FLY.alt0 - 0.5);
    expect(soft.alt).toBeCloseTo(FLY.alt0, 6);
  });
  it('la pica frena y remonta; la corriente de aire sube sin aletear', () => {
    const g = new Glider();
    run(g, 1, IN({ pike: true }));
    expect(g.braking).toBe(true);
    expect(g.alt).toBeGreaterThan(FLY.alt0);
    const u = new Glider();
    run(u, 1, IN({ updraft: true }));
    expect(u.alt).toBeGreaterThan(FLY.alt0 + 1);
  });
  it('posarse ante el cofre baja hasta el suelo; luego despega solo hasta la altura de salida', () => {
    const g = new Glider();
    run(g, 2, IN({ land: 1 }));
    expect(g.alt).toBe(0);
    run(g, 6, IN());
    expect(g.alt).toBeGreaterThanOrEqual(FLY.alt0 - 0.2);
  });
  it('la tabla: la muñeca derecha más baja inclina a la derecha; sin ver las dos, nada', () => {
    expect(boardTilt({ ok: true, x: -0.2, y: 0.1 }, { ok: true, x: 0.2, y: 0.04 })).toBeGreaterThan(0.1);
    expect(boardTilt({ ok: true, x: -0.2, y: 0.04 }, { ok: true, x: 0.2, y: 0.1 })).toBeLessThan(-0.1);
    expect(boardTilt({ ok: false, x: 0, y: 0 }, { ok: true, x: 0.2, y: 0.1 })).toBe(0);
    const g = new Glider();
    run(g, 0.6, IN({ tilt: 0.15 }));
    expect(g.u).toBeGreaterThan(0.3);
  });
});

describe('la Travesía volando', () => {
  const TOP = 0.45;
  const fly = (): Sim => {
    const s = new Sim({ trekAuto: 1, pushDepth: 13, trekFly: 1 });
    s.env.ex = 'pushup';
    s.env.calibRef = TOP;
    s.head.y = TOP;
    s.r.calibrate(TOP, 0, 0);
    return s;
  };
  /** Hasta que la pieza llegue a `z` m (con lo que haga `each` en cada fotograma). */
  const until = (s: Sim, cond: () => boolean, each: () => void = () => {}): boolean => s.until(() => (each(), cond()), 72 * 60);

  it('el recorrido volando solo trae lo del aire (y el cofre); sin volar, nada del aire', () => {
    const s = fly();
    s.r.addTramo(0, 300);
    const ks = new Set(s.r.pieces.map((p) => p.k));
    for (const k of ks) expect([...FLY_KINDS, 'chest'] as PieceKind[]).toContain(k);
    expect(ks.size).toBeGreaterThan(3);
    const g = new Sim();
    g.r.addTramo(0, 300);
    expect(g.r.pieces.some((p) => FLY_KINDS.includes(p.k))).toBe(false);
  });

  it('al empezar despega solo y el mundo baja bajo ti (la altura de vuelo)', () => {
    const s = fly();
    s.load(course([mk(1, 'chest', 300, 0)]));
    s.until(() => false, 72 * 6);
    expect(s.r.flyAlt).toBeGreaterThan(FLY.alt0 - 0.3);
  });

  it('el aro: por dentro, premio; fuera, ni frenas ni chocas', () => {
    for (const bien of [true, false]) {
      const s = fly();
      const R = mk(1, 'ring', 40, 0, { u: bien ? 0 : 2, h: FLY.alt0 });
      s.load(course([R, mk(2, 'chest', 300, 0)]));
      expect(until(s, () => R.judged)).toBe(true);
      expect(R.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(0);
    }
  });

  it('la columna: escorándote al otro lado la esquivas; de frente, chocas', () => {
    for (const lean of [true, false]) {
      const s = fly();
      const P = mk(1, 'pillar', 40, 0, { u: 0.4, side: 1, h: 14, len: 1.2 });
      s.load(course([P, mk(2, 'chest', 300, 0)]));
      expect(until(s, () => P.judged, () => (s.head.x = lean && s.room(P) < 14 ? -0.15 : 0))).toBe(true);
      expect(P.ok, lean ? 'escorado' : 'de frente').toBe(lean);
      expect(s.of('hit')).toHaveLength(lean ? 0 : 1);
    }
  });

  it('el puente: picando pasas por debajo; arriba, chocas', () => {
    for (const dive of [true, false]) {
      const s = fly();
      const A = mk(1, 'arch', 40, 0, { h: 4.5, len: 2 });
      s.load(course([A, mk(2, 'chest', 300, 0)]));
      expect(until(s, () => A.judged, () => (s.head.y = dive && s.room(A) < 10 ? TOP - 0.1 : TOP))).toBe(true);
      expect(A.ok, dive ? 'picando' : 'arriba').toBe(dive);
    }
  });

  it('la grieta: de canto y por ella pasas; sin girarte, chocas', () => {
    for (const roll of [1.2, 0]) {
      const s = fly();
      const C = mk(1, 'crack', 40, 0, { u: 0, len: 1.5 });
      s.load(course([C, mk(2, 'chest', 300, 0)]));
      s.head.roll = roll;
      expect(until(s, () => C.judged)).toBe(true);
      expect(C.ok).toBe(roll > 0);
    }
  });

  it('las frutas en fila: pasando por ellas se cogen', () => {
    const s = fly();
    const B = mk(1, 'berries', 40, 0, { u: 0, h: FLY.alt0, n: 4, len: 3 });
    s.load(course([B, mk(2, 'chest', 300, 0)]));
    expect(until(s, () => B.judged)).toBe(true);
    expect(B.got).toBe(4);
  });

  it('ante el cofre te posas en él (la altura llega a 0)', () => {
    const s = fly();
    const c = mk(1, 'chest', 60, 0);
    s.load(course([c]));
    expect(until(s, () => s.r.atChest(0))).toBe(true);
    s.until(() => false, 72 * 2);
    expect(s.r.flyAlt).toBeLessThan(0.05);
  });
});
