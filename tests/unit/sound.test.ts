/**
 * El sonido: que cada sonido tenga su archivo (el de serie y, si lo has puesto, el tuyo), que los efectos de RepArena
 * (SND) pidan sonidos que existen y que el LEEME de sounds/ los cuente todos.
 */
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { byName, DEFAULT, OWN, SOUNDS, soundUrl, VOICE } from '../../src/audio/catalog';
import { SND, SOUND } from '../../src/audio/sound';
import { initSettings } from '../../src/core/settings';

beforeAll(() => initSettings()); // (tus ajustes de serie: el ambiente al 60 %)

describe('los archivos de cada sonido', () => {
  it('cada sonido tiene su archivo de serie (sounds/de-serie)', () => {
    for (const n of Object.keys(SOUNDS)) expect(DEFAULT[n], n).toBeTruthy();
  });

  it('tus archivos de sounds/ se llaman como un sonido del juego', () => {
    for (const n of Object.keys(OWN)) expect(SOUNDS[n], `sounds/${n}: no es ningún sonido del juego`).toBeTruthy();
  });

  it('suena el tuyo si lo has puesto; si no, el de serie', () => {
    expect(soundUrl('rayo')).toBe(OWN.rayo);
    expect(soundUrl('clic')).toBe(DEFAULT.clic);
    expect(soundUrl('no-existe')).toBeNull();
  });

  it('con dos del mismo nombre, vale el .mp3 y luego el .ogg (como en RepArena)', () => {
    expect(byName({ 'a/x.wav': 'w', 'a/x.ogg': 'o', 'a/x.mp3': 'm', 'a/y.wav': 'w2', 'a/y.ogg': 'o2', 'a/z.txt': 't' })).toEqual({ x: 'm', y: 'o2' });
  });

  it('los bucles se repiten y los del ambiente van con su volumen', () => {
    expect(SOUNDS['ambiente-arena'].loop && SOUNDS['ambiente-arena'].amb).toBe(true);
    expect(SOUNDS['zumbido-dron'].loop && !SOUNDS['zumbido-dron'].amb).toBe(true);
    expect(SOUNDS.rayo.loop).toBeFalsy();
  });
});

describe('los efectos de RepArena (SND)', () => {
  const at = new Vector3(0, 1.5, -2);
  it('cada uno pide un sonido que existe', () => {
    for (const [k, fn] of Object.entries(SND) as [string, (...a: unknown[]) => void][]) {
      SOUND.last = '';
      fn(at);
      expect(SOUNDS[SOUND.last], `SND.${k} → «${SOUND.last}»`).toBeTruthy();
    }
  });

  it('las voces de cada uno y las espadas láser existen', () => {
    for (const set of Object.values(VOICE)) for (const n of Object.values(set)) expect(SOUNDS[n], n).toBeTruthy();
    SND.swordHit(at, true);
    expect(SOUND.last).toBe('espada-golpe-laser');
    SND.roar(at, 0.85, 'zgreen');
    expect(SOUND.last).toBe('rugido-zombi-verde');
    SND.roar(at, 1, 'quien-no-esta'); // (sin voz propia: no suena, ni la de los robots)
    expect(SOUND.last).toBe('rugido-zombi-verde');
  });

  it('el rayo cargado, desde el nivel 2', () => {
    SND.bolt(at, 1);
    expect(SOUND.last).toBe('rayo');
    SND.bolt(at, 2);
    expect(SOUND.last).toBe('rayo-cargado');
  });
});

describe('el LEEME de sounds/', () => {
  const text = readFileSync(new URL('../../sounds/LEEME.md', import.meta.url), 'utf8');
  it('cuenta cuándo suena cada uno', () => {
    for (const n of Object.keys(SOUNDS)) expect(text.includes('`' + n.replace(/-laser$/, '') + '`'), n).toBe(true);
  });
});
