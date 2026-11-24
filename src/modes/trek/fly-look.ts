/**
 * Lo que se ve del vuelo para orientarse (docs/PLAN-VUELO.md, 3.3; el usuario no entendía los controles):
 * - **Tu sombra**, en el suelo del paisaje justo debajo de ti: una mancha con forma de ave que dice dónde vas de lado y, por su
 *   tamaño y lo clara que es, a qué altura. Se ladea con la escora, se estrecha en el picado y se abre en la pica.
 * - **La ventana de cada reto** (opción A del usuario: las franjas de luz se veían azul pálido y no se entendía qué eran): un
 *   marco verde brillante, con su contorno oscuro, y cuatro flechas que señalan hacia dentro, «pasa por aquí», en la cara del
 *   reto: bajo el puente, al lado libre de la columna y en la raja de la grieta. El aro ya se ve.
 * - **Las reglillas** («Vuelo: instrumentos»): en el suelo de la habitación, por delante de las manos (en plancha se mira ahí),
 *   una de lado a lado (dónde vas) y otra hacia delante (a qué altura), con una marca verde donde está la ventana del reto que
 *   viene. Hechas de piezas que se mueven: nada se repinta.
 *
 * Todo hecho al empezar (mallas lisas y una textura dibujada una vez); cada fotograma solo se mueven y se aclaran.
 */
import { DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, RGBAFormat, UnsignedByteType } from '@iwsdk/core';
import { warmKeep } from '../../style/warm.js';
import { FLY } from './plat/fly.js';
import type { Runner } from './plat/runner.js';
import { GROUND_Y } from './plat/pieces.js';
import { ARCH_CLEAR, BERRY_R, CRACK_W, LAND_D, PILLAR_W, RING_R, STOP_AT, UPDRAFT_W, type Piece } from './plat/types.js';
import { WORLDS } from './plat/worlds.js';

/** Lo que se ve de lejos (m), el verde de las ventanas y su contorno oscuro, el grueso del marco (m) y lo que miden sus
 * flechas (m). */
const SEE = 70, WIN_COL = 0x39ff88, WIN_DARK = 0x06301a, WIN_T = 0.14, ARROW = 0.7;
/** Las reglillas: lo que miden (m), por delante de la cabeza (m) y la de la altura, a un lado (m). */
const G_W = 0.5, G_L = 0.4, G_AHEAD = 0.55, G_SIDE = 0.34;

/** La silueta de un ave con las alas abiertas (vista desde arriba: el pico hacia −v), dibujada una vez. */
function birdTex(): DataTexture {
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * 2 - 1, y = ((j + 0.5) / N) * 2 - 1, ax = Math.abs(x); // (la fila 0 es la de abajo de la textura: la cola; el pico, hacia delante)
      // el cuerpo, las alas (barridas hacia atrás, más finas en la punta) y la cola
      const body = (x / 0.12) ** 2 + (y / 0.55) ** 2;
      const wc = 0.12 - 0.3 * ax, wt = 0.2 * (1 - Math.pow(ax, 1.6));
      const wing = ax < 0.97 ? Math.abs(y - wc) / Math.max(1e-3, wt) : 9;
      const tail = y < -0.35 && y > -0.75 && ax < 0.06 + 0.35 * (-0.35 - y) ? 0 : 9;
      const m = Math.min(body, wing, tail === 0 ? 0.5 : 9);
      const a = Math.max(0, Math.min(1, (1 - m) * 3));
      d.set([255, 255, 255, Math.round(255 * a)], (j * N + i) * 4);
    }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Una flecha que apunta hacia arriba (+v): un cheurón verde con su contorno oscuro, dibujado una vez. */
function arrowTex(): DataTexture {
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * 2 - 1, y = ((j + 0.5) / N) * 2 - 1;
      // (la distancia al cheurón: dos brazos que se juntan arriba)
      const dist = Math.abs(y - (0.45 - 1.1 * Math.abs(x))) * 0.67;
      const inside = Math.abs(x) < 0.85 && y > -0.75;
      const a = inside ? Math.max(0, Math.min(1, (0.3 - dist) * 12)) : 0, core = inside && dist < 0.17;
      d.set(core ? [57, 255, 136, 255] : [6, 48, 26, Math.round(255 * a)], (j * N + i) * 4);
    }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Un marco de ventana: cuatro barras verdes (con su contorno oscuro detrás) y cuatro flechas por fuera que señalan hacia
 * dentro. `set` lo ajusta a un rectángulo de `w` × `h` m (las barras y las flechas no se estiran). */
