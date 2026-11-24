// Los voladores que bajan del cielo (el press de pecho boca arriba; pedido del usuario: tumbado no se ven las compuertas y los
// avisos no pueden tapar su camino): salen muy alto, casi encima de ti, bajan frenando hasta quedarse sobre tu cara, esperan
// un momento y se lanzan a morderte; tras morder, o con un disparo, vuelven a subir. Por el lado de los pies (donde van la
// bola, los avisos y el marcador) casi no se apartan de la vertical.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Flight, FLYER_KIND, SKY, skySpawn, type FlyEnv, type FlyGate } from '../../src/combat/flight';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const GATE: FlyGate = { x: 0, z: -11, ry: 0, scale: 1 };
const DT = 1 / 72;
/** Boca arriba: la cabeza en el suelo, con los pies hacia −Z. */
const HEAD = new Vector3(0, 0.22, 0);
/** Lo que se aparta de la vertical, visto desde tu cabeza, hacia los pies (rad; negativo, hacia lo alto de la cabeza). */
const towardFeet = (p: Vector3): number => Math.atan2(-(p.z - HEAD.z), p.y - HEAD.y);
const offZenith = (p: Vector3): number => Math.atan2(Math.hypot(p.x - HEAD.x, p.z - HEAD.z), p.y - HEAD.y);

function skyFlight(kind: string, seed: number): Flight {
  const r = rng(seed), start = new Vector3(), hover = new Vector3();
  skySpawn(HEAD, r, start, hover);
  return new Flight(kind, GATE, 9, 100, 99, r).toSky(start, hover, HEAD);
}

describe('los voladores que bajan del cielo', () => {
  it('salen muy alto y casi encima de ti; por el lado de los pies, aún más cerca de la vertical', () => {
    const r = rng(7), s = new Vector3(), h = new Vector3();
    for (let i = 0; i < 2000; i++) {
      skySpawn(HEAD, r, s, h);
      expect(s.y - HEAD.y).toBeGreaterThanOrEqual(SKY.hi[0]);
      expect(offZenith(s)).toBeLessThanOrEqual(SKY.tilt[1] + 1e-9);
      expect(towardFeet(s)).toBeLessThanOrEqual(SKY.tiltLow + 1e-9);
      // (donde esperan: sobre tu cara, a 2-3 m)
      expect(h.y - HEAD.y).toBeGreaterThanOrEqual(SKY.hover[0]);
      expect(h.y - HEAD.y).toBeLessThanOrEqual(SKY.hover[1]);
      expect(offZenith(h)).toBeLessThan(0.32);
    }
  });

  it('bajan frenando hasta tu cara, sin pasar por el lado de los pies (la bola, los avisos y el marcador) ni bajar de 55 cm sobre tus ojos salvo al morder', () => {
    for (const kind of Object.keys(FLYER_KIND))
      for (let seed = 1; seed <= 6; seed++) {
        const f = skyFlight(kind, seed), env: FlyEnv = { head: HEAD, play: false, active: true, beat: true, low: 0, sup: null };
        let feet = -9, low = 9, vEnd = 0, arrived = -1;
        for (let t = 0; t < 40; t += DT) {
          const was = f.pos.clone();
          f.step(DT, env);
          feet = Math.max(feet, towardFeet(f.pos));
          low = Math.min(low, f.pos.y - HEAD.y);
          if (arrived < 0 && f.pos.y - HEAD.y < SKY.hover[1] + 0.4) {
            arrived = t;
            vEnd = f.pos.distanceTo(was) / DT;
          }
        }
        const msg = `${kind}, semilla ${seed}: ${JSON.stringify({ feet, low, vEnd, arrived })}`;
        expect(arrived, msg).toBeGreaterThan(3); // (se le ve bajar: varios segundos)
        expect(arrived, msg).toBeLessThan(35);
        expect(vEnd, msg).toBeLessThan(2); // (llega frenando)
        expect(feet, msg).toBeLessThan(0.36); // (hacia los pies, como mucho unos 20°: la bola va a 24° y los avisos, más abajo)
        expect(low, msg).toBeGreaterThanOrEqual(SKY.floor - 1e-6);
      }
  });

  it('en partida, sobre tu cara se lanza a morderte y luego vuelve a subir', () => {
    const f = skyFlight('bee', 3), env: FlyEnv = { head: HEAD, play: true, active: true, beat: true, low: 0, sup: null };
    let bite = -1, minD = 9, upAfter = 0;
    for (let t = 0; t < 40; t += DT) {
      f.step(DT, env);
      minD = Math.min(minD, f.pos.distanceTo(HEAD));
      if (f.evBite && bite < 0) bite = t;
      if (bite >= 0 && t > bite + 1.5) upAfter = Math.max(upAfter, f.pos.y - HEAD.y);
      if (bite >= 0 && t > bite + 2.4) break;
    }
    expect(bite).toBeGreaterThan(0);
    expect(minD).toBeLessThan(0.4); // (llega a tu cara)
    expect(upAfter).toBeGreaterThan(SKY.hover[1]); // (y se aleja hacia arriba)
  });

  it('un disparo lo sube, no lo tira hacia los lados ni hacia ti', () => {
    const f = skyFlight('bat', 5), env: FlyEnv = { head: HEAD, play: false, active: true, beat: true, low: 0, sup: null };
    for (let t = 0; t < 30; t += DT) f.step(DT, env);
    const y0 = f.pos.y;
    f.hit(1, false, 4, HEAD, new Vector3(0, 1, 0), 1);
    let top = y0;
    for (let t = 0; t < 0.6; t += DT) {
      f.step(DT, env);
      top = Math.max(top, f.pos.y);
    }
    expect(top).toBeGreaterThan(y0 + 0.2);
  });
});
