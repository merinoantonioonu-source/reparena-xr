/**
 * Lo común de lo que se pinta en un lienzo (la carátula del duelo, la caricatura del ejercicio, la ×N de la bola, el rosco
 * del marcador), como en RepArena (src/30_env.js: makePanel, rr, FD, FB, fitFont; src/20_render.js: mkCanvas): las letras
 * (las mismas de los paneles: Bungee, Rubik y, para la carátula, Black Ops One, en public/fonts), un panel de lienzo
 * (un plano con su textura) y el tamaño de letra para que un texto quepa. Los paneles de UIKit no sirven para esto: son
 * dibujos (siluetas, rayos, el monigote), no texto. Sin IWSDK (el plano con el lienzo, en canvas-panel.ts).
 */
/** Las familias de letra del lienzo (RepArena: FD, títulos y números; FB, el texto; FO, el VS y los nombres del duelo). */
export const FD = '"Bungee","Arial Black",sans-serif';
export const FB = '"Rubik",system-ui,sans-serif';
export const FO = '"Black Ops One","Bungee","Arial Black",sans-serif';

const FONTS: [string, string, string][] = [
  ['Bungee', 'Bungee-Regular.ttf', '400'],
  ['Rubik', 'Rubik-Medium.ttf', '500'],
  ['Rubik', 'Rubik-Bold.ttf', '700'],
  ['Black Ops One', 'BlackOpsOne-Regular.ttf', '400'],
];
let loading: Promise<void> | null = null;
/** Carga las letras del lienzo una vez (lo que se pinte antes sale con la del sistema y se repinta luego). */
export function loadCanvasFonts(): Promise<void> {
  if (loading) return loading;
  loading = Promise.all(
    FONTS.map(([fam, file, weight]) => {
      try {
        return new FontFace(fam, `url(${import.meta.env.BASE_URL}fonts/${file})`, { weight })
          .load()
          .then((f) => void document.fonts.add(f))
          .catch(() => {});
      } catch {
        return Promise.resolve(); // (sin FontFace: letra del sistema)
      }
    }),
  ).then(() => {
    fontsReady = true;
    fitW.clear();
  });
  return loading;
}
/** Si ya están las letras (para repintar lo que se pintó antes con la del sistema). */
export let fontsReady = false;

export function mkCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Rectángulo de esquinas redondas (el camino; luego fill o stroke). */
export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// El tamaño de letra para que el texto quepa: el ancho crece con el tamaño, así que basta medir una vez (y comprobar).
// Las medidas, en un lienzo aparte y recordadas (RepArena: fitWidth)
let fitCtx: CanvasRenderingContext2D | null = null;
const fitW = new Map<string, number>();
function fitWidth(font: string, text: string): number {
  const k = font + '\u0001' + text;
  let w = fitW.get(k);
  if (w !== undefined) return w;
  if (!fitCtx) fitCtx = mkCanvas(8).getContext('2d')!;
  if (fitCtx.font !== font) fitCtx.font = font;
  w = fitCtx.measureText(text).width;
  if (fitW.size > 4000) fitW.clear();
  fitW.set(k, w);
  return w;
}
/** Pone en c la letra (fam con % en el tamaño) más grande, hasta start, con la que text cabe en max. Devuelve el tamaño. */
export function fitFont(c: CanvasRenderingContext2D, text: string, max: number, start: number, fam: string): number {
  const w = fitWidth(fam.replace('%', String(start)), text);
  let fs = start;
  if (w > max && fs > 14) {
    fs = Math.max(14, Math.floor((start * max) / w));
    if (fs > 14 && fitWidth(fam.replace('%', String(fs)), text) > max) fs = Math.max(14, fs - 2);
  }
  c.font = fam.replace('%', String(fs));
  return fs;
}

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => t * t * (3 - 2 * t);
