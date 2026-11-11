/** Un cartel pintado en un lienzo: un plano con su textura (RepArena: makePanel, src/30_env.js). */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { mkCanvas } from './canvas-kit.js';

export interface CanvasPanel {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mesh: Mesh;
  mat: MeshBasicMaterial;
  /** Ancho y alto en metros y en píxeles del lienzo. */
  w: number;
  h: number;
  W: number;
  H: number;
}
/** Un plano de w × h metros con un lienzo de px de ancho (RepArena: makePanel). Sin prueba de profundidad, encima de todo. */
export function makeCanvasPanel(w: number, h: number, px: number, depthTest = true): CanvasPanel {
  const canvas = mkCanvas(px, Math.round((px * h) / w)), ctx = canvas.getContext('2d')!, tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthTest, depthWrite: depthTest, alphaTest: 0.04, toneMapped: false, fog: false });
  const mesh = new Mesh(new PlaneGeometry(w, h), mat);
  mesh.userData.noInk = true; // (sin contorno de tinta: es un cartel)
  if (!depthTest) mesh.renderOrder = 30;
  return { canvas, ctx, tex, mesh, mat, w, h, W: canvas.width, H: canvas.height };
}

