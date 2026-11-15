// La Travesía de plataformas: el recorrido (docs/REGLAS.md › Travesía). Comprueba, con miles de tramos al azar, lo que pide
// el usuario: el tramo acaba siempre en su cofre; la carrera antes de la primera pieza; nada se solapa y hay sitio para
// cada movimiento (levantarte, caer y volver a saltar, volver al centro); nunca dos obstáculos a un lado seguidos del
// mismo lado; las clases son las del tramo y salen todas si cabe (el obstáculo a un lado y la plataforma, desde el segundo
// tramo; el túnel y el muro, desde el tercero); el hueco, la viga, la plataforma, el túnel y el muro miden lo que toca; hay
// sitio para bajar de una plataforma, para frenar ante un paso y para levantarse; y la dificultad sube de un tramo a otro
// (hueco más largo, obstáculo a un lado desde el segundo), no dentro de él.
import { describe, expect, it } from 'vitest';
import { buildCourse, courseKinds, courseRules, minGap } from '../../src/modes/trek/plat/course.js';
import { DROP_ROOM, FLOOR_UP_S, HALT_BRAKE, JUMP_GAP_S, LAND_PAST, MIN_GAP, piece, RUN_UP, STOP_AT, type CourseEnv, type Piece } from '../../src/modes/trek/plat/types.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const env = (seed: number, vmax: number, len: number): CourseEnv => ({ vmax, len, rnd: rng(seed) });

