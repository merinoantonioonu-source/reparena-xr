/**
 * Las cortinillas de cada ejercicio (elegidas por el usuario: «Modelo 2», estilo HUD holográfico, una por modo y ejercicio, en
 * `public/cortinillas/<modo>-<ejercicio>.jpg`): la pantalla grande de antes de cada ronda (en la carátula del duelo, view-panels.ts;
 * la caricatura animada se queda en su sitio). Son quietas y la franja de abajo, que en las imágenes dice «OLEADAS: 3 ·
 * VIDAS: 3», se tapa con una igual que dice lo que tú tienes puesto (`cortInfo`). Si la imagen no ha cargado, la carátula
 * de siempre.
 */
import { exOk } from '../core/catalog.js';
import { FB, fitFont, rr } from './canvas-kit.js';

/** Lo que miden las imágenes (px) y la franja que se tapa (en esas medidas: cubre la de todas, que cambia un poco). */
export const CORT_W = 1024, CORT_H = 572;
/** Las que aún no tienen la suya y usan la de otro (la Travesía en plancha, la de las flexiones de Combate, hasta que el
 * usuario dé la suya: `public/cortinillas/LEEME.md`). */
// (los de glúteos, con la de la zancada y la de la sentadilla con salto hasta que el usuario dé las suyas)
const CORT_SAME: Record<string, string> = { 'trek-pushup': 'combat-pushup', 'combat-slunge': 'combat-lunge', 'combat-skater': 'combat-jsquat' };
const BADGE = { x0: 418, x1: 958, y0: 668, y1: 752, w: 1376, h: 768 } as const;

/** La dirección de la cortinilla de un modo y ejercicio (o null si ese ejercicio no está en ese modo). */
export function cortUrl(mode: string, ex: string, base = '/'): string | null {
  if (!exOk(mode, ex)) return null;
  const k = `${mode}-${ex}`;
  return `${base}cortinillas/${CORT_SAME[k] ?? k}.jpg`;
}

/** El texto de la franja de abajo: las oleadas (en la Travesía, los tramos; «Al fallo» o sin fin) y las vidas (la Travesía
 * no quita vidas: solo los tramos). `waves` 0 es sin fin; `lives` 0, infinitas. */
export function cortInfo(mode: string, waves: number, lives: number, toFail: boolean): string {
  const w = toFail ? 'AL FALLO' : mode === 'trek' ? `TRAMOS: ${waves || 'SIN FIN'}` : `OLEADAS: ${waves || 'SIN FIN'}`;
  if (mode === 'trek') return w;
  return `${w}      VIDAS: ${lives || 'INFINITAS'}`;
}

/** Las imágenes ya pedidas (como mucho unas pocas: la de ahora y las de antes). */
const IMGS = new Map<string, HTMLImageElement>();

/** La imagen de esa dirección si ya está cargada (si no, la pide y devuelve null). */
export function cortImage(url: string): HTMLImageElement | null {
  let im = IMGS.get(url);
  if (!im) {
    if (typeof Image === 'undefined') return null;
    if (IMGS.size >= 6) IMGS.delete(IMGS.keys().next().value as string);
    im = new Image();
    im.decoding = 'async';
    im.src = url;
    IMGS.set(url, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

/** Pinta la cortinilla en el lienzo (W×H) con su franja de abajo con `info`. */
export function cortDraw(c: CanvasRenderingContext2D, W: number, H: number, img: CanvasImageSource, info: string): void {
  c.clearRect(0, 0, W, H);
  c.drawImage(img, 0, 0, W, H);
  // la franja: del mismo estilo (cristal oscuro con el borde turquesa) y algo más grande que la de cualquier imagen
  // (las medidas de la franja son de las imágenes originales, de 1376 × 768: se pasan a las del lienzo)
  const kx = W / BADGE.w, ky = H / BADGE.h, x0 = BADGE.x0 * kx, y0 = BADGE.y0 * ky, w = (BADGE.x1 - BADGE.x0) * kx, h = (BADGE.y1 - BADGE.y0) * ky, k = kx;
  rr(c, x0, y0, w, h, h / 2);
  c.fillStyle = 'rgba(12,26,38,0.97)';
  c.fill();
  c.lineWidth = Math.max(1, 2 * k);
  c.strokeStyle = 'rgba(126,226,255,0.55)';
  c.stroke();
  const size = fitFont(c, info, w - h, Math.round(h * 0.46), `500 %px ${FB}`);
  c.font = `500 ${size}px ${FB}`;
  c.fillStyle = '#d8f6ff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(info, x0 + w / 2, y0 + h / 2 + size * 0.04);
}
