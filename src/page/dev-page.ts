/**
 * La página: la tabla de dificultad del desarrollador (RepArena: src/67_dev.js, devPage y devInitPage) y las canciones de cada
 * ejercicio (exSongsPage). El modo desarrollador está escondido: cinco toques seguidos en el título de la página lo encienden o
 * apagan; solo entonces sale la tabla (por modo y ejercicio, con lo de cada rango, el ojo que decide lo que ve el jugador y la
 * tabla de cada enemigo). La lógica y los datos, en src/core/dev.ts.
 */
import { $, escHTML as esc } from './dom.js';
import { EX_NAMES, MODE_NAMES, RANKS } from '../core/catalog.js';
import { DEV, DEV_HOOKS, EXS, devCopy, devEyeToggle, devExport, devFactory, devFmt, devFoeRow, devFoeSet, devFoes, devImport, devRowClear, devSameEx, devSet, devTable, devTap, devToggle, exSongs, exSongsSet } from '../core/dev.js';
import { settings } from '../core/values.js';
import { SP_BPM_MIN, SP_BPM_TOP } from '../services/bpm.js';
import { bpm, spotify } from '../services/hub.js';
import { errText, type SpTrack } from '../services/spotify.js';
import { FIELD } from '../core/schema.js';
import { syncForm } from './form.js';

let exList = '', exErr = '';