describe('el recorrido de la Travesía de plataformas', () => {
  it('el primer tramo, aun con lo más corto (40 m), trae siempre el tronco, la viga y el hueco', () => {
    const r = rng(777);
    for (let n = 0; n < 2000; n++) {
      const vmax = 1.2 + 3.6 * r();
      const c = buildCourse(env(n + 7, vmax, 40), 0, 0, 500 * r(), 0);
      expect(courseRules(c.pieces, vmax)).toEqual([]);
      for (const k of courseKinds(0)) expect(c.pieces.some((p) => p.k === k), `#${n} vmax ${vmax.toFixed(2)}: falta ${k}`).toBe(true);
    }
  });

  it('el primer tramo de 40 m cabe también con el peor azar (carrera y separaciones al máximo) a cualquier velocidad', () => {
    for (const rnd of [0, 0.25, 0.5, 0.75, 0.9999]) {
      for (let vmax = 1.2; vmax <= 4.8001; vmax += 0.1) {
        for (const rank of [0, 3, 6]) {
          const c = buildCourse({ vmax, len: 40, rnd: () => rnd }, 0, rank, 0, 0);
          expect(courseRules(c.pieces, vmax)).toEqual([]);
          for (const k of courseKinds(0)) expect(c.pieces.some((p) => p.k === k), `rnd ${rnd} vmax ${vmax.toFixed(2)} rango ${rank}: falta ${k}`).toBe(true);
        }
      }
    }
  });

  it('cada clase de pieza entra en su tramo: plataforma y lado desde el 1, túnel y muro desde el 2', () => {
    expect(courseKinds(0)).toEqual(['log', 'low', 'gap']);
    expect(courseKinds(1)).toEqual(['log', 'low', 'gap', 'side', 'step']);
    for (const t of [2, 3, 6]) expect(courseKinds(t)).toEqual(['log', 'low', 'gap', 'side', 'step', 'crawl', 'burpee']);
    for (let n = 0; n < 200; n++) {
      for (const [t, ausentes] of [[0, ['side', 'step', 'crawl', 'burpee']], [1, ['crawl', 'burpee']]] as const) {
        const ks = buildCourse(env(n + 1, 3, 250), t, 2, 0, 0).pieces.map((p) => p.k);
        for (const k of ausentes) expect(ks, `tramo ${t}`).not.toContain(k);
      }
    }
  });

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
      if (len >= 150 && vmax <= 3.2) for (const k of kinds) expect(c.pieces.some((p) => p.k === k), `${tag}: falta ${k}`).toBe(true);
      // Las medidas de las clases nuevas (courseRules ya las comprueba; aquí, además, que las de un mismo tramo y rango no
      // se salen de lo que toca por el tramo).
      for (const p of c.pieces) {
        if (p.k === 'step') {
          expect(p.h, tag).toBeGreaterThanOrEqual(0.25);
          expect(p.h, tag).toBeLessThanOrEqual(0.5);
          expect(p.len, tag).toBeGreaterThanOrEqual(4);
          expect(p.len, tag).toBeLessThanOrEqual(9);
        } else if (p.k === 'crawl') {
          expect(Number.isInteger(p.n), tag).toBe(true);
          expect(p.n, tag).toBeGreaterThanOrEqual(2);
          expect(p.n, tag).toBeLessThanOrEqual(5);
          expect(p.len, tag).toBe(2);
        } else if (p.k === 'burpee') {
          expect(p.len, tag).toBe(0.5);
          expect(p.h, tag).toBeGreaterThanOrEqual(0.6);
          expect(p.h, tag).toBeLessThanOrEqual(0.8);
        }
      }
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

  it('la plataforma, el túnel y el muro piden más con el tramo y el rango', () => {
    const media = (tramo: number, rank: number, k: 'step' | 'crawl' | 'burpee', f: (p: Piece) => number): number => {
      const v: number[] = [];
      for (let n = 0; n < 300; n++) for (const p of buildCourse(env(n + 1, 2.5, 300), tramo, rank, 0, 0).pieces) if (p.k === k) v.push(f(p));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(media(6, 6, 'step', (p) => p.h)).toBeGreaterThan(media(1, 0, 'step', (p) => p.h));
    expect(media(6, 6, 'step', (p) => p.len)).toBeGreaterThan(media(1, 0, 'step', (p) => p.len));
    expect(media(6, 6, 'crawl', (p) => p.n)).toBeGreaterThan(media(2, 0, 'crawl', (p) => p.n));
    expect(media(6, 6, 'burpee', (p) => p.h)).toBeGreaterThan(media(2, 0, 'burpee', (p) => p.h));
    // el tramo 1 con rango 0 empieza en lo mínimo de lo que pide la plataforma (0,25 m) y el 2 con rango 0, el túnel en 2
    for (let n = 0; n < 300; n++) {
      for (const p of buildCourse(env(n + 1, 2.5, 300), 1, 0, 0, 0).pieces) if (p.k === 'step') expect(p.h).toBeLessThan(0.3);
      for (const p of buildCourse(env(n + 1, 2.5, 300), 2, 0, 0, 0).pieces) if (p.k === 'crawl') expect(p.n).toBe(2);
    }
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

describe('minGap: las reglas de la plataforma, el túnel y el muro', () => {
  const V = 3;
  const frenar = (v: number): number => STOP_AT + (v * v) / (2 * HALT_BRAKE) + 1;
  const step = (): Piece => piece(0, 'step', 20, 1, { len: 5, h: 0.3 });
  const crawl = (): Piece => piece(0, 'crawl', 20, 2, { len: 2, n: 3 });
  const burpee = (): Piece => piece(0, 'burpee', 20, 2, { len: 0.5, h: 0.7 });

  it('tras una plataforma, el sitio de bajar de ella (DROP_ROOM) además del de siempre', () => {
    expect(minGap(step(), piece(1, 'low', 0, 1, { h: 0.25 }), V)).toBeCloseTo(MIN_GAP + DROP_ROOM, 9);
    expect(minGap(step(), piece(1, 'side', 0, 1, { side: 1 }), V)).toBeCloseTo(MIN_GAP + DROP_ROOM, 9);
    // ... y si la siguiente es un salto, la de dos saltos seguidos (la plataforma se sube de un salto) y encima, DROP_ROOM
    expect(minGap(step(), piece(1, 'log', 0, 1), 4.8)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * 4.8) + DROP_ROOM, 9);
    expect(minGap(step(), piece(1, 'step', 0, 1, { len: 5, h: 0.3 }), 4.8)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * 4.8) + DROP_ROOM, 9);
  });

  it('antes de una plataforma, dos saltos seguidos piden su sitio (la plataforma está en JUMPS)', () => {
    expect(minGap(piece(0, 'log', 20, 1), step(), 4.8)).toBeCloseTo(JUMP_GAP_S * 4.8, 9);
    expect(minGap(piece(0, 'gap', 20, 1, { len: 1 }), step(), 4.8)).toBeCloseTo(JUMP_GAP_S * 4.8, 9);
    // ... pero entre una viga y la plataforma, solo el mínimo
    expect(minGap(piece(0, 'low', 20, 1, { h: 0.25 }), step(), 4.8)).toBeCloseTo(MIN_GAP, 9);
  });

  it('tras un túnel o un muro, levantarse (FLOOR_UP_S a velocidad máxima) y LAND_PAST más', () => {
    for (const v of [1.2, 3, 4.8]) {
      const levantarse = FLOOR_UP_S * v + LAND_PAST;
      expect(minGap(crawl(), piece(1, 'low', 0, 2, { h: 0.25 }), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse), 9);
      expect(minGap(burpee(), piece(1, 'side', 0, 2, { side: -1 }), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse), 9);
      expect(minGap(crawl(), piece(1, 'log', 0, 2), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse, JUMP_GAP_S * v), 9);
    }
    expect(minGap(crawl(), piece(1, 'low', 0, 2, { h: 0.25 }), 3)).toBeCloseTo(3 * FLOOR_UP_S + LAND_PAST, 9);
  });

  it('antes de un paso (túnel, muro o cofre), el sitio para frenar suave a HALT_BRAKE y quedarte a STOP_AT', () => {
    for (const next of [crawl(), burpee(), piece(9, 'chest', 0, 0)]) {
      for (const v of [1.2, 3, 4.8]) {
        const prev = piece(0, 'low', 20, 0, { h: 0.25 });
        expect(minGap(prev, next, v), `${next.k} vmax ${v}`).toBeCloseTo(Math.max(MIN_GAP + STOP_AT, frenar(v)), 9);
      }
    }
    // a velocidad máxima, frenar pide más que el mínimo de siempre: el cofre también (cambia el sitio que pide)
    expect(minGap(piece(0, 'low', 20, 0, { h: 0.25 }), piece(1, 'chest', 0, 0), 4.8)).toBeCloseTo(frenar(4.8), 9);
    expect(frenar(4.8)).toBeGreaterThan(MIN_GAP + STOP_AT);
    // tras el hueco, además, el aterrizaje
    expect(minGap(piece(0, 'gap', 20, 0, { len: 1 }), piece(1, 'chest', 0, 0), 4.8)).toBeCloseTo(Math.max(MIN_GAP + LAND_PAST + STOP_AT, frenar(4.8)), 9);
    expect(minGap(piece(0, 'gap', 20, 0, { len: 1 }), crawl(), 3)).toBeCloseTo(MIN_GAP + LAND_PAST + STOP_AT, 9);
  });

  it('entre un túnel y un muro (o dos del mismo): levantarse y, además, el salto del muro', () => {
    for (const v of [1.2, 3, 4.8]) {
      const levantarse = FLOOR_UP_S * v + LAND_PAST;
      expect(minGap(crawl(), burpee(), v)).toBeCloseTo(Math.max(MIN_GAP + STOP_AT, frenar(v), levantarse, JUMP_GAP_S * v), 9);
      expect(minGap(burpee(), crawl(), v)).toBeCloseTo(Math.max(MIN_GAP + STOP_AT, frenar(v), levantarse), 9);
    }
  });

  it('nada va encima de una plataforma: la siguiente empieza tras su at + len y lo que pide minGap', () => {
    for (let n = 0; n < 300; n++) {
      const ps = buildCourse(env(n + 1, 3, 250), 3, 2, 0, 0).pieces;
      ps.forEach((p, i) => {
        const next = ps[i + 1];
        if (p.k === 'step' && next) expect(next.at).toBeGreaterThanOrEqual(p.at + p.len + minGap(p, next, 3) - 1e-9);
      });
    }
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

  it('una plataforma fuera de medida o sin largo', () => {
    const buena = (): Piece => piece(0, 'step', 20, 1, { len: 5, h: 0.3 });
    expect(courseRules([buena(), chest(1, 100)], V)).toEqual([]);
    const sinLargo = buena();
    sinLargo.len = 0;
    expect(courseRules([sinLargo, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('0'))).toBe(true);
    for (const len of [3.9, 9.1]) {
      const p = buena();
      p.len = len;
      expect(courseRules([p, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('largo'))).toBe(true);
    }
    for (const h of [0.2, 0.55]) {
      const p = buena();
      p.h = h;
      expect(courseRules([p, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('sube'))).toBe(true);
    }
  });

  it('un túnel con flexiones de menos o de más, o que no mide 2 m', () => {
    const bueno = (n: number, len = 2): Piece => piece(0, 'crawl', 20, 2, { len, n });
    for (const n of [2, 3, 4, 5]) expect(courseRules([bueno(n), chest(1, 100)], V)).toEqual([]);
    for (const n of [1, 6, 2.5]) expect(courseRules([bueno(n), chest(1, 100)], V).some((s) => s.includes('túnel') && s.includes('flexiones'))).toBe(true);
    expect(courseRules([bueno(3, 1.5), chest(1, 100)], V).some((s) => s.includes('túnel') && s.includes('mide'))).toBe(true);
  });

  it('un muro fuera de medida', () => {
    const bueno = (h: number, len = 0.5): Piece => piece(0, 'burpee', 20, 2, { len, h });
    for (const h of [0.6, 0.7, 0.8]) expect(courseRules([bueno(h), chest(1, 100)], V)).toEqual([]);
    for (const h of [0.5, 0.9]) expect(courseRules([bueno(h), chest(1, 100)], V).some((s) => s.includes('muro') && s.includes('alto'))).toBe(true);
    expect(courseRules([bueno(0.7, 1), chest(1, 100)], V).some((s) => s.includes('muro') && s.includes('grosor'))).toBe(true);
  });

  it('el sitio para bajar de la plataforma, para levantarse del túnel y para frenar ante el cofre', () => {
    // plataforma (len 5) y viga: piden 4 + 2 = 6 m
    const bajar = (room: number): Piece[] => [piece(0, 'step', 20, 1, { len: 5, h: 0.3 }), piece(1, 'low', 25 + room, 1, { h: 0.25 }), chest(2, 200)];
    expect(courseRules(bajar(5.9), V).some((s) => s.includes('juntas'))).toBe(true);
    expect(courseRules(bajar(6), V)).toEqual([]);
    // túnel y viga a 3 m/s: 3·3 + 0,6 = 9,6 m
    const levantar = (room: number): Piece[] => [piece(0, 'crawl', 20, 2, { len: 2, n: 3 }), piece(1, 'low', 22 + room, 2, { h: 0.25 }), chest(2, 200)];
    expect(courseRules(levantar(9.5), V).some((s) => s.includes('juntas'))).toBe(true);
    expect(courseRules(levantar(9.6), V)).toEqual([]);
    // viga y cofre a 4,8 m/s: frenar pide 1 + 4,608 + 1 = 6,608 m (a 3 m/s, 5 m)
    const frenar = (room: number, v: number): string[] => courseRules([piece(0, 'low', 20, 0, { h: 0.25 }), chest(1, 20 + room)], v);
    expect(frenar(6.5, 4.8).some((s) => s.includes('juntas'))).toBe(true);
    expect(frenar(6.61, 4.8)).toEqual([]);
    expect(frenar(5, 3)).toEqual([]);
  });
});
