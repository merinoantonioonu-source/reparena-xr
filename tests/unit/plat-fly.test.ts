// El vuelo de la Travesía (src/modes/trek/plat/fly.ts y su juicio en el corredor): el planeador responde al cuerpo
// (escorarse, picar, aletear, frenar en pica, la tabla) y los retos del aire se pasan como se espera.
import { describe, expect, it } from 'vitest';
import { boardSide, boardTilt, FLY, FlyBody, flyIn, flyModel, Glider, sideTarget, type FlyIn } from '../../src/modes/trek/plat/fly.js';
import { FLY_KINDS, type PieceKind } from '../../src/modes/trek/plat/types.js';
import { course, DT, piece as mk, Sim } from './plat-sim.js';

const IN = (o: Partial<FlyIn> = {}): FlyIn => ({ ...flyIn(), ...o });
const run = (g: Glider, secs: number, I: FlyIn | ((t: number) => FlyIn)): void => {
  for (let t = 0; t < secs; t += DT) g.step(DT, typeof I === 'function' ? I(t) : I);
};
/** Una flexión de `d` m en `dur` s (la cabeza baja y vuelve; al acabar, la repetición). */
const pushups = (g: Glider, n: number, base: Partial<FlyIn>, d = 0.11, dur = 1.3): number[] => {
  const alts: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (; t < dur; t += DT) g.step(DT, IN({ ...base, down: d * Math.sin((Math.PI * t) / dur), sinceRep: t + 0.3 }));
    g.step(DT, IN({ ...base, rep: 1, sinceRep: 0 }));
    alts.push(g.alt);
  }
  return alts;
};

describe('el lado: tanto te escoras, tanto te apartas', () => {
  it('la zona muerta no mueve; cerca del centro, suave (no hipersensible); el recorrido entero, el tope; y el ajuste lo cambia', () => {
    expect(sideTarget(0.02, FLY.sideRange)).toBe(0);
    // (a medio recorrido, menos de medio lado: suave cerca del centro)
    expect(sideTarget(FLY.sideRange / 2, FLY.sideRange)).toBeLessThan(FLY.uMax / 2);
    expect(sideTarget(FLY.sideRange / 2, FLY.sideRange)).toBeGreaterThan(0.3);
    expect(sideTarget(-0.4, FLY.sideRange)).toBeCloseTo(-FLY.uMax, 6);
    // (más recorrido en el ajuste, menos sensible)
    expect(sideTarget(0.06, 0.25)).toBeLessThan(sideTarget(0.06, 0.12));
    const g = new Glider();
    run(g, 2, IN({ side: 0.08 }));
    expect(g.u).toBeCloseTo(sideTarget(0.08, FLY.sideRange), 1);
  });
  it('escorado y quieto 10 s, el lado no cambia; al volver al centro, vuelve a 0 sin pasarse', () => {
    const g = new Glider();
    run(g, 1.5, IN({ side: 0.08 }));
    const u1 = g.u;
    run(g, 10, IN({ side: 0.08 }));
    expect(Math.abs(g.u - u1)).toBeLessThan(0.01);
    let min = Infinity;
    run(g, 3, () => (min = Math.min(min, g.u), IN({ side: 0 })));
    expect(Math.abs(g.u)).toBeLessThan(0.02);
    expect(min).toBeGreaterThan(-0.05);
  });
  it('el centro del vuelo no sigue a la cabeza: escorado y quieto, la lectura no se va a cero', () => {
    const B = new FlyBody();
    B.set(0, 0);
    B.read(0.08, 0);
    expect(B.side).toBeCloseTo(0.08, 6);
    // girado 30° en la habitación: escorarse a su derecha es su lado, no adelante
    B.set(0, 0, Math.PI / 6);
    B.read(0.08 * Math.cos(Math.PI / 6), 0.08 * Math.sin(Math.PI / 6));
    expect(B.side).toBeCloseTo(0.08, 6);
    expect(Math.abs(B.fwd)).toBeLessThan(1e-6);
  });
});

