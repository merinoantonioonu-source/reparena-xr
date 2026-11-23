// Las cuestas de la Travesía (elegido por el usuario: el terreno entero ondula; cuesta arriba cuesta más y cuesta abajo
// menos): el perfil de cada tramo y lo que hace con el avance.
import { describe, expect, it } from 'vitest';
import { buildGrade, GRADE_MAX, GRADE_START, gradeH, gradeK, gradeSlope } from '../../src/modes/trek/plat/grade';
import { buildCourse } from '../../src/modes/trek/plat/course';
import { Sim } from './plat-sim';
import type { Piece } from '../../src/modes/trek/plat/types';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const WORLDS = ['forest', 'cliff', 'sky', 'coast'] as const;

function tramo(i: number, seed: number): { pieces: Piece[]; s0: number; s1: number } {
  const c = buildCourse({ vmax: 2.6, len: 120, rnd: rng(seed) }, i, 3, 0, 1);
  return { pieces: c.pieces, s0: 0, s1: c.end };
}

describe('las cuestas', () => {
  it('cada tramo empieza y acaba llano y a ras, sin escalones, y no pasa de lo empinado de su mundo', () => {
    for (const w of WORLDS)
      for (let seed = 1; seed <= 20; seed++) {
        const t = tramo(seed % 4, seed), G = [buildGrade(t.pieces, t.s0, t.s1, w, 1, seed)];
        expect(Math.abs(gradeH(G, t.s0 + 1))).toBeLessThan(1e-3);
        expect(Math.abs(gradeH(G, t.s1))).toBeLessThan(0.02);
        let prev = gradeH(G, t.s0), maxG = 0;
        for (let s = t.s0; s < t.s1; s += 0.25) {
          const h = gradeH(G, s);
          expect(Math.abs(h - prev), `${w} ${seed} en ${s}`).toBeLessThan(0.05); // (sin escalones)
          prev = h;
          maxG = Math.max(maxG, Math.abs(gradeSlope(G, s)));
        }
        expect(maxG).toBeLessThanOrEqual(GRADE_MAX[w] * 1.05);
      }
  });

  it('lo que pide suelo llano (el cofre, los huecos, las plataformas, el jefe…) queda llano y a ras', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = tramo(seed % 4, seed), G = [buildGrade(t.pieces, t.s0, t.s1, 'cliff', 1, seed)];
      for (const p of t.pieces)
        if (['chest', 'gap', 'glide', 'step', 'crawl', 'boss', 'spring', 'fork', 'bob', 'sink'].includes(p.k))
          for (let s = p.at; s <= p.at + p.len; s += 0.25) expect(Math.abs(gradeH(G, s)), `${p.k} en ${s}`).toBeLessThan(0.01);
      for (let s = 0; s < GRADE_START; s += 0.5) expect(Math.abs(gradeH(G, s))).toBeLessThan(1e-3);
    }
  });

  it('hay cuestas de verdad: en el risco, subidas de más de 1,5 m', () => {
    let top = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = tramo(1, seed), G = [buildGrade(t.pieces, t.s0, t.s1, 'cliff', 1, seed)];
      for (let s = 0; s < t.s1; s += 1) top = Math.max(top, gradeH(G, s));
    }
    expect(top).toBeGreaterThan(1.5);
  });

  it('el mismo tramo, el mismo perfil', () => {
    const t = tramo(2, 7);
    expect(Array.from(buildGrade(t.pieces, 0, t.s1, 'forest', 0.5, 7).h)).toEqual(Array.from(buildGrade(t.pieces, 0, t.s1, 'forest', 0.5, 7).h));
  });

  it('cuesta arriba cada repetición lleva menos lejos y cuesta abajo más', () => {
    expect(gradeK(0)).toBe(1);
    expect(gradeK(0.1)).toBeLessThan(0.8);
    expect(gradeK(-0.1)).toBeGreaterThan(1.1);
    expect(gradeK(1)).toBeCloseTo(0.65, 5);
  });

  it('en la marcha: el mismo ritmo avanza menos subiendo; sin repeticiones, te paras también bajando', () => {
    const up = new Sim({ trekHills: 1 }), flat = new Sim({ trekHills: 0 });
    for (const s of [up, flat]) s.r.addTramo(0, 120);
    // (las mismas repeticiones, cada 1,2 s, durante 40 s)
    const go = (s: Sim): void => {
      for (let i = 0; i < 40 * 72; i++) {
        if (i % 86 === 0) s.r.rep(true);
        s.frame();
      }
    };
    go(flat);
    go(up);
    expect(up.r.grades.length).toBe(1);
    expect(flat.r.grades.length).toBe(0);
    // sin repeticiones, se acaba parando (también cuesta abajo)
    for (let i = 0; i < 20 * 72; i++) up.frame();
    expect(up.r.tk.v).toBeLessThan(0.05);
  });
});
