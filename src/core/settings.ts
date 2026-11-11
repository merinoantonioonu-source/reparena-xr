/**
 * Los ajustes: cargarlos, guardarlos y cambiarlos, como en RepArena (src/00_core.js, src/67_dev.js y la parte de los
 * rangos de src/70_game.js), con las mismas claves del navegador. Las dos versiones se publican en el mismo sitio y
 * comparten los datos: lo que el usuario tenga en RepArena aparece aquí, y lo que cambie aquí, allí.
 *
 *  - «reparena3-settings»: los ajustes de ahora (con las migraciones de RepArena al cargar).
 *  - «reparena3-combos»: los de juego de cada modo con cada ejercicio (su rango, la partida, tu cuerpo, los enemigos…):
 *    al volver a uno salen como los dejaste.
 *  - «reparena3-dev»: la tabla de dificultad (lo que vale cada ajuste en cada rango de cada modo y ejercicio, y lo que
 *    se ve en el menú del jugador); lo que el jugador cambia a mano también va ahí, al rango de ahora.
 *
 * Lógica pura (sin IWSDK): se prueba en tests/unit/settings.test.ts. Hay que llamar a initSettings() al arrancar.
 */
import { EX_NAMES, LEGACY_MODES, MODE_NAMES, RANKS, RANK_VALS, exFor, exOk, modeFor } from './catalog.js';
import { DEV, DEV_FACTORY, type DevTable } from './dev-state.js';
import { foeCatPatch, foeList, foesHas, isBars, isCombat } from './rules.js';
import { FIELD, SCHEMA, type FieldDef } from './schema.js';
import { num, settings, type SettingValue } from './values.js';

export const STORE_KEY = 'reparena3-settings';
export const COMBO_KEY = 'reparena3-combos';
export const DEV_KEY = 'reparena3-dev';
export const DEV_ON_KEY = 'reparena3-devon';
/** Los ajustes que solo tiene RepArena XR (los de `xr` en el esquema): aparte, para no tocar los de RepArena. */
export const XR_STORE_KEY = 'reparenaxr-settings';

// los de RepArena (sin los de RepArena XR) y los de RepArena XR, por separado
const splitXr = (all: Record<string, SettingValue>, xr: boolean): Record<string, SettingValue> => {
  const o: Record<string, SettingValue> = {};
  for (const k in all) if (!!FIELD[k]?.xr === xr) o[k] = all[k];
  return o;
};

// ---------------------------------------------------------------- guardar en el navegador

/** Al guardar algo (la sincronización, más adelante, apunta qué cambió y cuándo). */
export let storeHook: ((key: string, old: string | null) => void) | null = null;
export const setStoreHook = (h: typeof storeHook): void => {
  storeHook = h;
};

