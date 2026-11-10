/**
 * Los menús en VR (RepArena, src/70_game.js: lobbyMenu y optionsMenu; src/60_ui.js: los campos y la tecla «?»), con los
 * paneles de UIKit y la pulsación de IWSDK (con el rayo de la mano o del mando y con el dedo: criterio del usuario, la
 * física de pulsar es la de IWSDK). Tres paneles de la escena, en el mismo sitio:
 *  - el principal (public/ui/lobby.uikitml): EMPEZAR, el modo, los ejercicios y la dificultad, Opciones y Salir;
 *  - Opciones (public/ui/options.uikitml): Rivales y armas, Progreso, Sonido, Entorno y Ajustes, en pestañas, con los
 *    ajustes del esquema;
 *  - la explicación de un ajuste (public/ui/hint.uikitml), al lado del menú, con la tecla «?».
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
import { head } from '../input/hand-model.js';
import { SND, unlockAudio } from '../audio/sound.js';
import { STAND_EX } from '../exercise/standing.js';
import { HOW } from '../exercise/how.js';
import { curEx, eyeFields, fieldHere, fieldPick, fieldStep, fieldView, groupFields, groupName, roundInfo, settingsGroups, type FieldView } from './fields.js';
import { applyFonts } from './fonts.js';

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
const SOON_MODE: Record<string, string> = { arcs: 'Arcos llega con el PR 15', bars: 'Barras llega con el PR 17', touch: 'Toques llega con el PR 16', trek: 'La Travesía llega con el PR 18', ses: 'Las sesiones llegan con el PR 19' };
const SOON_EX = 'Los ejercicios de suelo llegan con el PR 11';
const KEY = { bg: '#2a2f3a', fg: '#e9eef7', off: '#1d212b', offFg: '#5d6577', dark: '#0d1016' };
const ROWS_LOBBY = ['l1', 'l2', 'l3', 'l4'], ROWS_OPT = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9'], N_OPTS = 8, N_SUB = 10;
const HINT_SECS = 9;
// En las gafas: el borde de arriba del menú, 18 cm por debajo de los ojos; a «Distancia del menú» (RepArena: el 75 %)
const TOP_BELOW = 0.18;

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
  private view: 'lobby' | 'options' | 'none' = 'lobby';
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
    for (const p of [this.lobby, this.opts, this.hint]) if (p) applyFonts(p);
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

  private show(v: 'lobby' | 'options' | 'none'): void {
    this.view = v;
    GAME.menu = v;
    this.setOn(this.lobby, this.eLobby, v === 'lobby');
    this.setOn(this.opts, this.eOpts, v === 'options');
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
    const L = this.eLobby?.object3D, O = this.eOpts?.object3D, H = this.eHint?.object3D;
    if (!L || !O) return;
    this.placed = true;
    if (!this.inXR()) {
      L.position.copy(this.home.lobby);
      O.position.copy(this.home.opts);
      H?.position.copy(this.home.hint);
      for (const o of [L, O, H]) o?.rotation.set(0, 0, 0);
      return;
    }
    const f = this.v.set(0, 0, -1).applyQuaternion(head.q).setY(0);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    // (los paneles cuelgan de su borde de arriba: anchor-y: top en su UIKitML; así, por alto que sea el menú, lo de arriba
    // no se aleja ni se sube; inclinado hacia ti, que lo de abajo quede a la vista)
    const d = (0.75 * Math.max(30, num('menuDist') || 85)) / 100, top = head.p.y - TOP_BELOW;
    this.e.set(-Math.atan2(TOP_BELOW + 0.4, d) * 0.6, Math.atan2(-f.x, -f.z), 0);
    for (const o of [L, O]) {
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
    for (const m of Object.keys(MODE_NAMES)) this.on(p, 'm-' + m, () => (m === 'combat' ? this.pickMode() : this.note(SOON_MODE[m])));
    this.on(p, 'm-ses', () => this.note(SOON_MODE.ses));
    for (const ex of MODE_EX.combat) this.on(p, 'e-' + ex, () => (STAND_EX.includes(ex) ? this.pickEx(ex) : this.note(SOON_EX)));
    RANKS.forEach(([v], i) => this.on(p, 'r-' + i, () => setSetting('rank', v)));
    this.on(p, 'fail', () => setSetting('toFail', num('toFail') ? 0 : 1));
    for (const r of ROWS_LOBBY) this.wireRow(p, r);
  }

  // Combate con el ejercicio elegido (si lo guardado en RepArena era otro modo, o uno que aún no hay, la sentadilla)
  private pickMode(): void {
    if (settings.mode !== 'combat') setSetting('mode', 'combat');
    if (!STAND_EX.includes(settings.exercise)) setSetting('exercise', curEx());
  }
  private pickEx(ex: string): void {
    this.pickMode();
    if (settings.exercise !== ex) setSetting('exercise', ex);
    if (import.meta.env.DEV) console.info(`rxdbg ejercicio ${settings.mode} ${settings.exercise}`); // (para probar en el emulador)
  }

  private refreshLobby(): void {
    const p = this.lobby, ex = curEx(), xr = this.inXR();
    this.shown(p, 'last', !!this.last);
    this.text(p, 'last', this.last);
    this.text(p, 'start-label', this.last ? 'OTRA RONDA' : 'EMPEZAR');
    this.shown(p, 'goals', false); // (las metas de hoy, bajo EMPEZAR: llegan con el PR 13)
    // el modo: cada uno, la tecla entera de su color; lo que aún no hay, apagado
    for (const m of Object.keys(MODE_NAMES)) this.key(p, 'm-' + m, m === 'combat' ? MODE_COL[m] : KEY.off, m === 'combat' ? '#1b1222' : KEY.offFg);
    this.key(p, 'm-ses', KEY.off, KEY.offFg);
    this.set(p, 'box-mode', { borderColor: MODE_BOX });
    // los ejercicios de Combate: el elegido, en blanco; los de suelo, apagados
    this.text(p, 'ex-title', `Ejercicio · ${MODE_NAMES.combat}`);
    this.text(p, 'ex-how', HOW[ex].map((l) => l.replace(/^\d\. /, '')).join(' · ')); // (cómo se hace, hasta que llegue la caricatura: PR 12)
    this.set(p, 'ex-how', { color: EX_COL });
    this.set(p, 'box-ex', { borderColor: EX_COL });
    for (const e of MODE_EX.combat) {
      const ok = STAND_EX.includes(e), sel = e === ex;
      this.key(p, 'e-' + e, !ok ? KEY.off : sel ? EX_COL : KEY.bg, !ok ? KEY.offFg : sel ? KEY.dark : KEY.fg);
    }
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
    for (const t of TABS)
      this.on(p, 't-' + t.k, () => {
        this.tab = t.k;
        this.page = 0;
        this.hideHint();
      });
    for (let i = 0; i < N_SUB; i++)
      this.on(p, 's' + i, () => {
        const g = settingsGroups()[i];
        if (g) {
          this.group = g;
          this.page = 0;
          this.hideHint();
        }
      });
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
    if (this.tab === 'prog') return { rows: [], note: 'Tu progreso (nivel, misiones del día, tu semana y tu mejor ronda) llega con el PR 13' };
    if (this.tab === 'sound') return { rows: groupFields('sonido'), note: 'Spotify y el compás de la música llegan con el PR 22' };
    if (this.tab === 'scene') return { rows: ['quality', ...groupFields('entorno')], note: this.world.renderer.xr.isPresenting ? 'La nitidez nueva se aplica al volver a entrar en VR' : 'La nitidez se aplica al entrar en VR' };
    const groups = settingsGroups();
    if (!groups.includes(this.group)) this.group = groups[0] ?? 'partida';
    return { rows: groupFields(this.group), note: this.group === 'ejercicio' ? BODY_NOTE : '' };
  }

  private refreshOptions(): void {
    const p = this.opts, t = TABS.find((x) => x.k === this.tab)!;
    this.set(p, 'root', { borderColor: t.col });
    this.set(p, 'o-title', { color: t.col });
    for (const x of TABS) {
      this.text(p, `t-${x.k}t`, x.k === 'foes' && !isCombat() ? 'Armas' : x.label);
      this.set(p, 't-' + x.k, { backgroundColor: x.k === this.tab ? x.col : KEY.bg, borderColor: x.col });
      this.set(p, `t-${x.k}t`, { color: x.k === this.tab ? KEY.dark : KEY.fg });
    }
    // en Ajustes, una pestaña por grupo
    const groups = this.tab === 'set' ? settingsGroups() : [];
    this.shown(p, 'subtabs', groups.length > 0);
    for (let i = 0; i < N_SUB; i++) {
      const g = groups[i];
      this.shown(p, 's' + i, !!g);
      if (!g) continue;
      this.text(p, `s${i}t`, groupName(g));
      this.key(p, 's' + i, g === this.group ? '#ffd166' : KEY.bg, g === this.group ? KEY.dark : KEY.fg);
    }
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

  update(delta: number): void {
    if (this.noteT > 0) {
      this.noteT -= delta;
      if (this.noteT <= 0) this.refresh();
    }
    if (this.hintT > 0) {
      this.hintT -= delta;
      if (this.hintT <= 0 || this.view === 'none') this.hideHint();
    }
    // en el menú, Enter (en el ordenador) empieza; en plena partida no hay menú
    if (GAME.phase === 'playing' && this.view !== 'none') this.show('none');
  }
}
