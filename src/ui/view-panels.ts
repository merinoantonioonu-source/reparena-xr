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
import { shortMsg } from './short-msg.js';
import { keepInBlack } from './black-out.js';
import { MW, UI } from './ra/menu-core.js';
import { HITCH } from '../core/hitch.js';
import { createSystem, BackSide, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3, VisibilityState } from '@iwsdk/core';
import { GAME, HOOKS, TRAVEL, VIEW, type CenterInfo } from '../core/state.js';
import { num, on, settings } from '../core/values.js';
import { hands, head } from '../input/hand-model.js';
import { padMask, thumbsUp } from '../input/thumbs.js';
import { isFloor, isSupine, isTiny, foes, groundList, flyList, twoShots, isBars, skyFoes } from '../core/rules.js';
import { dv, nLives, nWaves, rankName, store, waveReps } from '../core/settings.js';
import { EnemySystem } from '../combat/enemies.js';
import { devFoe, foeReady } from '../combat/foes.js';
import { faunaOf, placeAt, type Place } from '../combat/journey.js';
import { foeTierOf } from '../combat/waves.js';
import { HIST_KEY } from '../core/run.js';
import { SND } from '../audio/sound.js';
import { makePanel, type RaPanel } from './ra/kit.js';
import { drawCenter, drawToast } from './info-draw.js';
import { clamp, loadCanvasFonts, mkCanvas, smooth } from './canvas-kit.js';
import { makeCanvasPanel, type CanvasPanel } from './canvas-panel.js';
import { hudSlot, hudSpot, lazyAt, lazyClear, mkLazy, ViewFrame, type Threat } from './view.js';
import { demoDraw, demoInfo, type DemoOpts } from './demo-art.js';
import { DemoFrames } from './demo-frames.js';
import { cortDraw, cortImage, cortInfo, cortUrl } from './cortinilla.js';
import { duelBoss, duelRecord, duelScene, duelName, duelSub, type DuelEnv } from '../combat/duel.js';
import { duelDeco, duelPaint, duelPlates } from './duel-art.js';

const CENTER_SC = 1.5;
const DEMO_W = 0.5, DEMO_H = 0.3, DEMO_HS = 1.15, DEMO_MS = 1.45; // (la de la espera, algo más grande; la del menú, más aún)
const DUEL_DUR = 7;

/** El marco de los avisos de la vista (lo usan también el marcador, los logros y el panel entre oleadas). */
export const VIEW_FRAME = new ViewFrame();
/** Tumbado (los de suelo, sentado y boca arriba): los avisos, en el suelo bajo la cara o en el techo. */
/** Antes de empezar, lo que puede apartarse el aviso del centro de tu mirada antes de venir a ella (rad: 20°). */
const PRE_ANG = (20 * Math.PI) / 180;

export const lyingEx = (): boolean => isFloor() || isSupine() || settings.exercise === 'row' || VIEW.prone;

/** El aviso breve (lo que pide hacer algo ya): de tamaño medio, entre el enorme del suelo en plancha y el pequeño de antes
 * (pedido del usuario); m. */
const TOAST_W = 0.8, TOAST_H = 0.14;
/** Boca arriba en el press de pecho, con los voladores bajando del cielo (pedido del usuario: los avisos no pueden tapar su
 * camino): los huecos, fuera de lo que hay encima de ti, hacia los pies (el del centro, a unos 22° de la vertical, por
 * encima del marcador) y el breve, a un lado, entre la bola y su camino; y su camino, como algo que no se tapa (`SKY_LANE`: sobre tu cara). */
const SKY_C: [number, number][] = [[0, -0.45], [0.6, -0.45], [-0.6, -0.45]];
const SKY_T: [number, number][] = [[0.65, -0.32], [-0.65, -0.32], [0, -0.6]];
const SKY_LANE = { y: 2.6, r: 0.45 };

