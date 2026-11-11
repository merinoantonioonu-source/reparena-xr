// La caricatura del ejercicio (src/ui/demo-art.ts) se pinta sin fallar en todos los ejercicios y modos, con todos los
// números del dibujo bien (sin NaN ni infinitos), en un lienzo de mentira que acepta cualquier llamada.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO, demoDraw, demoInfo, demoJoints, demoPose, type DemoOpts } from '../../src/ui/demo-art.js';
import { MODE_NAMES } from '../../src/core/catalog.js';

// Un contexto 2D que admite todo: lo que se escribe se guarda; los métodos no hacen nada, salvo medir (10 px por letra)
// y los degradados. Apunta los números raros que reciba.
function fakeCtx(bad: string[]): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = {};
  const fns: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (t) => ({ width: String(t).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy({}, {
    get: (_, k) => (k in props ? props[k] : (...a: unknown[]) => {
      for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)}(${a.join(', ')})`);
      return typeof k === 'string' && fns[k] ? fns[k](...a) : undefined;
    }),
    set: (_, k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(k)} = ${v}`); props[k] = v; return true; },
  }) as CanvasRenderingContext2D;
}

const OPTS: DemoOpts[] = [
  { perfectTime: 0, perks: false, foes: 'robots', sword: false, pistol: false },
  { perfectTime: 1.5, perks: true, foes: 'flyers', sword: false, pistol: true },
  { perfectTime: 2, perks: true, foes: 'mix', sword: true, swordKind: 'laser', pistol: false },
];

describe('la caricatura del ejercicio', () => {
  beforeAll(() => { const junk: string[] = []; vi.stubGlobal('document', { createElement: () => ({ getContext: () => fakeCtx(junk) }) }); }); // (fitFont mide en un lienzo aparte)
  afterAll(() => { vi.unstubAllGlobals(); });

  it('se pinta en todos los ejercicios y modos sin fallar ni números raros', () => {
    const bad: string[] = [], c = fakeCtx(bad);
    let n = 0;
    for (const ex of [...Object.keys(DEMO), 'zzz']) for (const mode of Object.keys(MODE_NAMES)) for (const o of OPTS)
      for (let t = 0; t < 7; t += 0.13) { demoDraw(c, 640, 384, ex, mode, t, o); n++; }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(5000);
  });

  it('las articulaciones son números y lo que hace cada modo tiene texto', () => {
    for (const [ex, D] of Object.entries(DEMO)) for (let u = 0; u <= 1; u += 0.05) {
      const J = demoJoints(demoPose(D, u));
      for (const p of [J.hip, J.neck, J.sh, J.head, ...J.legF, ...J.legB, ...J.armF, ...J.armB]) expect(p.every(Number.isFinite), ex).toBe(true);
    }
    for (const mode of Object.keys(MODE_NAMES)) expect(demoInfo('squat', mode, OPTS[0]).what.length).toBeGreaterThan(10);
  });
});
