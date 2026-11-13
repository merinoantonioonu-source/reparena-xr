// Con la página a la vista, el juego descansa (src/page/idle.ts): da un paso cada medio segundo en vez de pensar y pintar
// a toda velocidad (en el navegador de las gafas, fuera del juego, la imagen de las Quest se congelaba a ratos).
import { describe, expect, it } from 'vitest';
import { IDLE_STEP, idleStep, type IdleState } from '../../src/page/idle.js';

describe('el juego descansa con la página a la vista', () => {
  it('en las gafas o probando en el ordenador, da un paso en cada fotograma', () => {
    const S: IdleState = { last: -9, run: false };
    let n = 0;
    for (let i = 0; i < 90; i++) if (idleStep(S, false, i / 90)) n++;
    expect(n).toBe(90);
  });
  it('con la página a la vista, un paso cada medio segundo (y el primero, enseguida)', () => {
    const S: IdleState = { last: -9, run: false };
    let n = 0;
    for (let i = 0; i < 90 * 3; i++) if (idleStep(S, true, i / 90)) n++;
    expect(n).toBe(Math.round(3 / IDLE_STEP));
    expect(S.run).toBe(false);
  });
  it('al volver a las gafas, sigue al momento', () => {
    const S: IdleState = { last: -9, run: false };
    idleStep(S, true, 10);
    expect(idleStep(S, true, 10.1)).toBe(false);
    expect(idleStep(S, false, 10.11)).toBe(true);
  });
});
