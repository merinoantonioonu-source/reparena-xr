// Los ajustes (src/core/settings.ts): valores de serie, lo guardado por RepArena (mismas claves), sus migraciones, cada
// modo con cada ejercicio, los rangos con su tabla, lo que se ve y la dificultad creciente.
import { beforeEach, describe, expect, it } from 'vitest';
import { RANK_VALS } from '../../src/core/catalog.js';
import { DEV } from '../../src/core/dev-state.js';
import { FIELD, SCHEMA } from '../../src/core/schema.js';
import { COMBO_KEY, DEV_KEY, STORE_KEY, XR_STORE_KEY, clampSetting, dv, fieldVisible, fmtVal, initSettings, nLives, rankVals, setSetting, store } from '../../src/core/settings.js';
import { num, settings, str } from '../../src/core/values.js';

// el almacén del navegador, en memoria
class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}
const ls = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = ls;
const saved = (k: string) => JSON.parse(ls.getItem(k) as string);

beforeEach(() => {
  ls.clear();
});

describe('el esquema', () => {
  it('tiene los 186 ajustes de RepArena y los 2 nuevos (las manos y el tamaño del menú), sin claves repetidas', () => {
    expect(SCHEMA.length).toBe(188);
    expect(new Set(SCHEMA.map((f) => f.key)).size).toBe(188);
    expect(SCHEMA.filter((f) => f.key === 'handLook' || f.key === 'menuSize').length).toBe(2);
  });
  it('cada valor de serie está dentro de sus límites', () => {
    for (const f of SCHEMA) expect(clampSetting(f, f.def), f.key).toEqual(f.def);
  });
});

describe('valores de serie', () => {
  it('sin nada guardado, los de RepArena', () => {
    initSettings();
    expect(settings.mode).toBe('combat');
    expect(settings.exercise).toBe('squat');
    expect(settings.rank).toBe('cabo');
    expect(num('squatDepth')).toBe(26);
    expect(num('perfectTime')).toBe(1.2);
    expect(num('powHold')).toBe(1.5);
    expect(num('powHoldInc')).toBe(0.5);
    expect(num('deepDrop')).toBe(0); // (la recarga profunda, apagada de serie)
    expect(num('ramp')).toBe(4);
    expect(str('aim')).toBe('hands');
    expect(nLives()).toBe(3);
  });
});

describe('lo guardado por RepArena', () => {
  it('se carga, ajustado a sus límites', () => {
    ls.setItem(STORE_KEY, JSON.stringify({ mode: 'combat', exercise: 'curl', squatDepth: 31, curlRange: '22', lives: 99, look: 'comic', aimV: 2, rampV: 3, deepV: 2, rankV: 2 }));
    initSettings();
    expect(settings.exercise).toBe('curl');
    expect(num('squatDepth')).toBe(31);
    expect(num('curlRange')).toBe(22);
    expect(num('lives')).toBe(20); // (como mucho 20)
  });

  it('migraciones: el modo Asalto pasa a Combate con robots; la puntería, a lanzar con las manos (una vez)', () => {
    ls.setItem(STORE_KEY, JSON.stringify({ mode: 'walkers', exercise: 'squat' }));
    initSettings();
    expect(settings.mode).toBe('combat');
    expect(str('foesFly')).toBe('');
    expect(str('aim')).toBe('hands');
    expect(num('aimV')).toBe(2);
  });

  it('migraciones: la dificultad creciente de antes (3 %) pasa a 4 %, y la recarga profunda de 15 cm se apaga', () => {
    ls.setItem(STORE_KEY, JSON.stringify({ mode: 'combat', exercise: 'squat', ramp: 3, deepDrop: 15 }));
    ls.setItem(COMBO_KEY, JSON.stringify({ 'combat|squat': { deepDrop: 15, rank: 'cabo' } }));
    initSettings();
    expect(num('ramp')).toBe(4);
    expect(num('deepDrop')).toBe(0);
    expect(saved(COMBO_KEY)['combat|squat'].deepDrop).toBe(0);
  });

  it('migraciones ya hechas por RepArena no se repiten', () => {
    ls.setItem(STORE_KEY, JSON.stringify({ mode: 'combat', exercise: 'squat', ramp: 6, deepDrop: 15, aim: 'auto', aimV: 2, rampV: 3, deepV: 2, rankV: 2 }));
    initSettings();
    expect(num('ramp')).toBe(6);
    expect(num('deepDrop')).toBe(15);
    expect(str('aim')).toBe('auto');
  });

  it('el rango que era uno para todo pasa a cada modo y ejercicio guardado (una vez)', () => {
    ls.setItem(STORE_KEY, JSON.stringify({ mode: 'combat', exercise: 'squat', rank: 'sargento', aimV: 2, rampV: 3, deepV: 2 }));
    ls.setItem(COMBO_KEY, JSON.stringify({ 'combat|lunge': { walkTime: 12 } }));
    initSettings();
    expect(saved(COMBO_KEY)['combat|lunge'].rank).toBe('sargento');
    expect(saved(STORE_KEY).rankV).toBe(2);
  });
});

