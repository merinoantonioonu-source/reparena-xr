// El asistente del vuelo (src/modes/trek/plat/fly-coach.ts): cada respuesta cambia el ajuste de ese movimiento, con sus topes.
import { describe, expect, it } from 'vitest';
import { COACH_ROUNDS, COACH_TRY_MAX, coachSteps, FlyCoach, type CoachEv } from '../../src/modes/trek/plat/fly-coach';

const DT = 1 / 72;
const run = (C: FlyCoach, secs: number, read: Partial<{ side: number; down: number; back: number; roll: number }> = {}, val: Record<string, number> = {}): CoachEv[] => {
  const out: CoachEv[] = [];
  for (let i = 0; i < secs / DT; i++) {
    const e = C.update(DT, read.side ?? 0, read.down ?? 0, read.back ?? 0, read.roll ?? 0, 0.065, (k) => val[k] ?? 0);
    if (e) out.push(e);
  }
  return out;
};

describe('el asistente del vuelo', () => {
  it('cuatro pasos (de lado, subir y bajar, frenar y de canto); con el aleteo, se ajusta la fuerza del aletazo', () => {
    expect(coachSteps('mid').map((s) => s.key)).toEqual(['side', 'alt', 'pike', 'roll']);
    expect(coachSteps('mid')[1].tune?.key).toBe('flyDown');
    expect(coachSteps('flap')[1].tune).toMatchObject({ key: 'flyFlap', calmer: -1 });
  });
  it('Poco lo hace más sensible (menos recorrido; con el aletazo, más fuerza), con sus topes', () => {
    const C = new FlyCoach();
    C.begin('mid');
    run(C, COACH_TRY_MAX + 0.1);
    C.answerWith('little');
    expect(run(C, 0.05, {}, { flySide: 15 })).toContainEqual(expect.objectContaining({ t: 'set', key: 'flySide', val: 12, calmer: false, edge: false }));
    run(C, COACH_TRY_MAX + 0.1);
    C.answerWith('little');
    expect(run(C, 0.05, {}, { flySide: 8 })).toContainEqual(expect.objectContaining({ t: 'set', val: 8, edge: true }));
    const F = new FlyCoach();
    F.begin('flap');
    F.i = 1;
    run(F, COACH_TRY_MAX + 0.1);
    F.answerWith('little');
    expect(run(F, 0.05, {}, { flyFlap: 100 })).toContainEqual(expect.objectContaining({ key: 'flyFlap', val: 120 }));
  });
  it('pregunta en cuanto lo has probado (y pasados unos segundos), no antes', () => {
    const C = new FlyCoach();
    C.begin('mid');
    expect(run(C, 2, { side: 0.06 }).some((e) => e?.t === 'ask')).toBe(false);
    run(C, 0.5, { side: -0.06 });
    expect(run(C, 3).some((e) => e?.t === 'ask')).toBe(true);
  });
  it('tras unas cuantas respuestas que no son Bien, pasa al siguiente; el giro se marca al hacerlo', () => {
    const C = new FlyCoach();
    C.begin('mid');
    for (let n = 0; n < COACH_ROUNDS; n++) {
      run(C, COACH_TRY_MAX + 0.1);
      C.answerWith('much');
      run(C, 0.05, {}, { flySide: 15 });
    }
    run(C, 2);
    expect(C.i).toBe(1);
    C.i = 3;
    C.phase = 'try';
    C.t = 0;
    const e = run(C, 1, { roll: 1.2 });
    expect(e).toContainEqual({ t: 'done', text: '✓ Giro' });
    expect(run(C, 2)).toContainEqual({ t: 'end' });
    expect(C.active).toBe(false);
  });
});
