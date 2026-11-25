/**
 * Lo que se ve de los jefes de cada zona de la cuerda (src/modes/bars/rope-boss.ts: el demonio, el cíclope y el yeti): de pie en
 * el cable, por delante de ti (hacia tus pies: tumbado, a la vista), de cara a ti. Llegan de un salto desde lo alto, se echan
 * atrás y lanzan lo suyo (el demonio, fuego; el cíclope, piedras; el yeti, bolas de nieve: las bolas de los jefes de la Travesía,
 * src/style/missile-fx.ts) a tu cara o rasante por encima de ti; mareados, se tambalean con estrellas; al darles, se encogen; y
 * derrotados, caen del cable. Los monstruitos del catálogo, hechos una vez y reutilizados: en plena ronda no se crea nada.
 */
import { AnimationMixer, AssetManager, DoubleSide, Group, LoopOnce, LoopRepeat, Vector3, type AnimationAction, type Object3D, type SkinnedMesh } from '@iwsdk/core';
import { Missile, type MissileKind } from '../../style/missile-fx.js';
import { BOSS, type BossKind, type RopeBoss } from './rope-boss.js';
import type { RopeCourse } from './rope.js';
import type { LookFrame } from './rope-trials-look.js';

/** Cada jefe del cable: su modelo, su tamaño (m) y lo que lanza. */
const KINDS: Record<Exclude<BossKind, 'dragon'>, { asset: string; nat: number; h: number; ball: MissileKind; size: number }> = {
  demon: { asset: 'foe-demon', nat: 1.62, h: 1.5, ball: 'fire', size: 0.16 },
  cyclops: { asset: 'foe-cyclops', nat: 1.67, h: 1.6, ball: 'meteor', size: 0.16 },
  yeti: { asset: 'foe-yeti', nat: 1.67, h: 1.6, ball: 'snow', size: 0.18 },
};
/** Dónde está: lo que se adelanta por el cable desde donde te para (m). */
const AHEAD = 3.5;

interface Mini {
  g: Group;
  mixer: AnimationMixer;
  idle: AnimationAction | null;
  bite: AnimationAction | null;
  hurt: AnimationAction | null;
  die: AnimationAction | null;
  jump: AnimationAction | null;
  ball: Missile;
}

export class RopeMiniLook {
  readonly root = new Group();
  private minis: Partial<Record<BossKind, Mini>> = {};
  private shotId = -1;
  private hitsSeen = -1;
  private last: RopeBoss | null = null;
  private starT = 0;
  private readonly v = new Vector3();
  private readonly a = new Vector3();
  private readonly aim = new Vector3();

  constructor(parent: Object3D, private readonly track: Object3D, private readonly sparks: (p: Vector3, n: number, c: number) => void) {
    parent.add(this.root);
  }

