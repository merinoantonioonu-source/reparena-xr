/**
 * Las piezas de dibujo de los menús de RepArena (src/30_env.js: makePanel; src/60_ui.js: STY, MC, KEYC, drawIcon, drawRank,
 * drawMedal, drawFoeCard), portadas tal cual: los menús son los de RepArena enteros (opción B del usuario, PR 31). Todo se
 * pinta en lienzos (con las letras de public/fonts) y se ve como planos con su textura.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { FOE_PIC } from '../../core/catalog.js';
import { settings } from '../../core/values.js';
import { clamp, FB, fitFont, mkCanvas, TAU } from '../canvas-kit.js';

/** Un panel pintado (RepArena: makePanel): su lienzo (W × H píxeles «lógicos»; con hd, más píxeles de verdad) y su plano. */
export interface RaPanel {
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mesh: Mesh;
  w: number;
  h: number;
  W: number;
  H: number;
}

/** Un plano de w × h metros con un lienzo de px de ancho (hd: más resolución, con el mismo dibujo). Escribe su profundidad
 * (lo transparente del lienzo, no): las gafas recolocan cada imagen según la profundidad de cada punto, y un panel sin ella
 * temblaba como si estuviera al fondo. */
export function makePanel(w: number, h: number, px = 1024, opts: { depthTest?: boolean; depthWrite?: boolean; hd?: number } = {}): RaPanel {
  const k = opts.hd || 1, c = mkCanvas(Math.round(px * k), Math.round((px * k * h) / w)), ctx = c.getContext('2d')!, tex = new CanvasTexture(c);
  if (k !== 1) ctx.scale(k, k);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthTest: opts.depthTest !== false, depthWrite: opts.depthWrite !== false, alphaTest: 0.04, toneMapped: false, fog: false });
  const m = new Mesh(new PlaneGeometry(w, h), mat);
  m.userData.noInk = true; // (sin contorno de tinta: es un cartel)
  if (opts.depthTest === false) m.renderOrder = 30;
  return { c, ctx, tex, mesh: m, w, h, W: Math.round(c.width / k), H: Math.round(c.height / k) };
}

/** Libera un panel (su lienzo, su material y su plano). */
export function freePanel(p: RaPanel): void {
  p.tex.dispose();
  (p.mesh.material as MeshBasicMaterial).dispose();
  p.mesh.geometry.dispose();
}

// ---------------------------------------------------------------- los colores

/** Los estilos de las teclas de relieve (fondo, letra, borde). */
export const STY: Record<string, [string, string, string | null]> = {
  normal: ['#211a3f', '#eeeaff', '#3cf0c6'],
  primary: ['#ff4fa3', '#1a0716', null],
  selected: ['#3cf0c6', '#0d0a1c', null],
  value: ['#120e26', '#ffd166', '#ffd166'],
  tab: ['#1a1530', '#a49fc8', '#30284f'],
  danger: ['#3a1020', '#ffb0c0', '#ff4a6a'],
  key: ['#2a2250', '#ffffff', '#4a3f80'],
  ghost: ['#1a1530', '#a49fc8', '#30284f'],
};
/** Cada parte del menú tiene su color: el botón que lleva a ella (borde y una raya a la izquierda) y el marco y el título de
 * su submenú, para saber de un vistazo dónde estás. */
export const MC = { ex: '#3cf0c6', foes: '#ff8a3d', arms: '#ff4fa3', sound: '#a68bff', scene: '#7ee081', set: '#ffd166', prof: '#5ab8ff', body: '#5ab8ff' };

