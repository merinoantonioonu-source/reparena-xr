/**
 * La ficha del resumen de la ronda de RepArena (src/70_game.js: summaryDraw, SUM_H, SUM_CHIP), portada tal cual (opción A,
 * lo esencial): una línea con dónde acabó la ronda y el ejercicio; el número grande (repeticiones), la medalla y el
 * porcentaje de perfectas; tres casillas (puntos, tiempo y kcal) y, si hay, un solo logro, el más importante.
 */
import type { Summary } from '../../core/run.js';
import { FB, FD, fitFont, rr, TAU } from '../canvas-kit.js';
import { drawMedal } from './kit.js';

/** El alto de la ficha, en metros, y lo que añade el logro. */
export const SUM_H = 0.3, SUM_CHIP = 0.05;

/** Pinta la ficha del resumen S en el hueco (x, y, w, h) del lienzo c (con el logro, h incluye su franja). */
export function drawSummary(S: Summary, c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const gold = '#ffd166', teal = '#3cf0c6', ink = '#eeeaff', dim = '#a49fc8', chip = S.chip, H = h - (chip ? (h * SUM_CHIP) / (SUM_H + SUM_CHIP) : 0);
  // RepArena llevaba S.win y S.manual; aquí lo dice el título (¡VICTORIA!, RESUMEN si la terminaste tú, o DERROTA)
  const win = S.title === '¡VICTORIA!', manual = S.title === 'RESUMEN';
  // (en RepArena, colgado no había porcentaje: pct null; aquí siempre lo hay, pero se deja el caso por si llega)
  const pct: number | null = S.pct;
  c.textBaseline = 'middle';
  // la línea: «Oleada 1 de 5» (en su color) · el ejercicio
  const a = S.sub, b = S.where ? '  ·  ' + S.where : '';
  c.font = '600 34px ' + FB;
  const wa = c.measureText(a).width;
  c.font = '500 34px ' + FB;
  const wb = c.measureText(b).width;
  const fs = Math.min(34, Math.floor((34 * (w - 40)) / (wa + wb))), x0 = x + (w - ((wa + wb) * fs) / 34) / 2, ly = y + H * 0.08;
  c.textAlign = 'left';
  c.font = `600 ${fs}px ${FB}`;
  c.fillStyle = win ? teal : manual ? ink : '#ff8a8a';
  c.fillText(a, x0, ly);
  c.font = `500 ${fs}px ${FB}`;
  c.fillStyle = dim;
  c.fillText(b, x0 + (wa * fs) / 34, ly);
  c.textAlign = 'center';
  // el número grande, con su brillo
  const hy = y + H * 0.17, hh = H * 0.54;
  rr(c, x + 10, hy, w - 20, hh, 26);
  c.fillStyle = 'rgba(255,209,102,0.07)';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,209,102,0.35)';
  c.stroke();
  const nx = x + w * 0.3;
  c.save();
  c.shadowColor = gold;
  c.shadowBlur = 24;
  c.fillStyle = gold;
  fitFont(c, String(S.got), w * 0.42, Math.round(hh * 0.62), '%px ' + FD);
  c.fillText(String(S.got), nx, hy + hh * 0.43);
  c.restore();
  c.fillStyle = ink;
  fitFont(c, S.unit, w * 0.42, 32, '500 %px ' + FB);
  c.fillText(S.unit, nx, hy + hh * 0.82);
  // la medalla conseguida (oro, plata o bronce, con su cinta) y las perfectas; sin medalla, su hueco vacío
  const sx = x + w * 0.72, mR = hh * 0.18, my = hy + hh * 0.42;
  if (S.medal) drawMedal(c, S.medal, sx, my, mR);
  else {
    c.setLineDash([10, 8]);
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.arc(sx, my, mR, 0, TAU);
    c.stroke();
    c.setLineDash([]);
  }
  if (pct !== null) {
    const bw = w * 0.36, bx = sx - bw / 2, by = hy + hh * 0.68;
    rr(c, bx, by, bw, 18, 9);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    if (pct > 0) {
      rr(c, bx, by, Math.max(18, (bw * pct) / 100), 18, 9);
      c.fillStyle = teal;
      c.fill();
    }
    c.fillStyle = ink;
    fitFont(c, `${pct} % perfectas`, bw, 32, '600 %px ' + FB);
    c.fillText(`${pct} % perfectas`, sx, hy + hh * 0.87);
  } else {
    c.fillStyle = ink;
    c.font = '600 32px ' + FB;
    c.fillText(win ? '¡Aguantaste!' : '¡Sigue así!', sx, hy + hh * 0.72);
  }
  // tres casillas: puntos, tiempo y kcal
  const gy = hy + hh + H * 0.05, gap = 12, n = S.tiles.length, tw = (w - 20 - gap * (n - 1)) / n, th = y + H - gy;
  S.tiles.forEach(([v, l], k) => {
    const tx = x + 10 + k * (tw + gap);
    rr(c, tx, gy, tw, th, 18);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fill();
    c.fillStyle = ink;
    fitFont(c, String(v), tw - 30, Math.round(th * 0.42), '700 %px ' + FB);
    c.fillText(String(v), tx + tw / 2, gy + th * 0.4);
    c.fillStyle = dim;
    fitFont(c, l, tw - 30, Math.round(th * 0.26), '500 %px ' + FB);
    c.fillText(l, tx + tw / 2, gy + th * 0.76);
  });
  // el logro más importante (récord, nivel nuevo, racha…), uno solo
  if (chip) {
    const [t, col] = chip, cy = y + H + (h - H) * 0.55;
    c.font = '600 30px ' + FB;
    const cw = Math.min(w - 20, c.measureText(t).width + 50), cx = x + (w - cw) / 2;
    rr(c, cx, cy - 25, cw, 50, 25);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = col;
    c.stroke();
    c.fillStyle = col;
    fitFont(c, t, cw - 30, 30, '600 %px ' + FB);
    c.fillText(t, x + w / 2, cy);
  }
}
