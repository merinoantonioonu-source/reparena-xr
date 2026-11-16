// La Travesía de plataformas: el recorrido (docs/REGLAS.md › Travesía). Comprueba, con miles de tramos al azar, lo que pide
// el usuario: el tramo acaba siempre en su cofre; la carrera antes de la primera pieza; nada se solapa y hay sitio para
// cada movimiento (levantarte, caer y volver a saltar, volver al centro); las clases son las del tramo y salen todas si
// cabe (la fruta y la plataforma, desde el segundo tramo; el túnel y el burpee, desde el tercero); el burpee no es una
// pieza sino un túnel y, a `BURPEE_GAP_S * vmax` m exactos, su plataforma; no hay obstáculos a un lado; el hueco, la viga,
// la plataforma, el túnel y la fruta miden lo que toca; hay sitio para bajar de una plataforma, para frenar ante el
// cofre, para echarse al suelo ante un túnel y para levantarse; y la dificultad sube de un tramo a otro, no dentro de él.
import { describe, expect, it } from 'vitest';
import { buildCourse, courseKinds, courseRules, minGap } from '../../src/modes/trek/plat/course.js';
import { BURPEE_GAP_S, DROP_ROOM, FOE_WALK, FLOOR_UP_S, HALT_BRAKE, JUMP_GAP_S, LAND_PAST, MIN_GAP, piece, RUN_UP, SIDE_BACK_S, STOP_AT, type CourseEnv, type Piece } from '../../src/modes/trek/plat/types.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const env = (seed: number, vmax: number, len: number): CourseEnv => ({ vmax, len, rnd: rng(seed) });
/** ¿Hay en el recorrido la clase `k`? El burpee no es una pieza: es un túnel con, justo detrás, una plataforma de burpee. */
const hay = (ps: Piece[], k: string): boolean => (k === 'burpee' ? ps.some((p) => p.k === 'step' && p.burpee) : ps.some((p) => p.k === k));

