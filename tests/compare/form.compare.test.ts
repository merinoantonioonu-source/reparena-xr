// El HTML de cada ajuste en la página (src/page/form.ts `fieldHTML`) frente al de RepArena: el mismo texto para cada
// campo de nuestro esquema (y la primera frase de cada explicación, para el «?»). (Se salta sin RA_DIR: ver ra.ts.)
import { describe, expect, it } from 'vitest';
import { SCHEMA, type FieldDef } from '../../src/core/schema.js';
import { fieldHTML, firstSentence } from '../../src/page/form.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

describe.skipIf(!RA_DIR)('el formulario de la página, igual que RepArena', () => {
  it('cada campo da el mismo HTML', () => {
    const code = [raSlice('00_core.js', 'const firstSentence = '), raSlice('00_core.js', 'function fieldHTML(', 'function onFormInput(', false)].join('\n');
    const ra = raRun<{ fieldHTML: (f: FieldDef) => string; firstSentence: (t: string) => string }>(code, '{ fieldHTML, firstSentence }', {});
    for (const f of SCHEMA) {
      expect(fieldHTML(f), f.key).toBe(ra.fieldHTML(f));
      if (f.hint) expect(firstSentence(f.hint), f.key).toBe(ra.firstSentence(f.hint));
    }
  });
});
