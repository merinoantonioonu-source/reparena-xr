/**
 * El parapente del remo invertido, en la escena de Barras (lo que decide, en `para.ts`): al colgarte fija dónde queda el
 * punto del vuelo (tu cabeza) y hacia dónde vuelas (hacia tus pies), lee de ti cada fotograma lo que mandas (el remo, lo que
 * te vas a un lado, lo subido que vas) y se lo pasa al mapa por `MAPPILOT` (`MapSystem` es quien vuela y pinta el mapa).
 * Hasta que te cuelgas la primera vez se ve la arena de siempre; luego, solo el cielo y el mapa (y tus paralelas).
 */
import { Vector3 } from '@iwsdk/core';
import type { Group, Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { diagEvent } from '../../core/diag.js';
import { HOOKS, MAPPILOT } from '../../core/state.js';
import { head } from '../../input/hand-model.js';
import { haptic } from '../../input/hand-system.js';
import type { BarHits } from './detect.js';
import { eqAxes, type EqPose } from './equip.js';
import { gazeDeg, PARA, ParaPilot, THERMAL, Thermals, type ParaIn } from './para.js';
import { num } from '../../core/values.js';
import { ParaLook } from './para-look.js';
import { loopSound, type SoundLoop } from '../../audio/sound.js';

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
  /** Hacia tus pies (hacia donde se vuela), tu mirada de colgado (grados, suavizada) y lo que llevas colgado mirando (s). */
  private readonly feet = new Vector3(0, 0, -1);
  private readonly fwd = new Vector3();
  private gaze = 0;
  private gazeT = 0;
  private hidden: Object3D[] = [];
  private said = false;
  private logT = 0;

  /** Las térmicas (columnas de aire que sube), la vela con sus líneas y el viento en la cara (segunda entrega). */
  readonly thermals = new Thermals();
  private readonly look: ParaLook;
  private wind: SoundLoop | null = null;
  private readonly windAt = new Vector3();

  constructor(private readonly arenaOf: () => Object3D[], root: Group) {
    this.look = new ParaLook(root);
  }

  /** Empieza la ronda: de parapente o no. */
  begin(want: boolean): void {
    this.clear();
    this.on = want;
    this.pilot.reset();
    this.thermals.reset();
    this.gaze = this.gazeT = 0;
    MAPPILOT.gaze = -1;
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
    this.feet.set(fx, 0, fz);
    // (la primera vez el mapa sale ya inclinado: sin vaivén; al volver a colgarte, se inclina suave)
    if (!this.placed) MAPPILOT.pitch = this.tilt();
    this.placed = true;
    this.look.place();
    if (!this.said) {
      this.said = true;
      HOOKS.say('Rema: subes y coges marcha · Tira más de un brazo: viras', '#3cf0c6', 6, false);
      diagEvent(`parapente: colgado · cabeza ${head.p.x.toFixed(2)} ${head.p.y.toFixed(2)} ${head.p.z.toFixed(2)} · hacia ${fx.toFixed(2)} ${fz.toFixed(2)} · mapa a ${num('barParaTilt')}°`);
    }
  }

  // «Parapente: inclinación del mapa» (rad): lo que sube el horizonte del mapa respecto al suelo, hacia tus pies
  private tilt(): number {
    return (Math.min(90, Math.max(0, num('barParaTilt'))) * Math.PI) / 180;
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
        this.quiet();
      }
    }
    if (show) {
      // la inclinación del mapa: la del ajuste (se nota al cambiarla, también en la pausa); de pie, derecho (corregido por
      // el usuario con su vídeo: de pie lo veía del revés)
      const lying = head.p.y < num('dipH') / 100 + PARA.standUp, want = lying ? this.tilt() : 0;
      MAPPILOT.pitch += (want - MAPPILOT.pitch) * (1 - Math.exp(-(dt > 0 ? dt : 1 / 72) / PARA.tiltTau));
      if (Math.abs(want - MAPPILOT.pitch) < 1e-3) MAPPILOT.pitch = want;
      // tu mirada de colgado (para «Ajustar a mi mirada»): lo que miras por encima del suelo, hacia tus pies
      if (lying && playing && !paused && dt > 0) {
        this.fwd.set(0, 0, -1).applyQuaternion(head.q);
        const g = gazeDeg(this.fwd.y, this.fwd.x * this.feet.x + this.fwd.z * this.feet.z);
        this.gaze = this.gazeT > 0 ? this.gaze + (g - this.gaze) * (1 - Math.exp(-dt / PARA.gazeTau)) : g;
        this.gazeT += dt;
        if (this.gazeT >= PARA.gazeMin) MAPPILOT.gaze = this.gaze;
      }
    }
    this.look.update(show);
    if (!show || paused) return;
    const I = this.inp, P = this.pilot;
    I.playing = playing;
    I.up = up < 0 ? 0 : up > 1 ? 1 : up;
    I.side = (head.p.x - this.head0.x) * this.right.x + (head.p.z - this.head0.z) * this.right.z;
    I.rep = playing && this.rep;
    I.fast = this.fast;
    I.perfect = this.perfect;
    this.rep = false;
    // las térmicas: por delante y a un lado; dentro, subes sin remar
    const T = this.thermals;
    T.step(dt, MAPPILOT.px, MAPPILOT.pz, MAPPILOT.heading, MAPPILOT.scale, playing, Math.random);
    I.thermal = T.lift;
    for (let i = 0; i < MAPPILOT.cols.length; i++) {
      const c = MAPPILOT.cols[i], t = T.list[i];
      c.on = !!t?.on;
      if (!t?.on) continue;
      c.x = t.x;
      c.z = t.z;
      c.r = THERMAL.r * MAPPILOT.scale;
    }
    if (T.entered) {
      HOOKS.say('¡TÉRMICA! Subes sin remar', '#3cf0c6', 2, false);
      HOOKS.score(THERMAL.pts, true);
      SND.combo();
      haptic('left', 0.4, 140);
      haptic('right', 0.4, 140);
    }
    P.step(dt, I);
    MAPPILOT.shadow = true;
    // el viento en la cara: más cerca (más fuerte) cuanto más deprisa vas
    if (!this.wind) this.wind = loopSound('viento', 1, 1);
    if (this.wind) {
      const k = Math.min(1, Math.max(0, (P.gear - 0.3) / 5));
      this.wind.set(this.windAt.copy(head.p).setY(head.p.y + 4.5 - 4 * k));
    }
    MAPPILOT.steer = P.steer;
    MAPPILOT.climb = P.climb;
    MAPPILOT.gear = P.gear;
    // el impulso se nota: vibración en las dos manos y un golpe de aire
    if (P.kicked) {
      haptic('left', 0.6, 80);
      haptic('right', 0.6, 80);
      SND.whoosh(head.p);
      diagEvent(`parapente: remo ${P.reps} de ${this.need} · sube ${P.climb.toFixed(2)} · marcha ${P.gear.toFixed(1)} · de lado ${Math.round(I.side * 100)} cm`);
    }
    // (y, cada poco, cómo va: si no responde, se ve aquí por qué)
    this.logT -= dt;
    if (this.logT <= 0) {
      this.logT = 4;
      diagEvent(`parapente: ${playing ? 'colgado' : 'planea solo'} · subido ${I.up.toFixed(2)} · de lado ${Math.round(I.side * 100)} cm · vira ${P.steer.toFixed(2)} · sube ${P.climb.toFixed(2)} · marcha ${P.gear.toFixed(1)} · miras a ${MAPPILOT.gaze < 0 ? '?' : Math.round(MAPPILOT.gaze)}° (mapa a ${Math.round((MAPPILOT.pitch * 180) / Math.PI)}°)`);
    }
  }

  /** Al acabar o salir: fuera el mapa y de vuelta la arena. */
  clear(): void {
    this.on = this.placed = this.rep = this.said = false;
    this.need = 0;
    MAPPILOT.pitch = 0;
    if (MAPPILOT.on) {
      MAPPILOT.on = false;
      for (const o of this.hidden) o.visible = true;
    }
    this.hidden.length = 0;
    this.look?.update(false);
    this.quiet();
  }

  // sin el viento ni lo que se pinta en el mapa
  private quiet(): void {
    this.wind?.stop();
    this.wind = null;
    MAPPILOT.shadow = false;
    for (const c of MAPPILOT.cols) c.on = false;
  }
}
