/**
 * Lo que se ve de los retos y los premios de la cuerda (src/modes/bars/rope-trials.ts): el enjambre de abejas que baja por el
 * cable hacia tu cara, la piedra que cae de lo alto, las estelas de la ráfaga, el trozo de cable deshilachado y las frutas junto
 * al cable. Todo hecho al empezar (las abejas, del catálogo; la piedra y las frutas, de los kits) y reutilizado: en plena ronda
 * no se crea nada.
 *
 * Lo que llega (abejas, piedra, viento) va en el mundo, respecto a tu cabeza; lo que está quieto en la cuerda (las frutas, el
 * cable roto), en el grupo del recorrido (`track`), que baja contigo al subir.
 */
import { AdditiveBlending, AnimationMixer, AssetManager, BoxGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3, type SkinnedMesh } from '@iwsdk/core';
import { kitParts } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import { TRIAL, type Trial } from './rope-trials.js';
import type { RopeCourse } from './rope.js';

const BEES = 3, STREAKS = 26, FRUIT_KINDS = ['Apple', 'Orange', 'Cherries', 'Strawberry'] as const, FRUIT_POOL = 2;
const EYE_GONE = 0.12, EYE_FADE = 0.45; // (lo que se coge con la cabeza se encoge al llegar a los ojos: docs/REGLAS.md)

interface Bee {
  g: Group;
  mixer: AnimationMixer | null;
}

/** Donde está tu cabeza y hacia dónde: arriba (el cielo), hacia lo alto de tu cabeza (`fwd`) y a un lado (`right`), en el mundo. */
export interface LookFrame {
  head: Vector3;
  up: Vector3;
  fwd: Vector3;
  right: Vector3;
}

export class RopeTrialsLook {
  readonly root = new Group();
  private built = false;
  private bees: Bee[] = [];
  private rock: Group | null = null;
  private streaks: InstancedMesh | null = null;
  private streakMat: MeshBasicMaterial | null = null;
  private fruits = new Map<string, Group[]>();
  private frayed: Group | null = null;
  /** Qué fruta usa cada una de la ronda (por su número). */
  private fruitOf = new Map<number, Group>();
  private readonly seen = new Set<Group>();
  private readonly v = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly sc = new Vector3();
  /** Adónde apunta la piedra que cae: donde estaba tu cabeza al empezar a caer (si te apartas, pasa a tu lado). */
  private readonly aim = new Vector3();
  private aimId = -1;

  constructor(parent: Object3D, private readonly track: Object3D) {
    parent.add(this.root);
  }