function cellHTML(f: (typeof FIELD)[string], key: string, i: number, c: { v: unknown; own: boolean; now: boolean }): string {
  const cls = `dvc${c.own ? ' own' : ''}${c.now ? ' now' : ''}`, a = `data-k="${key}" data-i="${i}" aria-label="${esc(f.label)}, ${esc(RANKS[i][1])}"`;
  if (f.type === 'num') return `<td class="${cls}"><input type="number" ${a} min="${f.min}" max="${f.max}" step="${f.step}" value="${c.v}" inputmode="decimal"></td>`;
  const opts: [string | number, string][] = f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : (f.opts as [string | number, string][]);
  return `<td class="${cls}"><select ${a}>${opts.map((o) => `<option value="${o[0]}"${String(o[0]) === String(c.v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></td>`;
}

function tableHTML(): string {
  const rows = devTable(), same = devSameEx();
  let h = `<p class="note">Tabla de <b>${esc(MODE_NAMES[settings.mode as string])} · ${esc(EX_NAMES[settings.exercise as string])}</b> (cambia el modo y el ejercicio arriba). En dorado, lo que has puesto tú; el resto, lo de serie. La columna del rango de ahora va marcada. El <b>ojo</b> decide lo que ve el jugador en su menú.</p>`;
  h += `<div class="dvwrap"><table class="dvtab"><thead><tr><th>Ajuste</th>${RANKS.map((r) => `<th><span>${esc(r[1])}</span></th>`).join('')}<th>Jugador</th><th></th></tr></thead><tbody>`;
  for (const r of rows) {
    const f = FIELD[r.key];
    h += `<tr class="${r.ctl ? 'ctl' : ''}"><th scope="row" title="${esc(r.hint)}">${esc(r.label)}${r.unit ? ` <small>(${esc(r.unit)})</small>` : ''}</th>${r.cells.map((c, i) => cellHTML(f, r.key, i, c)).join('')}`
      + `<td><button type="button" class="dveye${r.eye ? ' on' : ''}" data-a="eye" data-k="${r.key}" aria-pressed="${r.eye}" aria-label="Lo ve el jugador: ${esc(r.label)}">${r.eye ? 'Sí' : '—'}</button></td>`
      + `<td>${r.clear ? `<button type="button" class="btn tiny" data-a="row0" data-k="${r.key}" title="Quitar lo tuyo de esta fila">×</button>` : ''}</td></tr>`;
  }
  h += '</tbody></table></div>';
  h += `<div class="dvbar"><label>Copiar a <select id="dvCopyTo">${same.map((x) => `<option value="${x}">${esc(EX_NAMES[x])}</option>`).join('')}</select></label><button type="button" class="btn small" data-a="copy"${same.length ? '' : ' disabled'}>Copiar</button>`
    + `<button type="button" class="btn small" data-a="factory">Valores de fábrica</button><button type="button" class="btn small" data-a="export">Exportar</button><button type="button" class="btn small" data-a="import">Importar</button><button type="button" class="btn small" data-a="off">Salir del modo desarrollador</button></div>`
    + `<textarea id="dvText" rows="3" placeholder="Aquí sale la tabla al exportar; pega aquí una para importarla" aria-label="Tabla exportada"></textarea><p class="status" id="dvStatus"></p>`;
  return h + foesHTML() + '<p class="hint">Las canciones de cada ejercicio se eligen en «Sonido y música»; al exportar, van con la tabla (de serie para todos).</p>';
}

function foesHTML(): string {
  const td = (key: string, f: string, v: number, mn: number, mx: number, own: unknown): string => `<td class="dvc${own !== undefined ? ' own' : ''}"><input type="number" data-fk="${key}" data-f="${f}" min="${mn}" max="${mx}" step="1" value="${v}" inputmode="numeric"></td>`;
  let h = '<h3>Enemigos: resistencia, fuerza y dureza</h3><p class="note">Para todos los modos y rangos. <b>Resistencia</b>: disparos que aguanta en la primera oleada (luego sube como siempre). <b>Fuerza</b>: vidas que quita cada golpe. <b>Dureza</b>: en qué tramo de la escalera entra (1, desde el principio; 4, al final). Los jefes, como siempre.</p>';
  h += '<div class="dvwrap"><table class="dvtab dvfoes"><thead><tr><th>Enemigo</th><th>Resistencia</th><th>Fuerza</th><th>Dureza</th></tr></thead><tbody>';
  for (const [key, name, base] of devFoes()) {
    const v = devFoeRow(key, base);
    h += `<tr><th scope="row">${esc(name)}</th>${td(key, 'hp', v.hp, 1, 12, v.own.hp)}${td(key, 'str', v.str, 1, 5, v.own.str)}${v.tier !== null ? td(key, 'tier', v.tier, 1, 4, v.own.tier) : '<td>—</td>'}</tr>`;
  }
  return h + '</tbody></table></div>';
}

/** Pinta o esconde la tabla (solo en modo desarrollador). */
export function devPage(): void {
  const sec = $('#devSection');
  if (!sec) return;
  sec.hidden = !DEV.on;
  const box = $('#devTable');
  if (box && DEV.on) box.innerHTML = tableHTML();
}

// ---------------------------------------------------------------- las canciones de cada ejercicio
const bpmShort = (uri: string): string => {
  const k = bpm().trackBpm(uri);
  return k.b ? `${k.src === 'own' ? '' : '≈'}${k.b} BPM` : 'sin BPM';
};
function exChip(t: SpTrack, k: number, n: number): string {
  const b = (act: string, lab: string, dis: boolean, aria: string): string => `<button type="button" class="btn tiny${dis ? ' off' : ''}" data-a="${act}" data-k="${k}"${dis ? ' disabled' : ''} aria-label="${esc(aria)}">${lab}</button>`;
  return `<span class="chip">${k + 1}. ${esc(t.name ?? '')}<small class="chbpm">${bpmShort(t.uri)}</small>${b('sup', '◀', k === 0, `Antes: ${t.name}`)}${b('sdn', '▶', k === n - 1, `Después: ${t.name}`)}${b('srm', '✕', false, `Quitar ${t.name}`)}</span>`;
}
function exSongsHTML(): string {
  const x = String(settings.exercise), sel = exSongs(x), on = new Set(sel.map((t) => t.uri)), mine = !!EXS.t[x], sp = spotify();
  let h = `<p class="note">Canciones de <b>${esc(EX_NAMES[x])}</b> (el ejercicio elegido arriba): suenan al azar al empezar una ronda de este ejercicio, en cualquier modo (las sesiones llevan las suyas). Sin ninguna, suena lo de siempre.${sel.length && !mine ? ' Ahora, las que vienen de serie.' : ''}</p>`;
  h += sel.length ? `<div class="chips">${sel.map((t, k) => exChip(t, k, sel.length)).join('')}<button class="btn small" data-a="sclear">Quitar todas</button></div>` : '';
  if (!sp.connected()) return h + '<p class="hint">Conecta Spotify (arriba) para elegirlas.</p>';
  if (!sp.mine) return h + `<div class="actions"><button type="button" class="btn small" data-a="sload">Elegir canciones</button></div><p class="status">${esc(exErr)}</p>`;
  const L = sp.pickable();
  if (!exList) return h + `<div class="lpick">${L.map((l) => `<button type="button" class="lp" data-a="slist" data-id="${l.id}">${esc(l.name)} ▸</button>`).join('')}</div>`;
  const l = L.find((z) => z.id === exList) ?? { name: '' }, T = (sp.trk as Record<string, SpTrack[]> | undefined)?.[exList];
  h += `<div class="spin"><button type="button" class="btn small" data-a="sback">← Tus listas</button><b>${esc(l.name)}</b></div>`;
  if (!T) return h + `<p class="status">${esc(exErr || 'Cargando sus canciones…')}</p>`;
  void bpm().prefetch(T);
  const cell = (t: SpTrack): string => {
    const own = bpm().songBpm(t.uri), a = bpm().autoBpm(t.uri);
    return `<span class="spbpmc"><input type="number" class="spbpm${!own && a.b ? ' auto' : ''}" data-bpm="${esc(t.uri)}" min="${SP_BPM_MIN}" max="${SP_BPM_TOP}" step="1" inputmode="numeric" placeholder="${a.b ? '≈' + a.b : 'BPM'}" value="${own || ''}" aria-label="Compás (BPM)"></span>`;
  };
  return h + `<div class="tracks">${T.map((t) => `<div class="sptrk"><label><input type="checkbox" data-s="trk" data-uri="${esc(t.uri)}"${on.has(t.uri) ? ' checked' : ''}><span>${esc(t.name ?? '')}<small> — ${esc(t.by ?? '')}</small></span></label>${cell(t)}</div>`).join('')}</div>`;
}
export function exSongsPage(): void {
  const box = $('#exSongs');
  if (box) box.innerHTML = exSongsHTML();
}

export function devInitPage(): void {
  $('#pageTitle')?.addEventListener('click', () => devTap());
  DEV_HOOKS.changed = () => {
    devPage();
    exSongsPage();
    syncForm();
  };
  DEV_HOOKS.say = (t) => {
    const s = $('#dvStatus');
    if (s) s.textContent = t;
  };
  const box = $('#devTable');
  box?.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement, d = el.dataset;
    if (d.k !== undefined && d.i !== undefined) {
      devSet(d.k as string, Number(d.i), el.value);
      devPage();
    } else if (d.fk) {
      devFoeSet(d.fk, d.f as 'hp' | 'str' | 'tier', el.value);
      devPage();
    }
  });
  box?.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button'), d = b?.dataset ?? {}, st = $('#dvStatus'), ta = $('#dvText') as HTMLTextAreaElement | null;
    if (d.a === 'eye') {
      devEyeToggle(d.k as string);
      devPage();
      syncForm();
    } else if (d.a === 'row0') {
      devRowClear(d.k as string);
      devPage();
    } else if (d.a === 'copy') {
      const to = $('#dvCopyTo') as HTMLSelectElement | null;
      if (to?.value) {
        devCopy(settings.mode + '|' + to.value);
        if (st) st.textContent = `Copiada a ${EX_NAMES[to.value]}`;
      }
    } else if (d.a === 'factory') {
      if (confirm('¿Quitar lo tuyo de esta tabla y volver a los valores de fábrica?')) {
        devFactory();
        devPage();
      }
    } else if (d.a === 'export') {
      if (ta) {
        ta.value = devExport();
        ta.select();
      }
      navigator.clipboard?.writeText(devExport()).then(() => st && (st.textContent = 'Copiada: pégamela en el chat y la dejo como valores de fábrica')).catch(() => st && (st.textContent = 'Copia el texto de abajo'));
    } else if (d.a === 'import') {
      const r = devImport(ta ? ta.value : '');
      devPage();
      exSongsPage();
      const s2 = $('#dvStatus');
      if (s2) s2.textContent = r;
    } else if (d.a === 'off') devToggle(false);
  });
  const ex = $('#exSongs'), sp = spotify();
  ex?.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement, d = el.dataset;
    if (d.bpm !== undefined) {
      bpm().songBpmSet(d.bpm, Number(el.value));
      return void exSongsPage();
    }
    if (d.s !== 'trk') return;
    const T = (sp.trk as Record<string, SpTrack[]> | undefined)?.[exList] ?? [], tr = T.find((z) => z.uri === d.uri);
    if (!tr) return;
    const sel = exSongs();
    exSongsSet(el.checked ? (sel.some((z) => z.uri === tr.uri) ? sel : sel.concat({ uri: tr.uri, name: tr.name ?? '', by: tr.by ?? '' })) : sel.filter((z) => z.uri !== tr.uri));
    exSongsPage();
  });
  ex?.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button'), d = b?.dataset ?? {};
    if (d.a === 'sload')
      sp.myLists().then((l) => { sp.mine = l; exErr = ''; exSongsPage(); }).catch((e) => { exErr = 'No se pudieron cargar tus listas: ' + errText(e); exSongsPage(); });
    else if (d.a === 'slist') {
      exList = d.id as string;
      exErr = '';
      exSongsPage();
      if (!(sp.trk as Record<string, unknown> | undefined)?.[exList]) sp.listTracks(exList).then(() => exSongsPage()).catch((e) => { exErr = errText(e); exSongsPage(); });
    } else if (d.a === 'sback') {
      exList = '';
      exSongsPage();
    } else if (d.a === 'srm' || d.a === 'sup' || d.a === 'sdn') {
      const l = exSongs(), k = Number(d.k);
      if (d.a === 'srm') l.splice(k, 1);
      else {
        const j = k + (d.a === 'sup' ? -1 : 1);
        if (j >= 0 && j < l.length) [l[k], l[j]] = [l[j], l[k]];
      }
      exSongsSet(l);
      exSongsPage();
    } else if (d.a === 'sclear') {
      exSongsSet([]);
      exSongsPage();
    }
  });
  devPage();
  exSongsPage();
}
void devFmt;
