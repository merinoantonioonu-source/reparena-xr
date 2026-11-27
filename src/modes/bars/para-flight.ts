/**
 * El parapente del remo invertido, en la escena de Barras (lo que decide, en `para.ts`): al colgarte fija dónde queda el
 * punto del vuelo (tu cabeza) y hacia dónde vuelas (hacia tus pies), lee de ti cada fotograma lo que mandas (el remo, lo que
 * te vas a un lado, lo subido que vas) y se lo pasa al mapa por `MAPPILOT` (`MapSystem` es quien vuela y pinta el mapa).
 * Hasta que te cuelgas la primera vez se ve la arena de siempre; luego, solo el cielo y el mapa (y tus paralelas).
 *
 * Con «Combate en el cielo» (`barPara` = 'sky'), en vez del mapa, el combate contra voladores (`SkyScene`): se vuela igual
 * y, además, cada remo dispara hacia donde miras, el explosivo da el disparo fuerte y aguantar arriba carga una onda.
 */
import { Vector3 } from '@iwsdk/core';
import type { Group, Object3D, PerspectiveCamera, Scene } from '@iwsdk/core';
import { SkyScene } from './sky-scene.js';
import type { SkyEv } from './sky-fight.js';
import { SND } from '../../audio/sound.js';
import { diagEvent } from '../../core/diag.js';
import { GAME, HOOKS, MAPPILOT } from '../../core/state.js';
import { head } from '../../input/hand-model.js';
import { haptic } from '../../input/hand-system.js';
import type { BarHits } from './detect.js';
import { eqAxes, type EqPose } from './equip.js';
import { DropWatch, gazeDeg, PARA, ParaPilot, THERMAL, Thermals, type ParaIn } from './para.js';
import { num, on as isOn } from '../../core/values.js';
import { ParaLook } from './para-look.js';
import { loopSound, type SoundLoop } from '../../audio/sound.js';

export class ParaFlight {
  readonly pilot = new ParaPilot();
  /** ¿Esta ronda es de parapente? ¿El combate en las islas del cielo (en vez del mapa)? ¿Te has colgado ya (a la vista)? Los
   * remos que pide la oleada. */
  on = false;
  sky = false;
  placed = false;
  need = 0;
  /** Lo que se ve y se juega del combate. */
  readonly fight: SkyScene;
  private shown = false;
  /** La carga que suelta la onda al bajar (0: ninguna) y las veces que se ha dicho cómo se esquiva y que has esquivado. */
  private blastP = 0;
  private toldHurt = 0;
  private toldDodge = 0;
  private rep = false;
  private fast = false;
  private dur = 0;
  private perfect = false;
  /** Lo que el detector de las paralelas le cuenta: cada remo. */
  readonly hits: BarHits = {
    rep: (o) => {
      this.rep = true;
      // (explosivo: la subida, de golpe; lo del detector, `o.fast`, pedía tanta prisa que casi nunca salía)
      this.fast = o.dur !== undefined ? o.dur < PARA.fastT : o.fast;
      this.dur = o.dur ?? 0;
      this.perfect = o.perfect;
    },
    // (la onda de la carga: solo en el combate; sobre el mapa, aguantar arriba solo frena)
    blast: (p) => {
      if (this.sky) this.blastP = p;
    },
  };
  private readonly inp: ParaIn = { playing: false, up: 0, side: 0, rep: false, fast: false, perfect: false };
  private readonly skyIn = { steer: 0, climb: 0, gear: 1, fight: false };
  /** El picado del combate (dejarse caer de golpe) y las veces que se ha dicho el picado y la subida brusca. */
  private readonly drop = new DropWatch();
  private toldJolt = [0, 0];
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
  /** Las veces que se ha dicho en esta ronda que bajas y que frenas (solo las primeras). */
  private toldDive = 0;
  private toldBrake = 0;

  /** Las térmicas (columnas de aire que sube), la vela con sus líneas y el viento en la cara (segunda entrega). */
  readonly thermals = new Thermals();
  private readonly look: ParaLook;
  private wind: SoundLoop | null = null;
  private readonly windAt = new Vector3();

  constructor(private readonly arenaOf: () => Object3D[], root: Group, scene: () => Scene | null = () => null, camera: () => PerspectiveCamera | null = () => null) {
    this.look = new ParaLook(root);
    this.fight = new SkyScene(root, scene, camera, (E) => this.onSky(E));
  }

  /** Empieza la ronda: de parapente o no. */
  begin(want: boolean, sky = false): void {
    this.clear();
    this.on = want;
    this.sky = want && sky;
    this.fight.reset();
    this.toldHurt = this.toldDodge = 0;
    this.toldJolt[0] = this.toldJolt[1] = 0;
    this.drop.reset();
    this.blastP = 0;
    this.pilot.reset();
    this.thermals.reset();
    this.gaze = this.gazeT = 0;
    this.toldDive = this.toldBrake = 0;
    MAPPILOT.gaze = -1;
  }

