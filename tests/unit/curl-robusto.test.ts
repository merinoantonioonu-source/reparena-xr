// El curl a un brazo (la mancuerna, `curl`) con «Manos: filtro nuevo» (camino `robust`, `armRobust` en
// src/exercise/standing.ts): los saltos falsos de la mano que enseñó la caja negra del usuario (al reaparecer arriba, la
// mano saltaba 25-50 cm hacia abajo un instante: disparo al llegar arriba y lo más bajo del recorrido hundido), la mano
// perdida subiendo (opción A del usuario) y la pausa; y los curls limpios contando igual que siempre.
import { describe, expect, it } from 'vitest';
import { Rig, up, type P } from './curl2-rig.js';

// las mancuernas, cada una en su mano, a los lados
const L0: P = [-0.22, -0.78, -0.1], R0: P = [0.22, -0.78, -0.1], UP = 0.36;
const curlL = (g: Rig, upS = 0.8, holdS = 0.2, downS = 0.8): void => {
  g.move(L0, R0, up(L0, UP), R0, upS);
  g.hold(up(L0, UP), R0, holdS);
  g.move(up(L0, UP), R0, L0, R0, downS);
  g.hold(L0, R0, 0.4);
};
const curlR = (g: Rig, upS = 0.8, holdS = 0.2, downS = 0.8): void => {
  g.move(L0, R0, L0, up(R0, UP), upS);
  g.hold(L0, up(R0, UP), holdS);
  g.move(L0, up(R0, UP), L0, R0, downS);
  g.hold(L0, R0, 0.4);
};
const kinds = (g: Rig): string[] => g.ev.map((e) => e.type + ('side' in e && e.side ? (e.side === 'left' ? 'I' : 'D') : ''));

describe('curl a un brazo con el filtro nuevo · los curls limpios cuentan igual', () => {
  for (const fps of [72, 90])
    for (const [speed, upS, downS] of [['lentos', 0.9, 0.9], ['rápidos', 0.35, 0.35]] as const)
      it(`${speed}, alternando brazos, a ${fps} imágenes por segundo`, () => {
        const g = new Rig(fps, true, 'curl'), old = new Rig(fps, false, 'curl');
        for (const x of [g, old]) {
          x.hold(L0, R0, 0.6);
          for (let k = 0; k < 2; k++) {
            curlL(x, upS, 0.2, downS);
            curlR(x, upS, 0.2, downS);
          }
        }
        expect(kinds(g)).toEqual(['charge', 'topI', 'repI', 'charge', 'topD', 'repD', 'charge', 'topI', 'repI', 'charge', 'topD', 'repD']);
        expect(kinds(g)).toEqual(kinds(old));
      });
});

describe('curl a un brazo con el filtro nuevo · los saltos falsos de la mano ya no disparan', () => {
  it('arriba, aguantando, la mano salta 30 cm hacia abajo una imagen y vuelve: sin rayo hasta bajar de verdad', () => {
    for (const robust of [false, true]) {
      const g = new Rig(72, robust, 'curl');
      g.hold(L0, R0, 0.5);
      g.move(L0, R0, up(L0, UP), R0, 0.8);
      g.hold(up(L0, UP), R0, 0.05);
      g.step(up(L0, UP - 0.3), R0); // (el salto falso)
      g.hold(up(L0, UP), R0, 0.3);
      if (!robust) expect(g.count('rep')).toBe(1); // (lo de hoy: el rayo al llegar arriba)
      else {
        expect(g.count('rep')).toBe(0);
        g.move(up(L0, UP), R0, L0, R0, 0.8);
        expect(kinds(g)).toEqual(['charge', 'topI', 'repI']);
      }
    }
  });
  it('perdida un buen rato, reaparece arriba y a la imagen siguiente salta 50 cm hacia abajo: carga, y el rayo, al bajar', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.hold(null, R0, 2);
    g.hold(up(L0, 0.3), R0, 0.03);
    g.step(up(L0, -0.2), R0);
    g.step(up(L0, -0.32), R0);
    g.hold(up(L0, 0.31), R0, 0.4);
    expect(g.count('rep')).toBe(0);
    g.move(up(L0, 0.31), R0, L0, R0, 0.7);
    expect(kinds(g)).toEqual(['charge', 'topI', 'repI']);
  });
  it('un dato suelto muy bajo no hunde lo más bajo del recorrido (con lo de hoy, 10 cm y para rato)', () => {
    const g = new Rig(72, true, 'curl'), old = new Rig(72, false, 'curl');
    for (const x of [g, old]) {
      x.hold(L0, R0, 0.5);
      x.step(L0, up(R0, -0.4));
      x.hold(L0, R0, 0.5);
    }
    expect(g.det.curl.right.bottom).toBeGreaterThan(-0.79);
    expect(old.det.curl.right.bottom).toBeLessThan(-0.85);
  });
});

