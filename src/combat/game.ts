/**
 * La partida: Combate con los ejercicios de pie, como en RepArena (src/exercise/standing.ts: sentadilla, zancada, con
 * salto, con press, con elevación, swing, peso muerto, curl, curl con barra, elevación frontal y antebrazos).
 *  - Al cargar (bajar en la sentadilla, subir la pesa al hombro en el curl…) aparece la bola roja de energía, a un metro
 *    del pecho.
 *  - Aguantando en la postura más dura, la carga sube a ×2, ×3 y ×4 (cada nivel pide aguantar más; se ve también en el
 *    suelo). Lo que se hace mal sale en grande, impreso en el suelo, unos 4 s.
 *  - Al completar la repetición: la bola estalla y la carga pasa a las dos manos (un orbe en cada muñeca: uno por mano,
 *    sin acumular). Cada mano lanza el suyo con una sacudida hacia el zombi (la de RepArena, src/input/throw.ts); con
 *    «Mandos como manos», apuntando con el mando y con el gatillo. Con «El rayo va al que miras» (de serie), al zombi que
 *    llevas un momento mirando, que lleva su diana. Con la puntería automática (o con la mirada), la repetición dispara
 *    sola (al más cercano o al que miras); en el ordenador, también.
 *  - El daño, el de RepArena: 1 el rayo normal, 2 el perfecto, y la carga suma (×2: +1, ×3: +2, ×4: +4).
 *  - Un puñetazo rápido al zombi que tienes delante lo aparta y lo aturde un momento (sin quitarle vida).
 *  - Oleadas de zombis cada vez algo más rápidos; si te golpean, pierdes una vida; sin vidas, se acaba la ronda.
 */
