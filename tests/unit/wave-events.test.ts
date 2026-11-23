// Los sucesos de las oleadas (src/combat/wave-events.ts) y su cielo (src/env/sky-plan.ts: eventLook).
import { describe, expect, it } from 'vitest';
import { EVENT_P, pickWaveEvent, WAVE_EVENTS } from '../../src/combat/wave-events.js';
import { eventLook, skyLook } from '../../src/env/sky-plan.js';

const seq = (vals: number[]): (() => number) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('los sucesos de las oleadas', () => {
  it('nunca en la primera, en la del jefe ni tras otro', () => {
    const r = seq([0, 0.5]);
    expect(pickWaveEvent(0, '', false, WAVE_EVENTS, r)).toBe('');
    expect(pickWaveEvent(3, '', true, WAVE_EVENTS, r)).toBe('');
    expect(pickWaveEvent(3, 'fog', false, WAVE_EVENTS, r)).toBe('');
  });

  it('a veces (con su probabilidad), y solo de los que valen', () => {
    expect(pickWaveEvent(3, '', false, ['eclipse', 'fog'], seq([EVENT_P + 0.01]))).toBe('');
    for (const v of [0, 0.3, 0.6, 0.99]) expect(['eclipse', 'fog']).toContain(pickWaveEvent(3, '', false, ['eclipse', 'fog'], seq([0, v])));
    expect(pickWaveEvent(3, '', false, [], seq([0]))).toBe('');
  });

  it('el eclipse oscurece y la niebla espesa', () => {
    const d = skyLook('dia', 'claro'), e = eventLook(skyLook('dia', 'claro'), 'eclipse'), f = eventLook(skyLook('dia', 'claro'), 'fog');
    expect(e.sunI).toBeLessThan(d.sunI * 0.3);
    expect(e.stars).toBe(1);
    expect(f.fogK).toBeGreaterThan(d.fogK * 3);
  });
});
