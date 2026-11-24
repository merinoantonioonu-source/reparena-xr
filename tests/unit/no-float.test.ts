// Nada flota (pedido del usuario: «los árboles nunca están flotando; creo que se repite también en Travesía»): lo que va
// encima de una roca (el pino de la pared del risco, las palmeras y los huesos de los islotes de la costa, el árbol de las
// islas del cielo; y en Combate, los árboles de las islas lejanas) se apoya en ella: su pie, en la roca o un poco hundido,
// nunca en el aire. La cara de arriba de cada roca sale de sus modelos (src/env/rock-tops.ts, hecho por tests/rock-tops.mjs).
import { describe, expect, it } from 'vitest';
import { cliffDecoPuts, coastDecoPuts, putTop, skyDecoPuts, type Put } from '../../src/modes/trek/plat/pieces';
import { skyLayout, type Models } from '../../src/env/placement';
import { modelTop, placedTop } from '../../src/env/rock-top';

const ROCKS = /^(Cliff1|Cliff3|Cliff4|Rock_\d|Rock_Medium_\d)$/;
const ON_ROCK = /Tree|Pine|Palm|Bones|Skulls/;

/** La roca más alta que hay bajo (ds, u) entre las de la lista (sin las colgadas boca abajo: no se pisan). */
function under(list: Put[], ds: number, u: number): number | null {
  let best: number | null = null;
  for (const P of list) {
    if (!ROCKS.test(P.n) || Math.abs(P.rx) > 1e-6 || Math.abs(P.rz) > 1e-6) continue;
    const t = putTop(P, ds, u);
    if (t !== null && (best === null || t > best)) best = t;
  }
  return best;
}

describe('nada flota en la Travesía', () => {
  for (const [name, fn] of [
    ['el risco (los pinos de la pared)', (c: number) => cliffDecoPuts(c, [])],
    ['la costa (las palmeras y los huesos de los islotes)', (c: number) => coastDecoPuts(c, [])],
    ['las islas en el cielo (los árboles de las islas)', (c: number) => skyDecoPuts(c, [])],
  ] as const)
    it(name, () => {
      let n = 0;
      for (let c = -10; c < 200; c++) {
        // (las rocas de los trozos vecinos también: se solapan)
        const L = fn(c), rocks = [...fn(c - 1), ...L, ...fn(c + 1)];
        for (const P of L) {
          if (!ON_ROCK.test(P.n)) continue;
          n++;
          const t = under(rocks, P.ds, P.u);
          expect(t, `${P.n} del trozo ${c}: sin roca debajo`).not.toBeNull();
          expect(P.y, `${P.n} del trozo ${c}: flota`).toBeLessThanOrEqual(t! + 1e-6);
          expect(P.y, `${P.n} del trozo ${c}: enterrado`).toBeGreaterThan(t! - 0.35);
        }
      }
      expect(n).toBeGreaterThan(10); // (sigue habiendo árboles)
    });
});

describe('nada flota en las islas del cielo de Combate', () => {
  it('los árboles de las islas lejanas, apoyados en su roca', () => {
    const M: Models = { has: () => true, foot: () => 0.4, rad: () => 1.5, top: (n) => (modelTop(n, 0, 0) ?? 2) };
    let n = 0;
    for (let seed = 0; seed < 40; seed++) {
      const L = skyLayout(11, [], M, seed).puts, islands = L.filter((p) => /^Cliff[13]$/.test(p.n) && Math.hypot(p.x, p.z) > 30);
      for (const T of L) {
        if (!/Tree|Pine/.test(T.n) || Math.hypot(T.x, T.z) < 30) continue;
        n++;
        let t = -Infinity;
        for (const I of islands) t = Math.max(t, placedTop(I.n, I.x, I.y, I.z, I.ry, I.s, I.s, I.s, T.x, T.z) ?? -Infinity);
        expect(T.y).toBeLessThanOrEqual(t + 1e-6);
        expect(T.y).toBeGreaterThan(t - 0.35);
      }
    }
    expect(n).toBeGreaterThan(40);
  });
});

describe('la cara de arriba de las rocas', () => {
  it('sale de sus modelos: lo más alto de la Cliff4, su caja (5,27 m)', () => {
    let hi = -9;
    for (let x = -3.3; x < 3.9; x += 0.1) for (let z = -3.6; z < 3.4; z += 0.1) hi = Math.max(hi, modelTop('Cliff4', x, z) ?? -9);
    expect(hi).toBeGreaterThan(5.0);
    expect(hi).toBeLessThan(5.3);
    expect(modelTop('Cliff4', 50, 0)).toBeNull();
  });
});
