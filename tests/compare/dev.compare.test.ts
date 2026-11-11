// El modo desarrollador portado (src/core/dev.ts, con lo que ya estaba en settings.ts y combat/foes.ts) frente al código
// original de RepArena (src/67_dev.js): las mismas operaciones al azar (casillas, el ojo, copiar, de fábrica, cada enemigo,
// los cinco toques, las canciones, importar tablas al azar —con basura— y lo exportado) en los dos, partiendo de tablas
// guardadas al azar; tienen que quedar iguales lo exportado, lo guardado en el navegador y lo que se lee (el ojo, las
// filas, la dureza, cada enemigo). (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { EX_NAMES, MODE_EX, MODE_NAMES, RANKS } from '../../src/core/catalog.js';
import { DEV } from '../../src/core/dev-state.js';
import * as D from '../../src/core/dev.js';
import { FIELD, SCHEMA } from '../../src/core/schema.js';
import * as P from '../../src/core/settings.js';
import { settings as PS } from '../../src/core/values.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

type Api = Record<string, (...a: never[]) => unknown> & { DEV: { on: boolean; t: unknown }; settings: Record<string, unknown> };
const clock = { t: 0 };

function original(mem: Mem): Api {
  const code = [
    raSlice('00_core.js', 'const $ = s =>', 'function onSettingChanged('),
    raSlice('67_dev.js', 'const DEV_KEY = ', '/* ---------- La tabla en la página', false),
    raSlice('67_dev.js', 'const devFmt = '),
    raSlice('67_dev.js', 'const devRowOn = '),
    'function devPage() {}', // (la tabla en la página: aquí no)
    raSlice('70_game.js', 'const FOE_TIER = ', 'const LADDER = ', false),
    raSlice('70_game.js', 'function speedKey()'),
    raSlice('70_game.js', 'const RANK = { applying: false };', '(function rankMigrate()', false),
    raSlice('70_game.js', '(function rankMigrate()', '})();'),
  ].join('\n');
  const names = 'settings, setSetting, DEV, EXS, devSet, devEye, devEyeToggle, devCopy, devFactory, devExport, devImport, devFoes, devFoe, devFoeSet, devFoeClean, foeTier, devTap, devToggle, devRows, devRowOn, devFmt, exSongs, exSongsSet, devVal';
  return raRun<Api>(code, `{ ${names} }`, { localStorage: mem, SES: { active: false, orig: null }, renderToday: () => {}, performance: { now: () => clock.t } });
}

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const COMBOS = Object.keys(MODE_EX).flatMap((m) => MODE_EX[m].map((x) => m + '|' + x));
const DEVROW = SCHEMA.filter((f) => P.devRowOk(f));
const FOES = D.devFoes().map((x) => x[0]);

/** Un valor al azar para una casilla: dentro, fuera de límites, texto o vacío. */
function cellVal(r: () => number, k: string): unknown {
  const f = FIELD[k], x = r();
  if (x < 0.15) return null;
  if (x < 0.2) return 'basura';
  if (f.type === 'num') return +(f.min! - 2 + r() * (f.max! - f.min! + 4)).toFixed(2);
  if (f.type === 'toggle') return r() < 0.5 ? 0 : 1;
  return (f.opts ?? [])[Math.floor(r() * (f.opts ?? []).length)]?.[0] ?? 'x';
}
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];
/** Una tabla al azar, como la guardaría RepArena (o con basura: modos y ejercicios que no hay, filas que no valen…). */
function randomTable(r: () => number, junk: boolean): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  for (let n = Math.floor(r() * 6); n > 0; n--) {
    const id = junk && r() < 0.15 ? pick(r, ['nada|squat', 'combat|nada', 'combat', 'arcs|squat|x']) : pick(r, COMBOS), e: Record<string, unknown> = {};
    if (r() < 0.8) {
      const v: Record<string, unknown> = {};
      for (let m = 1 + Math.floor(r() * 4); m > 0; m--) {
        const k = junk && r() < 0.15 ? pick(r, ['rank', 'aim', 'volume', 'noexiste']) : pick(r, DEVROW).key;
        v[k] = junk && r() < 0.1 ? 'no es lista' : RANKS.map(() => (FIELD[k] ? cellVal(r, k) : 3));
      }
      e.v = v;
    }
    if (r() < 0.5) e.eye = Array.from({ length: Math.floor(r() * 5) }, () => (junk && r() < 0.2 ? 'noexiste' : pick(r, DEVROW).key));
    t[id] = junk && r() < 0.05 ? 7 : e;
  }
  if (r() < 0.6) {
    const F: Record<string, unknown> = {};
    for (let n = Math.floor(r() * 5); n > 0; n--) F[junk && r() < 0.2 ? 'g:nadie' : pick(r, FOES)] = { hp: r() < 0.7 ? Math.floor(r() * 16) : undefined, str: r() < 0.5 ? (r() * 7).toFixed(1) : undefined, tier: r() < 0.5 ? Math.floor(r() * 6) : 'x' };
    t.foes = F;
  }
  if (junk && r() < 0.5) t.songs = { [pick(r, [...Object.keys(EX_NAMES), 'nada'])]: randomSongs(r) };
  return t;
}
function randomSongs(r: () => number): unknown {
  if (r() < 0.1) return 'no es lista';
  return Array.from({ length: r() < 0.1 ? 49 + Math.floor(r() * 4) : Math.floor(r() * 6) }, // (a veces, cerca del máximo de 50)
     (_, i) => (r() < 0.2 ? { uri: 'http://x/' + i } : { uri: 'spotify:track:' + Math.floor(r() * 1e6), name: r() < 0.3 ? 'n'.repeat(130) : 'Canción ' + i, by: r() < 0.2 ? undefined : 'Grupo' }));
}