describe('el recorrido de la Travesía de plataformas', () => {
  it('el primer tramo, aun con lo más corto (40 m), trae siempre el tronco, la viga y el hueco', () => {
    const r = rng(777);
    for (let n = 0; n < 2000; n++) {
      const vmax = 1.2 + 3.6 * r();
      const c = buildCourse(env(n + 7, vmax, 40), 0, 0, 500 * r(), 0);
      expect(courseRules(c.pieces, vmax)).toEqual([]);
      for (const k of courseKinds(0)) expect(hay(c.pieces, k), `#${n} vmax ${vmax.toFixed(2)}: falta ${k}`).toBe(true);
    }
  });

  it('el primer tramo de 40 m cabe también con el peor azar (carrera y separaciones al máximo) a cualquier velocidad', () => {
    for (const rnd of [0, 0.25, 0.5, 0.75, 0.9999]) {
      for (let vmax = 1.2; vmax <= 4.8001; vmax += 0.1) {
        for (const rank of [0, 3, 6]) {
          const c = buildCourse({ vmax, len: 40, rnd: () => rnd }, 0, rank, 0, 0);
          expect(courseRules(c.pieces, vmax)).toEqual([]);
          for (const k of courseKinds(0)) expect(hay(c.pieces, k), `rnd ${rnd} vmax ${vmax.toFixed(2)} rango ${rank}: falta ${k}`).toBe(true);
        }
      }
    }
  });

  it('cada clase de pieza entra en su tramo: fruta, plataforma y seta desde el 1; túnel, burpee y cangrejo desde el 2', () => {
    expect(courseKinds(0)).toEqual(['log', 'low', 'gap']);
    expect(courseKinds(1)).toEqual(['log', 'low', 'gap', 'fruit', 'step', 'foe']);
    for (const t of [2, 3, 6]) expect(courseKinds(t)).toEqual(['log', 'low', 'gap', 'fruit', 'step', 'foe', 'crawl', 'burpee', 'side']);
    for (let n = 0; n < 200; n++) {
      for (const [t, ausentes] of [[0, ['fruit', 'step', 'foe', 'crawl', 'burpee', 'side']], [1, ['crawl', 'burpee', 'side']]] as const) {
        const ps = buildCourse(env(n + 1, 3, 250), t, 2, 0, 0).pieces;
        for (const k of ausentes) expect(hay(ps, k), `tramo ${t}: ${k}`).toBe(false);
        expect(ps.some((p) => p.burpee)).toBe(false);
      }
    }
  });

  it('desde el tramo 2, en los tramos largos y a velocidad normal, sale siempre al menos un burpee (túnel y su plataforma)', () => {
    const r = rng(4242);
    for (let n = 0; n < 1000; n++) {
      const tramo = 2 + Math.floor(r() * 5);
      const vmax = 1.2 + 2 * r();
      const len = 150 + 150 * r();
      const ps = buildCourse(env(n + 1, vmax, len), tramo, Math.floor(r() * 7), 0, 0).pieces;
      expect(hay(ps, 'burpee'), `#${n} tramo ${tramo} vmax ${vmax.toFixed(2)} len ${len.toFixed(0)}`).toBe(true);
    }
  });

  it('el burpee: la plataforma va justo tras su túnel, a BURPEE_GAP_S * vmax m exactos, y no hay piezas de clase burpee', () => {
    let vistos = 0;
    const r = rng(99);
    for (let n = 0; n < 800; n++) {
      const vmax = 1.2 + 3.6 * r();
      const ps = buildCourse(env(n + 1, vmax, 100 + 200 * r()), 2 + Math.floor(r() * 5), Math.floor(r() * 7), 0, 0).pieces;
      ps.forEach((p, i) => {
        expect(p.k).not.toBe('burpee');
        if (!p.burpee) return;
        vistos++;
        const t = ps[i - 1]!;
        expect(p.k).toBe('step');
        expect(t.k).toBe('crawl');
        expect(p.at - (t.at + t.len)).toBeCloseTo(BURPEE_GAP_S * vmax, 6);
      });
    }
    expect(vistos).toBeGreaterThan(0);
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
      if (len >= 150 && vmax <= 3.2) for (const k of kinds) expect(hay(c.pieces, k), `${tag}: falta ${k}`).toBe(true);
      // Las medidas (courseRules ya las comprueba; aquí, además, a mano).
      for (const p of c.pieces) {
        expect(p.k, tag).not.toBe('burpee');
        if (p.k === 'step') {
          expect(p.h, tag).toBeGreaterThanOrEqual(p.burpee ? 0.6 : 0.8);
          expect(p.h, tag).toBeLessThanOrEqual(p.burpee ? 1.0 : 1.5);
          expect(p.len, tag).toBeGreaterThanOrEqual(4);
          expect(p.len, tag).toBeLessThanOrEqual(p.burpee ? 7 : 9);
        } else if (p.k === 'crawl') {
          expect(p.n, tag).toBe(0);
          expect(p.len, tag).toBeGreaterThanOrEqual(3);
          expect(p.len, tag).toBeLessThanOrEqual(6);
        } else if (p.k === 'fruit' || p.k === 'side') {
          expect([-1, 1], tag).toContain(p.side);
        }
        // los enemigos salen más allá de su sitio, andando hacia ti; los demás, quietos
        expect(p.walk, tag).toBe(p.k === 'foe' || p.k === 'side' ? FOE_WALK : 0);
      }
      expect(c.pieces.filter((p) => p.special).length, tag).toBeLessThanOrEqual(1);
    }
  });

  it('tras la seta o el cangrejo, el sitio de siempre y FOE_WALK m más (los encuentras hasta ahí, andando hacia ti)', () => {
    const V = 3, log = piece(9, 'log', 0, 2);
    expect(minGap(piece(0, 'foe', 0, 2), log, V)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * V) + FOE_WALK, 9);
    expect(minGap(piece(0, 'side', 0, 2, { side: 1 }), log, V)).toBeCloseTo(Math.max(MIN_GAP, SIDE_BACK_S * V) + FOE_WALK, 9);
    // la pieza de antes: su sitio basta (nunca se acercan más que él)
    expect(minGap(log, piece(0, 'foe', 0, 2), V)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * V), 9);
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
    // la fruta y la plataforma entran en el tramo 1, no antes
    let fruit0 = 0;
    let fruit1 = 0;
    for (let n = 0; n < 300; n++) {
      fruit0 += buildCourse(env(n + 1, 3, 250), 0, 0, 0, 0).pieces.filter((p) => p.k === 'fruit').length;
      fruit1 += buildCourse(env(n + 1, 3, 250), 1, 0, 0, 0).pieces.filter((p) => p.k === 'fruit').length;
    }
    expect(fruit0).toBe(0);
    expect(fruit1).toBeGreaterThan(0);
  });

  it('la plataforma, la de burpee y el túnel piden más con el tramo y el rango', () => {
    const media = (tramo: number, rank: number, f: (p: Piece) => number, sel: (p: Piece) => boolean): number => {
      const v: number[] = [];
      for (let n = 0; n < 300; n++) for (const p of buildCourse(env(n + 1, 2.5, 300), tramo, rank, 0, 0).pieces) if (sel(p)) v.push(f(p));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    const alta = (p: Piece): boolean => p.k === 'step' && !p.burpee;
    const burpee = (p: Piece): boolean => p.k === 'step' && p.burpee;
    const tunel = (p: Piece): boolean => p.k === 'crawl';
    expect(media(6, 6, (p) => p.h, alta)).toBeGreaterThan(media(1, 0, (p) => p.h, alta));
    expect(media(6, 6, (p) => p.len, alta)).toBeGreaterThan(media(1, 0, (p) => p.len, alta));
    expect(media(6, 6, (p) => p.h, burpee)).toBeGreaterThan(media(2, 0, (p) => p.h, burpee));
    expect(media(6, 6, (p) => p.len, burpee)).toBeGreaterThan(media(2, 0, (p) => p.len, burpee));
    expect(media(6, 6, (p) => p.len, tunel)).toBeGreaterThan(media(2, 0, (p) => p.len, tunel));
    // el tramo 1 con rango 0 empieza en lo mínimo de lo que pide la plataforma alta (0,8 m)
    for (let n = 0; n < 300; n++) {
      for (const p of buildCourse(env(n + 1, 2.5, 300), 1, 0, 0, 0).pieces) if (p.k === 'step') expect(p.h).toBeLessThan(0.85);
    }
  });

  it('la fruta especial: de vez en cuando (probabilidad 0,15) y como mucho una por tramo; dos frutas seguidas pueden ir a cualquier lado', () => {
    let tramos = 0;
    let conEspecial = 0;
    const lados = new Set<string>();
    for (let n = 0; n < 600; n++) {
      const ps = buildCourse(env(n + 1, 2.5, 300), 3, 1, 0, 0).pieces;
      const esp = ps.filter((p) => p.special);
      expect(esp.length).toBeLessThanOrEqual(1);
      tramos++;
      if (esp.length) conEspecial++;
      for (let i = 1; i < ps.length; i++) if (ps[i]!.k === 'fruit' && ps[i - 1]!.k === 'fruit') lados.add(`${ps[i - 1]!.side},${ps[i]!.side}`);
    }
    expect(conEspecial).toBeGreaterThan(0);
    expect(conEspecial).toBeLessThan(tramos);
    // (con el azar, las cuatro combinaciones de lados salen entre frutas seguidas)
    expect(lados.size).toBe(4);
  });
});

