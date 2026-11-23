/**
 * El dibujo de cada premio que sale de un cofre (src/ui/prize-path.ts): un medallón de color con su dibujo (la llave, la gema,
 * el tesoro, las monedas, el corazón, la mejora) y, debajo, lo que es («Llave 2/3», «+400»). Estilo cómic: colores lisos y
 * vivos con borde de tinta. Se pinta una vez al abrir el cofre (no en cada fotograma).
 */
import { FD, TAU, fitFont } from './canvas-kit.js';

export type PrizeIcon = 'key' | 'gem' | 'treasure' | 'coins' | 'heart' | 'perk';

/** Un premio: su dibujo, lo que dice y su color. */
export interface Prize {
  icon: PrizeIcon;
  text: string;
  color: string;
}

const INK = '#1a1030';

/** El medallón entero, en un lienzo de W × H (el medallón arriba, el texto debajo). */
export function drawPrize(c: CanvasRenderingContext2D, W: number, H: number, p: Prize): void {
  c.clearRect(0, 0, W, H);
  const cx = W / 2, cy = W / 2, R = W * 0.42;
  // el resplandor y el medallón
  const g = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.18);
  g.addColorStop(0, p.color + 'aa');
  g.addColorStop(1, p.color + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, W, W);
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.fillStyle = '#fff8e6';
  c.fill();
  c.lineWidth = W * 0.035;
  c.strokeStyle = INK;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, R * 0.86, 0, TAU);
  c.lineWidth = W * 0.04;
  c.strokeStyle = p.color;
  c.stroke();
  c.save();
  c.translate(cx, cy);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  ICONS[p.icon](c, R * 0.62, p.color);
  c.restore();
  // lo que es, debajo, con borde
  const y = W + (H - W) / 2;
  fitFont(c, p.text, W * 0.96, Math.round((H - W) * 0.8), '%px ' + FD);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = W * 0.035;
  c.strokeStyle = INK;
  c.strokeText(p.text, cx, y);
  c.fillStyle = '#fff';
  c.fillText(p.text, cx, y);
}

type Icon = (c: CanvasRenderingContext2D, r: number, col: string) => void;

const ink = (c: CanvasRenderingContext2D, fill: string, w: number): void => {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = w;
  c.strokeStyle = INK;
  c.stroke();
};

const ICONS: Record<PrizeIcon, Icon> = {
  // la llave: el ojo redondo, la caña y dos dientes
  key: (c, r) => {
    const w = r * 0.12;
    c.rotate(-Math.PI / 4);
    c.beginPath();
    c.rect(-r * 0.15, -r * 0.13, r * 1.1, r * 0.26);
    c.rect(r * 0.62, r * 0.1, r * 0.16, r * 0.3);
    c.rect(r * 0.84, r * 0.1, r * 0.13, r * 0.22);
    ink(c, '#ffc531', w);
    c.beginPath();
    c.arc(-r * 0.45, 0, r * 0.42, 0, TAU);
    c.arc(-r * 0.45, 0, r * 0.17, 0, TAU, true);
    ink(c, '#ffc531', w);
  },
  // la gema: tallada, con sus facetas
  gem: (c, r) => {
    const w = r * 0.1, t = -r * 0.45, m = -r * 0.1;
    c.beginPath();
    c.moveTo(-r * 0.55, t);
    c.lineTo(r * 0.55, t);
    c.lineTo(r * 0.9, m);
    c.lineTo(0, r * 0.9);
    c.lineTo(-r * 0.9, m);
    c.closePath();
    ink(c, '#3cd8ff', w);
    c.beginPath();
    c.moveTo(-r * 0.9, m);
    c.lineTo(r * 0.9, m);
    c.moveTo(-r * 0.2, t);
    c.lineTo(-r * 0.35, m);
    c.lineTo(0, r * 0.9);
    c.lineTo(r * 0.35, m);
    c.lineTo(r * 0.2, t);
    c.lineWidth = w * 0.6;
    c.strokeStyle = INK;
    c.stroke();
    c.beginPath();
    c.moveTo(-r * 0.45, t + r * 0.12);
    c.lineTo(-r * 0.6, m - r * 0.02);
    c.lineWidth = w * 0.8;
    c.strokeStyle = '#ffffff';
    c.stroke();
  },
  // el tesoro: un montón de monedas con una gema encima
  treasure: (c, r) => {
    ICONS.coins(c, r, '#ffc531');
    c.translate(0, -r * 0.55);
    ICONS.gem(c, r * 0.45, '#3cd8ff');
  },
  // las monedas (puntos): tres, una sobre otra
  coins: (c, r) => {
    const w = r * 0.1;
    for (const [x, y] of [[-r * 0.35, r * 0.3], [r * 0.35, r * 0.3], [0, -r * 0.1]]) {
      c.beginPath();
      c.ellipse(x, y, r * 0.42, r * 0.42, 0, 0, TAU);
      ink(c, '#ffc531', w);
      c.beginPath();
      c.ellipse(x, y, r * 0.24, r * 0.24, 0, 0, TAU);
      c.lineWidth = w * 0.6;
      c.strokeStyle = '#c98a00';
      c.stroke();
    }
  },
  // el corazón (una vida)
  heart: (c, r) => {
    c.beginPath();
    c.moveTo(0, r * 0.85);
    c.bezierCurveTo(-r * 1.1, r * 0.1, -r * 0.75, -r * 0.85, 0, -r * 0.35);
    c.bezierCurveTo(r * 0.75, -r * 0.85, r * 1.1, r * 0.1, 0, r * 0.85);
    ink(c, '#ff4f7b', r * 0.1);
  },
  // la mejora: una estrella de su color
  perk: (c, r, col) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.42 : r * 0.95;
      if (i) c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
      else c.moveTo(Math.cos(a) * k, Math.sin(a) * k);
    }
    c.closePath();
    ink(c, col, r * 0.1);
  },
};