/** Los colores de las teclas planas (cuerpo y letra); en cómic, claros con la letra oscura sobre una bandeja violeta. */
const KEYC: Record<string, [number, string]> = { normal: [0x5a6375, '#f2f4ff'], primary: [0xff9f1c, '#1e1305'], selected: [0xffb52e, '#1e1305'], value: [0x262b3a, '#ffd166'], tab: [0x434b5c, '#c9cde0'], danger: [0x8c3242, '#ffe0e6'], key: [0x5a6375, '#ffffff'], ghost: [0x363c4b, '#a9adc4'], slider: [0x2b3040, ''], tray: [0x1b1e26, ''] };
const KEYC_C: Record<string, [number, string]> = { normal: [0x8fc7ff, '#1b1222'], primary: [0xff8a3d, '#1b1222'], selected: [0xffd23f, '#1b1222'], value: [0xfff2d6, '#c2410c'], tab: [0xc9b8ff, '#1b1222'], danger: [0xff6b7f, '#1b1222'], key: [0x8fc7ff, '#1b1222'], ghost: [0xd9d2e9, '#5a4f73'], slider: [0xfff2d6, ''], tray: [0x3a2d5c, ''] };
export const comicOn = (): boolean => settings.look !== 'real';
export const keyc = (style: string): [number, string] => {
  const P = comicOn() ? KEYC_C : KEYC;
  return P[style] || P.normal;
};
export const hexDim = (h: string, k: number): number => {
  const v = parseInt(h.slice(1), 16);
  return ((((v >> 16) & 255) * k) << 16) | ((((v >> 8) & 255) * k) << 8) | (((v & 255) * k) | 0);
};

// ---------------------------------------------------------------- los dibujos

type Ctx = CanvasRenderingContext2D;

/** Iconos dibujados (no dependen de la letra): reproducir, pausa, anterior, siguiente y volumen. */
export function drawIcon(c: Ctx, k: string, x: number, y: number, S: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineWidth = S * 0.12;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const tri = (x0: number, dir: number, w: number, h: number): void => {
    c.beginPath();
    c.moveTo(x0, -h);
    c.lineTo(x0 + dir * w, 0);
    c.lineTo(x0, h);
    c.closePath();
    c.fill();
  };
  const bar = (x0: number, w: number, h: number): void => c.fillRect(x0, -h, w, h * 2);
  if (k === 'play') tri(-S * 0.32, 1, S * 0.72, S * 0.45);
  else if (k === 'pause') {
    bar(-S * 0.34, S * 0.24, S * 0.42);
    bar(S * 0.1, S * 0.24, S * 0.42);
  } else if (k === 'next' || k === 'prev') {
    c.scale(k === 'next' ? 1 : -1, 1);
    tri(-S * 0.42, 1, S * 0.42, S * 0.38);
    tri(-S * 0.02, 1, S * 0.42, S * 0.38);
    bar(S * 0.4, S * 0.12, S * 0.38);
  } else if (k === 'voldown' || k === 'volup') {
    c.beginPath();
    c.moveTo(-S * 0.62, -S * 0.17);
    c.lineTo(-S * 0.42, -S * 0.17);
    c.lineTo(-S * 0.12, -S * 0.42);
    c.lineTo(-S * 0.12, S * 0.42);
    c.lineTo(-S * 0.42, S * 0.17);
    c.lineTo(-S * 0.62, S * 0.17);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(S * 0.12, 0);
    c.lineTo(S * 0.56, 0);
    if (k === 'volup') {
      c.moveTo(S * 0.34, -S * 0.22);
      c.lineTo(S * 0.34, S * 0.22);
    }
    c.stroke();
  }
  c.restore();
}

