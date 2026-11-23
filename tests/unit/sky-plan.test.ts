// La hora y el tiempo de cada oleada (src/env/sky-plan.ts): de día la primera, luego por turnos; el tiempo, sobre todo
// despejado; tormenta en la del jefe; nieve solo donde puede nevar; y los colores van cambiando suave, sin saltos.
import { describe, expect, it } from 'vitest';
import { lerpLook, mixHex, PHASES, skyLook, wavePlan } from '../../src/env/sky-plan.js';

describe('la hora y el tiempo de las oleadas', () => {
  it('la primera, de día y despejada; luego la tarde, el ocaso, la noche y el alba, por turnos', () => {
    expect(wavePlan(1, 'nature', false)).toEqual({ phase: 'dia', weather: 'claro' });
    for (let w = 1; w <= 12; w++) expect(wavePlan(w, 'cliff', false).phase).toBe(PHASES[(w - 1) % 5]);
  });
  it('la del jefe, con tormenta; siempre igual para la misma oleada y el mismo entorno', () => {
    expect(wavePlan(5, 'sky', true).weather).toBe('tormenta');
    for (let w = 2; w < 30; w++) expect(wavePlan(w, 'village', false)).toEqual(wavePlan(w, 'village', false));
  });
  it('casi siempre despejado; a veces niebla o lluvia; nieve solo en el risco y la aldea', () => {
    const n: Record<string, number> = {};
    for (let w = 2; w < 400; w++) for (const k of ['nature', 'island', 'sky']) {
      const x = wavePlan(w, k, false).weather;
      n[x] = (n[x] ?? 0) + 1;
      expect(x).not.toBe('nieve');
    }
    expect(n.claro).toBeGreaterThan(n.lluvia + n.niebla);
    expect(n.lluvia).toBeGreaterThan(0);
    expect(n.niebla).toBeGreaterThan(0);
    let snow = 0;
    for (let w = 2; w < 400; w++) if (wavePlan(w, 'cliff', false).weather === 'nieve') snow++;
    expect(snow).toBeGreaterThan(0);
  });
  it('cómo se ve: de noche, estrellas; con lluvia, nublado y sin estrellas; la tormenta, oscura y con relámpagos', () => {
    expect(skyLook('noche', 'claro').stars).toBe(1);
    const r = skyLook('noche', 'lluvia');
    expect(r.stars).toBe(0);
    expect(r.cloud).toBe(1);
    expect(r.rain).toBeGreaterThan(0);
    const t = skyLook('dia', 'tormenta');
    expect(t.storm).toBe(1);
    expect(t.sunI).toBeLessThan(skyLook('dia', 'claro').sunI);
    expect(skyLook('dia', 'nieve').snow).toBe(1);
  });
  it('el cambio es suave: cada paso acerca un poco, sin pasarse', () => {
    const cur = skyLook('dia', 'claro'), to = skyLook('noche', 'tormenta');
    for (let i = 0; i < 200; i++) lerpLook(cur, to, 0.05);
    expect(cur.rain).toBeCloseTo(to.rain, 3);
    expect(Math.abs((cur.top & 255) - (to.top & 255))).toBeLessThanOrEqual(2);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
});
