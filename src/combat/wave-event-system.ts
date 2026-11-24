/**
 * Los sucesos de la oleada que pasan en la arena (src/combat/wave-events.ts): la **lluvia de meteoritos** (rocas en llamas que
 * caen desde lo alto hacia donde estás, las del lanzador: se esquivan apartándose o se paran con la mano) y la **lluvia de
 * oro** (orbes de oro, los de Arcos, que bajan flotando a tu alcance al empezar la oleada: se cogen con la mano o la cabeza y
 * dan puntos). El eclipse y la niebla los pone EnvSystem. Unos pocos orbes hechos al arrancar y reutilizados.
 */
import { createSystem, Vector3 } from '@iwsdk/core';
import { SND } from '../audio/sound.js';
import { GAME, HOOKS, WAVE_EV } from '../core/state.js';
import { settings } from '../core/values.js';
import { hands, head } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { createOrb, type OrbParts } from '../scene-assets/arc-extras.scene-asset.js';
import { warmKeep } from '../style/warm.js';
import { EnemySystem } from './enemies.js';

/** Los orbes a la vez, lo que dura la lluvia de oro (s), cada cuánto sale uno (s), lo que vive cada uno (s), lo que da y lo
 * cerca que hay que llegar (m: con la mano y con la cabeza). */
const ORBS = 6, GOLD_T = 14, GOLD_GAP = 0.75, ORB_LIFE = 5.5, ORB_PTS = 150, REACH_HAND = 0.2, REACH_HEAD = 0.26;

interface Orb {
  P: OrbParts;
  on: boolean;
  t: number;
  to: Vector3;
  ph: number;
}

export class WaveEventSystem extends createSystem({}) {
  private orbs: Orb[] = [];
  private goldT = 0;
  private gapT = 0;
  private meteorT = 0;
  private last = '';
  private readonly from = new Vector3();
  private readonly at = new Vector3();

  init(): void {
    for (let i = 0; i < ORBS; i++) {
      const P = createOrb();
      P.grp.visible = false;
      this.world.createTransformEntity(P.grp);
      this.orbs.push({ P, on: false, t: 0, to: new Vector3(), ph: Math.random() * 6.28 });
    }
    warmKeep(createOrb().grp);
  }

  private clearOrbs(): void {
    for (const o of this.orbs) {
      o.on = false;
      o.P.grp.visible = false;
    }
  }

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    const live = GAME.phase === 'playing' && settings.mode === 'combat' && GAME.wave > 0 && !GAME.between && !GAME.paused;
    // (al empezar el suceso, su reloj)
    if (WAVE_EV.kind !== this.last) {
      this.last = WAVE_EV.kind;
      this.goldT = WAVE_EV.kind === 'gold' ? GOLD_T : 0;
      this.gapT = 2.4; // (después del panel de la oleada)
      this.meteorT = 3.2;
      if (WAVE_EV.kind !== 'gold') this.clearOrbs();
    }
    if (GAME.phase !== 'playing') this.clearOrbs();
    if (!live) return;
    if (WAVE_EV.kind === 'meteors') this.stepMeteors(dt);
    this.stepGold(dt, time);
  }

  /** Cada pocos segundos, una roca en llamas cae desde lo alto, por delante y a un lado, hacia donde estás. */
  private stepMeteors(dt: number): void {
    this.meteorT -= dt;
    if (this.meteorT > 0) return;
    this.meteorT = 2.2 + Math.random() * 1.6;
    const rocks = this.world.getSystem(EnemySystem)?.rocks;
    if (!rocks) return;
    const s = Math.random() < 0.5 ? -1 : 1;
    this.from.set(GAME.head.x + s * (3 + Math.random() * 4), 13 + Math.random() * 3, GAME.head.z - 6 - Math.random() * 6);
    rocks.throw(this.from, 1.15, true); // (con su sombra en el suelo)
  }

  /** La lluvia de oro: salen orbes a tu alcance (delante y a los lados, del pecho a algo por encima de la cabeza), bajan
   * flotando y se quedan meciéndose un rato; tocarlos con la mano o la cabeza los coge. */
  private stepGold(dt: number, time: number): void {
    if (this.goldT > 0) {
      this.goldT -= dt;
      this.gapT -= dt;
      const free = this.orbs.find((o) => !o.on);
      if (this.gapT <= 0 && free) {
        this.gapT = GOLD_GAP;
        const a = (Math.random() - 0.5) * 2.4, d = 0.45 + Math.random() * 0.25;
        free.to.set(head.p.x + Math.sin(a) * d, head.p.y - 0.45 + Math.random() * 0.65, head.p.z - Math.cos(a) * d);
        free.on = true;
        free.t = 0;
        free.P.grp.position.copy(free.to).y += 1.4;
        free.P.grp.visible = true;
      }
    }
    for (const o of this.orbs) {
      if (!o.on) continue;
      o.t += dt;
      const g = o.P.grp, k = Math.min(1, o.t / 0.9), e = 1 - (1 - k) * (1 - k);
      g.position.set(o.to.x, o.to.y + 1.4 * (1 - e) + 0.03 * Math.sin(time * 2.2 + o.ph), o.to.z);
      o.P.gem.rotation.y += dt * 2.4;
      o.P.rings[0].rotation.x += dt * 1.6;
      o.P.rings[1].rotation.y += dt * 2.1;
      const fade = Math.min(1, (ORB_LIFE - o.t) / 0.6);
      g.scale.setScalar(Math.max(0.01, fade) * 0.9);
      if (o.t >= ORB_LIFE) {
        o.on = false;
        g.visible = false;
        continue;
      }
      // ¿lo coges? (con la mano que se ve o con la cabeza)
      let by: 'left' | 'right' | 'head' | null = g.position.distanceTo(head.p) < REACH_HEAD ? 'head' : null;
      for (const side of ['left', 'right'] as const) {
        const h = hands[side];
        if (by || !h.ok || h.est) continue;
        if (h.wrist.distanceTo(g.position) < REACH_HAND || (h.tipOk && h.tip.distanceTo(g.position) < REACH_HAND)) by = side;
      }
      if (!by) continue;
      o.on = false;
      g.visible = false;
      this.at.copy(g.position);
      HOOKS.sparks(this.at, 22, 0xffd166);
      SND.orb(this.at, true);
      HOOKS.score(ORB_PTS, false);
      if (by !== 'head') haptic(by, 0.6, 60);
    }
  }
}
