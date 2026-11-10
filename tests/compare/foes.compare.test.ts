// Los puestos de ataque portados (src/combat/foes.ts: foeSlot) frente al código original de RepArena (src/70_game.js:
// robotSlot y frontKeep): enemigos al azar saliendo de las compuertas uno tras otro (de distinto radio y distancia de
// golpe), contigo en distintos sitios, con el mismo azar; tienen que quedar los mismos puestos en las mismas filas. Sin la
// habitación de la realidad mixta (llega con el PR 21). (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { foeSlot, type SlotFoe } from '../../src/combat/foes.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

type RAFoe = { alive: boolean; type: string; slotOk: boolean; slot: THREE.Vector3; radius: number; pos: THREE.Vector3; K: { stop: number }; row?: number; slotAt?: THREE.Vector3 };

function original(enemies: RAFoe[], HL: THREE.Vector3, random: () => number): (r: RAFoe) => void {
  const code = [raSlice('70_game.js', 'const ROW_GAP'), raSlice('70_game.js', 'const FRONT_MIN'), raSlice('70_game.js', 'function frontKeep'), raSlice('70_game.js', 'function robotSlot', 'const _rs = new V3()')].join('\n');
  return raRun<(r: RAFoe) => void>(code, 'robotSlot', {
    V3,
    enemies,
    HL,
    robotStop: (K: { stop: number }) => K.stop,
    roomPlan: () => null,
    roomBlocked: () => false,
    isCombat: () => true,
    isTiny: () => false,
    Math: { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random },
  });
}

describe.skipIf(!RA_DIR)('los puestos de ataque, como en RepArena', () => {
  it('los mismos puestos y filas en 200 partidas al azar', () => {
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed), head = new V3((r() - 0.5) * 1.5, 1.6, (r() - 0.5) * 1.5);
      const raR = rng(seed * 31), ptR = rng(seed * 31);
      const ra: RAFoe[] = [], pt: SlotFoe[] = [], slot = original(ra, head, raR);
      for (let i = 0, N = 2 + Math.floor(r() * 9); i < N; i++) {
        const x = (r() - 0.5) * 10, z = -9 - r() * 3, rad = 0.35 + r() * 0.25, stop = 1.0 + r() * 0.5;
        const a: RAFoe = { alive: true, type: 'robot', slotOk: false, slot: new V3(), radius: rad, pos: new V3(x, 0, z), K: { stop } };
        const b: SlotFoe = { pos: new V3(x, 0, z), radius: rad, stop, slot: new V3(), slotOk: false, row: 0 };
        ra.push(a);
        slot(a);
        foeSlot(b, pt, head, ptR);
        pt.push(b);
        expect(b.row, `semilla ${seed}, enemigo ${i}`).toBe(a.row);
        expect(b.slot.distanceTo(a.slot), `semilla ${seed}, enemigo ${i}`).toBeLessThan(1e-9);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
});