/** Una operación al azar, la misma en los dos (cada lado, con su código). */
function randomOp(r: () => number): [string, unknown[]] {
  const x = r();
  if (x < 0.08) return ['mode', [pick(r, Object.keys(MODE_NAMES))]];
  if (x < 0.18) return ['exercise', [pick(r, [...new Set(Object.values(MODE_EX).flat())])]];
  if (x < 0.24) return ['rank', [pick(r, RANKS.map((o) => o[0]))]];
  if (x < 0.36) {
    const k = pick(r, DEVROW).key;
    return ['devSet', [k, Math.floor(r() * RANKS.length), cellVal(r, k), r() < 0.7 ? undefined : pick(r, COMBOS)]];
  }
  if (x < 0.46) return ['devEyeToggle', [pick(r, DEVROW).key, r() < 0.7 ? undefined : pick(r, COMBOS)]];
  if (x < 0.5) return ['devCopy', [pick(r, COMBOS)]];
  if (x < 0.53) return ['devFactory', []];
  if (x < 0.65) return ['devFoeSet', [pick(r, FOES), pick(r, ['hp', 'str', 'tier']), pick(r, ['', '0', '1', '3', '4.6', '9', '15', 'x', '-2'])]];
  if (x < 0.72) return ['devTap', [pick(r, [300, 400, 700, 900, 2900, 3100])]]; // (cerca del límite de 3 s)
  if (x < 0.75) return ['devToggle', [r() < 0.3 ? undefined : r() < 0.5]];
  if (x < 0.78) return ['menuLevel', [pick(r, ['full', 'simple'])]];
  if (x < 0.84) return ['exSongsSet', [randomSongs(r), r() < 0.5 ? undefined : pick(r, Object.keys(EX_NAMES))]];
  if (x < 0.92) return ['devImport', [r() < 0.1 ? pick(r, ['{nope', '[1,2]', 'null', '"x"']) : JSON.stringify(randomTable(r, true))]];
  return ['reimport', []];
}

