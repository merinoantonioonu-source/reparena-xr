// @vitest-environment happy-dom
// La página en el móvil (src/page/app.ts): el inicio con los apartados que hay, cada uno una pantalla con «‹ RepArena» (y
// el gesto de volver), los Sí/No con su interruptor, las pantallas de números con − y +, y los modos y ejercicios en filas.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// (la carrera arrastra módulos del juego: aquí basta con la racha)
vi.mock('../../src/combat/career-hub.js', () => ({
  progressNow: () => ({ streak: 3, best: 3, trainedToday: false, today: {}, week: {}, total: {} }),
  career: () => ({}),
}));

import { FIELD } from '../../src/core/schema.js';
import { STORE_KEY, initSettings, setSetting } from '../../src/core/settings.js';
import { settings } from '../../src/core/values.js';
import { buildForm, syncForm } from '../../src/page/form.js';
import { navHooks } from '../../src/page/nav.js';
import { appEnter, appMount, appOn } from '../../src/page/app.js';

const saved = () => JSON.parse(localStorage.getItem(STORE_KEY) as string);
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const isHome = () => document.documentElement.classList.contains('appHome');
const row = (id: string) => $(`#appHome [data-app="${id}"]`);

beforeAll(() => {
  localStorage.clear();
  initSettings();
  document.documentElement.classList.add('app');
  document.body.innerHTML = `
    <div class="main">
      <section id="todayBox" data-toc="Hoy"></section>
      <section id="secMode" data-toc="1 · Modo de juego"><h2>1 · Modo de juego</h2>
        <div class="cards modes">
          <label class="card"><input type="radio" name="mode" id="mode-combat" value="combat"><b>Combate</b></label>
          <label class="card"><input type="radio" name="mode" id="mode-arcs" value="arcs"><b>Arcos</b></label>
        </div></section>
      <section id="secEx" data-toc="2 · Ejercicio"><div id="exSortBox"></div>
        <div class="cards exs">
          <label class="card"><input type="radio" name="exercise" id="ex-squat" value="squat"><b>Sentadillas</b></label>
          <label class="card"><input type="radio" name="exercise" id="ex-lunge" value="lunge"><b>Zancadas</b></label>
        </div></section>
      <section id="secCommon" data-toc="3 · Opciones comunes"><h2>3 · Opciones comunes</h2><div id="commonGroups"></div></section>
      <section id="secMusic" data-toc="Sonido"><div id="soundGroups"></div></section>
      <section id="secSpec" data-toc="4 · Opciones"><h2 id="specTitle"></h2><p id="levelNote"></p><p id="exNote"></p><div id="settingsGroups"></div></section>
      <section id="secRaro" data-toc="Algo nuevo"></section>
    </div>`;
  buildForm();
  syncForm();
  navHooks.appEnter = appEnter; // (lo conecta la página)
  appMount();
});
beforeEach(async () => {
  setSetting('mode', 'combat');
  setSetting('exercise', 'squat');
  syncForm();
  // de vuelta al inicio
  if (!isHome()) {
    $('#appBar [data-app="back"]').click();
    await tick();
  }
});

