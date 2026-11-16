/**
 * La Travesía de plataformas en la partida: pinta el recorrido que decide la lógica pura (runner.ts, course.ts, moves.ts) y
 * aplica sus sucesos (avisos, sonidos, puntos, la racha y el turbo). Lo que se ve: una pasarela de tablas (el muelle del
 * Pirate Kit) que viene hacia ti por el bosque, con sus retos (vigas bajas, troncos, huecos, plataformas, túneles, frutas)
 * y el cofre al final de cada tramo; a los lados, árboles, rocas y hierba del Stylized Nature, y debajo, el césped, que corre
 * y gira con el mundo. Cada tramo, su paisaje (`TREK_BIOMES`: bosque, aldea, pradera del lago y pinar al atardecer) con su
 * fondo realista, su niebla y su luz. Los enemigos (la seta, que se pisa, y el cangrejo, que se esquiva a un lado) son
 * modelos animados de los monstruitos de Quaternius, un puñado de cada uno hecho al cargarse y reutilizado. Con el turbo,
 * estelas de viento que pasan a tu lado (RepArena: TREK_WIND).
 *
 * Todo con instancias (una pieza por modelo y material): cada fotograma se recolocan las instancias de lo que está a la
 * vista (de 20 m detrás a 88 m delante), sin crear objetos. La partida (GameSystem) lo engancha como Arcos: `begin`,
 * `startWave`, `waveLeft`, `rep`, `hud`, `end` y `clear`.
 */
