// El vuelo portado (src/combat/flight.ts: Flight) frente al código original de RepArena (src/70_game.js: Flyer, gateKeep y
// frontKeep): voladores al azar saliendo de compuertas al azar, contigo moviéndote un poco y disparándoles de vez en
// cuando, con el mismo azar; en cada fotograma tienen que estar en el mismo sitio, con el mismo alabeo, y morder a la vez.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Flight, FLYER_KIND, type FlyGate } from '../../src/combat/flight.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

interface RAFlyer {
  pos: THREE.Vector3;
  base: THREE.Vector3;
  bank: number;
  windT: number;
  hp: number;
  hitDir: THREE.Vector3 | null;
  update(dt: number, t: number): void;
  onHit(dmg: number, perfect: boolean, point: THREE.Vector3, pow: number): void;
}

function original(world: { HL: THREE.Vector3; state: string; bites: number; settings: Record<string, unknown>; DET: Record<string, Record<string, unknown>>; stats: { time: number }; tiny?: boolean }, gate: FlyGate, random: () => number): (kind: string, hp: number) => RAFlyer {
  const code = [raSlice('70_game.js', 'const FLYER_KIND', 'function beastFlyer', false), raSlice('70_game.js', 'const MAT_DRONE', 'M.carbonStatic', false), raSlice('70_game.js', 'const FRONT_MIN'), raSlice('70_game.js', 'function frontKeep')].join('\n');
  const stubObj = () => {
    const position = new V3();
    return { position, rotation: { x: 0, y: 0, z: 0 }, scale: { setScalar: () => {} }, lookAt: () => {}, getWorldPosition: (o: THREE.Vector3) => o.copy(position) };
  };
  const Mth = { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random };
  const g = { x: gate.x, z: gate.z, scale: gate.scale, g: { rotation: { y: gate.ry } }, openT: 0 };
  return raRun<(kind: string, hp: number) => RAFlyer>(code + '\nconst mk = (kind, hp) => new Flyer({ kind, hp });', 'mk', {
    V3,
    Math: Mth,
    TAU: Math.PI * 2,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    rand: (a: number, b: number) => a + random() * (b - a),
    pick: <T>(arr: T[]) => arr[Math.floor(random() * arr.length)],
    smooth: (t: number) => t * t * (3 - 2 * t),
    M: {},
    RIGS: {},
    get HL() {
      return world.HL;
    },
    get state() {
      return world.state;
    },
    head: { get p() {
      return world.HL;
    } },
    settings: world.settings,
    stats: world.stats,
    DET: world.DET,
    dv: (k: string) => world.settings[k],
    isTiny: () => !!world.tiny,
    liveHatches: () => [{ x: gate.x, z: gate.z, openT: 0 }],
    isCombat: () => true,
    liveGates: () => [g],
    beastFlyer: () => {
      const root = stubObj(), body = stubObj();
      return { root, model: {}, mat: {}, bones: { body }, meshes: {}, skel: { dispose: () => {} }, mx: { update: () => {}, stopAllAction: () => {} }, clips: {}, acts: {}, cur: null };
    },
    makeHpBar: () => null,
    buzzLoop: () => null,
    arena: { add: () => {}, remove: () => {}, localToWorld: (v: THREE.Vector3) => v, worldToLocal: (v: THREE.Vector3) => v },
    tmpA: new V3(),
    tmpB: new V3(),
    tmpC: new V3(),
    hurtPlayer: () => world.bites++,
    SND: { roar: () => {}, whoosh: () => {}, hiss: () => {}, squish: () => {}, metalHit: () => {}, explosion: () => {} },
    fx: { sparks: () => {}, ichor: () => {}, glow: () => {}, explosion: () => {} },
    BEAST_PITCH: {},
    spawnQueue: [],
    beatP: () => 0,
    BEAT: { hit: false },
    mxPlay: () => {},
    knockK: () => 1,
    SHOVE_K: 7,
    shoveDir: (b: THREE.Vector3) => {
      b.y = 0;
      b.normalize();
      return 0;
    },
  });
}

