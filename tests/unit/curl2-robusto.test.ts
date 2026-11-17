// El curl con barra o kettlebell con «Manos: filtro nuevo» (camino `robust`, `barRobust` en src/exercise/standing.ts): los
// fallos de curl2-fallos.test.ts, ya sin disparos fantasma, y los curls limpios contando igual que siempre (kettlebell y
// barra, lentos y rápidos, a 72 y a 90 imágenes por segundo).
import { describe, expect, it } from 'vitest';
import { BL, BR, KL, KR, mix, Rig, SUBE, up, Y0, type P } from './curl2-rig.js';

const shots = (g: Rig): number => g.count('rep');

/** Un curl limpio desde el reposo (l0, r0): subir, aguantar arriba, bajar y quedarse abajo. */
function curl(g: Rig, l0: P, r0: P, upS: number, holdS: number, downS: number): void {
  g.move(l0, r0, up(l0, SUBE), up(r0, SUBE), upS);
  g.hold(up(l0, SUBE), up(r0, SUBE), holdS);
  g.move(up(l0, SUBE), up(r0, SUBE), l0, r0, downS);
  g.hold(l0, r0, 0.4);
}

describe('curl2 con el filtro nuevo · los curls limpios cuentan igual', () => {
  for (const fps of [72, 90])
    for (const [name, L, R] of [['kettlebell', KL, KR], ['barra ancha', BL, BR]] as const)
      for (const [speed, upS, downS] of [['lentos', 0.9, 0.9], ['rápidos', 0.35, 0.35]] as const)
        it(`${name}, ${speed}, a ${fps} imágenes por segundo: carga arriba y dispara al bajar, una vez cada uno`, () => {
          const g = new Rig(fps, true), old = new Rig(fps, false);
          for (const x of [g, old]) {
            x.hold(L, R, 0.6);
            for (let k = 0; k < 3; k++) curl(x, L, R, upS, 0.25, downS);
          }
          expect(g.types).toEqual(['charge', 'top', 'rep', 'charge', 'top', 'rep', 'charge', 'top', 'rep']);
          expect(g.types).toEqual(old.types);
          // (y a la vez que lo de siempre: como mucho unas imágenes de diferencia)
          const tg = g.ev.filter((e) => e.type === 'rep').map((e) => e.t), to = old.ev.filter((e) => e.type === 'rep').map((e) => e.t);
          tg.forEach((t, k) => expect(Math.abs(t - to[k])).toBeLessThan(0.15));
        });
});

