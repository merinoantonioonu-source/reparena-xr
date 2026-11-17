// La caja negra del usuario (Combate, curl con kettlebell, gafas Quest 3: tests/replay/capturas/curl2-kettlebell-rayos-a-
// destiempo.txt), pasada por el detector con «Manos: filtro nuevo». En las gafas salieron (sin el filtro):
//  · captura 1: 12 rayos; 11 al bajar desde el hombro y 1 mientras subía (52,73 s: la izquierda reapareció con un salto falso
//    de 16 cm hacia abajo y la media de las dos manos, sin filtrar, pareció una bajada); y un «Sube hasta el hombro» falso al
//    bajar (52,08 s);
//  · captura 2, al quitar la pausa: un rayo nada más seguir (67,58 s: estaba «arriba, cargado» desde antes de pausar), otro con
//    la mano que volvía del botón de la pausa, a 80 cm de la pesa (68,04 s), y otro a un tercio de la subida al perder las dos
//    manos (71,75 s), y ninguno al bajar de ese curl; luego, uno bien (74,93 s).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replay, splitCaptures, type ReplayEvent } from './replay.js';

const [C1, C2] = splitCaptures(readFileSync(join(__dirname, 'capturas', 'curl2-kettlebell-rayos-a-destiempo.txt'), 'utf8'));
const robust = { cfg: <T extends object>(c: T) => ({ ...c, robust: true }) };
const reps = (ev: ReplayEvent[]): number[] => ev.filter((e) => /^[rR]/.test(e.tok)).map((e) => e.t);
const near = (ts: number[], t: number, d: number): number[] => ts.filter((x) => Math.abs(x - t) <= d);
const GOOD1 = [34.13, 36.1, 37.88, 39.55, 41.37, 43.1, 46.45, 48.63, 50.24, 51.85, 53.65];

describe('la caja negra del usuario con el filtro nuevo', () => {
  it('sin el filtro, se reproduce lo que pasó en las gafas (los rayos a destiempo, también)', () => {
    const a = reps(replay(C1).replayed), b = reps(replay(C2).replayed);
    expect(near(a, 52.73, 0.02)).toHaveLength(1);
    expect(near(b, 67.58, 0.02)).toHaveLength(1);
    expect(near(b, 68.04, 0.02)).toHaveLength(1);
    expect(near(b, 71.75, 0.02)).toHaveLength(1);
  });

  it('captura 1: sin el rayo de la subida ni el aviso falso, y los 11 rayos buenos, al bajar como siempre', () => {
    const r = replay(C1, robust), a = reps(r.replayed);
    expect(near(a, 52.73, 0.4)).toEqual([]);
    expect(r.replayed.filter((e) => e.tok === 'm')).toEqual([]);
    expect(a).toHaveLength(GOOD1.length);
    for (const t of GOOD1) expect(near(a, t, 0.25), `el rayo de ${t} s`).toHaveLength(1);
  });

  it('captura 2: al quitar la pausa ningún rayo, y el curl de las manos perdidas dispara al bajar, no a medio subir', () => {
    const r = replay(C2, robust), a = reps(r.replayed).filter((t) => t > 60);
    expect(a.filter((t) => t >= 67.4 && t <= 69.5)).toEqual([]); // (al seguir y con la mano que vuelve del botón)
    expect(near(a, 71.75, 0.15)).toEqual([]); // (perdidas subiendo: espera a verlas)
    expect(a.filter((t) => t > 72.5 && t < 73.6)).toHaveLength(1); // (y sale al bajar de ese curl)
    expect(near(a, 74.93, 0.25)).toHaveLength(1);
    expect(a).toHaveLength(2);
  });
});
