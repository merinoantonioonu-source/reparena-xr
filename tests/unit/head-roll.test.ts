// De canto (headRoll): la línea de las orejas, no hacia dónde mira la cara (la caja negra del vuelo del usuario: levantar la
// cabeza en plancha para ver lo que viene se leía como de canto y salía el giro sin hacerlo).
import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { headRoll } from '../../src/input/body-dir';

const q = (x: number, y: number, z: number): Quaternion => new Quaternion().setFromEuler(new Euler(x, y, z, 'YXZ'));
const deg = (d: number): number => (d * Math.PI) / 180;

describe('de canto', () => {
  it('boca abajo, mirando al suelo o levantando la cabeza (aunque algo girada), no es de canto', () => {
    expect(headRoll(q(deg(-90), 0, 0))).toBeLessThan(0.01);
    expect(headRoll(q(deg(-20), deg(25), 0))).toBeLessThan(0.01);
    expect(headRoll(q(deg(-35), deg(-30), 0))).toBeLessThan(0.01);
  });
  it('girando el cuerpo de canto (sobre lo largo del cuerpo, −Z), sí: 60° es de canto; de lado del todo, 90°', () => {
    const side = (d: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), deg(d)).multiply(q(deg(-80), 0, 0));
    expect(headRoll(side(60))).toBeGreaterThan(0.9);
    expect(headRoll(side(-90))).toBeCloseTo(Math.PI / 2, 1);
    expect(headRoll(side(10))).toBeLessThan(0.2);
  });
});
