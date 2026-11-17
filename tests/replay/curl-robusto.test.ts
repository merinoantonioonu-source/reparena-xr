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
