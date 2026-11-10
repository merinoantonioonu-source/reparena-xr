/**
 * Los voladores con modelo (abeja, murciélago, Cthulhu y el dragón, de Quaternius), como en RepArena (src/70_game.js: Flyer
 * y beastFlyer): salen por el hueco de una compuerta, vuelan hacia ti con su vuelo errático (src/combat/flight.ts, el de
 * RepArena tal cual), batiendo las alas siempre a su ritmo (FLAP_HZ), se echan atrás y se lanzan a morderte (te quitan su
 * fuerza en vidas), y luego se alejan y vuelven. Zumban mientras vuelan. Un disparo los empuja; el último los mata: estallan
 * en una nube de baba y caen al suelo como un cuerpo suelto (la física de IWSDK), y luego se desvanecen.
 * Mientras vuelan no tienen cuerpo de física (en RepArena no chocaban con los de tierra); al caer, una esfera dinámica.
 */
import { AnimationAction, AnimationMixer, AssetManager, createSystem, DoubleSide, Entity, Group, LoopOnce, LoopRepeat, Material, Mesh, Object3D, PhysicsBody, PhysicsManipulation, PhysicsShape, PhysicsShapeType, PhysicsState, SkinnedMesh, Vector3 } from '@iwsdk/core';
import { Flyer, Foe, FoeState } from './components.js';
import { FLAP_HZ, Flight, type FlyEnv, type FlyGate } from './flight.js';
import { devFoe, FOE_DEF } from './foes.js';
import { EnemySystem, FoeTarget } from './enemies.js';
import { num } from '../core/values.js';
import { loopSound, SND, type SoundLoop } from '../audio/sound.js';
import { VOICE_PITCH } from '../audio/catalog.js';
import { GAME, HOOKS } from '../core/state.js';

interface FlyRt {
  kind: string;
  flight: Flight;
  maxHp: number;
  str: number;
  body: Group;
  mixer: AnimationMixer;
  fly: AnimationAction | null;
  bite: AnimationAction | null;
  death: AnimationAction | null;
  biting: boolean;
  buzz: SoundLoop | null;
  target: FoeTarget;
  /** Muerto: el empujón que le toca al caer (cuando la física ya tiene su cuerpo) y el desvanecerse. */
  launch: Vector3 | null;
  fade: Material[] | null;
}

const ICHOR = 0x525c0f; // (la baba de los bichos de RepArena: fx.ichor)

export class FlyerSystem extends createSystem({ flyers: { required: [Flyer, Foe] } }, {}) {
  private enemies: EnemySystem | null = null;
  private env: FlyEnv = { head: GAME.head, play: false, active: false, beat: true, low: 0, sup: null };
  private p = new Vector3();
  private look = new Vector3();
  private manip = { force: [0, 0, 0] as [number, number, number], linearVelocity: [0, 0, 0] as [number, number, number], angularVelocity: [0, 0, 0] as [number, number, number] };
  private beatK = -1;
  private wingMats = new Set<Material>();

  // (los blancos y las cuentas de vida son los de todos los enemigos: los lleva su sistema, que se registra antes)
  init(): void {
    this.enemies = this.world.getSystem(EnemySystem) ?? null;
    if (this.enemies) this.enemies.flyers = this;
  }

  /** ¿Está ya cargado su modelo? */
  ready(kind: string): boolean {
    const d = FOE_DEF[kind];
    return !!d?.fly && !!AssetManager.getGLTF(d.asset);
  }

  /** Cuántos vuelan aún. */
  aliveCount(): number {
    let n = 0;
    for (const e of this.queries.flyers.entities) if (e.getValue(Foe, 'state') !== FoeState.Dead) n++;
    return n;
  }

