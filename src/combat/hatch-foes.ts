/**
 * La batalla diminuta en la partida (su lógica, de RepArena, en src/combat/hatch.ts): las cuatro trampillas del suelo,
 * delante de tus manos (en la plancha con un brazo, delante y a los lados), que se abren al salir un bicho; los bichos de
 * las trampillas (cangrejo, seta y calavera, de Quaternius, de unos 20 cm; el jefe, 2,4 veces más) con sus animaciones
 * (corretear, amenazar con un saltito, morder, morir) y su voz; y el marcador tumbado en el suelo, que rodean.
 * Sin cuerpo de física (como en RepArena: se mueven solos por el suelo). En el inchworm, además, la línea luminosa del
 * suelo (donde queda tu cabeza en la plancha), la barra que se llena con lo que avanzas y la onda expansiva al volver
 * (RepArena: IW, iwVisual, iwWave e iwWaveStep).
 */
import { AdditiveBlending, AnimationAction, AnimationMixer, AssetManager, CircleGeometry, Color, createSystem, CylinderGeometry, DoubleSide, Entity, Group, LoopOnce, LoopRepeat, Material, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, RingGeometry, SkinnedMesh, Vector3 } from '@iwsdk/core';
import { Foe, FoeState } from './components.js';
import { HatchFoe, HATCH_POS, HATCH_SIDE, type HatchEnv } from './hatch.js';
import { devFoe } from './foes.js';
import { EnemySystem, FoeTarget } from './enemies.js';
import { createHatch } from '../scene-assets/hatch.scene-asset.js';
import { num } from '../core/values.js';
import { dv } from '../core/settings.js';
import { SND } from '../audio/sound.js';
import { GAME, HOOKS } from '../core/state.js';

/** Los bichos de las trampillas: su modelo y lo que mide su modelo (RepArena: BEAST_DEF, [alto del modelo]). */
export const HATCH_BEAST: Record<string, { asset: string; nat: number; voice: string }> = {
  crab: { asset: 'foe-crab', nat: 1.57, voice: 'crab' },
  mushroom: { asset: 'foe-mushroom', nat: 2.07, voice: 'mushroom' },
  skull: { asset: 'foe-skull', nat: 1.55, voice: 'skull' },
};

/** De los elegidos para las trampillas, los que tienen modelo; si ninguno (las arañas, geométricas, no), cangrejo y seta. */
export const hatchFoes = (chosen: string[]): string[] => {
  const ok = chosen.filter((k) => !!HATCH_BEAST[k]);
  return ok.length ? ok : ['crab', 'mushroom'];
};

interface HatchRt {
  beast: string;
  foe: HatchFoe;
  maxHp: number;
  str: number;
  model: Object3D;
  mixer: AnimationMixer;
  acts: Map<string, AnimationAction>;
  cur: string;
  target: FoeTarget;
  fade: Material[] | null;
}

interface Trap {
  root: Group;
  lid: Object3D | null;
  open: number;
  openT: number;
}

const ICHOR = 0x525c0f;
/** En el inchworm, los bichos llegan mucho más despacio (hay que caminar con las manos: RepArena, IW_SLOW). */
const IW_SLOW = 2.6;
const TEAL = new Color(0x3cf0c6), GOLD = new Color(0xffd166), WHITE = new Color(1, 1, 1);
const strip = (w: number, d: number, col: number, op: number): Mesh => {
  const m = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  m.userData.noInk = true;
  return m;
};
const glowMat = (col: number, op: number): MeshBasicMaterial => new MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, toneMapped: false });

