// Los enemigos desde su tabla (src/combat/foes.ts): que cada animación de la tabla esté de verdad en su modelo, su
// resistencia y su fuerza (de serie y con la tabla del desarrollador), el reparto entre los elegidos y los puestos de
// ataque (en un arco delante de ti, sin pisarse, nunca detrás; si no caben, en la fila de atrás).
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEV } from '../../src/core/dev-state.js';
import { FOE_FLY, FOE_GATE } from '../../src/core/catalog.js';
import { deal, devFoe, flyFoes, FOE_DEF, foeSlot, FRONT_MIN, gateFoes, type SlotFoe } from '../../src/combat/foes.js';

const ASSETS = fs.readFileSync(path.resolve('src/assets.ts'), 'utf8');
// el nombre de archivo de cada recurso del catálogo (foe('piratas/capitan.glb', …) o glb('zombie_basic.glb', …))
const fileOf = (id: string): string => {
  const m = ASSETS.match(new RegExp(`'${id}': (?:foe|glb)\\('([^']+)'`));
  if (!m) throw new Error('no está en el catálogo: ' + id);
  return path.resolve('public/models', m[1]);
};
const animsOf = (file: string): string[] => {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12);
  return (JSON.parse(b.subarray(20, 20 + n).toString('utf8')).animations ?? []).map((a: { name: string }) => a.name);
};

describe('la tabla', () => {
  it('cada enemigo de la tabla es de las compuertas (o vuela) y tiene su modelo con sus animaciones', () => {
    for (const [k, d] of Object.entries(FOE_DEF)) {
      expect((d.fly ? FOE_FLY : FOE_GATE).some((o) => o[0] === k), k).toBe(true);
      const anims = animsOf(fileOf(d.ual ? 'foe-anims' : d.asset)); // (el diablillo y el puglin: las de la biblioteca)
      for (const [what, name] of Object.entries(d.clips)) if (name) expect(anims, `${k}: ${what} (${name})`).toContain(name);
      for (const need of ['idle', 'walk', 'attack'] as const) expect(d.clips[need], `${k}: ${need}`).toBeTruthy();
      expect(d.atk[0]).toBeLessThan(d.atk[1]);
    }
  });
  it('resistencia y fuerza: las de serie de RepArena, y las de la tabla del desarrollador si las hay', () => {
    expect(devFoe('g:zombie')).toEqual({ hp: 2, str: 1, tier: 0 });
    expect(devFoe('g:zchubby').hp).toBe(3);
    expect(devFoe('g:captain').hp).toBe(3);
    expect(devFoe('f:drone').hp).toBe(1);
    DEV.t.foes = { 'g:raptor': { hp: 5, str: 2 } };
    expect(devFoe('g:raptor')).toEqual({ hp: 5, str: 2, tier: 0 });
    DEV.t.foes = {};
  });
  it('los robots (geométricos) por ahora no salen: si solo están ellos, zombis verdes', () => {
    expect(gateFoes(['robot'])).toEqual(['zgreen']);
    expect(gateFoes(['robot', 'imp', 'thrower'])).toEqual(['imp', 'thrower']);
    expect(gateFoes(['robot', 'raptor', 'captain'])).toEqual(['raptor', 'captain']);
  });
  it('los voladores: los elegidos con modelo, sin el dragón (solo de jefe); si ninguno, abeja y murciélago', () => {
    expect(flyFoes(['drone', 'hornet'])).toEqual(['bee', 'bat']);
    expect(flyFoes(['drone', 'cthulhu', 'dragon'])).toEqual(['cthulhu']);
    expect(flyFoes(['dragon'])).toEqual(['bee', 'bat']);
    expect(gateFoes(['bee'])).toEqual(['zgreen']);
  });
  it('el reparto: bien mezclados, cada uno lo mismo', () => {
    const next = deal(['zombie', 'raptor', 'yeti']), n: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      const k = next();
      n[k] = (n[k] || 0) + 1;
    }
    expect(Object.values(n)).toEqual([100, 100, 100]);
  });
});

describe('los puestos de ataque', () => {
  const head = new Vector3(0, 1.6, 0);
  const mk = (x: number, z: number, r = 0.4, stop = 1.1): SlotFoe => ({ pos: new Vector3(x, 0, z), radius: r, stop, slot: new Vector3(), slotOk: false, row: 0 });
  it('en un arco delante de ti, a su distancia, sin pisarse; los que no caben, en la fila de atrás', () => {
    const all: SlotFoe[] = [];
    for (let i = 0; i < 9; i++) {
      const f = mk((i - 4) * 1.5, -11);
      foeSlot(f, all, head, () => 0.5);
      all.push(f);
    }
    for (const f of all) {
      expect(f.slot.z).toBeLessThan(head.z - FRONT_MIN); // (nunca a tu altura ni detrás)
      if (f.row < 3) expect(Math.hypot(f.slot.x - head.x, f.slot.z - head.z)).toBeCloseTo(f.stop + f.row * 1.1, 5);
      // (en las tres filas, sin pisarse; si no queda hueco, RepArena lo pone en una cuarta, donde le pilla)
      if (f.row < 3) for (const o of all) if (o !== f && o.row < 3) expect(o.slot.distanceTo(f.slot)).toBeGreaterThanOrEqual(f.radius + o.radius + 0.65 - 1e-6);
    }
    expect(all.filter((f) => f.row === 0).length).toBeGreaterThanOrEqual(2); // (a 1,1 m caben dos)
    expect(all.some((f) => f.row > 0)).toBe(true);
  });
  it('cada uno, el puesto que le pilla de camino', () => {
    const l = mk(-6, -10), r = mk(6, -10);
    foeSlot(l, [], head, () => 0);
    foeSlot(r, [], head, () => 0);
    expect(l.slot.x).toBeLessThan(0);
    expect(r.slot.x).toBeGreaterThan(0);
  });
});

import { hatchFoes } from '../../src/combat/hatch-foes.js';
describe('la batalla diminuta', () => {
  it('los de las trampillas: los elegidos con modelo; las arañas (geométricas), no: si solo ellas, cangrejo y seta', () => {
    expect(hatchFoes(['spider'])).toEqual(['crab', 'mushroom']);
    expect(hatchFoes(['spider', 'skull'])).toEqual(['skull']);
  });
});
