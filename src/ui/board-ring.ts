/**
 * El rosco doble del marcador (diseño C, elegido por el usuario; RepArena, src/60_ui.js: boardRing y boardSegs): fuera, la
 * oleada (lo que llevas de ella; en el descanso, la cuenta atrás), con la muesca de tu mejor ronda y, si vas por delante,
 * la punta dorada; dentro, la racha en 10 tramos (cada vuelta, otro color: dorado, rosa, blanco); en medio, tus
 * repeticiones. Se dibuja en un lienzo pequeño que el panel del marcador enseña como imagen (los arcos no los hace UIKit);
 * los textos del marcador, con las letras de UIKit.
 */
import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';

const TAU = Math.PI * 2;
const BC = { teal: '#3cf0c6', pink: '#ff4fa3', gold: '#ffd166' };
const S = 256; // (el lienzo, en píxeles: cabe el rosco de RepArena a escala)

export interface RingState {
  /** Lo que llevas de la oleada (0-1), la muesca de tu récord (0-1, o -1) y si vas por delante. */
  k: number;
  notch: number;
  ahead: boolean;
  /** La racha (combo) y si va el relámpago (el rosco, dorado). */
  combo: number;
  gold: boolean;
  /** El número de en medio (tus repeticiones). */
  big: string;
}

export class BoardRing {
  readonly canvas: HTMLCanvasElement;
  readonly tex: CanvasTexture;
  private last = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
  }

  /** Lo vuelve a pintar (solo si ha cambiado algo). Devuelve si ha cambiado. */
  draw(r: RingState, font: string): boolean {
    const key = `${r.k.toFixed(3)}|${r.notch.toFixed(3)}|${r.ahead}|${r.combo}|${r.gold}|${r.big}|${font}`;
    if (key === this.last) return false;
    this.last = key;
    const c = this.canvas.getContext('2d')!, x = S / 2, y = S / 2;
    c.clearRect(0, 0, S, S);
    // fuera, la oleada: el aro de fondo y lo que llevas, con su degradado
    const R = 104, lw = 20;
    c.save();
    c.lineCap = 'round';
    c.lineWidth = lw;
    c.strokeStyle = 'rgba(20,12,26,0.55)';
    c.beginPath();
    c.arc(x, y, R, 0, TAU);
    c.stroke();
    if (r.k > 0) {
      const g = c.createLinearGradient(x - R, y - R, x + R, y + R), c0 = r.gold ? BC.gold : BC.teal, c1 = r.gold ? '#fff3c4' : '#7af7ff';
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      c.strokeStyle = g;
      c.beginPath();
      c.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, r.k));
      c.stroke();
      if (r.ahead) {
        const a = -Math.PI / 2 + TAU * Math.min(1, r.k);
        c.fillStyle = BC.gold;
        c.beginPath();
        c.arc(x + Math.cos(a) * R, y + Math.sin(a) * R, lw * 0.62, 0, TAU);
        c.fill();
      }
    }
    c.restore();
    if (r.notch >= 0) {
      const a = -Math.PI / 2 + TAU * r.notch, r0 = R - lw * 0.85, r1 = R + lw * 0.85;
      c.save();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      c.stroke();
      c.restore();
    }
    // dentro, la racha en 10 tramos (al llegar a 10, el tramo entero; cada vuelta, otro color)
    const full = r.combo > 0 && r.combo % 10 === 0, n = full ? 10 : r.combo % 10, lap = full ? r.combo / 10 - 1 : Math.floor(r.combo / 10);
    const col = [BC.gold, BC.pink, '#ffffff'][Math.max(0, Math.min(2, lap))], gap = 0.07, R2 = 78;
    c.save();
    c.lineWidth = 14;
    c.lineCap = 'butt';
    for (let i = 0; i < 10; i++) {
      c.strokeStyle = i < n ? col : 'rgba(20,12,26,0.5)';
      c.beginPath();
      c.arc(x, y, R2, -Math.PI / 2 + (TAU * i) / 10 + gap, -Math.PI / 2 + (TAU * (i + 1)) / 10 - gap);
      c.stroke();
    }
    c.restore();
    // en medio, tus repeticiones (lo más grande que quepa)
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let fs = 92;
    c.font = `${fs}px ${font}`;
    while (fs > 30 && c.measureText(r.big).width > 120) c.font = `${(fs -= 4)}px ${font}`;
    c.lineWidth = 8;
    c.strokeStyle = '#140c1a';
    c.strokeText(r.big, x, y + 6);
    c.fillStyle = '#ffffff';
    c.fillText(r.big, x, y + 6);
    this.tex.needsUpdate = true;
    return true;
  }
}
