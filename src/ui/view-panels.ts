/**
 * Los avisos de la vista, como en RepArena (src/60_ui.js: updateViewPanels, drawCenter, showToast; src/62_demo.js:
 * updateDemo; src/64_intro.js: la carátula del duelo):
 * - el del centro: lo que pide colocarse o prepararse ya (la calibración, «¡PREPÁRATE!» con la cuenta atrás);
 * - el breve: lo que pide hacer algo ya («Más controlado», «Baja más»…; las celebraciones van solo al marcador);
 * - la caricatura del ejercicio: junto al menú principal y, mientras calibras o te preparas, a la derecha del del centro;
 * - la carátula del duelo: al empezar cada ronda, 7 s, grande, a 2,5 m, con todo lo demás en negro; tú contra el jefe.
 *   Se salta con cualquier botón del mando o con el pulgar arriba (en el ordenador, con cualquier tecla).
 * Todos siguen adónde miras sin ladearse nunca y, tumbado, salen en el suelo bajo la cara (src/ui/view.ts); no tapan lo
 * que viene (se van a otro hueco o se aclaran). Los paneles de texto son de UIKit; la caricatura y la carátula, dibujos
 * en un lienzo (como en RepArena).
 */
import { HITCH } from '../core/hitch.js';
import { createSystem, BackSide, Entity, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { GAME, HOOKS, VIEW, type CenterInfo } from '../core/state.js';
import { num, on, settings } from '../core/values.js';
import { hands, head } from '../input/hand-model.js';
import { padMask, thumbsUp } from '../input/thumbs.js';
import { isFloor, isSupine, isTiny, foes, groundList, flyList, twoShots, isBars } from '../core/rules.js';
import { dv, nLives, nWaves, rankName, store, waveReps } from '../core/settings.js';
import { EnemySystem } from '../combat/enemies.js';
import { devFoe } from '../combat/foes.js';
import { foeTierOf } from '../combat/waves.js';
import { HIST_KEY } from '../core/run.js';
import { SND } from '../audio/sound.js';
import { applyFonts } from './fonts.js';
import { clamp, loadCanvasFonts, mkCanvas, smooth } from './canvas-kit.js';
import { makeCanvasPanel, type CanvasPanel } from './canvas-panel.js';
import { hudSlot, hudSpot, lazyAt, lazyClear, mkLazy, ViewFrame, type Threat } from './view.js';
import { demoDraw, type DemoOpts } from './demo-art.js';
import { duelBoss, duelRecord, duelScene, duelName, duelSub, type DuelEnv } from '../combat/duel.js';
import { duelDeco, duelPaint, duelPlates } from './duel-art.js';

const CENTER_SC = 1.5;
const DEMO_W = 0.5, DEMO_H = 0.3, DEMO_HS = 1.15, DEMO_MS = 1.45; // (la de la espera, algo más grande; la del menú, más aún)
const DUEL_DUR = 7;

/** El marco de los avisos de la vista (lo usan también el marcador, los logros y el panel entre oleadas). */
export const VIEW_FRAME = new ViewFrame();
/** Tumbado (los de suelo, sentado y boca arriba): los avisos, en el suelo bajo la cara o en el techo. */
export const lyingEx = (): boolean => isFloor() || isSupine() || settings.exercise === 'row';

export class ViewSystem extends createSystem({}) {
  private center: UIKitMLAsset | null = null;
  private centerE: Entity | undefined;
  private toast: UIKitMLAsset | null = null;
  private toastE: Entity | undefined;
  private lobbyE: Entity | undefined;
  private readonly C = hudSpot([[0, -0.08], [0, 0.42], [0, -0.5]], -1.1, 0.5 * CENTER_SC, 0.2 * CENTER_SC);
  private readonly T = hudSpot([[0, -0.4], [0, 0.4], [-0.5, -0.24], [0.5, -0.24]], -1.2, 0.62, 0.1);
  private readonly lzC = mkLazy();
  private readonly lzT = mkLazy();
  private toastT = 0;
  private centerKey = '';
  private readonly texts = new Map<string, string>();
  private readonly threats: Threat[] = [];
  private readonly at = new Vector3();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  // la caricatura: un solo lienzo, en dos sitios (junto al menú y en la espera)
  private demo!: CanvasPanel;
  private demoMenu!: Mesh;
  private demoT = 0;
  private demoDrawT = 0;
  private demoInit = false;
  // la carátula del duelo: la ilustración se pinta antes, en el menú, por partes (una cada 0,15 s) y se guarda; al
  // empezar la ronda solo se copia y se escriben los datos encima (RepArena: INTRO_ART)
  private duel!: CanvasPanel;
  private veil!: Mesh;
  private duelT = -1;
  private duelWait = false;
  private duelSkip = false;
  private thumbT = 0;
  private readonly mask = { left: 0, right: 0 };
  private art = { cv: null as HTMLCanvasElement | null, card: null as HTMLCanvasElement | null, key: '', gen: null as Generator<void> | null, ready: false, t: 0 };
  private keyHit = false;

  init(): void {
    this.center = this.world.getSceneObject<UIKitMLAsset>('center-panel') ?? null;
    this.centerE = this.world.getSceneEntity('center-panel');
    this.toast = this.world.getSceneObject<UIKitMLAsset>('toast-panel') ?? null;
    this.toastE = this.world.getSceneEntity('toast-panel');
    this.lobbyE = this.world.getSceneEntity('lobby-panel');
    // encima de todo, como en RepArena (sin prueba de profundidad): tumbado, el aviso queda en el suelo bajo tu cara y se ve
    for (const p of [this.center, this.toast]) {
      if (!p) continue;
      applyFonts(p);
      p.getElementById('box')?.setProperties({ depthTest: false, renderOrder: 50 });
    }
    for (const e of [this.centerE, this.toastE]) if (e?.object3D) e.object3D.visible = false;
    void loadCanvasFonts().then(() => {
      this.art.key = ''; // (la ilustración, otra vez con las letras buenas)
      this.demoDrawT = 0;
    });
    // la caricatura
    this.demo = makeCanvasPanel(DEMO_W, DEMO_H, 640);
    this.demo.mesh.scale.setScalar(DEMO_HS);
    this.demo.mesh.renderOrder = 29;
    this.demo.mesh.visible = false;
    this.world.createTransformEntity(this.demo.mesh);
    this.demoMenu = new Mesh(this.demo.mesh.geometry, this.demo.mat);
    this.demoMenu.userData.noInk = true;
    this.demoMenu.scale.setScalar(DEMO_MS);
    this.demoMenu.visible = false;
    this.world.createTransformEntity(this.demoMenu);
    // la carátula (3 m de ancho, encima de todo) y el negro que la rodea (una esfera alrededor de la cabeza)
    this.duel = makeCanvasPanel(3, (3 * 9) / 16, 1280, false);
    this.duel.mesh.renderOrder = 60;
    this.duel.mesh.visible = false;
    this.world.createTransformEntity(this.duel.mesh);
    this.veil = new Mesh(new SphereGeometry(0.45, 24, 12), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, fog: false, toneMapped: false }));
    this.veil.userData.noInk = true;
    this.veil.renderOrder = 59;
    this.veil.visible = false;
    this.world.createTransformEntity(this.veil);
    HOOKS.toast = (text, color, secs) => this.showToast(text, color, secs);
    HOOKS.duel = () => this.duelStart();
    const onKey = (): void => {
      if (this.duelT >= 0) this.keyHit = true;
    };
    addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => removeEventListener('keydown', onKey));
  }

  private inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  update(dt: number): void {
    const lying = lyingEx(), V = VIEW_FRAME;
    V.step(head, lying, GAME.phase === 'playing' && VIEW.center?.kind !== 'calib' && !VIEW.duel);
    const n = this.collectThreats();
    this.stepDuel(dt);
    this.stepCenter(dt, lying, n);
    this.stepToast(dt, lying, n);
    this.stepDemo(dt, lying);
    this.duelIdle(dt);
  }

  // Lo que tiene que verse siempre: los enemigos, con su centro y su radio (RepArena: collectThreats)
  private collectThreats(): number {
    const es = this.world.getSystem(EnemySystem);
    let n = 0;
    if (GAME.phase !== 'playing' || !es) return 0;
    for (const t of es.targets) {
      if (!t.alive) continue;
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      t.center(th.p);
      th.r = Math.max(0.1, t.radius * 1.5);
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- el del centro

  private set(p: UIKitMLAsset, id: string, props: Record<string, unknown>): void {
    const k = id + '@' + p.assetId, s = JSON.stringify(props);
    if (this.texts.get(k) === s) return; // (solo si cambia: cada cambio rehace el elemento)
    this.texts.set(k, s);
    p.getElementById(id)?.setProperties(props);
  }

  private fillCenter(c: CenterInfo): void {
    const p = this.center;
    if (!p) return;
    const calib = c.kind === 'calib';
    this.set(p, 'calib', { display: calib ? 'flex' : 'none' });
    this.set(p, 'ready', { display: calib ? 'none' : 'flex' });
    if (!calib) {
      this.set(p, 'bigTitle', { text: c.title });
      this.set(p, 'bigCount', { text: c.count });
      return;
    }
    this.set(p, 'title', { text: c.title });
    this.set(p, 'note', { text: c.note?.[0] ?? '', color: c.note?.[1] ?? '#3cf0c6', display: c.note ? 'flex' : 'none' });
    this.set(p, 'l1', { text: c.lines[0] ?? '', display: c.lines[0] ? 'flex' : 'none' });
    this.set(p, 'l2', { text: c.lines[1] ?? '', display: c.lines[1] ? 'flex' : 'none' });
    this.set(p, 'st', { text: c.status?.[0] ?? '', color: c.status?.[1] ?? '#ff8a3d', display: c.status ? 'flex' : 'none' });
    this.set(p, 'count', { text: c.count, display: c.count ? 'flex' : 'none' });
    this.set(p, 'fill', { width: Math.max(2.2, 66 * clamp(c.bar, 0, 1)) });
  }

  private stepCenter(dt: number, lying: boolean, n: number): void {
    const o = this.centerE?.object3D, c = VIEW.center;
    if (!o) return;
    if (!c || VIEW.duel) {
      o.visible = false;
      this.lzC.init = false;
      return;
    }
    const key = `${c.kind}|${c.title}|${c.lines.join('/')}|${c.note?.join()}|${c.status?.join()}|${c.count}|${c.bar.toFixed(2)}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.fillCenter(c);
    }
    // con un menú abierto, por encima para no taparlo
    const slots: [number, number][] = GAME.menu === 'pause' ? [[0, 0.3]] : this.C.slots;
    const L = lazyAt(VIEW_FRAME, this.lzC, hudSlot(VIEW_FRAME, this.C, slots, head, lying, this.threats, n, dt, this.at), VIEW_FRAME.hudQ(head, lying), head, dt);
    o.position.copy(L.at);
    o.quaternion.copy(L.q);
    // si tapa algo que viene, se aparta y, mientras, se aclara
    const vis = this.C.fade * lazyClear(L, o, 0.75, 0.3, head.p, this.threats, n, dt);
    if (this.center) this.set(this.center, 'box', { opacity: Math.round(vis * 10) / 10 });
    o.visible = true;
  }

  // ---------------------------------------------------------------- el breve

  private showToast(text: string, color: string, secs: number): void {
    const p = this.toast, o = this.toastE?.object3D;
    if (!p || !o) return;
    this.set(p, 'text', { text, color });
    this.toastT = secs;
    o.visible = true;
  }

  private stepToast(dt: number, lying: boolean, n: number): void {
    const o = this.toastE?.object3D;
    if (!o) return;
    if (this.toastT <= 0 || GAME.phase !== 'playing' || VIEW.duel) {
      o.visible = false;
      this.lzT.init = false;
      this.toastT = 0;
      return;
    }
    this.toastT -= dt;
    const L = lazyAt(VIEW_FRAME, this.lzT, hudSlot(VIEW_FRAME, this.T, this.T.slots, head, lying, this.threats, n, dt, this.at), VIEW_FRAME.hudQ(head, lying), head, dt);
    const vis = Math.min(1, this.toastT * 3) * this.T.fade * lazyClear(L, o, 0.62, 0.1, head.p, this.threats, n, dt);
    if (this.toast) this.set(this.toast, 'box', { opacity: Math.round(vis * 10) / 10 });
    o.position.copy(L.at);
    o.quaternion.copy(L.q);
    o.visible = this.toastT > 0;
  }

  // ---------------------------------------------------------------- la caricatura

  private demoOpts(): DemoOpts {
    return { perfectTime: num('perfectTime'), perks: on('perks'), foes: foes(), sword: false, pistol: false }; // (las armas, con el PR 9)
  }

  private stepDemo(dt: number, lying: boolean): void {
    this.demoT += dt;
    const show = on('demo') && !VIEW.duel;
    // en la espera (calibrar, prepararte): a la derecha del panel del centro, a su altura y girado como él; sin él, delante
    const wait = show && GAME.phase === 'playing' && !!VIEW.center && GAME.menu === 'none';
    const m = this.demo.mesh, co = this.centerE?.object3D;
    if (wait) {
      let q: Quaternion, tgt: Vector3;
      if (co?.visible) {
        q = co.quaternion;
        tgt = this.v.set(1, 0, 0).applyQuaternion(q).multiplyScalar(0.25 * CENTER_SC + (DEMO_W * DEMO_HS) / 2 + 0.04).add(co.position);
      } else {
        q = this.q.copy(VIEW_FRAME.hudQ(head, lying));
        tgt = VIEW_FRAME.hudLocal(this.v.set(0, 0, -1.05), this.at, head, lying);
      }
      if (!this.demoInit) {
        m.position.copy(tgt);
        m.quaternion.copy(q);
        this.demoInit = true;
      }
      const k = 1 - Math.exp(-dt * 6);
      m.position.lerp(tgt, k);
      m.quaternion.slerp(q, k);
    } else this.demoInit = false;
    m.visible = wait;
    // junto al menú principal (a su derecha, colgando de su borde de arriba como él)
    const lo = this.lobbyE?.object3D, menu = show && GAME.menu === 'lobby' && !!lo?.visible;
    if (menu && lo) {
      lo.updateMatrixWorld();
      this.demoMenu.position.copy(lo.localToWorld(this.v.set(0.45 + (DEMO_W * DEMO_MS) / 2 + 0.02, (-DEMO_H * DEMO_MS) / 2, 0)));
      lo.getWorldQuaternion(this.demoMenu.quaternion);
    }
    this.demoMenu.visible = menu;
    if (!wait && !menu) return;
    this.demoDrawT -= dt;
    if (this.demoDrawT > 0) return;
    this.demoDrawT = 1 / 12; // (basta para que se vea fluido y no pesa en las gafas: cada dibujo se vuelve a subir)
    demoDraw(this.demo.ctx, this.demo.W, this.demo.H, settings.exercise, settings.mode, this.demoT, this.demoOpts());
    this.demo.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- la carátula del duelo

  private duelEnv(): DuelEnv {
    return {
      mode: settings.mode,
      exercise: settings.exercise,
      nWaves: nWaves(),
      waveReps,
      hangSecs: () => num('hangSecs') || 30, // (las barras llegan más adelante)
      twoShots: twoShots(),
      foes: foes(),
      tiny: isTiny(),
      ground: groundList(),
      fly: flyList(),
      devFoe,
      foeTier: (k: string) => foeTierOf((key) => devFoe(key).tier, k),
      dv: (k: string) => dv(k, GAME.ramp),
      arcMace: num('arcMace'),
      tchArrive: num('tchArrive'),
      toFail: num('toFail') > 0,
      bars: isBars(),
      floor: isFloor(),
      supine: isSupine(),
    };
  }

  // Lo que falte por pintar de la ilustración (un paso cada vez), y si ha cambiado el ejercicio o el jefe, otra
  private duelPrep(steps: number): boolean {
    const E = this.duelEnv(), S = duelScene(E), name = duelName(E), sub = duelSub(E), A = this.art;
    const k = `${S.pose}|${S.boss}|${S.what}|${name}|${sub}`;
    if (!A.cv) {
      A.cv = mkCanvas(960, 540);
      A.card = mkCanvas(1280, 720);
    }
    if (A.key !== k) {
      const cv = A.cv, card = A.card!;
      A.key = k;
      A.ready = false;
      A.gen = (function* () {
        yield* duelPaint(cv.getContext('2d')!, 960, 540, S);
        yield;
        duelDeco(card.getContext('2d')!, 1280, 720, cv, name, sub);
      })();
    }
    while (!A.ready && steps-- > 0) {
      HITCH.f.intro = 1; // (para el registro de tirones)
      if (A.gen!.next().done) A.ready = true;
    }
    return A.ready;
  }

  // Cada fotograma, en el menú y en las gafas: un trozo de la ilustración cada 0,15 s (no todo de golpe: congelaría la imagen)
  private duelIdle(dt: number): void {
    if (!on('intro') || this.duelT >= 0 || !this.inXR() || GAME.phase === 'playing') return;
    this.art.t -= dt;
    if (this.art.t > 0) return;
    this.art.t = this.art.ready ? 0.5 : 0.15;
    try {
      this.duelPrep(1);
    } catch (e) {
      console.warn('carátula', e);
      this.art.ready = true;
    }
  }

  private duelStart(): void {
    if (!on('intro') || !this.inXR() || settings.mode === 'trek') return; // (en la Travesía no hay duelo)
    this.duelT = 0;
    this.duelWait = true;
    this.duelSkip = false;
    this.keyHit = false;
    this.thumbT = 0;
    VIEW.duel = true;
    for (const s of ['left', 'right'] as const) this.mask[s] = padMask(hands[s]); // (lo que ya estaba pulsado no cuenta)
    // 2,5 m delante de ti, derecho
    VIEW_FRAME.hudLocal(this.v.set(0, 0, -2.5), this.duel.mesh.position, head, lyingEx());
    this.duel.mesh.quaternion.copy(VIEW_FRAME.hudQ(head, lyingEx()));
    this.duelReady();
  }

  // Ya pintada (o lo que faltaba, un paso por fotograma): los datos encima y empieza a contar
  private duelReady(): void {
    let ok = false;
    try {
      ok = this.duelPrep(1);
      if (ok) this.duelDrawPlates();
    } catch (e) {
      console.warn('carátula', e);
      this.duelClear();
      return;
    }
    if (ok) {
      this.duelWait = false;
      this.duelT = 0;
    }
  }

  private duelDrawPlates(): void {
    const E = this.duelEnv(), P = this.duel, N = nWaves(), r0 = waveReps(0);
    const hist = store<{ ex?: string; mode?: string; reps?: number; fail?: number }[]>(HIST_KEY) ?? [];
    duelPlates(P.ctx, P.W, P.H, this.art.card!, { rank: rankName(), record: duelRecord(E, hist), nWaves: N, lives: nLives(), r0, rN: N ? waveReps(N - 1) : null, unit: settings.exercise === 'hang' ? 'Segundos' : 'Reps', boss: duelBoss(E) });
    P.tex.needsUpdate = true;
  }

  private duelClear(): void {
    this.duelT = -1;
    this.duelWait = false;
    VIEW.duel = false;
    this.veil.visible = false;
    this.duel.mesh.visible = false;
  }

  private stepDuel(dt: number): void {
    if (this.duelT < 0) return;
    if (GAME.phase !== 'playing') {
      this.duelClear();
      return;
    }
    const vm = this.veil.material as MeshBasicMaterial;
    if (this.duelWait) {
      // aún pintándose: en negro, sin la carátula
      this.veil.position.copy(head.p);
      vm.opacity = Math.min(1, vm.opacity + dt * 5);
      this.veil.visible = true;
      this.duelReady();
      if (this.duelWait) return;
    }
    this.duelT += dt;
    for (const s of ['left', 'right'] as const) {
      const m = padMask(hands[s]);
      if (m & ~this.mask[s]) this.duelSkip = true;
      this.mask[s] = m;
    }
    if (thumbsUp(hands.left) || thumbsUp(hands.right)) {
      this.thumbT += dt;
      if (this.thumbT > 0.25) this.duelSkip = true;
    } else this.thumbT = 0;
    if (this.keyHit) this.duelSkip = true;
    if (this.duelSkip && this.duelT < DUEL_DUR - 0.25) {
      if (import.meta.env.DEV) console.info(`rxdbg carátula saltada a ${this.duelT.toFixed(2)} s (mandos ${this.mask.left}/${this.mask.right}, tecla ${this.keyHit})`); // (para probar en el emulador)
      this.duelT = DUEL_DUR - 0.25; // (salta al fundido final)
      SND.tick();
    }
    const t = this.duelT, a = t < 0.2 ? smooth(t / 0.2) : clamp((DUEL_DUR - t) / 0.25, 0, 1), v = t < 0.2 ? Math.max(a, vm.opacity) : a;
    this.veil.position.copy(head.p);
    vm.opacity = v;
    this.veil.visible = v > 0.01;
    this.duel.mat.opacity = a;
    this.duel.mesh.visible = a > 0.01;
    this.duel.mesh.scale.setScalar(1 + 0.04 * Math.max(0, 1 - t / 0.4));
    if (t >= DUEL_DUR) this.duelClear();
  }
}
