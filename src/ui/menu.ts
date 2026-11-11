/**
 * Los menús en VR (RepArena, src/70_game.js: lobbyMenu y optionsMenu; src/60_ui.js: los campos y la tecla «?»), con los
 * paneles de UIKit y la pulsación de IWSDK (con el rayo de la mano o del mando y con el dedo: criterio del usuario, la
 * física de pulsar es la de IWSDK). Tres paneles de la escena, en el mismo sitio:
 *  - el principal (public/ui/lobby.uikitml): EMPEZAR, el modo, los ejercicios y la dificultad, Opciones y Salir;
 *  - Opciones (public/ui/options.uikitml): Rivales y armas, Progreso, Sonido, Entorno y Ajustes, en pestañas, con los
 *    ajustes del esquema;
 *  - la explicación de un ajuste (public/ui/hint.uikitml), al lado del menú, con la tecla «?»;
 *  - la columna «HOY» (public/ui/hoy.uikitml), a la izquierda del principal, y, bajo EMPEZAR, la franja de las metas de hoy:
 *    las tres misiones con su barra y la racha con sus escudos; al tocar la franja, Opciones → Progreso → Misiones;
 *  - el resumen de la ronda (public/ui/summary.uikitml: RepArena, opción A) y la pausa (public/ui/pause.uikitml);
 *  - el botón MENÚ de la muñeca izquierda (public/ui/wrist.uikitml: RepArena, watch): sale al mirarte la muñeca y se pulsa
 *    con la otra mano (con mandos, también X/Y): en la ronda, la pausa; fuera, trae el menú delante. El menú se recoge con
 *    la palma izquierda hacia abajo o con el puño (RepArena: «Menú de muñeca»).
 * En las gafas, el menú sale delante de ti y a tu alcance (a «Distancia del menú»), colgando a la altura del pecho e
 * inclinado hacia ti; cada menú nuevo sale donde estaba el anterior. En el ordenador, quieto donde lo pone la escena.
 * Lo que se enseña de cada ajuste y lo que hace tocarlo, sin IWSDK, en src/ui/fields.ts.
 */
