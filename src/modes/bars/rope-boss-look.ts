/**
 * Lo que se ve del jefe de la cuerda (src/modes/bars/rope-boss.ts): el dragón del catálogo (el jefe de los voladores), que llega
 * volando desde lo alto, se queda delante y por encima de ti, se echa atrás y escupe bolas de fuego (las de los jefes de la
 * Travesía: src/style/missile-fx.ts), se marea bajando hasta encima de ti y, derrotado, se va volando. Hecho al empezar y
 * reutilizado: en plena pelea no se crea nada.
 */
import { AnimationMixer, AssetManager, Group, LoopOnce, LoopRepeat, Vector3, type AnimationAction, type SkinnedMesh } from '@iwsdk/core';
import { FOE_DEF } from '../../combat/foes.js';
import { Missile } from '../../style/missile-fx.js';
import { BOSS, type RopeBoss } from './rope-boss.js';
import type { LookFrame } from './rope-trials-look.js';

/** Dónde se queda (respecto a tu cabeza: hacia lo alto de tu cabeza y hacia arriba, m) y su tamaño. */
const HOVER = { fwd: 2.5, up: 7 }, DIZZY = { fwd: 0.6, up: 2.8 }, SCALE = 2.4; // (casi encima: tumbado mirando arriba, a la vista)

export class RopeBossLook {
  readonly root = new Group();
  private built = false;
  private dragon: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private fly: AnimationAction | null = null;
  private bite: AnimationAction | null = null;
  private ball: Missile | null = null;
  private readonly pos = new Vector3();
  private readonly to = new Vector3();
  private readonly mouth = new Vector3();
  private readonly aim = new Vector3();
  private readonly v = new Vector3();
  private shotId = -1;
  private starT = 0;

  constructor(parent: Group | import('@iwsdk/core').Object3D, private readonly sparks: (p: Vector3, n: number, c: number) => void) {
    parent.add(this.root);
    this.root.visible = false;
  }

  private build(): boolean {
    if (this.built) return true;
    const d = FOE_DEF.dragon, gltf = d && AssetManager.getGLTF(d.asset);
    if (!d || !gltf) return false;
    const model = gltf.scene, g = new Group();
    model.scale.setScalar(d.k);
    model.position.y = -d.h * d.ctr;
    model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) m.frustumCulled = false;
    });
    g.add(model);
    g.scale.setScalar(SCALE);
    this.root.add(g);
    this.dragon = g;
    this.mixer = new AnimationMixer(model);
    const clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const fc = clip(d.clips.walk), bc = clip(d.clips.attack);
    if (fc) {
      this.fly = this.mixer.clipAction(fc);
      this.fly.setLoop(LoopRepeat, Infinity);
      this.fly.play();
    }
    if (bc) {
      this.bite = this.mixer.clipAction(bc);
      this.bite.setLoop(LoopOnce, 1);
      this.bite.clampWhenFinished = true;
    }
    this.ball = new Missile({ kind: 'fire', size: 0.22 });
    this.root.add(this.ball.group);
    this.built = true;
    return true;
  }

  /** Cada fotograma: el dragón y su bola, según la pelea (B); F, tu cabeza y sus ejes; `req`, lo que pide la subida (la rasante
   * pasa a la altura de tu cabeza arriba). */
  update(dt: number, show: boolean, B: RopeBoss | null, F: LookFrame, req: number): void {
    if (!show || !B || B.st === 'off' || !this.build()) {
      this.root.visible = false;
      this.ball?.stop();
      return;
    }
    const D = this.dragon!, k = B.t;
    this.root.visible = true;
    this.mixer?.update(dt);
    this.ball!.update(dt);
    // dónde está: llegando desde lo alto; delante y arriba; mareado, encima de ti; derrotado, se va
    const hover = this.v.copy(F.head).addScaledVector(F.fwd, HOVER.fwd).addScaledVector(F.up, HOVER.up);
    if (B.st === 'intro') {
      const e = Math.min(1, k / BOSS.intro), s = e * e * (3 - 2 * e);
      this.to.copy(F.head).addScaledVector(F.fwd, 30).addScaledVector(F.up, 22).lerp(hover, s);
    } else if (B.st === 'dizzy') {
      this.to.copy(F.head).addScaledVector(F.fwd, DIZZY.fwd).addScaledVector(F.up, DIZZY.up).addScaledVector(F.right, Math.sin(k * 2.2) * 0.4);
      this.starT -= dt;
      if (this.starT <= 0) {
        this.starT = 0.45;
        this.sparks(this.mouth.copy(D.position).addScaledVector(F.up, 0.9), 6, 0xfff27a); // (las estrellas del mareo)
      }
    } else if (B.st === 'down') {
      this.to.copy(hover).addScaledVector(F.up, k * 8).addScaledVector(F.fwd, k * 10);
      if (k > 3) this.root.visible = false;
    } else this.to.copy(hover).addScaledVector(F.up, B.st === 'wind' ? 0.8 * Math.sin((k / BOSS.wind) * Math.PI) : 0);
    D.position.lerp(this.to, Math.min(1, dt * (B.st === 'intro' || B.st === 'down' ? 20 : 3)));
    // de cara a ti
    D.lookAt(F.head);
    // su bola: crece en la boca al echarse atrás, vuela a tu cara (o rasante por encima del cable) y sigue de largo
    this.mouth.copy(D.position).lerp(F.head, 0.08);
    if (B.st === 'wind') {
      if (this.shotId !== B.hits * 100 + B.thrown) {
        this.shotId = B.hits * 100 + B.thrown;
        if (this.bite) {
          this.bite.reset().play();
          this.fly && this.bite.crossFadeFrom(this.fly, 0.15, false);
        }
      }
      this.ball!.charge(this.mouth, k / BOSS.wind);
      // (adónde va: a tu cara; la rasante, a la altura de tu cabeza arriba)
      this.aim.copy(F.head).addScaledVector(F.up, B.shot === 'ball' ? 0.25 : req + 0.12);
    } else if (B.st === 'fly') {
      if (this.bite && this.fly && k < dt * 2) this.fly.reset().play().crossFadeFrom(this.bite, 0.2, false);
      const e = Math.min(1.25, k / BOSS.fly);
      this.pos.copy(this.mouth).lerp(this.aim, e);
      // (la rasante sigue de largo hacia tus pies)
      if (B.shot === 'sweep' && e > 1) this.pos.addScaledVector(F.fwd, -(e - 1) * 12);
      this.ball!.fly(this.pos, dt, F.head);
    }
  }

  /** La bola ha pasado sin darte (sigue de largo y se apaga) o te ha dado (estalla delante de ti, a más de un metro). */
  dodged(): void {
    this.ball?.coast(0.4);
  }
  burned(F: LookFrame): void {
    this.ball?.hit(this.v.copy(F.head).addScaledVector(F.up, 1.1), true);
  }
}
