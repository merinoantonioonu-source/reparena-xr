/**
 * Los enemigos de las compuertas (la tabla, en src/combat/foes.ts), con física de verdad (Havok): cada uno es una cápsula
 * dinámica que choca con el suelo, las cajas, las rocas, la bola de energía y los demás. Andan dirigiendo su velocidad (no
 * se teletransportan) hacia su puesto de ataque, en un arco delante de ti (RepArena: robotSlot): rodean la bola y los
 * obstáculos, se separan entre ellos y, si chocan, se empujan; si la primera fila está llena, esperan en la de atrás y,
 * con ritmo marcado, bailan al compás. En su puesto preparan el golpe y golpean (con ritmo, en el pulso): te quitan su
 * fuerza en vidas (la de la tabla del desarrollador); luego retroceden un poco. Un disparo los hace retroceder; el último
 * los lanza por el aire dando vueltas y caen al suelo como un cuerpo suelto. Encima, sus cuentas de vida (src/combat/life.ts).
 */
import {
  AnimationAction,
  AnimationClip,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  AnimationMixer,
  AssetManager,
  createSystem,
  Entity,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  Mesh,
  Object3D,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from '@iwsdk/core';
import { Foe, FoeState, Obstacle } from './components.js';
import { bossDef, devFoe, FOE_DEF, foeSlot, type FoeDef, type FoeClips, type SlotFoe } from './foes.js';
import { LifeBeads } from './life.js';
import { Rocks } from './rocks.js';
import { retarget } from './retarget.js';
import { throwK } from './foes.js';
import { dv, rankIdx } from '../core/settings.js';
import { num, str } from '../core/values.js';
import { Gait, gaitPlan, paceOf, travelOf } from './gait.js';
import type { LockTarget } from './lockline.js';
import { SND } from '../audio/sound.js';
import { VOICE_PITCH } from '../audio/catalog.js';
import { GAME, HOOKS } from '../core/state.js';
import type { PunchTarget } from '../input/punch.js';
import type { FlyerSystem } from './flyers.js';

// lo que pesa cada uno: más cuanto más ancho (el gordo, 1,6 veces el verde), y los pesados, más aún
const massOf = (d: FoeDef): number => Math.max(0.8, (d.r / 0.32) ** 2) * (d.heavy ? 1.3 : 1);

// su voz, con su tono (RepArena: Beast.roar; al morir, más grave)
const roar = (at: Vector3, who: string, k = 1): void => SND.roar(at, (VOICE_PITCH[who] ?? 1.4) * k, who);

/** Lo que ven de cada zombi la sacudida, la mirada, el puñetazo y la diana: si sigue en pie, su radio y su centro. */
export class FoeTarget implements LockTarget, PunchTarget {
  removed = false;
  constructor(
    readonly entity: Entity,
    readonly root: Object3D,
    readonly radius: number,
    private lift: number,
    /** Su vida al salir y a qué altura sobre su centro van sus cuentas de vida. */
    readonly maxHp: number,
    readonly top: number,
    /** Vuela (el puñetazo lo alcanza algo más lejos). */
    readonly flyer = false,
  ) {}
  get alive(): boolean {
    return !this.removed && this.entity.getValue(Foe, 'state') !== FoeState.Dead;
  }
  /** El centro del cuerpo (a la altura del pecho). */
  center(out: Vector3): Vector3 {
    return out.set(this.root.position.x, this.root.position.y + this.lift, this.root.position.z);
  }
}

/** Lo que no cabe en el componente: el modelo, sus animaciones y los relojes de cada zombi. */
interface FoeRuntime {
  kind: string;
  def: FoeDef;
  mass: number;
  /** Su vida al salir y lo que quita cada golpe (en vidas). */
  maxHp: number;
  str: number;
  model: Object3D;
  mixer: AnimationMixer;
  actions: Map<keyof FoeClips, AnimationAction>;
  current: string;
  yaw: number;
  /** Ya te ha rugido al llegar (RepArena: una vez, al cargar contra ti). */
  charged: boolean;
  attackT: number;
  /** El lanzador: lo que le falta para poder tirar la siguiente piedra (s). */
  throwCD: number;
  struck: boolean;
  /** Un disparo le acaba de dar: este fotograma manda su empujón, no la marcha. */
  kick: boolean;
  /** Cuánto le dura el golpe que encaja (s). */
  stun: number;
  fade: Material[] | null;
  target: FoeTarget;
  /** Su puesto de ataque (y cada cuánto busca uno mejor), y desde dónde estabas al buscarlo. */
  sf: SlotFoe;
  slotT: number;
  slotAt: Vector3;
  /** Su marcha (src/combat/gait.ts): su forma de moverse, su ritmo y la rapidez de sus gestos; dónde salió y si ya ha
   * salido de la compuerta; si le acaban de dar (para esquivar). */
  gait: Gait;
  pace: number;
  from: Vector3;
  out: boolean;
  hitNow: boolean;
}

const STAGGER = 0.8; // segundos que se queda encajando el golpe
// el golpe (RepArena: windup 0,75 s, strike 0,18 s y lo que recoge, 0,5 s; luego retrocede de espaldas)
const WINDUP = 0.75, STRIKE = 0.18, RECOVER = 0.5, BACK_V = 0.9;

const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class EnemySystem extends createSystem(
  {
    foes: { required: [Foe, PhysicsBody] },
    obstacles: { required: [Obstacle] },
  },
  {},
) {
  private physics!: PhysicsSystem;
  private playerBody: Entity | null = null;
  private ballBody: Entity | null = null;
  private ballPose = { position: new Vector3(0, -10, 0), quaternion: new Quaternion() };
  private ballParked = true;
  private v = new Vector3();
  private w = new Vector3();
  private des = new Vector3();
  private tmp = new Vector3();
  private up = new Vector3();
  private fwd = new Vector3();
  private q = new Quaternion();
  private pos = new Vector3();
  private manip = { force: [0, 0, 0] as [number, number, number], linearVelocity: [0, 0, 0] as [number, number, number], angularVelocity: [0, 0, 0] as [number, number, number] };
  private playerPose = { position: new Vector3(), quaternion: new Quaternion() };
  /** Los zombis, como blancos (sacudida, mirada, puñetazo y diana). */
  readonly targets: FoeTarget[] = [];
  /** Las cuentas de vida, encima de cada uno. */
  readonly life = new LifeBeads();
  /** Las piedras del lanzador. */
  readonly rocks = new Rocks();
  // las animaciones de la biblioteca ya pasadas al esqueleto de cada modelo, y un material por cada color
  private ualClips = new Map<string, Map<string, AnimationClip>>();
  private texMats = new Map<string, MeshStandardMaterial>();
  private hand = new Vector3();
  private slots: SlotFoe[] = [];
  private beatK = -1;
  private beatHit = false;
  /** Lo que se frena cada uno (las mejoras: escarcha y calma); lo pone la partida. */
  slowOf: (t: FoeTarget) => number = () => 1;
  /** Los voladores (src/combat/flyers.ts): se enganchan solos al arrancar. */
  flyers: FlyerSystem | null = null;

  init(): void {
    this.physics = this.world.getSystem(PhysicsSystem)!;
    // el suelo: una caja estática de 60 × 60 m (su cara de arriba, a ras del suelo que se ve)
    const floor = this.world.createTransformEntity(new Group());
    floor.object3D!.position.set(0, -0.25, 0);
    floor.addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: [60, 0.5, 60], friction: 0.7, restitution: 0.1 });
    floor.addComponent(PhysicsBody, { state: PhysicsState.Static });
    // tu cuerpo: una cápsula que sigue a la cabeza (los zombis y los cuerpos que caen no te atraviesan)
    const me = this.world.createTransformEntity(new Group());
    me.object3D!.position.set(0, 0.85, 0);
    me.addComponent(PhysicsShape, { shape: PhysicsShapeType.Capsules, dimensions: [0.22, 1.7, 0], friction: 0.2 });
    me.addComponent(PhysicsBody, { state: PhysicsState.Kinematic });
    this.playerBody = me;
    // la bola de energía: una esfera que se mueve con ella (si no se ve, se aparca bajo el suelo)
    const ball = this.world.createTransformEntity(new Group());
    ball.object3D!.position.set(0, -10, 0);
    ball.addComponent(PhysicsShape, { shape: PhysicsShapeType.Sphere, dimensions: [GAME.ballR, 0, 0], friction: 0.3, restitution: 0.3 });
    ball.addComponent(PhysicsBody, { state: PhysicsState.Kinematic });
    this.ballBody = ball;
    this.world.createTransformEntity(this.life.points);
    this.world.createTransformEntity(this.rocks.group);
  }

  /** Cuántos quedan en pie (también los que vuelan). */
  aliveCount(): number {
    let n = this.flyers?.aliveCount() ?? 0;
    for (const e of this.queries.foes.entities) if (e.getValue(Foe, 'state') !== FoeState.Dead) n++;
    return n;
  }

  /** ¿Está ya cargado su modelo? (los que no son los de siempre, IWSDK los carga después de arrancar) */
  ready(kind: string): boolean {
    const d = FOE_DEF[kind];
    return !!d && !!AssetManager.getGLTF(d.asset) && (!d.ual || !!AssetManager.getGLTF('foe-anims'));
  }

  // las animaciones de la biblioteca para un modelo (las mismas para todos los de ese modelo: se pasan una vez)
  private ualFor(asset: string, model: Object3D): Map<string, AnimationClip> | null {
    let m = this.ualClips.get(asset);
    if (m) return m;
    const U = AssetManager.getGLTF('foe-anims'), up = U?.scene.getObjectByName('pelvis')?.position.z, mp = model.getObjectByName('pelvis')?.position.z;
    if (!U || !up || !mp) return null;
    const has = new Set<string>();
    model.traverse((o) => has.add(o.name));
    m = new Map();
    for (const c of U.animations) m.set(c.name, retarget(c, up, mp, has));
    this.ualClips.set(asset, m);
    return m;
  }

  // uno de sus colores (el material de cada color, uno solo para todos los que lo llevan)
  private texMat(id: string): MeshStandardMaterial | null {
    let m = this.texMats.get(id);
    if (m) return m;
    const t = AssetManager.getTexture(id);
    if (!t) return null;
    t.flipY = false;
    t.colorSpace = SRGBColorSpace;
    m = new MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 });
    this.texMats.set(id, m);
    return m;
  }

  /** Saca uno de la tabla (kind: zgreen, raptor, captain…) en (x, z), mirando hacia ti, con hp de vida; boss: su jefe. */
  spawn(kind: string, x: number, z: number, hp: number, boss = false): FoeTarget | null {
    const d = FOE_DEF[kind] && boss ? bossDef(kind) : FOE_DEF[kind];
    const gltf = d && AssetManager.getGLTF(d.asset);
    if (!d || !gltf) return null;
    const root = new Group();
    root.name = `enemigo-${kind}`;
    const model = gltf.scene;
    model.scale.setScalar(d.k);
    model.position.y = -d.h / 2; // los pies, en la base de la cápsula
    const palette = d.palette ? AssetManager.getTexture(d.palette) : null;
    if (palette) {
      // (el zombi de 2017: sus colores, de una paleta pequeña, sin suavizar)
      palette.flipY = false;
      palette.colorSpace = SRGBColorSpace;
      palette.magFilter = palette.minFilter = NearestFilter;
      palette.generateMipmaps = false;
    }
    const tint = d.tex ? this.texMat(d.tex[Math.floor(Math.random() * d.tex.length)]) : null;
    model.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        if (tint) m.material = tint;
        m.castShadow = true;
        m.receiveShadow = false;
        // (animado, se sale de su caja de reposo: sin esto, desaparecía a ratos por el borde de la vista)
        if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
        if (palette) {
          const mat = m.material as MeshStandardMaterial;
          if (mat.map !== palette) {
            mat.map = palette;
            mat.color?.set(0xffffff);
            mat.needsUpdate = true;
          }
        }
      }
    });
    root.add(model);
    const yaw = Math.atan2(GAME.head.x - x, GAME.head.z - z);
    root.position.set(x, d.h / 2 + 0.02, z);
    root.quaternion.setFromAxisAngle(this.up.set(0, 1, 0), yaw);
    const mixer = new AnimationMixer(model);
    const actions = new Map<keyof FoeClips, AnimationAction>();
    const ual = d.ual ? this.ualFor(d.asset, model) : null;
    for (const [k, name] of Object.entries(d.clips) as [keyof FoeClips, string][]) {
      const clip = name && (ual ? ual.get(name) : gltf.animations.find((c) => c.name === name));
      if (clip) actions.set(k, mixer.clipAction(clip));
    }
    const e = this.world.createTransformEntity(root);
    const target = new FoeTarget(e, root, d.r, d.h * (d.ctr - 0.5), hp, d.h / 2 + 0.22);
    const sf: SlotFoe = { pos: new Vector3(x, 0, z), radius: d.r, stop: d.stop, slot: new Vector3(), slotOk: false, row: 0 };
    foeSlot(sf, this.slots, GAME.head);
    this.slots.push(sf);
    const strength = devFoe('g:' + kind).str;
    // su marcha (RepArena: el constructor de Robot): la forma de moverse de su clase (una de las marcadas), la rapidez de
    // sus gestos y su ritmo, para llegar a su puesto cuando pide «Tiempo llegada»
    const pace = paceOf(dv('pace_' + d.grp, GAME.ramp), boss), travel = travelOf(num('spd_' + d.grp));
    const plan = gaitPlan(Math.hypot(sf.slot.x - x, sf.slot.z - z), dv('walkTime', GAME.ramp), d.speedF, d.heavy, travel);
    const gait = new Gait(Gait.pick(str('move_' + d.grp)), plan, pace);
    if (import.meta.env.DEV) console.info(`rxdbg marcha ${kind}: ${gait.style}, ${plan.vWalk.toFixed(2)} m/s andando, ${plan.vMove.toFixed(2)} desplazándose, gestos ×${pace.toFixed(2)}`); // (para probar en el emulador)
    const rt: FoeRuntime = { kind, def: d, mass: massOf(d), maxHp: hp, str: strength, model, mixer, actions, current: '', yaw, charged: false, attackT: 0, throwCD: 0, struck: false, kick: false, stun: STAGGER, fade: null, target, sf, slotT: 0.6, slotAt: GAME.head.clone(), gait, pace, from: new Vector3(x, 0, z), out: false, hitNow: false };
    root.userData.rt = rt;
    this.targets.push(target);
    e.addComponent(Foe, { hp, speed: plan.vWalk, state: FoeState.Walk, timer: 0, side: Math.random() < 0.5 ? -1 : 1, radius: d.r });
    e.addComponent(PhysicsShape, { shape: PhysicsShapeType.Capsules, dimensions: [d.r, d.h, 0], density: rt.mass * 60, friction: 0.15, restitution: 0.05 });
    e.addComponent(PhysicsBody, { state: PhysicsState.Dynamic, linearDamping: 0.2, angularDamping: 6 });
    this.anim(rt, 'walk', 0);
    if (d.heavy || hp >= 3 || Math.random() < 0.5) roar(root.position, d.voice, boss ? 0.65 : 1);
    return target; // (al salir: la mitad de las veces; los fuertes, siempre)
  }

  /** Al acabar la ronda: los que quedan en pie se desvanecen (no tapan el resumen). */
  vanishAll(): void {
    this.flyers?.vanishAll();
    for (const e of this.queries.foes.entities) {
      if (e.getValue(Foe, 'state') === FoeState.Dead) continue;
      e.setValue(Foe, 'state', FoeState.Dead);
      e.setValue(Foe, 'timer', 3.2); // (se empiezan a desvanecer ya)
    }
  }

  /** Quita a todos (al empezar otra ronda). */
  clear(): void {
    this.rocks.clear();
    this.flyers?.clear();
    for (const e of [...this.queries.foes.entities]) this.remove(e);
  }

  private remove(e: Entity): void {
    const rt = e.object3D?.userData.rt as FoeRuntime | undefined;
    if (rt) {
      rt.mixer.stopAllAction();
      if (rt.fade) for (const m of rt.fade) m.dispose();
      rt.target.removed = true;
      const i = this.targets.indexOf(rt.target);
      if (i >= 0) this.targets.splice(i, 1);
      this.freeSlot(rt);
    }
    // (los modelos comparten mallas, materiales y texturas: no se liberan al quitar uno)
    e.dispose({ disposeResources: false });
  }

  // deja su puesto (al morir o al quitarlo): los de atrás avanzan
  private freeSlot(rt: FoeRuntime): void {
    const j = this.slots.indexOf(rt.sf);
    if (j >= 0) this.slots.splice(j, 1);
    rt.sf.slotOk = false;
  }

  // cambia de animación con un fundido (por su nombre en la tabla: idle, walk, run, attack, hit, dance)
  private anim(rt: FoeRuntime, name: keyof FoeClips, fade = 0.25, once = false, timeScale = 1): void {
    const a = rt.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (rt.current === name && !once) return;
    const prev = rt.current ? rt.actions.get(rt.current as keyof FoeClips) : undefined;
    a.reset();
    a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (prev && prev !== a && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== a) prev.stop();
    a.play();
    rt.current = name;
  }

  /**
   * Un disparo le da: le quita dmg de vida (como en RepArena: 1 el normal, 2 el perfecto, y más con la carga); si sigue en
   * pie, retrocede empujado por la física y encaja el golpe; si no, sale despedido dando vueltas. power: la carga (×1 a ×4:
   * cuanto más, más lejos); dir: hacia dónde va el rayo (horizontal).
   */
  hit(e: Entity, dmg: number, power: number, dir: Vector3, perfect = false): void {
    if (e.object3D?.userData.fly) return this.flyers?.hit(e, dmg, perfect, power, dir);
    const rt = e.object3D?.userData.rt as FoeRuntime | undefined;
    if (!rt || e.getValue(Foe, 'state') === FoeState.Dead) return;
    power = Math.max(1, Math.min(4, power));
    const hp = Math.max(0, (e.getValue(Foe, 'hp') ?? 1) - dmg); // (el campo no admite negativos: lanzaría un error)
    e.setValue(Foe, 'hp', hp);
    const mass = rt.mass;
    if (hp > 0) {
      rt.hitNow = true; // (a veces, esquiva: Gait.dodgeStep)
      e.setValue(Foe, 'state', FoeState.Stagger);
      e.setValue(Foe, 'timer', 0);
      rt.stun = STAGGER;
      const kb = (1.6 + 0.9 * power) / mass;
      this.setVel(e, dir.x * kb, 0.6 + 0.3 * power, dir.z * kb, null);
      rt.kick = true;
      this.anim(rt, 'hit', 0.08, true, 1.3);
      if (Math.random() < 0.3) roar(e.object3D!.position, rt.def.voice);
      return;
    }
    this.freeSlot(rt);
    // muerto: cuerpo suelto (sin enderezarse), lanzado hacia atrás y hacia arriba, girando
    e.setValue(Foe, 'state', FoeState.Dead);
    e.setValue(Foe, 'timer', 0);
    e.setValue(PhysicsBody, 'angularDamping', 0.6);
    e.setValue(PhysicsBody, 'linearDamping', 1.0);
    const kb = (3.2 + 1.4 * power) / Math.sqrt(mass);
    this.tmp.set(dir.z, 0, -dir.x); // (el eje del vuelco: horizontal, de lado al empujón)
    const spin = 3.5 + 1.5 * power;
    this.setVel(e, dir.x * kb, 2.4 + 0.6 * power, dir.z * kb, this.tmp.multiplyScalar(spin));
    rt.kick = true;
    // la postura del golpe, congelada: cae como un cuerpo rígido
    this.anim(rt, 'hit', 0.05, true, 1);
    const a = rt.actions.get('hit');
    if (a) {
      a.time = a.getClip().duration * 0.35;
      a.paused = true;
    }
    roar(e.object3D!.position, rt.def.voice, 0.8);
    SND.squish(e.object3D!.position);
    HOOKS.foeDown(rt.kind, !!rt.def.boss, rt.target);
  }

  /**
   * Un puñetazo: lo aparta unos dist metros (lejos de ti y hacia donde iba el puño: un gancho lo echa de lado) y lo deja
   * aturdido stun segundos; si estaba atacando, le corta el golpe. No le quita vida.
   */
  shove(e: Entity, dist: number, stun: number, dir: Vector3): void {
    if (e.object3D?.userData.fly) return this.flyers?.shove(e, dist, dir);
    const rt = e.object3D?.userData.rt as FoeRuntime | undefined, o = e.object3D;
    if (!rt || !o || e.getValue(Foe, 'state') === FoeState.Dead || !(dist > 0)) return;
    const b = this.tmp.set(o.position.x - GAME.head.x, 0, o.position.z - GAME.head.z);
    b.normalize();
    const dl = Math.hypot(dir.x, dir.z);
    if (dl > 0.3) b.add(this.v.set(dir.x / dl, 0, dir.z / dl).multiplyScalar(0.8)).normalize();
    e.setValue(Foe, 'state', FoeState.Stagger);
    e.setValue(Foe, 'timer', 0);
    rt.stun = stun;
    const kb = (3 * dist) / Math.sqrt(rt.mass);
    this.setVel(e, b.x * kb, 0.4, b.z * kb, null);
    rt.kick = true;
    this.anim(rt, 'hit', 0.08, true, 1.4);
  }

  // pide a la física una velocidad (y un giro) para el siguiente paso; vx NaN: la velocidad no se toca (empujado, la
  // física lo frena sola)
  private setVel(e: Entity, vx: number, vy: number, vz: number, ang: Vector3 | null): void {
    const m = this.manip;
    m.force[0] = m.force[1] = m.force[2] = 0;
    if (Number.isNaN(vx)) m.linearVelocity[0] = m.linearVelocity[1] = m.linearVelocity[2] = 0;
    else {
      m.linearVelocity[0] = vx;
      m.linearVelocity[1] = vy === 0 && vx === 0 && vz === 0 ? 1e-5 : vy; // (todo a cero = «no cambies»)
      m.linearVelocity[2] = vz;
    }
    if (ang) {
      m.angularVelocity[0] = ang.x;
      m.angularVelocity[1] = ang.y;
      m.angularVelocity[2] = ang.z;
    } else m.angularVelocity[0] = m.angularVelocity[1] = m.angularVelocity[2] = 0;
    if (e.hasComponent(PhysicsManipulation)) e.removeComponent(PhysicsManipulation);
    e.addComponent(PhysicsManipulation, m);
  }

  // Dirección deseada (horizontal, en des) para ir hacia el jugador rodeando la bola, las cajas, las rocas y a los
  // demás zombis
  private steer(e: Entity, p: Vector3, r: number, side: number, to: Vector3): void {
    const tx = to.x - p.x, tz = to.z - p.z;
    const dist = Math.hypot(tx, tz) || 1;
    const dx = tx / dist, dz = tz / dist;
    this.des.set(dx, 0, dz);
    const look = Math.min(3, dist);
    // un obstáculo redondo (cx, cz, radio R): si está delante y en el camino, me aparto hacia un lado (el que ya
    // llevo, o el que me aleja del centro); si estoy encima, me empuja hacia fuera
    const avoid = (cx: number, cz: number, R: number, weight: number): void => {
      const ox = cx - p.x, oz = cz - p.z;
      const ahead = ox * dx + oz * dz;
      const lat = ox * -dz + oz * dx; // (positivo: el centro queda a la izquierda)
      const clear = R + r + 0.18;
      const d = Math.hypot(ox, oz);
      if (d < clear) {
        const k = (clear - d) / clear;
        this.des.x -= (ox / (d || 1)) * k * 3 * weight;
        this.des.z -= (oz / (d || 1)) * k * 3 * weight;
      }
      if (ahead <= 0 || ahead > look + R) return;
      if (Math.abs(lat) > clear) return;
      const s = Math.abs(lat) > 0.05 ? -Math.sign(lat) : side; // (por el lado contrario al centro)
      const k = (1 - Math.abs(lat) / clear) * (1 - Math.max(0, ahead - R) / (look + 0.01)) * 2.2 * weight;
      this.des.x += -dz * s * k;
      this.des.z += dx * s * k;
    };
    if (GAME.ballOn) avoid(GAME.ballPos.x, GAME.ballPos.z, GAME.ballR, 1.4);
    for (const o of this.queries.obstacles.entities) {
      const ob = o.object3D;
      if (!ob) continue;
      avoid(ob.position.x, ob.position.z, o.getValue(Obstacle, 'radius') ?? 0.6, 1);
    }
    // separarse de los demás (sin chocar entre ellos)
    for (const other of this.queries.foes.entities) {
      if (other === e || !other.object3D) continue;
      const op = other.object3D.position;
      const ox = p.x - op.x, oz = p.z - op.z, d2 = ox * ox + oz * oz;
      const rr = r + (other.getValue(Foe, 'radius') ?? 0.3) + 0.35;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), k = ((rr - d) / rr) * 1.6;
      this.des.x += (ox / d) * k;
      this.des.z += (oz / d) * k;
    }
    const l = Math.hypot(this.des.x, this.des.z) || 1;
    this.des.x /= l;
    this.des.z /= l;
  }

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    // tu cápsula, donde estás (solo si te has movido algo)
    if (this.playerBody?.object3D) {
      const pp = this.playerPose.position;
      if (Math.abs(pp.x - GAME.head.x) + Math.abs(pp.z - GAME.head.z) > 0.01 || pp.y === 0) {
        pp.set(GAME.head.x, 0.85, GAME.head.z);
        this.physics.setBodyTransform(this.playerBody, this.playerPose);
      }
    }
    // la esfera de la bola, con la bola (o aparcada bajo el suelo si no se ve)
    if (this.ballBody?.object3D) {
      const bp = this.ballPose.position;
      if (GAME.ballOn) {
        if (this.ballParked || bp.distanceToSquared(GAME.ballPos) > 0.0001) {
          bp.copy(GAME.ballPos);
          this.physics.setBodyTransform(this.ballBody, this.ballPose);
          this.ballParked = false;
        }
      } else if (!this.ballParked) {
        bp.set(GAME.ballPos.x, -10, GAME.ballPos.z);
        this.physics.setBodyTransform(this.ballBody, this.ballPose);
        this.ballParked = true;
      }
    }
    const playing = GAME.phase === 'playing';
    // el pulso (con «Ritmo» marcado: Opciones → Sonido): golpean en el pulso y, esperando, bailan a su compás (RepArena:
    // beatP, BEAT.hit; el de la canción de Spotify llega con el PR 22)
    const P = num('bpm') > 0 ? 60 / num('bpm') : 0, bk = P ? Math.floor(time / P) : -1;
    this.beatHit = P > 0 && bk !== this.beatK && this.beatK >= 0;
    this.beatK = bk;
    for (const e of this.queries.foes.entities) {
      const o = e.object3D;
      const rt = o?.userData.rt as FoeRuntime | undefined;
      if (!o || !rt) continue;
      const sl = this.slowOf(rt.target); // (escarcha y calma: sus gestos, su paso y sus animaciones)
      rt.mixer.update(dt * sl);
      const state: string = e.getValue(Foe, 'state') ?? FoeState.Walk;
      // sus gestos (amenazar, preparar y dar el golpe, retroceder, encajar) van a su ritmo (RepArena: pace, gd)
      const timer = (e.getValue(Foe, 'timer') ?? 0) + (state === FoeState.Walk || state === FoeState.Dead ? dt : dt * rt.pace) * (state === FoeState.Dead ? 1 : sl);
      e.setValue(Foe, 'timer', timer);
      if (state === FoeState.Dead) {
        // tumbado un rato; luego se desvanece y desaparece
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
          if (k <= 0) this.remove(e);
        }
        continue;
      }
      if (!e.getValue(PhysicsBody, '_engineBody')) continue; // (la física aún no lo ha creado)
      const p = this.pos.copy(o.position);
      const r = e.getValue(Foe, 'radius') ?? 0.3;
      const vel = e.getVectorView(PhysicsBody, '_linearVelocity');
      // si cae fuera del mundo o lo lanzan lejos, se quita
      if (p.y < -5 || Math.abs(p.x) > 40 || Math.abs(p.z) > 40) {
        this.remove(e);
        continue;
      }
      const toX = GAME.head.x - p.x, toZ = GAME.head.z - p.z, dist = Math.hypot(toX, toZ), faceP = Math.atan2(toX, toZ);
      let wantYaw = faceP;
      let vx = NaN, vz = NaN; // (NaN: la velocidad la lleva la física)
      let newState = state;
      const sf = rt.sf, d = rt.def;
      sf.pos.set(p.x, 0, p.z);
      if (rt.throwCD > 0) rt.throwCD -= dt;
      if (!playing) {
        this.anim(rt, 'idle'); // fuera de la partida: quietos (la física los frena)
      } else if (state === FoeState.Stagger) {
        if (timer > rt.stun) newState = FoeState.Walk; // (empujado o retrocediendo: no se dirige; la física lo frena)
      } else if (state === FoeState.Taunt) {
        // la amenaza: se planta, de cara a ti, y te ruge (1,1 s a su ritmo; RepArena: 'taunt')
        const keep = 1 - Math.min(1, dt * 10);
        vx = vel[0] * keep;
        vz = vel[2] * keep;
        this.anim(rt, rt.actions.has('taunt') ? 'taunt' : 'dance', 0.2);
        if (timer > 1.1) newState = FoeState.Walk;
      } else if (state === FoeState.Walk) {
        const g = rt.gait;
        // ya fuera de la compuerta (RepArena: out): dentro del túnel va recto a la velocidad de desplazarse
        if (!rt.out && Math.hypot(p.x - rt.from.x, p.z - rt.from.z) > 2.4) rt.out = true;
        // cada poco busca un puesto mejor: si espera detrás (al morir otro, avanza), si te has movido o al acabar una esquiva
        rt.slotT -= dt;
        if (!sf.slotOk || (rt.slotT <= 0 && (sf.row > 0 || Math.hypot(GAME.head.x - rt.slotAt.x, GAME.head.z - rt.slotAt.z) > 0.5))) {
          sf.slotOk = false;
          foeSlot(sf, this.slots, GAME.head);
          rt.slotAt.copy(GAME.head);
          rt.slotT = 0.6;
        }
        const sd = Math.hypot(sf.slot.x - p.x, sf.slot.z - p.z);
        if (sd < 0.3 && !(g.dodge > 0)) {
          // en su puesto: quieto, de cara a ti; en la primera fila, golpea (con ritmo, en el pulso); detrás, espera su turno
          // (con ritmo, bailando a su compás: una vuelta de su baile cada dos pulsos)
          const keep = 1 - Math.min(1, dt * 10);
          vx = vel[0] * keep;
          vz = vel[2] * keep;
          if (sf.row === 0 && !GAME.between && rt.throwCD <= 0 && (!P || this.beatHit)) {
            newState = FoeState.Attack;
            rt.struck = false;
            this.anim(rt, 'attack', 0.25, true, 0);
            roar(p, d.voice, d.heavy ? 0.8 : 1);
          } else if (P && rt.actions.get('dance')) this.anim(rt, 'dance', 0.3, false, rt.actions.get('dance')!.getClip().duration / (2 * P));
          else this.anim(rt, 'idle', 0.3);
        } else if (playing && !GAME.between && g.tauntNow(dt, dv('walkTime', GAME.ramp), dist)) {
          // la amenaza a media distancia (una vez por avance, si hay tiempo)
          newState = FoeState.Taunt;
          roar(p, d.voice, d.heavy ? 0.8 : 1.1);
          if (import.meta.env.DEV) console.info(`rxdbg amenaza ${rt.kind} a ${dist.toFixed(1)} m`); // (para probar en el emulador)
          vx = vel[0];
          vz = vel[2];
        } else {
          this.steer(e, p, r, e.getValue(Foe, 'side') ?? 1, sf.slot);
          // los últimos metros, corriendo y rugiendo (RepArena: la carga)
          if (!rt.charged && sd < g.plan.chargeD + 0.3) {
            rt.charged = true;
            roar(p, d.voice, d.heavy ? 0.7 : 1.2);
          }
          // su forma de moverse: a su ritmo, con zigzag o con paradas en guardia (RepArena: wantV y lat)
          g.march(dt, sd, rt.out, rt.charged);
          let v = g.wantV;
          if (v > 0) v = Math.max(v, 0.25); // (nunca a paso de caracol: o anda, o se para)
          v *= sl;
          const tl = sd || 1, tx = (sf.slot.x - p.x) / tl, tz = (sf.slot.z - p.z) / tl;
          let ax = this.des.x * v + tz * g.lat, az = this.des.z * v - tx * g.lat;
          // la esquiva: se aparta de golpe de lado (respecto a ti), con voltereta si la tiene
          const was = g.dodge > 0, side = g.dodgeStep(dt, rt.out && !rt.charged && playing && !GAME.between, rt.hitNow, !!rt.actions.get('roll'));
          rt.hitNow = false;
          if (import.meta.env.DEV && !was && g.dodge > 0) console.info(`rxdbg esquiva ${rt.kind}${g.roll ? ' con voltereta' : ''}`); // (para probar en el emulador)
          if (side) {
            const sv = side / Math.max(dt, 1e-3);
            ax += Math.cos(faceP) * sv;
            az -= Math.sin(faceP) * sv;
          }
          if (g.dodge > 0 && g.roll && rt.current !== 'roll') this.anim(rt, 'roll', 0.08, true, rt.actions.get('roll')!.getClip().duration / g.dodgeDur);
          const blend = Math.min(1, dt * (g.dodge > 0 ? 20 : 3 + (3 * g.plan.vMove) / g.plan.vWalk)); // (con inercia: arranca y frena como un cuerpo pesado)
          vx = vel[0] + (ax - vel[0]) * blend;
          vz = vel[2] + (az - vel[2]) * blend;
          const sp = Math.hypot(vx, vz);
          if (g.dodge > 0) wantYaw = g.roll ? faceP + (side > 0 ? -1 : 1) * Math.PI / 2 : faceP;
          else if (sp > 0.15) wantYaw = Math.atan2(vx, vz);
          if (g.dodge > 0 && g.roll) {
            /* (la voltereta sigue su animación) */
          } else if (sp < 0.12) this.anim(rt, 'idle', 0.3); // (parado en guardia, a rachas)
          else if (sp > 1.35 && rt.actions.get('run')) this.anim(rt, 'run', 0.3, false, Math.min(d.maxTs, Math.max(d.minTs, sp / d.run)));
          else this.anim(rt, 'walk', 0.3, false, Math.min(d.maxTs, Math.max(d.minTs, sp / d.walk)));
        }
      } else if (state === FoeState.Attack) {
        // prepara el golpe (la animación, de su principio a cuando empieza el golpe), lo da (de ahí a cuando llega: si sigues
        // a su alcance, te quita su fuerza en vidas) y lo recoge; luego retrocede de espaldas, sin dejar de mirarte
        const keep = 1 - Math.min(1, dt * 10);
        vx = vel[0] * keep;
        vz = vel[2] * keep;
        const a = rt.actions.get('attack'), [t0, t1] = d.atk, sm = (x: number): number => x * x * (3 - 2 * x);
        if (a) a.time = timer < WINDUP ? t0 * sm(timer / WINDUP) : timer < WINDUP + STRIKE ? t0 + (t1 - t0) * ((timer - WINDUP) / STRIKE) : t1 + 0.35 * Math.min(1, (timer - WINDUP - STRIKE) / RECOVER);
        if (!rt.struck && timer >= WINDUP + STRIKE) {
          rt.struck = true;
          if (d.thrower) {
            // el lanzador no se acerca: suelta la piedra desde la mano y espera a la siguiente (una cada 3-5 s; más a
            // menudo y más deprisa cuanto más difícil: throwK)
            const k = throwK(rankIdx(), Math.min(0.6, (num('ramp') / 100) * Math.max(0, GAME.wave - 1)));
            const hb = o.getObjectByName('hand_r');
            if (hb) hb.getWorldPosition(this.hand);
            else this.hand.copy(p).setY(p.y + d.h * 0.3);
            this.rocks.throw(this.hand, k);
            rt.throwCD = (3.5 + Math.random() * 2) / Math.sqrt(Math.max(0.7, rt.pace)) / k; // (RepArena: más a menudo con más rapidez de gestos)
          } else {
            if (dist < sf.stop + r + 0.6) HOOKS.playerHit(rt.str);
            SND.step(p, true);
          }
        }
        if (Math.hypot(sf.slot.x - p.x, sf.slot.z - p.z) > 0.45 && !rt.struck) newState = FoeState.Walk; // (lo apartaron: vuelve a acercarse)
        else if (d.thrower && timer > WINDUP + STRIKE + 0.35) newState = FoeState.Walk; // (tras tirar, se queda en su sitio)
        else if (timer > WINDUP + STRIKE + RECOVER) {
          // retrocede de espaldas (RepArena: knock), a paso tranquilo
          newState = FoeState.Stagger;
          rt.stun = 1.0;
          const bv = BACK_V * Math.sqrt(rt.pace); // (RepArena: backV · √pace)
          this.setVel(e, (-toX / (dist || 1)) * bv, vel[1], (-toZ / (dist || 1)) * bv, null);
          rt.kick = true;
          rt.charged = false;
          this.anim(rt, 'walk', 0.25, false, -Math.max(d.minTs, bv / d.walk));
        }
      }
      if (newState !== state) {
        e.setValue(Foe, 'state', newState);
        e.setValue(Foe, 'timer', 0);
      }
      // el empujón de un disparo manda en este paso (si no, la marcha lo borraría)
      if (rt.kick) {
        rt.kick = false;
        continue;
      }
      // de pie y girado hacia donde va: la física manda en la posición; esto solo corrige la inclinación y el rumbo
      this.q.copy(o.quaternion);
      this.up.set(0, 1, 0).applyQuaternion(this.q);
      this.w.crossVectors(this.up, this.tmp.set(0, 1, 0)).multiplyScalar(12); // (endereza)
      this.fwd.set(0, 0, 1).applyQuaternion(this.q);
      const yawErr = wrap(wantYaw - Math.atan2(this.fwd.x, this.fwd.z));
      this.w.y += Math.max(-5, Math.min(5, yawErr * 7)) + 1e-5; // (nunca todo a cero: sería «no cambies»)
      this.setVel(e, vx, vel[1], vz, this.w);
    }
    this.rocks.update(dt);
    // las cuentas de vida, encima de cada uno
    this.life.begin();
    for (const t of this.targets) if (t.alive) this.life.add(t, t.root.position.x, t.root.position.y + t.top, t.root.position.z, t.entity.getValue(Foe, 'hp') ?? 0, t.maxHp);
    this.life.end(dt, GAME.head, this.world.renderer);
  }
}
