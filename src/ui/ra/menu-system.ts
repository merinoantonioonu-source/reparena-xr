/**
 * El sistema de los menús de RepArena (opción B del usuario, PR 31): lo que en RepArena hacía el bucle de cada fotograma
 * (src/80_main.js: fingers, updateWatch, updateWristMenu, pokeWidgets; src/40_models.js: gloveHold) y los avisos entre el
 * juego y los menús (HOOKS: el principal, Opciones, la pausa, el resumen, las cartas y las pantallas).
 *  - Se pulsan con el dedo (src/ui/ra/poke.ts) y con el rayo de IWSDK: RayInteractable en el grupo de los menús; el rayo
 *    ilumina la tecla y el pellizco (o el gatillo) la pulsa. Para el menú grande, a distancia, el rayo lleva imán (la tecla
 *    iluminada no se suelta hasta salir de ella 3 cm) y, al pellizcar, cuenta la tecla de un momento antes (al juntar los
 *    dedos, la mano se mueve y el rayo se desvía).
 *  - El botón MENÚ de la muñeca: en plena ronda, la tira rápida (sin parar); fuera, o en la pausa, trae el menú grande
 *    delante. En plancha, la tira sale con la palma izquierda hacia la cara un momento, en el suelo delante de las manos.
 *  - La mano que se ve se apoya en las teclas y en el panel (HOLD: la usan los guantes, y se mueve igual la mano de IWSDK).
 *  - El menú se recoge con la palma izquierda hacia abajo o con el puño, y con «✕ Cerrar»; vuelve con el botón MENÚ.
 */
import { createSystem, Group, RayInteractable, Vector3, VisibilityState } from '@iwsdk/core';
import { keepInBlack } from '../black-out.js';
import type { Object3D } from '@iwsdk/core';
import { GAME, HOOKS, LITE } from '../../core/state.js';
import { onSettingsChange } from '../../core/settings.js';
import { settings } from '../../core/values.js';
import { hands, head, isFist, SIDES } from '../../input/hand-model.js';
import { HOLD } from '../../input/hold.js';
import { SND, unlockAudio } from '../../audio/sound.js';
import { HITCH } from '../../core/hitch.js';
import { diagEvent } from '../../core/diag.js';
import type { Btn, Widget } from './btn.js';
import { activeWidgets, ENV, farRecall, hideMenu, lowAnchor, menuClose, noteStand, openMenu, refreshFields, UI, updateWatch, updateWristMenu, WATCH, watchBtn, WM, wristOpen, wristReady, type Row } from './menu-core.js';
import { endMenu, lobbyMenu, MENU_ENV, pauseMenu, perkClose, perkMenu, QUICK, quickMenu } from './menus.js';
import { fingers, pokeHold, pokeIdle, pokeWidgets, POKE } from './poke.js';
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

