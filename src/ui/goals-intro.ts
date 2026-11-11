/**
 * La carátula «METAS DE HOY» al entrar en las gafas (RepArena, src/73_career.js: goalsIntro y goalsStep): grande, a 2 m,
 * con todo lo demás oscurecido (una esfera oscura alrededor de la cabeza): las tres metas del día con lo que llevas, lo que
 * da el cofre y la racha con sus escudos. Se va sola a los 8 s o con cualquier botón del mando, el pulgar arriba o una tecla
 * (en el ordenador no sale), como la del duelo. Sale una vez por entrada y no si ya has empezado a jugar.
 */
import { BackSide, createSystem, Entity, Mesh, MeshBasicMaterial, SphereGeometry, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { career, progressNow } from '../combat/career-hub.js';
import { CHEST_XP, MIS, MIS_XP, misGot, SHIELD_COL } from '../core/career.js';
import { daysTxt } from '../core/days.js';
import { GAME, VIEW } from '../core/state.js';
import { hands, head } from '../input/hand-model.js';
import { padMask, thumbsUp } from '../input/thumbs.js';
import { SND } from '../audio/sound.js';
import { applyFonts } from './fonts.js';
import { clamp, smooth } from './canvas-kit.js';
import { lyingEx, VIEW_FRAME } from './view-panels.js';

const GOALS_DUR = 8;

export class GoalsSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private entity: Entity | undefined;
  private veil!: Mesh;
  private t = -1;
  private shown = false;
  private skip = false;
  private keyHit = false;
  private thumbT = 0;
  private readonly mask = { left: 0, right: 0 };

  init(): void {
    this.panel = this.world.getSceneObject<UIKitMLAsset>('metas-panel') ?? null;
    this.entity = this.world.getSceneEntity('metas-panel');
    if (this.panel) {
      applyFonts(this.panel);
      this.panel.getElementById('box')?.setProperties({ depthTest: false, renderOrder: 62 }); // (encima de todo, como la del duelo)
    }
    if (this.entity?.object3D) this.entity.object3D.visible = false;
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
    const p = this.panel;
    if (!p) return;
    const set = (id: string, props: Record<string, unknown>): void => void p.getElementById(id)?.setProperties(props);
    const c = career(), M = c.misToday(), P = progressNow(), done = M.list.filter((m) => m.done).length;
    set('sub', { text: M.chest ? '¡Las tres cumplidas! El cofre de hoy ya es tuyo' : `${done} de 3 · cumple las tres y se abre el cofre del día` });
    M.list.forEach((m, i) => {
      const id = `g${i + 1}`, got = misGot(m);
      set(`${id}-c`, { backgroundColor: m.done ? '#3cf0c6' : '#3a4152' });
      set(`${id}-ct`, { text: m.done ? '✓' : '' });
      set(`${id}-t`, { text: MIS[m.t].txt(m), color: m.done ? '#2bd4ad' : '#eeeaff' });
      set(`${id}-f`, { width: Math.max(1.8, (80 * got) / m.n), backgroundColor: m.done ? '#3cf0c6' : '#c8f560' });
      set(`${id}-n`, { text: m.done ? `+${MIS_XP} XP` : `${got} / ${m.n}` });
    });
    set('chest', { backgroundColor: M.chest ? '#ffd166' : '#7a4318' });
    set('chest-t', { text: M.chest ? '¡Cofre del día abierto!' : `Cofre: +${CHEST_XP} XP, un escudo y un color` });
    set('streak-t', { text: `Racha: ${daysTxt(P.streak)}` });
    ['s0', 's1', 's2'].forEach((id, i) => set(id, { backgroundColor: i < c.cr.shield ? SHIELD_COL : '#3a4152' }));
  }

  private start(): void {
    const o = this.entity?.object3D;
    if (!o || !this.panel) return;
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
    if (this.entity?.object3D) this.entity.object3D.visible = false;
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
    const o = this.entity?.object3D;
    if (!o) return;
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
    o.visible = a > 0.01;
    o.scale.setScalar(1 + 0.05 * Math.max(0, 1 - this.t / 0.4));
    if (this.t >= GOALS_DUR) this.clear();
  }
}
