/**
 * El modo Barras en la partida (RepArena: src/72_bars.js y src/35_equip.js, y la parte de Barras de src/70_game.js): dominadas
 * en la barra de puerta, remo invertido en las paralelas y colgado. Cada subida con la cabeza revienta una pompa (o un bicho
 * que viene volando); colgado, se aguantan los segundos de la oleada. El aparato se coloca una vez con las manos y se
 * recuerda; para empezar cada oleada hay que colgarse (la cuenta atrás de 3 s) y, si te sueltas, volver a la barra. Cómo se
 * detecta, qué sale y cuándo lo dice la lógica pura (detect.ts, targets.ts, place.ts, equip.ts), comparada con RepArena;
 * aquí se pinta, suena y puntúa. La partida (GameSystem) pasa las oleadas con lo que este sistema le dice (`waveCleared`).
 */
import { AnimationMixer, AssetManager, createSystem, DoubleSide, Group, LoopRepeat, Mesh, MeshBasicMaterial, CylinderGeometry, Vector3 } from '@iwsdk/core';
import type { Material, SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { dv, nWaves, store } from '../../core/settings.js';
import { GAME, HOOKS, type CenterInfo } from '../../core/state.js';
import { num, settings, str } from '../../core/values.js';
import { GateSystem } from '../../combat/gates.js';
import { hands, head } from '../../input/hand-model.js';
import { setSetting } from '../../core/settings.js';
import { HangScene } from './hang-scene.js';
import { createBubble, createDipBars, createDoorBar, type BarRigParts, type BubbleParts } from '../../scene-assets/bars.scene-asset.js';
import { BarDetector, powRgb } from './detect.js';
import { dipOne, eqName, eqPose, loadEquip, type Equip } from './equip.js';
import type { BarEvent, BarsEnv, PlaceEnv } from './env.js';
import { Placer, PLACE_HOLD, type PlaceEvent } from './place.js';
import { BarField, HeadTarget, hangSecs, TGT } from './targets.js';

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
    this.gates = this.world.getSystem(GateSystem) ?? null;
    // la línea luminosa entre tus manos al colocar el aparato
    this.line = new Mesh(new CylinderGeometry(0.012, 0.012, 1, 8), new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false }));
    this.line.userData.noInk = true;
    this.line.visible = false;
    this.root.add(this.line);
    this.hang = new HangScene(this.root, this.world.scene);
    // la arena de siempre (compuertas, suelo, valle y nubes), que de noche se esconde en el bosque
    const arena = ['arena-floor', 'gate-left', 'gate-center', 'gate-right', 'comic-valley', 'comic-clouds'];
    this.hang.arenaOf = () => arena.map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is NonNullable<typeof o> => !!o);
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
  }

  /** La oleada i va a empezar (la partida ya la preparó): la cola de objetivos, o los segundos de colgado. */
  startWave(i: number): void {
    this.field.startWave(this.env, i);
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
    return this.field.cleared();
  }

  /** Para el marcador. */
  hud(): { hold: number; need: number; left: number; mount: boolean } {
    return { hold: this.bar.hold, need: this.bar.need, left: this.field.queue.length + this.field.alive(), mount: this.mstate === 'mount' };
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
    this.hang?.clear();
    if (this.rig) this.rig.grp.visible = false;
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number, time: number): void {
    this.clock += dt;
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
    if (GAME.phase !== 'playing' || this.mstate === 'off') return;
    if (GAME.paused) return;
    if (this.mstate === 'mount') {
      this.bar.mountStep(dt, this.env, this.out);
      this.applyAll();
    }
    if (this.mstate === 'play' && !GAME.between) {
      this.bar.detect(time, dt, this.env, this.out, this.field);
      this.applyAll();
      if (this.mstate === 'play') {
        this.field.spawnStep(dt, this.env, this.out, 1, true);
        this.applyAll();
      }
    }
    this.field.update(dt, time, this.env, this.out);
    this.applyAll();
    this.syncTargets(dt);
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
      const b = createBubble(t.kind === 'bigbubble' ? 0xffb0e8 : 0x7fe3ff);
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
        const b = createBubble(0xff6a4a); // (sin el modelo: una bola roja)
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
    if (e.bubble)
      e.grp.traverse((c) => {
        const m = c as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    for (const m of e.own) m.dispose();
  }

  private syncTargets(dt: number): void {
    // los que salieron
    for (const t of this.field.targets) if (!this.entries.some((e) => e.t === t)) this.add(t);
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i], t = e.t;
      if (!t.alive) {
        // reventado: la pompa estalla con sus gotas de colores y se va
        if (e.bubble) HOOKS.sparks(t.center(this.tmp, this.env), 22, 0xffa0e0);
        if (!e.bubble) HOOKS.sparks(t.center(this.tmp, this.env), 16, 0xb8ff5a);
        this.free(e);
        this.entries.splice(i, 1);
        continue;
      }
      e.grp.position.copy(t.disp);
      e.mixer?.update(dt);
      if (e.bubble) {
        e.grp.scale.copy(t.shell).multiplyScalar(t.fade);
        e.bubble.mat.opacity = (0.3 + (t.flick > 0 ? 0.35 : 0)) * t.fade;
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
