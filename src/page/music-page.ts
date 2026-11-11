/**
 * La página: «Música con Spotify» (RepArena: src/65_music.js, spInitPage, spPage, spListsPage…). Conectar con tu cuenta (con tu
 * Client ID), probar, cargar tus listas, marcar las que suenan al entrenar, elegir canciones sueltas (con ◀ ▶ para ordenarlas),
 * escucharlas desde la página, marcar favoritas y ver o cambiar el compás de cada una. La lógica y los textos, en
 * src/services/spotify.ts y src/services/bpm.ts.
 */
import { $, escHTML as esc } from './dom.js';
import { bpm, spotify, SPOTIFY_UI } from '../services/hub.js';
import { BPM_NAME, SP_BPM_MIN, SP_BPM_TOP } from '../services/bpm.js';
import { errText, type SpList, type SpTrack } from '../services/spotify.js';

const FAV_MAX = 300;
let open: string | null = null, trkErr = '';

const favs = (): Set<string> => new Set((spotify().cfg.favs as string[] | undefined) ?? []);
function favToggle(uri: string): void {
  const sp = spotify(), cur = (sp.cfg.favs as string[] | undefined) ?? [], F = cur.filter((u) => u !== uri);
  if (F.length === cur.length) F.unshift(uri);
  sp.cfg.favs = F.slice(0, FAV_MAX);
  sp.save();
}
const favFirst = (T: SpTrack[]): SpTrack[] => {
  const F = favs();
  return F.size ? T.filter((t) => F.has(t.uri)).concat(T.filter((t) => !F.has(t.uri))) : T;
};

/** El compás de cada canción: el tuyo (escrito) o, en gris, el encontrado fuera («≈124»); ×2 y ÷2 lo corrigen. */
function bpmCell(t: SpTrack): string {
  const B = bpm(), own = B.songBpm(t.uri), a = B.autoBpm(t.uri), v = own || a.b, ph = a.b ? '≈' + a.b : a.tried ? '—' : B.q.seen.has(t.uri) ? '…' : 'BPM';
  const tip = own ? 'Tu compás: cuando suene, el juego irá a este ritmo' : a.b ? `Encontrado en ${BPM_NAME[a.src] || 'otro servicio'}: ${a.b} BPM. Escribe otro para cambiarlo` : a.tried ? 'No se encontró: escríbelo tú (o márcalo en el juego «Al compás»)' : 'Su compás (BPM): se busca solo';
  const x = (k: number, lab: string, title: string): string => `<button type="button" class="spx" data-a="bpmx" data-bpmx="${k}" data-u="${esc(t.uri)}" title="${title}">${lab}</button>`;
  return `<span class="spbpmc"><input type="number" class="spbpm${!own && a.b ? ' auto' : ''}" data-bpm="${esc(t.uri)}" min="${SP_BPM_MIN}" max="${SP_BPM_TOP}" step="1" inputmode="numeric" placeholder="${ph}" value="${own || ''}" aria-label="Compás de ${esc(t.name ?? '')} (BPM)" title="${esc(tip)}">${v ? x(2, '×2', `El doble (${Math.min(SP_BPM_TOP, v * 2)})`) + x(0.5, '÷2', `La mitad (${Math.max(SP_BPM_MIN, Math.round(v / 2))})`) : ''}</span>`;
}
const bpmShort = (uri: string): string => {
  const k = bpm().trackBpm(uri);
  return k.b ? `${k.src === 'own' ? '' : '≈'}${k.b} BPM` : 'sin BPM';
};
function chip(t: SpTrack, k: number, n: number): string {
  const b = (act: string, lab: string, dis: boolean, aria: string): string => `<button type="button" class="btn tiny${dis ? ' off' : ''}" data-sp="${act}" data-k="${k}"${dis ? ' disabled' : ''} aria-label="${esc(aria)}">${lab}</button>`;
  return `<span class="chip">${k + 1}. ${esc(t.name ?? '')}<small class="chbpm">${bpmShort(t.uri)}</small>${b('up', '◀', k === 0, `Antes: ${t.name}`)}${b('dn', '▶', k === n - 1, `Después: ${t.name}`)}${b('rm', '✕', false, `Quitar ${t.name}`)}</span>`;
}
const favBtn = (uri: string, F: Set<string>): string => `<button type="button" class="spfav${F.has(uri) ? ' on' : ''}" data-a="fav" data-fav="${esc(uri)}" aria-pressed="${F.has(uri)}" aria-label="Favorita" title="${F.has(uri) ? 'Quitar de favoritas' : 'Favorita: sale la primera al abrir la lista'}">★</button>`;
const playBtn = (t: SpTrack): string => {
  const on = spotify().prev === t.uri;
  return `<button type="button" class="spplay${on ? ' on' : ''}" data-play="${esc(t.uri)}" aria-pressed="${on}" aria-label="${on ? 'Parar' : 'Escuchar'} ${esc(t.name ?? '')}" title="${on ? 'Parar' : 'Escuchar aquí'}">${on ? '■' : '▶'}</button>`;
};

