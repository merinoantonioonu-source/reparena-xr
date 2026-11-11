// @vitest-environment happy-dom
import { it } from 'vitest';
import { initSettings, setSetting } from '../../src/core/settings.js';
import { buildForm, syncForm, resetGroup } from '../../src/page/form.js';
it('p', () => {
  initSettings();
  document.body.innerHTML = '<div id="commonGroups"></div><div id="soundGroups"></div><div id="settingsGroups"></div><div id="exSortBox"></div>';
  const out: number[] = [];
  let t = performance.now(); buildForm(); out.push(performance.now() - t);
  t = performance.now(); syncForm(); out.push(performance.now() - t);
  t = performance.now(); resetGroup('partida'); out.push(performance.now() - t);
  t = performance.now(); for (let i = 0; i < 10; i++) setSetting('lives', i); out.push(performance.now() - t);
  throw new Error(out.map((x) => x.toFixed(0)).join(' '));
});
