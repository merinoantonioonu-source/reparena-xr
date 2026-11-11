/**
 * La ilustración de la carátula del duelo (RepArena, src/64_intro.js: CIN —siluetas a contraluz con un filo de luz, la arena
 * con sus compuertas y brasas, el rayo, los arcos…—, introDeco y las placas de introDraw), dibujada aquí mismo, sin
 * archivos: tú contra el jefe de la ronda, con un VS en medio, el ejercicio, tu rango y tu récord y las barras de cada uno.
 * Los números, colores y el orden de pintado, los de RepArena. Solo lienzo (sin IWSDK): lo de qué sale, en
 * src/combat/duel.ts; el panel, quien lo enseñe.
 */
import type { DuelBoss, DuelScene } from '../combat/duel.js';
import { clamp, FB, FD, FO, fitFont, lerp, mkCanvas, rr, TAU } from './canvas-kit.js';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
/** Una luz local: x, y, radio, color y fuerza. */
type Light = [number, number, number, string, number];
/** Lo que devuelve el dibujo de un jefe: dónde brillan sus ojos, su boca, su núcleo… (en coordenadas del personaje). */
interface FoeInfo {
  eyes?: [number, number, number][];
  eye?: [number, number, number];
  sockets?: [number, number, number][];
  suckers?: [number, number, number][];
  mouth?: [number, number, number];
  core?: [number, number, number];
  eyeCol?: string;
}