/** Pinta tus listas, las canciones elegidas y, dentro de una lista, sus canciones. */
export function spListsPage(): void {
  const host = $('#spLists');
  if (!host) return;
  const sp = spotify(), chosen = new Set(sp.lists().map((l) => l.id)), P = sp.picks(), on = new Set(P.map((t) => t.uri));
  let h = P.length ? `<div class="sppicks"><b>Canciones elegidas (${P.length})</b>: suenan ellas, en este orden y en bucle (con ◀ ▶ las cambias de sitio).<div class="chips">${P.map((t, k) => chip(t, k, P.length)).join('')}<button class="btn small" data-sp="clear">Quitar todas</button></div></div>` : '';
  if (open) {
    const l = sp.pickable().find((x) => x.id === open) ?? ({ name: '' } as SpList), T = (sp.trk as Record<string, SpTrack[]> | undefined)?.[open];
    h += `<div class="spin"><button class="btn small" data-sp="back">← Tus listas</button><b>${esc(l.name)}</b></div>`;
    if (T) void bpm().prefetch(T);
    const F = favs(), V = T ? favFirst(T) : null;
    h += T ? (T.length ? `<div class="sptracks">${V!.map((t) => `<div class="sptrk">${playBtn(t)}${favBtn(t.uri, F)}<label><input type="checkbox" data-trk="${esc(t.uri)}" ${on.has(t.uri) ? 'checked' : ''}><span>${esc(t.name ?? '')}<small> — ${esc(t.by ?? '')}</small></span></label>${bpmCell(t)}</div>`).join('')}</div>` : '<p class="note">Esta lista no tiene canciones.</p>') : trkErr ? `<p class="note">${esc(trkErr)}</p>` : '<p class="note">Cargando sus canciones…</p>';
  } else {
    const L = sp.mine ? sp.pickable() : sp.lists();
    h += L.map((l) => `<div class="sprow">${l.liked ? `<span class="lname">${esc(l.name)}</span>` : `<label><input type="checkbox" data-id="${l.id}" ${chosen.has(l.id) ? 'checked' : ''}><span>${esc(l.name)}</span></label>`}<button class="btn tiny" data-sp="open" data-id="${l.id}">Abrir ▸</button></div>`).join('');
  }
  const keep = host.querySelector('.sptracks') as HTMLElement | null, top = keep && host.dataset.keep === (open ?? '') ? keep.scrollTop : 0;
  host.innerHTML = h;
  host.dataset.keep = open ?? '';
  const k2 = host.querySelector('.sptracks') as HTMLElement | null;
  if (k2 && top) k2.scrollTop = top;
}

/** Escuchar una canción desde la página (▶ la pone, ■ la para): solo una a la vez. */
async function preview(uri: string): Promise<void> {
  const sp = spotify();
  if (!sp.connected()) return SPOTIFY_UI.status('Primero pulsa Conectar con Spotify.', true);
  try {
    await sp.preview(uri);
  } catch (e) {
    SPOTIFY_UI.status('No se pudo poner: ' + errText(e), true);
  }
  spListsPage();
}

function pageStatus(): void {
  const sp = spotify(), now = $('#spNow'), off = $('#btnSpOff') as HTMLButtonElement | null;
  if (now) now.textContent = sp.connected() ? sp.nowText() : 'Sin conectar';
  if (off) off.disabled = !sp.connected();
}

