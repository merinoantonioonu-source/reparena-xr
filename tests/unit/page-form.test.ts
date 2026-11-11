// @vitest-environment happy-dom
// El formulario de ajustes de la página (src/page/form.ts): sale del esquema, cada cambio va por setSetting (y se guarda
// en reparena3-settings), lo que no vale para lo elegido se esconde y lo que se cambia en las gafas vuelve a la página.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GROUP_NAMES } from '../../src/core/catalog.js';
import { DEV } from '../../src/core/dev-state.js';
import { FIELD, SCHEMA } from '../../src/core/schema.js';
import { STORE_KEY, fieldShown, initSettings, setSetting } from '../../src/core/settings.js';
import { settings } from '../../src/core/values.js';
import { buildForm, formHooks, resetGroup, syncForm } from '../../src/page/form.js';

const saved = () => JSON.parse(localStorage.getItem(STORE_KEY) as string);
const inp = (sel: string) => document.querySelector(sel) as HTMLInputElement;
const fire = (el: HTMLElement, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeAll(() => {
  localStorage.clear();
  initSettings();
  document.body.innerHTML = `
    <div class="cards modes">
      <label class="card"><input type="radio" name="mode" id="mode-combat" value="combat"><b>Combate</b></label>
      <label class="card"><input type="radio" name="mode" id="mode-arcs" value="arcs"><b>Arcos</b></label>
    </div>
    <div class="cards exs">
      <label class="card"><input type="radio" name="exercise" id="ex-squat" value="squat"><b>Sentadillas</b></label>
      <label class="card"><input type="radio" name="exercise" id="ex-curl" value="curl"><b>Curl</b></label>
    </div>
    <div id="exSortBox"></div><p id="levelNote"></p><h2 id="specTitle"></h2><p id="exNote"></p>
    <div id="commonGroups"></div><div id="soundGroups"></div><div id="settingsGroups"></div>
    <button id="btnReset">Todo</button>`;
  buildForm();
  syncForm();
});
beforeEach(() => {
  vi.restoreAllMocks();
  resetGroup('partida');
  setSetting('mode', 'combat');
  setSetting('exercise', 'squat');
  syncForm();
});

describe('el formulario de la página', () => {
  it('cada ajuste tiene su campo, y se ve si vale para lo elegido', () => {
    for (const f of SCHEMA) {
      const wrap = document.querySelector(`[data-field="${f.key}"]`) as HTMLElement;
      expect(wrap, f.key).toBeTruthy();
      expect(wrap.hidden, f.key).toBe(!fieldShown(f));
      if (f.type === 'num') expect(inp(`#f-${f.key}`).value).toBe(String(settings[f.key]));
    }
    // el orden de los ejercicios, junto a los ejercicios; el título del apartado, con lo elegido
    expect(document.querySelector('#exSortBox [data-field="exSort"]')).toBeTruthy();
    expect(document.querySelector('#specTitle')!.textContent).toBe('4 · Opciones de Combate · Sentadillas');
    // (los del desarrollador, escondidos)
    expect((document.querySelector('[data-field="menuLevel"]') as HTMLElement).hidden).toBe(true);
  });

  it('los grupos sin nada que enseñar se esconden', () => {
    const arcs = document.querySelector('.group[data-group="arcos"]') as HTMLElement;
    expect(arcs.hidden).toBe(true);
    expect((document.querySelector('.group[data-group="partida"]') as HTMLElement).hidden).toBe(false);
    setSetting('mode', 'arcs');
    syncForm();
    expect(arcs.hidden).toBe(false);
    expect(inp('#mode-arcs').checked).toBe(true);
    // (y los ejercicios que no valen para el modo, fuera)
    expect((inp('#ex-curl').closest('.card') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('#exNote')!.textContent).toContain('Arcos');
  });

  it('un número cambia el ajuste y se guarda (sin tocar lo que se está escribiendo)', () => {
    const a = inp('#f-lives');
    a.value = '7';
    fire(a, 'input');
    expect(settings.lives).toBe(7);
    expect(saved().lives).toBe(7);
    expect(inp('#f-lives-r').value).toBe('7');
    // a medias: no cuenta todavía
    a.value = '2.';
    fire(a, 'input');
    expect(settings.lives).toBe(7);
    // fuera de sus límites: al acabar, el ajustado
    a.value = '99';
    fire(a, 'change');
    expect(settings.lives).toBe(20);
    expect(a.value).toBe('20');
    // con 0, su nombre
    a.value = '0';
    fire(a, 'change');
    expect(document.querySelector('#f-lives-z')!.textContent).toBe('Infinitas');
  });

  it('Sí/No y las opciones cambian el ajuste, y lo que cambia qué se ve rehace el formulario', () => {
    const waves = document.querySelector('[data-field="waves"]') as HTMLElement;
    setSetting('menuLevel', 'full');
    DEV.on = true; // (con el menú completo se ve «Oleadas»)
    syncForm();
    expect(waves.hidden).toBe(false);
    const yes = document.querySelector('input[name="f-toFail"][value="1"]') as HTMLInputElement;
    yes.checked = true;
    fire(yes, 'change');
    expect(settings.toFail).toBe(1);
    expect(saved().toFail).toBe(1);
    expect(waves.hidden).toBe(true);
    DEV.on = false;
    setSetting('menuLevel', 'simple');
    const sarg = document.querySelector('input[name="f-rank"][value="sargento"]') as HTMLInputElement;
    sarg.checked = true;
    fire(sarg, 'change');
    expect(settings.rank).toBe('sargento');
  });

  it('las fichas de modo y ejercicio cambian lo elegido', () => {
    const curl = inp('#ex-curl');
    curl.checked = true;
    fire(curl, 'change');
    expect(settings.exercise).toBe('curl');
    expect(saved().exercise).toBe('curl');
  });

  it('una lista no se queda vacía, salvo las que pueden', () => {
    const key = 'move_robot', f = FIELD[key];
    expect(f.empty).toBeFalsy();
    document.querySelectorAll<HTMLInputElement>(`input[name="f-${key}"]`).forEach((el) => (el.checked = false));
    fire(inp(`#f-${key}-0`), 'change');
    expect(settings[key]).toBe(f.def);
    const on = [...document.querySelectorAll<HTMLInputElement>(`input[name="f-${key}"]:checked`)].map((x) => x.value);
    expect(on.join(',')).toBe(f.def);
    // los enemigos de las compuertas sí pueden quedarse sin ninguno
    document.querySelectorAll<HTMLInputElement>('input[name="f-foesGate"]').forEach((el) => (el.checked = false));
    fire(inp('#f-foesGate-0'), 'change');
    expect(settings.foesGate).toBe('');
  });

  it('Restablecer devuelve el grupo a como venía (si se confirma)', () => {
    setSetting('lives', 9);
    setSetting('volume', 10);
    vi.stubGlobal('confirm', () => false);
    (document.querySelector('[data-reset="partida"]') as HTMLElement).click();
    expect(settings.lives).toBe(9);
    vi.stubGlobal('confirm', () => true);
    (document.querySelector('[data-reset="partida"]') as HTMLElement).click();
    expect(settings.lives).toBe(FIELD.lives.def);
    expect(saved().lives).toBe(FIELD.lives.def);
    expect(inp('#f-lives').value).toBe(String(FIELD.lives.def));
    expect(settings.volume).toBe(10); // (los de otro grupo, como estaban)
    vi.unstubAllGlobals();
  });

  it('el «?» enseña y esconde la explicación', () => {
    const b = document.querySelector('[data-qm="f-lives-h"]') as HTMLElement, p = document.querySelector('#f-lives-h') as HTMLElement;
    expect(p.hidden).toBe(true);
    b.click();
    expect(p.hidden).toBe(false);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    b.click();
    expect(p.hidden).toBe(true);
  });

  it('lo que se cambia fuera (las gafas) vuelve a la página', async () => {
    const after = vi.fn();
    formHooks.afterSync = after;
    setSetting('lives', 11);
    expect(inp('#f-lives').value).not.toBe('11'); // (al momento siguiente, una sola vez)
    await tick();
    expect(inp('#f-lives').value).toBe('11');
    expect(after).toHaveBeenCalledTimes(1);
    formHooks.afterSync = null;
  });

  it('cada grupo, con su nombre y su botón', () => {
    for (const g of Object.keys(GROUP_NAMES)) expect(document.querySelector(`.group[data-group="${g}"]`), g).toBeTruthy();
    expect(document.querySelector('#soundGroups h3')).toBeNull(); // (el sonido ya tiene su título en la página)
  });
});
