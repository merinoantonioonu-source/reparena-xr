/**
 * El sistema de los menús de RepArena (opción B del usuario, PR 31): lo que en RepArena hacía el bucle de cada fotograma
 * (src/80_main.js: fingers, updateWatch, updateWristMenu, pokeWidgets; src/40_models.js: gloveHold) y los avisos entre el
 * juego y los menús (HOOKS: el principal, Opciones, la pausa, el resumen, las cartas y las pantallas).
 *  - Se pulsan con el dedo (src/ui/ra/poke.ts) y con el rayo de IWSDK: RayInteractable en el grupo de los menús; el rayo
 *    ilumina la tecla y el pellizco (o el gatillo) la pulsa.
 *  - La mano que se ve se apoya en las teclas y en el panel (HOLD: la usan los guantes, y se mueve igual la mano de IWSDK).
 *  - El menú se recoge con la palma izquierda hacia abajo o con el puño, y con «✕ Cerrar»; vuelve con el botón MENÚ.
 */
import { createSystem, Group, RayInteractable, Vector3, VisibilityState } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { GAME, HOOKS } from '../../core/state.js';
import { onSettingsChange } from '../../core/settings.js';
import { hands, isFist, SIDES } from '../../input/hand-model.js';
import { HOLD } from '../../input/hold.js';
import { SND, unlockAudio } from '../../audio/sound.js';
import { HITCH } from '../../core/hitch.js';
import { diagEvent } from '../../core/diag.js';
import type { Btn, Widget } from './btn.js';
import { activeWidgets, ENV, hideMenu, menuClose, noteStand, openMenu, refreshFields, UI, updateWatch, updateWristMenu, WATCH, watchBtn, WM, wristOpen, wristReady, type Row } from './menu-core.js';
import { endMenu, lobbyMenu, MENU_ENV, pauseMenu, perkClose, perkMenu } from './menus.js';
import { fingers, pokeHold, pokeWidgets, POKE } from './poke.js';
import type { Summary } from '../../core/run.js';
import { marqStep, spSync } from '../screens/music-screens.js';

/** Nitidez en las gafas (la del juego nuevo: decisión del usuario en el PR 7): la resolución que se pide al entrar y la
 * foveación. Se guarda aparte de la «Calidad de imagen» de RepArena. */
export const QUALITY = [
  { label: 'Normal ×1', scale: 1.0, foveation: 1.0 },
  { label: 'Alta ×1,4', scale: 1.4, foveation: 0.5 },
  { label: 'Máxima ×1,7', scale: 1.7, foveation: 0.2 },
];
const QUALITY_KEY = 'reparenaxr-quality';
/** Lo que la pausa cuenta además (lo pone la partida). */
export const PAUSE_INFO = MENU_ENV.pauseInfo;

type Ev = { object?: Object3D; pointerId?: number; stopPropagation?(): void };
/** La tecla a la que pertenece lo que toca el rayo. */
const widgetOf = (o: Object3D | undefined): Widget | null => {
  for (let p: Object3D | null | undefined = o, k = 0; p && k < 4; p = p.parent, k++) if (p.userData.widget) return p.userData.widget as Widget;
  return null;
};

export class RaMenuSystem extends createSystem({}, {}) {
  private root!: Group;
  private quality = 1;
  private vrOk = false;
  private closeT = 0;
  private hold = { left: new Vector3(), right: new Vector3() };
  private tmp = new Vector3();
  private iw = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private v = new Vector3();
  private rayOn = false;
  /** La tecla en la que se apretó cada rayo (para pulsarla al soltar). */
  private downOn = new Map<number, Widget | null>();