// Galones del rango, como piezas de metal con relieve: del recluta al sargento, cheurones (el sargento con su arco debajo),
// plateados hasta el soldado y dorados desde el cabo; el teniente y el capitán, estrellas; el general, tres estrellas
// dentro de una corona de laurel. col: el color del canto
const RANK_METAL = [['#e7b98a', '#8a5a2e'], ['#eef1f6', '#7d8494'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#ffe39a', '#a8741c'], ['#fff2b8', '#b8801a']];
function rankMetal(c: Ctx, i: number, S: number): CanvasGradient {
  const [a, b] = RANK_METAL[clamp(i, 0, 6)], g = c.createLinearGradient(0, -S * 0.5, 0, S * 0.5);
  g.addColorStop(0, a);
  g.addColorStop(0.55, b);
  g.addColorStop(1, a);
  return g;
}
export function drawRank(c: Ctx, i: number, x: number, y: number, S: number, col?: string): void {
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  const metal = rankMetal(c, i, S), edge = col || 'rgba(20,12,26,0.9)';
  const shape = (path: () => void): void => {
    path();
    c.fillStyle = metal;
    c.fill();
    c.lineWidth = Math.max(1.5, S * 0.035);
    c.strokeStyle = edge;
    c.stroke();
    c.save();
    c.translate(0, -S * 0.018);
    c.lineWidth = Math.max(1, S * 0.018);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    path();
    c.stroke();
    c.restore(); // (un bisel de luz arriba: relieve)
  };
  const chev = (dy: number): void =>
    shape(() => {
      const w = S * 0.46, t = S * 0.13, h = S * 0.19;
      c.beginPath();
      c.moveTo(-w, dy + h);
      c.lineTo(0, dy - h + 0.001);
      c.lineTo(w, dy + h);
      c.lineTo(w, dy + h + t);
      c.lineTo(0, dy - h + t);
      c.lineTo(-w, dy + h + t);
      c.closePath();
    });
  const star = (sx: number, sy: number, r: number): void =>
    shape(() => {
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? r * 0.46 : r;
        c.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad);
      }
      c.closePath();
    });
  if (i <= 3) {
    const n = Math.min(3, i + 1), up = i === 3 ? S * 0.12 : 0;
    for (let k = 0; k < n; k++) chev((k - (n - 1) / 2) * S * 0.27 - up - S * 0.05);
    if (i === 3)
      shape(() => {
        c.beginPath();
        c.arc(0, -S * 0.36, S * 0.66, 0.27 * Math.PI, 0.73 * Math.PI);
        c.arc(0, -S * 0.36, S * 0.54, 0.71 * Math.PI, 0.29 * Math.PI, true);
        c.closePath();
      });
  } else {
    const n = i - 3;
    if (n === 3)
      for (const s of [-1, 1])
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 2 + s * (0.5 + k * 0.38), lx = Math.cos(a) * S * 0.52, ly = Math.sin(a) * S * 0.44 - S * 0.02;
          shape(() => {
            c.beginPath();
            c.ellipse(lx, ly, S * 0.09, S * 0.042, a + (s * Math.PI) / 2.2, 0, TAU);
          });
        }
    for (let k = 0; k < n; k++) star((k - (n - 1) / 2) * S * (n === 3 ? 0.3 : 0.46), n === 3 ? -S * 0.04 : 0, S * (n === 3 ? 0.17 : 0.25));
  }
  c.restore();
}

/** La medalla del resumen: oro, plata o bronce, colgada de su cinta, con una estrella en medio. */
export function drawMedal(c: Ctx, kind: string, x: number, y: number, R: number): void {
  const M = ({ oro: ['#fff0a8', '#d9a520', '#8a5a0e'], plata: ['#ffffff', '#c3c9d4', '#6d7484'], bronce: ['#f4c79a', '#c07a3e', '#6e3f18'] } as Record<string, string[]>)[kind];
  if (!M) return;
  c.save();
  c.translate(x, y);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * R * 0.15, -R * 0.75);
    c.lineTo(s * R * 0.75, -R * 1.9);
    c.lineTo(s * R * 0.25, -R * 1.9);
    c.lineTo(-s * R * 0.25, -R * 0.75);
    c.closePath();
    c.fillStyle = s < 0 ? '#3cf0c6' : '#ff4fa3';
    c.fill(); // la cinta
  }
  const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, M[0]);
  g.addColorStop(0.6, M[1]);
  g.addColorStop(1, M[2]);
  c.shadowColor = M[1];
  c.shadowBlur = R * 0.5;
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.fillStyle = g;
  c.fill();
  c.shadowBlur = 0;
  c.lineWidth = R * 0.08;
  c.strokeStyle = M[2];
  c.beginPath();
  c.arc(0, 0, R * 0.8, 0, TAU);
  c.stroke();
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rad = k % 2 ? R * 0.22 : R * 0.5;
    c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c.closePath();
  const sg = c.createLinearGradient(0, -R * 0.5, 0, R * 0.5);
  sg.addColorStop(0, M[0]);
  sg.addColorStop(1, M[2]);
  c.fillStyle = sg;
  c.fill();
  c.lineWidth = R * 0.03;
  c.strokeStyle = M[2];
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- las fichas de los enemigos