describe('minGap: las reglas de la plataforma, el túnel, la fruta y el cofre', () => {
  const V = 3;
  const frenar = (v: number): number => STOP_AT + (v * v) / (2 * HALT_BRAKE) + 1;
  const step = (): Piece => piece(0, 'step', 20, 1, { len: 5, h: 1 });
  const plataformaBurpee = (): Piece => {
    const p = piece(0, 'step', 20, 2, { len: 5, h: 0.8 });
    p.burpee = true;
    return p;
  };
  const crawl = (): Piece => piece(0, 'crawl', 20, 2, { len: 4, n: 0 });
  const fruit = (side: -1 | 1 = 1): Piece => piece(0, 'fruit', 20, 1, { side });
  const baja = (): Piece => piece(1, 'low', 0, 1, { h: 0.25 });

  it('tras una plataforma, el sitio de bajar de ella (DROP_ROOM) además del de siempre', () => {
    expect(minGap(step(), baja(), V)).toBeCloseTo(MIN_GAP + DROP_ROOM, 9);
    expect(minGap(step(), fruit(), V)).toBeCloseTo(MIN_GAP + DROP_ROOM, 9);
    // ... y si la siguiente es un salto, la de dos saltos seguidos (la plataforma se sube de un salto) y encima, DROP_ROOM
    expect(minGap(step(), piece(1, 'log', 0, 1), 4.8)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * 4.8) + DROP_ROOM, 9);
    expect(minGap(step(), step(), 4.8)).toBeCloseTo(Math.max(MIN_GAP, JUMP_GAP_S * 4.8) + DROP_ROOM, 9);
    // ... y tras la de un burpee, lo mismo
    expect(minGap(plataformaBurpee(), baja(), V)).toBeCloseTo(MIN_GAP + DROP_ROOM, 9);
  });

  it('antes de una plataforma, dos saltos seguidos piden su sitio (la plataforma está en JUMPS)', () => {
    expect(minGap(piece(0, 'log', 20, 1), step(), 4.8)).toBeCloseTo(JUMP_GAP_S * 4.8, 9);
    expect(minGap(piece(0, 'gap', 20, 1, { len: 1 }), step(), 4.8)).toBeCloseTo(JUMP_GAP_S * 4.8, 9);
    // ... pero entre una viga y la plataforma, solo el mínimo
    expect(minGap(piece(0, 'low', 20, 1, { h: 0.25 }), step(), 4.8)).toBeCloseTo(MIN_GAP, 9);
  });

  it('tras un túnel, levantarse (FLOOR_UP_S a velocidad máxima) y LAND_PAST más', () => {
    for (const v of [1.2, 3, 4.8]) {
      const levantarse = FLOOR_UP_S * v + LAND_PAST;
      expect(minGap(crawl(), baja(), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse), 9);
      expect(minGap(crawl(), fruit(), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse), 9);
      expect(minGap(crawl(), piece(1, 'log', 0, 2), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse, JUMP_GAP_S * v), 9);
      // ... también ante una plataforma que no es la de su burpee
      expect(minGap(crawl(), step(), v)).toBeCloseTo(Math.max(MIN_GAP, levantarse, JUMP_GAP_S * v), 9);
    }
    expect(minGap(crawl(), baja(), 3)).toBeCloseTo(3 * FLOOR_UP_S + LAND_PAST, 9);
  });

  it('tras un túnel, la plataforma de su burpee, a BURPEE_GAP_S * vmax exactos', () => {
    for (const v of [1.2, 3, 4.8]) expect(minGap(crawl(), plataformaBurpee(), v)).toBe(BURPEE_GAP_S * v);
  });

  it('tras una fruta, SIDE_BACK_S * vmax para volver al centro (al mismo lado o al otro)', () => {
    for (const v of [1.2, 3, 4.8]) {
      for (const lado of [-1, 1] as const) {
        for (const sig of [-1, 1] as const) expect(minGap(fruit(lado), fruit(sig), v)).toBeCloseTo(Math.max(MIN_GAP, SIDE_BACK_S * v), 9);
      }
      expect(minGap(fruit(), baja(), v)).toBeCloseTo(Math.max(MIN_GAP, SIDE_BACK_S * v), 9);
    }
    // antes de una fruta, solo el mínimo
    expect(minGap(piece(0, 'low', 20, 1, { h: 0.25 }), fruit(), 4.8)).toBeCloseTo(MIN_GAP, 9);
  });

  it('antes de un túnel, lo que se recorre en 3,5 s a velocidad máxima (echarse al suelo con tiempo)', () => {
    for (const v of [1.2, 3, 4.8]) {
      expect(minGap(baja(), crawl(), v)).toBeCloseTo(Math.max(MIN_GAP, 3.5 * v), 9);
      expect(minGap(piece(0, 'log', 20, 2), crawl(), v)).toBeCloseTo(Math.max(MIN_GAP, 3.5 * v), 9);
      expect(minGap(piece(0, 'gap', 20, 2, { len: 1 }), crawl(), v)).toBeCloseTo(Math.max(MIN_GAP + LAND_PAST, 3.5 * v), 9);
      expect(minGap(crawl(), crawl(), v)).toBeCloseTo(Math.max(MIN_GAP, FLOOR_UP_S * v + LAND_PAST, 3.5 * v), 9);
    }
  });

  it('antes del cofre, el sitio para frenar suave a HALT_BRAKE y quedarte a STOP_AT (solo el cofre frena)', () => {
    for (const v of [1.2, 3, 4.8]) {
      const prev = piece(0, 'low', 20, 0, { h: 0.25 });
      expect(minGap(prev, piece(9, 'chest', 0, 0), v), `vmax ${v}`).toBeCloseTo(Math.max(MIN_GAP + STOP_AT, frenar(v)), 9);
    }
    // a velocidad máxima, frenar pide más que el mínimo de siempre
    expect(minGap(piece(0, 'low', 20, 0, { h: 0.25 }), piece(1, 'chest', 0, 0), 4.8)).toBeCloseTo(frenar(4.8), 9);
    expect(frenar(4.8)).toBeGreaterThan(MIN_GAP + STOP_AT);
    // tras el hueco, además, el aterrizaje
    expect(minGap(piece(0, 'gap', 20, 0, { len: 1 }), piece(1, 'chest', 0, 0), 4.8)).toBeCloseTo(Math.max(MIN_GAP + LAND_PAST + STOP_AT, frenar(4.8)), 9);
    // el túnel ya no frena: solo pide el sitio de echarse al suelo
    expect(minGap(piece(0, 'gap', 20, 0, { len: 1 }), crawl(), 3)).toBeCloseTo(Math.max(MIN_GAP + LAND_PAST, 3.5 * 3), 9);
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
  const burpeeStep = (at: number, h = 0.8, len = 5): Piece => {
    const p = piece(1, 'step', at, 2, { len, h });
    p.burpee = true;
    return p;
  };

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

  it('el sitio que pide cada movimiento (volver al centro tras la fruta, caer y volver a saltar, echarse al suelo)', () => {
    const fruta = [piece(0, 'fruit', 20, 1, { side: 1 }), piece(1, 'log', 24, 1), chest(2, 100)]; // 4 m < 1,5·3 = 4,5 m
    expect(courseRules(fruta, V).some((s) => s.includes('juntas'))).toBe(true);
    const salto = [piece(0, 'log', 20, 0), piece(1, 'log', 23.5, 0), chest(2, 100)]; // 3,5 m < 1,1·3 y < 4 m
    expect(courseRules(salto, V).some((s) => s.includes('juntas'))).toBe(true);
    // ante un túnel: 3,5·3 = 10,5 m
    const tunel = (room: number): Piece[] => [piece(0, 'low', 20, 2, { h: 0.25 }), piece(1, 'crawl', 20.0 + room, 2, { len: 4 }), chest(2, 200)];
    expect(courseRules(tunel(10.4), V).some((s) => s.includes('juntas'))).toBe(true);
    expect(courseRules(tunel(10.5), V)).toEqual([]);
  });

  it('dos frutas seguidas, del mismo lado o de lados distintos, valen', () => {
    for (const lado of [-1, 1] as const) {
      const ps = [piece(0, 'fruit', 20, 1, { side: 1 }), piece(1, 'fruit', 40, 1, { side: lado }), chest(2, 100)];
      expect(courseRules(ps, V)).toEqual([]);
    }
  });

  it('una fruta sin lado', () => {
    const ps = [piece(0, 'fruit', 20, 1), chest(1, 100)];
    expect(courseRules(ps, V).some((s) => s.includes('fruta') && s.includes('lado'))).toBe(true);
  });

  it('como mucho una fruta especial por tramo', () => {
    const f = (id: number, at: number, tramo: number): Piece => {
      const p = piece(id, 'fruit', at, tramo, { side: 1 });
      p.special = true;
      return p;
    };
    expect(courseRules([f(0, 20, 1), chest(1, 100)], V)).toEqual([]);
    expect(courseRules([f(0, 20, 1), f(1, 40, 1), chest(2, 100)], V).some((s) => s.includes('especiales'))).toBe(true);
    // (en tramos distintos, una por tramo, vale)
    expect(courseRules([f(0, 20, 1), f(1, 40, 2), chest(2, 100)], V)).toEqual([]);
  });

  it('piezas de clase burpee, cangrejos sin lado o antes de tiempo y setas en el primer tramo', () => {
    expect(courseRules([piece(0, 'side', 20, 0, { side: 1 }), chest(1, 100)], V).some((s) => s.includes('cangrejo'))).toBe(true);
    expect(courseRules([piece(0, 'side', 20, 2), chest(1, 100)], V).some((s) => s.includes('lado'))).toBe(true);
    expect(courseRules([piece(0, 'side', 20, 2, { side: -1 }), chest(1, 100)], V)).toEqual([]);
    expect(courseRules([piece(0, 'foe', 20, 0), chest(1, 100)], V).some((s) => s.includes('seta'))).toBe(true);
    expect(courseRules([piece(0, 'burpee', 20, 2, { len: 0.5, h: 0.7 }), chest(1, 100)], V).some((s) => s.includes('burpee'))).toBe(true);
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
    const buena = (): Piece => piece(0, 'step', 20, 1, { len: 5, h: 1 });
    expect(courseRules([buena(), chest(1, 100)], V)).toEqual([]);
    const sinLargo = buena();
    sinLargo.len = 0;
    expect(courseRules([sinLargo, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('0'))).toBe(true);
    for (const len of [3.9, 9.1]) {
      const p = buena();
      p.len = len;
      expect(courseRules([p, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('largo'))).toBe(true);
    }
    for (const h of [0.7, 1.6]) {
      const p = buena();
      p.h = h;
      expect(courseRules([p, chest(1, 100)], V).some((s) => s.includes('plataforma') && s.includes('sube'))).toBe(true);
    }
  });

  it('un túnel con flexiones, o que no mide entre 3 y 6 m', () => {
    const bueno = (len: number, n = 0): Piece => piece(0, 'crawl', 20, 2, { len, n });
    for (const len of [3, 4.5, 6]) expect(courseRules([bueno(len), chest(1, 100)], V)).toEqual([]);
    for (const n of [1, 3]) expect(courseRules([bueno(4, n), chest(1, 100)], V).some((s) => s.includes('túnel') && s.includes('flexiones'))).toBe(true);
    for (const len of [2.9, 6.1]) expect(courseRules([bueno(len), chest(1, 100)], V).some((s) => s.includes('túnel') && s.includes('mide'))).toBe(true);
  });

  it('la plataforma de burpee: medidas, justo tras un túnel y al hueco exacto', () => {
    const gap = BURPEE_GAP_S * V;
    const par = (room: number, h = 0.8, len = 5): Piece[] => {
      const t = piece(0, 'crawl', 20, 2, { len: 4, n: 0 });
      return [t, burpeeStep(24 + room, h, len), chest(2, 200)].map((p, i) => ((p.id = i), p));
    };
    expect(courseRules(par(gap), V)).toEqual([]);
    expect(courseRules(par(gap + 1e-7), V)).toEqual([]); // (tolerancia de 1e-6)
    for (const room of [gap + 0.01, gap - 0.01]) expect(courseRules(par(room), V).some((s) => s.includes('burpee') && s.includes('túnel'))).toBe(true);
    for (const h of [0.5, 1.1]) expect(courseRules(par(gap, h), V).some((s) => s.includes('burpee') && s.includes('sube'))).toBe(true);
    for (const len of [3.9, 7.1]) expect(courseRules(par(gap, 0.8, len), V).some((s) => s.includes('burpee') && s.includes('largo'))).toBe(true);
    // la de burpee admite alturas bajas que la normal no
    expect(courseRules(par(gap, 0.6, 4), V)).toEqual([]);
    // sin túnel justo delante
    const sola = [piece(0, 'log', 20, 2), burpeeStep(60), chest(2, 200)];
    expect(courseRules(sola, V).some((s) => s.includes('burpee') && s.includes('detrás'))).toBe(true);
    expect(courseRules([burpeeStep(60), chest(2, 200)], V).some((s) => s.includes('detrás'))).toBe(true);
  });

  it('el sitio para bajar de la plataforma, para levantarse del túnel y para frenar ante el cofre', () => {
    // plataforma (len 5) y viga: piden 4 + 2 = 6 m
    const bajar = (room: number): Piece[] => [piece(0, 'step', 20, 1, { len: 5, h: 1 }), piece(1, 'low', 25 + room, 1, { h: 0.25 }), chest(2, 200)];
    expect(courseRules(bajar(5.9), V).some((s) => s.includes('juntas'))).toBe(true);
    expect(courseRules(bajar(6), V)).toEqual([]);
    // túnel y viga a 3 m/s: 3·3 + 0,6 = 9,6 m
    const levantar = (room: number): Piece[] => [piece(0, 'crawl', 20, 2, { len: 4, n: 0 }), piece(1, 'low', 24 + room, 2, { h: 0.25 }), chest(2, 200)];
    expect(courseRules(levantar(9.5), V).some((s) => s.includes('juntas'))).toBe(true);
    expect(courseRules(levantar(9.6), V)).toEqual([]);
    // viga y cofre a 4,8 m/s: frenar pide 1 + 4,608 + 1 = 6,608 m (a 3 m/s, 5 m)
    const frenar = (room: number, v: number): string[] => courseRules([piece(0, 'low', 20, 0, { h: 0.25 }), chest(1, 20 + room)], v);
    expect(frenar(6.5, 4.8).some((s) => s.includes('juntas'))).toBe(true);
    expect(frenar(6.61, 4.8)).toEqual([]);
    expect(frenar(5, 3)).toEqual([]);
  });
});
