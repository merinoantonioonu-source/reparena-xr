// El registro de diagnóstico (src/core/diag.ts): guarda solo los últimos 30 s, en orden, y no repite capturas vacías.
import { beforeEach, describe, expect, it } from 'vitest';
import { DIAG, DIAG_KEEP, diagEvent, diagLine, diagReset, diagSave, diagText, type DiagCapture } from '../../src/core/diag.js';

describe('el registro de diagnóstico', () => {
  beforeEach(() => diagReset());

  it('guarda los últimos 30 s, del más viejo al más nuevo', () => {
    for (let i = 0; i < 600; i++) {
      DIAG.t = i * 0.1;
      diagLine(`muestra ${i}`);
      if (i % 50 === 0) diagEvent(`suceso ${i}`);
    }
    const txt = diagText('prueba', 'cabecera');
    const muestras = txt.split('# Muestras')[1].trim().split('\n');
    expect(muestras[0]).toMatch(/muestra 300$/); // (las de hace más de 30 s, fuera)
    expect(muestras).toHaveLength(300);
    expect(muestras.at(-1)).toMatch(/muestra 599$/);
    const sucesos = txt.split('# Sucesos')[1].split('# Muestras')[0].trim().split('\n');
    expect(sucesos).toEqual(['30.00 suceso 300', '35.00 suceso 350', '40.00 suceso 400', '45.00 suceso 450', '50.00 suceso 500', '55.00 suceso 550']);
  });

  it('cada captura se guarda una vez y se conservan las últimas', () => {
    let saved: DiagCapture[] = [];
    const load = (): DiagCapture[] => saved, save = (v: DiagCapture[]): void => void (saved = v);
    for (let k = 0; k < DIAG_KEEP + 2; k++) {
      diagEvent(`algo ${k}`);
      diagSave(`motivo ${k}`, 'cabecera', k, load, save);
    }
    expect(saved).toHaveLength(DIAG_KEEP);
    expect(saved.at(-1)?.reason).toBe(`motivo ${DIAG_KEEP + 1}`);
    diagSave('otra vez', 'cabecera', 99, load, save); // (sin nada nuevo: no se guarda)
    expect(saved.at(-1)?.reason).toBe(`motivo ${DIAG_KEEP + 1}`);
  });
});
