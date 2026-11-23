// Las luciérnagas (pedido del usuario: al menos 2,5 veces más, en la periferia, sin tapar las compuertas, los enemigos ni tu
// entorno inmediato; su movimiento, al compás de la música).
import { describe, expect, it } from 'vitest';
import { moteAllowed, moteLayout, MOTE_NEAR } from '../../src/env/env-system';

describe('las luciérnagas', () => {
  const { base } = moteLayout(), n = base.length / 3;
  it('son al menos 2,5 veces las 180 de antes', () => {
    expect(n).toBeGreaterThanOrEqual(450);
  });
  it('ninguna en tu entorno inmediato ni en el pasillo de juego (delante, hasta las compuertas)', () => {
    for (let i = 0; i < n; i++) expect(moteAllowed(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]), `la ${i}`).toBe(true);
    // (el pasillo, a la altura de los enemigos: nada a ±35° del frente por debajo de 4,6 m hasta 12,5 m)
    expect(moteAllowed(0, 1.5, -8)).toBe(false);
    expect(moteAllowed(3, 1, -9)).toBe(false);
    expect(moteAllowed(0, 6, -8)).toBe(true);
    expect(moteAllowed(MOTE_NEAR - 0.5, 2, 0)).toBe(false);
  });
  it('la mayoría, en la periferia: lejos y alrededor (también detrás de ti y a los lados)', () => {
    let far = 0, back = 0;
    for (let i = 0; i < n; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      if (Math.hypot(x, z) > 6) far++;
      if (z > 0) back++;
    }
    expect(far / n).toBeGreaterThan(0.75);
    expect(back / n).toBeGreaterThan(0.3);
  });
});