describe.skipIf(!RA_DIR)('el vuelo de los voladores, como en RepArena', () => {
  it('el mismo vuelo, los mismos mordiscos, en 120 vuelos al azar (de pie, en el superman, en la plancha lateral y diminutos en las flexiones)', () => {
    let frames = 0, bites = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const ex = ['squat', 'superman', 'splank', 'pushup'][seed % 4], tiny = ex === 'pushup';
      const r = rng(seed), kinds = Object.keys(FLYER_KIND), kind = kinds[Math.floor(r() * kinds.length)];
      const ga = (r() - 0.5) * 1.6, gate: FlyGate = { x: Math.sin(ga) * 11, z: -Math.cos(ga) * 11, ry: ga, scale: 1 };
      const flySpeed = 2 + r() * 8, erratic = 50 + r() * 130, hp = 2 + Math.floor(r() * 4);
      const supHold = 1 + Math.floor(r() * 3), supRange = 6 + Math.floor(r() * 10), refY = ex === 'splank' ? 0.45 : 0.2;
      const DET = { su: { state: 'down', ref: refY }, sp: { ref: refY } };
      const world = { HL: new V3(0, 1.6, 0), state: 'play', bites: 0, settings: { flySpeed, erratic, exercise: ex, supHold, supRange } as Record<string, unknown>, DET, stats: { time: 0 }, tiny };
      const raR = rng(seed * 7919), ptR = rng(seed * 7919);
      const ra = original(world, gate, raR)(kind, hp);
      ptR(); // (RepArena elige ahí la compuerta: pick)
      const low = ex === 'superman' || ex === 'splank', lowY = Math.max(0.3, Math.min(0.8, ex === 'splank' ? refY + 0.03 : refY + supRange / 100 + 0.08));
      const pt = new Flight(kind, gate, flySpeed, erratic, hp, ptR, low, tiny);
      const supNext = { t: 0 };
      const env = { head: world.HL, play: true, active: true, beat: true, low: low ? lowY : 0, sup: ex === 'superman' ? { hold: supHold, up: false, time: 0, next: supNext } : null };
      let t = 0, myBites = 0;
      for (let i = 0; i < 1500; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        world.stats.time = t;
        const up = ex === 'superman' && Math.sin(t * 0.8) > 0.5;
        DET.su.state = up ? 'up' : 'down';
        if (env.sup) Object.assign(env.sup, { up, time: t });
        world.HL.set(Math.sin(t * 0.3) * 0.3, tiny ? 0.4 - 0.1 * Math.max(0, Math.sin(t * 2)) : low ? refY + (up ? 0.1 : 0) : 1.6 - 0.35 * Math.max(0, Math.sin(t * 1.7)), Math.cos(t * 0.2) * 0.2);
        if (i % 200 === 199 && ra.hp > 1) {
          // un disparo (con su dirección, horizontal): el empujón, como lo calcula RepArena con su shoveDir sin dirección
          const pow = 1 + Math.floor(r() * 4), perfect = r() < 0.3;
          ra.hitDir = null;
          ra.onHit(1, perfect, ra.pos.clone(), pow);
          pt.hit(1, perfect, pow, world.HL, null, 1);
        }
        ra.update(dt, t);
        pt.step(dt, env);
        if (pt.evBite) myBites++;
        expect(pt.pos.distanceTo(ra.pos), `semilla ${seed} (${kind}), fotograma ${i}`).toBeLessThan(1e-9);
        expect(Math.abs(pt.bank - ra.bank), `semilla ${seed}, fotograma ${i}`).toBeLessThan(1e-9);
        expect(pt.windT).toBe(ra.windT);
        frames++;
      }
      expect(myBites, `semilla ${seed}`).toBe(world.bites);
      bites += myBites;
    }
    expect(frames).toBeGreaterThan(170000);
    expect(bites).toBeGreaterThan(20);
  });
});
