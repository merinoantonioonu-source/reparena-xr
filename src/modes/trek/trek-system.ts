/**
 * La Travesía de plataformas en la partida: pinta el recorrido que decide la lógica pura (runner.ts, course.ts, moves.ts) y
 * aplica sus sucesos (avisos, sonidos, puntos, la racha y el turbo). Lo que se ve: una pasarela de tablas (el muelle del
 * Pirate Kit) que viene hacia ti por el bosque, con sus retos (vigas bajas, troncos, barriles a un lado, huecos) y el
 * cofre al final de cada tramo; a los lados, árboles, rocas y hierba del Stylized Nature, y debajo, el césped, que corre y
 * gira con el mundo. Detrás, el fondo realista del bosque.
 *
 * Todo con instancias (una pieza por modelo y material): cada fotograma se recolocan las instancias de lo que está a la
 * vista (de 20 m detrás a 88 m delante), sin crear objetos. La partida (GameSystem) lo engancha como Arcos: `begin`,
 * `startWave`, `waveLeft`, `rep`, `hud`, `end` y `clear`.
 */
import { CanvasTexture, createSystem, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import type { FogExp2, Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { dv, store, waveReps, nWaves, rankIdx } from '../../core/settings.js';
import { GAME, HOOKS, LITE } from '../../core/state.js';
import { num, settings } from '../../core/values.js';
import { haptic } from '../../input/hand-system.js';
import { head } from '../../input/hand-model.js';
import { groundTexture, kitParts, type Part } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import { TREK_BIOMES, TREK_CH } from './path.js';
import { DOCK_LEN, GROUND_Y, decoPuts, floorPuts, piecePuts, type Kit, type Put } from './plat/pieces.js';
import { Runner, tramoLen } from './plat/runner.js';
import { PLAT_SEE, type Piece, type PlatEnv, type PlatEv, type PlatPos } from './plat/types.js';

/** Lo que se pinta por detrás de ti (m) y lo que más se ve por delante (m, entre la niebla). */
const BACK = 20, AHEAD = PLAT_SEE + 8;
/** Cuántas instancias caben de cada modelo: el muelle (unos 45 a la vista), las piezas y el paisaje. */
const CAP_DOCK = 80, CAP_PIECE = 40, CAP_DECO = 96;
/** El césped de debajo: lo que mide y cada cuánto se repite su dibujo (m). */
const GROUND_SIZE = 260, GROUND_CELL = 4;

/** Las instancias de un modelo (una por cada pieza suya: material distinto, malla distinta) y cuántas van ahora. */
interface Batch {
  ims: InstancedMesh[];
  n: number;
  cap: number;
}

/** Lo que pasa con una pieza tras chocar (el barril sale despedido a un lado) o al esfumarse el cofre. */
interface Anim {
  t: number;
  dir: number;
}

export class TrekSystem extends createSystem({}) {
  readonly runner: Runner;
  /** La altura de tus ojos de pie al calibrar. */
  calibRef = 1.6;
  /** El fondo realista del tramo (lo pone el entorno). */
  pano = TREK_BIOMES[0].pano;
  private readonly env: PlatEnv;
  private readonly root = new Group();
  private readonly batches = new Map<string, Batch>();
  private ground!: Mesh;
  private groundTex!: CanvasTexture;
  private ready = false;
  private active = false;
  private clock = 0;
  /** El muelle a la vista: desde dónde se calculó y con cuántas piezas (si cambia, se recalcula). */
  private floorS0 = NaN;
  private floorN = -1;
  private floor: Put[] = [];
  private readonly holes: [number, number][] = [];
  /** El paisaje de cada trozo de 24 m que está a la vista, y lo que pide cada pieza (por su id). */
  private readonly deco = new Map<number, Put[]>();
  private readonly looks = new Map<number, Put[]>();
  private readonly knock = new Map<number, Anim>();
  private readonly gone = new Map<number, Anim>();
  /** Lo que se esconde de la arena mientras dura la Travesía (compuertas, suelo, valle y nubes) y la niebla de antes. */
  private hidden: Object3D[] = [];
  private savedFog: { color: number; density: number } | null = null;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly v = new Vector3();
  private readonly sc = new Vector3();
  private readonly at = new Vector3();
  private readonly bp = { x: 0, z: 0 };

  constructor(...a: ConstructorParameters<ReturnType<typeof createSystem>>) {
    super(...a);
    const self = this;
    this.env = {
      s: (k) => num(k),
      dv: (k) => dv(k, GAME.ramp),
      get ex() {
        return settings.exercise;
      },
      get state() {
        return self.state();
      },
      head: head.p,
      get calibRef() {
        return self.calibRef;
      },
      get wave() {
        return Math.max(0, GAME.wave - 1);
      },
      get rank() {
        return rankIdx();
      },
      get now() {
        return self.clock;
      },
      rnd: Math.random,
      store: (k) => store(k),
    };
    this.runner = new Runner(this.env);
  }

  init(): void {
    this.world.createTransformEntity(this.root);
    this.root.visible = false;
    // el césped de debajo de la pasarela: su dibujo corre y gira con el mundo (no patina bajo lo apoyado)
    this.groundTex = groundTexture('nature');
    this.groundTex.repeat.set(GROUND_SIZE / GROUND_CELL, GROUND_SIZE / GROUND_CELL);
    const g = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    g.rotateX(-Math.PI / 2);
    this.ground = new Mesh(g, new MeshStandardMaterial({ map: this.groundTex, roughness: 1, metalness: 0 }));
    this.ground.position.y = GROUND_Y;
    this.ground.receiveShadow = true;
    this.ground.userData.noInk = true;
    this.root.add(this.ground);
  }

  private get on(): boolean {
    return settings.mode === 'trek';
  }

  /** El estado de la partida que ve la lógica. */
  private state(): string {
    if (GAME.phase !== 'playing') return 'end';
    if (GAME.paused) return 'paused';
    if (GAME.between) return GAME.wave > 0 ? 'rest' : 'ready';
    return 'play';
  }

  // ---------------------------------------------------------------- la ronda y los tramos (las llama la partida)

  /** Empieza la ronda: desde el principio del sendero, con el primer tramo montado. */
  begin(): void {
    this.clearLooks();
    if (head.p.y > 1.1) this.calibRef = head.p.y;
    this.runner.reset();
    this.runner.addTramo(0, tramoLen(waveReps(0)));
    this.applyEvents();
  }

  /** Ya calibrado (de pie, quieto 2 s): tu altura de pie y el centro, donde estás. */
  calibrated(y: number): void {
    this.calibRef = y;
    this.runner.calibrate(y, head.p.x);
  }

  /** Empieza el tramo i: el cofre del anterior se esfuma y el siguiente se monta ya (para verlo llegar de lejos). */
  startWave(i: number): void {
    const R = this.runner;
    R.startTramo();
    R.addTramo(i, tramoLen(waveReps(i)));
    const N = nWaves();
    if (!N || i + 1 < N) R.addTramo(i + 1, tramoLen(waveReps(i + 1)));
    this.pano = TREK_BIOMES[0].pano; // (un fondo por tramo, con los paisajes: PR D)
    this.applyEvents();
  }

  /** ¿Queda tramo? Se acaba al llegar a su cofre (nunca a mitad de un paso). */
  waveLeft(i: number): boolean {
    return !this.runner.atChest(i);
  }

  /** Una repetición: empuja (si no estás parado ante un paso). Devuelve si ha empujado. */
  rep(perfect: boolean): boolean {
    const r = this.runner.rep(perfect);
    this.applyEvents();
    return r;
  }

  /** Lo que se enseña en el marcador. */
  hud(): { dist: number; kmh: number; turbo: boolean; left: number; stop: string; tramo: number } {
    const R = this.runner, i = Math.max(0, GAME.wave - 1);
    return { dist: R.dist, kmh: R.v * 3.6, turbo: R.tk.turbo, left: R.toChest(i), stop: R.stop?.k ?? '', tramo: i };
  }

  /** Para la partida simulada: lo esencial en datos simples. */
  snapshot(): Record<string, unknown> {
    const R = this.runner, nx = R.live.find((p) => !p.judged);
    return { next: nx ? { k: nx.k, rel: +(nx.at - R.dist).toFixed(2), side: nx.side } : null, dist: +R.dist.toFixed(2), v: +R.v.toFixed(2), turbo: R.tk.turbo, stop: R.stop?.k ?? '', hop: !!R.hop, chest: R.chest?.tramo ?? -1, passed: R.passed, hits: R.hits, live: R.live.map((p) => p.k), ends: R.ends.map((e) => Math.round(e)) };
  }

  /** Al acabar: los metros. */
  end(): { dist: number } {
    return { dist: Math.floor(this.runner.dist) };
  }

  /** Quita el recorrido (al acabar la ronda o salir de la Travesía). */
  clear(): void {
    this.runner.reset();
    this.runner.ev.length = 0;
    this.clearLooks();
  }

  private clearLooks(): void {
    this.looks.clear();
    this.knock.clear();
    this.gone.clear();
    this.floorS0 = NaN;
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number): void {
    this.clock += dt;
    if (!this.on) {
      if (this.active) this.deactivate();
      return;
    }
    if (!this.active) this.activate();
    if (!this.ready) this.ready = this.build();
    if (GAME.paused) return;
    if (GAME.phase === 'playing') this.runner.step(dt);
    this.applyEvents();
    this.stepAnims(dt);
    this.draw();
  }

  /** Al entrar en la Travesía: fuera la arena (compuertas, suelo, valle y nubes) y la niebla del bosque. */
  private activate(): void {
    this.active = true;
    this.root.visible = true;
    this.hidden = ['arena-floor', 'gate-left', 'gate-center', 'gate-right', 'comic-valley', 'comic-clouds'].map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is Object3D => !!o && o.visible);
    for (const o of this.hidden) o.visible = false;
    const fog = (this.world.scene as { fog: FogExp2 | null }).fog;
    if (fog) {
      this.savedFog = { color: fog.color.getHex(), density: fog.density };
      fog.color.setHex(TREK_BIOMES[0].fog);
      fog.density = TREK_BIOMES[0].dens;
    }
  }
  private deactivate(): void {
    this.active = false;
    this.root.visible = false;
    this.clear();
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    const fog = (this.world.scene as { fog: FogExp2 | null }).fog;
    if (fog && this.savedFog) {
      fog.color.setHex(this.savedFog.color);
      fog.density = this.savedFog.density;
    }
    this.savedFog = null;
  }

  /** Las instancias de cada modelo, en cuanto los kits estén cargados (y su sombreador, precompilado antes de la ronda). */
  private build(): boolean {
    const isl = kitParts('island'), nat = kitParts('nature');
    if (!isl || !nat) return false;
    const add = (kit: Kit, n: string, parts: Part[] | undefined, cap: number, shadow: boolean): void => {
      if (!parts || this.batches.has(`${kit}:${n}`)) return;
      const ims = parts.map((p) => {
        const im = new InstancedMesh(p.geo, p.mat, cap);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = shadow;
        im.receiveShadow = true;
        this.root.add(im);
        warmKeep(new InstancedMesh(p.geo, p.mat, 1)); // (se compila en el menú: sin tirón al salir la primera)
        return im;
      });
      this.batches.set(`${kit}:${n}`, { ims, n: 0, cap });
    };
    add('island', 'Dock', isl.Dock, CAP_DOCK, false);
    for (const n of ['Dock_Broken', 'Dock_Pole', 'Barrel', 'Chest_Closed', 'Chest_Gold']) add('island', n, isl[n], CAP_PIECE, true);
    for (const n of Object.keys(nat)) add('nature', n, nat[n], CAP_DECO, false);
    return true;
  }

  // ---------------------------------------------------------------- los sucesos

  private applyEvents(): void {
    const E = this.runner.ev;
    for (const e of E) this.apply(e);
    E.length = 0;
  }

  private apply(e: PlatEv): void {
    switch (e.t) {
      case 'say':
        HOOKS.say(e.text, e.col, e.dur, true);
        break;
      case 'cheer':
        HOOKS.say(e.text, e.col, e.dur, false);
        break;
      case 'snd':
        this.sound(e.name, e.at, e.arg);
        break;
      case 'fx':
        HOOKS.sparks(this.world3(e.at, this.at), e.n, e.col);
        break;
      case 'haptic':
        haptic('left', e.k, e.ms);
        haptic('right', e.k, e.ms);
        break;
      case 'score':
        HOOKS.score(e.n, false);
        break;
      case 'combo0':
        GAME.combo = 0;
        break;
      case 'turbo':
        GAME.ptsK = e.on ? 2 : 1; // (en el turbo, los puntos de cada repetición valen el doble)
        break;
      case 'show':
        this.looks.set(e.p.id, piecePuts(e.p, this.calibRef, []));
        break;
      case 'hide':
        this.looks.delete(e.p.id);
        this.knock.delete(e.p.id);
        this.gone.delete(e.p.id);
        break;
      case 'hit':
        if (e.p.k === 'side') this.knock.set(e.p.id, { t: 0, dir: e.p.side || 1 }); // (el barril sale despedido hacia fuera)
        break;
      case 'vanish':
        this.gone.set(e.p.id, { t: 0, dir: 0 });
        HOOKS.sparks(this.world3({ s: e.p.at, u: 0, y: 0.5 }, this.at), 24, 0xffd166);
        break;
      default:
        break;
    }
  }

  private sound(name: string, at: PlatPos | null, arg?: string | boolean): void {
    const p = at ? this.world3(at, this.at) : this.at.copy(head.p);
    if (name === 'whoosh') SND.whoosh(p, typeof arg === 'string' ? arg : 'arc');
    else if (name === 'metalHit') SND.metalHit(p, !!arg);
    else if (name === 'step') SND.step(p, !!arg);
    else if (name === 'perfect') SND.perfect();
    else if (name === 'combo') SND.combo();
    else if (name === 'victory') SND.victory();
    else if (name === 'tick') SND.tick();
  }

  /** Un punto del recorrido, en la arena. */
  private world3(at: PlatPos, out: Vector3): Vector3 {
    this.runner.tk.bend(at.s, at.u, this.bp);
    return out.set(this.bp.x, at.y + this.runner.dip, this.bp.z);
  }

  private stepAnims(dt: number): void {
    for (const a of this.knock.values()) a.t = Math.min(1, a.t + dt / 0.45);
    for (const [id, a] of this.gone) {
      a.t += dt / 0.6;
      if (a.t >= 1) {
        this.looks.delete(id);
        this.gone.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- pintar

  private draw(): void {
    if (!this.ready) return;
    const R = this.runner, tk = R.tk, d = R.dist, lite = LITE.on;
    tk.frame();
    this.root.position.y = R.dip; // (el salto: el mundo baja y sube bajo los pies)
    for (const b of this.batches.values()) b.n = 0;
    // el muelle (recalculado al avanzar un tramo de tablas o al montar otro tramo del recorrido)
    const s0 = Math.floor((d - BACK) / DOCK_LEN) * DOCK_LEN;
    if (s0 !== this.floorS0 || R.pieces.length !== this.floorN) {
      this.floorS0 = s0;
      this.floorN = R.pieces.length;
      this.holes.length = 0;
      for (const p of R.pieces) if (p.k === 'gap' && p.at + p.len > s0 && p.at < s0 + BACK + AHEAD + DOCK_LEN) this.holes.push([p.at, p.at + p.len]);
      this.floor.length = 0;
      floorPuts(s0, s0 + BACK + AHEAD + DOCK_LEN, this.holes, this.floor);
    }
    for (const u of this.floor) this.put(u, u.ds, 0, 1);
    // el paisaje de los lados (cada trozo, calculado una vez mientras está a la vista); con un menú abierto, sin él
    const c0 = Math.floor((d - BACK) / TREK_CH), c1 = Math.floor((d + AHEAD) / TREK_CH);
    for (const k of this.deco.keys()) if (k < c0 || k > c1) this.deco.delete(k);
    if (!lite)
      for (let c = c0; c <= c1; c++) {
        let L = this.deco.get(c);
        if (!L) {
          L = decoPuts(c, []);
          this.deco.set(c, L);
        }
        for (const u of L) this.put(u, u.ds, 0, 1);
      }
    // las piezas del recorrido
    for (const p of R.live) {
      const L = this.looks.get(p.id);
      if (!L) continue;
      const kn = this.knock.get(p.id), gn = this.gone.get(p.id), off = kn ? kn.dir * 0.9 * kn.t : 0, k = gn ? Math.max(0.01, 1 - gn.t) : 1;
      for (const u of L) this.put(u, p.at + u.ds, off, k, kn ? kn.t : 0, p);
    }
    for (const b of this.batches.values())
      for (const im of b.ims) {
        im.count = b.n;
        im.instanceMatrix.needsUpdate = true;
      }
    // el césped: centrado en ti, con su dibujo donde le toca en el sendero (gira y corre con el mundo)
    const F = tk.tf;
    this.ground.rotation.y = F.th;
    this.groundTex.offset.set(F.x / GROUND_CELL, -F.z / GROUND_CELL);
  }

  /** Una instancia: el modelo `u` en (s, u.u + du) del sendero, a su escala por `k`; `roll`, lo que vuelca (el barril). */
  private put(u: Put, s: number, du: number, k: number, roll = 0, p?: Piece): void {
    const b = this.batches.get(`${u.kit}:${u.n}`);
    if (!b || b.n >= b.cap) return;
    const ry = this.runner.tk.bend(s, u.u + du, this.bp);
    this.e.set(u.rx, ry + u.ry, u.rz + roll * (p && p.side ? -p.side : 1) * 1.4);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(this.bp.x, u.y, this.bp.z), this.q, this.sc.set(u.sx * k, u.sy * k, u.sz * k));
    for (const im of b.ims) im.setMatrixAt(b.n, this.m4);
    b.n++;
  }
}