export class HatchSystem extends createSystem({ hatched: { required: [Foe] } }, {}) {
  private enemies: EnemySystem | null = null;
  /** Dónde está la arena de la batalla diminuta (donde estabas al colocarte; delante es −Z). */
  readonly origin = new Vector3();
  private traps: Trap[] = [];
  private oneArm = false;
  private spawned = 0;
  private HL = new Vector3();
  private env: HatchEnv = { HL: this.HL, play: false, active: false, board: false, others: [] };
  private others: HatchFoe[] = [];
  private p = new Vector3();
  /** ¿Va la batalla diminuta? (las trampillas a la vista y el marcador en el suelo) */
  on = false;
  /** El inchworm: su suelo (la línea, la barra y la salida) y su onda. */
  private inch = false;
  private iw = { g: new Group(), line: strip(0.9, 0.06, 0x3cf0c6, 0.9), glow: strip(1.1, 0.28, 0x3cf0c6, 0.25), track: strip(0.09, 1, 0x2f2853, 0.75), fill: strip(0.09, 1, 0x3cf0c6, 0.9), start: strip(0.5, 0.03, 0xeeeaff, 0.55), z1: 1 };
  private wave = { t: -1, pow: 1, m: 1, g: new Group(), flash: new Mesh(new CircleGeometry(1, 48), glowMat(0x40fff0, 1)), r1: new Mesh(new RingGeometry(0.84, 1, 96), glowMat(0x00f0ff, 1)), r2: new Mesh(new RingGeometry(0.9, 1, 96), glowMat(0xff2bd6, 1)), w1: new Mesh(new CylinderGeometry(1, 1, 1, 64, 1, true), glowMat(0x10e8ff, 0.85)), w2: new Mesh(new CylinderGeometry(1, 1, 1, 64, 1, true), glowMat(0xff3ad8, 0.6)), dustT: 0 };

  init(): void {
    this.enemies = this.world.getSystem(EnemySystem) ?? null;
    if (this.enemies) this.enemies.hatches = this;
    for (let i = 0; i < 4; i++) {
      const root = createHatch();
      root.visible = false;
      this.world.createTransformEntity(root);
      this.traps.push({ root, lid: root.getObjectByName('hatch-lid') ?? null, open: 0, openT: 0 });
    }
    // el suelo del inchworm (la barra crece desde la salida hacia la línea)
    const I = this.iw;
    I.fill.geometry.translate(0, 0.5, 0);
    I.g.add(I.line, I.glow, I.track, I.fill, I.start);
    I.g.visible = false;
    this.world.createTransformEntity(I.g);
    // la onda: un destello en el suelo, dos frentes de colores vivos y dos paredes de luz que se levantan y se apagan
    const W = this.wave;
    for (const m of [W.flash, W.r1, W.r2]) m.rotation.x = -Math.PI / 2;
    for (const m of [W.flash, W.r1, W.r2, W.w1, W.w2]) {
      m.renderOrder = 20;
      m.userData.noInk = true;
      W.g.add(m);
    }
    W.g.visible = false;
    this.world.createTransformEntity(W.g);
  }

  /** El suelo del inchworm: la línea (donde queda tu cabeza en la plancha, en el origen) y la barra desde la salida
   * (reach: lo que se aleja la línea de donde empiezas) (RepArena: iwLayout). */
  inchLayout(on: boolean, reach: number): void {
    const I = this.iw, S = reach + 0.12, z1 = S - 0.25, y = 0.007;
    this.inch = on;
    I.g.visible = on;
    I.z1 = z1;
    I.g.position.copy(this.origin);
    I.line.position.set(0, y, 0);
    I.glow.position.set(0, y - 0.001, 0);
    I.start.position.set(0, y, z1);
    I.track.position.set(0, y - 0.002, z1 / 2);
    I.track.scale.set(1, z1, 1);
    I.fill.position.set(0, y, z1);
    I.fill.scale.set(1, 1e-3, 1);
  }

  /** Lo que se ve del inchworm cada fotograma: la barra se llena con lo que avanzas (a la vuelta, dorada) y la línea late
   * y destella al llegar (RepArena: iwVisual). */
  inchVisual(phase: string, g: number, flash: number, t: number): void {
    const I = this.iw;
    if (!I.g.visible) return;
    const gg = phase === 'out' ? g : phase === 'back' ? 1 : 0, len = Math.max(1e-3, (I.z1 - 0.15) * gg + (gg >= 1 ? 0.15 : 0)), col = phase === 'back' ? GOLD : TEAL;
    I.fill.scale.set(1, len, 1);
    (I.fill.material as MeshBasicMaterial).color.copy(col);
    const lm = I.line.material as MeshBasicMaterial;
    lm.color.copy(col).lerp(WHITE, flash * 0.8);
    lm.opacity = phase === 'out' ? 0.65 + 0.35 * Math.sin(t * 7) : 0.9;
    (I.glow.material as MeshBasicMaterial).color.copy(col);
    (I.glow.material as MeshBasicMaterial).opacity = 0.2 + 0.5 * flash;
    I.line.scale.set(1 + 0.25 * flash, 1 + 2 * flash, 1);
  }

