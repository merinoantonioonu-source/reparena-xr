// La caja negra y su reproductor: lo que se graba en las gafas, pasado otra vez por el detector, da lo mismo (si no, la
// captura no serviría para buscar el fallo). Y las capturas del usuario (tests/replay/capturas/*.txt) se reproducen igual.
// Para ver una captura: CAPTURA=ruta/al/archivo.txt npm run replay (imprime cada suceso, grabado y reproducido).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { BB, bbParse, bbSave, eventToken, type BBCapture } from '../../src/core/blackbox.js';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, standDefaults, type StandEvent } from '../../src/exercise/standing.js';
import { mismatches, replay, splitCaptures, table } from './replay.js';

const DT = 13889e-6; // (72 imágenes por segundo, en microsegundos exactos: así el texto no redondea nada)
const q = (v: number): number => Math.round(v * 1e4) / 1e4; // (las posiciones, en décimas de milímetro, como en el texto)

/** Una sesión de mentira grabada en la caja negra: la cabeza quieta y las dos manos según `pos(t)` (null: no se ven). */
function session(ex: string, secs: number, pos: (t: number) => { l: [number, number, number] | null; r: [number, number, number] | null; y?: number }, resetAt = 0) {
  BB.clear();
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new Vector3(0, 1.6, 0), speed: 0 };
  const det = new StandingDetector(), cfg = standDefaults(ex), out: StandEvent[] = [], live: string[] = [];
  const I = { hands, head, fwd: new Vector3(0, 0, -1), play: true };
  BB.markCfg(0, cfg);
  const n = Math.round(secs / DT);
  for (let k = 1; k <= n; k++) {
    const t = Math.round(k * DT * 1e6) / 1e6, p = pos(t), prevY = head.p.y;
    if (k === resetAt) {
      det.reset(head.p.y);
      BB.markReset(head.p.y);
    }
    head.p.y = q(p.y ?? 1.6);
    head.speed = Math.round((Math.abs(head.p.y - prevY) / DT) * 1000) / 1000;
    for (const s of ['left', 'right'] as const) {
      const w = s === 'left' ? p.l : p.r, h = hands[s];
      h.ok = !!w;
      h.isHand = true;
      if (w) h.wrist.set(q(head.p.x + w[0]), q(head.p.y + w[1]), q(head.p.z + w[2]));
    }
    out.length = 0;
    det.update(t, DT, I, cfg, out);
    for (const e of out) live.push(`${k}:${eventToken(e)}`);
    BB.rec(t, DT, hands, head, true, det, ex, out, null);
  }
  return { text: BB.text('prueba', 'cabecera de prueba'), live };
}

// curls con la kettlebell (las manos juntas): cada 3 s, subir 0,8 s, arriba 0,3 s, bajar 0,8 s; con un dato suelto 25 cm
// más bajo a los 4,0 s y las manos perdidas entre 7,4 y 7,9 s (para que también haya sucesos raros)
const kb = (t: number) => {
  const c = t % 3, k = c < 0.8 ? c / 0.8 : c < 1.1 ? 1 : c < 1.9 ? 1 - (c - 1.1) / 0.8 : 0, e = k * k * (3 - 2 * k), y = -0.78 + 0.32 * e;
  if (t > 7.4 && t < 7.9) return { l: null, r: null };
  const glitch = Math.abs(t - 4.0) < DT / 2 ? -0.25 : 0;
  return { l: [-0.04, y + glitch, -0.15] as [number, number, number], r: [0.04, y + glitch, -0.15] as [number, number, number] };
};

