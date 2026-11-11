// El registro de tirones (src/core/hitch.ts, de RepArena): qué se apunta y cómo lo resume la página.
import { beforeEach, describe, expect, it } from 'vitest';
import { HITCH, HITCH_KEY, hitchNote, hitchSave, hitchText, type HitchLog } from '../../src/core/hitch.js';

beforeEach(() => {
  Object.assign(HITCH, { list: [], prev: null, tex: 0, prog: 0, n: 0 });
  Object.assign(HITCH.f, { warm: 0, intro: 0, menu: 0 });
});

describe('el registro de tirones', () => {
  it('un fotograma de más de 0,1 s en las gafas apunta lo que hizo el anterior', () => {
    hitchNote(0.014, 4, 3, 10, 20, 'playing', false, true);
    HITCH.f.warm = 1;
    hitchNote(0.014, 6, 30, 10, 23, 'playing', false, true); // (este compila tres sombreadores y precompila)
    hitchNote(0.25, 5, 3, 10, 23, 'playing', false, true); // (y el siguiente llega tarde)
    expect(HITCH.n).toBe(1);
    expect(HITCH.list[0]).toMatchObject({ gap: 250, warm: 1, pg: 3, rd: 30 });
  });
  it('fuera de las gafas, o sin tirones, no apunta nada', () => {
    hitchNote(0.014, 4, 3, 10, 20, 'menu', false, false);
    hitchNote(0.5, 4, 3, 10, 20, 'menu', false, false);
    expect(HITCH.n).toBe(0);
  });
  it('el resumen cuenta cada causa (la primera que encaja) y el peor', () => {
    const L: HitchLog = { n: 3, list: [
      { gap: 140, js: 2, rd: 2, warm: 0, intro: 0, menu: 0, tx: 0, pg: 2, st: 'playing', open: false },
      { gap: 320, js: 2, rd: 2, warm: 0, intro: 0, menu: 1, tx: 0, pg: 0, st: 'menu', open: true },
      { gap: 120, js: 2, rd: 2, warm: 0, intro: 0, menu: 0, tx: 0, pg: 0, st: 'playing', open: false },
    ] };
    expect(hitchText(L)).toBe('Última sesión en las gafas: 3 tirones (el peor, 320 ms; 1 con un menú abierto): 1 al rehacer un menú, 1 compilando un sombreador, 1 sin causa en el juego (la gráfica o el navegador).');
    expect(hitchText({ n: 0, list: [] })).toBe('Última sesión en las gafas: sin tirones (ningún fotograma de más de 0,1 s).');
    expect(hitchText(null)).toBe('');
  });
  it('al salir de las gafas se guarda con la clave de RepArena y se empieza de cero', () => {
    hitchNote(0.014, 4, 3, 10, 20, 'playing', false, true);
    hitchNote(0.3, 4, 3, 10, 20, 'playing', false, true);
    const saved: Record<string, unknown> = {};
    const L = hitchSave((k, v) => (saved[k] = v), 123);
    expect(saved[HITCH_KEY]).toEqual({ n: 1, list: L.list, at: 123 });
    expect(HITCH.n).toBe(0);
    expect(HITCH.prev).toBe(null);
  });
});
