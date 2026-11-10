// La marcha portada (src/combat/gait.ts: gaitPlan y Gait) frente al código original de RepArena (src/70_game.js: el
// constructor de Robot, su paso 'walk' —velocidad, zigzag y rachas, amenaza— y dodgeStep): con los mismos datos al azar y
// el mismo azar, las mismas velocidades, el mismo zigzag, las mismas paradas, las mismas amenazas y las mismas esquivas.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Gait, gaitPlan, type GaitStyle } from '../../src/combat/gait.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

describe.skipIf(!RA_DIR)('la marcha de los de tierra, como en RepArena', () => {
  it('el ritmo de la marcha (gaitPlan): las mismas velocidades', () => {
    const code = raSlice('70_game.js', '    const W = walkT(), D = this.pos.distanceTo', '    this.speed = this.vWalk;');
    const r = rng(3);
    for (let i = 0; i < 3000; i++) {
      const D = 1 + r() * 14, W = 3 + r() * 22, speedF = 0.8 + r() * 0.6, heavy = r() < 0.3, travel = 1 + r() * 2;
      const p = gaitPlan(D, W, speedF, heavy, travel);
      // (RepArena lee «travel» de su ámbito: se le da con el mismo nombre)
      const self2: Record<string, unknown> = { pos: new V3(D, 0, 0), slot: new V3(0, 0, 0) };
      raRun(`(function(){${code}}).call(self2)`, '0', { self2, walkT: () => W, K: { speedF, heavy }, clamp, V3, travel });
      for (const k of ['chargeD', 'vWalk', 'vRun', 'vMove'] as const) expect(p[k], `${k} (${i})`).toBeCloseTo(self2[k] as number, 12);
    }
  });

  it('la marcha: el mismo zigzag, las mismas rachas y paradas', () => {
    const code = raSlice('70_game.js', '        wantV = (this.charged ? this.vRun', '        else if (free) {');
    const run = raRun<(self: Record<string, unknown>, dt: number, d: number) => { wantV: number; lat: number }>(`const f = function(self, dt, d){ let wantV; const s = self; (function(){${code}; s.__w = wantV; s.__l = lat; }).call(s); return { wantV: s.__w, lat: s.__l }; };`, 'f', { clamp });
    const r = rng(11);
    for (let g = 0; g < 200; g++) {
      const style = (['straight', 'zigzag', 'bursts', 'dodge'] as GaitStyle[])[g % 4];
      const plan = gaitPlan(2 + r() * 10, 4 + r() * 18, 1, r() < 0.3, 1 + r() * 2);
      const gt = new Gait(style, plan, 1, () => 0.5);
      const ra: Record<string, unknown> = { ...plan, style, zigPh: gt.zigPh, burstT: gt.burstT, out: true, charged: false };
      let d = 10;
      for (let i = 0; i < 600; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        ra.out = i > 40;
        ra.charged = d < plan.chargeD;
        const a = run(ra, dt, d);
        gt.march(dt, d, i > 40, d < plan.chargeD);
        expect(gt.wantV, `${style} ${g}/${i}`).toBeCloseTo(a.wantV, 12);
        expect(gt.lat, `${style} ${g}/${i}`).toBeCloseTo(a.lat, 12);
        d = Math.max(0, d - Math.max(0, gt.wantV) * dt);
      }
    }
  });

  it('las esquivas: las mismas, al mismo tiempo y a la misma distancia', () => {
    const code = raSlice('70_game.js', '  dodgeStep(dt, faceP) {', '  // Un disparo cargado', false);
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const raR = rng(seed * 13), ptR = rng(seed * 13), r = rng(seed);
      const pace = 0.5 + r() * 2, canRoll = r() < 0.5, sc = 0.8 + r() * 0.5;
      const world = { state: 'play' };
      const mk = raRun<(o: Record<string, unknown>) => Record<string, unknown>>(`const proto = { ${code} }; const mk = (o) => Object.assign(Object.create(proto), o);`, 'mk', {
        _rd: new V3(),
        clamp,
        rand: (a: number, b: number) => a + raR() * (b - a),
        Math: mathWith(raR),
        solidsNow: () => [],
        enemies: [],
        roomBlocked: () => false,
        arenaDepth: () => 99,
        get state() {
          return world.state;
        },
      });
      const gt = new Gait('dodge', gaitPlan(8, 10, 1, false, 1), pace, ptR);
      for (let k = 0; k < 4; k++) raR(); // (lo que Gait saca al nacer: amenaza, zigzag, rachas y esquiva)
      const ra = mk({ style: 'dodge', state: 'walk', out: true, charged: false, pace, hp: 3, lastHp: 3, dodge: 0, dodgeDir: 0, dodgeT: gt.dodgeT, roll: false, pos: new V3(0, 0, -5), radius: 0.4, sc, mx: canRoll ? {} : null, clips: canRoll ? { Roll: {} } : null, K: { beast3d: canRoll ? 'imp' : null }, slotT: 1 });
      for (let i = 0; i < 2000; i++) {
        const dt = 1 / 72, hitNow = i % 300 === 299;
        if (hitNow) (ra as { hp: number }).hp -= 1;
        const before = (ra.pos as THREE.Vector3).x;
        (ra as unknown as { dodgeStep(dt: number, f: number): void }).dodgeStep(dt, 0); // (mirándote de frente: lo de lado es x)
        const side = gt.dodgeStep(dt, true, hitNow && (ra.hp as number) > 0, canRoll, sc);
        expect(side, `semilla ${seed}, ${i}`).toBeCloseTo((ra.pos as THREE.Vector3).x - before, 12);
        expect(gt.dodge).toBeCloseTo(ra.dodge as number, 12);
        if (side) n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it('la amenaza: una vez por avance, entre 3 y 7 m', () => {
    const line = raSlice('70_game.js', '        if (!this.taunts && walkT() >= 10');
    const r = rng(5);
    for (let g = 0; g < 100; g++) {
      const W = 5 + r() * 15, gt = new Gait('straight', gaitPlan(8, W, 1, false, 1), 1, () => r());
      const ra = { taunts: 0, tauntT: gt.tauntT, state: 'walk', st: 0, K: { boss: false, heavy: false }, roar: () => {}, center: () => null };
      const step = raRun<(self: unknown, toPl: number, dt: number) => boolean>(`const f = function(self, toPl, dt){ let fired = false; (function(){ do { ${line.replace('break; } }', 'fired = true; break; } }')} } while (false); }).call(self); return fired; };`, 'f', { walkT: () => W, tmpB: null, K: { boss: false, heavy: false } });
      for (let i = 0, toPl = 11; i < 900; i++, toPl -= 0.012) {
        const a = step(ra, toPl, 1 / 72), b = gt.tauntNow(1 / 72, W, toPl);
        expect(b, `${g}/${i}`).toBe(a);
      }
    }
  });
});