import {
  createSystem,
  Entity,
  Euler,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  BackSide,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { EnemySystem, type FoeTarget } from './enemies.js';
import { GateSystem } from './gates.js';
import { ComicFx } from '../style/comic-fx.js';
import { LockLines } from './lockline.js';
import { applyFonts } from '../ui/fonts.js';
import { boltColor, Effects, POW_COL } from './fx.js';
import { Foe } from './components.js';
import { STAND_EX, standDefaults, StandingDetector, WARN_COL, type StandCfg, type StandEvent, type StandInput } from '../exercise/standing.js';
import { IDLE, PLACE } from '../exercise/how.js';
import { FLOOR_EX, FloorDetector, floorDefaults, type FloorCfg, type FloorInput } from '../exercise/floor.js';
import { aimForced, deepOn, flyList, foes, groundList, handsFree, isTiny, oneArm, twoShots } from '../core/rules.js';
import { HatchSystem, hatchFoes } from './hatch-foes.js';
import { devFoe, flyFoes, FOE_DEF, foeName, gateFoes } from './foes.js';
import { Rewards } from './rewards.js';
import { RUSH_SECS } from './perks.js';
import { BoardRing } from '../ui/board-ring.js';
import { buildWave, foeTierOf, isBossWave, killPoints, rampAfter, rampK, REP_TIME, repPoints, spawnGap, xrFoe, type WaveEnv, type WaveSpec } from './waves.js';
import { Flight, type FlyGate } from './flight.js';
import { FlyerSystem } from './flyers.js';
import { curEx, PLAY_EX } from '../ui/fields.js';
import { dv, nLives, nWaves, RAMP_CAP, rankIdx, rankName, setSetting, store, waveReps } from '../core/settings.js';
import { EX_NAMES, MODE_NAMES } from '../core/catalog.js';
import { num, on, settings, str } from '../core/values.js';
import { SND, soundState, unlockAudio } from '../audio/sound.js';
import { GAME, HOOKS } from '../core/state.js';
import { hands, head, headFwd, SIDES, type Side } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { HTH, throwCharge, throwReset, throwStep, type Charge, type ThrowEnv } from '../input/throw.js';
import { gazeLock, gazeLockReset, gazeLockStep } from '../input/gaze-lock.js';
import { PUNCH, punchReset, punchStep, type PunchTarget } from '../input/punch.js';

// Los ejercicios: los detectores de RepArena (src/exercise/standing.ts), con tus ajustes (Tu cuerpo: los recorridos de
// cada ejercicio, PERFECTA, aguante para el ×2, más por nivel y recarga profunda); se leen al empezar cada oleada (la
// dificultad creciente puede pedir bajar algo más)
const SQUAT_SPAWN_DIST = 11; // (a cuánto salen los zombis, más o menos: con lo que tardan en llegar da su velocidad)

/** Lo que suma la carga al daño (RepArena: POW_DMG): ×1 nada, ×2 +1, ×3 +2, ×4 +4. */
const POW_DMG = [0, 1, 2, 4];
// el nivel del rayo (RepArena, src/52_bolt.js: boltLevel): 1 el perfecto y, con carga, su nivel (de él salen su color y su sonido)
const boltLevel = (perfect: boolean, pow: number): number => Math.max(perfect ? 1 : 0, pow > 1 ? pow : 0);

// La puntería (Opciones → Rivales y armas): automática, con las manos (de serie) o con la mirada, como en RepArena: con
// la barra flexible, siempre automática (las dos manos están ocupadas); con pesas en las manos no se lanza con la mano,
// el rayo va al que miras (aimSources). Sin pistolas ni espadas todavía (PR 9)
const aimNow = (): 'auto' | 'hands' | 'gaze' => {
  const a = str('aim');
  if (aimForced() || a === 'auto') return 'auto';
  return a === 'gaze' || !handsFree() ? 'gaze' : 'hands';
};

// El panel entre oleadas: lo que dura (s) (RepArena: WIN.dur); y cada logro en grande (RepArena: TROPHY_SECS)
const WAVE_INTRO = 2.4, TROPHY_SECS = 3.6;

// Avisos en el suelo (RepArena, src/60_ui.js: warnFloor y chargeFloor)
const WARN_SECS = 4;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export class GameSystem extends createSystem({ foes: { required: [Foe] } }, {}) {
  private fx!: Effects;
  private enemies!: EnemySystem;
  private board: UIKitMLAsset | null = null;
  private texts = new Map<string, string>();
  private boardT = 0;
  private hurt!: Mesh;
  private hurtT = 0;
  // el ejercicio
  private st = new StandingDetector();
  private stCfg: StandCfg = standDefaults();
  private stIn!: StandInput;
  private stEvents: StandEvent[] = [];
  // los de suelo y sentado (fondos, plancha lateral, superman) y la colocación antes de empezar (RepArena: 'calib')
  private fl = new FloorDetector();
  private flCfg: FloorCfg = floorDefaults();
  private flIn!: FloorInput;
  private calibT = -1;
  private supNext = { t: 0 };
  private rampLvl = 0; // (oleadas superadas: la dificultad creciente de RepArena)
  private maxAlive = 5;
  // los avisos en el suelo: lo que se hace mal (4 s) y la carga ×2-×4 mientras se aguanta
  private warn: UIKitMLAsset | null = null;
  private warnEntity: Entity | undefined;
  private warnT = 0;
  private warnText = '';
  private chargeP: UIKitMLAsset | null = null;
  private chargeEntity: Entity | undefined;
  private chargeT = 0;
  private chargeS = 1;
  private floorE = new Euler(0, 0, 0, 'YXZ');
  private chargePow = 0; // nivel de la carga de la bola (0: ninguna)
  // el panel entre oleadas y el fundido leve detrás (una cortina oscura grande, por detrás del panel: la escena se ve)
  private waveP: UIKitMLAsset | null = null;
  private waveE: Entity | undefined;
  private veil!: Mesh;
  private introT = -1;
  // el marcador (el rosco, un lienzo) y los trofeos dorados
  private ring = new BoardRing();
  private ringFont = 'sans-serif';
  private msgText = '';
  private msgCol = '#3cf0c6';
  private rampNote = '';
  private rampUp = false;
  private waveDone = 0;
  private trophyP: UIKitMLAsset | null = null;
  private trophyE: Entity | undefined;
  private trophies: { title: string; sub: string; color: string }[] = [];
  private trophyT = 0;
  private trophyCur = '';
  private failBest = -1;
  // los premios (cartas de mejora, dorado, relámpago, cofre y carrera contra tu récord) y si se está descansando
  private rw!: Rewards;
  private resting = false;
  // el lanzamiento con las manos (src/input/throw.ts), la diana y lo que le pasa
  private env!: ThrowEnv;
  private locks = new LockLines();
  private cfx!: ComicFx;
  private gaze = new Vector3(0, 0, -1);
  // oleadas
  private queue: WaveSpec[] = [];
  private seen = new Set<string>();
  private gap = 2;
  private restT = 0;
  private waveTarget = 0;
  private taken0 = 0;
  private beatK = -1;
  // los que van a salir por una compuerta que se está abriendo (a cada uno le falta «t» para salir)
  private gates: GateSystem | null = null;
  private pending = Array.from({ length: 6 }, () => ({ gate: null as Entity | null, t: 0, kind: '', boss: false, hp: 1 }));
  private fg: FlyGate = { x: 0, z: 0, ry: 0, scale: 1 };
  private spawnT = 0;
  private msgT = 0;
  private clock = 0;
  private desktopDrop = 0;
  // temporales (sin crear objetos en cada fotograma)
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpD = new Vector3();
  private ballTarget = new Vector3();
  private bodyYaw = 0;

  init(): void {
    this.enemies = this.world.getSystem(EnemySystem)!;
    this.gates = this.world.getSystem(GateSystem) ?? null;
    // los efectos (bola, rayos, chispas, la carga en las manos), la diana y el velo rojo de los golpes
    this.fx = new Effects();
    this.world.createTransformEntity(this.fx.group);
    this.world.createTransformEntity(this.locks.group);
    this.cfx = new ComicFx();
    this.world.createTransformEntity(this.cfx.group);
    this.env = {
      on: false,
      playing: false,
      byGaze: true,
      sword: false,
      assist: 9,
      bodyFwd: GAME.fwd,
      gaze: this.gaze,
      targets: this.enemies.targets,
      fire: (side, o, d, tg, c) => this.fireFromHand(side, o, d, tg as FoeTarget, c),
      haptic,
      say: (text, _color, secs) => this.message(text, secs),
      lockShow: (e) => this.locks.show(e as FoeTarget),
    };
    this.stIn = { hands, head, fwd: new Vector3(0, 0, -1), play: false }; // (delante, en la arena: hacia las compuertas)
    this.flIn = { ...this.stIn, headQ: head.q, wave: false };
    this.hurt = new Mesh(new SphereGeometry(0.3, 24, 16), new MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0, side: BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
    this.hurt.renderOrder = 20;
    this.hurt.visible = false;
    this.world.createTransformEntity(this.hurt);
    // los paneles (los menús, en src/ui/menu.ts)
    this.board = this.world.getSceneObject<UIKitMLAsset>('board-panel') ?? null;
    this.warn = this.world.getSceneObject<UIKitMLAsset>('warn-panel') ?? null;
    this.warnEntity = this.world.getSceneEntity('warn-panel');
    this.chargeP = this.world.getSceneObject<UIKitMLAsset>('charge-panel') ?? null;
    this.chargeEntity = this.world.getSceneEntity('charge-panel');
    this.waveP = this.world.getSceneObject<UIKitMLAsset>('wave-panel') ?? null;
    this.waveE = this.world.getSceneEntity('wave-panel');
    if (this.waveE?.object3D) this.waveE.object3D.visible = false;
    this.veil = new Mesh(new PlaneGeometry(14, 9), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
    this.veil.userData.noInk = true;
    this.veil.visible = false;
    this.world.createTransformEntity(this.veil);
    this.trophyP = this.world.getSceneObject<UIKitMLAsset>('trophy-panel') ?? null;
    this.trophyE = this.world.getSceneEntity('trophy-panel');
    if (this.trophyE?.object3D) this.trophyE.object3D.visible = false;
    for (const p of [this.board, this.warn, this.chargeP, this.waveP, this.trophyP]) if (p) applyFonts(p);
    this.rw = new Rewards(this.world, {
      message: (t, s) => this.message(t, s),
      sparks: (p, n, c, sp) => this.fx.sparks.burst(p, n, c, sp ?? 2.4, 0.04),
      addLife: () => {
        if (!(GAME.maxLives > 0) || GAME.lives >= GAME.maxLives) return false;
        GAME.lives++;
        return true;
      },
      trophy: (t, s, c) => this.trophy(t, s, c),
    });
    this.enemies.slowOf = (t) => this.rw.slow(t);
    for (const e of [this.warnEntity, this.chargeEntity]) if (e?.object3D) e.object3D.visible = false;
    GAME.maxLives = GAME.lives = nLives(); // (las de tu rango)
    HOOKS.playerHit = (str) => this.onPlayerHit(str ?? 1);
    HOOKS.foeDown = (k, b, t) => this.onFoeDown(k, b, (t as FoeTarget | undefined) ?? null);
    HOOKS.score = (pts, combo) => {
      GAME.score += pts;
      if (combo) {
        GAME.combo++;
        GAME.bestCombo = Math.max(GAME.bestCombo, GAME.combo);
      }
    };
    HOOKS.startRound = () => this.startRound();
    HOOKS.say = (text, color, secs) => {
      this.message(text, secs);
      if (color === WARN_COL) this.floorWarn(text, color); // (lo que se hace mal, también en grande en el suelo)
    };
    HOOKS.sparks = (p, n, c) => this.fx.sparks.burst(p, n, c, 2.4, 0.04);
    // (para las pruebas en el navegador: el estado de la partida, solo para mirarlo)
    (window as unknown as { __rx: unknown }).__rx = { GAME, game: this, enemies: this.enemies, Foe, snapshot: () => this.snapshot() };
    // la letra de la ×N de la bola (Bungee, para el lienzo)
    try {
      const face = new FontFace('Bungee', `url(${import.meta.env.BASE_URL}fonts/Bungee-Regular.ttf)`);
      void face
        .load()
        .then((f) => {
          document.fonts.add(f);
          this.ringFont = 'Bungee'; // (y la del rosco del marcador)
        })
        .catch(() => {});
    } catch {
      /* (sin FontFace: letra del sistema) */
    }
  }

  /** Para las pruebas: el estado de la partida en datos simples (window.__rx.snapshot()). */
  snapshot(): Record<string, unknown> {
    const foes: Record<string, unknown>[] = [];
    for (const e of this.queries.foes.entities) {
      const o = e.object3D;
      if (!o) continue;
      const ud = o.userData as { rt?: { kind: string; def: { boss?: boolean } }; fly?: { kind: string; flight: { K: { boss?: boolean } } }; hatch?: { beast: string; foe: { boss: boolean } } };
      foes.push({ kind: (ud.rt ?? ud.fly)?.kind ?? (ud.hatch ? 'h' + ud.hatch.beast : undefined), fly: !!ud.fly, hatch: !!ud.hatch, boss: !!(ud.rt?.def.boss || ud.fly?.flight.K.boss || ud.hatch?.foe.boss), state: e.getValue(Foe, 'state'), hp: e.getValue(Foe, 'hp'), x: +o.position.x.toFixed(2), y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(2) });
    }
    const hc = (s: Side): number => HTH[s].c?.pow ?? 0;
    return { life: this.enemies.life.count, menu: GAME.menu, ex: settings.exercise, mode: settings.mode, warn: this.warnT > 0 ? this.warnText : '', chargeFloor: this.chargeEntity?.object3D?.visible ? this.chargeText : '', phase: GAME.phase, wave: GAME.wave, between: GAME.between, score: GAME.score, combo: GAME.combo, queue: this.queue.length, intro: this.introT >= 0, resting: this.resting, cards: this.rw?.cardsShown ?? false, perks: this.rw ? [...this.rw.perks.has] : [], rush: this.rw?.rush.on ?? false, lives: GAME.lives, reps: GAME.reps, perfect: GAME.perfect, kills: GAME.kills, charge: this.chargePow, hand: [hc('left'), hc('right')], ballOn: GAME.ballOn, sound: soundState(), steam: this.gates?.steam() ?? null, head: [+GAME.head.x.toFixed(2), +GAME.head.y.toFixed(2), +GAME.head.z.toFixed(2)], foes };
  }

  // ---------------------------------------------------------------- paneles

  private setText(panel: UIKitMLAsset | null, id: string, text: string): void {
    if (!panel) return;
    const key = id + '@' + panel.assetId;
    if (this.texts.get(key) === text) return; // (solo si cambia: cada cambio rehace el texto)
    this.texts.set(key, text);
    panel.getElementById(id)?.setProperties({ text });
  }

  // Lo que pasa ahora, en el hueco del marcador (RepArena: cheer; las celebraciones van solo al marcador)
  private message(text: string, secs = 2.5, color = '#3cf0c6'): void {
    this.msgText = text;
    this.msgCol = color;
    this.msgT = secs;
    this.boardT = 0;
  }

  // ---------------------------------------------------------------- avisos en el suelo

  // Lo que estás haciendo mal se escribe en grande en el suelo, delante, durante 4 s (RepArena: warnFloor): más lejos
  // cuanto más alta la cabeza, tumbado y legible desde donde estás. Cada aviso nuevo sale delante; luego se queda quieto
  private floorWarn(text: string, color = WARN_COL): void {
    const p = this.warn, o = this.warnEntity?.object3D;
    if (!p || !o) return;
    if (text === this.warnText && this.warnT > 1) {
      this.warnT = WARN_SECS;
      return;
    }
    this.warnText = text;
    this.warnT = WARN_SECS;
    // en una o dos líneas, lo más grande que quepa (Bungee: unos 0,64 de ancho por letra; caben 1,4 m)
    const one = 140 / (0.64 * Math.max(1, text.length)), fs = one >= 9 ? Math.min(14, one) : Math.min(9, (2 * 126) / (0.64 * text.length));
    this.setText(p, 'text', text);
    p.getElementById('text')?.setProperties({ color, fontSize: fs });
    p.getElementById('box')?.setProperties({ borderColor: color });
    const d = clamp(head.p.y * 1.1, 0.5, 2.1);
    this.layFlat(o, d, 0.02, clamp(d * 0.85, 0.42, 1.7));
    o.visible = true;
  }

  // Aguantando abajo (o arriba en el curl) el disparo se carga: ×2, ×3, ×4. Agachado lo que ves es el suelo, así que la carga
  // se escribe ahí, más cerca que los avisos y latiendo con su color; a ×4 dice «¡ARRIBA!» (RepArena: chargeFloor)
  private chargeText = '';
  private chargeFloor(text: string, color: string): void {
    const p = this.chargeP, o = this.chargeEntity?.object3D;
    if (!p || !o) return;
    this.chargeText = text;
    this.setText(p, 'text', text);
    p.getElementById('text')?.setProperties({ color, fontSize: text.length <= 9 ? 15 : 12 }); // (en una línea: «×4 · ¡ARRIBA!» es más largo)
    p.getElementById('box')?.setProperties({ borderColor: color });
    const d = clamp(head.p.y * 0.75, 0.4, 1.4);
    this.chargeS = clamp(d * 0.8, 0.36, 1.1);
    this.layFlat(o, d, 0.03, this.chargeS);
    this.chargeT = 0;
    o.visible = true;
  }

  // tumbado en el suelo a d metros por delante del cuerpo, con lo de arriba del texto hacia delante (se lee desde aquí)
  private layFlat(o: { position: Vector3; quaternion: { setFromEuler(e: Euler): unknown }; scale: Vector3 }, d: number, y: number, s: number): void {
    const f = GAME.fwd;
    o.position.set(head.p.x + f.x * d, y, head.p.z + f.z * d);
    this.floorE.set(-Math.PI / 2, Math.atan2(-f.x, -f.z), 0);
    o.quaternion.setFromEuler(this.floorE);
    o.scale.setScalar(s);
  }

  private stepFloor(dt: number): void {
    const playing = GAME.phase === 'playing', w = this.warnEntity?.object3D, c = this.chargeEntity?.object3D;
    if (w?.visible) {
      this.warnT -= dt;
      if (this.warnT <= 0 || !playing) {
        w.visible = false;
        this.warnText = '';
      }
    }
    if (c?.visible) {
      if (!playing || this.chargePow < 2) {
        c.visible = false;
        this.chargeText = '';
      } else {
        this.chargeT += dt;
        c.scale.setScalar(this.chargeS * (1 + 0.06 * Math.max(0, Math.sin(this.chargeT * 9)) + 0.25 * Math.max(0, 1 - this.chargeT * 5))); // (sale con un golpe y late)
      }
    }
  }

  // El marcador (diseño C de RepArena: drawBoard), cuatro veces por segundo y solo lo que cambia
  private refreshBoard(): void {
    const b = this.board;
    if (!b) return;
    const N = nWaves(), playing = GAME.phase === 'playing', rush = this.rw?.rush;
    const ink = '#eeeaff', teal = '#3cf0c6', gold = '#ffd166', dim = '#5a4d7a', minus = (t: string): string => t.replace(/−/g, '-'); // (la letra no tiene «−»)
    // el relámpago: el borde de arriba es una mecha que se consume
    this.boardSet(b, 'fuse-box', { display: rush?.on ? 'flex' : 'none' });
    if (rush?.on) this.boardSet(b, 'fuse', { width: Math.max(0.5, (58 * rush.left) / RUSH_SECS).toFixed(1) });
    // arriba: la oleada en puntos (con más de 10, el número), los puntos y las vidas
    const wi = Math.max(0, GAME.wave - 1);
    for (let i = 0; i < 10; i++) {
      const on = playing && N > 0 && N <= 10 && i < N, done = i < wi || (i === wi && this.resting);
      this.boardSet(b, 'w' + i, { display: on ? 'flex' : 'none', backgroundColor: done ? teal : i === wi && GAME.wave ? '#3a2d5c' : dim, borderColor: done || i === wi ? teal : dim });
    }
    this.boardSet(b, 'wtext', { display: playing && !(N > 0 && N <= 10) ? 'flex' : 'none' });
    this.setText(b, 'wtext', playing ? (N ? `${Math.min(GAME.wave || 1, N)}/${N}` : `OLEADA ${GAME.wave || 1}`) : '');
    this.setText(b, 'score', String(GAME.score));
    this.boardSet(b, 'score', { color: rush?.on ? '#ffffff' : gold });
    this.boardSet(b, 'x2', { display: rush?.on ? 'flex' : 'none' });
    const L = GAME.maxLives;
    for (let i = 0; i < 8; i++) this.boardSet(b, 'l' + i, { display: L > 0 && L <= 8 && i < L ? 'flex' : 'none', backgroundColor: i < GAME.lives ? '#ff4fa3' : '#3a2d5c' }); // (las que pierdes, huecas)
    this.boardSet(b, 'ltext', { display: L === 0 || L > 8 ? 'flex' : 'none' });
    this.setText(b, 'ltext', L === 0 ? 'SIN FIN' : `VIDAS ${GAME.lives}`);
    // debajo: lo que llevas entrenando y, discreta, la hora
    const t = playing ? this.clock - GAME.startTime : 0, d = new Date();
    this.setText(b, 'train', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    this.setText(b, 'clock', `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    // el rosco: fuera, la oleada (en el descanso, la cuenta atrás) con la muesca de tu récord; dentro, la racha
    let k = this.waveTarget ? Math.min(1, this.waveDone / this.waveTarget) : 0;
    if (this.resting && num('rest') > 0) k = Math.max(0, Math.min(1, 1 - this.restT / num('rest')));
    const gh = playing && !this.resting ? this.rw?.ghostAt() : null;
    let notch = -1, ahead = false;
    if (gh && this.waveTarget) {
      const kk = (gh.g - (GAME.reps - this.waveDone)) / this.waveTarget;
      ahead = gh.beat || GAME.reps >= gh.g;
      if (kk > 0) notch = Math.min(0.995, kk);
    }
    if (this.ring.draw({ k: playing ? k : 0, notch, ahead: ahead && k > 0, combo: GAME.combo, gold: !!rush?.on, big: String(GAME.reps) }, this.ringFont)) b.getElementById('ring')?.setProperties({ src: this.ring.tex });
    // a la derecha, un solo hueco para lo que pasa ahora (lo más importante)
    let msg = '', col = teal;
    const lines = ['', '', ''];
    if (!playing) {
      msg = this.msgT > 0 ? this.msgText : 'PULSA EMPEZAR';
      lines[0] = `${MODE_NAMES[settings.mode] ?? ''} · ${EX_NAMES[settings.exercise] ?? ''}`;
    } else if (this.resting) {
      const waits = this.restT <= 0 && this.rw.waits();
      msg = waits ? 'ELIGE MEJORA' : `DESCANSO ${Math.max(0, Math.ceil(this.restT))}`;
      col = waits ? gold : teal;
      lines[0] = `Siguiente: ${waveReps(GAME.wave)} repeticiones${this.rampNote ? (this.rampUp ? ' · un poco más difícil' : ' · igual') : ''}`;
      const g = this.rw.ghostText();
      if (g) lines[1] = minus(g[0]);
    } else if (!GAME.wave && this.restT > 0) {
      msg = String(Math.max(1, Math.ceil(this.restT)));
      col = gold;
    } else if (this.msgT > 0) {
      msg = this.msgText;
      col = this.msgCol;
    } else if (rush?.on) {
      msg = '¡RELÁMPAGO! ×2';
      col = gold;
    }
    if (playing && !this.resting) {
      const g = this.rw.ghostText();
      if (g) lines[1] = minus(g[0]);
      lines[2] = IDLE[this.stCfg.ex] ?? '';
    }
    this.setText(b, 'msg', minus(msg));
    this.boardSet(b, 'msg', { color: col, display: msg ? 'flex' : 'none', fontSize: msg.length > 16 ? 3.6 : 5.2 });
    lines.forEach((l, i) => {
      this.setText(b, 'r' + (i + 1), l);
      this.boardSet(b, 'r' + (i + 1), { display: l ? 'flex' : 'none', color: i === 0 && this.rampUp && this.resting ? gold : ink });
    });
    // abajo a la derecha, tu rango
    this.setText(b, 'rank', rankName().toUpperCase());
  }

  // A un lado, por fuera de las compuertas (Entorno → «Marcador»: a la izquierda —de serie— o a la derecha)
  private placeBoard(): void {
    const o = this.world.getSceneEntity('board-panel')?.object3D;
    if (!o) return;
    if (!this.boardHome) this.boardHome = { x: o.position.x, y: o.position.y, z: o.position.z, ry: o.rotation.y, k: o.scale.x };
    const hs = this.world.getSystem(HatchSystem);
    if (hs?.on) {
      // en la batalla diminuta, tumbado en el suelo delante de tus manos (76 cm, como en RepArena), sólido para ellos
      o.position.set(hs.origin.x, 0.02, hs.origin.z - 0.95);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(0.76 / 0.64);
      return;
    }
    const right = str('board') === 'right';
    o.position.set(right ? -this.boardHome.x : this.boardHome.x, this.boardHome.y, this.boardHome.z);
    o.rotation.set(0, right ? -this.boardHome.ry : this.boardHome.ry, 0);
    o.scale.setScalar(this.boardHome.k);
  }
  private boardHome: { x: number; y: number; z: number; ry: number; k: number } | null = null;

  private boardSet(p: UIKitMLAsset, id: string, props: Record<string, unknown>): void {
    const k = id + '#' + p.assetId, v = JSON.stringify(props);
    if (this.texts.get(k) === v) return;
    this.texts.set(k, v);
    p.getElementById(id)?.setProperties(props);
  }

  // Los logros importantes, en grande y dorados (RepArena: trophy), uno tras otro: arriba, por encima de lo que llega
  trophy(title: string, sub = '', color = '#ffd166'): void {
    if (this.trophies.length < 6 && !this.trophies.some((o) => o.title === title) && this.trophyCur !== title) this.trophies.push({ title, sub, color });
  }

  private stepTrophy(dt: number): void {
    const p = this.trophyP, o = this.trophyE?.object3D;
    if (!p || !o) return;
    if (this.trophyT <= 0) {
      const q = this.trophies.shift();
      if (!q) {
        o.visible = false;
        this.trophyCur = '';
        return;
      }
      this.trophyCur = q.title;
      p.getElementById('title')?.setProperties({ text: q.title, color: q.color });
      p.getElementById('sub')?.setProperties({ text: q.sub, display: q.sub ? 'flex' : 'none' });
      for (const s of ['s1', 's2', 'box']) p.getElementById(s)?.setProperties(s === 'box' ? { borderColor: q.color } : { backgroundColor: q.color });
      this.trophyT = TROPHY_SECS;
      const f = GAME.fwd;
      o.position.set(head.p.x + f.x * 1.6, head.p.y + 0.42, head.p.z + f.z * 1.6); // (arriba: no tapa lo que llega)
      o.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
      o.visible = true;
      SND.combo();
      haptic('left', 0.7, 160);
      haptic('right', 0.7, 160);
    }
    this.trophyT -= dt;
    const age = TROPHY_SECS - this.trophyT;
    o.scale.setScalar(age < 0.25 ? 0.6 + 1.8 * age : age < 0.4 ? 1.05 - (age - 0.25) / 3 : 1); // (entra con un golpe y se asienta)
    if (age < dt * 1.5 || (age > 0.6 && age < 0.6 + dt)) this.fx.sparks.burst(o.position, 50, 0xffd14d, 2.6, 0.04);
    if (this.trophyT <= 0) o.visible = false;
  }

  // ---------------------------------------------------------------- la ronda

  private startRound(): void {
    this.enemies.clear();
    this.gates?.closeAll();
    for (const p of this.pending) p.gate = null;
    // el ejercicio: Combate con uno de pie (si lo elegido en RepArena era otro modo u otro ejercicio, la sentadilla)
    if (settings.mode !== 'combat') setSetting('mode', 'combat');
    if (!PLAY_EX.includes(settings.exercise)) setSetting('exercise', curEx());
    // las vidas, las de tu rango (0: infinitas: los golpes no te eliminan; al fallo, al menos una)
    GAME.maxLives = nLives();
    Object.assign(GAME, { phase: 'playing', wave: 0, lives: GAME.maxLives, kills: 0, reps: 0, perfect: 0, score: 0, combo: 0, bestCombo: 0, taken: 0, startTime: this.clock });
    this.rampLvl = GAME.ramp = 0;
    this.st.reset(head.p.y); // (de pie: la referencia de la sentadilla)
    this.chargePow = 0;
    throwReset();
    gazeLockReset();
    punchReset();
    this.locks.clear();
    HOOKS.hideMenu();
    this.seen.clear();
    this.queue.length = 0;
    this.rw.roundStart();
    this.resting = false;
    this.world.getSystem(HatchSystem)?.layout(false, head.p, false);
    this.placeBoard();
    // al fallo: la oleada más lejana a la que llegaste nunca con este ejercicio (para el trofeo al pasarla)
    const hist = store<{ ex?: string; mode?: string; fail?: number }[]>('reparena3-history') ?? [];
    this.failBest = num('toFail') ? hist.filter((r) => r.ex === settings.exercise && r.mode === settings.mode && r.fail).reduce((a, r) => Math.max(a, r.fail ?? 0), 0) : 0;
    // antes de la primera oleada, 3 s para colocarte (RepArena: 'ready'); en el suelo o sentado, antes, quieto en la postura
    // (RepArena: 'calib')
    GAME.between = true;
    this.stCfg = this.readCfg(0);
    this.flCfg = this.readFloorCfg(0);
    this.supNext.t = 0;
    if (FLOOR_EX.includes(settings.exercise)) {
      this.calibT = 0;
      this.restT = 0;
      this.message(PLACE[settings.exercise] ?? 'Colócate', 3600);
    } else {
      this.calibT = -1;
      this.restT = 3;
      this.message(nWaves() ? `PREPÁRATE · ${nWaves()} OLEADAS` : 'PREPÁRATE · AL FALLO', 3);
    }
  }

  // Empieza la oleada i (desde 0): quién sale (RepArena: buildWave), cada cuánto, cuántos a la vez y lo que pide el
  // ejercicio (con la dificultad creciente de las oleadas superadas con soltura); desde la segunda, el panel entre oleadas
  private startWave(i: number): void {
    GAME.wave = i + 1;
    GAME.between = false;
    GAME.ramp = this.rampLvl;
    const tiny = isTiny(), ground = tiny ? hatchFoes(groundList()) : gateFoes(groundList()), fly = flyFoes(flyList());
    const env: WaveEnv = { reps: waveReps(i), twoShots: twoShots(), foes: foes() as WaveEnv['foes'], ground, fly: flyList().includes('dragon') ? [...fly, 'dragon'] : fly, waves: nWaves(), rank: rankIdx(), ladder: on('foeLadder'), tiny, hp: (k) => devFoe(k).hp, tier: (k) => foeTierOf((key) => devFoe(key).tier, k) };
    const w = buildWave(i, env, this.seen);
    this.queue = w.list;
    this.waveTarget = env.reps;
    const rk = rampK(num('ramp'), this.rampLvl, RAMP_CAP);
    this.gap = spawnGap(this.queue, REP_TIME[settings.exercise] ?? 2.4, env.foes === 'flyers', env.twoShots, num('spawnGap'), rk);
    this.spawnT = 0.6;
    this.maxAlive = Math.max(1, Math.round(dv('maxAlive', this.rampLvl)));
    GAME.foeSpeed = Math.min(2.2, Math.max(0.4, SQUAT_SPAWN_DIST / Math.max(1, dv('walkTime', this.rampLvl))));
    this.stCfg = this.readCfg(this.rampLvl);
    this.flCfg = this.readFloorCfg(this.rampLvl);
    this.taken0 = GAME.taken;
    this.waveDone = 0;
    this.rw.waveStart(i, isBossWave(i, nWaves()));
    if (i > 0) {
      this.waveIntro(i, w.fresh, rk);
      this.spawnT += WAVE_INTRO; // (llegan cuando se va el panel)
    }
    if (this.failBest > 0 && i + 1 === this.failBest + 1) this.trophy('¡RÉCORD AL FALLO!', `Oleada ${i + 1}: nunca habías llegado tan lejos`);
    const W1 = `OLEADA ${i + 1}`;
    this.message(rk ? `${W1} · +${Math.round(rk * 100)} % DIFICULTAD` : W1, 1.6);
    SND.horn();
  }

  // El panel entre oleadas (RepArena: waveIntro): la oleada que empieza, tus puntos y lo nuevo, grande delante de ti
  // (donde salen los avisos), con la escena algo oscurecida detrás; mientras se ve, no sale nadie
  private waveIntro(i: number, fresh: string[], rk: number): void {
    const p = this.waveP, o = this.waveE?.object3D;
    if (!p || !o) return;
    const N = nWaves(), last = N > 0 && i >= N - 1;
    this.setText(p, 't1', last ? '¡ÚLTIMA OLEADA!' : N ? `OLEADA ${i + 1} DE ${N}` : `OLEADA ${i + 1}`);
    this.setText(p, 't2', `${GAME.score} puntos`);
    const nw = fresh.map((k) => foeName(xrFoe(k).k)).join(', ');
    const t3 = nw ? `Entra en juego: ${nw}` : rk ? `Un poco más difícil: +${Math.round(rk * 100)} %` : last && N > 1 ? `Has superado ${i} de ${N}` : '';
    this.setText(p, 't3', t3);
    p.getElementById('t3')?.setProperties({ color: nw ? '#ff8a3d' : '#3cf0c6', display: t3 ? 'flex' : 'none' });
    // delante de ti, a la altura de los ojos y de cara (derecho: nunca se ladea con la cabeza)
    const f = GAME.fwd;
    o.position.set(head.p.x + f.x * 1.6, head.p.y + 0.02, head.p.z + f.z * 1.6);
    o.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    this.veil.position.set(head.p.x + f.x * 1.75, head.p.y, head.p.z + f.z * 1.75);
    this.veil.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    this.introT = 0;
  }

  private stepIntro(dt: number): void {
    const o = this.waveE?.object3D;
    if (this.introT < 0 || !o) return;
    this.introT += dt;
    const t = this.introT, a = t < 0.35 ? (t / 0.35) * (t / 0.35) * (3 - 2 * (t / 0.35)) : Math.max(0, Math.min(1, (WAVE_INTRO - t) / 0.5));
    (this.veil.material as MeshBasicMaterial).opacity = 0.45 * a;
    this.veil.visible = a > 0.01;
    o.visible = a > 0.05;
    o.scale.setScalar(1 + 0.08 * Math.max(0, 1 - t / 0.5));
    if (t >= WAVE_INTRO) this.hideIntro();
  }

  private hideIntro(): void {
    this.introT = -1;
    this.veil.visible = false;
    if (this.waveE?.object3D) this.waveE.object3D.visible = false;
  }

  // Oleada superada: la dificultad creciente sube si ha sido con soltura; la última gana la ronda; si no, el descanso
  // (Ajustes → Partida: «Descanso entre oleadas») y la siguiente (RepArena: el final de 'play' en gameStep)
  private waveCleared(): void {
    const r = rampAfter(true, GAME.taken - this.taken0, this.waveTarget, num('ramp'), this.rampLvl, RAMP_CAP);
    if (r.up) this.rampLvl++;
    this.rampNote = r.note;
    this.rampUp = r.up;
    const N = nWaves();
    if (N && GAME.wave >= N) {
      this.endRound(true);
      return;
    }
    GAME.between = true;
    this.restT = num('rest');
    this.resting = true;
    this.rw.waveCleared();
    SND.victory();
    this.message(r.note ? `¡Oleada superada! ${r.note}` : '¡Oleada superada!', 2.5);
    if (this.restT <= 0 && !this.rw.waits()) this.endRest();
  }

  // se acaba el descanso: la carta que no elegiste, al azar, y la oleada siguiente
  private endRest(): void {
    if (this.resting) this.rw.restEnd();
    this.resting = false;
    this.startWave(GAME.wave);
  }

  // lo que piden los de suelo y sentado en esta oleada (RepArena: dv para lo que hace más difícil la dificultad creciente)
  private readFloorCfg(lvl: number): FloorCfg {
    return { ex: settings.exercise, dipDepth: dv('dipDepth', lvl), pushDepth: dv('pushDepth', lvl), splDrop: num('splDrop'), splHold: num('splHold'), supRange: num('supRange'), supHold: num('supHold'), supArms: str('supArms') || 'yes', perfectTime: num('perfectTime'), powHold: num('powHold'), powHoldInc: num('powHoldInc'), deepDrop: 0, power: true };
  }

  // ¿Quieto en la postura? (RepArena: calib) La cabeza, a su altura: sentado, entre 0,55 y 1,5 m; tumbado o en plancha
  // lateral, por debajo de 1 m. Dos segundos quieto y se toma esa postura
  private calibStep(dt: number): void {
    const y = head.p.y, ex = settings.exercise;
    const ok = ex === 'dips' ? y > 0.55 && y < 1.5 : y < 1.0 && y > (ex === 'superman' ? 0.04 : 0.15);
    if (ok && head.speed < 0.07) this.calibT += dt;
    else this.calibT = Math.max(0, this.calibT - dt * 2);
    if (this.calibT < 2) return;
    this.calibT = -1;
    this.fl.reset(y, { left: hands.left.ok ? hands.left.wrist.y : null, right: hands.right.ok ? hands.right.wrist.y : null });
    this.rw.standY = 1.6;
    this.world.getSystem(HatchSystem)?.layout(isTiny(), head.p, oneArm()); // (las trampillas, delante de tus manos)
    this.placeBoard();
    this.restT = 3;
    SND.charge();
    this.message('¡Bien! A punto', 3);
  }

  // lo que pide el ejercicio en esta oleada (RepArena: dv para lo que hace más difícil la dificultad creciente)
  private readCfg(lvl: number): StandCfg {
    return {
      ex: curEx(),
      squatDepth: dv('squatDepth', lvl),
      lungeDepth: dv('lungeDepth', lvl),
      swingDrop: num('swingDrop'),
      dlDepth: num('dlDepth'),
      thrUp: num('thrUp'),
      jsqJump: num('jsqJump'),
      curlRange: num('curlRange'),
      fraiseRange: num('fraiseRange'),
      twistDeg: num('twistDeg'),
      perfectTime: num('perfectTime'),
      powHold: num('powHold'),
      powHoldInc: num('powHoldInc'),
      deepDrop: deepOn() ? num('deepDrop') : 0,
      power: true, // (sin pistolas ni espadas todavía: PR 9)
    };
  }

  // Se acaba la ronda: al perder todas las vidas (win: false) o al superar la última oleada (RepArena: endRun)
  private endRound(win: boolean): void {
    GAME.phase = 'over';
    GAME.between = false;
    this.chargePow = 0;
    this.queue.length = 0;
    throwReset();
    this.locks.clear();
    this.hideIntro();
    this.rw.roundEnd();
    this.resting = false;
    if (win) SND.victory();
    else SND.defeat();
    haptic('left', 1, 450);
    haptic('right', 1, 450);
    this.enemies.vanishAll();
    this.gates?.closeAll();
    for (const p of this.pending) p.gate = null;
    this.message(win ? '¡Victoria!' : '¡Te han derribado!', 4);
    // el menú principal, delante de ti, con cómo fue la ronda (el resumen de RepArena llega con el PR 12)
    const t = Math.floor(this.clock - GAME.startTime);
    HOOKS.showMenu(`${win ? '¡Victoria!' : `Oleada ${GAME.wave}`} · ${GAME.score} puntos · ${GAME.reps} repeticiones (${GAME.perfect} perfectas) · ${GAME.kills} derribados · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  }

  // te han dado: pierdes las vidas de su fuerza (la de la tabla del desarrollador; RepArena: hurtPlayer)
  private onPlayerHit(str: number): void {
    if (GAME.phase !== 'playing') return;
    if (this.rw.absorb()) return; // (el escudo de las mejoras)
    if (GAME.maxLives > 0) GAME.lives = Math.max(0, GAME.lives - Math.max(1, str));
    this.hurtT = 0.45;
    SND.hurt();
    if (!this.rw.keepCombo()) GAME.combo = 0; // (te han dado: se rompe el combo, salvo con el combo de hierro)
    GAME.taken++;
    this.message(GAME.maxLives === 0 ? '¡Golpe!' : '¡Te han golpeado!', 1.3, '#ff3b5c');
    if (GAME.maxLives > 0 && GAME.lives <= 0) this.endRound(false);
  }

  // derribado: sus puntos (el jefe, 1500) (RepArena: onKilled)
  private onFoeDown(kind = '', boss = false, t: FoeTarget | null = null): void {
    GAME.kills++;
    GAME.score += killPoints(kind, boss) * this.rw.killK(t); // (dorado ×3, relámpago ×2)
    this.rw.onKill(t);
    if (boss) {
      this.message('¡JEFE DESTRUIDO!', 2.2, '#ffd166');
      SND.combo();
    }
  }

  // la repetición suma al combo y da sus puntos (más cuanto más combo; la perfecta, el doble); cada 10 seguidas, ¡COMBO!
  // (RepArena: registerRep)
  private repScore(perfect: boolean): void {
    GAME.combo++;
    GAME.bestCombo = Math.max(GAME.bestCombo, GAME.combo);
    GAME.score += repPoints(perfect, GAME.combo, this.rw.ptsK(perfect));
    this.rw.onRep(perfect);
    if (GAME.combo % 10 === 0) {
      this.message(`COMBO ×${GAME.combo}`, 1.5, '#ffd166');
      SND.combo();
    }
  }

  // Cada uno sale por una compuerta (como en RepArena): se abre y, al medio segundo, sale de dentro del túnel (los
  // voladores, volando por su hueco; la compuerta se queda abierta lo que tarden en salir). Sin compuertas libres, espera.
  // (Si la escena no tiene compuertas, aparece delante, en abanico, a 9-13 m.)
  private spawnOne(spec: WaveSpec): boolean {
    const tiny = isTiny(), who = xrFoe(spec.kind, tiny);
    if (tiny) {
      // la batalla diminuta: sale de una trampilla del suelo (los voladores, pequeños; los demás, los de las trampillas)
      const hs = this.world.getSystem(HatchSystem), at = hs?.nextTrap(this.tmpC);
      if (!hs || !at) return false;
      if (FOE_DEF[who.k]?.fly) {
        const flyers = this.world.getSystem(FlyerSystem);
        if (!flyers?.ready(who.k)) return true; // (aún cargando: este no sale)
        Object.assign(this.fg, { x: at.x, z: at.z, ry: 0, scale: 1 });
        this.rw.onSpawn(flyers.spawn(who.k, this.fg, spec.hp, dv('flySpeed', this.rampLvl), dv('erratic', this.rampLvl), true), who.boss);
        return true;
      }
      let beast = who.k.startsWith('h') ? who.k.slice(1) : who.k;
      if (!hs.ready(beast)) beast = hs.ready('crab') ? 'crab' : beast;
      this.rw.onSpawn(hs.spawn(beast, who.boss, at, spec.hp), who.boss);
      return true;
    }
    if (this.gates && this.gates.queries.gates.entities.size > 0) {
      const slot = this.pending.find((p) => !p.gate), g = slot ? (who.boss && this.gates.centerGate()) || this.gates.freeGate() : null;
      if (!slot || !g) return false;
      Object.assign(slot, { kind: who.k, boss: who.boss, hp: spec.hp });
      this.gates.openGate(g, FOE_DEF[who.k]?.fly ? Math.max(3.2, Flight.gateTime(who.k, dv('flySpeed', this.rampLvl))) : 3.2);
      slot.gate = g;
      slot.t = 0.55;
      return true;
    }
    for (let tries = 0; tries < 12; tries++) {
      const a = (Math.random() - 0.5) * (Math.PI * 0.75); // (±67°)
      const d = 9 + Math.random() * 4;
      const x = GAME.head.x + Math.sin(a) * d, z = GAME.head.z - Math.cos(a) * d;
      let ok = true;
      for (const e of this.queries.foes.entities) {
        const o = e.object3D;
        if (o && Math.hypot(o.position.x - x, o.position.z - z) < 1.2) ok = false;
      }
      if (!ok) continue;
      this.fg.x = x;
      this.fg.z = z;
      this.fg.ry = Math.atan2(GAME.head.x - x, GAME.head.z - z);
      this.spawnFoe(who.k, who.boss, spec.hp, this.fg, x, z);
      return true;
    }
    return false;
  }

  // Sale uno: los voladores, con su vuelo; si su modelo aún no ha cargado, un zombi verde
  private spawnFoe(k: string, boss: boolean, hp: number, gate: FlyGate, x: number, z: number): void {
    const flyers = this.world.getSystem(FlyerSystem);
    if (FOE_DEF[k]?.fly) {
      if (flyers?.ready(k)) {
        this.rw.onSpawn(flyers.spawn(k, gate, hp, dv('flySpeed', this.rampLvl), dv('erratic', this.rampLvl)), boss);
        return;
      }
      k = 'zgreen';
    }
    if (!this.enemies.ready(k)) k = 'zgreen';
    this.rw.onSpawn(this.enemies.spawn(k, x, z, hp, boss), boss);
  }

  // los que salen por su compuerta, cuando ya está abierta
  private stepPending(dt: number): void {
    for (const p of this.pending) {
      if (!p.gate || (p.t -= dt) > 0) continue;
      const at = this.gates!.spawnPoint(p.gate, this.tmpC);
      this.spawnFoe(p.kind, p.boss, p.hp, this.gates!.frame(p.gate, this.fg), at.x, at.z);
      p.gate = null;
    }
  }

  // ---------------------------------------------------------------- el ejercicio

  private exercise(t: number, dt: number): void {
    const ev = this.stEvents;
    ev.length = 0;
    this.stIn.play = !GAME.between;
    if (FLOOR_EX.includes(this.flCfg.ex)) {
      this.flIn.play = this.stIn.play;
      this.flIn.wave = !GAME.between && !this.resting;
      if (this.calibT < 0) this.fl.update(t, dt, this.flIn, this.flCfg, ev);
    } else this.st.update(t, dt, this.stIn, this.stCfg, ev);
    for (const e of ev) {
      if (e.type === 'charge') this.onCharge();
      else if (e.type === 'power') this.onPower(e.level, e.deep);
      else if (e.type === 'rep') this.onRep(e.perfect, e.fast, e.pow, e.side);
      else if (e.type === 'partial') this.onPartial(e.msg);
      else if (e.type === 'top') this.topCue(e.side);
      else {
        this.message(e.msg, 1.4);
        if (e.color === WARN_COL) this.floorWarn(e.msg, e.color);
      }
    }
  }

  // Arriba del todo en el curl, la elevación frontal o el curl con barra la repetición ya vale; el disparo sale al empezar
  // a bajar (para poder aguantar y cargar), pero aquí ya se nota: un chasquido de luz en las manos, su sonido y, con
  // mandos, una vibración (RepArena: topCue)
  private topCue(side: Side | null): void {
    const p = this.tmpA.set(0, 0, 0);
    let n = 0;
    for (const s of SIDES)
      if ((!side || s === side) && hands[s].ok) {
        p.add(hands[s].wrist);
        n++;
      }
    if (n) {
      p.divideScalar(n);
      this.fx.sparks.burst(p, 12, 0xffe073, 1.6, 0.025);
      this.fx.flashes.at(p, 0xfff2b3, 0.3, 0.12);
    }
    SND.tick();
    for (const s of SIDES) if (!side || s === side) haptic(s, 0.5, 40);
  }

  // al bajar: la bola de energía aparece con la carga
  private onCharge(): void {
    this.chargePow = 1;
    SND.charge();
  }

  // aguantando: la carga sube un nivel (deep: la recarga profunda, al bajar mucho de golpe)
  private onPower(p: number, deep = false): void {
    if (this.chargePow <= 0) return;
    this.chargePow = p;
    SND.power(p);
    if (deep) SND.perfect();
    if (p >= 4) {
      this.fx.ball.flashMax();
      this.fx.sparks.burst(this.fx.ball.pos, 60, 0xff4d70, 3.2, 0.03);
    }
    this.message(deep ? `¡RECARGA PROFUNDA! ×${p}` : `Carga ×${p}`, deep ? 1.3 : 1.2);
    this.chargeFloor(p >= 4 ? '×4 · ¡ARRIBA!' : deep ? `RECARGA ×${p}` : `CARGA ×${p}`, hex(POW_COL[p - 1])); // (en el suelo: aguantando, es lo que ves)
  }

  // a medias (no bajó o no subió lo bastante, le faltó el gesto…): la carga se pierde y el aviso sale en el suelo
  private onPartial(text: string): void {
    this.chargePow = 0;
    SND.partial();
    this.message(text, 1.2);
    this.floorWarn(text);
  }

  // Al subir, la repetición: la bola estalla y de ella salen los rayos; lanzando con las manos, la carga pasa a ellas
  // (como en RepArena: onRep)
  private onRep(perfect: boolean, fast: boolean, powIn: number, side: Side | null = null): void {
    GAME.reps++;
    this.waveDone++;
    this.repScore(perfect);
    if (perfect) {
      GAME.perfect++;
      SND.perfect();
      this.message('¡PERFECTA!', 1.0);
    } else this.message(fast ? 'Más controlado' : '¡Bien!', fast ? 1.0 : 0.7);
    const pow = Math.max(1, Math.min(4, powIn || 1)), dmg = (perfect ? 2 : 1) + POW_DMG[pow - 1];
    if (pow > 1) this.message(`¡DISPARO ×${pow}!`, 1.1);
    this.chargePow = 0;
    const bp = this.fx.ball.fire() ? this.tmpD.copy(this.fx.ball.pos) : null;
    if (bp) {
      this.fx.sparks.burst(bp, 18 + 6 * pow, 0xff5a78, 2.4, 0.03);
      this.fx.flashes.at(bp, 0xff4060, 0.35 + 0.1 * pow, 0.18);
    }
    const mode = aimNow(), inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (import.meta.env.DEV) console.info(`rxdbg repetición ${perfect ? 'perfecta' : 'normal'} ×${pow} (puntería ${mode})`);
    // (sin la bola, de la mano del brazo que hizo el curl, o del pecho)
    const origin = bp ?? (side && hands[side].ok ? this.tmpD.copy(hands[side].wrist) : this.chestPoint(this.tmpD));
    if (mode === 'auto') this.fireOrb(origin, dmg, perfect, pow, side);
    else if (!throwCharge(dmg, perfect, pow, mode === 'hands', inXR, this.env.say)) {
      if (mode === 'hands') this.fireOrb(origin, dmg, perfect, pow); // (en el ordenador, sin manos: al más cercano)
      else this.fireBolt(origin, headFwd(this.tmpC), head.p, dmg, perfect, gazeLock() as FoeTarget | null, pow); // con la mirada
    }
  }

  // de dónde sale el rayo si no se ve la bola: delante del pecho
  private chestPoint(out: Vector3): Vector3 {
    return out.copy(head.p).addScaledVector(GAME.fwd, 0.3).setY(head.p.y - 0.25);
  }

  // ---------------------------------------------------------------- el disparo

  /** El zombi en pie más cercano (la puntería automática). */
  private nearest(side: Side | null = null): FoeTarget | null {
    let best: FoeTarget | null = null, bd = Infinity;
    for (const e of this.enemies.targets) {
      if (!e.alive) continue;
      // (en la plancha con un brazo, cada brazo dispara a su lado: RepArena, pickNearest)
      if (side && oneArm() && (side === 'left' ? e.root.position.x - head.p.x > 0.05 : e.root.position.x - head.p.x < -0.05)) continue;
      const d = e.root.position.distanceToSquared(head.p);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** El zombi más cercano a la dirección d desde o, dentro de la «Ayuda de puntería» (RepArena: findLock). */
  private findLock(o: Vector3, d: Vector3): FoeTarget | null {
    let best: FoeTarget | null = null, bs = 1e9;
    const cone = (num('assist') * Math.PI) / 180;
    for (const e of this.enemies.targets) {
      if (!e.alive) continue;
      const v = e.center(this.tmpA).sub(o), dist = v.length();
      if (dist < 0.05) continue;
      const sc = v.angleTo(d) - Math.atan((e.radius * 1.3) / dist);
      if (sc < cone && sc < bs) {
        bs = sc;
        best = e;
      }
    }
    return best;
  }

  /** Puntería automática: el rayo sale de la bola (o del pecho) hacia el zombi más cercano. */
  private fireOrb(origin: Vector3, dmg: number, perfect: boolean, pow: number, side: Side | null = null): void {
    const e = this.nearest(side);
    if (e) this.strike(origin, e, dmg, perfect, pow);
    else this.miss(origin, this.tmpB.copy(origin).addScaledVector(GAME.fwd, 5), perfect, pow, false);
    if (pow > 1) SND.power(pow, origin);
  }

  /** Apuntando tú: el rayo sale hacia d y se engancha al zombi fijado (forced) o al de la ayuda de puntería. */
  private fireBolt(origin: Vector3, d: Vector3, lockFrom: Vector3 | null, dmg: number, perfect: boolean, forced: FoeTarget | null, pow: number): void {
    const e = forced && forced.alive ? forced : this.findLock(lockFrom ?? origin, d);
    if (e) this.strike(origin, e, dmg, perfect, pow);
    else this.miss(origin, this.tmpB.copy(origin).addScaledVector(d, 9), perfect, pow, true);
  }

  // el rayo que sale de una mano (la sacudida o el gatillo): siempre desde la mano
  private fireFromHand(side: Side, o: Vector3, d: Vector3, tg: FoeTarget, c: Charge): void {
    if (import.meta.env.DEV) console.info(`rxdbg rayo ${side} ${hands[side].virt ? 'gatillo' : 'sacudida'} daño ${c.dmg} ×${c.pow}`); // (para probar en el emulador)
    this.fireBolt(o, d, null, c.dmg, c.perfect, tg, c.pow);
    this.fx.flashes.at(o, boltColor(c.perfect, c.pow), 0.25, 0.12);
  }

  // el rayo llega: chispas, destello, sonido y el golpe al zombi (retrocede, o cae si se queda sin vida)
  private strike(from: Vector3, e: FoeTarget, dmg: number, perfect: boolean, pow: number): void {
    const tp = e.center(this.tmpA), col = boltColor(perfect, pow);
    this.fx.bolts.fire(from, tp, pow, col);
    this.fx.sparks.burst(tp, 18 + pow * 8, col, 2.4 + 0.6 * pow, 0.028);
    this.fx.flashes.at(tp, col, 0.6 + 0.25 * pow);
    this.fx.flashes.at(from, 0xff4060, 0.35, 0.15);
    const L = boltLevel(perfect, pow);
    SND.bolt(from, L);
    SND.boltHit(tp, L);
    const d = this.tmpC.copy(tp).sub(from).setY(0).normalize();
    this.enemies.hit(e.entity, dmg, pow, d, perfect);
    if (perfect) this.rw.onPerfectHit(e, tp, this.enemies.targets, (o, dist) => this.enemies.shove(o.entity, dist, 0.4, this.tmpD.copy(o.root.position).sub(tp).setY(0).normalize()));
    if (e.alive) this.cfx.hit(tp); // (en cómic: líneas de impacto; y si cae, la estrella)
    else this.cfx.kill(tp);
  }

  // sin nadie a quien dar: el rayo se pierde (apuntando tú, «Fallo»)
  private miss(from: Vector3, to: Vector3, perfect: boolean, pow: number, say: boolean): void {
    this.fx.bolts.fire(from, to, pow, boltColor(perfect, pow));
    this.fx.sparks.burst(to, 4, 0x99ffff, 1, 0.03);
    SND.bolt(from, boltLevel(perfect, pow));
    if (say) {
      SND.miss();
      GAME.combo = 0; // (un rayo perdido rompe el combo)
      this.message('Fallo', 0.6);
    }
  }

  // un puñetazo: lo aparta (hacia donde iba el puño) y lo aturde; no le quita vida
  private onPunch = (side: Side, t: PunchTarget, v: Vector3, sp: number): void => {
    const e = t as FoeTarget, k = Math.max(0.6, Math.min(1.4, sp / 4));
    this.enemies.shove(e.entity, 0.55 * k, 0.5, v);
    const hp = this.tmpB.copy(hands[side].wrist).lerp(e.center(this.tmpA), 0.5);
    this.fx.sparks.burst(hp, 14, 0xffd98a, 2.5, 0.035);
    this.fx.flashes.at(hp, 0xfff0c0, 0.35, 0.08);
    SND.squish(hp); // (RepArena: el puñetazo a un bicho; a un robot, el golpe metálico)
    haptic(side, 0.9, 60);
    if (PUNCH.n <= 2) this.message('¡Golpe!', 0.6);
  };

  // ---------------------------------------------------------------- cada fotograma

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    this.clock = time;
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!inXR) {
      // en el ordenador: flecha abajo (o S) para agacharse (al subir, el rayo sale solo) y Enter para empezar
      const kb = this.input.keyboard;
      const down = kb.getKeyPressed('ArrowDown') || kb.getKeyPressed('KeyS');
      this.desktopDrop += ((down ? 0.4 : 0) - this.desktopDrop) * Math.min(1, dt * 6);
      this.world.camera.position.y = 1.6 - this.desktopDrop;
      if (kb.getKeyDown('Enter') && GAME.phase !== 'playing') {
        unlockAudio();
        this.startRound();
      }
    }
    // la cabeza (la lee el sistema de las manos, src/input/hand-system.ts)
    GAME.head.copy(head.p);
    // hacia dónde mira el cuerpo: la cabeza en horizontal, girando despacio (la bola no da latigazos)
    headFwd(this.gaze);
    const want = Math.atan2(this.gaze.x, this.gaze.z);
    let dy = want - this.bodyYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.bodyYaw += dy * Math.min(1, dt * 2.5);
    GAME.fwd.set(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));

    const playing = GAME.phase === 'playing';
    if (playing) {
      this.exercise(time, dt);
      // oleadas: el descanso (no sale nadie); luego van saliendo de la cola, de uno en uno (con ritmo, en el pulso), sin
      // pasar de «Máximo a la vez»; cuando no queda nadie, oleada superada
      this.stepIntro(dt);
      this.rw.playStep(dt, time, !GAME.between);
      // tumbado, los voladores vienen bajos, a la altura de la cabeza (RepArena: lowFly, lowFlyY, SUP_ATK)
      const ex = this.flCfg.ex, cl = (v: number): number => Math.max(0.3, Math.min(0.8, v));
      GAME.lowFly = ex === 'splank' ? cl(this.fl.sp.ref + 0.03) : ex === 'superman' ? cl(this.fl.su.ref + this.flCfg.supRange / 100 + 0.08) : 0;
      GAME.sup = ex === 'superman' ? { hold: this.flCfg.supHold, up: this.fl.su.state === 'up', time: this.clock - GAME.startTime, next: this.supNext } : null;
      if (this.calibT >= 0) this.calibStep(dt);
      else if (this.resting || this.restT > 0) {
        // el descanso (o los 3 s antes de la primera): las cartas, que hacen esperar; el cofre
        if (this.resting) this.rw.restStep(dt, time, this.restT <= 0);
        if (this.rw.lateStart) {
          this.rw.lateStart = false;
          if (this.restT <= 3) this.restT = 3; // (elegida tarde: 3 s para prepararte)
        }
        if (this.restT > 0) this.restT -= dt;
        if (this.restT <= 0 && !(this.resting && this.rw.waits())) this.endRest();
      } else if (!GAME.between) {
        this.spawnT -= dt * this.rw.spawnK(); // (en el relámpago, el doble de seguidos)
        this.stepPending(dt);
        let coming = 0;
        for (const p of this.pending) if (p.gate) coming++;
        const P = num('bpm') > 0 ? 60 / num('bpm') : 0, bk = P ? Math.floor(time / P) : -1, beat = !P || bk !== this.beatK;
        this.beatK = bk;
        if (this.queue.length && this.spawnT <= 0 && this.enemies.aliveCount() + coming < this.maxAlive && beat && this.spawnOne(this.queue[0])) {
          this.queue.shift();
          this.spawnT = this.gap * (0.8 + Math.random() * 0.4);
        }
        if (!this.queue.length && coming === 0 && this.enemies.aliveCount() === 0 && !this.enemies.rocks.flying()) this.waveCleared();
      }
    }
    // las manos: lanzar el rayo (la sacudida o el gatillo), la mirada y el puñetazo
    const mode = aimNow(), env = this.env;
    env.on = playing && mode === 'hands';
    env.playing = playing && !GAME.between;
    env.byGaze = str('throwPick') !== 'hand';
    env.assist = num('assist');
    throwStep(dt, time, env);
    if (playing && mode === 'gaze') {
      const e = gazeLockStep(time, head.p, this.gaze, this.enemies.targets, num('assist')) as FoeTarget | null;
      if (e) this.locks.show(e);
    }
    punchStep(dt, playing && on('punch'), this.enemies.targets, this.onPunch);
    // la carga en cada mano: un orbe en la muñeca, del color de la carga
    for (const s of SIDES) {
      const c = HTH[s].c, h = hands[s];
      this.fx.orbs.set(s, env.on && h.ok && c ? this.tmpB.copy(h.wrist).addScaledVector(GAME.fwd, 0.05) : null, !!c?.perfect, c?.pow ?? 1, time);
    }
    this.locks.step(dt, head.p);
    // la bola: a un metro del pecho, a su altura (por debajo de los ojos), hacia donde mira el cuerpo
    this.ballTarget.set(GAME.head.x + GAME.fwd.x * 1.0, GAME.head.y - 0.32 + 0.012 * Math.sin(time * 1.7), GAME.head.z + GAME.fwd.z * 1.0);
    this.fx.ball.update(dt, this.ballTarget, playing ? this.chargePow : 0);
    GAME.ballOn = this.fx.ball.visible;
    GAME.ballPos.copy(this.fx.ball.pos);
    this.fx.bolts.update(dt, GAME.head);
    this.fx.sparks.update(dt);
    this.fx.flashes.update(dt);
    this.cfx.update(dt);
    this.stepFloor(dt);
    // el velo rojo de un golpe
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.hurt.visible = this.hurtT > 0;
      this.hurt.position.copy(GAME.head);
      (this.hurt.material as MeshBasicMaterial).opacity = Math.max(0, this.hurtT / 0.45) * 0.45;
    }
    // el marcador
    if (this.msgT > 0) {
      this.msgT -= dt;
    }
    this.stepTrophy(dt);
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.25;
      this.refreshBoard();
    }
  }
}
