/**
 * La página web de RepArena XR (RepArena: src/page.html, src/80_main.js): lo primero que se ve en el ordenador y en el
 * navegador de las gafas, antes de entrar: los botones de entrar (VR y «Probar en el ordenador»; la realidad mixta llega con
 * el PR 21), el índice, el modo y el ejercicio en fichas, lo de hoy, tu progreso y el formulario de ajustes (salen del mismo
 * esquema que los menús de VR). Entrar en VR o probar en el ordenador la esconde y deja ver la escena del juego (IWSDK);
 * al volver, la página se pone al día con lo que hayas hecho. En el móvil (sin gafas) será una app (PR 14b).
 */
import './page.css';
import { VisibilityState, type World } from '@iwsdk/core';
import { loadCanvasFonts } from '../ui/canvas-kit.js';
import { onSettingsChange } from '../core/settings.js';
import { HOOKS } from '../core/state.js';
import { $ } from './dom.js';
import { musicPage } from './music-page.js';
import { xferPage } from './xfer-page.js';
import { appEnter, appMount, appSoon } from './app.js';
import { buildForm, formHooks, syncForm } from './form.js';
import { navHooks, pageNav } from './nav.js';
import { demoPage, renderPick, updateSummary } from './pick.js';
import { refreshProgress, renderToday } from './today.js';

const root = document.documentElement;

/** Probar en el ordenador: la escena del juego en la ventana, con el ratón y el teclado (RepArena: el modo de prueba). */
function enterPreview(): void {
  root.classList.add('stage');
  scrollTo(0, 0);
  dispatchEvent(new Event('resize')); // (la escena estaba escondida: que se ajuste al tamaño de la ventana)
}
function exitPreview(): void {
  if (!root.classList.contains('stage')) return;
  HOOKS.toLobby(); // (si había una ronda, se guarda y vuelve el menú)
  root.classList.remove('stage');
  refreshProgress();
  syncForm();
}

/** Arranca la página (no necesita la escena: se ve en cuanto carga). */
export function startPage(): void {
  void loadCanvasFonts();
  formHooks.afterSync = () => {
    renderPick();
    updateSummary();
  };
  buildForm();
  syncForm();
  pageNav();
  navHooks.appEnter = appEnter;
  refreshProgress();
  appSoon(); // (y lo de hoy en el inicio de la app del móvil)
  appMount(); // (en el móvil, la página es una app: PR 14b)
  demoPage();
  xferPage(); // (pasar datos por código y la sincronización)
  musicPage(); // (Spotify)
  $('#btnPreview')?.addEventListener('click', enterPreview);
  $('#btnExitPreview')?.addEventListener('click', exitPreview);
  addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && root.classList.contains('stage')) exitPreview();
  });
  // al volver a la página (de otra pestaña o de las gafas), lo de hoy al día
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshProgress();
      appSoon();
    }
  });
  onSettingsChange((k) => {
    updateSummary();
    if (k === 'goalMin') renderToday(); // (tu meta cambia lo de hoy)
  });
}

/** Con el mundo ya creado: el botón de entrar en VR. */
export function pageWorld(world: World): void {
  const vr = $<HTMLButtonElement>('#btnVR'), st = $('#xrStatus');
  if (!vr) return;
  vr.disabled = true;
  void navigator.xr
    ?.isSessionSupported('immersive-vr')
    .then((ok) => {
      vr.disabled = !(ok && world.xrEnabled);
      if (st && vr.disabled) st.textContent = 'Este navegador no ofrece realidad virtual: puedes probar el juego en el ordenador. En las Quest 3, abre esta página en su navegador.';
    })
    .catch(() => {
      if (st) st.textContent = 'No se ha podido comprobar si hay gafas.';
    });
  if (!navigator.xr && st) st.textContent = 'Este navegador no ofrece realidad virtual: puedes probar el juego en el ordenador. En las Quest 3, abre esta página en su navegador.';
  vr.addEventListener('click', () => {
    if (st) st.textContent = '';
    try {
      void world.launchXR();
    } catch (e) {
      if (st) st.textContent = 'No se ha podido entrar en VR: ' + (e instanceof Error ? e.message : String(e));
    }
  });
  // al salir de las gafas, la página con lo que hayas hecho
  world.visibilityState.subscribe((v) => {
    if (v === VisibilityState.NonImmersive) {
      refreshProgress();
      syncForm();
    }
  });
}
