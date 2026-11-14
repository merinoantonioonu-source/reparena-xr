/**
 * El marcador pintado como en RepArena (src/60_ui.js: drawBoard, boardFrame, boardFuse, boardSay, boardTimes; diseño C
 * elegido por el usuario), en un lienzo de 1024 × 456 px (el panel mide 64 × 28,5 cm y se agranda al colocarlo). Antes era un
 * panel de UIKit, que colocaba el texto a su manera y lo dejaba salirse; aquí cada texto se encoge hasta caber.
 *  - Arriba: la oleada en puntos (con muchas, «3/12»), los puntos (en el relámpago, ×2, y el borde es una mecha que se
 *    consume) y las vidas; debajo, lo que llevas entrenando y, discreta, la hora (y tu pulso, si hay pulsómetro).
 *  - A la izquierda, el rosco doble (src/ui/board-ring.ts); a la derecha, un solo hueco para lo que pasa ahora y sus líneas.
 *  - Abajo a la derecha, tu rango con su escudo.
 * Solo dibuja: el juego le da lo que tiene que enseñar.
 */
import { FB, FD, fitFont, rr } from './canvas-kit.js';
import { glowText } from './ra/career-draw.js';
import { drawRank } from './ra/kit.js';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const BC = { teal: '#3cf0c6', pink: '#ff4fa3', gold: '#ffd166', lil: '#a49fc8', ink: '#eeeaff' };
/** El lienzo del marcador (los de RepArena: 1024 de ancho y la proporción del panel). */
export const BOARD_PX = 1024;

/** Lo que enseña el marcador. */
export interface BoardView {
  /** En plena ronda (si no, la portada: REPARENA, el modo y el ejercicio, y qué hacer). */
  playing: boolean;
  comic: boolean;
  /** Las oleadas (0: sin fin), la de ahora (0, 1, 2…) y si está en el descanso. */
  waves: number;
  wave: number;
  resting: boolean;
  score: number;
  /** El relámpago (×2) y lo que le queda (0-1). */
  rush: boolean;
  rushLeft: number;
  /** Las vidas (0: sin fin) y las que quedan. */
  lives: number;
  livesLeft: number;
  /** Lo que llevas entrenando («12:34»), la hora y tu pulso (con su color), si lo hay. */
  train: string;
  clock: string;
  hr: { bpm: number; col: string } | null;
  /** El rosco doble, ya pintado (un lienzo cuadrado). */
  ring: HTMLCanvasElement | null;
  /** Lo que pasa ahora (grande) y sus líneas; la primera, dorada si sube la dificultad. */
  msg: string;
  msgCol: string;
  lines: string[];
  line0Gold: boolean;
  /** Tu rango (nombre e índice, 0-6). */
  rank: string;
  rankIdx: number;
}

// el fondo: en cómic, violeta con trama de puntos, borde grueso de tinta y un filo claro; si no, oscuro con brillos
function frame(c: Ctx, W: number, H: number, comic: boolean): void {
  if (comic) {
    c.fillStyle = '#3a2d5c';
    rr(c, 0, 0, W, H, 30);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 10, r = 0; y < H; y += 16, r++)
      for (let x = (r % 2) * 8 + 10; x < W; x += 16) {
        c.beginPath();
        c.arc(x, y, 3, 0, TAU);
        c.fill();
      }
    c.restore();
    rr(c, 8, 8, W - 16, H - 16, 26);
    c.lineWidth = 14;
    c.strokeStyle = '#140c1a';
    c.stroke();
    rr(c, 20, 20, W - 40, H - 40, 18);
    c.lineWidth = 4;
    c.strokeStyle = '#fff4e0';
    c.stroke();
    return;
  }
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1b1338');
  g.addColorStop(0.55, '#0d0a20');
  g.addColorStop(1, '#190b27');
  c.fillStyle = g;
  rr(c, 0, 0, W, H, 30);
  c.fill();
  const e = c.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, BC.teal);
  e.addColorStop(1, BC.pink);
  c.strokeStyle = e;
  c.lineWidth = 4;
  rr(c, 8, 8, W - 16, H - 16, 26);
  c.stroke();
}

