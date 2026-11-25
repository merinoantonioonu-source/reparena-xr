/**
 * Lo que se ve de los retos con bichos de la cuerda (src/modes/bars/rope-trials.ts; «Retos en la cuerda» del usuario): los
 * murciélagos que pasan rozándote la cara por un lado y luego por el otro, el cangrejo que baja andando por el cable hacia tu
 * mano, el tirador (el cíclope, o el yeti en la cima) de pie en el suelo a un lado, que se echa atrás y lanza, la abeja que se
 * te planta delante de la cara y, con el turbo, las estelas de viento que te pasan a los lados. Los bichos, los del catálogo
 * (los monstruitos de Quaternius); lo que lanzan, las bolas de los jefes (src/style/missile-fx.ts). Todo hecho al empezar y
 * reutilizado: en plena ronda no se crea nada.
 *
 * Lo que vuela (murciélagos, abeja, lo que lanza el tirador) va en el mundo, respecto a tu cabeza; lo que está en la montaña o en
 * el cable (el tirador, el cangrejo), en el grupo del recorrido (`track`), que baja contigo al subir.
 */
import { AdditiveBlending, AnimationMixer, AssetManager, BoxGeometry, DoubleSide, Group, InstancedMesh, LoopOnce, LoopRepeat, Matrix4, MeshBasicMaterial, Object3D, Quaternion, Vector3, type AnimationAction, type SkinnedMesh } from '@iwsdk/core';
import { Missile } from '../../style/missile-fx.js';
import { warmKeep } from '../../style/warm.js';
import { batSide, shooterOf, TRIAL, type Trial } from './rope-trials.js';
import type { RopeCourse } from './rope.js';
import type { LookFrame } from './rope-trials-look.js';

/** Un bicho del catálogo, a su tamaño, con su animación de siempre (`loop`) y la de ataque (`once`). */
interface Critter {
  g: Group;
  mixer: AnimationMixer;
  loop: AnimationAction | null;
  once: AnimationAction | null;
}
/** Los murciélagos (dos bandadas de tres: la que pasa y la siguiente) y lo lejos que vienen (m). */
const BATS = 6, BAT_FROM = 9;
/** El cangrejo: de dónde sale, por el cable (m por delante de tus manos). */
const CRAB_FROM = 4.5;
/** Dónde se pone el tirador: lo que se adelanta (m) y lo lejos de la cuerda que puede estar (m, el primero que esté en seco). */
const SHOOT_AHEAD = 12, SHOOT_U = [13, 16, 20, 25];
const STREAKS = 22;

export class RopeFoesLook {
  readonly root = new Group();
  private bats: Critter[] = [];
  private crab: Critter | null = null;
  private bee: Critter | null = null;
  private shooters: Record<'cyclops' | 'yeti', { c: Critter; ball: Missile; id: number } | null> = { cyclops: null, yeti: null };
  private streaks: InstancedMesh | null = null;
  private streakMat: MeshBasicMaterial | null = null;
  private readonly v = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly aim = new Vector3();
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly sc = new Vector3();
  private readonly fwdZ = new Vector3(0, 0, 1);

  constructor(parent: Object3D, private readonly track: Object3D) {
    parent.add(this.root);
  }

