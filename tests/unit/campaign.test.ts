// Jugar un nivel de la campaña (src/core/campaign.ts): los ajustes del nivel van por encima de los tuyos y, al acabar, se
// devuelven tal cual; lo que se guarda en el navegador son los tuyos.
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMP, campBegin, campEnd, campLeave } from '../../src/core/campaign.js';
import { campLv } from '../../src/core/career.js';
import { initSettings, OVERLAY, rankVals, saveSettings, STORE_KEY } from '../../src/core/settings.js';
import { settings } from '../../src/core/values.js';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  initSettings();
  campLeave();
});

describe('la campaña', () => {
  it('pone el rango y las oleadas del nivel y los devuelve al acabar', () => {
    const before = { rank: settings.rank, waves: settings.waves, toFail: settings.toFail, lives: settings.lives };
    campBegin(13); // (región 3, rango cabo… el tercer nivel: 4 oleadas)
    const L = campLv(13), v = rankVals(L.rank);
    expect(settings.rank).toBe(L.rank);
    expect(settings.waves).toBe(L.waves);
    expect(settings.toFail).toBe(0);
    expect(settings.lives).toBe(v.lives);
    expect(CAMP.run).toEqual({ id: `${settings.mode}:${settings.exercise}`, lv: 13 });
    campEnd();
    expect({ rank: settings.rank, waves: settings.waves, toFail: settings.toFail, lives: settings.lives }).toEqual(before);
    expect(OVERLAY.orig).toBeNull();
    expect(CAMP.run).toBeNull();
  });

  it('no guarda los ajustes del nivel: se guardan los tuyos', () => {
    settings.rank = 'recluta';
    campBegin(31); // (la región 7, el general)
    expect(settings.rank).toBe('general');
    saveSettings();
    expect(JSON.parse(mem.get(STORE_KEY) as string).rank).toBe('recluta');
    campEnd();
  });

  it('empezar otro nivel devuelve antes lo del anterior; el entorno sigue hasta volver al menú', () => {
    const rank = settings.rank;
    campBegin(2);
    campBegin(21);
    expect(CAMP.env).toBe(campLv(21).env);
    campEnd();
    expect(settings.rank).toBe(rank);
    expect(CAMP.env).toBe(campLv(21).env);
    campLeave();
    expect(CAMP.env).toBeNull();
  });
});
