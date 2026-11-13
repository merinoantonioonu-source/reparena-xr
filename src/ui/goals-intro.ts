/**
 * La carátula «METAS DE HOY» al entrar en las gafas (RepArena, src/73_career.js: goalsIntro y goalsStep): grande, a 2 m,
 * con todo lo demás oscurecido (una esfera oscura alrededor de la cabeza): las tres metas del día con lo que llevas, lo que
 * da el cofre y la racha con sus escudos. Se va sola a los 8 s o con cualquier botón del mando, el pulgar arriba o una tecla
 * (en el ordenador no sale), como la del duelo. Sale una vez por entrada y no si ya has empezado a jugar.
 */
import { BackSide, createSystem, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { GAME, VIEW } from '../core/state.js';
import { hands, head } from '../input/hand-model.js';
import { padMask, thumbsUp } from '../input/thumbs.js';
import { SND } from '../audio/sound.js';
import { makePanel, type RaPanel } from './ra/kit.js';
import { drawHoy } from './ra/career-draw.js';
import { clamp, smooth } from './canvas-kit.js';
import { lyingEx, VIEW_FRAME } from './view-panels.js';

const GOALS_DUR = 8;

export class GoalsSystem extends createSystem({}) {
  /** La carátula, pintada como en RepArena (drawHoy, src/ui/ra/career-draw.ts). */
  private p!: RaPanel;
  private veil!: Mesh;
  private t = -1;
  private shown = false;
  private skip = false;
  private keyHit = false;
  private thumbT = 0;
  private readonly mask = { left: 0, right: 0 };

  init(): void {
    this.p = makePanel(1.3, 0.95, 1024, { depthTest: false, hd: 1.5 });
    this.p.mesh.renderOrder = 62; // (encima de todo, como la del duelo)
    this.p.mesh.visible = false;
    this.world.createTransformEntity(this.p.mesh);
    this.veil = new Mesh(new SphereGeometry(0.5, 20, 10), new MeshBasicMaterial({ color: 0x05030c, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, fog: false, toneMapped: false }));
    this.veil.userData.noInk = true;
    this.veil.renderOrder = 61;
    this.veil.visible = false;
    this.world.createTransformEntity(this.veil);
    const onKey = (): void => {
      if (this.t >= 0) this.keyHit = true;
    };
    addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => removeEventListener('keydown', onKey));
  }

  private fill(): void {
    drawHoy(this.p.ctx, this.p.W, this.p.H, true);
    this.p.tex.needsUpdate = true;
  }

  private start(): void {
    const o = this.p.mesh;
    this.shown = true;
    this.fill();
    const ly = lyingEx();
    VIEW_FRAME.hudLocal(this.tmp.set(0, 0.05, -2), o.position, head, ly);
    o.quaternion.copy(VIEW_FRAME.hudQ(head, ly));
    this.t = 0;
    this.skip = false;
    this.keyHit = false;
    this.thumbT = 0;
    for (const s of ['left', 'right'] as const) this.mask[s] = padMask(hands[s]); // (lo que ya estaba pulsado no cuenta)
    SND.combo();
  }
  private readonly tmp = new Vector3();

  private clear(): void {
    this.t = -1;
    this.veil.visible = false;
    this.p.mesh.visible = false;
  }

  update(dt: number): void {
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!inXR) {
      this.shown = false; // (al volver a entrar, otra vez)
      if (this.t >= 0) this.clear();
      return;
    }
    if (this.t < 0) {
      if (!this.shown && GAME.menu === 'lobby' && GAME.phase !== 'playing' && !VIEW.duel) this.start();
      return;
    }
    const o = this.p.mesh;
    this.t += Math.min(dt, 0.1);
    if (GAME.phase === 'playing') this.skip = true; // (si empiezas a jugar, se va)
    for (const s of ['left', 'right'] as const) {
      const m = padMask(hands[s]);
      if (m & ~this.mask[s]) this.skip = true;
      this.mask[s] = m;
    }
    if (thumbsUp(hands.left) || thumbsUp(hands.right)) {
      this.thumbT += dt;
      if (this.thumbT > 0.25) this.skip = true;
    } else this.thumbT = 0;
    if (this.keyHit) this.skip = true;
    if (this.skip && this.t < GOALS_DUR - 0.3) this.t = GOALS_DUR - 0.3;
    const a = this.t < 0.3 ? smooth(this.t / 0.3) : clamp((GOALS_DUR - this.t) / 0.3, 0, 1);
    this.veil.position.copy(head.p);
    (this.veil.material as MeshBasicMaterial).opacity = a * 0.78;
    this.veil.visible = a > 0.01;
    (o.material as MeshBasicMaterial).opacity = a;
    o.visible = a > 0.01;
    o.scale.setScalar(1 + 0.05 * Math.max(0, 1 - this.t / 0.4));
    if (this.t >= GOALS_DUR) this.clear();
  }
}
