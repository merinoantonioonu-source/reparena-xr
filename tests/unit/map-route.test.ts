// El vuelo sobre el mapa (src/modes/trek/map/map-route.ts): libre, con inercia, sin techo y sin atravesar nada, y la ruta
// de aros por encima de los monumentos.
import { describe, expect, it } from 'vitest';
import { CITIES, cityOf, headingTo, MAP, MapFlight, toLocal } from '../../src/modes/trek/map/map-route';

const DT = 1 / 72;
const IN = (o: Partial<{ steer: number; climb: number; gas: number }> = {}) => ({ steer: 0, climb: 0, gas: 1, ...o });
const run = (F: MapFlight, s: number, I = IN()): void => {
  for (let t = 0; t < s; t += DT) F.step(DT, I);
};

describe('el vuelo sobre el mapa', () => {
  it('cada ciudad, con su ruta de monumentos a unos cientos de metros o pocos kilómetros', () => {
    expect(CITIES.map((c) => c.id)).toEqual(['madrid', 'paris', 'nyc', 'rome']);
    for (const c of CITIES) {
      expect(c.route.length).toBeGreaterThanOrEqual(5);
      const F = new MapFlight(c);
      for (let i = 0; i < F.rings.length; i++) {
        const a = F.rings[i], b = F.rings[(i + 1) % F.rings.length], d = Math.hypot(b.x - a.x, b.z - a.z);
        expect(d).toBeGreaterThan(150);
        expect(d).toBeLessThan(4000);
      }
    }
  });
  it('el mapa: el norte, +z; el este, −x (como lo deja la librería: al revés, los aros salían al otro lado de la ciudad)', () => {
    const p = toLocal({ lat: 40, lon: -3 }, 40.01, -2.99, { x: 0, z: 0 });
    expect(p.z).toBeCloseTo(1112, -1);
    expect(p.x).toBeLessThan(-800);
    // (lo que da la librería para Times Square: 1 km al norte, z = +998,7; 1 km al este, x = −1002,6)
    const N = toLocal({ lat: 40.758, lon: -73.9855 }, 40.758 + 1000 / 6371000 / (Math.PI / 180), -73.9855, { x: 0, z: 0 });
    expect(N.z).toBeCloseTo(1000, 0);
    expect(Math.abs(N.x)).toBeLessThan(1);
  });
  it('empieza antes del primer aro, mirando hacia él y a la altura de salida; recto y a su altura, lo pasa', () => {
    const F = new MapFlight(cityOf('madrid')!);
    expect(Math.abs(F.toNext().bearing)).toBeLessThan(1e-6);
    expect(F.agl).toBeCloseTo(MAP.alt0, 6);
    F.alt = F.ringAlt(0);
    let ok = false;
    for (let t = 0; t < 60 && !ok; t += DT) {
      F.step(DT, IN());
      ok = F.judge();
    }
    expect(ok).toBe(true);
    expect(F.next).toBe(1);
    expect(F.got).toBe(1);
  });
  it('por encima o por debajo del aro no cuenta, y el aro espera (no hay aros fallados)', () => {
    const F = new MapFlight(cityOf('rome')!);
    F.alt = F.ringAlt(0) + 200;
    let ok = false;
    for (let t = 0; t < 60; t += DT) {
      F.step(DT, IN());
      ok = ok || F.judge();
    }
    expect(ok).toBe(false);
    expect(F.next).toBe(0);
    // el último, y vuelta al primero
    F.next = F.rings.length - 1;
    F.x = F.rings[F.next].x;
    F.z = F.rings[F.next].z;
    F.alt = F.ringAlt(F.next);
    expect(F.judge()).toBe(true);
    expect(F.next).toBe(0);
  });
  it('el viraje tiene inercia: entra suave, llega a su giro y, al enderezarte, sigue virando un poco y se apaga', () => {
    const F = new MapFlight(cityOf('paris')!), h0 = F.heading;
    F.step(DT, IN({ steer: 1 }));
    expect(Math.abs(F.bank)).toBeLessThan(0.05); // (no de golpe)
    run(F, 3, IN({ steer: 1 }));
    expect(F.bank).toBeGreaterThan(0.97);
    expect(F.heading).toBeLessThan(h0); // (a la derecha: el rumbo baja)
    const h1 = F.heading;
    run(F, 0.4, IN());
    expect(F.bank).toBeGreaterThan(0.3); // (aún ladeado)
    expect(F.heading).toBeLessThan(h1 - 0.05);
    run(F, 4, IN());
    expect(Math.abs(F.bank)).toBeLessThan(0.01);
  });
  it('subes y bajas sin techo, cada vez más deprisa con la altura; la marcha, también', () => {
    const F = new MapFlight(cityOf('nyc')!);
    run(F, 3, IN({ climb: 1 }));
    expect(F.vs).toBeGreaterThan(MAP.climb * 0.9);
    const v0 = F.speed;
    expect(v0).toBeGreaterThan(MAP.cruise * 0.8);
    run(F, 120, IN({ climb: 1 }));
    expect(F.agl).toBeGreaterThan(30000); // (la estratosfera, en un par de minutos)
    expect(F.speed).toBeGreaterThan(v0 * 20);
    run(F, 3, IN({ gas: 0 }));
    expect(F.speed).toBeLessThan(F.scale * MAP.cruise * 0.2); // (sin gas, se va parando)
  });
  it('el suelo y los tejados sostienen: nunca más cerca que su margen', () => {
    const F = new MapFlight(cityOf('madrid')!);
    run(F, 60, IN({ climb: -1 }));
    expect(F.agl).toBeGreaterThan(MAP.floor - 1);
    expect(F.agl).toBeLessThan(MAP.floor + 2);
    // un tejado se te echa encima: te sube suave, sin atravesarlo
    F.ground += 80;
    run(F, 2, IN({ climb: -1 }));
    expect(F.agl).toBeGreaterThan(MAP.floor - 1);
  });
  it('ante una pared frena y se para antes de tocarla; libre otra vez, sigue', () => {
    const F = new MapFlight(cityOf('madrid')!);
    run(F, 4, IN());
    F.ahead = 80;
    const x0 = F.x, z0 = F.z;
    run(F, 6, IN());
    expect(F.speed).toBeLessThan(0.5);
    const gone = Math.hypot(F.x - x0, F.z - z0);
    expect(gone).toBeLessThan(80 - MAP.stopAt + 1);
    expect(gone).toBeGreaterThan(40);
    F.ahead = Infinity;
    run(F, 4, IN());
    expect(F.speed).toBeGreaterThan(MAP.cruise * 0.8);
  });
  it('lejos del ancla, vuelve a anclarse debajo de ti (la Tierra es redonda) y los aros siguen en su sitio', () => {
    const F = new MapFlight(cityOf('paris')!);
    expect(F.reanchor()).toBe(false);
    F.z += MAP.reanchor + 100; // (al norte)
    const d0 = F.toNext().dist, alt0 = F.alt;
    expect(F.reanchor()).toBe(true);
    expect(F.x).toBe(0);
    expect(F.z).toBe(0);
    expect(F.anchor.lat).toBeGreaterThan(cityOf('paris')!.lat + 0.2);
    expect(F.alt).toBeGreaterThan(alt0 + 40); // (el mapa se había hundido unos 50 m)
    expect(F.toNext().dist).toBeCloseTo(d0, -2);
  });
  it('el rumbo: 0 hacia −z, + hacia −x', () => {
    expect(headingTo(0, 0, 0, -10)).toBeCloseTo(0, 6);
    expect(headingTo(0, 0, -10, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});