class WinFrame {
  readonly g = new Group();
  private readonly bars: Mesh[] = [];
  private readonly outs: Mesh[] = [];
  private readonly arrows: Mesh[] = [];
  constructor(plane: PlaneGeometry, bar: MeshBasicMaterial, out: MeshBasicMaterial, arrow: MeshBasicMaterial) {
    for (let i = 0; i < 4; i++) {
      const o = new Mesh(plane, out), b = new Mesh(plane, bar), a = new Mesh(plane, arrow);
      for (const m of [o, b, a]) {
        m.userData.noInk = true;
        this.g.add(m);
      }
      o.renderOrder = 6;
      b.renderOrder = 7;
      a.renderOrder = 7;
      this.outs.push(o);
      this.bars.push(b);
      this.arrows.push(a);
    }
    this.g.rotation.order = 'YXZ';
    this.g.visible = false;
  }
  set(w: number, h: number, clock: number): void {
    const hw = w / 2, hh = h / 2, bob = 0.12 * Math.sin(clock * 6);
    // arriba, abajo, izquierda, derecha: dónde va cada barra y hacia dónde apunta su flecha (hacia dentro)
    for (let i = 0; i < 4; i++) {
      const hor = i < 2, sx = hor ? 0 : i === 2 ? -1 : 1, sy = hor ? (i === 0 ? 1 : -1) : 0;
      const b = this.bars[i], o = this.outs[i], a = this.arrows[i];
      b.position.set(sx * hw, sy * hh, 0.01);
      b.scale.set(hor ? w + WIN_T : WIN_T, hor ? WIN_T : h + WIN_T, 1);
      o.position.set(sx * hw, sy * hh, 0);
      o.scale.set(hor ? w + WIN_T * 2.2 : WIN_T * 2.2, hor ? WIN_T * 2.2 : h + WIN_T * 2.2, 1);
      const off = ARROW * 0.75 - bob;
      a.position.set(sx * (hw + off), sy * (hh + off), 0.01);
      a.scale.set(ARROW, ARROW, 1);
      // (la flecha dibujada apunta arriba: se gira para que apunte al centro)
      a.rotation.z = hor ? (sy > 0 ? Math.PI : 0) : sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
}

/** Dónde va algo del recorrido: rellena `out` (x, z) y devuelve hacia dónde gira el sendero ahí (la de `Trek.bend`). */
export type Bend = (s: number, u: number, out: { x: number; z: number }) => number;

const flat = (m: Mesh): Mesh => {
  m.rotation.order = 'YXZ';
  m.rotation.x = -Math.PI / 2;
  m.userData.noInk = true;
  m.frustumCulled = false;
  return m;
};

export class FlyLook {
  /** Lo que va en el mundo (se mueve con él) y lo que va en la habitación (las reglillas). */
  readonly inWorld = new Group();
  readonly inRoom = new Group();
  private readonly shadow: Mesh;
  private readonly wins: WinFrame[] = [];
  private readonly winMats: MeshBasicMaterial[];
  /** La zona de aterrizaje ante el cofre: un marco verde tumbado en el suelo, donde te posas (aterrizas tú). */
  private readonly pad: WinFrame;
  private readonly g: Record<'hBar' | 'hWin' | 'hDot' | 'vBar' | 'vWin' | 'vDot' | 'vTgt', Mesh>;
  private readonly bp = { x: 0, z: 0 };
  /** Lo que lleva el batir de la sombra tras un aletazo (s). */
  private flapT = 9;
  private lastClock = 0;

  constructor() {
    const plane = new PlaneGeometry(1, 1);
    this.shadow = flat(new Mesh(plane, new MeshBasicMaterial({ color: 0x0c0a14, map: birdTex(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })));
    this.shadow.renderOrder = 2;
    this.inWorld.add(this.shadow);
    // (de color liso, no de luz que se suma: sobre el cielo claro, la luz verde se veía azul pálida)
    const bar = new MeshBasicMaterial({ color: WIN_COL, transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false });
    const out = new MeshBasicMaterial({ color: WIN_DARK, transparent: true, opacity: 0.7, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false });
    const arrow = new MeshBasicMaterial({ map: arrowTex(), transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false });
    this.winMats = [bar, out, arrow];
    for (let i = 0; i < 4; i++) {
      const f = new WinFrame(plane, bar, out, arrow);
      this.wins.push(f);
      this.inWorld.add(f.g);
    }
    this.pad = new WinFrame(plane, bar, out, arrow);
    this.inWorld.add(this.pad.g);
    const mk = (col: number, op: number): Mesh => {
      const m = flat(new Mesh(plane, new MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false, fog: false })));
      m.renderOrder = 9;
      this.inRoom.add(m);
      return m;
    };
    this.g = { hBar: mk(0x1a2230, 0.7), vBar: mk(0x1a2230, 0.7), hWin: mk(WIN_COL, 0.85), vWin: mk(WIN_COL, 0.85), vTgt: mk(0xffffff, 0.35), hDot: mk(0xffe45c, 1), vDot: mk(0xffe45c, 1) };
    this.g.hBar.scale.set(G_W, 0.014, 1);
    this.g.vBar.scale.set(0.014, G_L, 1);
    this.g.vBar.position.set(G_SIDE, 0, -G_L / 2);
    this.inWorld.visible = this.inRoom.visible = false;
    warmKeep(new Mesh(plane, this.shadow.material as MeshBasicMaterial));
    for (const m of this.winMats) warmKeep(new Mesh(plane, m));
  }

  /**
   * Cada fotograma: `on`, volando (en partida); `gauges`, con las reglillas; `bend` y `gy` (lo que sube el terreno en s, m, con
   * las cuestas), `ref` (la altura de la cabeza arriba de la plancha) y el centro del vuelo (`R.flyBody`) para las reglillas.
   */
  update(on: boolean, gauges: boolean, R: Runner, bend: Bend, gy: (s: number) => number, ref: number, clock: number): void {
    this.inWorld.visible = on;
    this.inRoom.visible = on && gauges && R.glider.alt > 0.3;
    if (!on) return;
    const G = R.glider, d = R.dist;
    // tu sombra: justo debajo (el mundo ya está desplazado a tu lado), más grande y más clara cuanto más alto
    const ry = bend(d, 0, this.bp), spread = G.diving ? 0.6 : G.pike ? 1.15 : 1, bank = Math.max(-1, Math.min(1, G.vU / 3));
    // (cada aletazo, la sombra bate: se abre y se cierra un instante)
    if (G.flapped) this.flapT = 0;
    this.flapT += Math.max(0, Math.min(0.1, clock - this.lastClock));
    this.lastClock = clock;
    const beat = this.flapT < 0.5 ? 0.35 * Math.sin((Math.PI * this.flapT) / 0.25) * (1 - this.flapT / 0.5) : 0;
    const k = 1 + 0.06 * G.alt;
    this.shadow.position.set(this.bp.x, GROUND_Y + gy(d) + 0.04, this.bp.z);
    this.shadow.visible = WORLDS[R.world % WORLDS.length].key !== 'sky'; // (en las islas en el cielo no hay suelo debajo)
    this.shadow.rotation.y = ry;
    this.shadow.rotation.z = -bank * 0.25;
    this.shadow.scale.set(1.7 * (spread + beat) * k * Math.cos(bank * 0.5), 1.2 * k, 1);
    (this.shadow.material as MeshBasicMaterial).opacity = Math.max(0.12, 0.55 - 0.03 * G.alt) * Math.min(1, G.alt / 0.5);
    // las ventanas de los retos: el marco, en la cara del reto, alrededor de por dónde hay que pasar (lo de `winOf`)
    let wi = 0;
    const U = FLY.uMax;
    for (const p of R.live) {
      if (p.judged || wi >= this.wins.length || p.at - d > SEE) continue;
      if (p.k !== 'arch' && p.k !== 'pillar' && p.k !== 'crack') continue;
      const W = winOf(p);
      if (!W) continue;
      const f = this.wins[wi++];
      // (de lado, lo de la ventana; de alto: bajo el puente, de lo más bajo a su canto; en la columna y la grieta, a tu altura)
      const u0 = Math.max(-U, W.u0), u1 = Math.min(U, W.u1);
      const a0 = p.k === 'arch' ? W.a0 : Math.max(FLY.altMin, G.alt - 1.3), a1 = p.k === 'arch' ? W.a1 : a0 + 2.6;
      const at = p.k === 'crack' ? p.at - 0.4 : p.at - 0.1;
      const r = bend(at, (u0 + u1) / 2 - R.uShift, this.bp);
      f.g.position.set(this.bp.x, (a0 + a1) / 2 + ref + gy(p.at), this.bp.z);
      f.g.rotation.set(0, r, 0);
      f.set(Math.max(0.4, u1 - u0), Math.max(0.4, a1 - a0), clock + p.id);
      f.g.visible = true;
    }
    for (let i = wi; i < this.wins.length; i++) this.wins[i].g.visible = false;
    // la zona de aterrizaje: tumbada en el suelo donde te posas ante el cofre (hasta que ya estás en él)
    let chest: Piece | null = null;
    for (const p of R.live) if (p.k === 'chest' && !p.judged && (!chest || p.at < chest.at)) chest = p;
    const padAt = chest ? chest.at - STOP_AT : 0;
    this.pad.g.visible = !!chest && padAt - d < LAND_D + 25 && G.alt > 0.3;
    if (chest && this.pad.g.visible) {
      const r = bend(padAt, -R.uShift, this.bp);
      this.pad.g.position.set(this.bp.x, GROUND_Y + gy(padAt) + 0.08, this.bp.z);
      this.pad.g.rotation.set(-Math.PI / 2, r, 0);
      this.pad.set(2.6, 2.6, clock);
    }
    if (!this.inRoom.visible) return;
    // las reglillas: en el suelo de la habitación, por delante de las manos, de cara a donde mira el cuerpo
    const B = R.flyBody;
    this.inRoom.position.set(B.x0 + B.fx * G_AHEAD, 0.012, B.z0 + B.fz * G_AHEAD);
    this.inRoom.rotation.y = Math.atan2(-B.fx, -B.fz);
    const hx = (u: number): number => (Math.max(-FLY.uMax, Math.min(FLY.uMax, u)) / FLY.uMax) * (G_W / 2);
    const vz = (a: number): number => -(Math.max(0, Math.min(FLY.altMax, a)) / FLY.altMax) * G_L;
    this.g.hDot.position.set(hx(G.u), 0.002, 0);
    this.g.hDot.scale.set(0.026, 0.05, 1);
    this.g.vDot.position.set(G_SIDE, 0.002, vz(G.alt));
    this.g.vDot.scale.set(0.05, 0.026, 1);
    this.g.vTgt.position.set(G_SIDE, 0.001, vz(G.tgtAlt));
    this.g.vTgt.scale.set(0.04, 0.012, 1);
    // la ventana del reto que viene (de lado y de altura): dónde hay que estar al llegar
    const W = winOf(R.flyNext());
    this.g.hWin.visible = !!W && W.u0 < W.u1;
    if (W && this.g.hWin.visible) {
      this.g.hWin.position.set((hx(W.u0) + hx(W.u1)) / 2, 0.001, 0);
      this.g.hWin.scale.set(Math.max(0.01, hx(W.u1) - hx(W.u0)), 0.032, 1);
    }
    this.g.vWin.visible = !!W && W.a0 < W.a1;
    if (W && this.g.vWin.visible) {
      this.g.vWin.position.set(G_SIDE, 0.001, (vz(W.a0) + vz(W.a1)) / 2);
      this.g.vWin.scale.set(0.032, Math.max(0.01, vz(W.a0) - vz(W.a1)), 1);
    }
  }
}

/** La ventana de un reto: de qué lado a qué lado y de qué altura a qué altura hay que pasar (m; vacía, sin ventana). */
const WIN = { u0: 0, u1: 0, a0: 0, a1: 0 };
export function winOf(p: Piece | null): typeof WIN | null {
  if (!p) return null;
  const W = WIN, U = FLY.uMax;
  W.u0 = -U;
  W.u1 = U;
  W.a0 = W.a1 = 0;
  if (p.k === 'ring') {
    W.u0 = p.u - RING_R;
    W.u1 = p.u + RING_R;
    W.a0 = p.h - RING_R;
    W.a1 = p.h + RING_R;
  } else if (p.k === 'berries') {
    W.u0 = p.u - BERRY_R;
    W.u1 = p.u + BERRY_R;
    W.a0 = p.h - BERRY_R;
    W.a1 = p.h + BERRY_R;
  } else if (p.k === 'pillar') {
    const e = PILLAR_W / 2 + 0.3;
    if (p.u > 0) W.u1 = p.u - e;
    else W.u0 = p.u + e;
  } else if (p.k === 'arch') {
    W.a0 = FLY.altMin;
    W.a1 = p.h - ARCH_CLEAR;
  } else if (p.k === 'crack') {
    W.u0 = p.u - CRACK_W;
    W.u1 = p.u + CRACK_W;
  } else if (p.k === 'updraft') {
    W.u0 = p.u - UPDRAFT_W;
    W.u1 = p.u + UPDRAFT_W;
  } else return null;
  return W;
}