// (con un margen de tiempo: el cifrado y las 250 operaciones en los dos tardan, más aún con las demás pruebas a la vez)
describe.skipIf(!RA_DIR)('el modo desarrollador, igual que RepArena', { timeout: 30000 }, () => {
  for (const seed of (process.env.SEEDS || '1,2,3,4,5').split(',').map(Number)) {
    it(`semilla ${seed}: tabla guardada al azar y 250 operaciones al azar`, () => {
      const r = rng(seed), init: Record<string, unknown> = {
        'reparena3-dev': randomTable(r, false),
        'reparena3-devon': r() < 0.5,
        'reparena3-exsongs': { squat: randomSongs(r) },
        'reparena3-settings': { mode: 'combat', exercise: pick(r, MODE_EX.combat), rank: pick(r, RANKS.map((o) => o[0])), menuLevel: 'simple' },
      };
      const mo = new Mem(), mp = new Mem();
      for (const m of [mo, mp]) for (const k in init) m.setItem(k, JSON.stringify(init[k]));
      clock.t = 0;
      const O = original(mo);
      (globalThis as unknown as { localStorage: Mem }).localStorage = mp;
      P.initSettings();
      D.devInit();
      for (let i = 0; i < 250; i++) {
        const [op, args] = randomOp(r), where = `paso ${i}: ${op} ${JSON.stringify(args).slice(0, 200)}`;
        let a: unknown, b: unknown;
        const call = (api: Record<string, unknown>, name: string, xs: unknown[]) => (api[name] as (...z: unknown[]) => unknown)(...xs);
        // (los parámetros que faltan, como en RepArena: sin pasarlos)
        const xs = args.slice(0, args.findLastIndex((v) => v !== undefined) + 1);
        if (op === 'mode' || op === 'exercise' || op === 'rank' || op === 'menuLevel') {
          O.setSetting(op as never, args[0] as never);
          P.setSetting(op, args[0] as string);
        } else if (op === 'devTap') {
          clock.t += args[0] as number;
          a = O.devTap();
          b = D.devTap(clock.t);
        } else if (op === 'reimport') {
          a = O.devImport(O.devExport() as never);
          b = D.devImport(D.devExport());
        } else if (op === 'devSet') {
          a = call(O, 'devSet', xs);
          b = call(P as unknown as Record<string, unknown>, 'devSet', xs);
        } else {
          a = call(O, op, xs);
          b = call(D as unknown as Record<string, unknown>, op, xs);
        }
        expect(b, where).toEqual(a);
        expect(D.devExport(), where).toBe(O.devExport());
        expect(DEV.on, where).toBe(O.DEV.on);
        for (const k of ['reparena3-dev', 'reparena3-devon', 'reparena3-exsongs', 'reparena3-settings']) expect(mp.getItem(k), `${where} (${k})`).toBe(mo.getItem(k));
        expect(D.devEye(), where).toEqual(O.devEye());
        expect(D.devRows(), where).toEqual(O.devRows());
        expect(D.exSongs(), where).toEqual(O.exSongs());
        const keys = Object.keys(O.settings);
        expect(keys.filter((k) => JSON.stringify(PS[k]) !== JSON.stringify(O.settings[k])), where).toEqual([]);
      }
      // los cinco toques, con separaciones alrededor del límite de 3 s
      for (let i = 0; i < 80; i++) {
        clock.t += pick(r, [200, 600, 2400, 2900, 3100, 3400]);
        expect(D.devTap(clock.t), `toque ${i}`).toBe(O.devTap());
        expect(DEV.on).toBe(O.DEV.on);
      }
      // el máximo de canciones por ejercicio
      const many = Array.from({ length: 60 }, (_, i) => ({ uri: 'spotify:track:' + i, name: 'c' + i, by: 'g' }));
      O.exSongsSet(many as never, 'lunge' as never);
      D.exSongsSet(many, 'lunge');
      expect(D.exSongs('lunge')).toEqual(O.exSongs('lunge' as never));
      expect(mp.getItem('reparena3-exsongs')).toBe(mo.getItem('reparena3-exsongs'));
      // al acabar: cada enemigo, su dureza, las filas que manda el rango y cómo se enseña cada valor
      expect(D.devFoes()).toEqual(O.devFoes());
      for (const k of FOES) expect(D.devFoe(k), k).toEqual(O.devFoe(k as never));
      for (const k of [...new Set(FOES.map((x) => x.slice(2)))]) expect(D.foeTier(k), k).toBe(O.foeTier(k as never));
      for (const f of DEVROW) {
        expect(D.devRowOn(f.key), f.key).toBe(O.devRowOn(f.key as never));
        for (let i = 0; i < RANKS.length; i++) expect(D.devFmt(f, P.devVal(f.key, i)), f.key).toBe(O.devFmt(f as never, O.devVal(f.key as never, i as never) as never));
      }
      for (const o of [{ hp: 0.4, str: 'x', tier: 7 }, { hp: '13', str: 0 }, {}, { tier: -3 }]) expect(D.devFoeClean(o)).toEqual(O.devFoeClean(o as never));
    });
  }
});