  /** Saca uno (kind: bee, bat, cthulhu, dragon) por el hueco de gate, con hp de vida. flySpeed y erratic: «Velocidad de
   * vuelo» y «Vuelo errático» de esta oleada. */
  spawn(kind: string, gate: FlyGate, hp: number, flySpeed: number, erratic: number, tiny = false): FoeTarget | null {
    const d = FOE_DEF[kind], gltf = d && AssetManager.getGLTF(d.asset);
    if (!d || !gltf || !this.enemies) return null;
    const flight = new Flight(kind, gate, flySpeed, erratic, hp, Math.random, GAME.lowFly > 0, tiny); // (tumbado, salen bajos; en la batalla diminuta, pequeños y de una trampilla)
    // (como en RepArena: el balanceo y el alabeo del vuelo van en un grupo aparte, y el centro del bicho queda donde vuela)
    const root = new Group(), body = new Group(), model = gltf.scene;
    root.name = `volador-${kind}`;
    root.add(body);
    model.scale.setScalar(d.k);
    model.position.y = -d.h * d.ctr;
    body.add(model);
    root.scale.setScalar(flight.K.scale * (tiny ? 0.42 : 1));
    root.position.copy(flight.pos);
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      // las alas se ven por los dos lados (RepArena: DoubleSide); el material es el del modelo, el mismo para todos los suyos
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!this.wingMats.has(mat)) {
        this.wingMats.add(mat);
        mat.side = DoubleSide;
        mat.needsUpdate = true;
      }
      m.castShadow = true;
      if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    });
    const mixer = new AnimationMixer(model), clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const act = (n: string): AnimationAction | null => {
      const c = clip(n);
      return c ? mixer.clipAction(c) : null;
    };
    const fly = act(d.clips.walk), bite = act(d.clips.attack), death = act(d.clips.death);
    if (fly) {
      fly.setLoop(LoopRepeat, Infinity);
      fly.timeScale = (FLAP_HZ[kind] ?? 3) * (fly.getClip().duration || 1.125); // (aletea siempre a su ritmo)
      fly.play();
    }
    const e = this.world.createTransformEntity(root);
    const str = devFoe('f:' + kind).str;
    const target = new FoeTarget(e, root, flight.radius, 0, hp, (0.34 * flight.K.scale + 0.12) * (tiny ? 0.42 : 1), true);
    const rt: FlyRt = { kind, flight, maxHp: hp, str, body, mixer, fly, bite, death, biting: false, buzz: loopSound('zumbido-dron', 0.55, 130 / 135), target, launch: null, fade: null };
    root.userData.fly = rt;
    this.enemies.targets.push(target);
    e.addComponent(Flyer, { kind });
    e.addComponent(Foe, { hp, speed: flight.speed, state: FoeState.Walk, timer: 0, side: 1, radius: flight.radius });
    rt.buzz?.set(flight.pos);
    return target;
  }

  /** Un disparo le da (dir: hacia dónde va el rayo, horizontal); si se queda sin vida, cae. */
  hit(e: Entity, dmg: number, perfect: boolean, pow: number, dir: Vector3): void {
    const rt = e.object3D?.userData.fly as FlyRt | undefined;
    if (!rt || e.getValue(Foe, 'state') === FoeState.Dead) return;
    const knock = (num('knockback') >= 0 ? num('knockback') : 100) / 100;
    const alive = rt.flight.hit(dmg, perfect, Math.max(1, Math.min(4, pow)), GAME.head, dir, knock);
    e.setValue(Foe, 'hp', Math.max(0, rt.flight.hp)); // (el campo no admite negativos)
    if (alive) return;
    this.kill(e, rt, dir, pow);
  }

  /** Un puñetazo: lo aparta dist metros (hacia donde iba el puño). */
  shove(e: Entity, dist: number, dir: Vector3): void {
    const rt = e.object3D?.userData.fly as FlyRt | undefined;
    if (rt && e.getValue(Foe, 'state') !== FoeState.Dead) rt.flight.shove(dist, GAME.head, dir);
  }

  // muerto: estalla en baba (RepArena: kill, fx.ichor) y cae como un cuerpo suelto, girando, con su animación de morir
  private kill(e: Entity, rt: FlyRt, dir: Vector3, pow: number): void {
    const c = this.p.copy(rt.flight.pos), big = !!rt.flight.K.boss;
    e.setValue(Foe, 'state', FoeState.Dead);
    e.setValue(Foe, 'timer', 0);
    rt.buzz?.stop();
    rt.buzz = null;
    HOOKS.sparks(c, big ? 30 : 18, ICHOR);
    SND.squish(c);
    if (big) SND.explosion(c, true);
    HOOKS.foeDown(rt.kind, !!rt.flight.K.boss, rt.target);
    if (rt.death) {
      rt.mixer.stopAllAction();
      rt.death.setLoop(LoopOnce, 1);
      rt.death.clampWhenFinished = true;
      rt.death.play();
    }
    const kb = 1.2 + 0.5 * pow;
    rt.launch = new Vector3(dir.x * kb, 1.2, dir.z * kb);
    e.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [rt.flight.radius, 0, 0], density: 40, friction: 0.6, restitution: 0.25 });
    e.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, linearDamping: 0.3, angularDamping: 0.8 });
  }

  /** Al acabar la ronda: los que quedan se desvanecen. */
  vanishAll(): void {
    for (const e of this.queries.flyers.entities) {
      const rt = e.object3D?.userData.fly as FlyRt | undefined;
      if (!rt || e.getValue(Foe, 'state') === FoeState.Dead) continue;
      e.setValue(Foe, 'state', FoeState.Dead);
      e.setValue(Foe, 'timer', 3.2);
      rt.buzz?.stop();
      rt.buzz = null;
    }
  }

  /** Quita a todos (al empezar otra ronda). */
  clear(): void {
    for (const e of [...this.queries.flyers.entities]) this.remove(e);
  }

  private remove(e: Entity): void {
    const rt = e.object3D?.userData.fly as FlyRt | undefined;
    if (rt) {
      rt.mixer.stopAllAction();
      rt.buzz?.stop();
      if (rt.fade) for (const m of rt.fade) m.dispose();
      rt.target.removed = true;
      const ts = this.enemies?.targets, i = ts ? ts.indexOf(rt.target) : -1;
      if (ts && i >= 0) ts.splice(i, 1);
    }
    e.dispose({ disposeResources: false }); // (comparten mallas y materiales con los demás de su modelo)
  }

  update(delta: number, time: number): void {
    if (GAME.paused) return; // (en pausa, quietos en el aire)
    const dt = Math.min(delta, 0.05);
    const env = this.env;
    env.active = GAME.phase === 'playing';
    env.play = env.active && !GAME.between;
    env.low = GAME.lowFly;
    env.sup = GAME.sup;
    // con ritmo marcado, los bandazos van en el pulso (RepArena: beatP, BEAT.hit)
    const P = num('bpm') > 0 ? 60 / num('bpm') : 0, bk = P ? Math.floor(time / P) : -1;
    env.beat = !P || (bk !== this.beatK && this.beatK >= 0);
    this.beatK = bk;
    for (const e of this.queries.flyers.entities) {
      const o = e.object3D, rt = o?.userData.fly as FlyRt | undefined;
      if (!o || !rt) continue;
      const sl = this.enemies?.slowOf(rt.target) ?? 1; // (escarcha y calma)
      rt.mixer.update(dt * sl);
      if (e.getValue(Foe, 'state') === FoeState.Dead) {
        this.dead(e, o, rt, dt);
        continue;
      }
      const f = rt.flight;
      f.step(dt * sl, env);
      if (f.evRoar) SND.roar(f.pos, VOICE_PITCH[rt.kind] ?? 1.4, rt.kind);
      if (f.evWhoosh) SND.whoosh(f.pos);
      if (f.evBite) HOOKS.playerHit(rt.str);
      // de cara a ti (a medias en altura), alabeado al virar y balanceándose un poco
      o.position.copy(f.pos);
      this.look.set(GAME.head.x, f.pos.y + (GAME.head.y - f.pos.y) * 0.3, GAME.head.z);
      o.lookAt(this.look);
      rt.body.rotation.z = f.bank;
      rt.body.position.y = Math.sin(f.t * 3) * 0.01;
      // al lanzarse, muerde; si no, vuela
      const bite = f.windT > 0.3;
      if (bite !== rt.biting) {
        rt.biting = bite;
        const a = bite ? rt.bite : rt.fly, prev = bite ? rt.fly : rt.bite;
        if (a) {
          a.reset();
          a.setLoop(bite ? LoopOnce : LoopRepeat, bite ? 1 : Infinity);
          a.clampWhenFinished = bite;
          if (bite) a.timeScale = 1.4;
          a.play();
          if (prev) a.crossFadeFrom(prev, 0.12, false);
        }
      }
      rt.buzz?.set(f.pos);
      // si sale volando muy lejos (un empujón), se quita
      if (Math.abs(f.pos.x) > 40 || Math.abs(f.pos.z) > 40) this.remove(e);
    }
  }

  // caído: el empujón al caer (cuando la física ya tiene su cuerpo), tumbado un rato y luego se desvanece
  private dead(e: Entity, o: Object3D, rt: FlyRt, dt: number): void {
    const timer = (e.getValue(Foe, 'timer') ?? 0) + dt;
    e.setValue(Foe, 'timer', timer);
    if (rt.launch && e.hasComponent(PhysicsBody) && e.getValue(PhysicsBody, '_engineBody')) {
      const m = this.manip;
      m.linearVelocity[0] = rt.launch.x;
      m.linearVelocity[1] = rt.launch.y;
      m.linearVelocity[2] = rt.launch.z;
      m.angularVelocity[0] = rt.launch.z * 4;
      m.angularVelocity[1] = 1;
      m.angularVelocity[2] = -rt.launch.x * 4;
      e.addComponent(PhysicsManipulation, m);
      rt.launch = null;
    }
    if (timer > 3.2 && !rt.fade) {
      rt.fade = [];
      o.traverse((c) => {
        const m = c as Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as Material).clone();
        mat.transparent = true;
        m.material = mat;
        rt.fade!.push(mat);
      });
    }
    if (rt.fade) {
      const k = Math.max(0, 1 - (timer - 3.2) / 0.8);
      for (const m of rt.fade) m.opacity = k;
      if (k <= 0 || o.position.y < -5) this.remove(e);
    }
  }
}
