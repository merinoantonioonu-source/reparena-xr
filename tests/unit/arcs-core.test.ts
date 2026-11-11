// Los arcos del modo Arcos (src/modes/arcs/arc.ts) y sus oleadas (patterns.ts): pasar por debajo con margen es perfecta,
// con la cabeza por encima de la barra te da, la valla pide saltar a tiempo, el arco de plancha pide bajar al suelo, el
// inclinado pide apartarse al lado alto (la pared del lado bajo) y la oleada respeta los porcentajes y el reparto de lados.
import { describe, expect, it } from 'vitest';
import { ArcCore, arcJumpNeed, type ArcOutcome, type ArcParams } from '../../src/modes/arcs/arc.js';
import { HEAD_TOP, type ArcsEnv } from '../../src/modes/arcs/env.js';
import { ArcNewKind, arcSpawnPlan, buildArcsWave } from '../../src/modes/arcs/patterns.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// los de serie de RepArena (src/00_core.js: SCHEMA)
const DEF: Record<string, number> = {
  arcMin: 18, arcMax: 38, arcSpeed: 7, arcTilt: 0, arcTiltMax: 18, arcRight: 50, arcShift: 40, arcSideMin: 20, arcTiltDrop: 0, arcLow: 0,
  arcLowH: 75, arcTiltW: 200, arcJump: 20, arcJumpH: 6, arcBpmSpeed: 1, bpm: 120, arcPatterns: 1, arcNew: 25, arcMace: 15, arcPlank: 10,
  arcHurdles: 10, arcBurpee: 10, arcPlankSpeed: 3.5, arcPlankH: 60, arcOrbs: 40, arcFeverUp: 10, arcTunnel: 10, arcCombo: 10, arcDouble: 15,
};

function mkEnv(over: Record<string, number> = {}, seed = 1): ArcsEnv {
  const set = { ...DEF, ...over };
  return { s: (k) => set[k] ?? 0, dv: (k) => set[k] ?? 0, rnd: rng(seed), head: { x: 0, y: 1.6, z: 0 }, calibRef: 1.6, arenaDepth: 10, jumpFastT: 9, beatP: 0, time: 0 };
}
const calm = { fever: false, feverN: 0 };

/** Hace pasar el arco con la cabeza movida por `pose(t, arco)` hasta que se juzga. */
function run(p: ArcParams, env: ArcsEnv, pose: (t: number, a: ArcCore) => void): { out: ArcOutcome | null; a: ArcCore } {
  const a = new ArcCore(p, env, calm);
  let t = 0;
  for (let f = 0; f < 20000 && a.alive; f++) {
    t += 1 / 72;
    pose(t, a);
    const out = a.update(1 / 72, env);
    if (out) return { out, a };
  }
  return { out: null, a };
}

