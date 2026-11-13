/**
 * Los menús de RepArena (src/70_game.js: lobbyMenu, optionsMenu, foesRows, armsRows, lobbyExRows, lobbyDiffRows,
 * drawRoundInfo, soundRows, sceneRows, settingsRows, pauseMenu, endMenu; src/73_career.js: progRows, goalTiles, goalSide;
 * src/79_perks.js: perkMenu), portados con los datos de RepArena XR (opción B del usuario, PR 31). Cada uno es una lista de
 * filas que pinta openMenu (src/ui/ra/menu-core.ts).
 */
import { Group } from '@iwsdk/core';
import { BODY_NOTE, EX_NAMES, EX_SHORT, MODE_EX, MODE_NAMES, RANKS } from '../../core/catalog.js';
import { FIELD, SCHEMA } from '../../core/schema.js';
import { fieldShown, fieldVisible, menuFull, nLives, nWaves, rankIdx, rankName, setSetting, speedKey, waveReps, hangSecs, devEye } from '../../core/settings.js';
import { num, settings } from '../../core/values.js';
import { GAME, HOOKS } from '../../core/state.js';
import { foeList, isCombat } from '../../core/rules.js';
import { devFoe } from '../../combat/foes.js';
import { DEV, devTap } from '../../core/dev.js';
import { CAMP_N, CAMP_REG, campId, LOOKS, MIS, PROG_COL, SHIELD_COL, SHIELD_MAX, CHEST_XP, MIS_XP, type LookKey } from '../../core/career.js';
import { career, history, setLook } from '../../combat/career-hub.js';
import type { Summary } from '../../core/run.js';
import { PLAY_MODES, playable, playableEx } from '../../core/playable.js';
import { settingsGroups, groupName, summaryText } from '../fields.js';
import { uiPrefs, uiSave } from '../../page/dom.js';
import { resetGroup } from '../../page/form.js';
import { musicScreen, spWideRows, tempoRows } from '../screens/music-screens.js';
import { syncScreen, xferScreen } from '../screens/xfer-screens.js';
import { FB, fitFont, rr } from '../canvas-kit.js';
import { drawCampMap, drawGoal, drawHoy, drawMissions, drawStreakTile, drawWeek, drawXP } from './career-draw.js';
import { drawSummary, SUM_CHIP, SUM_H } from './summary-draw.js';
import { drawRank, MC, makePanel, type FoeCard } from './kit.js';
import { GAP, hideMenu, menuOccluder, MW, openMenu, RO, UI, type Menu, type Row, type RowItem } from './menu-core.js';
import { CARD_H } from './kit.js';

/** Lo que estos menús necesitan del juego (lo pone el sistema de los menús). */
export const MENU_ENV = {
  /** Salir de las gafas (o, en el ordenador, quitar la prueba). */
  exit: (): void => {},
  /** Entrar en VR (en el ordenador, si el navegador puede). */
  enterVR: null as null | (() => void),
  /** La nitidez en las gafas (propia de RepArena XR): las opciones, la elegida y cómo cambiarla. */
  quality: { labels: [] as string[], cur: 0, set: (_i: number): void => {}, note: '' },
  /** Lo que la pausa cuenta además (las mejoras que llevas y los últimos avisos). */
  pauseInfo: { perks: '', warns: '' },
};

// Los colores de RepArena (MODE_COL, SES_COL, DIFF_COL, EX_COL)
const MODE_COL: Record<string, string> = { combat: '#ff8a3d', arcs: '#ff4fa3', bars: '#ffd166', touch: '#3cf0c6', trek: '#8fdc5a' };
const SES_COL = '#b9a6ff', DIFF_COL = '#5ab8ff', EX_COL = '#e4e8f2', MODE_BOX = '#8c86b4';
const SOON: Record<string, string> = { trek: 'La Travesía llega más adelante', ses: 'Las sesiones llegan más adelante' };
const exName = (x: string): string => EX_SHORT[x] || EX_NAMES[x] || x;

/** Lo que se recuerda de los menús (RepArena: LOBBY y PROG, en reparena3-ui). */
const LOBBY = { opt: String(uiPrefs().lobbyOpt || 'foes'), foe: '', tab: String(uiPrefs().tab || 'partida'), resetArm: '' };
const PROG = { tab: String(uiPrefs().prog || 'lvl'), lv: 0, reg: -1 };