  /** La onda expansiva al volver del inchworm, en at (el suelo bajo tu cabeza), con su fuerza (×1 a ×4): llega más lejos
   * cuanto más fuerte. Devuelve hasta dónde llega (m). Los bichos de las trampillas que alcanza vuelven a la suya. */
  shockwave(at: Vector3, pow: number): number {
    const W = this.wave;
    W.pow = pow;
    W.m = 0.85 + 0.2 * (pow - 1);
    W.t = 0;
    W.dustT = 0;
    W.g.position.set(at.x, 0.02, at.z);
    W.g.visible = true;
    this.waveStep(0);
    const reach = 3.2 * W.m + 0.3;
    for (const e of this.queries.hatched.entities) {
      const rt = e.object3D?.userData.hatch as HatchRt | undefined;
      if (rt && rt.foe.alive && Math.hypot(rt.foe.pos.x + this.origin.x - at.x, rt.foe.pos.z + this.origin.z - at.z) <= reach) rt.foe.sendHome();
    }
    return reach;
  }

  private waveStep(dt: number): void {
    const W = this.wave;
    if (W.t < 0) return;
    W.t += dt;
    const T = 1.1 + 0.15 * (W.pow - 1), k = W.t / T, e1 = 1 - Math.pow(1 - Math.min(1, k), 3), k2 = Math.max(0, Math.min(1, (W.t - 0.12) / T)), e2 = 1 - Math.pow(1 - k2, 2);
    const R1 = 0.15 + e1 * 3.2 * W.m, R2 = 0.1 + e2 * 2.4 * W.m, hW = (0.32 + 0.08 * W.pow) * (1 - k * 0.7);
    const op = (m: Mesh, v: number): void => void ((m.material as MeshBasicMaterial).opacity = v);
    W.r1.scale.setScalar(R1);
    op(W.r1, 1 - k);
    W.r2.scale.setScalar(R2);
    op(W.r2, k2 > 0 ? 1 - k2 : 0);
    W.w1.scale.set(R1 * 0.97, hW, R1 * 0.97);
    W.w1.position.y = hW / 2;
    op(W.w1, 0.85 * Math.pow(1 - Math.min(1, k), 1.5));
    W.w2.scale.set(R2 * 0.98, hW * 0.7, R2 * 0.98);
    W.w2.position.y = hW * 0.35;
    op(W.w2, k2 > 0 ? 0.6 * Math.pow(1 - k2, 1.5) : 0);
    const f = Math.min(1, W.t / 0.3);
    W.flash.scale.setScalar(0.3 + f * 1.6 * W.m);
    op(W.flash, 1 - f);
    // el polvo de colores que levanta el frente a su paso
    if (k < 0.85 && W.t >= W.dustT * 0.07) {
      const n = 10 + 3 * W.pow, off = Math.random(), c = W.g.position;
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2;
        HOOKS.sparks(this.p.set(c.x + Math.sin(a) * R1, 0.04, c.z + Math.cos(a) * R1), 1, i % 3 ? 0x1affee : 0xff40d9);
      }
      W.dustT++;
    }
    if (k >= 1) {
      W.t = -1;
      W.g.visible = false;
    }
  }

  /** Coloca la arena diminuta donde estás (al colocarte) y enseña las trampillas (o las quita: on false). */
  layout(on: boolean, at: Vector3, oneArm: boolean): void {
    this.on = on;
    this.oneArm = oneArm;
    this.origin.set(at.x, 0, at.z);
    const pos = oneArm ? HATCH_SIDE : HATCH_POS;
    this.traps.forEach((t, i) => {
      t.root.visible = on;
      t.root.position.set(this.origin.x + pos[i][0], 0, this.origin.z + pos[i][1]);
      t.openT = 0;
    });
    this.spawned = 0;
  }

  /** Una trampilla para el siguiente (en la plancha con un brazo, una a cada lado por turnos), en el mundo. */
  nextTrap(out: Vector3): Vector3 {
    const pos = this.oneArm ? HATCH_SIDE : HATCH_POS;
    let i: number;
    if (this.oneArm) {
      const left = this.spawned % 2 === 0, side = [0, 1, 2, 3].filter((j) => pos[j][0] < 0 === left);
      i = side[Math.floor(Math.random() * side.length)];
    } else i = Math.floor(Math.random() * 4);
    this.spawned++;
    this.traps[i].openT = 2.2;
    return out.set(this.origin.x + pos[i][0], 0, this.origin.z + pos[i][1]);
  }

  ready(beast: string): boolean {
    const B = HATCH_BEAST[beast];
    return !!B && !!AssetManager.getGLTF(B.asset);
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.queries.hatched.entities) if (e.object3D?.userData.hatch && e.getValue(Foe, 'state') !== FoeState.Dead) n++;
    return n;
  }

  /** Saca uno (beast: crab, mushroom, skull) por una trampilla (at, en el mundo), con hp de vida. */
  spawn(beast: string, boss: boolean, at: Vector3, hp: number): FoeTarget | null {
    const B = HATCH_BEAST[beast], gltf = B && AssetManager.getGLTF(B.asset);
    if (!B || !gltf || !this.enemies) return null;
    const s = boss ? 2.4 : 1, foe = new HatchFoe(s, boss, { x: at.x - this.origin.x, z: at.z - this.origin.z }, this.oneArm, Math.max(1, dv('walkTime', GAME.ramp)) * (this.inch ? IW_SLOW : 1), hp);
    const root = new Group(), model = gltf.scene;
    root.name = `trampilla-${beast}`;
    model.scale.setScalar(0.2 / B.nat); // (unos 20 cm; RepArena: 0,2 · k / h)
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
    });
    root.add(model);
    root.scale.setScalar(s);
    const mixer = new AnimationMixer(model), acts = new Map<string, AnimationAction>();
    for (const c of gltf.animations) acts.set(c.name, mixer.clipAction(c));
    const e = this.world.createTransformEntity(root);
    const target = new FoeTarget(e, root, foe.radius, 0.1 * s, hp, 0.27 * s);
    const rt: HatchRt = { beast, foe, maxHp: hp, str: devFoe('h:' + beast).str, model, mixer, acts, cur: '', target, fade: null };
    root.userData.hatch = rt;
    this.enemies.targets.push(target);
    e.addComponent(Foe, { hp, speed: foe.avg, state: FoeState.Walk, timer: 0, side: 1, radius: foe.radius });
    this.place(rt, root);
    SND.hiss(this.p.copy(root.position), s, B.voice);
    return target;
  }

  /** Un disparo le da (dir: hacia dónde va el rayo); si se queda sin vida, muere. */
  hit(e: Entity, dmg: number, perfect: boolean, pow: number, dir: Vector3): void {
    const rt = e.object3D?.userData.hatch as HatchRt | undefined;
    if (!rt || e.getValue(Foe, 'state') === FoeState.Dead) return;
    this.localHead();
    const knock = (num('knockback') >= 0 ? num('knockback') : 100) / 100;
    const at = rt.target.center(this.p);
    HOOKS.sparks(at, 8, ICHOR);
    SND.squish(at);
    const alive = rt.foe.hit(dmg, perfect, Math.max(1, Math.min(4, pow)), this.HL, dir, knock);
    e.setValue(Foe, 'hp', Math.max(0, rt.foe.hp));
    if (alive) return;
    e.setValue(Foe, 'state', FoeState.Dead);
    e.setValue(Foe, 'timer', 0);
    HOOKS.sparks(at, rt.foe.boss ? 30 : 22, ICHOR);
    if (rt.foe.boss) SND.explosion(at, false);
    HOOKS.foeDown('h' + rt.beast, rt.foe.boss, rt.target);
  }

  /** Un puñetazo: lo aparta dist metros. */
  shove(e: Entity, dist: number, dir: Vector3): void {
    const rt = e.object3D?.userData.hatch as HatchRt | undefined;
    if (!rt) return;
    this.localHead();
    rt.foe.shove(dist, this.HL, dir);
  }

  vanishAll(): void {
    for (const e of this.queries.hatched.entities) {
      if (!e.object3D?.userData.hatch || e.getValue(Foe, 'state') === FoeState.Dead) continue;
      e.setValue(Foe, 'state', FoeState.Dead);
      e.setValue(Foe, 'timer', 1.4);
    }
  }

  clear(): void {
    for (const e of [...this.queries.hatched.entities]) if (e.object3D?.userData.hatch) this.remove(e);
  }

  private remove(e: Entity): void {
    const rt = e.object3D?.userData.hatch as HatchRt | undefined;
    if (rt) {
      rt.mixer.stopAllAction();
      if (rt.fade) for (const m of rt.fade) m.dispose();
      rt.target.removed = true;
      const ts = this.enemies?.targets, i = ts ? ts.indexOf(rt.target) : -1;
      if (ts && i >= 0) ts.splice(i, 1);
    }
    e.dispose({ disposeResources: false });
  }

  private localHead(): void {
    this.HL.copy(GAME.head).sub(this.origin);
  }

  // en el mundo, donde va en la arena; de cara hacia donde mira; alzado hacia atrás al amenazar
  private place(rt: HatchRt, root: Object3D): void {
    root.position.copy(rt.foe.pos).add(this.origin);
    root.rotation.set(rt.foe.flung ? Math.min(1, rt.foe.st / 0.9) * Math.PI * 3 : 0, rt.foe.yaw, 0); // (lanzado por la onda: dando vueltas)
    rt.model.rotation.x = -rt.foe.rear * 0.5;
  }

  // su animación (RepArena: HatchBeast.pose)
  private anim(rt: HatchRt): void {
    const f = rt.foe, m = f.mode, moving = f.vel.lengthSq() > 0;
    const want = m === 'dying' ? 'Death' : m === 'lunge' ? 'Bite_Front' : m === 'threat' ? 'Jump' : moving || m === 'emerge' ? 'Walk' : 'Idle';
    const once = want === 'Death' || want === 'Bite_Front', ts = want === 'Walk' ? (m === 'recoil' ? -1.7 : 1.7) : want === 'Bite_Front' ? 2.2 : 1;
    const a = rt.acts.get(want);
    if (!a) return;
    a.timeScale = ts;
    if (rt.cur === want) return;
    const prev = rt.cur ? rt.acts.get(rt.cur) : undefined;
    a.reset();
    a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, 0.1, false);
    rt.cur = want;
  }

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    this.waveStep(dt);
    // las trampillas: se abren al salir uno y se cierran después
    for (const t of this.traps) {
      if (t.openT > 0) t.openT -= dt;
      t.open += ((t.openT > 0 ? 1 : 0) - t.open) * Math.min(1, dt * 6);
      if (t.lid) t.lid.rotation.x = -1.6 * t.open;
    }
    const env = this.env;
    env.active = GAME.phase === 'playing';
    env.play = env.active && !GAME.between;
    env.board = this.on;
    this.localHead();
    this.others.length = 0;
    for (const e of this.queries.hatched.entities) {
      const rt = e.object3D?.userData.hatch as HatchRt | undefined;
      if (rt && rt.foe.alive) this.others.push(rt.foe);
    }
    env.others = this.others;
    for (const e of this.queries.hatched.entities) {
      const o = e.object3D, rt = o?.userData.hatch as HatchRt | undefined;
      if (!o || !rt) continue;
      const sl = this.enemies?.slowOf(rt.target) ?? 1; // (escarcha y calma)
      rt.mixer.update(dt * sl);
      if (e.getValue(Foe, 'state') === FoeState.Dead) {
        // muerto: se queda panza arriba un momento, se encoge y desaparece
        const timer = (e.getValue(Foe, 'timer') ?? 0) + dt;
        e.setValue(Foe, 'timer', timer);
        this.anim(rt);
        const k = timer < 1.4 ? 1 : Math.max(0, 1 - (timer - 1.4) / 0.5);
        o.scale.setScalar(rt.foe.s * Math.max(0.001, k));
        if (rt.foe.pos.y > 0) rt.foe.pos.y = Math.max(0, rt.foe.pos.y - dt * 2);
        o.position.y = rt.foe.pos.y;
        if (timer > 1.9) this.remove(e);
        continue;
      }
      rt.foe.step(dt * sl, time, env);
      const f = rt.foe;
      if (f.evHiss) SND.hiss(rt.target.center(this.p), f.evHiss, HATCH_BEAST[rt.beast].voice);
      if (f.evSkitter) SND.skitter(rt.target.center(this.p), f.s);
      if (f.evWhoosh) SND.whoosh(rt.target.center(this.p), 'spider');
      if (f.evBite) HOOKS.playerHit(rt.str);
      this.place(rt, o);
      this.anim(rt);
    }
  }
}