describe('Arcos: los arcos', () => {
  it('agacharse bajo un arco con margen es perfecta; justo por debajo, esquivado', () => {
    const env = mkEnv(), drop = 0.3;
    // la barra queda a calibRef + HEAD_TOP - drop: con la coronilla 10 cm por debajo, perfecta
    const { out } = run({ drop }, env, () => (env.head.y = 1.6 - drop - 0.1));
    expect(out?.kind).toBe('pass');
    expect(out?.perfect).toBe(true);
    expect(out?.rep).toBe(true);
    expect(out?.perfectSound).toBe(true);
    expect(out?.say?.[0]).toBe('¡PERFECTA!');
    const e3 = mkEnv(), { out: o3 } = run({ drop }, e3, () => (e3.head.y = 1.6 - drop - 0.02));
    expect(o3?.kind).toBe('pass');
    expect(o3?.perfect).toBe(false);
    expect(o3?.say?.[0]).toBe('¡Esquivado!');
  });

  it('con la cabeza por encima de la barra, te da', () => {
    const env = mkEnv(), { out, a } = run({ drop: 0.3 }, env, () => (env.head.y = 1.6));
    expect(a.hit).toBe(true);
    expect(out?.kind).toBe('hurt');
    expect(out?.hurt).toBe(true);
    expect(out?.sound).toBe('zap');
    expect(out?.say?.[0]).toBe('¡Agáchate más!');
    expect(out?.hitPoint.y).toBeCloseTo(a.barY);
  });

  it('fuera del carril no se juzga el paso: «Quédate en el carril»', () => {
    const env = mkEnv(), { out } = run({ drop: 0.3 }, env, () => (env.head.x = 1.5));
    expect(out?.kind).toBe('lane');
    expect(out?.hurt).toBe(false);
  });

  it('el segundo de un doble: aguantar abajo da puntos sin repetición', () => {
    const env = mkEnv(), { out } = run({ drop: 0.3, offset: 1, second: true }, env, () => (env.head.y = 1.6 - 0.45));
    expect(out?.kind).toBe('second');
    expect(out?.rep).toBe(false);
    expect(out?.scoreBase).toBe(150);
    expect(out?.cheer?.[0]).toBe('¡Aguantado!');
  });

  it('la valla pide subir la cabeza arcJumpH, deprisa, mientras pasa', () => {
    const need = arcJumpNeed(mkEnv());
    expect(need).toBeCloseTo(0.06);
    // saltando justo cuando pasa (y deprisa): saltada
    const env = mkEnv();
    const { out } = run({ drop: 0, jump: true }, env, (_t, a) => {
      const d = Math.abs(a.z - env.head.z);
      env.head.y = d < 0.3 ? 1.6 + need + 0.1 : 1.6;
      env.jumpFastT = d < 0.3 ? 0 : 9;
    });
    expect(out?.kind).toBe('jumpOk');
    expect(out?.perfect).toBe(true);
    // de puntillas despacio (sin el salto deprisa): no vale
    const e2 = mkEnv(), { out: o2 } = run({ drop: 0, jump: true }, e2, () => (e2.head.y = 1.6 + need + 0.1));
    expect(o2?.kind).toBe('jumpFail');
    expect(o2?.say?.[0]).toBe('¡Salta, no te estires!');
    // sin saltar
    const e3 = mkEnv(), { out: o3 } = run({ drop: 0, jump: true }, e3, () => {});
    expect(o3?.kind).toBe('jumpFail');
    expect(o3?.say?.[0]).toBe('¡Salta!');
  });

  it('el arco de plancha: a ras de suelo y más despacio; en plancha pasa, de pie te da', () => {
    const env = mkEnv(), a = new ArcCore({ drop: 0, plank: true }, env, calm);
    expect(a.barY).toBeCloseTo(0.6);
    expect(a.speed).toBeLessThan(new ArcCore({ drop: 0.3 }, env, calm).speed);
    const { out } = run({ drop: 0, plank: true }, env, () => (env.head.y = 0.4));
    expect(out?.kind).toBe('pass');
    const e2 = mkEnv(), { out: o2 } = run({ drop: 0, plank: true }, e2, () => (e2.head.y = 1.0));
    expect(o2?.say?.[0]).toBe('¡Al suelo, en plancha!');
  });

  it('el inclinado: agacharse en el centro choca con la pared del lado bajo; apartado al lado alto, pasa', () => {
    const env = mkEnv({ arcTilt: 100 }), tilt = 0.3; // (lado alto a la derecha)
    const { out, a } = run({ drop: 0.3, tilt }, env, () => {
      env.head.x = 0;
      env.head.y = 0.5;
    });
    expect(a.sideMin).toBeCloseTo(0.2);
    expect(a.sideHit).toBe(true);
    expect(out?.say?.[0]).toContain('Por el lado alto: apártate a la derecha');
    const e2 = mkEnv({ arcTilt: 100 }), r2 = run({ drop: 0.3, tilt }, e2, (_t, b) => {
      e2.head.x = b.leanX;
      e2.head.y = b.barAt(b.leanX) - HEAD_TOP - 0.1;
    });
    expect(r2.a.sideBad).toBe(false);
    expect(r2.out?.kind).toBe('pass');
    expect(r2.out?.perfect).toBe(true);
  });

  it('avisa con pitidos cada vez más agudos mientras te va a dar', () => {
    const env = mkEnv(), a = new ArcCore({ drop: 0.3 }, env, calm), beeps: number[] = [];
    for (let f = 0; f < 20000 && !a.judged; f++) {
      a.update(1 / 72, env);
      if (a.beep) beeps.push(a.beep);
    }
    expect(beeps.length).toBeGreaterThan(3);
    expect(beeps[beeps.length - 1]).toBeGreaterThan(beeps[0]);
  });
});