describe('la altura, posición (P)', () => {
  const P = { model: 'pos' as const };
  it('bajar el pecho baja en proporción: media flexión aguantada, media bajada', () => {
    const half = new Glider(), full = new Glider();
    run(half, 4, IN({ ...P, down: 0.02 + (0.13 - 0.02) / 2 }));
    run(full, 4, IN({ ...P, down: 0.13 }));
    expect(half.alt).toBeCloseTo(FLY.alt0 - FLY.downAlt / 2, 1);
    expect(full.alt).toBeCloseTo(FLY.alt0 - FLY.downAlt, 1);
    run(half, 4, IN(P));
    expect(half.alt).toBeCloseTo(FLY.alt0, 1);
  });
  it('la pica manda sobre el picado: con la cabeza 8 cm más baja, remonta y frena', () => {
    const g = new Glider();
    run(g, 3, IN({ ...P, back: 0.14, down: 0.08 }));
    expect(g.pike).toBe(true);
    expect(g.diving).toBe(false);
    expect(g.braking).toBe(true);
    expect(g.alt).toBeGreaterThan(FLY.alt0 + 1);
  });
  it('con tope de velocidad (por comodidad)', () => {
    const g = new Glider();
    let vmax = 0;
    run(g, 3, () => (vmax = Math.max(vmax, Math.abs(g.vAlt)), IN({ ...P, down: 0.13 })));
    expect(vmax).toBeLessThanOrEqual(FLY.altV + 1e-6);
  });
  it('en la dura, diez flexiones normales mantienen la altura entre 4 y 9 m; sin flexiones, baja despacio hasta el suelo del crucero', () => {
    const g = new Glider();
    const a = pushups(g, 10, { ...P, auto: false });
    for (const x of a.slice(2)) {
      expect(x).toBeGreaterThan(4);
      expect(x).toBeLessThan(9.01);
    }
    run(g, 30, IN({ ...P, auto: false, sinceRep: 9 }));
    expect(g.alt).toBeCloseTo(FLY.cruiseMin, 1);
  });
});

describe('la sensibilidad, en los ajustes del desarrollador', () => {
  it('más recorrido para bajar o para subir, menos sensible; más fuerza del aletazo, sube más', () => {
    const P = { model: 'pos' as const };
    const corto = new Glider(), largo = new Glider();
    run(corto, 4, IN({ ...P, down: 0.08, depth: 0.1 }));
    run(largo, 4, IN({ ...P, down: 0.08, depth: 0.3 }));
    expect(largo.alt).toBeGreaterThan(corto.alt + 1);
    const a = new Glider(), b = new Glider();
    run(a, 3, IN({ ...P, back: 0.12, backTo: 0.14 }));
    run(b, 3, IN({ ...P, back: 0.12, backTo: 0.4 }));
    expect(a.alt).toBeGreaterThan(b.alt + 1);
    const up = (k: number): number => {
      const g = new Glider();
      g.step(DT, IN({ model: 'flap', auto: false, rep: 1, flapK: k }));
      run(g, 1.5, IN({ model: 'flap', auto: false }));
      return g.alt;
    };
    expect(up(2)).toBeGreaterThan(up(1) + 0.5);
  });
});

describe('la altura, media flexión (de serie, elegido por el usuario)', () => {
  const M = { model: 'mid' as const, depth: 0.13 };
  it('aguantando a media flexión, recto; con los brazos estirados, subes; más abajo, bajas (más deprisa cuanto más lejos)', () => {
    const mid = new Glider(), top = new Glider(), low = new Glider(), deep = new Glider();
    run(mid, 3, IN({ ...M, down: 0.065 }));
    run(top, 1.5, IN({ ...M, down: 0 }));
    run(low, 1, IN({ ...M, down: 0.1 }));
    run(deep, 1, IN({ ...M, down: 0.13 }));
    expect(mid.alt).toBeCloseTo(FLY.alt0, 6);
    expect(top.alt).toBeGreaterThan(FLY.alt0 + 1.5);
    expect(low.alt).toBeLessThan(FLY.alt0 - 0.5);
    expect(deep.alt).toBeLessThan(low.alt - 0.5);
    expect(deep.diving).toBe(true);
  });
  it('cerca de la mitad, nada (su zona muerta); la reglilla dice adónde vas', () => {
    const g = new Glider();
    run(g, 2, IN({ ...M, down: 0.065 + 0.005 }));
    expect(g.alt).toBeCloseTo(FLY.alt0, 6);
    const t = new Glider();
    run(t, 0.5, IN({ ...M, down: 0 }));
    expect(t.tgtAlt).toBeGreaterThan(t.alt);
  });
  it('la pica frena y no sube ni baja; «Vuelo: velocidad al subir y bajar» la cambia', () => {
    const p = new Glider();
    run(p, 2, IN({ ...M, down: 0.13, back: 0.14 }));
    expect(p.braking).toBe(true);
    expect(p.alt).toBeCloseTo(FLY.alt0, 6);
    const a = new Glider(), b = new Glider();
    run(a, 1, IN({ ...M, down: 0, rateK: 1 }));
    run(b, 1, IN({ ...M, down: 0, rateK: 2 }));
    expect(b.alt - FLY.alt0).toBeGreaterThan(1.5 * (a.alt - FLY.alt0));
  });
});

