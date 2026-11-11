// Los ajustes portados (src/core/settings.ts) frente al código original de RepArena: los mismos cambios al azar (modos,
// ejercicios, rangos, el atajo de enemigos y cualquier ajuste, también con valores fuera de sus límites) en los dos,
// partiendo de varios estados guardados; tienen que quedar iguales los ajustes y lo guardado en el navegador.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { MODE_EX, RANKS } from '../../src/core/catalog.js';
import { SCHEMA } from '../../src/core/schema.js';
import * as P from '../../src/core/settings.js';
import { settings as PS } from '../../src/core/values.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

// (los ajustes que solo tiene RepArena XR, aparte: RepArena no los conoce)
const XR = new Set(SCHEMA.filter((f) => f.xr).map((f) => f.key)), RA_SCHEMA = SCHEMA.filter((f) => !f.xr);

type Api = { settings: Record<string, unknown>; setSetting: (k: string, v: unknown) => void };

function original(initial: Record<string, unknown>): { api: Api; mem: Mem } {
  const mem = new Mem();
  for (const k in initial) mem.setItem(k, JSON.stringify(initial[k]));
  // los ajustes (00_core), la tabla del desarrollador (67_dev) y los rangos (70_game)
  const code = [
    raSlice('00_core.js', 'const $ = s =>', 'function onSettingChanged('),
    raSlice('67_dev.js', 'const DEV_KEY = ', 'function devExport()', false),
    raSlice('70_game.js', 'function speedKey()'),
    raSlice('70_game.js', 'const RANK = { applying: false };', '(function rankMigrate()', false),
    raSlice('70_game.js', '(function rankMigrate()', '})();'),
  ].join('\n');
  const api = raRun<Api>(code, '{ settings, setSetting }', { localStorage: mem, SES: { active: false, orig: null }, renderToday: () => {} });
  return { api, mem };
}
function port(initial: Record<string, unknown>): { mem: Mem } {
  const mem = new Mem();
  for (const k in initial) mem.setItem(k, JSON.stringify(initial[k]));
  (globalThis as unknown as { localStorage: Mem }).localStorage = mem;
  P.initSettings();
  return { mem };
}
const norm = (o: Record<string, unknown>): string => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
function storeDiff(a: Mem, b: Mem): string {
  const out: string[] = [];
  for (const k of new Set([...a.m.keys(), ...b.m.keys()])) {
    if (k === P.XR_STORE_KEY) continue;
    const x = JSON.parse(a.m.get(k) ?? 'null') ?? {}, y = JSON.parse(b.m.get(k) ?? 'null') ?? {};
    for (const sk of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[sk]) !== JSON.stringify(y[sk])) out.push(`${k}.${sk}: portado ${JSON.stringify(x[sk])?.slice(0, 160)} / RepArena ${JSON.stringify(y[sk])?.slice(0, 160)}`);
  }
  return out.join('\n');
}
function setDiff(): string {
  return [...new Set([...Object.keys(PS), ...Object.keys(O.api.settings)])].filter((x) => !XR.has(x) && JSON.stringify(PS[x]) !== JSON.stringify(O.api.settings[x])).map((x) => `${x}: portado ${JSON.stringify(PS[x])} / RepArena ${JSON.stringify(O.api.settings[x])}`).join('; ');
}
let O: { api: Api; mem: Mem };

// azar con semilla (para poder repetir un fallo)
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
// (sin los ejercicios que RepArena ya no ofrece: con ellos, RepArena deja el modo vacío y aquí se queda el de antes)
const EXS = [...new Set(Object.values(MODE_EX).flat())];
function randomOp(r: () => number): [string, string | number] {
  const x = r(), pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  if (x < 0.12) return ['mode', pick(['combat', 'arcs', 'bars', 'touch', 'trek', 'walkers', 'flyers'])];
  if (x < 0.3) return ['exercise', pick(EXS)];
  if (x < 0.42) return ['rank', pick(RANKS.map((o) => o[0]))];
  if (x < 0.45) return ['foes', pick(['robots', 'flyers', 'mix'])];
  const f = pick(RA_SCHEMA);
  if (f.type === 'num') return [f.key, +(f.min! - 1 + r() * (f.max! - f.min! + 2)).toFixed(r() < 0.5 ? 0 : 2)];
  if (f.type === 'toggle') return [f.key, r() < 0.5 ? 0 : 1];
  if (f.type === 'choice') return [f.key, r() < 0.9 ? pick(f.opts!)[0] : 'basura'];
  return [f.key, f.opts!.filter(() => r() < 0.4).map((o) => o[0]).join(',')];
}

const INITIALS: Record<string, Record<string, unknown>> = {
  vacío: {},
  'de RepArena': {
    'reparena3-settings': { mode: 'combat', exercise: 'curl', rank: 'sargento', squatDepth: 31, curlRange: 22, aimV: 2, rampV: 3, deepV: 2, rankV: 2 },
    'reparena3-combos': { 'combat|squat': { rank: 'teniente', walkTime: 8, repsWave: 15 } },
    'reparena3-dev': { 'combat|squat': { v: { walkTime: [null, null, 13, null, null, null, null] } } },
  },
  antiguo: { 'reparena3-settings': { mode: 'walkers', exercise: 'squat', ramp: 3, deepDrop: 15, foes: 'mix', robotsW: 0 }, 'reparena3-combos': { 'combat|lunge': { deepDrop: 15 } } },
};
const SEEDS = (process.env.SEEDS || '1,2,3').split(',').map(Number), STEPS = +(process.env.STEPS || 300);

describe.skipIf(!RA_DIR)('los ajustes, igual que RepArena', () => {
  for (const [name, init] of Object.entries(INITIALS)) {
    for (const seed of SEEDS) {
      it(`${name}, semilla ${seed}: ${STEPS} cambios al azar`, () => {
        O = original(init);
        const Pm = port(init);
        expect(setDiff(), 'al cargar').toBe('');
        expect(storeDiff(Pm.mem, O.mem), 'lo guardado al cargar').toBe('');
        const r = rng(seed * 7919 + name.length);
        for (let i = 0; i < STEPS; i++) {
          const [k, v] = randomOp(r);
          O.api.setSetting(k, v);
          P.setSetting(k, v);
          const d = setDiff();
          if (d) throw new Error(`paso ${i}: setSetting(${k}, ${JSON.stringify(v)}): ${d}`);
          const ds = storeDiff(Pm.mem, O.mem);
          if (ds) throw new Error(`paso ${i}: lo guardado tras setSetting(${k}, ${JSON.stringify(v)}):\n${ds}`);
        }
      }, 120000);
    }
  }
});