const say = (t: string, col = '#ffd166', s = 2): void => HOOKS.say(t, col, s, true);

// ---------------------------------------------------------------- el principal

/** El modo y el ejercicio: los que se pueden jugar (si lo guardado en RepArena aún no está aquí, el primero que haya). */
function pickMode(m: string): void {
  if (!PLAY_MODES.includes(m)) {
    say(SOON[m] ?? 'Aún no está');
    return;
  }
  if (settings.mode !== m) setSetting('mode', m);
  const ex = playableEx(m, settings.exercise);
  if (ex !== settings.exercise) setSetting('exercise', ex);
}

// Los ejercicios del modo, en rejilla (6 por fila si son muchos), y lo que le toca: la barra o las paralelas en Barras
function lobbyExRows(again: () => void): Row[] {
  const list = (MODE_EX[settings.mode] ?? []).slice(), per = list.length > 15 ? 6 : list.length > 4 ? 5 : 4, rows: Row[] = [];
  for (let i = 0; i < list.length; i += per) {
    const items: RowItem[] = list.slice(i, i + per).map((x) => ({
      label: exName(x),
      style: !playable(settings.mode, x) ? 'ghost' : x === settings.exercise ? 'selected' : 'normal',
      tint: EX_COL,
      font: 0.42,
      onPress: () => {
        if (!playable(settings.mode, x)) return say('Este ejercicio aún no está');
        setSetting('exercise', x);
        again();
      },
    }));
    while (items.length < per && list.length > per) items.push({ sep: true, blank: true }); // (la última fila, con las teclas del mismo ancho)
    rows.push({ t: 'btns', h: 0.05, items });
  }
  if (settings.mode === 'bars') {
    const placed = HOOKS.eqPlaced(), row = settings.exercise === 'row', n = row ? 'las paralelas' : 'la barra';
    rows.push(
      { t: 'btns', items: [{ label: placed ? `Colocar ${n} de nuevo` : `Colocar ${n}`, style: placed ? 'normal' : 'primary', onPress: () => HOOKS.placeEq() }] },
      { t: 'text', text: !placed ? `Primero coloca ${n}: pulsa Colocar` : row ? `Paralelas colocadas a ${num('dipH')} cm de altura` : `Barra colocada a ${num('doorH')} cm de altura`, color: !placed ? '#ffd166' : '#a49fc8' },
    );
  }
  return rows;
}

