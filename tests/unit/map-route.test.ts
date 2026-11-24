// El vuelo sobre el mapa (src/modes/trek/map/map-route.ts): virar escorándote, la altura y la velocidad a escala de ciudad,
// y la ruta de aros por los monumentos.
import { describe, expect, it } from 'vitest';
import { CITIES, cityOf, headingTo, MAP, MapFlight, toLocal } from '../../src/modes/trek/map/map-route';

const DT = 1 / 72;
const IN = (o: Partial<{ u: number; alt: number; v: number }> = {}) => ({ u: 0, uMax: 2.4, alt: 6, alt0: 6, v: 1.4, ...o });

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
    // (el norte, −z; el este, +x)
    const p = toLocal({ lat: 40, lon: -3 }, 40.01, -2.99, { x: 0, z: 0 });
    expect(p.z).toBeCloseTo(-1112, -1);
    expect(p.x).toBeGreaterThan(800);
  });
  it('empieza antes del primer aro mirando hacia él; recto, llega y lo pasa', () => {
    const F = new MapFlight(cityOf('madrid')!);
    expect(Math.abs(F.toNext().bearing)).toBeLessThan(1e-6);
    let res = '';
    for (let t = 0; t < 60 && !res; t += DT) {
      F.step(DT, IN({ alt: 6 + (MAP.ringAgl - MAP.alt0) / MAP.altK }));
      res = F.judge();
    }
    expect(res).toBe('pass');
    expect(F.next).toBe(1);
  });
  it('escorado a la derecha vira a la derecha; la altura y la velocidad, a escala', () => {
    const F = new MapFlight(cityOf('paris')!), h0 = F.heading;
    F.step(1, IN({ u: 2.4 }));
    expect(F.heading).toBeCloseTo(h0 - MAP.turn, 6); // (a la derecha: el rumbo baja)
    F.step(DT, IN({ alt: 11 }));
    expect(F.agl).toBeCloseTo(MAP.alt0 + 5 * MAP.altK, 6);
    F.step(DT, IN({ alt: 0 }));
    expect(F.agl).toBe(MAP.altMin);
    expect(F.speed).toBeCloseTo(1.4 * MAP.speedK, 6);
    F.step(DT, IN({ v: 0 }));
    expect(F.speed).toBe(0); // (en el descanso, quieto en el aire)
  });
  it('si lo dejas atrás sin pasar por dentro, fallado y al siguiente; al acabar la ruta, vuelta al primero', () => {
    const F = new MapFlight(cityOf('rome')!);
    let res = '';
    // (demasiado alto: pasa por encima)
    for (let t = 0; t < 80 && !res; t += DT) {
      F.step(DT, IN({ alt: 11 }));
      res = F.judge();
    }
    expect(res).toBe('miss');
    expect(F.missed).toBe(1);
    F.next = F.rings.length - 1;
    F.x = F.rings[F.next].x;
    F.z = F.rings[F.next].z;
    F.agl = MAP.ringAgl;
    expect(F.judge()).toBe('pass');
    expect(F.next).toBe(0);
  });
  it('el rumbo: 0 al norte, + al oeste', () => {
    expect(headingTo(0, 0, 0, -10)).toBeCloseTo(0, 6);
    expect(headingTo(0, 0, -10, 0)).toBeCloseTo(Math.PI / 2, 6);
  });
});
