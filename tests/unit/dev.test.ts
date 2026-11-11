// El modo desarrollador (src/core/dev.ts): encenderlo con cinco toques, el ojo, copiar, de fábrica, exportar e importar,
// cada enemigo y las canciones, con las claves de RepArena (reparena3-dev, reparena3-devon, reparena3-exsongs).
import { beforeEach, describe, expect, it } from 'vitest';
import { DEV } from '../../src/core/dev-state.js';
import * as D from '../../src/core/dev.js';
import { DEV_KEY, DEV_ON_KEY, devEye, devVal, initSettings, setSetting } from '../../src/core/settings.js';
import { settings } from '../../src/core/values.js';
import { Mem } from '../compare/ra.js';

const ls = new Mem();
(globalThis as unknown as { localStorage: Mem }).localStorage = ls;
const saved = (k: string) => JSON.parse(ls.getItem(k) as string);

beforeEach(() => {
  ls.clear();
  initSettings();
  D.devInit();
});

describe('encender y apagar', () => {
  it('cinco toques en menos de 3 s lo encienden; cuatro, no', () => {
    expect([0, 500, 1000, 1500].map((t) => D.devTap(t))).toEqual([false, false, false, false]);
    expect(DEV.on).toBe(false);
    expect(D.devTap(2000)).toBe(true);
    expect(DEV.on).toBe(true);
    expect(saved(DEV_ON_KEY)).toBe(true);
  });
  it('toques muy separados no cuentan', () => {
    for (const t of [0, 1000, 2000, 3000, 4000]) D.devTap(t * 1.0 + (t ? 100 : 0));
    expect(DEV.on).toBe(false);
  });
  it('al apagarlo, el menú completo vuelve a sencillo y avisa', () => {
    const said: string[] = [];
    D.DEV_HOOKS.say = (t) => said.push(t);
    D.devToggle(true);
    setSetting('menuLevel', 'full');
    D.devToggle(false);
    expect(settings.menuLevel).toBe('simple');
    expect(said).toEqual(['Modo desarrollador: activado', 'Modo desarrollador: desactivado']);
    D.DEV_HOOKS.say = null;
  });
});

describe('la tabla', () => {
  it('el ojo: parte de lo de serie y se guarda', () => {
    const def = devEye();
    D.devEyeToggle('rest');
    expect(devEye()).toEqual(def.filter((k) => k !== 'rest'));
    D.devEyeToggle('lives');
    expect(saved(DEV_KEY)['combat|squat'].eye).toContain('lives');
  });
  it('copiar a otro ejercicio y volver a los de fábrica', () => {
    D.devSet('walkTime', 2, 14);
    D.devCopy('combat|lunge');
    expect(devVal('walkTime', 2, 'combat|lunge')).toBe(14);
    D.devFactory();
    expect(DEV.t['combat|squat']).toBeUndefined();
    expect(DEV.t['combat|lunge']).toBeDefined();
  });
  it('quitar lo tuyo de una fila', () => {
    D.devSet('maxAlive', 0, 3);
    expect(D.devRowOn('maxAlive')).toBe(true);
    D.devRowClear('maxAlive');
    expect(D.devCell('maxAlive', 0)).toBeNull();
  });
  it('las filas, filtradas por modo, y la vista de la tabla', () => {
    const arcs = D.devRowsFor('arcs', 'squat'), combat = D.devRowsFor('combat', 'squat');
    expect(arcs).toContain('arcSpeed');
    expect(combat).not.toContain('arcSpeed');
    expect(combat).toEqual(D.devRows());
    D.devSet('walkTime', 1, 12);
    const row = D.devTable().find((r) => r.key === 'walkTime')!;
    expect(row.cells).toHaveLength(7);
    expect(row.cells[1]).toMatchObject({ v: 12, own: true });
    expect(row.cells.filter((c) => c.now)).toHaveLength(1);
  });
  it('exportar e importar: lo mismo de vuelta; lo que no vale, fuera', () => {
    D.devSet('walkTime', 3, 9);
    D.devEyeToggle('lives');
    D.devFoeSet('g:zombie', 'hp', 5);
    const out = D.devExport();
    DEV.t = {};
    expect(D.devImport(out)).toBe('Tabla cargada (1 filas)');
    expect(D.devExport()).toBe(out);
    expect(D.devImport('{nope')).toBe('Eso no es una tabla (JSON) válida');
    expect(D.devImport('[1]')).toBe('Eso no es una tabla válida');
    D.devImport(JSON.stringify({ 'nada|squat': { v: { walkTime: [1] } }, 'combat|squat': { v: { rank: [1], walkTime: [999, null] }, eye: ['basura', 'rest'] }, foes: { 'g:nadie': { hp: 3 }, 'g:imp': { hp: 99 } } }));
    expect(DEV.t['nada|squat']).toBeUndefined();
    expect(DEV.t['combat|squat'].v).toEqual({ walkTime: [devVal('walkTime', 0), null, null, null, null, null, null] });
    expect(DEV.t['combat|squat'].eye).toEqual(['rest']);
    expect(DEV.t.foes).toEqual({ 'g:imp': { hp: 12 } });
  });
});

describe('cada enemigo', () => {
  it('la lista sale de los grupos, con los pesados y sin el dragón', () => {
    const keys = D.devFoes().map((x) => x[0]);
    expect(keys.slice(0, 2)).toEqual(['g:robot', 'g:robot_h']);
    expect(keys).toContain('h:spider_h');
    expect(keys).toContain('f:bomber');
    expect(keys).not.toContain('f:dragon');
  });
  it('resistencia, fuerza y dureza dentro de sus límites; vacío, de serie', () => {
    D.devFoeSet('g:yeti', 'str', 9);
    D.devFoeSet('g:yeti', 'tier', 1);
    expect(D.devFoe('g:yeti')).toEqual({ hp: 3, str: 5, tier: 1 });
    expect(D.foeTier('yeti')).toBe(1);
    D.devFoeSet('g:yeti', 'str', '');
    D.devFoeSet('g:yeti', 'tier', '');
    expect((DEV.t.foes as Record<string, unknown>)['g:yeti']).toBeUndefined();
    expect(D.foeTier('yeti')).toBe(4);
    expect(D.devFoeClean({ hp: 0.4, str: 'x', tier: 7 })).toEqual({ hp: 1, str: 1, tier: 4 }); // (lo escrito sin número vale 1, como en RepArena)
  });
});

describe('canciones de cada ejercicio', () => {
  it('solo pistas de Spotify, como mucho 50, en reparena3-exsongs', () => {
    const l = Array.from({ length: 60 }, (_, i) => ({ uri: 'spotify:track:' + i, name: 'n'.repeat(200), by: 7 }));
    D.exSongsSet([{ uri: 'http://x' }, ...l]);
    const s = D.exSongs();
    expect(s).toHaveLength(50);
    expect(s[0]).toEqual({ uri: 'spotify:track:0', name: 'n'.repeat(120), by: '7' });
    expect(saved(D.EXS_KEY).squat).toHaveLength(50);
    D.exSongsSet([]);
    expect(saved(D.EXS_KEY)).toEqual({});
  });
});
