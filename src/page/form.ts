/**
 * El formulario de ajustes de la página (RepArena: src/00_core.js `buildForm`, `fieldHTML`, `onFormInput`, `syncForm`,
 * `sortExCards`, `firstSentence`; src/68_prefs.js `resetGroup`): sale entero del esquema (SCHEMA), dentro del marcado de
 * la página (los mismos ids y clases que RepArena). Cada cambio va por setSetting (lo ajusta, lo guarda y avisa), y lo que
 * se cambie en las gafas (el menú) vuelve a la página.
 *
 * Fuera de este módulo (otros PR): la tabla del desarrollador, las canciones de cada ejercicio, Spotify y las sesiones; lo
 * elegido y el resumen (renderPick, updateSummary) los pone la página con formHooks.afterSync.
 */
import { BODY_NOTE, BODY_ZONES, EX_NAMES, GROUP_NAMES, MODE_NAMES, exOk } from '../core/catalog.js';
import { DEV } from '../core/dev-state.js';
import { SCHEMA, FIELD, type FieldDef } from '../core/schema.js';
import { RANK, fieldShown, menuFull, onSettingsChange, setSetting } from '../core/settings.js';
import { settings, type SettingValue } from '../core/values.js';
import { $, $$ } from './dom.js';

/** Lo que pone la página después: lo elegido y el resumen (afterSync, tras cada syncForm; afterInput, tras cada cambio
 * del formulario: si falta, también afterSync) y la nota de las animaciones del grupo «Cada enemigo». */
export const formHooks = {
  afterSync: null as null | (() => void),
  afterInput: null as null | (() => void),
  animNote: null as null | (() => string),
};

// self: los cambios que hace el propio formulario (ya se pone al día él; si no, al escribir un número a medias, el
// número se rehacía con el valor ajustado a sus límites); t: la espera de la vuelta desde fuera
const FORM = { self: 0, t: 0 as ReturnType<typeof setTimeout> | 0, built: false };
function formSet(key: string, v: SettingValue): void {
  FORM.self++;
  try {
    setSetting(key, v);
  } finally {
    FORM.self--;
  }
}

// Las explicaciones de la página, resumidas: su primera frase (para el «?»; el texto entero, al pulsarlo)
export const firstSentence = (t: string): string => {
  const x = String(t).replace(/\s+/g, ' ').trim(), m = x.match(/^.*?[.!?](\s|$)/), f = (m ? m[0] : x).trim();
  return f.length > 150 ? f.slice(0, 147).replace(/\s+\S*$/, '') + '…' : f;
};

const COMMON = ['entorno', 'sistema', 'perfil'];

// La página: las opciones comunes (entorno, menú y tu meta) y el sonido aparte; las del modo y el ejercicio, en su
// sección; y el orden de los ejercicios (por modo o por zona del cuerpo), junto a los ejercicios
export function buildForm(): void {
  const group = (g: string): string => `
    <div class="group" data-group="${g}"><h3>${GROUP_NAMES[g]} <button type="button" class="reset" data-reset="${g}" title="Devolver este grupo a como venía">Restablecer</button></h3>${g === 'cada' ? '<p class="note" id="animNote"></p>' : g === 'ejercicio' ? `<p class="note">${BODY_NOTE}</p>` : ''}<div class="grid">${SCHEMA.filter((f) => f.g === g).map(fieldHTML).join('')}</div></div>`;
  const common = $('#commonGroups'), host = $('#settingsGroups'), sortBox = $('#exSortBox'), sound = $('#soundGroups');
  if (common) common.innerHTML = COMMON.map(group).join('');
  if (sound) sound.innerHTML = group('sonido').replace(/<h3>.*?<\/h3>/, ''); // (la sección ya se titula así)
  if (host) host.innerHTML = Object.keys(GROUP_NAMES).filter((g) => !COMMON.includes(g) && g !== 'sonido').map(group).join('');
  const sortField = common?.querySelector('[data-field="exSort"]');
  if (sortField && sortBox) sortBox.appendChild(sortField);
  const hosts = [host, common, sortBox, sound].filter((h): h is HTMLElement => !!h);
  for (const h of hosts) {
    h.addEventListener('input', onFormInput);
    h.addEventListener('change', onFormInput);
  }
  // menú sencillo o completo, y restablecer un grupo
  $('#levelNote')?.addEventListener('click', (ev) => {
    const v = (ev.target as HTMLElement).dataset?.level;
    if (v) {
      formSet('menuLevel', v);
      syncForm();
    }
  });
  for (const h of [host, common, sound]) {
    h?.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement, q = t.dataset?.qm;
      if (!q) return;
      const p = $('#' + q);
      if (p) {
        p.hidden = !p.hidden;
        t.setAttribute('aria-expanded', String(!p.hidden));
      }
    });
  }
  for (const h of [host, common]) {
    h?.addEventListener('click', (ev) => {
      const g = (ev.target as HTMLElement).dataset?.reset;
      if (g && (typeof confirm !== 'function' || confirm(`¿Devolver «${GROUP_NAMES[g]}» a como venía?`))) resetGroup(g);
    });
  }
  $$<HTMLInputElement>('input[name=mode],input[name=exercise]').forEach((i) =>
    i.addEventListener('change', () => {
      formSet(i.name === 'mode' ? 'mode' : 'exercise', i.value);
      syncForm();
    }),
  );
  $('#btnReset')?.addEventListener('click', () => {
    resetFields(SCHEMA);
    syncForm();
  });
  // lo que se cambie fuera (en las gafas, el rango, otro módulo…): la página, al día (una vez, tras el último cambio)
  if (!FORM.built) {
    FORM.built = true;
    onSettingsChange(() => {
      if (FORM.self) return;
      if (FORM.t) clearTimeout(FORM.t);
      FORM.t = setTimeout(() => {
        FORM.t = 0;
        syncForm();
      }, 0);
    });
  }
}

