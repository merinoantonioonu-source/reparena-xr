/**
 * La partida: Combate con sentadillas, como en RepArena.
 *  - Al bajar en sentadilla se carga el disparo (uno por mano) y aparece la bola roja de energía, a un metro del pecho.
 *  - Aguantando abajo en la postura perfecta, la carga sube a ×2, ×3 y ×4 (cada nivel pide aguantar más).
 *  - El rayo se lanza con una sacudida de la mano hacia el zombi (con mandos: apuntando y con el gatillo; en el
 *    ordenador: espacio). Sale de la bola y va al zombi más cercano a la dirección de la sacudida.
 *  - Oleadas de zombis cada vez algo más rápidos; si te golpean, pierdes una vida; con cinco, se acaba la ronda.
 */
import {
  createSystem,
  Entity,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  RayInteractable,
  SphereGeometry,
  BackSide,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { EnemySystem } from './enemies.js';
import { applyFonts } from '../ui/fonts.js';
import { Effects, POW_COL } from './fx.js';
import { Foe, FoeState } from './components.js';
import { squatConfig, VertDetector, type VertConfig, type VertEvent } from '../exercise/vertical.js';
import { deepOn } from '../core/rules.js';
import { dv, nLives } from '../core/settings.js';
import { num } from '../core/values.js';
import { setListener, sfx, unlockAudio } from '../audio/sound.js';
import { GAME, HOOKS } from '../core/state.js';

// La sentadilla: el detector de RepArena (src/exercise/vertical.ts), con tus ajustes (Tu cuerpo: profundidad, PERFECTA,
// aguante para el ×2, más por nivel y recarga profunda); se leen al empezar cada oleada (la dificultad creciente puede
// pedir bajar algo más)
const SQUAT_SPAWN_DIST = 11; // (a cuánto salen los zombis, más o menos: con lo que tardan en llegar da su velocidad)

/** Nitidez en las gafas: la resolución que se pide al entrar (×1 es la «nativa» del navegador de las Quest 3, que se
 * queda corta) y la foveación (cuánto se emborrona el borde de la vista para ir más ligero). */
const QUALITY = [
  { id: 'q-normal', scale: 1.0, foveation: 1.0 },
  { id: 'q-alta', scale: 1.4, foveation: 0.5 },
  { id: 'q-max', scale: 1.7, foveation: 0.2 },
];

const QUALITY_KEY = 'reparenaxr-quality';

type Side = 'left' | 'right';

/** Lo que se lleva de cada mano para ver la sacudida. */
interface HandTrack {
  hist: Vector3[]; // posiciones de la muñeca (relativas a la cabeza) en los últimos fotogramas
  times: number[];
  n: number;
  cool: number;
  charge: boolean; // ¿tiene la carga de esta repetición?
  last: Vector3;
  seen: boolean;
}

export class GameSystem extends createSystem({ foes: { required: [Foe] } }, {}) {
  private fx!: Effects;
  private enemies!: EnemySystem;
  private start: UIKitMLAsset | null = null;
  private board: UIKitMLAsset | null = null;
  private startEntity: Entity | undefined;
  private texts = new Map<string, string>();
  private quality = 1;
  private vrOk = false;
  private boardT = 0;
  private hurt!: Mesh;
  private hurtT = 0;
  // la sentadilla
  private sq = new VertDetector();
  private squatCfg: VertConfig = squatConfig();
  private rampLvl = 0; // (oleadas superadas: la dificultad creciente de RepArena)
  private maxAlive = 5;
  private sqEvents: VertEvent[] = [];
  private headSpeed = 0;
  private lastHead = new Vector3();
  private chargePow = 0; // nivel de la carga que hay (0: ninguna)
  private hands!: Record<Side, HandTrack>;
  // oleadas
  private toSpawn = 0;
  private spawnT = 0;
  private betweenT = 0;
  private msgT = 0;
  private clock = 0;
  private desktopDrop = 0;
  // temporales (sin crear objetos en cada fotograma)
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private aim = new Vector3();
  private ballTarget = new Vector3();
  private bodyYaw = 0;
  private rawDt = 0.014;

  init(): void {
    this.enemies = this.world.getSystem(EnemySystem)!;
    const mkHand = (): HandTrack => ({ hist: Array.from({ length: 12 }, () => new Vector3()), times: new Array(12).fill(0), n: 0, cool: 0, charge: false, last: new Vector3(), seen: false });
    this.hands = { left: mkHand(), right: mkHand() };
    // los efectos (bola, rayos, chispas) y el velo rojo de los golpes
    this.fx = new Effects();
    this.world.createTransformEntity(this.fx.group);
    this.hurt = new Mesh(new SphereGeometry(0.3, 24, 16), new MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0, side: BackSide, depthTest: false, depthWrite: false, toneMapped: false }));
    this.hurt.renderOrder = 20;
    this.hurt.visible = false;
    this.world.createTransformEntity(this.hurt);
    // la nitidez guardada
    try {
      // (propia de RepArena XR: el motor es otro y pide otra resolución que RepArena, que guarda la suya en «quality»)
      const raw = localStorage.getItem(QUALITY_KEY) ?? localStorage.getItem('rx-quality'), q = Number(raw);
      if (raw !== null && q >= 0 && q < QUALITY.length) this.quality = q;
    } catch {
      /* (sin almacenamiento: la de serie) */
    }
    // los paneles
    this.start = this.world.getSceneObject<UIKitMLAsset>('start-panel') ?? null;
    this.board = this.world.getSceneObject<UIKitMLAsset>('board-panel') ?? null;
    this.startEntity = this.world.getSceneEntity('start-panel');
    if (this.start) applyFonts(this.start);
    if (this.board) applyFonts(this.board);
    this.wireStartPanel();
    this.applyQuality();
    GAME.maxLives = GAME.lives = nLives(); // (las de tu rango)
    HOOKS.playerHit = () => this.onPlayerHit();
    HOOKS.foeDown = () => this.onFoeDown();
    this.showMenu('menu');
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
      foes.push({ state: e.getValue(Foe, 'state'), hp: e.getValue(Foe, 'hp'), x: +o.position.x.toFixed(2), y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(2) });
    }
    return { phase: GAME.phase, wave: GAME.wave, between: GAME.between, lives: GAME.lives, reps: GAME.reps, perfect: GAME.perfect, kills: GAME.kills, charge: this.chargePow, ballOn: GAME.ballOn, head: [+GAME.head.x.toFixed(2), +GAME.head.y.toFixed(2), +GAME.head.z.toFixed(2)], foes };
  }

  // ---------------------------------------------------------------- paneles

  private setText(panel: UIKitMLAsset | null, id: string, text: string): void {
    if (!panel) return;
    const key = id + '@' + panel.assetId;
    if (this.texts.get(key) === text) return; // (solo si cambia: cada cambio rehace el texto)
    this.texts.set(key, text);
    panel.getElementById(id)?.setProperties({ text });
  }

  private wireStartPanel(): void {
    const p = this.start;
    if (!p) return;
    const on = (id: string, fn: () => void): void => {
      const el = p.getElementById(id);
      if (!el) return;
      const h = (): void => {
        unlockAudio();
        sfx.click();
        fn();
      };
      el.addEventListener('click', h);
      this.cleanupFuncs.push(() => el.removeEventListener('click', h));
    };
    on('start-button', () => this.startRound());
    on('xr-button', () => this.world.launchXR());
    QUALITY.forEach((q, i) =>
      on(q.id, () => {
        this.quality = i;
        try {
          localStorage.setItem(QUALITY_KEY, String(i));
          localStorage.removeItem('rx-quality');
        } catch {
          /* */
        }
        this.applyQuality();
      }),
    );
    // «Entrar en VR», solo en el navegador y si tiene realidad virtual (dentro de las gafas ya estás)
    const refresh = (): void => {
      const is2D = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
      p.getElementById('xr-button')?.setProperties({ display: is2D && this.vrOk ? 'flex' : 'none' });
      p.getElementById('desk-hint')?.setProperties({ display: is2D ? 'flex' : 'none' });
    };
    this.cleanupFuncs.push(this.world.visibilityState.subscribe(refresh));
    void navigator.xr
      ?.isSessionSupported('immersive-vr')
      .then((ok) => {
        this.vrOk = ok && this.world.xrEnabled;
        refresh();
      })
      .catch(() => {});
  }

  // la nitidez: se pide al entrar en las gafas (dentro, cambiarla pide salir y volver a entrar)
  private applyQuality(): void {
    const q = QUALITY[this.quality];
    const xr = this.world.renderer.xr;
    if (!xr.isPresenting) xr.setFramebufferScaleFactor(q.scale);
    xr.setFoveation(q.foveation);
    const p = this.start;
    if (!p) return;
    QUALITY.forEach((qq, i) => {
      p.getElementById(qq.id)?.setProperties({ backgroundColor: i === this.quality ? '#ff3d8b' : '#2a2f3a', color: i === this.quality ? '#ffffff' : '#c9d2e3' });
    });
    this.setText(p, 'q-note', xr.isPresenting ? 'La resolución nueva se aplica al volver a entrar en VR' : 'Se aplica al entrar en VR');
  }

  private showMenu(kind: 'menu' | 'over'): void {
    const p = this.start;
    if (!p) return;
    p.visible = true;
    if (this.startEntity && !this.startEntity.hasComponent(RayInteractable)) this.startEntity.addComponent(RayInteractable);
    if (kind === 'menu') {
      this.setText(p, 'title', 'REPARENA XR');
      this.setText(p, 'subtitle', 'Prototipo · Combate con sentadillas');
      this.setText(p, 'start-label', 'EMPEZAR');
    } else {
      this.setText(p, 'title', 'FIN DE LA RONDA');
      const mins = Math.floor((this.clock - GAME.startTime) / 60), secs = Math.floor((this.clock - GAME.startTime) % 60);
      this.setText(p, 'subtitle', `Oleada ${GAME.wave} · ${GAME.reps} sentadillas (${GAME.perfect} perfectas) · ${GAME.kills} derribados · ${mins}:${String(secs).padStart(2, '0')}`);
      this.setText(p, 'start-label', 'OTRA RONDA');
    }
  }

  private hideMenu(): void {
    if (this.start) this.start.visible = false;
    if (this.startEntity?.hasComponent(RayInteractable)) this.startEntity.removeComponent(RayInteractable);
  }

  private message(text: string, secs = 2.5): void {
    this.setText(this.board, 'msg', text);
    this.msgT = secs;
  }

  private refreshBoard(): void {
    const b = this.board;
    if (!b) return;
    this.setText(b, 'wave', GAME.phase === 'menu' ? 'PREPARADO' : `OLEADA ${GAME.wave}`);
    this.setText(b, 'lives', GAME.maxLives > 0 ? `VIDAS ${GAME.lives}/${GAME.maxLives}` : 'VIDAS SIN FIN');
    this.setText(b, 'reps', String(GAME.reps));
    this.setText(b, 'kills', `Derribados: ${GAME.kills}`);
    this.setText(b, 'perfect', `Perfectas: ${GAME.perfect}`);
    this.setText(b, 'charge', this.chargePow > 0 ? `Carga ×${this.chargePow}` : 'Sin carga');
    b.getElementById('charge')?.setProperties({ color: this.chargePow > 0 ? '#' + POW_COL[this.chargePow - 1].toString(16).padStart(6, '0') : '#8b95a8' });
    const t = GAME.phase === 'playing' ? this.clock - GAME.startTime : 0;
    const d = new Date();
    this.setText(b, 'time', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
  }

  // ---------------------------------------------------------------- la ronda

  private startRound(): void {
    this.enemies.clear();
    // las vidas, las de tu rango (0: infinitas: los golpes no te eliminan)
    GAME.maxLives = nLives();
    Object.assign(GAME, { phase: 'playing', wave: 0, lives: GAME.maxLives, kills: 0, reps: 0, perfect: 0, startTime: this.clock });
    this.rampLvl = 0;
    this.sq.reset(GAME.head.y); // (de pie: la referencia de la sentadilla)
    this.chargePow = 0;
    this.hands.left.charge = this.hands.right.charge = false;
    this.hideMenu();
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
    this.squatCfg = squatConfig(dv('squatDepth', this.rampLvl), num('perfectTime'), num('powHold'), num('powHoldInc'), deepOn() ? num('deepDrop') : 0);
    this.message(`OLEADA ${GAME.wave}`, this.betweenT);
    sfx.wave();
  }

  private gameOver(): void {
    GAME.phase = 'over';
    this.chargePow = 0;
    this.hands.left.charge = this.hands.right.charge = false;
    sfx.over();
    this.enemies.vanishAll();
    this.message('¡Te han derribado!', 4);
    this.showMenu('over');
  }

  private onPlayerHit(): void {
    if (GAME.phase !== 'playing') return;
    if (GAME.maxLives > 0) GAME.lives--;
    this.hurtT = 0.45;
    sfx.punch();
    this.message(GAME.maxLives === 0 ? '¡Golpe!' : GAME.lives > 0 ? '¡Golpe! Quedan ' + GAME.lives : '¡Golpe!', 1.5);
    if (GAME.maxLives > 0 && GAME.lives <= 0) this.gameOver();
  }

  private onFoeDown(): void {
    GAME.kills++;
  }

  // dónde aparece cada zombi: delante, en abanico, a 9-13 m, fuera de las cajas y las rocas
  private spawnOne(): void {
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
      const chubby = GAME.wave >= 2 && Math.random() < Math.min(0.45, 0.15 * GAME.wave);
      this.enemies.spawn(chubby ? 'chubby' : 'basic', x, z);
      return;
    }
  }

  // ---------------------------------------------------------------- la sentadilla

  private squat(y: number, t: number, dt: number): void {
    const ev = this.sqEvents;
    ev.length = 0;
    this.sq.update(y, t, dt, this.headSpeed, this.squatCfg, ev);
    for (const e of ev) {
      if (e.type === 'charge') this.onCharge();
      else if (e.type === 'power') this.onPower(e.level);
      else if (e.type === 'rep') this.onRep(e.perfect);
      else this.message('¡Baja más!', 1.5);
    }
  }

  private onCharge(): void {
    // una carga por mano, sin acumular
    this.chargePow = 1;
    this.hands.left.charge = this.hands.right.charge = true;
    sfx.charge();
  }

  private onPower(p: number): void {
    this.chargePow = p;
    sfx.power(p);
    if (p >= 4) {
      this.fx.ball.flashMax();
      this.fx.sparks.burst(this.fx.ball.pos, 60, 0xff4d70, 3.2, 0.03);
    }
    this.message(`Carga ×${p}`, 1.2);
  }

  private onRep(perfect: boolean): void {
    GAME.reps++;
    if (perfect) {
      GAME.perfect++;
      this.message('¡PERFECTA!', 1.5);
    }
  }

  // ---------------------------------------------------------------- el disparo

  /** El zombi en pie más cercano a la dirección dir desde from (hasta 60° de margen; si no hay, el más cercano). */
  private pickTarget(from: Vector3, dir: Vector3): Entity | null {
    let best: Entity | null = null, bestDot = 0.5;
    let near: Entity | null = null, nearD = Infinity;
    for (const e of this.queries.foes.entities) {
      if (e.getValue(Foe, 'state') === FoeState.Dead || !e.object3D) continue;
      const to = this.tmpC.copy(e.object3D.position).sub(from);
      to.y = 0;
      const dist = to.length();
      if (dist < 1e-3) continue;
      to.divideScalar(dist);
      const dot = to.x * dir.x + to.z * dir.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = e;
      }
      if (dist < nearD && dot > 0) {
        nearD = dist;
        near = e;
      }
    }
    return best ?? near;
  }

  /** Lanza la carga de una mano (o la que haya) en la dirección dir. */
  private fire(side: Side | null, dir: Vector3): void {
    if (this.chargePow <= 0) return;
    const h = side ? this.hands[side] : this.hands.left.charge ? this.hands.left : this.hands.right;
    if (!h.charge) return;
    const from = this.fx.ball.visible ? this.fx.ball.pos : this.tmpB.copy(GAME.head).addScaledVector(GAME.fwd, 0.6).setY(GAME.head.y - 0.3);
    const target = this.pickTarget(from, dir);
    if (!target?.object3D) return; // (sin nadie a quien dar, la carga se queda)
    h.charge = false;
    const power = this.chargePow;
    const tp = this.tmpA.copy(target.object3D.position).setY(target.object3D.position.y + 0.25);
    this.fx.bolts.fire(from, tp, power);
    this.fx.sparks.burst(tp, 18 + power * 8, POW_COL[power - 1], 2.4 + 0.6 * power, 0.028);
    this.fx.flashes.at(tp, POW_COL[power - 1], 0.6 + 0.25 * power);
    this.fx.flashes.at(from, 0xff4060, 0.35, 0.15);
    sfx.zap(power);
    sfx.hit(tp, power);
    const d = this.tmpC.copy(tp).sub(from).setY(0).normalize();
    this.enemies.hit(target, power, d);
    // sin cargas: la bola estalla
    if (!this.hands.left.charge && !this.hands.right.charge) {
      this.fx.ball.fire();
      this.chargePow = 0;
    }
  }

  // La sacudida de una mano hacia delante: la muñeca (respecto a la cabeza, para no contar el movimiento del cuerpo)
  // va a más de 1,6 m/s en los últimos ~80 ms, alejándose del cuerpo
  private trackHand(side: Side, t: number, dt: number): void {
    const h = this.hands[side];
    h.cool = Math.max(0, h.cool - dt);
    const src = this.input.xr.getPrimaryInputSource(side);
    const isHand = !!src?.hand;
    const grip = this.player.gripSpaces[side];
    if (!src) {
      h.seen = false;
      h.n = 0;
      return;
    }
    // mandos: apuntar con la mano y gatillo
    if (!isHand) {
      const pad = this.input.xr.gamepads[side];
      if (pad?.getButtonDown(InputComponent.Trigger) && GAME.phase === 'playing') {
        const ray = this.player.raySpaces[side];
        ray.getWorldDirection(this.aim).negate(); // (el rayo apunta hacia -Z)
        this.aim.y = 0;
        this.aim.normalize();
        this.fire(side, this.aim);
      }
      return;
    }
    const p = grip.getWorldPosition(this.tmpA).sub(GAME.head);
    // un salto imposible (la mano se perdió y vuelve en otro sitio: más de 10 m/s entre dos imágenes): se empieza de
    // nuevo (con la velocidad y no con la distancia: si las imágenes van lentas, una sacudida de verdad recorre mucho)
    if (h.seen && p.distanceTo(h.last) > Math.max(0.12, 10 * this.rawDt)) h.n = 0;
    h.last.copy(p);
    h.seen = true;
    const i = h.n % h.hist.length;
    h.hist[i].copy(p);
    h.times[i] = t;
    h.n++;
    if (h.n < 6 || h.cool > 0 || !h.charge || GAME.phase !== 'playing') return;
    // la posición de hace ~80 ms
    let j = -1;
    for (let k = 1; k < Math.min(h.n, h.hist.length); k++) {
      const idx = (h.n - 1 - k + h.hist.length) % h.hist.length;
      if (t - h.times[idx] >= 0.08) {
        j = idx;
        break;
      }
    }
    if (j < 0) return;
    const span = t - h.times[j];
    const v = this.tmpB.copy(p).sub(h.hist[j]).divideScalar(span);
    const speed = v.length();
    if (speed < 1.6 || speed > 9) return;
    // hacia fuera del cuerpo (horizontal) y no hacia atrás
    const horiz = Math.hypot(v.x, v.z);
    if (horiz < 1.0) return;
    const out = (v.x * GAME.fwd.x + v.z * GAME.fwd.z) / horiz;
    if (out < -0.2) return;
    this.aim.set(v.x / horiz, 0, v.z / horiz);
    h.cool = 0.35;
    this.fire(side, this.aim);
  }

  // ---------------------------------------------------------------- cada fotograma

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    this.rawDt = delta;
    this.clock = time;
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    // la cabeza
    if (inXR) this.player.head.getWorldPosition(GAME.head);
    else {
      // en el ordenador: flecha abajo (o S) para agacharse; espacio para lanzar
      const kb = this.input.keyboard;
      const down = kb.getKeyPressed('ArrowDown') || kb.getKeyPressed('KeyS');
      this.desktopDrop += ((down ? 0.4 : 0) - this.desktopDrop) * Math.min(1, dt * 6);
      this.world.camera.position.y = 1.6 - this.desktopDrop;
      this.world.camera.getWorldPosition(GAME.head);
      if ((kb.getKeyDown('Space') || kb.getKeyDown('KeyF')) && GAME.phase === 'playing') {
        this.world.camera.getWorldDirection(this.aim);
        this.aim.y = 0;
        this.aim.normalize();
        this.fire(null, this.aim);
      }
      if (kb.getKeyDown('Enter') && GAME.phase !== 'playing') {
        unlockAudio();
        this.startRound();
      }
    }
    this.headSpeed = this.headSpeed * 0.8 + (this.lastHead.distanceTo(GAME.head) / Math.max(dt, 1e-3)) * 0.2;
    this.lastHead.copy(GAME.head);
    // hacia dónde mira el cuerpo: la cabeza en horizontal, girando despacio (la bola no da latigazos)
    (inXR ? this.player.head : this.world.camera).getWorldDirection(this.tmpA);
    if (inXR) this.tmpA.negate(); // (la cabeza de las gafas mira hacia -Z; la cámara ya lo devuelve así)
    const want = Math.atan2(this.tmpA.x, this.tmpA.z);
    let dy = want - this.bodyYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.bodyYaw += dy * Math.min(1, dt * 2.5);
    GAME.fwd.set(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
    setListener(GAME.head, this.tmpA.set(GAME.fwd.x, 0, GAME.fwd.z));

    if (GAME.phase === 'playing') {
      this.squat(GAME.head.y, time, dt);
      if (inXR) {
        this.trackHand('left', time, dt);
        this.trackHand('right', time, dt);
      }
      // oleadas: pausa con el aviso (no sale nadie); luego van saliendo de uno en uno
      if (GAME.between) {
        this.betweenT -= dt;
        if (this.betweenT <= 0) GAME.between = false;
      } else {
        this.spawnT -= dt;
        if (this.toSpawn > 0 && this.spawnT <= 0 && this.enemies.aliveCount() < this.maxAlive) {
          this.spawnOne();
          this.toSpawn--;
          this.spawnT = Math.max(1.2, 2.4 - 0.1 * GAME.wave);
        }
        if (this.toSpawn <= 0 && this.enemies.aliveCount() === 0) this.nextWave();
      }
    }
    // la bola: a un metro del pecho, a su altura (por debajo de los ojos), hacia donde mira el cuerpo
    this.ballTarget.set(GAME.head.x + GAME.fwd.x * 1.0, GAME.head.y - 0.32 + 0.012 * Math.sin(time * 1.7), GAME.head.z + GAME.fwd.z * 1.0);
    this.fx.ball.update(dt, this.ballTarget, GAME.phase === 'playing' ? this.chargePow : 0);
    GAME.ballOn = this.fx.ball.visible;
    GAME.ballPos.copy(this.fx.ball.pos);
    this.fx.bolts.update(dt, GAME.head);
    this.fx.sparks.update(dt);
    this.fx.flashes.update(dt);
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
      if (this.msgT <= 0) this.setText(this.board, 'msg', GAME.phase === 'playing' ? 'Baja en sentadilla para cargar' : 'Pulsa EMPEZAR');
    }
    this.boardT -= dt;
    if (this.boardT <= 0) {
      this.boardT = 0.25;
      this.refreshBoard();
    }
  }
}