describe('la app del móvil', () => {
  it('el inicio lista los apartados que hay, agrupados, con su valor', () => {
    expect(appOn()).toBe(true);
    expect(isHome()).toBe(true);
    const ids = [...document.querySelectorAll<HTMLElement>('#appHome .aRow')].map((b) => b.dataset.app);
    expect(ids).toEqual(['secMode', 'secEx', 'secSpec', 'secCommon', 'secMusic', 'todayBox', 'secRaro']);
    // (los que no están en la página, fuera; el que no conoce, en «Más»)
    expect(row('secSession')).toBeNull();
    const heads = [...document.querySelectorAll('#appHome .aH')].map((h) => h.textContent);
    expect(heads).toEqual(['Entrenar', 'Ajustes', 'Tú', 'Más']);
    expect(row('secMode').querySelector('.aV')!.textContent).toBe('Combate');
    expect(row('secRaro').querySelector('.aL')!.textContent).toBe('Algo nuevo');
    expect($('#appHome .aTt small').textContent).toContain('racha de 3 días');
    // los modos con su icono y los ejercicios con su buscador
    expect(document.querySelectorAll('.cards.modes .aIco').length).toBe(2);
    expect($('#secEx .aSearch')).toBeTruthy();
  });

  it('tocar una fila abre su pantalla; «‹ RepArena» y el gesto de volver, al inicio', async () => {
    row('secCommon').click();
    expect(isHome()).toBe(false);
    expect($('#appTitle h1').textContent).toBe('Opciones comunes');
    expect(location.hash).toBe('#secCommon');
    // el gesto de volver del teléfono
    history.back();
    await tick();
    expect(isHome()).toBe(true);
    // y el botón de la barra
    row('secSpec').click();
    expect($('#appTitle h1').textContent).toBe('Opciones de Combate');
    expect($('#appTitle p').textContent).toBe('Sentadillas');
    $('#appBar [data-app="back"]').click();
    await tick();
    expect(isHome()).toBe(true);
  });

  it('un Sí/No cambia con su interruptor (por setSetting, y se guarda)', async () => {
    const f = Object.values(FIELD).find((x) => x.type === 'toggle' && document.querySelector(`#commonGroups [data-field="${x.key}"]`))!;
    const r = $(`.aF[data-app-field="${f.key}"]`), sw = r.querySelector('.aSw') as HTMLElement, was = +settings[f.key];
    expect(sw.getAttribute('aria-checked')).toBe(String(!!was));
    row('secCommon').click();
    sw.click();
    expect(+settings[f.key]).toBe(was ? 0 : 1);
    expect(saved()[f.key]).toBe(was ? 0 : 1);
    expect(sw.getAttribute('aria-checked')).toBe(String(!was));
    sw.click();
    expect(+settings[f.key]).toBe(was);
  });

  it('un número: su pantalla con − y +, dentro de sus límites', async () => {
    const f = FIELD.goalMin;
    setSetting('goalMin', f.max as number);
    syncForm();
    await tick(); // (las filas se ponen al día un momento después del cambio)
    row('secCommon').click();
    const r = $(`.aF[data-app-field="goalMin"]`);
    expect(r.querySelector('.aV')!.textContent).toBe(`${f.max} min`);
    r.click();
    const p = $('#appPick');
    expect(p.hidden).toBe(false);
    expect(p.querySelector('h1')!.textContent).toBe(f.label);
    const plus = p.querySelector('[data-app-step="1"]') as HTMLElement, minus = p.querySelector('[data-app-step="-1"]') as HTMLElement;
    plus.click(); // (ya está arriba del todo)
    expect(settings.goalMin).toBe(f.max);
    minus.click();
    expect(settings.goalMin).toBe((f.max as number) - (f.step as number));
    expect(saved().goalMin).toBe(settings.goalMin);
    expect(p.querySelector('.aBig')!.textContent).toBe(`${settings.goalMin}min`);
    for (let i = 0; i < 40; i++) minus.click();
    expect(settings.goalMin).toBe(f.min);
    // volver cierra la pantalla del ajuste (sin dejar el apartado)
    history.back();
    await tick(300);
    expect(p.hidden).toBe(true);
    expect(isHome()).toBe(false);
  });

  it('una lista de opciones: elegida, se marca y vuelve', async () => {
    const f = Object.values(FIELD).find((x) => x.type === 'choice' && document.querySelector(`#commonGroups [data-field="${x.key}"]`))!;
    const other = f.opts!.find((o) => o[0] !== settings[f.key])!;
    row('secCommon').click();
    $(`.aF[data-app-field="${f.key}"]`).click();
    const b = $(`#appPick [data-app-opt="${other[0]}"]`);
    b.click();
    expect(settings[f.key]).toBe(other[0]);
    expect(b.classList.contains('on')).toBe(true);
    expect($(`.aF[data-app-field="${f.key}"] .aV`).textContent).toBe(other[1]);
    await tick(600);
    expect($('#appPick').hidden).toBe(true);
    setSetting(f.key, f.def);
  });

  it('elegir un modo o un ejercicio en su fila lo marca', () => {
    row('secMode').click();
    $('#mode-arcs').closest<HTMLElement>('.card')!.click();
    expect(($('#mode-arcs') as HTMLInputElement).checked).toBe(true);
    expect(settings.mode).toBe('arcs');
    setSetting('mode', 'combat');
    syncForm();
    $('#ex-lunge').closest<HTMLElement>('.card')!.click();
    expect(($('#ex-lunge') as HTMLInputElement).checked).toBe(true);
    expect(settings.exercise).toBe('lunge');
  });

  it('el buscador de ejercicios esconde los que no casan (sin tildes ni mayúsculas)', () => {
    const q = $<HTMLInputElement>('#secEx .aSearch input');
    q.value = 'ZANCADA';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ex-squat').closest('.card')!.classList.contains('aOff')).toBe(true);
    expect($('#ex-lunge').closest('.card')!.classList.contains('aOff')).toBe(false);
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('#ex-squat').closest('.card')!.classList.contains('aOff')).toBe(false);
  });
});