/** El HTML de un ajuste (igual que el de RepArena: lo comprueba tests/compare/form.compare.test.ts). */
export function fieldHTML(f: FieldDef): string {
  const id = 'f-' + f.key;
  let body = '';
  if (f.type === 'num') {
    body = `<div class="num"><input type="range" id="${id}-r" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}">
      <input type="number" id="${id}" data-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal">
      <span class="unit">${f.unit || ''}</span></div>`;
  } else if (f.type === 'multi') {
    body = `<div class="seg multi" role="group" aria-label="${f.label}">${(f.opts ?? []).map((o, i) => `<label><input type="checkbox" name="${id}" id="${id}-${i}" data-key="${f.key}" value="${o[0]}">${o[1]}</label>`).join('')}</div>`;
  } else {
    const opts: [string | number, string][] = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : (f.opts ?? []);
    body = `<div class="seg" role="radiogroup" aria-label="${f.label}">${opts.map((o, i) => `<label><input type="radio" name="${id}" id="${id}-${i}" data-key="${f.key}" value="${o[0]}">${o[1]}</label>`).join('')}</div>`;
  }
  // la explicación, recogida: un «?» junto al nombre (al pasar por encima, su primera frase; al pulsarlo, entera)
  const qm = f.hint ? `<button type="button" class="qm" data-qm="${id}-h" title="${firstSentence(f.hint).replace(/"/g, '&quot;')}" aria-label="Qué es ${f.label.replace(/"/g, '&quot;')}" aria-expanded="false">?</button>` : '';
  const lab = f.type === 'num' ? `<label for="${id}">${f.label}</label>${qm}` : `<span class="lab">${f.label}${qm}</span>`;
  return `<div class="field" data-field="${f.key}">${f.type === 'num' ? `<span class="labrow">${lab}</span>` : lab}${body}${f.zero ? `<span class="zero" id="${id}-z"></span>` : ''}${f.hint ? `<p class="hint helpPop" id="${id}-h" hidden>${f.hint}</p>` : ''}</div>`;
}

const zeroTxt = (f: FieldDef): string => (settings[f.key] === 0 && f.zero ? f.zero : '');

function onFormInput(ev: Event): void {
  const el = ev.target as HTMLInputElement, key = el.dataset?.key;
  if (!key) return;
  const f = FIELD[key];
  if (!f) return;
  if (f.type === 'num') {
    // (a medio escribir: «», «2.» o «2,» todavía no son un número)
    if (el.type === 'number' && ev.type === 'input' && (el.value === '' || el.value.endsWith('.') || el.value.endsWith(','))) return;
    formSet(key, el.value);
    const other = $<HTMLInputElement>(el.type === 'range' ? `#f-${key}` : `#f-${key}-r`);
    if (other) other.value = String(settings[key]);
    if (ev.type === 'change' && el.type === 'number') el.value = String(settings[key]);
    const z = $(`#f-${key}-z`);
    if (z) z.textContent = zeroTxt(f);
  } else if (f.type === 'multi') {
    const on = $$<HTMLInputElement>(`input[name="f-${key}"]:checked`).map((x) => x.value);
    formSet(key, on.join(','));
    if (!on.length && !f.empty) syncForm(); // no se puede dejar vacío (salvo los que sí)
    if (f.relayout) syncForm();
  } else {
    formSet(key, f.type === 'toggle' ? +el.value : el.value);
    if (f.relayout) syncForm(); // cambia qué otros campos se ven
  }
  (formHooks.afterInput ?? formHooks.afterSync)?.();
}

// Cada ajuste, a como venía. RepArena los escribía de golpe y avisaba una vez («*»), sin que el rango pusiera sus valores
// ni la tabla del desarrollador apuntara nada: aquí van por setSetting, con el rango «aplicándose» para lo mismo
function resetFields(list: FieldDef[]): void {
  const was = RANK.applying;
  RANK.applying = true;
  FORM.self++;
  try {
    for (const f of list) setSetting(f.key, f.def);
  } finally {
    FORM.self--;
    RANK.applying = was;
  }
}

