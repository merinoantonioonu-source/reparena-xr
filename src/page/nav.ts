/**
 * El índice de la página (RepArena: src/68_prefs.js `NAV`, `tocRender`, `navGo`, `navToHash`, `pageNav`): a la izquierda,
 * los apartados de la página y, debajo del que se ve, sus subapartados (los títulos h3 a la vista, como los grupos de
 * ajustes que valen para lo elegido); a la derecha, solo ese apartado. En el móvil, una barra fija arriba que se
 * despliega. Se acuerda del último apartado visto (`pageSec`, en `reparena3-ui`).
 */
import { onSettingsChange } from '../core/settings.js';
import { $, $$, escHTML, uiPrefs, uiSave } from './dom.js';

/** En el móvil, cada apartado es una pantalla de la app (otro PR): la página la abre con appEnter. */
export const navHooks = { appEnter: null as null | ((id: string, sub: string | null) => void) };

const NAV = { cur: '', open: false, sig: '', t: 0 as ReturnType<typeof setTimeout> | 0 };

/** Los apartados que se ven (las secciones de .main con id). */
const navSecs = (): HTMLElement[] => {
  const m = $('.main');
  return m ? ([...m.children] as HTMLElement[]).filter((s) => s.tagName === 'SECTION' && s.id && !s.hidden) : [];
};
// el texto de un título sin sus botones («?», Restablecer) ni su contador
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
// En el móvil, cada apartado es una ficha con su icono y su color (en el ordenador no se ven)
const NAV_ICO: Record<string, [string, string]> = { todayBox: ['☀️', '#ffd166'], secHist: ['📈', '#3cf0c6'], secMode: ['🎮', '#ff4fa3'], secEx: ['🏋️', '#7ee2ff'], secCommon: ['⚙️', '#b8a7ff'], secMusic: ['🎵', '#8fdc5a'],
  secSpec: ['🎛️', '#ff8a3d'], devSection: ['🛠️', '#a49fc8'], secSession: ['📋', '#ffd166'], secHow: ['🥽', '#7ee2ff'] };
const navIco = (s: HTMLElement): [string, string] => NAV_ICO[s.id] || ['🔊', '#a49fc8'];

/** Los subapartados a la vista de un apartado (sus h3; a los que no tienen id se les pone uno). */
function navSubs(sec: HTMLElement): { id: string; t: string }[] {
  const out: { id: string; t: string }[] = [];
  sec.querySelectorAll<HTMLElement>('h3').forEach((h, i) => {
    for (let e: HTMLElement | null = h; e && e !== sec; e = e.parentElement) if (e.hidden) return;
    const t = navText(h);
    if (!t) return;
    if (!h.id) h.id = sec.id + '-' + i;
    out.push({ id: h.id, t });
  });
  return out;
}

