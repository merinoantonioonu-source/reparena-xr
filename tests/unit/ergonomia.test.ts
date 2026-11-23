// La ergonomía (docs/ERGONOMIA.md): cada postura pide las cosas donde cae su mirada natural y con el tiempo que necesita. Lo
// cambiado en RepArena XR frente a RepArena (lo de RepArena sigue igual con `classic`, y lo comparan tests/compare).
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bodyDir } from '../../src/input/body-dir.js';
import { mkHand } from '../../src/input/hand-model.js';
import type { TouchEnv } from '../../src/modes/touch/env.js';
import { moveSpec } from '../../src/modes/touch/targets.js';
import { TCH_FLOOR_GAP, tchGapFor } from '../../src/modes/touch/wave.js';
import { GUIDE_TOAST_EX, guideSpot, type GuideSpot } from '../../src/ui/guide-spot.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const BASE: Record<string, number | string> = { exercise: 'slam', comboBase: 'stand', tchRing: 15, squatDepth: 26, lungeDepth: 28, pushDepth: 13, jumpHeight: 10, slamDeep: 12, tchGap: 1, plankHold: 5, abMin: 25, abMax: 55, abTwist: 25, sword: 'off', bpm: 0 };
function env(over: Record<string, number | string> = {}, classic = false): TouchEnv {
  const st = { ...BASE, ...over };
  return { s: (k: string) => +st[k] || 0, str: (k: string) => String(st[k] ?? ''), dv: (k: string) => +st[k] || 0, rnd: rng(3), now: () => 0, state: 'play', head: new Vector3(0, 1.6, 0), headSpeed: 0, hands: { left: mkHand(), right: mkHand() }, toArena: (v: Vector3) => v, ar: false, standY: 1.6, swordActive: () => false, swordCut: () => null, waveReps: () => 6, classic } as TouchEnv;
}
const DEG = 180 / Math.PI;

describe('Toques: donde cae la mirada', () => {
  it('lo de arriba (reach) queda a unos 30° sobre los ojos y al alcance de la mano (RepArena: casi encima de la cabeza)', () => {
    for (let i = 0; i < 20; i++) {
      const o = moveSpec(env(), 1.6, 'reach'), up = o.pos.y - 1.6, hor = Math.hypot(o.pos.x, o.pos.z);
      expect(Math.atan2(up, hor) * DEG).toBeLessThan(40);
      expect(Math.hypot(hor, o.pos.y - 1.35)).toBeLessThan(0.85); // (desde el hombro, con la mano estirada y saltando)
      const c = moveSpec(env({}, true), 1.6, 'reach');
      expect(Math.atan2(c.pos.y - 1.6, Math.hypot(c.pos.x, c.pos.z)) * DEG).toBeGreaterThan(50);
    }
  });
  it('en plancha nacen a 2,5 m (RepArena: 3,5)', () => {
    expect(moveSpec(env({ exercise: 'pushup' }), 0.45, 'push').from.z).toBeCloseTo(-2.5, 6);
    expect(moveSpec(env({ exercise: 'pushup' }, true), 0.45, 'push').from.z).toBeCloseTo(-3.5, 6);
  });
  it('boca arriba bajan del aire, por delante y por encima, no a ras de suelo desde los pies', () => {
    const o = moveSpec(env({ exercise: 'abs' }), 0.2, 'crunch');
    expect(o.from.y - o.pos.y).toBeGreaterThan(1.5);
    expect(Math.abs(o.from.z)).toBeLessThan(3);
    const head = new Vector3(0, 0.2, 0), d = o.from.clone().sub(head);
    expect(Math.atan2(d.y, Math.hypot(d.x, d.z)) * DEG).toBeGreaterThan(35); // (a la vista con el tronco subido)
  });
  it('en el suelo, al menos 2 s entre uno y otro; de pie, lo que digan los ajustes', () => {
    expect(tchGapFor(env({ exercise: 'pushup' }), 'push')).toBe(TCH_FLOOR_GAP);
    expect(tchGapFor(env({ exercise: 'abs' }), 'crunch')).toBe(TCH_FLOOR_GAP);
    expect(tchGapFor(env({ exercise: 'slam' }), 'duck')).toBe(1);
    expect(tchGapFor(env({ exercise: 'pushup' }, true), 'push')).toBe(1);
  });
});

describe('el panel de indicaciones según la postura', () => {
  const g = {} as GuideSpot;
  it('con la vista en la pesa o en el suelo, al aviso breve (sin panel)', () => {
    for (const ex of GUIDE_TOAST_EX) expect(guideSpot('combat', false, 'right', -11, g, ex)).toBeNull();
    expect(guideSpot('trek', false, 'right', -11, g, 'curl')).not.toBeNull();
  });
  it('sentado (fondos), más bajo: a unos 14° sobre los ojos sentados y por encima de la boca de la compuerta', () => {
    const s = guideSpot('combat', false, 'right', -11, g, 'dips')!;
    const ang = Math.atan2(s.y - 1.1, -s.z) * DEG;
    expect(ang).toBeGreaterThan(10);
    expect(ang).toBeLessThan(17);
    expect(s.y - 0.7).toBeGreaterThan(3.1);
    const st = guideSpot('combat', false, 'right', -11, {} as GuideSpot, 'squat')!;
    expect(st.y).toBeGreaterThan(s.y);
  });
});

describe('la plancha lateral, solo con la mirada', () => {
  it('de lado mirando algo abajo, la coronilla (a lo largo del cuerpo) no desvía la dirección', () => {
    // tumbado sobre el costado derecho mirando a −Z y algo abajo: la coronilla apunta a +X
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2 + 0.0);
    q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.5));
    const a = bodyDir(q, new Vector3(), true), b = bodyDir(q, new Vector3());
    expect(a.z).toBeLessThan(-0.99);
    expect(b.z).toBeGreaterThan(a.z + 0.05); // (con la coronilla, se iba a un costado)
  });
});