/** Restablecer un grupo de ajustes (una pestaña de las gafas o un grupo de la página). */
export function resetGroup(g: string): void {
  resetFields(SCHEMA.filter((f) => f.g === g));
  syncForm();
}

/** Pone la página al día con los ajustes: lo elegido, qué se ve y los valores. */
export function syncForm(): void {
  const m = $<HTMLInputElement>(`#mode-${settings.mode}`);
  if (m) m.checked = true;
  const e = $<HTMLInputElement>(`#ex-${settings.exercise}`);
  if (e) e.checked = true;
  const byBody = settings.exSort === 'body';
  sortExCards(byBody);
  for (const x of Object.keys(EX_NAMES)) {
    const el = $<HTMLInputElement>(`#ex-${x}`);
    if (!el) continue;
    const ok = exOk(settings.mode, x), card = el.closest<HTMLElement>('.card');
    el.disabled = !ok;
    if (card) card.hidden = !ok;
  }
  if (byBody) {
    // zonas sin ejercicios de este modo, fuera
    for (const h of $$('.cards .zone')) {
      let n = h.nextElementSibling as HTMLElement | null, any = false;
      while (n && !n.classList.contains('zone')) {
        if (!n.hidden) any = true;
        n = n.nextElementSibling as HTMLElement | null;
      }
      h.hidden = !any;
    }
  }
  // (el menú completo es solo del desarrollador; el jugador ve lo que este marcó con el ojo)
  const ln = $('#levelNote'), simple = !menuFull();
  if (ln) ln.innerHTML = !DEV.on ? '' : `${simple ? 'Lo que ve el jugador.' : 'Menú completo (desarrollador): todos los ajustes.'} <button type="button" class="btn small" data-level="${simple ? 'full' : 'simple'}">${simple ? 'Ver todos los ajustes' : 'Ver solo lo del jugador'}</button>`;
  const st = $('#specTitle');
  if (st) st.textContent = `4 · Opciones de ${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}`;
  const note = $('#exNote');
  if (note) {
    note.hidden = !['arcs', 'bars', 'touch'].includes(settings.mode);
    note.textContent = ({ arcs: 'El modo Arcos es solo para sentadillas.', bars: 'El modo Barras usa la barra de dominadas o las paralelas. Remo, dominadas y colgado solo se juegan en él.', touch: 'En Toques no disparas: tocas con la cabeza las amebas y con la mano que piden los diamantes que vienen hacia ti; entre un toque y otro, vuelve a la postura de partida.' } as Record<string, string>)[settings.mode] || '';
  }
  for (const f of SCHEMA) {
    const wrap = document.querySelector<HTMLElement>(`[data-field="${f.key}"]`);
    if (wrap) wrap.hidden = !fieldShown(f);
    if (f.type === 'num') {
      const a = $<HTMLInputElement>(`#f-${f.key}`), b = $<HTMLInputElement>(`#f-${f.key}-r`);
      if (a) a.value = String(settings[f.key]);
      if (b) b.value = String(settings[f.key]);
      const z = $(`#f-${f.key}-z`);
      if (z) z.textContent = zeroTxt(f);
    } else if (f.type === 'multi') {
      const on = String(settings[f.key]).split(',');
      $$<HTMLInputElement>(`input[name="f-${f.key}"]`).forEach((el) => (el.checked = on.includes(el.value)));
    } else {
      $$<HTMLInputElement>(`input[name="f-${f.key}"]`).forEach((el) => (el.checked = String(el.value) === String(settings[f.key])));
    }
  }
  for (const g of $$('.group')) g.hidden = !SCHEMA.some((f) => f.g === g.dataset.group && fieldShown(f));
  const an = $('#animNote');
  if (an && formHooks.animNote) an.textContent = formHooks.animNote();
  formHooks.afterSync?.();
}

// Las fichas de ejercicios en su orden de siempre o agrupadas por zona del cuerpo (con un encabezado por zona)
const EXCARDS: { order: Element[] | null } = { order: null };
function sortExCards(byBody: boolean): void {
  const host = $('#ex-squat')?.closest('.cards');
  if (!host) return;
  if (!EXCARDS.order) EXCARDS.order = [...host.children];
  host.querySelectorAll('.zone').forEach((z) => z.remove());
  if (!byBody) {
    EXCARDS.order.forEach((c) => host.appendChild(c));
    return;
  }
  const card = (x: string) => $(`#ex-${x}`)?.closest('.card'), used = new Set<Element>();
  for (const [name, list] of BODY_ZONES) {
    const h = document.createElement('h3');
    h.className = 'zone';
    h.textContent = name;
    host.appendChild(h);
    for (const x of list) {
      const c = card(x);
      if (c) {
        host.appendChild(c);
        used.add(c);
      }
    }
  }
  EXCARDS.order.forEach((c) => {
    if (!used.has(c)) host.appendChild(c);
  });
}
