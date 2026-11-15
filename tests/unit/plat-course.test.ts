// La Travesía de plataformas: el recorrido (docs/REGLAS.md › Travesía). Comprueba, con miles de tramos al azar, lo que pide
// el usuario: el tramo acaba siempre en su cofre; la carrera antes de la primera pieza; nada se solapa y hay sitio para
// cada movimiento (levantarte, caer y volver a saltar, volver al centro); nunca dos obstáculos a un lado seguidos del
// mismo lado; las clases son las del tramo y salen todas si cabe; el hueco y la viga miden lo que toca; y la dificultad
// sube de un tramo a otro (hueco más largo, obstáculo a un lado desde el segundo), no dentro de él.
import { describe, expect, it } from 'vitest';
import { buildCourse, courseKinds, courseRules, minGap } from '../../src/modes/trek/plat/course.js';
import { piece, RUN_UP, type CourseEnv, type Piece } from '../../src/modes/trek/plat/types.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const env = (seed: number, vmax: number, len: number): CourseEnv => ({ vmax, len, rnd: rng(seed) });

describe('el recorrido de la Travesía de plataformas', () => {
  it('5.000 recorridos al azar cumplen todas las reglas', () => {
    const r = rng(12345);
    const between = (a: number, b: number): number => a + (b - a) * r();
    for (let n = 0; n < 5000; n++) {
      const tramo = Math.floor(r() * 7);
      const rank = Math.floor(r() * 7);
      const vmax = between(1.2, 4.8);
      const len = between(40, 300);
      const start = between(0, 500);
      const id0 = Math.floor(r() * 1000);
      const c = buildCourse(env(n + 1, vmax, len), tramo, rank, start, id0);
      const tag = `#${n} tramo ${tramo} rango ${rank} vmax ${vmax.toFixed(2)} len ${len.toFixed(0)}`;
      expect(courseRules(c.pieces, vmax), tag).toEqual([]);
      const last = c.pieces[c.pieces.length - 1]!;
      expect(last.k, tag).toBe('chest');
      expect(last.at, tag).toBeCloseTo(start + len, 9);
      expect(c.end, tag).toBeCloseTo(start + len, 9);
      expect(c.pieces[0]!.at, tag).toBeGreaterThanOrEqual(start + RUN_UP);
      c.pieces.forEach((p, i) => {
        expect(p.id, tag).toBe(id0 + i);
        expect(p.tramo, tag).toBe(tramo);
      });
      const kinds = courseKinds(tramo);
      for (const p of c.pieces) if (p.k !== 'chest') expect(kinds, tag).toContain(p.k);
      if (len >= 120 && vmax <= 3.2) for (const k of kinds) expect(c.pieces.some((p) => p.k === k), `${tag}: falta ${k}`).toBe(true);
    }
  });

  it('el mismo azar da el mismo recorrido', () => {
    const a = buildCourse(env(7, 3, 200), 3, 2, 40, 10);
    const b = buildCourse(env(7, 3, 200), 3, 2, 40, 10);
    expect(b).toEqual(a);
    const c = buildCourse(env(8, 3, 200), 3, 2, 40, 10);
    expect(c).not.toEqual(a);
  });

  it('la dificultad sube de un tramo a otro', () => {
    const gaps = (tramo: number): number[] => {
      const out: number[] = [];
      for (let n = 0; n < 300; n++) for (const p of buildCourse(env(n + 1, 3, 250), tramo, 2, 0, 0).pieces) if (p.k === 'gap') out.push(p.len);
      return out;
    };
    const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean(gaps(4))).toBeGreaterThan(mean(gaps(0)));
    let side0 = 0;
    let side1 = 0;
    for (let n = 0; n < 300; n++) {
      side0 += buildCourse(env(n + 1, 3, 250), 0, 0, 0, 0).pieces.filter((p) => p.k === 'side').length;
      side1 += buildCourse(env(n + 1, 3, 250), 1, 0, 0, 0).pieces.filter((p) => p.k === 'side').length;
    }
    expect(side0).toBe(0);
    expect(side1).toBeGreaterThan(0);
  });

  it('dos obstáculos a un lado seguidos van a lados opuestos', () => {
    let pares = 0;
    for (let n = 0; n < 500; n++) {
      const ps = buildCourse(env(n + 1, 2, 300), 6, 0, 0, 0).pieces;
      for (let i = 1; i < ps.length; i++) {
        if (ps[i]!.k === 'side' && ps[i - 1]!.k === 'side') {
          pares++;
          expect(ps[i]!.side).toBe(-ps[i - 1]!.side);
        }
      }
    }
    expect(pares).toBeGreaterThan(0);
  });
});