describe('la Travesía volando con media flexión', () => {
  it('despega solo; a media flexión, recto; y el aro se pasa bajando un poco más hasta su altura', () => {
    const TOP = 0.45, HALF = 0.065, s = new Sim({ trekAuto: 1, pushDepth: 13, trekFly: 1 });
    s.env.ex = 'pushup';
    s.env.mem.set('reparenaxr-flytuto', 1);
    s.env.calibRef = TOP;
    s.head.y = TOP - HALF;
    s.r.calibrate(TOP, 0, 0);
    const R = mk(1, 'ring', 60, 0, { u: 0, h: 4.5 });
    s.load(course([R, mk(2, 'chest', 300, 0)]));
    expect(s.until(() => s.r.flyAlt >= FLY.alt0 - 0.01, 72 * 8)).toBe(true);
    s.until(() => false, 72 * 2);
    expect(s.r.flyAlt).toBeCloseTo(FLY.alt0, 1); // (a media flexión, recto)
    // como un jugador: cerca del aro, más abajo hasta su altura; luego, otra vez a la mitad
    const each = (): void => {
      const want = R.at - s.r.dist < 25 ? R.h : FLY.alt0, err = s.r.flyAlt - want;
      s.head.y = TOP - HALF - Math.max(-0.06, Math.min(0.06, err * 0.04));
    };
    expect(s.until(() => (each(), R.judged), 72 * 60)).toBe(true);
    expect(R.ok).toBe(true);
  });
});

describe('la altura, aleteo (A)', () => {
  const A = { model: 'flap' as const };
  it('una flexión normal no pica: sube un aletazo', () => {
    const g = new Glider();
    let dove = false;
    let t = 0;
    for (; t < 1.3; t += DT) {
      g.step(DT, IN({ ...A, down: 0.11 * Math.sin((Math.PI * t) / 1.3) }));
      dove ||= g.diving;
    }
    expect(dove).toBe(false);
    const before = g.alt;
    g.step(DT, IN({ ...A, auto: false, rep: 1 }));
    run(g, 1.5, IN({ ...A, auto: false }));
    expect(g.alt - before).toBeGreaterThan(1);
  });
  it('aguantar abajo sí pica, en proporción a lo hondo', () => {
    const lo = new Glider(), hi = new Glider();
    run(lo, 1.2, IN({ ...A, down: 0.08 }));
    run(hi, 1.2, IN({ ...A, down: 0.13 }));
    expect(lo.diving).toBe(true);
    expect(hi.alt).toBeLessThan(lo.alt - 0.5);
  });
  it('la perfecta sube más que la normal; la explosiva, más; dos seguidas, más aún', () => {
    const up = (o: Partial<FlyIn>): number => {
      const g = new Glider();
      g.step(DT, IN({ ...A, ...o }));
      run(g, 2, IN(A));
      return g.alt;
    };
    const n = up({ rep: 1 }), p = up({ rep: 2 }), x = up({ flap: true }), xx = up({ flap: true, pair: true });
    expect(p).toBeGreaterThan(n);
    expect(x).toBeGreaterThan(p);
    expect(xx).toBeGreaterThan(x);
  });
  it('en la dura, diez flexiones normales mantienen la altura entre 4 y 9 m; sin aletear, se pierde', () => {
    const g = new Glider();
    const a = pushups(g, 10, { ...A, auto: false });
    for (const x of a) {
      expect(x).toBeGreaterThan(4);
      expect(x).toBeLessThan(9.01);
    }
    const hard = new Glider(), soft = new Glider();
    run(hard, 3, IN({ ...A, auto: false, sinceRep: 5 }));
    run(soft, 3, IN({ ...A, auto: true }));
    expect(hard.alt).toBeLessThan(FLY.alt0 - 0.5);
    expect(soft.alt).toBeCloseTo(FLY.alt0, 6);
  });
  it('la pica remonta y frena; la corriente de aire sube sin aletear', () => {
    const g = new Glider();
    run(g, 1, IN({ ...A, back: 0.15 }));
    expect(g.braking).toBe(true);
    expect(g.alt).toBeGreaterThan(FLY.alt0);
    const u = new Glider();
    run(u, 1, IN({ ...A, updraft: true }));
    expect(u.alt).toBeGreaterThan(FLY.alt0 + 1);
  });
});

