// Los premios (src/combat/perks.ts): las cartas cada tres oleadas y solo ganadas, la oleada que espera, la que te toca al
// azar, el escudo, el combo de hierro, el corazón, los puntos y la carrera contra tu récord.
import { describe, expect, it } from 'vitest';
import { Ghost, Perks, rushPlan } from '../../src/combat/perks.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe('los premios', () => {
  it('las cartas: cada tres oleadas superadas, solo con pocos golpes; la oleada espera; si no eliges, te toca una', () => {
    const p = new Perks(rng(1));
    expect(p.waveCleared(0, true, true)).toBe(null);
    expect(p.waveCleared(0, true, true)).toBe(null);
    p.waveCleared(1, true, true);
    expect(p.waits(true)).toBe(true);
    expect(p.step(1.5, true, true, false)).toBe('offer');
    expect(p.offer).toHaveLength(3);
    expect(p.waits(true)).toBe(true);
    const note = p.restEnd();
    expect(note?.[0]).toMatch(/^Te toca/);
    expect(p.has.size).toBe(1);
    // con cuatro golpes en el tramo, sin cartas
    p.waveCleared(2, true, true);
    p.waveCleared(3, true, true);
    expect(p.waveCleared(6, true, true)?.[0]).toMatch(/Sin mejora/);
    expect(p.waits(true)).toBe(false);
  });
  it('el escudo para un golpe por oleada; el combo de hierro salva un combo de 3 o más', () => {
    const p = new Perks();
    p.take('shield');
    expect(p.absorb()).toBe(true);
    expect(p.absorb()).toBe(false);
    p.waveStart();
    expect(p.absorb()).toBe(true);
    p.take('combo');
    expect(p.keepCombo(2)).toBe(false);
    expect(p.keepCombo(5)).toBe(true);
    expect(p.keepCombo(5)).toBe(false);
  });
  it('el corazón: una vida cada 10 perfectas si te falta; doble o nada y el relámpago, los puntos', () => {
    const p = new Perks();
    p.take('life');
    let ups = 0;
    for (let i = 0; i < 30; i++) if (p.onRep(true, 2, 3)) ups++;
    expect(ups).toBe(3);
    expect(p.ptsK(true, false)).toBe(1);
    p.take('gold');
    expect(p.ptsK(true, true)).toBe(4);
    expect(p.ptsK(false, true)).toBe(2);
    expect(p.pool(false)).not.toContain('life');
  });
  it('el relámpago: nunca en la primera oleada ni con el jefe', () => {
    expect(rushPlan(0, false, true, () => 0)).toBe(-1);
    expect(rushPlan(2, true, true, () => 0)).toBe(-1);
    expect(rushPlan(2, false, true, () => 0)).toBe(4);
  });
  it('la carrera contra tu récord: cuántas llevas de más o de menos, y se guarda si la superas', () => {
    const g = new Ghost();
    g.reset('combat', 'squat', true, { 'combat:squat': { n: 10, tl: [0, 2, 4, 6, 8, 10] } }, []);
    for (let i = 0; i < 60; i++) g.step(1 / 30, 1, true);
    expect(g.text(1, true)).toEqual(['RÉCORD −1', '#ff8a3d']);
    expect(g.step(1 / 30, 11, true)).toBe(true);
    expect(g.text(11, true)?.[0]).toBe('¡RÉCORD! +1');
    expect(g.end(11, true, {})?.['combat:squat'].n).toBe(11);
    expect(g.end(9, true, {})).toBe(null);
  });
});
