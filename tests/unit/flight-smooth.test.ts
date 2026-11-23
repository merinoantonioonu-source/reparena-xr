// El vuelo suave de los voladores (pedido del usuario: se paraban y, de golpe, hacían una diagonal rapidísima hacia un lado
// y se perdían de vista): visto desde tu cabeza, nunca giran más de 40°/s mientras van a su aire, no se quedan quietos y no
// se van por detrás ni muy a un lado. El vuelo de RepArena (a saltos) solo se usa para compararlo.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Flight, FLYER_KIND, type FlyEnv, type FlyGate } from '../../src/combat/flight';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const GATES: FlyGate[] = [{ x: 0, z: -11, ry: 0, scale: 1 }, { x: -4.62, z: -11, ry: 0.4, scale: 1 }, { x: 4.62, z: -11, ry: -0.4, scale: 1 }];
const DT = 1 / 72;

/** 60 s de vuelo: lo más deprisa que gira visto desde la cabeza yendo a su aire (°/s), lo más que se queda quieto (s), lo
 * más que se aparta del frente (°) y si alguna vez se pone detrás. */
function fly(kind: string, erratic: number, seed: number, classic = false): { turn: number; still: number; side: number; jolt: number } {
  const head = new Vector3(0, 1.6, 0), env: FlyEnv = { head, play: false, active: true, beat: true, low: 0, sup: null };
  const f = new Flight(kind, GATES[seed % 3], 3.5, erratic, 99, rng(seed), false, false);
  f.classic = classic;
  const a = new Vector3(), b = new Vector3();
  let turn = 0, still = 0, stillT = 0, side = 0, jolt = 0, lastStill = -9;
  for (let t = 0; t < 60; t += DT) {
    const was = f.pos.clone();
    f.step(DT, env);
    if (t < 8) continue; // (lo primero, salir de la compuerta y acercarse)
    a.subVectors(was, head);
    b.subVectors(f.pos, head);
    const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b) / (a.length() * b.length()))));
    turn = Math.max(turn, (ang / DT) * (180 / Math.PI));
    const v = f.pos.distanceTo(was) / DT;
    stillT = v < 0.015 ? stillT + DT : 0; // (quieto: menos de 1,5 cm/s)
    still = Math.max(still, stillT);
    // (el bandazo: casi parado y, en menos de 0,3 s, a toda velocidad)
    if (v < 0.08) lastStill = t;
    else if (t - lastStill < 0.3) jolt = Math.max(jolt, v);
    if (t > 14) side = Math.max(side, Math.abs(Math.atan2(f.pos.x - head.x, head.z - f.pos.z)) * (180 / Math.PI)); // (ya delante de ti)
  }
  return { turn, still, side, jolt };
}

describe('el vuelo suave', () => {
  it('visto desde ti, nunca gira más de 40°/s, no se para para luego salir disparado, casi nunca se queda quieto y no se aparta mucho del frente (ya delante de ti, como mucho unos 40° a un lado)', () => {
    for (const kind of Object.keys(FLYER_KIND))
      for (const er of [50, 100, 200])
        for (let seed = 1; seed <= 4; seed++) {
          const r = fly(kind, er, seed), msg = `${kind}, errático ${er} %, semilla ${seed}: ${JSON.stringify(r)}`;
          expect(r.turn, msg).toBeLessThan(41);
          expect(r.still, msg).toBeLessThan(1); // (un instante a cámara lenta, nunca parado del todo)
          expect(r.jolt, msg).toBeLessThan(1.2);
          expect(r.side, msg).toBeLessThan(40); // (de cerca, a la altura de la cara: lo que da la compuerta lateral más el desvío)
        }
  });
  it('el de RepArena (a saltos) sí daba bandazos', () => {
    let worst = 0;
    for (let seed = 1; seed <= 4; seed++) worst = Math.max(worst, fly('bat', 100, seed, true).turn);
    expect(worst).toBeGreaterThan(60);
  });
});
