/**
 * Los paneles informativos pintados como en RepArena (pedido del usuario: con su letra y sin que el texto se salga; antes
 * eran paneles de UIKit, que colocan el texto a su manera y lo dejaban salirse del panel). Cada uno, un lienzo del mismo
 * tamaño que tenía en RepArena (y que el de UIKit al que sustituye), y su texto se encoge hasta caber (`fitFont`):
 *  - el aviso breve de la vista (src/60_ui.js: showToast), el aviso en el suelo (warnFloor), la carga en el suelo
 *    (chargeFloor), el panel entre oleadas (src/70_game.js: waveIntro) y el logro en grande (drawTrophy).
 * Solo dibujan: quien los usa los coloca y los enseña.
 */
import { FB, FD, fitFont, rr } from './canvas-kit.js';

type Ctx = CanvasRenderingContext2D;

/** El aviso breve (0,62 × 0,1 m): lo que pide hacer algo ya, en una píldora (RepArena: showToast). */
export function drawToast(c: Ctx, W: number, H: number, text: string, color: string): void {
  c.clearRect(0, 0, W, H);
  rr(c, 4, 4, W - 8, H - 8, H / 2 - 4);
  c.fillStyle = 'rgba(14,10,28,0.72)';
  c.fill();
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  fitFont(c, text, W - 70, 104, '%px ' + FD);
  c.fillText(text, W / 2, H / 2 + 4);
}

/** El aviso de lo que se hace mal, en el suelo (1,6 × 0,42 m): en una o dos líneas, lo más grande que quepa (RepArena: warnFloor). */
export function drawWarn(c: Ctx, W: number, H: number, text: string, color: string): void {
  c.clearRect(0, 0, W, H);
  rr(c, 8, 8, W - 16, H - 16, 40);
  c.fillStyle = 'rgba(14,8,10,0.82)';
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = color;
  c.stroke();
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const words = text.split(' ');
  let lines = [text];
  c.font = `110px ${FD}`;
  if (c.measureText(text).width > W - 90 && words.length > 1) {
    // (partido por la palabra que deja las dos mitades más parecidas)
    let best = 1;
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - text.length / 2) < Math.abs(words.slice(0, best).join(' ').length - text.length / 2)) best = i;
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const fs = Math.min(
    lines.length > 1 ? 92 : 120,
    ...lines.map((l) => {
      c.font = `100px ${FD}`;
      return Math.floor((100 * (W - 90)) / Math.max(1, c.measureText(l).width));
    }),
  );
  c.font = `${fs}px ${FD}`;
  lines.forEach((l, i) => c.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * fs * 1.05 + 6));
}

/** La carga del disparo, en el suelo (1,1 × 0,3 m): «CARGA ×2», «×4 · ¡ARRIBA!» (RepArena: chargeFloor). */
export function drawCharge(c: Ctx, W: number, H: number, text: string, color: string): void {
  c.clearRect(0, 0, W, H);
  rr(c, 8, 8, W - 16, H - 16, 36);
  c.fillStyle = 'rgba(10,8,18,0.8)';
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = color;
  c.stroke();
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  fitFont(c, text, W - 70, 120, '%px ' + FD);
  c.fillText(text, W / 2, H / 2 + 6);
}

/** El panel entre oleadas (1,2 × 0,5 m): la oleada que empieza, tus puntos y lo nuevo (RepArena: waveIntro). */
export function drawWave(c: Ctx, W: number, H: number, t1: string, t2: string, t3: string, t3Color: string): void {
  c.clearRect(0, 0, W, H);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  rr(c, 8, 8, W - 16, H - 16, 40);
  c.fillStyle = 'rgba(14,10,28,0.82)';
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(255,209,102,0.7)';
  c.stroke(); // (un panel, no letras sueltas)
  fitFont(c, t1, W - 60, 120, '%px ' + FD);
  c.save();
  c.shadowColor = '#ffd166';
  c.shadowBlur = 30;
  c.fillStyle = '#ffd166';
  c.fillText(t1, W / 2, H * 0.3);
  c.restore();
  fitFont(c, t2, W - 80, 84, '%px ' + FD);
  c.fillStyle = '#eeeaff';
  c.fillText(t2, W / 2, H * 0.62);
  if (t3) {
    fitFont(c, t3, W - 80, 48, '600 %px ' + FB);
    c.fillStyle = t3Color;
    c.fillText(t3, W / 2, H * 0.87);
  }
}

