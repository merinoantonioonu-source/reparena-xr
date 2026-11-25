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
import { AdditiveBlending, BackSide, BufferAttribute, DoubleSide, ShaderMaterial, SphereGeometry, TorusGeometry, CircleGeometry, AnimationMixer, AssetManager, BoxGeometry, CanvasTexture, Color, createSystem, DataTexture, DomeTexture, Euler, Group, InstancedMesh, LinearFilter, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, RGBAFormat, Sprite, SpriteMaterial, UnsignedByteType, Vector3 } from '@iwsdk/core';
import { bodyDir, headRoll } from '../../input/body-dir.js';
import { FB } from '../../core/flybox.js';
import { FlyLook } from './fly-look.js';
import { mapWanted } from './map/map-key.js';
import { playSound } from '../../audio/sound.js';
import type { AnimationAction, DirectionalLight, FogExp2, HemisphereLight, Object3D, SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { diagEvent } from '../../core/diag.js';
import { dv, setSetting, store, waveReps, nWaves, rankIdx } from '../../core/settings.js';
import { CAMP } from '../../core/campaign.js';
import { GAME, HOOKS, LITE, VIEW } from '../../core/state.js';
import { num, settings, str } from '../../core/values.js';
import { haptic } from '../../input/hand-system.js';
import { hands, head, headFwd, type Hand } from '../../input/hand-model.js';
import { Wings } from './wings.js';
import { CloudSea } from './cloud-sea.js';
import { Sea } from './sea.js';
import { groundTexture, kitParts, type Part } from '../../env/scenery.js';
import { warmKeep } from '../../style/warm.js';
import { LOOK_BOSS, LOOK_CANNON, LOOK_FIRE, LOOK_SPIT, Missile, type MissileLook } from '../../style/missile-fx.js';
import { looks, looksTick } from '../../style/missile-look.js';
import { PAL, vfx } from '../../style/vfx.js';
import { TREK_BIOMES, TREK_CH } from './path.js';
import { SEA_Y, CLIFF_FLOOR_Y, cliffDecoPuts, cliffFloorPuts, coastDecoPuts, coastFloorPuts, skyDecoPuts, skyFloorPuts, DOCK_LEN, GOLD_TAG, GROUND_Y, KIT_MODELS, chestPuts, decoPuts, floorPuts, piecePuts, type Kit, type Put } from './plat/pieces.js';
import { PORTAL_AT, tramoBiome, tramoDeco, worldEnd, worldStart, WORLDS, type FloorStyle } from './plat/worlds.js';
import { Runner, TREASURE_KEYS, tramoLen, type PlatEnd } from './plat/runner.js';
import { PAW_U, RING_R, CANNON_AT, CANNON_LOW_Y, SHIP_U, BOB_CRACK, BOB_ISLE, bobY, ASIDE_U, FOE_WALK, BOSSES, BOSS_FLY, BOSS_HP, BOSS_Z, type BossShot, CRAB_U, FORK_U, FRUIT_U, GLIDE_LIFT, glideArc, glideU, GOLD_Y, LAND_PAST, PLAT_GHOST, PLAT_SEE, type Piece, type PlatEnv, type PlatEv, type PlatPos } from './plat/types.js';

/** Lo que se pinta por detrás de ti (m) y lo que más se ve por delante (m, entre la niebla). */
const BACK = 20, AHEAD = PLAT_SEE + 8;
/** Volando: la pasarela que queda al salir y tras cada cofre (para despegar) y ante él (×1,6, para posarse), m. */
const FLY_PAD = 8;
/** Cuántas instancias caben de cada modelo: el muelle (unos 45 a la vista), las piezas y el paisaje. */
// (las plataformas llevan unos 20 barriles cada una y sus tablas: con varias a la vista, hace falta sitio)
/** Las islas: lo que tarda el islote en quedarse quieto a ras al saltar hacia él (s) y lo que hay que dejar atrás un trozo del
 * que se hunde para que caiga (m). */
const SETTLE_T = 0.35, SINK_BACK = 1.5;
const CAP_DOCK = 120, CAP_PIECE = 160, CAP_CLIFF = 240, CAP_DECO = 96, CAP_FOOD = 24;
/** El césped de debajo: lo que mide y cada cuánto se repite su dibujo (m). */
const GROUND_SIZE = 260, GROUND_CELL = 4;

/** Los enemigos: su modelo del catálogo, lo que mide su modelo (m, a escala 1), lo alto que se ven (m: la seta, por la
 * rodilla, para pisarla; el cangrejo, bajo y ancho, a un lado) y su voz. Cuántos de cada uno se preparan. */
const FOE_LOOK = {
  foe: { asset: 'foe-mushroom', nat: 2.07, h: 0.6, voice: 'mushroom', pool: 5 },
  side: { asset: 'foe-crab', nat: 1.57, h: 0.42, voice: 'crab', pool: 5 },
  // (los nuevos: la abeja y el murciélago en picado, la calavera que bota, el cíclope y el demonio, a un lado)
  bee: { asset: 'foe-bee', nat: 1.9, h: 0.6, voice: 'bee', pool: 3 },
  bat: { asset: 'foe-bat', nat: 1.75, h: 0.6, voice: 'bat', pool: 3 },
  skull: { asset: 'foe-skull', nat: 1.55, h: 0.5, voice: 'skull', pool: 3 },
  quake: { asset: 'foe-cyclops', nat: 1.67, h: 1.6, voice: 'cyclops', pool: 2 },
  fire: { asset: 'foe-demon', nat: 1.62, h: 1.4, voice: 'demon', pool: 2 },
  // (en las islas, el que lanza la bola de fuego es un dragón que vuela a un lado: no hay suelo donde ponerse)
  dragon: { asset: 'foe-dragon', nat: 1.65, h: 1.3, voice: 'dragon', pool: 2 },
  // (en la costa: los piratas de Quaternius; el tiburón pirata llega corriendo y el esqueleto, a un lado)
  sharky: { asset: 'foe-sharky', nat: 1.56, h: 1.56, voice: 'sharky', pool: 2 },
  mako: { asset: 'foe-mako', nat: 1.59, h: 1.59, voice: 'mako', pool: 2 },
  skeleton: { asset: 'foe-skeleton', nat: 1.5, h: 1.5, voice: 'skeleton', pool: 3 },
} as const;
type Look = keyof typeof FOE_LOOK;
const LOOKS = Object.keys(FOE_LOOK) as Look[];
/** El aspecto de una pieza que es un enemigo (o null): la abeja o el murciélago, según su `n`. */
const lookOf = (p: Piece): Look | null => (p.k === 'dive' ? (p.n >= 2 ? (p.n === 2 ? 'sharky' : 'mako') : p.n % 2 ? 'bat' : 'bee') : p.k === 'side' && p.n === 1 ? 'skeleton' : p.k === 'fire' && p.n ? 'dragon' : p.k === 'foe' || p.k === 'side' || p.k === 'skull' || p.k === 'quake' || p.k === 'fire' ? p.k : null);
/** Las animaciones que los piratas (y el Capitán) llaman de otra forma: el mordisco es su tajo de espada, el salto, su
 * puñetazo, y el golpe recibido, su `HitReact`. Se añaden con el nombre de los monstruitos (lo que ya haya, se queda). */
const CLIP_ALIAS: Record<string, string> = { Bite_Front: 'Sword', Jump: 'Punch', HitRecieve: 'HitReact' };
function aliasClips(acts: Map<string, AnimationAction>): void {
  for (const [k, v] of Object.entries(CLIP_ALIAS)) if (!acts.has(k) && acts.has(v)) acts.set(k, acts.get(v)!);
}
/** Los que vuelan (sin andar: aletean). */
const FLY: readonly Look[] = ['bee', 'bat'];
/** El destello al cruzar un portal (s) y lo que mide el portal (m: el radio del aro). */
const FLASH_T = 0.9, PORTAL_R = 1.55;
/** Las ondas del cíclope a la vez, las bolas de fuego del demonio y lo alto del arco de cada cosa que se lanza (m). */
const WAVE_POOL = 2, FIRE_POOL = 2, FIRE_ARC = 1.3, SPIT_ARC = 0.25;
/** La cresta de la onda del cíclope: las rocas de cada fila (dos: la que revienta delante y la que se hunde detrás), lo que
 * se separan las filas (m) y lo que sube la de delante (m). */
const WAVE_ROCKS = 7, WAVE_ROW = 0.38, WAVE_UP = 0.24;
/** Lo que dura cada gesto que no se repite (s): morder, chafarse (y lo que tarda en esfumarse la seta pisada). */
const BITE_T = 0.9, SQUASH_T = 0.18, DIE_T = 1.3;

/** Un enemigo hecho (se reutiliza): su modelo con sus animaciones, la pieza que es ahora y lo que está haciendo. */
interface FoeRig {
  kind: Look;
  root: Group;
  model: Object3D;
  mixer: AnimationMixer;
  acts: Map<string, AnimationAction>;
  cur: string;
  p: Piece | null;
  /** Lo que hace: andar o esperar (según la pieza), morder (te ha mordido o, el cangrejo esquivado, al aire) o chafarse. */
  act: 'live' | 'bite' | 'miss' | 'die' | 'spit';
  t: number;
  /** Apartado a un lado tras morder (m) y hacia dónde. */
  off: number;
  dir: number;
}

/** El jefe del mundo: lo alto que se ve (m: más que tú), lo que dura su salto hacia atrás tras tu supersalto (s) y lo alto
 * que sube en él (m), lo que tarda en esfumarse derrotado (s) y lo alto que rueda la baja (m). */
const BOSS_H = 2, LEAP_T = 0.75, LEAP_UP = 1.4, BOSS_FADE = 2.2, ROLL_D = 0.45;
/** Un jefe hecho (uno de cada, reutilizado): su modelo y lo que hace. */
interface BossRig {
  root: Group;
  mixer: AnimationMixer;
  acts: Map<string, AnimationAction>;
  cur: string;
  p: Piece | null;
  /** Su salto hacia atrás (de dónde a dónde del sendero, y cuánto lleva: −1 sin salto), mareado, derrotado (s desde). */
  from: number;
  to: number;
  leapT: number;
  dizzy: boolean;
  dieT: number;
  starT: number;
}
/** Lo que lanza el jefe, en el aire: qué es, de dónde a dónde (en la arena), lo que lleva, lo que tarda en soltarlo y en llegar. */
interface BossShotFx {
  on: boolean;
  shot: BossShot;
  from: Vector3;
  to: Vector3;
  t: number;
  wind: number;
  dur: number;
}

/** El fondo realista gira con las curvas del sendero (pedido del usuario: quieto del todo con la pasarela, parecía de
 * cartón; con un 25 %, seguía pareciendo fijo): esta parte de lo que gira el mundo, en el mismo sentido (1 sería pegado al
 * paisaje; algo menos, que el mundo de cómic se note más cerca). Y lo que tiene que cambiar para pedírselo a IWSDK (rad). */
const PANO_FOLLOW = 0.6, PANO_STEP = 0.002;

/** Los escupitajos del cangrejo: cuántos puede haber a la vez. */
const SPIT_POOL = 3;
/** Un escupitajo que se ve: su cangrejo, desde dónde y hacia dónde vuela (en la arena), lo que lleva y lo que dura. */
interface SpitFx {
  /** Cómo se ve (estela, humo y fogonazo: src/style/missile-fx.ts) y dónde va ahora. */
  m: Missile;
  pos: Vector3;
  /** Lo alto de su arco (m): el escupitajo, casi recto; la bola de fuego, en arco. */
  arc: number;
  p: Piece | null;
  from: Vector3;
  to: Vector3;
  t: number;
  wind: number;
  dur: number;
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

/** Una muñeca para la lógica (lo que ve de ella, sin copiarla en cada fotograma). */
const armOf = (h: Hand): { ok: boolean; x: number; y: number; z: number } => ({
  get ok() {
    return h.ok && !h.est;
  },
  get x() {
    return h.wrist.x;
  },
  get y() {
    return h.wrist.y;
  },
  get z() {
    return h.wrist.z;
  },
});

/** Lo que se coge con la cabeza (frutas, barriles): se encoge a menos de esto de los ojos y desaparece a menos de esto (m). */
const EYE_FADE = 0.45, EYE_GONE = 0.12;

const NECK = new Vector3();

export class TrekSystem extends createSystem({}) {
  readonly runner: Runner;
  /** La altura de tus ojos de pie al calibrar. */
  calibRef = 1.6;
  private readonly rollF = new Vector3();
  /** Tus ojos, en el sitio del recorrido (cada fotograma). */
  private readonly eyeL = new Vector3();
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
  /** Las cornisas a la vista (el sendero del risco, estrecho). */
  private readonly narrow: [number, number][] = [];
  /** Las islas: los islotes que se mueven a la vista (los que suben y bajan y los que se hunden), los que se han quedado
   * quietos a ras al saltar hacia ellos (desde qué altura y cuándo) y cuándo empezó a hundirse cada uno. */
  private readonly movers: Piece[] = [];
  private readonly settled = new Map<number, { y: number; t: number }>();
  private readonly sinkAt = new Map<number, number>();
  /** Las balas de los cañonazos de la costa (dos a la vez como mucho): la pieza que es cada una y por dónde va. */
  private readonly balls: { m: Missile; p: Piece | null; pos: Vector3; from: Vector3; to: Vector3; gone: number }[] = [];
  /** Los portales (un aro de luz con su remolino; dos: el que viene y el que dejas atrás), el destello al cruzarlo, las rocas
   * de los desprendimientos y lo que lleva soplando cada racha (s). */
  private readonly portals: Group[] = [];
  /** Volando, a qué altura va cada portal (m, por su tramo): sigue la tuya, suave, para que lo cruces de verdad (pedido del
   * usuario: el portal quedaba abajo, en la pasarela, y nunca se pasaba por él). */
  private readonly portalY = new Map<number, number>();
  private portalMat!: ShaderMaterial;
  private flash!: Mesh;
  private flashT = 0;
  private readonly falls: { p: Piece | null; t: number; dur: number; rocks: Mesh[]; shade: Mesh }[] = [];
  private gustT = 0;
  private gustOn = false;
  /** El paisaje del primer tramo de un mundo nuevo, que se pone al cruzar su portal (−1: ninguno). */
  private pendingBiome = -1;
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
  /** Los jefes (uno de cada) y lo que lanzan (una piedra hecha al cargar los kits, reutilizada). */
  private readonly bossRigs: BossRig[] = [];
  private bossReady = false;
  private rock: Group | null = null;
  private readonly shotFx: BossShotFx = { on: false, shot: 'high', from: new Vector3(), to: new Vector3(), t: 0, wind: 1, dur: 1 };
  /** Las estelas del turbo y las alas de planear. */
  private wind!: InstancedMesh;
  private wings!: Wings;
  /** El mar de nubes bajo el risco y las islas (el vacío). */
  private sea!: CloudSea;
  /** El mar de la costa pirata. */
  private ocean!: Sea;
  private readonly fwd = new Vector3();
  private readonly winds: Wind[] = [];
  /** Los brillos de las frutas doradas a la vista (hechos al empezar y reutilizados). */
  private readonly goldGlow: Sprite[] = [];
  /** Los aros de luz del vuelo. */
  private readonly flyRings: Mesh[] = [];
  /** El aro conseguido: se abre a tu alrededor y se desvanece (pedido del usuario: pasar por los aros era poco satisfactorio);
   * cuándo empezó cada uno (s del reloj; −1, libre). */
  private readonly ringPops: { m: Mesh; t0: number }[] = [];
  /** Lo que se ve del vuelo para orientarse (fly-look.ts) y, para el sonido, si picabas o ibas en pica. */
  private flyLook!: FlyLook;
  private flyWas = { dive: false, pike: false };
  /** Los escupitajos y las bolas de fuego (hechos al empezar y reutilizados) y las ondas del cíclope. */
  private readonly spits: SpitFx[] = [];
  private readonly fires: SpitFx[] = [];
  private bossFx!: Missile;
  private readonly waves: { p: Piece | null; dustT: number; on: boolean; rocks: Mesh[] }[] = [];
  private readonly wdir = new Vector3();
  /** El giro del fondo realista que se pidió a IWSDK por última vez (rad). */
  private panoYaw = 0;
  /** Lo que se guardó al acabar la última ronda (la medalla y el fantasma). */
  last: PlatEnd | null = null;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'XYZ');
  private readonly qy = new Quaternion();
  private readonly qx = new Quaternion();
  private readonly xAxis = new Vector3(1, 0, 0);
  /** Las cuestas: lo alto del sendero bajo tus pies (m; ver gy), y dónde se ondulló el césped por última vez. */
  private hNow = 0;
  private groundD = NaN;
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
      // la cabeza, y lo que se gira de canto mirando al suelo (la rendija en plancha: el giro abierto)
      head: {
        get x() {
          return head.p.x;
        },
        get y() {
          return head.p.y;
        },
        get z() {
          return head.p.z;
        },
        // el cuello: unos 10 cm por detrás de las gafas y 7 por debajo (en la cabeza); girar la cabeza no lo mueve
        get px() {
          return head.p.x + NECK.set(0, -0.07, 0.1).applyQuaternion(head.q).x;
        },
        get pz() {
          return head.p.z + NECK.set(0, -0.07, 0.1).applyQuaternion(head.q).z;
        },
        // de canto (src/input/body-dir.ts: la línea de las orejas, no hacia dónde mira la cara)
        get roll() {
          return headRoll(head.q);
        },
        // hacia dónde mira el cuerpo (el vuelo mide escorarse en perpendicular a ella: src/input/body-dir.ts)
        get yaw() {
          const d = bodyDir(head.q, self.rollF);
          return Math.atan2(d.x, -d.z);
        },
      },
      // las muñecas (las que se ven de verdad: una calculada al perderla, no)
      hands: { l: armOf(hands.left), r: armOf(hands.right) },
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
      rnd: () => self.rnd(),
      store: (k) => store(k),
    };
    this.runner = new Runner(this.env);
  }

  /** El azar de la marcha (el recorrido): el de siempre o, para la partida simulada, uno con semilla (`seedRnd`: la prueba
   * no puede depender de que salga un reto que sepa pasar con el teclado). */
  private rnd: () => number = Math.random;
  seedRnd(seed: number | null): void {
    let a = (seed ?? 0) >>> 0;
    this.rnd = seed === null ? Math.random : () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  init(): void {
    HOOKS.flyCoach = () => this.runner.coachAgain();
    this.world.createTransformEntity(this.root);
    this.root.visible = false;
    // el césped de debajo de la pasarela: su dibujo corre y gira con el mundo (no patina bajo lo apoyado)
    this.groundTex = groundTexture('nature');
    this.groundTex.repeat.set(GROUND_SIZE / GROUND_CELL, GROUND_SIZE / GROUND_CELL);
    // (en una rejilla de 4 m: con las cuestas, el césped ondula con el sendero; ver groundHills)
    const g = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SIZE / GROUND_CELL, GROUND_SIZE / GROUND_CELL);
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
    // las alas de luz al planear (en la arena, junto a tus brazos)
    this.wings = new Wings();
    this.world.createTransformEntity(this.wings.group);
    // el mar de nubes del risco (con el resto de la Travesía: se esconde con ella)
    this.sea = new CloudSea();
    this.root.add(this.sea.mesh);
    warmKeep(new Mesh(this.sea.mesh.geometry, this.sea.mesh.material));
    // el mar de la costa
    this.ocean = new Sea();
    this.root.add(this.ocean.mesh);
    warmKeep(new Mesh(this.ocean.mesh.geometry, this.ocean.mesh.material));
    warmKeep(new InstancedMesh(this.wind.geometry, this.wind.material, 1)); // (instanciada como la de verdad: el mismo sombreador)
    // el brillo redondo (de las doradas)
    const n = 32, d = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d.set([255, 255, 255, Math.round(255 * Math.pow(Math.max(0, 1 - Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2), 2))], (y * n + x) * 4);
    const gt = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
    gt.magFilter = gt.minFilter = LinearFilter;
    gt.needsUpdate = true;
    // los escupitajos del cangrejo, las bolas de fuego del demonio y lo que lanza el jefe: con su luz, su estela y su humo
    // (fuera del mundo que baja y sube: vuelan en la arena)
    const missile = (look: MissileLook): Missile => {
      const m = new Missile(look);
      this.world.createTransformEntity(m.group);
      return m;
    };
    for (let i = 0; i < SPIT_POOL; i++) this.spits.push({ m: missile(LOOK_SPIT), pos: new Vector3(), p: null, arc: SPIT_ARC, from: new Vector3(), to: new Vector3(), t: 0, wind: 0, dur: 1 });
    for (let i = 0; i < 2; i++) this.balls.push({ m: missile(LOOK_CANNON), p: null, pos: new Vector3(), from: new Vector3(), to: new Vector3(), gone: 0 });
    for (let i = 0; i < FIRE_POOL; i++) this.fires.push({ m: missile(LOOK_FIRE), pos: new Vector3(), p: null, arc: FIRE_ARC, from: new Vector3(), to: new Vector3(), t: 0, wind: 0, dur: 1 });
    this.bossFx = missile(LOOK_BOSS[0]);
    // la onda del cíclope: la llevan las partículas (polvo que salta a su paso: src/style/vfx.ts)
    // (y una cresta de rocas al rojo que revientan las tablas a su paso: lo que hay que saltar, que se vea bien; pedido del
    // usuario: solo con el polvo no se sabía cuándo saltar)
    const L = looks();
    for (let i = 0; i < WAVE_POOL; i++) {
      const rocks: Mesh[] = [];
      for (let j = 0; j < WAVE_ROCKS * 2; j++) {
        const m = new Mesh(L.geo.meteor, L.mat.meteor);
        m.userData.noInk = true;
        m.visible = false;
        m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        this.root.add(m);
        rocks.push(m);
      }
      this.waves.push({ p: null, dustT: 0, on: false, rocks });
    }
    // los portales entre mundos: un aro de luz con chispas y, dentro, un remolino que gira (elegido por el usuario)
    this.portalMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q), a = atan(q.y, q.x);
          float sw = sin(a * 5.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5, sw2 = sin(a * 3.0 - r * 14.0 + uTime * 2.6) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.55, 0.95), sw) * (0.55 + 0.6 * sw2);
          c += vec3(1.0) * smoothstep(0.35, 0.0, r) * 0.9;
          float al = smoothstep(1.0, 0.82, r) * (0.55 + 0.35 * sw);
          gl_FragColor = vec4(c * al, al); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    const ringMat = new MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false }), ringGeo = new TorusGeometry(PORTAL_R, 0.09, 10, 48), discGeo = new CircleGeometry(PORTAL_R, 48);
    for (let i = 0; i < 2; i++) {
      const g = new Group(), ring = new Mesh(ringGeo, ringMat), disc = new Mesh(discGeo, this.portalMat);
      ring.userData.noInk = disc.userData.noInk = true;
      g.add(ring, disc);
      g.visible = false;
      this.root.add(g);
      this.portals.push(g);
    }
    warmKeep(new Mesh(ringGeo, ringMat));
    warmKeep(new Mesh(discGeo, this.portalMat));
    // el destello al cruzarlo: una esfera blanca alrededor de la cabeza que se apaga
    this.flash = new Mesh(new SphereGeometry(0.6, 16, 10), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, toneMapped: false, fog: false }));
    this.flash.renderOrder = 60;
    this.flash.visible = false;
    this.flash.userData.noInk = true;
    this.world.createTransformEntity(this.flash);
    // las rocas de los desprendimientos (roca de verdad, sin brasas: la del lanzador sin su fuego)
    const rockMat = new MeshStandardMaterial({ color: 0x8a7e72, roughness: 1, flatShading: true });
    // y su sombra en el suelo, que crece y se oscurece mientras caen (en plancha, mirando al suelo, las rocas de arriba no se
    // ven: lo que hay que ver, a ras de suelo; docs/REGLAS.md). Una mancha redonda y blanda, de color liso
    const sn = 32, sd = new Uint8Array(sn * sn * 4);
    for (let y = 0; y < sn; y++) for (let x = 0; x < sn; x++) sd.set([255, 255, 255, Math.round(255 * Math.pow(Math.max(0, 1 - Math.hypot((x + 0.5) / sn - 0.5, (y + 0.5) / sn - 0.5) * 2), 0.7))], (y * sn + x) * 4);
    const st = new DataTexture(sd, sn, sn, RGBAFormat, UnsignedByteType);
    st.magFilter = st.minFilter = LinearFilter;
    st.needsUpdate = true;
    const shadeMat = new MeshBasicMaterial({ color: 0x140c08, map: st, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    const shadeGeo = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const rocks: Mesh[] = [];
      for (let j = 0; j < 3; j++) {
        const m = new Mesh(looks().geo.meteor, rockMat);
        m.castShadow = true;
        m.visible = false;
        this.root.add(m);
        rocks.push(m);
      }
      const shade = new Mesh(shadeGeo, shadeMat.clone()); // (cada una, su opacidad)
      shade.userData.noInk = true;
      shade.renderOrder = 2;
      shade.visible = false;
      this.root.add(shade);
      this.falls.push({ p: null, t: 0, dur: 1, rocks, shade });
    }
    warmKeep(new Mesh(looks().geo.meteor, rockMat));
    warmKeep(new Mesh(shadeGeo, shadeMat));
    // el brillo dorado de las doradas (en el mundo que baja y sube: va con ellas)
    const goldMat = new SpriteMaterial({ map: gt, color: 0xffd166, transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const g = new Sprite(goldMat);
      g.userData.noInk = true;
      g.scale.setScalar(0.75);
      g.visible = false;
      this.root.add(g);
      this.goldGlow.push(g);
    }
    warmKeep(new Sprite(goldMat));
    // los aros de luz del vuelo (dorados, que brillan): unos pocos, reutilizados
    const flyMat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
    const flyGeo = new TorusGeometry(RING_R, 0.12, 10, 56);
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(flyGeo, flyMat.clone());
      m.userData.noInk = true;
      m.renderOrder = 6;
      m.visible = false;
      this.root.add(m);
      this.flyRings.push(m);
    }
    warmKeep(new Mesh(flyGeo, flyMat));
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(flyGeo, flyMat.clone());
      m.userData.noInk = true;
      m.renderOrder = 6;
      m.visible = false;
      this.root.add(m);
      this.ringPops.push({ m, t0: -1 });
    }
    this.flyLook = new FlyLook();
    this.root.add(this.flyLook.inWorld);
    this.world.createTransformEntity(this.flyLook.inRoom);
  }

  private get on(): boolean {
    return settings.mode === 'trek';
  }

  /** El estado de la partida que ve la lógica. */
  /** ¿Se juega ahora (ya calibrado y fuera de los descansos)? */
  playing(): boolean {
    return this.state() === 'play';
  }

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
    // (volando sobre el mapa de una ciudad: el recorrido, sin retos; lo pinta MapSystem, src/modes/trek/map/)
    this.runner.mapMode = mapWanted();
    this.runner.reset();
    FB.clear(this.clock);
    this.runner.addTramo(0, tramoLen(waveReps(0)));
    this.pendingBiome = -1;
    this.setBiome(0);
    this.applyEvents();
  }

  /** El asistente del vuelo en marcha: la partida no cuenta el descanso ni la cuenta atrás hasta que acabe. */
  holding(): boolean {
    return this.runner.coaching;
  }

  /** Ya calibrado (quieto 2 s): tu altura y el centro. Si la partida te recoloca (`turned`: el mundo se desliza 0,8 s hasta
   * dejar tu cabeza en (0, 0) mirando a −Z), el centro es ese, el de después, y no donde estás ahora: tomado antes, quedaba
   * desplazado y girado (la caja negra del usuario: el vuelo, apartado 2,2 m y sin hacer caso a la cabeza). */
  calibrated(y: number, turned = false): void {
    this.calibRef = y;
    if (turned) this.runner.calibrate(y, 0, 0, 0);
    else this.runner.calibrate(y, head.p.x, head.p.z);
  }

  /** Empieza el tramo i: el cofre del anterior se esfuma y el siguiente se monta ya (para verlo llegar de lejos). */
  startWave(i: number): void {
    const R = this.runner;
    R.startTramo();
    R.addTramo(i, tramoLen(waveReps(i)));
    const N = nWaves();
    if (!N || i + 1 < N) R.addTramo(i + 1, tramoLen(waveReps(i + 1)));
    // (el primer tramo de un mundo nuevo: su paisaje, al cruzar el portal)
    if (i > 0 && worldStart(i, R.worldLen)) this.pendingBiome = i;
    else this.setBiome(i);
    this.applyEvents();
  }

  /** El paisaje del tramo i (el fondo realista, la niebla y la luz; los árboles van con el sendero: `biomeAt`). */
  private setBiome(i: number): void {
    const B = tramoBiome(i, this.runner.worldLen), B0 = TREK_BIOMES[0];
    this.biome = i;
    // (el césped de abajo: en el risco no hay; bajo el vacío se ve el valle de la foto de fondo, muy abajo)
    const cliff = WORLDS[this.runner.worldAt(this.runner.dist) % WORLDS.length].floor !== 'dock';
    this.ground.position.y = cliff ? CLIFF_FLOOR_Y : GROUND_Y;
    this.ground.visible = !cliff;
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
    return tramoDeco(i, this.runner.worldLen);
  }

  /** ¿El punto s del sendero es del risco? (Cambia en cada portal.) */
  private floorAt(s: number): FloorStyle {
    return WORLDS[this.runner.worldAt(s) % WORLDS.length].floor;
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
  hud(): { dist: number; kmh: number; turbo: boolean; left: number; stop: string; tramo: number; energy: number; superT: number; ghost: number | null; gold: number; goldOf: number; boss: number } {
    const R = this.runner, i = Math.max(0, GAME.wave - 1);
    return { dist: R.dist, kmh: R.v * 3.6, turbo: R.tk.turbo, left: R.toChest(i), stop: R.stop?.k ?? '', tramo: i, energy: R.energy, superT: R.superT, ghost: R.ghostDiff(), gold: R.golds[i] ?? 0, goldOf: R.goldsOf(i), boss: R.fight ? BOSS_HP - R.fight.p.got : 0 };
  }

  /** Para la partida simulada: lo esencial en datos simples. */
  snapshot(): Record<string, unknown> {
    const R = this.runner, nx = R.live.find((p) => !p.judged);
    // (para la partida simulada, que juega por lo que ve aquí y no por esperas: si lo que viene aún anda hacia ti —`walk`, con
    // su paso, `foeV`— y, del jefe, cuánto hace que avisó —`t`—, cuándo llega lo que lanza —`hit`— y sus mareos sin golpe)
    return { next: nx ? { k: nx.k, rel: +(nx.at + nx.walk - R.dist).toFixed(2), side: nx.side, walk: +nx.walk.toFixed(2) } : null, foeV: R.foeV, dist: +R.dist.toFixed(2), v: +R.v.toFixed(2), turbo: R.tk.turbo, stop: R.stop?.k ?? '', energy: +R.energy.toFixed(2), superT: +R.superT.toFixed(1), plank: R.moves.plank, lev: +R.lev.toFixed(2), hop: !!R.hop, chest: R.chest?.tramo ?? -1, passed: R.passed, hits: R.hits, live: R.live.map((p) => p.k), ends: R.ends.map((e) => Math.round(e)), keys: R.keys, fruits: R.fruits, biome: this.biome, pano: this.pano, foes: this.rigs.filter((r) => r.p && r.root.visible).map((r) => `${r.kind}:${r.cur}`), wind: this.wind.visible, ghost: R.ghostDiff(), last: this.last && { medal: this.last.medal?.[0] ?? null, dist: this.last.dist }, boss: R.fight ? { phase: R.fight.phase, shot: R.fight.shot, got: R.fight.p.got, t: +R.fight.t.toFixed(2), hit: R.bossWind + BOSS_FLY, misses: R.fight.misses } : null, bosses: R.bosses, world: R.world };
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
    for (const B of this.balls) {
      B.p = null;
      B.m.stop();
    }
    this.settled.clear();
    this.sinkAt.clear();
    this.looks.clear();
    this.knock.clear();
    this.gone.clear();
    this.floorS0 = NaN;
    for (const r of this.rigs) this.freeRig(r);
    this.rigOf.clear();
    for (const b of this.bossRigs) this.freeBoss(b);
    for (const S of this.spits) {
      S.p = null;
      S.m.stop();
    }
    for (const S of this.fires) {
      S.p = null;
      S.m.stop();
    }
    this.bossFx?.stop();
    for (const w of this.waves) {
      w.p = null;
      for (const m of w.rocks) m.visible = false;
    }
    for (const F of this.falls) {
      F.p = null;
      for (const m of F.rocks) m.visible = false;
      F.shade.visible = false;
    }
    this.shotFx.on = false;
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
    if (!this.bossReady) this.bossReady = this.buildBoss();
    // (sobre el mapa, la ciudad en vez del recorrido: lo de la Travesía, escondido)
    this.root.visible = !this.runner.mapMode;
    if (GAME.paused) return;
    if (GAME.phase === 'playing') {
      this.runner.step(dt);
      // la caja negra del vuelo (src/core/flybox.ts): para afinar los controles con tu vuelo de verdad
      if (this.runner.fly) FB.rec(this.clock, dt, this.runner, this.env.head, this.env.hands, num('flyBoard') > 0);
    }
    // echado (en plancha, bajo un túnel): los avisos, en el suelo bajo la cara (de pie, delante, no se leerían)
    VIEW.prone = GAME.phase === 'playing' && (this.runner.moves.plank || this.runner.prone); // (en plancha, siempre)
    this.applyEvents();
    this.stepAnims(dt);
    this.draw();
    this.drawFoes(dt);
    this.drawBoss(dt);
    this.stepSpits(dt);
    this.stepWind(dt);
    this.stepWorld(dt);
    // planeando de verdad (con los brazos en cruz), las alas
    // (en plancha no hay brazos en cruz: sin alas, con las estelas de viento)
    const H = this.runner.hop, glide = GAME.phase === 'playing' && !GAME.paused && !!H?.glide && H.won && !H.bad && !this.runner.prone;
    if (this.runner.fly) this.flyWings(dt);
    else this.wings.update(GAME.paused ? 0 : dt, glide, head.p, headFwd(this.fwd), this.env.hands.l, this.env.hands.r);
  }

  /** Volando: el sonido (el viento al picar, un golpe de aire al aletear, un siseo al frenar en pica). Sin alas: pegadas a la
   * cabeza llenaban la vista y salían delante y detrás (lo vio el usuario en las gafas); lo que dice qué gesto se ha leído es
   * la sombra, que se ladea, se pliega, se abre y bate. */
  private flyWings(dt: number): void {
    const G = this.runner.glider, on = GAME.phase === 'playing' && !GAME.paused && !GAME.between && G.alt > 0.5;
    if (on) {
      if (G.diving && !this.flyWas.dive) playSound('arco-pasa', null, 0.9, 1.3);
      if (G.pike && !this.flyWas.pike) playSound('arco-pasa', null, 0.55, 0.7);
      if (G.flapped) playSound('ataque-volador', null, 0.5, 0.75);
    }
    this.flyWas.dive = G.diving;
    this.flyWas.pike = G.pike;
    this.wings.update(GAME.paused ? 0 : dt, false, head.p, headFwd(this.fwd), this.env.hands.l, this.env.hands.r);
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
    this.turnPano(0); // (los demás modos, con el fondo derecho)
    this.pano = TREK_BIOMES[0].pano;
    this.wind.visible = false;
    (this.wind.material as MeshBasicMaterial).opacity = 0; // (al volver, sin estelas que se apagan)
    if (this.flyLook) this.flyLook.inRoom.visible = false; // (las reglillas del vuelo van en la habitación)
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
    // (las rocas del risco: dos por trozo del sendero y la pared, más de las que caben en una pieza)
    for (const n of KIT_MODELS.island) if (n !== 'Dock') add('island', n, isl[n], n === 'Cliff1' || n === 'Cliff4' || n === 'Dock_Pole' ? CAP_CLIFF : CAP_PIECE, true);
    for (const n of KIT_MODELS.food) add('food', n, food[n], CAP_FOOD, true);
    // (las rocas medianas y la seta, también de las piezas de plancha: la rendija, las manos juntas, el paso lateral, la palmada)
    for (const n of Object.keys(nat)) add('nature', n, nat[n], n.startsWith('Rock_Medium') || n === 'Mushroom_Common' ? CAP_DECO + CAP_PIECE : CAP_DECO, false);
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
        if (e.p.k === 'boss') this.takeBoss(e.p);
        else if (lookOf(e.p)) this.takeRig(e.p);
        else this.looks.set(e.p.id, piecePuts(e.p, this.calibRef, []));
        break;
      case 'hide': {
        this.settled.delete(e.p.id);
        this.sinkAt.delete(e.p.id);
        this.looks.delete(e.p.id);
        this.knock.delete(e.p.id);
        this.gone.delete(e.p.id);
        const r = this.rigOf.get(e.p.id);
        if (r) this.freeRig(r);
        for (const w of this.waves) if (w.p === e.p) w.p = null;
        const b = this.bossRigs.find((x) => x.p === e.p);
        if (b) this.freeBoss(b);
        break;
      }
      case 'boss':
        this.bossEv(e.p, e.act, e.from, e.to);
        break;
      case 'bthrow': {
        // el jefe echa el brazo atrás (el aviso) y lanza: la alta y la del cuerpo, desde arriba; la baja, rodando por el suelo
        const F = this.shotFx, low = e.shot === 'low';
        F.on = true;
        F.shot = e.shot;
        F.t = 0;
        F.wind = e.wind;
        F.dur = e.dur;
        F.to.set(e.aim.x, e.aim.y, e.aim.z);
        // (en plancha, todo sale de abajo, de sus pies: con la cabeza hacia el suelo no se veía salir lo que lanzaba desde
        // la mano; pedido del usuario)
        const pr = this.runner.prone;
        this.world3({ s: e.p.at + BOSS_Z - 0.5, u: low || pr ? 0 : 0.35, y: low ? ROLL_D / 2 : pr ? 0.35 : BOSS_H * 0.8 }, F.from);
        // (cada jefe, lo suyo: el Yeti, nieve; el Demonio verde, fuego verde; el Alien alto, plasma)
        this.bossFx.setLook(LOOK_BOSS[e.p.n % LOOK_BOSS.length]);
        const b = this.bossRigs.find((x) => x.p === e.p);
        if (b) this.bossClip(b, 'Bite_Front', true);
        SND.hiss(F.from, 1.1, BOSSES[e.p.n % BOSSES.length].voice);
        break;
      }
      case 'bdodge': {
        const F = this.shotFx;
        if (F.on) {
          // te da: estalla delante de la cara (a medio metro: nada pegado a los ojos); esquivada, sigue de largo y se apaga
          if (e.ok) this.bossFx.coast(0.4);
          else {
            // (a 1,3 m, delante: más cerca, el fogonazo llenaría la vista)
            const at = this.v.copy(F.from).sub(F.to).setLength(1.3).add(F.to);
            this.bossFx.hit(at);
          }
        }
        F.on = false;
        break;
      }
      case 'wake': {
        // la seta, el cangrejo, la calavera o el picado echan a andar (o a volar) hacia ti: su voz
        const L = FOE_LOOK[lookOf(e.p) ?? 'foe'];
        SND.hiss(this.world3({ s: e.p.at + e.p.walk, u: e.p.k === 'side' ? e.p.side * CRAB_U : 0, y: 0.3 }, this.at), 1, L.voice);
        break;
      }
      case 'world': {
        // has cruzado el portal: un destello blanco, el paisaje del mundo nuevo y su suelo
        this.flashT = FLASH_T;
        if (this.pendingBiome >= 0) this.setBiome(this.pendingBiome);
        this.pendingBiome = -1;
        haptic('left', 0.8, 200);
        haptic('right', 0.8, 200);
        this.deco.clear();
        this.floorS0 = NaN;
        break;
      }
      case 'cannon': {
        // el barco dispara: fogonazo y humo en la boca del cañón, el estampido, y la bala sale hacia ti
        const B = this.balls.find((x) => !x.p) ?? this.balls[0];
        B.p = e.p;
        B.gone = 0;
        const at = this.muzzle(e.p, this.at), V = vfx();
        V.flames(at, 10, 0.5, 0.5, PAL.fire, 0.4, 0, 0.5);
        V.puffs(at, 10, 0.6, 1.6, PAL.smoke, 1.2, 0.6, 2.5, 0.8);
        SND.explosion(at, true);
        haptic('left', 0.3, 60);
        haptic('right', 0.3, 60);
        break;
      }
      case 'settle':
        // el islote que sube y baja se queda quieto a ras mientras saltas hacia él (bien o mal)
        this.settled.set(e.p.id, { y: e.y, t: this.clock });
        break;
      case 'sinking': {
        // el islote empieza a hundirse bajo tus pies: cruje y se le sueltan piedras por debajo
        this.sinkAt.set(e.p.id, this.clock);
        const V = vfx();
        for (let i = 0; i < 3; i++) V.bits(this.world3({ s: e.p.at + (i + 0.5) * (e.p.len / 3), u: 0, y: -1.2 }, this.at), 6, 0.05, 1.5, 1, PAL.debris);
        haptic('left', 0.35, 80);
        haptic('right', 0.35, 80);
        break;
      }
      case 'rockfall': {
        // el desprendimiento: unas rocas se sueltan de lo alto de la pared y caen a su lado del camino (con su ruido)
        const F = this.falls.find((x) => !x.p);
        if (F) {
          F.p = e.p;
          F.t = 0;
          F.dur = e.dur;
        }
        SND.metalHit(this.world3({ s: e.p.at, u: e.p.side * 0.5, y: 6 }, this.at), true);
        break;
      }
      case 'slam': {
        // el cíclope golpea el suelo (salta y cae): su voz y, al caer, la onda
        this.rigAct(e.p, 'spit');
        SND.hiss(this.world3({ s: e.p.at, u: e.p.side * ASIDE_U, y: 1 }, this.at), 1.4, FOE_LOOK.quake.voice);
        const w = this.waves.find((x) => !x.p);
        if (w) {
          w.p = e.p;
          w.dustT = 0;
          w.on = false;
        }
        break;
      }
      case 'spit': {
        // el cangrejo se encabrita (el aviso) y escupe hacia donde estaba tu cabeza; el demonio lanza su bola de fuego en arco
        const fire = e.p.k === 'fire';
        const S = (fire ? this.fires : this.spits).find((x) => !x.p);
        if (S) {
          S.p = e.p;
          S.t = 0;
          S.wind = e.wind;
          S.dur = e.dur;
          S.to.set(e.aim.x, e.aim.y, e.aim.z);
          this.spitFrom(e.p, S.from);
          S.pos.copy(S.from);
          S.m.charge(S.pos, 0.05);
        }
        this.rigAct(e.p, 'spit');
        SND.hiss(this.world3({ s: e.p.at + e.p.walk, u: e.p.side * (fire ? ASIDE_U : CRAB_U), y: 0.3 }, this.at), 1.2, FOE_LOOK[lookOf(e.p) ?? 'side'].voice);
        break;
      }
      case 'spat': {
        const fire = e.p.k === 'fire';
        const S = (fire ? this.fires : this.spits).find((x) => x.p === e.p);
        if (S) {
          // te da: salpica de baba (o de fuego) delante de la cara (a medio metro: las chispas no se pintan pegadas a los ojos);
          // esquivado, se deshace a tu lado
          if (e.ok) S.m.coast(0.35);
          else {
            // (a 1,2 m, delante: más cerca, el fogonazo llenaría la vista)
            const at = this.v.copy(S.from).sub(S.to).setLength(1.2).add(S.to);
            S.m.hit(at);
          }
          S.p = null;
        }
        break;
      }
      case 'chest': {
        // al llegar, el cofre se abre: lleno de oro, y de su boca salen flotando, uno tras otro, lo que lleva (la llave, la
        // gema, los puntos y, con la última llave, el tesoro), que arriba se esfuman: recibidos (src/ui/prize-system.ts)
        this.looks.set(e.p.id, chestPuts(true, []));
        const items: Parameters<typeof HOOKS.prize>[1] = [
          { icon: 'key', text: `Llave ${e.key}/${TREASURE_KEYS}`, color: '#ffc531' },
          { icon: 'gem', text: `Gema nº ${e.gem}`, color: '#3cd8ff' },
          { icon: 'coins', text: `+${e.pts}`, color: '#ffd166' },
        ];
        if (e.goldsOf) items.push({ icon: 'perk', text: `Doradas ${e.golds}/${e.goldsOf}`, color: '#ffd166' });
        if (e.treasure) items.push({ icon: 'treasure', text: `¡Tesoro! +${e.treasure}`, color: '#ff9a3c' });
        HOOKS.prize(this.world3({ s: e.p.at + 0.6, u: 0, y: 0.75 }, this.at), items);
        break;
      }
      case 'trophy':
        HOOKS.trophy(e.title, e.sub);
        break;
      case 'pick': {
        // una fruta comida (la del arco, la del planeo o la del aire): chispas de colores y su sonido (pedido del usuario: sin
        // sonido no se sabía si se había cogido). Volando, las chispas algo por delante (pegadas a los ojos no se ven)
        const P = e.p, u = (e.i + 0.5) / Math.max(1, P.n), gl = P.k === 'glide', col = [0xff6a8a, 0xffd166, 0x8cff99, 0xff9a3c][e.i % 4];
        if (P.k === 'berries') HOOKS.sparks(this.world3({ s: P.at + u * P.len + 1.4, u: P.u, y: P.h + this.calibRef }, this.at), 10, col);
        else {
          const y = gl ? GLIDE_LIFT * glideArc((u * P.len) / (P.len + LAND_PAST)) : 0.45 * 4 * u * (1 - u);
          HOOKS.sparks(this.world3({ s: P.at + u * P.len, u: gl ? glideU(P, e.i) : 0, y: this.calibRef - 0.05 + y }, this.at), 8, col);
        }
        SND.orb(this.at.copy(head.p), false);
        break;
      }
      case 'gold': {
        // la dorada: una lluvia de chispas doradas
        const P = e.p, st = P.k === 'step';
        HOOKS.sparks(this.world3({ s: P.at + (st ? P.len / 2 : 0), u: 0, y: (st ? P.h : GOLD_Y) + this.calibRef }, this.at), 36, 0xffd166);
        break;
      }
      case 'store':
        store(e.key, e.val);
        break;
      case 'set':
        setSetting(e.key, e.val); // (el asistente del vuelo: el ajuste del movimiento que acabas de notar)
        break;
      case 'coachAsk': {
        // su pregunta, en las teclas de un menú (se pulsan con una mano, de rodillas o apoyado en la otra)
        const R = this.runner, ans = (a: 'much' | 'ok' | 'little') => (): void => R.coachAnswer(a);
        HOOKS.openScreen(
          [
            { t: 'title', text: e.text, color: '#3cf0c6' },
            { t: 'text', text: 'Demasiado: se mueve con nada · Poco: cuesta moverlo', color: '#a49fc8' },
            { t: 'btns', items: [{ label: 'Demasiado', accent: '#ff8a3d', onPress: ans('much') }, { label: 'Bien', style: 'primary', onPress: ans('ok') }, { label: 'Poco', accent: '#7fb4ff', onPress: ans('little') }], h: 0.1 },
          ],
          { accent: '#3cf0c6', low: true },
        );
        break;
      }
      case 'coachClose':
        HOOKS.closeScreen();
        break;
      case 'note':
        diagEvent(`Travesía: ${e.text}`);
        break;
      case 'halt':
      case 'go':
      case 'pass':
        this.diag(e.t, e.p);
        if (e.p.k === 'ring') this.ringPop(e.p);
        if (e.p.k === 'fruit') {
          // la fruta cogida: chispas de su color, su sonido y se encoge (se la come)
          SND.orb(this.at.copy(head.p), !!e.p.special);
          this.gone.set(e.p.id, { t: 0, dir: 0 });
          HOOKS.sparks(this.world3({ s: e.p.at, u: e.p.side * FRUIT_U, y: this.calibRef }, this.at), e.p.special ? 30 : 14, e.p.special ? 0xc8ff3a : 0xffd166);
        }
        // el barril sorpresa, roto de un cabezazo: astillas y fruta, y se deshace
        if (e.t === 'pass' && e.p.k === 'box') {
          this.gone.set(e.p.id, { t: 0, dir: 0 });
          const at = this.world3({ s: e.p.at, u: 0, y: this.calibRef + 0.35 }, this.at);
          HOOKS.sparks(at, 18, 0xb07a44);
          HOOKS.sparks(at, 12, 0xffd166);
        }
        // en plancha: las frutas lejanas y las uvas cogidas, y la seta chafada de una palmada, se van con chispas
        if (e.p.k === 'reach' || e.p.k === 'paw' || e.p.k === 'slap') {
          if (e.p.k !== 'reach') this.gone.set(e.p.id, { t: 0, dir: 0 });
          HOOKS.sparks(this.world3({ s: e.p.at + e.p.len / 2, u: e.p.k === 'reach' ? 0 : e.p.side * PAW_U, y: 0.15 }, this.at), 16, e.p.k === 'slap' ? 0xff5a5a : 0xffd166);
          if (e.p.k === 'slap') SND.squish(this.world3({ s: e.p.at, u: e.p.side * PAW_U, y: 0.1 }, this.at));
        }
        // la seta pisada se chafa; el cangrejo y la calavera esquivados muerden el aire; el picado esquivado sigue de largo
        if (e.t === 'pass' && (e.p.k === 'foe' || e.p.k === 'side' || e.p.k === 'skull' || e.p.k === 'dive')) this.rigAct(e.p, e.p.k === 'foe' ? 'die' : 'miss');
        break;
      case 'hit':
        this.diag('hit', e.p);
        const lk = lookOf(e.p);
        if (lk) {
          // te muerde (y se aparta a un lado: nunca se atraviesa)
          if (e.p.k !== 'quake' && e.p.k !== 'fire') this.rigAct(e.p, 'bite');
          SND.hiss(this.world3({ s: e.p.at + e.p.walk, u: e.p.k === 'side' ? e.p.side * CRAB_U : 0, y: 0.3 }, this.at), 1, FOE_LOOK[lk].voice);
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
    // (volando, lo que lee el vuelo: el lado y lo de atrás respecto a su centro, y lo que bajas el pecho)
    const B = this.runner.flyBody, f = (v: number): string => (v >= 0 ? '+' : '') + v.toFixed(2);
    const how = this.runner.fly ? `vuelo: lado ${f(B.side)} atrás ${f(-B.fwd)} abajo ${f(M.down)} · cabeza ${f(head.p.x)},${f(head.p.z)} · centro ${f(B.x0)},${f(B.z0)}` : `cabeza sube ${f(M.up)} baja ${f(M.down)} lado ${f(M.dx)}`;
    diagEvent(`Travesía: ${w} ${p.k} (${Math.round(p.at)} m) · ${how}${p.k === 'log' ? ` · subió ${p.maxUp.toFixed(2)}${p.fast ? ' deprisa' : ''}` : ''}`);
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
    this.runner.tk.bend(at.s, at.u - this.runner.uShift, this.bp);
    return out.set(this.bp.x, at.y + this.runner.dip + this.gy(at.s), this.bp.z);
  }

  /** El césped, con las cuestas: cada punto de su rejilla, a la altura del sendero a esa distancia por delante o por detrás
   * (el césped gira con el sendero en tu punto: su −z es hacia delante). Solo si te has movido o ha cambiado algo. */
  private groundHills(d: number): void {
    const R = this.runner, on = R.grades.length > 0 && this.ground.visible;
    if (!on && this.groundD !== this.groundD) return; // (llano y ya llano)
    if (on && Math.abs(d - this.groundD) < 0.2) return;
    const pos = this.ground.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, on ? R.heightAt(d - pos.getZ(i)) - this.hNow : 0);
    pos.needsUpdate = true;
    this.groundD = on ? d : NaN;
  }

  /** Las cuestas (grade.ts): lo que está más alto o más bajo el sendero en s que bajo tus pies (m). */
  private gy(s: number): number {
    return this.runner.grades.length ? this.runner.heightAt(s) - this.hNow : 0;
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

  /** Lo del vuelo que no son modelos de los kits: los aros de luz (de un montón hecho una vez) y las corrientes de aire
   * (remolinos de polvo claro que suben). */
  private drawFly(lite: boolean): void {
    const R = this.runner;
    let ri = 0;
    if (R.fly && !lite)
      for (const p of R.live) {
        if (p.k === 'ring' && !p.judged && ri < this.flyRings.length) {
          const g = this.flyRings[ri++], ry = R.tk.bend(p.at, p.u - R.uShift, this.bp);
          g.position.set(this.bp.x, p.h + this.calibRef + this.gy(p.at), this.bp.z);
          g.rotation.set(0, ry, this.clock * 0.6);
          (g.material as MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(this.clock * 4 + p.id);
          g.visible = true;
        } else if (p.k === 'updraft' && !p.judged && !GAME.paused && Math.random() < 0.5) {
          // (la corriente: remolinos claros que suben por ella)
          const at = this.world3({ s: p.at + Math.random() * p.len, u: p.u + (Math.random() - 0.5) * 1.6, y: GROUND_Y + Math.random() * 9 }, this.at);
          vfx().puffs(at, 1, 0.45, 1.4, PAL.snow, 0.15, 2.4, 2, 0.32);
        }
      }
    for (let i = ri; i < this.flyRings.length; i++) this.flyRings[i].visible = false;
    // los aros conseguidos: se abren (hasta casi 3 veces) y se desvanecen en 0,7 s
    for (const P of this.ringPops) {
      if (P.t0 < 0) continue;
      const k = (this.clock - P.t0) / 0.7;
      if (k >= 1 || lite) {
        P.m.visible = false;
        P.t0 = -1;
        continue;
      }
      P.m.scale.setScalar(1 + 1.8 * k * (2 - k));
      (P.m.material as MeshBasicMaterial).opacity = 0.95 * (1 - k) * (1 - k);
    }
  }

  /** El aro conseguido: se abre desde donde estaba, chispas doradas por delante (pegadas a los ojos no se ven), su sonido y
   * una vibración en las dos manos. */
  private ringPop(p: Piece): void {
    const R = this.runner, P = this.ringPops.reduce((a, b) => (a.t0 <= b.t0 ? a : b));
    const ry = R.tk.bend(p.at, p.u - R.uShift, this.bp);
    P.m.position.set(this.bp.x, p.h + this.calibRef + this.gy(p.at), this.bp.z);
    P.m.rotation.set(0, ry, 0);
    P.m.scale.setScalar(1);
    P.m.visible = true;
    P.t0 = this.clock;
    for (let i = 0; i < 2; i++) {
      const at = this.world3({ s: p.at + 1.6 + i * 0.8, u: p.u + (i ? 0.6 : -0.6), y: p.h + this.calibRef }, this.at);
      HOOKS.sparks(at, 22, i ? 0xffffff : 0xffd166);
    }
    SND.perfect();
    haptic('left', 0.6, 70);
    haptic('right', 0.6, 70);
  }

  private draw(): void {
    if (!this.ready) return;
    const R = this.runner, tk = R.tk, d = R.dist, lite = LITE.on;
    tk.frame();
    this.root.position.y = R.dip - R.flyAlt; // (el salto: el mundo baja y sube bajo los pies; volando, todo lo que vuelas)
    this.hNow = R.grades.length ? R.heightAt(d) : 0; // (las cuestas: lo alto del sendero bajo tus pies)
    for (const b of this.batches.values()) b.n = 0;
    // el muelle (recalculado al avanzar un tramo de tablas o al montar otro tramo del recorrido)
    const s0 = Math.floor((d - BACK) / DOCK_LEN) * DOCK_LEN;
    if (s0 !== this.floorS0 || R.pieces.length !== this.floorN) {
      if (R.pieces.length !== this.floorN) this.deco.clear(); // (un tramo nuevo: el paisaje de más allá, el suyo)
      this.floorS0 = s0;
      this.floorN = R.pieces.length;
      this.holes.length = 0;
      // (volando, sin pasarela: solo al salir y ante cada cofre, para despegar y posarse)
      if (R.fly)
        for (let j = 0; j <= R.ends.length; j++) {
          const a = (j ? R.ends[j - 1] : 0) + FLY_PAD, b = j < R.ends.length ? R.ends[j] - FLY_PAD * 1.6 : 1e9;
          if (b > a) this.holes.push([a, b]);
        }
      for (const p of R.pieces) if ((p.k === 'gap' || p.k === 'glide' || p.k === 'fork' || p.k === 'bob') && p.at + p.len + BOB_ISLE + BOB_CRACK > s0 && p.at < s0 + BACK + AHEAD + DOCK_LEN) {
        this.holes.push([p.at, p.at + p.len]);
        // (el islote que sube y baja, separado del camino por una grieta: se mueve solo él)
        if (p.k === 'bob') this.holes.push([p.at + p.len + BOB_ISLE, p.at + p.len + BOB_ISLE + BOB_CRACK]);
      }
      this.floor.length = 0;
      // por mundos: de portal en portal, las tablas o la roca del risco (cortadas justo en el portal)
      const s1 = s0 + BACK + AHEAD + DOCK_LEN, cuts = [s0];
      for (let j = 0; j < R.ends.length; j++) if (worldEnd(j, R.worldLen)) {
        const P = R.ends[j] + PORTAL_AT;
        if (P > s0 && P < s1) cuts.push(P);
      }
      cuts.push(s1);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const a = cuts[k], b = cuts[k + 1], hs = this.holes.slice();
        if (k > 0) hs.push([-1e9, a]);
        if (k + 2 < cuts.length) hs.push([b, 1e9]);
        const fl = this.floorAt((a + b) / 2);
        if (fl === 'sky') skyFloorPuts(a, b, hs, this.floor);
        else if (fl === 'coast') coastFloorPuts(a, b, hs, this.floor);
        else if (fl === 'cliff') {
          this.narrow.length = 0;
          for (const p of R.pieces) if (p.k === 'ledge' && p.at + p.len > a && p.at < b) this.narrow.push([p.at, p.at + p.len]);
          cliffFloorPuts(a, b, hs, this.narrow, this.floor);
        } else floorPuts(a, b, hs, this.floor);
      }
    }
    // (las islas: el islote que sube y baja y el que se hunde se mueven enteros: los trozos de su suelo, por su `seg`)
    const mv = this.movers;
    mv.length = 0;
    for (const p of R.live) if (p.k === 'bob' || (p.k === 'sink' && this.sinkAt.has(p.id))) mv.push(p);
    for (const u of this.floor) this.put(u, u.ds, 0, 1, 0, undefined, 0, mv.length && u.seg !== undefined ? this.islandY(u.seg) : 0, true);
    // el paisaje de los lados (cada trozo, calculado una vez mientras está a la vista); con un menú abierto, sin él
    const c0 = Math.floor((d - BACK) / TREK_CH), c1 = Math.floor((d + AHEAD) / TREK_CH);
    for (const k of this.deco.keys()) if (k < c0 || k > c1) this.deco.delete(k);
    if (!lite)
      for (let c = c0; c <= c1; c++) {
        let L = this.deco.get(c);
        if (!L) {
          const fl = this.floorAt((c + 0.5) * TREK_CH);
          // (del lado del marcador, nada alto que lo atraviese: board-spot.ts)
          const bs = str('board'), cl: -1 | 0 | 1 = bs === 'right' ? 1 : bs === 'left' ? -1 : 0;
          L = fl === 'cliff' ? cliffDecoPuts(c, []) : fl === 'sky' ? skyDecoPuts(c, [], cl) : fl === 'coast' ? coastDecoPuts(c, [], cl) : decoPuts(c, [], this.biomeAt(c * TREK_CH), cl);
          this.deco.set(c, L);
        }
        for (const u of L) this.put(u, u.ds, 0, 1);
      }
    // las piezas del recorrido (tus ojos, en el sitio del recorrido: lo que se coge con la cabeza no se pega a ellos)
    this.root.updateMatrixWorld();
    this.root.worldToLocal(this.eyeL.copy(head.p));
    let gi = 0;
    for (const p of R.live) {
      const L = this.looks.get(p.id);
      if (!L) continue;
      const kn = this.knock.get(p.id), gn = this.gone.get(p.id), off = kn ? kn.dir * 0.9 * kn.t : 0, k = gn ? Math.max(0.01, 1 - gn.t) : 1;
      // (las frutas y el barril sorpresa giran y flotan, cada uno a su compás; el resto de la pieza, quieto)
      const spin = this.clock * (p.k === 'box' ? 1.1 : 1.8) + p.id, bob = 0.04 * Math.sin(this.clock * 2.6 + p.id), turn = p.k === 'fruit' || p.k === 'box';
      for (const u of L) {
        // (las frutas del arco que ya te has comido y la dorada de la plataforma ya cogida, no)
        if (u.tag !== undefined && (u.tag === GOLD_TAG ? p.got > 0 : p.k === 'glide' || p.k === 'berries' ? ((p.mask >> u.tag) & 1) === 1 : u.tag < p.got)) continue;
        const f = turn || u.kit === 'food';
        this.put(u, p.at + u.ds, off + p.lane * FORK_U, k, kn ? kn.t : 0, p, f ? spin : 0, f ? bob : 0, false, f);
      }
      // el brillo de la dorada (la que flota alta en el centro o la de encima de una plataforma)
      if (p.gold && gi < this.goldGlow.length && !(p.k === 'fruit' && p.judged) && !(p.k === 'step' && p.got > 0) && !lite) {
        const g = this.goldGlow[gi++], st = p.k === 'step';
        this.runner.tk.bend(p.at + (st ? p.len / 2 : 0), p.lane * FORK_U - this.runner.uShift, this.bp);
        g.position.set(this.bp.x, (st ? p.h : GOLD_Y) + this.calibRef + bob + this.gy(p.at), this.bp.z);
        g.material.opacity = 0.55 + 0.25 * Math.sin(this.clock * 5 + p.id);
        g.visible = true;
      }
    }
    for (let i = gi; i < this.goldGlow.length; i++) this.goldGlow[i].visible = false;
    this.drawFly(lite);
    this.flyLook.update(R.fly && !R.mapMode && !lite && GAME.phase === 'playing', num('flyGauges') > 0, R, (s, u, out) => R.tk.bend(s, u, out), (s) => this.gy(s), this.calibRef, this.clock);
    for (const b of this.batches.values())
      for (const im of b.ims) {
        im.count = b.n;
        im.instanceMatrix.needsUpdate = true;
      }
    // el césped: centrado en ti, con su dibujo donde le toca en el sendero (gira y corre con el mundo)
    const F = tk.tf;
    this.ground.rotation.y = F.th;
    this.ground.position.x = -R.uShift; // (en una bifurcación, el césped también se desplaza: no patina bajo lo apoyado)
    this.groundTex.offset.set(F.x / GROUND_CELL, -F.z / GROUND_CELL);
    const B = tramoBiome(this.biome, R.worldLen);
    this.ocean.update(!LITE.on && !R.mapMode && this.floorAt(d) === 'coast', this.clock, F.x, F.z, F.th, -R.uShift, B.fog, B.dens, B.dusk);
    // (las cuestas: el mar, a su altura de siempre: subiendo, se ve más abajo; y el césped, ondulando con el sendero)
    this.ocean.mesh.position.y = SEA_Y - this.hNow;
    this.groundHills(d);
    this.turnPano(PANO_FOLLOW * F.th);
  }

  /** Gira el fondo realista (el DomeTexture de IWSDK en la raíz del nivel) a `yaw`: solo si ha cambiado algo y si IWSDK no
   * está ya con él (cargando el fondo de otro tramo, por ejemplo). */
  private turnPano(yaw: number): void {
    if (Math.abs(yaw - this.panoYaw) < PANO_STEP) return;
    const lv = this.world.activeLevel?.peek?.();
    if (!lv || !lv.hasComponent(DomeTexture) || lv.getValue(DomeTexture, '_needsUpdate')) return;
    const rot = lv.getVectorView(DomeTexture, 'rotation');
    rot[1] = yaw;
    lv.setValue(DomeTexture, '_needsUpdate', true);
    this.panoYaw = yaw;
  }

  /** Una instancia: el modelo `u` en (s, u.u + du) del sendero, a su escala por `k`; `roll`, lo que vuelca (el barril). */
  private put(u: Put, s: number, du: number, k: number, roll = 0, p?: Piece, spin = 0, bob = 0, pitch = false, near = false): void {
    const b = this.batches.get(`${u.kit}:${u.n}`);
    if (!b || b.n >= b.cap) return;
    // (el giro propio del modelo, en el orden de pieces.ts, y encima el del sendero en ese punto)
    // (en una bifurcación, todo se desplaza a un lado para que tu rama quede bajo tus pies)
    const ry = this.runner.tk.bend(s, u.u + du - this.runner.uShift, this.bp);
    this.e.set(u.rx, u.ry + spin, u.rz + roll * (p && p.side ? -p.side : 1) * 1.4);
    this.q.setFromEuler(this.e);
    // (el suelo, en una cuesta, cabecea con ella: sin escalones entre un trozo y el siguiente)
    if (pitch && this.runner.grades.length) this.q.premultiply(this.qx.setFromAxisAngle(this.xAxis, Math.atan(this.runner.slopeAt(s))));
    this.q.premultiply(this.qy.setFromAxisAngle(this.up, ry));
    this.v.set(this.bp.x, u.y + bob + this.gy(s), this.bp.z);
    if (near) {
      // (las frutas y los barriles, pegados a los ojos se veían enormes al cogerlos: como las chispas, se encogen a menos de
      // 45 cm y desaparecen a menos de 12; docs/REGLAS.md)
      const d = this.v.distanceTo(this.eyeL);
      if (d < EYE_GONE) return;
      if (d < EYE_FADE) k *= (d - EYE_GONE) / (EYE_FADE - EYE_GONE);
    }
    this.m4.compose(this.v, this.q, this.sc.set(u.sx * k, u.sy * k, u.sz * k));
    for (const im of b.ims) im.setMatrixAt(b.n, this.m4);
    b.n++;
  }

  // ---------------------------------------------------------------- los enemigos

  /** Los enemigos, en cuanto sus modelos estén cargados: los suyos de cada uno (`pool`), escondidos hasta que salga su pieza (y
   * precompilados en el menú: sin tirón al salir el primero). */
  private buildFoes(): boolean {
    // (¿ya están? sin copiarlos: getGLTF copia el modelo entero si no se le pide el compartido)
    for (const kind of LOOKS) if (!AssetManager.getGLTF(FOE_LOOK[kind].asset, { shared: true })) return false;
    for (const kind of LOOKS) {
      const L = FOE_LOOK[kind];
      // los suyos para el juego y uno más, escondido, para precompilarlo igual que ellos (con su sombra) en el menú
      for (let i = 0; i <= L.pool; i++) {
        const gltf = AssetManager.getGLTF(L.asset)!, model = gltf.scene, root = new Group();
        root.name = `travesia-${kind}-${i}`;
        model.scale.setScalar(L.h / L.nat);
        model.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false; // (animado, se sale de su caja de reposo)
        });
        if (i === L.pool) {
          warmKeep(model);
          break;
        }
        root.add(model);
        root.visible = false;
        this.root.add(root);
        const mixer = new AnimationMixer(model), acts = new Map<string, AnimationAction>();
        for (const c of gltf.animations) acts.set(c.name, mixer.clipAction(c));
      aliasClips(acts);
        aliasClips(acts);
        this.rigs.push({ kind, root, model, mixer, acts, cur: '', p: null, act: 'live', t: 0, off: 0, dir: 1 });
      }
    }
    // (las piezas que salieron antes de tener los modelos)
    for (const p of this.runner.live) if (lookOf(p) && !this.rigOf.has(p.id)) this.takeRig(p);
    return true;
  }

  /** Un enemigo libre para la pieza p (si no hay, no se ve: con los de cada uno no pasa). */
  private takeRig(p: Piece): void {
    if (this.rigOf.has(p.id)) return;
    const kind = lookOf(p);
    const r = this.rigs.find((x) => x.kind === kind && !x.p);
    if (!r) return;
    r.p = p;
    r.act = 'live';
    r.t = r.off = 0;
    r.dir = p.k === 'side' ? p.side || 1 : p.id % 2 ? 1 : -1;
    r.root.visible = true;
    r.root.scale.set(1, 1, 1);
    this.rigOf.set(p.id, r);
    this.clip(r, FLY.includes(r.kind) || r.kind === 'dragon' ? 'Flying' : 'Idle');
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
    // (escupir: el cangrejo se encabrita y el cíclope salta para golpear el suelo; el demonio echa el brazo y lanza)
    this.clip(r, act === 'die' ? 'Death' : act === 'spit' ? (r.kind === 'fire' || r.kind === 'dragon' ? 'Bite_Front' : 'Jump') : 'Bite_Front', true);
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
      const fly = FLY.includes(r.kind), hover = r.kind === 'dragon';
      if (r.act === 'live') this.clip(r, fly || hover ? 'Flying' : p.woke && p.walk > 0 && GAME.phase === 'playing' && !GAME.between && !GAME.paused ? 'Walk' : 'Idle');
      else if ((r.act === 'bite' || r.act === 'miss' || r.act === 'spit') && r.t > BITE_T && !(fly && p.judged)) {
        r.act = 'live';
        this.clip(r, fly || hover ? 'Flying' : 'Idle');
      }
      // tras morderte se aparta a un lado (fuera de la pasarela: nunca lo atraviesas); el cíclope y el demonio ya están a un lado
      // (el tiburón pirata, que llega por el centro, también se aparta tras su tajo, le des o no: nunca te atraviesa)
      if ((r.act === 'bite' || (r.act === 'live' && p.ok === false) || ((r.kind === 'sharky' || r.kind === 'mako') && p.judged)) && r.kind !== 'quake' && r.kind !== 'fire' && r.kind !== 'dragon') r.off = Math.min(0.9, r.off + dt * 2);
      let k = 1, y = 0;
      if (fly) {
        // en picado: baja desde lo alto mientras se acerca, hasta la altura de tu cabeza al llegar; pasado (o tras picarte),
        // sigue de largo hacia arriba y se esfuma
        // (en plancha llega rasante todo el camino: bajando desde lo alto no se le veía con la cabeza hacia el suelo)
        y = this.calibRef - 0.35 + (this.runner.prone ? 0.3 : 1.6) * Math.min(1, p.walk / FOE_WALK);
        if (p.judged) {
          y += 2.2 * r.t;
          k = Math.max(0, 1 - r.t / 0.6);
          if (k <= 0) {
            this.freeRig(r);
            continue;
          }
          r.root.scale.setScalar(k);
        }
      } else if (r.kind === 'skull' && p.woke && !p.judged) y = 0.28 * Math.abs(Math.sin(this.clock * 6 + p.id)); // (botando)
      else if (hover) y = 0.9 + 0.22 * Math.sin(this.clock * 2.3 + p.id); // (el dragón, en el aire junto al camino, subiendo y bajando)
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
      const u = (p.k === 'side' ? p.side * CRAB_U : p.k === 'quake' || p.k === 'fire' ? p.side * ASIDE_U : 0) + r.dir * r.off + p.lane * FORK_U - this.runner.uShift;
      const ry = this.runner.tk.bend(p.at + p.walk, u, this.bp);
      r.root.position.set(this.bp.x, y + this.gy(p.at + p.walk), this.bp.z);
      r.root.quaternion.setFromAxisAngle(this.up, ry);
      if (!lite) r.mixer.update(dt);
    }
  }

  // ---------------------------------------------------------------- el jefe del mundo

  /** Los jefes (uno de cada, en cuanto estén cargados; precompilados en el menú) y la piedra que lanzan. */
  private buildBoss(): boolean {
    const isl = kitParts('island');
    if (!isl) return false;
    for (const B of BOSSES) if (!AssetManager.getGLTF(B.asset, { shared: true })) return false;
    for (const B of BOSSES) {
      const gltf = AssetManager.getGLTF(B.asset)!, model = gltf.scene, root = new Group();
      root.name = `travesia-jefe-${B.voice}`;
      model.scale.setScalar(BOSS_H / B.nat);
      model.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        if ((o as SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
      });
      root.add(model);
      root.visible = false;
      this.root.add(root);
      warmKeep(AssetManager.getGLTF(B.asset)!.scene);
      const mixer = new AnimationMixer(model), acts = new Map<string, AnimationAction>();
      for (const c of gltf.animations) acts.set(c.name, mixer.clipAction(c));
      this.bossRigs.push({ root, mixer, acts, cur: '', p: null, from: 0, to: 0, leapT: -1, dizzy: false, dieT: -1, starT: 0 });
    }
    for (const p of this.runner.live) if (p.k === 'boss') this.takeBoss(p);
    return true;
  }

  private takeBoss(p: Piece): void {
    const b = this.bossRigs[p.n % BOSSES.length];
    if (!b || b.p === p) return;
    b.p = p;
    b.leapT = b.dieT = -1;
    b.dizzy = false;
    b.root.scale.set(1, 1, 1);
    b.root.visible = true;
    this.bossClip(b, 'Idle');
  }

  private freeBoss(b: BossRig): void {
    b.p = null;
    b.root.visible = false;
    b.mixer.stopAllAction();
    b.cur = '';
  }

  /** Su animación (como la de los enemigos): `once`, sin repetir y quieta al acabar. */
  private bossClip(b: BossRig, name: string, once = false): void {
    const a = b.acts.get(name);
    if (!a || (b.cur === name && !once)) return;
    const prev = b.cur && b.cur !== name ? b.acts.get(b.cur) : null;
    a.reset();
    a.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once;
    a.fadeIn(0.15).play();
    prev?.fadeOut(0.15);
    b.cur = name;
  }

  /** Lo que hace el jefe: ruge al empezar, se marea (tambaleándose, con estrellas), se recupera, recibe tu supersalto (y
   * salta hacia atrás) o cae derrotado (salta, muere y se esfuma). */
  private bossEv(p: Piece, act: string, from?: number, to?: number): void {
    const b = this.bossRigs.find((x) => x.p === p);
    const at = this.world3({ s: p.at + BOSS_Z, u: 0, y: BOSS_H }, this.at);
    const voice = BOSSES[p.n % BOSSES.length].voice;
    if (act === 'start' || act === 'wake') {
      SND.hiss(at, 1.4, voice);
      if (b) {
        b.dizzy = false;
        this.bossClip(b, 'Jump', true);
      }
      return;
    }
    if (act === 'dizzy') {
      if (b) {
        b.dizzy = true;
        this.bossClip(b, 'HitRecieve');
      }
      HOOKS.sparks(at, 14, 0xffe14a);
      return;
    }
    // tu supersalto le cae encima: un golpe de polvo y chispas sobre su cabeza, y salta hacia atrás (o, derrotado, salta y muere)
    HOOKS.sparks(at, 20, 0xffd166);
    vfx().puffs(at, 8, 0.2, 0.9, PAL.dust, 1.2, 0.4, 3, 0.6);
    SND.hiss(at, 1.5, voice);
    if (!b || from === undefined || to === undefined) return;
    b.dizzy = false;
    b.from = from;
    b.to = to;
    b.leapT = 0;
    if (act === 'die') b.dieT = 0;
    this.bossClip(b, 'HitRecieve', true);
  }

  /** Cada fotograma: el jefe en su sitio (o en su salto hacia atrás), de cara a ti; y lo que lanza. */
  private drawBoss(dt: number): void {
    const lite = LITE.on;
    for (const b of this.bossRigs) {
      const p = b.p;
      if (!p) continue;
      let s = p.at + BOSS_Z, y = 0;
      if (b.leapT >= 0) {
        b.leapT += dt / LEAP_T;
        const k = Math.min(1, b.leapT);
        s = b.from + (b.to - b.from) * k * k * (3 - 2 * k);
        y = LEAP_UP * 4 * k * (1 - k);
        if (k >= 1) {
          b.leapT = -1;
          // al caer, el suelo retumba: un anillo de polvo y piedras (el jefe pesa)
          if (!lite) {
            const at = this.world3({ s, u: 0, y: 0.05 }, this.at), V = vfx();
            V.shockRing(at, 1.2);
            V.bits(at, 12, 0.06, 3.5, 1, PAL.debris);
          }
          if (b.dieT < 0) this.bossClip(b, 'Idle');
          else this.bossClip(b, 'Death', true);
        }
      } else if (b.dieT >= 0) s = b.to;
      if (b.dieT >= 0) {
        b.dieT += dt;
        const k = Math.max(0, 1 - Math.max(0, b.dieT - BOSS_FADE) / 0.6);
        b.root.scale.setScalar(Math.max(0.01, k));
        if (k <= 0) {
          HOOKS.sparks(this.world3({ s, u: 0, y: 0.8 }, this.at), 24, 0xe8e4dc);
          this.freeBoss(b);
          continue;
        }
      }
      // mareado: estrellas que le giran sobre la cabeza
      if (b.dizzy && !lite) {
        b.starT += dt;
        if (b.starT > 0.45) {
          b.starT = 0;
          const a = this.clock * 4;
          this.runner.tk.bend(s, 0.35 * Math.cos(a) - this.runner.uShift, this.bp);
          HOOKS.sparks(this.at.set(this.bp.x, BOSS_H + 0.25 + this.runner.dip + this.gy(s), this.bp.z + 0.35 * Math.sin(a)), 4, 0xffe14a);
          // (en plancha, también a sus pies: es lo que se ve con la cabeza hacia el suelo)
          if (this.runner.prone) HOOKS.sparks(this.at.set(this.bp.x, 0.15 + this.runner.dip + this.gy(s), this.bp.z + 0.35 * Math.sin(a)), 4, 0xffe14a);
        }
      }
      b.root.visible = !lite;
      const ry = this.runner.tk.bend(s, -this.runner.uShift, this.bp);
      b.root.position.set(this.bp.x, y + this.gy(s), this.bp.z);
      b.root.quaternion.setFromAxisAngle(this.up, ry);
      if (!lite) b.mixer.update(dt);
    }
    // lo que lanza: crece en su mano mientras echa el brazo atrás y vuela hasta donde estaba tu cabeza (la baja, rodando por
    // el suelo), con su estela
    const F = this.shotFx, M = this.bossFx;
    if (!M) return;
    if (!GAME.paused) M.update(dt);
    if (!F.on) return;
    if (GAME.phase !== 'playing' || GAME.between) {
      F.on = false;
      M.stop();
      return;
    }
    if (GAME.paused) return;
    F.t += dt;
    if (F.t < F.wind) {
      M.charge(F.from, F.t / F.wind);
      return;
    }
    const k = Math.min(1.3, (F.t - F.wind) / Math.max(0.05, F.dur));
    this.at.lerpVectors(F.from, F.to, k);
    if (F.shot !== 'low') this.at.y += 0.3 * Math.sin(Math.PI * Math.min(1, k));
    M.fly(this.at, dt, head.p);
  }

  // ---------------------------------------------------------------- los escupitajos

  /** De dónde sale el escupitajo: la boca del cangrejo (en la arena). */
  private spitFrom(p: Piece, out: Vector3): Vector3 {
    // (la bola de fuego, de la mano en alto del demonio, a un lado de la pasarela)
    if (p.k === 'fire') return this.world3({ s: p.at - 0.2, u: p.side * (ASIDE_U - 0.3), y: 1.5 }, out);
    return this.world3({ s: p.at + p.walk - 0.15, u: p.side * CRAB_U, y: 0.3 }, out);
  }

  /** El escupitajo: mientras el cangrejo se encabrita, crece en su boca (y va con él); luego vuela recto, un poco en arco,
   * hasta donde estaba tu cabeza. Si la ronda se para (descanso, pausa), se quita. */
  private stepSpits(dt: number): void {
    this.stepWaves(dt);
    for (const S of this.spits) this.stepSpit(S, dt);
    for (const S of this.fires) this.stepSpit(S, dt);
    this.stepBalls(dt);
  }

  /** La boca del cañón del barco del cañonazo `p` (en la arena). */
  private muzzle(p: Piece, out: Vector3): Vector3 {
    return this.world3({ s: p.at + 3, u: p.side * (SHIP_U - 3), y: SEA_Y + 3.2 }, out);
  }

  /** Las balas de los cañonazos: van del barco hacia ti al paso que llega la pieza (llegan justo cuando te alcanza: la lógica
   * la juzga entonces); la alta, en arco, a la altura de la cabeza; la baja, que baja enseguida y pasa a ras del muelle. Pasada,
   * sigue hacia el otro lado y cae al mar. */
  private stepBalls(dt: number): void {
    const R = this.runner;
    for (const B of this.balls) {
      if (!GAME.paused) B.m.update(dt);
      const p = B.p;
      if (!p) continue;
      if (GAME.phase !== 'playing' || GAME.between) {
        B.p = null;
        B.m.stop();
        continue;
      }
      if (GAME.paused) continue;
      looksTick();
      const z = p.at - R.dist + head.p.z, k = Math.max(0, 1 - z / CANNON_AT);
      this.muzzle(p, B.from);
      // (a dónde va: a ti, a la altura de la cabeza o de los tobillos)
      this.world3({ s: p.at, u: 0, y: p.n ? CANNON_LOW_Y : this.calibRef - p.h + 0.08 }, B.to);
      B.pos.lerpVectors(B.from, B.to, k);
      if (p.n) B.pos.y = B.to.y + (B.from.y - B.to.y) * Math.max(0, 1 - k / 0.55) ** 2; // (la baja: cae pronto y sigue a ras)
      else B.pos.y += 1.6 * Math.sin(Math.PI * Math.min(1, k)); // (la alta, en arco)
      B.m.fly(B.pos, dt, head.p);
      // pasada, se va y cae al mar (salpica)
      if (k > 1.35 || (p.judged && p.ok === false && (B.gone += dt) > 0.05)) {
        if (p.judged && p.ok === false) B.m.hit(this.v.copy(B.from).sub(B.to).setLength(1.2).add(B.to));
        else {
          B.m.coast(0.3);
          SND.splash(B.pos);
        }
        B.p = null;
      }
    }
  }

  /** La onda del cíclope (realista, pedido del usuario): el puñetazo levanta un anillo de polvo y piedras; la onda corre por la
   * pasarela hacia ti (donde la lleva la lógica, `p.fx`) como un muro bajo de polvo que salta del suelo a su paso, con
   * piedrecitas; pasada (o fuera de la ronda), se acaba. */
  private stepWaves(dt: number): void {
    const R = this.runner, V = vfx();
    for (const w of this.waves) {
      const p = w.p;
      const s = p ? p.at - Math.max(0, p.fx) : 0;
      if (!p || GAME.phase !== 'playing' || GAME.between || s < R.dist - head.p.z - 3 || (p.judged && s < R.dist - head.p.z + 0.5)) {
        w.p = null;
        for (const m of w.rocks) m.visible = false;
        continue;
      }
      // (aún sin salir, o con un menú abierto: sin cresta; en pausa, quieta donde estaba)
      if (p.fx < 0 || LITE.on) {
        for (const m of w.rocks) m.visible = false;
        continue;
      }
      if (GAME.paused) continue;
      // la cresta: una fila de rocas al rojo que revienta las tablas en el frente (subiendo y bajando, vibrando) y otra, detrás,
      // que se hunde; de un lado a otro de la pasarela, en el mundo que baja y sube
      looksTick();
      for (let j = 0; j < w.rocks.length; j++) {
        const m = w.rocks[j], back = j >= WAVE_ROCKS, i = j % WAVE_ROCKS;
        const u = p.lane * FORK_U - R.uShift + (i - (WAVE_ROCKS - 1) / 2) * 0.4 + 0.06 * Math.sin(i * 7.3 + p.id);
        const ss = s - (back ? WAVE_ROW : 0) + 0.08 * Math.sin(i * 3.1 + p.id);
        R.tk.bend(ss, u, this.bp);
        const jump = back ? 0.03 + 0.02 * Math.sin(this.clock * 9 + i) : WAVE_UP * (0.75 + 0.25 * Math.sin(this.clock * 23 + i * 1.9));
        const sc = (back ? 0.08 : 0.13) * (0.85 + 0.3 * ((i * 0.618 + p.id * 0.13) % 1));
        m.position.set(this.bp.x, jump * 0.6 + this.gy(ss), this.bp.z);
        m.scale.setScalar(sc);
        m.rotation.x += dt * (4 + i);
        m.rotation.z += dt * (3 + i * 0.5);
        m.visible = true;
      }
      if (!w.on) {
        // el puño llega al suelo: un anillo de polvo que se abre, una nube que sube y piedras que saltan
        w.on = true;
        const at = this.world3({ s: p.at, u: p.side * (ASIDE_U - 0.6), y: 0.08 }, this.at);
        V.shockRing(at, 1.1);
        V.puffs(at, 12, 0.28, 1.5, PAL.dust, 0.9, 0.9, 3, 0.7);
        V.bits(at, 20, 0.06, 4.2, 1.1, PAL.debris);
        haptic('left', 0.5, 120);
        haptic('right', 0.5, 120);
      }
      // el frente: de un lado a otro de la pasarela, el polvo salta del suelo (cada 1/60 s, a su ritmo) y se queda en su sitio
      // del sendero (corre hacia ti con el mundo)
      this.world3({ s: s - 0.5, u: p.lane * FORK_U, y: 0 }, this.wdir);
      this.world3({ s, u: p.lane * FORK_U, y: 0 }, this.at);
      this.wdir.sub(this.at).normalize().multiplyScalar(Math.max(0, R.v));
      w.dustT += dt;
      while (w.dustT >= 1 / 60) {
        w.dustT -= 1 / 60;
        for (let i = 0; i < 3; i++) {
          this.world3({ s: s + (Math.random() - 0.5) * 0.3, u: p.lane * FORK_U + (Math.random() - 0.5) * 2.8, y: 0.05 }, this.at);
          V.matter.emit(this.at.x, this.at.y, this.at.z, this.wdir.x + (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 1.3, this.wdir.z + (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.08, 3, 0.55 + Math.random() * 0.35, PAL.dust[0], PAL.dust[1], 0.75, 2.2, 1.2);
        }
        if (Math.random() < 0.35) V.bits(this.at, 1, 0.04, 2.2, 0.7, PAL.debris);
      }
    }
  }

  private stepSpit(S: SpitFx, dt: number): void {
    if (!GAME.paused) S.m.update(dt); // (la estela, el humo y el fogonazo, también después de dar)
    if (!S.p) return;
    if (GAME.phase !== 'playing' || GAME.between) {
      S.p = null;
      S.m.stop();
      return;
    }
    if (GAME.paused) return;
    S.t += dt;
    if (S.t < S.wind) {
      this.spitFrom(S.p, S.from);
      S.m.charge(S.from, S.t / S.wind);
      return;
    }
    const k = Math.min(1.15, (S.t - S.wind) / Math.max(0.05, S.dur));
    S.pos.lerpVectors(S.from, S.to, k);
    S.pos.y += S.arc * Math.sin(Math.PI * Math.min(1, k)); // (en arco: el escupitajo, casi recto; la bola de fuego, alto)
    S.m.fly(S.pos, dt, head.p);
  }


  // ---------------------------------------------------------------- los mundos

  /** Lo que sube o baja el trozo de suelo de las islas con centro en `s` (m): el islote que sube y baja (quieto a ras desde que
   * saltas hacia él) y el que se hunde (tiembla y baja un poco bajo tus pies; lo que dejas atrás cae al vacío). */
  private islandY(s: number): number {
    const R = this.runner;
    for (const p of this.movers) {
      if (p.k === 'bob') {
        const a = p.at + p.len;
        if (s < a || s > a + BOB_ISLE) continue;
        const st = this.settled.get(p.id);
        if (!st) return bobY(p, R.time);
        const k = Math.min(1, (this.clock - st.t) / SETTLE_T);
        return st.y * (1 - k * k * (3 - 2 * k));
      }
      if (s < p.at || s > p.at + p.len) continue;
      const t = this.clock - (this.sinkAt.get(p.id) ?? this.clock), back = R.dist - SINK_BACK - s;
      return -0.06 * Math.min(1, t) + 0.015 * Math.sin(this.clock * 47 + s * 3) - (back > 0 ? 0.8 * back * back : 0);
    }
    return 0;
  }

  /** Los portales a la vista (tras el cofre del último tramo de cada mundo), el destello al cruzar uno, las rachas de viento y
   * las rocas que caen. */
  private stepWorld(dt: number): void {
    const R = this.runner, lite = LITE.on, playing = GAME.phase === 'playing';
    this.portalMat.uniforms.uTime.value = this.clock;
    let n = 0;
    for (let j = 0; j < R.ends.length && n < this.portals.length; j++) {
      if (!worldEnd(j, R.worldLen)) continue;
      const P = R.ends[j] + PORTAL_AT;
      if (P < R.dist - BACK || P > R.dist + AHEAD) continue;
      // (volando, a tu altura y delante de ti: tu lado es el que lleva el mundo desplazado, `uShift`)
      const fly = R.fly && R.glider.alt > 0.3, want = R.glider.alt + this.calibRef;
      let py = PORTAL_R + 0.05;
      if (fly) {
        const was = this.portalY.get(j) ?? want;
        py = was + (want - was) * Math.min(1, dt / 0.8);
        this.portalY.set(j, py);
      } else this.portalY.delete(j);
      const g = this.portals[n++], ry = R.tk.bend(P, fly ? 0 : -R.uShift, this.bp);
      g.position.set(this.bp.x, py + this.gy(P), this.bp.z);
      g.rotation.set(0, ry, 0);
      g.visible = !lite;
      // (chispas que suben por el aro)
      if (playing && !GAME.paused && !lite && Math.random() < dt * 30) {
        const a = Math.random() * 6.283;
        R.tk.bend(P, Math.cos(a) * PORTAL_R - (fly ? 0 : R.uShift), this.bp);
        HOOKS.sparks(this.at.set(this.bp.x, py + Math.sin(a) * PORTAL_R + R.dip + this.gy(P), this.bp.z), 2, Math.random() < 0.5 ? 0x8ff0ff : 0xff9cf0);
      }
    }
    for (let i = n; i < this.portals.length; i++) this.portals[i].visible = false;
    // el mar de nubes, en el risco
    const fl = this.floorAt(R.dist);
    this.sea.update(!R.mapMode && (fl === 'cliff' || fl === 'sky'), this.clock, tramoBiome(this.biome, R.worldLen).fog);
    // el destello
    const fm = this.flash.material as MeshBasicMaterial;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      fm.opacity = Math.min(1, (this.flashT / FLASH_T) * 1.6);
      this.flash.position.copy(head.p);
      this.flash.visible = true;
    } else this.flash.visible = false;
    if (!playing || GAME.paused) return;
    // las rachas de viento: polvo y hojas que cruzan el camino desde su lado mientras soplan (y su ruido al empezar)
    let gust = false;
    for (const p of R.live) {
      if (p.k !== 'gust' || p.judged) continue;
      const z = p.at - R.dist;
      if (z > 8 || z < -p.len) continue;
      gust = true;
      if (lite) continue;
      this.gustT += dt;
      while (this.gustT > 1 / 40) {
        this.gustT -= 1 / 40;
        const ds = R.dist + 1 + Math.random() * 7;
        this.world3({ s: ds, u: p.side * 3.5, y: 0.2 + Math.random() * 2 }, this.at);
        this.world3({ s: ds, u: -p.side * 3.5, y: 0.2 }, this.v);
        this.v.sub(this.at).normalize().multiplyScalar(6 + Math.random() * 3);
        const V = vfx();
        V.matter.emit(this.at.x, this.at.y, this.at.z, this.v.x, 0.3, this.v.z, 0.12, 2.5, 1.1, PAL.dust[0], PAL.dust[1], 0.45, 0.2, 0);
        if (Math.random() < 0.3) V.bits(this.at, 1, 0.04, 1, 1, PAL.slime, 0.9, 0.2);
      }
    }
    if (gust && !this.gustOn) SND.whoosh(head.p, 'arc');
    this.gustOn = gust;
    // las rocas que caen: de lo alto de la pared (a la izquierda) a su lado del camino, girando; al llegar, se rompen
    for (const F of this.falls) {
      const p = F.p;
      if (!p) continue;
      F.t += dt;
      const k = Math.min(1, F.t / F.dur);
      for (let j = 0; j < F.rocks.length; j++) {
        const m = F.rocks[j], u0 = -2.2 - j * 0.3, u1 = p.side * (0.45 + 0.2 * j) - 0.1 * j;
        const ry = R.tk.bend(p.at + j * 0.5 - 0.5, u0 + (u1 - u0) * k - R.uShift, this.bp);
        m.position.set(this.bp.x, 0.25 + (7 + j) * (1 - k * k) + this.gy(p.at), this.bp.z);
        m.rotation.set(F.t * (5 + j), ry, F.t * (3 + j));
        m.scale.setScalar(0.22 + 0.06 * j);
        m.visible = !lite && k < 1;
      }
      // la sombra, donde van a caer: pequeña y tenue al soltarse, grande y oscura al llegar
      R.tk.bend(p.at + 0.0, p.side * 0.6 - R.uShift, this.bp);
      const sh = F.shade, sm = sh.material as MeshBasicMaterial;
      sh.position.set(this.bp.x, 0.025 + this.gy(p.at), this.bp.z);
      sh.scale.setScalar(0.25 + 0.95 * k * k);
      sm.opacity = 0.2 + 0.6 * k;
      sh.visible = !lite && k < 1;
      if (k >= 1) {
        // se rompen: piedras y polvo, y retumba
        const at = this.world3({ s: p.at, u: p.side * 0.5, y: 0.2 }, this.at), V = vfx();
        V.bits(at, 18, 0.06, 3.5, 1, PAL.debris);
        V.puffs(at, 8, 0.25, 1.2, PAL.dust, 0.9, 0.5, 3, 0.65);
        SND.metalHit(at, true);
        haptic('left', 0.5, 90);
        haptic('right', 0.5, 90);
        F.p = null;
        F.shade.visible = false;
      }
    }
  }

  // ---------------------------------------------------------------- el turbo

  /** Las estelas de viento del turbo (RepArena: trekWindStep): aparecen y se van suaves y corren hacia atrás a tu lado. */
  private stepWind(dt: number): void {
    const M = this.wind.material as MeshBasicMaterial, R = this.runner;
    // (con el turbo y planeando sobre un barranco)
    const want = (R.tk.turbo || (!!R.hop?.glide && R.hop.won) || (R.fly && R.flyAlt > 1)) && GAME.phase === 'playing' && !GAME.between && !GAME.paused ? 0.7 : 0;
    M.opacity += (want - M.opacity) * Math.min(1, dt * 3);
    this.wind.visible = M.opacity > 0.01 && !this.runner.mapMode; // (sobre el mapa, solo el cielo y el mapa)
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