describe('Arcos: las oleadas', () => {
  it('al azar, con 0 % no sale nada de eso y con 100 % de vallas, todo vallas', () => {
    const zero = { arcPatterns: 0, arcCombo: 0, arcNew: 0, arcJump: 0, arcMace: 0, arcPlank: 0, arcBurpee: 0, arcHurdles: 0, arcLow: 0, arcTilt: 0, arcDouble: 0 };
    const l = buildArcsWave(30, mkEnv(zero), new ArcNewKind(rng(2)));
    expect(l.length).toBe(30);
    expect(l.every((s) => s.kind === 'single' && s.tilt === 0)).toBe(true);
    const j = buildArcsWave(20, mkEnv({ ...zero, arcJump: 100 }), new ArcNewKind(rng(2)));
    expect(j.every((s) => s.kind === 'jump')).toBe(true);
    // las bajadas, entre la mínima y la máxima
    for (const s of l) expect(s.drop >= 0.18 && s.drop <= 0.38).toBe(true);
  });

  it('los inclinados se reparten exactos entre los dos lados (arcRight), barajados', () => {
    const zero = { arcPatterns: 0, arcCombo: 0, arcNew: 0, arcJump: 0, arcMace: 0, arcPlank: 0, arcBurpee: 0, arcHurdles: 0, arcLow: 0, arcDouble: 0 };
    for (const right of [0, 30, 50, 100]) {
      const l = buildArcsWave(20, mkEnv({ ...zero, arcTilt: 100, arcRight: right }, right + 3), new ArcNewKind(rng(2)));
      const r = l.filter((s) => s.tilt > 0).length, lf = l.filter((s) => s.tilt < 0).length;
      expect(r + lf).toBe(20);
      expect(r).toBe(Math.round(20 * right / 100));
      for (const s of l) expect(Math.abs(s.tilt)).toBeLessThanOrEqual(18 * Math.PI / 180 + 1e-9);
    }
  });

  it('coreografías: la oleada tiene su largo, y en las largas salen los tres obstáculos nuevos', () => {
    const nk = new ArcNewKind(rng(5));
    const l = buildArcsWave(12, mkEnv({ arcNew: 50 }, 9), nk);
    expect(l.length).toBe(12);
    for (const k of ['laser', 'walls', 'wheel']) expect(l.some((s) => s.kind === k), k).toBe(true);
  });

  it('antes de un arco de plancha, el anterior deja tiempo para bajar al suelo', () => {
    const zero = { arcPatterns: 0, arcCombo: 0, arcNew: 0, arcJump: 0, arcMace: 0, arcBurpee: 0, arcHurdles: 0, arcLow: 0, arcTilt: 0, arcDouble: 0 };
    const l = buildArcsWave(30, mkEnv({ ...zero, arcPlank: 30 }, 4), new ArcNewKind(rng(2)));
    l.forEach((s, i) => {
      if (s.kind === 'plank' && i > 0) expect(l[i - 1].gap).toBeGreaterThanOrEqual(1.8);
    });
  });

  it('sacar un arco de plancha: los de detrás esperan a que pase, con su aviso', () => {
    const env = mkEnv(), plan = arcSpawnPlan({ kind: 'plank', drop: 0, tilt: 0, hp: 1, gap: 2.4 }, env, calm, 2);
    expect(plan.arcs.length).toBe(1);
    expect(plan.arcs[0].plank).toBe(true);
    expect(plan.minNext).toBeGreaterThan(2.5);
    expect(plan.notice?.[0]).toBe('¡ARCO DE PLANCHA!');
    expect(plan.horn).toBe(true);
    expect(plan.nextGap).toBe(2.4);
    expect(plan.orbT).toBe(null);
    const d = arcSpawnPlan({ kind: 'double', drop: 0.3, tilt: 0, hp: 1 }, env, calm, 2);
    expect(d.arcs.map((a) => a.second)).toEqual([false, true]);
    const c = arcSpawnPlan({ kind: 'combo', with: 'walls', drop: 0.2, tilt: 0, hp: 1 }, env, calm, 2);
    expect(c.obs).toBe('walls');
    expect(c.arcs[0].second).toBe(true);
  });
});
