/**
 * Los premios que salen de un cofre al abrirlo (pedido del usuario: «que se sepa qué contienen»; el de la Travesía y el del
 * descanso de Combate): cada uno, un medallón con su dibujo y lo que es (src/ui/prize-draw.ts), sale de la boca del cofre,
 * sube flotando en vertical (src/ui/prize-path.ts) y, arriba, se esfuma con unas chispas: recibido. Siempre de cara a ti y
 * derecho. Lo pide quien abre el cofre con `HOOKS.prize(boca, premios)`.
 *
 * Los medallones, hechos una vez (`PRIZE_MAX`); cada uno se pinta al abrir el cofre (un lienzo pequeño, una vez) y luego solo
 * se mueve: nada se crea ni se repinta en cada fotograma.
 */
import { createSystem, Vector3 } from '@iwsdk/core';
import { GAME, HOOKS } from '../core/state.js';
import { head } from '../input/hand-model.js';
import { SND } from '../audio/sound.js';
import { makeCanvasPanel, type CanvasPanel } from './canvas-panel.js';
import { drawPrize, type Prize } from './prize-draw.js';
import { prizeAt, PRIZE_GAP, PRIZE_LIFE, type PrizePose } from './prize-path.js';

/** Cuántos a la vez como mucho y lo que mide cada medallón (m: ancho y alto, con su texto debajo). */
export const PRIZE_MAX = 5;
const W = 0.38, H = 0.48;
/** El color de las chispas al esfumarse, por dibujo. */
const SPARK: Record<Prize['icon'], number> = { key: 0xffc531, gem: 0x3cd8ff, treasure: 0xffd166, coins: 0xffc531, heart: 0xff4f7b, perk: 0xc8ff3a };

interface Slot {
  P: CanvasPanel;
  icon: Prize['icon'];
  i: number;
  burst: boolean;
}

export class PrizeSystem extends createSystem({}) {
  private slots: Slot[] = [];
  private readonly at = new Vector3();
  private readonly v = new Vector3();
  private readonly pose: PrizePose = { y: 0, s: 0, a: 0, live: false, fading: false };
  /** Lo que llevan los de ahora (s desde que se abrió el cofre; −1, ninguno) y cuántos son. */
  private t = -1;
  private n = 0;

  init(): void {
    for (let i = 0; i < PRIZE_MAX; i++) {
      const P = makeCanvasPanel(W, H, 256);
      P.mesh.renderOrder = 20;
      P.mat.depthWrite = false;
      P.mesh.visible = false;
      this.world.createTransformEntity(P.mesh);
      this.slots.push({ P, icon: 'coins', i, burst: false });
    }
    HOOKS.prize = (at, items) => this.launch(at, items);
  }

  /** Salen del cofre (su boca en `at`), uno tras otro. */
  private launch(at: Vector3, items: Prize[]): void {
    this.at.copy(at);
    this.n = Math.min(PRIZE_MAX, items.length);
    this.t = 0;
    for (let i = 0; i < PRIZE_MAX; i++) {
      const S = this.slots[i];
      S.burst = false;
      S.P.mesh.visible = false;
      if (i >= this.n) continue;
      S.icon = items[i].icon;
      drawPrize(S.P.ctx, S.P.W, S.P.H, items[i]);
      S.P.tex.needsUpdate = true;
    }
  }

  update(delta: number): void {
    if (this.t < 0) return;
    if (!GAME.paused) this.t += delta;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const S = this.slots[i], o = S.P.mesh, p = prizeAt(this.t, i, this.pose);
      o.visible = p.live;
      if (!p.live) continue;
      any = true;
      // (en fila, uno al lado de otro, casi rozándose: salen en cascada y no se tapan al subir)
      const dx = (i - (this.n - 1) / 2) * W * 0.88;
      o.position.set(this.at.x, this.at.y + p.y + H / 2, this.at.z);
      // de cara a ti y derecho (solo gira alrededor de la vertical)
      const yaw = Math.atan2(head.p.x - this.at.x, head.p.z - this.at.z);
      o.rotation.set(0, yaw, 0);
      o.position.x += Math.cos(yaw) * dx;
      o.position.z -= Math.sin(yaw) * dx;
      o.scale.setScalar(Math.max(0.001, p.s));
      S.P.mat.opacity = p.a;
      if (p.fading && !S.burst) {
        // recibido: chispas de su color y un tintineo
        S.burst = true;
        HOOKS.sparks(this.v.copy(o.position), 18, SPARK[S.icon]);
        SND.tick();
      }
    }
    if (!any && this.t > (this.n - 1) * PRIZE_GAP + PRIZE_LIFE) this.t = -1;
  }
}