export function musicPage(): void {
  const sp = spotify(), inp = $('#spClient') as HTMLInputElement | null;
  if (!inp) return;
  const st = $('#spStatus');
  SPOTIFY_UI.status = (t, bad) => {
    if (st) {
      st.textContent = t;
      st.style.color = bad ? 'var(--red)' : '';
    }
  };
  SPOTIFY_UI.changed = () => {
    pageStatus();
    spListsPage();
  };
  inp.value = (sp.cfg.clientId as string) || '';
  inp.addEventListener('input', () => sp.setClientId(inp.value.trim()));
  const red = $('#spRedirect');
  if (red) red.textContent = sp.redirect();
  $('#btnSpConnect')?.addEventListener('click', () => {
    sp.connect().catch((e: Error) => SPOTIFY_UI.status('No se pudo abrir Spotify: ' + e.message, true));
  });
  $('#btnSpTest')?.addEventListener('click', async () => {
    if (!sp.connected()) return SPOTIFY_UI.status('Primero pulsa Conectar con Spotify.', true);
    SPOTIFY_UI.status('Comprobando…');
    await sp.refresh();
    SPOTIFY_UI.status(sp.err || sp.nowText(), !!sp.err);
  });
  $('#btnSpLists')?.addEventListener('click', async () => {
    if (!sp.connected()) return SPOTIFY_UI.status('Primero pulsa Conectar con Spotify.', true);
    SPOTIFY_UI.status('Cargando tus listas…');
    try {
      sp.mine = await sp.myLists();
      SPOTIFY_UI.status(sp.mine.length ? `${sp.mine.length} listas: marca las que quieras para entrenar.` : 'No tienes listas en Spotify.');
      spListsPage();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      SPOTIFY_UI.status(/insufficient|scope|403/i.test(m) ? 'Vuelve a pulsar Conectar con Spotify: hace falta el permiso para leer tus listas.' : errText(e), true);
    }
  });
  $('#btnSpOff')?.addEventListener('click', () => {
    sp.disconnect();
    SPOTIFY_UI.status('Desconectado.');
    pageStatus();
    spListsPage();
  });
  const host = $('#spLists');
  host?.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset.bpm !== undefined) {
      bpm().songBpmSet(el.dataset.bpm, Number(el.value));
      return void spListsPage();
    }
    if (el.dataset.id) {
      const sel = new Set([...host.querySelectorAll<HTMLInputElement>('input[data-id]:checked')].map((x) => x.dataset.id as string)), all = sp.mine ?? sp.lists();
      sp.cfg.lists = all.filter((l) => sel.has(l.id) || (!host.querySelector(`input[data-id="${l.id}"]`) && sp.lists().some((x) => x.id === l.id))).map((l) => ({ id: l.id, name: l.name, uri: l.uri }));
    } else if (el.dataset.trk) {
      const T = ((sp.trk as Record<string, SpTrack[]> | undefined)?.[open ?? ''] ?? []), t = T.find((x) => x.uri === el.dataset.trk);
      if (!t) return;
      const P = sp.picks();
      sp.cfg.picks = el.checked ? (P.some((x) => x.uri === t.uri) || P.length >= 100 ? P : P.concat({ uri: t.uri, name: t.name, by: t.by })) : P.filter((x) => x.uri !== t.uri);
      spListsPage();
    }
    sp.started = false;
    sp.save();
  });
  host?.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement, f = t.closest<HTMLElement>('button[data-fav]');
    if (f) {
      favToggle(f.dataset.fav as string);
      return void spListsPage();
    }
    const x = t.closest<HTMLElement>('button[data-bpmx]');
    if (x) {
      bpm().scale(x.dataset.u as string, Number(x.dataset.bpmx));
      return void spListsPage();
    }
    const p = t.closest<HTMLElement>('button[data-play]');
    if (p) return void preview(p.dataset.play as string);
    const b = t.closest<HTMLElement>('button[data-sp]');
    if (!b) return;
    if (b.dataset.sp === 'open') {
      const id = b.dataset.id as string;
      open = id;
      trkErr = '';
      spListsPage();
      if (!(sp.trk as Record<string, unknown> | undefined)?.[id])
        sp.listTracks(id).then(spListsPage).catch((e: Error) => {
          trkErr = /NOT_YOURS|LIBRARY/.test(e.message) ? errText(e) : 'No se pudieron cargar sus canciones: ' + errText(e);
          spListsPage();
        });
      return;
    }
    if (b.dataset.sp === 'back') {
      open = null;
      return void spListsPage();
    }
    const P = sp.picks(), k = Number(b.dataset.k);
    if (b.dataset.sp === 'rm') sp.cfg.picks = P.filter((_, i) => i !== k);
    else if (b.dataset.sp === 'clear') sp.cfg.picks = [];
    else if (b.dataset.sp === 'up' || b.dataset.sp === 'dn') {
      const j = k + (b.dataset.sp === 'up' ? -1 : 1);
      if (j >= 0 && j < P.length) {
        const L = P.slice();
        [L[k], L[j]] = [L[j], L[k]];
        sp.cfg.picks = L;
      }
    }
    sp.started = false;
    sp.save();
    spListsPage();
  });
  pageStatus();
  spListsPage();
  void sp.handleRedirect(); // (de vuelta de la página de permisos de Spotify)
  sp.playerInit();
}
