// La caricatura del ejercicio portada (src/ui/demo-art.ts) frente al código original de RepArena (src/62_demo.js, de DL a
// drawFoe): las mismas articulaciones del monigote en cada fase, los mismos textos (lo que haces, la PERFECTA y el extra)
// y el mismo dibujo, llamada a llamada y en el mismo orden, en todos los ejercicios y modos. (Se salta sin RA_DIR.)
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEEP_EX, EX_NAMES, MODE_NAMES } from '../../src/core/catalog.js';
import { FB, FD, TAU, clamp, fitFont, lerp, rr, smooth } from '../../src/ui/canvas-kit.js';
import { DEMO, demoDraw, demoInfo, demoJoints, demoPose, demoTips, type DemoDef, type DemoOpts, type Joints } from '../../src/ui/demo-art.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

interface RA {
  DEMO: Record<string, DemoDef>;
  demoPose: (D: DemoDef, u: number) => unknown;
  demoJoints: (P: unknown) => Joints;
  demoTips: (ex: string, mode: string) => { perfect: string; extra: string };
  demoInfo: (ex: string, mode: string) => { what: string; foesKind: string | null };
  demoDraw: (c: CanvasRenderingContext2D, W: number, H: number, ex: string, mode: string, t: number) => void;
}

// Un contexto 2D que apunta cada llamada y cada valor que se le pone (los degradados, con sus paradas)
function recCtx(log: string[]): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = {};
  const fmt = (v: unknown) => (typeof v === 'object' && v ? '[obj]' : String(v));
  return new Proxy({}, {
    get: (_, k) => (k in props ? props[k] : (...a: unknown[]) => {
      log.push(`${String(k)}(${a.map(fmt).join(',')})`);
      if (k === 'measureText') return { width: String(a[0]).length * 10 };
      if (k === 'createLinearGradient') return { addColorStop: (...b: unknown[]) => log.push(`stop(${b.join(',')})`) };
      return undefined;
    }),
    set: (_, k, v) => { log.push(`${String(k)}=${fmt(v)}`); props[k] = v; return true; },
  }) as CanvasRenderingContext2D;
}

const MODES = Object.keys(MODE_NAMES);
const OPTS: DemoOpts[] = [];
for (const perfectTime of [0, 1.5, 2]) for (const perks of [false, true]) for (const foes of ['robots', 'flyers', 'mix']) for (const [sword, pistol, swordKind] of [[false, false, ''], [false, true, ''], [true, false, 'laser'], [true, false, 'saber']] as const)
  OPTS.push({ perfectTime, perks, foes, sword, pistol, swordKind });

describe.skipIf(!RA_DIR)('la caricatura del ejercicio, como en RepArena', () => {
  let ra: RA;
  const cur: { o: DemoOpts } = { o: OPTS[0] };
  const settings = { get perfectTime() { return cur.o.perfectTime; }, get perks() { return cur.o.perks; }, get swordKind() { return cur.o.swordKind; } };
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => recCtx([]) }) }); // (fitFont mide en un lienzo aparte)
    ra = raRun<RA>(raSlice('62_demo.js', '/* =================== CARICATURA', '/* ---------- En el juego', false), '{ DEMO, demoPose, demoJoints, demoTips, demoInfo, demoDraw }', {
      clamp, lerp, smooth, TAU, rr, fitFont, FD, FB, EX_NAMES, MODE_NAMES, DEEP_EX, settings,
      foes: () => cur.o.foes, swordSet: () => cur.o.sword, pistolOn: () => cur.o.pistol,
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('los mismos ejercicios y las mismas articulaciones en cada fase', () => {
    expect(Object.keys(DEMO)).toEqual(Object.keys(ra.DEMO));
    const flat = (J: Joints) => [J.hip, J.neck, J.sh, J.head, ...J.legF, ...J.legB, ...J.armF, ...J.armB].flat();
    let n = 0;
    for (const ex of Object.keys(DEMO)) for (let i = 0; i <= 400; i++) {
      const u = i / 400, a = flat(demoJoints(demoPose(DEMO[ex], u))), b = flat(ra.demoJoints(ra.demoPose(ra.DEMO[ex], u)));
      expect(a.length).toBe(b.length);
      a.forEach((v, k) => expect(Math.abs(v - b[k]), `${ex}, u = ${u}`).toBeLessThan(1e-9));
      n++;
    }
    expect(n).toBeGreaterThan(10000);
  });

  it('los mismos textos en cada ejercicio, modo y ajustes', () => {
    for (const o of OPTS) {
      cur.o = o;
      for (const ex of [...Object.keys(DEMO), 'zzz']) for (const mode of MODES) {
        const msg = `${ex} · ${mode} · ${JSON.stringify(o)}`;
        expect(demoTips(ex, mode, o), msg).toEqual({ ...ra.demoTips(ex, mode) });
        const a = demoInfo(ex, mode, o), b = ra.demoInfo(ex, mode);
        expect([a.what, a.foesKind], msg).toEqual([b.what, b.foesKind]);
      }
    }
  });

  it('el mismo dibujo, llamada a llamada', () => {
    let calls = 0;
    for (const [i, o] of OPTS.entries()) {
      if (i % 5) continue; // (unas cuantas combinaciones de ajustes: el dibujo es largo)
      cur.o = o;
      for (const ex of [...Object.keys(DEMO), 'zzz']) for (const mode of MODES) for (let t = 0; t < 10; t += 0.17) {
        const la: string[] = [], lb: string[] = [];
        demoDraw(recCtx(la), 640, 384, ex, mode, t, o);
        ra.demoDraw(recCtx(lb), 640, 384, ex, mode, t);
        if (la.join('\n') !== lb.join('\n')) expect(la, `${ex} · ${mode} · t = ${t} · ${JSON.stringify(o)}`).toEqual(lb);
        calls += la.length;
      }
    }
    expect(calls).toBeGreaterThan(1e6);
  }, 120000);
});
