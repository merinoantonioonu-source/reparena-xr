// La caja negra del usuario con la mancuerna (Combate, curl a un brazo, Quest 3: tests/replay/capturas/curl-mancuerna-rayo-
// al-llegar-arriba.txt, capturas 2 y 3), pasada por el detector con «Manos: filtro nuevo». En las gafas (aún sin el filtro
// para este ejercicio) salió un rayo al llegar arriba en las dos partidas: la mano reaparecía arriba y, a la imagen
// siguiente, saltaba 25-50 cm hacia abajo un instante. Esos saltos hundían además lo más bajo del recorrido, y con la mano
// casi abajo el juego creía que estaba arriba (cargas y rayos de más).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replay, splitCaptures, type ReplayResult } from './replay.js';

const CAPS = splitCaptures(readFileSync(join(__dirname, 'capturas', 'curl-mancuerna-rayo-al-llegar-arriba.txt'), 'utf8'));
const run = (k: number, robust: boolean): ReplayResult => replay(CAPS[k], { cfg: (c) => ({ ...c, robust }) });
/** Los rayos de cada brazo (I/D), en segundos desde el principio de la captura. */
function shots(r: ReplayResult, side: 'I' | 'D'): number[] {
  const t0 = r.frames[0].t;
  return r.replayed.filter((e) => /^[rR]/.test(e.tok) && e.tok.endsWith(side)).map((e) => +(e.t - t0).toFixed(3));
}
/** ¿Algún rayo salió a menos de `s` segundos de cargar ese brazo? (el disparo al llegar arriba) */
function atTop(r: ReplayResult, s: number): string[] {
  const t0 = r.frames[0].t, last: Record<string, number> = {}, bad: string[] = [];
  for (const e of r.replayed) {
    const side = e.tok.slice(-1);
    if (e.tok.startsWith('t')) last[side] = e.t;
    else if (/^[rR]/.test(e.tok) && last[side] !== undefined && e.t - last[side] < s) bad.push(`${e.tok} a los ${(e.t - t0).toFixed(2)} s`);
  }
  return bad;
}

describe('la caja negra de la mancuerna con el filtro nuevo', () => {
  it('sin el filtro, se reproducen los rayos al llegar arriba de las dos partidas', () => {
    expect(atTop(run(1, false), 0.15).length).toBeGreaterThanOrEqual(2);
    expect(atTop(run(2, false), 0.15).length).toBeGreaterThanOrEqual(1);
  });

  it('primera partida: ningún rayo al llegar arriba, y los tres curls de verdad, cada uno con su rayo al bajar', () => {
    const r = run(1, true);
    expect(atTop(r, 0.2)).toEqual([]);
    expect(shots(r, 'I')).toHaveLength(2);
    expect(shots(r, 'D')).toHaveLength(1);
    expect(Math.abs(shots(r, 'I')[0] - 9.59)).toBeLessThan(0.1);
    expect(Math.abs(shots(r, 'I')[1] - 13.6)).toBeLessThan(0.15);
    expect(Math.abs(shots(r, 'D')[0] - 11.58)).toBeLessThan(0.1);
  });

  it('segunda partida: ningún rayo al llegar arriba ni con la mano casi abajo, y cada curl con su rayo al bajar', () => {
    const r = run(2, true);
    expect(atTop(r, 0.2)).toEqual([]);
    // (la izquierda: dos curls; la derecha: tres, uno con la mano perdida subiendo que reaparece arriba)
    expect(shots(r, 'I').map(Math.round)).toEqual([16, 20]);
    expect(shots(r, 'D').map(Math.round)).toEqual([14, 18, 21]);
  });
});

// La caja negra de la mancuerna ya con el filtro (tests/replay/capturas/curl-mancuerna-sin-bola-y-rayos-escondida.txt): la
// mano reaparecía arriba y no salía la bola (el filtro pedía verla subir desde donde reaparecía), las manos perdidas abajo
// se quedaban «arriba» sin volver a cargar, y un respingo de una sola imagen (con la imagen a 20 por segundo) cargaba y
// disparaba.
const NEW = splitCaptures(readFileSync(join(__dirname, 'capturas', 'curl-mancuerna-sin-bola-y-rayos-escondida.txt'), 'utf8'));
const runN = (k: number): ReplayResult => replay(NEW[k], { cfg: (c) => ({ ...c, robust: true }) });
const tops = (r: ReplayResult, side: 'I' | 'D'): number[] => {
  const t0 = r.frames[0].t;
  return r.replayed.filter((e) => e.tok === 't' + side).map((e) => +(e.t - t0).toFixed(3));
};

describe('la caja negra de la mancuerna con el filtro, otra vez', () => {
  it('la mano que reaparece arriba carga (sale la bola) y dispara al bajar', () => {
    const r = runN(1);
    expect(tops(r, 'I').filter((t) => t > 12 && t < 12.4)).toHaveLength(1);
    expect(shots(r, 'I').filter((t) => t > 13.9 && t < 14.3)).toHaveLength(1);
  });
  it('perdidas abajo, al volver no se quedan «arriba» sin cargar nunca más', () => {
    const r = runN(0);
    expect(tops(r, 'I').filter((t) => t > 19.7)).not.toEqual([]);
  });
  it('con la mano escondida nunca dispara (opción 1): perdida arriba, el rayo al volver a verla abajo', () => {
    const r = runN(0);
    expect(shots(r, 'I').filter((t) => t > 16 && t < 19.6)).toEqual([]);
    expect(shots(r, 'I').filter((t) => t > 19.6 && t < 20.2)).toHaveLength(1);
  });
  it('perdida subiendo más de 1,5 s: sale la bola, y un solo rayo para ese curl, al verla bajar (antes, dos)', () => {
    const r = runN(2);
    expect(shots(r, 'I').filter((t) => t > 14 && t < 17)).toHaveLength(1);
    expect(shots(r, 'I').filter((t) => t > 14 && t < 17)[0]).toBeGreaterThan(16.4);
  });
  it('un respingo de una sola imagen no carga ni dispara', () => {
    const r = runN(0);
    expect(shots(r, 'I').filter((t) => t > 20.7 && t < 21.3)).toEqual([]);
    expect(tops(r, 'I').filter((t) => t > 20.7 && t < 21.3)).toEqual([]);
  });
});
