// Los paneles informativos pintados como en RepArena (src/ui/info-draw.ts, src/ui/board-draw.ts): con textos largos, todo lo
// que se escribe cabe en el panel (antes, en UIKit, el texto se salía). En un lienzo de mentira que mide 0,6 del tamaño de
// la letra por cada carácter.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drawCenter, drawCharge, drawToast, drawTrophy, drawWarn, drawWave } from '../../src/ui/info-draw.js';
import { drawBoard, type BoardView } from '../../src/ui/board-draw.js';

interface Txt { t: string; x: number; w: number; align: string }
function fakeCtx(out: Txt[]): CanvasRenderingContext2D {
  const props: Record<string | symbol, unknown> = { font: '10px x', textAlign: 'left' };
  const px = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(props.font))?.[1] ?? 10);
  const fns: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (t) => ({ width: String(t).length * px() * 0.6 }),
    fillText: (t, x) => { out.push({ t: String(t), x: Number(x), w: String(t).length * px() * 0.6, align: String(props.textAlign) }); },
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy({}, {
    get: (_, k) => (k in props ? props[k] : (...a: unknown[]) => (typeof k === 'string' && fns[k] ? fns[k](...a) : undefined)),
    set: (_, k, v) => { props[k] = v; return true; },
  }) as CanvasRenderingContext2D;
}
// lo que ocupa cada texto, de izquierda a derecha, dentro de [0, W]
function inside(out: Txt[], W: number): string[] {
  return out.filter((o) => {
    const l = o.align === 'center' ? o.x - o.w / 2 : o.align === 'right' ? o.x - o.w : o.x;
    return l < -0.5 || l + o.w > W + 0.5;
  }).map((o) => o.t);
}
const LONG = 'Mantén la espalda recta y baja despacio hasta que los muslos queden paralelos al suelo, sin prisa';

describe('los paneles informativos, como en RepArena', () => {
  beforeAll(() => { vi.stubGlobal('document', { createElement: () => ({ getContext: () => fakeCtx([]) }) }); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('el aviso breve, el del suelo, la carga, la oleada y el logro: el texto largo cabe', () => {
    for (const [W, H, f] of [
      [1024, 165, (c: CanvasRenderingContext2D) => drawToast(c, 1024, 165, LONG, '#ff8a3d')],
      [1024, 269, (c: CanvasRenderingContext2D) => drawWarn(c, 1024, 269, LONG, '#ff8a3d')],
      [768, 209, (c: CanvasRenderingContext2D) => drawCharge(c, 768, 209, '×4 · ¡ARRIBA DEL TODO YA!', '#ffd166')],
      [1024, 427, (c: CanvasRenderingContext2D) => drawWave(c, 1024, 427, '¡ÚLTIMA OLEADA DE TODAS!', '123456 puntos', LONG, '#ff8a3d')],
      [1024, 344, (c: CanvasRenderingContext2D) => drawTrophy(c, 1024, 344, '¡NUEVO RÉCORD DE REPETICIONES!', LONG, '#ffd166')],
    ] as [number, number, (c: CanvasRenderingContext2D) => void][]) {
      const out: Txt[] = [];
      f(fakeCtx(out));
      expect(out.length).toBeGreaterThan(0);
      expect(inside(out, W), `${H}`).toEqual([]);
    }
  });
  it('el aviso largo del suelo se parte en dos líneas', () => {
    const out: Txt[] = [];
    drawWarn(fakeCtx(out), 1024, 269, '¡Baja más, hasta abajo del todo!', '#ff8a3d');
    expect(out.length).toBe(2);
  });
  it('el del centro (calibrar, colocarse) y el marcador: todo dentro', () => {
    const out: Txt[] = [];
    drawCenter(fakeCtx(out), 1024, 410, { kind: 'calib', title: 'COLOCAR LAS PARALELAS AHORA MISMO', lines: [LONG, LONG], note: ['manos y cuerpo detectados', '#3cf0c6'], status: [LONG, '#ff8a3d'], count: '3', bar: 0.4 });
    expect(inside(out, 1024)).toEqual([]);
    const v: BoardView = { playing: true, comic: true, waves: 5, wave: 2, resting: false, score: 1234567, rush: true, rushLeft: 0.5, lives: 3, livesLeft: 2, train: '12:34', clock: '18:05', hr: { bpm: 142, col: '#ff3b5c' }, ring: null, msg: '¡GENIAL! COMBO DE DIEZ REPETICIONES SEGUIDAS', msgCol: '#ffd166', lines: [LONG, LONG, LONG], line0Gold: true, rank: 'TENIENTE CORONEL', rankIdx: 4 };
    const o2: Txt[] = [];
    drawBoard(fakeCtx(o2), 1024, 456, v);
    expect(inside(o2, 1024).filter((t) => t !== '♥')).toEqual([]); // (el corazón del pulso se pinta trasladado: el lienzo de mentira no lo sigue)
    const o3: Txt[] = [];
    drawBoard(fakeCtx(o3), 1024, 456, { ...v, playing: false, msg: 'PULSA EMPEZAR EN EL MENÚ DE LA MUÑECA', lines: ['Combate · Sentadillas con salto', LONG] });
    expect(inside(o3, 1024)).toEqual([]);
  });
});
