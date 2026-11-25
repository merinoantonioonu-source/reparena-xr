// El vuelo sobre el mapa (src/modes/trek/map/map-route.ts): libre, con inercia, sin techo y sin atravesar nada, y la ruta
// de aros por encima de los monumentos.
import { describe, expect, it } from 'vitest';
import { CITIES, cityOf, headingTo, MAP, MapFlight, toLocal } from '../../src/modes/trek/map/map-route';

const DT = 1 / 72;
// (la cabeza: arriba de la plancha, 0,75 m; a media flexión, 0,6; con el pecho abajo, 0,2)
const TOP = 0.75, MID = 0.6, LOW = 0.2;
const IN = (o: Partial<{ live: boolean; steer: number; head: number; lean: number; kick: boolean }> = {}) => ({ live: true, steer: 0, head: MID, ref: TOP, lean: 0, kick: false, ...o });
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
  it('la flexión entera manda la altura: brazos estirados, subes; media flexión, recto; abajo, bajas; en el suelo, el picado', () => {
    const F = new MapFlight(cityOf('nyc')!);
    run(F, 3, IN({ head: MID }));
    expect(Math.abs(F.vs)).toBeLessThan(0.5); // (a media flexión, recto)
    run(F, 3, IN({ head: TOP }));
    expect(F.climb).toBeCloseTo(1, 2);
    expect(F.vs).toBeGreaterThan(MAP.climb * 0.9);
    run(F, 3, IN({ head: 0.45 }));
    expect(F.climb).toBeLessThan(-0.2);
    expect(F.climb).toBeGreaterThan(-0.8); // (más abajo de la mitad: bajas, en proporción)
    expect(F.dive).toBe(0);
    const v0 = F.speed;
    run(F, 3, IN({ head: LOW }));
    expect(F.climb).toBeCloseTo(-1, 2);
    expect(F.dive).toBeGreaterThan(0.9);
    expect(F.vs).toBeLessThan(-MAP.sink * 0.9);
    expect(F.speed).toBeGreaterThan(v0 * 1.3); // (en picado, más deprisa)
  });
  it('arriba de la plancha se afina solo: calibrado bajo, estirar los brazos de verdad sigue siendo subir', () => {
    const F = new MapFlight(cityOf('nyc')!);
    // (calibrado a 0,70 m, pero con los brazos estirados llegas a 0,82: caja negra del usuario)
    run(F, 2, IN({ ref: 0.7, head: 0.82 }));
    expect(F.top).toBeGreaterThan(0.8);
    expect(F.climb).toBeCloseTo(1, 1);
    run(F, 2, IN({ ref: 0.7, head: 0.66 })); // (16 cm por debajo: la media flexión de verdad)
    expect(Math.abs(F.climb)).toBe(0);
  });
  it('sin techo, cada vez más deprisa con la altura; la marcha, también', () => {
    const F = new MapFlight(cityOf('nyc')!);
    run(F, 4, IN({ head: MID }));
    const v0 = F.speed;
    expect(v0).toBeGreaterThan(MAP.gear * MAP.gear0 * 0.9);
    run(F, 120, IN({ head: TOP }));
    expect(F.agl).toBeGreaterThan(30000); // (la estratosfera, en un par de minutos)
    expect(F.speed).toBeGreaterThan(v0 * 20);
  });
  it('la marcha es acumulativa: cada impulso, una más, y se mantiene; echado atrás, frena hasta parar', () => {
    const F = new MapFlight(cityOf('paris')!);
    run(F, 4, IN());
    const v1 = F.speed;
    F.step(DT, IN({ kick: true, lean: 0.08 }));
    run(F, 5, IN());
    expect(F.gear).toBeCloseTo(MAP.gear0 + 1, 6);
    expect(F.speed).toBeGreaterThan(v1 * 1.8);
    const v2 = F.speed;
    run(F, 20, IN()); // (sin hacer nada, se mantiene)
    expect(Math.abs(F.speed - v2)).toBeLessThan(2);
    F.step(DT, IN({ kick: true, lean: 0.08 }));
    F.step(DT, IN({ kick: true, lean: 0.08 }));
    run(F, 5, IN());
    expect(F.gear).toBeCloseTo(MAP.gear0 + 3, 6);
    expect(F.speed).toBeGreaterThan(v2 * 1.8);
    // adelante y aguantando, sube poco a poco
    const g = F.gear;
    run(F, 2, IN({ lean: 0.15 }));
    expect(F.gear).toBeGreaterThan(g + 0.8);
    // atrás: frena, hasta parar
    run(F, 12, IN({ lean: -0.15 }));
    expect(F.gear).toBe(0);
    expect(F.speed).toBeLessThan(1);
    for (let i = 0; i < 20; i++) F.step(DT, IN({ kick: true, lean: 0.08 }));
    expect(F.gear).toBe(MAP.gearMax);
  });
  it('sin mandar (antes de empezar, en el descanso), quieto en el aire', () => {
    const F = new MapFlight(cityOf('paris')!);
    run(F, 4, IN());
    const alt = F.alt;
    run(F, 4, IN({ live: false, head: 1.6, lean: 0.3, steer: 1 }));
    expect(F.speed).toBeLessThan(2);
    expect(Math.abs(F.alt - alt)).toBeLessThan(15);
    expect(Math.abs(F.bank)).toBeLessThan(0.05);
  });
  it('el suelo y los tejados sostienen: nunca más cerca que su margen', () => {
    const F = new MapFlight(cityOf('madrid')!);
    run(F, 60, IN({ head: LOW }));
    expect(F.agl).toBeGreaterThan(MAP.floor - 1);
    expect(F.agl).toBeLessThan(MAP.floor + 2); // (el vuelo rasante)
    // un tejado se te echa encima: te sube suave, sin atravesarlo
    F.ground += 80;
    run(F, 2, IN({ head: LOW }));
    expect(F.agl).toBeGreaterThan(MAP.floor - 1);
  });
  it('ante una pared frena y se para antes de tocarla; libre otra vez, sigue', () => {
    const F = new MapFlight(cityOf('madrid')!);
    run(F, 4, IN());
    F.ahead = 80;
    const x0 = F.x, z0 = F.z;
    run(F, 8, IN());
    expect(F.speed).toBeLessThan(0.5);
    const gone = Math.hypot(F.x - x0, F.z - z0);
    expect(gone).toBeLessThan(80 - MAP.stopAt + 1);
    expect(gone).toBeGreaterThan(40);
    F.ahead = Infinity;
    run(F, 4, IN());
    expect(F.speed).toBeGreaterThan(MAP.gear * MAP.gear0 * 0.8);
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
  it('desde un lugar cualquiera (sin ruta): encima de él, mirando al norte, sin aros; y sabe dónde está', () => {
    const F = new MapFlight({ id: 'place', name: 'Tu lugar', lat: 27.9881, lon: 86.925, h: 0, route: [] });
    expect(F.rings.length).toBe(0);
    expect(F.x).toBe(0);
    expect(F.z).toBe(0);
    expect(F.judge()).toBe(false);
    expect(F.toNext().dist).toBe(0);
    // el suelo de verdad (el Everest: 8.800 m), al medirlo la primera vez: a tu altura de salida sobre él
    expect(F.placed).toBe(false);
    F.setGround(8800);
    expect(F.agl).toBeCloseTo(MAP.alt0, 6);
    F.setGround(8700); // (luego ya no te recoloca: solo es lo que hay debajo)
    expect(F.alt).toBeCloseTo(8800 + MAP.alt0, 6);
    // hacia el norte: la latitud sube y la longitud no cambia
    run(F, 20, IN());
    const W = F.where({ lat: 0, lon: 0 });
    expect(W.lat).toBeGreaterThan(27.9881 + 0.003);
    expect(W.lon).toBeCloseTo(86.925, 4);
    expect(F.reanchor()).toBe(false);
  });
  it('«donde lo dejaste»: a la altura que llevabas', () => {
    const F = new MapFlight({ id: 'last', name: 'Donde lo dejaste', lat: 40.4, lon: -3.7, h: 0, route: [] });
    F.startAgl = 1200;
    F.setGround(650);
    expect(F.agl).toBeCloseTo(1200, 6);
  });
  it('el rumbo: 0 hacia −z, + hacia −x', () => {
    expect(headingTo(0, 0, 0, -10)).toBeCloseTo(0, 6);
    expect(headingTo(0, 0, -10, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});
