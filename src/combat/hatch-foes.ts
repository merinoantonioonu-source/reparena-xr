/**
 * La batalla diminuta en la partida (su lógica, de RepArena, en src/combat/hatch.ts): las cuatro trampillas del suelo,
 * delante de tus manos (en la plancha con un brazo, delante y a los lados), que se abren al salir un bicho; los bichos de
 * las trampillas (cangrejo, seta y calavera, de Quaternius, de unos 20 cm; el jefe, 2,4 veces más) con sus animaciones
 * (corretear, amenazar con un saltito, morder, morir) y su voz; y el marcador tumbado en el suelo, que rodean.
 * Sin cuerpo de física (como en RepArena: se mueven solos por el suelo).
 */
import { AnimationAction, AnimationMixer, AssetManager, createSystem, Entity, Group, LoopOnce, LoopRepeat, Material, Mesh, Object3D, SkinnedMesh, Vector3 } from '@iwsdk/core';
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

  init(): void {
    this.enemies = this.world.getSystem(EnemySystem) ?? null;
    if (this.enemies) this.enemies.hatches = this;
    for (let i = 0; i < 4; i++) {
      const root = createHatch();
      root.visible = false;
      this.world.createTransformEntity(root);
      this.traps.push({ root, lid: root.getObjectByName('hatch-lid') ?? null, open: 0, openT: 0 });
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
    const s = boss ? 2.4 : 1, foe = new HatchFoe(s, boss, { x: at.x - this.origin.x, z: at.z - this.origin.z }, this.oneArm, Math.max(1, dv('walkTime', GAME.ramp)), hp);
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
    root.rotation.set(0, rt.foe.yaw, 0);
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