const RNG = (s: number) => (): number => (s = (s * 16807) % 2147483647) / 2147483647;
// (#rrggbb o rgb(…))
const hex = (h: string): number[] => (h[0] === '#' ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : (h.match(/[\d.]+/g) || []).slice(0, 3).map(Number));
const mix = (a: string, b: string, k: number): string => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], k))).join(',')})`; };
const rgba = (h: string, a: number | string): string => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

// los lienzos de trabajo de las siluetas, reutilizados (se crean al pintar la primera vez, no al cargar)
const BUF: HTMLCanvasElement[] = [];
function buf(i: number, W: number, H: number): HTMLCanvasElement {
  let c = BUF[i];
  if (!c) c = BUF[i] = mkCanvas(W, H);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  return c;
}
function glow(g: Ctx, x: number, y: number, r: number, col: string, a = 1): void {
  if (!(r > 0)) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// formas en coordenadas del personaje: altura 1, los pies en y = 0 y la y hacia arriba
interface Shapes {
  circ(x: number, y: number, r: number): void;
  ell(x: number, y: number, rx: number, ry: number, rot?: number): void;
  poly(p: Pt[]): void;
  cap(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, bulge?: number): void;
  chain(pts: Pt[], rs: number[]): void;
}
function shapes(c: Ctx): Shapes {
  const S: Shapes = {
    circ(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); },
    ell(x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fill(); },
    poly(p) { c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); },
    // un miembro: dos círculos unidos por lados algo abombados (el músculo)
    cap(x1, y1, r1, x2, y2, r2, bulge = 1.12) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, rm = ((r1 + r2) / 2) * bulge;
      c.beginPath(); c.moveTo(x1 + nx * r1, y1 + ny * r1); c.quadraticCurveTo(mx + nx * rm, my + ny * rm, x2 + nx * r2, y2 + ny * r2);
      c.lineTo(x2 - nx * r2, y2 - ny * r2); c.quadraticCurveTo(mx - nx * rm, my - ny * rm, x1 - nx * r1, y1 - ny * r1); c.closePath(); c.fill();
      S.circ(x1, y1, r1); S.circ(x2, y2, r2);
    },
    chain(pts, rs) { for (let i = 0; i < pts.length - 1; i++) S.cap(pts[i][0], pts[i][1], rs[i], pts[i + 1][0], pts[i + 1][1], rs[i + 1]); },
  };
  return S;
}

/* ---------- Tú, de perfil y mirando a la derecha ---------- */
type Joint = 'head' | 'neck' | 'sh' | 'el' | 'wr' | 'el2' | 'wr2' | 'hip' | 'kn' | 'an' | 'toe' | 'kn2' | 'an2' | 'toe2';
type Pose = Record<Joint, Pt>;
const POSE: Record<string, Pose> = {
  squat: { head: [0.14, 0.84], neck: [0.1, 0.77], sh: [0.065, 0.71], el: [0.24, 0.69], wr: [0.41, 0.71], el2: [0.22, 0.65], wr2: [0.38, 0.66], hip: [-0.12, 0.37], kn: [0.19, 0.31], an: [0.05, 0.035], toe: [0.17, 0], kn2: [0.15, 0.29], an2: [0, 0.035], toe2: [0.12, 0] },
  deep: { head: [0.15, 0.6], neck: [0.11, 0.55], sh: [0.075, 0.5], el: [0.19, 0.42], wr: [0.31, 0.37], el2: [0.16, 0.41], wr2: [0.28, 0.35], hip: [-0.14, 0.24], kn: [0.17, 0.26], an: [0.04, 0.035], toe: [0.16, 0], kn2: [0.13, 0.24], an2: [-0.01, 0.035], toe2: [0.11, 0] },
  lunge: { head: [0.06, 0.84], neck: [0.04, 0.77], sh: [0.03, 0.71], el: [0.18, 0.69], wr: [0.35, 0.71], el2: [0.16, 0.65], wr2: [0.32, 0.66], hip: [0, 0.42], kn: [0.22, 0.25], an: [0.23, 0.035], toe: [0.35, 0], kn2: [-0.16, 0.1], an2: [-0.36, 0.07], toe2: [-0.42, 0.005] },
  plank: { head: [0.37, 0.35], neck: [0.32, 0.31], sh: [0.27, 0.29], el: [0.28, 0.15], wr: [0.29, 0.03], el2: [0.24, 0.15], wr2: [0.25, 0.03], hip: [-0.26, 0.21], kn: [-0.53, 0.13], an: [-0.79, 0.05], toe: [-0.82, 0.005], kn2: [-0.53, 0.12], an2: [-0.79, 0.045], toe2: [-0.82, 0.005] },
  hang: { head: [0.04, 0.94], neck: [0.02, 0.87], sh: [0.0, 0.82], el: [0.07, 1.0], wr: [0.03, 1.17], el2: [-0.05, 1.0], wr2: [-0.03, 1.17], hip: [0, 0.5], kn: [0.08, 0.28], an: [0.02, 0.07], toe: [0.1, 0.04], kn2: [0.04, 0.27], an2: [-0.03, 0.07], toe2: [0.05, 0.04] },
  reach: { head: [0.05, 0.93], neck: [0.035, 0.86], sh: [0.025, 0.81], el: [0.15, 0.92], wr: [0.3, 1.02], el2: [0.12, 0.72], wr2: [0.2, 0.62], hip: [0, 0.52], kn: [0.05, 0.27], an: [0.03, 0.035], toe: [0.15, 0], kn2: [-0.03, 0.27], an2: [-0.05, 0.035], toe2: [0.07, 0] },
};
function heroParts(c: Ctx, P: Pose, back = false): void {
  const S = shapes(c), cap = (a: Joint, b: Joint, r1: number, r2: number) => S.cap(P[a][0], P[a][1], r1, P[b][0], P[b][1], r2);
  if (back) { cap('hip', 'kn2', 0.068, 0.047); cap('kn2', 'an2', 0.045, 0.03); cap('an2', 'toe2', 0.03, 0.02); cap('sh', 'el2', 0.04, 0.033); cap('el2', 'wr2', 0.032, 0.026); S.circ(P.wr2[0], P.wr2[1], 0.031); return; }
  cap('neck', 'hip', 0.072, 0.07); const ch = [lerp(P.sh[0], P.hip[0], 0.22), lerp(P.sh[1], P.hip[1], 0.22)]; S.circ(ch[0], ch[1], 0.088);
  cap('neck', 'head', 0.032, 0.03); S.circ(P.head[0], P.head[1], 0.064);
  cap('hip', 'kn', 0.076, 0.05); cap('kn', 'an', 0.048, 0.032); cap('an', 'toe', 0.031, 0.02);
  cap('sh', 'el', 0.045, 0.036); cap('el', 'wr', 0.036, 0.028); S.circ(P.wr[0], P.wr[1], 0.034);
  // las gafas, delante de la cara
  const a = Math.atan2(P.head[1] - P.neck[1], P.head[0] - P.neck[0]) - Math.PI / 2;
  c.save(); c.translate(P.head[0], P.head[1]); c.rotate(a); rr(c, 0.015, -0.03, 0.08, 0.058, 0.015); c.fill(); c.restore();
}
/** De coordenadas del personaje al lienzo, con su escala (la altura, en píxeles). */
type ToPx = ((lx: number, ly: number) => Pt) & { s: number };
// las costuras del traje (dibujan el cuerpo sobre lo oscuro), el frontal de las gafas y los aros de los guantes
function heroLights(g: Ctx, tp: ToPx, P: Pose, col: string): void {
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = rgba(col, 0.75); g.lineWidth = Math.max(1, tp.s * 0.0045);
  const seam = (a: Joint, b: Joint, off: number, k0 = 0.12, k1 = 0.88) => {
    const A = P[a], B = P[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * off, ny = (dx / L) * off;
    const [x1, y1] = tp(A[0] + dx * k0 + nx, A[1] + dy * k0 + ny), [x2, y2] = tp(A[0] + dx * k1 + nx, A[1] + dy * k1 + ny); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  seam('hip', 'kn', 0.045); seam('kn', 'an', 0.03); seam('sh', 'el', 0.028); seam('el', 'wr', 0.022, 0.1, 0.7); seam('neck', 'hip', -0.055, 0.15, 0.85);
  g.globalAlpha = 0.45; seam('hip', 'kn2', 0.04); seam('kn2', 'an2', 0.028); g.globalAlpha = 1;
  const a = Math.atan2(P.head[1] - P.neck[1], P.head[0] - P.neck[0]) - Math.PI / 2, [fx, fy] = tp(P.head[0] + Math.cos(a) * 0.095, P.head[1] + Math.sin(a) * 0.095); glow(g, fx, fy, tp.s * 0.05, col, 0.6);
  for (const w of ['wr', 'wr2'] as const) { const [x, y] = tp(P[w][0] - 0.03, P[w][1]); g.strokeStyle = rgba(col, w === 'wr' ? 0.95 : 0.5); g.lineWidth = Math.max(1.5, tp.s * 0.008); g.beginPath(); g.ellipse(x, y, tp.s * 0.012, tp.s * 0.034, 0.3, 0, TAU); g.stroke(); }
  g.restore();
}

/* ---------- Los jefes, de perfil y mirando a la izquierda (hacia ti) ---------- */
const FOES: Record<string, (c: Ctx) => FoeInfo> = {
  yeti(c) { const S = shapes(c), r = RNG(7), p: Pt[] = [];
    for (let i = 0; i < 70; i++) { const a = (i / 70) * TAU, sp = i % 2 ? 1 : 1.09 + r() * 0.07; p.push([Math.cos(a) * 0.38 * sp, 0.55 + Math.sin(a) * 0.47 * sp]); } S.poly(p);
    S.chain([[-0.25, 0.72], [-0.44, 0.42], [-0.5, 0.14]], [0.12, 0.095, 0.08]); for (const k of [0, 1, 2]) S.poly([[-0.53 + k * 0.035, 0.12], [-0.58 + k * 0.04, 0.0], [-0.5 + k * 0.035, 0.08]]);
    S.cap(-0.14, 0.16, 0.12, -0.15, 0.03, 0.1); S.cap(0.16, 0.16, 0.12, 0.18, 0.03, 0.1);
    return { eyes: [[-0.25, 0.8, 0.026], [-0.12, 0.81, 0.026]], eyeCol: '#9fe8ff', mouth: [-0.2, 0.66, 0.06] }; },
  zombie(c) { const S = shapes(c);
    S.chain([[0.05, 0.43], [-0.08, 0.22], [-0.04, 0.025]], [0.06, 0.045, 0.035]); S.cap(-0.04, 0.025, 0.03, -0.15, 0.005, 0.022);
    S.chain([[0.08, 0.42], [0.16, 0.22], [0.21, 0.03]], [0.06, 0.045, 0.035]); S.cap(0.21, 0.03, 0.03, 0.11, 0.005, 0.022);
    S.cap(0.0, 0.7, 0.1, 0.06, 0.42, 0.085); S.poly([[-0.07, 0.48], [0.18, 0.47], [0.15, 0.36], [0.1, 0.41], [0.05, 0.34], [0.0, 0.4], [-0.05, 0.35]]);
    S.cap(-0.08, 0.78, 0.04, 0.0, 0.7, 0.05); S.circ(-0.13, 0.82, 0.078);
    S.chain([[0.03, 0.68], [-0.18, 0.58], [-0.36, 0.6]], [0.04, 0.032, 0.027]); S.chain([[-0.02, 0.7], [-0.22, 0.66], [-0.42, 0.69]], [0.042, 0.034, 0.028]);
    for (const k of [0, 1, 2]) S.cap(-0.42, 0.69, 0.012, -0.5, 0.71 - k * 0.025, 0.007);
    return { eyes: [[-0.18, 0.84, 0.016], [-0.12, 0.86, 0.014]], eyeCol: '#c8ff5a' }; },
  demon(c) { const S = shapes(c);
    c.beginPath(); c.moveTo(0.14, 0.62); c.lineTo(0.58, 0.9); c.lineTo(0.5, 0.66); c.lineTo(0.64, 0.6); c.lineTo(0.47, 0.5); c.lineTo(0.55, 0.4); c.lineTo(0.3, 0.42); c.closePath(); c.fill();
    S.chain([[0.22, 0.2], [0.42, 0.12], [0.55, 0.22]], [0.035, 0.025, 0.018]); S.poly([[0.5, 0.22], [0.62, 0.3], [0.6, 0.18]]);
    S.ell(-0.13, 0.05, 0.1, 0.05); S.ell(0.12, 0.05, 0.1, 0.05); S.ell(0, 0.42, 0.3, 0.34);
    c.beginPath(); c.moveTo(-0.17, 0.66); c.quadraticCurveTo(-0.44, 0.78, -0.35, 1.03); c.quadraticCurveTo(-0.27, 0.8, -0.04, 0.73); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.08, 0.72); c.quadraticCurveTo(0.34, 0.86, 0.29, 1.05); c.quadraticCurveTo(0.22, 0.82, 0.2, 0.64); c.closePath(); c.fill();
    S.chain([[-0.22, 0.44], [-0.36, 0.32], [-0.42, 0.2]], [0.055, 0.042, 0.035]); for (const k of [0, 1, 2]) S.poly([[-0.44, 0.2], [-0.52 + k * 0.03, 0.12], [-0.4 + k * 0.02, 0.17]]);
    return { eyes: [[-0.19, 0.5, 0.03], [-0.05, 0.52, 0.03]], eyeCol: '#ff3b2f', mouth: [-0.17, 0.33, 0.06] }; },
  cyclops(c) { const S = shapes(c);
    S.ell(-0.12, 0.05, 0.09, 0.05); S.ell(0.12, 0.05, 0.09, 0.05); S.ell(0, 0.47, 0.27, 0.43);
    S.poly([[-0.15, 0.84], [-0.2, 1.0], [-0.05, 0.88]]); S.poly([[0.06, 0.89], [0.12, 1.03], [0.17, 0.84]]); S.chain([[-0.22, 0.45], [-0.34, 0.3], [-0.38, 0.18]], [0.05, 0.04, 0.034]);
    return { eye: [-0.12, 0.6, 0.1], eyeCol: '#ffd84a' }; },
  robot(c) { const S = shapes(c);
    S.chain([[-0.06, 0.42], [-0.1, 0.22], [-0.08, 0.03]], [0.07, 0.06, 0.06]); S.chain([[0.1, 0.42], [0.14, 0.22], [0.16, 0.03]], [0.07, 0.06, 0.06]); S.ell(-0.1, 0.03, 0.1, 0.04); S.ell(0.16, 0.03, 0.1, 0.04);
    rr(c, -0.2, 0.4, 0.42, 0.36, 0.05); c.fill(); rr(c, -0.24, 0.68, 0.48, 0.12, 0.03); c.fill(); rr(c, -0.12, 0.8, 0.22, 0.17, 0.04); c.fill();
    S.chain([[-0.22, 0.72], [-0.34, 0.55], [-0.46, 0.5]], [0.06, 0.05, 0.05]); rr(c, -0.58, 0.42, 0.14, 0.16, 0.03); c.fill(); S.chain([[0.22, 0.72], [0.3, 0.52], [0.28, 0.38]], [0.06, 0.05, 0.05]);
    return { eyes: [[-0.08, 0.89, 0.03]], eyeCol: '#ff3b5c', core: [-0.02, 0.58, 0.05] }; },
  spider(c) { const S = shapes(c);
    for (const [x0, dx, ky] of [[-0.2, -0.85, 0.72], [-0.15, -0.55, 0.8], [-0.1, 0.32, 0.78], [-0.05, 0.62, 0.68], [-0.18, -0.7, 0.6], [-0.12, -0.38, 0.66], [-0.08, 0.2, 0.64], [-0.02, 0.5, 0.56]]) S.chain([[x0, 0.32], [x0 + dx * 0.42, ky], [x0 + dx, 0.0]], [0.035, 0.026, 0.012]);
    S.ell(0.27, 0.43, 0.33, 0.26, -0.25); S.ell(-0.12, 0.33, 0.17, 0.13); S.cap(-0.26, 0.3, 0.025, -0.31, 0.2, 0.012);
    return { eyes: [[-0.27, 0.37, 0.016], [-0.23, 0.41, 0.014], [-0.2, 0.38, 0.012], [-0.24, 0.33, 0.012]], eyeCol: '#ff2a2a' }; },
  crab(c) { const S = shapes(c);
    for (const x of [-0.25, -0.08, 0.1, 0.27]) S.chain([[x, 0.25], [x + (x < 0 ? -0.1 : 0.1), 0.2], [x + (x < 0 ? -0.14 : 0.14), 0.0]], [0.03, 0.022, 0.01]);
    S.ell(0, 0.32, 0.42, 0.2); S.cap(-0.13, 0.45, 0.02, -0.16, 0.62, 0.016); S.cap(0.0, 0.47, 0.02, 0.0, 0.64, 0.016);
    S.chain([[-0.32, 0.36], [-0.5, 0.48], [-0.6, 0.5]], [0.045, 0.035, 0.03]); c.beginPath(); c.moveTo(-0.6, 0.5); c.quadraticCurveTo(-0.84, 0.7, -0.92, 0.5); c.lineTo(-0.72, 0.5); c.quadraticCurveTo(-0.84, 0.34, -0.6, 0.44); c.closePath(); c.fill();
    return { eyes: [[-0.16, 0.64, 0.022], [0.0, 0.66, 0.022]], eyeCol: '#ffd166' }; },
  skull(c) { const S = shapes(c);
    S.cap(-0.12, 0.15, 0.06, -0.14, 0.02, 0.05); S.cap(0.12, 0.15, 0.06, 0.14, 0.02, 0.05); S.circ(0, 0.6, 0.33); rr(c, -0.22, 0.22, 0.4, 0.18, 0.05); c.fill();
    return { sockets: [[-0.13, 0.6, 0.075], [0.08, 0.6, 0.075]], eyeCol: '#c86bff' }; },
  dragon(c) { const S = shapes(c);
    c.beginPath(); c.moveTo(0.05, 0.62); c.lineTo(0.35, 1.05); c.lineTo(0.42, 0.86); c.lineTo(0.6, 0.98); c.lineTo(0.58, 0.74); c.lineTo(0.75, 0.72); c.lineTo(0.3, 0.5); c.closePath(); c.fill();
    S.chain([[0.3, 0.45], [0.55, 0.36], [0.75, 0.42], [0.9, 0.36]], [0.08, 0.05, 0.03, 0.015]); S.poly([[0.86, 0.36], [0.98, 0.42], [0.96, 0.3]]);
    S.ell(0.12, 0.48, 0.24, 0.14, -0.2); S.chain([[-0.04, 0.55], [-0.16, 0.66], [-0.26, 0.7]], [0.07, 0.055, 0.05]);
    S.ell(-0.34, 0.7, 0.11, 0.065, -0.15); S.poly([[-0.3, 0.75], [-0.26, 0.9], [-0.24, 0.74]]);
    S.chain([[0.0, 0.38], [-0.04, 0.26], [-0.1, 0.22]], [0.035, 0.03, 0.02]);
    return { eyes: [[-0.36, 0.73, 0.018]], eyeCol: '#ffd166', mouth: [-0.44, 0.68, 0.05] }; },
  mace(c) { const S = shapes(c);
    for (let k = 0; k < 9; k++) S.circ(0, 1.9 - k * 0.12, 0.03);
    S.circ(0, 0.55, 0.32); for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, x = Math.cos(a), y = Math.sin(a); S.poly([[x * 0.28 - y * 0.06, 0.55 + y * 0.28 + x * 0.06], [x * 0.5, 0.55 + y * 0.5], [x * 0.28 + y * 0.06, 0.55 + y * 0.28 - x * 0.06]]); }
    return { core: [0, 0.55, 0.16] }; },
  tentacle(c) { const S = shapes(c), pts: Pt[] = [], rs: number[] = [];
    for (let k = 0; k <= 14; k++) { const u = k / 14; pts.push([0.1 * Math.sin(u * 5) - 0.25 * u * u, u * 1.05]); rs.push(lerp(0.16, 0.025, u)); } S.chain(pts, rs); S.ell(0, 0.0, 0.42, 0.06);
    return { suckers: pts.slice(2, 12).map(([x, y], k): [number, number, number] => [x - rs[k + 2] * 0.7, y, rs[k + 2] * 0.35]), eyeCol: '#ff8a3d' }; },
};

/** Cómo se ilumina una figura: dónde está (los pies), su escala, la luz principal (lx, ly), la de atrás (l2), sus filos y su sombra. */
interface LitOpts { x: number; y: number; s: number; flip: number; lx: number; ly: number; l2?: Pt; rim: string; rim2?: string; dark: string; lights?: Light[] }
// con contraluz: silueta oscura con un filo cálido hacia la luz y otro frío por el otro lado (l2); las luces locales
// (la bola de energía, el impacto) tiñen la silueta cerca de ellas
function litFigure(g: Ctx, W0: number, H0: number, o: LitOpts, draw: (c: Ctx) => FoeInfo | void): FoeInfo {
  // solo en el recuadro del personaje (cabe todo: de −1 a 1 de ancho y hasta 2 de alto), no en todo el lienzo: va mucho más deprisa
  const x0 = Math.max(0, Math.floor(o.x - o.s * 1.05)), x1 = Math.min(W0, Math.ceil(o.x + o.s * 1.05)), y0 = Math.max(0, Math.floor(o.y - o.s * 2.05)), y1 = Math.min(H0, Math.ceil(o.y + o.s * 0.12));
  const W = x1 - x0, H = y1 - y0; if (W <= 0 || H <= 0) return {};
  o = { ...o, x: o.x - x0, y: o.y - y0, lx: o.lx - x0, ly: o.ly - y0, lights: (o.lights || []).map(([x, y, r, c, a]): Light => [x - x0, y - y0, r, c, a]) };
  const m = buf(0, W, H), c = m.getContext('2d')!;
  c.setTransform(o.s * o.flip, 0, 0, -o.s, o.x, o.y); c.fillStyle = '#fff'; const info = draw(c) || {}; c.setTransform(1, 0, 0, 1, 0, 0);
  let lx = o.lx - o.x, ly = o.ly - (o.y - o.s * 0.5); const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
  const d = Math.max(2.5, o.s * 0.022), d2 = Math.max(1.5, o.s * 0.012), [qx, qy] = o.l2 || [-lx, -ly];
  const tint = (i: number, col: string) => { const b = buf(i, W, H), bc = b.getContext('2d')!; bc.fillStyle = col; bc.fillRect(0, 0, W, H); bc.globalCompositeOperation = 'destination-in'; bc.drawImage(m, 0, 0); return b; };
  const f = tint(1, o.rim2 || o.rim), fc = f.getContext('2d')!, r1 = tint(2, o.rim); fc.globalCompositeOperation = 'source-atop'; fc.drawImage(r1, -qx * d2, -qy * d2);
  const dark = tint(2, o.dark), dc = dark.getContext('2d')!; dc.globalCompositeOperation = 'destination-in'; dc.drawImage(m, lx * d - qx * d2, ly * d - qy * d2);
  fc.drawImage(dark, -lx * d, -ly * d);
  for (const [x, y, r, col, a] of o.lights || []) { const gr = fc.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); fc.fillStyle = gr; fc.fillRect(0, 0, W, H); }
  const gr = fc.createLinearGradient(0, o.y - o.s, 0, o.y); gr.addColorStop(0, 'rgba(255,240,230,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)'); fc.fillStyle = gr; fc.fillRect(0, 0, W, H);
  g.drawImage(f, x0, y0);
  return info;
}

/* ---------- La escena ---------- */
const P = { sky0: '#04040c', sky1: '#1d1540', glow: '#ff7a3c', glow2: '#ff2f6a', rim: '#ffd0a0', bolt: '#5fd8ff', fog: '#2c2a5a', dark: '#0a0812', wall0: '#262036', wall1: '#0f0c18', floor0: '#2c2238', floor1: '#06040a' };
function background(g: Ctx, W: number, H: number, R: () => number): { x: number; y: number; r: number } {
  const hz = 0.6 * H, cx = 0.5 * W, lt = { x: 0.5 * W, y: 0.52 * H, r: 0.7 * H };
  let gr = g.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, P.sky0); gr.addColorStop(1, P.sky1); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${(0.15 + R() * 0.5).toFixed(2)})`; g.fillRect(R() * W, R() * hz * 0.5, 1.2, 1.2); }
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, lt.x, lt.y, lt.r, P.glow, 0.85); glow(g, lt.x, lt.y, lt.r * 0.5, P.glow2, 0.5); g.restore();
  // el muro curvo de la arena: más alto por los lados (que están más cerca), con almenas, tuberías, pilares y pilotos
  const wallH = H * 0.3, top = (x: number) => hz - wallH * (1 + 1.6 * ((x - cx) / W) ** 2), base = (x: number) => hz + H * 0.22 * ((x - cx) / W) ** 2;
  g.beginPath(); g.moveTo(0, base(0) + 5); for (let x = 0; x <= W; x += W / 60) g.lineTo(x, top(x)); for (let x = W; x >= 0; x -= W / 60) g.lineTo(x, base(x) + 5); g.closePath();
  gr = g.createLinearGradient(0, hz - wallH * 2, 0, hz); gr.addColorStop(0, P.wall1); gr.addColorStop(1, P.wall0); g.fillStyle = gr; g.fill();
  g.fillStyle = P.wall1; for (let x = 0; x < W; x += W / 34) g.fillRect(x, top(x) - H * 0.022, W / 70, H * 0.025);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = H * 0.008; for (const f of [0.35, 0.55]) { g.beginPath(); for (let x = 0; x <= W; x += W / 60) { const y = lerp(top(x), base(x), f); if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  for (let k = -4; k <= 4; k++) { const x = cx + k * W * 0.16; if (x < -20 || x > W + 20) continue; const t = top(x), b = base(x), pw = W * 0.018 * (1 + Math.abs(x - cx) / W);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - pw / 2, t - H * 0.03, pw, b - t + H * 0.03); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x - pw / 2, t - H * 0.03, pw * 0.25, b - t);
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, lerp(t, b, 0.18), H * 0.03, '#ff7a3c', 0.9); g.restore(); }
  // dos compuertas: hueco negro, dintel amarillo, piloto naranja y ojos en la oscuridad
  for (const k of [-1, 1]) {
    const x = cx + k * W * 0.3, b = base(x), w = W * 0.09, h = H * 0.17;
    g.fillStyle = '#16111c'; g.fillRect(x - w * 0.62, b - h * 1.12, w * 1.24, h * 1.12);
    gr = g.createLinearGradient(0, b - h, 0, b); gr.addColorStop(0, '#000000'); gr.addColorStop(1, rgba(P.glow, 0.28)); g.fillStyle = gr; g.fillRect(x - w / 2, b - h, w, h);
    g.fillStyle = '#b8901f'; g.fillRect(x - w * 0.62, b - h * 1.22, w * 1.24, h * 0.14); g.fillStyle = '#20170a'; for (let s = 0; s < 8; s++) g.fillRect(x - w * 0.6 + s * w * 0.16, b - h * 1.2, w * 0.05, h * 0.1);
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, b - h * 1.3, h * 0.25, '#ff8a3d', 1);
    gr = g.createLinearGradient(0, b - h * 1.3, 0, b + h * 0.6); gr.addColorStop(0, rgba('#ff8a3d', 0.22)); gr.addColorStop(1, rgba('#ff8a3d', 0)); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w * 0.05, b - h * 1.3); g.lineTo(x + w * 0.05, b - h * 1.3); g.lineTo(x + w * 0.9, b + h * 0.6); g.lineTo(x - w * 0.9, b + h * 0.6); g.closePath(); g.fill();
    for (let e = 0; e < 2; e++) { const ex = x + (R() - 0.5) * w * 0.6, ey = b - h * (0.3 + R() * 0.4); g.fillStyle = '#ff2a2a'; g.shadowColor = '#ff2a2a'; g.shadowBlur = 8; g.fillRect(ex, ey, w * 0.03, w * 0.015); g.fillRect(ex + w * 0.06, ey, w * 0.03, w * 0.015); }
    g.restore();
  }
  g.save(); g.globalCompositeOperation = 'lighter'; for (let k = 0; k < 4; k++) { const x0 = W * (0.15 + R() * 0.7), x1 = x0 + (R() - 0.5) * W * 0.5; gr = g.createLinearGradient(0, 0, 0, hz + H * 0.2); gr.addColorStop(0, 'rgba(255,230,210,0.13)'); gr.addColorStop(1, 'rgba(255,230,210,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - 4, 0); g.lineTo(x0 + 4, 0); g.lineTo(x1 + W * 0.07, hz + H * 0.2); g.lineTo(x1 - W * 0.07, hz + H * 0.2); g.closePath(); g.fill(); } g.restore();
  // el suelo de chapa, con la luz reflejada, y niebla sobre el horizonte
  g.beginPath(); g.moveTo(0, base(0)); for (let x = 0; x <= W; x += W / 60) g.lineTo(x, base(x)); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  gr = g.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, P.floor0); gr.addColorStop(1, P.floor1); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.2; for (let k = -14; k <= 14; k++) { g.beginPath(); g.moveTo(lt.x, hz); g.lineTo(lt.x + k * W * 0.16, H); g.stroke(); }
  for (let k = 1; k < 9; k++) { const y = hz + (H - hz) * (k / 9) ** 1.8; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.globalCompositeOperation = 'lighter'; g.translate(lt.x, hz + (H - hz) * 0.18); g.scale(1, 0.28); glow(g, 0, 0, lt.r * 0.9, P.glow, 0.45); g.restore();
  gr = g.createLinearGradient(0, hz - H * 0.12, 0, hz + H * 0.12); gr.addColorStop(0, rgba(P.fog, 0)); gr.addColorStop(0.5, rgba(P.fog, 0.55)); gr.addColorStop(1, rgba(P.fog, 0)); g.fillStyle = gr; g.fillRect(0, hz - H * 0.12, W, H * 0.24);
  return lt;
}
// un rayo en zigzag con ramas, en tres capas (halo, color y núcleo blanco), y el estallido donde da. Sin desenfoque de
// sombra en ningún brillo (es lo más caro de pintar): las capas anchas y suaves ya hacen de resplandor
function bolt(g: Ctx, x1: number, y1: number, x2: number, y2: number, col: string, R: () => number, w: number): void {
  const sub = (a: Pt, b: Pt, dis: number, n: number): Pt[] => { if (!n) return [a]; const m: Pt = [(a[0] + b[0]) / 2 + (R() - 0.5) * dis, (a[1] + b[1]) / 2 + (R() - 0.5) * dis]; return sub(a, m, dis / 2, n - 1).concat(sub(m, b, dis / 2, n - 1)); };
  const len = Math.hypot(x2 - x1, y2 - y1), main = sub([x1, y1], [x2, y2], len * 0.28, 7).concat([[x2, y2]]), paths: [Pt[], number][] = [[main, w]];
  for (let k = 0; k < 4; k++) { const a = main[Math.floor(main.length * (0.2 + R() * 0.6))], ang = Math.atan2(y2 - y1, x2 - x1) + (R() - 0.5) * 1.6, l = len * (0.12 + R() * 0.18); paths.push([sub(a, [a[0] + Math.cos(ang) * l, a[1] + Math.sin(ang) * l], l * 0.4, 5), w * 0.45]); }
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [pts, ww] of paths) for (const [lw, c, a] of [[ww * 7, col, 0.1], [ww * 2.8, col, 0.45], [ww, '#ffffff', 1]] as [number, string, number][]) {
    g.strokeStyle = rgba(c, a); g.lineWidth = lw; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  }
  glow(g, x2, y2, w * 16, col, 0.9); glow(g, x2, y2, w * 6, '#ffffff', 0.9);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, w * 0.35); for (let k = 0; k < 14; k++) { const a = R() * TAU, r0 = w * 3, r1 = w * (6 + R() * 12); g.beginPath(); g.moveTo(x2 + Math.cos(a) * r0, y2 + Math.sin(a) * r0); g.lineTo(x2 + Math.cos(a) * r1, y2 + Math.sin(a) * r1); g.stroke(); }
  g.restore();
}
function energyBall(g: Ctx, x: number, y: number, r: number, col: string, R: () => number): void {
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, r * 3.2, col, 0.8); glow(g, x, y, r * 1.2, '#ffffff', 1);
  g.strokeStyle = rgba(col, 0.9); g.lineWidth = Math.max(1, r * 0.08);
  for (let k = 0; k < 6; k++) { let a = R() * TAU, rr2 = r * (1.1 + R() * 0.6); g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); for (let s = 0; s < 4; s++) { a += 0.35 + R() * 0.3; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); rr2 *= 0.92; } g.stroke(); }
  g.restore();
}
function arch(g: Ctx, cx: number, gy: number, rx: number, ry: number, col: string, a: number, trail: number): void {
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (let t = trail; t >= 0; t--) { const k = 1 - t / (trail + 1), ox = t * rx * 0.9;
    for (const [lw, c, al] of [[ry * 0.09, col, 0.12], [ry * 0.035, col, 0.6], [ry * 0.012, '#ffffff', 1]] as [number, string, number][]) {
      g.strokeStyle = rgba(c, al * a * k); g.lineWidth = lw; g.beginPath(); g.ellipse(cx + ox, gy, rx, ry, 0, Math.PI, TAU); g.stroke(); } }
  g.restore();
}