/** Lee (sin valor) o guarda (con valor) una clave del navegador, en JSON; si falla, null (como store de RepArena). */
export function store<T = unknown>(k: string, v?: T): T | null {
  try {
    const ls = globalThis.localStorage;
    if (v === undefined) return JSON.parse(ls.getItem(k) as string) as T;
    const old = storeHook ? ls.getItem(k) : null;
    ls.setItem(k, JSON.stringify(v));
    if (storeHook) storeHook(k, old);
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------- valores

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function decimals(f: FieldDef): number {
  return (f.step ?? 1) < 1 ? (String(f.step).split('.')[1] || '').length : 0;
}

/** Un valor dentro de lo que admite el ajuste (como clampSetting de RepArena). */
export function clampSetting(f: FieldDef, v: unknown): SettingValue {
  if (f.type === 'multi') {
    const sel = String(v || '').split(','), out = (f.opts ?? []).map((o) => o[0]).filter((k) => sel.includes(k));
    return out.length ? out.join(',') : f.empty ? '' : f.def;
  }
  if (f.type === 'choice') return (f.opts ?? []).some((o) => o[0] === v) ? (v as string) : f.def;
  if (f.type === 'toggle') return v ? 1 : 0;
  let n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  if (!isFinite(n)) n = +f.def;
  const min = f.min ?? -Infinity, max = f.max ?? Infinity, step = f.step ?? 1;
  n = clamp(n, min, max);
  n = Math.round((n - min) / step) * step + min;
  return +clamp(n, min, max).toFixed(decimals(f));
}

export function fmtNum(v: number, f?: FieldDef): string {
  return (f ? v.toFixed(decimals(f)) : String(Math.round(v * 10) / 10)).replace('.', ',');
}

/** El valor como se enseña («Sí», «3 vidas», «26 cm», «Infinitas»…). */
export function fmtVal(f: FieldDef, v: SettingValue = settings[f.key]): string {
  if (f.type === 'choice') {
    const o = (f.opts ?? []).find((o) => o[0] === v);
    return o ? o[1] : String(v);
  }
  if (f.type === 'toggle') return v ? 'Sí' : 'No';
  if (v === 0 && f.zero) return f.zero;
  return fmtNum(+v, f) + (f.unit ? (f.unit === '°' || f.unit === '%' ? f.unit : ' ' + f.unit) : '');
}

// ---------------------------------------------------------------- avisos de cambio

const settingHooks: ((key: string) => void)[] = [];
/** Para enterarse de cada ajuste que cambia ('*': todos de golpe). */
export function onSettingsChange(h: (key: string) => void): () => void {
  settingHooks.push(h);
  return () => {
    const i = settingHooks.indexOf(h);
    if (i >= 0) settingHooks.splice(i, 1);
  };
}
function onSettingChanged(key: string): void {
  for (const h of [...settingHooks]) {
    try {
      h(key);
    } catch (e) {
      console.warn(e);
    }
  }
}

// ---------------------------------------------------------------- sesiones y campaña

/**
 * Mientras se juega un bloque de una sesión o un nivel de la campaña, sus ajustes van por encima de los tuyos: aquí se
 * guardan los tuyos (se guardan esos, no los del bloque). Lo usarán las sesiones (PR 19) y la campaña (PR 13).
 */
export const OVERLAY: { orig: Record<string, SettingValue> | null } = { orig: null };

/** Guarda los ajustes (durante una sesión o un nivel de la campaña, los de antes). */
export function saveSettings(): void {
  const O = OVERLAY.orig;
  const all = O ? Object.assign({}, settings, O) : settings;
  store(STORE_KEY, splitXr(all, false));
  store(XR_STORE_KEY, splitXr(all, true));
  if (!O) comboSave();
}

// ---------------------------------------------------------------- cada modo con cada ejercicio

// Cada modo con cada ejercicio guarda sus ajustes de juego (su rango, la partida, tu cuerpo, los enemigos, las armas, los
// arcos, los toques y las barras): al volver a él salen como los dejaste. Lo común (entorno, sonido, menú, tu perfil y
// las medidas de los aparatos) no cambia. Un modo o ejercicio que aún no has tocado empieza con los ajustes que tenías
const COMBO_G = new Set(['partida', 'ejercicio', 'enemigos', 'armas', 'cada', 'arcos', 'toques', 'barras']);
const COMBO_SKIP = new Set(['doorH', 'doorW', 'dipH', 'dipBars', 'dipGap', 'dipLen']);
let _comboKeys: string[] | null = null;
export const comboKeys = (): string[] => _comboKeys || (_comboKeys = SCHEMA.filter((f) => COMBO_G.has(f.g) && !COMBO_SKIP.has(f.key)).map((f) => f.key));
export const comboId = (): string => settings.mode + '|' + settings.exercise;
type Combos = Record<string, Record<string, SettingValue>>;
export function comboSave(id = comboId()): void {
  const all = store<Combos>(COMBO_KEY) || {};
  all[id] = Object.fromEntries(comboKeys().map((k) => [k, settings[k]]));
  store(COMBO_KEY, all);
}
// Lo de serie de cada modo cuando aún no lo has tocado (y, en los demás, lo de serie del ajuste): Arcos va «Al fallo»
const MODE_DEF: Record<string, Record<string, SettingValue>> = { arcs: { toFail: 1 } }, MODE_DEF_KEYS = ['toFail'];
/** Carga los de este modo y ejercicio; devuelve los ajustes que cambian. */
export function comboLoad(id = comboId()): string[] {
  const o = (store<Combos>(COMBO_KEY) || {})[id], ch: string[] = [];
  if (!o) {
    const d = MODE_DEF[id.split('|')[0]] || {};
    for (const k of MODE_DEF_KEYS) {
      const v = k in d ? d[k] : FIELD[k].def;
      if (v !== settings[k]) {
        settings[k] = v;
        ch.push(k);
      }
    }
    return ch;
  }
  for (const k of comboKeys()) {
    if (o[k] === undefined) continue;
    const v = clampSetting(FIELD[k], o[k]);
    if (v !== settings[k]) {
      settings[k] = v;
      ch.push(k);
    }
  }
  return ch;
}
let comboLoading = false; // (al cargar los de un modo y ejercicio, su rango viene con sus retoques: no se vuelve a poner de serie)

// ---------------------------------------------------------------- la tabla de dificultad (modo desarrollador)

// Las filas: lo que marca la dificultad de este modo y ejercicio (números, interruptores y unas pocas opciones). Fuera,
// lo que es elegir (qué enemigos, qué armas, cómo apuntar…) y lo de tu cuerpo y tus aparatos, que no es dificultad
const DEV_NOT = new Set(['rank', 'toFail', 'foeKind', 'sword', 'swordKind', 'swordHand', 'padHands', 'handLook', 'pistol', 'aim', 'throwPick', 'comboBase', 'comboOrder', 'hangPit', 'supArms', 'dipBars', 'guard', 'barOffset', 'fallMargin']);
const DEV_CHOICE_OK = new Set(['guardDiff', 'arcTiming', 'barTarget']);
let _devCombo: Set<string> | null = null;
const devComboSet = (): Set<string> => _devCombo || (_devCombo = new Set(comboKeys()));
export const devRowOk = (f: FieldDef | undefined): boolean => !!f && f.g !== 'ejercicio' && devComboSet().has(f.key) && !DEV_NOT.has(f.key) && (f.type === 'num' || f.type === 'toggle' || DEV_CHOICE_OK.has(f.key));
// (sin mirar las condiciones de cada ajuste: la tabla enseña todo lo que vale para el modo y el ejercicio)
export const fieldFits = (f: FieldDef): boolean => (!f.modes || f.modes.includes(settings.mode)) && (!f.ex || f.ex.includes(settings.exercise)) && !(f.noEx && f.noEx.includes(settings.exercise));
export const devRows = (): string[] => SCHEMA.filter((f) => devRowOk(f) && fieldFits(f)).map((f) => f.key);
const devEntry = (id = comboId()): DevTable[string] => DEV.t[id] || {};
const devFact = (id = comboId()): DevTable[string] => DEV_FACTORY[id] || {};
const devArr = (o: DevTable[string], key: string): (number | string | null)[] | undefined => (o.v || {})[key];
/** Lo que el desarrollador (o el jugador, a mano) puso en esa casilla, o null: la de serie. */
export function devCell(key: string, i: number, id = comboId()): number | string | null {
  for (const a of [devArr(devEntry(id), key), devArr(devFact(id), key)]) if (a && a[i] !== undefined && a[i] !== null) return a[i];
  return null;
}
export const devBase = (key: string, i: number): SettingValue => (RANK_VALS[key] ? RANK_VALS[key][i] : FIELD[key].def);
export const devVal = (key: string, i: number, id?: string): SettingValue => {
  const v = devCell(key, i, id);
  return clampSetting(FIELD[key], v === null ? devBase(key, i) : v);
};
// las filas que manda el rango: las de siempre (RANK_VALS) y las que el desarrollador ha tocado en este modo y ejercicio
export const devCtl = (id = comboId()): string[] => [...new Set([...Object.keys(devEntry(id).v || {}), ...Object.keys(devFact(id).v || {})])].filter((k) => FIELD[k] && devRowOk(FIELD[k]));
export const devSave = (): void => {
  store(DEV_KEY, DEV.t);
};
export function devSet(key: string, i: number, v: SettingValue | null, id = comboId()): void {
  const e = (DEV.t[id] = DEV.t[id] || {});
  e.v = e.v || {};
  const a = (e.v[key] = e.v[key] || Array(RANKS.length).fill(null));
  a[i] = v === null || v === '' ? null : clampSetting(FIELD[key], v);
  if (a.every((x) => x === null)) delete e.v[key];
  devSave();
  // en el rango de ahora, el valor nuevo se nota ya
  if (id === comboId() && i === rankIdx()) {
    RANK.applying = true;
    try {
      setSetting(key, devVal(key, i));
    } finally {
      RANK.applying = false;
    }
  }
}
/** El ajuste que marca el ritmo de cada modo (lo primero que se enseña de la dificultad). */
export function speedKey(): string | undefined {
  if (isBars()) return settings.exercise === 'hang' ? 'hangTime' : 'barArrive';
  return ({ combat: foesHas('robots') ? 'walkTime' : 'flySpeed', arcs: 'arcSpeed', touch: 'tchArrive' } as Record<string, string>)[settings.mode];
}
/** Lo que ve el jugador en su menú si nadie ha tocado el ojo de este modo y ejercicio. */
export function devEyeDef(): string[] {
  const hang = settings.exercise === 'hang', k = [speedKey() ?? '', settings.mode === 'arcs' ? 'arcMax' : isBars() && hang ? 'hangInc' : 'repsWave'];
  if (isBars() && !hang) k.push('barTarget');
  if (settings.mode === 'touch' && fieldVisible(FIELD.tchHands)) k.push('tchHands');
  if (isCombat() && foesHas('robots') && foesHas('flyers')) k.push('flySpeed');
  return k.concat('rest').filter((x) => FIELD[x]);
}
export const devEye = (id = comboId()): string[] => devEntry(id).eye || devFact(id).eye || devEyeDef();
/** El menú completo (todos los ajustes) es solo del desarrollador. */
export const menuFull = (): boolean => DEV.on && settings.menuLevel === 'full';

// ---------------------------------------------------------------- rangos

// Rangos: la dificultad. Cada modo con cada ejercicio guarda el suyo (va con sus ajustes: comboSave); elegir uno pone sus
// valores en ese ejercicio. Lo que cambias a mano en un rango se queda como valor de ese rango en ese ejercicio (en la
// tabla del desarrollador): es lo que se pone cada vez que empiezas ese ejercicio con ese rango
export const RANK = { applying: false };
export const rankIdx = (r: SettingValue = settings.rank): number => Math.max(0, RANKS.findIndex((o) => o[0] === r));
export const rankName = (r: SettingValue = settings.rank): string => RANKS[rankIdx(r)][1];
/** Los valores del rango (con lo que haya en la tabla de este modo y ejercicio). */
export function rankVals(r: SettingValue = settings.rank): Record<string, SettingValue> {
  const i = rankIdx(r), o: Record<string, SettingValue> = {};
  for (const k in RANK_VALS) o[k] = devVal(k, i);
  for (const k of devCtl()) o[k] = devVal(k, i);
  return o;
}
export function applyRank(): void {
  RANK.applying = true;
  try {
    const v = rankVals();
    for (const k in v) setSetting(k, v[k]);
  } finally {
    RANK.applying = false;
  }
}
const rankDiff = (a: SettingValue, b: SettingValue): boolean => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1e-6 : a !== b);

// ---------------------------------------------------------------- cambiar un ajuste

/** Cambia un ajuste (como setSetting de RepArena): lo ajusta a sus límites, guarda y avisa. */
export function setSetting(key: string, v: SettingValue): void {
  if (key === 'foes') {
    // el atajo de antes: robots, voladores o mezcla
    Object.assign(settings, foeCatPatch(String(v)));
    saveSettings();
    onSettingChanged('foesGate');
    return;
  }
  if (key === 'mode' && LEGACY_MODES[v as string]) {
    // Asalto → robots y automática; Enjambre → voladores y a mano
    const { foes: c, ...rest } = LEGACY_MODES[v as string];
    Object.assign(settings, rest, foeCatPatch(c));
    v = 'combat';
  }
  const f = FIELD[key], prev = (key === 'mode' || key === 'exercise') && !OVERLAY.orig ? comboId() : null;
  if (prev) comboSave(prev); // lo que dejas, guardado
  settings[key] = f ? clampSetting(f, v) : v;
  // cada modo tiene sus ejercicios: cambiar uno arrastra al otro si no casan
  if (key === 'mode') settings.exercise = exFor(String(v), settings.exercise);
  if (key === 'exercise' && !exOk(settings.mode, String(v))) settings.mode = modeFor(String(v)) ?? settings.mode;
  const ch = prev && comboId() !== prev ? comboLoad() : []; // y lo de este modo y ejercicio, como lo dejaste
  saveSettings();
  onSettingChanged(key);
  comboLoading = true;
  try {
    ch.forEach(onSettingChanged);
  } finally {
    comboLoading = false;
  }
}

// ---------------------------------------------------------------- qué se ve

/** ¿Vale para lo elegido (modo, ejercicio y su condición)? */
export function fieldVisible(f: FieldDef | undefined): boolean {
  if (!f) return false;
  if (f.modes && !f.modes.includes(settings.mode)) return false;
  if (f.ex && !f.ex.includes(settings.exercise)) return false;
  if (f.noEx && f.noEx.includes(settings.exercise)) return false;
  if (f.cond && !f.cond()) return false;
  return true;
}
// Menú sencillo: solo lo básico de cada grupo (en Ejercicio, todo menos lo de afinar)
const BASIC = new Set(['rank', 'toFail', 'lives', 'waves', 'repsWave', 'hangTime', 'rest', 'foeKind', 'foesGate', 'foesHatch', 'foesFly', 'aim', 'walkTime', 'flySpeed', 'maxAlive', 'pistol',
  'tchArrive', 'tchHands', 'jumpHeight', 'arcJumpH', 'arcHurdles', 'arcBurpee', 'comboBase', 'comboStand', 'comboFloor', 'comboAbs', 'arcMin', 'arcMax', 'arcRate', 'arcMaxGap', 'arcSpeed', 'arcJump', 'arcMace', 'arcPlank', 'barTarget', 'barArrive', 'hangPit', 'trekSpeed', 'trekCurves', 'doorH', 'dipH',
  'sword', 'swordKind', 'swordHand', 'padHands', 'handLook', 'bodyHands', 'menuSize', 'menuLevel', 'menuWhere', 'xrHz', 'quality', 'look', 'exSort', 'goalMin', 'weight', 'hrMax', 'volume', 'ambient', 'bpm', 'scenery', 'pano', 'motes', 'depth', 'board']);
const FINE_EX = ['thrUp', 'splDrop', 'supArms', 'perfectTime'];
// lo que marca la dificultad lo elige el desarrollador (el ojo de su tabla); lo demás, como siempre
export const isBasic = (f: FieldDef): boolean => (devRowOk(f) ? devEye().includes(f.key) : f.g === 'ejercicio' ? !FINE_EX.includes(f.key) : BASIC.has(f.key));
/** Lo que se enseña en los menús y en la página: lo que vale para lo elegido y, con el menú sencillo, lo básico. */
export const fieldShown = (f: FieldDef): boolean => fieldVisible(f) && (menuFull() || isBasic(f));

// ---------------------------------------------------------------- en la partida

// «Al fallo»: oleadas sin fin hasta que se acaban las vidas (al menos una: con infinitas, 3)
export const nWaves = (): number => (num('toFail') ? 0 : num('waves'));
export const nLives = (): number => (num('toFail') ? Math.max(1, num('lives') || 3) : num('lives'));
export const waveReps = (i: number): number => Math.max(1, Math.round(num('repsWave') + num('repsInc') * i));
export const hangSecs = (i: number): number => num('hangTime') + num('hangInc') * i;

// Dificultad creciente: el valor efectivo de un ajuste en la oleada en curso. Sube un ramp % por cada oleada superada con
// soltura (lvl, en el juego), hasta +60 %: llegan antes y hay menos tiempo para tocarlos o reventarlos; y, a la mitad de
// ese ritmo, más enemigos a la vez, sus gestos y el vuelo errático; más recorrido, a un 40 % (hasta +24 %)
export const RAMP_CAP = 0.6;
const RAMP_SLOWER = ['walkTime', 'tchArrive', 'barArrive', 'tchGap', 'tchWindow', 'barWait'], RAMP_DEEPER = ['squatDepth', 'pushDepth', 'lungeDepth', 'dipDepth', 'arcMin', 'arcMax'];
/** El valor de un ajuste en la oleada de ahora; lvl: las oleadas superadas con soltura (0 fuera de la partida). */
export function dv(key: string, lvl = 0): number {
  const v = num(key), k = num('ramp') > 0 && lvl > 0 ? Math.min(RAMP_CAP, (num('ramp') / 100) * lvl) : 0;
  if (!k) return v;
  if (RAMP_DEEPER.includes(key)) {
    const f = FIELD[key];
    return Math.min(f ? (f.max ?? v * 2) : v * 2, v * (1 + k * 0.4));
  }
  if (key === 'maxAlive') return Math.round(v * (1 + k * 0.5));
  if (key === 'erratic' || key.startsWith('pace_')) return v * (1 + k * 0.5);
  return RAMP_SLOWER.includes(key) ? v / (1 + k) : v * (1 + k);
}

// ---------------------------------------------------------------- al arrancar

let started = false;

/**
 * Pone los valores de serie, carga lo guardado (con las migraciones de RepArena, que solo se hacen una vez: si RepArena
 * ya las hizo, no se repiten) y la tabla del desarrollador. Se puede volver a llamar (las pruebas lo hacen).
 */
export function initSettings(): void {
  for (const k of Object.keys(settings)) delete settings[k];
  settings.mode = 'combat';
  settings.exercise = 'squat';
  for (const f of SCHEMA) settings[f.key] = f.def;
  OVERLAY.orig = null;
  // la tabla del desarrollador (y si está encendido: con ?dev=1 se enciende y con ?dev=0 se apaga)
  const t = store<DevTable>(DEV_KEY);
  DEV.t = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
  let devOn = !!store(DEV_ON_KEY);
  try {
    const q = new URLSearchParams(globalThis.location?.search || '');
    if (q.has('dev')) {
      devOn = q.get('dev') !== '0';
      store(DEV_ON_KEY, devOn);
    }
  } catch {
    /* (sin parámetros) */
  }
  DEV.on = devOn;
  loadSettings();
  rankMigrate();
  if (!started) {
    started = true;
    // al cambiar el rango, sus valores (solo en este modo y ejercicio)
    onSettingsChange((k) => {
      if (k === 'rank' && !RANK.applying && !comboLoading) applyRank();
    });
    // lo que tocas tú (no lo que pone el rango, el ejercicio al cargarse ni el bloque de una sesión), a la tabla
    onSettingsChange((k) => {
      if (RANK.applying || comboLoading || OVERLAY.orig || !FIELD[k] || !devRows().includes(k)) return;
      const i = rankIdx(), fa = (devFact().v || {})[k], base = clampSetting(FIELD[k], fa && fa[i] !== undefined && fa[i] !== null ? fa[i] : devBase(k, i));
      devSet(k, i, rankDiff(settings[k], base) ? settings[k] : null); // (igual que el de serie: la casilla vuelve a «de serie»)
    });
  }
}

// Lo guardado, con las migraciones de RepArena (cada una, una sola vez: lo marcan aimV, rampV, deepV)
function loadSettings(): void {
  const s = store<Record<string, SettingValue | undefined>>(STORE_KEY) || {};
  for (const f of SCHEMA) if (!f.xr && s[f.key] !== undefined) settings[f.key] = clampSetting(f, s[f.key]);
  const x = store<Record<string, SettingValue | undefined>>(XR_STORE_KEY) || {};
  for (const f of SCHEMA) if (f.xr && x[f.key] !== undefined) settings[f.key] = clampSetting(f, x[f.key]);
  const mode = String(s.mode ?? '');
  if (MODE_NAMES[mode]) settings.mode = mode;
  else if (LEGACY_MODES[mode]) {
    settings.mode = 'combat';
    if (s.foes === undefined) {
      const { foes: c, ...rest } = LEGACY_MODES[mode];
      Object.assign(settings, rest, s.foesGate === undefined ? foeCatPatch(c) : {}, mode === 'flyers' && ['hands', 'gaze'].includes(String(s.aim)) ? { aim: s.aim } : {});
    }
  }
  // antes se elegía «robots, voladores o mezcla» y cuántos de cada clase de los que andan: ahora, cada enemigo
  if (s.foesGate === undefined && s.foes !== undefined) {
    const off: Record<string, string[]> = { robotsW: ['robot'], beasts: ['imp', 'puglin'], zombies: ['zombie'], dinos: ['raptor'] };
    const gate = foeList('foesGate').filter((k) => !Object.keys(off).some((w) => s[w] === 0 && off[w].includes(k)));
    settings.foesGate = gate.length ? gate.join(',') : FIELD.foesGate.def;
    Object.assign(settings, foeCatPatch(String(s.foes)));
  }
  if (EX_NAMES[String(s.exercise)]) settings.exercise = String(s.exercise);
  if (s.roomMode === undefined && s.room === 0) settings.roomMode = 'off'; // antes era un sí/no
  if (s.look === 'neon') settings.look = 'comic'; // (la prueba de neón pasó a ser la de cómic)
  if (s.barMix === undefined && s.barSides) settings.barMix = 50; // antes, todos por los lados o ninguno: ahora se mezclan
  // la puntería por defecto pasó de automática a lanzar con las manos: a quien la tenía en automática se le cambia una vez
  if (s.aimV !== 2) {
    if (!s.aim || s.aim === 'auto') settings.aim = 'hands';
  }
  settings.aimV = 2;
  // la dificultad creciente: del 3 % al 6 % y luego al 4 % por oleada (una vez cada cambio)
  if (s.rampV !== 2) {
    if (s.ramp === undefined || s.ramp === 3) settings.ramp = 6;
  }
  settings.rampV = 2;
  if (s.rampV !== 3) {
    if (settings.ramp === 6) settings.ramp = 4;
  }
  settings.rampV = 3;
  // la recarga profunda (15 cm de serie) pasa a estar apagada de serie: a quien la tenía como venía se le apaga una vez
  if (s.deepV !== 2) {
    if (s.deepDrop === undefined || s.deepDrop === 15) settings.deepDrop = 0;
    const C = store<Combos>(COMBO_KEY);
    if (C && typeof C === 'object') {
      for (const id in C) if (C[id] && C[id].deepDrop === 15) C[id].deepDrop = 0;
      store(COMBO_KEY, C);
    }
  }
  settings.deepV = 2;
  settings.exercise = exFor(settings.mode, settings.exercise);
  // (rankV no se carga, como en RepArena: rankMigrate se repite al cargar, sin efecto, y deja guardados todos los ajustes)
}

// Los rangos de antes eran uno para todo: el que tenías pasa a cada modo y ejercicio ya guardado (una vez)
function rankMigrate(): void {
  if (settings.rankV === 2) return;
  const all = store<Combos>(COMBO_KEY) || {};
  for (const id in all) if (all[id] && all[id].rank === undefined) all[id].rank = settings.rank;
  store(COMBO_KEY, all);
  settings.rankV = 2;
  store(STORE_KEY, splitXr(settings, false));
}
