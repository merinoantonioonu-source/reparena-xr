// Las barras se recuerdan en la habitación sin anclas (pedido del usuario: «tengo que recolocarlas cada vez que entro»): cada
// aparato se guarda respecto al suelo del guardián (`bounded-floor`), que es el mismo en todas las sesiones, y en la
// siguiente, con el origen de las gafas (local-floor) en otro sitio, vuelve al mismo punto de la habitación. Aquí, lo que
// hace la escena en cada fotograma (`BarsSystem.stepGuardian`): poner `EQ.b2l` y llamar a `equipFrame`.
import { describe, expect, it } from 'vitest';
import { equipChanged, equipFrame, equipSessionStart, loadEquip, type Equip, type FloorPose } from '../../src/modes/bars/equip.js';

const mkStore = () => {
  const mem: Record<string, unknown> = {};
  return { mem, store: (k: string, v?: unknown) => (v === undefined ? JSON.parse(JSON.stringify(mem[k] ?? null)) : (mem[k] = v)) };
};
/** Un punto de la habitación visto desde un origen de las gafas (o: dónde está ese origen en la habitación). */
const seen = (o: FloorPose, p: FloorPose): FloorPose => {
  const dx = p.x - o.x, dz = p.z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c, yaw: p.yaw - o.yaw };
};
/** Una sesión: el origen de las gafas en `o`; el guardián, en `guard` (null: las gafas no lo dan). */
const session = (store: (k: string, v?: unknown) => unknown, o: FloorPose, guard: FloorPose | null, frames = 5): Equip => {
  const EQ = loadEquip(store);
  equipSessionStart(EQ);
  for (let i = 0; i < frames; i++) {
    EQ.b2l = guard ? seen(o, guard) : null;
    equipFrame(EQ, {}, store);
  }
  return EQ;
};
const same = (got: FloorPose, want: FloorPose): void => {
  expect(got.x).toBeCloseTo(want.x, 5);
  expect(got.z).toBeCloseTo(want.z, 5);
  expect(Math.cos(got.yaw - want.yaw)).toBeCloseTo(1, 5);
};

describe('las barras, en su sitio de la habitación (el suelo del guardián)', () => {
  // en la habitación: el centro del guardián y las paralelas
  const guard: FloorPose = { x: 0.4, z: -0.3, yaw: 0.7 }, bars: FloorPose = { x: 1, z: -2, yaw: 0.5 };
  const o1: FloorPose = { x: 0.3, z: 0.2, yaw: 0.2 }, o2: FloorPose = { x: -1.7, z: 1.1, yaw: -1.3 };

  it('colocadas en una sesión, en la siguiente vuelven al mismo sitio aunque entres en otro punto y mirando a otro lado', () => {
    const { store } = mkStore();
    const EQ1 = session(store, o1, guard);
    Object.assign(EQ1.xr.dip, seen(o1, bars));
    equipChanged(EQ1, false, 'dip', store);
    const EQ2 = session(store, o2, guard);
    same(EQ2.xr.dip, seen(o2, bars));
    // (y en una tercera, igual: no se va acumulando error)
    same(session(store, o1, guard).xr.dip, seen(o1, bars));
  });

  it('las guardadas antes de esto (sin sitio en el guardián) se apuntan donde estén y, recolocadas una vez, ya se quedan', () => {
    const { store } = mkStore();
    // una sesión de las de antes: sin guardián
    const EQ0 = session(store, o1, null);
    Object.assign(EQ0.xr.door, seen(o1, bars));
    equipChanged(EQ0, false, 'door', store);
    expect(EQ0.xr.door.b).toBeNull();
    // la primera con guardián y otro origen: la barra sale donde la dejó el origen viejo (mal) y se apunta ahí
    const EQ1 = session(store, o2, guard);
    same(EQ1.xr.door, seen(o1, bars));
    expect(EQ1.xr.door.b).not.toBeNull();
    // se recoloca una vez…
    Object.assign(EQ1.xr.door, seen(o2, bars));
    equipChanged(EQ1, false, 'door', store);
    // …y desde entonces vuelve sola
    same(session(store, o1, guard).xr.door, seen(o1, bars));
  });

  it('recolocadas en una sesión sin guardián, lo guardado respecto a él ya no vale (no vuelven al sitio viejo)', () => {
    const { store } = mkStore();
    const EQ1 = session(store, o1, guard);
    Object.assign(EQ1.xr.dip, seen(o1, bars));
    equipChanged(EQ1, false, 'dip', store);
    // otra sesión, sin guardián (límite fijo): se llevan a otro sitio de la habitación
    const moved: FloorPose = { x: -2, z: 1, yaw: -0.4 };
    const EQ2 = session(store, o2, null);
    Object.assign(EQ2.xr.dip, seen(o2, moved));
    equipChanged(EQ2, false, 'dip', store);
    expect(EQ2.xr.dip.b).toBeNull();
    // la siguiente con guardián y el mismo origen: donde se dejaron, no donde estaban antes
    same(session(store, o2, guard).xr.dip, seen(o2, moved));
  });

  it('mientras se coloca uno, no se le mueve', () => {
    const { store } = mkStore();
    const EQ1 = session(store, o1, guard);
    Object.assign(EQ1.xr.dip, seen(o1, bars));
    equipChanged(EQ1, false, 'dip', store);
    const EQ2 = loadEquip(store);
    equipSessionStart(EQ2);
    EQ2.edit = 'dip';
    const was = { x: EQ2.xr.dip.x, z: EQ2.xr.dip.z, yaw: EQ2.xr.dip.yaw };
    EQ2.b2l = seen(o2, guard);
    equipFrame(EQ2, {}, store);
    same(EQ2.xr.dip, was);
  });
});
