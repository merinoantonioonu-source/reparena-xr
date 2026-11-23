import { describe, expect, it } from 'vitest';
import { CLIFF_EDGE, cliffLayout, islandLayout, natureLayout, ISL_SHORE, SKY_EDGE, skyLayout, villageLayout, type Models } from '../../src/env/placement.js';

// un pack de mentira: todo está, todo ocupa lo mismo
const M: Models = { has: () => true, foot: () => 0.4, rad: () => 1.5 };
const GATES = [{ x: -3.5, z: -11 }, { x: 0, z: -11 }, { x: 3.5, z: -11 }];

describe('los entornos de día', () => {
  it('el bosque sale siempre igual para la misma distancia de las compuertas', () => {
    expect(natureLayout(11, false, GATES, M)).toEqual(natureLayout(11, false, GATES, M));
    expect(natureLayout(11, false, GATES, M).puts.length).toBeGreaterThan(100);
  });
  it('lo grande del bosque nunca va delante ni cerca de ti', () => {
    const big = natureLayout(11, false, GATES, M).puts.filter((p) => /Tree|Pine|Bush|Rock/.test(p.n));
    expect(big.length).toBeGreaterThan(20);
    for (const p of big) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(5);
      const front = Math.abs(Math.atan2(p.x, -p.z)) < 0.8 && Math.hypot(p.x, p.z) < 16;
      expect(front).toBe(false);
    }
  });
  it('con fondo realista, sin bosque detrás de las compuertas', () => {
    const behind = (L: ReturnType<typeof natureLayout>): number => L.puts.filter((p) => p.z < -17 && Math.abs(p.x) < 14).length;
    expect(behind(natureLayout(11, true, GATES, M))).toBeLessThan(behind(natureLayout(11, false, GATES, M)));
  });
  it('la isla: acantilados detrás de las compuertas, palmeras dentro de la orilla y muelle detrás de ti', () => {
    const L = islandLayout(11, GATES, M);
    expect(L.puts.filter((p) => p.n.startsWith('Cliff')).length).toBeGreaterThanOrEqual(7);
    for (const p of L.puts.filter((q) => q.n.startsWith('PalmTree'))) expect(Math.hypot(p.x, p.z)).toBeLessThan(ISL_SHORE);
    expect(L.puts.filter((p) => p.n === 'Dock' || p.n === 'Dock_Broken')).toHaveLength(7);
    expect(islandLayout(11, GATES, M)).toEqual(L);
  });
  it('los mundos de la Travesía (risco, islas en el cielo, aldea): siempre iguales; nada grande pegado a ti ni delante de las compuertas', () => {
    // (un pack con medidas de verdad: los peñascos, de unos 3,5 m de radio; las casas, de 3; lo demás, pequeño)
    const R: Models = { has: () => true, foot: (n) => (/Cliff/.test(n) ? 3 : 0.4), rad: (n) => (/Cliff/.test(n) ? 3.6 : /House|Sawmill/.test(n) ? 3 : 1.2), top: (n) => (/Cliff/.test(n) ? 3 : 2) };
    for (const [name, lay] of [['risco', cliffLayout], ['islas', skyLayout], ['aldea', villageLayout]] as const) {
      const L = lay(11, GATES, R);
      expect(lay(11, GATES, R), name).toEqual(L);
      expect(L.puts.length, name).toBeGreaterThan(40);
      for (const p of L.puts) {
        if (p.y < -0.05) continue; // (lo que cuelga bajo el borde o sale de las nubes, por debajo del suelo)
        const big = /Cliff|House|Sawmill|Tree|Pine/.test(p.n) ? R.rad(p.n) * p.s : 0;
        if (!big) continue;
        expect(Math.hypot(p.x, p.z) - big, `${name}: ${p.n} a ${Math.hypot(p.x, p.z).toFixed(1)} m`).toBeGreaterThan(4);
        const front = Math.abs(Math.atan2(p.x, -p.z)) < 0.6 && Math.hypot(p.x, p.z) - big < 12;
        expect(front, `${name}: ${p.n} delante`).toBe(false);
      }
    }
    // las casas de la aldea, de cara a la plaza; en el risco, rocas al borde de la derecha
    expect(villageLayout(11, GATES, R).puts.filter((p) => /House|Sawmill/.test(p.n)).length).toBeGreaterThanOrEqual(4);
    expect(cliffLayout(11, GATES, R).puts.some((p) => p.n.startsWith('Rock_') && p.x > 0 && Math.hypot(p.x, p.z) > CLIFF_EDGE - 5)).toBe(true);
    expect(skyLayout(11, GATES, R).puts.filter((p) => p.n.startsWith('Rock_') && Math.abs(Math.hypot(p.x, p.z) - SKY_EDGE) < 1.5).length).toBeGreaterThan(15);
  });
  it('lo que no está en el pack no se pone', () => {
    const none: Models = { has: () => false, foot: () => 1, rad: () => 1 };
    expect(natureLayout(11, false, GATES, none).puts).toHaveLength(0);
    expect(islandLayout(11, GATES, none).puts).toHaveLength(0);
  });
});
