/**
 * El parapente del remo invertido, en la escena de Barras (lo que decide, en `para.ts`): al colgarte fija dónde queda el
 * punto del vuelo (tu cabeza) y hacia dónde vuelas (hacia tus pies), lee de ti cada fotograma lo que mandas (el remo, lo que
 * te vas a un lado, lo subido que vas) y se lo pasa al mapa por `MAPPILOT` (`MapSystem` es quien vuela y pinta el mapa).
 * Hasta que te cuelgas la primera vez se ve la arena de siempre; luego, solo el cielo y el mapa (y tus paralelas).
 */
import { Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { HOOKS, MAPPILOT } from '../../core/state.js';
import { head } from '../../input/hand-model.js';
import { haptic } from '../../input/hand-system.js';
import type { BarHits } from './detect.js';
import { eqAxes, type EqPose } from './equip.js';
import { ParaPilot, type ParaIn } from './para.js';

export class ParaFlight {
  readonly pilot = new ParaPilot();
  /** ¿Esta ronda es de parapente? ¿Te has colgado ya (el mapa, a la vista)? Los remos que pide la oleada. */
  on = false;
  placed = false;
  need = 0;
  private rep = false;
  private fast = false;
  private perfect = false;
  /** Lo que el detector de las paralelas le cuenta: cada remo. */
  readonly hits: BarHits = {
    rep: (o) => {
      this.rep = true;
      this.fast = o.fast;
      this.perfect = o.perfect;
    },
    blast: () => {},
  };
  private readonly inp: ParaIn = { playing: false, up: 0, side: 0, rep: false, fast: false, perfect: false };
  private readonly head0 = new Vector3();
  private readonly right = new Vector3(1, 0, 0);
  private readonly ax = new Vector3();
  private readonly az = new Vector3();
  private readonly upH = new Vector3();
  private hidden: Object3D[] = [];
  private said = false;

  constructor(private readonly arenaOf: () => Object3D[]) {}

  /** Empieza la ronda: de parapente o no. */
  begin(want: boolean): void {
    this.clear();
    this.on = want;
    this.pilot.reset();
  }

  /** Empieza una oleada: los remos que pide. */
  startWave(need: number): void {
    this.pilot.startWave();
    this.need = Math.max(1, Math.round(need));
  }
  /** ¿Hechos los remos de la oleada? Los que faltan. */
  get cleared(): boolean {
    return this.pilot.reps >= this.need;
  }
  get left(): number {
    return Math.max(0, this.need - this.pilot.reps);
  }

  /** Te has colgado: el punto del vuelo, en tu cabeza; se vuela hacia tus pies (con dos paralelas, a lo largo de ellas; con
   * una, cruzado a ella), como la cuerda. */
  mount(e: EqPose, one: boolean): void {
    if (!this.on) return;
    eqAxes(e, this.ax, this.az);
    const along = one ? this.ax : this.az;
    this.upH.set(0, 1, 0).applyQuaternion(head.q).setY(0);
    if (this.upH.lengthSq() < 1e-4) this.upH.copy(along);
    const sg = along.dot(this.upH) >= 0 ? -1 : 1, fx = along.x * sg, fz = along.z * sg; // (lo alto de tu cabeza, al revés)
    this.right.set(-fz, 0, fx); // (tu derecha, boca arriba con los pies por delante)
    this.head0.copy(head.p);
    MAPPILOT.x = head.p.x;
    MAPPILOT.y = head.p.y;
    MAPPILOT.z = head.p.z;
    MAPPILOT.yaw = Math.atan2(-fx, -fz);
    this.placed = true;
    if (!this.said) {
      this.said = true;
      HOOKS.say('Rema: subes y coges marcha · Tira más de un brazo: viras', '#3cf0c6', 6, false);
    }
  }

  /**
   * Cada fotograma: `live`, en partida y con el aparato en marcha; `paused`, en pausa (todo quieto); `playing`, colgado y en
   * la oleada (si no, planeas solo); `up`, lo subido que llevas el pecho en este remo (0-1).
   */
  step(dt: number, live: boolean, paused: boolean, playing: boolean, up: number): void {
    const show = this.on && live && this.placed;
    if (show !== MAPPILOT.on) {
      MAPPILOT.on = show;
      // con el mapa, fuera la arena (compuertas, suelo, valle y nubes); al quitarlo, vuelve
      if (show) {
        this.hidden = this.arenaOf().filter((o) => o.visible);
        for (const o of this.hidden) o.visible = false;
      } else {
        for (const o of this.hidden) o.visible = true;
        this.hidden.length = 0;
      }
    }
    if (!show || paused) return;
    const I = this.inp, P = this.pilot;
    I.playing = playing;
    I.up = up < 0 ? 0 : up > 1 ? 1 : up;
    I.side = (head.p.x - this.head0.x) * this.right.x + (head.p.z - this.head0.z) * this.right.z;
    I.rep = playing && this.rep;
    I.fast = this.fast;
    I.perfect = this.perfect;
    this.rep = false;
    P.step(dt, I);
    MAPPILOT.steer = P.steer;
    MAPPILOT.climb = P.climb;
    MAPPILOT.gear = P.gear;
    // el impulso se nota: vibración en las dos manos y un golpe de aire
    if (P.kicked) {
      haptic('left', 0.6, 80);
      haptic('right', 0.6, 80);
      SND.whoosh(head.p);
    }
  }

  /** Al acabar o salir: fuera el mapa y de vuelta la arena. */
  clear(): void {
    this.on = this.placed = this.rep = this.said = false;
    this.need = 0;
    if (MAPPILOT.on) {
      MAPPILOT.on = false;
      for (const o of this.hidden) o.visible = true;
    }
    this.hidden.length = 0;
  }
}