  private inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  init(): void {
    this.root = new Group();
    this.root.name = 'Menús';
    const e = this.world.createTransformEntity(this.root);
    e.addComponent(RayInteractable); // (el rayo de IWSDK sobre los menús: ilumina y, pellizcando, pulsa)
    ENV.root = this.root;
    ENV.inXR = () => this.inXR();
    ENV.placing = () => HOOKS.placing();
    ENV.onWatch = () => this.onWatch();
    ENV.playing = () => GAME.phase === 'playing';
    ENV.renderer = this.world.renderer;
    // lo que cambia en Spotify (cada pocos segundos se le pregunta): se pone al día sin rehacer el menú si no hace falta
    HOOKS.spChanged = spSync;
    // el rayo: sobre una tecla, la ilumina; al pulsar (el pellizco o el gatillo), la pulsa como el dedo
    const R = this.root as unknown as { addEventListener(t: string, f: (e: Ev) => void): void };
    R.addEventListener('pointerover', (ev) => this.rayHover(widgetOf(ev.object), true));
    R.addEventListener('pointerout', (ev) => this.rayHover(widgetOf(ev.object), false));
    // (se pulsa al soltar el pellizco sobre la misma tecla en la que se apretó, tarde lo que tarde: el «click» de IWSDK
    // solo cuenta si se suelta en menos de 0,8 s, y con el pellizco mantenido no llegaba)
    R.addEventListener('pointerdown', (ev) => this.downOn.set(ev.pointerId ?? 0, widgetOf(ev.object)));
    R.addEventListener('pointerup', (ev) => {
      const w = widgetOf(ev.object), d = this.downOn.get(ev.pointerId ?? 0);
      this.downOn.delete(ev.pointerId ?? 0);
      if (w && w === d) this.rayPress(w);
    });
    // la nitidez
    try {
      const raw = localStorage.getItem(QUALITY_KEY), q = Number(raw);
      if (raw !== null && q >= 0 && q < QUALITY.length) this.quality = q;
    } catch {
      /* (sin almacenamiento: la de serie) */
    }
    MENU_ENV.quality = { labels: QUALITY.map((q) => q.label), cur: this.quality, set: (i) => this.setQuality(i), note: '' };
    this.applyQuality();
    MENU_ENV.exit = () => {
      const s = this.world.renderer.xr.getSession();
      if (s) void s.end();
    };
    void navigator.xr
      ?.isSessionSupported('immersive-vr')
      .then((ok) => {
        this.vrOk = ok && this.world.xrEnabled;
        this.rebuild();
      })
      .catch(() => {});
    // lo que piden la partida y las pantallas
    HOOKS.showMenu = (last) => this.open(() => lobbyMenu(last));
    HOOKS.hideMenu = () => hideMenu();
    HOOKS.showSummary = (s) => this.open(() => endMenu(s as Summary));
    HOOKS.pause = () => {
      if (GAME.phase !== 'playing' || GAME.paused) return;
      GAME.paused = true;
      SND.click();
      this.open(pauseMenu);
    };
    HOOKS.resume = () => {
      GAME.paused = false;
      hideMenu();
    };
    HOOKS.openScreen = (rows, opts) => {
      const m = openMenu(rows as Row[], { accent: opts?.accent }, 'screen');
      if (opts?.title) m.kind = 'screen';
    };
    HOOKS.closeScreen = () => {
      if (UI.menu?.kind === 'screen') hideMenu(true);
    };
    HOOKS.screenOn = () => UI.menu?.kind === 'screen';
    HOOKS.perksOpen = (cards, pick) => this.open(() => perkMenu(cards, pick));
    HOOKS.perksClose = () => perkClose();
    // un ajuste cambiado desde fuera (la página, la sincronización): los valores del menú, al día
    this.cleanupFuncs.push(onSettingsChange(() => refreshFields()));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(() => {
        // al entrar o salir de las gafas, el menú se rehace en su sitio nuevo
        UI.anchor = null;
        UI.lastAnchor = null;
        this.rebuild();
        this.applyQuality();
      }),
    );
    this.open(() => lobbyMenu());
    (window as unknown as { __rxMenu: unknown }).__rxMenu = { UI, WM, POKE, fingers }; // (para las pruebas en el simulador)
  }

  /** Abre un menú (en las gafas, con «Muñeca», sale delante). */
  private open(fn: () => void): void {
    HITCH.f.menu = 1; // (para el registro de tirones)
    fn();
    if (UI.menu?.wrist && !WM.on) wristOpen();
  }
  private rebuild(): void {
    MENU_ENV.enterVR = !this.inXR() && this.vrOk ? () => this.world.launchXR() : null;
    UI.menu?.rebuild?.();
  }

  private setQuality(i: number): void {
    this.quality = i;
    MENU_ENV.quality.cur = i;
    try {
      localStorage.setItem(QUALITY_KEY, String(i));
    } catch {
      /* (sin almacenamiento) */
    }
    this.applyQuality();
  }
  // la nitidez: se pide al entrar en las gafas (dentro, cambiarla pide salir y volver a entrar)
  private applyQuality(): void {
    const q = QUALITY[this.quality], xr = this.world.renderer.xr;
    if (!xr.isPresenting) xr.setFramebufferScaleFactor(q.scale);
    xr.setFoveation(q.foveation);
    MENU_ENV.quality.note = xr.isPresenting ? 'La nitidez nueva se aplica al volver a entrar en VR' : 'La nitidez se aplica al entrar en VR';
  }

  // ---------------------------------------------------------------- el rayo

  private rayHover(w: Widget | null, on: boolean): void {
    if (!w || w.rayHover === on) return;
    w.rayHover = on;
    if (w.recolor) w.recolor();
    else w.draw();
  }
  private rayPress(w: Widget | null): void {
    const m = UI.menu, now = performance.now() / 1000;
    if (!w || w.kind !== 'btn' || !w.mesh.visible || now < POKE.until || (w.cool ?? 0) > 0) return;
    const inMenu = activeWidgets().includes(w), isWatch = w === WATCH.b;
    if (!inMenu && !isWatch) return;
    if (inMenu && (!m || m.age < 0.5 || !wristReady())) return;
    POKE.until = now + 0.25;
    w.cool = 0.3;
    diagEvent(`el rayo pulsa «${(w as Btn).label}»`);
    unlockAudio();
    SND.click();
    w.flash?.();
    (w as Btn).onPress();
  }

  // ---------------------------------------------------------------- el botón de la muñeca

  /** El botón MENÚ (o X/Y del mando izquierdo): en la ronda, la pausa; fuera, el menú delante (RepArena: onWatch). */
  private onWatch(): void {
    if (HOOKS.placing()) {
      HOOKS.cancelPlace(); // (colocando el aparato: la muñeca lo deja)
      SND.tick();
      return;
    }
    const m = UI.menu;
    if (m?.wrist && m.perks) {
      wristOpen(); // (en el descanso, las cartas recogidas vuelven)
      SND.tick();
      return;
    }
    if (GAME.phase === 'playing' && !GAME.paused) {
      HOOKS.pause();
      return;
    }
    if (m?.wrist) wristOpen(); // el menú recogido (o perdido de vista) sale delante
    else if (m) {
      m.closed = false;
      m.group.visible = true;
      UI.anchor = null;
      m.rebuild?.();
    } else this.open(() => (GAME.phase === 'playing' ? pauseMenu() : lobbyMenu()));
    SND.tick();
  }
  private watchLabel(): string {
    const m = UI.menu;
    if (HOOKS.placing()) return 'CANCELAR';
    if (GAME.phase === 'playing' && !GAME.paused) return 'PAUSA';
    if (m?.wrist) return WM.on ? 'TRAER MENÚ' : 'MENÚ';
    return m && !m.closed ? 'TRAER MENÚ' : 'MENÚ';
  }

  // ---------------------------------------------------------------- cada fotograma

  update(delta: number): void {
    const dt = Math.min(delta, 0.1), inXR = this.inXR();
    noteStand();
    // los dedos que pueden pulsar: las puntas de las manos de verdad (las calculadas, no); la que se ve, suavizada
    fingers.length = 0;
    for (const s of SIDES) {
      const h = hands[s];
      if (inXR && h.tipOk && !h.est) fingers.push({ side: s, p: h.tip, s: h.tipSm ? h.tipS : h.tip });
    }
    // el botón de la muñeca y su pulsación
    const w = watchBtn(), show = updateWatch(dt, () => this.watchLabel());
    if (show) {
      pokeWidgets([w], dt, WATCH.armT > 0.35, false, null, true);
      w.mesh.position.z = w.baseZ;
    }
    updateWristMenu(dt);
    marqStep(dt); // (el rótulo de lo que suena en el menú principal, si no cabe, se desplaza)
    // el menú: se pulsa cuando ya está quieto (medio segundo) y, en la muñeca, del todo abierto
    const m = UI.menu;
    if (m) {
      m.age += dt;
      const shown = !m.closed && m.group.visible && (!m.wrist || WM.on);
      pokeWidgets(activeWidgets(), dt, m.age > 0.5 && wristReady(), true, m, shown);
    }
    // el rayo de IWSDK, solo con un menú a la vista (si no, no se pinta ni estorba en la partida)
    const rayWant = inXR ? !!m && !m.closed && m.group.visible : true;
    if (rayWant !== this.rayOn) {
      this.rayOn = rayWant;
      this.root.visible = true;
    }
    // el menú se recoge con la palma izquierda hacia abajo o con el puño (un momento, para no recogerlo sin querer)
    const h = hands.left;
    const closing = inXR && !!m && (m.kind === 'lobby' || m.kind === 'options' || m.kind === 'screen') && !m.closed && (!m.wrist || WM.on) && h.ok && !h.est && !h.virt && (isFist(h) || this.tmp.set(0, 1, 0).applyQuaternion(h.wristQ).y > 0.85);
    this.closeT = closing ? this.closeT + dt : 0;
    if (this.closeT > 0.5) {
      this.closeT = 0;
      menuClose();
    }
    // qué menú se ve (para la partida): el que está abierto aunque esté recogido
    const k = UI.menu?.kind;
    GAME.menu = k === 'lobby' ? 'lobby' : k === 'options' || k === 'screen' ? 'options' : k === 'pause' ? 'pause' : k === 'summary' ? 'summary' : 'none';
    // en plena partida no hay más menú que la pausa y las cartas
    if (GAME.phase === 'playing' && !GAME.paused && m && m.kind !== 'pause' && m.kind !== 'perks') hideMenu();
    this.applyHold(dt, inXR);
  }

  // la mano que se ve, apoyada en lo que toca (RepArena: gloveHold): al momento lo más hundido; al soltar, vuelve en unas
  // centésimas. Los guantes la leen (HOLD); la mano de IWSDK y la del mando se mueven aquí
  private applyHold(dt: number, inXR: boolean): void {
    const xi = this.input.xr;
    for (const s of SIDES) {
      const want = pokeHold(s, this.v), H = this.hold[s];
      if (want.lengthSq() >= H.lengthSq()) H.copy(want);
      else H.lerp(want, Math.min(1, dt * 25));
      if (H.lengthSq() < 1e-8) H.set(0, 0, 0);
      HOLD[s].copy(H);
      const h = hands[s];
      if (!inXR || !h.ok || H.lengthSq() === 0) continue;
      if (h.isHand) {
        const ad = xi.visualAdapters.hand[s];
        if (ad.isPrimary) ad.applyVisualOffsetWorld(this.a.copy(H));
      } else {
        const md = xi.visualAdapters.controller[s].visual?.model, par = md?.parent;
        if (md && par) {
          par.getWorldPosition(this.b);
          this.iw.copy(this.b).add(H);
          par.worldToLocal(this.b);
          par.worldToLocal(this.iw);
          md.position.add(this.iw.sub(this.b));
        }
      }
    }
  }
}