export class ViewSystem extends createSystem({}) {
  // el del centro y el breve: lienzos como en RepArena (src/ui/info-draw.ts; antes, paneles de UIKit con el texto saliéndose)
  private center!: RaPanel;
  /** Lo que se han acercado el del centro y el breve para no meterse en el suelo (suavizado; 1, nada). */
  private cNear = 1;
  private duelNear = 1;
  private tNear = 1;
  private toast!: RaPanel;
  private readonly C = hudSpot([[0, -0.08], [0, 0.42], [0, -0.5]], -1.1, 0.5 * CENTER_SC, 0.2 * CENTER_SC);
  private readonly T = hudSpot([[0, -0.4], [0, 0.4], [-0.5, -0.24], [0.5, -0.24]], -1.2, TOAST_W, TOAST_H);
  private readonly lzC = mkLazy();
  private readonly lzT = mkLazy();
  private toastT = 0;
  private toastKey: [string, string] = ['', ''];
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
  /** Los dibujos de la caricatura, guardados (src/ui/demo-frames.ts: sin subir uno nuevo en cada fotograma). */
  private demoFr = new DemoFrames(DEMO_W, DEMO_H);
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
    // (los paneles de UIKit de la escena se quedan escondidos)
    for (const id of ['center-panel', 'toast-panel']) {
      const o = this.world.getSceneEntity(id)?.object3D;
      if (o) o.visible = false;
    }
    // encima de todo, como en RepArena (sin prueba de profundidad): tumbado, el aviso queda en el suelo bajo tu cara y se ve
    this.center = makePanel(0.5 * CENTER_SC, 0.2 * CENTER_SC, 1024, { depthTest: false });
    this.toast = makePanel(TOAST_W, TOAST_H, 1024, { depthTest: false });
    for (const p of [this.center, this.toast]) {
      p.mesh.renderOrder = 50;
      p.mesh.visible = false;
      this.world.createTransformEntity(p.mesh);
      keepInBlack(p.mesh); // («¡VICTORIA!», «DERROTA»: sobre el negro del final)
    }
    void loadCanvasFonts().then(() => {
      this.art.key = ''; // (la ilustración, otra vez con las letras buenas)
      this.demoDrawT = 0;
      this.demoFr.reset();
    });
    // la caricatura
    // (sin prueba de profundidad, como el del centro: pegada al suelo no se esconde en él)
    this.demo = makeCanvasPanel(DEMO_W, DEMO_H, 640, false);
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
    V.step(head, lying, GAME.phase === 'playing' && VIEW.center?.kind !== 'calib' && !VIEW.duel && !VIEW.prone);
    const n = this.collectThreats();
    this.stepDuel(dt);
    this.stepCenter(dt, lying, n);
    // (el breve se aparta también del del centro: nunca uno encima del otro)
    const C = this.center.mesh;
    let nt = n;
    if (C.visible) {
      const th = this.threats[nt] ?? (this.threats[nt] = { p: new Vector3(), r: 0 });
      th.p.copy(C.position);
      th.r = 0.5;
      nt++;
    }
    this.stepToast(dt, lying, nt);
    this.stepDemo(dt, lying);
    this.duelIdle(dt);
  }

  // Lo que tiene que verse siempre: los enemigos, con su centro y su radio (RepArena: collectThreats)
  private collectThreats(): number {
    const es = this.world.getSystem(EnemySystem);
    let n = 0;
    // (los enemigos, en plena ronda; el marcador, los logros, el panel entre oleadas y el menú, siempre: el aviso de derrota
    // no debe tapar el resumen)
    if (GAME.phase === 'playing' && es) for (const t of es.targets) {
      if (!t.alive) continue;
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      t.center(th.p);
      th.r = Math.max(0.1, t.radius * 1.5);
      n++;
    }
    // el camino de los que bajan del cielo (el press de pecho): sobre tu cara
    if (GAME.phase === 'playing' && skyFoes()) {
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      th.p.set(GAME.head.x, GAME.head.y + SKY_LANE.y, GAME.head.z);
      th.r = SKY_LANE.r;
      n++;
    }
    // y el marcador y el menú abierto (pedido del usuario: los avisos no deben taparlos)
    const B = VIEW.board;
    if (B.on) {
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      th.p.set(B.x, B.y, B.z);
      th.r = B.r;
      n++;
    }
    // el aviso dorado de los logros y el panel entre oleadas (pedido del usuario: los avisos se solapaban entre sí)
    for (const S of [VIEW.trophy, VIEW.intro]) {
      if (!S.on) continue;
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      th.p.set(S.x, S.y, S.z);
      th.r = S.r;
      n++;
    }
    const M = UI.menu;
    if (M && !M.closed && M.group.visible) {
      const th = this.threats[n] ?? (this.threats[n] = { p: new Vector3(), r: 0 });
      M.group.getWorldPosition(th.p);
      th.r = (Math.max(MW, M.H) / 2) * M.group.getWorldScale(this.v).x;
      n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- el del centro

  private fillCenter(c: CenterInfo): void {
    const p = this.center;
    drawCenter(p.ctx, p.W, p.H, c);
    p.tex.needsUpdate = true;
  }

  private stepCenter(dt: number, lying: boolean, n: number): void {
    const o = this.center.mesh, c = VIEW.center;
    if (!c || VIEW.duel || GAME.paused) {
      // (en la pausa, escondido: se pintaba encima del menú; RepArena: openPause)
      o.visible = false;
      this.lzC.init = false;
      return;
    }
    // (solo si cambia lo que se ve; la barra, a saltos de un 5 %: repintarlo en cada fotograma pesaba)
    const key = `${c.kind}|${c.title}|${c.lines.join('/')}|${c.note?.join()}|${c.status?.join()}|${c.count}|${Math.round(c.bar * 20)}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.fillCenter(c);
    }
    // con un menú abierto, por encima para no taparlo
    const slots: [number, number][] = GAME.menu === 'pause' ? [[0, 0.3]] : lying && skyFoes() ? SKY_C : this.C.slots;
    // (antes de empezar —colocarse, prepararte—, sigue tu mirada antes: si no, se quedaba hacia donde estaba el menú, a un
    // lado, y no se podía leer; lo vio el usuario en la Travesía)
    const pre = c.kind === 'calib' || c.kind === 'ready';
    // (nunca bajo el suelo: en plancha o tumbado, mirando abajo, se acerca hasta él y se encoge en proporción)
    const want = hudSlot(VIEW_FRAME, this.C, slots, head, lying, this.threats, n, dt, this.at), nk = VIEW_FRAME.near;
    const L = lazyAt(VIEW_FRAME, this.lzC, want, VIEW_FRAME.hudQAt(head, lying, want, nk), head, dt, pre ? PRE_ANG : undefined);
    this.cNear += (nk - this.cNear) * (1 - Math.exp(-dt * 7));
    o.scale.setScalar(this.cNear);
    o.position.copy(L.at);
    o.quaternion.copy(L.q);
    // con la caricatura al lado, los dos centrados delante de ti (antes la caricatura quedaba 70 cm a la derecha)
    if (on('demo') && GAME.phase === 'playing' && GAME.menu === 'none') o.position.addScaledVector(this.v.set(1, 0, 0).applyQuaternion(L.q), -((DEMO_W * DEMO_HS) / 2 + 0.02) * this.cNear);
    // si tapa algo que viene, se aparta y, mientras, se aclara
    const vis = this.C.fade * lazyClear(L, o, 0.75, 0.3, head.p, this.threats, n, dt);
    (o.material as MeshBasicMaterial).opacity = vis;
    o.visible = true;
  }

  // ---------------------------------------------------------------- el breve

  private showToast(text: string, color: string, secs: number): void {
    text = shortMsg(text); // (cortos: src/ui/short-msg.ts)
    const p = this.toast, o = p.mesh;
    if (text !== this.toastKey[0] || color !== this.toastKey[1]) {
      drawToast(p.ctx, p.W, p.H, text, color);
      p.tex.needsUpdate = true;
      this.toastKey = [text, color];
    }
    this.toastT = secs;
    o.visible = true;
  }

  private stepToast(dt: number, lying: boolean, n: number): void {
    const o = this.toast.mesh;
    if (this.toastT <= 0 || GAME.phase !== 'playing' || VIEW.duel || GAME.paused || GAME.menu !== 'none') {
      o.visible = false;
      this.lzT.init = false;
      this.toastT = 0;
      return;
    }
    this.toastT -= dt;
    const want = hudSlot(VIEW_FRAME, this.T, lying && skyFoes() ? SKY_T : this.T.slots, head, lying, this.threats, n, dt, this.at), nk = VIEW_FRAME.near;
    const L = lazyAt(VIEW_FRAME, this.lzT, want, VIEW_FRAME.hudQAt(head, lying, want, nk), head, dt);
    this.tNear += (nk - this.tNear) * (1 - Math.exp(-dt * 7));
    o.scale.setScalar(this.tNear);
    const vis = Math.min(1, this.toastT * 3) * this.T.fade * lazyClear(L, o, TOAST_W, TOAST_H, head.p, this.threats, n, dt);
    (o.material as MeshBasicMaterial).opacity = vis;
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
    const m = this.demo.mesh, co = this.center.mesh;
    if (wait) {
      let q: Quaternion, tgt: Vector3;
      let k0: number;
      if (co?.visible) {
        q = co.quaternion;
        k0 = this.cNear;
        tgt = this.v.set(1, 0, 0).applyQuaternion(q).multiplyScalar((0.25 * CENTER_SC + (DEMO_W * DEMO_HS) / 2 + 0.04) * k0).add(co.position);
      } else {
        tgt = VIEW_FRAME.hudLocal(this.v.set(0, 0, -1.05), this.at, head, lying);
        k0 = VIEW_FRAME.near;
        q = this.q.copy(VIEW_FRAME.hudQAt(head, lying, tgt, k0));
      }
      // (como el del centro: más cerca del suelo, más pequeña)
      m.scale.setScalar(DEMO_HS * k0);
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
    // (RepArena: demoAttach; el menú principal es el de RepArena, src/ui/ra/menu-core.ts)
    const M = UI.menu, lo = M && M.kind === 'lobby' && !M.closed && M.group.visible ? M.group : null, menu = show && GAME.menu === 'lobby' && !!lo;
    if (menu && lo && M) {
      lo.updateMatrixWorld();
      // (a la escala del menú, que en las gafas es más pequeño: si no, se metía encima de él; y un poco por delante, para que
      // no parpadee si llegan a tocarse)
      this.demoMenu.position.copy(lo.localToWorld(this.v.set(MW / 2 + (DEMO_W * DEMO_MS) / 2 + 0.02, M.H / 2 - (DEMO_H * DEMO_MS) / 2, 0.004)));
      lo.getWorldQuaternion(this.demoMenu.quaternion);
      this.demoMenu.scale.setScalar(DEMO_MS * lo.getWorldScale(this.v).x);
    }
    this.demoMenu.visible = menu;
    if (!wait && !menu) return;
    // (guardada: cada dibujo se pinta y se sube una sola vez y luego solo se cambia cuál se ve. Pintar y subir el lienzo 12
    // veces por segundo daba tirones al menú principal en las gafas)
    const o = this.demoOpts(), ex = settings.exercise, mode = settings.mode;
    if (this.demoFr.can(ex)) {
      const P = demoInfo(ex, mode, o).D.P, cycles = mode === 'combat' && o.foes === 'mix' ? 2 : 1; // (los mixtos, robots y voladores por turnos)
      this.demo.mat.map = this.demoFr.frame(`${ex}|${mode}|${o.perfectTime}|${o.perks}|${o.foes}`, this.demoT, P, cycles, (c, W, H, t) => demoDraw(c, W, H, ex, mode, t, o));
      return;
    }
    if (this.demo.mat.map !== this.demo.tex) this.demo.mat.map = this.demo.tex;
    this.demoDrawT -= dt;
    if (this.demoDrawT > 0) return;
    this.demoDrawT = 1 / 12; // (basta para que se vea fluido y no pesa en las gafas: cada dibujo se vuelve a subir)
    demoDraw(this.demo.ctx, this.demo.W, this.demo.H, ex, mode, this.demoT, o);
    this.demo.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- la carátula del duelo

  private duelEnv(): DuelEnv {
    // (con «Enemigos de cada entorno», los del sitio de la oleada del jefe: la última o, al fallo, la quinta)
    const R = TRAVEL.route as Place[], bossI = nWaves() > 0 ? nWaves() - 1 : 4;
    const fauna = settings.mode === 'combat' && !isTiny() && on('cbFauna') && R.length ? faunaOf(TRAVEL.on ? placeAt(R, bossI, TRAVEL.per) : R[0], foeReady) : null;
    return {
      mode: settings.mode,
      exercise: settings.exercise,
      nWaves: nWaves(),
      waveReps,
      hangSecs: () => num('hangSecs') || 30, // (las barras llegan más adelante)
      twoShots: twoShots(),
      foes: foes(),
      tiny: isTiny(),
      ground: fauna && groundList().length ? fauna.ground : groundList(),
      fly: fauna && flyList().length ? fauna.fly : flyList(),
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
    this.cortImg(); // (la cortinilla del ejercicio, pedida ya en el menú: al empezar, cargada)
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
    // (en la Travesía no hay duelo: solo su cortinilla, si está cargada)
    if (!on('intro') || !this.inXR() || (settings.mode === 'trek' && !this.cortImg())) return;
    this.duelT = 0;
    this.duelWait = true;
    this.duelSkip = false;
    this.keyHit = false;
    this.thumbT = 0;
    VIEW.duel = true;
    for (const s of ['left', 'right'] as const) this.mask[s] = padMask(hands[s]); // (lo que ya estaba pulsado no cuenta)
    // 2,5 m delante de ti, derecho
    VIEW_FRAME.hudLocal(this.v.set(0, 0, -2.5), this.duel.mesh.position, head, lyingEx());
    // (nunca bajo el suelo: más cerca, más pequeña)
    this.duelNear = VIEW_FRAME.near;
    this.duel.mesh.quaternion.copy(VIEW_FRAME.hudQAt(head, lyingEx(), this.duel.mesh.position, this.duelNear));
    this.duelReady();
  }

  // Ya pintada (o lo que faltaba, un paso por fotograma): los datos encima y empieza a contar
  private duelReady(): void {
    let ok = false;
    try {
      // con la cortinilla del ejercicio (elegida por el usuario), no hace falta la ilustración del duelo
      ok = !!this.cortImg() || this.duelPrep(1);
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

  /** La cortinilla del ejercicio elegido si ya está cargada (si no, la pide y da null). */
  private cortImg(): HTMLImageElement | null {
    const url = cortUrl(settings.mode, settings.exercise, import.meta.env.BASE_URL);
    return url ? cortImage(url) : null;
  }

  private duelDrawPlates(): void {
    const E = this.duelEnv(), P = this.duel, N = nWaves(), r0 = waveReps(0);
    // la cortinilla del ejercicio (elegidas por el usuario: sustituyen a la carátula del duelo), con su franja de abajo
    // diciendo lo que tienes puesto; sin ella (si no ha cargado), la carátula de siempre
    const img = this.cortImg();
    if (img) {
      cortDraw(P.ctx, P.W, P.H, img, cortInfo(settings.mode, N, nLives(), !!num('toFail')));
      P.tex.needsUpdate = true;
      return;
    }
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
    this.duel.mesh.scale.setScalar((1 + 0.04 * Math.max(0, 1 - t / 0.4)) * this.duelNear);
    if (t >= DUEL_DUR) this.duelClear();
  }
}