describe('el planeador', () => {
  it('el mando de serie: media flexión (elegido por el usuario), en la suave y en la dura; o el que se elija', () => {
    expect(flyModel(0, true)).toBe('mid');
    expect(flyModel(0, false)).toBe('mid');
    expect(flyModel(1, false)).toBe('pos');
    expect(flyModel(2, true)).toBe('flap');
  });
  it('posarse ante el cofre baja hasta el suelo; luego despega solo hasta la altura de salida (con los dos mandos)', () => {
    for (const model of ['pos', 'flap'] as const) {
      const g = new Glider();
      run(g, 2, IN({ model, land: 1 }));
      expect(g.alt).toBe(0);
      run(g, 6, IN({ model }));
      expect(g.alt, model).toBeGreaterThanOrEqual(FLY.alt0 - 0.2);
    }
  });
  it('la tabla: la muñeca derecha más baja inclina a la derecha; sin ver las dos o casi plana, nada', () => {
    expect(boardTilt({ ok: true, x: -0.2, y: 0.1 }, { ok: true, x: 0.2, y: 0.04 })).toBeGreaterThan(0.1);
    expect(boardTilt({ ok: true, x: -0.2, y: 0.04 }, { ok: true, x: 0.2, y: 0.1 })).toBeLessThan(-0.1);
    expect(boardTilt({ ok: false, x: 0, y: 0 }, { ok: true, x: 0.2, y: 0.1 })).toBe(0);
    expect(boardSide(0.02)).toBe(0);
    expect(boardSide(0.2)).toBeGreaterThan(0.05);
    const g = new Glider();
    run(g, 1.5, IN({ side: boardSide(0.2) }));
    expect(g.u).toBeGreaterThan(0.3);
  });
});