// el relámpago: el borde es una mecha que se consume (RepArena: boardFuse)
function fuse(c: Ctx, W: number, H: number, k: number, comic: boolean): void {
  const m = 8, w = W - 2 * m, h = H - 2 * m, per = 2 * (w + h), s = per * Math.max(0, Math.min(1, k));
  c.save();
  c.lineWidth = 10;
  c.strokeStyle = 'rgba(255,209,102,0.18)';
  rr(c, m, m, w, h, 26);
  c.stroke();
  c.setLineDash([s, per]);
  c.strokeStyle = BC.gold;
  if (!comic) {
    c.shadowColor = BC.gold;
    c.shadowBlur = 18;
  }
  rr(c, m, m, w, h, 26);
  c.stroke();
  c.setLineDash([]);
  let px: number, py: number;
  if (s < w) [px, py] = [m + s, m];
  else if (s < w + h) [px, py] = [m + w, m + s - w];
  else if (s < 2 * w + h) [px, py] = [m + w - (s - w - h), m + h];
  else [px, py] = [m, m + h - (s - 2 * w - h)];
  c.shadowColor = '#ffffff';
  c.shadowBlur = 22;
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(px, py, 9, 0, TAU);
  c.fill();
  c.restore();
}

// una frase grande a la derecha; si no cabe a buen tamaño, en dos líneas (RepArena: boardSay)
function say(c: Ctx, t: string, col: string, x: number, y: number, maxW: number, size: number): void {
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  const fs = fitFont(c, t, maxW, size, '%px ' + FD);
  if (fs >= 56 || t.indexOf(' ') < 0) {
    glowText(c, t, x, y, col, 12);
    return;
  }
  const sp = [...t.matchAll(/ /g)].map((m) => m.index ?? 0), mid = t.length / 2, cut = sp.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  const l1 = t.slice(0, cut), l2 = t.slice(cut + 1), f2 = Math.min(fitFont(c, l1, maxW, Math.min(size, 72), '%px ' + FD), fitFont(c, l2, maxW, Math.min(size, 72), '%px ' + FD));
  c.font = `${f2}px ${FD}`;
  glowText(c, l1, x, y - f2 * 0.58, col, 12);
  glowText(c, l2, x, y + f2 * 0.58, col, 12);
}

function stopwatch(c: Ctx, x: number, y: number, r: number, col: string): void {
  c.strokeStyle = col;
  c.fillStyle = col;
  c.lineWidth = r * 0.22;
  c.beginPath();
  c.arc(x, y + r * 0.1, r * 0.82, 0, TAU);
  c.stroke();
  c.fillRect(x - r * 0.2, y - r * 1.1, r * 0.4, r * 0.25);
  c.beginPath();
  c.moveTo(x, y + r * 0.1);
  c.lineTo(x + r * 0.35, y - r * 0.35);
  c.stroke();
}
function clockIcon(c: Ctx, x: number, y: number, r: number, col: string): void {
  c.strokeStyle = col;
  c.lineWidth = r * 0.22;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
  c.beginPath();
  c.moveTo(x, y - r * 0.6);
  c.lineTo(x, y);
  c.lineTo(x + r * 0.45, y + r * 0.2);
  c.stroke();
}
// bajo los puntos: lo que llevas entrenando y, discreta, la hora (RepArena: boardTimes)
function times(c: Ctx, cx: number, cy: number, t: string, k: string): void {
  c.textBaseline = 'middle';
  c.font = '700 40px ' + FB;
  const tw = c.measureText(t).width;
  c.font = '500 30px ' + FB;
  const kw = c.measureText(k).width, gap = 34, ic = 30, w = ic + 8 + tw + gap + ic * 0.8 + 6 + kw;
  let x = cx - w / 2;
  stopwatch(c, x + ic / 2, cy, ic * 0.5, BC.teal);
  x += ic + 8;
  c.textAlign = 'left';
  c.font = '700 40px ' + FB;
  c.fillStyle = BC.ink;
  c.fillText(t, x, cy + 2);
  x += tw + gap;
  clockIcon(c, x + ic * 0.4, cy, ic * 0.38, BC.lil);
  x += ic * 0.8 + 6;
  c.font = '500 30px ' + FB;
  c.fillStyle = BC.lil;
  c.fillText(k, x, cy + 2);
}