type Ev = { object?: Object3D; pointerId?: number; point?: Vector3; stopPropagation?(): void };
/** El imán del rayo (m en el mundo) y lo de antes del pellizco que cuenta (s). */
const RAY_KEEP = 0.03, RAY_PINCH = 0.15;
/** Lo de cada rayo: la tecla que ilumina (con imán) y las últimas que tuvo, con cuándo. */
interface RayState {
  w: Widget | null;
  hist: { t: number; w: Widget | null }[];
  outT: number;
}
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
  /** Lo que lleva la pausa sin menú a la vista (s): pasado un momento, vuelve el de la pausa. */
  private pauseLostT = 0;
  private hold = { left: new Vector3(), right: new Vector3() };
  private tmp = new Vector3();
  private iw = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private v = new Vector3();
  private rayOn = false;
  /** La tecla en la que se apretó cada rayo (para pulsarla al soltar). */
  private downOn = new Map<number, Widget | null>();
  private rays = new Map<number, RayState>();
  private rs = new Vector3();
  /** Lo que lleva la palma izquierda hacia la cara en plancha (s): abre la tira rápida en el suelo. */
  private palmT = 0;

  private inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  init(): void {
    this.root = new Group();
    this.root.name = 'Menús';
    const e = this.world.createTransformEntity(this.root);
    keepInBlack(this.root); // (el resumen, sobre el negro del final)
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
    R.addEventListener('pointerover', (ev) => this.rayAt(ev));
    R.addEventListener('pointermove', (ev) => this.rayAt(ev));
    R.addEventListener('pointerout', (ev) => {
      const st = this.rays.get(ev.pointerId ?? 0);
      if (st && st.w && widgetOf(ev.object) === st.w) st.outT = performance.now() / 1000; // (si no vuelve enseguida, se apaga)
    });
    // (se pulsa al soltar el pellizco sobre la misma tecla en la que se apretó, tarde lo que tarde: el «click» de IWSDK
    // solo cuenta si se suelta en menos de 0,8 s, y con el pellizco mantenido no llegaba). Cuenta la tecla de un momento antes
    // de apretar si era una tecla (al juntar los dedos, el rayo se desvía) y, al soltar, vale con seguir en su imán
    R.addEventListener('pointerdown', (ev) => {
      const id = ev.pointerId ?? 0, st = this.rays.get(id), now = performance.now() / 1000;
      let w = st ? st.w : widgetOf(ev.object);
      if (st) {
        let before: Widget | null | undefined;
        for (const e of st.hist) if (e.t <= now - RAY_PINCH) before = e.w;
        if (before && before !== w && before.kind === 'btn' && before.mesh.visible) w = before;
      }
      this.downOn.set(id, w);
    });
    R.addEventListener('pointerup', (ev) => {
      const id = ev.pointerId ?? 0, d = this.downOn.get(id), st = this.rays.get(id);
      this.downOn.delete(id);
      if (d && (widgetOf(ev.object) === d || st?.w === d || (ev.point && this.inMagnet(d, ev.point)))) this.rayPress(d);
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
      // (`low`: en plancha, en el suelo delante de tus manos, hacia donde apunta el cuerpo, sin «✕ Cerrar»: se pulsa con una mano)
      const m = openMenu(rows as Row[], { accent: opts?.accent, ...(opts?.low ? { anchor: lowAnchor(), noClose: true } : {}) }, opts?.low ? 'coach' : 'screen');
      if (opts?.title) m.kind = 'screen';
    };
    HOOKS.closeScreen = () => {
      if (UI.menu?.kind === 'screen' || UI.menu?.kind === 'coach') hideMenu(true);
    };
    HOOKS.screenOn = () => UI.menu?.kind === 'screen';
    HOOKS.perksOpen = (cards, pick) => this.open(() => perkMenu(cards, pick));
    HOOKS.perksClose = () => perkClose();
    // un ajuste cambiado desde fuera (la página, la sincronización): los valores del menú, al día
    this.cleanupFuncs.push(
      onSettingsChange((k) => {
        refreshFields();
        if (k === 'xrHz' || k === '*') this.applyRate();
      }),
    );
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(() => {
        // al entrar o salir de las gafas, el menú se rehace en su sitio nuevo
        UI.anchor = null;
        UI.lastAnchor = null;
        farRecall(); // (el grande, delante de ti al entrar)
        this.rebuild();
        this.applyQuality();
        this.applyRate();
      }),
    );
    this.open(() => lobbyMenu());
    (window as unknown as { __rxMenu: unknown }).__rxMenu = { UI, WM, POKE, fingers }; // (para las pruebas en el simulador)
  }

  /** Abre un menú (en las gafas, con «Muñeca», sale delante). */
  private open(fn: () => void): void {
    HITCH.f.menu = 1; // (para el registro de tirones)
    POKE.busyT = performance.now() / 1000; // (lo pesado de fondo, como precompilar enemigos, espera: src/ui/ra/poke.ts)
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
  // Las imágenes por segundo de las gafas: las de «Fotogramas por segundo en las gafas» (72 de serie: «la imagen va siempre
  // fluida»), o la más parecida que admitan (RepArena: xrRate). Se había quedado sin portar y las gafas iban a 90: el juego no
  // llegaba a pintar cada imagen a tiempo (el diagnóstico daba 16-20 ms por imagen sin tocar nada, y a 90 hay 11) y, al mover
  // la cabeza, el menú y todo lo demás iban a saltos
  private applyRate(): void {
    const s = this.world.renderer.xr.getSession() as (XRSession & { supportedFrameRates?: Float32Array; updateTargetFrameRate?: (r: number) => Promise<void> }) | null;
    if (!s?.updateTargetFrameRate || !s.supportedFrameRates?.length) return;
    const want = Number(settings.xrHz) || 72, rates = [...s.supportedFrameRates];
    const r = rates.includes(want) ? want : rates.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), rates[0]);
    s.updateTargetFrameRate(r).catch(() => {});
  }

  private applyQuality(): void {
    const q = QUALITY[this.quality], xr = this.world.renderer.xr;
    if (!xr.isPresenting) xr.setFramebufferScaleFactor(q.scale);
    xr.setFoveation(q.foveation);
    MENU_ENV.quality.note = xr.isPresenting ? 'La nitidez nueva se aplica al volver a entrar en VR' : 'La nitidez se aplica al entrar en VR';
  }

  // ---------------------------------------------------------------- el rayo

  /** ¿Está el punto (en el mundo) sobre la tecla o a menos de RAY_KEEP de ella? */
  private inMagnet(w: Widget, p: Vector3): boolean {
    const o = w as unknown as { w?: number; h?: number };
    if (!o.w || !o.h || !w.mesh.parent) return false;
    const k = RAY_KEEP / Math.max(1e-3, w.mesh.getWorldScale(this.rs).x), l = w.mesh.worldToLocal(this.rs.copy(p));
    return Math.abs(l.x) <= o.w / 2 + k && Math.abs(l.y) <= o.h / 2 + k;
  }
  /** Por dónde pasa un rayo: su tecla, con imán (la que tenía se queda mientras el punto siga a menos de 3 cm). */
  private rayAt(ev: Ev): void {
    const id = ev.pointerId ?? 0, o = widgetOf(ev.object);
    let st = this.rays.get(id);
    if (!st) this.rays.set(id, (st = { w: null, hist: [], outT: -1 }));
    st.outT = -1;
    if (st.w && st.w !== o && ev.point && this.inMagnet(st.w, ev.point)) return;
    this.raySet(st, o);
  }
  private raySet(st: RayState, w: Widget | null): void {
    if (st.w === w) return;
    const old = st.w;
    st.w = w;
    st.hist.push({ t: performance.now() / 1000, w });
    if (st.hist.length > 8) st.hist.shift();
    if (old && ![...this.rays.values()].some((r) => r.w === old)) this.rayHover(old, false);
    if (w) this.rayHover(w, true);
  }
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
    // en plena ronda: la tira rápida, sin parar (otra vez, se recoge)
    if (GAME.phase === 'playing' && !GAME.paused) {
      if (m?.kind === 'quick' && !m.closed && (!m.wrist || WM.on)) hideMenu();
      else this.open(() => quickMenu(false));
      SND.tick();
      return;
    }
    // fuera de la ronda (o en la pausa): el menú grande, delante de ti
    farRecall();
    if (m?.wrist) wristOpen(); // (las cartas recogidas vuelven)
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
    if (GAME.phase === 'playing' && !GAME.paused) return m?.kind === 'quick' && !m.closed && (!m.wrist || WM.on) ? 'CERRAR' : 'MENÚ';
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
    } else pokeIdle('menu'); // (sin menú, nada se queda pulsado ni apoyado: la de EMPEZAR seguía «hundida» en la partida)
    // el rayo que salió de su tecla y no ha vuelto enseguida (salió del menú): la tecla se apaga
    const now = performance.now() / 1000;
    for (const st of this.rays.values()) if (st.outT > 0 && now - st.outT > 0.1) {
      st.outT = -1;
      this.raySet(st, null);
    }
    // el rayo de IWSDK, solo con un menú a la vista (si no, no se pinta ni estorba en la partida)
    const rayWant = inXR ? !!m && !m.closed && m.group.visible : true;
    if (rayWant !== this.rayOn) {
      this.rayOn = rayWant;
      this.root.visible = true;
    }
    // el menú se recoge con la palma izquierda hacia abajo o con el puño (un momento, para no recogerlo sin querer)
    const h = hands.left;
    // (en la pausa de una ronda, nunca: recogido el menú, la partida se quedaba parada sin nada a la vista —parecía colgada—,
    // también al abrir la música desde la pausa, que es una pantalla de las que se recogen)
    const inPause = GAME.phase === 'playing' && GAME.paused;
    // (el grande no: está lejos y se cierra con «✕ Cerrar»; la tira en el suelo tampoco: al pulsarla, la palma va hacia abajo)
    const closing = inXR && !inPause && !!m && !m.far && !m.low && (m.kind === 'lobby' || m.kind === 'options' || m.kind === 'screen' || m.kind === 'quick') && !m.closed && (!m.wrist || WM.on) && h.ok && !h.est && !h.virt && (isFist(h) || this.tmp.set(0, 1, 0).applyQuaternion(h.wristQ).y > 0.85);
    this.closeT = closing ? this.closeT + dt : 0;
    if (this.closeT > 0.5) {
      this.closeT = 0;
      menuClose();
    }
    // en la pausa siempre hay un menú a la vista: si se ha recogido o quitado (por lo que sea), vuelve el de la pausa
    const um = UI.menu, lost = inPause && (!um || um.closed || (um.wrist && !WM.on));
    this.pauseLostT = lost ? this.pauseLostT + dt : 0;
    if (this.pauseLostT > 0.6) {
      this.pauseLostT = 0;
      diagEvent('pausa sin menú a la vista: vuelve el de la pausa');
      if (um?.wrist && !WM.on) WM.on = true;
      else this.open(pauseMenu);
    }
    // qué menú se ve (para la partida): el que está abierto aunque esté recogido
    const k = UI.menu?.kind;
    GAME.menu = k === 'lobby' ? 'lobby' : k === 'options' || k === 'screen' || k === 'coach' || k === 'quick' ? 'options' : k === 'pause' ? 'pause' : k === 'summary' ? 'summary' : 'none';
    // en plena partida no hay más menú que la pausa, las cartas, la pregunta del asistente del vuelo y la tira rápida
    if (GAME.phase === 'playing' && !GAME.paused && m && m.kind !== 'pause' && m.kind !== 'perks' && m.kind !== 'coach' && m.kind !== 'quick') hideMenu();
    // la tira rápida: fuera de la ronda no está; en el suelo, se va si no la tocas en 12 s o si te levantas
    const q = UI.menu;
    if (q?.kind === 'quick' && (GAME.phase !== 'playing' || GAME.paused || (q.low && (now - QUICK.pressT > 12 || head.p.y > 1.15)))) hideMenu();
    // en plancha, la palma izquierda hacia la cara medio segundo (la mano de verdad, a menos de 60 cm): la tira, en el suelo
    // (en Barras no: colgado de las paralelas, la mano que agarra la barra mira hacia la cara y la tira salía una y otra vez
    // —lo vio el usuario en el parapente—; allí, el botón MENÚ)
    const low = inXR && GAME.phase === 'playing' && !GAME.paused && settings.mode !== 'bars' && head.p.y < 0.95 && h.ok && !h.est && h.isHand && !isFist(h);
    let palm = false;
    if (low) {
      this.a.copy(head.p).sub(h.wrist);
      const d = this.a.length();
      palm = d < 0.6 && this.tmp.set(0, -1, 0).applyQuaternion(h.wristQ).dot(this.a.divideScalar(Math.max(d, 1e-3))) > 0.75;
    }
    this.palmT = palm && UI.menu?.kind !== 'quick' && UI.menu?.kind !== 'coach' && UI.menu?.kind !== 'perks' ? this.palmT + dt : 0;
    if (this.palmT > 0.5) {
      this.palmT = 0;
      diagEvent('la palma hacia la cara en plancha: la tira rápida, en el suelo');
      this.open(() => quickMenu(true));
    }
    // con un menú abierto (y a la vista) en las gafas, la escena se aligera (sin el bosque ni los enemigos: src/core/state.ts);
    // con la pregunta del asistente, no (se ve dónde vuelas)
    const mm = UI.menu;
    LITE.on = inXR && !!mm && !mm.closed && mm.group.visible && mm.kind !== 'perks' && mm.kind !== 'coach' && mm.kind !== 'quick' && (!mm.wrist || WM.on);
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