describe('cada modo con cada ejercicio', () => {
  it('guarda sus ajustes de juego y los recupera al volver', () => {
    initSettings();
    setSetting('repsWave', 20);
    setSetting('exercise', 'lunge');
    expect(num('repsWave')).toBe(20); // (un ejercicio aún sin tocar empieza con los que tenías)
    setSetting('repsWave', 8);
    setSetting('exercise', 'squat');
    expect(num('repsWave')).toBe(20);
    setSetting('exercise', 'lunge');
    expect(num('repsWave')).toBe(8);
    expect(saved(COMBO_KEY)['combat|squat'].repsWave).toBe(20);
    expect(saved(STORE_KEY).exercise).toBe('lunge');
  });

  it('cambiar de modo arrastra el ejercicio si no vale en él; Arcos empieza «Al fallo»', () => {
    initSettings();
    setSetting('exercise', 'curl');
    setSetting('mode', 'arcs');
    expect(settings.exercise).toBe('squat');
    expect(num('toFail')).toBe(1);
    setSetting('mode', 'bars');
    expect(settings.exercise).toBe('row');
  });
});

describe('rangos', () => {
  it('elegir un rango pone sus valores', () => {
    initSettings();
    setSetting('rank', 'general');
    expect(num('lives')).toBe(RANK_VALS.lives[6]);
    expect(num('walkTime')).toBe(RANK_VALS.walkTime[6]);
    expect(num('maxAlive')).toBe(RANK_VALS.maxAlive[6]);
    setSetting('rank', 'recluta');
    expect(num('lives')).toBe(0);
    expect(fmtVal(FIELD.lives)).toBe('Infinitas');
  });

  it('lo que cambias a mano se queda como valor de ese rango en ese ejercicio', () => {
    initSettings();
    setSetting('rank', 'cabo');
    setSetting('walkTime', 20);
    expect(DEV.t['combat|squat'].v?.walkTime?.[2]).toBe(20);
    expect(saved(DEV_KEY)['combat|squat'].v.walkTime[2]).toBe(20);
    setSetting('rank', 'soldado');
    expect(num('walkTime')).toBe(RANK_VALS.walkTime[1]);
    setSetting('rank', 'cabo');
    expect(num('walkTime')).toBe(20);
    expect(rankVals('cabo').walkTime).toBe(20);
    // volver al de serie deja la casilla «de serie»
    setSetting('walkTime', RANK_VALS.walkTime[2]);
    expect(DEV.t['combat|squat'].v?.walkTime).toBeUndefined();
  });
});

describe('lo que se ve', () => {
  it('cada ajuste, solo donde vale', () => {
    initSettings();
    expect(fieldVisible(FIELD.squatDepth)).toBe(true);
    expect(fieldVisible(FIELD.curlRange)).toBe(false);
    setSetting('exercise', 'curl');
    expect(fieldVisible(FIELD.squatDepth)).toBe(false);
    expect(fieldVisible(FIELD.curlRange)).toBe(true);
  });
  it('los de cada enemigo, solo si ese enemigo sale', () => {
    initSettings();
    setSetting('foesGate', 'robot');
    expect(fieldVisible(FIELD.pace_zombie)).toBe(false);
    setSetting('foesGate', 'robot,zgreen');
    expect(fieldVisible(FIELD.pace_zombie)).toBe(true);
  });
});

describe('dificultad creciente', () => {
  it('fuera de la partida, el valor tal cual; con oleadas superadas, llegan antes y bajan más', () => {
    initSettings();
    setSetting('walkTime', 12);
    expect(dv('walkTime')).toBe(12);
    expect(dv('walkTime', 5)).toBeCloseTo(12 / 1.2); // (4 % × 5 oleadas = 20 %)
    expect(dv('squatDepth', 5)).toBeCloseTo(26 * 1.08);
    expect(dv('walkTime', 100)).toBeCloseTo(12 / 1.6); // (hasta +60 %)
  });
});

describe('guardar', () => {
  it('con el mismo formato que RepArena', () => {
    initSettings();
    setSetting('squatDepth', 30);
    const s = saved(STORE_KEY);
    for (const f of SCHEMA) if (!f.xr) expect(s, f.key).toHaveProperty(f.key);
    expect(s.squatDepth).toBe(30);
    // los de RepArena XR, aparte (RepArena no los conoce)
    expect(s).not.toHaveProperty('handLook');
    expect(saved(XR_STORE_KEY)).toEqual({ handLook: 'glove', menuSize: 75 });
    expect(s.mode).toBe('combat');
    expect(store(STORE_KEY)).toEqual(s);
  });
});
