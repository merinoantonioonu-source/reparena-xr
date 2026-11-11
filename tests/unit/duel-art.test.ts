// La ilustración de la carátula del duelo (src/ui/duel-art.ts) sobre un lienzo de mentira: con cada postura, cada jefe
// (y sin jefe) y cada cosa de en medio, se pinta entera, por partes, sin fallar; y la carátula y las placas, también.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DuelBoss, DuelDraw, DuelPose, DuelWhat } from '../../src/combat/duel.js';
import { duelDeco, duelPaint, duelPlates } from '../../src/ui/duel-art.js';

// un contexto 2D que acepta cualquier cosa (y cuenta lo que se le pide); los degradados, de mentira; los textos miden 10 px por letra
let calls = 0;
const bad: string[] = [];
function fakeCtx(): CanvasRenderingContext2D {
  const t: Record<string | symbol, unknown> = {
    measureText: (s: string) => ({ width: String(s).length * 10 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: (...a: number[]) => { if (a.some((v) => !Number.isFinite(v)) || a[2] < 0 || a[5] < 0) bad.push('radial ' + a.join(',')); return { addColorStop() {} }; },
  };
  return new Proxy(t, {
    get: (o, k) => (k in o ? o[k] : (o[k] = (...a: unknown[]) => { calls++; if (a.some((v) => typeof v === 'number' && !Number.isFinite(v))) bad.push(String(k)); })),
  }) as unknown as CanvasRenderingContext2D;
}
const fakeCanvas = (w = 8, h = 8) => { const g = fakeCtx(); return { width: w, height: h, getContext: () => g } as unknown as HTMLCanvasElement; };

beforeAll(() => vi.stubGlobal('document', { createElement: () => fakeCanvas() }));
afterAll(() => vi.unstubAllGlobals());

const POSES: DuelPose[] = ['squat', 'deep', 'lunge', 'plank', 'hang', 'reach'];
const DRAWS: (DuelDraw | null)[] = ['yeti', 'zombie', 'demon', 'cyclops', 'robot', 'spider', 'crab', 'skull', 'dragon', 'mace', 'tentacle', null];
const WHATS: DuelWhat[] = ['bolt', 'arcs', 'bubble', 'diamond', 'rings', ''];

describe('la carátula del duelo', () => {
  it('se pinta entera, por partes, con cada postura, cada jefe y cada cosa de en medio', () => {
    for (const pose of POSES) for (const boss of DRAWS) for (const what of WHATS) {
      const g = fakeCtx(), c0 = calls;
      let steps = 0;
      for (const _ of duelPaint(g, 960, 540, { pose, boss, what })) steps++;
      expect(steps, `${pose} ${boss} ${what}`).toBe(4);
      expect(calls - c0).toBeGreaterThan(500);
    }
    expect(bad).toEqual([]);
  });
  it('la carátula (el VS y el título) y las placas de los dos', () => {
    const art = fakeCanvas(960, 540), card = fakeCanvas(1280, 720);
    duelDeco(card.getContext('2d')!, 1280, 720, art, 'SENTADILLAS', 'COMBATE · PIERNAS');
    const boss: DuelBoss = { draw: 'robot', name: 'El titán', note: 'Jefe de la oleada 5', bars: [['Resistencia', 0.5, '12'], ['Fuerza', 0.34, '1 vida'], ['Dureza', 0.5, '2/4']] };
    for (const [nWaves, lives, rN] of [[5, 3, 18], [0, 0, null], [1, 5, 10]] as [number, number, number | null][])
      duelPlates(fakeCtx(), 1280, 720, card, { rank: 'Cabo', record: 'Récord: 40 reps', nWaves, lives, r0: 10, rN, unit: 'Reps', boss });
    duelPlates(fakeCtx(), 1280, 720, card, { rank: 'Recluta', record: '', nWaves: 0, lives: 0, r0: 30, rN: null, unit: 'Segundos', boss: { draw: null, name: 'Los arcos', note: 'Agáchate a tiempo', bars: [] } });
    expect(bad).toEqual([]);
  });
});