describe('curl2 con el filtro nuevo · los fallos de hoy ya no disparan', () => {
  it('D1 · un fotograma 30 cm más bajo no hunde lo más bajo del recorrido ni hace «subir» estando quieto', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.step(up(KL, -0.3), up(KR, -0.3));
    g.hold(KL, KR, 0.5);
    expect(g.det.bar.bottom).toBeGreaterThan(-0.79);
    expect(g.det.bar.state).toBe('down');
    g.hold(null, null, 0.4); // (y perderlas luego, quieto, tampoco)
    g.hold(KL, KR, 0.5);
    expect(g.ev).toEqual([]);
  });

  it('D2 · subir 15 cm, perder las manos 0,5 s y reaparecer abajo: no cuenta (opción A del usuario)', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.15), up(KR, 0.15), 0.4);
    g.hold(null, null, 0.5);
    g.hold(KL, KR, 0.5);
    expect(g.count('rep') + g.count('charge')).toBe(0);
  });
  it('D2 · perder las manos subiendo y reaparecer arriba: cuenta, y el rayo sale al bajar (no al perderlas)', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.15), up(KR, 0.15), 0.3);
    const lost = g.t;
    g.hold(null, null, 0.4);
    g.hold(up(KL, SUBE), up(KR, SUBE), 0.3);
    expect(g.types).toEqual(['charge', 'top']);
    expect(g.at('charge')!).toBeGreaterThan(lost + 0.4);
    const down = g.t;
    g.move(up(KL, SUBE), up(KR, SUBE), KL, KR, 0.7);
    expect(g.types).toEqual(['charge', 'top', 'rep']);
    expect(g.at('rep')!).toBeGreaterThan(down);
  });
  it('D2 · perdidas subiendo más de 1,5 s: cuenta (la pesa las tapaba)', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.15), up(KR, 0.15), 0.3);
    g.hold(null, null, 1.4);
    expect(shots(g)).toBe(0);
    g.hold(null, null, 0.3);
    expect(g.types).toEqual(['charge', 'rep']);
  });
  it('D2 · perdidas subiendo y reaparecen abajo pasado 1 s: la subida se hizo sin verla; cuenta', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.15), up(KR, 0.15), 0.3);
    g.hold(null, null, 1.2);
    g.hold(KL, KR, 0.4);
    expect(g.types).toEqual(['charge', 'rep']);
  });

  it('D3 · dos manos juntas que aparecen 3 fotogramas 30 cm más arriba: nada', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.hold(up(KL, 0.3), up(KR, 0.3), 3 / 72);
    g.hold(KL, KR, 0.5);
    expect(g.ev).toEqual([]);
  });

  it('D4 · barra ancha: una mano mal colocada 30 cm arriba (0,5 s) no manda sobre la buena', () => {
    const g = new Rig(72, true);
    g.hold(BL, BR, 0.5);
    g.hold(up(BL, 0.3), BR, 0.5);
    g.hold(BL, BR, 0.3);
    expect(g.ev).toEqual([]);
  });

  it('D5 · con la derecha congelada a medio camino, la izquierda que sube cuenta el curl (sin «Sube hasta el hombro»)', () => {
    const g = new Rig(72, true), mid = up(KR, 0.15);
    g.hold(KL, KR, 0.5);
    for (let i = 1; i <= 58; i++) {
      const k = i / 58, e = k * k * (3 - 2 * k);
      g.step(mix(KL, up(KL, SUBE), e), up(KR, Math.min(0.15, SUBE * e)));
    }
    g.hold(up(KL, SUBE), mid, 0.2);
    g.move(up(KL, SUBE), mid, KL, KR, 0.8);
    g.hold(KL, KR, 0.3);
    expect(g.types).toEqual(['charge', 'top', 'rep']);
  });

  it('la mano que reaparece con un salto falso mientras subes no dispara (la de la caja negra del usuario)', () => {
    // subiendo con la kettlebell, la izquierda se pierde y reaparece 16 cm más abajo un instante, y la derecha se pierde
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, 0.2), up(KR, 0.2), 0.3);
    g.hold(null, null, 0.1);
    g.hold(up(KL, 0.25), null, 0.05);
    g.step(up(KL, 0.09), up(KR, 0.2)); // (el salto falso, con la derecha que reaparece)
    g.hold(up(KL, 0.3), up(KR, 0.3), 0.1);
    g.move(up(KL, 0.3), up(KR, 0.3), up(KL, SUBE), up(KR, SUBE), 0.2);
    g.hold(up(KL, SUBE), up(KR, SUBE), 0.2);
    expect(shots(g)).toBe(0); // (aún arriba: el rayo, al bajar)
    g.move(up(KL, SUBE), up(KR, SUBE), KL, KR, 0.6);
    expect(shots(g)).toBe(1);
  });
});

describe('curl2 con el filtro nuevo · la pausa', () => {
  it('pausa arriba, cargado; en la pausa se baja la pesa y una mano va al botón: al seguir, ningún rayo', () => {
    const g = new Rig(72, true);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, SUBE), up(KR, SUBE), 0.8);
    g.hold(up(KL, SUBE), up(KR, SUBE), 0.3);
    expect(g.types).toEqual(['charge', 'top']);
    g.det.barResume(); // (al quitar la pausa)
    // la izquierda con la pesa abajo; la derecha, a 80 cm, vuelve del botón de la pausa hasta la pesa
    const far: P = [0.6, -0.25, -0.35];
    g.move(KL, far, KL, far, 0.1);
    g.move(KL, far, KL, KR, 0.6);
    g.hold(KL, KR, 0.5);
    expect(g.types).toEqual(['charge', 'top']); // (nada nuevo)
    expect(g.det.charged).toBe(false);
    // y el curl siguiente, como siempre
    curl(g, KL, KR, 0.8, 0.2, 0.8);
    expect(g.types).toEqual(['charge', 'top', 'charge', 'top', 'rep']);
  });
  it('sin el filtro nuevo, esa misma pausa dispara al seguir (lo de hoy)', () => {
    const g = new Rig(72, false);
    g.hold(KL, KR, 0.5);
    g.move(KL, KR, up(KL, SUBE), up(KR, SUBE), 0.8);
    g.hold(up(KL, SUBE), up(KR, SUBE), 0.3);
    g.hold(KL, [0.6, -0.25, -0.35], 0.2);
    expect(g.types).toEqual(['charge', 'top', 'rep']);
  });
});

describe('curl2 con el filtro nuevo · apagado, como siempre', () => {
  it('sin robust, el camino de siempre (el mismo que comparan las pruebas con RepArena)', () => {
    const a = new Rig(72, false);
    a.hold(KL, KR, 0.5);
    a.hold(up(KL, 0.3), up(KR, 0.3), 3 / 72);
    a.hold(KL, KR, 0.5);
    expect(a.types).toEqual(['charge', 'top', 'rep']); // (el D3 de hoy)
    expect(Y0).toBe(1.6);
  });
});
