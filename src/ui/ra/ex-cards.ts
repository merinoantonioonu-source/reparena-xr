/**
 * Las fichas de los ejercicios del menú grande (modelo A del usuario: «los ejercicios pasan a fichas con su cortinilla»,
 * más fáciles de acertar con el rayo que una tecla de texto): la imagen pequeña de su cortinilla
 * (`public/cortinillas/fichas`) y su nombre debajo. Las imágenes se piden todas al arrancar (son pocas y pequeñas) y, cuando
 * están las del modo que se ve, el menú se rehace una sola vez (rehacerlo con cada imagen que llega daba tirones).
 */
import { MODE_EX } from '../../core/catalog.js';
import { FB, fitFont, rr } from '../canvas-kit.js';
import { fichaUrl } from '../cortinilla.js';

const IMGS = new Map<string, HTMLImageElement>();
/** Lo que hace cuando ya están todas las de un modo (lo pone el menú: rehacerse si las enseña). */
export const FICHAS = { onReady: (_mode: string): void => {} };

const key = (mode: string, ex: string): string => mode + '|' + ex;
const ok = (im: HTMLImageElement | undefined): im is HTMLImageElement => !!im && im.complete && im.naturalWidth > 0;

/** Pide todas las fichas (una vez). */
export function fichasLoad(base = '/'): void {
  if (IMGS.size || typeof Image === 'undefined') return;
  for (const [mode, exs] of Object.entries(MODE_EX))
    for (const ex of exs) {
      const url = fichaUrl(mode, ex, base);
      if (!url) continue;
      const im = new Image();
      im.decoding = 'async';
      const done = (): void => {
        if (fichasReady(mode)) FICHAS.onReady(mode);
      };
      im.onload = done;
      im.onerror = done;
      im.src = url;
      IMGS.set(key(mode, ex), im);
    }
}
/** ¿Han llegado (o fallado) ya todas las de ese modo? */
export function fichasReady(mode: string): boolean {
  return (MODE_EX[mode] ?? []).every((ex) => {
    const im = IMGS.get(key(mode, ex));
    return !im || im.complete;
  });
}
/** La imagen de la ficha, si ya está. */
export const fichaImg = (mode: string, ex: string): HTMLImageElement | null => {
  const im = IMGS.get(key(mode, ex));
  return ok(im) ? im : null;
};

/** Pinta la ficha en la tecla (W × H px; `tc`, el color del texto): la imagen arriba, recortada para llenar su hueco sin
 * deformarse, y el nombre debajo. Sin imagen, el nombre solo, en grande. La elegida lleva un marco amarillo (su color claro se
 * confundía con el de las que aún no se pueden jugar, que salen apagadas). */
export function paintFicha(c: CanvasRenderingContext2D, W: number, H: number, tc: string, name: string, img: HTMLImageElement | null, state: 'sel' | 'off' | '' = ''): void {
  const m = Math.max(3, Math.round(H * 0.05)), labH = img ? H * 0.34 : H;
  if (img) {
    const x = m, y = m, w = W - m * 2, h = H - labH - m;
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k;
    c.save();
    rr(c, x, y, w, h, Math.min(h * 0.16, 14));
    c.clip();
    if (state === 'off') c.globalAlpha = 0.3;
    c.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
    c.restore();
  }
  if (state === 'sel') {
    const lw = Math.max(4, Math.round(H * 0.07));
    rr(c, lw / 2 + 1, lw / 2 + 1, W - lw - 2, H - lw - 2, Math.min(H * 0.22, 22));
    c.lineWidth = lw;
    c.strokeStyle = '#ffd23f';
    c.stroke();
  }
  c.fillStyle = tc;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  fitFont(c, name, W - m * 3, Math.round(img ? labH * 0.7 : H * 0.4), '700 %px ' + FB);
  c.fillText(name, W / 2, H - labH / 2 - (img ? m * 0.3 : 0) + 2);
}