  private mini(k: Exclude<BossKind, 'dragon'>): Mini | null {
    const have = this.minis[k];
    if (have) return have;
    const K = KINDS[k], gltf = AssetManager.getGLTF(K.asset);
    if (!gltf) return null;
    const model = gltf.scene, g = new Group();
    model.scale.setScalar(K.h / K.nat);
    model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isMesh) return;
      if (m.isSkinnedMesh) m.frustumCulled = false;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.side = DoubleSide;
    });
    g.add(model);
    g.visible = false;
    this.track.add(g);
    const mixer = new AnimationMixer(model), act = (n: string, loop: boolean): AnimationAction | null => {
      const c = gltf.animations.find((x) => x.name === n);
      if (!c) return null;
      const a = mixer.clipAction(c);
      a.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      a.clampWhenFinished = !loop;
      return a;
    };
    const ball = new Missile({ kind: K.ball, size: K.size });
    this.root.add(ball.group);
    const M: Mini = { g, mixer, idle: act('Idle', true), bite: act('Bite_Front', false), hurt: act('HitRecieve', false), die: act('Death', false), jump: act('Jump', false), ball };
    M.idle?.play();
    this.minis[k] = M;
    return M;
  }

  private play(M: Mini, a: AnimationAction | null): void {
    if (!a) return;
    a.reset().play();
    if (M.idle && a !== M.idle) a.crossFadeFrom(M.idle, 0.12, false);
  }

  /** Cada fotograma: el jefe del cable (B; null o el dragón: ninguno), en el recorrido C, con tu cabeza y sus ejes (F), los cables
   * (laneY) y lo que pide la subida (req: la rasante pasa a la altura de tu cabeza arriba). */
  update(dt: number, show: boolean, B: RopeBoss | null, C: RopeCourse | null, F: LookFrame, laneY: number, req: number): void {
    for (const k of Object.keys(this.minis) as BossKind[]) {
      const M = this.minis[k]!;
      if (!show || !B || B.kind !== k || B.st === 'off' || !C) {
        M.g.visible = false;
        M.ball.stop();
      }
    }
    if (!show || !B || B.kind === 'dragon' || B.st === 'off' || !C) return;
    const M = this.mini(B.kind);
    if (!M) return;
    M.mixer.update(dt);
    M.ball.update(dt);
    const k = B.t, s = B.at + AHEAD;
    // dónde: en el cable, por delante; al llegar, de un salto desde lo alto; derrotado, cae
    let y = C.y(s) + laneY + 0.02;
    if (B.st === 'intro') {
      const e = Math.min(1, k / BOSS.intro);
      y += 7 * (1 - e) * (1 - e);
      if (k < dt * 2) this.play(M, M.jump);
    } else if (B.st === 'down') {
      if (k < dt * 2) this.play(M, M.die);
      y -= Math.max(0, k - 0.8) ** 2 * 6;
      if (k > 3) {
        M.g.visible = false;
        return;
      }
    }
    M.g.position.set(0, y, -C.h(s));
    M.g.visible = true;
    // de cara a ti (de pie: solo gira a lo ancho), tambaleándose si está mareado
    M.g.updateMatrixWorld();
    const p = M.g.getWorldPosition(this.v);
    M.g.lookAt(this.a.set(F.head.x, p.y, F.head.z));
    if (B.st === 'dizzy') {
      M.g.rotateZ(Math.sin(k * 3) * 0.18);
      this.starT -= dt;
      if (this.starT <= 0) {
        this.starT = 0.45;
        this.sparks(this.a.copy(p).addScaledVector(F.up, 1.8), 6, 0xfff27a);
      }
    }
    // al darle, se encoge
    if (B !== this.last) {
      this.last = B;
      this.hitsSeen = B.hits;
    }
    if (B.hits !== this.hitsSeen) {
      if (this.hitsSeen >= 0 && B.hits > this.hitsSeen) this.play(M, M.hurt);
      this.hitsSeen = B.hits;
    }
    // su bola: crece en su mano al echarse atrás, vuela a tu cara (o rasante por encima de ti) y sigue de largo
    const mouth = this.a.copy(p).addScaledVector(F.up, 1.2).lerp(F.head, 0.06);
    if (B.st === 'wind') {
      if (this.shotId !== B.hits * 100 + B.thrown) {
        this.shotId = B.hits * 100 + B.thrown;
        this.play(M, M.bite);
      }
      M.ball.charge(mouth, k / BOSS.wind);
      this.aim.copy(F.head).addScaledVector(F.up, B.shot === 'ball' ? 0.2 : req + 0.12);
    } else if (B.st === 'fly') {
      const e = Math.min(1.25, k / BOSS.fly);
      this.v.copy(mouth).lerp(this.aim, e);
      if (B.shot === 'sweep' && e > 1) this.v.addScaledVector(F.fwd, -(e - 1) * 10);
      M.ball.fly(this.v, dt, F.head);
    }
  }

  /** La bola ha pasado sin darte (sigue de largo y se apaga) o te ha dado (estalla delante de ti, a más de un metro). */
  dodged(B: RopeBoss): void {
    if (B.kind !== 'dragon') this.minis[B.kind]?.ball.coast(0.4);
  }
  burned(B: RopeBoss, F: LookFrame): void {
    if (B.kind !== 'dragon') this.minis[B.kind]?.ball.hit(this.v.copy(F.head).addScaledVector(F.up, 1.1), true);
  }
  /** Al empezar la ronda: nada a la vista. */
  reset(): void {
    for (const M of Object.values(this.minis)) {
      M!.g.visible = false;
      M!.ball.stop();
    }
    this.shotId = this.hitsSeen = -1;
  }
}
