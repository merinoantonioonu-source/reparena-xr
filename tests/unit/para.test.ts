/** El parapente del remo invertido: cada remo, un impulso que se pierde; irte a un lado vira; aguantar arriba frena. */
import { describe, expect, it } from 'vitest';
import { PARA, ParaPilot, THERMAL, Thermals, type ParaIn } from '../../src/modes/bars/para.js';
import { CITIES, MAP, MapFlight, type MapIn } from '../../src/modes/trek/map/map-route.js';

const DT = 1 / 72;
const mk = (o: Partial<ParaIn> = {}): ParaIn => ({ playing: true, up: 0, side: 0, rep: false, fast: false, perfect: false, ...o });
const run = (P: ParaPilot, secs: number, I: ParaIn): void => {
  for (let t = 0; t < secs; t += DT) P.step(DT, I);
};

describe('el parapente: lo que manda el cuerpo', () => {
  it('con los brazos estirados planeas perdiendo altura despacio, a la marcha de planeo', () => {
    const P = new ParaPilot();
    run(P, 5, mk());
    expect(P.climb).toBeCloseTo(-PARA.sink, 5);
    expect(P.gear).toBeCloseTo(PARA.gear0, 5);
    expect(P.steer).toBe(0);
  });

  it('un remo es un impulso: subes y coges marcha, y se va perdiendo', () => {
    const P = new ParaPilot();
    P.step(DT, mk({ rep: true }));
    expect(P.kicked).toBe(true);
    expect(P.reps).toBe(1);
    expect(P.climb).toBeGreaterThan(0.3);
    expect(P.gear).toBeGreaterThan(PARA.gear0 + 0.5);
    const c0 = P.climb, g0 = P.gear;
    run(P, 3, mk());
    expect(P.kicked).toBe(false);
    expect(P.climb).toBeLessThan(c0 * 0.5);
    expect(P.gear).toBeLessThan(g0);
    // pasado un rato, otra vez planeando hacia abajo y a la marcha de planeo
    run(P, 20, mk());
    expect(P.climb).toBeLessThan(0);
    expect(P.gear).toBeCloseTo(PARA.gear0, 3);
  });

  it('remando seguido subes de verdad y coges marcha, sin pasar del tope', () => {
    const P = new ParaPilot();
    let sum = 0, n = 0;
    for (let t = 0; t < 60; t += DT) {
      P.step(DT, mk({ rep: Math.floor(t / 3) !== Math.floor((t - DT) / 3) }));
      sum += P.climb;
      n++;
    }
    expect(sum / n).toBeGreaterThan(0.2);
    expect(P.gear).toBeGreaterThan(3);
    expect(P.gear).toBeLessThanOrEqual(PARA.gearMax);
    expect(P.climb).toBeLessThanOrEqual(1);
  });

  it('el remo explosivo da más', () => {
    const A = new ParaPilot(), B = new ParaPilot();
    A.step(DT, mk({ rep: true }));
    B.step(DT, mk({ rep: true, fast: true }));
    expect(B.climb).toBeGreaterThan(A.climb);
    expect(B.gear).toBeGreaterThan(A.gear);
  });

  it('irte a un lado vira hacia ese lado, en proporción; un poco no cuenta', () => {
    const P = new ParaPilot();
    run(P, 1, mk({ side: 0.02 }));
    expect(P.steer).toBe(0);
    run(P, 1, mk({ side: 0.08 }));
    const half = P.steer;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    run(P, 1, mk({ side: 0.3 }));
    expect(P.steer).toBeCloseTo(1, 2);
    run(P, 1, mk({ side: -0.3 }));
    expect(P.steer).toBeCloseTo(-1, 2);
    run(P, 1, mk());
    expect(Math.abs(P.steer)).toBeLessThan(0.01);
  });

  it('aguantar arriba frena, y al soltar vuelve la marcha que llevabas', () => {
    const P = new ParaPilot();
    for (let i = 0; i < 4; i++) P.step(DT, mk({ rep: true }));
    const g = P.gear;
    // un remo normal pasa por arriba un instante: no frena
    run(P, 0.3, mk({ up: 1 }));
    expect(P.gear).toBeGreaterThan(g * 0.9);
    run(P, 3, mk({ up: 1 }));
    expect(P.brake).toBeGreaterThan(0.95);
    expect(P.gear).toBeLessThan(g * 0.25);
    run(P, 2, mk({ up: 0 }));
    expect(P.brake).toBeLessThan(0.05);
    expect(P.gear).toBeGreaterThan(PARA.gear0);
  });

  it('en el descanso planea solo: recto, sin perder altura y sin contar remos', () => {
    const P = new ParaPilot();
    for (let i = 0; i < 5; i++) P.step(DT, mk({ rep: true, side: 0.2 }));
    run(P, 4, mk({ playing: false, rep: true, side: 0.2, up: 1 }));
    expect(P.reps).toBe(5);
    expect(P.climb).toBe(0);
    expect(Math.abs(P.steer)).toBeLessThan(0.01);
    expect(P.gear).toBeLessThan(2);
    // otra oleada: sus remos, de cero
    P.startWave();
    expect(P.reps).toBe(0);
    expect(P.total).toBe(5);
  });
});

