/**
 * El medidor de fotogramas (Ajustes → «Medidor de fotogramas»; RepArena: perfStep, src/80_main.js) y el registro de tirones
 * (src/core/hitch.ts). Dos sistemas: el primero corre antes que todos (apunta cuándo empieza el fotograma) y el segundo,
 * después de todos (lo que tardó el juego); lo que tarda en mandarse el dibujo se mide alrededor del pintado de la escena.
 *  - El medidor, abajo a la izquierda de la vista (pegado a la cabeza: es pequeño y no se toca): fotogramas por segundo, el
 *    peor de cada medio segundo, los que se pierden, lo que tardan el juego y el dibujo, los píxeles de cada ojo, la
 *    foveación y las llamadas de dibujo.
 *  - Al salir de las gafas, el registro de tirones se guarda y la página lo resume (#hitchStatus).
 */
import { CanvasTexture, createSystem, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, VisibilityState } from '@iwsdk/core';
import { HITCH_KEY, hitchNote, hitchSave, hitchText, type HitchLog } from '../core/hitch.js';
import { store } from '../core/settings.js';
import { on } from '../core/values.js';
import { GAME } from '../core/state.js';
import { FB, mkCanvas, rr } from './canvas-kit.js';

/** Los tiempos del fotograma (los apunta PerfStartSystem y el pintado de la escena). */
const T = { start: 0, prev: 0, gap: 0, rd0: 0, rd: 0 };

/** Corre antes que todos: cuándo empieza este fotograma y cuánto pasó desde el anterior. */
export class PerfStartSystem extends createSystem({}, {}) {
  update(): void {
    const now = performance.now();
    T.gap = T.prev ? (now - T.prev) / 1000 : 0;
    T.prev = T.start = now;
  }
}

/** Corre después de todos: lo que tardó el juego, el medidor y el registro de tirones. */
export class PerfSystem extends createSystem({}, {}) {
  private panel!: Mesh;
  private c!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private P = { n: 0, t0: 0, worst: 0, lost: 0, js: 0, rd: 0 };
  private inXR = false;

  init(): void {
    const cv = mkCanvas(1024, 313);
    this.c = cv.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(cv);
    this.tex.colorSpace = SRGBColorSpace;
    this.panel = new Mesh(new PlaneGeometry(0.36, 0.11), new MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.panel.renderOrder = 1000;
    this.panel.visible = false;
    this.panel.position.set(-0.22, -0.21, -0.7);
    this.panel.userData.noInk = true;
    this.world.camera.add(this.panel);
    // lo que tarda en mandarse el dibujo (alrededor del pintado de la escena)
    const s = this.scene, b = s.onBeforeRender, a = s.onAfterRender;
    s.onBeforeRender = function (...x: Parameters<typeof b>) {
      T.rd0 = performance.now();
      b.apply(this, x);
    };
    s.onAfterRender = function (...x: Parameters<typeof a>) {
      a.apply(this, x);
      T.rd = performance.now() - T.rd0;
    };
    const el = document.getElementById('hitchStatus');
    if (el) el.textContent = hitchText(store<HitchLog>(HITCH_KEY));
  }

  update(delta: number, time: number): void {
    const js = performance.now() - T.start, inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive, ri = this.world.renderer.info;
    hitchNote(T.gap, js, T.rd, ri.memory.textures, ri.programs?.length ?? 0, GAME.phase, GAME.menu !== 'none', inXR);
    if (this.inXR && !inXR) {
      // al salir de las gafas: se guarda y la página lo cuenta
      const L = hitchSave((k, v) => store(k, v));
      const el = document.getElementById('hitchStatus');
      if (el) el.textContent = hitchText(L);
    }
    this.inXR = inXR;
    this.step(time, Math.min(0.25, T.gap || delta), js, T.rd, inXR);
  }

  private step(t: number, dt: number, js: number, rd: number, inXR: boolean): void {
    const show = on('perfHud');
    this.panel.visible = show;
    if (!show) return;
    const P = this.P, xs = this.world.renderer.xr.getSession(), hz = (xs as XRSession & { frameRate?: number } | null)?.frameRate || 72;
    P.n++;
    P.worst = Math.max(P.worst, dt);
    if (dt > 1.5 / hz) P.lost++;
    P.js = Math.max(P.js, js);
    P.rd = Math.max(P.rd, rd);
    if (t - P.t0 < 0.5) return;
    const fps = P.n / Math.max(1e-3, t - P.t0), c = this.c, W = 1024, H = 313, bad = P.lost > 0;
    c.clearRect(0, 0, W, H);
    rr(c, 2, 2, W - 4, H - 4, 10);
    c.fillStyle = 'rgba(10,8,20,0.8)';
    c.fill();
    c.fillStyle = bad ? '#ff8a3d' : '#3cf0c6';
    c.font = '600 64px ' + FB;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(`${Math.round(fps)} fps · peor ${Math.round(P.worst * 1000)} ms · perdidos ${P.lost}`, 24, H * 0.22);
    // lo que tarda el juego en pensar y en mandar el dibujo; si son poco y aun así va lento, lo que no llega es la gráfica
    c.fillStyle = '#eeeaff';
    c.font = '500 52px ' + FB;
    c.fillText(`juego ${P.js.toFixed(1)} ms · dibujo ${P.rd.toFixed(1)} ms (lo peor)`, 24, H * 0.54);
    // la nitidez: los píxeles de cada ojo y la foveación de ahora, y las llamadas de dibujo
    const L = xs?.renderState?.baseLayer as XRWebGLLayer | undefined, px = inXR && L?.framebufferWidth ? `${Math.round(L.framebufferWidth / 2)}×${L.framebufferHeight} por ojo` : 'sin gafas';
    const fov = L && 'fixedFoveation' in L ? (L as XRWebGLLayer & { fixedFoveation?: number }).fixedFoveation : undefined;
    c.fillText(`${px}${fov !== undefined && fov !== null ? ` · foveación ${fov.toFixed(2)}` : ''} · ${this.world.renderer.info.render.calls} llamadas`, 24, H * 0.83);
    this.tex.needsUpdate = true;
    Object.assign(P, { n: 0, t0: t, worst: 0, lost: 0, js: 0, rd: 0 });
  }
}
