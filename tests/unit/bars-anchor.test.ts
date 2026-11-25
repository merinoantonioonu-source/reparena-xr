// Las barras se recuerdan en la habitación (pedido del usuario: tenía que recolocarlas en cada partida): cada aparato se
// guarda respecto al ancla persistente del mundo de IWSDK y, en otra sesión con el origen de las gafas en otro sitio, vuelve
// al mismo punto de la habitación.
import { describe, expect, it } from 'vitest';
import { EQUIP_ANCHOR_KEY, equipAnchorFrame, equipChanged, loadEquip, type FloorPose } from '../../src/modes/bars/equip.js';

const mkStore = () => {
  const mem: Record<string, unknown> = {};
  return { mem, store: (k: string, v?: unknown) => (v === undefined ? JSON.parse(JSON.stringify(mem[k] ?? null)) : (mem[k] = v)) };
};
/** Un punto de la habitación visto desde un origen de las gafas (o: dónde está ese origen en la habitación). */
const seen = (o: FloorPose, p: FloorPose): FloorPose => {
  const dx = p.x - o.x, dz = p.z - o.z, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c, yaw: p.yaw - o.yaw };
};

describe('las barras, en su sitio de la habitación', () => {
  it('colocadas en una sesión, en la siguiente vuelven al mismo sitio aunque el origen de las gafas sea otro', () => {
    const { mem, store } = mkStore();
    // en la habitación: el ancla, en (0, 0); las paralelas, en (1, -2) giradas 0,5 rad
    const anchor: FloorPose = { x: 0, z: 0, yaw: 0 }, bars: FloorPose = { x: 1, z: -2, yaw: 0.5 };
    // sesión 1: el origen de las gafas, en (0,3; 0,2) girado 0,2
    const o1: FloorPose = { x: 0.3, z: 0.2, yaw: 0.2 };
    const EQ1 = loadEquip(store);
    equipAnchorFrame(EQ1, seen(o1, anchor), store);
    Object.assign(EQ1.xr.dip, seen(o1, bars));
    equipChanged(EQ1, false, 'dip', store);
    expect(mem[EQUIP_ANCHOR_KEY]).toBeTruthy();
    // sesión 2: otro origen (2 m más allá y girado 1,3 rad)
    const o2: FloorPose = { x: -1.7, z: 1.1, yaw: -1.3 };
    const EQ2 = loadEquip(store);
    for (let i = 0; i < 5; i++) equipAnchorFrame(EQ2, seen(o2, anchor), store);
    const want = seen(o2, bars), got = EQ2.xr.dip;
    expect(got.x).toBeCloseTo(want.x, 5);
    expect(got.z).toBeCloseTo(want.z, 5);
    expect(Math.cos(got.yaw - want.yaw)).toBeCloseTo(1, 5);
  });

  it('sin el ancla todavía (o fuera de las gafas), no se mueven', () => {
    const { store } = mkStore();
    const EQ = loadEquip(store);
    Object.assign(EQ.xr.dip, { x: 0.4, z: -1, yaw: 0, set: true });
    equipAnchorFrame(EQ, null, store);
    expect(EQ.xr.dip.x).toBe(0.4);
    expect(EQ.xr.dip.a ?? null).toBeNull();
  });

  it('las colocadas antes del ancla se apuntan respecto a ella en cuanto llega', () => {
    const { mem, store } = mkStore();
    const EQ = loadEquip(store);
    Object.assign(EQ.xr.door, { x: 0.4, z: -1, yaw: 0.1, set: true });
    equipAnchorFrame(EQ, { x: 1, z: 1, yaw: 0.3 }, store);
    expect(EQ.xr.door.a).toBeTruthy();
    expect((mem[EQUIP_ANCHOR_KEY] as Record<string, unknown>).door).toBeTruthy();
    expect(EQ.xr.door.x).toBeCloseTo(0.4, 5);
  });
});
