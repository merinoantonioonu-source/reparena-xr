// Cada modo con cada ejercicio recuerda sus ajustes (pedido del usuario: «que la app recuerde las opciones elegidas para cada
// ejercicio y las mantenga»): lo de RepArena, en reparena3-combos como siempre, y lo de RepArena XR (la Travesía, el vuelo, el
// mapa…), aparte, en reparenaxr-combos.
import { beforeEach, describe, expect, it } from 'vitest';
import { comboKeysXr, comboKnown, initSettings, setSetting, XR_COMBO_KEY } from '../../src/core/settings.js';
import { settings } from '../../src/core/values.js';
import { Mem } from '../compare/ra.js';

const ls = new Mem();
(globalThis as unknown as { localStorage: Mem }).localStorage = ls;
const saved = (k: string) => JSON.parse(ls.getItem(k) as string);

beforeEach(() => {
  ls.clear();
  initSettings();
});

describe('lo de cada ejercicio', () => {
  it('la Travesía en plancha guarda su vuelo y su ciudad; de pie, lo suyo; al volver, como lo dejaste', () => {
    setSetting('mode', 'trek');
    setSetting('exercise', 'pushup');
    setSetting('trekFly', 1);
    setSetting('flyMap', 'paris');
    setSetting('trekSpeed', 170);
    setSetting('exercise', 'squat');
    expect(settings.trekSpeed).toBe(130); // (la sentadilla ya se había visto al entrar en la Travesía: como estaba)
    setSetting('trekSpeed', 110);
    setSetting('trekFly', 0);
    setSetting('exercise', 'pushup');
    expect(settings.trekFly).toBe(1);
    expect(settings.flyMap).toBe('paris');
    expect(settings.trekSpeed).toBe(170);
    setSetting('exercise', 'squat');
    expect(settings.trekSpeed).toBe(110);
    expect(settings.trekFly).toBe(0);
  });
  it('cambiar de modo también: la sentadilla de Combate y la de la Travesía, cada una con su rango', () => {
    setSetting('mode', 'combat');
    setSetting('exercise', 'squat');
    setSetting('rank', 'general');
    setSetting('mode', 'trek');
    setSetting('rank', 'recluta');
    setSetting('mode', 'combat');
    expect(settings.rank).toBe('general');
    setSetting('mode', 'trek');
    expect(settings.rank).toBe('recluta');
  });
  it('se guarda aparte: lo de RepArena no recibe nada de RepArena XR', () => {
    setSetting('mode', 'trek');
    setSetting('exercise', 'pushup');
    setSetting('trekFly', 1);
    setSetting('exercise', 'squat');
    expect(saved(XR_COMBO_KEY)['trek|pushup'].trekFly).toBe(1);
    const ra = JSON.stringify(saved('reparena3-combos'));
    expect(ra).not.toContain('trekFly');
    expect(ra).not.toContain('trekSpeed');
  });
  it('lo de tus gafas y tu habitación no va por ejercicio', () => {
    const k = comboKeysXr();
    for (const x of ['flyMapSharp', 'barsAnchor', 'flyPractice', 'handLook', 'menuSize', 'cbTravel']) expect(k, x).not.toContain(x);
    for (const x of ['trekFly', 'flyMap', 'trekSpeed', 'trekCurves', 'cbElite', 'barRope', 'arcBlades', 'fpDepth']) expect(k, x).toContain(x);
  });
  it('sabe si un ejercicio ya se ha jugado', () => {
    setSetting('mode', 'combat');
    setSetting('exercise', 'lunge');
    expect(comboKnown('combat|squat')).toBe(true);
    expect(comboKnown('combat|dips')).toBe(false);
  });
});
