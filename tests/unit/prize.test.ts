// Los premios que salen del cofre al abrirlo (src/ui/prize-path.ts): salen de dentro, suben en vertical, arriba se quedan un
// instante y se esfuman; uno tras otro.
import { describe, expect, it } from 'vitest';
import { prizeAt, PRIZE_GAP, PRIZE_LIFE, PRIZE_UP, type PrizePose } from '../../src/ui/prize-path.js';

const P = (): PrizePose => ({ y: 0, s: 0, a: 0, live: false, fading: false });

describe('los premios del cofre', () => {
  it('cada uno sale de dentro, sube sin bajar nunca hasta arriba y allí se esfuma', () => {
    const p = P();
    let last = -1, top = false, faded = false;
    for (let t = 0; t <= PRIZE_LIFE + 0.2; t += 1 / 72) {
      prizeAt(t, 0, p);
      if (!p.live) {
        expect(t).toBeGreaterThan(PRIZE_LIFE - 0.02);
        continue;
      }
      expect(p.y).toBeGreaterThanOrEqual(last - 1e-9);
      last = p.y;
      if (p.y >= PRIZE_UP - 1e-9) top = true;
      if (p.fading) {
        expect(top).toBe(true);
        faded = true;
      }
    }
    expect(top && faded).toBe(true);
    expect(prizeAt(0.01, 0, P()).s).toBeLessThan(0.2); // (al salir, pequeño: crece desde dentro)
    expect(prizeAt(PRIZE_LIFE - 0.01, 0, P()).a).toBeLessThan(0.1); // (al final, casi transparente)
  });

  it('salen uno tras otro: el segundo, PRIZE_GAP s después', () => {
    expect(prizeAt(PRIZE_GAP * 0.5, 1, P()).live).toBe(false);
    expect(prizeAt(PRIZE_GAP + 0.05, 1, P()).live).toBe(true);
    const a = prizeAt(1, 0, P()), b = prizeAt(1, 1, P());
    expect(a.y).toBeGreaterThan(b.y);
  });
});