/** La ilustración del duelo (S: la postura, la silueta del jefe y lo que pasa entre los dos), por partes (cada yield, un
 * fotograma): así no se congela la imagen mientras se pinta. RepArena: CIN.paintGen, a 960 × 540. */
export function* duelPaint(g: Ctx, W: number, H: number, S: Pick<DuelScene, 'pose' | 'boss' | 'what'>): Generator<void> {
  const R = RNG(91); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  const lt = background(g, W, H, R), pose = POSE[S.pose] || POSE.squat, floor = S.pose === 'plank';
  const hero = { x: (floor ? 0.27 : 0.14) * W, y: 0.95 * H, h: (floor ? 0.5 : S.pose === 'hang' ? 0.6 : 0.72) * H };
  if (S.pose === 'hang') hero.y = 0.86 * H;
  const tp: ToPx = Object.assign((lx: number, ly: number): Pt => [hero.x + hero.h * lx, hero.y - hero.h * ly], { s: hero.h });
  const BP: Record<string, [number, number, number]> = { yeti: [0.8, 0.97, 0.82], spider: [0.8, 0.96, 0.62], dragon: [0.78, 0.8, 0.62], mace: [0.73, 0.62, 0.4], tentacle: [0.8, 0.97, 0.8] };
  const B = (S.boss && BP[S.boss]) || [0.8, 0.97, 0.78];
  const boss = S.boss && FOES[S.boss] ? { k: S.boss, x: B[0] * W, y: B[1] * H, s: B[2] * H } : null;
  const shadow = (x: number, y: number, w: number) => { g.save(); g.translate(x, y); g.scale(1, 0.18); g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(0, 0, w, 0, TAU); g.fill(); g.restore(); };
  if (boss && boss.k !== 'mace' && boss.k !== 'dragon') shadow(boss.x, boss.y, boss.s * 0.45);
  shadow(hero.x + hero.h * (floor ? -0.25 : 0.05), S.pose === 'hang' ? 0.95 * H : hero.y, hero.h * (floor ? 0.65 : 0.3));
  if (S.what === 'arcs') for (let k = 4; k >= 1; k--) { const t = (k / 4) ** 0.75, x = lerp(hero.x + hero.h * 0.5, lt.x + W * 0.25, t), gy = lerp(hero.y, 0.62 * H, t), s = lerp(0.95, 0.12, t); arch(g, x, gy, hero.h * 0.17 * s, hero.h * 0.8 * s, k % 2 ? '#ffd166' : '#ff4fa3', lerp(1, 0.55, t), 0); }
  yield;
  // el jefe
  let info: FoeInfo = {};
  if (boss) {
    const lit: Light[] = S.what === 'bolt' ? [[boss.x - boss.s * 0.3, boss.y - boss.s * 0.55, boss.s * 0.45, P.bolt, 0.3]] : [];
    info = litFigure(g, W, H, { x: boss.x, y: boss.y, s: boss.s, flip: 1, lx: lt.x, ly: lt.y, l2: [-0.9, -0.3], rim: P.rim, rim2: mix(P.bolt, '#ffffff', 0.3), dark: '#140e1a', lights: lit }, (c) => FOES[boss.k](c));
    const px = (lx: number, ly: number): Pt => [boss.x + boss.s * lx, boss.y - boss.s * ly];
    const eyeCol = info.eyeCol as string; // (los que tienen ojos, cuencas o ventosas traen su color)
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const e of info.eyes || []) { const [x, y] = px(e[0], e[1]); glow(g, x, y, boss.s * e[2] * 5, eyeCol); glow(g, x, y, boss.s * e[2] * 1.2, '#ffffff'); }
    if (info.eye) { const [x, y] = px(info.eye[0], info.eye[1]); glow(g, x, y, boss.s * info.eye[2] * 3, eyeCol); g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(x, y, boss.s * info.eye[2], 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#120a02'; g.beginPath(); g.arc(x - boss.s * 0.03, y, boss.s * info.eye[2] * 0.45, 0, TAU); g.fill(); g.globalCompositeOperation = 'lighter'; }
    for (const e of info.sockets || []) { const [x, y] = px(e[0], e[1]); glow(g, x, y, boss.s * e[2] * 2.6, eyeCol); }
    for (const e of info.suckers || []) { const [x, y] = px(e[0], e[1]); glow(g, x, y, boss.s * e[2] * 2.2, eyeCol, 0.7); }
    if (info.mouth) { const [x, y] = px(info.mouth[0], info.mouth[1]); glow(g, x, y, boss.s * info.mouth[2] * 1.6, '#ff6a2a', 0.8); }
    if (info.core) { const [x, y] = px(info.core[0], info.core[1]); glow(g, x, y, boss.s * info.core[2] * 2.5, '#ff3b5c', 0.8); }
    g.restore();
  }
  yield;
  if (S.what === 'rings') { g.save(); g.globalCompositeOperation = 'lighter'; for (const [x, y, r] of [[0.76, 0.5, 0.17], [0.6, 0.44, 0.08], [0.9, 0.36, 0.06]]) { g.strokeStyle = 'rgba(80,240,220,0.8)'; g.lineWidth = H * r * 0.28; g.beginPath(); g.ellipse(x * W, y * H, H * r, H * r * 0.82, 0, 0, TAU); g.stroke(); glow(g, x * W, y * H, H * r * 1.6, '#3cf0c6', 0.35); } g.restore(); }
  // tú: un halo frío a la espalda, lo de atrás más oscuro y lo de delante con la luz de la bola de energía
  g.save(); g.globalCompositeOperation = 'lighter'; const [bx, by] = tp(-0.15, 0.6); glow(g, bx, by, hero.h * 0.75, '#3a5cff', 0.32); g.restore();
  if (S.pose === 'hang') { const [x1, y1] = tp(-0.35, 1.19), [x2] = tp(0.4, 1.19); g.save(); g.strokeStyle = '#9aa0b8'; g.lineWidth = hero.h * 0.03; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y1); g.stroke(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,220,180,0.5)'; g.lineWidth = hero.h * 0.008; g.beginPath(); g.moveTo(x1, y1 - hero.h * 0.008); g.lineTo(x2, y1 - hero.h * 0.008); g.stroke(); g.restore(); }
  const hand = floor ? tp(0.42, 0.24) : tp(pose.wr[0] + 0.05, pose.wr[1]), HL: Light[] = [[hand[0], hand[1], hero.h * 0.42, S.what === 'arcs' ? '#ff4fa3' : P.bolt, 0.55]];
  const HO: LitOpts = { x: hero.x, y: hero.y, s: hero.h, flip: 1, lx: lt.x, ly: lt.y, l2: [-0.75, -0.66], rim: P.rim, rim2: '#8fb4ff', dark: '#120d1c', lights: HL };
  litFigure(g, W, H, { ...HO, rim: mix(P.rim, P.dark, 0.45), rim2: mix('#8fb4ff', P.dark, 0.45), dark: '#08060c' }, (c) => heroParts(c, pose, true));
  yield;
  litFigure(g, W, H, HO, (c) => heroParts(c, pose)); heroLights(g, tp, pose, P.bolt);
  yield;
  // lo que pasa entre los dos
  if (S.what === 'bolt' && boss) {
    const ty = boss.y - boss.s * (boss.k === 'spider' ? 0.35 : boss.k === 'crab' ? 0.3 : 0.55), tx = boss.x + boss.s * (boss.k === 'spider' ? -0.05 : 0);
    energyBall(g, hand[0], hand[1], hero.h * 0.045, P.bolt, R); bolt(g, hand[0], hand[1], tx, ty, P.bolt, R, Math.max(2, hero.h * 0.009));
  } else if (S.what === 'arcs') {
    arch(g, hero.x + hero.h * 0.12, hero.y, hero.h * 0.13, hero.h * 0.7, '#ff4fa3', 1, 2);
    const [hx, hy] = tp(0.1, 0.62); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let k = 0; k < 7; k++) { const y = hy - hero.h * (0.02 + k * 0.025); g.beginPath(); g.moveTo(hx + hero.h * (0.2 + R() * 0.2), y); g.lineTo(hx + hero.h * (0.7 + R() * 0.5), y); g.stroke(); } g.restore();
  } else if (S.what === 'bubble') { const [x, y] = tp(0.08, 1.42); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(190,240,255,0.8)'; g.lineWidth = hero.h * 0.01; g.beginPath(); g.arc(x, y, hero.h * 0.12, 0, TAU); g.stroke(); glow(g, x - hero.h * 0.04, y - hero.h * 0.04, hero.h * 0.05, '#ffffff', 0.8); glow(g, x, y, hero.h * 0.22, '#7fc4ff', 0.3); g.restore(); }
  else if (S.what === 'diamond') { const [x, y] = tp(0.36, 1.06), s = hero.h * 0.07; g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, s * 4, '#ff8a3d', 0.7); g.fillStyle = '#ffb36b'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); g.restore(); }
  // brasas, etalonaje y viñeta
  g.save(); g.globalCompositeOperation = 'lighter'; for (let k = 0; k < 140; k++) { const x = R() * W, y = R() * H, r = 0.6 + R() * 2.4, c = R() < 0.7 ? '#ff9a4a' : '#ff4fa3'; g.fillStyle = rgba(c, (0.2 + R() * 0.6).toFixed(2)); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } g.restore();
  g.save(); g.globalCompositeOperation = 'soft-light'; let gr = g.createLinearGradient(0, H, W, 0); gr.addColorStop(0, 'rgba(40,200,190,0.5)'); gr.addColorStop(1, 'rgba(255,120,60,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  gr = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.78); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.72)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}

/** Lo que no cambia de una ronda a otra (la ilustración ampliada, los tintes, el tajo de luz, el título y el VS: con
 * resplandores, lo caro de pintar), preparado en el menú. RepArena: introDeco, a 1280 × 720; name y sub, de duelName y duelSub. */
export function duelDeco(c: Ctx, W: number, H: number, art: CanvasImageSource, name: string, sub: string): void {
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.clearRect(0, 0, W, H); c.drawImage(art, 0, 0, W, H);
  c.shadowBlur = 0; c.textBaseline = 'middle';
  // el tinte de cada bando y el tajo de luz del centro
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(29,107,255,0.16)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.56, 0); c.lineTo(W * 0.44, H); c.lineTo(0, H); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,42,42,0.14)'; c.beginPath(); c.moveTo(W * 0.56, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W * 0.44, H); c.closePath(); c.fill();
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.strokeStyle = gr;
  for (const [lw, a] of [[40, 0.08], [20, 0.16], [6, 1]]) { c.globalAlpha = a; c.lineWidth = lw; c.beginPath(); c.moveTo(W * 0.56, 0); c.lineTo(W * 0.44, H); c.stroke(); } c.globalAlpha = 1; c.restore();
  // arriba: el modo y la zona, y el nombre del ejercicio
  c.textAlign = 'center'; c.fillStyle = '#ffd166'; fitFont(c, sub, W * 0.6, 28, '800 %px ' + FB); c.fillText(sub, W / 2, 44);
  fitFont(c, name, W * 0.62, 76, '%px ' + FD);
  c.fillStyle = '#000000'; c.fillText(name, W / 2 + 4, 104); c.fillStyle = '#ffffff'; c.fillText(name, W / 2, 100);
  // el VS
  c.save(); c.translate(W / 2, H * 0.42); c.rotate(-0.1); c.font = `200px ${FO}`; c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#000000'; c.strokeText('VS', 0, 0);
  c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#ffd166'; for (const [lw, a] of [[70, 0.06], [46, 0.1], [28, 0.16]]) { c.globalAlpha = a; c.lineWidth = lw; c.strokeText('VS', 0, 0); } // (el resplandor, sin desenfoque: va mucho más deprisa)
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.lineWidth = 16; c.strokeStyle = '#000000'; c.strokeText('VS', 0, 0); c.fillStyle = '#ffffff'; c.fillText('VS', 0, 0); c.restore();
}

