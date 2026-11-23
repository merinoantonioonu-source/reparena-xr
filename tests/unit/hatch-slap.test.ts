// El manotazo en la plancha con un brazo (pedido del usuario): solo aparta al bicho si la mano llega de verdad a él y como
// un golpe (deprisa y hacia él, o de arriba abajo); apoyarla o pasar rozando, no. Y le quita el ataque.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HatchFoe, SLAP_CD, SLAP_V } from '../../src/combat/hatch.js';

const HL = new Vector3(0, 0.45, 0);
function foe(): HatchFoe {
  const f = new HatchFoe(1, false, { x: 0.95, z: -1.8 }, true, 4, 3, () => 0.5);
  f.mode = 'run';
  f.pos.set(0.35, 0, -0.3);
  return f;
}
// el centro del bicho (a su radio del suelo)
const C = (f: HatchFoe) => new Vector3(f.pos.x, f.radius, f.pos.z);

describe('el manotazo', () => {
  it('a golpe y tocándolo: sale despedido y deja de atacar', () => {
    const f = foe();
    f.mode = 'rear';
    const palm = C(f).add(new Vector3(-0.05, 0.02, 0)), vel = new Vector3(1.6, -0.3, 0);
    expect(f.slap(palm, vel, HL, 10)).toBe(true);
    expect(f.mode).toBe('run');
    expect(f.pushV.x).toBeGreaterThan(0); // (hacia donde iba la mano, lejos de ti)
  });
  it('de arriba abajo, encima: también', () => {
    const f = foe();
    expect(f.slap(C(f).add(new Vector3(0, 0.06, 0)), new Vector3(0, -1.5, 0), HL, 10)).toBe(true);
  });
  it('apoyar la mano encima (despacio) no vale; lejos, aunque sea deprisa, tampoco', () => {
    const f = foe();
    expect(f.slap(C(f), new Vector3(0.2, -0.2, 0), HL, 10)).toBe(false);
    expect(f.slap(C(f).add(new Vector3(0, 0, 0.4)), new Vector3(0, 0, -2), HL, 10)).toBe(false);
  });
  it('pasar rozando hacia fuera (alejándose de él) no vale', () => {
    const f = foe();
    expect(f.slap(C(f).add(new Vector3(0.04, 0, 0)), new Vector3(SLAP_V * 1.5, 0, 0), HL, 10)).toBe(false);
  });
  it('uno cada poco: el segundo enseguida no cuenta; pasado el respiro, sí', () => {
    const f = foe(), palm = C(f).add(new Vector3(-0.05, 0, 0)), vel = new Vector3(1.6, 0, 0);
    expect(f.slap(palm, vel, HL, 10)).toBe(true);
    expect(f.slap(C(f).add(new Vector3(-0.05, 0, 0)), vel, HL, 10 + SLAP_CD / 2)).toBe(false);
    expect(f.slap(C(f).add(new Vector3(-0.05, 0, 0)), vel, HL, 10 + SLAP_CD + 0.01)).toBe(true);
  });
});