describe('la Travesía volando', () => {
  const TOP = 0.45;
  const fly = (): Sim => {
    // (con el mando de posición: los retos se juzgan igual con cualquiera)
    const s = new Sim({ trekAuto: 1, pushDepth: 13, trekFly: 1, flyAlt: 1 });
    s.env.ex = 'pushup';
    s.env.mem.set('reparenaxr-flytuto', 1); // (la práctica de vuelo, ya hecha)
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

  it('en la dura, con flexiones normales, vuelas a la altura de los retos (no te quedas pegado abajo)', () => {
    const s = fly();
    s.env.S.trekAuto = 0;
    s.load(course([mk(1, 'chest', 2000, 0)]));
    s.until(() => false, 72 * 5);
    const alts: number[] = [];
    for (let i = 0; i < 12; i++) {
      s.pushup(0.11, 1.4);
      s.r.rep(false);
      s.until(() => false, 20);
      alts.push(s.r.flyAlt);
    }
    for (const a of alts.slice(2)) expect(a).toBeGreaterThan(4);
  });

  it('escorado y quieto 10 s, sigues a ese lado; al volver al centro, el vuelo vuelve (no se va al otro lado)', () => {
    const s = fly();
    s.load(course([mk(1, 'chest', 2000, 0)]));
    s.until(() => false, 72 * 3);
    s.head.x = 0.08;
    s.until(() => false, 72 * 2);
    const u1 = s.r.glider.u;
    expect(u1).toBeGreaterThan(0.6);
    s.until(() => false, 72 * 10);
    expect(Math.abs(s.r.glider.u - u1)).toBeLessThan(0.05);
    s.head.x = 0;
    s.until(() => false, 72 * 3);
    expect(Math.abs(s.r.glider.u)).toBeLessThan(0.05);
  });
});


describe('la práctica de vuelo', () => {
  it('la primera vez, seis pasos: cada uno se marca en cuanto lo haces (sin volver); el mundo no espera; al acabar, el vuelo a tu medida', () => {
    // (con lo de serie: cada flexión te empuja, como lo probó el usuario en las gafas)
    const s = new Sim({ pushDepth: 13, trekFly: 1 });
    s.env.ex = 'pushup';
    s.env.calibRef = 0.45;
    s.head.y = 0.45;
    s.r.calibrate(0.45, 0, 0);
    s.load(course([mk(1, 'ring', 30, 0, { u: 0, h: 6 }), mk(2, 'chest', 300, 0)]));
    s.until(() => false, 72);
    const P = s.r.practice;
    expect(P.active).toBe(true);
    expect(s.of('say').some((e) => e.text === 'Escórate a la derecha')).toBe(true);
    // escorado a la derecha y quieto ahí: se marca enseguida (antes había que volver al centro y se quedaba esperando)
    s.head.x = 0.1;
    expect(s.until(() => P.step === 1, 72 * 3)).toBe(true);
    s.head.x = -0.09;
    expect(s.until(() => P.step === 2, 72 * 3)).toBe(true);
    s.head.x = 0;
    s.head.y = 0.45 - 0.12;
    expect(s.until(() => P.step === 3, 72 * 3)).toBe(true);
    s.head.y = 0.45;
    s.until(() => false, 30);
    expect(s.r.rep(false)).toBe(true); // (la flexión empuja también en la práctica: el mundo no espera)
    expect(s.until(() => P.step === 4, 72 * 3)).toBe(true);
    s.head.z = 0.15;
    expect(s.until(() => P.step === 5, 72 * 3)).toBe(true);
    s.head.z = 0;
    s.head.roll = 1.2;
    expect(s.until(() => P.done, 72 * 3)).toBe(true);
    s.head.roll = 0;
    const fit = s.r.flyFit!;
    expect(fit.side).toBeCloseTo(0.09 * 0.8, 2);
    expect(fit.down).toBeCloseTo(0.12 * 0.8, 2);
    expect(fit.back).toBeCloseTo(0.15 * 0.8, 2);
    expect(s.of('store').some((e) => e.key === 'reparenaxr-flytuto')).toBe(true);
    expect(s.r.dist).toBeGreaterThan(0.5); // (avanzaste con la flexión)
    // durante la práctica no te hundes (sus pasos no son flexiones)
    expect(s.r.flyAlt).toBeGreaterThan(4);
  });
  it('un paso que no sale se salta solo, sin quedarse esperando', () => {
    const s = new Sim({ pushDepth: 13, trekFly: 1, trekAuto: 1 });
    s.env.ex = 'pushup';
    s.env.calibRef = s.head.y = 0.45;
    s.r.calibrate(0.45, 0, 0);
    s.load(course([mk(1, 'chest', 400, 0)]));
    s.until(() => s.r.practice.done, 72 * 90);
    expect(s.r.practice.done).toBe(true);
    expect(s.of('say').some((e) => e.text === 'Seguimos')).toBe(true);
  });
  it('antes de empezar, en el suelo; en la dura, sin hundirse esperando: al empezar, despega hasta la altura de vuelo', () => {
    const s = new Sim({ pushDepth: 13, trekFly: 1 });
    s.env.ex = 'pushup';
    s.env.mem.set('reparenaxr-flytuto', 1);
    s.env.calibRef = s.head.y = 0.45;
    s.r.calibrate(0.45, 0, 0);
    s.load(course([mk(1, 'chest', 400, 0)]));
    s.env.state = 'ready';
    s.until(() => false, 72 * 20);
    expect(s.r.flyAlt).toBeLessThan(0.05);
    s.env.state = 'play';
    let top = 0;
    s.until(() => ((top = Math.max(top, s.r.flyAlt)), false), 72 * 6);
    expect(top).toBeGreaterThan(FLY.alt0 - 0.3);
  });
  it('hecha una vez, no vuelve a salir (salvo con «Vuelo: repetir la práctica»)', () => {
    for (const again of [0, 1]) {
      const s = new Sim({ trekAuto: 1, pushDepth: 13, trekFly: 1, flyPractice: again });
      s.env.ex = 'pushup';
      s.env.mem.set('reparenaxr-flytuto', 1);
      s.load(course([mk(1, 'chest', 300, 0)]));
      s.until(() => false, 10);
      expect(s.r.practice.active).toBe(!!again);
    }
  });
});
