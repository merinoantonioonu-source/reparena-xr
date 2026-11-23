// El marcador de la Travesía, en el lado despejado y más alto (elegido por el usuario: el paisaje lo atravesaba y en el
// risco quedaba dentro de la pared): dónde va y que nada alto del paisaje pase por él.
import { describe, expect, it } from 'vitest';
import { BOARD_CLEAR_U, boardSpan, TREK_BOARD_BOTTOM, trekBoardSide, trekBoardSpot, type BoardSpot } from '../../src/modes/trek/board-spot';
import { coastDecoPuts, decoPuts, putSpanU, skyDecoPuts, type Put } from '../../src/modes/trek/plat/pieces';

const spot = (): BoardSpot => ({ side: -1, x: 0, y: 0, z: 0, rx: 0, ry: 0, w: 0 });
/** Lo alto que no es roca de la tabla de cajas: árboles y palmeras, con su copa (m de radio, a escala 1). */
const CROWN: Record<string, number> = { CommonTree_3: 2.2, CommonTree_4: 2.2, CommonTree_5: 2.2, Pine_2: 1.6, Pine_4: 1.6, Pine_5: 1.6, DeadTree_1: 1.6, DeadTree_2: 1.6, PalmTree_1: 2.5, PalmTree_2: 2.5, PalmTree_3: 2.5 };

describe('el marcador de la Travesía', () => {
  it('en el risco, siempre a la derecha (sobre el vacío); en los demás, en el lado elegido', () => {
    expect(trekBoardSide('cliff', 'left')).toBe(1);
    expect(trekBoardSide('cliff', 'right')).toBe(1);
    for (const w of ['forest', 'sky', 'coast'] as const) {
      expect(trekBoardSide(w, 'left')).toBe(-1);
      expect(trekBoardSide(w, 'right')).toBe(1);
    }
  });

  it('por encima de arbustos y rocas, a la vista y de cara a ti', () => {
    for (const pick of ['left', 'right']) {
      const b = trekBoardSpot('forest', pick, spot()), H = b.w * 0.445;
      expect(b.y - H / 2).toBeCloseTo(TREK_BOARD_BOTTOM, 5);
      expect(Math.sign(b.x)).toBe(pick === 'right' ? 1 : -1);
      expect(b.z).toBeLessThan(-1); // (por delante)
      const [a, c] = boardSpan(b);
      expect(a).toBeGreaterThan(1.5); // (fuera de la pasarela)
      expect(c).toBeLessThan(BOARD_CLEAR_U);
      // de cara a ti: su normal apunta a tu cabeza
      expect(Math.abs(Math.atan2(-b.x, -b.z) - b.ry)).toBeLessThan(1e-9);
    }
  });

  it('nada alto del paisaje pasa por él (40 trozos de cada mundo, a los dos lados)', () => {
    for (const pick of ['left', 'right'] as const) {
      const b = trekBoardSpot('forest', pick, spot()), side = b.side, outer = boardSpan(b)[1];
      const worlds: [string, (c: number) => Put[]][] = [
        ['bosque', (c) => decoPuts(c, [], c % 4, side)],
        ['islas', (c) => skyDecoPuts(c, [], side)],
        ['costa', (c) => coastDecoPuts(c, [], side)],
      ];
      for (const [name, make] of worlds)
        for (let c = -2; c < 38; c++)
          for (const P of make(c)) {
            // solo lo alto: árboles, palmeras e islotes (las rocas medianas, los islotes bajos de la costa, los arbustos, las
            // plantas, los barriles y las botellas no llegan a la altura del marcador)
            const sp = putSpanU(P);
            if (!CROWN[P.n] && !(sp && !P.n.startsWith('Rock_'))) continue;
            const crown = (CROWN[P.n] ?? 0) * Math.max(P.sx, P.sz);
            const lo = sp ? sp[0] : P.u - crown, hi = sp ? sp[1] : P.u + crown;
            const inner = side > 0 ? lo : -hi;
            if (!(inner >= outer || (side > 0 ? hi : -lo) <= 1.0)) throw new Error(`${name}, trozo ${c}, ${pick}: ${P.n} en u=${P.u.toFixed(2)} (${lo.toFixed(2)}…${hi.toFixed(2)}) atraviesa el marcador (hasta ${outer.toFixed(2)})`);
          }
    }
  });

  it('sin marcador a un lado, el paisaje sale igual que siempre', () => {
    for (let c = 0; c < 10; c++) {
      expect(decoPuts(c, [], 0, 0)).toEqual(decoPuts(c, [], 0));
      expect(skyDecoPuts(c, [], 0)).toEqual(skyDecoPuts(c, []));
      expect(coastDecoPuts(c, [], 0)).toEqual(coastDecoPuts(c, []));
    }
  });
});