/** Pinta el marcador entero. */
export function drawBoard(c: Ctx, W: number, H: number, v: BoardView): void {
  c.clearRect(0, 0, W, H);
  frame(c, W, H, v.comic);
  c.textBaseline = 'middle';
  const RX = W - 44;
  if (!v.playing) {
    // la portada (RepArena: fuera de la ronda)
    c.textAlign = 'center';
    c.font = `90px ${FD}`;
    glowText(c, 'REPARENA', W / 2, 90, BC.pink, 22);
    c.fillStyle = BC.ink;
    const l0 = v.lines[0] ?? '';
    fitFont(c, l0, W - 120, 40, '500 %px ' + FB);
    c.fillText(l0, W / 2, 172);
    say(c, v.msg, v.msgCol, W / 2 + Math.min(W - 120, 600) / 2, 262, Math.min(W - 120, 600), 64);
    c.textAlign = 'center';
    c.fillStyle = BC.lil;
    for (let i = 1; i < v.lines.length; i++) {
      if (!v.lines[i]) continue;
      fitFont(c, v.lines[i], W - 120, 30, '500 %px ' + FB);
      c.fillText(v.lines[i], W / 2, 330 + (i - 1) * 40);
    }
    c.textAlign = 'right';
    c.font = '500 30px ' + FB;
    clockIcon(c, RX - c.measureText(v.clock).width - 26, 420, 11, BC.lil);
    c.fillStyle = BC.lil;
    c.fillText(v.clock, RX, 422);
    return;
  }
  if (v.rush) fuse(c, W, H, v.rushLeft, v.comic);
  // arriba: la oleada en puntos (o «3/12»), los puntos y las vidas
  const N = v.waves, wi = Math.max(0, v.wave - 1);
  c.textAlign = 'left';
  if (N > 0 && N <= 10) {
    for (let i = 0; i < N; i++) {
      const cx = 44 + i * 40, done = i < wi || (i === wi && v.resting);
      c.beginPath();
      c.arc(cx, 54, 13, 0, TAU);
      if (done) {
        c.fillStyle = BC.teal;
        c.fill();
      } else if (i === wi && v.wave) {
        c.lineWidth = 5;
        c.strokeStyle = BC.teal;
        c.stroke();
        c.beginPath();
        c.arc(cx, 54, 6, 0, TAU);
        c.fillStyle = BC.teal;
        c.fill();
      } else {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fill();
      }
    }
  } else {
    const t = N ? `${Math.min(Math.max(1, v.wave), N)}/${N}` : String(Math.max(1, v.wave));
    c.font = `48px ${FD}`;
    c.fillStyle = BC.teal;
    c.fillText('◉ ' + t, 32, 56);
  }
  c.textAlign = 'center';
  c.font = `60px ${FD}`;
  const sc = String(v.score);
  fitFont(c, sc, 300, 60, '%px ' + FD);
  glowText(c, sc, W / 2 + 40, 56, v.rush ? '#ffffff' : BC.gold, 16);
  if (v.rush) {
    c.textAlign = 'left';
    const sw = c.measureText(sc).width;
    c.font = `48px ${FD}`;
    glowText(c, '×2', W / 2 + 40 + sw / 2 + 22, 56, BC.gold, 14);
  }
  c.textAlign = 'right';
  if (!v.lives) {
    c.font = `52px ${FD}`;
    c.fillStyle = BC.teal;
    c.fillText('∞', RX + 4, 56);
  } else if (v.lives <= 8) {
    let s = '';
    for (let i = 0; i < v.lives; i++) s += i < v.livesLeft ? '♥' : '♡';
    fitFont(c, s, 280, 56, '%px ' + FB);
    glowText(c, s, RX + 4, 56, BC.pink, 10);
  } else {
    c.font = `52px ${FD}`;
    c.fillStyle = BC.pink;
    c.fillText(`♥ ${v.livesLeft}`, RX + 4, 56);
  }
  // tu pulso, a la derecha bajo las vidas
  if (v.hr) {
    const t = String(v.hr.bpm);
    c.save();
    c.textAlign = 'right';
    c.font = `46px ${FD}`;
    glowText(c, t, RX + 4, 118, v.hr.col, 10);
    const tw = c.measureText(t).width;
    c.translate(RX + 4 - tw - 34, 118);
    c.font = `40px ${FB}`;
    c.textAlign = 'center';
    glowText(c, '♥', 0, 2, v.hr.col, 12);
    c.restore();
  }
  times(c, W / 2 + 40, 118, v.train, v.clock);
  // a la izquierda, el rosco doble (con tus repeticiones en medio)
  if (v.ring) {
    const S = 345; // (el rosco de RepArena: 140 px de radio; en su lienzo, 104 de 256)
    c.drawImage(v.ring, 196 - S / 2, 272 - S / 2, S, S);
  }
  // a la derecha, un solo hueco para lo que pasa ahora, y sus líneas
  const lines = v.lines.filter(Boolean);
  if (v.msg) say(c, v.msg, v.msgCol, RX, lines.length ? 196 : 250, 560, lines.length ? 72 : 84);
  lines.forEach((t, i) => {
    c.textAlign = 'right';
    c.fillStyle = i === 0 && v.line0Gold ? BC.gold : BC.ink;
    fitFont(c, t, 560, 40, '600 %px ' + FB);
    c.fillText(t, RX, (v.msg ? 262 : 214) + i * 46);
  });
  // abajo a la derecha, el rango: su nombre y su galón
  c.textAlign = 'right';
  fitFont(c, v.rank, 300, 50, '%px ' + FD);
  const tw = c.measureText(v.rank).width;
  glowText(c, v.rank, RX, 404, BC.gold, 8);
  drawRank(c, v.rankIdx, RX - tw - 50, 400, 76, BC.gold);
}
