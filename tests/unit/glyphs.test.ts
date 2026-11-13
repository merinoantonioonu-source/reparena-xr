// Que todo lo que se escribe en los paneles esté en las letras (public/fonts): un carácter que no tienen sale como un punto
// (pasó con «−», «▸», «◀» y «∞»).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chars = (f: string): Set<string> => new Set((JSON.parse(readFileSync(`public/fonts/${f}.json`, 'utf8')) as { chars: { id: number }[] }).chars.map((c) => String.fromCodePoint(c.id)));
const FONTS = ['bungee-400', 'rubik-500', 'rubik-700'].map(chars);
const has = (c: string): boolean => /\s/.test(c) || FONTS.every((f) => f.has(c));

describe('los caracteres de los paneles', () => {
  it('los textos de los paneles (UIKitML) están en las letras', () => {
    const bad: string[] = [];
    for (const f of readdirSync('public/ui').filter((x) => x.endsWith('.uikitml'))) {
      const src = readFileSync(`public/ui/${f}`, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
      for (const m of src.matchAll(/>([^<]+)</g)) for (const c of m[1]) if (!has(c)) bad.push(`${f}: «${c}» en «${m[1].trim()}»`);
    }
    expect(bad).toEqual([]);
  });

  it('los textos entre comillas del código de los menús están en las letras', () => {
    const bad: string[] = [];
    for (const f of ['src/ui/fields.ts', 'src/ui/menu.ts', 'src/ui/screen.ts', 'src/ui/screens/music-screens.ts', 'src/ui/screens/xfer-screens.ts', 'src/ui/screens/keypad.ts', 'src/combat/game.ts', 'src/combat/summary.ts']) {
      let src = '';
      try {
        src = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) for (const c of m[1] ?? m[2] ?? '') if (c.codePointAt(0)! > 126 && !has(c)) bad.push(`${f}: «${c}» en «${(m[1] ?? m[2]).slice(0, 40)}»`);
    }
    expect(bad).toEqual([]);
  });
});
