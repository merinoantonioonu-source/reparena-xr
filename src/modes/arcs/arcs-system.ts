/**
 * El modo Arcos en la partida (RepArena: src/71_arcs.js y la parte de Arcos de src/70_game.js): arcos de energía que salen
 * del fondo de la arena y avanzan hacia ti a distintas alturas; los pasas agachándote (o saltando las vallas, o plantándote
 * en plancha, o apartándote de los inclinados). Aquí viven los obstáculos y los orbes en la escena (los arcos y los
 * obstáculos nuevos, con su luz que avisa del peligro), la cola de cada oleada, cuándo sale cada uno, la racha con su
 * fiebre y lo que se enseña de ella; cómo se mueven y se juzgan lo dice la lógica pura (arc.ts, obstacles.ts, state.ts,
 * patterns.ts), comparada con RepArena. Cada arco pasado cuenta una repetición (sin disparo): la partida (GameSystem) suma
 * los puntos y pasa las oleadas con lo que este sistema le dice (`waveLeft`).
 */
import { AdditiveBlending, BackSide, BufferGeometry, createSystem, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { haptic } from '../../input/hand-system.js';
import { dv, store } from '../../core/settings.js';
import { GAME, HOOKS } from '../../core/state.js';
import { num, on, settings, str } from '../../core/values.js';
import { hands, head } from '../../input/hand-model.js';
import { createArc, type ArcParts } from '../../scene-assets/arc.scene-asset.js';
import { createLaser, createMace, createOrb, createWalls, type LaserParts, type MaceParts, type OrbParts, type WallsParts } from '../../scene-assets/arc-extras.scene-asset.js';
import { ArcCore, arxSpeed, type ArcOutcome } from './arc.js';
import { HEAD_TOP, type ArcsEnv } from './env.js';
import { ArcObsCore, ArcOrbCore, type ObsOutcome } from './obstacles.js';
import { ARX_JUMP_GAP, ArcNewKind, arcGap, arcSpawnPlan, arxBeatGap, buildArcsWave, type ArcSpec } from './patterns.js';
import { BEAT } from '../../core/beat-hub.js';
import { arxBeatP } from '../../core/beat.js';
import { ARX_GHOST, ArxState, arxBeatTick, arxClean, arxEnd, arxGhostDiff, arxHit, arxPtsK, arxReset, arxStep, type ArxEnd, type ArxEvent, type ArxFrame, type ArxGhost } from './state.js';

const TAU = Math.PI * 2;
const rnd = Math.random;
const H = 2.55; // (lo alto de los marcos)

interface ArcEntry {
  arc: ArcCore;
  parts: ArcParts;
  grp: Group;
  side?: { mesh: Mesh; edge: Mesh; mat: MeshBasicMaterial };
  print?: Mesh;
  zapT: number;
}
interface ObsEntry {
  obs: ArcObsCore;
  grp: Group;
  laser?: LaserParts;
  walls?: WallsParts;
  mace?: MaceParts;
  own: Material[];
}
interface OrbEntry {
  orb: ArcOrbCore;
  parts: OrbParts;
}

/** Una raya quebrada de chispas a lo largo de la barra (RepArena: zapLines). */
function zapLines(lines: ArcParts['lines']): void {
  for (const l of lines) {
    const p = l.geometry.attributes.position as Float32BufferAttribute;
    for (let i = 0; i < 26; i++) {
      const u = i / 25, j = i && i < 25 ? 1 : 0;
      p.setXYZ(i, (u - 0.5) * 2.0, (rnd() - 0.5) * 0.12 * j, (rnd() - 0.5) * 0.05 * j);
    }
    p.needsUpdate = true;
  }
}

export class ArcsSystem extends createSystem({}) {
  readonly arx = new ArxState();
  private readonly newKind = new ArcNewKind(rnd);
  private root = new Group();
  private arcs: ArcEntry[] = [];
  private obstacles: ObsEntry[] = [];
  private orbs: OrbEntry[] = [];
  private queue: ArcSpec[] = [];
  private spawnT = 0;
  private spawnInterval = 5;
  private clock = 0;
  private jumpFast = 9;
  private lastY = 0;
  private vy = 0;
  private feverOn = false;
  private veil!: Mesh;
  private veilK = 0;
  private flash = 0;
  /** La altura de tus ojos de pie al calibrar (RepArena: calibRef). */
  calibRef = 1.6;
  private readonly env: ArcsEnv;
  private readonly tmp = new Vector3();
  private readonly lw = { x: 0, y: 0, z: 0 };
  private readonly rw = { x: 0, y: 0, z: 0 };

  constructor(...a: ConstructorParameters<ReturnType<typeof createSystem>>) {
    super(...a);
    const self = this;
    this.env = {
      s: (k) => num(k),
      dv: (k) => dv(k, GAME.ramp),
      rnd,
      head: head.p,
      get calibRef() {
        return self.calibRef;
      },
      get arenaDepth() {
        return num('depth') > 0 ? num('depth') : 11;
      },
      get jumpFastT() {
        return self.jumpFast;
      },
      get beatP() {
        return arxBeatP(true, on('arcBeat'), num('bpm')); // (con música y «Arcos al compás»: cada arco llega en un pulso)
      },
      get time() {
        return self.clock;
      },
    };
  }

  init(): void {
    this.world.createTransformEntity(this.root);
    // el velo rojo de la fiebre: tiñe toda la vista (una esfera alrededor de la cabeza, por debajo de los paneles)
    this.veil = new Mesh(new SphereGeometry(0.42, 20, 10), new MeshBasicMaterial({ color: 0xff1a08, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, blending: AdditiveBlending, fog: false, toneMapped: false }));
    this.veil.userData.noInk = true;
    this.veil.renderOrder = 20;
    this.veil.visible = false;
    this.world.createTransformEntity(this.veil);
  }

  private get on(): boolean {
    return settings.mode === 'arcs';
  }

  // ---------------------------------------------------------------- la ronda y las oleadas (las llama la partida)

  /** Empieza la ronda (RepArena: arxReset): todo a cero y tu mejor ronda como fantasma. */
  begin(): void {
    this.clear();
    const best = store<ArxGhost>(ARX_GHOST);
    this.apply(arxReset(this.arx, best && Array.isArray(best.tl) ? best : null));
    if (head.p.y > 1.1) this.calibRef = head.p.y;
    this.jumpFast = 9;
    this.lastY = head.p.y;
  }

  /** Empieza la oleada i (RepArena: buildWave y startWave en Arcos): la cola de obstáculos y el ritmo de salida. */
  startWave(total: number): void {
    this.queue = buildArcsWave(total, this.env, this.newKind);
    this.spawnInterval = 60 / dv('arcRate', GAME.ramp);
    this.spawnT = 0.6;
  }

  /** ¿Queda algo de esta oleada por salir o por pasar? (RepArena: spawnQueue.length || arcs.some(a => a.alive && !a.judged)) */
  waveLeft(): boolean {
    return this.queue.length > 0 || this.arcs.some((e) => e.arc.alive && !e.arc.judged) || this.obstacles.some((e) => e.obs.alive && !e.obs.judged);
  }

  /** Lo que se enseña en el marcador: metros, racha y la fiebre; y cómo vas frente a tu mejor ronda. */
  hud(): { dist: number; streak: number; fever: boolean; got: number; ghost: number | null } {
    return { dist: this.arx.dist, streak: this.arx.streak, fever: this.arx.fever, got: this.arx.got, ghost: arxGhostDiff(this.arx, GAME.score) };
  }

  /** Al acabar (RepArena: arxEnd): la medalla, los metros, los orbes y, si fue tu mejor ronda, el fantasma nuevo guardado. */
  end(score: number, reps: number, taken: number): ArxEnd {
    const e = arxEnd(this.arx, score, reps, taken);
    if (e.ghost) store(ARX_GHOST, e.ghost);
    return e;
  }

  /** Quita todo lo que hay en la arena (al empezar o acabar la ronda, o al salir de Arcos). */
  clear(): void {
    for (const e of this.arcs) this.freeArc(e);
    for (const e of this.obstacles) this.freeObs(e);
    for (const e of this.orbs) this.freeOrb(e);
    this.arcs.length = this.obstacles.length = this.orbs.length = 0;
    this.queue.length = 0;
    this.arx.orbT = -1;
    this.setFever(false);
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number): void {
    this.clock += dt;
    const live = GAME.phase === 'playing';
    if (!this.on) {
      if (this.arcs.length || this.obstacles.length || this.orbs.length) this.clear();
      this.veil.visible = false;
      return;
    }
    if (GAME.paused) return;
    // el salto (RepArena: jumpTrack): cuánto hace que subiste deprisa
    if (dt > 0) {
      const v = (head.p.y - this.lastY) / dt;
      this.lastY = head.p.y;
      this.vy = this.vy * 0.5 + v * 0.5;
      this.jumpFast = this.vy > 0.6 ? 0 : this.jumpFast + dt;
    }
    if (!live) return;
    const play = !GAME.between && GAME.wave > 0, judging = play || GAME.between;
    // salen de la cola, a su ritmo
    if (play) {
      this.spawnT -= dt;
      // con ritmo, el siguiente sale cuando pasa el pulso en que ha de llegarte; sin ritmo, siempre (RepArena: arxBeatTick)
      const onBeat = arxBeatTick(this.arx, this.env, arxSpeed(this.env, this.arx), BEAT.now());
      if (this.spawnT <= 0 && this.queue.length && onBeat) this.spawn();
    }
    // los arcos y los obstáculos
    for (const e of this.arcs) this.stepArc(e, dt, judging);
    for (const e of this.obstacles) this.stepObs(e, dt, judging);
    for (let i = this.arcs.length - 1; i >= 0; i--) if (!this.arcs[i].arc.alive) {
      this.freeArc(this.arcs[i]);
      this.arcs.splice(i, 1);
    }
    for (let i = this.obstacles.length - 1; i >= 0; i--) if (!this.obstacles[i].obs.alive) {
      this.freeObs(this.obstacles[i]);
      this.obstacles.splice(i, 1);
    }
    // los metros, la línea de puntos y los orbes
    const frame: ArxFrame = { play, winOpen: GAME.between && false, speed: arxSpeed(this.env, this.arx), score: GAME.score, beatNow: BEAT.now() };
    const out = arxStep(this.arx, this.env, dt, frame);
    if (out.event) this.apply(out.event);
    if (out.spawnOrb) this.addOrb();
    this.stepOrbs(dt, play);
    this.stepFever(dt);
  }

  // ---------------------------------------------------------------- salir

  private spawn(): void {
    const spec = this.queue.shift() as ArcSpec, cur = spec, wasJump = cur.kind === 'jump', arx = this.arx;
    arx.minNext = 0;
    const plan = arcSpawnPlan(spec, this.env, arx, this.spawnInterval, (kind) => {
      // (un obstáculo nuevo, en el mismo momento del azar en que lo hacía RepArena)
      this.addObs(kind as 'laser' | 'walls' | 'mace');
    });
    for (const a of plan.arcs) this.addArc(a);
    if (plan.notice) HOOKS.say(`${plan.notice[0]} ${plan.notice[1]}`, plan.notice[2], 2.6, true);
    if (plan.horn) SND.horn();
    arx.minNext = plan.minNext;
    arx.nextGap = plan.nextGap;
    if (plan.orbT !== null) arx.orbT = plan.orbT;
    // lo que tarda el siguiente (con el hueco que marcó la coreografía, o uno irregular)
    const gap = Math.max(arx.minNext || 0, Math.min(this.spawnInterval * (arx.nextGap || arcGap(this.env, str('arcTiming') === 'regular')), num('arcMaxGap')));
    this.spawnT = arxBeatGap(gap, this.env, '');
    if (wasJump && this.queue[0] && this.queue[0].kind === 'jump') this.spawnT = Math.max(this.spawnT, ARX_JUMP_GAP); // (dos vallas seguidas: caer y volver a saltar)
  }

  private addArc(arc: ArcCore): void {
    const p = createArc(arc.barY, H, arc.spin ? 0 : arc.tilt, arc.jump, arc.hw), grp = p.grp;
    grp.position.set(0, 0, arc.z);
    this.root.add(grp);
    const e: ArcEntry = { arc, parts: p, grp, zapT: 0 };
    // los inclinados: una pared de energía bajo el lado bajo, con su canto verde: ahí no se pasa
    if (arc.sideMin) {
      const [xa, xe] = arc.sideWallX(), g = new BufferGeometry(), y = (x: number): number => Math.max(0.05, arc.barAt(x) - 0.04);
      g.setAttribute('position', new Float32BufferAttribute([xa, y(xa), 0, xe, y(xe), 0, xa, 0.05, 0, xe, 0.05, 0], 3));
      g.setIndex([0, 2, 1, 1, 2, 3]);
      const mat = new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: DoubleSide }), mesh = new Mesh(g, mat);
      mesh.userData.noInk = true;
      const eh = Math.max(0.05, arc.barAt(xe) - 0.03), edge = new Mesh(new PlaneGeometry(0.07, eh), new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false, side: DoubleSide }));
      edge.position.set(xe, eh / 2, 0);
      edge.userData.noInk = true;
      grp.add(mesh, edge);
      e.side = { mesh, edge, mat };
    }
    // el semipuente: la huella de la mano en el suelo, en el lado alto, que late mientras llega
    if (arc.low) {
      const pr = new Mesh(new PlaneGeometry(0.26, 0.26), new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      pr.rotation.x = -Math.PI / 2;
      pr.userData.noInk = true;
      this.root.add(pr);
      e.print = pr;
    }
    if (arc.spin) parts0(p).curtain.visible = false; // (la rueda: la cortina no la sigue)
    zapLines(p.lines);
    this.arcs.push(e);
  }

  private addObs(kind: 'laser' | 'walls' | 'mace'): void {
    const o = new ArcObsCore(kind, this.env, arxSpeed(this.env, this.arx)), e: ObsEntry = { obs: o, grp: new Group(), own: [] };
    if (kind === 'laser') {
      e.laser = createLaser();
      e.grp = e.laser.grp;
      e.own = e.laser.own;
    } else if (kind === 'walls') {
      e.walls = createWalls();
      e.grp = e.walls.grp;
      e.own = e.walls.own;
      for (const w of e.walls.walls) w.rotation.z = o.ang;
    } else {
      e.mace = createMace(o.piv, o.L);
      e.grp = e.mace.grp;
      e.own = e.mace.own;
    }
    e.grp.position.z = o.z;
    this.root.add(e.grp);
    this.obstacles.push(e);
  }

  // ---------------------------------------------------------------- un arco

  private stepArc(e: ArcEntry, dt: number, judging: boolean): void {
    const a = e.arc, P = e.parts, t = this.clock;
    const out = a.update(dt, this.env, judging);
    e.grp.position.z = a.z;
    if (a.spin) P.bar.rotation.z = a.tilt; // (la rueda: la barra gira mientras llega)
    e.grp.scale.set(Math.min(1, a.t / 0.4), 1, 1); // (aparece abriéndose)
    e.zapT -= dt;
    if (e.zapT <= 0) {
      e.zapT = 0.045;
      zapLines(P.lines);
      for (const s of P.ends) s.scale.setScalar(0.22 + rnd() * 0.16 + 0.1);
    }
    if (P.saws.length) for (const s of P.saws) s.rotation.y -= dt * 22; // (las sierras giran)
    // la luz: más viva y más blanca cuando te va a dar
    const flick = 0.75 + rnd() * 0.25;
    P.glowMat.opacity = Math.min(1, (a.danger ? 1 : 0.7) * flick);
    P.curtainMat.opacity = a.danger ? 0.32 + 0.15 * Math.sin(t * 30) : 0.18;
    P.coreMat.color.setHex(a.danger ? 0xffffff : 0xffb0a0);
    if (e.side) e.side.mat.opacity = a.danger && a.sideBad ? 0.8 + 0.2 * Math.sin(t * 30) : 0.9;
    if (e.print) {
      const d = head.p.z - a.z, o = a.judged ? Math.max(0, (e.print.material as MeshBasicMaterial).opacity - dt * 2) : d < 9 ? Math.min(1, (9 - d) / 2) * (0.65 + 0.35 * Math.sin(t * 9)) : 0;
      (e.print.material as MeshBasicMaterial).opacity = o;
      e.print.visible = o > 0.01;
      e.print.position.set(a.leanX + Math.sign(a.leanX) * 0.3, 0.008, head.p.z - 0.4);
    }
    if (a.beep) SND.beep(a.beep);
    if (out) this.arcOutcome(out);
  }

  private arcOutcome(o: ArcOutcome): void {
    const at = this.tmp.set(o.hitPoint.x, o.hitPoint.y, o.hitPoint.z);
    if (o.kind === 'lane') {
      if (o.say) HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
      return;
    }
    if (o.hurt) {
      HOOKS.sparks(at, 24, 0xffd0c8);
      SND.zap(at);
      HOOKS.playerHit(1, true);
      this.apply(arxHit(this.arx));
      if (o.say) HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
      return;
    }
    SND.whoosh(at, 'arc');
    if (o.kind === 'second') {
      HOOKS.score(Math.floor(o.scoreBase * (1 + GAME.combo * 0.1)), false);
      if (o.cheer) HOOKS.say(o.cheer[0], o.cheer[1], o.cheer[2], false);
      return;
    }
    HOOKS.arcRep(o.perfect);
    const ev = arxClean(this.arx, this.env);
    if (ev) this.apply(ev);
    if (o.say) HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
    if (o.perfectSound) SND.perfect();
  }

  // ---------------------------------------------------------------- un obstáculo nuevo

  private stepObs(e: ObsEntry, dt: number, judging: boolean): void {
    const o = e.obs, f = o.update(dt, this.env, judging), t = this.clock;
    e.grp.position.z = o.z;
    if (e.laser) {
      e.laser.beam.position.x = o.beamX;
      e.laser.mat.opacity = f.danger ? 1 : 0.7;
    } else if (e.walls) {
      e.walls.walls[0].position.x = o.wallL;
      e.walls.walls[1].position.x = o.wallR;
      for (const m of e.walls.mats) m.opacity = f.danger ? 0.8 + 0.2 * Math.sin(t * 30) : 0.9;
    } else if (e.mace) {
      const M = e.mace;
      M.arm.quaternion.setFromUnitVectors(this.tmp.set(0, -1, 0), this.lw2(o.bx, o.by - o.piv, o.bz));
      M.ball.rotation.x = o.t * 0.7;
      M.glowMat.opacity = f.danger ? 0.75 + 0.2 * Math.sin(t * 30) : 0.25;
      if (f.whoosh) SND.whoosh(this.tmp.set(o.bx, o.by, o.z + o.bz), 'arc');
    }
    if (f.beep) SND.beep(f.beep);
    if (f.outcome) this.obsOutcome(f.outcome);
  }
  private readonly dir = new Vector3();
  private lw2(x: number, y: number, z: number): Vector3 {
    return this.dir.set(x, y, z).normalize();
  }

  private obsOutcome(o: ObsOutcome): void {
    const at = this.tmp.set(o.at.x, o.at.y, o.at.z);
    if (o.kind === 'lane') {
      HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
      return;
    }
    if (o.kind === 'hit') {
      HOOKS.sparks(at, 24, 0xffd0c8);
      if (o.sounds[0] === 'metalHit') SND.metalHit(at, true);
      else SND.zap(at);
      HOOKS.playerHit(1, true);
      this.apply(arxHit(this.arx));
      HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
      return;
    }
    SND.whoosh(at, 'arc');
    HOOKS.arcRep(true);
    const ev = arxClean(this.arx, this.env);
    if (ev) this.apply(ev);
    HOOKS.say(o.say[0], o.say[1], o.say[2], o.say[3]);
    SND.perfect();
  }

  // ---------------------------------------------------------------- los orbes

  private addOrb(): void {
    const orb = new ArcOrbCore(this.env, arxSpeed(this.env, this.arx)), parts = createOrb();
    parts.grp.position.set(orb.at.x, orb.at.y, orb.at.z);
    this.root.add(parts.grp);
    this.orbs.push({ orb, parts });
    this.paintOrb(parts);
  }
  private paintOrb(P: OrbParts): void {
    P.bodyMat.emissive.setHex(this.feverOn ? 0xff3c9a : 0xffb02a);
    P.ringMat.color.setHex(this.feverOn ? 0xff7fc4 : 0xffd166);
  }

  private stepOrbs(dt: number, play: boolean): void {
    const hs = { left: null as typeof this.lw | null, right: null as typeof this.rw | null };
    if (hands.left.ok) hs.left = this.lw, this.lw.x = hands.left.wrist.x, this.lw.y = hands.left.wrist.y, this.lw.z = hands.left.wrist.z;
    if (hands.right.ok) hs.right = this.rw, this.rw.x = hands.right.wrist.x, this.rw.y = hands.right.wrist.y, this.rw.z = hands.right.wrist.z;
    const t = this.clock;
    for (const e of this.orbs) {
      const out = e.orb.update(dt, t, this.env, this.arx, hs, play);
      const P = e.parts, o = e.orb;
      P.grp.position.set(o.at.x, o.at.y, o.at.z);
      const pulse = 1 + 0.12 * Math.sin(t * 6 + o.ph);
      P.grp.scale.setScalar(pulse);
      P.rings[0].rotation.set(t * 1.6 + o.ph, t, 0);
      P.rings[1].rotation.set(t * -1.2, t * 1.9 + o.ph, 0);
      if (out) {
        HOOKS.score(out.pts, false);
        HOOKS.say(out.say[0], out.say[1], out.say[2], out.say[3]);
        if (out.cheer) HOOKS.say(out.cheer[0], out.cheer[1], out.cheer[2], false);
        SND.orb(this.tmp.set(out.at.x, out.at.y, out.at.z));
        HOOKS.sparks(this.tmp, 14, 0xffd166);
        haptic('left', 0.4, 60);
        haptic('right', 0.4, 60);
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) if (!this.orbs[i].orb.alive) {
      this.freeOrb(this.orbs[i]);
      this.orbs.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- la fiebre

  private apply(ev: ArxEvent): void {
    if (ev.feverLook !== undefined) this.setFever(ev.feverLook);
    if (ev.feverStart) this.flash = 1;
    if (ev.cheer) HOOKS.say(ev.cheer[0], ev.cheer[1], ev.cheer[2], false);
    if (ev.sound === 'combo') SND.combo();
    else if (ev.sound === 'horn') SND.horn();
  }
  private setFever(on: boolean): void {
    this.feverOn = on;
    GAME.ptsK = on ? 2 : 1; // (en la fiebre, los puntos valen el doble)
    for (const e of this.orbs) this.paintOrb(e.parts);
  }
  // el velo rojo (y el relámpago enorme del principio), que se enciende y se apaga poco a poco
  private stepFever(dt: number): void {
    this.veilK += ((this.feverOn ? 1 : 0) - this.veilK) * Math.min(1, dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2);
    const o = 0.1 * this.veilK * (0.8 + 0.2 * Math.sin(this.clock * 5)) + 0.5 * this.flash * this.flash;
    const m = this.veil.material as MeshBasicMaterial;
    m.opacity = o;
    this.veil.visible = o > 0.005;
    this.veil.position.copy(head.p);
  }

  // ---------------------------------------------------------------- soltar

  private freeArc(e: ArcEntry): void {
    this.root.remove(e.grp);
    this.disposeTree(e.grp);
    for (const m of e.parts.own) m.dispose();
    if (e.side) e.side.mat.dispose();
    if (e.print) {
      this.root.remove(e.print);
      e.print.geometry.dispose();
      (e.print.material as Material).dispose();
    }
  }
  private freeObs(e: ObsEntry): void {
    this.root.remove(e.grp);
    this.disposeTree(e.grp);
    for (const m of e.own) m.dispose();
  }
  private freeOrb(e: OrbEntry): void {
    this.root.remove(e.parts.grp);
    this.disposeTree(e.parts.grp);
    for (const m of e.parts.own) m.dispose();
  }
  // (las mallas con geometría propia, que no se comparte entre arcos)
  private disposeTree(o: Object3D): void {
    o.traverse((c) => {
      const m = c as Mesh;
      if (m.isMesh || (c as { isLine?: boolean }).isLine) (m.geometry as BufferGeometry | undefined)?.dispose();
    });
  }
}

const parts0 = (p: ArcParts): ArcParts => p;
void TAU;
void HEAD_TOP;