  /** Empieza una oleada: los remos que pide (en el combate, sus voladores, con tanta vida entre todos; `boss`, la del jefe). */
  startWave(need: number, i = 0, boss = false): void {
    this.pilot.startWave();
    this.need = Math.max(1, Math.round(need));
    if (this.sky) this.fight.startWave(i, this.need, boss);
  }
  /** ¿Hechos los remos de la oleada (en el combate, derribados todos)? Los que faltan (la vida que les queda). */
  get cleared(): boolean {
    return this.sky ? this.fight.fight.cleared : this.pilot.reps >= this.need;
  }
  get left(): number {
    return this.sky ? this.fight.fight.left : Math.max(0, this.need - this.pilot.reps);
  }
  /** Para el marcador del combate: el jefe (la vida que le queda; null, sin jefe), lo que corres (km/h), la altura (m) y los
   * derribados. */
  skyHud(): { boss: number | null; kmh: number; alt: number; kills: number } | null {
    if (!this.sky) return null;
    const F = this.fight.fight, B = F.bossFoe;
    this.hudOut.boss = B ? B.hp : null;
    this.hudOut.kmh = F.speed * 3.6;
    this.hudOut.alt = F.y;
    this.hudOut.kills = F.kills;
    return this.hudOut;
  }
  private readonly hudOut = { boss: null as number | null, kmh: 0, alt: 0, kills: 0 };

