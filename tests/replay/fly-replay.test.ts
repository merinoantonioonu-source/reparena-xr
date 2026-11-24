// La caja negra del vuelo (src/core/flybox.ts) y su reproductor: un vuelo grabado, pasado otra vez por el planeador con los
// mismos números, da lo mismo (alturas, lados y retos pasados); con otros números, se ve qué habría cambiado. Así cada cambio
// de los números del vuelo se prueba con el vuelo de verdad del usuario: sus capturas, en tests/replay/capturas/vuelo-*.txt.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FB, fbParse, flyReplay } from '../../src/core/flybox.js';
import { course, DT, piece as mk, Sim } from '../unit/plat-sim.js';

const TOP = 0.45;

/** Un vuelo de mentira (la suave): pasa un aro escorándose y un puente bajando el pecho, grabado en la caja negra. */
function flight(): { text: string; s: Sim } {
  const s = new Sim({ trekAuto: 1, pushDepth: 13, trekFly: 1, flyAlt: 1 });
  s.env.ex = 'pushup';
  s.env.mem.set('reparenaxr-flytuto2', 1); // (la práctica de vuelo, ya hecha)
  s.env.calibRef = TOP;
  s.head.y = TOP;
  s.r.calibrate(TOP, 0, 0);
  const R = mk(1, 'ring', 50, 0, { u: 1, h: 6 }), A = mk(2, 'arch', 80, 0, { h: 4.5, len: 2 }), P = mk(3, 'pillar', 110, 0, { u: 0.4, side: 1, h: 14, len: 1.2 });
  s.load(course([R, A, P, mk(4, 'chest', 400, 0)]));
  FB.clear(s.env.now);
  let after = 72;
  for (let i = 0; i < 72 * 60 && after > 0; i++) {
    if (P.judged) after--;
    const room = (p: typeof R): number => p.at - s.r.dist;
    s.head.x = room(R) < 12 && !R.judged ? 0.05 : room(P) < 12 && room(A) < 0 ? -0.12 : 0;
    s.head.y = room(A) < 9 && !A.judged ? TOP - 0.11 : TOP;
    s.frame();
    FB.rec(s.env.now, DT, s.r, s.head, s.env.hands, false);
  }
  return { text: FB.text('prueba', 'cabecera'), s };
}

describe('la caja negra del vuelo', () => {
  it('reproducida con los mismos números, da lo mismo que en la partida', () => {
    const { text, s } = flight();
    const P = fbParse(text);
    expect(P.rows.length).toBeGreaterThan(36 * 10);
    expect(P.cfg.model).toBe('pos');
    const out = flyReplay(P);
    // las alturas y los lados, casi iguales (la grabación va a 36 por segundo y redondea al milímetro)
    const last = P.rows[P.rows.length - 1];
    expect(Math.abs(out.alt[out.alt.length - 1] - last.alt)).toBeLessThan(0.3);
    expect(Math.abs(out.u[out.u.length - 1] - last.u)).toBeLessThan(0.2);
    // los tres retos, juzgados igual que en la partida (y los tres pasados)
    expect(out.judged.map((j) => j.k)).toEqual(['ring', 'arch', 'pillar']);
    for (const j of out.judged) {
      expect(j.ok, j.k).toBe(true);
      expect(j.rec, j.k).toBe(true);
    }
    expect(s.r.passed).toBe(3);
  });

  it('con otros números, se ve qué habría cambiado (con medio recorrido de bajada, el puente se habría chocado)', () => {
    const P = fbParse(flight().text);
    const out = flyReplay(P, { depth: 0.3 });
    expect(out.judged.find((j) => j.k === 'arch')?.ok).toBe(false);
  });

  // las capturas del usuario (si hay): se leen y se reproducen sin errores, y se imprime lo que habría pasado
  const dir = join(__dirname, 'capturas');
  const caps = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('vuelo-') && f.endsWith('.txt')) : [];
  for (const f of caps) {
    it(`la captura ${f} se reproduce`, () => {
      for (const part of readFileSync(join(dir, f), 'utf8').split('\n==========\n')) {
        const P = fbParse(part);
        if (!P.rows.length) continue;
        const out = flyReplay(P);
        expect(out.alt.length).toBe(P.rows.length);
      }
    });
  }
});