/** Lo que va en una ficha de enemigo: su clave, su nombre, su retrato, su resistencia y su fuerza (y si es jefe). */
export interface FoeCard {
  v: string;
  name: string;
  pic: string;
  hp: number;
  str: number;
  boss?: boolean;
}
// Los retratos (public/retratos/<enemigo>.png): se cargan la primera vez que hace falta uno y, al llegar, se repintan las
// fichas que esperaban
const PICS = new Map<string, { img: HTMLImageElement; ok: boolean; wait: { draw(): void }[] }>();
function foePic(pic: string, who: { draw(): void } | null): HTMLImageElement | null {
  let P = PICS.get(pic);
  if (!P) {
    const img = new Image();
    P = { img, ok: false, wait: [] };
    PICS.set(pic, P);
    const PP = P;
    img.onload = () => {
      PP.ok = true;
      for (const b of PP.wait.splice(0)) b.draw();
    };
    img.src = `${import.meta.env.BASE_URL}retratos/${pic}.png`;
  }
  if (P.ok) return P.img;
  if (who) P.wait.push(who);
  return null;
}
export const CARD_H = 0.11;
/** La ficha de un enemigo: su retrato, su nombre, su resistencia (el escudo) y su fuerza (el rayo); el jefe, «JEFE». */
export function drawFoeCard(who: { draw(): void }, c: Ctx, W: number, H: number, it: FoeCard, tc: string): void {
  const img = FOE_PIC.includes(it.pic) ? foePic(it.pic, who) : null, S = Math.min(W * 0.96, H * 0.56);
  if (img) c.drawImage(img, img.width * 0.1, img.height * 0.1, img.width * 0.8, img.height * 0.8, (W - S) / 2, H * 0.025, S, S); // (sin el margen del retrato: más grande)
  c.fillStyle = tc;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  fitFont(c, it.name, W * 0.92, Math.round(H * 0.12), '700 %px ' + FB);
  c.fillText(it.name, W / 2, H * 0.65);
  if (it.boss) {
    c.fillStyle = '#ffd166';
    c.font = '800 ' + Math.round(H * 0.12) + 'px ' + FB;
    c.fillText('JEFE', W / 2, H * 0.84);
    return;
  }
  const y = H * 0.855, k = H * 0.085, n = Math.round(H * 0.15);
  c.beginPath();
  c.moveTo(W * 0.2, y - k);
  c.lineTo(W * 0.2 + k * 0.85, y - k * 0.65);
  c.lineTo(W * 0.2 + k * 0.75, y + k * 0.15);
  c.quadraticCurveTo(W * 0.2 + k * 0.5, y + k * 0.75, W * 0.2, y + k);
  c.quadraticCurveTo(W * 0.2 - k * 0.5, y + k * 0.75, W * 0.2 - k * 0.75, y + k * 0.15);
  c.lineTo(W * 0.2 - k * 0.85, y - k * 0.65);
  c.closePath();
  c.fillStyle = '#3cf0c6';
  c.fill(); // escudo: resistencia
  const bx = W * 0.6;
  c.beginPath();
  [[0.25, -1], [-0.55, 0.15], [-0.05, 0.15], [-0.3, 1], [0.6, -0.25], [0.08, -0.25], [0.35, -1]].forEach(([u, v], q) => (q ? c.lineTo(bx + u * k, y + v * k) : c.moveTo(bx + u * k, y + v * k)));
  c.closePath();
  c.fillStyle = '#ff5a6e';
  c.fill(); // rayo: fuerza
  c.textAlign = 'left';
  c.font = '800 ' + n + 'px ' + FB;
  c.fillStyle = tc;
  c.fillText(String(it.hp), W * 0.2 + k * 1.15, y + 2);
  c.fillText(String(it.str), bx + k * 0.95, y + 2);
}