import { createSystem, Entity, Euler, PokeInteractable, RayInteractable, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { BODY_NOTE, EX_NAMES, EX_SHORT, FOE_FLY, FOE_GATE, MODE_EX, MODE_NAMES, RANKS } from '../core/catalog.js';
import { foeList } from '../core/rules.js';
import { devFoe, foeReady } from '../combat/foes.js';
import { FIELD, type FieldDef } from '../core/schema.js';
import { fieldVisible, onSettingsChange, rankIdx, setSetting } from '../core/settings.js';
import { isCombat } from '../core/rules.js';
import { num, settings } from '../core/values.js';
import { GAME, HOOKS } from '../core/state.js';
import { hands, head, isFist } from '../input/hand-model.js';
import type { Summary } from '../core/run.js';
import { SND, unlockAudio } from '../audio/sound.js';
import { HOW } from '../exercise/how.js';
import { PLAY_MODES, playable, playableEx } from '../core/playable.js';
import { curEx, eyeFields, fieldHere, fieldPick, fieldStep, fieldView, groupFields, groupName, roundInfo, settingsGroups, type FieldView } from './fields.js';
import { applyFonts } from './fonts.js';
import { musicScreen } from './screens/music-screens.js';
import { syncScreen, xferScreen } from './screens/xfer-screens.js';
import { career, history, progressNow, setLook } from '../combat/career-hub.js';
import { CAMP_N, CAMP_REG, campId, CHEST_XP, LOOKS, MIS, MIS_XP, misGot, misShort, PROG_COL, SHIELD_COL, SHIELD_MAX, type LookKey, type MisItem } from '../core/career.js';
import { daysTxt, dayStats, WDAY } from '../core/days.js';

/** Nitidez en las gafas (la del juego nuevo: decisión del usuario en el PR 7): la resolución que se pide al entrar (×1
 * es la «nativa» del navegador de las Quest 3, que se queda corta) y la foveación (cuánto se emborrona el borde de la vista
 * para ir más ligero). Se guarda aparte de la «Calidad de imagen» de RepArena, que aquí no sale. */
export const QUALITY = [
  { label: 'Normal ×1', scale: 1.0, foveation: 1.0 },
  { label: 'Alta ×1,4', scale: 1.4, foveation: 0.5 },
  { label: 'Máxima ×1,7', scale: 1.7, foveation: 0.2 },
];
const QUALITY_KEY = 'reparenaxr-quality';

// Los colores de RepArena (MODE_COL, SES_COL, DIFF_COL, EX_COL, MC)
const MODE_COL: Record<string, string> = { combat: '#ff8a3d', arcs: '#ff4fa3', bars: '#ffd166', touch: '#3cf0c6', trek: '#8fdc5a' };
const SES_COL = '#b9a6ff', DIFF_COL = '#5ab8ff', EX_COL = '#e4e8f2', MODE_BOX = '#8c86b4';
const TABS = [
  { k: 'foes', label: 'Rivales y armas', col: '#ff8a3d' },
  { k: 'prog', label: 'Progreso', col: '#ff4fa3' },
  { k: 'sound', label: 'Sonido', col: '#a68bff' },
  { k: 'scene', label: 'Entorno', col: '#7ee081' },
  { k: 'set', label: 'Ajustes', col: '#ffd166' },
] as const;
type Tab = (typeof TABS)[number]['k'];
// Lo que aún no está (se enciende con su PR): los modos y Sesiones, y los ejercicios de suelo
const SOON_MODE: Record<string, string> = { trek: 'La Travesía llega con el PR 18', ses: 'Las sesiones llegan con el PR 19' };
const SOON_EX = 'Este ejercicio aún no está';
/** Todos los botones de ejercicio del menú principal (cada modo enseña los suyos). */
const ALL_EX = [...new Set(Object.values(MODE_EX).flat())];
const PROG_SUBS: ['lvl' | 'mis' | 'camp' | 'week', string][] = [['lvl', 'Nivel'], ['mis', 'Misiones'], ['camp', 'Campaña'], ['week', 'Semana']];
const KEY = { bg: '#2a2f3a', fg: '#e9eef7', off: '#1d212b', offFg: '#5d6577', dark: '#0d1016' };
const ROWS_LOBBY = ['l1', 'l2', 'l3', 'l4'], ROWS_OPT = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9'], N_OPTS = 8, N_SUB = 10;
const HINT_SECS = 9;
// En las gafas: el borde de arriba del menú, 18 cm por debajo de los ojos; a «Distancia del menú» (RepArena: el 75 %)
const TOP_BELOW = 0.18;

/** Lo que la pausa cuenta además (lo pone la partida): las mejoras que llevas y los últimos avisos. */
export const PAUSE_INFO = { perks: '', warns: '' };

/** Lo que va en una fila: un ajuste del esquema o la nitidez (propia del juego nuevo). */
type Row = FieldDef | 'quality' | null;

const opt = (on: boolean, col = '#3cf0c6') => ({ bg: on ? col : KEY.bg, fg: on ? KEY.dark : KEY.fg });

export class MenuSystem extends createSystem({}, {}) {
  private lobby: UIKitMLAsset | null = null;
  private opts: UIKitMLAsset | null = null;
  private hint: UIKitMLAsset | null = null;
  private eLobby: Entity | undefined;
  private eOpts: Entity | undefined;
  private eHint: Entity | undefined;
  private hoy: UIKitMLAsset | null = null;
  private eHoy: Entity | undefined;
  private sub: 'lvl' | 'mis' | 'camp' | 'week' = 'lvl';
  private sumCamp: Summary['camp'] = null;
  private campSel = 0;
  private campReg = -1;
  private view: 'lobby' | 'options' | 'summary' | 'pause' | 'none' = 'lobby';
  private sum: UIKitMLAsset | null = null;
  private pausep: UIKitMLAsset | null = null;
  private wrist: UIKitMLAsset | null = null;
  private eSum: Entity | undefined;
  private ePause: Entity | undefined;
  private eWrist: Entity | undefined;
  private wristOn = false;
  private wristT = 0;
  private btnPrev = false;
  private closeT = 0;
  private wu = new Vector3();
  private wh = new Vector3();
  private tab: Tab = 'set';
  private group = 'partida';
  private page = 0;
  private rows: Record<string, Row> = {};
  private last = '';
  private noteT = 0;
  private hintT = 0;
  private hintKey = '';
  private quality = 1;
  private vrOk = false;
  private placed = false;
  private texts = new Map<string, string>();
  private e = new Euler(0, 0, 0, 'YXZ');
  private v = new Vector3();
  private home = { lobby: new Vector3(), opts: new Vector3(), hint: new Vector3() };

  init(): void {
    this.lobby = this.world.getSceneObject<UIKitMLAsset>('lobby-panel') ?? null;
    this.opts = this.world.getSceneObject<UIKitMLAsset>('options-panel') ?? null;
    this.hint = this.world.getSceneObject<UIKitMLAsset>('hint-panel') ?? null;
    this.eLobby = this.world.getSceneEntity('lobby-panel');
    this.eOpts = this.world.getSceneEntity('options-panel');
    this.eHint = this.world.getSceneEntity('hint-panel');
    this.hoy = this.world.getSceneObject<UIKitMLAsset>('hoy-panel') ?? null;
    this.eHoy = this.world.getSceneEntity('hoy-panel');
    this.sum = this.world.getSceneObject<UIKitMLAsset>('summary-panel') ?? null;
    this.pausep = this.world.getSceneObject<UIKitMLAsset>('pause-panel') ?? null;
    this.wrist = this.world.getSceneObject<UIKitMLAsset>('wrist-panel') ?? null;
    this.eSum = this.world.getSceneEntity('summary-panel');
    this.ePause = this.world.getSceneEntity('pause-panel');
    this.eWrist = this.world.getSceneEntity('wrist-panel');
    for (const p of [this.lobby, this.opts, this.hint, this.hoy, this.sum, this.pausep, this.wrist]) if (p) applyFonts(p);
    this.setOn(this.wrist, this.eWrist, false);
    // el resumen: otra ronda o el menú principal; la pausa: seguir, recolocarse, terminar la ronda o el menú principal;
    // el botón de la muñeca
    this.on(this.sum, 's-again', () => HOOKS.startRound());
    this.on(this.sum, 's-menu', () => this.show('lobby'));
    this.on(this.sum, 's-menu2', () => this.show('lobby'));
    // en la campaña: el nivel siguiente, repetirlo o volver al mapa
    this.on(this.sum, 's-next', () => this.sumCamp?.next && HOOKS.campPlay(this.sumCamp.next));
    this.on(this.sum, 's-repeat', () => this.sumCamp && HOOKS.campPlay(this.sumCamp.lv));
    this.on(this.sum, 's-map', () => {
      this.campSel = 0;
      this.campReg = -1;
      this.openProgress('camp');
    });
    this.on(this.pausep, 'p-go', () => HOOKS.resume());
    this.on(this.pausep, 'p-recal', () => {
      HOOKS.resume();
      HOOKS.recalibrate();
    });
    this.on(this.pausep, 'p-end', () => {
      HOOKS.resume();
      HOOKS.endRound();
    });
    this.on(this.pausep, 'p-menu', () => {
      HOOKS.resume();
      HOOKS.toLobby();
    });
    this.on(this.wrist, 'w-btn', () => this.onWatch());
    HOOKS.showSummary = (s) => this.showSummary(s as Summary);
    HOOKS.pause = () => this.pause();
    HOOKS.resume = () => {
      GAME.paused = false;
      this.show('none');
    };
    // dónde los pone la escena (en el ordenador se quedan ahí)
    this.eLobby?.object3D?.getWorldPosition(this.home.lobby);
    this.eOpts?.object3D?.getWorldPosition(this.home.opts);
    this.eHint?.object3D?.getWorldPosition(this.home.hint);
    try {
      const raw = localStorage.getItem(QUALITY_KEY) ?? localStorage.getItem('rx-quality'), q = Number(raw);
      if (raw !== null && q >= 0 && q < QUALITY.length) this.quality = q;
    } catch {
      /* (sin almacenamiento: la de serie) */
    }
    this.wireLobby();
    this.wireOptions();
    HOOKS.showMenu = (last) => {
      this.last = last;
      this.placed = false; // (al acabar la ronda, delante de ti otra vez)
      this.show('lobby');
    };
    HOOKS.hideMenu = () => this.show('none');
    this.cleanupFuncs.push(onSettingsChange(() => this.refresh()));
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe(() => {
        this.placed = false;
        this.place();
        this.refresh();
      }),
    );
    void navigator.xr
      ?.isSessionSupported('immersive-vr')
      .then((ok) => {
        this.vrOk = ok && this.world.xrEnabled;
        this.refresh();
      })
      .catch(() => {});
    this.applyQuality();
    this.show('lobby');
  }

  // ---------------------------------------------------------------- abrir, cerrar y colocar

  private show(v: 'lobby' | 'options' | 'summary' | 'pause' | 'none'): void {
    this.view = v;
    GAME.menu = v;
    this.setOn(this.lobby, this.eLobby, v === 'lobby');
    this.setOn(this.hoy, this.eHoy, v === 'lobby');
    this.setOn(this.opts, this.eOpts, v === 'options');
    this.setOn(this.sum, this.eSum, v === 'summary');
    this.setOn(this.pausep, this.ePause, v === 'pause');
    if (v === 'none') this.hideHint();
    this.place();
    this.refresh();
  }

  private setOn(p: UIKitMLAsset | null, e: Entity | undefined, on: boolean): void {
    if (p) p.visible = on;
    if (e?.object3D) e.object3D.visible = on;
    if (!e) return;
    // se pulsan con el rayo y con el dedo (los de IWSDK); escondidos, nada
    for (const C of [RayInteractable, PokeInteractable]) {
      if (on && !e.hasComponent(C)) e.addComponent(C);
      else if (!on && e.hasComponent(C)) e.removeComponent(C);
    }
  }

  private inXR(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  // En las gafas, el menú sale delante de ti y a tu alcance, colgando a la altura del pecho e inclinado hacia ti (RepArena:
  // placeAnchor); los menús siguientes salen en el mismo sitio. En el ordenador, donde lo pone la escena
  private place(): void {
    if (this.placed || this.view === 'none') return;
    const L = this.eLobby?.object3D, O = this.eOpts?.object3D, H = this.eHint?.object3D, Sm = this.eSum?.object3D, Pz = this.ePause?.object3D;
    if (!L || !O) return;
    this.placed = true;
    if (!this.inXR()) {
      L.position.copy(this.home.lobby);
      O.position.copy(this.home.opts);
      H?.position.copy(this.home.hint);
      for (const o of [L, O, H]) o?.rotation.set(0, 0, 0);
      for (const o of [Sm, Pz]) o?.position.set(this.home.lobby.x, this.home.lobby.y, this.home.lobby.z + 0.05);
      return;
    }
    const f = this.v.set(0, 0, -1).applyQuaternion(head.q).setY(0);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    // (los paneles cuelgan de su borde de arriba: anchor-y: top en su UIKitML; así, por alto que sea el menú, lo de arriba
    // no se aleja ni se sube; inclinado hacia ti, que lo de abajo quede a la vista)
    const d = (0.75 * Math.max(30, num('menuDist') || 85)) / 100, top = head.p.y - TOP_BELOW;
    this.e.set(-Math.atan2(TOP_BELOW + 0.4, d) * 0.6, Math.atan2(-f.x, -f.z), 0);
    for (const o of [L, O, Sm, Pz]) {
      if (!o) continue;
      o.position.set(head.p.x + f.x * d, top, head.p.z + f.z * d);
      o.quaternion.setFromEuler(this.e);
    }
  }

  // ---------------------------------------------------------------- textos y colores (solo si cambian)

  private set(p: UIKitMLAsset | null, id: string, props: Record<string, unknown>): void {
    if (!p) return;
    const k = id + '@' + p.assetId + '|' + Object.keys(props).join(), s = JSON.stringify(props);
    if (this.texts.get(k) === s) return; // (cada cambio rehace el elemento: solo lo que cambia)
    this.texts.set(k, s);
    p.getElementById(id)?.setProperties(props);
  }
  private text(p: UIKitMLAsset | null, id: string, text: string): void {
    this.set(p, id, { text });
  }
  private shown(p: UIKitMLAsset | null, id: string, on: boolean): void {
    this.set(p, id, { display: on ? 'flex' : 'none' });
  }
  private key(p: UIKitMLAsset | null, id: string, bg: string, fg: string): void {
    this.set(p, id, { backgroundColor: bg });
    this.set(p, id + 't', { color: fg });
  }

  private on(p: UIKitMLAsset | null, id: string, fn: () => void): void {
    const el = p?.getElementById(id);
    if (!el) return;
    const h = (): void => {
      unlockAudio();
      SND.click();
      fn();
      this.refresh();
    };
    el.addEventListener('click', h);
    this.cleanupFuncs.push(() => el.removeEventListener('click', h));
  }

  private note(text: string): void {
    this.text(this.lobby, 'lobby-note', text);
    this.noteT = 3;
  }

  // ---------------------------------------------------------------- el principal

  private wireLobby(): void {
    const p = this.lobby;
    this.on(p, 'start-button', () => HOOKS.startRound());
    this.on(p, 'xr-button', () => this.world.launchXR());
    this.on(p, 'exit-button', () => void this.world.renderer.xr.getSession()?.end());
    this.on(p, 'opt-button', () => this.show('options'));
    for (const m of Object.keys(MODE_NAMES)) this.on(p, 'm-' + m, () => (PLAY_MODES.includes(m) ? this.pickMode(m) : this.note(SOON_MODE[m])));
    this.on(p, 'm-ses', () => this.note(SOON_MODE.ses));
    this.on(p, 'eq-place', () => HOOKS.placeEq());
    for (const ex of ALL_EX) this.on(p, 'e-' + ex, () => (playable(settings.mode, ex) ? this.pickEx(ex) : this.note(SOON_EX)));
    RANKS.forEach(([v], i) => this.on(p, 'r-' + i, () => setSetting('rank', v)));
    this.on(p, 'fail', () => setSetting('toFail', num('toFail') ? 0 : 1));
    for (const g of ['g1', 'g2', 'g3', 'g4']) this.on(p, g, () => this.openProgress('mis')); // (la franja de las metas de hoy)
    for (const r of ROWS_LOBBY) this.wireRow(p, r);
  }

  // Combate con el ejercicio elegido (si lo guardado en RepArena era otro modo, o uno que aún no hay, la sentadilla)
  private pickMode(m: string = settings.mode): void {
    const mode = PLAY_MODES.includes(m) ? m : 'combat'; // (lo que aún no hay: Combate)
    if (settings.mode !== mode) setSetting('mode', mode);
    const ex = playableEx(mode, settings.exercise);
    if (ex !== settings.exercise) setSetting('exercise', ex);
  }
  private pickEx(ex: string): void {
    this.pickMode();
    if (settings.exercise !== ex) setSetting('exercise', ex);
    if (import.meta.env.DEV) console.info(`rxdbg ejercicio ${settings.mode} ${settings.exercise}`); // (para probar en el emulador)
  }

  // Opciones → Progreso, en la parte que toque (la franja de las metas de hoy lleva a Misiones)
  private openProgress(sub: 'lvl' | 'mis' | 'camp' | 'week'): void {
    this.tab = 'prog';
    this.sub = sub;
    if (sub === 'camp') this.pickMode();
    this.page = 0;
    this.show('options');
  }

  // ---------------------------------------------------------------- tu carrera: metas de hoy, columna HOY y Progreso

  // Una meta: el círculo (con ✓ si está), su texto, su barra y lo que llevas (long: el texto entero, no el corto)
  private fillGoal(p: UIKitMLAsset | null, id: string, m: MisItem, barW: number, long = false): void {
    const done = m.done, got = misGot(m);
    this.set(p, `${id}-c`, { backgroundColor: done ? '#3cf0c6' : '#3a4152' });
    this.text(p, `${id}-ct`, done ? '✓' : '');
    this.text(p, `${id}-t`, long ? MIS[m.t].txt(m) : misShort(m));
    this.set(p, `${id}-t`, { color: done ? '#2bd4ad' : '#e9eef7' });
    this.set(p, `${id}-f`, { width: Math.max(barW * 0.04, (barW * got) / m.n), backgroundColor: done ? '#3cf0c6' : PROG_COL });
    this.text(p, `${id}-n`, done ? `+${MIS_XP} XP` : `${got} / ${m.n}`);
  }

  private fillShields(p: UIKitMLAsset | null, ids: string[]): void {
    const n = career().cr.shield;
    ids.forEach((id, i) => this.set(p, id, { backgroundColor: i < n ? SHIELD_COL : '#3a4152' }));
  }

  // La franja de bajo EMPEZAR (tres metas y la racha) y la columna HOY (lo mismo, el cofre y tu nivel)
  private refreshGoals(): void {
    const c = career(), M = c.misToday(), P = progressNow(), L = c.lvlOf(), left = M.list.filter((m) => !m.done).length;
    const p = this.lobby, h = this.hoy;
    this.shown(p, 'goals', true);
    M.list.forEach((m, i) => {
      this.fillGoal(p, `g${i + 1}`, m, 15);
      this.fillGoal(h, `g${i + 1}`, m, 17);
    });
    this.text(p, 'g4-t', daysTxt(P.streak));
    this.fillShields(p, ['g4-s0', 'g4-s1', 'g4-s2']);
    this.text(p, 'g4-n', M.chest ? 'cofre ✓' : `cofre: ${left}`);
    this.set(p, 'g4-n', { color: M.chest ? '#ffd166' : '#a49fc8' });
    // la columna HOY
    this.text(h, 'chest-t', M.chest ? '¡Cofre del día abierto!' : `Cofre: +${CHEST_XP} XP, un escudo y un color`);
    this.set(h, 'chest', { backgroundColor: M.chest ? '#ffd166' : '#7a4318' });
    this.text(h, 'streak-t', `Racha: ${daysTxt(P.streak)}`);
    this.fillShields(h, ['s0', 's1', 's2']);
    this.text(h, 'badge-t', String(L.n));
    this.text(h, 'lvl-t', `Nivel ${L.n} · ${c.titleOf(L.n)}`);
    this.set(h, 'xp-f', { width: Math.max(0.9, (22 * L.into) / L.need) });
    this.text(h, 'xp-n', `${L.into} / ${L.need} XP`);
  }

  // La campaña del modo y el ejercicio que juegas: el nivel elegido (por defecto, el siguiente por jugar) y su región
  private campView(): { id: string; C: ReturnType<ReturnType<typeof career>['campOf']>; sel: number; reg: number } {
    const id = campId(settings.mode, settings.exercise), C = career().campOf(id), sel = Math.max(1, Math.min(CAMP_N, this.campSel || C.at));
    return { id, C, sel, reg: this.campReg >= 0 ? this.campReg : Math.floor((sel - 1) / 5) };
  }
  private campPick(i: number): void {
    const { C, reg } = this.campView(), lv = reg * 5 + i + 1;
    if (lv > C.at) return;
    this.campSel = lv;
    this.campReg = reg;
  }
  private campMove(d: number): void {
    const { reg } = this.campView();
    if (reg + d >= 0 && reg + d < CAMP_REG.length) this.campReg = reg + d;
  }

  // La parte Progreso de Opciones: Nivel (con los colores que se desbloquean), Misiones y Semana
  private refreshProg(): void {
    const p = this.opts, c = career();
    for (const k of ['lvl', 'mis', 'camp', 'week'] as const) this.shown(p, 'pg-' + k, k === this.sub);
    if (this.sub === 'lvl') {
      const L = c.lvlOf(), nx = c.nextUnlock();
      this.text(p, 'pl-badget', String(L.n));
      this.text(p, 'pl-title', `Nivel ${L.n} · ${c.titleOf(L.n)}`);
      this.set(p, 'pl-xpf', { width: Math.max(1.4, (64 * L.into) / L.need) });
      this.text(p, 'pl-xpn', `${L.into} / ${L.need} XP${nx ? ` · Nivel ${nx.n}: ${nx.label}` : ''}`);
      this.text(p, 'pl-note', 'Cada repetición da experiencia (las perfectas, el doble). Los colores solo se ven; el de las manos, por ahora, solo en RepArena');
      for (const k of ['hands', 'bolt'] as LookKey[]) {
        const O = LOOKS[k].opts, cur = c.lookOpt(k)[0];
        for (let i = 0; i < 6; i++) {
          const o = O[i], id = `lk-${k}-${i}`;
          if (!o) continue;
          const own = c.lookOwn(k, o[0]), sel = own && o[0] === cur;
          this.text(p, id + 't', own ? o[1] : `Nivel ${o[2]}`);
          this.set(p, id, { backgroundColor: sel ? '#' + o[3].toString(16).padStart(6, '0') : own ? KEY.bg : KEY.off });
          this.set(p, id + 't', { color: sel ? KEY.dark : own ? KEY.fg : KEY.offFg });
        }
      }
    } else if (this.sub === 'camp') {
      const { id, C, sel, reg } = this.campView(), c = career(), L = c.campLv(sel), BG: Record<string, string> = { arena: '#3a2f2a', nature: '#28503a', island: '#2a6f86' };
      this.set(p, 'pc-map', { backgroundColor: BG[CAMP_REG[reg][1]] });
      this.text(p, 'pc-title', `${reg + 1}. ${CAMP_REG[reg][0]} · ${RANKS[reg][1]}`);
      this.text(p, 'pc-stars', `${c.campStars(id)} / ${CAMP_N * 3} estrellas`);
      for (let i = 0; i < 5; i++) {
        const lv = reg * 5 + i + 1, open = lv <= C.at, st = C.stars[lv] || 0, next = lv === C.at;
        this.text(p, `pc${i}-n`, String(lv));
        this.shown(p, `pc${i}-b`, i === 4);
        this.set(p, `pc${i}`, { backgroundColor: !open ? '#1f1a24' : next ? '#3cf0c6' : st ? '#ffd166' : '#eeeaff', borderColor: lv === sel ? '#ffffff' : '#00000000' });
        this.set(p, `pc${i}-n`, { color: open ? '#1a1030' : '#ffffff55' });
        for (let k = 0; k < 3; k++) this.set(p, `pc${i}-s${k}`, { backgroundColor: k < st ? '#e68a00' : open ? '#00000033' : '#ffffff22' });
      }
      this.text(p, 'pc-playt', `JUGAR NIVEL ${sel}`);
      this.key(p, 'pc-prev', reg > 0 ? KEY.bg : KEY.off, reg > 0 ? KEY.fg : KEY.offFg);
      this.key(p, 'pc-next', reg < CAMP_REG.length - 1 ? KEY.bg : KEY.off, reg < CAMP_REG.length - 1 ? KEY.fg : KEY.offFg);
      this.text(p, 'pc-note', `Nivel ${sel}: ${RANKS[L.r][1].toLowerCase()}, ${L.waves} oleadas${L.boss && isCombat() ? ', con jefe' : ''} · ${EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise]} en ${MODE_NAMES[settings.mode]}. Ganar abre el siguiente; de 1 a 3 estrellas`);
    } else if (this.sub === 'mis') {
      const M = c.misToday(), P = progressNow();
      M.list.forEach((m, i) => this.fillGoal(p, `pm${i + 1}`, m, 64, true));
      this.text(p, 'pm-chest', M.chest ? '¡Cofre del día abierto!' : `Cofre: +${CHEST_XP} XP y un escudo`);
      this.set(p, 'pm-chest', { color: M.chest ? '#ffd166' : '#a49fc8' });
      this.text(p, 'pm-streak', `Racha: ${daysTxt(P.streak)} · mejor ${P.best}`);
      this.fillShields(p, ['ps0', 'ps1', 'ps2']);
      this.text(p, 'pm-note', `Tres nuevas cada día: +${MIS_XP} XP cada una. Con las tres se abre el cofre: +${CHEST_XP} XP, un escudo de racha y, si queda alguno, un color`);
      this.text(p, 'pm-shnote', `Escudos de racha: ${c.cr.shield} de ${SHIELD_MAX}. Si un día no entrenas, se gasta uno solo y tu racha sigue`);
      this.set(p, 'pm-shnote', { color: SHIELD_COL });
    } else {
      const h = history(), D = dayStats(h, Date.now(), num('weight') || 70), goal = num('goalMin'), mins = D.week.map((d) => d.v.time / 60), mx = Math.max(goal, ...mins) || 1;
      D.week.forEach((d, i) => {
        const m = mins[i], today = i === 6;
        this.text(p, `wk${i}-v`, m >= 1 ? String(Math.round(m)) : '');
        this.set(p, `wk${i}-f`, { height: Math.max(m > 0 ? 0.4 : 0.1, (16 * m) / mx), backgroundColor: today ? '#3cf0c6' : '#5ab8ff' });
        this.set(p, `wk${i}-g`, { positionBottom: (16 * goal) / mx - 0.17 }); // (la raya de tu meta)
        this.text(p, `wk${i}-l`, today ? 'hoy' : WDAY[d.d.getDay()].slice(0, 2));
        this.set(p, `wk${i}-l`, { color: today ? '#3cf0c6' : '#a49fc8' });
      });
      this.text(p, 'wk-goal', `Tu meta: ${goal} min al día (la raya rosa)`);
      const b = c.bestRunOf(h, settings.exercise, settings.mode), nm = (EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise]).toLowerCase();
      this.text(p, 'wk-best', b ? `Tu mejor ronda de ${nm} en ${MODE_NAMES[settings.mode]}: ${b.reps} reps${b.reps ? ` · ${Math.round((100 * (b.perfect || 0)) / b.reps)} % perfectas` : ''}` : 'Aún no tienes ninguna ronda de este ejercicio en este modo');
    }
  }

  private refreshLobby(): void {
    const p = this.lobby, ex = curEx(), xr = this.inXR();
    this.shown(p, 'last', !!this.last);
    this.text(p, 'last', this.last);
    this.text(p, 'start-label', this.last ? 'OTRA RONDA' : 'EMPEZAR');
    this.refreshGoals();
    // el modo: cada uno, la tecla entera de su color (el elegido, a todo color; los demás, con su color en la letra); lo que
    // aún no hay, apagado
    for (const m of Object.keys(MODE_NAMES)) {
      const ok = PLAY_MODES.includes(m), sel = m === settings.mode;
      this.key(p, 'm-' + m, !ok ? KEY.off : sel ? MODE_COL[m] : KEY.bg, !ok ? KEY.offFg : sel ? '#1b1222' : MODE_COL[m]);
    }
    this.key(p, 'm-ses', KEY.off, KEY.offFg);
    this.set(p, 'box-mode', { borderColor: MODE_BOX });
    // los ejercicios del modo: el elegido, en blanco; los que aún no hay, apagados; los de los otros modos, escondidos
    this.text(p, 'ex-title', `Ejercicio · ${MODE_NAMES[settings.mode]}`);
    const how = HOW[ex];
    this.text(p, 'ex-how', how ? how.map((l) => l.replace(/^\d\. /, '')).join(' · ') : ''); // (cómo se hace; la caricatura lo enseña)
    this.set(p, 'ex-how', { color: EX_COL });
    this.set(p, 'box-ex', { borderColor: EX_COL });
    for (const e of ALL_EX) {
      const here = (MODE_EX[settings.mode] ?? []).includes(e), ok = playable(settings.mode, e), sel = e === ex;
      this.shown(p, 'e-' + e, here);
      if (here) this.key(p, 'e-' + e, !ok ? KEY.off : sel ? EX_COL : KEY.bg, !ok ? KEY.offFg : sel ? KEY.dark : KEY.fg);
    }
    // Barras: colocar el aparato con las manos (se recuerda entre sesiones)
    const bars = settings.mode === 'bars', row = settings.exercise === 'row', placedEq = HOOKS.eqPlaced();
    this.shown(p, 'box-eq', bars);
    this.text(p, 'eq-title', row ? 'Aparato · paralelas' : 'Aparato · barra');
    this.text(p, 'eq-placet', placedEq ? (row ? 'Colocar de nuevo' : 'Colocar de nuevo') : row ? 'Colocar paralelas' : 'Colocar barra');
    this.key(p, 'eq-place', placedEq ? KEY.bg : '#3cf0c6', placedEq ? KEY.fg : KEY.dark);
    this.text(p, 'eq-info', placedEq ? (row ? `Paralelas colocadas a ${num('dipH')} cm de altura` : `Barra colocada a ${num('doorH')} cm de altura`) : 'Agárrala con las dos manos por encima de la cabeza: así se coloca y se recuerda');
    // la dificultad: los galones de cada rango, «Al fallo», la ficha de la ronda y lo del ojo
    this.set(p, 'box-diff', { borderColor: DIFF_COL });
    const ri = rankIdx();
    RANKS.forEach((_, i) => this.key(p, 'r-' + i, i === ri ? DIFF_COL : KEY.bg, i === ri ? KEY.dark : KEY.fg));
    this.shown(p, 'fail', fieldVisible(FIELD.toFail));
    this.key(p, 'fail', num('toFail') ? DIFF_COL : KEY.bg, num('toFail') ? KEY.dark : KEY.fg);
    this.text(p, 'round-info', roundInfo().replace(EX_SHORT[settings.exercise] || EX_NAMES[settings.exercise], EX_SHORT[ex]));
    const eye = eyeFields();
    ROWS_LOBBY.forEach((r, i) => this.fillRow(p, r, eye[i] ?? null));
    this.shown(p, 'lobby-note', this.noteT > 0);
    // en el ordenador: «Entrar en VR» y cómo se juega con el teclado; en las gafas, Salir
    this.shown(p, 'xr-button', !xr && this.vrOk);
    this.shown(p, 'desk-hint', !xr);
    this.shown(p, 'exit-button', xr);
  }

  // ---------------------------------------------------------------- Opciones

  private wireOptions(): void {
    const p = this.opts;
    for (let i = 0; i < 4; i++) this.on(p, 'sh' + i, () => this.shortcuts()[i]?.[1]());
    for (const t of TABS)
      this.on(p, 't-' + t.k, () => {
        this.tab = t.k;
        this.page = 0;
        this.hideHint();
      });
    for (let i = 0; i < N_SUB; i++)
      this.on(p, 's' + i, () => {
        if (this.tab === 'prog') {
          const k = PROG_SUBS[i]?.[0];
          if (k) {
            this.sub = k;
            if (k === 'camp') this.pickMode(); // (la campaña es del modo y el ejercicio que juegas: aquí, Combate)
          }
          return;
        }
        const g = settingsGroups()[i];
        if (g) {
          this.group = g;
          this.page = 0;
          this.hideHint();
        }
      });
    // la campaña (Progreso → Campaña): elegir un nivel abierto, cambiar de región y jugar el elegido
    for (let i = 0; i < 5; i++) this.on(p, 'pc' + i, () => this.campPick(i));
    this.on(p, 'pc-prev', () => this.campMove(-1));
    this.on(p, 'pc-next', () => this.campMove(1));
    this.on(p, 'pc-play', () => {
      this.pickMode();
      HOOKS.campPlay(this.campView().sel);
    });
    // los colores que se desbloquean (Progreso → Nivel): al tocar uno que ya tienes, te lo pones
    for (const k of ['hands', 'bolt'] as LookKey[])
      LOOKS[k].opts.forEach((o, i) => this.on(p, `lk-${k}-${i}`, () => setLook(k, o[0])));
    this.on(p, 'pg-prev', () => (this.page = Math.max(0, this.page - 1)));
    this.on(p, 'pg-next', () => this.page++);
    this.on(p, 'o-back', () => this.show('lobby'));
    // las fichas de los rivales: al tocar una, sale o deja de salir (Ajustes → Enemigos → De las compuertas)
    for (const [k] of FOE_GATE) this.on(p, 'c-' + k, () => fieldPick(FIELD.foesGate, k));
    for (const [k] of FOE_FLY) this.on(p, 'c-' + k, () => fieldPick(FIELD.foesFly, k));
    for (const r of ROWS_OPT) this.wireRow(p, r);
  }

  private optRows(): { rows: Row[]; note: string } {
    if (this.tab === 'foes') {
      const rows: Row[] = [FIELD.foeKind, ...groupFields('armas')].filter((f) => fieldHere(f));
      return { rows, note: 'Toca una ficha para que salga o no · Resiste: los disparos que aguanta · Fuerza: las vidas que te quita' };
    }
    if (this.tab === 'prog') return { rows: [], note: '' };
    if (this.tab === 'sound') return { rows: groupFields('sonido'), note: 'La música con Spotify (se conecta en la página) y el ritmo, en el botón de arriba' };
    if (this.tab === 'scene') return { rows: ['quality', ...groupFields('entorno')], note: this.world.renderer.xr.isPresenting ? 'La nitidez nueva se aplica al volver a entrar en VR' : 'La nitidez se aplica al entrar en VR' };
    const groups = settingsGroups();
    if (!groups.includes(this.group)) this.group = groups[0] ?? 'partida';
    return { rows: groupFields(this.group), note: this.group === 'ejercicio' ? BODY_NOTE : '' };
  }

  /** Las pantallas que cuelgan de cada pestaña (música, pasar datos, sincronizar…): su botón y qué abre; al volver, la misma pestaña. */
  private shortcuts(): [string, () => void][] {
    const back = (): void => {
      HOOKS.closeScreen();
      this.show('options');
    };
    if (this.tab === 'sound') return [['Música y ritmo', () => musicScreen(back)]];
    if (this.tab === 'set')
      return [
        ['A otro aparato', () => xferScreen(back)],
        ['Sincronización', () => syncScreen(back)],
      ];
    return [];
  }

  private refreshOptions(): void {
    const p = this.opts, t = TABS.find((x) => x.k === this.tab)!;
    const sc = this.shortcuts();
    this.shown(p, 'shortcuts', sc.length > 0);
    for (let i = 0; i < 4; i++) {
      this.shown(p, 'sh' + i, !!sc[i]);
      if (sc[i]) this.text(p, `sh${i}t`, sc[i][0]);
    }
    this.set(p, 'root', { borderColor: t.col });
    this.set(p, 'o-title', { color: t.col });
    for (const x of TABS) {
      this.text(p, `t-${x.k}t`, x.k === 'foes' && !isCombat() ? 'Armas' : x.label);
      this.set(p, 't-' + x.k, { backgroundColor: x.k === this.tab ? x.col : KEY.bg, borderColor: x.col });
      this.set(p, `t-${x.k}t`, { color: x.k === this.tab ? KEY.dark : KEY.fg });
    }
    // en Ajustes, una pestaña por grupo; en Progreso, Nivel, Misiones (con las que te quedan) y Semana
    const left = this.tab === 'prog' ? career().misLeft() : 0;
    const subs: [string, string][] = this.tab === 'set' ? settingsGroups().map((g) => [g, groupName(g)]) : this.tab === 'prog' ? PROG_SUBS.map(([k, l]) => [k, k === 'mis' && left ? `${l} (${left})` : l]) : [];
    const cur = this.tab === 'prog' ? this.sub : this.group, subCol = this.tab === 'prog' ? '#ff4fa3' : '#ffd166';
    this.shown(p, 'subtabs', subs.length > 0);
    for (let i = 0; i < N_SUB; i++) {
      const g = subs[i];
      this.shown(p, 's' + i, !!g);
      if (!g) continue;
      this.text(p, `s${i}t`, g[1]);
      this.key(p, 's' + i, g[0] === cur ? subCol : KEY.bg, g[0] === cur ? KEY.dark : KEY.fg);
    }
    this.shown(p, 'prog', this.tab === 'prog');
    this.shown(p, 'obody', this.tab !== 'prog');
    if (this.tab === 'prog') this.refreshProg();
    // las fichas de los rivales (en Rivales y armas): su retrato, su nombre, su resistencia y su fuerza; los elegidos, con
    // el borde de su color; los que aún no están (PR 8b), apagados
    const cards = this.tab === 'foes' && fieldVisible(FIELD.foesGate), chosen = foeList('foesGate');
    this.shown(p, 'cards', cards);
    if (cards)
      for (const [k] of FOE_GATE) {
        const on = chosen.includes(k), ok = foeReady(k), f = devFoe('g:' + k);
        this.set(p, 'c-' + k, { borderColor: on ? '#ff8a3d' : KEY.bg, backgroundColor: on ? '#2b2130' : '#1b2030' });
        this.set(p, `c-${k}n`, { color: ok ? KEY.fg : KEY.offFg });
        this.text(p, `c-${k}s`, ok ? `Resiste ${f.hp} · Fuerza ${f.str}` : 'Por ahora, no');
      }
    // los voladores (los drones y los avispones eran geométricos: por ahora no; el dragón sale de jefe)
    const fcards = this.tab === 'foes' && fieldVisible(FIELD.foesFly), fchosen = foeList('foesFly');
    this.shown(p, 'fcards', fcards);
    this.shown(p, 'fcards-t', fcards);
    if (fcards)
      for (const [k] of FOE_FLY) {
        const on = fchosen.includes(k), ok = foeReady(k), f = devFoe('f:' + k);
        this.set(p, 'c-' + k, { borderColor: on ? '#3cf0c6' : KEY.bg, backgroundColor: on ? '#1e2b30' : '#1b2030' });
        this.set(p, `c-${k}n`, { color: ok ? KEY.fg : KEY.offFg });
        this.text(p, `c-${k}s`, ok ? `Resiste ${f.hp} · Fuerza ${f.str}` : 'Por ahora, no');
      }
    const { rows, note } = this.optRows(), per = ROWS_OPT.length, pages = Math.max(1, Math.ceil(rows.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.shown(p, 'o-note', !!note);
    this.text(p, 'o-note', note);
    ROWS_OPT.forEach((r, i) => this.fillRow(p, r, rows[this.page * per + i] ?? null));
    this.shown(p, 'pager', pages > 1);
    this.text(p, 'pg-label', `${this.page + 1} de ${pages}`);
  }

  // ---------------------------------------------------------------- una fila de ajuste

  private wireRow(p: UIKitMLAsset | null, r: string): void {
    this.on(p, r + '-m', () => this.rowStep(r, -1));
    this.on(p, r + '-p', () => this.rowStep(r, 1));
    for (let i = 0; i < N_OPTS; i++) this.on(p, `${r}-o${i}`, () => this.rowPick(r, i));
    this.on(p, r + '-h', () => this.showHint(r));
  }

  private rowView(row: Row): FieldView | null {
    if (row === 'quality')
      return { key: 'quality', label: 'Nitidez en las gafas', hint: 'La resolución con que pintan las gafas: Alta (×1,4, de serie) se ve nítida; Máxima pide más a la gráfica. Se aplica al entrar en VR.', kind: 'opts', value: QUALITY[this.quality].label, canDown: false, canUp: false, opts: QUALITY.map((q, i) => ({ v: String(i), label: q.label, on: i === this.quality })) };
    return row ? fieldView(row) : null;
  }

  private fillRow(p: UIKitMLAsset | null, r: string, row: Row): void {
    this.rows[r] = row;
    const v = this.rowView(row);
    this.shown(p, r, !!v);
    if (!v) return;
    this.text(p, r + '-l', v.label);
    const step = v.kind === 'step';
    for (const id of [r + '-m', r + '-v', r + '-p']) this.shown(p, id, step);
    if (step) {
      this.text(p, r + '-v', v.value);
      this.set(p, r + '-m', { backgroundColor: v.canDown ? '#3a4152' : KEY.off });
      this.set(p, r + '-p', { backgroundColor: v.canUp ? '#3a4152' : KEY.off });
    }
    for (let i = 0; i < N_OPTS; i++) {
      const o = v.opts[i];
      this.shown(p, `${r}-o${i}`, !!o);
      if (!o) continue;
      this.text(p, `${r}-o${i}t`, o.label);
      const c = opt(o.on);
      this.key(p, `${r}-o${i}`, c.bg, c.fg);
    }
    this.shown(p, r + '-h', !!v.hint);
  }

  private rowStep(r: string, dir: number): void {
    const row = this.rows[r];
    if (row && row !== 'quality') fieldStep(row, dir);
  }

  private rowPick(r: string, i: number): void {
    const row = this.rows[r], v = this.rowView(row);
    const o = v?.opts[i];
    if (!o) return;
    if (row === 'quality') {
      this.quality = +o.v;
      try {
        localStorage.setItem(QUALITY_KEY, o.v);
        localStorage.removeItem('rx-quality');
      } catch {
        /* */
      }
      this.applyQuality();
    } else if (row) fieldPick(row, o.v);
  }

  // la nitidez: se pide al entrar en las gafas (dentro, cambiarla pide salir y volver a entrar)
  private applyQuality(): void {
    const q = QUALITY[this.quality], xr = this.world.renderer.xr;
    if (!xr.isPresenting) xr.setFramebufferScaleFactor(q.scale);
    xr.setFoveation(q.foveation);
  }

  // ---------------------------------------------------------------- la tecla «?»

  // la explicación, al lado del menú (a su derecha), unos segundos; otra vez la misma tecla, la quita
  private showHint(r: string): void {
    const v = this.rowView(this.rows[r]), H = this.eHint?.object3D, M = (this.view === 'options' ? this.eOpts : this.eLobby)?.object3D;
    if (!v?.hint || !H || !M) return;
    if (this.hintKey === v.key && this.hintT > 0) return this.hideHint();
    this.hintKey = v.key;
    this.hintT = HINT_SECS;
    this.text(this.hint, 'h-title', v.label);
    this.text(this.hint, 'h-text', v.hint);
    H.quaternion.copy(M.quaternion);
    H.position.copy(M.position).add(this.v.set(0.66, -0.2, 0.02).applyQuaternion(M.quaternion)); // (a la derecha, cerca de arriba)
    if (this.hint) this.hint.visible = true;
    H.visible = true;
  }
  private hideHint(): void {
    this.hintT = 0;
    this.hintKey = '';
    const H = this.eHint?.object3D;
    if (H) H.visible = false;
    if (this.hint) this.hint.visible = false;
  }

  // ---------------------------------------------------------------- cada fotograma

  private refresh(): void {
    if (this.view === 'lobby') this.refreshLobby();
    else if (this.view === 'options') this.refreshOptions();
  }

  // ---------------------------------------------------------------- el resumen, la pausa y la muñeca

  // El resumen (RepArena: endMenu, opción A), delante de ti como los menús
  private showSummary(S: Summary): void {
    const p = this.sum;
    this.text(p, 's-title', S.title);
    this.set(p, 's-title', { color: S.title === 'DERROTA' ? '#ff6b8b' : '#ffd166' });
    this.text(p, 's-where', `${S.sub} · ${S.where}`);
    this.text(p, 's-big', String(S.got));
    this.text(p, 's-unit', S.unit);
    const MEDAL: Record<string, [string, string]> = { bronce: ['#c9874a', 'Bronce'], plata: ['#c9d2de', 'Plata'], oro: ['#ffd166', 'Oro'] };
    const m = S.medal ? MEDAL[S.medal] : null;
    this.set(p, 's-medal', { backgroundColor: m ? m[0] : '#241c33', display: m ? 'flex' : 'none' });
    this.text(p, 's-medalt', m ? m[1] : '');
    this.text(p, 's-pct', `${S.pct} %`);
    S.tiles.forEach(([v], i) => this.text(p, 's-t' + i, v));
    this.sumCamp = S.camp;
    this.shown(p, 'camp-btns', !!S.camp);
    this.shown(p, 'camp-menu', !!S.camp);
    this.shown(p, 'again-btns', !S.camp);
    if (S.camp) {
      this.shown(p, 's-next', !!S.camp.next);
      this.text(p, 's-nextt', `NIVEL ${S.camp.next ?? ''}`);
      this.key(p, 's-repeat', S.camp.next ? KEY.bg : '#3cf0c6', S.camp.next ? KEY.fg : '#0d1016');
    }
    this.shown(p, 's-chip', !!S.chip);
    if (S.chip) {
      this.text(p, 's-chipt', S.chip[0]);
      this.set(p, 's-chipt', { color: S.chip[1] });
    }
    this.placed = false; // (delante de ti, donde esté el menú)
    this.show('summary');
  }

  // La pausa (RepArena: openPause y pauseMenu): cómo vas, las mejoras que llevas y los últimos avisos
  private pause(): void {
    if (GAME.phase !== 'playing' || GAME.paused) return;
    GAME.paused = true;
    const p = this.pausep, x = PAUSE_INFO;
    this.text(p, 'p-stats', `${GAME.reps} repeticiones · ${GAME.kills} enemigos · ${GAME.score} puntos`);
    this.text(p, 'p-perks', x.perks);
    this.shown(p, 'p-perks', !!x.perks);
    this.text(p, 'p-warn', x.warns);
    this.shown(p, 'p-warn', !!x.warns);
    this.placed = false;
    SND.click();
    this.show('pause');
  }

  // El botón MENÚ (o X/Y del mando izquierdo): en la ronda, la pausa; fuera, el menú delante (RepArena: onWatch)
  private onWatch(): void {
    if (HOOKS.placing()) {
      HOOKS.cancelPlace(); // (colocando el aparato: la muñeca lo deja)
      SND.tick();
      return;
    }
    if (GAME.phase === 'playing' && !GAME.paused && this.view === 'none') {
      this.pause();
      return;
    }
    this.placed = false;
    if (this.view === 'none') this.show(GAME.phase === 'playing' ? 'pause' : 'lobby');
    else this.place();
    SND.tick();
  }

  // ¿Te miras la muñeca izquierda? (el dorso o la palma hacia la cara; con mando, levantado delante) (RepArena: wristLook)
  private wristLook(): boolean {
    const h = hands.left;
    if (!h.ok) return false;
    const d = h.wrist.distanceTo(head.p);
    if (h.virt || !h.J.length || !h.J[0].ok) return d < 0.65 && h.wrist.y < head.p.y - 0.1;
    this.wu.set(0, 1, 0).applyQuaternion(h.wristQ);
    this.wh.copy(head.p).sub(h.wrist).normalize();
    return Math.abs(this.wu.dot(this.wh)) > 0.72 && d < 0.7;
  }

  private stepWrist(dt: number): void {
    const h = hands.left, inXR = this.inXR();
    // con mandos, X/Y hacen de botón MENÚ
    if (h.btnMenu && !this.btnPrev) this.onWatch();
    this.btnPrev = h.btnMenu;
    const look = inXR && this.wristLook(), menuUp = this.view !== 'none';
    this.wristT = look ? this.wristT + dt : 0;
    const show = look && (!menuUp || this.wristT > 1);
    if (show !== this.wristOn) {
      this.wristOn = show;
      this.setOn(this.wrist, this.eWrist, show);
    }
    const o = this.eWrist?.object3D;
    if (show && o) {
      this.wu.set(0, 1, 0).applyQuaternion(h.wristQ);
      this.wh.copy(head.p).sub(h.wrist).normalize();
      o.position.copy(h.wrist).addScaledVector(this.wu, Math.sign(this.wu.dot(this.wh) || 1) * 0.045);
      if (h.virt) o.position.copy(h.wrist).add(this.wh.set(0, 0.08, 0));
      o.lookAt(head.p);
      this.text(this.wrist, 'w-t', HOOKS.placing() ? 'CANCELAR' : GAME.phase === 'playing' ? 'PAUSA' : menuUp ? 'TRAER MENÚ' : 'MENÚ');
    }
    // el menú se recoge con la palma izquierda hacia abajo o con el puño (un momento, para no recogerlo sin querer)
    const closing = inXR && (this.view === 'lobby' || this.view === 'options') && h.ok && !h.virt && (isFist(h) || this.wu.set(0, 1, 0).applyQuaternion(h.wristQ).y > 0.85);
    this.closeT = closing ? this.closeT + dt : 0;
    if (this.closeT > 0.5) {
      this.closeT = 0;
      SND.tick();
      this.show('none');
    }
  }

  update(delta: number): void {
    this.stepWrist(Math.min(delta, 0.1));
    if (this.noteT > 0) {
      this.noteT -= delta;
      if (this.noteT <= 0) this.refresh();
    }
    if (this.hintT > 0) {
      this.hintT -= delta;
      if (this.hintT <= 0 || this.view === 'none') this.hideHint();
    }
    // la columna HOY, a la izquierda del principal, colgando de su borde de arriba como él (se va con él)
    const L = this.eLobby?.object3D, H = this.eHoy?.object3D;
    if (this.view === 'lobby' && L && H) {
      L.updateMatrixWorld();
      H.position.copy(L.localToWorld(this.v.set(-0.66, 0, 0)));
      L.getWorldQuaternion(H.quaternion);
    }
    // en el menú, Enter (en el ordenador) empieza; en plena partida no hay menú
    if (GAME.phase === 'playing' && !GAME.paused && this.view !== 'none' && this.view !== 'pause') this.show('none');
  }
}
