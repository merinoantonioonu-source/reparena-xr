/**
 * Lo que se ve del combate en el parapente (la lógica, `sky-fight.ts`): el cielo de la tarde con su sol y, muy abajo, el mar de
 * nubes; las islas flotando por debajo de ti; los voladores del catálogo con sus animaciones (vuelan, se echan atrás al atacar,
 * se quejan al recibir y caen derribados); sus bolas de fuego (las de los jefes: src/style/missile-fx.ts); tus rayos (los de
 * Combate: src/combat/bolt.ts) y la onda de la carga.
 *
 * Todo lo del cielo va en un grupo (`frame`) girado y desplazado como el mapa del parapente (MapSystem): lo de delante, hacia tus
 * pies, e inclinado hacia tu vista lo que diga «Parapente: inclinación del mapa» (`MAPPILOT.pitch`). Las bolas y los rayos,
 * en la sala (ahí viven sus partículas). Hecho al empezar y reutilizado: en plena pelea no se crea nada.
 */
import { AdditiveBlending, AnimationMixer, AssetManager, BackSide, Color, Group, InstancedMesh, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, ShaderMaterial, SphereGeometry, Vector3, type AnimationAction, type PerspectiveCamera, type Scene, type SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { Bolts } from '../../combat/bolt.js';
import { FOE_DEF } from '../../combat/foes.js';
import { boltColor, POW_COL } from '../../combat/fx.js';
import { HOOKS, MAPPILOT, MAPVIEW } from '../../core/state.js';
import { on as isOn } from '../../core/values.js';
import { kitParts } from '../../env/scenery.js';
import { Missile, type MissileKind } from '../../style/missile-fx.js';
import { warmKeep } from '../../style/warm.js';
import { ISLE_BELLY, ISLE_SLAB, ISLE_SLAB_Y, SKY, SKY_KIND, SkyFight, SkyIsles, type SkyEv, type SkyIn, type SkyKind } from './sky-fight.js';

/** El cielo: su radio (m; dentro del alcance de la cámara, por eso se alarga mientras se pelea), los colores de la tarde (arriba,
 * el horizonte y la calima de lo lejano) y hacia dónde está el sol (en el cielo, normalizado al usarlo). */
const SKY_R = 1500, CAM_FAR = 2200;
const ZENITH = new Color(0x4d86d8), HORIZON = new Color(0xf7dcb8), HAZE = new Color(0xdcd6d8), SUN = new Vector3(0.55, 0.22, -0.8).normalize();
/** La niebla de lo lejano (las islas se pierden entre la calima a unos 400 m). */
const FOG = 0.0028;
/** Lo que se ladea el horizonte al virar (rad, × el ladeo; como sobre el mapa) y cada cuánto se miran las islas (s). */
const ROLL = 0.16, ISLE_T = 0.5;
/** Cuántos de cada volador se preparan (el jefe, uno). */
const POOL: Record<SkyKind, number> = { bee: 3, bat: 3, cthulhu: 3, dragon: 3, boss: 1 };
/** Lo que escupe cada uno (el pulpo, plasma; los dragones, fuego) y el tamaño de su bola (m). */
const BALL: Partial<Record<SkyKind, { kind: MissileKind; size: number }>> = { cthulhu: { kind: 'plasma', size: 0.35 }, dragon: { kind: 'fire', size: 0.4 }, boss: { kind: 'fire', size: 0.65 } };
/** Los árboles que puede llevar una isla (los de `SkyIsles`) y cuántos caben de cada uno. */
const TREES = ['CommonTree_3', 'CommonTree_4', 'Pine_4'], TREE_CAP = 24;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// el cielo de la tarde: azul arriba, cálido en el horizonte, el sol con su resplandor y unas nubes altas muy tenues; por debajo
// del horizonte, el mar de nubes (como el del risco: src/modes/trek/cloud-sea.ts), con bruma hacia el horizonte
const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uZen, uHor, uHaze, uSun;
varying vec3 vDir;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.48; } return v / 0.9927; }
void main() {
  vec3 d = normalize(vDir); float h = d.y, s = max(dot(d, uSun), 0.0);
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
    // nubes altas, tenues (en un plano alto: grandes arriba, apretadas hacia el horizonte)
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uT * 0.004, 0.0);
    float c = smoothstep(0.55, 0.85, fbm(uv)) * smoothstep(0.0, 0.25, h);
    col = mix(col, vec3(1.0, 0.97, 0.94), c * 0.45);
  } else {
    float k = 1.0 / max(-h + 0.035, 0.035);
    vec2 uv = d.xz * k * 0.55 + vec2(uT * 0.006, uT * 0.0025);
    float n = fbm(uv), n2 = fbm(uv + vec2(0.11, 0.07));
    float top = smoothstep(0.32, 0.78, n), side = clamp((n - n2) * 4.0 + 0.5, 0.0, 1.0);
    col = mix(vec3(0.6, 0.6, 0.72), vec3(1.0, 0.97, 0.93), top * (0.55 + 0.45 * side));
    col = mix(col, uHaze, smoothstep(-0.25, 0.0, h) * 0.8);
  }
  // el sol: su disco y su resplandor (también sobre las nubes de abajo, más suave)
  col += vec3(1.0, 0.85, 0.6) * (pow(s, 12.0) * 0.35 + pow(s, 200.0) * 0.8) * (h >= 0.0 ? 1.0 : 0.4);
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9993, 0.9997, s));
  gl_FragColor = vec4(col, 1.0);
}`;

/** Un volador del catálogo, a su tamaño, con su vuelo de siempre y sus gestos (atacar, recibir y caer). */
interface Critter {
  kind: SkyKind;
  g: Group;
  mixer: AnimationMixer;
  fly: AnimationAction | null;
  bite: AnimationAction | null;
  hit: AnimationAction | null;
  die: AnimationAction | null;
  /** El volador al que está puesto (su id; 0, libre) y lo que lleva girado al caer. */
  id: number;
  spin: number;
}

export class SkyScene {
  readonly fight: SkyFight;
  readonly isles: SkyIsles;
  /** En la sala: lo que se ve en ella (las bolas, los rayos); `frame`, el cielo. */
  readonly root = new Group();
  readonly frame = new Group();
  private built = false;
  private sky: Mesh | null = null;
  private skyMat: ShaderMaterial | null = null;
  private readonly batches = new Map<string, InstancedMesh[]>();
  private readonly critters: Critter[] = [];
  private readonly missiles: Missile[] = [];
  private readonly wasOn: boolean[] = [];
  private bolts: Bolts | null = null;
  private ring: Mesh | null = null;
  private ringT = -1;
  private isleT = 0;
  private shown = false;
  private fogWas: { color: number; density: number } | null = null;
  private farWas = 0;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly qInv = new Quaternion();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly sc = new Vector3();
  private readonly ax = new Vector3();
  private readonly gaze = new Vector3();
  private readonly from = new Vector3();
  private readonly AX_Y = new Vector3(0, 1, 0);
  private readonly AX_Z = new Vector3(0, 0, 1);
  private readonly AX_X = new Vector3(1, 0, 0);

  /** `scene`: la escena (su niebla y su cámara); `onEv`: lo que la partida hace con cada suceso (vibrar, puntos, avisos). */
  constructor(parent: Object3D, private readonly scene: () => Scene | null, private readonly camera: () => PerspectiveCamera | null, private readonly onEv: (E: SkyEv) => void, rnd: () => number = Math.random) {
    this.fight = new SkyFight(rnd);
    this.isles = new SkyIsles(rnd);
    parent.add(this.root);
    this.root.add(this.frame);
    this.root.visible = false;
  }

  // lo que falte (en cuanto los kits y los voladores estén cargados)
  private build(): boolean {
    if (this.built) return true;
    const isl = kitParts('island'), nat = kitParts('nature');
    if (!isl || !nat) return false;
    for (const k of Object.keys(POOL) as SkyKind[]) if (!AssetManager.getGLTF(FOE_DEF[k === 'boss' ? 'dragon' : k].asset, { shared: true })) return false;
    // el cielo
    this.skyMat = new ShaderMaterial({ uniforms: { uT: { value: 0 }, uZen: { value: ZENITH }, uHor: { value: HORIZON }, uHaze: { value: HAZE }, uSun: { value: SUN } }, vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthWrite: false, fog: false, toneMapped: false });
    this.sky = new Mesh(new SphereGeometry(SKY_R, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.userData.noInk = true;
    this.frame.add(this.sky);
    warmKeep(new Mesh(new SphereGeometry(1, 8, 4), this.skyMat));
    // las islas: una pieza por modelo, con sus instancias
    type Kit = NonNullable<ReturnType<typeof kitParts>>;
    const models: [string, Kit, number][] = [[ISLE_SLAB, isl, this.isles.list.length], [ISLE_BELLY, isl, this.isles.list.length], ...TREES.map((n): [string, Kit, number] => [n, nat, TREE_CAP])];
    for (const [n, kit, cap] of models) {
      const parts = kit[n];
      if (!parts) continue;
      this.batches.set(
        n,
        parts.map((p) => {
          const im = new InstancedMesh(p.geo, p.mat, cap);
          im.count = 0;
          im.frustumCulled = false;
          this.frame.add(im);
          warmKeep(new InstancedMesh(p.geo, p.mat, 1));
          return im;
        }),
      );
    }
    // los voladores
    for (const k of Object.keys(POOL) as SkyKind[]) for (let i = 0; i < POOL[k]; i++) this.critters.push(this.critter(k));
    // sus bolas (una por cada bola del combate), tus rayos y la onda
    for (let i = 0; i < this.fight.shots.length; i++) {
      const M = new Missile({ kind: 'fire', size: 0.4 });
      this.root.add(M.group);
      this.missiles.push(M);
      this.wasOn.push(false);
    }
    this.bolts = new Bolts({ sparks: (p, n, hex) => HOOKS.sparks(p, n, hex), zap: (p) => SND.zap(p) }, 6);
    this.root.add(this.bolts.group);
    this.ring = new Mesh(new SphereGeometry(1, 32, 16), new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: BackSide }));
    this.ring.userData.noInk = true;
    this.ring.visible = false;
    this.frame.add(this.ring);
    this.built = true;
    this.placeIsles(true);
    return true;
  }

  // un volador del catálogo (el jefe, el dragón en grande)
  private critter(kind: SkyKind): Critter {
    const d = FOE_DEF[kind === 'boss' ? 'dragon' : kind], gltf = AssetManager.getGLTF(d.asset)!, model = gltf.scene, g = new Group();
    const nat = d.h / d.k, S = SKY_KIND[kind].size;
    model.scale.setScalar(S / nat);
    model.position.y = -S * d.ctr;
    model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) m.frustumCulled = false;
    });
    g.add(model);
    g.visible = false;
    this.frame.add(g);
    const mixer = new AnimationMixer(model), clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const act = (n: string, loop: boolean): AnimationAction | null => {
      const c = clip(n);
      if (!c) return null;
      const A = mixer.clipAction(c);
      if (loop) {
        A.setLoop(LoopRepeat, Infinity);
        A.play();
      } else {
        A.setLoop(LoopOnce, 1);
        A.clampWhenFinished = true;
      }
      return A;
    };
    return { kind, g, mixer, fly: act(d.clips.walk, true), bite: act(d.clips.attack, false), hit: act(d.clips.hit, false), die: act(d.clips.death, false), id: 0, spin: 0 };
  }

  // un gesto de una vez (atacar, recibir, caer), saliendo del vuelo
  private gesture(C: Critter, A: AnimationAction | null): void {
    if (!A) return;
    A.reset().play();
    if (C.fly) A.crossFadeFrom(C.fly, 0.12, false);
  }

  /** Otra ronda: desde el principio (el cielo, alrededor). */
  reset(): void {
    this.fight.reset(0);
    this.isles.reset(0, 0);
    for (const C of this.critters) {
      C.id = 0;
      C.g.visible = false;
    }
    for (const M of this.missiles) M.stop();
    this.wasOn.fill(false);
    this.bolts?.clear();
    this.ringT = -1;
    if (this.built) this.placeIsles(true);
  }

  /** Empieza una oleada (sus voladores; `boss`, la del jefe). */
  startWave(i: number, need: number, boss: boolean): void {
    this.fight.startWave(i, need, boss);
  }

  // las islas que han cambiado de sitio (todas, al empezar), en sus instancias
  private placeIsles(all: boolean): void {
    if (!all && !this.isles.moved.length) return;
    const L = this.isles.list, put = (n: string, i: number, m: Matrix4): void => {
      for (const im of this.batches.get(n) ?? []) im.setMatrixAt(i, m);
    };
    for (let i = 0; i < L.length; i++) {
      if (!all && !this.isles.moved.includes(i)) continue;
      const I = L[i];
      this.q.setFromAxisAngle(this.AX_Y, I.ry);
      put(ISLE_SLAB, i, this.m4.compose(this.v.set(I.x, I.y, I.z), this.q, this.sc.set(I.s, I.s * ISLE_SLAB_Y, I.s)));
      // (la panza: la roca del revés, colgando de la losa)
      this.q2.copy(this.q).multiply(this.qx(Math.PI));
      put(ISLE_BELLY, i, this.m4.compose(this.v.set(I.x, I.y + 0.1 * I.s, I.z), this.q2, this.sc.set(I.s * 0.75, I.s * 0.8, I.s * 0.75)));
    }
    for (const n of [ISLE_SLAB, ISLE_BELLY]) for (const im of this.batches.get(n) ?? []) {
      im.count = L.length;
      im.instanceMatrix.needsUpdate = true;
    }
    // los árboles: los de todas las islas (pocos), en sus instancias
    const cnt: Record<string, number> = {};
    for (const I of L)
      for (const T of I.trees) {
        const i = cnt[T.n] ?? 0;
        if (i >= TREE_CAP) continue;
        cnt[T.n] = i + 1;
        put(T.n, i, this.m4.compose(this.v.set(T.x, T.y, T.z), this.q.setFromAxisAngle(this.AX_Y, T.ry), this.sc.setScalar(T.sc)));
      }
    for (const n of TREES)
      for (const im of this.batches.get(n) ?? []) {
        im.count = cnt[n] ?? 0;
        im.instanceMatrix.needsUpdate = true;
      }
  }
  private readonly qX = new Quaternion();
  private qx(a: number): Quaternion {
    return this.qX.setFromAxisAngle(this.AX_X, a);
  }

  /** Lo del cielo (x, y, z en él) en la sala. */
  toRoom(x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyMatrix4(this.frame.matrixWorld);
  }

  /**
   * Cada fotograma: `show`, con el parapente en el aire; `paused`, todo quieto; I, lo que manda el piloto; `eye`, tus ojos y
   * `eyeQ`, hacia dónde miran (en la sala).
   */
  step(dt: number, show: boolean, paused: boolean, I: SkyIn, eye: Vector3, eyeQ: Quaternion): void {
    if (show !== this.shown) this.setShown(show);
    if (!show || !this.build()) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const F = this.fight;
    if (!paused) {
      F.step(dt, I);
      for (const E of F.ev) this.handle(E);
      this.isleT -= dt;
      if (this.isleT <= 0) {
        this.isleT = ISLE_T;
        this.isles.step(F.x, F.z, F.heading);
        this.placeIsles(false);
      }
      this.skyMat!.uniforms.uT.value += dt;
    }
    this.place();
    // la mirada, en el cielo (para apuntar)
    this.gaze.set(0, 0, -1).applyQuaternion(eyeQ).applyQuaternion(this.qInv);
    if (paused) return;
    this.drawFoes(dt, eye);
    this.drawShots(dt, eye, eyeQ);
    this.bolts!.update(dt, eye);
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.45, R = this.ring!;
      R.visible = k < 1;
      R.position.set(F.x, F.y, F.z);
      R.scale.setScalar(1 + (SKY.blastR - 1) * k);
      (R.material as MeshBasicMaterial).opacity = 0.35 * (1 - k);
      if (k >= 1) this.ringT = -1;
    }
    // el viento y el ladeo, para lo demás del parapente (la vela)
    MAPPILOT.bank = F.bank;
  }

  // el cielo, girado y desplazado como el mapa del parapente: donde vuelas, en tu cabeza; lo de delante, hacia tus pies
  private place(): void {
    const F = this.fight, R = this.frame;
    R.quaternion.setFromAxisAngle(this.AX_Z, isOn('flyMapBank') ? F.bank * ROLL : 0).multiply(this.q.setFromAxisAngle(this.AX_Y, -F.heading));
    R.quaternion.premultiply(this.q.setFromAxisAngle(this.AX_Y, MAPPILOT.yaw));
    if (MAPPILOT.pitch) R.quaternion.premultiply(this.q.setFromAxisAngle(this.ax.set(Math.cos(MAPPILOT.yaw), 0, -Math.sin(MAPPILOT.yaw)), MAPPILOT.pitch));
    this.v.set(F.x, F.y, F.z).applyQuaternion(R.quaternion);
    R.position.set(MAPPILOT.x - this.v.x, MAPPILOT.y - this.v.y, MAPPILOT.z - this.v.z);
    R.updateMatrixWorld(true);
    this.qInv.copy(R.quaternion).invert();
    this.sky!.position.set(F.x, F.y, F.z);
  }

  // los voladores, cada uno con su modelo (puesto al salir, libre al perderse)
  private drawFoes(dt: number, eye: Vector3): void {
    const F = this.fight;
    for (const C of this.critters) if (C.id && !F.foes.some((f) => f.id === C.id && f.st !== 'off')) {
      C.id = 0;
      C.g.visible = false;
    }
    for (const f of F.foes) {
      if (f.st === 'off') continue;
      let C = this.critters.find((c) => c.id === f.id);
      if (!C) {
        C = this.critters.find((c) => !c.id && c.kind === f.kind);
        if (!C) continue;
        C.id = f.id;
        C.spin = 0;
        C.fly?.reset().play();
      }
      C.g.visible = true;
      C.mixer.update(dt);
      C.g.position.set(f.x, f.y, f.z);
      // de cara a ti (lanzado, hacia donde va); derribado, dando vueltas
      const lx = f.st === 'lunge' ? f.vx : F.x - f.x, lz = f.st === 'lunge' ? f.vz : F.z - f.z;
      C.g.rotation.set(0, Math.atan2(lx, lz), 0);
      if (f.st === 'fall') {
        C.spin += dt * 5;
        C.g.rotation.z = C.spin;
      }
    }
    void eye;
  }

  // las bolas de fuego (en la sala): vuelan, y al acabar estallan en ti o siguen de largo
  private drawShots(dt: number, eye: Vector3, eyeQ: Quaternion): void {
    const F = this.fight;
    for (let i = 0; i < F.shots.length; i++) {
      const S = F.shots[i], M = this.missiles[i];
      M.update(dt);
      if (S.on) {
        if (!this.wasOn[i]) {
          const from = F.foes.find((f) => f.id === S.from), B = BALL[from?.kind ?? 'dragon'] ?? BALL.dragon!;
          M.setLook(B);
        }
        M.fly(this.toRoom(S.x, S.y, S.z, this.v), dt, eye);
      } else if (this.wasOn[i]) {
        // (te ha dado si acabó pegada a ti: estalla delante, a más de un metro; si no, sigue de largo)
        if (Math.hypot(S.x - F.x, S.y - F.y, S.z - F.z) < SKY.hitR * 2) M.hit(this.w.set(0, 0, -1.3).applyQuaternion(eyeQ).add(eye), S.big);
        else M.coast(0.4);
      }
      this.wasOn[i] = S.on;
    }
  }

  // lo que se ve y se oye de cada suceso (lo demás, la partida: `onEv`)
  private handle(E: SkyEv): void {
    const F = this.fight;
    if (E.k === 'wind' || E.k === 'boss') {
      // (la voz, cerca de ti hacia donde está: a 20-30 m apenas se oiría)
      this.toRoom(E.x, E.y, E.z, this.v);
      const C = this.critters.find((c) => c.id === E.id);
      if (C && E.k === 'wind') this.gesture(C, C.bite);
      if (E.kind) SND.roar(this.near(this.v), E.kind === 'boss' ? 0.8 : 1, SKY_KIND[E.kind].voice);
    } else if (E.k === 'fire' || E.k === 'lunge') SND.whoosh(this.near(this.toRoom(E.x, E.y, E.z, this.v)), E.k === 'fire' ? 'throw' : 'flyer');
    else if (E.k === 'hit' || E.k === 'kill') {
      const C = this.critters.find((c) => c.id === E.id), at = this.toRoom(E.x, E.y, E.z, this.v);
      if (C) this.gesture(C, E.k === 'kill' ? C.die : C.hit);
      HOOKS.sparks(at, E.k === 'kill' ? 26 : 10, E.k === 'kill' ? 0xffd166 : 0x9fe8ff);
      SND.boltHit(this.near(at), E.k === 'kill' ? 2 : 0);
    } else if (E.k === 'blast') {
      this.ringT = 0;
      (this.ring!.material as MeshBasicMaterial).color.setHex(POW_COL[Math.min(4, Math.max(2, E.big ? 4 : 2)) - 1]);
      SND.shock(this.near(this.toRoom(F.x, F.y, F.z, this.v)));
    }
    this.onEv(E);
  }

  // un sitio para oír algo lejano: a 4 m de tus ojos, hacia allí
  private readonly nearV = new Vector3();
  private near(at: Vector3): Vector3 {
    const e = this.toRoom(this.fight.x, this.fight.y, this.fight.z, this.nearV);
    const d = this.w.copy(at).sub(e), m = d.length();
    return m > 4 ? e.addScaledVector(d, 4 / m) : at;
  }

  /** Un disparo hacia donde miras (`dmg`, su daño; el explosivo, 2): el rayo sale de delante de tus ojos. */
  shoot(dmg: number, eye: Vector3, perfect: boolean): void {
    if (!this.built || !this.shown) return;
    const E = this.fight.shoot(this.gaze.x, this.gaze.y, this.gaze.z, dmg);
    this.from.set(0, 0, 0).add(this.w.copy(this.gaze).applyQuaternion(this.frame.quaternion).multiplyScalar(0.7)).add(eye);
    this.from.y -= 0.12;
    const to = this.toRoom(E.x, E.y, E.z, this.v);
    this.bolts!.start(this.from, to, dmg > 1 ? 2 : perfect ? 1 : 0, boltColor(perfect, dmg > 1 ? 2 : 1));
    SND.bolt(this.from, dmg > 1 ? 2 : 0);
    // (lo que pasa con el disparo: le da, lo derriba, la oleada acaba)
    for (const ev of this.fight.ev) if (ev !== E && (ev.k === 'hit' || ev.k === 'kill' || ev.k === 'clear')) this.handle(ev);
  }

  /** La onda de la carga ×p, alrededor de ti. */
  blast(p: number): void {
    if (!this.built || !this.shown) return;
    const n0 = this.fight.ev.length;
    this.fight.blast(p);
    for (let i = n0; i < this.fight.ev.length; i++) this.handle(this.fight.ev[i]);
    (this.ring!.material as MeshBasicMaterial).color.setHex(POW_COL[Math.min(4, p) - 1]);
  }

  // el cielo a la vista o no: la niebla (calima), el alcance de la cámara y la vista sin arena (MAPVIEW), y al revés
  private setShown(on: boolean): void {
    this.shown = on;
    const sc = this.scene(), fog = (sc as unknown as { fog: { color: Color; density: number } | null } | null)?.fog ?? null, cam = this.camera();
    if (on) {
      MAPVIEW.on = true;
      MAPVIEW.flat = true;
      MAPVIEW.alt = 0;
      MAPVIEW.haze[0] = HAZE.r;
      MAPVIEW.haze[1] = HAZE.g;
      MAPVIEW.haze[2] = HAZE.b;
      if (fog) {
        this.fogWas = { color: fog.color.getHex(), density: fog.density };
        fog.color.copy(HAZE);
        fog.density = FOG;
      }
      if (cam) {
        this.farWas = cam.far;
        if (cam.far < CAM_FAR) {
          cam.far = CAM_FAR;
          cam.updateProjectionMatrix();
        }
      }
      return;
    }
    MAPVIEW.on = false;
    MAPVIEW.flat = false;
    if (fog && this.fogWas) {
      fog.color.setHex(this.fogWas.color);
      fog.density = this.fogWas.density;
    }
    this.fogWas = null;
    if (cam && this.farWas) {
      cam.far = this.farWas;
      cam.updateProjectionMatrix();
    }
    this.farWas = 0;
    for (const M of this.missiles) M.stop();
    this.bolts?.clear();
  }

  /** Al acabar: fuera el cielo (y la niebla y la cámara, como estaban). */
  clear(): void {
    if (this.shown) this.setShown(false);
    this.root.visible = false;
  }
}