  // lo que la partida hace con cada suceso del combate: te dan, esquivas, derribas, sale el jefe
  private onSky(E: SkyEv): void {
    if (E.k === 'hurt') {
      this.pilot.hurt();
      GAME.combo = 0;
      haptic('left', 1, 260);
      haptic('right', 1, 260);
      // (quita una vida, con vidas; elegido por el usuario: «corazón + golpes con vida»)
      HOOKS.playerHit(1, true);
      HOOKS.say(this.toldHurt++ < 3 ? '¡Te ha dado! Vira, sube o pica' : '¡Te ha dado!', '#ff8a3d', 2.2, true);
      diagEvent(`parapente: combate · te ha dado ${E.kind ? `el ${E.kind}` : 'una bola'}${E.big ? ' (del jefe)' : ''}`);
    } else if (E.k === 'jolt') {
      // el picado o la subida brusca: se nota (vibración fuerte y golpe de aire)
      const up = E.n > 0;
      haptic('left', 0.8, 180);
      haptic('right', 0.8, 180);
      SND.whoosh(head.p);
      if (this.toldJolt[up ? 1 : 0]++ < 2) HOOKS.say(up ? '¡Arriba!' : '¡Picado!', '#3cf0c6', 1.2, false);
      diagEvent(`parapente: combate · ${up ? 'subida brusca' : 'picado'} · a ${Math.round(this.fight.fight.y)} m`);
    } else if (E.k === 'heart') {
      // el corazón: una vida (si ya no te falta, unos puntos)
      haptic('left', 0.6, 200);
      haptic('right', 0.6, 200);
      SND.combo();
      if (HOOKS.lifeUp()) HOOKS.say('¡+1 vida!', '#ff4f7b', 1.8, false);
      else HOOKS.score(50, false);
      diagEvent('parapente: combate · corazón cogido');
    } else if (E.k === 'dodge') {
      HOOKS.score(15, false);
      if (this.toldDodge++ < 3) HOOKS.say('¡Esquivado!', '#3cf0c6', 1.2, false);
    } else if (E.k === 'kill') {
      HOOKS.foeDown(E.kind === 'boss' ? 'dragon' : E.kind, E.kind === 'boss');
      HOOKS.score(E.n, false);
      diagEvent(`parapente: combate · derribado ${E.kind}`);
    } else if (E.k === 'boss') {
      HOOKS.say('¡EL DRAGÓN! Esquiva sus ráfagas', '#ff8a3d', 3, true);
      diagEvent('parapente: combate · sale el dragón');
    } else if (E.k === 'shot' && E.n < 0) diagEvent('parapente: combate · disparo sin blanco (nadie cerca de la mirada)');
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
      HOOKS.say(this.sky ? 'Cada remo dispara adonde miras · Vira para esquivar' : 'Rema: subes · De golpe: aceleras · Un brazo: viras', '#3cf0c6', 6, false);
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
  step(dt: number, live: boolean, paused: boolean, playing: boolean, up: number, low = false, rise = up): void {
    const show = this.on && live && this.placed;
    if (show !== this.shown) {
      this.shown = show;
      // (sobre el mapa, lo pinta MapSystem; en el combate, `SkyScene`)
      if (!this.sky) MAPPILOT.on = show;
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
    if (this.sky) {
      // (los corazones: solo si te falta alguna vida, con vidas y nunca «Al fallo»)
      this.fight.fight.hearts = GAME.maxLives > 0 && GAME.lives < GAME.maxLives && !isOn('toFail');
      this.fight.step(dt, show, paused || !show, this.skyIn, head.p, head.q);
    }
    if (!show || paused) return;
    const I = this.inp, P = this.pilot;
    I.playing = playing;
    I.up = up < 0 ? 0 : up > 1 ? 1 : up;
    I.low = low;
    I.side = (head.p.x - this.head0.x) * this.right.x + (head.p.z - this.head0.z) * this.right.z;
    I.rep = playing && this.rep;
    I.fast = this.fast;
    I.perfect = this.perfect;
    this.rep = false;
    // el combate: cada remo, un disparo hacia donde miras (el explosivo, el fuerte, y una subida brusca); la carga, su onda al
    // bajar; dejarte caer de golpe, un picado
    if (this.sky && I.rep) {
      this.fight.shoot(I.fast ? 2 : 1, head.p, I.perfect);
      if (I.fast) this.fight.fight.jolt(1);
    }
    if (this.sky && this.drop.step(dt, rise, playing)) this.fight.fight.jolt(-1);
    if (this.sky && this.blastP > 1 && playing) this.fight.blast(this.blastP);
    this.blastP = 0;
    // las térmicas (sobre el mapa): por delante y a un lado; dentro, subes sin remar
    const T = this.thermals;
    if (!this.sky) T.step(dt, MAPPILOT.px, MAPPILOT.pz, MAPPILOT.heading, MAPPILOT.scale, playing, Math.random);
    I.thermal = this.sky ? 0 : T.lift;
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
    const dove = P.dive > 0.05, braked = P.brake > 0.6;
    P.step(dt, I);
    MAPPILOT.shadow = !this.sky;
    // (lo que manda, para el combate en el próximo fotograma)
    this.skyIn.steer = P.steer;
    this.skyIn.climb = P.climb;
    this.skyIn.gear = P.gear;
    this.skyIn.fight = playing;
    // que se entienda qué pasa (las primeras veces): bajando y frenando
    if (!dove && P.dive > 0.05) {
      haptic('left', 0.3, 60);
      haptic('right', 0.3, 60);
      if (this.toldDive++ < 2) HOOKS.say('Bajas · un remo lo corta', '#3cf0c6', 2.5, false);
      diagEvent(`parapente: bajas con los brazos estirados · a ${Math.round(this.sky ? this.fight.fight.y : MAPPILOT.agl)} m${this.sky ? '' : ' del suelo'}`);
    }
    if (!braked && P.brake > 0.6 && this.toldBrake++ < 2) HOOKS.say('Frenas · baja para seguir', '#3cf0c6', 2.5, false);
    // el viento en la cara: más cerca (más fuerte) cuanto más deprisa vas
    if (!this.wind) this.wind = loopSound('viento', 1, 1);
    if (this.wind) {
      const k = Math.min(1, Math.max(0, (P.gear - 0.3) / 5 + P.dive * 0.5));
      this.wind.set(this.windAt.copy(head.p).setY(head.p.y + 4.5 - 4 * k));
    }
    MAPPILOT.steer = P.steer;
    MAPPILOT.climb = P.climb;
    MAPPILOT.gear = P.gear;
    // el impulso se nota: vibración en las dos manos y un golpe de aire
    if (P.kicked) {
      // (el explosivo, más fuerte y con su marcha dicha)
      const b = P.boosted;
      haptic('left', b ? 0.9 : 0.5, b ? 140 : 70);
      haptic('right', b ? 0.9 : 0.5, b ? 140 : 70);
      SND.whoosh(head.p);
      if (b) HOOKS.say(this.sky ? `¡Disparo fuerte! Marcha ${Math.round(P.stored)}` : `¡Acelerón! Marcha ${Math.round(P.stored)}`, '#3cf0c6', 1.4, false);
      diagEvent(`parapente: remo ${P.reps} de ${this.need}${b ? ' · EXPLOSIVO' : ''} · subida en ${this.dur.toFixed(2)} s · sube ${P.climb.toFixed(2)} · marcha ${P.gear.toFixed(1)} · de lado ${Math.round(I.side * 100)} cm`);
    }
    // (y, cada poco, cómo va: si no responde, se ve aquí por qué)
    this.logT -= dt;
    if (this.logT <= 0) {
      this.logT = 4;
      diagEvent(`parapente: ${playing ? 'colgado' : 'planea solo'} · subido ${I.up.toFixed(2)} · de lado ${Math.round(I.side * 100)} cm · vira ${P.steer.toFixed(2)} · sube ${P.climb.toFixed(2)}${P.dive > 0 ? ` (baja ${P.dive.toFixed(2)})` : ''} · marcha ${P.gear.toFixed(1)} · miras a ${MAPPILOT.gaze < 0 ? '?' : Math.round(MAPPILOT.gaze)}° (mapa a ${Math.round((MAPPILOT.pitch * 180) / Math.PI)}°)${this.sky ? ` · combate: ${this.fight.fight.foes.filter((f) => f.st !== 'off' && f.st !== 'fall').length} volando, quedan ${this.fight.fight.left}, a ${Math.round(this.fight.fight.y)} m` : ''}`);
    }
  }

  /** Al acabar o salir: fuera el mapa y de vuelta la arena. */
  clear(): void {
    this.on = this.placed = this.rep = this.said = false;
    this.need = 0;
    MAPPILOT.pitch = 0;
    MAPPILOT.on = false;
    if (this.shown) for (const o of this.hidden) o.visible = true;
    this.shown = false;
    this.hidden.length = 0;
    this.fight?.clear();
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