  // un bicho del catálogo (si ya está cargado), a `h` m de alto, en `into`
  private critter(asset: string, nat: number, h: number, loop: string, once: string, into: Object3D): Critter | null {
    const gltf = AssetManager.getGLTF(asset);
    if (!gltf) return null;
    const model = gltf.scene, g = new Group();
    model.scale.setScalar(h / nat);
    model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!m.isMesh) return;
      if (m.isSkinnedMesh) m.frustumCulled = false;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.side = DoubleSide;
    });
    g.add(model);
    g.visible = false;
    into.add(g);
    const mixer = new AnimationMixer(model), clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const lc = clip(loop), oc = clip(once);
    const L = lc ? mixer.clipAction(lc) : null, O = oc ? mixer.clipAction(oc) : null;
    if (L) {
      L.setLoop(LoopRepeat, Infinity);
      L.play();
    }
    if (O) {
      O.setLoop(LoopOnce, 1);
      O.clampWhenFinished = true;
    }
    return { g, mixer, loop: L, once: O };
  }

  // lo que falte por hacer (cada bicho, en cuanto su modelo está cargado)
  private build(): void {
    if (this.bats.length < BATS)
      for (let i = this.bats.length; i < BATS; i++) {
        const c = this.critter('foe-bat', 1.75, 0.32, 'Flying', 'Bite_Front', this.root);
        if (!c) break;
        if (c.loop) c.loop.timeScale = 1.6;
        this.bats.push(c);
      }
    this.crab ??= this.critter('foe-crab', 1.57, 0.24, 'Walk', 'Bite_Front', this.track);
    this.bee ??= this.critter('foe-bee', 1.9, 0.26, 'Flying', 'Bite_Front', this.root);
    // (los tiradores, grandes: se ven bien de lejos, en su roca)
    for (const [k, asset, kind, size] of [['cyclops', 'foe-cyclops', 'meteor', 0.2], ['yeti', 'foe-yeti', 'snow', 0.22]] as const) {
      if (this.shooters[k]) continue;
      const c = this.critter(asset, 1.67, 2.3, 'Idle', 'Bite_Front', this.track);
      if (!c) continue;
      const ball = new Missile({ kind, size });
      this.root.add(ball.group);
      this.shooters[k] = { c, ball, id: -1 };
    }
    if (!this.streaks) {
      this.streakMat = new MeshBasicMaterial({ color: 0xe8ffc0, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      this.streaks = new InstancedMesh(new BoxGeometry(0.015, 0.015, 1), this.streakMat, STREAKS);
      this.streaks.frustumCulled = false;
      this.streaks.visible = false;
      this.streaks.userData.noInk = true;
      this.root.add(this.streaks);
      warmKeep(new InstancedMesh(this.streaks.geometry, this.streakMat, 1));
    }
  }

  /** Al empezar la ronda: nada a la vista. */
  reset(): void {
    for (const B of this.bats) B.g.visible = false;
    if (this.crab) this.crab.g.visible = false;
    if (this.bee) this.bee.g.visible = false;
    for (const S of Object.values(this.shooters)) {
      if (!S) continue;
      S.c.g.visible = false;
      S.ball.stop();
      S.id = -1;
    }
    if (this.streaks) this.streaks.visible = false;
  }

  /**
   * Cada fotograma. F: tu cabeza y sus ejes; C: el recorrido; s: por dónde vas; lanes, laneY: los cables; ref, req: la altura de
   * tu cabeza abajo y lo que pide la subida (m); turbo: si va con el turbo; t: el reloj.
   */
  update(dt: number, show: boolean, live: readonly Trial[], F: LookFrame, C: RopeCourse | null, s: number, lanes: number[], laneY: number, ref: number, req: number, turbo: boolean, t: number): void {
    if (!show || !C) {
      this.root.visible = false;
      this.reset();
      return;
    }
    this.build();
    this.root.visible = true;
    let bats = false, crab = false, bee = false;
    const shooting = { cyclops: false, yeti: false };
    for (const B of this.bats) B.mixer.update(dt);
    this.crab?.mixer.update(dt);
    this.bee?.mixer.update(dt);
    for (const S of Object.values(this.shooters)) {
      if (!S) continue;
      S.c.mixer.update(dt);
      S.ball.update(dt);
    }
    for (const T of live) {
      if (T.kind === 'bats') bats = this.batsAt(T, F, t) || bats;
      else if (T.kind === 'crab') crab = this.crabAt(T, C, s, lanes, laneY) || crab;
      else if (T.kind === 'bee') bee = this.beeAt(T, F, t) || bee;
      else if (T.kind === 'shooter') {
        const k = shooterOf(C, T);
        shooting[k] = this.shooterAt(T, k, C, F, ref, req) || shooting[k];
      }
    }
    if (!bats) for (const B of this.bats) B.g.visible = false;
    if (this.crab && !crab) this.crab.g.visible = false;
    if (this.bee && !bee) this.bee.g.visible = false;
    for (const k of ['cyclops', 'yeti'] as const) {
      const S = this.shooters[k];
      if (S && !shooting[k]) {
        S.c.g.visible = false;
        S.ball.stop();
        S.id = -1;
      }
    }
    this.turboAt(turbo, F, t);
  }

  // los murciélagos: cada pasada, una bandada de tres que llega de delante, pasa rozándote la cara por su lado y sigue de largo
  private batsAt(T: Trial, F: LookFrame, t: number): boolean {
    let any = false;
    for (let i = 0; i < this.bats.length; i++) {
      const B = this.bats[i], set = Math.floor(i / 3), j = i % 3;
      // (cada bandada lleva una pasada: la par, las pares; la otra, las impares)
      let k = -1;
      for (let p = set; p < T.n; p += 2) {
        const at = TRIAL.come.bats + p * TRIAL.batGap;
        if (T.t > at - 1.7 && T.t < at + 0.9) k = p;
      }
      if (k < 0 || (T.st === 'done' && T.ok === false && k > T.k)) {
        B.g.visible = false;
        continue;
      }
      const at = TRIAL.come.bats + k * TRIAL.batGap, sd = batSide(T, k), u = (T.t - at) / 1.7;
      const p = this.v.copy(F.head).addScaledVector(F.right, sd * (0.24 + j * 0.12) + Math.sin(t * 9 + i) * 0.03).addScaledVector(F.up, 0.3 + j * 0.08);
      // (de delante y de lo alto hasta tu cara; luego, hacia atrás y arriba)
      if (u < 0) p.addScaledVector(F.fwd, -u * BAT_FROM).addScaledVector(F.up, -u * 2.6);
      else p.addScaledVector(F.fwd, -u * 5).addScaledVector(F.up, u * 2);
      this.a.copy(B.g.position);
      B.g.position.copy(p);
      this.b.subVectors(p, this.a);
      if (this.b.lengthSq() > 1e-8) B.g.lookAt(this.b.add(p));
      B.g.visible = true;
      any = true;
    }
    return any;
  }

  // el cangrejo: baja andando por el cable de su lado hasta la mano; si no la sueltas, pellizca; luego se va por donde vino
  private crabAt(T: Trial, C: RopeCourse, s: number, lanes: number[], laneY: number): boolean {
    const K = this.crab;
    if (!K) return false;
    const come = TRIAL.come.crab;
    if (T.st === 'done' && T.t > 1.6) return false;
    const k = T.st === 'done' ? 1 - Math.min(1, T.t / 1.6) * 0.6 : Math.min(1, T.t / come), d = CRAB_FROM * (1 - k);
    // (con dos paralelas, por el cable de su lado; con una, por el único y, al final, por la barra hacia la mano)
    const two = lanes.length > 1, x = two ? lanes[T.side < 0 ? 0 : 1] : T.side * 0.3 * Math.max(0, (k - 0.7) / 0.3);
    const sc = s + d;
    K.g.position.set(x, C.y(sc) + laneY + 0.02, -C.h(sc));
    this.v.set(x, C.y(s + d - 0.3) + laneY + 0.02, -C.h(s + d - 0.3));
    if (T.st === 'done') this.v.set(x, C.y(sc + 0.3) + laneY + 0.02, -C.h(sc + 0.3)); // (se va: de cara hacia arriba)
    K.g.lookAt(this.track.localToWorld(this.v));
    // (al llegar, pellizca)
    if (K.once && T.st === 'judge' && !K.once.isRunning() && T.t > come - 0.3) K.once.reset().play();
    K.g.visible = true;
    return true;
  }

  // la abeja: llega de delante y se planta zumbando delante de tu cara; con el remo explosivo sale despedida
  private beeAt(T: Trial, F: LookFrame, t: number): boolean {
    const E = this.bee;
    if (!E) return false;
    const come = TRIAL.come.bee;
    if (T.st === 'done' && T.t > 1) return false;
    const p = this.v.copy(F.head).addScaledVector(F.up, 0.42 + Math.sin(t * 5) * 0.04).addScaledVector(F.right, Math.sin(t * 3.3) * 0.08);
    if (T.st !== 'done' && T.t < come) {
      const u = 1 - T.t / come;
      p.addScaledVector(F.fwd, u * 6).addScaledVector(F.up, u * 2);
    } else if (T.st === 'done' && T.ok) p.addScaledVector(F.up, T.t * 6).addScaledVector(F.fwd, -T.t * 3);
    E.g.position.copy(p);
    E.g.lookAt(F.head);
    E.g.visible = true;
    return true;
  }

  // el tirador: de pie en el suelo, a un lado (donde esté seco), de cara a ti; se echa atrás y lanza a tu cara, rasante por
  // encima de tu cabeza arriba o bajo, a la altura de tu cabeza abajo
  private shooterAt(T: Trial, k: 'cyclops' | 'yeti', C: RopeCourse, F: LookFrame, ref: number, req: number): boolean {
    const S = this.shooters[k];
    if (!S) return false;
    const come = TRIAL.come.shooter, end = come + TRIAL.judgeShot[T.shot];
    if (T.st === 'done' && T.t > end + 1.5) return false;
    const G = S.c.g;
    if (S.id !== T.id) {
      S.id = T.id;
      const h = C.h(T.s) + SHOOT_AHEAD;
      let u = T.side * SHOOT_U[0];
      for (const x of SHOOT_U)
        if (!C.wet(h, T.side * x, 1.5) && !C.steep(h, T.side * x)) {
          u = T.side * x;
          break;
        }
      G.position.set(u, C.ground(h, u) - 0.05, -h);
      S.c.once?.stop();
    }
    G.visible = true;
    // (de cara a ti)
    G.lookAt(this.a.set(F.head.x, G.getWorldPosition(this.b).y, F.head.z));
    // el gesto y la bola: crece en su mano, vuela y, esquivada, sigue de largo; si te da, la partida la hace estallar
    const hand = G.getWorldPosition(this.b).addScaledVector(F.up, 1.9);
    if (T.t >= come - TRIAL.windUp && T.t < come - TRIAL.windUp + 0.05 && S.c.once && !S.c.once.isRunning()) S.c.once.reset().play();
    if (T.t < come - TRIAL.windUp) return true;
    if (T.t < come - 0.55) {
      S.ball.charge(hand, (T.t - (come - TRIAL.windUp)) / (TRIAL.windUp - 0.55));
      // (adónde: tu cara; la rasante, por encima de tu cabeza arriba; la baja, a la altura de tu cabeza abajo)
      this.aim.copy(F.head);
      if (T.shot === 'high') this.aim.y = ref + req + 0.12;
      else if (T.shot === 'low') this.aim.y = ref + 0.02;
      return true;
    }
    const e = (T.t - (come - 0.55)) / 0.55;
    if (T.st === 'done' && T.ok === false) {
      S.ball.stop();
      return true;
    }
    this.v.copy(hand).lerp(this.aim, e);
    if (e > 1) this.v.addScaledVector(this.b.subVectors(this.aim, hand).normalize(), (e - 1) * 4);
    if (T.st === 'done' && T.ok) S.ball.coast(0.4);
    else S.ball.fly(this.v, 1 / 72, F.head);
    return true;
  }

  // el turbo: estelas de viento que te pasan a los lados, de delante hacia atrás
  private turboAt(on: boolean, F: LookFrame, t: number): void {
    const M = this.streaks;
    if (!M || !this.streakMat) return;
    const o = this.streakMat.opacity + ((on ? 0.32 : 0) - this.streakMat.opacity) * 0.08;
    this.streakMat.opacity = o;
    M.visible = o > 0.01;
    if (!M.visible) return;
    this.q.setFromUnitVectors(this.fwdZ, F.fwd);
    for (let i = 0; i < STREAKS; i++) {
      const sd = i % 2 ? 1 : -1, r = 0.9 + ((i * 37) % 11) * 0.18, up = ((i * 53) % 13) * 0.2 - 0.6, z = 8 - ((t * (11 + (i % 4) * 2) + i * 2.3) % 13);
      this.v.copy(F.head).addScaledVector(F.right, sd * r).addScaledVector(F.up, up).addScaledVector(F.fwd, z);
      this.m4.compose(this.v, this.q, this.sc.set(1, 1, 1.2 + (i % 3) * 0.5));
      M.setMatrixAt(i, this.m4);
    }
    M.instanceMatrix.needsUpdate = true;
  }
}
