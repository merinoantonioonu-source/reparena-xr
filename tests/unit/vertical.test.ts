// La sentadilla (src/exercise/vertical.ts): carga al bajar, niveles ×2-×4 aguantando, PERFECTA, «baja más» y la
// referencia que se ajusta. Las alturas se simulan a 72 imágenes por segundo, como en las gafas.
import { describe, expect, it } from 'vitest';
import { powLevel, squatConfig, VertDetector, type VertEvent } from '../../src/exercise/vertical.js';

const FPS = 72, DT = 1 / FPS;

/** Mueve la cabeza por tramos [altura final, segundos] y devuelve todo lo que pasó (con el segundo en que pasó). */
function play(segments: [number, number][], cfg = squatConfig(), start = 1.6) {
  const d = new VertDetector();
  d.reset(start);
  const events: (VertEvent & { t: number })[] = [];
  const out: VertEvent[] = [];
  let y = start, t = 0, prev = start;
  for (const [to, secs] of segments) {
    const n = Math.max(1, Math.round(secs * FPS)), from = y;
    for (let i = 1; i <= n; i++) {
      // (curva suave, como un cuerpo de verdad)
      const k = i / n, e = k * k * (3 - 2 * k);
      y = from + (to - from) * e;
      t += DT;
      const speed = Math.abs(y - prev) / DT;
      prev = y;
      out.length = 0;
      d.update(y, t, DT, speed, cfg, out);
      for (const ev of out) events.push({ ...ev, t: +t.toFixed(2) });
    }
  }
  return { d, events, types: events.map((e) => e.type) };
}

describe('powLevel', () => {
  it('da ×2 a los 1,5 s, ×3 a los 3,5 s y ×4 a los 6 s', () => {
    expect(powLevel(1.4)).toBe(1);
    expect(powLevel(1.5)).toBe(2);
    expect(powLevel(3.4)).toBe(2);
    expect(powLevel(3.5)).toBe(3);
    expect(powLevel(5.9)).toBe(3);
    expect(powLevel(6)).toBe(4);
    expect(powLevel(60)).toBe(4);
  });
  it('sigue los ajustes de aguante', () => {
    expect(powLevel(1, 1, 0)).toBe(2);
    expect(powLevel(3, 1, 0)).toBe(4);
  });
});

describe('VertDetector (sentadilla)', () => {
  it('una sentadilla normal: carga al bajar y cuenta al subir', () => {
    const { types, events } = play([[1.6, 0.5], [1.3, 0.7], [1.3, 0.3], [1.6, 0.7], [1.6, 0.5]]);
    expect(types).toEqual(['charge', 'rep']);
    const rep = events.find((e) => e.type === 'rep');
    expect(rep && rep.type === 'rep' && rep.pow).toBe(1);
  });

  it('PERFECTA si dura lo pedido y baja 3 cm de más', () => {
    const { events } = play([[1.6, 0.5], [1.28, 0.8], [1.28, 0.4], [1.6, 0.8], [1.6, 0.3]]);
    const rep = events.find((e) => e.type === 'rep');
    expect(rep && rep.type === 'rep' && rep.perfect).toBe(true);
  });

  it('no es PERFECTA si es demasiado rápida', () => {
    const { events } = play([[1.6, 0.3], [1.3, 0.25], [1.6, 0.3], [1.6, 0.5]]);
    const rep = events.find((e) => e.type === 'rep');
    expect(rep && rep.type === 'rep' && rep.perfect).toBe(false);
    expect(rep && rep.type === 'rep' && rep.fast).toBe(true);
  });

  it('aguantando abajo en la postura perfecta: ×2, ×3 y ×4', () => {
    const { events } = play([[1.6, 0.5], [1.28, 0.6], [1.28, 6.2], [1.6, 0.7], [1.6, 0.3]]);
    const levels = events.filter((e) => e.type === 'power').map((e) => (e.type === 'power' ? e.level : 0));
    expect(levels).toEqual([2, 3, 4]);
    const rep = events.find((e) => e.type === 'rep');
    expect(rep && rep.type === 'rep' && rep.pow).toBe(4);
  });

  it('sin bajar 1,5 cm más de lo pedido, el aguante no sube de nivel', () => {
    const { types } = play([[1.6, 0.5], [1.335, 0.6], [1.335, 4], [1.6, 0.7], [1.6, 0.3]]);
    expect(types).toEqual(['charge', 'rep']);
  });

  it('una bajada corta avisa de que bajes más', () => {
    const { types } = play([[1.6, 0.5], [1.45, 0.5], [1.6, 0.5], [1.6, 0.5]]);
    expect(types).toEqual(['partial']);
  });

  it('cuenta varias seguidas', () => {
    const segs: [number, number][] = [[1.6, 0.4]];
    for (let i = 0; i < 5; i++) segs.push([1.3, 0.6], [1.6, 0.6]);
    segs.push([1.6, 0.5]);
    expect(play(segs).types.filter((x) => x === 'rep').length).toBe(5);
  });

  it('la referencia se ajusta si estás más bajo de lo que se calibró', () => {
    // calibrado a 1,7 m, pero de pie a 1,6 m: tras unos segundos quieto, la sentadilla cuenta igual
    const { types } = play([[1.6, 0.3], [1.6, 8], [1.3, 0.7], [1.6, 0.7], [1.6, 0.5]], squatConfig(), 1.7);
    expect(types).toEqual(['charge', 'rep']);
  });

  it('la recarga profunda da el ×4 al instante (si está activada)', () => {
    const { events } = play([[1.6, 0.5], [1.15, 0.8], [1.6, 0.8], [1.6, 0.3]], squatConfig(26, 1.2, 1.5, 0.5, 15));
    const p = events.find((e) => e.type === 'power');
    expect(p && p.type === 'power' && p.level).toBe(4);
    expect(p && p.type === 'power' && p.deep).toBe(true);
  });
});