describe('courseRules detecta lo que incumple', () => {
  const V = 3;
  const chest = (id: number, at: number): Piece => piece(id, 'chest', at, 0);
  const ok = (): Piece[] => [piece(0, 'log', 20, 0), piece(1, 'gap', 40, 0, { len: 1 }), chest(2, 100)];

  it('una lista buena no incumple nada', () => {
    expect(courseRules(ok(), V)).toEqual([]);
  });

  it('el orden de at', () => {
    const ps = ok();
    ps[1]!.at = 10;
    const r = courseRules(ps, V);
    expect(r.some((s) => s.includes('orden') && s.includes('1'))).toBe(true);
  });

  it('piezas solapadas o más juntas que el mínimo', () => {
    const ps = [piece(0, 'gap', 20, 0, { len: 1 }), piece(1, 'log', 21.5, 0), chest(2, 100)];
    expect(minGap(ps[0]!, ps[1]!, V)).toBeGreaterThan(0.5);
    const r = courseRules(ps, V);
    expect(r.some((s) => s.includes('juntas') && s.includes('0') && s.includes('1'))).toBe(true);
    // el solape también cuenta
    const solape = [piece(0, 'gap', 20, 0, { len: 5 }), piece(1, 'log', 22, 0), chest(2, 100)];
    expect(courseRules(solape, V).some((s) => s.includes('juntas'))).toBe(true);
  });

  it('el sitio que pide cada movimiento (levantarse, volver al centro)', () => {
    const lado = [piece(0, 'side', 20, 0, { side: 1 }), piece(1, 'log', 24, 0), chest(2, 100)]; // 4 m < 1,5·3 = 4,5 m
    expect(courseRules(lado, V).some((s) => s.includes('juntas'))).toBe(true);
    const salto = [piece(0, 'log', 20, 0), piece(1, 'log', 23.5, 0), chest(2, 100)]; // 3,5 m < 1,1·3 y < 4 m
    expect(courseRules(salto, V).some((s) => s.includes('juntas'))).toBe(true);
  });

  it('dos side seguidos del mismo lado', () => {
    const ps = [piece(0, 'side', 20, 0, { side: 1 }), piece(1, 'side', 40, 0, { side: 1 }), chest(2, 100)];
    expect(courseRules(ps, V).some((s) => s.includes('mismo lado'))).toBe(true);
    ps[1]!.side = -1;
    expect(courseRules(ps, V)).toEqual([]);
  });

  it('una side sin lado', () => {
    const ps = [piece(0, 'side', 20, 0), chest(1, 100)];
    expect(courseRules(ps, V).some((s) => s.includes('lado') && s.includes('0'))).toBe(true);
  });

  it('que la última no sea el cofre', () => {
    const ps = ok().slice(0, 2);
    expect(courseRules(ps, V).some((s) => s.includes('cofre'))).toBe(true);
    expect(courseRules([], V).some((s) => s.includes('cofre'))).toBe(true);
  });

  it('un hueco fuera de medida', () => {
    for (const len of [0.7, 1.7]) {
      const ps = ok();
      ps[1]!.len = len;
      expect(courseRules(ps, V).some((s) => s.includes('hueco') && s.includes('1'))).toBe(true);
    }
  });

  it('una viga fuera de medida', () => {
    for (const h of [0.2, 0.36]) {
      const ps = [piece(0, 'low', 20, 0, { h }), chest(1, 100)];
      expect(courseRules(ps, V).some((s) => s.includes('viga') && s.includes('0'))).toBe(true);
    }
  });
});