/** El logro en grande (1,25 × 0,42 m): dorado, con una estrella a cada lado (RepArena: drawTrophy). */
export function drawTrophy(c: Ctx, W: number, H: number, title: string, sub: string, color: string): void {
  c.clearRect(0, 0, W, H);
  rr(c, 10, 10, W - 20, H - 20, 46);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(48,30,8,0.94)');
  g.addColorStop(1, 'rgba(20,12,4,0.94)');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 12;
  c.strokeStyle = color;
  c.stroke();
  rr(c, 28, 28, W - 56, H - 56, 32);
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,240,200,0.6)';
  c.stroke();
  const star = (x: number, y: number, r: number): void => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r2 = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
    }
    c.closePath();
    c.fillStyle = color;
    c.fill();
  };
  star(H * 0.36, H * 0.5, H * 0.2);
  star(W - H * 0.36, H * 0.5, H * 0.2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = color;
  fitFont(c, title, W - H * 1.3, Math.round(H * (sub ? 0.36 : 0.44)), '%px ' + FD);
  c.fillText(title, W / 2, H * (sub ? 0.4 : 0.52));
  if (sub) {
    c.fillStyle = '#fff3d6';
    fitFont(c, sub, W - H * 1.2, Math.round(H * 0.19), '600 %px ' + FB);
    c.fillText(sub, W / 2, H * 0.75);
  }
}

/** La barra de abajo del aviso del centro (lo que llevas quieto, la cuenta…) (RepArena: centerBar). */
function centerBar(c: Ctx, W: number, H: number, frac: number, color = '#3cf0c6'): void {
  c.fillStyle = '#2f2853';
  rr(c, 44, H - 66, W - 88, 22, 11);
  c.fill();
  c.fillStyle = color;
  rr(c, 44, H - 66, Math.max(22, (W - 88) * Math.max(0, Math.min(1, frac))), 22, 11);
  c.fill();
}

/** Lo que dice el aviso del centro (el de la partida: src/core/state.ts, CenterInfo). */
export interface CenterDraw {
  kind: 'calib' | 'ready';
  title: string;
  lines: string[];
  note: [string, string] | null;
  status: [string, string] | null;
  count: string;
  bar: number;
}

/** El aviso del centro (0,75 × 0,3 m; RepArena: 0,5 × 0,2 a escala 1,5): calibrar, colocarse en la barra, la cuenta…;
 * cada línea, encogida hasta caber (RepArena: drawCenter). */
export function drawCenter(c: Ctx, W: number, H: number, d: CenterDraw): void {
  c.clearRect(0, 0, W, H);
  rr(c, 6, 6, W - 12, H - 12, 30);
  c.fillStyle = 'rgba(14,10,28,0.86)';
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(60,240,198,.6)';
  c.stroke();
  c.textBaseline = 'middle';
  if (d.kind !== 'calib') {
    // ¡PREPÁRATE! y la cuenta, grandes y en medio
    c.textAlign = 'center';
    c.fillStyle = '#ffd166';
    fitFont(c, d.title, W - 88, 56, '%px ' + FD);
    c.fillText(d.title, W / 2, 80);
    if (d.count) {
      c.fillStyle = '#ffffff';
      fitFont(c, d.count, W - 88, 120, '%px ' + FD);
      c.fillText(d.count, W / 2, 230);
    }
    return;
  }
  const countW = d.count ? 150 : 0;
  // a la derecha de arriba, lo que ve el juego («manos detectadas», «en posición»…)
  let noteW = 0;
  if (d.note) {
    c.textAlign = 'right';
    c.fillStyle = d.note[1];
    fitFont(c, d.note[0], (W - 88) * 0.45, 32, '%px ' + FB);
    noteW = c.measureText(d.note[0]).width + 24;
    c.fillText(d.note[0], W - 44, 68);
  }
  c.textAlign = 'left';
  c.fillStyle = '#3cf0c6';
  fitFont(c, d.title, W - 88 - noteW, 50, '%px ' + FD);
  c.fillText(d.title, 44, 68);
  c.fillStyle = '#eeeaff';
  d.lines.slice(0, 2).forEach((l, i) => {
    fitFont(c, l, W - 88 - countW, 40, '500 %px ' + FB);
    c.fillText(l, 44, 148 + i * 52);
  });
  if (d.status) {
    c.fillStyle = d.status[1];
    fitFont(c, d.status[0], W - 88, 34, '500 %px ' + FB);
    c.fillText(d.status[0], 44, 258);
  }
  if (d.count) {
    c.textAlign = 'right';
    c.fillStyle = '#ffffff';
    fitFont(c, d.count, countW, 110, '%px ' + FD);
    c.fillText(d.count, W - 50, 150);
  }
  centerBar(c, W, H, d.bar);
}
