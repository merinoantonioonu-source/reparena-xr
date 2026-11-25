// La línea de las manos (propuesta del usuario): la cabeza por delante de la línea que une las manos acelera y por detrás
// frena. Se lee lo que te echas adelante o atrás respecto a como sueles estar (la referencia te sigue despacio).
import { describe, expect, it } from 'vitest';
import { HandLine, HL } from '../../src/modes/trek/plat/fly.js';

const hand = (x: number, z: number, y = 0.12, ok = true) => ({ ok, x, y, z });
const L0 = hand(-0.25, -0.3), R0 = hand(0.25, -0.3);

/** `s` segundos con la cabeza en (x, z), mirando a −z; devuelve los impulsos dados. */
function run(L: HandLine, s: number, x: number, z: number, l = L0, r = R0): number {
  let kicks = 0;
  for (let t = 0; t < s; t += 1 / 72) {
    L.step(1 / 72, x, z, l, r, 0, -1, -z);
    if (L.kick) kicks++;
  }
  return kicks;
}

describe('la línea de las manos', () => {
  it('donde te pones es el punto de partida; echarte adelante o atrás se lee enseguida', () => {
    const L = new HandLine();
    run(L, 1, 0, -0.2);
    expect(Math.abs(L.lean)).toBeLessThan(0.005);
    expect(L.hands).toBe(true);
    run(L, 0.6, 0, -0.32);
    expect(L.lean).toBeGreaterThan(0.09);
    expect(L.push).toBeGreaterThan(0.4);
    run(L, 0.3, 0, -0.2);
    run(L, 0.6, 0, -0.08);
    expect(L.lean).toBeLessThan(-0.08);
    expect(L.push).toBe(0);
  });
  it('recolocarte se olvida solo: a los pocos segundos vuelve a ser el punto de partida (antes leía «atrás» para siempre)', () => {
    const L = new HandLine();
    run(L, 1, 0, -0.2);
    run(L, 30, 0, 0); // (20 cm más atrás, y ahí te quedas)
    expect(Math.abs(L.lean)).toBeLessThan(0.02);
    run(L, 0.6, 0, -0.1);
    expect(L.lean).toBeGreaterThan(0.07); // (y desde ahí, adelante sigue siendo adelante)
  });
  it('un impulso brusco adelante es un impulso (uno por gesto); despacio o con el vaivén de la flexión, ninguno', () => {
    const L = new HandLine();
    run(L, 1, 0, -0.2);
    // brusco: 10 cm en dos décimas
    let kicks = 0;
    for (let t = 0; t < 0.2; t += 1 / 72) kicks += run(L, 1 / 72, 0, -0.2 - (0.1 * t) / 0.2);
    kicks += run(L, 1, 0, -0.3);
    expect(kicks).toBe(1);
    // vuelves y das otro
    run(L, 0.6, 0, -0.2);
    kicks = 0;
    for (let t = 0; t < 0.2; t += 1 / 72) kicks += run(L, 1 / 72, 0, -0.2 - (0.1 * t) / 0.2);
    kicks += run(L, 0.5, 0, -0.3);
    expect(kicks).toBe(1);
    // despacio (10 cm en 3 s) o el vaivén de una flexión (±2 cm): ninguno
    const S = new HandLine();
    run(S, 1, 0, -0.2);
    kicks = 0;
    for (let t = 0; t < 3; t += 1 / 72) kicks += run(S, 1 / 72, 0, -0.2 - (0.1 * t) / 3);
    for (let t = 0; t < 4; t += 1 / 72) kicks += run(S, 1 / 72, 0, -0.3 + 0.02 * Math.sin(t * 2 * Math.PI));
    expect(kicks).toBe(0);
  });
  it('sin ver las manos sigue leyendo (respecto al centro del vuelo), y al verlas o perderlas no da saltos', () => {
    const L = new HandLine();
    const off = hand(-0.25, -0.3, 0.12, false);
    run(L, 1, 0, -0.2, off, R0);
    expect(L.hands).toBe(false);
    run(L, 0.6, 0, -0.3, off, R0);
    const lean = L.lean;
    expect(lean).toBeGreaterThan(0.07);
    run(L, 0.3, 0, -0.3); // (ahora se ven: otra medida, la misma lectura)
    expect(L.hands).toBe(true);
    expect(Math.abs(L.lean - lean)).toBeLessThan(0.02);
    expect(HL.adapt).toBeGreaterThan(4);
  });
  it('mide hasta la línea aunque las manos no estén de frente', () => {
    const L = new HandLine();
    // las manos giradas 30°: la cabeza, 10 cm por delante de su línea, en su normal
    const a = Math.PI / 6, l = hand(-0.25 * Math.cos(a), -0.3 - 0.25 * Math.sin(a)), r = hand(0.25 * Math.cos(a), -0.3 + 0.25 * Math.sin(a));
    const nx = Math.sin(a), nz = -Math.cos(a);
    run(L, 1, 0, -0.3, l, r);
    run(L, 0.5, 0.1 * nx, -0.3 + 0.1 * nz, l, r);
    expect(L.lean).toBeGreaterThan(0.08);
    expect(L.lean).toBeLessThan(0.1);
  });
});
