/**
 * El modo Barras en la partida (RepArena: src/72_bars.js y src/35_equip.js, y la parte de Barras de src/70_game.js): dominadas
 * en la barra de puerta, remo invertido en las paralelas y colgado. Cada subida con la cabeza revienta una pompa (o un bicho
 * que viene volando); colgado, se aguantan los segundos de la oleada. El aparato se coloca una vez con las manos y se
 * recuerda; para empezar cada oleada hay que colgarse (la cuenta atrás de 3 s) y, si te sueltas, volver a la barra. Cómo se
 * detecta, qué sale y cuándo lo dice la lógica pura (detect.ts, targets.ts, place.ts, equip.ts), comparada con RepArena;
 * aquí se pinta, suena y puntúa. La partida (GameSystem) pasa las oleadas con lo que este sistema le dice (`waveCleared`).
 */
import { AnimationMixer, AssetManager, createSystem, DoubleSide, Group, LoopRepeat, Mesh, MeshBasicMaterial, CylinderGeometry, Vector3, XRAnchor, type Entity } from '@iwsdk/core';
import type { Material, Object3D, SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { dv, nWaves, store, waveReps } from '../../core/settings.js';
import { GAME, HOOKS, type CenterInfo } from '../../core/state.js';
import { num, settings, str } from '../../core/values.js';
import { GateSystem } from '../../combat/gates.js';
import { hands, head, type Hand } from '../../input/hand-model.js';
import { haptic } from '../../input/hand-system.js';
import { setSetting } from '../../core/settings.js';
import { HangScene } from './hang-scene.js';
import { BUBBLE_SPLASH, createBubble, createDipBars, createDoorBar, type BarRigParts, type BubbleParts } from '../../scene-assets/bars.scene-asset.js';
import { BarDetector, powRgb } from './detect.js';
import { ANCHOR_MAKE_T, ANCHOR_SAFE_T } from './anchor-guard.js';
import { askRoomAnchor, ROOM, roomRisk, roomSafe } from './room-anchor.js';
import { dipOne, eqName, eqPose, equipAnchorFrame, loadEquip, type Equip, type FloorPose } from './equip.js';
import { yawOf } from './env.js';
import { diagEvent } from '../../core/diag.js';
import type { BarEvent, BarsEnv, PlaceEnv } from './env.js';
import { Placer, PLACE_HOLD, type PlaceEvent } from './place.js';
import { BarField, HeadTarget, hangSecs, TGT } from './targets.js';
import { ROPE, RopeCourse, RopeRun } from './rope.js';
import { ROPE_WORLDS, worldPano } from './rope-worlds.js';
import { buildTrials, RopeTrials, shooterOf, TRIAL_FAIL, TRIAL_PASS, trialKey, type Trial, type TrialEnv } from './rope-trials.js';
import { RopeTrialsLook, type LookFrame } from './rope-trials-look.js';
import { RopeFoesLook } from './rope-foes-look.js';
import { BOSS_NAME, BOSS_SAY, bossAppear, bossDown, RopeBoss, ropeBosses, type BossEnv } from './rope-boss.js';
import { RopeBossLook } from './rope-boss-look.js';
import { RopeMiniLook } from './rope-mini-look.js';
import { barReq } from './detect.js';
import { RopeScene } from './rope-scene.js';
import { eqAxes } from './equip.js';
import { ParaFlight } from './para-flight.js';
import { paraWanted } from '../trek/map/map-key.js';
import type { BarHits } from './detect.js';

/** Dónde está la partida de Barras: colgándose (la cuenta atrás), jugando o descansando. */
type BState = 'off' | 'mount' | 'play' | 'rest';

interface TEntry {
  t: HeadTarget;
  grp: Group;
  bubble?: BubbleParts;
  mixer?: AnimationMixer;
  own: Material[];
}

const SND_MAP = SND as unknown as Record<string, (...a: unknown[]) => void>;
const WARN = '#ff8a3d';

export class BarsSystem extends createSystem({}) {
  readonly bar = new BarDetector();
  readonly field = new BarField(this.bar);
  readonly placer = new Placer();
  eq: Equip = loadEquip((k, v) => store(k, v));
  /** El ancla del mundo: su entidad (IWSDK la cuelga del grupo anclado), si se estaba en las gafas el fotograma anterior,
   * los fotogramas que lleva en su sitio en esta sesión y dónde está en local-floor. */
  private anchorProbe: Entity | null = null;
  private wasXR = false;
  private anchorFrames = 0;
  /** El ancla, paso a paso: 0, esperando a que la sesión se asiente; 1, asentada; 2, IWSDK en marcha; 3, dado por bueno. */
  private anchorStep = 0;
  private anchorT = 0;
  private readonly anchorPose: FloorPose = { x: 0, z: 0, yaw: 0 };
  private mstate: BState = 'off';
  private readonly arena = { x: 0, z: 0, ry: 0 };
  private readonly out: BarEvent[] = [];
  private readonly pout: PlaceEvent[] = [];
  private readonly env: BarsEnv;
  private readonly penv: PlaceEnv;
  private root = new Group();
  private rig: BarRigParts | null = null;
  private rigKey = '';
  private line!: Mesh;
  private hang!: HangScene;
  private entries: TEntry[] = [];
  private clock = 0;
  private gates: GateSystem | null = null;
  private readonly tmp = new Vector3();
  private readonly cMount: CenterInfo = { kind: 'calib', title: '', lines: [], note: null, status: null, count: '', bar: 0 };
  private readonly cPlace: CenterInfo = { kind: 'calib', title: '', lines: [], note: null, status: null, count: '', bar: 0 };
  /** Dónde volver al acabar de colocar (el menú) y el aviso con el que se empezó. */
  private placeDone: (() => void) | null = null;
  /** La aventura en la cuerda del remo invertido (RepArena XR: rope.ts; «Remo invertido: aventura en la cuerda»). */
  private rope: RopeRun | null = null;
  private ropeScene!: RopeScene;
  /** Los retos y premios de la cuerda (PR 2: rope-trials.ts), lo que se ve de ellos y lo que miran de ti cada fotograma. */
  private trials: RopeTrials | null = null;
  private trialsLook!: RopeTrialsLook;
  /** Lo que se ve de los retos con bichos (murciélagos, cangrejo, tirador y abeja) y del turbo. */
  private foesLook!: RopeFoesLook;
  private readonly trialLive: Trial[] = [];
  private readonly tEnv: TrialEnv = { s: 0, up: 0, req: 0.3, top: false, side: 0, fast: false, free: [false, false], rep: false, descent: 0, wrist: [null, null], playing: false };
  /** Las muñecas en el marco de la cuerda (para coger la gema), si acabas de hacer un remo, y la bajada que se está midiendo:
   * cuándo empezó (s; −1, ninguna) para los remos lentos. */
  private readonly wristPt: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  private trialRep = false;
  private downFrom = -1;
  private lastUpF = 0;
  /** Qué mano va a cada lado de la cuerda (0, el izquierdo; 1, el derecho): de serie, tumbado con los pies hacia donde subes, la
   * derecha a la derecha; al colgarte, lo que se vea. Y la muñeca de cada una, en el marco de la cuerda. */
  private handSide: [Hand, Hand] = [hands.left, hands.right];
  private readonly wristLoc = new Vector3();
  private readonly lookF: LookFrame = { head: new Vector3(), up: new Vector3(0, 1, 0), fwd: new Vector3(), right: new Vector3() };
  /** Tu cabeza al colgarte, en el marco de la cuerda (lo de a un lado se mide desde ahí; las frutas, a su altura arriba). */
  private readonly headAt0 = new Vector3();
  private readonly headLoc = new Vector3();
  private readonly fruitAt = new Vector3();
  private readonly chestAt = new Vector3();
  private fastRep = false;
  /** El jefe del último tramo (PR 3: rope-boss.ts), lo que se ve de él y lo que mira de ti: si acabas de darle (un remo explosivo
   * o bajar con la carga ×2 o más) o de hacer un remo cualquiera. */
  private boss: RopeBoss | null = null;
  /** Los jefes de la ronda, por orden (uno en cada zona y el dragón: rope-boss.ts, `ropeBosses`); `boss`, el que toca. */
  private bosses: RopeBoss[] = [];
  private bossLook!: RopeBossLook;
  private miniLook!: RopeMiniLook;
  private readonly bEnv: BossEnv = { s: 0, up: 0, req: 0.3, side: 0, strike: false, rep: false, playing: false };
  private strikeRep = false;
  /** El parapente del remo invertido sobre el mapa («en pruebas»: para.ts, para-flight.ts). */
  para!: ParaFlight;
  private anyRep = false;
  private readonly ropeHits: BarHits = {
    rep: (o) => {
      this.rope?.rep(this.clock, o.perfect);
      if (o.fast) this.fastRep = this.strikeRep = true; // (un remo explosivo: el que pasa el cable roto y le da al jefe)
      this.anyRep = this.trialRep = true;
    },
    blast: (p) => {
      this.rope?.boost(p);
      if (p >= 2) this.strikeRep = true; // (bajar con la carga aguantada también le da al jefe)
    },
  };

  constructor(...a: ConstructorParameters<ReturnType<typeof createSystem>>) {
    super(...a);
    const self = this;
    this.env = {
      s: (k) => num(k),
      str: (k) => str(k),
      dv: (k) => dv(k, GAME.ramp),
      rnd: Math.random,
      head,
      hands,
      get state() {
        return self.mstate === 'play' ? (GAME.paused ? 'paused' : GAME.between ? 'rest' : 'play') : self.mstate;
      },
      arena: this.arena,
      eq: this.eq,
      preview: false,
      get gates() {
        return self.gateList();
      },
      arenaFromHead: () => {}, // (la arena es el mundo: no se mueve)
      sesWave: () => 0, // (las sesiones llegan con el PR 19)
      nWaves: () => nWaves(),
    };
    this.penv = { s: (k) => num(k), str: (k) => str(k), head, hands, eq: this.eq, preview: false, setSetting: (k, v) => setSetting(k, v), store: (k, v) => store(k, v) };
  }

  init(): void {
    this.world.createTransformEntity(this.root);
    // el ancla persistente del mundo (la de IWSDK: la misma en todas las sesiones): los aparatos se recuerdan respecto a ella
    this.anchorProbe = this.world.createTransformEntity(new Group());
    this.anchorProbe.addComponent(XRAnchor);
    askRoomAnchor(this.world);
    this.gates = this.world.getSystem(GateSystem) ?? null;
    // la línea luminosa entre tus manos al colocar el aparato
    this.line = new Mesh(new CylinderGeometry(0.012, 0.012, 1, 8), new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false }));
    this.line.userData.noInk = true;
    this.line.visible = false;
    this.root.add(this.line);
    this.hang = new HangScene(this.root, this.world.scene);
    // la arena de siempre (compuertas, suelo, valle y nubes), que de noche se esconde en el bosque (y en el cañón de la cuerda)
    const arena = ['arena-floor', 'gate-left', 'gate-center', 'gate-right', 'comic-valley', 'comic-clouds'];
    this.hang.arenaOf = () => arena.map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is NonNullable<typeof o> => !!o);
    this.ropeScene = new RopeScene(this.root, this.hang.arenaOf, () => (this.world.scene as unknown as { fog: { color: { getHex(): number } } | null }).fog?.color.getHex() ?? 0xc8d6e4);
    this.para = new ParaFlight(this.hang.arenaOf);
    this.trialsLook = new RopeTrialsLook(this.root, this.ropeScene.trackGroup);
    this.foesLook = new RopeFoesLook(this.root, this.ropeScene.trackGroup, (p, n, c) => HOOKS.sparks(p, n, c));
    this.bossLook = new RopeBossLook(this.root, (p, n, c) => HOOKS.sparks(p, n, c));
    this.miniLook = new RopeMiniLook(this.root, this.ropeScene.trackGroup, (p, n, c) => HOOKS.sparks(p, n, c));
    HOOKS.placeEq = (note) => this.startPlace(() => HOOKS.showMenu(''), note ?? '');
    HOOKS.eqPlaced = () => this.placed();
    HOOKS.placing = () => this.placing;
    HOOKS.cancelPlace = () => void this.cancelPlace();
  }

  /** ¿Es de noche en el bosque (colgado de la barra)? Entonces los entornos de día se apartan. */
  get nightForest(): boolean {
    return !!this.hang?.forestOn;
  }

  private get on(): boolean {
    return settings.mode === 'bars';
  }

  /** ¿Se juega la aventura en la cuerda? (el remo invertido, con «Remo invertido: aventura en la cuerda») */
  ropeOn(): boolean {
    return this.on && str('exercise') === 'row' && num('barRope') > 0 && !paraWanted(); // (el parapente sobre el mapa manda)
  }
  /** ¿Se ve la escena de la cuerda? (el entorno de serie se aparta) */
  get ropeShown(): boolean {
    return !!this.ropeScene?.visible;
  }
  /** La foto de fondo de la cuerda (la de la zona de la montaña de cada tramo: rope-worlds.ts, `worldPano`) y hacia dónde mira (rad). */
  get ropePano(): string {
    const R = this.rope;
    if (!R || !this.ropeShown) return '';
    // (llegado al final del tramo, ya la del siguiente: cambia mientras descansas)
    const i = R.reached ? R.course.wave(R.end + 0.01) : R.course.wave(R.s);
    return worldPano(Math.min(i, R.course.ends.length - 1), R.course.ends.length);
  }
  get ropeYaw(): number {
    return this.ropeScene?.yaw ?? 0;
  }

  // las compuertas abiertas, de donde salen los bichos que no llegan por un lado
  private gateList(): { x: number; z: number; ry: number; scale: number }[] {
    const gs = this.gates, list: { x: number; z: number; ry: number; scale: number }[] = [];
    if (!gs) return list;
    for (const e of gs.queries.gates.entities) list.push(gs.frame(e, { x: 0, z: 0, ry: 0, scale: 1 }));
    return list;
  }

  // ---------------------------------------------------------------- el aparato

  /** ¿Está colocado el aparato de este ejercicio? */
  placed(): boolean {
    return eqPose(this.eq, false, str('exercise') === 'row' ? 'dip' : 'door').set;
  }

  /** A colocarlo con las manos (RepArena: startPlace): `back`, a dónde volver al acabar (el menú). */
  startPlace(back: () => void, note = ''): void {
    this.placeDone = back;
    HOOKS.rigHome(); // (el aparato va en tu habitación: tu espacio sin girar)
    this.placer.start(this.penv, this.pout, note);
    this.flushPlace();
    HOOKS.hideMenu();
  }
  get placing(): boolean {
    return this.placer.on || this.placer.wait;
  }
  /** Lo deja (el botón de la muñeca: CANCELAR). */
  cancelPlace(): boolean {
    if (!this.placer.cancel(this.penv, this.pout)) return false;
    this.flushPlace();
    this.finishPlace();
    return true;
  }
  private finishPlace(): void {
    const back = this.placeDone;
    this.placeDone = null;
    back?.();
  }
  private flushPlace(): void {
    for (const e of this.pout) {
      if (e.type === 'snd') this.sound(e.name, e.args);
      else if (e.type === 'adjust') {
        // (los ajustes finos con un menú llegan con el PR 20: por ahora, colocado, vuelves al menú)
        const n = this.placer.note;
        this.placer.done(this.penv);
        if (n) HOOKS.say(n, '#3cf0c6', 3, false);
        this.finishPlace();
      }
    }
    this.pout.length = 0;
  }

  // ---------------------------------------------------------------- la ronda y las oleadas (las llama la partida)

  /** Empieza la ronda (RepArena: barReset y barToMount(0)): a colgarse. */
  begin(): void {
    this.clear();
    this.bar.reset();
    this.bar.toMount(0, false);
    this.mstate = 'mount';
    this.para.begin(paraWanted());
    // la cuerda de toda la ronda: cada tramo, lo que piden sus repeticiones
    if (this.ropeOn()) {
      const lens: number[] = [];
      for (let i = 0, n = Math.min(60, Math.max(1, nWaves())); i < n; i++) lens.push(waveReps(i) * ROPE.perRep);
      this.rope = new RopeRun(new RopeCourse(lens, 1 + Math.floor(Math.random() * 9973)));
      this.trials = new RopeTrials(buildTrials(this.rope.course), this.rope.course);
      // (los jefes: uno en cada zona y el dragón del último tramo; los retos, lejos de donde cortan el paso)
      this.bosses = ropeBosses(this.rope.course);
      this.boss = this.bosses[0] ?? null;
      const list = this.trials.list.filter((T) => this.bosses.every((B) => Math.abs(T.s - B.at) > 6));
      this.trials = new RopeTrials(list, this.rope.course);
    } else {
      this.rope = null;
      this.trials = null;
      this.boss = null;
      this.bosses = [];
    }
    this.trialsLook.reset();
    this.foesLook.reset();
    this.miniLook.reset();
    this.ropeScene.setCourse(this.rope?.course ?? null);
  }

  /** La oleada i va a empezar (la partida ya la preparó): la cola de objetivos, o los segundos de colgado. */
  startWave(i: number): void {
    if (this.para.on) this.para.startWave(waveReps(i));
    else if (this.rope) this.rope.startWave(i);
    else this.field.startWave(this.env, i);
    this.mstate = 'play';
  }

  /** Superada o descansando: a colgarse otra vez cuando acabe el descanso (RepArena: barToMount(waveIdx + 1)). */
  toMount(next: number): void {
    this.bar.toMount(next, false);
    this.mstate = 'mount';
  }

  /** ¿Superada la oleada? Colgado, cuando aguantas los segundos (o te engulle); si no, sin cola ni objetivos. */
  waveCleared(): boolean {
    if (this.mstate !== 'play') return false;
    if (str('exercise') === 'hang') return this.bar.hold >= this.bar.need || this.bar.failed;
    if (this.para.on) return this.para.cleared; // (el parapente: hechos los remos de la oleada)
    if (this.rope) return this.rope.reached; // (la cuerda: al llegar al cofre del tramo)
    return this.field.cleared();
  }

  /** Para el marcador. */
  hud(): { hold: number; need: number; left: number; mount: boolean; paraLeft: number | null; ropeLeft: number | null; bossLeft: number | null; bossName: string; turbo: boolean } {
    const B = this.boss;
    return { hold: this.bar.hold, need: this.bar.need, left: this.field.queue.length + this.field.alive(), mount: this.mstate === 'mount', paraLeft: this.para.on ? this.para.left : null, ropeLeft: this.rope ? Math.ceil(this.rope.left) : null, bossLeft: B && B.blocking ? B.nHits - B.hits : null, bossName: B ? BOSS_NAME[B.kind].replace(/^El /, '').replace(/^./, (c) => c.toUpperCase()) : '', turbo: !!this.rope?.turbo };
  }
  /** ¿Va la cuerda con el turbo? (las luciérnagas destellan, como en la Travesía) */
  get ropeTurbo(): boolean {
    return !!this.rope?.turbo && this.ropeShown;
  }

  /** El aviso del centro de la vista: colocar el aparato o colgarse (RepArena: drawCenter); null si no toca. */
  center(): CenterInfo | null {
    const row = str('exercise') === 'row', one = dipOne(str('dipBars'));
    if (this.placer.on || this.placer.wait) {
      const k = this.placer.kind, nm = eqName(k, one), c = this.cPlace, P = this.placer;
      c.bar = 1;
      c.count = '';
      c.status = null;
      c.note = null;
      if (P.wait) {
        c.title = `¡${nm.name.toUpperCase()} ${nm.pl ? 'COLOCADAS' : 'COLOCADA'}!`;
        c.lines = [P.note, k === 'door' ? 'Suéltate y ponte de pie.' : 'Ponte de pie.'];
      } else {
        c.title = 'COLOCAR ' + nm.name.toUpperCase();
        c.lines = k === 'door' ? ['Agárrala con las dos manos por', `encima de la cabeza. Quieto ${PLACE_HOLD} s.`] : one ? ['Túmbate cruzado debajo y agárrala con', `las dos manos, brazos estirados. Quieto ${PLACE_HOLD} s.`] : ['Túmbate debajo y agárralas con los', `brazos estirados. Quieto ${PLACE_HOLD} s.`];
        c.status = !P.seen ? ['No veo tus manos: míralas', WARN] : !P.up ? ['Sube las manos por encima de la cabeza', WARN] : !P.ok ? ['Separa más las manos', WARN] : ['Bien: no te muevas', '#3cf0c6'];
        c.note = ['Cancelar: botón de la muñeca izquierda', '#a49fc8'];
        if (P.t > 0) c.count = String(Math.max(1, Math.ceil(PLACE_HOLD - P.t)));
        c.bar = P.t / PLACE_HOLD;
      }
      return c;
    }
    if (this.mstate !== 'mount' || !this.on) return null;
    const c = this.cMount, B = this.bar, nm = eqName(row ? 'dip' : 'door', one);
    c.status = null;
    c.note = null;
    c.count = '';
    if (B.phase === 'place') {
      c.title = B.resume ? (row ? '¡A LAS PARALELAS!' : '¡A LA BARRA!') : row ? 'PARALELAS' : 'BARRA';
      c.lines = row ? [`Túmbate bajo ${nm.the}, ${one ? 'agárrala' : 'agárralas'}`, 'y estira los brazos. Quieto 1 s.'] : ['Ponte bajo la barra, o cuélgate', 'ya de ella. Quieto 1 s.'];
      c.note = this.near() ? ['en posición', '#3cf0c6'] : ['lejos de ' + nm.the, WARN];
      c.bar = B.still / 0.8;
    } else {
      c.title = row ? '¡AGÁRRATE!' : '¡CUÉLGATE!';
      c.lines = [B.phase === 'count' ? '' : 'Quieto…'];
      c.count = B.phase === 'count' ? String(Math.max(1, Math.ceil(3 - B.t))) : '';
      c.bar = B.phase === 'count' ? B.t / 3 : 1;
    }
    return c;
  }
  private near(): boolean {
    const e = eqPose(this.eq, false, str('exercise') === 'row' ? 'dip' : 'door');
    return Math.hypot(head.p.x - e.x, head.p.z - e.z) < 1.1;
  }

  /** Al acabar o salir: fuera todo. */
  clear(): void {
    this.field.clear();
    for (const e of this.entries) this.free(e);
    this.entries.length = 0;
    this.mstate = 'off';
    this.para?.clear();
    this.hang?.clear();
    if (this.rig) this.rig.grp.visible = false;
    this.rope = null;
    this.trials = null;
    this.boss = null;
    this.bosses = [];
    this.bossLook?.update(0, false, null, this.lookF, 0.3);
    this.miniLook?.reset();
    this.ropeScene?.setCourse(null);
    this.ropeScene?.update(false, 0);
    this.trialsLook?.update(0, false, this.trialLive, this.lookF, null, [0], 0, this.fruitAt, 0);
    this.foesLook?.update(0, false, this.trialLive, this.lookF, null, 0, [0], 0, 0, 0.3, false, 0);
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number, time: number): void {
    this.clock += dt;
    this.stepAnchor(dt);
    if (!this.on) {
      if (this.entries.length || this.mstate !== 'off') this.clear();
      this.line.visible = false;
      if (this.rig) this.rig.grp.visible = false;
      return;
    }
    // colocando el aparato (también desde el menú, fuera de la partida)
    if (this.placing) {
      this.placer.step(dt, this.penv, this.pout);
      this.flushPlace();
      this.paintLine();
    } else this.line.visible = false;
    this.syncRig();
    this.stepHang(dt, time);
    this.ropeScene.update(GAME.phase === 'playing' && this.mstate !== 'off' && !!this.rope, this.rope?.s ?? 0);
    this.stepPara(dt);
    if (GAME.phase !== 'playing' || this.mstate === 'off') return;
    if (GAME.paused) return;
    if (this.mstate === 'mount') {
      this.bar.mountStep(dt, this.env, this.out);
      this.applyAll();
    }
    if (this.mstate === 'play' && !GAME.between) {
      this.bar.detect(time, dt, this.env, this.out, this.para.on ? this.para.hits : this.rope ? this.ropeHits : this.field);
      this.applyAll();
      if (this.mstate === 'play' && !this.rope && !this.para.on) {
        this.field.spawnStep(dt, this.env, this.out, 1, true);
        this.applyAll();
      }
    }
    this.stepRope(dt);
    this.field.update(dt, time, this.env, this.out);
    this.applyAll();
    this.syncTargets(dt);
  }

  // el ancla de la habitación (IWSDK: XRAnchor, restaurada en cada sesión; «en pruebas», room-anchor.ts): en cuanto está en su
  // sitio, los aparatos vuelven al suyo de la habitación, aunque el origen de las gafas sea otro (pedido del usuario: tenía
  // que recolocarlas en cada partida). Paso a paso y vigilado: con el ancla en la configuración, la sesión se cerraba sola
  private stepAnchor(dt: number): void {
    const P = this.anchorProbe, xr = this.world.renderer.xr.isPresenting;
    if (!P) return;
    if (xr !== this.wasXR) {
      // (sesión nueva: hasta que IWSDK recupere el ancla de esta sesión, nada)
      this.wasXR = xr;
      this.anchorFrames = 0;
      this.anchorT = 0;
      this.anchorStep = 0;
      if (P.hasComponent(XRAnchor)) P.setValue(XRAnchor, 'attached', false);
      if (!xr && ROOM.note) {
        // (al salir, la página cuenta que el ancla se apagó sola)
        const st = document.getElementById('xrStatus');
        if (st) st.textContent = (st.textContent ? st.textContent + ' ' : '') + ROOM.note;
      }
    }
    const S = ROOM.sys;
    if (!xr || !ROOM.asked || !S) {
      if (this.eq.a2l) equipAnchorFrame(this.eq, null, (k, v) => store(k, v));
      return;
    }
    this.anchorT += dt;
    // paso 1: la sesión aguanta con las anclas pedidas (y, si la había, con la guardada recuperada)
    if (this.anchorStep === 0 && this.anchorT >= ANCHOR_SAFE_T) {
      this.anchorStep = 1;
      roomSafe();
      diagEvent('ancla: la sesión aguanta con ella pedida');
    }
    // paso 2: solo en Barras y si el navegador la concede, el sistema de IWSDK echa a andar (crea el ancla o usa la recuperada)
    if (this.anchorStep === 1 && ROOM.got && this.on) {
      this.anchorStep = 2;
      this.anchorT = 0;
      roomRisk('crear');
      diagEvent('ancla: en Barras, IWSDK la pone en marcha');
      S.play();
    }
    // (sin ancla a tiempo, el paso se da por bueno: lo que se vigila es que la sesión no muera)
    if (this.anchorStep === 2 && this.anchorT >= ANCHOR_MAKE_T) {
      this.anchorStep = 3;
      roomSafe();
      if (!P.getValue(XRAnchor, 'attached')) diagEvent('ancla: aún no está (IWSDK lo sigue intentando); los aparatos, como siempre');
    }
    // (los aparatos van en tu espacio tal cual lo dan las gafas: con el jugador de IWSDK sin mover, como en Barras)
    const g = P.object3D?.parent, pl = this.world.player, still = !pl || (Math.abs(pl.position.x) + Math.abs(pl.position.z) < 1e-3 && Math.abs(pl.rotation.y) < 1e-4);
    if (this.anchorStep < 2 || !g || !still || !P.getValue(XRAnchor, 'attached')) {
      if (this.eq.a2l) equipAnchorFrame(this.eq, null, (k, v) => store(k, v));
      return;
    }
    // (unos fotogramas de margen: el primero, el grupo aún no tiene la pose del ancla)
    if (++this.anchorFrames < 20) return;
    if (this.anchorFrames === 20) diagEvent(`ancla: en su sitio (${g.position.x.toFixed(2)} ${g.position.z.toFixed(2)}): los aparatos la siguen`);
    this.anchorPose.x = g.position.x;
    this.anchorPose.z = g.position.z;
    this.anchorPose.yaw = yawOf(g.quaternion);
    equipAnchorFrame(this.eq, this.anchorPose, (k, v) => store(k, v));
  }

  // el parapente sobre el mapa: lo que mandas colgado (el remo, irte a un lado, aguantar arriba) va al mapa; en el descanso planea solo
  private stepPara(dt: number): void {
    const live = GAME.phase === 'playing' && this.mstate !== 'off', playing = this.mstate === 'play' && !GAME.between;
    const up = playing && this.bar.det !== 'down' ? (head.p.y - this.bar.ref) / Math.max(0.05, barReq(this.env)) : 0;
    this.para.step(dt, live, GAME.paused, playing, up);
  }

  // la cuerda: subes remando y, sin remar, resbalas un poco; al llegar al cofre del tramo, el tramo superado
  private stepRope(dt: number): void {
    const R = this.rope;
    if (!R) return;
    const playing = this.mstate === 'play' && !GAME.between && !GAME.paused;
    // el tirón: lo que llevas subido el pecho en este remo (abajo, 0; en la barra, 1) te sube con los brazos
    const d = this.bar.det, pullF = playing && d !== 'down' ? (head.p.y - this.bar.ref) / Math.max(0.05, barReq(this.env)) : 0;
    R.pull(pullF);
    R.step(dt, playing);
    this.ropeScene.eye.copy(head.p);
    this.ropeScene.update(true, R.s); // (con lo que has subido en este fotograma)
    for (const e of R.ev) {
      if (e.t === 'ledge') {
        const last = e.wave >= R.course.ends.length - 1;
        HOOKS.say(last ? '¡LA CIMA!' : '¡COFRE!', '#ffd166', 1.6, false);
        HOOKS.score(50, true);
        SND.combo();
        // el cofre del tramo (colgado del cable; el último, en la estación de la cima) se abre y suelta sus premios (los puntos
        // y una gema), que suben flotando
        const at = this.ropeScene.openChest(e.wave, this.chestAt);
        if (at) {
          HOOKS.prize(at, [
            { icon: 'coins', text: '+50 puntos', color: '#ffd166' },
            { icon: 'gem', text: 'Gema', color: '#3cd8ff' },
          ]);
          HOOKS.sparks(at, 24, 0xffd166);
        }
      } else if (e.t === 'slip') HOOKS.say('¡Resbalas! Sigue remando', WARN, 1.6, true);
      // (al entrar en otra zona de la montaña, su nombre: se ve llegar, sin destellos)
      else if (e.t === 'zone') HOOKS.say(ROPE_WORLDS[e.k].name.toUpperCase(), '#ffd166', 2.2, false);
      // (el turbo por racha: los puntos de cada remo valen el doble mientras dura; se ve en las estelas y en el marcador)
      else if (e.t === 'turbo') {
        GAME.ptsK = e.on ? 2 : 1;
        if (e.on) {
          HOOKS.say('¡TURBO! ×2', '#c8ff3a', 1.6, false);
          SND.combo();
          haptic('left', 0.5, 60);
          haptic('right', 0.5, 60);
        }
      }
    }
    R.ev.length = 0;
    this.stepTrials(dt, playing);
  }

  // los retos y las frutas: lo que miran de ti (por dónde vas, lo subida y lo apartada que llevas la cabeza, si acabas de hacer
  // un remo explosivo), lo que pasa (avisos, puntos, frenar) y lo que se ve
  private stepTrials(dt: number, playing: boolean): void {
    const R = this.rope, T = this.trials;
    if (!R || !T || !this.ropeScene.placed) return;
    const E = this.tEnv, frame = this.ropeScene.frameGroup;
    frame.updateMatrixWorld();
    frame.worldToLocal(this.headLoc.copy(head.p));
    E.s = R.s;
    E.up = head.p.y - this.bar.ref;
    E.req = barReq(this.env);
    E.top = this.bar.det === 'top';
    E.side = this.headLoc.x - this.headAt0.x;
    E.fast = this.fastRep;
    E.free[0] = this.handFree(this.handSide[0], frame);
    E.free[1] = this.handFree(this.handSide[1], frame);
    for (let i = 0; i < 2; i++) {
      const h = this.handSide[i];
      if (!h.ok || h.est) E.wrist[i] = null;
      else {
        frame.worldToLocal(this.wristLoc.copy(h.wrist));
        const P = this.wristPt[i];
        P.x = this.wristLoc.x;
        P.y = this.wristLoc.y;
        P.z = this.wristLoc.z;
        E.wrist[i] = P;
      }
    }
    E.rep = this.trialRep;
    this.trialRep = false;
    // la bajada: desde que dejas lo alto (más del 85 % de la subida) hasta que llegas abajo (menos del 15 %)
    const uf = E.req > 0 ? E.up / E.req : 0;
    E.descent = 0;
    if (this.lastUpF >= 0.85 && uf < 0.85) this.downFrom = this.clock;
    else if (uf > 0.85) this.downFrom = -1;
    if (this.downFrom >= 0 && this.lastUpF >= 0.15 && uf < 0.15) {
      E.descent = this.clock - this.downFrom;
      this.downFrom = -1;
    }
    this.lastUpF = uf;
    E.playing = playing;
    this.fastRep = false;
    T.step(dt, E);
    T.tick(dt);
    for (const e of T.ev) {
      const tr = e.tr, k = tr.kind;
      if (e.t === 'start') {
        if (k === 'swarm' || k === 'rock' || k === 'gust') SND.whoosh(head.p);
        else if (k === 'bats') SND.roar(head.p, 1, 'bat');
        else if (k === 'bee') SND.roar(head.p, 1, 'bee');
        else if (k === 'crab') SND.hiss(head.p, 1, 'crab');
        else if (k === 'shooter') SND.roar(head.p, 0.8, shooterOf(R.course, tr));
        else if (k === 'onehand') SND.zap(head.p);
        else if (k === 'slow' || k === 'midhold') SND.creak(head.p);
      } else if (e.t === 'pass') {
        HOOKS.say(TRIAL_PASS[k] ?? '¡Bien!', '#8fdc5a', 1.0, false);
        HOOKS.score(k === 'onehand' || k === 'slow' ? 30 : 15, true);
        if (k === 'frayed') R.boost(3); // (el remo explosivo te lleva por encima del trozo roto)
      } else if (e.t === 'fail') {
        R.stumble();
        GAME.combo = 0;
        HOOKS.say(TRIAL_FAIL[trialKey(tr)] ?? '¡Ay!', WARN, 2.4, true);
        SND.partial();
        if (k !== 'gust' && k !== 'frayed') HOOKS.sparks(this.v1.copy(head.p).setY(head.p.y + 0.3), 12, k === 'rock' || k === 'shooter' ? 0xb0a090 : k === 'crab' ? 0xff7a4a : 0xffd23a);
        if (k === 'crab' || k === 'onehand') haptic(tr.side < 0 ? 'left' : 'right', 0.8, 120);
        if (k === 'slow') {
          this.ropeScene.shake = 1; // (bajaste de golpe: el cable se sacude)
          SND.creak(head.p);
        }
      } else if (e.t === 'fruit' && k === 'reach') {
        // (la gema, cogida con una mano)
        HOOKS.score(25, true);
        HOOKS.say('¡Gema!', '#ffd34d', 1.0, false);
        SND.orb(head.p, true);
        HOOKS.sparks(this.v1.copy(head.p).setY(head.p.y + 0.3), 16, 0xffd34d);
        haptic(tr.side < 0 ? 'left' : 'right', 0.6, 80);
      } else if (e.t === 'fruit') {
        HOOKS.score(10, true);
        SND.orb(head.p);
        HOOKS.sparks(this.v1.copy(head.p).setY(head.p.y + 0.15), 10, 0xff5a5a);
      }
    }
    T.ev.length = 0;
    T.live(this.trialLive);
    // (los remos lentos: mientras dura, el cable cruje y tiembla un poco)
    for (const L of this.trialLive) if (L.kind === 'slow' && L.st === 'judge') this.ropeScene.shake = Math.max(this.ropeScene.shake, 0.35);
    // lo que se ve: con tu cabeza y sus ejes (hacia donde subes —tus pies— y a un lado), y dónde queda tu cabeza arriba (las frutas)
    const F = this.lookF, ry = frame.rotation.y;
    F.head.copy(head.p);
    F.fwd.set(-Math.sin(ry), 0, -Math.cos(ry));
    F.right.set(Math.cos(ry), 0, -Math.sin(ry));
    this.fruitAt.set(this.headAt0.x, this.bar.ref + E.req + 0.03 - frame.position.y, this.headAt0.z);
    this.trialsLook.update(dt, this.ropeScene.visible, this.trialLive, F, R.course, this.ropeScene.laneList, this.ropeScene.laneHeight, this.fruitAt, this.clock);
    this.foesLook.update(dt, this.ropeScene.visible, this.trialLive, F, R.course, R.s, this.ropeScene.laneList, this.ropeScene.laneHeight, this.bar.ref, E.req, R.turbo, this.clock);
    this.stepBoss(dt, playing);
  }

  // los jefes (uno en cada zona y el dragón del último tramo): el que toca te corta el paso hasta derrotarlo (lo que mira de ti, lo
  // que pasa y lo que se ve); derrotado, el siguiente
  private stepBoss(dt: number, playing: boolean): void {
    const R = this.rope, F = this.lookF;
    if (this.boss?.st === 'down' && this.boss.t > 3.2) this.boss = this.bosses.find((X) => X.st !== 'down') ?? this.boss;
    const B = this.boss;
    if (!R || !B) return;
    const E = this.bEnv;
    E.s = R.s;
    E.up = this.tEnv.up;
    E.req = this.tEnv.req;
    E.side = this.tEnv.side;
    E.strike = this.strikeRep;
    E.rep = this.anyRep;
    E.playing = playing && R.course.wave(R.s) === B.wave && !R.reached;
    this.strikeRep = this.anyRep = false;
    B.step(dt, E);
    R.hold = B.blocking || (B.st === 'off' && R.course.wave(R.s) === B.wave) ? B.at : Infinity;
    const who = B.kind;
    for (const e of B.ev) {
      if (e.t === 'appear') {
        HOOKS.say(bossAppear(who), '#ff8a3d', 2.4, true);
        SND.roar(head.p, 0.7, who);
      } else if (e.t === 'wind') SND.roar(head.p, 0.9, who);
      else if (e.t === 'throw') SND.whoosh(head.p);
      else if (e.t === 'dodge') {
        this.bossLook.dodged();
        this.miniLook.dodged(B);
        HOOKS.say('¡Esquivada!', '#8fdc5a', 0.9, false);
        HOOKS.score(20, true);
      } else if (e.t === 'burn') {
        if (who === 'dragon') this.bossLook.burned(F);
        else this.miniLook.burned(B, F);
        GAME.combo = 0;
        SND.hurt();
        HOOKS.say(e.shot === 'ball' ? BOSS_SAY.burnBall : BOSS_SAY.burnSweep, WARN, 2.2, true);
      } else if (e.t === 'dizzy') HOOKS.say(BOSS_SAY.dizzy, '#ffd166', 2.4, true);
      else if (e.t === 'recover') HOOKS.say(BOSS_SAY.recover, '#a49fc8', 1.4, false);
      else if (e.t === 'hit') {
        SND.boltHit(head.p, 2);
        HOOKS.sparks(this.v1.copy(head.p).setY(head.p.y + 2.5), 26, 0xff8a3d);
        HOOKS.say(`¡Le has dado! Le quedan ${e.left}`, '#ffd166', 1.6, false);
        HOOKS.score(40, true);
      } else if (e.t === 'down') {
        HOOKS.trophy(bossDown(who), 'La cuerda está libre', '#ffd166');
        HOOKS.score(200, true);
        SND.explosion(this.v1.copy(head.p).setY(head.p.y + 4), true);
      }
    }
    B.ev.length = 0;
    this.bossLook.update(dt, this.ropeScene.visible, who === 'dragon' ? B : null, F, this.tEnv.req);
    this.miniLook.update(dt, this.ropeScene.visible, who === 'dragon' ? null : B, R.course, F, this.ropeScene.laneHeight, this.tEnv.req);
  }
  private readonly v1 = new Vector3();

  // al colgarte la primera vez en la ronda: la cuerda pasa por tus paralelas, a lo largo de tu cuerpo, subiendo hacia tus pies
  // (tumbado, es lo que se ve sin echar la cabeza atrás: lo que se acerca, a la vista; pedido del usuario, que lo veía «al
  // revés»: subía hacia lo alto de la cabeza y había que mirar atrás) (con dos paralelas, por cada una; con una, cruzada sobre
  // ti, por encima de su centro)
  private placeRope(): void {
    if (!this.rope || this.ropeScene.placed) return;
    const e = eqPose(this.eq, false, 'dip'), one = dipOne(str('dipBars'));
    const ax = this.tmp, az = new Vector3(), upH = new Vector3(0, 1, 0).applyQuaternion(head.q).setY(0);
    eqAxes(e, ax, az);
    const along = one ? ax : az; // (con dos, a lo largo de las paralelas; con una, cruzado a ella)
    if (upH.lengthSq() < 1e-4) upH.copy(along);
    const sg = along.dot(upH) >= 0 ? -1 : 1; // (lo alto de tu cabeza, al revés: hacia tus pies)
    this.ropeScene.place(e.x, num('dipH') / 100, e.z, along.x * sg, along.z * sg, one, num('dipGap') / 100);
    const fr = this.ropeScene.frameGroup;
    fr.updateMatrixWorld();
    fr.worldToLocal(this.headAt0.copy(head.p));
    // (qué mano está a cada lado, si se ven las dos)
    if (hands.left.ok && hands.right.ok && !hands.left.est && !hands.right.est) {
      const xl = fr.worldToLocal(this.wristLoc.copy(hands.left.wrist)).x, xr = fr.worldToLocal(this.wristLoc.copy(hands.right.wrist)).x;
      this.handSide = xl <= xr ? [hands.left, hands.right] : [hands.right, hands.left];
    }
  }

  // ¿está suelta la mano de ese lado? (no se ve, o se ha separado de la barra: más de 20 cm por debajo o lejos de ella a un
  // lado; con dos paralelas, cada una a su lado; con una, cruzada sobre ti)
  private handFree(h: Hand, frame: Object3D): boolean {
    if (!h.ok || h.est) return true;
    const w = frame.worldToLocal(this.wristLoc.copy(h.wrist)), lanes = this.ropeScene.laneList, gap = lanes.length > 1 ? Math.abs(lanes[1] - lanes[0]) : 0;
    const off = lanes.length > 1 ? Math.min(Math.abs(w.x - gap / 2), Math.abs(w.x + gap / 2)) : Math.abs(w.z);
    return w.y < -0.2 || off > 0.2;
  }

  // lo de debajo del que cuelga: el charco con tentáculos o el remolino, y el bosque de noche si cuelga
  private stepHang(dt: number, t: number): void {
    const door = str('exercise') !== 'row', e = eqPose(this.eq, false, 'door'), live = GAME.phase === 'playing' && this.mstate !== 'off' && e.set;
    this.hang.update(dt, t, {
      door: door && live,
      hang: str('exercise') === 'hang',
      pit: str('hangPit') || 'pool',
      mounting: this.mstate === 'mount',
      playing: this.mstate === 'play' && !GAME.between,
      frac: this.bar.need > 0 ? this.bar.hold / this.bar.need : 0,
      x: e.x,
      z: e.z,
      yaw: e.yaw,
      px: head.p.x,
      pz: head.p.z,
      paused: GAME.paused,
    });
  }

  private applyAll(): void {
    for (const ev of this.out) this.apply(ev);
    this.out.length = 0;
  }

  private sound(name: string, args: unknown[]): void {
    const f = SND_MAP[name];
    if (typeof f === 'function') f(...args);
  }

  private apply(ev: BarEvent): void {
    switch (ev.type) {
      case 'snd':
        this.sound(ev.name, ev.args);
        break;
      case 'fx': {
        if (ev.name === 'trail') break; // (el rastro de la subida hasta el objetivo: sin pintar por ahora)
        const rgb = ev.args.find((a) => Array.isArray(a)) as number[] | undefined, c = rgb ? ((rgb[0] * 255) << 16) | ((rgb[1] * 255) << 8) | (rgb[2] * 255) : 0xffffff;
        HOOKS.sparks(ev.at, ev.name === 'glow' ? 6 : 14, c);
        break;
      }
      case 'cheer':
        HOOKS.say(ev.text, ev.col, ev.dur, false);
        break;
      case 'say':
        HOOKS.say(ev.text, ev.col, ev.dur, ev.toast);
        break;
      case 'rep':
        HOOKS.arcRep(ev.perfect);
        if (GAME.combo % 10 !== 0) {
          if (ev.contact) HOOKS.say('¡Bien!', '#ffffff', 0.7, false);
          else if (ev.perfect) HOOKS.say('¡PERFECTA!', '#3cf0c6', 1, false);
          else if (ev.fast) HOOKS.say('Más controlado', '#ffffff', 1, false);
          else HOOKS.say('¡Bien!', '#ffffff', 1, false);
        }
        break;
      case 'hangSec':
        HOOKS.score(10, true);
        break;
      case 'partial':
        HOOKS.say(ev.text, WARN, 1.4, true);
        break;
      case 'fall': {
        // con el remolino abierto, te traga y la oleada termina; en la barra de puerta, los tentáculos del charco te agarran
        if (ev.door && str('exercise') === 'hang' && str('hangPit') === 'vortex') {
          this.hang.engulf(ev.at);
          HOOKS.playerHit(1, true);
          if (GAME.phase === 'playing') {
            HOOKS.say('¡TE ENGULLÓ EL REMOLINO!', '#ff6ab4', 2, false);
            this.bar.failed = true;
          }
          break;
        }
        if (ev.door) this.hang.grab(ev.at);
        else {
          SND.partial();
          HOOKS.sparks(ev.at, 8, 0xff8a4d);
        }
        HOOKS.playerHit(1, true);
        if (GAME.phase === 'playing') {
          HOOKS.say(ev.text, ev.col, 1.8, false);
          HOOKS.say(`${ev.text} (${ev.reason})`, WARN, 4, true);
          this.bar.toMount(0, true);
          this.mstate = 'mount';
        }
        break;
      }
      case 'mounted':
        this.placeRope();
        this.para.mount(eqPose(this.eq, false, 'dip'), dipOne(str('dipBars')));
        if (ev.resume) {
          this.mstate = 'play';
          HOOKS.say('¡Sigue!', '#3cf0c6', 1.2, false);
        } else HOOKS.barWave(ev.wave);
        break;
      case 'hurt':
        HOOKS.playerHit(1, false);
        break;
      case 'killed': {
        const t = ev.target as HeadTarget;
        HOOKS.foeDown(t.kind, !!t.K.boss, t);
        break;
      }
      case 'comboReset':
        GAME.combo = 0;
        break;
      case 'gate': {
        const gs = this.gates;
        if (!gs) break;
        let i = 0;
        for (const e of gs.queries.gates.entities) {
          if (i++ === ev.index) gs.openGate(e, ev.openT);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- lo que se ve

  private paintLine(): void {
    const L = this.placer.line;
    this.line.visible = L.visible;
    if (!L.visible) return;
    this.line.position.copy(L.mid);
    this.line.scale.set(1, L.len, 1);
    this.line.quaternion.setFromUnitVectors(this.tmp.set(0, 1, 0), L.dir);
    (this.line.material as MeshBasicMaterial).color.setHex(L.ok ? 0x3cf0c6 : 0xff8a3d);
  }

  // el aparato colocado, a su altura y con su giro; se rehace si cambian sus medidas
  private syncRig(): void {
    const row = str('exercise') === 'row', k = row ? 'dip' : 'door', e = eqPose(this.eq, false, k);
    const key = k === 'door' ? `door:${num('doorH')}:${num('doorW')}` : `dip:${num('dipH')}:${num('dipGap')}:${num('dipLen')}:${str('dipBars')}`;
    if (key !== this.rigKey || !this.rig) {
      if (this.rig) {
        this.root.remove(this.rig.grp);
        this.rig.grp.traverse((c) => {
          const m = c as Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        for (const m of this.rig.own) m.dispose();
      }
      this.rigKey = key;
      this.rig = k === 'door' ? createDoorBar(num('doorW') / 100, num('doorH') / 100) : createDipBars(num('dipGap') / 100, num('dipLen') / 100, num('dipH') / 100, dipOne(str('dipBars')));
      this.root.add(this.rig.grp);
    }
    this.rig.grp.visible = e.set;
    this.rig.grp.position.set(e.x, 0, e.z);
    this.rig.grp.rotation.y = e.yaw;
    // brilla al colocar y cuando toca colgarse
    this.rig.glowMat.opacity = this.mstate === 'mount' ? 0.55 + 0.25 * Math.sin(this.clock * 5) : 0.3;
  }

  private add(t: HeadTarget): void {
    const e: TEntry = { t, grp: new Group(), own: [] };
    if (t.bubble) {
      const b = createBubble(t.kind === 'bigbubble');
      e.bubble = b;
      e.grp = b.grp;
      e.own = b.own;
    } else {
      // el bicho: la abeja del catálogo (los de Barras de RepArena eran avispas hechas a mano)
      const gltf = AssetManager.getGLTF('foe-bee');
      if (gltf) {
        const model = gltf.scene, root = new Group();
        model.scale.setScalar(0.26 * (t.K.scale ?? 1));
        model.rotation.y = Math.PI;
        root.add(model);
        model.traverse((o) => {
          const m = o as SkinnedMesh;
          if (m.isMesh) {
            if (m.isSkinnedMesh) m.frustumCulled = false;
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.side = DoubleSide;
          }
        });
        const clip = gltf.animations.find((c) => c.name === 'Flying');
        if (clip) {
          const mixer = new AnimationMixer(model), a = mixer.clipAction(clip);
          a.setLoop(LoopRepeat, Infinity);
          a.timeScale = 3 * clip.duration;
          a.play();
          e.mixer = mixer;
        }
        e.grp = root;
      } else {
        const b = createBubble(); // (sin el modelo: una pompa)
        e.bubble = b;
        e.grp = b.grp;
        e.own = b.own;
      }
    }
    e.grp.position.copy(t.disp);
    this.root.add(e.grp);
    this.entries.push(e);
  }

  private free(e: TEntry): void {
    this.root.remove(e.grp);
    // (la forma de las pompas es de todas: solo se sueltan sus materiales)
    for (const m of e.own) m.dispose();
  }

  private syncTargets(dt: number): void {
    // los que salieron
    for (const t of this.field.targets) if (!this.entries.some((e) => e.t === t)) this.add(t);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i], t = e.t;
      if (!t.alive) {
        // reventado: la pompa estalla salpicando gotas irisadas, de cuatro colores (RepArena: BUBBLE_SPLASH), y se va
        if (e.bubble) for (const col of BUBBLE_SPLASH) HOOKS.sparks(t.center(this.tmp, this.env), t.kind === 'bigbubble' ? 12 : 7, col);
        if (!e.bubble) HOOKS.sparks(t.center(this.tmp, this.env), 16, 0xb8ff5a);
        this.free(e);
        this.entries.splice(i, 1);
        continue;
      }
      e.grp.position.copy(t.disp);
      e.mixer?.update(dt);
      if (e.bubble) {
        e.grp.scale.copy(t.shell).multiplyScalar(t.fade);
        // su película se arremolina con el tiempo; al darle, parpadea más opaca; al irse, se desvanece
        const U = e.bubble.mat.uniforms;
        U.uTime.value = this.clock;
        U.uOpacity.value = (t.flick > 0 ? 1.4 : 1) * t.fade;
        if (e.bubble.eye) e.bubble.eye.lookAt(head.p);
      } else {
        e.grp.rotation.set(t.rotX, t.rotY, 0);
        e.grp.scale.setScalar(t.scale * t.fade);
      }
    }
  }
}

void hangSecs;
void TGT;
void powRgb;
