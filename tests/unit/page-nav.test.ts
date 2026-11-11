// @vitest-environment happy-dom
// El índice de la página (src/page/nav.ts): los apartados que se ven, el de ahora marcado con sus subapartados, el paso al
// anterior y al siguiente, y que se acuerda del último visto (reparena3-ui, como RepArena).
import { beforeAll, describe, expect, it } from 'vitest';
import { UI_KEY } from '../../src/page/dom.js';
import { navGo, pageNav, tocRender } from '../../src/page/nav.js';

const ui = () => JSON.parse(localStorage.getItem(UI_KEY) as string);
const items = () => [...document.querySelectorAll('#toc .tocList > li')] as HTMLElement[];
const sec = (id: string) => document.getElementById(id) as HTMLElement;

beforeAll(() => {
  localStorage.clear();
  localStorage.setItem(UI_KEY, JSON.stringify({ pageSec: 'secCommon' }));
  document.body.innerHTML = `
    <nav id="toc"></nav>
    <div class="main">
      <section id="secMode" data-toc="Modo"><h2>Modo de juego</h2></section>
      <section id="secHidden" data-toc="Oculto" hidden><h2>No se ve</h2></section>
      <section id="secCommon"><h2>Opciones comunes <button class="qm">?</button></h2>
        <div class="group"><h3>Entorno <button>Restablecer</button></h3></div>
        <div class="group" hidden><h3>Escondido</h3></div>
        <h3 id="menuSub">Menú y avisos</h3>
      </section>
      <section id="secSpec" data-toc="Opciones del modo"><h3>Partida</h3></section>
      <div id="secPager"></div>
    </div>`;
  pageNav();
});

describe('el índice de la página', () => {
  it('lista los apartados que se ven y abre el último visto', () => {
    expect(items().map((li) => li.querySelector('.tocT')!.textContent)).toEqual(['Modo', 'Opciones comunes', 'Opciones del modo']);
    const on = items().find((li) => li.classList.contains('on'))!;
    expect(on.querySelector('a')!.dataset.nav).toBe('secCommon');
    expect(sec('secCommon').classList.contains('on')).toBe(true);
    expect(sec('secMode').classList.contains('on')).toBe(false);
    expect(document.body.dataset.sec).toBe('secCommon');
  });

  it('bajo el de ahora, sus subapartados a la vista', () => {
    const subs = [...document.querySelectorAll('#toc .tocList li.on ol a')] as HTMLElement[];
    expect(subs.map((a) => a.textContent)).toEqual(['Entorno', 'Menú y avisos']);
    expect(subs[1].dataset.sub).toBe('menuSub');
    expect(subs[0].dataset.sub).toBe('secCommon-0'); // (al que no tenía id, uno)
    expect(document.querySelectorAll('#toc .tocList > li ol').length).toBe(1);
  });

  it('el anterior y el siguiente, abajo', () => {
    const b = [...document.querySelectorAll('#secPager button')] as HTMLElement[];
    expect(b.map((x) => x.textContent)).toEqual(['◂ Modo', 'Opciones del modo ▸']);
  });

  it('al pulsar un apartado, se va a él y se acuerda', () => {
    (document.querySelector('#toc a[data-nav="secSpec"]') as HTMLElement).click();
    expect(ui().pageSec).toBe('secSpec');
    expect(sec('secSpec').classList.contains('on')).toBe(true);
    expect([...document.querySelectorAll('#secPager button')].map((x) => x.textContent)).toEqual(['◂ Opciones comunes']);
    (document.querySelector('#secPager button') as HTMLElement).click();
    expect(ui().pageSec).toBe('secCommon');
  });

  it('un subapartado abre su apartado y se marca', () => {
    navGo('secMode');
    (document.querySelector('#toc a[data-nav="secCommon"]') as HTMLElement).click();
    const a = document.querySelector('#toc a[data-sub="menuSub"]') as HTMLElement;
    a.click();
    expect((document.querySelector('#toc a[data-sub="menuSub"]') as HTMLElement).classList.contains('on')).toBe(true);
    expect(sec('menuSub').classList.contains('flash')).toBe(true);
  });

  it('en el móvil, la barra despliega y recoge la lista', () => {
    (document.querySelector('#toc .tocBar') as HTMLElement).click();
    expect(sec('toc').classList.contains('open')).toBe(true);
    expect(document.querySelector('#toc .tocHint')!.textContent).toBe('✕ Cerrar');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sec('toc').classList.contains('open')).toBe(false);
  });

  it('un apartado que se esconde sale del índice', () => {
    sec('secMode').hidden = true;
    tocRender();
    expect(items().map((li) => li.querySelector('a')!.dataset.nav)).toEqual(['secCommon', 'secSpec']);
  });
});