  private build(): boolean {
    if (this.built) return true;
    const nat = kitParts('nature'), food = kitParts('food');
    if (!nat || !food || !AssetManager.getGLTF('foe-bee', { shared: true })) return false;
    // las abejas del enjambre (las de los bichos de Barras)
    for (let i = 0; i < BEES; i++) {
      const gltf = AssetManager.getGLTF('foe-bee')!, model = gltf.scene, g = new Group();
      model.scale.setScalar(0.17); // (algo más pequeñas que los bichos de Barras: llegan hasta tu cara)
      model.rotation.y = Math.PI;
      model.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isMesh) return;
        if (m.isSkinnedMesh) m.frustumCulled = false;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.side = DoubleSide;
      });
      const clip = gltf.animations.find((c) => c.name === 'Flying');
      let mixer: AnimationMixer | null = null;
      if (clip) {
        mixer = new AnimationMixer(model);
        const act = mixer.clipAction(clip);
        act.setLoop(LoopRepeat, Infinity);
        act.timeScale = 3 * clip.duration;
        act.play();
      }
      g.add(model);
      g.visible = false;
      this.root.add(g);
      this.bees.push({ g, mixer });
    }
    // la piedra que cae (una de las del bosque, pequeña)
    this.rock = this.kitGroup(nat.Rock_Medium_2 ?? nat.Rock_Medium_1, 0.14);
    this.rock.visible = false;
    this.root.add(this.rock);
    // las estelas de la ráfaga
    this.streakMat = new MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.streaks = new InstancedMesh(new BoxGeometry(0.02, 0.02, 1), this.streakMat, STREAKS);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.streaks.userData.noInk = true;
    this.root.add(this.streaks);
    warmKeep(new InstancedMesh(this.streaks.geometry, this.streakMat, 1));
    // las frutas (unas pocas de cada clase, reutilizadas)
    for (const n of FRUIT_KINDS) {
      const list: Group[] = [];
      for (let i = 0; i < FRUIT_POOL; i++) {
        const g = this.kitGroup(food[n], 1.6);
        g.visible = false;
        this.track.add(g);
        list.push(g);
      }
      this.fruits.set(n, list);
    }
    // el cable deshilachado: hebras sueltas, naranjas, y un aro rojo
    const fr = new Group(), red = new MeshStandardMaterial({ color: 0xd8462a, roughness: 0.8 }), hemp = new MeshStandardMaterial({ color: 0xe0a05a, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const t = new Mesh(new CylinderGeometry(0.004, 0.004, 0.16, 4), hemp);
      t.position.set(0, 0, -((i / 8) - 0.5) * TRIAL.frayedLen);
      t.rotation.set(0.6 + (i % 3) * 0.5, 0, (i % 2 ? 1 : -1) * (0.7 + (i % 4) * 0.3));
      fr.add(t);
    }
    for (const z of [0.5, -0.5]) {
      const ring = new Mesh(new CylinderGeometry(0.03, 0.03, 0.05, 10), red);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = z * TRIAL.frayedLen;
      fr.add(ring);
    }
    fr.visible = false;
    this.track.add(fr);
    this.frayed = fr;
    warmKeep(fr.clone());
    this.built = true;
    return true;
  }

  private kitGroup(parts: { geo: import('@iwsdk/core').BufferGeometry; mat: import('@iwsdk/core').Material }[] | undefined, s: number): Group {
    const g = new Group();
    for (const p of parts ?? []) g.add(new Mesh(p.geo, p.mat));
    g.scale.setScalar(s);
    return g;
  }

  /** Al empezar la ronda: nada a la vista. */
  reset(): void {
    this.fruitOf.clear();
    for (const list of this.fruits.values()) for (const g of list) g.visible = false;
    for (const B of this.bees) B.g.visible = false;
    if (this.rock) this.rock.visible = false;
    if (this.streaks) this.streaks.visible = false;
    if (this.frayed) this.frayed.visible = false;
  }

  /**
   * Cada fotograma: lo que se ve de los retos vivos. F: tu cabeza y sus ejes; C: el recorrido; lanes, laneY: los cables (a un
   * lado y sobre las paralelas); top: dónde queda tu cabeza arriba, en el marco de la cuerda (las frutas, ahí); t: el reloj.
   */
  update(dt: number, show: boolean, live: readonly Trial[], F: LookFrame, C: RopeCourse | null, lanes: number[], laneY: number, top: Vector3, t: number): void {
    if (!show || !C || !this.build()) {
      this.root.visible = false;
      this.reset();
      return;
    }
    this.root.visible = true;
    let bees = false, rock = false, gust = false, frayed = false;
    for (const B of this.bees) B.mixer?.update(dt);
    const seen = this.seen;
    seen.clear();
    for (const T of live) {
      if (T.kind === 'swarm') bees = this.swarm(T, F, t) || bees;
      else if (T.kind === 'rock') rock = this.fall(T, F, t) || rock;
      else if (T.kind === 'gust') gust = this.gust(T, F, t) || gust;
      else if (T.kind === 'frayed') frayed = this.fray(T, C, lanes, laneY) || frayed;
      else if (T.kind === 'fruit') {
        const g = this.fruit(T, C, top, F, t);
        if (g) seen.add(g);
      }
    }
    if (!bees) for (const B of this.bees) B.g.visible = false;
    if (this.rock) this.rock.visible = rock;
    if (this.streaks) this.streaks.visible = gust;
    if (this.frayed) this.frayed.visible = frayed;
    for (const [id, g] of this.fruitOf)
      if (!seen.has(g)) {
        g.visible = false;
        this.fruitOf.delete(id);
      }
  }

  // las abejas: bajan por el cable desde delante y arriba hasta tu cara (en su momento) y siguen hacia tus pies
  private swarm(T: Trial, F: LookFrame, t: number): boolean {
    const come = TRIAL.come.swarm, k = T.t / come;
    for (let i = 0; i < this.bees.length; i++) {
      const B = this.bees[i], off = (i - 1) * 0.28, wob = Math.sin(t * 7 + i * 2) * 0.05;
      if (T.st === 'done' && T.t > come + 1.2) {
        B.g.visible = false;
        continue;
      }
      const p = this.v.copy(F.head).addScaledVector(F.right, off + wob);
      if (k <= 1) {
        const e = k * k * (3 - 2 * k);
        p.addScaledVector(F.fwd, 9 * (1 - e)).addScaledVector(F.up, 0.55 + 2.6 * (1 - e) + i * 0.06);
      } else {
        const e = Math.min(1, (T.t - come) / 1.2);
        p.addScaledVector(F.fwd, -5 * e).addScaledVector(F.up, 0.55 + 1.4 * e + i * 0.06);
      }
      B.g.visible = true;
      this.a.copy(B.g.position);
      B.g.position.copy(p);
      // (mirando hacia donde van)
      this.b.subVectors(p, this.a);
      if (this.b.lengthSq() > 1e-8) B.g.lookAt(this.b.add(p));
    }
    return true;
  }

  // la piedra: cae desde muy alto, cada vez más deprisa, hacia donde estaba tu cara al empezar; si te apartaste, sigue cayendo
  // a tu lado; si te da, revienta (lo pone la partida: chispas) y no se ve más. Al llegar a los ojos se encoge, como las chispas
  private fall(T: Trial, F: LookFrame, t: number): boolean {
    const come = TRIAL.come.rock, R = this.rock!;
    if (T.id !== this.aimId) {
      this.aimId = T.id;
      this.aim.copy(F.head);
    }
    if (T.t > come + 0.8 || (T.st === 'done' && T.ok === false)) return false;
    const k = Math.min(1, T.t / come), drop = 12 * (1 - k * k);
    R.position.copy(this.aim).addScaledVector(F.up, 0.05 + drop - (T.t > come ? (T.t - come) * 7 : 0));
    R.rotation.set(t * 3, t * 2, 0);
    const d = R.position.distanceTo(F.head), e = d < EYE_GONE ? 0 : d < EYE_FADE ? (d - EYE_GONE) / (EYE_FADE - EYE_GONE) : 1;
    R.scale.setScalar(0.14 * e);
    return e > 0;
  }

  // la ráfaga: estelas de viento que cruzan el cielo de lado a lado, sobre ti (más vivas mientras sopla)
  private gust(T: Trial, F: LookFrame, t: number): boolean {
    const come = TRIAL.come.gust, end = come + TRIAL.judge.gust, M = this.streaks!;
    if (T.t > end + 0.4) return false;
    const k = T.t < come ? T.t / come : T.t < end ? 1 : Math.max(0, 1 - (T.t - end) / 0.4);
    this.streakMat!.opacity = 0.55 * k;
    for (let i = 0; i < STREAKS; i++) {
      const h = 1.5 + ((i * 37) % 23) * 0.22, along = (((i * 53) % 29) / 29 - 0.5) * 8, x = ((t * (9 + (i % 5)) + i * 3.1) % 16) - 8;
      this.v.copy(F.head).addScaledVector(F.up, h).addScaledVector(F.fwd, along).addScaledVector(F.right, x);
      this.q.setFromUnitVectors(this.a.set(0, 0, 1), F.right);
      this.m4.compose(this.v, this.q, this.sc.set(1, 1, 1.4 + (i % 4) * 0.5));
      M.setMatrixAt(i, this.m4);
    }
    M.instanceMatrix.needsUpdate = true;
    return true;
  }

  // el cable roto: en su sitio de la cuerda, sobre los cables
  private fray(T: Trial, C: RopeCourse, lanes: number[], laneY: number): boolean {
    const g = this.frayed!, th = C.pitch(T.s);
    g.position.set(lanes[lanes.length - 1], C.y(T.s) + laneY, -C.h(T.s));
    g.rotation.set(th, 0, 0);
    return true;
  }

  // la fruta: junto al cable, donde queda tu cabeza arriba al pasar por ella; gira despacio y, al llegar a tus ojos, se encoge
  private fruit(T: Trial, C: RopeCourse, top: Vector3, F: LookFrame, t: number): Group | null {
    let g = this.fruitOf.get(T.id);
    if (!g) {
      const list = this.fruits.get(FRUIT_KINDS[T.id % FRUIT_KINDS.length])!;
      for (const x of list) {
        let used = false;
        for (const y of this.fruitOf.values()) if (y === x) used = true;
        if (!used) {
          g = x;
          break;
        }
      }
      if (!g) return null;
      this.fruitOf.set(T.id, g);
    }
    g.position.set(top.x, C.y(T.s) + top.y, -C.h(T.s) + top.z);
    g.rotation.y = t * 1.2;
    g.updateMatrixWorld();
    const d = g.getWorldPosition(this.v).distanceTo(F.head), k = d < EYE_GONE ? 0 : d < EYE_FADE ? (d - EYE_GONE) / (EYE_FADE - EYE_GONE) : 1;
    g.scale.setScalar(1.6 * k);
    g.visible = k > 0;
    return g;
  }
}
