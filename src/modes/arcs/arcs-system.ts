/**
 * El modo Arcos en la partida (RepArena: src/71_arcs.js y la parte de Arcos de src/70_game.js): arcos de energía que salen
 * del fondo de la arena y avanzan hacia ti a distintas alturas; los pasas agachándote (o saltando las vallas, o plantándote
 * en plancha, o apartándote de los inclinados). Aquí viven los obstáculos y los orbes en la escena (los arcos y los
 * obstáculos nuevos, con su luz que avisa del peligro), la cola de cada oleada, cuándo sale cada uno, la racha con su
 * fiebre y lo que se enseña de ella; cómo se mueven y se juzgan lo dice la lógica pura (arc.ts, obstacles.ts, state.ts,
 * patterns.ts), comparada con RepArena. Cada arco pasado cuenta una repetición (sin disparo): la partida (GameSystem) suma
 * los puntos y pasa las oleadas con lo que este sistema le dice (`waveLeft`).
 */
import { AdditiveBlending, BackSide, Color, BufferGeometry, createSystem, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { haptic } from '../../input/hand-system.js';
import { dv, store } from '../../core/settings.js';
import { GAME, HOOKS } from '../../core/state.js';
import { num, on, settings, str } from '../../core/values.js';
import { hands, head } from '../../input/hand-model.js';
import { createArcTrack, type ArcTrackParts } from '../../scene-assets/arc-track.scene-asset.js';
import { createArc, type ArcParts } from '../../scene-assets/arc.scene-asset.js';
import { warmKeep } from '../../style/warm.js';
import { createLaser, createMace, createOrb, createWalls, type LaserParts, type MaceParts, type OrbParts, type WallsParts } from '../../scene-assets/arc-extras.scene-asset.js';
import { ArcCore, arxHard, arxSpeed, type ArcOutcome } from './arc.js';
import { HEAD_TOP, type ArcsEnv } from './env.js';
import { ArcObsCore, ArcOrbCore, type ObsOutcome } from './obstacles.js';
import { BladeCore, bladeMix, type BladeKind } from './blades.js';
import { bladesReady, createBladeLook, type BladeLook } from './blade-look.js';
import { fieldMaterial, fieldTick } from './wall-looks.js';
import { ARX_JUMP_GAP, ArcNewKind, arcGap, arcSpawnPlan, arxBeatGap, buildArcsWave, type ArcSpec } from './patterns.js';
import { BEAT } from '../../core/beat-hub.js';
import { AnimationMixer, AssetManager, LoopOnce, type AnimationAction } from '@iwsdk/core';
import { robotGltf } from '../../combat/robots.js';
import { arxBeatP } from '../../core/beat.js';
import { ARX_GHOST, ArxState, arxBeatTick, arxClean, arxEnd, arxGhostDiff, arxHit, arxPtsK, arxReset, arxStep, type ArxEnd, type ArxEvent, type ArxFrame, type ArxGhost } from './state.js';

const TAU = Math.PI * 2;
const rnd = Math.random;
const H = 2.55; // (lo alto de los marcos)

interface ArcEntry {
  arc: ArcCore;
  parts: ArcParts;
  grp: Group;
  side?: { mesh: Mesh; edge: Mesh; edgeMat: MeshBasicMaterial };
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
interface BladeEntry {
  blade: BladeCore;
  look: BladeLook;
}
/** Un robot lanzador (el Destructor de RepArena), a un lado de la pista. */
interface Thrower {
  root: Object3D;
  mixer: AnimationMixer;
  idle: AnimationAction | null;
  toss: AnimationAction | null;
  side: -1 | 1;
  tossT: number;
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
  /** Las cuchillas (RepArena XR: blades.ts) y los robots que las lanzan (uno a cada lado de la pista; null hasta que hay
   * con qué hacerlos). */
  private blades: BladeEntry[] = [];
  private throwers: Thrower[] | null = null;
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
  private track!: ArcTrackParts;
  private scroll = 0;
  private readonly tint = new Color(0x3cf0c6);
  private readonly tintT = new Color();
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
    // la pasarela: rayas en la pista y farolas a los lados que pasan a la velocidad de los arcos
    this.track = createArcTrack();
    this.track.grp.visible = false;
    this.world.createTransformEntity(this.track.grp);
    // (el orbe, compilado en el menú: su primer brillo no da un tirón en plena ronda)
    warmKeep(createOrb().grp);
  }

  // RepArena: arxDeco (sin la tormenta del cielo): la pista y las farolas corren hacia ti; del color de la racha (rojo en la fiebre)
  private stepTrack(dt: number, play: boolean): void {
    const T = this.track, live = this.on && GAME.phase === 'playing' && on('arcMove');
    T.grp.visible = live;
    if (!live) return;
    this.tintT.setHex(this.arx.fever ? 0xff2414 : this.arx.streak >= 5 ? 0xffd166 : 0x3cf0c6);
    this.tint.lerp(this.tintT, Math.min(1, dt * 3));
    if (play) this.scroll += arxSpeed(this.env, this.arx) * dt;
    const D = this.env.arenaDepth, z0 = -D + 0.5, span = D + 3, len = D + 1.5, pulse = this.arx.fever ? 0.75 + 0.25 * Math.sin(this.clock * 10) : 0.8;
    T.grid.scale.y = len;
    T.grid.position.z = -D + len / 2 + 0.4;
    const U = T.gridMat.uniforms;
    U.uLen.value = len;
    U.uScroll.value = -this.scroll;
    (U.uCol.value as Color).copy(this.tint);
    U.uK.value = pulse;
    T.archMat.color.copy(this.tint);
    T.archMat.opacity = Math.min(1, (0.35 + 0.25 * pulse) * (this.arx.fever ? 0.8 : 1));
    T.tipMat.color.copy(this.tint);
    T.posts.forEach((g, i) => {
      g.position.z = z0 + ((Math.floor(i / 2) * 3.2 + this.scroll) % span);
    });
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
    // (la cola de RepArena y, encima, las cuchillas de RepArena XR)
    this.queue = bladeMix(buildArcsWave(total, this.env, this.newKind), this.env, arxHard(this.env));
    this.spawnInterval = 60 / dv('arcRate', GAME.ramp);
    this.spawnT = 0.6;
  }

  /** ¿Queda algo de esta oleada por salir o por pasar? (RepArena: spawnQueue.length || arcs.some(a => a.alive && !a.judged)) */
  waveLeft(): boolean {
    return this.queue.length > 0 || this.arcs.some((e) => e.arc.alive && !e.arc.judged) || this.obstacles.some((e) => e.obs.alive && !e.obs.judged) || this.blades.some((e) => e.blade.alive && !e.blade.judged);
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
    for (const e of this.blades) this.root.remove(e.look.grp);
    this.arcs.length = this.obstacles.length = this.orbs.length = this.blades.length = 0;
    this.queue.length = 0;
    this.arx.orbT = -1;
    if (this.throwers) for (const T of this.throwers) T.root.visible = false;
    this.setFever(false);
    if (this.track) this.track.grp.visible = false;
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number): void {
    fieldTick(this.clock);
    this.clock += dt;
    const live = GAME.phase === 'playing';
    if (!this.on) {
      if (this.arcs.length || this.obstacles.length || this.orbs.length || this.blades.length) this.clear();
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
    if (!live) {
      this.track.grp.visible = false;
      if (this.throwers) for (const T of this.throwers) T.root.visible = false;
      return;
    }
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
    for (const e of this.blades) this.stepBlade(e, dt, judging);
    this.stepThrowers(dt, num('arcBlades') > 0);
    for (let i = this.blades.length - 1; i >= 0; i--) if (!this.blades[i].blade.alive) {
      this.root.remove(this.blades[i].look.grp); // (su hoja comparte malla y material: no se tira nada)
      this.blades.splice(i, 1);
    }
    // los metros, la línea de puntos y los orbes
    const frame: ArxFrame = { play, winOpen: GAME.between && false, speed: arxSpeed(this.env, this.arx), score: GAME.score, beatNow: BEAT.now() };
    const out = arxStep(this.arx, this.env, dt, frame);
    if (out.event) this.apply(out.event);
    if (out.spawnOrb) this.addOrb();
    this.stepOrbs(dt, play);
    this.stepFever(dt);
    this.stepTrack(dt, play);
  }

  // ---------------------------------------------------------------- salir

  private spawn(): void {
    const spec = this.queue.shift() as ArcSpec, cur = spec, wasJump = cur.kind === 'jump', arx = this.arx;
    arx.minNext = 0;
    // una cuchilla (RepArena XR): si sus hojas aún no han cargado, en su lugar, la maza
    if (spec.kind === 'blade') {
      if (bladesReady()) this.addBlade(spec.blade as BladeKind);
      else this.addObs('mace');
      const gap = Math.min(this.spawnInterval * (spec.gap ?? arcGap(this.env, str('arcTiming') === 'regular')), num('arcMaxGap'));
      this.spawnT = arxBeatGap(gap, this.env, '');
      return;
    }
    const plan = arcSpawnPlan(spec, this.env, arx, this.spawnInterval, (kind) => {
      // (un obstáculo nuevo, en el mismo momento del azar en que lo hacía RepArena)
      this.addObs(kind as 'laser' | 'walls' | 'mace');
    });
    for (const a of plan.arcs) this.addArc(a);
    // (no se avisa de lo que viene —decidido por el usuario: se entrenan los reflejos—: sin texto; queda la bocina y, en el
    // semipuente, la huella de la mano en el suelo. `plan.notice` sigue para compararlo con RepArena)
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
      // (el campo de fuerza, elegido por el usuario: wall-looks.ts)
      const mesh = new Mesh(g, fieldMaterial());
      mesh.userData.noInk = true;
      const eh = Math.max(0.05, arc.barAt(xe) - 0.03), edge = new Mesh(new PlaneGeometry(0.07, eh), new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false, side: DoubleSide }));
      edge.position.set(xe, eh / 2, 0);
      edge.userData.noInk = true;
      grp.add(mesh, edge);
      e.side = { mesh, edge, edgeMat: edge.material as MeshBasicMaterial };
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
    // los inclinados, por encima de la barra, también el campo de fuerza (pedido del usuario: arriba parecía hueco)
    else if (arc.tilt && !arc.jump) p.curtain.material = fieldMaterial();
    zapLines(p.lines);
    this.arcs.push(e);
  }

  private addObs(kind: 'laser' | 'walls' | 'mace'): void {
    const o = new ArcObsCore(kind, this.env, arxSpeed(this.env, this.arx)), e: ObsEntry = { obs: o, grp: new Group(), own: [] };
    o.track = true; // (el láser acaba donde estás tú: src/modes/arcs/obstacles.ts)
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

  // ---------------------------------------------------------------- una cuchilla (RepArena XR)

  private addBlade(kind: BladeKind): void {
    const look = createBladeLook(kind);
    if (!look) return;
    const blade = new BladeCore(kind, this.env, arxSpeed(this.env, this.arx), arxHard(this.env));
    look.grp.position.set(blade.x, blade.y, blade.z);
    this.root.add(look.grp);
    this.blades.push({ blade, look });
    // el robot de su lado la lanza (con un gruñido)
    const T = this.throwers?.find((t) => t.side === blade.from);
    if (T?.toss) {
      T.toss.reset().setLoop(LoopOnce, 1).play();
      T.toss.crossFadeFrom(T.idle ?? T.toss, 0.12, false);
      T.tossT = T.toss.getClip().duration;
      SND.roar(this.tmp.copy(T.root.position), 0.6, 'robot');
    }
  }

  /** Los robots lanzadores (los Destructores de RepArena: pedido del usuario), uno a cada lado del fondo de la pista, de
   * cara a ti; esperan a su aire y, al salir una cuchilla de su lado, la lanzan por encima del hombro. */
  private stepThrowers(dt: number, show: boolean): void {
    if (!this.throwers) {
      if (!show) return;
      const lib = AssetManager.getGLTF('foe-anims') ?? null;
      if (!lib) return;
      this.throwers = [];
      for (const side of [-1, 1] as const) {
        const g = robotGltf('destroyer', lib);
        if (!g) return;
        const root = g.scene, mixer = new AnimationMixer(root), clip = (n: string) => g.animations.find((c) => c.name === n);
        root.position.set(side * 2.5, 0, -this.env.arenaDepth + 1.2);
        root.rotation.y = -side * 0.35; // (de cara a la pista, algo hacia ti)
        root.scale.setScalar(1.1);
        const idleC = clip('Idle_Loop'), tossC = clip('OverhandThrow');
        const idle = idleC ? mixer.clipAction(idleC) : null, toss = tossC ? mixer.clipAction(tossC) : null;
        idle?.play();
        if (toss) toss.clampWhenFinished = false;
        // (cada uno a su compás: no se mueven a la vez)
        mixer.update(side > 0 ? 0.7 : 0);
        this.root.add(root);
        this.throwers.push({ root, mixer, idle, toss, side, tossT: 0 });
      }
    }
    for (const T of this.throwers) {
      T.root.visible = show;
      if (!show) continue;
      if (T.tossT > 0) {
        T.tossT -= dt;
        if (T.tossT <= 0.15 && T.idle && T.toss) {
          T.idle.reset().play();
          T.idle.crossFadeFrom(T.toss, 0.2, false);
          T.tossT = 0;
        }
      }
      T.mixer.update(dt);
    }
  }

  private stepBlade(e: BladeEntry, dt: number, judging: boolean): void {
    const b = e.blade, L = e.look, f = b.update(dt, this.env, judging);
    L.grp.position.set(b.x, b.y, b.z);
    L.grp.rotation.set(0, 0, b.bank);
    L.spin.rotation.y = b.ang;
    // (aparece creciendo)
    L.grp.scale.setScalar(Math.min(1, b.t / 0.35));
    if (f.whoosh) SND.whoosh(this.tmp.set(b.x, b.y, b.z), 'arc');
    if (f.beep) SND.beep(f.beep);
    if (f.outcome) this.obsOutcome(f.outcome);
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
    if (e.side) e.side.mesh.material = fieldMaterial(a.danger && a.sideBad); // (metiéndote en él, parpadea)
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
    P.bodyMat.color.setHex(this.feverOn ? 0xff8fcf : 0xffcf5a);
    P.ringMat.color.setHex(this.feverOn ? 0xff7fc4 : 0xffd166);
    P.haloMat.color.setHex(this.feverOn ? 0xff5cb0 : 0xffc04a);
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
      // (la gema gira y sus caras atrapan la luz; el halo late con un destello de vez en cuando)
      P.gem.rotation.set(0.35 * Math.sin(t * 0.9 + o.ph), t * 1.8 + o.ph, 0);
      const glint = Math.max(0, Math.sin(t * 2.3 + o.ph * 3)) ** 8;
      P.halo.scale.setScalar(0.38 + 0.08 * Math.sin(t * 6 + o.ph) + 0.25 * glint);
      P.haloMat.opacity = 0.6 + 0.35 * glint;
      P.rings[0].rotation.set(t * 1.6 + o.ph, t, 0);
      P.rings[1].rotation.set(t * -1.2, t * 1.9 + o.ph, 0);
      if (out) {
        HOOKS.score(out.pts, false);
        HOOKS.say(out.say[0], out.say[1], out.say[2], out.say[3]);
        if (out.cheer) HOOKS.say(out.cheer[0], out.cheer[1], out.cheer[2], false);
        // (al cogerlo, más fuerte y con más destellos: oro, blanco y turquesa, como sus aros)
        SND.orb(this.tmp.set(out.at.x, out.at.y, out.at.z), true);
        HOOKS.sparks(this.tmp, 36, this.feverOn ? 0xff7fc4 : 0xffd166);
        HOOKS.sparks(this.tmp, 18, 0xffffff);
        HOOKS.sparks(this.tmp, 14, 0x7ff7e0);
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
    if (e.side) e.side.edgeMat.dispose();
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
    e.parts.grp.remove(e.parts.gem); // (la talla de la gema es compartida: no se tira)
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
