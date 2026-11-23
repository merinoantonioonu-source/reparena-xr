// El superman, «aguante que protege» (elegido por el usuario: no le daba tiempo a hacer las repeticiones antes de que
// llegaran los voladores): mientras aguantas arriba ningún volador te muerde; tumbado, esperan el descanso y, pasado, pican
// de uno en uno. Y la bola, hacia las manos aunque mires al suelo (src/input/body-dir.ts).
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { Flight, type FlyEnv, type FlyGate } from '../../src/combat/flight';
import { bodyDir } from '../../src/input/body-dir';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const GATE: FlyGate = { x: 0, z: -6, ry: 0, scale: 1 };

/** Una ronda simulada de superman: n voladores a la vez; `up(t)` dice si estás arriba. Devuelve cuándo muerde cada uno. */
function run(n: number, secs: number, up: (t: number) => boolean, restMax = 5): number[] {
  const head = new Vector3(0, 0.3, 0), next = { t: 0 };
  const sup = { hold: 2, up: false, time: 0, next, rest: 0, restMax };
  const env: FlyEnv = { head, play: true, active: true, beat: true, low: 0.45, sup };
  const r = rng(7), fl = Array.from({ length: n }, () => new Flight('bee', GATE, 3.5, 100, 3, r, true));
  const bites: number[] = [], dt = 1 / 72;
  for (let t = 0; t < secs; t += dt) {
    sup.up = up(t);
    sup.time = t;
    sup.rest = sup.up ? 0 : sup.rest + dt;
    for (const f of fl) {
      f.step(dt, env);
      if (f.evBite) bites.push(+t.toFixed(2));
    }
  }
  return bites;
}

describe('superman: aguante que protege', () => {
  it('a buen ritmo (subir y aguantar, una cada 5 s), ningún mordisco en 2 minutos, en cualquier rango', () => {
    // (arriba 2,6 s de cada 5: lo que se tarda en una repetición; abajo, 2,4 s; el descanso, de 6 s en Recluta a 3,5 s)
    for (const rm of [6, 4.5, 3.5]) expect(run(3, 120, (t) => t % 5 < 2.6, rm), `descanso ${rm} s`).toEqual([]);
  });
  it('tumbado sin subir, esperan el descanso y luego pican, de uno en uno', () => {
    const b = run(3, 30, () => false, 5);
    expect(b.length).toBeGreaterThan(1);
    expect(b[0]).toBeGreaterThan(5); // (no antes del descanso)
    for (let i = 1; i < b.length; i++) expect(b[i] - b[i - 1]).toBeGreaterThan(4); // (nunca dos seguidos)
  });
  it('subir el tronco a tiempo para al que ya venía', () => {
    // tumbado 6 s (pasado el descanso empieza a lanzarse) y, al momento, arriba: no muerde
    expect(run(1, 12, (t) => t > 5.2 && t < 9)).toEqual([]);
  });
});

describe('hacia dónde mira el cuerpo', () => {
  const q = new Quaternion(), out = new Vector3();
  const pitch = (deg: number) => bodyDir(q.setFromAxisAngle(new Vector3(1, 0, 0), (deg * Math.PI) / 180), out);
  it('de pie, la mirada en horizontal (como siempre)', () => {
    for (const d of [-20, 0, 20, 45]) expect(pitch(d).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6);
    const yaw = bodyDir(q.setFromAxisAngle(new Vector3(0, 1, 0), 0.7), out);
    expect(Math.atan2(-yaw.x, -yaw.z)).toBeCloseTo(0.7, 6);
  });
  it('boca abajo, mirando al suelo o con la barbilla metida, hacia las manos (delante), nunca hacia los pies', () => {
    for (const d of [-60, -85, -90, -100, -115]) expect(pitch(d).z, `${d}°`).toBeLessThan(-0.99);
  });
});
