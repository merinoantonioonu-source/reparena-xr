/**
 * La página en el móvil: un panel de control con forma de app (RepArena: src/63_app.js, modelo C elegido por el usuario).
 * En el móvil no se juega (el juego es solo en las Quest 3): la página es el panel para elegir el modo, el ejercicio y los
 * ajustes y para ver tu progreso, con la forma de la app de Ajustes del teléfono:
 *  · el inicio: el logotipo, lo de hoy y listas agrupadas (Entrenar, Ajustes, Tú, Ayuda); cada fila, su icono de color, su
 *    valor de ahora y una flecha; al tocarla se abre su apartado como pantalla, con «‹ RepArena» para volver (también con el
 *    gesto o el botón de volver del teléfono)
 *  · cada ajuste, una fila: los Sí/No, un interruptor; los demás, su valor y, al tocarla, una pantalla con las opciones (o el
 *    número con su deslizador, − y +) y su explicación debajo
 *  · los modos y los ejercicios, filas con una marca en el elegido (los ejercicios, con buscador)
 *  · sin los botones de entrar (aquí no sirven) ni el índice de la izquierda
 * html.app lo pone el <head> de la página (estrecho y fuera de las gafas); en el ordenador y en las gafas no cambia nada.
 * Las filas y las pantallas mueven los controles de siempre (los del formulario, src/page/form.ts), con sus mismos
 * eventos: se guarda y se sincroniza igual. Los apartados que aún no hay en esta página (sesiones, tabla del
 * desarrollador…) no salen en el inicio.
 */
import { progressNow } from '../combat/career-hub.js';
import { EX_NAMES, MODE_NAMES, RANKS } from '../core/catalog.js';
import { MONTH, WDAY, dayStats, daysTxt, type HistRow } from '../core/days.js';
import { HIST_KEY } from '../core/run.js';
import { FIELD, type FieldDef } from '../core/schema.js';
import { fmtNum, onSettingsChange, store } from '../core/settings.js';
import { num, settings } from '../core/values.js';
import { $, escHTML } from './dom.js';
import { navGo } from './nav.js';

// home: se ve el inicio; cur: el apartado abierto; pick: el ajuste con su pantalla abierta; pushed: las pantallas
// apuntadas en el historial (para volver con history.back); homeY: por dónde ibas en el inicio; popping: abriendo un
// apartado al volver atrás (no se apunta otra vez); ready: ya está montada en la página
const APP = { home: true, cur: '', pick: null as string | null, pushed: 0, homeY: 0, popping: false, t: 0 as ReturnType<typeof setTimeout> | 0, ready: false, was: false };

/** ¿La página va como app (html.app)? */
export const appOn = (): boolean => {
  try {
    return document.documentElement.classList.contains('app');
  } catch {
    return false;
  }
};