describe('el parapente sobre el mapa (con el vuelo de la Travesía)', () => {
  const fly = (secs: number, rowEvery: number, side = 0): { F: MapFlight; P: ParaPilot } => {
    const F = new MapFlight(CITIES[0]), P = new ParaPilot(), ctl = { climb: 0, gear: 1 };
    const I: MapIn = { live: true, steer: 0, head: 0, ref: 0, lean: 0, kick: false, ctl };
    F.setGround(CITIES[0].h);
    for (let t = 0; t < secs; t += DT) {
      P.step(DT, mk({ rep: rowEvery > 0 && Math.floor(t / rowEvery) !== Math.floor((t - DT) / rowEvery), side }));
      I.steer = P.steer;
      ctl.climb = P.climb;
      ctl.gear = P.gear;
      F.step(DT, I);
    }
    return { F, P };
  };

  it('sin remar pierdes altura despacio y sigues avanzando; el suelo te sostiene', () => {
    const { F } = fly(30, 0);
    expect(F.agl).toBeLessThan(MAP.alt0 - 20);
    expect(F.agl).toBeGreaterThan(MAP.alt0 - 90);
    expect(F.flown).toBeGreaterThan(600);
    const low = fly(600, 0).F;
    expect(low.agl).toBeGreaterThanOrEqual(MAP.floor - 0.5);
  });

  it('un remo cada 3 s te hace subir; uno cada 10 s, más o menos te mantiene', () => {
    expect(fly(30, 3).F.agl).toBeGreaterThan(MAP.alt0 + 60);
    const keep = fly(60, 10).F.agl;
    expect(keep).toBeGreaterThan(MAP.alt0 - 60);
    expect(keep).toBeLessThan(MAP.alt0 + 120);
  });

  it('tirando de un lado viras hacia ese lado', () => {
    const a = fly(8, 3, 0.2).F, b = fly(8, 3, -0.2).F, c = fly(8, 3, 0).F;
    expect(a.heading).toBeLessThan(c.heading - 0.5); // (a la derecha)
    expect(b.heading).toBeGreaterThan(c.heading + 0.5);
  });
});

describe('las térmicas del parapente', () => {
  const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('salen por delante y algo a un lado, de vez en cuando, y nunca más de las que caben', () => {
    const T = new Thermals(), rnd = rng(7);
    let x = 0, z = 0, seen = 0;
    const heading = Math.PI; // (hacia el norte: +z)
    for (let t = 0; t < 120; t += DT) {
      z += 40 * DT;
      const before = T.list.filter((q) => q.on).length;
      T.step(DT, x, z, heading, 1, true, rnd);
      const now = T.list.filter((q) => q.on);
      if (now.length > before) {
        seen++;
        const N = T.list.filter((q) => q.on && q.t === 0)[0];
        // por delante (más al norte) y no muy a un lado
        expect(N.z - z).toBeGreaterThan(THERMAL.ahead[0] * 0.85);
        expect(Math.abs(N.x - x)).toBeLessThan(THERMAL.ahead[1] * Math.sin(THERMAL.side) + 1);
      }
      expect(now.length).toBeLessThanOrEqual(THERMAL.max);
    }
    expect(seen).toBeGreaterThanOrEqual(4);
  });

  it('dentro subes sin remar (y unos segundos más al salir); se dice una vez', () => {
    const T = new Thermals(), P = new ParaPilot(), never = () => 0.99; // (las que salgan, bien a un lado: no se cruzan)
    Object.assign(T.list[0], { x: 0, z: 300, on: true, t: 0, used: false });
    let entered = 0, z = 0, top = 0;
    for (let t = 0; t < 30; t += DT) {
      z += 40 * DT;
      T.step(DT, 0, z, Math.PI, 1, true, never);
      if (T.entered) entered++;
      P.step(DT, mk({ thermal: T.lift }));
      top = Math.max(top, P.climb);
      // justo al salir sigue subiendo un momento
      if (Math.abs(z - (300 + THERMAL.r + 40)) < 0.3) expect(P.climb).toBeGreaterThan(0.2);
    }
    expect(entered).toBe(1);
    expect(top).toBeGreaterThan(THERMAL.lift - PARA.sink - 0.05);
    // pasada y lejos, otra vez planeando hacia abajo
    expect(P.climb).toBeLessThan(0);
  });

  it('en el descanso ni salen ni suben', () => {
    const T = new Thermals(), rnd = rng(3);
    for (let t = 0; t < 60; t += DT) T.step(DT, 0, 0, 0, 1, false, rnd);
    expect(T.list.some((q) => q.on)).toBe(false);
    expect(T.lift).toBe(0);
  });
});
