// El láser de Arcos que te busca (pedido del usuario: los láseres verticales no obligaban a esquivar nada): acaba donde estás
// tú cuando empieza a frenarse, así que quedarse quieto nunca vale; apartarse a tiempo, sí; y ya frenado sigue meciéndose.
import { describe, expect, it } from 'vitest';
import { ArcObsCore } from '../../src/modes/arcs/obstacles';
import type { ArcsEnv } from '../../src/modes/arcs/env';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const S: Record<string, number> = { arcLaser: 30 };

/** Un láser hasta que se juzga, con la cabeza en `hx(t, tau)`: ¿te da? Y lo más que se mueve de lado (m/s). */
function run(seed: number, hx: (tau: number) => number, track = true): { hit: boolean; vmax: number; still: number } {
  const head = { x: hx(9), y: 1.6, z: 0 }, env: ArcsEnv = { s: (k) => S[k] ?? 0, dv: (k) => S[k] ?? 0, rnd: rng(seed), head, calibRef: 1.6, arenaDepth: 11, jumpFastT: 9, beatP: 0, time: 0 };
  const o = new ArcObsCore('laser', env, 4);
  o.track = track;
  const dt = 1 / 72;
  let vmax = 0, x0 = o.beamX, stillLate = 0;
  for (let i = 0; i < 2000 && !o.judged; i++) {
    const tau = o.tReach - o.t;
    head.x = hx(tau);
    o.update(dt, env, true);
    const v = Math.abs(o.beamX - x0) / dt;
    vmax = Math.max(vmax, v);
    if (tau > 0.7 && tau < 1.2 && v < 0.005) stillLate += dt; // (frenado, pero aún no quieto del todo)
    x0 = o.beamX;
  }
  return { hit: o.hit, vmax, still: stillLate };
}

describe('el láser que te busca', () => {
  it('quieto en cualquier sitio del carril, siempre te da', () => {
    const r = rng(3);
    for (let i = 0; i < 1000; i++) {
      const x = (r() * 2 - 1) * 0.7;
      expect(run(i + 1, () => x).hit, `quieto en ${x.toFixed(2)}`).toBe(true);
    }
  });
  it('apartándote medio metro en el último segundo, nunca te da', () => {
    const r = rng(5);
    for (let i = 0; i < 1000; i++) {
      const x = (r() * 2 - 1) * 0.3, side = x > 0 ? -1 : 1;
      expect(run(i + 1, (tau) => (tau < 1.0 ? x + side * 0.5 * Math.min(1, (1.0 - tau) / 0.3) : x)).hit, `desde ${x.toFixed(2)}`).toBe(false);
    }
  });
  it('se puede seguir (nunca más de 2,5 m/s de lado) y, frenado, aún se mece', () => {
    for (let i = 1; i <= 200; i++) {
      const r = run(i, (tau) => 0.4 * Math.sin(tau * 2));
      expect(r.vmax).toBeLessThan(2.5);
      expect(r.still).toBeLessThan(0.15);
    }
  });
  it('el de RepArena se quedaba donde no molestaba muchas veces', () => {
    let miss = 0;
    for (let i = 1; i <= 300; i++) if (!run(i, () => 0.55, false).hit) miss++;
    expect(miss).toBeGreaterThan(100);
  });
});