// Cómo es la ronda, en una ficha: el galón y el rango a la izquierda; a la derecha, oleadas, repeticiones, vidas y descanso
function drawRoundInfo(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rr(c, x, y, w, h, h * 0.3);
  c.fillStyle = 'rgba(90,184,255,0.08)';
  c.fill();
  drawRank(c, rankIdx(), x + h * 0.55, y + h / 2, h * 0.62, '#eeeaff');
  const t1 = `${rankName()} · ${exName(settings.exercise)}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = DIFF_COL;
  fitFont(c, t1, w * 0.3, Math.round(h * 0.42), '700 %px ' + FB);
  c.fillText(t1, x + h * 1.05, y + h / 2);
  const hang = settings.exercise === 'hang', chips: [string, string][] = [
    [nWaves() ? `${nWaves()} oleadas` : num('toFail') ? 'al fallo' : 'sin fin', '#ffd166'],
    [hang ? `${hangSecs(0)} s (+${num('hangInc')})` : `${waveReps(0)} reps (+${num('repsInc')})`, '#3cf0c6'],
    [nLives() ? `${nLives()} vidas` : 'vidas sin límite', '#ff4fa3'],
    [`${num('rest')} s descanso`, '#a68bff'],
  ];
  const x0 = x + w * 0.4, cw = (w * 0.6 - 10) / chips.length;
  chips.forEach(([t, col], k) => {
    const cx = x0 + k * cw;
    rr(c, cx + 4, y + h * 0.16, cw - 8, h * 0.68, h * 0.3);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = col;
    c.stroke();
    c.textAlign = 'center';
    c.fillStyle = col;
    fitFont(c, t, cw - 20, Math.round(h * 0.36), '600 %px ' + FB);
    c.fillText(t, cx + cw / 2, y + h / 2 + 1);
  });
}

// La dificultad: los galones del rango, «Al fallo», cómo es la ronda (en una ficha) y lo que el desarrollador ha marcado
function lobbyDiffRows(again: () => void): Row[] {
  const fail = fieldVisible(FIELD.toFail), rows: Row[] = [
    {
      t: 'btns',
      h: 0.052,
      items: [
        ...RANKS.map(([v], i) => ({ label: '', badge: i, style: i === rankIdx() ? 'selected' : 'normal', tint: DIFF_COL, onPress: () => (setSetting('rank', v), again()) })),
        ...(fail ? [{ sep: true, flex: 0.25 }, { label: 'Al fallo', flex: 1.7, font: 0.42, style: num('toFail') ? 'selected' : 'normal', tint: DIFF_COL, onPress: () => (setSetting('toFail', num('toFail') ? 0 : 1), again()) }] : []),
      ],
    },
    { t: 'canvas', h: 0.05, text: `${rankName()} en ${exName(settings.exercise)} · ${summaryText()}`, draw: drawRoundInfo },
  ];
  const eyeF = menuFull() ? [speedKey() ?? '', settings.mode === 'arcs' ? 'arcMax' : settings.mode === 'bars' && settings.exercise === 'hang' ? 'hangInc' : 'repsWave'] : devEye();
  for (const key of eyeF) if (FIELD[key] && fieldVisible(FIELD[key]) && key !== 'toFail') rows.push({ t: 'field', key, after: FIELD[key].relayout ? again : undefined });
  return rows;
}

// Las metas de hoy, bajo EMPEZAR: tres teclas con sus metas y una con la racha (al tocarlas, Progreso → Misiones)
function goalTiles(): RowItem[] {
  const M = career().misToday(), go = (): void => progressOpen('mis');
  return [
    ...M.list.map((m) => ({ label: `${m.done ? 'Cumplida: ' : 'Meta: '}${MIS[m.t].txt(m)}`, flex: 1.15, onPress: go, paint: (c: CanvasRenderingContext2D, W: number, H: number, tc: string) => drawGoal(c, m, H * 0.14, H * 0.1, W - H * 0.28, H * 0.8, tc) })),
    { label: 'Racha', onPress: go, paint: (c: CanvasRenderingContext2D, W: number, H: number, tc: string) => drawStreakTile(c, W, H, tc) },
  ];
}

// La columna «HOY», a la izquierda del menú principal (se va con él)
const HOY_W = 0.36, HOY_H = 0.52;
function goalSide(m: Menu): void {
  const p = makePanel(HOY_W, HOY_H, 512, { hd: 1.5 });
  drawHoy(p.ctx, p.W, p.H, false);
  p.tex.needsUpdate = true;
  p.mesh.position.set(-MW / 2 - 0.03 - HOY_W / 2, m.H / 2 - HOY_H / 2, 0);
  p.mesh.renderOrder = RO.menu;
  (m.group as Group).add(p.mesh);
  menuOccluder(p.mesh, HOY_W, HOY_H);
}

/** El menú principal, simple (lo demás, en Opciones): EMPEZAR grande, las metas de hoy, el modo, el ejercicio, la dificultad
 * y, abajo, Opciones y Salir. */
export function lobbyMenu(last = ''): void {
  const again = (): void => lobbyMenu(last);
  const bars = settings.mode === 'bars', start = (): void => (bars && !HOOKS.eqPlaced() ? HOOKS.placeEq(`Antes de empezar, coloca ${settings.exercise === 'row' ? 'las paralelas' : 'la barra'}`) : HOOKS.startRound());
  const modes: RowItem[] = [
    ...Object.entries(MODE_NAMES).map(([v, l]) => ({ label: l, style: PLAY_MODES.includes(v) ? (v === settings.mode ? 'selected' : 'normal') : 'ghost', fill: PLAY_MODES.includes(v) ? MODE_COL[v] : undefined, font: 0.48, onPress: () => (pickMode(v), again()) })),
    { sep: true, flex: 0.2 },
    { label: 'Sesiones', style: 'ghost', font: 0.48, onPress: () => say(SOON.ses) },
  ];
  const box = (title: string, color: string, rows: Row[]): Row[] => (rows.length ? [{ t: 'cols', titles: [title], colors: [color], cols: [rows] }] : []);
  const exR = lobbyExRows(again).filter((r) => r.t !== 'field' || fieldVisible(FIELD[r.key]));
  const vr = MENU_ENV.enterVR;
  const rows: Row[] = [
    { t: 'title', text: '', big: { label: last ? 'OTRA RONDA' : 'EMPEZAR', onPress: start } },
    ...(last ? [{ t: 'text' as const, text: last, color: '#a49fc8' }] : []),
    { t: 'btns', h: 0.1, items: goalTiles() },
    ...box('Modo', MODE_BOX, [{ t: 'btns', h: 0.06, items: modes }]),
    ...box(`Ejercicio · ${MODE_NAMES[settings.mode]}`, EX_COL, exR),
    ...box('Dificultad', DIFF_COL, lobbyDiffRows(again).filter((r) => r.t !== 'field' || fieldVisible(FIELD[r.key]))),
    ...spWideRows(), // (Spotify: lo que suena y sus mandos, si está conectado; RepArena: spWideRows)
    { t: 'btns', h: 0.052, items: [{ label: 'Opciones  ▸', flex: 3, accent: MC.set, onPress: () => optionsMenu() }, vr ? { label: 'Entrar en VR', style: 'primary', onPress: vr } : { label: 'Salir', style: 'danger', onPress: () => MENU_ENV.exit() }] },
  ];
  const m = openMenu(rows, {}, 'lobby');
  m.rebuild = again;
  goalSide(m); // (a la izquierda, la columna «HOY»)
}

// ---------------------------------------------------------------- Opciones

const FOE_PFX: Record<string, string> = { foesGate: 'g:', foesHatch: 'h:', foesFly: 'f:' }, FOE_CARD_COLS = 6;
function foeCardRows(key: string): Row[] {
  const items: FoeCard[] = (FIELD[key].opts ?? []).map(([v, lab]) => {
    const d = devFoe(FOE_PFX[key] + v);
    return { v: String(v), name: String(lab).replace(' (jefe)', ''), pic: String(v), hp: d.hp, str: d.str, boss: v === 'dragon' };
  });
  return [{ t: 'cards', key, cols: FOE_CARD_COLS, items, h: Math.ceil(items.length / FOE_CARD_COLS) * (CARD_H + GAP) - GAP }];
}
const armsAny = (): boolean => SCHEMA.some((f) => f.g === 'armas' && fieldVisible(f));
const armsRows = (again: () => void): Row[] => SCHEMA.filter((f) => f.g === 'armas' && fieldShown(f)).map((f) => ({ t: 'field' as const, key: f.key, after: f.relayout ? again : undefined }));
// Rivales: cada grupo (de las compuertas, de las trampillas, voladores) en su pestaña, con una ficha por enemigo; con
// arms, las armas en otra pestaña
function foesRows(again: () => void, arms = false): Row[] {
  const tabs: [string, string][] = ['foesGate', 'foesHatch', 'foesFly'].filter((k) => FIELD[k] && fieldVisible(FIELD[k])).map((k) => [k, FIELD[k].short || FIELD[k].label]), ar = arms ? armsRows(again) : [];
  if (ar.length) tabs.push(['arms', 'Armas']);
  if (!tabs.some((t) => t[0] === LOBBY.foe)) LOBBY.foe = tabs.length ? tabs[0][0] : '';
  const rows: Row[] = [{ t: 'field', key: 'foeKind', after: again }];
  if (tabs.length > 1) rows.push({ t: 'tabs', items: tabs.map(([k, l]) => ({ label: l, on: k === LOBBY.foe, onPress: () => ((LOBBY.foe = k), again()) })) });
  if (LOBBY.foe === 'arms') rows.push(...ar);
  else if (LOBBY.foe) rows.push(...foeCardRows(LOBBY.foe), { t: 'text', text: 'Escudo: su resistencia (disparos que aguanta) · Rayo: su fuerza (vidas que te quita)', color: '#a49fc8' });
  void foeList;
  return rows;
}

// La parte Progreso: Nivel (con los colores que se desbloquean), Misiones, Campaña y Semana
function progRows(again: () => void): Row[] {
  const c = career(), left = c.misToday().list.filter((m) => !m.done).length, rows: Row[] = [];
  const tabs: [string, string][] = [['lvl', 'Nivel'], ['mis', 'Misiones'], ['camp', 'Campaña'], ['week', 'Semana']];
  rows.push({ t: 'tabs', items: tabs.map(([k, l]) => ({ label: k === 'mis' && left ? `${l} (${left})` : l, on: k === PROG.tab, onPress: () => ((PROG.tab = k), uiSave('prog', k), again()) })) });
  if (PROG.tab === 'lvl') {
    const L = c.lvlOf();
    rows.push({ t: 'canvas', h: 0.1, text: `Nivel ${L.n} · ${c.titleOf(L.n)} · ${L.into} / ${L.need} XP`, draw: (cc, x, y, w, h) => drawXP(cc, x, y, w, h) });
    for (const k of Object.keys(LOOKS) as LookKey[]) {
      const O = LOOKS[k].opts, per = Math.ceil(O.length / Math.ceil(O.length / 3)); // (de tres en tres como mucho: si no, no se leen)
      for (let i = 0; i < O.length; i += per)
        rows.push({ t: 'choice', label: i ? '' : LOOKS[k].name, value: c.lookOpt(k)[0], opts: O.slice(i, i + per).map((o) => [o[0], c.lookOwn(k, o[0]) ? o[1] : `Nivel ${o[2]}`, !c.lookOwn(k, o[0])]), onPick: (v) => (setLook(k, String(v)), again()) });
    }
    rows.push({ t: 'text', text: 'Cada repetición da experiencia (las perfectas, el doble). Los colores solo se ven', color: '#a49fc8' });
  } else if (PROG.tab === 'mis') {
    rows.push({ t: 'canvas', h: 0.24, text: c.misToday().list.map((m) => MIS[m.t].txt(m) + (m.done ? ' (cumplida)' : '')).join(' · '), draw: drawMissions });
    rows.push({ t: 'text', text: `Tres nuevas cada día: +${MIS_XP} XP cada una. Con las tres se abre el cofre: +${CHEST_XP} XP, un escudo de racha y, si queda alguno, un color`, color: '#a49fc8' });
    rows.push({ t: 'text', text: `Escudos de racha: ${c.cr.shield} de ${SHIELD_MAX}. Si un día no entrenas, se gasta uno solo y tu racha sigue`, color: SHIELD_COL });
  } else if (PROG.tab === 'camp') {
    const id = campId(settings.mode, settings.exercise), C = c.campOf(id), sel = Math.max(1, Math.min(CAMP_N, PROG.lv || C.at)), reg = PROG.reg >= 0 ? PROG.reg : Math.floor((sel - 1) / 5);
    rows.push({ t: 'canvas', h: 0.2, text: `Campaña de ${EX_NAMES[settings.exercise]} en ${MODE_NAMES[settings.mode]} · ${CAMP_REG[reg][0]}`, draw: (cc, x, y, w, h) => drawCampMap(cc, x, y, w, h, reg, sel) });
    rows.push({
      t: 'btns',
      items: [0, 1, 2, 3, 4].map((i) => {
        const lv = reg * 5 + i + 1, open = lv <= C.at;
        return { label: i === 4 ? `${lv} Jefe` : String(lv), style: !open ? 'ghost' : lv === sel ? 'selected' : 'normal', onPress: () => open && ((PROG.lv = lv), (PROG.reg = reg), again()) };
      }),
    });
    rows.push({
      t: 'btns',
      items: [
        { label: '◀ Región', style: reg > 0 ? 'normal' : 'ghost', onPress: () => reg > 0 && ((PROG.reg = reg - 1), again()) },
        { label: `Jugar nivel ${sel}`, style: 'primary', flex: 2, onPress: () => HOOKS.campPlay(sel) },
        { label: 'Región ▶', style: reg < CAMP_REG.length - 1 ? 'normal' : 'ghost', onPress: () => reg < CAMP_REG.length - 1 && ((PROG.reg = reg + 1), again()) },
      ],
    });
    const L = c.campLv(sel);
    rows.push({ t: 'text', text: `Nivel ${sel}: ${RANKS[L.r][1].toLowerCase()}, ${L.waves} oleadas${L.boss && isCombat() ? ', con jefe' : ''} · ${exName(settings.exercise)} en ${MODE_NAMES[settings.mode]}`, color: '#a49fc8' });
  } else {
    rows.push({ t: 'canvas', h: 0.17, text: 'Tu semana', draw: drawWeek });
    const b = c.bestRunOf(history(), settings.exercise, settings.mode);
    rows.push({ t: 'text', text: b ? `Tu mejor ronda de ${exName(settings.exercise).toLowerCase()} en ${MODE_NAMES[settings.mode]}: ${b.reps} reps${b.reps ? ` · ${Math.round((100 * (b.perfect || 0)) / b.reps)} % perfectas` : ''}` : 'Aún no tienes ninguna ronda de este ejercicio en este modo', color: '#a49fc8' });
  }
  void PROG_COL;
  return rows;
}
/** Abre Opciones → Progreso en esa parte (las metas de hoy llevan a Misiones). */
export function progressOpen(tab: string): void {
  PROG.tab = tab;
  uiSave('prog', tab);
  if (tab === 'camp') {
    PROG.lv = 0;
    PROG.reg = -1;
  }
  LOBBY.opt = 'prog';
  optionsMenu();
}

// Todo lo que suena: la música (con su pantalla), el ritmo y los volúmenes
function soundRows(again: () => void, back: () => void): Row[] {
  const beat = settings.mode === 'touch' || isCombat();
  return [
    { t: 'btns', items: [{ label: 'Música (Spotify) y ritmo  ▸', accent: MC.sound, onPress: () => musicScreen(back) }] },
    ...(beat ? (tempoRows(again) as Row[]) : [{ t: 'text' as const, text: 'El ritmo de la música se marca en Toques y en Combate', color: '#a49fc8' }]),
    ...SCHEMA.filter((f) => f.g === 'sonido' && fieldShown(f)).map((f) => ({ t: 'field' as const, key: f.key, after: f.relayout ? again : undefined })),
  ];
}
// Dónde juegas: la nitidez (propia de RepArena XR) y el entorno
function sceneRows(again: () => void): Row[] {
  const Q = MENU_ENV.quality;
  return [
    { t: 'choice', label: 'Nitidez en las gafas', value: Q.cur, opts: Q.labels.map((l, i) => [i, l]), onPick: (v) => (Q.set(Number(v)), again()) },
    ...(Q.note ? [{ t: 'text' as const, text: Q.note, color: '#a49fc8' }] : []),
    ...SCHEMA.filter((f) => f.g === 'entorno' && f.key !== 'quality' && !['roomMode', 'roomOcclude', 'roomShow'].includes(f.key) && fieldShown(f)).map((f) => ({ t: 'field' as const, key: f.key, after: f.relayout ? again : undefined })),
  ];
}
// Ajustes: los grupos en pestañas (de 4 en 4), sus campos, pasar a otro aparato, sincronizar y restablecer
function settingsRows(go: (g: string) => void, back: (() => void) | null): Row[] {
  const groups = settingsGroups();
  if (!groups.includes(LOBBY.tab)) LOBBY.tab = groups[0] ?? 'partida';
  const tab = LOBBY.tab, rows: Row[] = [], per = back ? 8 : 4;
  for (let k = 0; k < groups.length; k += per) rows.push({ t: 'tabs', items: groups.slice(k, k + per).map((g) => ({ label: groupName(g), on: g === tab, onPress: () => go(g) })) });
  if (tab === 'ejercicio') rows.push({ t: 'text', text: BODY_NOTE, color: '#a49fc8' });
  for (const f of SCHEMA) if (f.g === tab && fieldShown(f) && f.key !== 'quality') rows.push({ t: 'field', key: f.key, after: f.relayout ? () => go(tab) : undefined });
  if (DEV.on) {
    const simple = !menuFull();
    rows.push({ t: 'btns', items: [{ label: simple ? 'Ver todos los ajustes (menú completo)' : 'Ver solo lo del jugador', onPress: () => (setSetting('menuLevel', simple ? 'full' : 'simple'), go(tab)) }] });
  }
  rows.push({ t: 'text', text: 'Toca el número para escribirlo · desliza o usa − y +', color: '#a49fc8' });
  if (tab === 'sistema') rows.push({ t: 'btns', items: [{ label: DEV.on ? 'Acerca de RepArena · desarrollador' : 'Acerca de RepArena', style: 'ghost', onPress: () => devTap() && go(tab) }] }); // (cinco toques: modo desarrollador)
  const armed = LOBBY.resetArm === tab, tn = groupName(tab), inGame = GAME.phase === 'playing', rb = (): void => go(tab);
  if (!inGame) rows.push({ t: 'btns', items: [{ label: 'A otro aparato (código)  ▸', accent: MC.prof, onPress: () => xferScreen(rb) }, { label: 'Sincronización  ▸', accent: MC.prof, onPress: () => syncScreen(rb) }] });
  rows.push({
    t: 'btns',
    items: [
      {
        label: armed ? `¿Restablecer ${tn}? Otra vez` : `Restablecer ${tn}`,
        style: armed ? 'danger' : undefined,
        onPress: () => {
          if (armed) {
            LOBBY.resetArm = '';
            resetGroup(tab);
            say(`${tn}: como venía`, '#3cf0c6', 1.6);
          } else LOBBY.resetArm = tab;
          go(tab);
        },
      },
      ...(back ? [{ label: 'Volver', style: 'primary', onPress: () => ((LOBBY.resetArm = ''), back()) }] : []),
    ],
  });
  return rows;
}

/** Opciones: todo lo que no está en el principal, en pestañas con su color; «Volver» deja el principal en el mismo sitio. */
export function optionsMenu(): void {
  const again = (): void => optionsMenu();
  const tabs: [string, string, string][] = [...(isCombat() ? [['foes', 'Rivales y armas', MC.foes] as [string, string, string]] : armsAny() ? [['foes', 'Armas', MC.arms] as [string, string, string]] : []), ['prog', 'Progreso', PROG_COL], ['sound', 'Sonido', MC.sound], ['scene', 'Entorno', MC.scene], ['set', 'Ajustes', MC.set]];
  if (!tabs.some((t) => t[0] === LOBBY.opt)) LOBBY.opt = tabs[0][0];
  const o = LOBBY.opt, col = tabs.find((t) => t[0] === o)![2];
  const body = o === 'foes' ? (isCombat() ? foesRows(again, armsAny()) : armsRows(again)) : o === 'prog' ? progRows(again) : o === 'sound' ? soundRows(again, again) : o === 'scene' ? sceneRows(again) : settingsRows((g) => ((LOBBY.tab = g), uiSave('tab', g), again()), null);
  const rows: Row[] = [
    { t: 'title', text: 'OPCIONES', color: col },
    { t: 'btns', h: 0.052, items: tabs.map(([k, l, c2]) => ({ label: l, style: k === o ? 'selected' : 'normal', accent: c2, tint: c2, font: 0.44, onPress: () => ((LOBBY.opt = k), uiSave('lobbyOpt', k), (LOBBY.resetArm = ''), again()) })) },
    ...body.filter((r) => r.t !== 'field' || fieldVisible(FIELD[r.key])),
    { t: 'btns', items: [{ label: 'Volver', onPress: () => lobbyMenu() }] },
  ];
  const m = openMenu(rows, { accent: col }, 'options');
  m.rebuild = again;
}

// Submenús de la pausa: sonido, entorno y ajustes; «Volver», a la pausa
function soundMenu(back: () => void): void {
  const again = (): void => soundMenu(back);
  const m = openMenu([{ t: 'title', text: 'SONIDO Y MÚSICA' }, ...soundRows(again, again), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }], { accent: MC.sound }, 'pause');
  m.rebuild = again;
}
function sceneMenu(back: () => void): void {
  const again = (): void => sceneMenu(back);
  const m = openMenu([{ t: 'title', text: 'ENTORNO Y VISTA' }, ...sceneRows(again), { t: 'btns', items: [{ label: 'Volver', onPress: back }] }], { accent: MC.scene }, 'pause');
  m.rebuild = again;
}
function settingsMenu(back: () => void): void {
  const go = (g: string): void => ((LOBBY.tab = g), uiSave('tab', g), settingsMenu(back));
  const m = openMenu([{ t: 'title', text: 'AJUSTES' }, ...settingsRows(go, back)], { accent: MC.set }, 'pause');
  m.rebuild = () => settingsMenu(back);
}

// ---------------------------------------------------------------- la pausa, el resumen y las cartas

const PAUSE = { diag: false };
/** La pausa: cómo vas, seguir, las mejoras que llevas, los últimos avisos, los submenús, recolocarte y terminar. */
export function pauseMenu(): void {
  const bars = settings.mode === 'bars', P = MENU_ENV.pauseInfo;
  const m = openMenu(
    [
      { t: 'title', text: 'PAUSA' },
      { t: 'text', text: `${GAME.reps} repeticiones · ${GAME.kills} ${bars ? 'reventados' : 'enemigos'} · ${GAME.score} puntos` },
      { t: 'btns', items: [{ label: 'Continuar', style: 'primary', onPress: () => HOOKS.resume() }], h: 0.08 },
      ...(P.perks ? [{ t: 'text' as const, text: P.perks, color: '#ffd166' }] : []),
      ...(P.warns ? [{ t: 'text' as const, text: P.warns, color: '#ff8a3d' }] : []),
      ...(PAUSE.diag ? [{ t: 'text' as const, text: 'Diagnóstico guardado: en la página del juego, «Copiar el último»', color: '#3cf0c6' }] : []),
      { t: 'btns', items: [{ label: 'Sonido  ▸', accent: MC.sound, onPress: () => soundMenu(pauseMenu) }, { label: 'Entorno  ▸', accent: MC.scene, onPress: () => sceneMenu(pauseMenu) }, { label: 'Ajustes  ▸', accent: MC.set, onPress: () => settingsMenu(pauseMenu) }] },
      { t: 'btns', items: [{ label: bars ? 'Volver a colgarme' : 'Recalibrar', accent: MC.body, onPress: () => (HOOKS.resume(), HOOKS.recalibrate()) }, { label: 'Guardar diagnóstico', onPress: () => (HOOKS.diagSave('con el botón de la pausa'), (PAUSE.diag = true), pauseMenu()) }] },
      { t: 'btns', items: [{ label: 'Terminar ronda', onPress: () => (HOOKS.resume(), HOOKS.endRound()) }, { label: 'Menú principal', onPress: () => (HOOKS.resume(), HOOKS.toLobby()) }, { label: 'Salir del juego', style: 'danger', onPress: () => (HOOKS.resume(), MENU_ENV.exit()) }] },
    ],
    { border: '#ffd166' },
    'pause',
  );
  m.rebuild = pauseMenu;
  PAUSE.diag = false; // (el aviso, solo esta vez)
}

/** El resumen de la ronda (opción A): dónde acabó, el número grande, la medalla y las perfectas, tres casillas y un logro; y
 * «Otra ronda» y «Menú principal» (en la campaña, el nivel siguiente, repetirlo o el mapa). */
export function endMenu(S: Summary): void {
  const col = S.title === 'DERROTA' ? '#ff4a6a' : '#ffd166';
  const rows: Row[] = [
    { t: 'title', text: S.title, color: col },
    { t: 'canvas', h: SUM_H + (S.chip ? SUM_CHIP : 0), text: `${S.sub} · ${S.where} · ${S.got} ${S.unit}`, draw: (c, x, y, w, h) => drawSummary(S, c, x, y, w, h) },
    ...(S.camp
      ? [
          { t: 'btns' as const, items: [...(S.camp.next ? [{ label: `Nivel ${S.camp.next}`, style: 'primary', onPress: () => HOOKS.campPlay(S.camp!.next!) }] : []), { label: 'Repetir nivel', style: S.camp.next ? 'normal' : 'primary', onPress: () => HOOKS.campPlay(S.camp!.lv) }, { label: 'Mapa', onPress: () => progressOpen('camp') }] },
          { t: 'btns' as const, items: [{ label: 'Menú principal', onPress: () => lobbyMenu() }] },
        ]
      : [{ t: 'btns' as const, items: [{ label: 'Otra ronda', style: 'primary', onPress: () => HOOKS.startRound() }, { label: 'Menú principal', onPress: () => lobbyMenu() }] }]),
  ];
  const m = openMenu(rows, { accent: col }, 'summary');
  m.rebuild = () => endMenu(S);
}

/** Las cartas de mejora (RepArena: perkMenu): la oleada siguiente espera a que elijas. */
export function perkMenu(cards: { name: string; desc: string; col: string }[], pick: (i: number) => void): void {
  const rows: Row[] = [{ t: 'title', text: 'ELIGE UNA MEJORA', color: '#ffd166' }, { t: 'text', text: 'Dura lo que queda de ronda. La oleada siguiente espera a que elijas', color: '#a49fc8' }];
  cards.forEach((k, i) => rows.push({ t: 'btns', items: [{ label: k.name, accent: k.col, onPress: () => pick(i) }], h: 0.075 }, { t: 'text', text: k.desc }));
  const m = openMenu(rows, { accent: '#ffd166' }, 'perks');
  m.perks = true;
  m.rebuild = () => perkMenu(cards, pick);
}
/** Quita las cartas (si son lo que se ve). */
export function perkClose(): void {
  if (UI.menu?.perks) hideMenu();
}
