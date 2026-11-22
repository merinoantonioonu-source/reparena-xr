// Las cortinillas de cada ejercicio (src/ui/cortinilla.ts): hay una imagen para cada ejercicio de cada modo, y la franja de
// abajo dice lo que tienes puesto (oleadas o tramos, «Al fallo», sin fin y las vidas).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODE_EX } from '../../src/core/catalog.js';
import { cortInfo, cortUrl } from '../../src/ui/cortinilla.js';

describe('las cortinillas', () => {
  it('cada ejercicio de cada modo tiene la suya en public/cortinillas', () => {
    let n = 0;
    for (const [mode, exs] of Object.entries(MODE_EX))
      for (const ex of exs) {
        const url = cortUrl(mode, ex, 'public/');
        expect(url, `${mode} · ${ex}`).not.toBeNull();
        expect(existsSync(url!), url!).toBe(true);
        n++;
      }
    expect(n).toBe(33);
    expect(cortUrl('arcs', 'curl')).toBeNull(); // (un ejercicio que no está en ese modo)
  });
  it('la franja: oleadas y vidas de verdad; en la Travesía, solo los tramos', () => {
    expect(cortInfo('combat', 5, 3, false)).toBe('OLEADAS: 5      VIDAS: 3');
    expect(cortInfo('combat', 0, 0, false)).toBe('OLEADAS: SIN FIN      VIDAS: INFINITAS');
    expect(cortInfo('arcs', 0, 3, true)).toBe('AL FALLO      VIDAS: 3');
    expect(cortInfo('trek', 4, 3, false)).toBe('TRAMOS: 4');
  });
});