// Los iconos: dibujos de línea del mismo estilo (nada de emojis)
const APP_I: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-6"/>',
  pad: '<path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 5.5l-.8 3.6a2.6 2.6 0 0 1-4.5 1.2L14 15.5h-4l-1.6 1.8a2.6 2.6 0 0 1-4.5-1.2l-.8-3.6A4.5 4.5 0 0 1 7.5 7z"/><path d="M8 10v3M6.5 11.5h3"/><path d="M15.5 10.5h.01M17.5 12.5h.01"/>',
  dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  list: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  visor: '<path d="M3 10a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3.2l-1.6-2h-2.4l-1.6 2H6a3 3 0 0 1-3-3z"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  arch: '<path d="M4 20v-8a8 8 0 0 1 16 0v8"/><path d="M8.5 20v-8a3.5 3.5 0 0 1 7 0v8"/>',
  bar: '<path d="M3 5.5h18M6 5.5v15M18 5.5v15"/><path d="M9.5 10.5l2.5 2 2.5-2"/>',
  gem: '<path d="M6.5 4h11l3.5 5-9 11-9-11z"/><path d="M3 9h18M12 9v11"/>',
  trail: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const appIco = (n: string, s = 20, w = 2): string =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${APP_I[n] || ''}</svg>`;

type Txt = string | (() => string);
interface AppSec { g: string; id: string; i: string; c: string; t: Txt; v: Txt }
// cada apartado en el inicio: su grupo, su icono, su color, su nombre y lo que se ve a la derecha (su valor de ahora). Solo
// salen los que hay en la página; uno nuevo sale solo, en «Más», hasta que se le dé su sitio aquí. (Las sesiones, Spotify y
// la tabla del desarrollador llegan con sus PR: hasta entonces, sin su valor)
const APP_SECS: AppSec[] = [
  { g: 'Entrenar', id: 'secMode', i: 'pad', c: '#ff4fa3', t: 'Modo de juego', v: () => MODE_NAMES[settings.mode] },
  { g: 'Entrenar', id: 'secEx', i: 'dumbbell', c: '#7ee2ff', t: 'Ejercicio', v: () => EX_NAMES[settings.exercise] },
  { g: 'Entrenar', id: 'secSpec', i: 'target', c: '#ff8a3d', t: () => `Opciones de ${MODE_NAMES[settings.mode]}`, v: () => RANKS.find((x) => x[0] === settings.rank)?.[1] ?? '' },
  { g: 'Entrenar', id: 'secSession', i: 'list', c: '#ffd166', t: 'Sesión de entrenamiento', v: '' },
  { g: 'Ajustes', id: 'secCommon', i: 'sliders', c: '#b8a7ff', t: 'Opciones comunes', v: '' },
  { g: 'Ajustes', id: 'secMusic', i: 'music', c: '#8fdc5a', t: 'Sonido y música', v: '' },
  { g: 'Ajustes', id: 'devSection', i: 'wrench', c: '#a49fc8', t: 'Tabla del desarrollador', v: '' },
  { g: 'Tú', id: 'todayBox', i: 'sun', c: '#ffd166', t: 'Hoy, racha y misiones', v: '' },
  { g: 'Tú', id: 'secHist', i: 'chart', c: '#3cf0c6', t: 'Progreso e historial', v: '' },
  { g: 'Ayuda', id: 'secHow', i: 'visor', c: '#7ee2ff', t: 'Dentro del juego', v: '' },
  { g: 'Ayuda', id: 'soundsBox', i: 'speaker', c: '#c9c3ea', t: 'Sonidos que puedes cambiar', v: '' },
];
const APP_MODE: Record<string, [string, string]> = { combat: ['bolt', '#ff4fa3'], arcs: ['arch', '#3cf0c6'], bars: ['bar', '#ffd166'], touch: ['gem', '#7ee2ff'], trek: ['trail', '#8fdc5a'] };
const appTxt = (f: Txt | undefined): string => {
  try {
    return (typeof f === 'function' ? f() : f) || '';
  } catch {
    return '';
  }
};
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// Los apartados y su nombre, como los del índice (src/page/nav.ts, que no los exporta): las secciones de .main con id que
// se ven, y su data-toc o su título sin sus botones ni su contador
const navSecs = (): HTMLElement[] => {
  const m = $('.main');
  return m ? ([...m.children] as HTMLElement[]).filter((s) => s.tagName === 'SECTION' && s.id && !s.hidden) : [];
};
const navText = (el: Element): string => {
  let t = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) t += n.textContent;
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (e.tagName !== 'BUTTON' && !e.classList.contains('count') && !e.classList.contains('qm')) t += e.textContent;
    }
  }
  return t.replace(/\s+/g, ' ').trim();
};
const navName = (s: HTMLElement): string => s.dataset.toc || navText(s.querySelector('h2') || s);
const appSecName = (sec: HTMLElement): string => {
  const s = APP_SECS.find((x) => x.id === sec.id);
  return s ? appTxt(s.t) : navName(sec).replace(/^\d+\s*·\s*/, '');
};
const appDate = (): string => {
  const d = new Date();
  return `${WDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]}`;
};
// el apartado abierto: el que abrió navGo (appEnter) o, si no, el que marca el índice
const curSec = (): HTMLElement | null => document.getElementById(APP.cur || document.body.dataset.sec || '');

/**
 * Monta la app en la página (una vez) si va como app; si no, espera a que lo sea (al estrechar la ventana o girar el
 * teléfono, el <head> cambia html.app). Va después del formulario y del índice: usa sus controles.
 */
export function appMount(): void {
  if (typeof document === 'undefined') return;
  APP.was = appOn();
  if (APP.was) appInit();
  // (html.app lo cambia el <head> con la media query; aquí se mira el cambio de clase, que es lo que cuenta)
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const on = appOn();
      if (on === APP.was) return; // (también cambia appHome y appPicking: esos no cuentan)
      APP.was = on;
      if (!on) return;
      if (!APP.ready) appInit();
      else appSync();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
}

function appInit(): void {
  try {
    const main = $('.main');
    if (!main || $('#appHome')) return;
    const mk = (id: string): HTMLElement => {
      const e = document.createElement('div');
      e.id = id;
      return e;
    };
    const home = mk('appHome'), bar = mk('appBar'), ttl = mk('appTitle'), pick = mk('appPick');
    main.insertBefore(ttl, main.firstChild);
    main.insertBefore(bar, ttl);
    main.insertBefore(home, bar);
    bar.innerHTML = `<button type="button" class="aBack" data-app="back">${appIco('back', 24, 2.4)}<span>RepArena</span></button><button type="button" class="qm aHelp" data-app="help" aria-label="Qué es esto" hidden>?</button>`;
    pick.hidden = true;
    pick.setAttribute('role', 'dialog');
    document.body.appendChild(pick);
    appRows();
    appModes();
    appExSearch();
    for (const el of [home, bar, ttl]) el.addEventListener('click', appClick);
    for (const h of [$('#commonGroups'), $('#settingsGroups'), $('#soundGroups')]) h?.addEventListener('click', appRowClick);
    pick.addEventListener('click', appPickClick);
    pick.addEventListener('input', appPickInput);
    addEventListener('popstate', appPop);
    // al abrirla: el inicio, salvo que el enlace lleve a un apartado
    let id = '';
    try {
      id = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    } catch {
      id = ''; // (un # mal escrito)
    }
    const sec = id ? document.getElementById(id) : null;
    APP.home = !(sec && navSecs().includes(sec));
    if (!APP.home) APP.cur = id;
    onSettingsChange(appSoon);
    APP.ready = true;
    appRender();
  } catch (e) {
    console.warn(e);
  }
}

/** Lo que cambia (un ajuste, una partida, lo de hoy…): el inicio, los valores de las filas y el título, al día. */
export function appSoon(): void {
  if (!APP.ready) return;
  if (APP.t) clearTimeout(APP.t);
  APP.t = setTimeout(appSync, 40);
}
function appSync(): void {
  APP.t = 0;
  if (!APP.ready) return;
  appRowsSync();
  appRender();
}
function appRender(): void {
  const home = $('#appHome');
  if (!home) return;
  document.documentElement.classList.toggle('appHome', APP.home);
  if (APP.home) home.innerHTML = appHomeHTML();
  else appTitle();
}
function appHomeHTML(): string {
  const h = store<HistRow[]>(HIST_KEY) || [], kg = num('weight') || 70, D = dayStats(h, Date.now(), kg), P = progressNow(h), T = D.today, goal = num('goalMin');
  const mins = Math.round(T.time / 60), k = Math.min(1, T.time / Math.max(60, goal * 60));
  const R = 27, C = 2 * Math.PI * R, secs = navSecs(), known = new Set(APP_SECS.map((s) => s.id)), groups: { g: string; rows: AppSec[] }[] = [];
  for (const s of APP_SECS) {
    if (!secs.some((x) => x.id === s.id)) continue;
    let g = groups.find((x) => x.g === s.g);
    if (!g) groups.push((g = { g: s.g, rows: [] }));
    g.rows.push(s);
  }
  const more = secs.filter((x) => !known.has(x.id)).map((x): AppSec => ({ g: 'Más', id: x.id, i: 'list', c: '#a49fc8', t: navName(x).replace(/^\d+\s*·\s*/, ''), v: '' }));
  if (more.length) groups.push({ g: 'Más', rows: more });
  return `<div class="aHead"><img src="icons/logo.svg" alt="" width="44" height="44"><h1>Rep<span>Arena</span></h1></div><p class="aDate">${appDate()}</p>
    <button type="button" class="aToday" data-app="todayBox"><span class="aRingW"><svg viewBox="0 0 66 66" width="66" height="66" aria-hidden="true"><circle cx="33" cy="33" r="${R}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>${k > 0 ? `<circle cx="33" cy="33" r="${R}" fill="none" stroke="#3cf0c6" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C * k).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 33 33)"/>` : ''}</svg><b>${mins}</b></span>
      <span class="aTt"><b>${mins} de ${goal} min hoy</b><small>${T.reps} reps · ${Math.round(T.kcal)} kcal · racha de ${daysTxt(P.streak)}</small></span>${appIco('chev', 18, 2.4)}</button>
    ${groups.map((g) => `<h2 class="aH">${g.g}</h2><div class="aGrp">${g.rows.map((s) => `<button type="button" class="aRow" data-app="${s.id}"><i class="aSq" style="background:${s.c}">${appIco(s.i, 18, 2.3)}</i><span class="aL">${escHTML(appTxt(s.t))}</span><span class="aV">${escHTML(appTxt(s.v))}</span>${appIco('chev', 18, 2.4)}</button>`).join('')}</div>`).join('')}
    <p class="aFoot">Aquí lo eliges y lo ves todo; se juega en el navegador de las Quest 3, y lo que cambias llega a las gafas con la sincronización automática o con el código.</p>`;
}
function appTitle(): void {
  const sec = curSec(), t = $('#appTitle');
  if (!sec || !t) return;
  const sub = sec.id === 'secSpec' ? EX_NAMES[settings.exercise] : sec.id === 'todayBox' ? appDate() : '', q = sec.querySelector('h2 .qm'), help = $('#appBar .aHelp');
  t.innerHTML = `<h1>${escHTML(appSecName(sec))}</h1>${sub ? `<p>${escHTML(sub)}</p>` : ''}`;
  if (help) help.hidden = !q; // (su explicación, con la «?» de arriba a la derecha)
}
function appClick(ev: Event): void {
  const b = (ev.target as Element | null)?.closest?.<HTMLElement>('[data-app]');
  if (!b) return;
  ev.preventDefault();
  const a = b.dataset.app as string;
  if (a === 'back') {
    appBack();
    return;
  }
  if (a === 'help') {
    curSec()?.querySelector<HTMLElement>('h2 .qm')?.click();
    return;
  }
  if (APP.home) APP.homeY = typeof scrollY === 'number' ? scrollY : 0;
  navGo(a); // (abre el apartado: appEnter)
}

/**
 * navGo (src/page/nav.ts) llama aquí al abrir un apartado: en el móvil deja el inicio y lo apunta en el historial, para que
 * el botón de volver del teléfono vuelva al inicio.
 */
export function appEnter(id: string, sub: string | null): void {
  APP.cur = id;
  if (!APP.ready || !appOn()) return;
  APP.home = false;
  appRender();
  if (!APP.popping && location.hash !== '#' + id) {
    history.pushState({ app: id }, '', '#' + id);
    APP.pushed++;
  }
  if (!sub) scrollTo?.(0, 0);
}
function appBack(): void {
  if (APP.pushed > 0) history.back();
  else appHomeGo();
}
function appHomeGo(): void {
  APP.home = true;
  APP.pushed = 0;
  appRender();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  scrollTo?.(0, APP.homeY || 0);
}
function appPop(): void {
  if (!APP.ready || !appOn()) return;
  if (APP.pick) {
    appPickClose();
    return;
  }
  APP.pushed = Math.max(0, APP.pushed - 1);
  let id = '';
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    id = '';
  }
  const sec = id ? document.getElementById(id) : null;
  if (sec && navSecs().includes(sec)) {
    APP.popping = true;
    try {
      navGo(id);
    } finally {
      APP.popping = false;
    }
  } else appHomeGo();
}

/* ---------- Los ajustes, en filas ---------- */
function appRows(): void {
  for (const host of [$('#commonGroups'), $('#settingsGroups'), $('#soundGroups')]) {
    host?.querySelectorAll<HTMLElement>('.field[data-field]').forEach((fd) => {
      const f = FIELD[fd.dataset.field as string];
      if (!f || fd.querySelector('.aF')) return;
      const r = document.createElement(f.type === 'toggle' ? 'div' : 'button');
      r.className = 'aRow aF';
      r.dataset.appField = f.key;
      if (f.type === 'toggle') r.innerHTML = `<span class="aL">${f.label}</span>${f.hint ? '<button type="button" class="aQ" data-app-q="1" aria-label="Qué es esto">?</button>' : ''}<button type="button" class="aSw" role="switch" aria-checked="false" aria-label="${escHTML(f.label)}"></button>`;
      else {
        (r as HTMLButtonElement).type = 'button';
        r.innerHTML = `<span class="aL">${f.label}</span><span class="aV"></span>${appIco('chev', 18, 2.4)}`;
      }
      fd.appendChild(r);
    });
  }
  appRowsSync();
}
function appVal(f: FieldDef): string {
  const v = settings[f.key];
  if (f.type === 'num') return v === 0 && f.zero ? f.zero : `${fmtNum(+v, f)}${f.unit ? ' ' + f.unit : ''}`;
  const opts = f.opts ?? [];
  if (f.type === 'multi') {
    const on = String(v).split(','), n = opts.filter((o) => on.includes(String(o[0]))).map((o) => o[1]);
    return !n.length ? 'Ninguno' : n.length === opts.length ? 'Todos' : n.length <= 2 ? n.join(', ') : `${n.slice(0, 2).join(', ')} +${n.length - 2}`;
  }
  const o = opts.find((o) => String(o[0]) === String(v));
  return o ? o[1] : String(v);
}
function appRowsSync(): void {
  document.querySelectorAll<HTMLElement>('.aF[data-app-field]').forEach((r) => {
    const f = FIELD[r.dataset.appField as string];
    if (!f) return;
    if (f.type === 'toggle') {
      const sw = r.querySelector('.aSw'), on = !!+settings[f.key];
      if (sw) {
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', String(on));
      }
    } else {
      const v = r.querySelector('.aV');
      if (v) v.textContent = appVal(f);
    }
  });
}
function appRowClick(ev: Event): void {
  const t = ev.target as Element | null;
  if (!appOn() || !t?.closest) return;
  const r = t.closest<HTMLElement>('.aF');
  if (!r) return;
  const f = FIELD[r.dataset.appField as string];
  if (!f) return;
  ev.preventDefault();
  if (f.type === 'toggle') {
    if (t.closest('[data-app-q]')) {
      const p = $(`#f-${f.key}-h`);
      if (p) p.hidden = !p.hidden;
      return;
    }
    appSet(f, +settings[f.key] ? 0 : 1);
    return;
  }
  appPickOpen(f);
}
// el control de siempre de un ajuste con ese valor (su radio o su casilla)
const ctlOf = (f: FieldDef, v: string | number): HTMLInputElement | undefined => [...document.querySelectorAll<HTMLInputElement>(`input[name="f-${f.key}"]`)].find((x) => String(x.value) === String(v));
// cambiar un ajuste como lo haría su control de siempre (y con sus mismos efectos: guardar, sincronizar, recolocar)
function appSet(f: FieldDef, v: string | number): void {
  const el = ctlOf(f, v);
  if (!el) return;
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  appRowsSync();
  appSoon();
}

