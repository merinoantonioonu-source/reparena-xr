/** El parapente del remo invertido: cada remo, un impulso que se pierde; irte a un lado vira; aguantar arriba frena. */
import { describe, expect, it } from 'vitest';
import { gazeDeg, tiltOfGaze, PARA, ParaPilot, THERMAL, Thermals, type ParaIn } from '../../src/modes/bars/para.js';
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
    expect(P.climb).toBeGreaterThan(0.15);
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
    expect(sum / n).toBeGreaterThan(0.08);
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

  it('con los brazos estirados un rato bajas, cada vez más deprisa hasta el picado; un remo lo corta', () => {
    const P = new ParaPilot();
    run(P, 1.2, mk({ low: true }));
    expect(P.dive).toBe(0); // (aún no: un descanso corto entre remos no baja)
    const glide = P.climb;
    run(P, 1.5, mk({ low: true }));
    expect(P.dive).toBeGreaterThan(0);
    expect(P.dive).toBeLessThan(0.5);
    run(P, 4, mk({ low: true }));
    expect(P.dive).toBe(1);
    expect(P.climb).toBeCloseTo(-PARA.sink - PARA.diveMax, 5);
    expect(P.climb).toBeLessThan(glide - 0.3);
    expect(P.gear).toBeGreaterThan(PARA.gear0 * 1.4); // (el picado gana marcha)
    // un remo lo corta
    P.step(DT, mk({ low: true, rep: true }));
    expect(P.dive).toBe(0);
    expect(P.climb).toBeGreaterThan(0);
    // sin los brazos estirados (aguantando a media altura) no se baja
    const Q = new ParaPilot();
    run(Q, 8, mk({ low: false }));
    expect(Q.dive).toBe(0);
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

  it('con los brazos estirados bajas de verdad: desde 260 m, a ras de ciudad en menos de medio minuto', () => {
    const F = new MapFlight(CITIES[0]), P = new ParaPilot(), ctl = { climb: 0, gear: 1 };
    const I: MapIn = { live: true, steer: 0, head: 0, ref: 0, lean: 0, kick: false, ctl };
    F.setGround(CITIES[0].h);
    let t = 0;
    for (; t < 60 && F.agl > 40; t += DT) {
      P.step(DT, mk({ low: true }));
      ctl.climb = P.climb;
      ctl.gear = P.gear;
      F.step(DT, I);
    }
    expect(t).toBeLessThan(30);
    expect(F.vs).toBeLessThan(-12);
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

describe('el parapente: la inclinación del mapa y tu mirada', () => {
  it('la mirada se mide respecto al suelo, hacia los pies: 30° mirando algo hacia arriba, 0 hacia el suelo y 90 al techo o más atrás', () => {
    const d = (deg: number): [number, number] => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
    expect(gazeDeg(...d(30))).toBeCloseTo(30, 5);
    expect(gazeDeg(...d(0))).toBeCloseTo(0, 5);
    expect(gazeDeg(...d(75))).toBeCloseTo(75, 5);
    expect(gazeDeg(...d(-20))).toBe(0);
    expect(gazeDeg(...d(90))).toBeCloseTo(90, 5);
    expect(gazeDeg(...d(120))).toBe(90);
  });
  it('«Ajustar a mi mirada» pone los grados de 5 en 5, entre 0 y 90', () => {
    expect(tiltOfGaze(31.8)).toBe(30);
    expect(tiltOfGaze(33)).toBe(35);
    expect(tiltOfGaze(-4)).toBe(0);
    expect(tiltOfGaze(97)).toBe(90);
  });
});