/** Pinta el índice y el paso de apartado (solo si algo cambió, salvo con force). */
export function tocRender(force?: boolean): void {
  const nav = $('#toc'), secs = navSecs();
  if (!nav || !secs.length) return;
  if (!secs.some((s) => s.id === NAV.cur)) {
    const last = uiPrefs().pageSec;
    NAV.cur = secs.some((s) => s.id === last) ? (last as string) : secs[0].id;
  }
  const cur = secs.find((s) => s.id === NAV.cur) as HTMLElement, subs = navSubs(cur), i = secs.indexOf(cur);
  const sig = secs.map(navName).join('|') + '#' + cur.id + '#' + subs.map((x) => x.id + x.t).join('|') + NAV.open;
  secs.forEach((s) => s.classList.toggle('on', s === cur));
  document.body.dataset.sec = cur.id;
  if (sig === NAV.sig && !force) return;
  NAV.sig = sig;
  nav.innerHTML = `<button type="button" class="tocBar" data-nav="toggle" aria-expanded="${NAV.open}" aria-controls="tocList"><span class="tocIco" aria-hidden="true">${navIco(cur)[0]}</span><span class="tocNow">${escHTML(navName(cur))}</span><span class="tocHint">${NAV.open ? '✕ Cerrar' : '☰ Apartados'}</span></button>
    <ol class="tocList" id="tocList">${secs.map((s) => `<li class="${s === cur ? 'on' : ''}" style="--ac:${navIco(s)[1]}"><a href="#${s.id}" data-nav="${s.id}"${s === cur ? ' aria-current="true"' : ''}><span class="tocI" aria-hidden="true">${navIco(s)[0]}</span><span class="tocT">${escHTML(navName(s))}</span></a>${s === cur && subs.length ? `<ol>${subs.map((x) => `<li><a href="#${x.id}" data-nav="${s.id}" data-sub="${x.id}">${escHTML(x.t)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>`;
  nav.classList.toggle('open', NAV.open);
  // (abajo, el anterior y el siguiente: para seguir sin volver al índice)
  const pg = $('#secPager'), prev = secs[i - 1], next = secs[i + 1];
  if (pg) pg.innerHTML = `${prev ? `<button type="button" class="btn small" data-nav="${prev.id}">◂ ${escHTML(navName(prev))}</button>` : ''}${next ? `<button type="button" class="btn small alt next" data-nav="${next.id}">${escHTML(navName(next))} ▸</button>` : ''}`;
}

/** Abre un apartado (y va a su subapartado, si se dice) y se acuerda de él. */
export function navGo(id: string, sub: string | null = null): void {
  NAV.cur = id;
  NAV.open = false;
  uiSave('pageSec', id);
  tocRender(true);
  const el = sub ? document.getElementById(sub) : null, go = el || document.getElementById(id);
  go?.scrollIntoView?.({ block: 'start' });
  if (el) {
    // (el destello, otra vez desde el principio)
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
  if (sub) $$('.tocList ol a').forEach((a) => a.classList.toggle('on', a.dataset.sub === sub));
  navHooks.appEnter?.(id, sub);
}

/** Un enlace a algo de la página (#…): abre su apartado y va allí. */
export function navToHash(hash: string): boolean {
  let el: HTMLElement | null = null;
  try {
    el = hash && hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  } catch {
    return false; // (un # mal escrito)
  }
  if (!el) return false;
  let sec: HTMLElement | null = el;
  while (sec && !(sec.tagName === 'SECTION' && sec.parentElement?.classList.contains('main'))) sec = sec.parentElement;
  if (!sec || !sec.id) return false;
  navGo(sec.id, el !== sec ? el.id : null);
  return true;
}

/** Pone el índice en marcha (una vez, al cargar la página). */
export function pageNav(): void {
  const nav = $('#toc');
  if (!nav) return;
  const onNav = (ev: Event): void => {
    const a = (ev.target as Element | null)?.closest?.<HTMLElement>('[data-nav]');
    if (!a) {
      // (en el móvil, tocar fuera del panel, en lo oscurecido, lo cierra)
      if (NAV.open && ev.target === nav) {
        NAV.open = false;
        tocRender(true);
      }
      return;
    }
    ev.preventDefault();
    if (a.dataset.nav === 'toggle') {
      NAV.open = !NAV.open;
      tocRender(true);
      return;
    }
    navGo(a.dataset.nav as string, a.dataset.sub || null);
  };
  nav.addEventListener('click', onNav);
  $('#secPager')?.addEventListener('click', onNav);
  // los demás enlaces #… de la página (p. ej. el resumen de hoy)
  document.addEventListener('click', (ev) => {
    const a = (ev.target as Element | null)?.closest?.('a[href^="#"]');
    if (!a || nav.contains(a)) return;
    if (navToHash(a.getAttribute('href') || '')) ev.preventDefault();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && NAV.open) {
      NAV.open = false;
      tocRender(true);
    }
  });
  addEventListener('hashchange', () => navToHash(location.hash));
  // lo que cambia (los grupos de ajustes que valen, la tabla del desarrollador…): el índice, al día
  const later = (): void => {
    if (NAV.t) clearTimeout(NAV.t);
    NAV.t = setTimeout(() => {
      NAV.t = 0;
      tocRender();
    }, 120);
  };
  const main = $('.main');
  if (main && typeof MutationObserver === 'function') new MutationObserver(later).observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  onSettingsChange(later);
  tocRender(true);
  if (location.hash) navToHash(location.hash);
}
