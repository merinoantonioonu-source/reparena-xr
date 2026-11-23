// Los avisos de la Travesía, dichos para la forma en que se juega (lo vio el usuario: en plancha pedían sentadillas y
// brazos en cruz): ninguno de los que salen en plancha pide algo de pie.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formText } from '../../src/modes/trek/plat/texts';

// todos los avisos que puede decir la marcha (los literales de runner.ts, con sus variantes)
const SRC = readFileSync(new URL('../../src/modes/trek/plat/runner.ts', import.meta.url), 'utf8');
const TEXTS = [...SRC.matchAll(/this\.say\(([^;]*?), COL_(?:WARN|ASK)/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));

describe('los avisos según la forma', () => {
  it('hay avisos que comprobar', () => {
    expect(TEXTS.length).toBeGreaterThan(30);
  });
  it('en plancha, ninguno pide sentadillas, brazos en cruz, ponerse de pie ni dar un paso', () => {
    for (const t of TEXTS) expect(formText(t, 'prone'), t).not.toMatch(/sentadilla|brazos en cruz|abre los brazos|de pie|un paso/i);
  });
  it('en zancada, nada de sentadillas ni pasos (inclinar el tronco)', () => {
    for (const t of TEXTS) expect(formText(t, 'lunge'), t).not.toMatch(/sentadilla|un paso/i);
  });
  it('de pie, como siempre', () => {
    for (const t of TEXTS) expect(formText(t, 'stand')).toBe(t);
    expect(formText('¡Está mareado! Sentadilla honda y salta encima', 'prone')).toBe('¡Está mareado! Dos explosivas seguidas');
  });
});