import { AdditiveBlending, AnimationMixer, AssetManager, BoxGeometry, CanvasTexture, Color, createSystem, Euler, Group, InstancedMesh, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import type { AnimationAction, DirectionalLight, FogExp2, HemisphereLight, Object3D, SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { diagEvent } from '../../core/diag.js';
import { dv, store, waveReps, nWaves, rankIdx } from '../../core/settings.js';
import { CAMP } from '../../core/campaign.js';
import { GAME, HOOKS, LITE, VIEW } from '../../core/state.js';
import { num, settings } from '../../core/values.js';
import { haptic } from '../../input/hand-system.js';
import { head } from '../../input/hand-model.js';
import { groundTexture, kitParts, type Part } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import { TREK_BIOMES, TREK_CH } from './path.js';
import { DOCK_LEN, GROUND_Y, KIT_MODELS, chestPuts, decoPuts, floorPuts, piecePuts, type Kit, type Put } from './plat/pieces.js';
import { Runner, tramoLen, type PlatEnd } from './plat/runner.js';
import { CRAB_U, FRUIT_U, PLAT_GHOST, PLAT_SEE, type Piece, type PlatEnv, type PlatEv, type PlatPos } from './plat/types.js';

/** Lo que se pinta por detrás de ti (m) y lo que más se ve por delante (m, entre la niebla). */
const BACK = 20, AHEAD = PLAT_SEE + 8;
/** Cuántas instancias caben de cada modelo: el muelle (unos 45 a la vista), las piezas y el paisaje. */
// (las plataformas llevan unos 20 barriles cada una y sus tablas: con varias a la vista, hace falta sitio)
const CAP_DOCK = 120, CAP_PIECE = 160, CAP_DECO = 96, CAP_FOOD = 24;
/** El césped de debajo: lo que mide y cada cuánto se repite su dibujo (m). */
const GROUND_SIZE = 260, GROUND_CELL = 4;

/** Los enemigos: su modelo del catálogo, lo que mide su modelo (m, a escala 1), lo alto que se ven (m: la seta, por la
 * rodilla, para pisarla; el cangrejo, bajo y ancho, a un lado) y su voz. Cuántos de cada uno se preparan. */
const FOE_LOOK = {
  foe: { asset: 'foe-mushroom', nat: 2.07, h: 0.6, voice: 'mushroom' },
  side: { asset: 'foe-crab', nat: 1.57, h: 0.42, voice: 'crab' },
} as const;
const FOE_POOL = 5;
/** Lo que dura cada gesto que no se repite (s): morder, chafarse (y lo que tarda en esfumarse la seta pisada). */
const BITE_T = 0.9, SQUASH_T = 0.18, DIE_T = 1.3;

/** Un enemigo hecho (se reutiliza): su modelo con sus animaciones, la pieza que es ahora y lo que está haciendo. */
interface FoeRig {
  kind: 'foe' | 'side';
  root: Group;
  model: Object3D;
  mixer: AnimationMixer;
  acts: Map<string, AnimationAction>;
  cur: string;
  p: Piece | null;
  /** Lo que hace: andar o esperar (según la pieza), morder (te ha mordido o, el cangrejo esquivado, al aire) o chafarse. */
  act: 'live' | 'bite' | 'miss' | 'die';
  t: number;
  /** Apartado a un lado tras morder (m) y hacia dónde. */
  off: number;
  dir: number;
}

/** Las estelas del turbo (RepArena: TREK_WIND): cuántas y dónde va cada una (a un lado, alto, a lo largo, largo y su paso). */
const WIND_N = 44;
interface Wind {
  x: number;
  y: number;
  z: number;
  l: number;
  k: number;
}

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
  /** El paisaje del tramo de ahora (índice de TREK_BIOMES) y las luces de la escena (con las de antes, para devolverlas). */
  private biome = 0;
  private lights: { sun: DirectionalLight | null; fill: HemisphereLight | null; sunC: Color; sunI: number; fillC: Color; fillI: number } | null = null;
  /** Los enemigos hechos (libres o con su pieza) y cuál lleva cada pieza (por su id). */
  private readonly rigs: FoeRig[] = [];
  private readonly rigOf = new Map<number, FoeRig>();
  private foesReady = false;
  /** Las estelas del turbo. */
  private wind!: InstancedMesh;
  private readonly winds: Wind[] = [];
  /** Lo que se guardó al acabar la última ronda (la medalla y el fantasma). */
  last: PlatEnd | null = null;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'XYZ');
  private readonly qy = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
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
    // las estelas del turbo: varillas finas de luz (líneas no: en las gafas, de un píxel, ni se veían), fuera del mundo que
    // baja y sube (van contigo)
    this.wind = new InstancedMesh(new BoxGeometry(0.018, 0.018, 1), new MeshBasicMaterial({ color: 0xe4ffa8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), WIND_N);
    this.wind.frustumCulled = false;
    this.wind.visible = false;
    this.wind.userData.noInk = true;
    for (let i = 0; i < WIND_N; i++) this.winds.push({ x: (Math.random() < 0.5 ? 1 : -1) * (0.7 + 2.5 * Math.random()), y: 0.15 + 2.45 * Math.random(), z: -14 + 18 * Math.random(), l: 0.8 + 1.4 * Math.random(), k: 0.7 + 0.6 * Math.random() });
    this.world.createTransformEntity(this.wind);
    warmKeep(new InstancedMesh(this.wind.geometry, this.wind.material, 1)); // (instanciada como la de verdad: el mismo sombreador)
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
    this.setBiome(0);
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
    this.setBiome(i);
    this.applyEvents();
  }

  /** El paisaje del tramo i (el fondo realista, la niebla y la luz; los árboles van con el sendero: `biomeAt`). */
  private setBiome(i: number): void {
    const b = ((i % TREK_BIOMES.length) + TREK_BIOMES.length) % TREK_BIOMES.length, B = TREK_BIOMES[b], B0 = TREK_BIOMES[0];
    this.biome = b;
    this.pano = B.pano;
    const fog = (this.world.scene as { fog: FogExp2 | null }).fog;
    if (fog && this.savedFog) {
      fog.color.setHex(B.fog);
      fog.density = B.dens;
    }
    // la luz: la de la escena, con el color y la fuerza del bioma respecto al bosque (al atardecer, más naranja y más baja)
    const L = this.lights;
    if (!L) return;
    const tint = (out: Color, base: Color, c: number, c0: number): void => {
      const a = new Color(c), z = new Color(c0); // (al cambiar de tramo, no en cada fotograma)
      out.setRGB(Math.min(1, base.r * a.r / Math.max(0.05, z.r)), Math.min(1, base.g * a.g / Math.max(0.05, z.g)), Math.min(1, base.b * a.b / Math.max(0.05, z.b)));
    };
    if (L.sun) {
      tint(L.sun.color, L.sunC, B.key, B0.key);
      L.sun.intensity = L.sunI * (B.keyI / B0.keyI);
    }
    if (L.fill) {
      tint(L.fill.color, L.fillC, B.hemi, B0.hemi);
      L.fill.intensity = L.fillI * (B.hemiI / B0.hemiI);
    }
  }

  /** El paisaje que toca en el punto s del sendero: el del tramo en que cae (el siguiente al último montado, si va más allá). */
  private biomeAt(s: number): number {
    const E = this.runner.ends;
    let i = 0;
    while (i < E.length && s > E[i]) i++;
    return i % TREK_BIOMES.length;
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
  hud(): { dist: number; kmh: number; turbo: boolean; left: number; stop: string; tramo: number; energy: number; superT: number; ghost: number | null } {
    const R = this.runner, i = Math.max(0, GAME.wave - 1);
    return { dist: R.dist, kmh: R.v * 3.6, turbo: R.tk.turbo, left: R.toChest(i), stop: R.stop?.k ?? '', tramo: i, energy: R.energy, superT: R.superT, ghost: R.ghostDiff() };
  }

  /** Para la partida simulada: lo esencial en datos simples. */
  snapshot(): Record<string, unknown> {
    const R = this.runner, nx = R.live.find((p) => !p.judged);
    return { next: nx ? { k: nx.k, rel: +(nx.at + nx.walk - R.dist).toFixed(2), side: nx.side } : null, dist: +R.dist.toFixed(2), v: +R.v.toFixed(2), turbo: R.tk.turbo, stop: R.stop?.k ?? '', energy: +R.energy.toFixed(2), superT: +R.superT.toFixed(1), plank: R.moves.plank, lev: +R.lev.toFixed(2), hop: !!R.hop, chest: R.chest?.tramo ?? -1, passed: R.passed, hits: R.hits, live: R.live.map((p) => p.k), ends: R.ends.map((e) => Math.round(e)), keys: R.keys, fruits: R.fruits, biome: this.biome, pano: this.pano, foes: this.rigs.filter((r) => r.p && r.root.visible).map((r) => `${r.kind}:${r.cur}`), wind: this.wind.visible, ghost: R.ghostDiff(), last: this.last && { medal: this.last.medal?.[0] ?? null, dist: this.last.dist } };
  }

  /** Al acabar la ronda (`score`, tus puntos): la medalla, los metros, las frutas y, si llegaste más lejos que nunca (y no es
   * la campaña, con sus ajustes), tu fantasma nuevo, guardado. */
  end(score: number): PlatEnd {
    const e = this.runner.end(score);
    if (e.ghost && !CAMP.run) store(PLAT_GHOST, e.ghost);
    this.last = e;
    return e;
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
    for (const r of this.rigs) this.freeRig(r);
    this.rigOf.clear();
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
    if (!this.foesReady) this.foesReady = this.buildFoes();
    if (GAME.paused) return;
    if (GAME.phase === 'playing') this.runner.step(dt);
    // echado (en plancha, bajo un túnel): los avisos, en el suelo bajo la cara (de pie, delante, no se leerían)
    VIEW.prone = GAME.phase === 'playing' && this.runner.moves.plank;
    this.applyEvents();
    this.stepAnims(dt);
    this.draw();
    this.drawFoes(dt);
    this.stepWind(dt);
  }

  /** Al entrar en la Travesía: fuera la arena (compuertas, suelo, valle y nubes) y la niebla del bosque. */
  private activate(): void {
    this.active = true;
    this.root.visible = true;
    this.hidden = ['arena-floor', 'gate-left', 'gate-center', 'gate-right', 'comic-valley', 'comic-clouds'].map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is Object3D => !!o && o.visible);
    for (const o of this.hidden) o.visible = false;
    const fog = (this.world.scene as { fog: FogExp2 | null }).fog;
    if (fog) this.savedFog = { color: fog.color.getHex(), density: fog.density };
    // las luces de la escena (el sol y la de relleno), para teñirlas con cada tramo y devolverlas al salir
    let sun: DirectionalLight | null = null, fill: HemisphereLight | null = null;
    this.world.getSceneEntity('sun')?.object3D?.traverse((o) => { if ((o as DirectionalLight).isDirectionalLight) sun = o as DirectionalLight; });
    this.world.getSceneEntity('fill')?.object3D?.traverse((o) => { if ((o as HemisphereLight).isHemisphereLight) fill = o as HemisphereLight; });
    const S = sun as DirectionalLight | null, F = fill as HemisphereLight | null;
    this.lights = { sun: S, fill: F, sunC: S ? S.color.clone() : new Color(), sunI: S?.intensity ?? 1, fillC: F ? F.color.clone() : new Color(), fillI: F?.intensity ?? 1 };
    this.setBiome(0);
  }
  private deactivate(): void {
    this.active = false;
    VIEW.prone = false;
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
    const L = this.lights;
    if (L?.sun) {
      L.sun.color.copy(L.sunC);
      L.sun.intensity = L.sunI;
    }
    if (L?.fill) {
      L.fill.color.copy(L.fillC);
      L.fill.intensity = L.fillI;
    }
    this.lights = null;
    this.biome = 0;
    this.pano = TREK_BIOMES[0].pano;
    this.wind.visible = false;
    (this.wind.material as MeshBasicMaterial).opacity = 0; // (al volver, sin estelas que se apagan)
  }

  /** Las instancias de cada modelo, en cuanto los kits estén cargados (y su sombreador, precompilado antes de la ronda). */
  private build(): boolean {
    const isl = kitParts('island'), nat = kitParts('nature'), food = kitParts('food');
    if (!isl || !nat || !food) return false;
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
    // (las piezas: lo que use pieces.ts de cada kit, KIT_MODELS; el resto del bosque, para el paisaje)
    for (const n of KIT_MODELS.island) if (n !== 'Dock') add('island', n, isl[n], CAP_PIECE, true);
    for (const n of KIT_MODELS.food) add('food', n, food[n], CAP_FOOD, true);
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
        if (e.p.k === 'foe' || e.p.k === 'side') this.takeRig(e.p);
        else this.looks.set(e.p.id, piecePuts(e.p, this.calibRef, []));
        break;
      case 'hide': {
        this.looks.delete(e.p.id);
        this.knock.delete(e.p.id);
        this.gone.delete(e.p.id);
        const r = this.rigOf.get(e.p.id);
        if (r) this.freeRig(r);
        break;
      }
      case 'wake': {
        // la seta o el cangrejo echan a andar hacia ti: su voz
        const L = FOE_LOOK[e.p.k === 'side' ? 'side' : 'foe'];
        SND.hiss(this.world3({ s: e.p.at + e.p.walk, u: e.p.k === 'side' ? e.p.side * CRAB_U : 0, y: 0.3 }, this.at), 1, L.voice);
        break;
      }
      case 'chest':
        // al llegar, el cofre se abre: lleno de oro
        this.looks.set(e.p.id, chestPuts(true, []));
        break;
      case 'trophy':
        HOOKS.trophy(e.title, e.sub);
        break;
      case 'store':
        store(e.key, e.val);
        break;
      case 'halt':
      case 'go':
      case 'pass':
        this.diag(e.t, e.p);
        if (e.p.k === 'fruit') {
          // la fruta cogida: chispas de su color y se encoge (se la come)
          this.gone.set(e.p.id, { t: 0, dir: 0 });
          HOOKS.sparks(this.world3({ s: e.p.at, u: e.p.side * FRUIT_U, y: this.calibRef }, this.at), e.p.special ? 30 : 14, e.p.special ? 0xc8ff3a : 0xffd166);
        }
        // la seta pisada se chafa; el cangrejo esquivado muerde el aire
        if (e.t === 'pass') this.rigAct(e.p, e.p.k === 'foe' ? 'die' : 'miss');
        break;
      case 'hit':
        this.diag('hit', e.p);
        if (e.p.k === 'foe' || e.p.k === 'side') {
          // te muerde (y se aparta a un lado: nunca se atraviesa)
          this.rigAct(e.p, 'bite');
          SND.hiss(this.world3({ s: e.p.at + e.p.walk, u: e.p.k === 'side' ? e.p.side * CRAB_U : 0, y: 0.3 }, this.at), 1, FOE_LOOK[e.p.k].voice);
        }
        break;
      case 'vanish':
        // el cofre abierto se esfuma con humo
        this.gone.set(e.p.id, { t: 0, dir: 0 });
        HOOKS.sparks(this.world3({ s: e.p.at, u: 0, y: 0.5 }, this.at), 30, 0xe8e4dc);
        HOOKS.sparks(this.world3({ s: e.p.at, u: 0, y: 0.8 }, this.at), 12, 0xffd166);
        break;
      default:
        break;
    }
  }

  // para arreglar con datos de las gafas: lo que pasa con cada pieza y cómo estaba la cabeza (lo subido, bajado y apartado)
  private diag(what: string, p: Piece): void {
    const M = this.runner.moves, w = { halt: 'parado ante', go: 'cruza', pass: 'supera', hit: 'choca con' }[what] ?? what;
    diagEvent(`Travesía: ${w} ${p.k} (${Math.round(p.at)} m) · cabeza +${M.up.toFixed(2)} −${M.down.toFixed(2)} lado ${M.dx.toFixed(2)}${p.k === 'log' ? ` · subió ${p.maxUp.toFixed(2)}${p.fast ? ' deprisa' : ''}` : ''}`);
  }

  private sound(name: string, at: PlatPos | null, arg?: string | boolean): void {
    const p = at ? this.world3(at, this.at) : this.at.copy(head.p);
    if (name === 'squish') SND.squish(p);
    else if (name === 'whoosh') SND.whoosh(p, typeof arg === 'string' ? arg : 'arc');
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
      if (R.pieces.length !== this.floorN) this.deco.clear(); // (un tramo nuevo: el paisaje de más allá, el suyo)
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
          L = decoPuts(c, [], this.biomeAt(c * TREK_CH));
          this.deco.set(c, L);
        }
        for (const u of L) this.put(u, u.ds, 0, 1);
      }
    // las piezas del recorrido
    for (const p of R.live) {
      const L = this.looks.get(p.id);
      if (!L) continue;
      const kn = this.knock.get(p.id), gn = this.gone.get(p.id), off = kn ? kn.dir * 0.9 * kn.t : 0, k = gn ? Math.max(0.01, 1 - gn.t) : 1;
      // (las frutas giran y flotan, cada una a su compás)
      const spin = p.k === 'fruit' ? this.clock * 1.8 + p.id : 0, bob = p.k === 'fruit' ? 0.04 * Math.sin(this.clock * 2.6 + p.id) : 0;
      for (const u of L) this.put(u, p.at + u.ds, off, k, kn ? kn.t : 0, p, spin, bob);
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
  private put(u: Put, s: number, du: number, k: number, roll = 0, p?: Piece, spin = 0, bob = 0): void {
    const b = this.batches.get(`${u.kit}:${u.n}`);
    if (!b || b.n >= b.cap) return;
    // (el giro propio del modelo, en el orden de pieces.ts, y encima el del sendero en ese punto)
    const ry = this.runner.tk.bend(s, u.u + du, this.bp);
    this.e.set(u.rx, u.ry + spin, u.rz + roll * (p && p.side ? -p.side : 1) * 1.4);
    this.q.setFromEuler(this.e).premultiply(this.qy.setFromAxisAngle(this.up, ry));
    this.m4.compose(this.v.set(this.bp.x, u.y + bob, this.bp.z), this.q, this.sc.set(u.sx * k, u.sy * k, u.sz * k));
    for (const im of b.ims) im.setMatrixAt(b.n, this.m4);
    b.n++;
  }

  // ---------------------------------------------------------------- los enemigos

  /** Los enemigos, en cuanto sus modelos estén cargados: FOE_POOL de cada uno, escondidos hasta que salga su pieza (y
   * precompilados en el menú: sin tirón al salir el primero). */
  private buildFoes(): boolean {
    // (¿ya están? sin copiarlos: getGLTF copia el modelo entero si no se le pide el compartido)
    for (const kind of ['foe', 'side'] as const) if (!AssetManager.getGLTF(FOE_LOOK[kind].asset, { shared: true })) return false;
    for (const kind of ['foe', 'side'] as const) {
      const L = FOE_LOOK[kind];
      // FOE_POOL para el juego y uno más, escondido, para precompilarlo igual que ellos (con su sombra) en el menú
      for (let i = 0; i <= FOE_POOL; i++) {
        const gltf = AssetManager.getGLTF(L.asset)!, model = gltf.scene, root = new Group();
        root.name = `travesia-${kind === 'foe' ? 'seta' : 'cangrejo'}-${i}`;
        model.scale.setScalar(L.h / L.nat);
        model.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false; // (animado, se sale de su caja de reposo)
        });
        if (i === FOE_POOL) {
          warmKeep(model);
          break;
        }
        root.add(model);
        root.visible = false;
        this.root.add(root);
        const mixer = new AnimationMixer(model), acts = new Map<string, AnimationAction>();
        for (const c of gltf.animations) acts.set(c.name, mixer.clipAction(c));
        this.rigs.push({ kind, root, model, mixer, acts, cur: '', p: null, act: 'live', t: 0, off: 0, dir: 1 });
      }
    }
    // (las piezas que salieron antes de tener los modelos)
    for (const p of this.runner.live) if ((p.k === 'foe' || p.k === 'side') && !this.rigOf.has(p.id)) this.takeRig(p);
    return true;
  }

  /** Un enemigo libre para la pieza p (si no hay, no se ve: con FOE_POOL de cada uno no pasa). */
  private takeRig(p: Piece): void {
    if (this.rigOf.has(p.id)) return;
    const kind = p.k === 'side' ? 'side' : 'foe';
    const r = this.rigs.find((x) => x.kind === kind && !x.p);
    if (!r) return;
    r.p = p;
    r.act = 'live';
    r.t = r.off = 0;
    r.dir = p.k === 'side' ? p.side || 1 : p.id % 2 ? 1 : -1;
    r.root.visible = true;
    r.root.scale.set(1, 1, 1);
    this.rigOf.set(p.id, r);
    this.clip(r, 'Idle');
  }

  private freeRig(r: FoeRig): void {
    if (r.p) this.rigOf.delete(r.p.id);
    r.p = null;
    r.root.visible = false;
    r.mixer.stopAllAction();
    r.cur = '';
  }

  /** Lo que hace el enemigo de la pieza p a partir de ahora. */
  private rigAct(p: Piece, act: FoeRig['act']): void {
    const r = this.rigOf.get(p.id);
    if (!r) return;
    r.act = act;
    r.t = 0;
    this.clip(r, act === 'die' ? 'Death' : 'Bite_Front', true);
  }

  /** Su animación (con un fundido corto); `once`, sin repetir y quieta al acabar. */
  private clip(r: FoeRig, name: string, once = false): void {
    if (r.cur === name) return;
    const a = r.acts.get(name);
    if (!a) return;
    const prev = r.cur ? r.acts.get(r.cur) : null;
    a.reset();
    a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(0.15).play();
    prev?.fadeOut(0.15);
    r.cur = name;
  }

  /** Cada fotograma: dónde está cada enemigo (en su sitio del sendero, andando hacia ti), de cara a ti, y su gesto. */
  private drawFoes(dt: number): void {
    const lite = LITE.on;
    for (const r of this.rigs) {
      const p = r.p;
      if (!p) continue;
      r.t += dt;
      // (andan solo en pleno tramo: entre tramos, el recorrido está quieto y ellos también)
      if (r.act === 'live') this.clip(r, p.woke && p.walk > 0 && GAME.phase === 'playing' && !GAME.between && !GAME.paused ? 'Walk' : 'Idle');
      else if ((r.act === 'bite' || r.act === 'miss') && r.t > BITE_T) {
        r.act = 'live';
        this.clip(r, 'Idle');
      }
      // tras morderte se aparta a un lado (fuera de la pasarela: nunca lo atraviesas)
      if (r.act === 'bite' || (r.act === 'live' && p.ok === false)) r.off = Math.min(0.9, r.off + dt * 2);
      let k = 1;
      if (r.act === 'die') {
        // la seta pisada: se chafa y, al rato, se esfuma
        const sq = Math.min(1, r.t / SQUASH_T);
        r.root.scale.set(1 + 0.35 * sq, Math.max(0.2, 1 - 0.8 * sq), 1 + 0.35 * sq);
        if (r.t > DIE_T) k = Math.max(0, 1 - (r.t - DIE_T) / 0.5);
        if (k <= 0) {
          this.freeRig(r);
          continue;
        }
        if (k < 1) r.root.scale.multiplyScalar(k);
      }
      r.root.visible = !lite;
      const u = (p.k === 'side' ? p.side * CRAB_U : 0) + r.dir * r.off;
      const ry = this.runner.tk.bend(p.at + p.walk, u, this.bp);
      r.root.position.set(this.bp.x, 0, this.bp.z);
      r.root.quaternion.setFromAxisAngle(this.up, ry);
      if (!lite) r.mixer.update(dt);
    }
  }

  // ---------------------------------------------------------------- el turbo

  /** Las estelas de viento del turbo (RepArena: trekWindStep): aparecen y se van suaves y corren hacia atrás a tu lado. */
  private stepWind(dt: number): void {
    const M = this.wind.material as MeshBasicMaterial, R = this.runner;
    const want = R.tk.turbo && GAME.phase === 'playing' && !GAME.between && !GAME.paused ? 0.7 : 0;
    M.opacity += (want - M.opacity) * Math.min(1, dt * 3);
    this.wind.visible = M.opacity > 0.01;
    if (!this.wind.visible) return;
    const v = Math.max(1, R.v) * 3.2, H = head.p;
    for (let i = 0; i < WIND_N; i++) {
      const w = this.winds[i];
      w.z += v * w.k * dt;
      if (w.z > 4) {
        w.z = -16 + 6 * Math.random();
        w.y = 0.15 + 2.45 * Math.random();
      }
      this.m4.makeScale(1, 1, w.l).setPosition(H.x + w.x, w.y, H.z + w.z - w.l / 2);
      this.wind.setMatrixAt(i, this.m4);
    }
    this.wind.instanceMatrix.needsUpdate = true;
  }
}
