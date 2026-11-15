// La Travesía de plataformas: lo que hace el cuerpo (moves.ts). El salto se nota igual aunque los fotogramas lleguen a
// saltos (al cargar, en un ordenador lento): lo reciente se mide al principio de cada fotograma.
import { describe, expect, it } from 'vitest';
import { BodyMoves, moveCfg } from '../../src/modes/trek/plat/moves.js';

const cfg = moveCfg(() => 0); // (los de serie: salto de 6 cm)
const at = (y: number) => ({ x: 0, y, z: 0 });

function run(frames: [dt: number, y: number][]): boolean {
  const m = new BodyMoves();
  m.reset(1.6, 0);
  let took = false;
  for (const [dt, y] of frames) {
    m.update(dt, at(y), cfg);
    if (m.takeoff) took = true;
  }
  return took;
}

describe('la Travesía de plataformas: el salto', () => {
  it('a 72 imágenes por segundo, un salto de 10 cm cuenta', () => {
    const f: [number, number][] = [[1 / 72, 1.6]];
    for (let i = 1; i <= 10; i++) f.push([1 / 72, 1.6 + 0.1 * Math.sin((Math.PI / 2) * (i / 10))]);
    expect(run(f)).toBe(true);
  });

  it('con fotogramas a saltos (0,39 · 0,013 · 0,85 s) el salto también cuenta', () => {
    expect(run([[0.39, 1.6], [0.013, 1.654], [0.85, 1.7]])).toBe(true);
  });

  it('ponerse de puntillas despacio no cuenta, ni a 72 imágenes por segundo ni a saltos', () => {
    const f: [number, number][] = [];
    for (let i = 0; i <= 144; i++) f.push([1 / 72, 1.6 + 0.1 * (i / 144)]);
    expect(run(f)).toBe(false);
    expect(run([[0.5, 1.6], [0.5, 1.625], [0.5, 1.65], [0.5, 1.675], [0.5, 1.7]])).toBe(false);
  });

  it('levantarse deprisa de una sentadilla y ponerse luego de puntillas no cuenta', () => {
    const f: [number, number][] = [];
    for (let i = 0; i <= 30; i++) f.push([1 / 72, 1.2 + 0.4 * (i / 30)]);
    for (let i = 1; i <= 36; i++) f.push([1 / 72, 1.6 + 0.1 * (i / 36)]);
    expect(run(f)).toBe(false);
  });
});

describe('la Travesía de plataformas: en el suelo', () => {
  const m = new BodyMoves();
  const go = (frames: [number, number][]): void => {
    for (const [dt, y] of frames) m.update(dt, at(y), cfg);
  };
  const ramp = (a: number, b: number, sec: number): [number, number][] => {
    const n = Math.round(sec * 72), out: [number, number][] = [];
    for (let i = 1; i <= n; i++) out.push([1 / 72, a + (b - a) * (i / n)]);
    return out;
  };

  it('en plancha (cabeza por debajo de 70 cm) cuenta las flexiones; al echarte al suelo, no', () => {
    m.reset(1.6, 0);
    go(ramp(1.6, 0.5, 0.8)); // (al suelo)
    expect(m.plank).toBe(true);
    expect(m.standing).toBe(false);
    go(ramp(0.5, 0.5, 0.6)); // (asentarse)
    expect(m.pushups).toBe(0);
    for (let i = 1; i <= 3; i++) {
      go(ramp(0.5, 0.35, 0.5));
      go(ramp(0.35, 0.5, 0.5));
      expect(m.pushups).toBe(i);
    }
    // bajar poco (5 cm) no es una flexión
    go(ramp(0.5, 0.45, 0.5));
    go(ramp(0.45, 0.5, 0.5));
    expect(m.pushups).toBe(3);
    go(ramp(0.5, 1.6, 1));
    expect(m.plank).toBe(false);
    expect(m.standing).toBe(true);
  });

  it('agacharse hondo de pie (sentadilla a 1,1 m) no es estar en el suelo ni cuenta flexiones', () => {
    m.reset(1.6, 0);
    const p0 = m.pushups; // (la cuenta solo sube: se mira lo que cambia)
    for (let k = 0; k < 4; k++) {
      go(ramp(1.6, 1.1, 0.6));
      expect(m.plank).toBe(false);
      go(ramp(1.1, 1.6, 0.6));
    }
    expect(m.pushups).toBe(p0);
  });
});