describe('caja negra → texto → reproductor', () => {
  beforeEach(() => BB.clear());

  it('una sesión corta (con el detector de cero) se reproduce exactamente igual', () => {
    const s = session('curl2', 15, kb, 1);
    const r = replay(s.text);
    expect(r.from).toBe(0);
    expect(r.replayed.map((e) => `${e.i + 1}:${e.tok}`)).toEqual(s.live);
    expect(r.recorded.map((e) => e.tok)).toEqual(r.replayed.map((e) => e.tok));
    expect(s.live.filter((e) => /:[rR]/.test(e)).length).toBeGreaterThanOrEqual(4);
  });

  it('el texto guarda lo que hace falta: las manos, el detector, los sucesos y los ajustes', () => {
    const s = session('curl2', 3, kb, 1), p = bbParse(s.text);
    expect(p.ex).toBe('curl2');
    expect(p.cfgs[0].cfg.curlRange).toBe(27);
    expect(p.frames.length).toBe(Math.round(3 / DT));
    expect(p.frames[0].reset).toBe(1.6);
    const f = p.frames[50];
    expect(f.hands.left.ok && f.hands.left.isHand).toBe(true);
    expect(f.st).toMatch(/^[drht]$/);
    expect(f.det[1]).toBeCloseTo(-0.78, 1); // (bottom, en metros)
  });

  it('una sesión larga se queda en los últimos 25 s y se reproduce desde ahí, colocando el detector como estaba', () => {
    const s = session('curl2', 40, kb, 1);
    const r = replay(s.text);
    expect(r.frames.length).toBeLessThanOrEqual(Math.ceil(25 / DT) + 1);
    expect(r.from).toBe(1);
    const m = mismatches(r);
    expect(m.recorded).toEqual([]);
    expect(m.replayed).toEqual([]);
  });

  it('también el curl a un brazo y la elevación frontal', () => {
    for (const ex of ['curl', 'fraise']) {
      const s = session(ex, 12, (t) => {
        const c = t % 3, k = c < 0.8 ? c / 0.8 : c < 1.1 ? 1 : c < 1.9 ? 1 - (c - 1.1) / 0.8 : 0, e = k * k * (3 - 2 * k);
        return ex === 'curl' ? { l: [-0.2, -0.78 + 0.32 * e, -0.1], r: [0.2, -0.78 + 0.32 * e, -0.1] } : { l: [-0.04, -0.85 + 0.62 * e, -0.15 - 0.5 * e], r: [0.04, -0.85 + 0.62 * e, -0.15 - 0.5 * e] };
      }, 1);
      const r = replay(s.text);
      expect(r.replayed.map((e) => `${e.i + 1}:${e.tok}`), ex).toEqual(s.live);
      expect(s.live.length, ex).toBeGreaterThan(0);
    }
  });

  it('se guarda junto al diagnóstico: solo si hay algo nuevo y como mucho las 3 últimas', () => {
    let saved: BBCapture[] = [];
    session('curl2', 2, kb, 1);
    for (let k = 0; k < 5; k++) {
      BB.fresh = 1; // (como si se hubiera jugado algo más)
      saved = bbSave(`vez ${k}`, 'h', k, () => saved, (v) => (saved = v));
    }
    expect(saved.map((c) => c.reason)).toEqual(['vez 2', 'vez 3', 'vez 4']);
    expect(bbSave('otra', 'h', 9, () => saved, (v) => (saved = v))).toHaveLength(3); // (nada nuevo: no se guarda otra)
    expect(saved.at(-1)!.ex).toBe('curl2');
  });
});

// las capturas de las gafas: reproducidas, los mismos sucesos que se grabaron (si no, la caja negra no basta para buscar
// el fallo). Se guardan aquí con un nombre que diga qué pasó (ver LEEME.md)
const DIR = join(__dirname, 'capturas');
// (capturas grabadas con «Manos: filtro nuevo» encendido cuando aún no valía para estos ejercicios: se reproducen sin él;
// 'antes': grabadas con una versión anterior del filtro, que ya no se puede reproducir igual: solo se comprueba que se leen
// y se reproducen; lo que hace el filtro de ahora con ellas lo prueban curl-robusto.test.ts y curl2-robusto.test.ts)
const BEFORE: Record<string, string[] | 'antes'> = { 'curl-mancuerna-rayo-al-llegar-arriba.txt': ['curl'], 'curl-mancuerna-sin-bola-y-rayos-escondida.txt': 'antes' };
const files = readdirSync(DIR).filter((f) => f.endsWith('.txt'));
describe.runIf(files.length)('capturas de las gafas', () => {
  for (const f of files)
    splitCaptures(readFileSync(join(DIR, f), 'utf8')).forEach((text, k) => {
      it(`${f} (${k + 1}): reproducida, los mismos sucesos`, () => {
        const b = BEFORE[f], old = Array.isArray(b) && b.includes(bbParse(text).ex), r = replay(text, old ? { cfg: (c) => ({ ...c, robust: false }) } : {});
        if (b === 'antes') return void expect(r.frames.length).toBeGreaterThan(100);
        const m = mismatches(r);
        expect(m.recorded).toEqual([]);
        expect(m.replayed).toEqual([]);
      });
    });
});

// CAPTURA=archivo npm run replay: imprime la reproducción de cada captura del archivo (con ROBUSTO=1, la del filtro nuevo de
// las manos, «Manos: filtro nuevo», frente a lo que se grabó)
const CAPTURA = process.env.CAPTURA, ROBUSTO = !!process.env.ROBUSTO;
describe.runIf(!!CAPTURA)('reproducir CAPTURA', () => {
  it('imprime los sucesos', () => {
    for (const text of splitCaptures(readFileSync(CAPTURA!, 'utf8'))) {
      const r = replay(text, ROBUSTO ? { cfg: (c) => ({ ...c, robust: true }) } : {}), m = mismatches(r);
      console.log(`${table(r)}\n\nNo casan: grabados ${JSON.stringify(m.recorded)} · reproducidos ${JSON.stringify(m.replayed)}\n`);
    }
  });
});
