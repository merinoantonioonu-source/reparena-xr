// Los menús sin IWSDK (src/ui/fields.ts): cómo se enseña cada ajuste, qué hacen − / + y las opciones, las pestañas de
// Ajustes, la ficha de la ronda y lo del ojo. Lo que se toca se guarda en los ajustes de RepArena (mismas claves).
import { beforeEach, describe, expect, it } from 'vitest';
import { FIELD, SCHEMA } from '../../src/core/schema.js';
import { initSettings, setSetting } from '../../src/core/settings.js';
import { num, settings, str } from '../../src/core/values.js';
import { eyeFields, fieldHere, fieldPick, fieldStep, fieldView, groupFields, MAX_OPTS, roundInfo, settingsGroups } from '../../src/ui/fields.js';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

beforeEach(() => {
  mem.clear();
  initSettings();
});

describe('cada ajuste', () => {
  it('un número: su valor con su unidad y − / + dentro de sus límites', () => {
    const f = FIELD.squatDepth;
    expect(fieldView(f)).toMatchObject({ kind: 'step', value: '26 cm', canDown: true, canUp: true });
    fieldStep(f, 1);
    expect(num('squatDepth')).toBe(27);
    setSetting('squatDepth', f.max!);
    expect(fieldView(f)!.canUp).toBe(false);
    fieldStep(f, 1);
    expect(num('squatDepth')).toBe(f.max);
  });
  it('sí/no: dos teclas, la de ahora encendida', () => {
    const f = FIELD.toFail, v = fieldView(f)!;
    expect(v.opts.map((o) => o.label)).toEqual(['No', 'Sí']);
    fieldPick(f, v.opts.find((o) => !o.on)!.v);
    expect(fieldView(f)!.opts.find((o) => o.on)!.label).toBe(num('toFail') ? 'Sí' : 'No');
  });
  it('de elegir: una tecla por opción; si no caben, se pasa de una a otra con − y +, dando la vuelta', () => {
    expect(fieldView(FIELD.aim)).toMatchObject({ kind: 'opts' });
    const f = FIELD.pano; // (8 opciones: caben justas en una fila)
    expect(f.opts!.length).toBeLessThanOrEqual(MAX_OPTS);
    expect(fieldView(f)!.opts.length).toBe(f.opts!.length);
    expect(SCHEMA.filter((x) => x.type === 'choice' && x.opts!.length > MAX_OPTS).every((x) => fieldView(x)!.kind === 'step')).toBe(true);
    const first = str('pano');
    for (let i = 0; i < f.opts!.length; i++) fieldStep(f, 1);
    expect(str('pano')).toBe(first);
    fieldStep(f, -1);
    expect(str('pano')).toBe(f.opts![(f.opts!.findIndex((o) => o[0] === first) - 1 + f.opts!.length) % f.opts!.length][0]);
  });
  it('las listas: poner y quitar, sin dejar vacía la que no puede estarlo; las de muchos enemigos van en sus fichas', () => {
    const f = SCHEMA.find((x) => x.type === 'multi' && (x.opts?.length ?? 0) <= MAX_OPTS && !x.empty)!;
    for (const o of f.opts!) if (fieldView(f)!.opts.find((x) => x.v === o[0])!.on) fieldPick(f, o[0]);
    expect(str(f.key).split(',').filter(Boolean).length).toBe(1); // (la última no se quita)
    expect(fieldView(FIELD.foesGate)).toBeNull();
  });
});

describe('las pestañas', () => {
  it('Ajustes, con lo del jugador; sin sonido ni entorno (tienen su pestaña) y sin la calidad de RepArena', () => {
    const g = settingsGroups();
    expect(g).toContain('partida');
    expect(g).toContain('ejercicio');
    expect(g).not.toContain('sonido');
    expect(g).not.toContain('entorno');
    expect(fieldHere(FIELD.quality)).toBe(false);
    expect(groupFields('ejercicio').map((f) => f.key)).toContain('squatDepth');
  });
  it('los recorridos de «Tu cuerpo», los del ejercicio elegido', () => {
    setSetting('exercise', 'curl');
    expect(groupFields('ejercicio').map((f) => f.key)).toContain('curlRange');
    expect(groupFields('ejercicio').map((f) => f.key)).not.toContain('squatDepth');
  });
});

describe('el menú principal', () => {
  it('la ficha de la ronda: rango, ejercicio y cómo es la ronda', () => {
    expect(roundInfo()).toMatch(/^Cabo en Sentadillas · .*vidas .* · descanso \d+ s$/);
    setSetting('rank', 'general');
    expect(roundInfo()).toMatch(/^General en /);
  });
  it('lo del ojo, sin «Al fallo» (tiene su tecla)', () => {
    const k = eyeFields().map((f) => f.key);
    expect(k.length).toBeGreaterThan(0);
    expect(k).not.toContain('toFail');
    expect(settings.mode).toBe('combat');
  });
});
