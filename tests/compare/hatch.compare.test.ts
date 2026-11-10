// Los bichos de las trampillas portados (src/combat/hatch.ts: HatchFoe, floorDetour, floorBoardKeep) frente al código
// original de RepArena (src/70_game.js: Spider con HatchBeast, floorDetour y floorBoardKeep): varios a la vez saliendo de
// trampillas al azar (flexiones y plancha con un brazo), contigo moviéndote un poco y disparándoles de vez en cuando, con el
// mismo azar; en cada fotograma tienen que estar en el mismo sitio, en el mismo modo, y morder a la vez. (Se salta sin
// RA_DIR.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HatchFoe, HATCH_POS, HATCH_SIDE } from '../../src/combat/hatch.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mathWith = (random: () => number) => ({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random });

interface RAS { pos: THREE.Vector3; mode: string; alive: boolean; hp: number; hitDir: THREE.Vector3 | null; update(dt: number, t: number): void; onHit(dmg: number, perfect: boolean, p: THREE.Vector3, pow: number): void }

class G {
  position = new V3();
  rotation = { x: 0, y: 0, z: 0 };
  scale = { setScalar: () => {} };
  add() {}
  traverse() {}
  updateMatrixWorld() {}
  localToWorld(v: THREE.Vector3) {
    return v.add(this.position);
  }
}

describe.skipIf(!RA_DIR)('los bichos de las trampillas, como en RepArena', () => {
  it('el mismo camino, los mismos amagos y mordiscos, en 60 rondas al azar', () => {
    const code = [
      raSlice('70_game.js', 'const FLOORB'),
      "const floorBoardOn = () => true;",
      raSlice('70_game.js', 'function floorDetour', 'const _fdW', true),
      raSlice('70_game.js', 'const SPIDER_KIND'),
      raSlice('70_game.js', 'class Spider', '/* ---------- Las piedras del lanzador', false),
      raSlice('70_game.js', '/* ---------- Monstruitos de las trampillas', '/* =================== BICHOS VOLADORES', false),
      'const mk = (spec, hatch) => { const e = new HatchBeast(spec, hatch); enemies.push(e); return e; };',
    ].join('\n');
    let frames = 0, bites = 0, threats = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed), raR = rng(seed * 101), ptR = rng(seed * 101), one = seed % 2 === 0, walkT = 6 + r() * 12;
      const world = { HL: new V3(0, 0.4, 0), bites: 0, enemies: [] as RAS[] };
      const rand = (a: number, b: number) => a + raR() * (b - a);
      const mk = raRun<(spec: { kind: string; hp: number }, hatch: { x: number; z: number; openT: number }) => RAS>(code, 'mk', {
        V3,
        THREE: { Group: G, MeshStandardMaterial: class { color = { setRGB() {} }; dispose() {} }, AnimationMixer: class { update() {} stopAllAction() {} }, SkeletonUtils: { clone: () => Object.assign(new G(), { traverse() {} }) } },
        Math: mathWith(raR),
        rand,
        clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
        lerp: (a: number, b: number, t: number) => a + (b - a) * t,
        smooth: (t: number) => t * t * (3 - 2 * t),
        wrapAng: (a: number) => Math.atan2(Math.sin(a), Math.cos(a)),
        TAU: Math.PI * 2,
        tmpA: new V3(),
        tmpB: new V3(),
        tmpC: new V3(),
        _foot: new V3(),
        get HL() {
          return world.HL;
        },
        state: 'play',
        settings: { exercise: one ? 'plank1' : 'pushup', knockback: 100 },
        dv: () => walkT,
        IW_SLOW: 3,
        oneArm: () => one,
        arena: { add() {}, remove() {}, localToWorld: (v: THREE.Vector3) => v, worldToLocal: (v: THREE.Vector3) => v },
        BEAST_DEF: { crab: { k: 0.18 / 1.57, h: 0.18 } },
        BEAST: { kinds: { crab: { scene: {}, map: null, clips: {} } } },
        skelFree: () => ({ dispose() {} }),
        makeHpBar: () => ({ g: { visible: true } }),
        SND: { hiss() {}, skitter() {}, whoosh() {}, squish() {}, explosion() {} },
        fx: { ichor() {}, glow() {}, sparks() {}, explosion() {} },
        mxPlay: () => {},
        hurtPlayer: () => world.bites++,
        get enemies() {
          return world.enemies;
        },
        knockK: () => 1,
        SHOVE_K: 7,
        shoveDir: (b: THREE.Vector3) => {
          b.y = 0;
          b.normalize();
          return 0;
        },
        SPIDER_LEGS: [],
      });
      const holes = one ? HATCH_SIDE : HATCH_POS, ra: RAS[] = [], pt: HatchFoe[] = [];
      let t = 0, myBites = 0;
      for (let i = 0; i < 1600; i++) {
        if (i % 300 === 0 && ra.length < 4) {
          const [x, z] = holes[Math.floor(r() * holes.length)], boss = r() < 0.2, hp = 2 + Math.floor(r() * 3);
          ra.push(mk({ kind: boss ? 'hcrabboss' : 'hcrab', hp }, { x, z, openT: 0 }));
          pt.push(new HatchFoe(boss ? 2.4 : 1, boss, { x, z }, one, walkT, hp, ptR));
        }
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        world.HL.set(Math.sin(t * 0.4) * 0.05, 0.4 - 0.1 * Math.max(0, Math.sin(t * 2)), Math.cos(t * 0.3) * 0.05);
        if (i % 170 === 169) {
          const j = Math.floor(r() * ra.length);
          if (ra[j]?.alive && ra[j].hp > 1) {
            const pow = 1 + Math.floor(r() * 4), perfect = r() < 0.3;
            ra[j].hitDir = null;
            ra[j].onHit(1, perfect, ra[j].pos.clone(), pow);
            pt[j].hit(1, perfect, pow, world.HL, null, 1);
          }
        }
        for (let j = 0; j < ra.length; j++) {
          if (!ra[j].alive) continue;
          ra[j].update(dt, t);
          pt[j].step(dt, t, { HL: world.HL, play: true, active: true, board: true, others: pt });
          if (pt[j].evBite) myBites++;
          if (pt[j].mode === 'threat' && pt[j].st < dt * 1.5) threats++;
          expect(pt[j].pos.distanceTo(ra[j].pos), `semilla ${seed}, bicho ${j}, fotograma ${i}`).toBeLessThan(1e-9);
          expect(pt[j].mode, `semilla ${seed}, bicho ${j}, fotograma ${i}`).toBe(ra[j].mode);
        }
        frames++;
      }
      expect(myBites, `semilla ${seed}`).toBe(world.bites);
      bites += myBites;
    }
    expect(frames).toBeGreaterThan(90000);
    expect(bites).toBeGreaterThan(30);
    expect(threats).toBeGreaterThan(30);
  }, 120000);
});