/* ---------- La pantalla de un ajuste: sus opciones (o su número) y su explicación ---------- */
function appPickOpen(f: FieldDef): void {
  const p = $('#appPick');
  if (!p) return;
  const sec = curSec(), opts: [string | number, string][] = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : (f.opts ?? []);
  const body =
    f.type === 'num'
      ? `<div class="aNum"><b class="aBig"></b><input type="range" class="aRange" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${escHTML(f.label)}"><div class="aPm"><button type="button" data-app-step="-1" aria-label="Menos">${appIco('minus', 22, 2.6)}</button><button type="button" data-app-step="1" aria-label="Más">${appIco('plus', 22, 2.6)}</button></div></div>`
      : `<div class="aGrp">${opts.map((o) => `<button type="button" class="aRow aOpt" data-app-opt="${escHTML(String(o[0]))}"><span class="aL">${o[1]}</span><span class="aChk">${appIco('check', 22, 2.6)}</span></button>`).join('')}</div>`;
  p.innerHTML = `<div class="aPBar"><button type="button" class="aBack" data-app-close="1">${appIco('back', 24, 2.4)}<span>${escHTML(sec ? appSecName(sec) : 'Volver')}</span></button></div><div class="aPIn"><h1>${f.label}</h1>${body}${f.hint ? `<p class="aFoot">${f.hint}</p>` : ''}${f.type === 'multi' ? '<p class="aFoot">Puedes marcar varios.</p>' : ''}</div>`;
  APP.pick = f.key;
  p.hidden = false;
  p.scrollTop = 0;
  appPickSync();
  document.documentElement.classList.add('appPicking');
  // (dos fotogramas: el primero la pinta fuera, a la derecha, y así se ve cómo entra)
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('on')));
  else p.classList.add('on');
  history.pushState({ appPick: f.key }, '', location.href);
}
function appPickSync(): void {
  const p = $('#appPick'), f = APP.pick ? FIELD[APP.pick] : undefined;
  if (!p || !f) return;
  if (f.type === 'num') {
    const v = +settings[f.key], r = p.querySelector<HTMLInputElement>('.aRange'), big = p.querySelector('.aBig');
    if (r) r.value = String(v);
    // (la unidad en minúsculas: la letra grande solo tiene mayúsculas)
    if (big) big.innerHTML = v === 0 && f.zero ? escHTML(f.zero) : `${fmtNum(v, f)}${f.unit ? `<small>${escHTML(f.unit)}</small>` : ''}`;
    return;
  }
  const on = f.type === 'multi' ? String(settings[f.key]).split(',') : [String(f.type === 'toggle' ? +settings[f.key] : settings[f.key])];
  p.querySelectorAll<HTMLElement>('[data-app-opt]').forEach((b) => {
    const y = on.includes(b.dataset.appOpt as string);
    b.classList.toggle('on', y);
    b.setAttribute('aria-pressed', String(y));
  });
}
function appPickClick(ev: Event): void {
  const t = ev.target as Element | null, f = APP.pick ? FIELD[APP.pick] : undefined;
  if (!t?.closest || !f) return;
  if (t.closest('[data-app-close]')) {
    history.back();
    return;
  }
  const o = t.closest<HTMLElement>('[data-app-opt]');
  if (o) {
    const v = o.dataset.appOpt as string;
    if (f.type === 'multi') {
      const el = ctlOf(f, v);
      if (el) {
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      appPickSync();
      appRowsSync();
      appSoon();
      return;
    }
    appSet(f, v);
    appPickSync();
    // (elegido: se ve la marca y vuelve)
    setTimeout(() => {
      if (APP.pick === f.key) history.back();
    }, 230);
    return;
  }
  const st = t.closest<HTMLElement>('[data-app-step]');
  if (st) appNum(f, +settings[f.key] + +(st.dataset.appStep as string) * (f.step ?? 1));
}
function appPickInput(ev: Event): void {
  const f = APP.pick ? FIELD[APP.pick] : undefined, el = ev.target as HTMLInputElement | null;
  if (f && el?.classList.contains('aRange')) appNum(f, +el.value);
}
// el número, a través de su deslizador de siempre (con sus límites)
function appNum(f: FieldDef, v: number): void {
  const r = $<HTMLInputElement>(`#f-${f.key}-r`);
  if (!r) return;
  r.value = String(clamp(v, f.min ?? -Infinity, f.max ?? Infinity));
  r.dispatchEvent(new Event('input', { bubbles: true }));
  appPickSync();
  appRowsSync();
  appSoon();
}
function appPickClose(): void {
  const p = $('#appPick');
  APP.pick = null;
  document.documentElement.classList.remove('appPicking');
  appRowsSync();
  if (p) {
    p.classList.remove('on');
    setTimeout(() => {
      if (!APP.pick) p.hidden = true;
    }, 260);
  }
}

/* ---------- Modos y ejercicios: filas con su marca ---------- */
function appModes(): void {
  document.querySelectorAll<HTMLElement>('.cards.modes .card').forEach((c) => {
    const i = c.querySelector('input'), m = i && APP_MODE[i.value];
    if (!m || c.querySelector('.aIco')) return;
    const ic = document.createElement('i');
    ic.className = 'aIco';
    ic.style.background = m[1];
    ic.innerHTML = appIco(m[0], 18, 2.3);
    c.insertBefore(ic, c.firstChild);
  });
}
function appExSearch(): void {
  const sec = $('#secEx'), cards = sec?.querySelector<HTMLElement>('.cards.exs');
  if (!sec || !cards || sec.querySelector('.aSearch')) return;
  const box = document.createElement('label');
  box.className = 'aSearch';
  box.innerHTML = `${appIco('search', 18)}<input type="search" placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" autocomplete="off" enterkeyhint="search">`;
  // (justo antes de las fichas, que pueden estar dentro de otra caja)
  (cards.parentElement ?? sec).insertBefore(box, cards);
  // sin tildes ni mayúsculas: «sentadilla» encuentra «Sentadillas» y «lenador», «Leñador»
  const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  box.querySelector('input')?.addEventListener('input', (ev) => {
    const q = norm((ev.target as HTMLInputElement).value.trim());
    cards.classList.toggle('aSearching', !!q);
    cards.querySelectorAll<HTMLElement>('.card').forEach((c) => {
      const b = c.querySelector('b');
      c.classList.toggle('aOff', !!q && !norm((b ? b.textContent : c.textContent) || '').includes(q));
    });
  });
}