/** Los datos de las placas de abajo (RepArena, introDraw: rankName(), introRecord(), nWaves(), nLives(), waveReps(0), la de
 * la última oleada —null al fallo—, «Arcos», «Segundos» o «Reps», e introBoss()). */
export interface DuelPlates {
  rank: string;
  record: string;
  nWaves: number;
  lives: number;
  r0: number;
  rN: number | null;
  unit: string;
  boss: DuelBoss;
}

/** Al empezar la ronda: la carátula ya preparada (card, de duelDeco) y, encima, las placas: tú (rango y récord) y el jefe,
 * con sus barras. RepArena: introDraw. */
export function duelPlates(c: Ctx, W: number, H: number, card: CanvasImageSource, p: DuelPlates): void {
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.shadowBlur = 0; c.clearRect(0, 0, W, H); c.drawImage(card, 0, 0);
  c.textBaseline = 'middle';
  const plate = (x: number, right: boolean, role: string, who: string, whoCol: string, line: string, bars: [string, number, string][], cols: [string, string]) => {
    const al = right ? 'right' : 'left', X = right ? x - 470 : x; let y = H - 214;
    c.textAlign = al; c.fillStyle = 'rgba(255,255,255,0.85)'; fitFont(c, role, 470, 24, '700 %px ' + FB); c.fillText(role, x, y); y += 46;
    fitFont(c, who, 470, 60, `%px ${FO}`); c.fillStyle = '#000000'; c.fillText(who, x + 3, y + 3); c.fillStyle = whoCol; c.fillText(who, x, y); y += 42;
    if (line) { c.fillStyle = '#ffd166'; fitFont(c, line, 470, 26, '700 %px ' + FB); c.fillText(line, x, y); } y += 34;
    for (const [l, k, v] of bars) {
      c.textAlign = 'left'; c.fillStyle = '#ffffff'; fitFont(c, l, 150, 24, '700 %px ' + FB); c.fillText(l, X, y);
      const bx = X + 158, bw = 220; rr(c, bx, y - 7, bw, 14, 7); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill();
      const fw = Math.max(14, bw * clamp(k, 0, 1)), g2 = c.createLinearGradient(bx, 0, bx + bw, 0); g2.addColorStop(0, cols[0]); g2.addColorStop(1, cols[1]); c.fillStyle = g2; rr(c, right ? bx + bw - fw : bx, y - 7, fw, 14, 7); c.fill();
      c.textAlign = 'right'; c.fillStyle = '#ffffff'; fitFont(c, v, 86, 24, '700 %px ' + FB); c.fillText(v, X + 470, y); y += 34;
    }
  };
  const N = p.nWaves, L = p.lives, r0 = p.r0, rN = p.rN, B = p.boss;
  plate(40, false, `JUGADOR · RANGO ${p.rank.toUpperCase()}`, 'TÚ', '#7fc4ff', p.record,
    [['Oleadas', N ? N / 10 : 1, N ? `${N}` : 'al fallo'], [p.unit, clamp(r0 / 30, 0.1, 1), rN && rN !== r0 ? `${r0} → ${rN}` : `${r0}`], ['Vidas', L ? L / 5 : 1, L ? `${L}` : '∞']], ['#3cf0c6', '#7fc4ff']);
  plate(W - 40, true, B.note.toUpperCase(), B.name.toUpperCase(), '#ff8a8a', '', B.bars, ['#ff8a3d', '#ff3b5c']);
}
