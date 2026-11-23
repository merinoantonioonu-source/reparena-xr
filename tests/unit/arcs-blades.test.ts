// Las cuchillas de Arcos (src/modes/arcs/blades.ts): cada una se esquiva con su gesto (la hélice, agachándose; la rueda,
// apartando el tronco; la rasante, saltando) y quedarse quieto no vale; su vuelo ondula de lejos y se asienta al final (ni
// simple ni imprevisible); la rueda a veces amaga; y se mezclan en la cola de la oleada sin tocar la de RepArena.
import { describe, expect, it } from 'vitest';
import { BLADE_SETTLE, BladeCore, bladeMix, type BladeKind } from '../../src/modes/arcs/blades.js';
import { HEAD_TOP, type ArcsEnv } from '../../src/modes/arcs/env.js';
import type { ArcSpec } from '../../src/modes/arcs/patterns.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const DT = 1 / 72;
const mkEnv = (over: Record<string, number> = {}, seed = 3): ArcsEnv => {
  const set: Record<string, number> = { arcJumpH: 6, arcBlades: 30, ...over };
  return { s: (k) => set[k] ?? 0, dv: (k) => set[k] ?? 0, rnd: rng(seed), head: { x: 0, y: 1.6, z: 0 }, calibRef: 1.6, arenaDepth: 10, jumpFastT: 9, beatP: 0, time: 0 };
};

/** Hace pasar la cuchilla con la cabeza movida por `pose` hasta que se juzga; devuelve si te dio. */
function run(kind: BladeKind, pose: (b: BladeCore, env: ArcsEnv) => void, seed = 3, hard = 0.5): { hit: boolean; b: BladeCore } {
  const env = mkEnv({}, seed), b = new BladeCore(kind, env, 3, hard);
  for (let i = 0; i < 72 * 20 && !b.judged; i++) {
    pose(b, env);
    const f = b.update(DT, env, true);
    if (f.outcome) return { hit: f.outcome.kind === 'hit', b };
  }
  throw new Error('no llegó');
}

describe('las cuchillas', () => {
  it('quieto y de pie, cualquiera te da', () => {
    for (const k of ['spin', 'wheel', 'sweep'] as BladeKind[]) for (let s = 1; s < 6; s++) expect(run(k, () => {}, s).hit, `${k} ${s}`).toBe(true);
  });
  it('la hélice se esquiva agachándose al llegar', () => {
    for (let s = 1; s < 8; s++) {
      const r = run('spin', (b, env) => {
        if (b.tau < 0.8) env.head.y = b.y - HEAD_TOP - 0.08;
      }, s);
      expect(r.hit, `semilla ${s}`).toBe(false);
    }
  });
  it('la rueda se esquiva apartando el tronco al lado contrario de donde se planta (aunque amague)', () => {
    for (let s = 1; s < 8; s++) {
      const r = run('wheel', (b, env) => {
        if (b.tau < 0.9) env.head.x = b.xf > 0 ? -0.2 : 0.2;
      }, s, 1);
      expect(r.hit, `semilla ${s}`).toBe(false);
    }
  });
  it('la rasante se esquiva saltando cuando llega', () => {
    for (let s = 1; s < 8; s++) {
      const r = run('sweep', (b, env) => {
        env.head.y = b.tau < 0.15 && b.tau > 0 ? 1.6 + 0.1 : 1.6;
      }, s);
      expect(r.hit, `semilla ${s}`).toBe(false);
    }
  });
  it('de lejos ondula y entra en curva; al final, quieta en su sitio (se lee a tiempo)', () => {
    const env = mkEnv(), b = new BladeCore('spin', env, 3, 0.5);
    let far = 0;
    const settled: number[] = [];
    while (!b.judged) {
      b.update(DT, env, true);
      if (b.tau > BLADE_SETTLE + 1) far = Math.max(far, Math.abs(b.x - b.xf));
      if (b.tau < BLADE_SETTLE - 0.3 && b.tau > 0) settled.push(b.x);
    }
    expect(far).toBeGreaterThan(0.15);
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.02);
  });
  it('con la dificultad, la rueda a veces amaga (cambia de lado una vez, antes de asentarse)', () => {
    let feints = 0;
    for (let s = 1; s < 40; s++) {
      const env = mkEnv({}, s), b = new BladeCore('wheel', env, 3, 1), x0 = b.xf;
      while (!b.judged) b.update(DT, env, true);
      if (Math.sign(b.xf) !== Math.sign(x0)) feints++;
    }
    expect(feints).toBeGreaterThan(5);
    expect(feints).toBeLessThan(35);
  });
  it('se mezclan en la cola: sin el ajuste, la misma cola; con él, cuchillas entre lo de siempre, que sigue en su orden', () => {
    const q: ArcSpec[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'single', drop: i, tilt: 0, hp: 1 }));
    expect(bladeMix(q, mkEnv({ arcBlades: 0 }), 0.5)).toBe(q);
    const m = bladeMix(q, mkEnv({ arcBlades: 40 }), 0.5), blades = m.filter((x) => x.kind === 'blade');
    expect(blades.length).toBeGreaterThan(5);
    expect(m.filter((x) => x.kind === 'single').map((x) => x.drop)).toEqual(q.map((x) => x.drop));
    for (const b of blades) expect(['spin', 'wheel', 'sweep']).toContain(b.blade);
  });
});
