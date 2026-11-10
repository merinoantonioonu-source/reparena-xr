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
import { IDLE } from '../exercise/how.js';
import { aimForced, deepOn, groundList, handsFree } from '../core/rules.js';
import { deal, devFoe, gateFoes } from './foes.js';
import { curEx } from '../ui/fields.js';
import { dv, nLives, setSetting } from '../core/settings.js';
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
  // el lanzamiento con las manos (src/input/throw.ts), la diana y lo que le pasa
  private env!: ThrowEnv;
  private locks = new LockLines();
  private cfx!: ComicFx;
  private gaze = new Vector3(0, 0, -1);
  // oleadas
  private toSpawn = 0;
  // los que van a salir por una compuerta que se está abriendo (a cada uno le falta «t» para salir)
  private gates: GateSystem | null = null;
  private pending = Array.from({ length: 6 }, () => ({ gate: null as Entity | null, t: 0 }));
  private spawnT = 0;
  private betweenT = 0;
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
    for (const p of [this.board, this.warn, this.chargeP]) if (p) applyFonts(p);
    for (const e of [this.warnEntity, this.chargeEntity]) if (e?.object3D) e.object3D.visible = false;
    GAME.maxLives = GAME.lives = nLives(); // (las de tu rango)
    HOOKS.playerHit = (str) => this.onPlayerHit(str ?? 1);
    HOOKS.foeDown = () => this.onFoeDown();
    HOOKS.startRound = () => this.startRound();
    // (para las pruebas en el navegador: el estado de la partida, solo para mirarlo)
    (window as unknown as { __rx: unknown }).__rx = { GAME, game: this, enemies: this.enemies, Foe, snapshot: () => this.snapshot() };
    // la letra de la ×N de la bola (Bungee, para el lienzo)
    try {
      const face = new FontFace('Bungee', `url(${import.meta.env.BASE_URL}fonts/Bungee-Regular.ttf)`);
      void face.load().then((f) => document.fonts.add(f)).catch(() => {});
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
      foes.push({ kind: (o.userData.rt as { kind?: string } | undefined)?.kind, state: e.getValue(Foe, 'state'), hp: e.getValue(Foe, 'hp'), x: +o.position.x.toFixed(2), y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(2) });
    }
    const hc = (s: Side): number => HTH[s].c?.pow ?? 0;
    return { life: this.enemies.life.count, menu: GAME.menu, ex: settings.exercise, mode: settings.mode, warn: this.warnT > 0 ? this.warnText : '', chargeFloor: this.chargeEntity?.object3D?.visible ? this.chargeText : '', phase: GAME.phase, wave: GAME.wave, between: GAME.between, lives: GAME.lives, reps: GAME.reps, perfect: GAME.perfect, kills: GAME.kills, charge: this.chargePow, hand: [hc('left'), hc('right')], ballOn: GAME.ballOn, sound: soundState(), steam: this.gates?.steam() ?? null, head: [+GAME.head.x.toFixed(2), +GAME.head.y.toFixed(2), +GAME.head.z.toFixed(2)], foes };
  }

  // ---------------------------------------------------------------- paneles

  private setText(panel: UIKitMLAsset | null, id: string, text: string): void {
    if (!panel) return;
    const key = id + '@' + panel.assetId;
    if (this.texts.get(key) === text) return; // (solo si cambia: cada cambio rehace el texto)
    this.texts.set(key, text);
    panel.getElementById(id)?.setProperties({ text });
  }

  private message(text: string, secs = 2.5): void {
    this.setText(this.board, 'msg', text);
    this.msgT = secs;
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

  private refreshBoard(): void {
    const b = this.board;
    if (!b) return;
    this.setText(b, 'wave', GAME.phase === 'menu' ? 'PREPARADO' : `OLEADA ${GAME.wave}`);
    this.setText(b, 'lives', GAME.maxLives > 0 ? `VIDAS ${GAME.lives}/${GAME.maxLives}` : 'VIDAS SIN FIN');
    this.setText(b, 'reps', String(GAME.reps));
    this.setText(b, 'kills', `Derribados: ${GAME.kills}`);
    this.setText(b, 'perfect', `Perfectas: ${GAME.perfect}`);
    const pow = Math.max(this.chargePow, HTH.left.c?.pow ?? 0, HTH.right.c?.pow ?? 0); // (en la bola o en las manos)
    this.setText(b, 'charge', pow > 0 ? `Carga ×${pow}` : 'Sin carga');
    b.getElementById('charge')?.setProperties({ color: pow > 0 ? '#' + POW_COL[pow - 1].toString(16).padStart(6, '0') : '#8b95a8' });
    const t = GAME.phase === 'playing' ? this.clock - GAME.startTime : 0;
    const d = new Date();
    this.setText(b, 'time', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
  }

  // ---------------------------------------------------------------- la ronda

  private startRound(): void {
    this.enemies.clear();
    this.gates?.closeAll();
    for (const p of this.pending) p.gate = null;
    // el ejercicio: Combate con uno de pie (si lo elegido en RepArena era otro modo u otro ejercicio, la sentadilla)
    if (settings.mode !== 'combat') setSetting('mode', 'combat');
    if (!STAND_EX.includes(settings.exercise)) setSetting('exercise', curEx());
    // las vidas, las de tu rango (0: infinitas: los golpes no te eliminan)
    GAME.maxLives = nLives();
    Object.assign(GAME, { phase: 'playing', wave: 0, lives: GAME.maxLives, kills: 0, reps: 0, perfect: 0, startTime: this.clock });
    this.rampLvl = 0;
    this.st.reset(head.p.y); // (de pie: la referencia de la sentadilla)
    this.chargePow = 0;
    throwReset();
    gazeLockReset();
    punchReset();
    this.locks.clear();
    HOOKS.hideMenu();
    this.dealFoes();
    this.nextWave();
  }

  private nextWave(): void {
    GAME.wave++;
    GAME.between = true;
    this.betweenT = GAME.wave === 1 ? 3 : 4;
    this.toSpawn = 3 + GAME.wave;
    this.spawnT = 0;
    // la dificultad sube poco a poco de una oleada a otra (la «Dificultad creciente» de tu rango): llegan antes, más a la
    // vez y hay que bajar algo más. (En RepArena solo cuentan las oleadas superadas con soltura: llega con el PR 10.)
    this.rampLvl = GAME.wave - 1;
    GAME.foeSpeed = Math.min(2.2, Math.max(0.4, SQUAT_SPAWN_DIST / Math.max(1, dv('walkTime', this.rampLvl))));
    this.maxAlive = Math.max(1, Math.round(dv('maxAlive', this.rampLvl)));
    this.stCfg = this.readCfg(this.rampLvl);
    this.message(`OLEADA ${GAME.wave}`, this.betweenT);
    SND.horn();
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

  private gameOver(): void {
    GAME.phase = 'over';
    this.chargePow = 0;
    throwReset();
    this.locks.clear();
    SND.defeat();
    haptic('left', 1, 450);
    haptic('right', 1, 450);
    this.enemies.vanishAll();
    this.gates?.closeAll();
    for (const p of this.pending) p.gate = null;
    this.message('¡Te han derribado!', 4);
    // el menú principal, delante de ti, con cómo fue la ronda (el resumen de RepArena llega con el PR 12)
    const t = Math.floor(this.clock - GAME.startTime);
    HOOKS.showMenu(`Oleada ${GAME.wave} · ${GAME.reps} repeticiones (${GAME.perfect} perfectas) · ${GAME.kills} derribados · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  }

  // te han dado: pierdes las vidas de su fuerza (la de la tabla del desarrollador; RepArena: hurtPlayer)
  private onPlayerHit(str: number): void {
    if (GAME.phase !== 'playing') return;
    if (GAME.maxLives > 0) GAME.lives = Math.max(0, GAME.lives - Math.max(1, str));
    this.hurtT = 0.45;
    SND.hurt();
    this.message(GAME.maxLives === 0 ? '¡Golpe!' : GAME.lives > 0 ? '¡Golpe! Quedan ' + GAME.lives : '¡Golpe!', 1.5);
    if (GAME.maxLives > 0 && GAME.lives <= 0) this.gameOver();
  }

  private onFoeDown(): void {
    GAME.kills++;
  }

  // Cada zombi sale por una compuerta (como en RepArena): se abre y, al medio segundo, sale de dentro del túnel. Sin
  // compuertas libres, espera. (Si la escena no tiene compuertas, aparece delante, en abanico, a 9-13 m.)
  private spawnOne(): boolean {
    if (this.gates && this.gates.queries.gates.entities.size > 0) {
      const slot = this.pending.find((p) => !p.gate), g = slot ? this.gates.freeGate() : null;
      if (!slot || !g) return false;
      this.gates.openGate(g, 3.2);
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
      this.spawnFoe(x, z);
      return true;
    }
    return false;
  }

  // el zombi que toca: desde la segunda oleada, también gordos
  // Quién sale: repartidos entre los que eliges en Rivales (RepArena: buildWave → deal), bien mezclados; los que aún no
  // están (PR 8b) o no han acabado de cargarse, zombis verdes. Su resistencia, la de la tabla del desarrollador, y sube un
  // disparo cada cuatro oleadas (la escalera y los jefes llegan con el PR 10)
  private nextFoe: () => string = () => 'zgreen';
  private dealFoes(): void {
    this.nextFoe = deal(gateFoes(groundList()));
  }
  private spawnFoe(x: number, z: number): void {
    let k = this.nextFoe();
    if (!this.enemies.ready(k)) k = 'zgreen';
    this.enemies.spawn(k, x, z, devFoe('g:' + k).hp + Math.floor((GAME.wave - 1) / 4));
  }

  // los que salen por su compuerta, cuando ya está abierta
  private stepPending(dt: number): void {
    for (const p of this.pending) {
      if (!p.gate || (p.t -= dt) > 0) continue;
      const at = this.gates!.spawnPoint(p.gate, this.tmpC);
      this.spawnFoe(at.x, at.z);
      p.gate = null;
    }
  }

  // ---------------------------------------------------------------- el ejercicio

  private exercise(t: number, dt: number): void {
    const ev = this.stEvents;
    ev.length = 0;
    this.stIn.play = !GAME.between;
    this.st.update(t, dt, this.stIn, this.stCfg, ev);
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
    if (mode === 'auto') this.fireOrb(origin, dmg, perfect, pow);
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
  private nearest(): FoeTarget | null {
    let best: FoeTarget | null = null, bd = Infinity;
    for (const e of this.enemies.targets) {
      if (!e.alive) continue;
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
  private fireOrb(origin: Vector3, dmg: number, perfect: boolean, pow: number): void {
    const e = this.nearest();
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
    this.enemies.hit(e.entity, dmg, pow, d);
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
      // oleadas: pausa con el aviso (no sale nadie); luego van saliendo de uno en uno
      if (GAME.between) {
        this.betweenT -= dt;
        if (this.betweenT <= 0) GAME.between = false;
      } else {
        this.spawnT -= dt;
        this.stepPending(dt);
        let coming = 0;
        for (const p of this.pending) if (p.gate) coming++;
        if (this.toSpawn > 0 && this.spawnT <= 0 && this.enemies.aliveCount() + coming < this.maxAlive && this.spawnOne()) {
          this.toSpawn--;
          this.spawnT = Math.max(1.2, 2.4 - 0.1 * GAME.wave);
        }
        if (this.toSpawn <= 0 && coming === 0 && this.enemies.aliveCount() === 0) this.nextWave();
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
      if (this.msgT <= 0) this.setText(this.board, 'msg', GAME.phase === 'playing' ? IDLE[this.stCfg.ex] : 'Pulsa EMPEZAR');
    }
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.25;
      this.refreshBoard();
    }
  }
}
