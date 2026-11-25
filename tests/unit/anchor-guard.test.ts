/**
 * El vigilante del ancla de la habitación (Barras, en pruebas): si la sesión de VR muere a medias de un paso, la próxima
 * vez el ancla se apaga sola; si lo aguanta, no.
 */
import { describe, expect, it } from 'vitest';
import { anchorMayAsk, anchorOffText, anchorRisk, anchorSafe, type TryStore } from '../../src/modes/bars/anchor-guard.js';

const mk = (v: string | null = null): TryStore & { v: string | null } => {
  const S = { v, get: () => S.v, set: (x: string) => void (S.v = x) };
  return S;
};

describe('el vigilante del ancla de la habitación', () => {
  it('la primera vez deja pedirla', () => {
    expect(anchorMayAsk(mk())).toEqual({ ok: true, stage: '' });
  });

  it('una sesión que aguanta cada paso deja pedirla otra vez', () => {
    const S = mk();
    anchorRisk(S, 'entrar');
    anchorSafe(S);
    anchorRisk(S, 'crear');
    anchorSafe(S);
    expect(anchorMayAsk(S).ok).toBe(true);
  });

  it('si la sesión murió al entrar, no deja pedirla y dice en qué paso', () => {
    const S = mk();
    anchorRisk(S, 'entrar');
    expect(anchorMayAsk(S)).toEqual({ ok: false, stage: 'entrar' });
    expect(anchorOffText('entrar')).toContain('al entrar');
  });

  it('si murió al crear el ancla, lo dice', () => {
    const S = mk();
    anchorRisk(S, 'entrar');
    anchorSafe(S);
    anchorRisk(S, 'crear');
    expect(anchorMayAsk(S)).toEqual({ ok: false, stage: 'crear' });
    expect(anchorOffText('crear')).toContain('al crear');
  });

  it('apagada sola una vez, el usuario puede volver a probarla', () => {
    const S = mk();
    anchorRisk(S, 'crear');
    expect(anchorMayAsk(S).ok).toBe(false);
    // (el ajuste se apagó; si el usuario lo enciende otra vez, se intenta de nuevo)
    expect(anchorMayAsk(S).ok).toBe(true);
  });
});