describe('curl a un brazo con el filtro nuevo · la mano perdida subiendo (opción A) y la pausa', () => {
  it('subir 15 cm, perderla 0,5 s y reaparecer abajo: no cuenta', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.move(L0, R0, up(L0, 0.15), R0, 0.4);
    g.hold(null, R0, 0.5);
    g.hold(L0, R0, 0.5);
    expect(g.count('rep') + g.count('charge')).toBe(0);
  });
  it('perderla subiendo y reaparecer arriba: cuenta, y el rayo sale al bajar', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.move(L0, R0, up(L0, 0.15), R0, 0.3);
    g.hold(null, R0, 0.4);
    g.hold(up(L0, UP), R0, 0.3);
    expect(kinds(g)).toEqual(['charge', 'topI']);
    g.move(up(L0, UP), R0, L0, R0, 0.7);
    expect(kinds(g)).toEqual(['charge', 'topI', 'repI']);
  });
  it('perdida subiendo más de 1,5 s: cuenta', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.move(L0, R0, up(L0, 0.15), R0, 0.3);
    g.hold(null, R0, 1.7);
    expect(kinds(g)).toEqual(['charge', 'repI']);
  });
  it('pausa arriba, cargado; al seguir con la pesa abajo, ningún rayo, y el curl siguiente como siempre', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.move(L0, R0, up(L0, UP), R0, 0.8);
    g.hold(up(L0, UP), R0, 0.3);
    g.det.resume();
    g.hold(L0, R0, 0.5);
    expect(kinds(g)).toEqual(['charge', 'topI']);
    curlL(g);
    expect(kinds(g)).toEqual(['charge', 'topI', 'charge', 'topI', 'repI']);
  });
});

describe('curl a un brazo con el filtro nuevo · lo que enseñó la segunda caja negra', () => {
  it('la mano perdida abajo que reaparece ya arriba carga, y el rayo sale al bajar', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    g.hold(null, R0, 0.6);
    g.hold(up(L0, UP), R0, 0.5);
    expect(kinds(g)).toEqual(['charge', 'topI']);
    g.move(up(L0, UP), R0, L0, R0, 0.7);
    expect(kinds(g)).toEqual(['charge', 'topI', 'repI']);
  });
  it('tras el rayo, perdida abajo un rato y vuelta a media altura: el curl siguiente vuelve a cargar', () => {
    const g = new Rig(72, true, 'curl');
    g.hold(L0, R0, 0.5);
    curlL(g, 0.8, 0.2, 0.4);
    g.hold(null, R0, 1);
    const mid = up(L0, 0.15);
    g.hold(mid, R0, 0.5);
    g.move(mid, R0, up(L0, UP), R0, 0.5);
    g.hold(up(L0, UP), R0, 0.2);
    expect(kinds(g)).toEqual(['charge', 'topI', 'repI', 'charge', 'topI']);
  });
  it('con la imagen a 20 por segundo, un respingo de una sola imagen no carga ni dispara', () => {
    const g = new Rig(20, true, 'curl'), mid = up(L0, 0.2);
    g.hold(L0, R0, 0.5);
    g.move(L0, R0, mid, R0, 0.6);
    g.step(up(L0, 0.31), R0); // (una imagen 11 cm más arriba)
    g.hold(mid, R0, 0.5);
    expect(g.ev).toEqual([]);
  });
});
